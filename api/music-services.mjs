import { createHash, randomUUID } from "node:crypto";

const SOUNDCLOUD_API = "https://api.soundcloud.com";
const SOUNDCLOUD_AUTH = "https://secure.soundcloud.com/oauth/token";
const SOUNDCLOUD_OEMBED = "https://soundcloud.com/oembed";
const SHAZAM_URL = "https://amp.shazam.com/discovery/v5/en/US/android/-/tag";
const CACHE_LIMIT = 160;
const SOUNDCLOUD_SEARCH_TTL_MS = 2 * 60_000;

export class MusicServiceError extends Error {
  constructor(message, statusCode = 502, kind = "music_service") {
    super(message);
    this.name = "MusicServiceError";
    this.statusCode = statusCode;
    this.kind = kind;
  }
}

const cache = new Map();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const compact = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const hash = (value) => createHash("sha256").update(String(value)).digest("hex");

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, entry);
  return structuredClone(entry.value);
}

function cacheSet(key, value, ttlMs) {
  cache.set(key, { value: structuredClone(value), expiresAt: Date.now() + ttlMs });
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return value;
}

async function responseText(response, maxBytes = 4_000_000) {
  const text = await response.text();
  if (Buffer.byteLength(text) > maxBytes)
    throw new MusicServiceError("La respuesta externa es demasiado grande", 502);
  return text;
}

async function requestJson(
  url,
  {
    fetchImpl = fetch,
    method = "GET",
    headers = {},
    json,
    body,
    timeout = 8_000,
    maxBytes = 4_000_000,
    allowStatuses = [],
    redirect = "follow",
  } = {},
) {
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers,
      body: body === undefined ? (json === undefined ? undefined : JSON.stringify(json)) : body,
      signal: AbortSignal.timeout(timeout),
      redirect,
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError")
      throw new MusicServiceError("El servicio externo agotó el tiempo de espera", 504);
    throw new MusicServiceError("No se pudo conectar con el servicio externo", 502);
  }
  const text = await responseText(response, maxBytes);
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (response.ok)
        throw new MusicServiceError("El servicio externo devolvió datos inválidos", 502);
    }
  }
  if (!response.ok && !allowStatuses.includes(response.status)) {
    const error = new MusicServiceError(
      `El servicio externo respondió HTTP ${response.status}`,
      response.status === 429 ? 429 : response.status >= 500 ? 503 : 502,
      response.status === 429 ? "rate_limited" : "music_service",
    );
    error.remoteStatus = response.status;
    error.remoteData = data;
    throw error;
  }
  return { response, data };
}

function soundCloudCredentials() {
  const clientId = compact(process.env.HANAMI_SOUNDCLOUD_CLIENT_ID);
  const clientSecret = compact(process.env.HANAMI_SOUNDCLOUD_CLIENT_SECRET);
  return {
    clientId,
    clientSecret,
    configured: !!(clientId && clientSecret),
  };
}

let soundCloudAuth = {
  accessToken: "",
  refreshToken: "",
  expiresAt: 0,
};

export function resetSoundCloudAuthForTests() {
  soundCloudAuth = { accessToken: "", refreshToken: "", expiresAt: 0 };
}

