import { equalizer, EQ_FREQUENCIES, EQ_PRESETS } from "./music-equalizer.js";
import { recognizeAmbient } from "./music-recognition.js";

const LYRICS_CACHE_KEY = "hanami-reader-lyrics-cache-v1";
const INVIDIOUS_STORAGE_KEY = "hanami-reader-invidious-v1";
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, Number(value) || 0));
const compact = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

function localDevelopmentPage() {
  const protocol = globalThis.location?.protocol;
  const hostname = globalThis.location?.hostname;
  return (
    protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(String(hostname || "").toLowerCase())
  );
}

export function normalizeInvidiousUrl(value, { allowInsecureLocal = localDevelopmentPage() } = {}) {
  const raw = compact(value);
  if (!raw) return "";
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Introduce la dirección completa de una instancia Invidious.");
  }
  if (parsed.username || parsed.password)
    throw new Error("La dirección Invidious no puede incluir credenciales.");
  const localHost = ["localhost", "127.0.0.1", "::1"].includes(
    parsed.hostname.toLowerCase(),
  );
  const secure = parsed.protocol === "https:";
  const localHttp = parsed.protocol === "http:" && localHost && allowInsecureLocal;
  if (!secure && !localHttp)
    throw new Error("La instancia Invidious debe usar HTTPS.");
  if (parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== "/"))
    throw new Error("Usa solo el origen de la instancia, por ejemplo https://invidious.example.");
  return parsed.origin;
}

function readInvidiousUrl() {
  if (typeof localStorage === "undefined") return "";
  try {
    const saved = JSON.parse(localStorage.getItem(INVIDIOUS_STORAGE_KEY) || "{}");
    return normalizeInvidiousUrl(saved?.url || "");
  } catch {
    return "";
  }
}

function persistInvidiousUrl(value) {
  if (typeof localStorage === "undefined") return;
  if (!value) {
    localStorage.removeItem(INVIDIOUS_STORAGE_KEY);
    return;
  }
  localStorage.setItem(
    INVIDIOUS_STORAGE_KEY,
    JSON.stringify({ url: value, savedAt: Date.now() }),
  );
}

let adapter = null;
const savedInvidiousUrl = readInvidiousUrl();
const ui = {
  tab: "youtube",
  query: "",
  results: [],
  searchBusy: false,
  searchStatus: "Busca canciones, artistas o álbumes sin pegar enlaces.",
  adding: "",
  recognizing: false,
  recognitionStatus: "",
  recognized: null,
  trackKey: "",
  lyrics: null,
  lyricsBusy: false,
  lyricsStatus: "",
  activeLyric: -1,
  eqStatus: "",
  invidiousUrl: savedInvidiousUrl,
  invidiousDraft: savedInvidiousUrl,
  invidiousOpen: false,
  invidiousStatus: savedInvidiousUrl
    ? "Configurada. Hanami la consultará y retransmitirá el audio solo si falla el resolvedor principal."
    : "Desactivado. Hanami no selecciona ni rota instancias públicas automáticamente.",
};

