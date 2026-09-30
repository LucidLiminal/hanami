import { createHash, randomUUID } from "node:crypto";
import { setDefaultResultOrder } from "node:dns";

// Googlevideo URLs can be bound to the source IP that resolved them. Prefer the
// same IPv4 path for InnerTube and subsequent media requests on dual-stack hosts.
try {
  setDefaultResultOrder("ipv4first");
} catch {}

const YTM_ORIGIN = "https://music.youtube.com";
const YT_ORIGIN = "https://www.youtube.com";
const YTM_SEARCH_URL = `${YTM_ORIGIN}/youtubei/v1/search?prettyPrint=false`;
const YT_PLAYER_URL = `${YT_ORIGIN}/youtubei/v1/player?prettyPrint=false`;
const YTM_PLAYER_URL = `${YTM_ORIGIN}/youtubei/v1/player?prettyPrint=false`;
const WEB_REMIX_VERSION = "1.20260213.01.00";
const WEB_REMIX_ID = "67";
const SEARCH_SONGS_PARAMS = "EgWKAQIIAWoQEAMQBBAJEAoQBRAREBAQFQ%3D%3D";
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0";
const SHAZAM_URL = "https://amp.shazam.com/discovery/v5/en/US/android/-/tag";
const CACHE_LIMIT = 160;
const INVIDIOUS_CACHE_TTL_MS = 5 * 60_000;
const INVIDIOUS_MAX_JSON_BYTES = 2_000_000;
let latestInnerTubeVisitorData = "";
let latestInnerTubeCookie = "";

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

function rememberInnerTubeSession(response, data) {
  const visitorData = compact(data?.responseContext?.visitorData);
  if (visitorData && visitorData.length <= 512) latestInnerTubeVisitorData = visitorData;
  const rawCookies =
    response?.headers?.getSetCookie?.() ||
    (response?.headers?.get?.("set-cookie") ? [response.headers.get("set-cookie")] : []);
  const allowed = /^(?:VISITOR_INFO1_LIVE|YSC|PREF|CONSENT|SOCS|__Secure-YNID)=/;
  const values = rawCookies
    .map((value) => String(value || "").split(";")[0].trim())
    .filter((value) => allowed.test(value))
    .slice(-6);
  if (values.length) latestInnerTubeCookie = values.join("; ");
}

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
      body: json === undefined ? undefined : JSON.stringify(json),
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

function runsText(value) {
  const runs = value?.runs;
  if (!Array.isArray(runs)) return compact(value?.simpleText || "");
  return compact(runs.map((run) => run?.text || "").join(""));
}

function rendererColumn(renderer, index) {
  return renderer?.flexColumns?.[index]?.musicResponsiveListItemFlexColumnRenderer?.text;
}

function deepFindVideoId(value, depth = 0) {
  if (!value || depth > 9) return null;
  if (typeof value !== "object") return null;
  if (typeof value.videoId === "string" && /^[A-Za-z0-9_-]{11}$/.test(value.videoId))
    return value.videoId;
  if (Array.isArray(value)) {
    for (const child of value) {
      const id = deepFindVideoId(child, depth + 1);
      if (id) return id;
    }
    return null;
  }
  for (const child of Object.values(value)) {
    const id = deepFindVideoId(child, depth + 1);
    if (id) return id;
  }
  return null;
}

function deepFindThumbnails(value, depth = 0) {
  if (!value || depth > 9 || typeof value !== "object") return null;
  if (Array.isArray(value.thumbnails) && value.thumbnails.length) {
    return [...value.thumbnails]
      .filter((item) => typeof item?.url === "string")
      .sort((a, b) => (Number(a.width) || 0) * (Number(a.height) || 0) - (Number(b.width) || 0) * (Number(b.height) || 0))
      .at(-1)?.url;
  }
  const children = Array.isArray(value) ? value : Object.values(value);
  for (const child of children) {
    const url = deepFindThumbnails(child, depth + 1);
    if (url) return url;
  }
  return null;
}

