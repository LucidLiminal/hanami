import { equalizer, EQ_FREQUENCIES, EQ_PRESETS } from "./music-equalizer.js";
import { recognizeAmbient } from "./music-recognition.js";

const LYRICS_CACHE_KEY = "hanami-reader-lyrics-cache-v1";
const SOUNDCLOUD_WIDGET_API = "https://w.soundcloud.com/player/api.js";
const SOUNDCLOUD_WIDGET_ORIGIN = "https://w.soundcloud.com";
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, Number(value) || 0));
const compact = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

let adapter = null;
const ui = {
  tab: "soundcloud",
  query: "",
  results: [],
  searchBusy: false,
  searchConfigured: null,
  searchStatus:
    "Busca canciones en SoundCloud o pega el enlace completo de una pista.",
  adding: "",
  playbackError: "",
  playbackErrorKey: "",
  recognizing: false,
  recognitionStatus: "",
  recognized: null,
  trackKey: "",
  lyrics: null,
  lyricsBusy: false,
  lyricsStatus: "",
  activeLyric: -1,
  eqStatus: "",
};

const widgetState = {
  apiPromise: null,
  frame: null,
  widget: null,
  ready: false,
  paused: true,
  position: 0,
  duration: 0,
  permalinkUrl: "",
  token: 0,
  pending: null,
  playProbeTimer: 0,
  playProbeToken: 0,
  playProbeProgress: false,
  pauseRequested: false,
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
  return compact(
    `${track.provider || "local"}|${track.soundcloudUrn || track.permalinkUrl || ""}|${track.title}|${track.artist}`,
  ).toLocaleLowerCase("es");
}

function secondsFromTag(minutes, seconds) {
  return Number(minutes) * 60 + Number(String(seconds).replace(",", "."));
}

export function parseLrc(rawLyrics) {
  const source = String(rawLyrics || "").replace(/\r/g, "").trim();
  if (!source) return { synced: false, lines: [] };
  const lines = [];
  for (const rawLine of source.split("\n")) {
    const tags = [
      ...rawLine.matchAll(/\[(\d{1,3}):(\d{2}(?:[.,:]\d{1,3})?)\]/g),
    ];
    const metadata = /^\[(?:ar|al|ti|au|by|offset|re|ve|length):/i.test(
      rawLine.trim(),
    );
    if (metadata) continue;
    let text = rawLine
      .replace(/\[(\d{1,3}):(\d{2}(?:[.,:]\d{1,3})?)\]/g, "")
      .replace(/<\d{1,3}:\d{2}(?:[.,:]\d{1,3})?>/g, "")
      .trim();
    if (!text && tags.length) text = "♪";
    if (!text) continue;
    if (tags.length) {
      for (const tag of tags)
        lines.push({
          time: secondsFromTag(tag[1], tag[2].replace(":", ".")),
          text,
        });
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
    const error = new Error(
      data.error || `El servicio respondió HTTP ${response.status}`,
    );
    error.status = response.status;
    error.kind = data.kind || "";
    throw error;
  }
  return data;
}

async function apiJson(url, options) {
  return apiJsonWith(fetch, url, options);
}

export function buildSoundCloudWidgetUrl(
  permalinkUrl,
  { autoplay = false } = {},
) {
  const url = new URL("/player/", SOUNDCLOUD_WIDGET_ORIGIN);
  url.searchParams.set("url", String(permalinkUrl || ""));
  url.searchParams.set("auto_play", autoplay ? "true" : "false");
  url.searchParams.set("show_artwork", "false");
  url.searchParams.set("show_comments", "false");
  url.searchParams.set("show_playcount", "false");
  url.searchParams.set("show_user", "false");
  url.searchParams.set("buying", "false");
  url.searchParams.set("sharing", "false");
  url.searchParams.set("download", "false");
  url.searchParams.set("visual", "false");
  return url.href;
}

function loadSoundCloudWidgetApi() {
  if (globalThis.SC?.Widget) return Promise.resolve(globalThis.SC.Widget);
  if (widgetState.apiPromise) return widgetState.apiPromise;
  widgetState.apiPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(
      `script[src="${SOUNDCLOUD_WIDGET_API}"]`,
    );
    if (existing) existing.remove();
    const script = document.createElement("script");
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      script.removeEventListener("load", ready);
      script.removeEventListener("error", failed);
    };
    const fail = (message) => {
      if (settled) return;
      settled = true;
      cleanup();
      script.remove();
      widgetState.apiPromise = null;
      reject(new Error(message));
    };
    const ready = () => {
      if (!globalThis.SC?.Widget) {
        fail("SoundCloud respondió, pero su reproductor no estaba disponible.");
        return;
      }
      if (settled) return;
      settled = true;
      cleanup();
      resolve(globalThis.SC.Widget);
    };
    const failed = () =>
      fail(
        "No se pudo cargar el reproductor oficial de SoundCloud. Comprueba que el navegador no esté bloqueando w.soundcloud.com.",
      );
    const timer = setTimeout(
      () =>
        fail(
          "SoundCloud no respondió al cargar su reproductor. Puedes volver a intentarlo.",
        ),
      12_000,
    );
    script.addEventListener("load", ready, { once: true });
    script.addEventListener("error", failed, { once: true });
    script.src = SOUNDCLOUD_WIDGET_API;
    script.async = true;
    document.head.append(script);
  });
  return widgetState.apiPromise;
}