function readLyricsCache() {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(LYRICS_CACHE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

let lyricsCache = readLyricsCache();

function saveLyricsCache(key, value) {
  if (!key || !value || typeof localStorage === "undefined") return;
  lyricsCache[key] = { ...value, savedAt: Date.now() };
  const entries = Object.entries(lyricsCache)
    .sort((a, b) => Number(b[1]?.savedAt) - Number(a[1]?.savedAt))
    .slice(0, 18);
  lyricsCache = Object.fromEntries(entries);
  try {
    localStorage.setItem(LYRICS_CACHE_KEY, JSON.stringify(lyricsCache));
  } catch {}
}

function trackKey(track) {
  if (!track) return "";
  return compact(`${track.provider || "local"}|${track.videoId || ""}|${track.title}|${track.artist}`).toLocaleLowerCase("es");
}

function secondsFromTag(minutes, seconds) {
  return Number(minutes) * 60 + Number(String(seconds).replace(",", "."));
}

export function parseLrc(rawLyrics) {
  const source = String(rawLyrics || "").replace(/\r/g, "").trim();
  if (!source) return { synced: false, lines: [] };
  const lines = [];
  for (const rawLine of source.split("\n")) {
    const tags = [...rawLine.matchAll(/\[(\d{1,3}):(\d{2}(?:[.,:]\d{1,3})?)\]/g)];
    const metadata = /^\[(?:ar|al|ti|au|by|offset|re|ve|length):/i.test(rawLine.trim());
    if (metadata) continue;
    let text = rawLine
      .replace(/\[(\d{1,3}):(\d{2}(?:[.,:]\d{1,3})?)\]/g, "")
      .replace(/<\d{1,3}:\d{2}(?:[.,:]\d{1,3})?>/g, "")
      .trim();
    if (!text && tags.length) text = "♪";
    if (!text) continue;
    if (tags.length) {
      for (const tag of tags)
        lines.push({ time: secondsFromTag(tag[1], tag[2].replace(":", ".")), text });
    } else lines.push({ time: null, text });
  }
  const synced = lines.some((line) => Number.isFinite(line.time));
  if (synced)
    lines.sort((a, b) =>
      Number.isFinite(a.time) && Number.isFinite(b.time)
        ? a.time - b.time
        : Number.isFinite(a.time)
          ? -1
          : 1,
    );
  return { synced, lines };
}

async function apiJsonWith(fetchImpl, url, options) {
  const response = await fetchImpl(url, options);
  const data = await response.json().catch(() => ({}));
  if (response.status === 404 && String(url).startsWith("/api/music/"))
    throw new Error(
      "La API musical no está activa. Reinicia esta versión con «npm run dev» o despliega en Vercel; un servidor estático no ejecuta /api.",
    );
  if (!response.ok) {
    const error = new Error(data.error || `El servicio respondió HTTP ${response.status}`);
    error.status = response.status;
    error.kind = data.kind || "";
    throw error;
  }
  return data;
}

async function apiJson(url, options) {
  return apiJsonWith(fetch, url, options);
}

export async function resolveInvidiousAudio(
  videoId,
  { instanceUrl, fetchImpl = fetch } = {},
) {
  const id = compact(videoId);
  if (!/^[A-Za-z0-9_-]{11}$/.test(id))
    throw new Error("El identificador de YouTube no es válido.");
  const base = normalizeInvidiousUrl(instanceUrl);
  if (!base) throw new Error("Configura primero una instancia Invidious.");
  return apiJsonWith(fetchImpl, "/api/music/invidious/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ videoId: id, instanceUrl: base }),
  });
}

function currentTrack() {
  return adapter?.getCurrentTrack?.() || null;
}

function hydrateLyrics(track = currentTrack()) {
  const key = trackKey(track);
  ui.trackKey = key;
  ui.activeLyric = -1;
  const cached = key && lyricsCache[key];
  if (cached?.lyrics) {
    const parsed = parseLrc(cached.lyrics);
    ui.lyrics = { ...cached, ...parsed };
    ui.lyricsStatus = `Guardada de ${cached.provider || "un proveedor externo"}.`;
  } else {
    ui.lyrics = null;
    ui.lyricsStatus = track ? "Busca letras para la canción actual." : "Selecciona una canción primero.";
  }
}

function render() {
  adapter?.render?.();
}

function youtubeResultHtml(result) {
  const busy = ui.adding === result.videoId;
  const artwork = /^https:\/\//i.test(result.artwork || "") ? result.artwork : "";
  return `<article class="reader-music-online-result" data-music-online-result="${esc(result.videoId)}">
    ${artwork ? `<img src="${esc(artwork)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<i aria-hidden="true">♪</i>'}
    <span><b>${esc(result.title)}</b><small>${esc(result.artist)}${result.album ? ` · ${esc(result.album)}` : ""}</small></span>
    <time>${esc(result.durationText || "")}</time>
    <button data-music-youtube-add="${esc(result.videoId)}" ${busy ? "disabled" : ""}>${busy ? "Resolviendo…" : "＋ Reproducir"}</button>
  </article>`;
}

function recognizedHtml() {
  const track = ui.recognized?.track;
  if (!track) return "";
  return `<article class="reader-music-recognized">
    ${/^https:\/\//i.test(track.artwork || "") ? `<img src="${esc(track.artwork)}" alt="" referrerpolicy="no-referrer">` : '<i aria-hidden="true">◎</i>'}
    <span><small>SHAZAM RECONOCIÓ</small><b>${esc(track.title)}</b><em>${esc(track.artist)}${track.album ? ` · ${esc(track.album)}` : ""}</em></span>
    <button data-music-recognized-add>${track.videoId ? "Buscar y reproducir" : "Buscar en YouTube Music"}</button>
  </article>`;
}

function invidiousConfigHtml() {
  const configured = !!ui.invidiousUrl;
  let host = "";
  try {
    host = new URL(ui.invidiousUrl).hostname;
  } catch {}
  return `<details class="reader-music-invidious" ${ui.invidiousOpen ? "open" : ""}>
    <summary>
      <span><b>Fallback Invidious</b><small>Solo después de que falle el best effort de Hanami</small></span>
      <em class="${configured ? "active" : ""}">${configured ? esc(host || "ACTIVO") : "DESACTIVADO"}</em>
    </summary>
    <div>
      <p>Si se activa el fallback, Hanami consulta esta instancia y retransmite el audio al navegador. Esto evita el CORS del navegador, pero consume tráfico del despliegue. La instancia verá la IP del servidor de Hanami y el ID del vídeo.</p>
      <label>
        <span>Origen HTTPS autorizado</span>
        <input data-music-invidious-url type="url" value="${esc(ui.invidiousDraft)}" placeholder="https://invidious.example" autocomplete="off" autocapitalize="none" spellcheck="false">
      </label>
      <button data-music-invidious-save>Guardar fallback</button>
      <small data-music-invidious-status aria-live="polite">${esc(ui.invidiousStatus)}</small>
    </div>
  </details>`;
}

function youtubePanelHtml() {
  return `<div class="reader-music-service-panel ${ui.tab === "youtube" ? "active" : ""}" data-music-service-panel="youtube">
    <div class="reader-music-online-search">
      <input data-music-youtube-query type="search" value="${esc(ui.query)}" placeholder="Canción, artista o álbum" aria-label="Buscar en YouTube Music">
      <button data-music-youtube-search ${ui.searchBusy ? "disabled" : ""}>${ui.searchBusy ? "Buscando…" : "Buscar"}</button>
    </div>
    <button class="reader-music-recognize" data-music-recognize ${ui.recognizing ? "disabled" : ""}>${ui.recognizing ? "◎ Escuchando…" : "◎ Reconocer lo que está sonando"}</button>
    ${recognizedHtml()}
    <p class="reader-music-service-status" data-music-search-status aria-live="polite">${esc(ui.recognitionStatus || ui.searchStatus)}</p>
    ${invidiousConfigHtml()}
    <div class="reader-music-online-results">${
      ui.results.length
        ? ui.results.map(youtubeResultHtml).join("")
        : `<div class="reader-music-service-empty"><b>${ui.searchBusy ? "Consultando YouTube Music…" : "Busca música para tu lectura"}</b><span>Hanami encuentra canciones mediante InnerTube y resuelve el audio al reproducir.</span></div>`
    }</div>
  </div>`;
}

function lyricsLinesHtml() {
  if (!ui.lyrics?.lines?.length)
    return `<div class="reader-music-service-empty"><b>Sin letras cargadas</b><span>${esc(ui.lyricsStatus)}</span></div>`;
  return `<div class="reader-music-lyrics-scroll" data-music-lyrics-scroll>${ui.lyrics.lines
    .map(
      (line, index) =>
        `<p data-music-lyric="${index}"${Number.isFinite(line.time) ? ` data-music-lyric-time="${line.time}"` : ""}>${esc(line.text)}</p>`,
    )
    .join("")}</div>`;
}

function lyricsPanelHtml(track) {
  return `<div class="reader-music-service-panel ${ui.tab === "lyrics" ? "active" : ""}" data-music-service-panel="lyrics">
    <header class="reader-music-lyrics-head"><span><small>CANCIÓN ACTUAL</small><b>${esc(track?.title || "Ninguna canción")}</b><em>${esc(track?.artist || "Selecciona música")}</em></span><button data-music-load-lyrics ${!track || ui.lyricsBusy ? "disabled" : ""}>${ui.lyricsBusy ? "Buscando…" : ui.lyrics ? "Actualizar" : "Buscar letras"}</button></header>
    ${ui.lyrics ? `<p class="reader-music-lyrics-source">${ui.lyrics.synced ? "Sincronizadas" : "Texto"} · ${esc(ui.lyrics.provider || "Proveedor externo")}</p>` : ""}
    ${lyricsLinesHtml()}
  </div>`;
}

function frequencyLabel(value) {
  return value >= 1000 ? `${value / 1000}k` : String(value);
}

function equalizerPanelHtml() {
  const state = equalizer.snapshot();
  const presetOptions = Object.entries(EQ_PRESETS)
    .map(([key, preset]) => `<option value="${key}" ${state.preset === key ? "selected" : ""}>${esc(preset.label)}</option>`)
    .join("");
  return `<div class="reader-music-service-panel ${ui.tab === "effects" ? "active" : ""}" data-music-service-panel="effects">
    <div class="reader-music-eq-top">
      <label><span><b>Ecualizador</b><small>Cadena Web Audio de baja latencia</small></span><input data-music-eq-enabled type="checkbox" ${state.enabled ? "checked" : ""}></label>
      <label><span>Preajuste</span><select data-music-eq-preset>${state.preset === "custom" ? '<option value="custom" selected disabled>Personalizado</option>' : ""}${presetOptions}</select></label>
    </div>
    <div class="reader-music-eq-bands" aria-label="Ecualizador de diez bandas">${EQ_FREQUENCIES.map(
      (frequency, index) => `<label><b>${frequencyLabel(frequency)}</b><input data-music-eq-band="${index}" type="range" min="-12" max="12" step="0.5" value="${state.bands[index]}" ${state.enabled ? "" : "disabled"}><small data-music-eq-band-value="${index}">${Number(state.bands[index]).toFixed(1)} dB</small></label>`,
    ).join("")}</div>
    <div class="reader-music-eq-effects">
      <label><span>Refuerzo de graves <b data-music-eq-bass-value>${state.bass.toFixed(1)} dB</b></span><input data-music-eq-bass type="range" min="0" max="12" step="0.5" value="${state.bass}" ${state.enabled ? "" : "disabled"}></label>
      <label><span>Amplitud estéreo <b data-music-eq-width-value>${Math.round(state.width * 100)}%</b></span><input data-music-eq-width type="range" min="0" max="1" step="0.05" value="${state.width}" ${state.enabled ? "" : "disabled"}></label>
      <label><span>Ganancia de salida <b data-music-eq-gain-value>${state.gain.toFixed(1)} dB</b></span><input data-music-eq-gain type="range" min="-6" max="15" step="0.5" value="${state.gain}" ${state.enabled ? "" : "disabled"}></label>
    </div>
    <p class="reader-music-service-status">${esc(ui.eqStatus || "Los efectos equivalen a Equalizer, BassBoost, Virtualizer y LoudnessEnhancer. El audio remoto debe permitir CORS.")}</p>
  </div>`;
}

function panelHtml({ track } = {}) {
  return `<section class="reader-music-services" data-music-services>
    <header><span><small>SERVICIOS EXTERNOS</small><b>Buscar, reconocer y ajustar</b></span><em>HANAMI · v134.1</em></header>
    <nav aria-label="Servicios de música">
      <button data-music-service-tab="youtube" class="${ui.tab === "youtube" ? "active" : ""}">Buscar</button>
      <button data-music-service-tab="lyrics" class="${ui.tab === "lyrics" ? "active" : ""}">Letras</button>
      <button data-music-service-tab="effects" class="${ui.tab === "effects" ? "active" : ""}">Ecualizador</button>
    </nav>
    ${youtubePanelHtml()}
    ${lyricsPanelHtml(track)}
    ${equalizerPanelHtml()}
  </section>`;
}

async function searchYouTube(query = ui.query) {
  const value = compact(query);
  if (!value) {
    ui.searchStatus = "Escribe una canción, artista o álbum.";
    render();
    return;
  }
  ui.query = value;
  ui.searchBusy = true;
  ui.recognitionStatus = "";
  ui.searchStatus = "Buscando en YouTube Music…";
  render();
  try {
    const params = new URLSearchParams({ q: value });
    const data = await apiJson(`/api/music/youtube/search?${params}`);
    ui.results = Array.isArray(data.results) ? data.results : [];
    ui.searchStatus = ui.results.length
      ? `${ui.results.length} resultado${ui.results.length === 1 ? "" : "s"}. El audio se resuelve al reproducir.`
      : "No se encontraron canciones para esta búsqueda.";
  } catch (error) {
    ui.results = [];
    ui.searchStatus = error?.message || "No se pudo buscar en YouTube Music.";
  } finally {
    ui.searchBusy = false;
    render();
  }
}

async function resolveYouTube(videoId) {
  return apiJson("/api/music/youtube/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ videoId }),
  });
}

async function resolveYouTubeWithFallback(videoId, { onFallback } = {}) {
  let primaryError;
  try {
    return await resolveYouTube(videoId);
  } catch (error) {
    primaryError = error;
  }
  if (primaryError?.status === 400 || primaryError?.kind === "validation")
    throw primaryError;
  if (!ui.invidiousUrl) throw primaryError;
  onFallback?.(ui.invidiousUrl, primaryError);
  try {
    return await resolveInvidiousAudio(videoId, { instanceUrl: ui.invidiousUrl });
  } catch (fallbackError) {
    let host = "Invidious";
    try {
      host = new URL(ui.invidiousUrl).hostname;
    } catch {}
    const error = new Error(
      `El resolvedor de Hanami falló y ${host} tampoco pudo entregar el audio: ${fallbackError?.message || "error desconocido"}`,
    );
    error.kind = "invidious_fallback";
    error.primaryError = primaryError;
    error.fallbackError = fallbackError;
    throw error;
  }
}

async function saveInvidiousFallback() {
  const input = document.querySelector("[data-music-invidious-url]");
  const raw = compact(input?.value ?? ui.invidiousDraft);
  ui.invidiousDraft = raw;
  if (!raw) {
    ui.invidiousUrl = "";
    ui.invidiousOpen = true;
    persistInvidiousUrl("");
    ui.invidiousStatus =
      "Fallback desactivado. Hanami no consultará ninguna instancia Invidious.";
    render();
    return;
  }
  let normalized;
  try {
    normalized = normalizeInvidiousUrl(raw);
  } catch (error) {
    ui.invidiousStatus = error?.message || "La dirección Invidious no es válida.";
    render();
    return;
  }
  ui.invidiousUrl = normalized;
  ui.invidiousDraft = normalized;
  ui.invidiousOpen = true;
  persistInvidiousUrl(normalized);
  ui.invidiousStatus =
    "Instancia guardada. Hanami comprobará su API y retransmitirá el audio cuando haga falta.";
  render();
}

async function addYouTubeResult(result) {
  if (!result?.videoId || ui.adding) return;
  ui.adding = result.videoId;
  ui.searchStatus = `Resolviendo ${result.title || "la canción"}…`;
  render();
  try {
    const resolved = await resolveYouTubeWithFallback(result.videoId, {
      onFallback(instanceUrl) {
        let host = "la instancia configurada";
        try {
          host = new URL(instanceUrl).hostname;
        } catch {}
        ui.searchStatus = `El best effort de Hanami falló. Probando ${host}…`;
        render();
      },
    });
    const remote = await adapter.addRemoteTrack(resolved.stream.url, {
      title: result.title || resolved.track?.title || "YouTube Music",
      artist: result.artist || resolved.track?.artist || "YouTube Music",
      album: result.album || "",
      duration: result.duration || resolved.track?.duration || 0,
      artwork: result.artwork || resolved.track?.artwork || "",
      provider: "youtube",
      videoId: result.videoId,
      expiresAt: resolved.expiresAt,
      mimeType: resolved.stream.mimeType,
      playbackProvider: resolved.provider || "",
      invidiousOrigin: resolved.invidiousOrigin || "",
    });
    let via = "";
    if (resolved.provider === "youtube-invidious-relay") {
      try {
        via = ` vía ${new URL(resolved.invidiousOrigin).hostname}`;
      } catch {}
    }
    ui.searchStatus = `${remote.title} añadida y lista para reproducir${via}.`;
    adapter.setStatus?.(`${remote.title} añadida desde YouTube Music${via}.`);
    await adapter.playTrack(remote.id);
  } catch (error) {
    ui.searchStatus = error?.message || "No se pudo resolver el audio de esta canción.";
  } finally {
    ui.adding = "";
    render();
  }
}

async function recognizeMusic() {
  if (ui.recognizing) return;
  ui.recognizing = true;
  ui.recognized = null;
  ui.recognitionStatus = "Solicitando permiso de micrófono…";
  render();
  try {
    const result = await recognizeAmbient({
      onProgress(progress, stage) {
        ui.recognitionStatus = stage || `Escuchando… ${Math.round(clamp(progress, 0, 1) * 100)}%`;
        const node = document.querySelector("[data-music-search-status]");
        if (node) node.textContent = ui.recognitionStatus;
      },
    });
    ui.recognized = result;
    ui.recognitionStatus = `${result.track.title} · ${result.track.artist}`;
  } catch (error) {
    ui.recognitionStatus = error?.message || "No se pudo reconocer la música.";
  } finally {
    ui.recognizing = false;
    render();
  }
}

async function findRecognizedTrack() {
  const track = ui.recognized?.track;
  if (!track) return;
  if (track.videoId) {
    await addYouTubeResult({
      videoId: track.videoId,
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork: track.artwork,
    });
    return;
  }
  ui.query = compact(`${track.title} ${track.artist}`);
  await searchYouTube(ui.query);
}

async function loadLyrics() {
  const track = currentTrack();
  if (!track || ui.lyricsBusy) return;
  ui.lyricsBusy = true;
  ui.lyricsStatus = "Consultando proveedores externos…";
  render();
  try {
    const params = new URLSearchParams({
      title: track.title || "",
      artist: track.artist || "",
      duration: String(adapter.getDuration?.() || track.duration || 0),
      videoId: track.videoId || "",
    });
    const result = await apiJson(`/api/music/lyrics?${params}`);
    const parsed = parseLrc(result.lyrics);
    ui.lyrics = { ...result, ...parsed };
    ui.lyricsStatus = `${parsed.synced ? "Letras sincronizadas" : "Letras"} de ${result.provider}.`;
    saveLyricsCache(trackKey(track), result);
    ui.activeLyric = -1;
  } catch (error) {
    ui.lyrics = null;
    ui.lyricsStatus = error?.message || "No se encontraron letras.";
  } finally {
    ui.lyricsBusy = false;
    render();
  }
}

async function toggleEqualizer(enabled) {
  ui.eqStatus = enabled ? "Activando cadena de efectos…" : "Desactivando efectos…";
  try {
    await equalizer.setEnabled(enabled);
    if (currentTrack()) await adapter.reloadCurrent?.();
    ui.eqStatus = enabled
      ? "Ecualizador activo. Los cambios se aplican también durante el crossfade."
      : "Ecualizador desactivado; la cadena permanece en bypass.";
  } catch (error) {
    await equalizer.setEnabled(false).catch(() => {});
    ui.eqStatus = error?.message || "No se pudo activar el ecualizador.";
  }
  render();
}

function connect(nextAdapter) {
  adapter = nextAdapter;
  equalizer.connect(adapter?.getAudioElements?.() || []);
  hydrateLyrics();
}

function trackPatchFromResolution(resolved, track = {}) {
  return {
    url: new URL(resolved.stream.url, location.href).href,
    expiresAt: resolved.expiresAt,
    mimeType: resolved.stream.mimeType,
    duration: track.duration || resolved.track?.duration || 0,
    artwork: track.artwork || resolved.track?.artwork || "",
    playbackProvider: resolved.provider || "",
    invidiousOrigin: resolved.invidiousOrigin || "",
  };
}

function isInvidiousRelayUrl(value, videoId) {
  try {
    const url = new URL(value, location.href);
    return (
      url.origin === location.origin &&
      url.pathname === `/api/music/invidious/audio/${encodeURIComponent(videoId)}` &&
      !!url.searchParams.get("instance")
    );
  } catch {
    return false;
  }
}

async function beforeLoad(track) {
  if (equalizer.state.enabled) await equalizer.resume();
  if (track?.provider !== "youtube" || !track.videoId) return null;
  const proxyUrl = new URL(
    `/api/music/youtube/audio/${encodeURIComponent(track.videoId)}`,
    location.href,
  ).href;
  if (Number(track.expiresAt) > Date.now() + 90_000) {
    if (
      track.playbackProvider === "youtube-invidious-relay" &&
      isInvidiousRelayUrl(track.url, track.videoId)
    )
      return null;
    // Migrates v129/v130 records and v134 browser-direct Invidious records.
    if (track.playbackProvider !== "youtube-invidious-relay")
      return track.url === proxyUrl
        ? null
        : {
            url: proxyUrl,
            playbackProvider: track.playbackProvider || "youtube-innertube",
            invidiousOrigin: "",
          };
  }
  const resolved = await resolveYouTubeWithFallback(track.videoId, {
    onFallback(instanceUrl) {
      let host = "Invidious";
      try {
        host = new URL(instanceUrl).hostname;
      } catch {}
      adapter?.setStatus?.(`Hanami no pudo renovar el audio. Probando ${host}…`);
    },
  });
  return trackPatchFromResolution(resolved, track);
}

async function recoverLoadError(track, error) {
  if (
    track?.provider !== "youtube" ||
    !track.videoId ||
    !ui.invidiousUrl ||
    track.playbackProvider === "youtube-invidious-relay" ||
    ["AbortError", "NotAllowedError"].includes(error?.name)
  )
    return null;
  let host = "Invidious";
  try {
    host = new URL(ui.invidiousUrl).hostname;
  } catch {}
  adapter?.setStatus?.(`El proxy de Hanami rechazó el audio. Probando ${host}…`);
  const resolved = await resolveInvidiousAudio(track.videoId, {
    instanceUrl: ui.invidiousUrl,
  });
  return trackPatchFromResolution(resolved, track);
}

function audioCrossOrigin(track) {
  return track?.provider === "youtube" || equalizer.attached ? "anonymous" : "";
}

function onPlayerChange({ track }) {
  const nextKey = trackKey(track);
  if (nextKey === ui.trackKey) return;
  hydrateLyrics(track);
  if (document.querySelector("[data-music-services]")) render();
}

function syncUi({ track, position }) {
  if (trackKey(track) !== ui.trackKey) hydrateLyrics(track);
  if (!ui.lyrics?.synced || !ui.lyrics.lines.length) return;
  let active = -1;
  for (let index = 0; index < ui.lyrics.lines.length; index++) {
    const time = ui.lyrics.lines[index].time;
    if (!Number.isFinite(time)) continue;
    if (time <= position + 0.12) active = index;
    else break;
  }
  if (active === ui.activeLyric) return;
  ui.activeLyric = active;
  document.querySelectorAll("[data-music-lyric]").forEach((node) => {
    node.classList.toggle("active", Number(node.dataset.musicLyric) === active);
  });
  const node = document.querySelector(`[data-music-lyric="${active}"]`);
  const scroller = node?.closest("[data-music-lyrics-scroll]");
  if (node && scroller && ui.tab === "lyrics")
    scroller.scrollTo({
      top: node.offsetTop - scroller.clientHeight / 2 + node.clientHeight / 2,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
}

function snapshot() {
  return {
    tab: ui.tab,
    query: ui.query,
    resultCount: ui.results.length,
    recognized: ui.recognized?.track || null,
    lyricsProvider: ui.lyrics?.provider || null,
    lyricsSynced: !!ui.lyrics?.synced,
    invidious: {
      configured: !!ui.invidiousUrl,
      origin: ui.invidiousUrl,
      status: ui.invidiousStatus,
    },
    equalizer: equalizer.snapshot(),
  };
}

const service = {
  connect,
  panelHtml,
  beforeLoad,
  recoverLoadError,
  audioCrossOrigin,
  onPlayerChange,
  syncUi,
  snapshot,
};

if (typeof document !== "undefined") {
  document.addEventListener(
    "toggle",
    (event) => {
      if (event.target.matches?.(".reader-music-invidious"))
        ui.invidiousOpen = event.target.open;
    },
    true,
  );

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (target.matches("[data-music-youtube-query]")) ui.query = target.value;
    if (target.matches("[data-music-invidious-url]")) ui.invidiousDraft = target.value;
    if (target.matches("[data-music-eq-band]")) {
      const index = Number(target.dataset.musicEqBand);
      equalizer.setBand(index, target.value);
      const label = document.querySelector(`[data-music-eq-band-value="${index}"]`);
      if (label) label.textContent = `${Number(target.value).toFixed(1)} dB`;
    }
    if (target.matches("[data-music-eq-bass]")) {
      equalizer.setBass(target.value);
      const label = document.querySelector("[data-music-eq-bass-value]");
      if (label) label.textContent = `${Number(target.value).toFixed(1)} dB`;
    }
    if (target.matches("[data-music-eq-width]")) {
      equalizer.setWidth(target.value);
      const label = document.querySelector("[data-music-eq-width-value]");
      if (label) label.textContent = `${Math.round(Number(target.value) * 100)}%`;
    }
    if (target.matches("[data-music-eq-gain]")) {
      equalizer.setGain(target.value);
      const label = document.querySelector("[data-music-eq-gain-value]");
      if (label) label.textContent = `${Number(target.value).toFixed(1)} dB`;
    }
  });

  document.addEventListener("change", async (event) => {
    const target = event.target;
    if (target.matches("[data-music-eq-enabled]")) await toggleEqualizer(target.checked);
    if (target.matches("[data-music-eq-preset]") && target.value !== "custom") {
      equalizer.setPreset(target.value);
      render();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.matches("[data-music-youtube-query]")) {
      event.preventDefault();
      void searchYouTube(event.target.value);
    }
  });

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.musicServiceTab) {
      ui.tab = button.dataset.musicServiceTab;
      render();
      return;
    }
    if (button.hasAttribute("data-music-youtube-search")) {
      await searchYouTube(document.querySelector("[data-music-youtube-query]")?.value || ui.query);
      return;
    }
    if (button.hasAttribute("data-music-invidious-save")) {
      await saveInvidiousFallback();
      return;
    }
    if (button.dataset.musicYoutubeAdd) {
      const result = ui.results.find((item) => item.videoId === button.dataset.musicYoutubeAdd);
      if (result) await addYouTubeResult(result);
      return;
    }
    if (button.hasAttribute("data-music-recognize")) {
      await recognizeMusic();
      return;
    }
    if (button.hasAttribute("data-music-recognized-add")) {
      await findRecognizedTrack();
      return;
    }
    if (button.hasAttribute("data-music-load-lyrics")) await loadLyrics();
    if (equalizer.state.enabled && button.closest("[data-music-root]"))
      void equalizer.resume().catch(() => {});
  });
}

if (typeof window !== "undefined") {
  window.HanamiReaderMusicServices = service;
  const register = () => window.HanamiReaderMusic?.registerExternalServices?.(service);
  if (window.HanamiReaderMusic) register();
  else addEventListener("DOMContentLoaded", register, { once: true });
}