function durationSeconds(value) {
  const parts = String(value || "").trim().split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part)) || parts.length < 2 || parts.length > 3)
    return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function parseMusicRenderer(renderer) {
  const videoId = deepFindVideoId(renderer);
  if (!videoId) return null;
  const title = runsText(renderer?.title) || runsText(rendererColumn(renderer, 0));
  if (!title) return null;
  const subtitleNode = renderer?.subtitle || rendererColumn(renderer, 1);
  const subtitle = runsText(subtitleNode);
  const runLabels = Array.isArray(subtitleNode?.runs)
    ? subtitleNode.runs.map((run) => compact(run?.text)).filter(Boolean)
    : subtitle.split(/\s*[•·]\s*/).filter(Boolean);
  const ignored = /^(canci[oó]n|song|video|music video|episodio|episode|podcast)$/i;
  const time = runLabels.findLast((label) => /^\d{1,2}:\d{2}(?::\d{2})?$/.test(label)) || "";
  const metadata = runLabels.filter(
    (label) => !/^[•·|]$/.test(label) && !ignored.test(label) && label !== time,
  );
  const artist = metadata[0] || subtitle || "YouTube Music";
  const album = metadata[1] || "";
  let artwork = deepFindThumbnails(renderer) || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  if (artwork.startsWith("//")) artwork = `https:${artwork}`;
  return {
    id: videoId,
    videoId,
    title,
    artist,
    album,
    subtitle,
    artwork,
    duration: durationSeconds(time),
    durationText: time,
    provider: "youtube",
  };
}

export function parseYouTubeMusicSearch(root) {
  const results = [];
  const seen = new Set();
  const walk = (value, depth = 0) => {
    if (!value || typeof value !== "object" || depth > 18 || results.length >= 50) return;
    if (Array.isArray(value)) {
      for (const child of value) walk(child, depth + 1);
      return;
    }
    for (const key of ["musicResponsiveListItemRenderer", "musicTwoRowItemRenderer"]) {
      if (value[key]) {
        const track = parseMusicRenderer(value[key]);
        if (track && !seen.has(track.videoId)) {
          seen.add(track.videoId);
          results.push(track);
        }
      }
    }
    for (const child of Object.values(value)) walk(child, depth + 1);
  };
  walk(root);
  return results;
}

export async function searchYouTubeMusic(
  query,
  { fetchImpl = fetch, language = "es-ES", country = "ES" } = {},
) {
  const q = compact(query);
  if (!q) throw new MusicServiceError("La búsqueda está vacía", 400, "validation");
  if (q.length > 120)
    throw new MusicServiceError("La búsqueda supera 120 caracteres", 400, "validation");
  const key = `yt-search:${language}:${country}:${q.toLocaleLowerCase("es")}`;
  const cached = cacheGet(key);
  if (cached) return { ...cached, cached: true };
  const payload = {
    context: {
      client: {
        clientName: "WEB_REMIX",
        clientVersion: WEB_REMIX_VERSION,
        hl: language,
        gl: country,
      },
      user: { lockedSafetyMode: false },
    },
    query: q,
    params: SEARCH_SONGS_PARAMS,
  };
  const { data, response } = await requestJson(YTM_SEARCH_URL, {
    fetchImpl,
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "accept-language": `${language},${language.split("-")[0]};q=0.9,en;q=0.8`,
      "user-agent": DESKTOP_UA,
      origin: YTM_ORIGIN,
      referer: `${YTM_ORIGIN}/`,
      "x-origin": YTM_ORIGIN,
      "x-youtube-client-name": WEB_REMIX_ID,
      "x-youtube-client-version": WEB_REMIX_VERSION,
    },
    json: payload,
    timeout: 10_000,
  });
  rememberInnerTubeSession(response, data);
  const value = {
    provider: "youtube-innertube",
    query: q,
    results: parseYouTubeMusicSearch(data).slice(0, 20),
  };
  return cacheSet(key, value, 5 * 60_000);
}

function directAudioFormats(player) {
  const adaptive = Array.isArray(player?.streamingData?.adaptiveFormats)
    ? player.streamingData.adaptiveFormats
    : [];
  return adaptive
    .filter(
      (format) =>
        /^audio\//i.test(format?.mimeType || "") &&
        typeof format?.url === "string" &&
        /^https:\/\//i.test(format.url),
    )
    .map((format) => ({
      url: format.url,
      itag: Number(format.itag) || 0,
      mimeType: String(format.mimeType || ""),
      bitrate: Number(format.bitrate) || 0,
      averageBitrate: Number(format.averageBitrate) || Number(format.bitrate) || 0,
      audioQuality: String(format.audioQuality || ""),
      audioSampleRate: Number(format.audioSampleRate) || 0,
      audioChannels: Number(format.audioChannels) || 0,
      contentLength: Number(format.contentLength) || 0,
    }));
}

export function chooseAudioStream(player) {
  const formats = directAudioFormats(player);
  formats.sort((a, b) => {
    const broadA = /audio\/mp4/i.test(a.mimeType) ? 2 : /audio\/webm/i.test(a.mimeType) ? 1 : 0;
    const broadB = /audio\/mp4/i.test(b.mimeType) ? 2 : /audio\/webm/i.test(b.mimeType) ? 1 : 0;
    return broadB - broadA || b.averageBitrate - a.averageBitrate || b.bitrate - a.bitrate;
  });
  return formats[0] || null;
}

function safeExtractedUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (
      url.protocol !== "https:" ||
      /^(?:localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/i.test(
        url.hostname,
      )
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

function directExpiry(url) {
  try {
    const seconds = Number(new URL(url).searchParams.get("expire"));
    if (Number.isFinite(seconds) && seconds * 1000 > Date.now()) return seconds * 1000;
  } catch {}
  return Date.now() + 60 * 60_000;
}

function publicInvidiousOrigin(value) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw new MusicServiceError(
      "La instancia Invidious debe ser un origen HTTPS completo",
      400,
      "validation",
    );
  }
  const hostname = url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  const localDevelopmentOrigin =
    !isProductionRuntime() &&
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(hostname);
  const privateOrLiteralHost =
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "0.0.0.0" ||
    hostname.includes(":") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) ||
    /^(?:127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(
      hostname,
    );
  if (
    (url.protocol !== "https:" && !localDevelopmentOrigin) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname && url.pathname !== "/") ||
    (privateOrLiteralHost && !localDevelopmentOrigin)
  )
    throw new MusicServiceError(
      "La instancia Invidious debe ser un origen HTTPS público sin ruta ni credenciales",
      400,
      "validation",
    );
  return url.origin;
}

function configuredInvidiousOrigins() {
  const values = String(process.env.HANAMI_INVIDIOUS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => compact(value))
    .filter(Boolean);
  const origins = new Set();
  for (const value of values) {
    try {
      origins.add(publicInvidiousOrigin(value));
    } catch {
      throw new MusicServiceError(
        "HANAMI_INVIDIOUS_ALLOWED_ORIGINS contiene un origen HTTPS no válido",
        500,
        "invidious_config",
      );
    }
  }
  return origins;
}

function isProductionRuntime() {
  return (
    compact(process.env.NODE_ENV).toLowerCase() === "production" ||
    compact(process.env.VERCEL_ENV).toLowerCase() === "production"
  );
}

export function normalizeInvidiousOrigin(value) {
  const origin = publicInvidiousOrigin(value);
  const allowed = configuredInvidiousOrigins();
  if (allowed.size && !allowed.has(origin))
    throw new MusicServiceError(
      "Esta instancia no está autorizada por HANAMI_INVIDIOUS_ALLOWED_ORIGINS",
      403,
      "invidious_origin_not_allowed",
    );
  if (!allowed.size && isProductionRuntime())
    throw new MusicServiceError(
      "Configura HANAMI_INVIDIOUS_ALLOWED_ORIGINS para usar el relay Invidious en producción",
      503,
      "invidious_config",
    );
  return origin;
}

function safeInvidiousMediaUrl(value, instanceOrigin) {
  try {
    const base = new URL(instanceOrigin);
    const media = new URL(String(value || ""), base);
    if (
      media.origin !== base.origin ||
      media.username ||
      media.password ||
      !(
        media.pathname === "/videoplayback" ||
        media.pathname.startsWith("/companion/") ||
        media.pathname.startsWith("/api/manifest/")
      )
    )
      return null;
    return media;
  } catch {
    return null;
  }
}

function invidiousExpiry(url) {
  try {
    const seconds = Number(url.searchParams.get("expire"));
    if (Number.isFinite(seconds) && seconds * 1000 > Date.now() + 30_000)
      return seconds * 1000;
  } catch {}
  return Date.now() + INVIDIOUS_CACHE_TTL_MS;
}

function invidiousArtwork(data) {
  const thumbnails = Array.isArray(data?.videoThumbnails) ? data.videoThumbnails : [];
  return (
    thumbnails
      .map((thumbnail) => ({
        url: safeExtractedUrl(thumbnail?.url),
        area: Number(thumbnail?.width || 0) * Number(thumbnail?.height || 0),
      }))
      .filter((thumbnail) => thumbnail.url)
      .sort((a, b) => b.area - a.area)[0]?.url || ""
  );
}