function cancelWidgetPending(result = false) {
  const pending = widgetState.pending;
  if (!pending) return;
  clearTimeout(pending.timer);
  widgetState.pending = null;
  pending.resolve(result);
}

function widgetUpdate(update) {
  adapter?.updateExternalPlayback?.({
    permalinkUrl: widgetState.permalinkUrl,
    position: widgetState.position,
    duration: widgetState.duration,
    playing: !widgetState.paused,
    ...update,
  });
}

function clearWidgetPlayProbe() {
  clearTimeout(widgetState.playProbeTimer);
  widgetState.playProbeTimer = 0;
  widgetState.playProbeProgress = false;
}

function armWidgetPlayProbe() {
  clearWidgetPlayProbe();
  const token = ++widgetState.playProbeToken;
  const initialPosition = widgetState.position;
  widgetState.pauseRequested = false;
  widgetState.playProbeTimer = setTimeout(() => {
    if (
      token !== widgetState.playProbeToken ||
      widgetState.playProbeProgress ||
      widgetState.pauseRequested
    )
      return;
    widgetState.widget?.getPosition?.((milliseconds) => {
      if (
        token !== widgetState.playProbeToken ||
        widgetState.playProbeProgress ||
        widgetState.pauseRequested
      )
        return;
      const position = Math.max(0, Number(milliseconds) || 0) / 1_000;
      if (position > initialPosition + 0.2) {
        widgetState.position = position;
        clearWidgetPlayProbe();
        return;
      }
      clearWidgetPlayProbe();
      widgetState.paused = true;
      const message =
        "SoundCloud no entregó audio para esta pista. Prueba otra versión o ábrela en SoundCloud.";
      ui.playbackError = message;
      ui.playbackErrorKey = resultKey(currentTrack());
      widgetUpdate({
        reason: "error",
        playing: false,
        error: message,
      });
      render();
    });
  }, 8_000);
}