async function exchangeSoundCloudToken(
  credentials,
  { fetchImpl = fetch, refresh = false } = {},
) {
  const params = new URLSearchParams({
    grant_type: refresh ? "refresh_token" : "client_credentials",
  });
  if (refresh) {
    params.set("refresh_token", soundCloudAuth.refreshToken);
    params.set("client_id", credentials.clientId);
    params.set("client_secret", credentials.clientSecret);
  }
  const authorization = Buffer.from(
    `${credentials.clientId}:${credentials.clientSecret}`,
  ).toString("base64");
  let response;
  let data;
  try {
    ({ response, data } = await requestJson(SOUNDCLOUD_AUTH, {
      fetchImpl,
      method: "POST",
      headers: {
        accept: "application/json; charset=utf-8",
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${authorization}`,
        "user-agent": "Hanami/5.9.5",
      },
      body: params.toString(),
      timeout: 10_000,
      maxBytes: 500_000,
    }));
  } catch (error) {
    if (refresh) {
      soundCloudAuth = { accessToken: "", refreshToken: "", expiresAt: 0 };
      return exchangeSoundCloudToken(credentials, { fetchImpl, refresh: false });
    }
    if ([401, 403].includes(error?.remoteStatus))
      throw new MusicServiceError(
        "SoundCloud rechazó las credenciales configuradas",
        503,
        "soundcloud_auth",
      );
    throw error;
  }
  const accessToken = compact(data?.access_token);
  if (!response.ok || !accessToken)
    throw new MusicServiceError(
      "SoundCloud no devolvió un token de acceso válido",
      503,
      "soundcloud_auth",
    );
  const expiresIn = Math.max(300, Number(data?.expires_in) || 3_600);
  soundCloudAuth = {
    accessToken,
    refreshToken: compact(data?.refresh_token),
    expiresAt: Date.now() + expiresIn * 1_000,
  };
  return accessToken;
}

async function soundCloudAccessToken({ fetchImpl = fetch, force = false } = {}) {
  const credentials = soundCloudCredentials();
  if (!credentials.configured)
    throw new MusicServiceError(
      "Configura HANAMI_SOUNDCLOUD_CLIENT_ID y HANAMI_SOUNDCLOUD_CLIENT_SECRET para buscar por texto. También puedes pegar un enlace de SoundCloud.",
      503,
      "soundcloud_not_configured",
    );
  if (!force && soundCloudAuth.accessToken && soundCloudAuth.expiresAt > Date.now() + 60_000)
    return soundCloudAuth.accessToken;
  if (!force && soundCloudAuth.refreshToken)
    return exchangeSoundCloudToken(credentials, { fetchImpl, refresh: true });
  return exchangeSoundCloudToken(credentials, { fetchImpl, refresh: false });
}

async function soundCloudApiJson(url, { fetchImpl = fetch } = {}) {
  let token = await soundCloudAccessToken({ fetchImpl });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await requestJson(url, {
        fetchImpl,
        headers: {
          accept: "application/json; charset=utf-8",
          authorization: `OAuth ${token}`,
          "user-agent": "Hanami/5.9.5",
        },
        timeout: 10_000,
        maxBytes: 4_000_000,
      });
    } catch (error) {
      if (error?.remoteStatus === 401 && attempt === 0) {
        soundCloudAuth = { accessToken: "", refreshToken: "", expiresAt: 0 };
        token = await soundCloudAccessToken({ fetchImpl, force: true });
        continue;
      }
      if (error?.remoteStatus === 429)
        throw new MusicServiceError(
          "SoundCloud alcanzó temporalmente su límite de solicitudes",
          429,
          "rate_limited",
        );
      throw error;
    }
  }
  throw new MusicServiceError("No se pudo autenticar con SoundCloud", 503, "soundcloud_auth");
}

export function normalizeSoundCloudUrl(value) {
  const raw = compact(value);
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new MusicServiceError(
      "Pega un enlace completo de una canción de SoundCloud",
      400,
      "validation",
    );
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !["soundcloud.com", "www.soundcloud.com", "m.soundcloud.com", "on.soundcloud.com"].includes(
      hostname,
    )
  )
    throw new MusicServiceError(
      "Pega un enlace HTTPS público de soundcloud.com",
      400,
      "validation",
    );
  url.hash = "";
  for (const parameter of [...url.searchParams.keys()]) {
    if (
      parameter === "si" ||
      parameter === "ref" ||
      parameter.startsWith("utm_")
    )
      url.searchParams.delete(parameter);
  }
  return url.href;
}

function durationText(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const rest = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`;
}

function soundCloudArtwork(value) {
  const url = compact(value);
  if (!/^https:\/\//i.test(url)) return "";
  return url.replace(/-large(?=\.[a-z0-9]+(?:\?|$))/i, "-t500x500");
}

function validSoundCloudPermalink(value) {
  try {
    return normalizeSoundCloudUrl(value);
  } catch {
    return "";
  }
}

export function normalizeSoundCloudTrack(track) {
  const permalinkUrl = validSoundCloudPermalink(track?.permalink_url);
  const access = compact(track?.access || "playable").toLowerCase();
  const embeddable = compact(track?.embeddable_by || "all").toLowerCase();
  if (
    !permalinkUrl ||
    access !== "playable" ||
    track?.streamable === false ||
    !["", "all"].includes(embeddable)
  )
    return null;
  const numericId = compact(track?.id);
  const urn = compact(track?.urn || (numericId ? `soundcloud:tracks:${numericId}` : ""));
  const seconds = Math.max(0, Number(track?.duration) / 1_000 || 0);
  return {
    id: numericId || hash(permalinkUrl).slice(0, 20),
    soundcloudId: numericId,
    soundcloudUrn: urn,
    title: compact(track?.title) || "Pista de SoundCloud",
    artist:
      compact(track?.metadata_artist) ||
      compact(track?.user?.username) ||
      "SoundCloud",
    album: compact(track?.publisher_metadata?.release_title),
    artwork: soundCloudArtwork(track?.artwork_url || track?.user?.avatar_url),
    duration: seconds,
    durationText: durationText(seconds),
    permalinkUrl,
    userUrl: validSoundCloudPermalink(track?.user?.permalink_url),
    verified: track?.user?.verified === true,
    access,
    provider: "soundcloud",
  };
}

function widgetResourceFromHtml(html) {
  const source = String(html || "")
    .match(/\bsrc\s*=\s*["']([^"']*w\.soundcloud\.com\/player\/?[^"']*)["']/i)?.[1]
    ?.replaceAll("&amp;", "&");
  if (!source) return { kind: "", id: "" };
  try {
    const widget = new URL(source);
    const resource = decodeURIComponent(widget.searchParams.get("url") || "");
    const match = resource.match(/\/(tracks|playlists|users)\/(\d+)/i);
    return { kind: match?.[1]?.toLowerCase() || "", id: match?.[2] || "" };
  } catch {
    return { kind: "", id: "" };
  }
}

export function normalizeSoundCloudOEmbed(data, inputUrl) {
  if (!data || typeof data !== "object")
    throw new MusicServiceError(
      "SoundCloud no devolvió datos de inserción válidos",
      502,
      "soundcloud_oembed",
    );
  const resource = widgetResourceFromHtml(data.html);
  if (resource.kind && resource.kind !== "tracks")
    throw new MusicServiceError(
      "Pega el enlace de una canción, no el de un perfil o una lista",
      400,
      "validation",
    );
  if (!String(data.html || "").includes("w.soundcloud.com/player"))
    throw new MusicServiceError(
      "Esta canción no permite el reproductor de SoundCloud",
      422,
      "soundcloud_not_embeddable",
    );
  const permalinkUrl = normalizeSoundCloudUrl(inputUrl);
  const artist = compact(data.author_name) || "SoundCloud";
  let title = compact(data.title) || "Pista de SoundCloud";
  const suffix = artist
    ? new RegExp(
        `\\s+by\\s+${artist.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
        "i",
      )
    : null;
  if (suffix) title = title.replace(suffix, "").trim() || title;
  return {
    id: resource.id || hash(permalinkUrl).slice(0, 20),
    soundcloudId: resource.id,
    soundcloudUrn: resource.id ? `soundcloud:tracks:${resource.id}` : "",
    title,
    artist,
    album: "",
    artwork: soundCloudArtwork(data.thumbnail_url),
    duration: 0,
    durationText: "",
    permalinkUrl,
    userUrl: validSoundCloudPermalink(data.author_url),
    verified: false,
    access: "playable",
    provider: "soundcloud",
  };
}

export async function resolveSoundCloudUrl(
  rawUrl,
  { fetchImpl = fetch } = {},
) {
  const permalinkUrl = normalizeSoundCloudUrl(rawUrl);
  const key = `soundcloud:oembed:${hash(permalinkUrl)}`;
  const cached = cacheGet(key);
  if (cached) return { ...cached, cached: true };
  const url = new URL(SOUNDCLOUD_OEMBED);
  url.searchParams.set("format", "json");
  url.searchParams.set("url", permalinkUrl);
  let data;
  try {
    ({ data } = await requestJson(url, {
      fetchImpl,
      headers: {
        accept: "application/json",
        "user-agent": "Hanami/5.9.5",
      },
      timeout: 10_000,
      maxBytes: 1_000_000,
    }));
  } catch (error) {
    if (error?.remoteStatus === 404)
      throw new MusicServiceError(
        "SoundCloud no encontró esa canción",
        404,
        "soundcloud_not_found",
      );
    throw error;
  }
  return cacheSet(
    key,
    { provider: "soundcloud-widget", track: normalizeSoundCloudOEmbed(data, permalinkUrl) },
    30 * 60_000,
  );
}

export async function searchSoundCloud(
  rawQuery,
  { fetchImpl = fetch } = {},
) {
  const query = compact(rawQuery);
  if (!query)
    throw new MusicServiceError("Escribe una canción, artista o enlace", 400, "validation");
  if (query.length > 180)
    throw new MusicServiceError("La búsqueda es demasiado larga", 400, "validation");
  if (/^https:\/\//i.test(query)) {
    const resolved = await resolveSoundCloudUrl(query, { fetchImpl });
    return { provider: "soundcloud", source: "oembed", results: [resolved.track] };
  }
  if (query.length < 2)
    throw new MusicServiceError("Escribe al menos dos caracteres", 400, "validation");
  const key = `soundcloud:search:${query.toLocaleLowerCase("es")}`;
  const cached = cacheGet(key);
  if (cached) return { ...cached, cached: true };
  const url = new URL(`${SOUNDCLOUD_API}/tracks`);
  url.searchParams.set("q", query);
  url.searchParams.set("access", "playable");
  url.searchParams.set("limit", "20");
  url.searchParams.set("linked_partitioning", "true");
  const { data } = await soundCloudApiJson(url, { fetchImpl });
  const collection = Array.isArray(data)
    ? data
    : Array.isArray(data?.collection)
      ? data.collection
      : [];
  const results = collection.map(normalizeSoundCloudTrack).filter(Boolean).slice(0, 20);
  return cacheSet(
    key,
    {
      provider: "soundcloud",
      source: "api",
      results,
      omitted: Math.max(0, collection.length - results.length),
    },
    SOUNDCLOUD_SEARCH_TTL_MS,
  );
}

function validateShazamSignature(signature) {
  const value = String(signature || "");
  const prefix = "data:audio/vnd.shazam.sig;base64,";
  if (!value.startsWith(prefix))
    throw new MusicServiceError("La firma acústica no es válida", 400, "validation");
  const encoded = value.slice(prefix.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length > 700_000)
    throw new MusicServiceError("La firma acústica no es válida", 400, "validation");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length < 56 || bytes.length > 512_000 || bytes.readUInt32LE(0) !== 0xcafe2580)
    throw new MusicServiceError("La firma acústica no es válida", 400, "validation");
  return value;
}

function actionUri(action) {
  return compact(action?.uri || action?.url || "");
}

export function parseShazamResponse(data) {
  const track = data?.track;
  if (!track) return null;
  const sections = Array.isArray(track.sections) ? track.sections.filter(Boolean) : [];
  const song = sections.find((section) => section?.type === "SONG");
  const metadata = Array.isArray(song?.metadata) ? song.metadata : [];
  const meta = (title) => metadata.find((item) => item?.title === title)?.text || null;
  const lyrics = sections.find((section) => section?.type === "LYRICS")?.text || null;
  const options = Array.isArray(track?.hub?.options) ? track.hub.options.filter(Boolean) : [];
  const providers = Array.isArray(track?.hub?.providers) ? track.hub.providers.filter(Boolean) : [];
  const apple = options.find((item) => /apple/i.test(item?.providername || ""));
  const spotify = providers.find((item) => /spotify/i.test(item?.caption || ""));
  return {
    id: compact(track.key || data?.tagid || ""),
    title: compact(track.title),
    artist: compact(track.subtitle),
    album: compact(meta("Album")),
    artwork: compact(track?.images?.coverarthq || track?.images?.coverart),
    genre: compact(track?.genres?.primary),
    released: compact(meta("Released")),
    label: compact(meta("Label")),
    lyrics: typeof lyrics === "string" ? lyrics : null,
    shazamUrl: compact(track.url),
    appleMusicUrl: actionUri(apple?.actions?.[0]),
    spotifyUrl: actionUri(spotify?.actions?.[0]),
    isrc: compact(track.isrc),
  };
}

let shazamQueue = Promise.resolve();
let shazamLastRequestAt = 0;
function shazamThrottled(task) {
  const run = shazamQueue.then(async () => {
    const wait = 1_000 - (Date.now() - shazamLastRequestAt);
    if (wait > 0) await sleep(wait);
    shazamLastRequestAt = Date.now();
    return task();
  });
  shazamQueue = run.catch(() => undefined);
  return run;
}

export async function recognizeShazam(
  rawSignature,
  rawDuration,
  { fetchImpl = fetch } = {},
) {
  const signature = validateShazamSignature(rawSignature);
  const sampleDurationMs = Math.round(Number(rawDuration));
  if (!Number.isFinite(sampleDurationMs) || sampleDurationMs < 500 || sampleDurationMs > 12_000)
    throw new MusicServiceError("La duración de la muestra no es válida", 400, "validation");
  const key = `shazam:${hash(signature)}`;
  const cached = cacheGet(key);
  if (cached) return { ...cached, cached: true };
  return shazamThrottled(async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const zones = [
      "Europe/Paris",
      "Europe/Berlin",
      "America/New_York",
      "America/Los_Angeles",
      "Asia/Tokyo",
      "Asia/Singapore",
    ];
    const agents = [
      "Dalvik/2.1.0 (Linux; U; Android 10; Pixel 3 Build/QQ1A.200205.002)",
      "Dalvik/2.1.0 (Linux; U; Android 11; SM-G991B Build/RP1A.200720.012)",
    ];
    const requestBody = {
      geolocation: {
        altitude: 100 + Math.random() * 400,
        latitude: Math.random() * 180 - 90,
        longitude: Math.random() * 360 - 180,
      },
      signature: { samplems: sampleDurationMs, timestamp, uri: signature },
      timestamp,
      timezone: zones[Math.floor(Math.random() * zones.length)],
    };
    const endpoint = `${SHAZAM_URL}/${randomUUID().toUpperCase()}/${randomUUID()}?sync=true&webv3=true&sampling=true&connected=&shazamapiversion=v3&sharehub=true`;
    let lastError;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { data } = await requestJson(endpoint, {
          fetchImpl,
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            "content-language": "en_US",
            "user-agent": agents[Math.floor(Math.random() * agents.length)],
          },
          json: requestBody,
          timeout: 12_000,
          maxBytes: 2_000_000,
        });
        const track = parseShazamResponse(data);
        if (!track)
          throw new MusicServiceError("Shazam no encontró una coincidencia", 404, "no_match");
        return cacheSet(key, { provider: "shazam", match: true, track }, 5 * 60_000);
      } catch (error) {
        lastError = error;
        if (error?.statusCode === 429 && attempt === 0) {
          await sleep(2_000);
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  });
}

export function cleanLyricsTitle(value) {
  return compact(value)
    .replace(/\s*[\[(][^\])]*(?:official|video|audio|lyrics?|lyric|remaster(?:ed)?|visuali[sz]er)[^\])]*[\])]/gi, "")
    .replace(/\s+(?:feat\.?|ft\.?)\s+.+$/i, "")
    .trim();
}

export function cleanLyricsArtist(value) {
  return compact(value)
    .replace(/\s*[-–—|]\s*topic\s*$/i, "")
    .replace(/\s+(?:feat\.?|ft\.?)\s+.+$/i, "")
    .trim();
}

function lyricsValue(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  const lyrics = [
    candidate.syncedLyrics,
    candidate.lrc,
    candidate.lyrics,
    candidate.plainLyrics,
  ].find((value) => typeof value === "string" && value.trim());
  if (lyrics) return lyrics.trim().slice(0, 200_000);
  if (candidate.instrumental === true) return "[00:00.00] ♪ Instrumental ♪";
  return null;
}

function lyricsResult(provider, lyrics) {
  if (!lyrics) return null;
  return {
    provider,
    type: /\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?]/.test(lyrics) ? "synced" : "plain",
    lyrics,
  };
}

async function lrclibLyrics(title, artist, duration, fetchImpl) {
  const baseHeaders = { accept: "application/json", "user-agent": "Hanami/5.9.5" };
  if (title && artist) {
    const url = new URL("https://lrclib.net/api/get");
    url.searchParams.set("track_name", title);
    url.searchParams.set("artist_name", artist);
    if (duration > 0) url.searchParams.set("duration", String(Math.round(duration)));
    const { data } = await requestJson(url, {
      fetchImpl,
      headers: baseHeaders,
      timeout: 4_500,
      maxBytes: 1_000_000,
      allowStatuses: [404],
    });
    const exact = lyricsResult("LRCLIB", lyricsValue(data));
    if (exact) return exact;
  }
  if (!title) return null;
  const url = new URL("https://lrclib.net/api/search");
  url.searchParams.set("track_name", title);
  if (artist && !/^(soundcloud|unknown)$/i.test(artist))
    url.searchParams.set("artist_name", artist);
  const { data } = await requestJson(url, {
    fetchImpl,
    headers: baseHeaders,
    timeout: 4_500,
    maxBytes: 1_500_000,
    allowStatuses: [404],
  });
  const candidates = Array.isArray(data) ? data : [];
  candidates.sort((a, b) => {
    const sync = Number(!!b?.syncedLyrics) - Number(!!a?.syncedLyrics);
    if (sync) return sync;
    if (duration <= 0) return 0;
    return Math.abs((Number(a?.duration) || 0) - duration) -
      Math.abs((Number(b?.duration) || 0) - duration);
  });
  for (const candidate of candidates) {
    const result = lyricsResult("LRCLIB", lyricsValue(candidate));
    if (result) return result;
  }
  return null;
}

function nestedLyrics(data) {
  return lyricsValue(data?.data) || lyricsValue(data);
}

async function unisonLyrics(title, artist, duration, fetchImpl) {
  const url = new URL("https://unison.boidu.dev/search");
  url.searchParams.set("title", title);
  url.searchParams.set("artist", artist);
  if (duration > 0) url.searchParams.set("duration", String(Math.round(duration)));
  const { data } = await requestJson(url, {
    fetchImpl,
    headers: { accept: "application/json", "user-agent": "Hanami/5.9.5" },
    timeout: 7_000,
    maxBytes: 1_000_000,
    allowStatuses: [404],
  });
  return lyricsResult("Unison", nestedLyrics(data));
}

async function paxsenixLyrics(title, artist, duration, fetchImpl) {
  const url = new URL("https://lyrics.paxsenix.org/lyrics");
  url.searchParams.set("title", title);
  url.searchParams.set("artist", artist);
  if (duration > 0) url.searchParams.set("duration", String(Math.round(duration)));
  const { data } = await requestJson(url, {
    fetchImpl,
    headers: { accept: "application/json", "user-agent": "Hanami/5.9.5" },
    timeout: 7_000,
    maxBytes: 1_000_000,
    allowStatuses: [404],
  });
  return lyricsResult("Paxsenix", nestedLyrics(data));
}

async function betterLyrics(title, artist, duration, fetchImpl) {
  for (const path of ["getLyrics", "kugou/getLyrics"]) {
    const url = new URL(`https://lyrics-api.boidu.dev/${path}`);
    url.searchParams.set("title", title);
    url.searchParams.set("artist", artist);
    if (duration > 0) url.searchParams.set("duration", String(Math.round(duration)));
    try {
      const { data } = await requestJson(url, {
        fetchImpl,
        headers: { accept: "application/json", "user-agent": "Hanami/5.9.5" },
        timeout: 7_000,
        maxBytes: 1_000_000,
        allowStatuses: [404],
      });
      const result = lyricsResult("BetterLyrics", nestedLyrics(data));
      if (result) return result;
    } catch {}
  }
  return null;
}

export async function fetchExternalLyrics(
  { title: rawTitle, artist: rawArtist, duration: rawDuration = 0 },
  { fetchImpl = fetch } = {},
) {
  const title = cleanLyricsTitle(rawTitle);
  const artist = cleanLyricsArtist(rawArtist);
  const duration = Math.max(0, Math.min(24 * 60 * 60, Number(rawDuration) || 0));
  if (!title)
    throw new MusicServiceError("Falta el título de la canción", 400, "validation");
  if (title.length > 180 || artist.length > 180)
    throw new MusicServiceError(
      "Los metadatos de la canción son demasiado largos",
      400,
      "validation",
    );
  const key = `lyrics:${hash(
    `${title.toLowerCase()}|${artist.toLowerCase()}|${Math.round(duration)}`,
  )}`;
  const cached = cacheGet(key);
  if (cached) return { ...cached, cached: true };
  try {
    const primary = await lrclibLyrics(title, artist, duration, fetchImpl);
    if (primary) return cacheSet(key, primary, 12 * 60 * 60_000);
  } catch {}
  const fallbacks = await Promise.all(
    [
      () => unisonLyrics(title, artist, duration, fetchImpl),
      () => paxsenixLyrics(title, artist, duration, fetchImpl),
      () => betterLyrics(title, artist, duration, fetchImpl),
    ].map(async (provider) => {
      try {
        return await provider();
      } catch {
        return null;
      }
    }),
  );
  const result = fallbacks.find(Boolean);
  if (result) return cacheSet(key, result, 12 * 60 * 60_000);
  throw new MusicServiceError(
    "No se encontraron letras externas",
    404,
    "lyrics_not_found",
  );
}

export function musicCapabilities() {
  const configured = soundCloudCredentials().configured;
  return {
    soundcloud: {
      widget: true,
      oembed: true,
      search: configured,
      searchConfigured: configured,
      playback: "official-widget",
      proxiedPlayback: false,
    },
    recognition: {
      provider: "Shazam",
      microphoneRequired: true,
      unofficialEndpoint: true,
    },
    lyrics: {
      providers: ["LRCLIB", "Unison", "Paxsenix", "BetterLyrics"],
    },
  };
}