export function chooseInvidiousAudio(data, instanceOrigin) {
  const formats = Array.isArray(data?.adaptiveFormats) ? data.adaptiveFormats : [];
  const candidates = formats
    .map((format) => {
      const mimeType = compact(format?.type || format?.mimeType);
      if (!/^audio\//i.test(mimeType)) return null;
      const url = safeInvidiousMediaUrl(format?.url, instanceOrigin);
      if (!url) return null;
      return {
        url: url.href,
        mimeType,
        bitrate: Number(format?.bitrate) || 0,
        averageBitrate: Number(format?.averageBitrate) || Number(format?.bitrate) || 0,
        audioQuality: compact(format?.audioQuality),
        audioSampleRate: Number(format?.audioSampleRate) || 0,
        audioChannels: Number(format?.audioChannels) || 0,
        contentLength: Number(format?.clen || format?.contentLength) || 0,
        expiresAt: invidiousExpiry(url),
      };
    })
    .filter(Boolean);
  candidates.sort((a, b) => {
    const typeA = /audio\/mp4/i.test(a.mimeType) ? 2 : /audio\/webm/i.test(a.mimeType) ? 1 : 0;
    const typeB = /audio\/mp4/i.test(b.mimeType) ? 2 : /audio\/webm/i.test(b.mimeType) ? 1 : 0;
    return typeB - typeA || b.averageBitrate - a.averageBitrate || b.bitrate - a.bitrate;
  });
  return candidates[0] || null;
}

export async function resolveInvidiousAudio(
  videoId,
  { instanceUrl, fetchImpl = fetch, forceRefresh = false } = {},
) {
  const id = compact(videoId);
  if (!/^[A-Za-z0-9_-]{11}$/.test(id))
    throw new MusicServiceError("El identificador de YouTube no es válido", 400, "validation");
  const invidiousOrigin = normalizeInvidiousOrigin(instanceUrl);
  const cacheKey = `invidious-resolve:${hash(invidiousOrigin).slice(0, 16)}:${id}`;
  const cached = cacheGet(cacheKey);
  if (!forceRefresh && cached && cached.expiresAt > Date.now() + 90_000)
    return { ...cached, cached: true };

  let data;
  try {
    ({ data } = await requestJson(
      new URL(`/api/v1/videos/${encodeURIComponent(id)}?local=true`, invidiousOrigin).href,
      {
        fetchImpl,
        headers: {
          accept: "application/json",
          "user-agent": "Hanami/5.8.68 Invidious relay",
        },
        timeout: 12_000,
        maxBytes: INVIDIOUS_MAX_JSON_BYTES,
        redirect: "error",
      },
    ));
  } catch (error) {
    if (error?.remoteStatus === 403)
      throw new MusicServiceError(
        "La instancia Invidious desactivó o bloqueó su API de vídeo",
        502,
        "invidious_api",
      );
    if (error instanceof MusicServiceError) {
      error.kind = error.kind === "rate_limited" ? "rate_limited" : "invidious_api";
      throw error;
    }
    throw error;
  }
  const stream = chooseInvidiousAudio(data, invidiousOrigin);
  if (!stream)
    throw new MusicServiceError(
      "La instancia Invidious no devolvió un stream de audio retransmisible",
      502,
      "invidious_stream",
    );
  const value = {
    provider: "youtube-invidious-relay",
    videoId: id,
    expiresAt: stream.expiresAt,
    invidiousOrigin,
    stream: {
      url: stream.url,
      mimeType: stream.mimeType,
      bitrate: stream.bitrate,
      averageBitrate: stream.averageBitrate,
      audioQuality: stream.audioQuality,
      audioSampleRate: stream.audioSampleRate,
      audioChannels: stream.audioChannels,
      contentLength: stream.contentLength,
    },
    track: {
      videoId: id,
      title: compact(data?.title),
      artist: compact(data?.author) || "YouTube Music",
      duration: Number(data?.lengthSeconds) || 0,
      artwork: invidiousArtwork(data),
    },
  };
  return cacheSet(
    cacheKey,
    value,
    Math.max(30_000, Math.min(INVIDIOUS_CACHE_TTL_MS, value.expiresAt - Date.now() - 30_000)),
  );
}

export function publicInvidiousResolution(resolution) {
  const videoId = compact(resolution?.videoId);
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId))
    throw new MusicServiceError("La resolución Invidious no es válida", 502);
  const invidiousOrigin = normalizeInvidiousOrigin(resolution?.invidiousOrigin);
  const query = new URLSearchParams({ instance: invidiousOrigin });
  return {
    provider: "youtube-invidious-relay",
    videoId,
    expiresAt: resolution.expiresAt,
    invidiousOrigin,
    stream: {
      ...resolution.stream,
      url: `/api/music/invidious/audio/${encodeURIComponent(videoId)}?${query}`,
    },
    track: resolution.track,
    proxied: true,
    browserDirect: false,
  };
}