function bindWidgetEvents(widget) {
  const events = globalThis.SC.Widget.Events;
  widget.bind(events.READY, () => {
    const pending = widgetState.pending;
    widgetState.ready = true;
    widget.setVolume(
      Math.round(clamp(pending?.volume ?? adapter?.getVolume?.() ?? 0.82, 0, 1) * 100),
    );
    widget.getDuration((milliseconds) => {
      widgetState.duration = Math.max(0, Number(milliseconds) || 0) / 1_000;
      widgetUpdate({ reason: "ready" });
    });
    const position = Math.max(0, Number(pending?.position) || 0);
    if (position) {
      widget.seekTo(position * 1_000);
      widgetState.position = position;
    }
    if (pending?.autoplay) {
      widgetState.paused = false;
      armWidgetPlayProbe();
      widget.play();
    } else widgetState.paused = true;
    if (pending) {
      clearTimeout(pending.timer);
      widgetState.pending = null;
      pending.resolve({
        ready: true,
        playing: !!pending.autoplay,
        duration: widgetState.duration,
      });
    }
  });
  widget.bind(events.PLAY, () => {
    widgetState.paused = false;
    widgetUpdate({ reason: "play", playing: true });
  });
  widget.bind(events.PAUSE, () => {
    widgetState.paused = true;
    if (widgetState.pauseRequested) clearWidgetPlayProbe();
    widgetUpdate({ reason: "pause", playing: false });
  });
  widget.bind(events.PLAY_PROGRESS, (progress = {}) => {
    widgetState.playProbeProgress = true;
    clearWidgetPlayProbe();
    ui.playbackError = "";
    ui.playbackErrorKey = "";
    widgetState.position = Math.max(0, Number(progress.currentPosition) || 0) / 1_000;
    widgetUpdate({ reason: "progress", playing: true });
  });
  widget.bind(events.FINISH, () => {
    clearWidgetPlayProbe();
    widgetState.paused = true;
    widgetState.position = widgetState.duration;
    widgetUpdate({ reason: "finish", playing: false, ended: true });
  });
  widget.bind(events.ERROR, () => {
    clearWidgetPlayProbe();
    widgetState.paused = true;
    const message =
      "SoundCloud no pudo reproducir esta pista. Puede haber sido retirada o no permitir inserción.";
    ui.playbackError = message;
    ui.playbackErrorKey = resultKey(currentTrack());
    const pending = widgetState.pending;
    if (pending) {
      clearTimeout(pending.timer);
      widgetState.pending = null;
      pending.reject(new Error(message));
    }
    widgetUpdate({ reason: "error", playing: false, error: message });
    render();
  });
}

function createWidget(permalinkUrl, autoplay) {
  let host = document.querySelector("#hanamiSoundCloudEngine");
  if (!host) {
    host = document.createElement("div");
    host.id = "hanamiSoundCloudEngine";
    host.className = "hanami-soundcloud-engine";
    host.setAttribute("aria-hidden", "true");
    document.body.append(host);
  }
  const frame = document.createElement("iframe");
  frame.id = "hanamiSoundCloudWidget";
  frame.title = "Reproductor oficial de SoundCloud";
  frame.allow = "autoplay; encrypted-media";
  frame.tabIndex = -1;
  frame.src = buildSoundCloudWidgetUrl(permalinkUrl, { autoplay });
  host.replaceChildren(frame);
  widgetState.frame = frame;
  widgetState.widget = globalThis.SC.Widget(frame);
  bindWidgetEvents(widgetState.widget);
  return widgetState.widget;
}

function resultKey(result) {
  return compact(
    result?.soundcloudUrn || result?.soundcloudId || result?.permalinkUrl || result?.id,
  );
}

function handlesPlayback(track) {
  return (
    track?.provider === "soundcloud" &&
    /^https:\/\/(?:www\.|m\.|on\.)?soundcloud\.com\//i.test(
      track.permalinkUrl || track.url || "",
    )
  );
}

async function loadPlayback(
  track,
  { position = 0, autoplay = false, volume = 0.82 } = {},
) {
  if (!handlesPlayback(track))
    throw new Error("La pista no contiene un enlace válido de SoundCloud.");
  const permalinkUrl = track.permalinkUrl || track.url;
  await loadSoundCloudWidgetApi();
  cancelWidgetPending(false);
  clearWidgetPlayProbe();
  const token = ++widgetState.token;
  widgetState.ready = false;
  widgetState.paused = !autoplay;
  widgetState.position = Math.max(0, Number(position) || 0);
  widgetState.duration = Math.max(0, Number(track.duration) || 0);
  widgetState.permalinkUrl = permalinkUrl;
  const promise = new Promise((resolve, reject) => {
    widgetState.pending = {
      token,
      resolve,
      reject,
      position,
      autoplay,
      volume,
      timer: setTimeout(() => {
        if (widgetState.pending?.token !== token) return;
        widgetState.pending = null;
        reject(new Error("SoundCloud no confirmó que la pista estuviera lista."));
      }, 15_000),
    };
  });
  if (!widgetState.widget) createWidget(permalinkUrl, autoplay);
  else
    widgetState.widget.load(permalinkUrl, {
      auto_play: autoplay,
      show_artwork: false,
      show_comments: false,
      show_playcount: false,
      show_user: false,
      buying: false,
      sharing: false,
      download: false,
      visual: false,
    });
  return promise;
}