export async function openInvidiousAudio(
  videoId,
  instanceUrl,
  { range = "", fetchImpl = fetch } = {},
) {
  const requestedRange = String(range).trim();
  if (requestedRange && !/^bytes=\d*-\d*$/.test(requestedRange))
    throw new MusicServiceError("El rango de audio no es válido", 416, "validation");
  const fetchStream = async (forceRefresh = false) => {
    const resolution = await resolveInvidiousAudio(videoId, {
      instanceUrl,
      fetchImpl,
      forceRefresh,
    });
    const remoteUrl = safeInvidiousMediaUrl(
      resolution?.stream?.url,
      resolution?.invidiousOrigin,
    );
    if (!remoteUrl)
      throw new MusicServiceError(
        "El stream de Invidious no pertenece a la instancia autorizada",
        502,
        "invidious_stream",
      );
    let response;
    try {
      response = await fetchImpl(remoteUrl, {
        method: "GET",
        headers: {
          accept: "*/*",
          "accept-encoding": "identity",
          "user-agent": "Hanami/5.8.68 Invidious relay",
          ...(requestedRange ? { range: requestedRange } : {}),
        },
        redirect: "error",
        signal: AbortSignal.timeout(25_000),
      });
    } catch (error) {
      if (error?.name === "TimeoutError" || error?.name === "AbortError")
        throw new MusicServiceError("El relay de audio agotó el tiempo de espera", 504);
      throw new MusicServiceError("No se pudo abrir el stream de Invidious", 502);
    }
    if (response.ok && response.body) return { response, resolution };
    try {
      await response.body?.cancel?.();
    } catch {}
    return { response, resolution };
  };

  let attempt = await fetchStream();
  if (!attempt.response?.ok || !attempt.response.body) attempt = await fetchStream(true);
  if (!attempt.response?.ok || !attempt.response.body)
    throw new MusicServiceError(
      attempt.response?.status === 403
        ? "La instancia Invidious rechazó el stream de audio"
        : `La instancia Invidious respondió HTTP ${attempt.response?.status || 502} al abrir el audio`,
      attempt.response?.status === 403 ? 502 : attempt.response?.status || 502,
      "invidious_audio",
    );
  return attempt;
}