async function togglePlayback(track, { position = 0, volume = 0.82 } = {}) {
  if (
    !widgetState.widget ||
    !widgetState.ready ||
    widgetState.permalinkUrl !== (track?.permalinkUrl || track?.url)
  ) {
    await loadPlayback(track, { position, autoplay: true, volume });
    return { playing: true };
  }
  if (widgetState.paused) {
    widgetState.paused = false;
    armWidgetPlayProbe();
    widgetState.widget.play();
    return { playing: true };
  }
  widgetState.paused = true;
  widgetState.widget.pause();
  return { playing: false };
}

function pausePlayback() {
  widgetState.pauseRequested = true;
  widgetState.playProbeToken++;
  clearWidgetPlayProbe();
  widgetState.paused = true;
  widgetState.widget?.pause?.();
}

function stopPlayback() {
  widgetState.token++;
  cancelWidgetPending(false);
  pausePlayback();
  widgetState.ready = false;
}

function seekPlayback(seconds) {
  const target = clamp(seconds, 0, Math.max(widgetState.duration, Number(seconds) || 0));
  widgetState.position = target;
  widgetState.widget?.seekTo?.(target * 1_000);
}

function setPlaybackVolume(value) {
  widgetState.widget?.setVolume?.(Math.round(clamp(value, 0, 1) * 100));
}

function getPlaybackPosition() {
  return widgetState.position;
}

function getPlaybackDuration() {
  return widgetState.duration;
}

function isPlaybackPaused() {
  return widgetState.paused;
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
    ui.lyricsStatus = track
      ? "Busca letras para la canción actual."
      : "Selecciona una canción primero.";
  }
}

function render() {
  adapter?.render?.();
}

function soundCloudResultHtml(result) {
  const key = resultKey(result);
  const busy = ui.adding === key;
  const artwork = /^https:\/\//i.test(result.artwork || "") ? result.artwork : "";
  const playbackError = ui.playbackErrorKey === key ? ui.playbackError : "";
  const link = /^https:\/\/(?:www\.|m\.|on\.)?soundcloud\.com\//i.test(
    result.permalinkUrl || "",
  )
    ? result.permalinkUrl
    : "";
  return `<article class="reader-music-online-result reader-music-soundcloud-result" data-music-online-result="${esc(key)}">
    ${artwork ? `<img src="${esc(artwork)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<i aria-hidden="true">☁</i>'}
    <span><b>${esc(result.title)}</b><small>${esc(result.artist)}${result.album ? ` · ${esc(result.album)}` : ""}</small>${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">SoundCloud ↗</a>` : ""}</span>
    <time>${esc(result.durationText || "")}</time>
    <button data-music-soundcloud-add="${esc(key)}" ${busy ? "disabled" : ""}>${busy ? "Preparando…" : "＋ Reproducir"}</button>
    ${playbackError ? `<p class="reader-music-online-error" role="alert">${esc(playbackError)}</p>` : ""}
  </article>`;
}

function recognizedHtml() {
  const track = ui.recognized?.track;
  if (!track) return "";
  return `<article class="reader-music-recognized">
    ${/^https:\/\//i.test(track.artwork || "") ? `<img src="${esc(track.artwork)}" alt="" referrerpolicy="no-referrer">` : '<i aria-hidden="true">◎</i>'}
    <span><small>SHAZAM RECONOCIÓ</small><b>${esc(track.title)}</b><em>${esc(track.artist)}${track.album ? ` · ${esc(track.album)}` : ""}</em></span>
    <button data-music-recognized-add>Buscar en SoundCloud</button>
  </article>`;
}

function currentSoundCloudHtml(track) {
  if (!handlesPlayback(track)) return "";
  const link = track.permalinkUrl || track.url;
  return `<aside class="reader-music-soundcloud-source">
    <span><small>REPRODUCCIÓN OFICIAL</small><b>SoundCloud Widget</b></span>
    <a href="${esc(link)}" target="_blank" rel="noopener noreferrer">Abrir pista ↗</a>
  </aside>`;
}

function soundCloudPanelHtml(track) {
  return `<div class="reader-music-service-panel ${ui.tab === "soundcloud" ? "active" : ""}" data-music-service-panel="soundcloud">
    <div class="reader-music-online-search">
      <input data-music-soundcloud-query type="search" value="${esc(ui.query)}" placeholder="Canción, artista o enlace de SoundCloud" aria-label="Buscar en SoundCloud">
      <button data-music-soundcloud-search ${ui.searchBusy ? "disabled" : ""}>${ui.searchBusy ? "Buscando…" : "Buscar"}</button>
    </div>
    <button class="reader-music-recognize" data-music-recognize ${ui.recognizing ? "disabled" : ""}>${ui.recognizing ? "◎ Escuchando…" : "◎ Reconocer lo que está sonando"}</button>
    ${recognizedHtml()}
    ${currentSoundCloudHtml(track)}
    <p class="reader-music-service-status" data-music-search-status aria-live="polite">${esc(ui.recognitionStatus || ui.searchStatus)}</p>
    <div class="reader-music-online-results">${
      ui.results.length
        ? ui.results.map(soundCloudResultHtml).join("")
        : `<div class="reader-music-service-empty"><b>${ui.searchBusy ? "Consultando SoundCloud…" : "Música oficial para tu lectura"}</b><span>Pega un enlace para usar oEmbed sin credenciales. La búsqueda textual necesita la API configurada en Vercel.</span></div>`
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
  return value >= 1_000 ? `${value / 1_000}k` : String(value);
}

function equalizerPanelHtml(track) {
  const state = equalizer.snapshot();
  const unavailable = handlesPlayback(track);
  const disabled = unavailable || !state.enabled;
  const presetOptions = Object.entries(EQ_PRESETS)
    .map(
      ([key, preset]) =>
        `<option value="${key}" ${state.preset === key ? "selected" : ""}>${esc(preset.label)}</option>`,
    )
    .join("");
  return `<div class="reader-music-service-panel ${ui.tab === "effects" ? "active" : ""}" data-music-service-panel="effects">
    <div class="reader-music-eq-top">
      <label class="${unavailable ? "muted" : ""}"><span><b>Ecualizador</b><small>${unavailable ? "No puede procesar el iframe oficial de SoundCloud" : "Cadena Web Audio de baja latencia"}</small></span><input data-music-eq-enabled type="checkbox" ${state.enabled ? "checked" : ""} ${unavailable ? "disabled" : ""}></label>
      <label class="${unavailable ? "muted" : ""}"><span>Preajuste</span><select data-music-eq-preset ${unavailable ? "disabled" : ""}>${state.preset === "custom" ? '<option value="custom" selected disabled>Personalizado</option>' : ""}${presetOptions}</select></label>
    </div>
    <div class="reader-music-eq-bands" aria-label="Ecualizador de diez bandas">${EQ_FREQUENCIES.map(
      (frequency, index) =>
        `<label><b>${frequencyLabel(frequency)}</b><input data-music-eq-band="${index}" type="range" min="-12" max="12" step="0.5" value="${state.bands[index]}" ${disabled ? "disabled" : ""}><small data-music-eq-band-value="${index}">${Number(state.bands[index]).toFixed(1)} dB</small></label>`,
    ).join("")}</div>
    <div class="reader-music-eq-effects">
      <label><span>Refuerzo de graves <b data-music-eq-bass-value>${state.bass.toFixed(1)} dB</b></span><input data-music-eq-bass type="range" min="0" max="12" step="0.5" value="${state.bass}" ${disabled ? "disabled" : ""}></label>
      <label><span>Amplitud estéreo <b data-music-eq-width-value>${Math.round(state.width * 100)}%</b></span><input data-music-eq-width type="range" min="0" max="1" step="0.05" value="${state.width}" ${disabled ? "disabled" : ""}></label>
      <label><span>Ganancia de salida <b data-music-eq-gain-value>${state.gain.toFixed(1)} dB</b></span><input data-music-eq-gain type="range" min="-6" max="15" step="0.5" value="${state.gain}" ${disabled ? "disabled" : ""}></label>
    </div>
    <p class="reader-music-service-status">${esc(
      unavailable
        ? "SC.Widget reproduce en un iframe aislado. Letras, cola, volumen y temporizador siguen disponibles."
        : ui.eqStatus ||
            "Los efectos se aplican a archivos locales y URLs directas que permitan CORS.",
    )}</p>
  </div>`;
}

function panelHtml({ track } = {}) {
  return `<section class="reader-music-services" data-music-services>
    <header><span><small>SERVICIOS EXTERNOS</small><b>Buscar, reconocer y ajustar</b></span><em>HANAMI · v135.2</em></header>
    <nav aria-label="Servicios de música">
      <button data-music-service-tab="soundcloud" class="${ui.tab === "soundcloud" ? "active" : ""}">Buscar</button>
      <button data-music-service-tab="lyrics" class="${ui.tab === "lyrics" ? "active" : ""}">Letras</button>
      <button data-music-service-tab="effects" class="${ui.tab === "effects" ? "active" : ""}">Ecualizador</button>
    </nav>
    ${soundCloudPanelHtml(track)}
    ${lyricsPanelHtml(track)}
    ${equalizerPanelHtml(track)}
  </section>`;
}

async function loadCapabilities() {
  try {
    const data = await apiJson("/api/music/capabilities");
    ui.searchConfigured = !!data?.soundcloud?.searchConfigured;
    if (!ui.query && !ui.results.length)
      ui.searchStatus = ui.searchConfigured
        ? "Busca canciones, artistas o álbumes en SoundCloud."
        : "Pega un enlace de SoundCloud. Configura sus credenciales en Vercel para buscar por texto.";
    render();
  } catch {}
}

async function searchSoundCloud(query = ui.query) {
  const value = compact(query);
  if (!value) {
    ui.searchStatus = "Escribe una canción, artista o enlace de SoundCloud.";
    render();
    return;
  }
  ui.query = value;
  ui.searchBusy = true;
  ui.recognitionStatus = "";
  ui.searchStatus = /^https:\/\//i.test(value)
    ? "Comprobando el enlace con SoundCloud…"
    : "Buscando en SoundCloud…";
  render();
  try {
    const params = new URLSearchParams({ q: value });
    const data = await apiJson(`/api/music/soundcloud/search?${params}`);
    ui.results = Array.isArray(data.results) ? data.results : [];
    ui.searchStatus = ui.results.length
      ? `${ui.results.length} resultado${ui.results.length === 1 ? "" : "s"} reproducible${ui.results.length === 1 ? "" : "s"} mediante SC.Widget.`
      : "No se encontraron pistas reproducibles para esta búsqueda.";
  } catch (error) {
    ui.results = [];
    if (error?.kind === "soundcloud_not_configured") ui.searchConfigured = false;
    ui.searchStatus = error?.message || "No se pudo buscar en SoundCloud.";
  } finally {
    ui.searchBusy = false;
    render();
  }
}

async function resolveSoundCloudUrl(url, { fetchImpl = fetch } = {}) {
  return apiJsonWith(fetchImpl, "/api/music/soundcloud/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
}

async function addSoundCloudResult(result) {
  const key = resultKey(result);
  if (!key || !result?.permalinkUrl || ui.adding) return;
  ui.adding = key;
  ui.playbackError = "";
  ui.playbackErrorKey = "";
  ui.searchStatus = `Preparando ${result.title || "la canción"} con SoundCloud…`;
  render();
  try {
    const remote = await adapter.addRemoteTrack(result.permalinkUrl, {
      title: result.title || "Pista de SoundCloud",
      artist: result.artist || "SoundCloud",
      album: result.album || "",
      duration: result.duration || 0,
      artwork: result.artwork || "",
      provider: "soundcloud",
      soundcloudId: result.soundcloudId || result.id || "",
      soundcloudUrn: result.soundcloudUrn || "",
      permalinkUrl: result.permalinkUrl,
      userUrl: result.userUrl || "",
    });
    ui.searchStatus = `${remote.title} añadida. La reproducción se realiza mediante SC.Widget.`;
    adapter.setStatus?.(`${remote.title} añadida desde SoundCloud.`);
    const started = await adapter.playTrack(remote.id);
    if (!started)
      throw new Error(
        compact(adapter?.getStatus?.()) ||
          "SoundCloud no pudo iniciar esta pista.",
      );
  } catch (error) {
    ui.playbackError =
      error?.message || "No se pudo reproducir esta canción de SoundCloud.";
    ui.playbackErrorKey = key;
    ui.searchStatus = ui.playbackError;
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
        ui.recognitionStatus =
          stage || `Escuchando… ${Math.round(clamp(progress, 0, 1) * 100)}%`;
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
  ui.query = compact(`${track.title} ${track.artist}`);
  await searchSoundCloud(ui.query);
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
  if (handlesPlayback(currentTrack())) {
    ui.eqStatus =
      "El reproductor oficial de SoundCloud está aislado del Web Audio de Hanami.";
    render();
    return;
  }
  ui.eqStatus = enabled
    ? "Activando cadena de efectos…"
    : "Desactivando efectos…";
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
  setPlaybackVolume(adapter?.getVolume?.() ?? 0.82);
  void loadSoundCloudWidgetApi().catch(() => {});
  void loadCapabilities();
}

async function beforeLoad(track) {
  if (!handlesPlayback(track) && equalizer.state.enabled)
    await equalizer.resume();
  return null;
}

function audioCrossOrigin(track) {
  return !handlesPlayback(track) && equalizer.attached ? "anonymous" : "";
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
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
}

function snapshot() {
  return {
    tab: ui.tab,
    query: ui.query,
    resultCount: ui.results.length,
    searchConfigured: ui.searchConfigured,
    recognized: ui.recognized?.track || null,
    lyricsProvider: ui.lyrics?.provider || null,
    lyricsSynced: !!ui.lyrics?.synced,
    soundcloud: {
      ready: widgetState.ready,
      paused: widgetState.paused,
      permalinkUrl: widgetState.permalinkUrl,
      position: widgetState.position,
      duration: widgetState.duration,
      playbackError: ui.playbackError,
    },
    equalizer: equalizer.snapshot(),
  };
}

const service = {
  connect,
  panelHtml,
  beforeLoad,
  audioCrossOrigin,
  onPlayerChange,
  syncUi,
  snapshot,
  handlesPlayback,
  loadPlayback,
  togglePlayback,
  pausePlayback,
  stopPlayback,
  seekPlayback,
  setPlaybackVolume,
  getPlaybackPosition,
  getPlaybackDuration,
  isPlaybackPaused,
};

if (typeof document !== "undefined") {
  document.addEventListener("input", (event) => {
    const target = event.target;
    if (target.matches("[data-music-soundcloud-query]")) ui.query = target.value;
    if (target.matches("[data-music-eq-band]")) {
      const index = Number(target.dataset.musicEqBand);
      equalizer.setBand(index, target.value);
      const label = document.querySelector(
        `[data-music-eq-band-value="${index}"]`,
      );
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
      if (label)
        label.textContent = `${Math.round(Number(target.value) * 100)}%`;
    }
    if (target.matches("[data-music-eq-gain]")) {
      equalizer.setGain(target.value);
      const label = document.querySelector("[data-music-eq-gain-value]");
      if (label) label.textContent = `${Number(target.value).toFixed(1)} dB`;
    }
  });

  document.addEventListener("change", async (event) => {
    const target = event.target;
    if (target.matches("[data-music-eq-enabled]"))
      await toggleEqualizer(target.checked);
    if (
      target.matches("[data-music-eq-preset]") &&
      target.value !== "custom"
    ) {
      equalizer.setPreset(target.value);
      render();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Enter" &&
      event.target.matches("[data-music-soundcloud-query]")
    ) {
      event.preventDefault();
      void searchSoundCloud(event.target.value);
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
    if (button.hasAttribute("data-music-soundcloud-search")) {
      await searchSoundCloud(
        document.querySelector("[data-music-soundcloud-query]")?.value ||
          ui.query,
      );
      return;
    }
    if (button.dataset.musicSoundcloudAdd) {
      const result = ui.results.find(
        (item) => resultKey(item) === button.dataset.musicSoundcloudAdd,
      );
      if (result) await addSoundCloudResult(result);
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
    if (
      equalizer.state.enabled &&
      !handlesPlayback(currentTrack()) &&
      button.closest("[data-music-root]")
    )
      void equalizer.resume().catch(() => {});
  });
}

if (typeof window !== "undefined") {
  window.HanamiReaderMusicServices = service;
  const register = () =>
    window.HanamiReaderMusic?.registerExternalServices?.(service);
  if (window.HanamiReaderMusic) register();
  else addEventListener("DOMContentLoaded", register, { once: true });
}

export { resolveSoundCloudUrl, searchSoundCloud };