export function normalizeExtractorResponse(data, videoId) {
  const candidates = [];
  if (data?.stream) candidates.push(data.stream);
  if (data?.url) candidates.push(data);
  if (Array.isArray(data?.audioStreams)) candidates.push(...data.audioStreams);
  const streams = candidates
    .map((stream) => {
      const url = safeExtractedUrl(stream?.url);
      if (!url) return null;
      const mimeType = String(stream?.mimeType || stream?.type || "");
      if (mimeType && !/^audio\//i.test(mimeType)) return null;
      return {
        url,
        itag: Number(stream?.itag) || 0,
        mimeType: mimeType || "audio/mp4",
        bitrate: Number(stream?.bitrate) || 0,
        averageBitrate: Number(stream?.averageBitrate) || Number(stream?.bitrate) || 0,
        audioQuality: String(stream?.audioQuality || stream?.quality || ""),
        audioSampleRate: Number(stream?.audioSampleRate) || 0,
        audioChannels: Number(stream?.audioChannels) || 0,
        contentLength: Number(stream?.contentLength) || 0,
      };
    })
    .filter(Boolean);
  streams.sort((a, b) => {
    const broadA = /audio\/mp4/i.test(a.mimeType) ? 2 : /audio\/webm/i.test(a.mimeType) ? 1 : 0;
    const broadB = /audio\/mp4/i.test(b.mimeType) ? 2 : /audio\/webm/i.test(b.mimeType) ? 1 : 0;
    return broadB - broadA || b.averageBitrate - a.averageBitrate || b.bitrate - a.bitrate;
  });
  const stream = streams[0];
  if (!stream)
    throw new MusicServiceError(
      "El adaptador de extracción no devolvió audio HTTPS directo",
      502,
      "extractor_invalid",
    );
  const metadata = data?.track || data?.videoDetails || data || {};
  const expiresAt =
    Number(data?.expiresAt) > Date.now() ? Number(data.expiresAt) : directExpiry(stream.url);
  return {
    provider: "youtube-extractor-adapter",
    videoId,
    stream,
    expiresAt,
    track: {
      videoId,
      title: compact(metadata?.title),
      artist: compact(metadata?.artist || metadata?.author) || "YouTube Music",
      duration: Number(metadata?.duration || metadata?.lengthSeconds) || 0,
      artwork:
        safeExtractedUrl(metadata?.artwork || metadata?.thumbnail) ||
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    },
  };
}

async function resolveWithConfiguredExtractor(videoId, fetchImpl) {
  const configured = compact(process.env.HANAMI_YOUTUBE_RESOLVER_URL);
  if (!configured) return null;
  const endpoint = safeExtractedUrl(configured);
  if (!endpoint)
    throw new MusicServiceError(
      "HANAMI_YOUTUBE_RESOLVER_URL debe ser una URL HTTPS pública",
      500,
      "extractor_config",
    );
  const token = compact(process.env.HANAMI_YOUTUBE_RESOLVER_TOKEN);
  const { data } = await requestJson(endpoint, {
    fetchImpl,
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "Hanami/5.8.68",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    json: { videoId },
    timeout: 18_000,
    maxBytes: 2_000_000,
  });
  return normalizeExtractorResponse(data, videoId);
}

const PLAYER_CLIENTS = [
  {
    endpoint: YT_PLAYER_URL,
    id: "3",
    version: "20.10.38",
    userAgent: "com.google.android.youtube/20.10.38 (Linux; U; Android 15) gzip",
    client: {
      clientName: "ANDROID",
      clientVersion: "20.10.38",
      androidSdkVersion: 35,
      osName: "Android",
      osVersion: "15",
      hl: "es",
      gl: "ES",
    },
  },
  {
    endpoint: YTM_PLAYER_URL,
    id: WEB_REMIX_ID,
    version: WEB_REMIX_VERSION,
    userAgent: DESKTOP_UA,
    client: {
      clientName: "WEB_REMIX",
      clientVersion: WEB_REMIX_VERSION,
      hl: "es-ES",
      gl: "ES",
    },
  },
];

export async function resolveYouTubeAudio(
  videoId,
  { fetchImpl = fetch, forceRefresh = false, preferWeb = false } = {},
) {
  const id = compact(videoId);
  if (!/^[A-Za-z0-9_-]{11}$/.test(id))
    throw new MusicServiceError("El identificador de YouTube no es válido", 400, "validation");
  const configuredResolver = compact(process.env.HANAMI_YOUTUBE_RESOLVER_URL);
  const cacheKey = `yt-resolve:${configuredResolver ? hash(configuredResolver).slice(0, 10) : "innertube"}:${id}`;
  const cached = cacheGet(cacheKey);
  if (!forceRefresh && cached && cached.expiresAt > Date.now() + 90_000)
    return { ...cached, cached: true };
  let lastReason = "No hay un stream de audio directo disponible";
  let signatureOnly = false;
  if (configuredResolver) {
    try {
      const adapted = await resolveWithConfiguredExtractor(id, fetchImpl);
      if (adapted)
        return cacheSet(
          cacheKey,
          adapted,
          Math.max(
            30_000,
            Math.min(15 * 60_000, adapted.expiresAt - Date.now() - 60_000),
          ),
        );
    } catch (error) {
      lastReason = error?.message || lastReason;
    }
  }
  const playerClients = preferWeb
    ? [...PLAYER_CLIENTS].sort((a, b) => Number(b.id === WEB_REMIX_ID) - Number(a.id === WEB_REMIX_ID))
    : PLAYER_CLIENTS;
  for (const descriptor of playerClients) {
    try {
      const { data, response } = await requestJson(descriptor.endpoint, {
        fetchImpl,
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "accept-language": "es-ES,es;q=0.9,en;q=0.8",
          "user-agent": descriptor.userAgent,
          origin: descriptor.endpoint.startsWith(YTM_ORIGIN) ? YTM_ORIGIN : YT_ORIGIN,
          referer: descriptor.endpoint.startsWith(YTM_ORIGIN)
            ? `${YTM_ORIGIN}/`
            : `${YT_ORIGIN}/`,
          "x-youtube-client-name": descriptor.id,
          "x-youtube-client-version": descriptor.version,
          ...(latestInnerTubeVisitorData
            ? { "x-goog-visitor-id": latestInnerTubeVisitorData }
            : {}),
          ...(latestInnerTubeCookie ? { cookie: latestInnerTubeCookie } : {}),
        },
        json: {
          context: {
            client: {
              ...descriptor.client,
              ...(latestInnerTubeVisitorData
                ? { visitorData: latestInnerTubeVisitorData }
                : {}),
            },
          },
          videoId: id,
          contentCheckOk: true,
          racyCheckOk: true,
        },
        timeout: 10_000,
      });
      rememberInnerTubeSession(response, data);
      const status = data?.playabilityStatus?.status;
      if (status && status !== "OK") {
        lastReason = compact(data?.playabilityStatus?.reason) || `YouTube indicó ${status}`;
        continue;
      }
      const stream = chooseAudioStream(data);
      if (!stream) {
        const formats = data?.streamingData?.adaptiveFormats || [];
        signatureOnly ||= formats.some(
          (format) => /^audio\//i.test(format?.mimeType || "") && format?.signatureCipher,
        );
        continue;
      }
      const expiresAt = directExpiry(stream.url);
      const details = data?.videoDetails || {};
      const value = {
        provider: "youtube-innertube",
        videoId: id,
        stream,
        expiresAt,
        proxyHeaders: {
          "user-agent": descriptor.userAgent,
          "x-youtube-client-name": descriptor.id,
          "x-youtube-client-version": descriptor.version,
          ...(compact(data?.responseContext?.visitorData)
            ? { "x-goog-visitor-id": compact(data.responseContext.visitorData) }
            : {}),
          ...(latestInnerTubeCookie ? { cookie: latestInnerTubeCookie } : {}),
        },
        track: {
          videoId: id,
          title: compact(details.title),
          artist: compact(details.author) || "YouTube Music",
          duration: Number(details.lengthSeconds) || 0,
          artwork: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        },
      };
      return cacheSet(
        cacheKey,
        value,
        Math.max(30_000, Math.min(15 * 60_000, expiresAt - Date.now() - 60_000)),
      );
    } catch (error) {
      if (error?.statusCode === 429) throw error;
      lastReason = error?.message || lastReason;
    }
  }
  if (signatureOnly)
    throw new MusicServiceError(
      "YouTube sólo devolvió formatos con firma dinámica; Hanami no descifra firmas ni contenido protegido",
      422,
      "signature_required",
    );
  if (/confirma que no eres un bot|sign in to confirm/i.test(lastReason))
    throw new MusicServiceError(
      "YouTube bloqueó la resolución anónima del servidor. Configura HANAMI_YOUTUBE_RESOLVER_URL con un adaptador NewPipe/yt-dlp propio",
      503,
      "youtube_bot_check",
    );
  throw new MusicServiceError(lastReason, 422, "stream_unavailable");
}

export function publicYouTubeResolution(resolution) {
  const videoId = compact(resolution?.videoId);
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId))
    throw new MusicServiceError("La resolución de YouTube no es válida", 502);
  return {
    provider: resolution.provider,
    videoId,
    expiresAt: resolution.expiresAt,
    stream: {
      ...resolution.stream,
      url: `/api/music/youtube/audio/${videoId}`,
    },
    track: resolution.track,
    proxied: true,
  };
}

export async function openYouTubeAudio(
  videoId,
  { range = "", fetchImpl = fetch } = {},
) {
  const requestedRange = String(range).trim();
  if (requestedRange && !/^bytes=\d*-\d*$/.test(requestedRange))
    throw new MusicServiceError("El rango de audio no es válido", 416, "validation");
  const fetchStream = async (resolution) => {
    const remoteUrl = safeExtractedUrl(resolution?.stream?.url);
    if (!remoteUrl)
      throw new MusicServiceError("El stream resuelto no es una URL HTTPS válida", 502);
    const baseHeaders = {
      accept: "*/*",
      "accept-encoding": "identity",
      ...(requestedRange ? { range: requestedRange } : {}),
    };
    const storedHeaders = resolution?.proxyHeaders || {};
    const strategies = [
      {
        ...baseHeaders,
        "user-agent": "com.google.android.youtube/20.10.38 (Linux; U; Android 15) gzip",
        ...storedHeaders,
      },
      {
        ...baseHeaders,
        "user-agent": DESKTOP_UA,
        referer: `${YT_ORIGIN}/`,
        origin: YT_ORIGIN,
      },
      {
        ...baseHeaders,
        "user-agent": "com.google.android.youtube/20.10.38 (Linux; U; Android 15) gzip",
        referer: `${YT_ORIGIN}/`,
        origin: YT_ORIGIN,
        ...storedHeaders,
      },
    ];
    let lastResponse = null;
    for (const headers of strategies) {
      let response;
      try {
        response = await fetchImpl(remoteUrl, {
          method: "GET",
          headers,
          redirect: "error",
          signal: AbortSignal.timeout(25_000),
        });
      } catch (error) {
        if (error?.name === "TimeoutError" || error?.name === "AbortError")
          throw new MusicServiceError("El proxy de audio agotó el tiempo de espera", 504);
        throw new MusicServiceError("No se pudo abrir el audio resuelto", 502);
      }
      if (response.ok && response.body) return { response, resolution };
      lastResponse = response;
      try {
        await response.body?.cancel?.();
      } catch {}
      if (response.status !== 403) break;
    }
    return { response: lastResponse, resolution };
  };

  let attempt = await fetchStream(await resolveYouTubeAudio(videoId, { fetchImpl }));
  if (!attempt.response?.ok) {
    // A signed URL can be revoked early or bound to a stale connection. Resolve
    // once more before surfacing an error to the reader.
    try {
      attempt = await fetchStream(
        await resolveYouTubeAudio(videoId, {
          fetchImpl,
          forceRefresh: true,
          preferWeb: true,
        }),
      );
    } catch {
      attempt = await fetchStream(
        await resolveYouTubeAudio(videoId, { fetchImpl, forceRefresh: true }),
      );
    }
  }
  if (!attempt.response?.ok || !attempt.response.body)
    throw new MusicServiceError(
      attempt.response?.status === 403
        ? "Googlevideo rechazó el stream firmado incluso después de renovarlo"
        : `El host de audio respondió HTTP ${attempt.response?.status || 502}`,
      attempt.response?.status === 403 ? 502 : attempt.response?.status || 502,
      "audio_proxy",
    );
  return attempt;
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
  const video = options.find((item) => /video/i.test(item?.type || ""));
  const videoUri = actionUri(video?.actions?.[0]);
  const videoMatch = videoUri.match(/(?:[?&]v=|youtu\.be\/|\/)([A-Za-z0-9_-]{11})(?:[?&#/]|$)/);
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
    videoId: videoMatch?.[1] || null,
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
    const endpoint = `${SHAZAM_URL}/${randomUUID().toUpperCase()}/${randomUUID()}?sync=true&webv3=true&sampling=true&connected=&shazamapiversion=v3&sharehub=true&video=v3`;
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
  const baseHeaders = { accept: "application/json", "user-agent": "Hanami/5.8.65" };
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
  if (artist && !/^(youtube|unknown)$/i.test(artist)) url.searchParams.set("artist_name", artist);
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
    return Math.abs((Number(a?.duration) || 0) - duration) - Math.abs((Number(b?.duration) || 0) - duration);
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

async function unisonLyrics(videoId, title, artist, duration, fetchImpl) {
  const headers = { accept: "application/json", "user-agent": "Hanami/5.8.65" };
  if (/^[A-Za-z0-9_-]{11}$/.test(videoId || "")) {
    const url = new URL("https://unison.boidu.dev/lyrics");
    url.searchParams.set("v", videoId);
    const { data } = await requestJson(url, {
      fetchImpl,
      headers,
      timeout: 7_000,
      maxBytes: 1_000_000,
      allowStatuses: [404],
    });
    const direct = lyricsResult("Unison", nestedLyrics(data));
    if (direct) return direct;
  }
  const url = new URL("https://unison.boidu.dev/search");
  url.searchParams.set("title", title);
  url.searchParams.set("artist", artist);
  if (duration > 0) url.searchParams.set("duration", String(Math.round(duration)));
  const { data } = await requestJson(url, {
    fetchImpl,
    headers,
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
    headers: { accept: "application/json", "user-agent": "Hanami/5.8.65" },
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
        headers: { accept: "application/json", "user-agent": "Hanami/5.8.65" },
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
  { title: rawTitle, artist: rawArtist, duration: rawDuration = 0, videoId = "" },
  { fetchImpl = fetch } = {},
) {
  const title = cleanLyricsTitle(rawTitle);
  const artist = cleanLyricsArtist(rawArtist);
  const duration = Math.max(0, Math.min(24 * 60 * 60, Number(rawDuration) || 0));
  if (!title) throw new MusicServiceError("Falta el título de la canción", 400, "validation");
  if (title.length > 180 || artist.length > 180)
    throw new MusicServiceError("Los metadatos de la canción son demasiado largos", 400, "validation");
  const key = `lyrics:${hash(`${videoId}|${title.toLowerCase()}|${artist.toLowerCase()}|${Math.round(duration)}`)}`;
  const cached = cacheGet(key);
  if (cached) return { ...cached, cached: true };
  try {
    const primary = await lrclibLyrics(title, artist, duration, fetchImpl);
    if (primary) return cacheSet(key, primary, 12 * 60 * 60_000);
  } catch {}
  const fallbacks = await Promise.all(
    [
      () => unisonLyrics(videoId, title, artist, duration, fetchImpl),
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
  throw new MusicServiceError("No se encontraron letras externas", 404, "lyrics_not_found");
}

export function musicCapabilities() {
  return {
    youtube: {
      search: true,
      directAudioOnly: true,
      proxiedPlayback: true,
      signatureDecipher: false,
      drmBypass: false,
      configuredExtractor: !!compact(process.env.HANAMI_YOUTUBE_RESOLVER_URL),
    },
    recognition: { provider: "Shazam", microphoneRequired: true, unofficialEndpoint: true },
    lyrics: { providers: ["LRCLIB", "Unison", "Paxsenix", "BetterLyrics"] },
    equalizer: { runtime: "web-audio", bands: 10 },
  };
}
