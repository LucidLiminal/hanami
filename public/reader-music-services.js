import { recognizeAmbient } from "./music-recognition.js";
import {
  assignTrack,
  canonicalMusicUrl,
  discoverySnapshot,
  loadTrends,
  recentTracks,
} from "./reader-music-discovery.js";

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
let picker = null;
let pickerError = "";
let pickerSelecting = "";
let soundCloudSearchToken = 0;
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
  lyricsRequest: 0,
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
  durationRefreshPending: false,
  statePollTimer: 0,
  statePollToken: 0,
  statePollPaused: null,
  statePollEnded: false,
  finishedToken: -1,
  starting: false,
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
  clearTimeout(pending.pollTimer);
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

function comparableSoundCloudUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return `${url.hostname.replace(/^(?:www\.|m\.)/, "")}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return "";
  }
}

function canonicalSoundCloudUrl(value) {
  try {
    const url = new URL(String(value || ""));
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
  } catch {
    return String(value || "");
  }
}

function pendingMatchesSound(pending, sound) {
  if (!pending || !sound) return false;
  if (
    pending.soundcloudId &&
    String(sound.id || "") === String(pending.soundcloudId)
  )
    return true;
  return (
    comparableSoundCloudUrl(sound.permalink_url) ===
    comparableSoundCloudUrl(pending.permalinkUrl)
  );
}

function refreshWidgetDuration() {
  widgetState.widget?.getDuration?.((milliseconds) => {
    const duration = Math.max(0, Number(milliseconds) || 0) / 1_000;
    if (duration) widgetState.duration = duration;
    widgetUpdate({ reason: "ready" });
  });
}

function completeWidgetPending({
  playing = false,
  startPlayback = false,
  refreshDuration = true,
} = {}) {
  const pending = widgetState.pending;
  if (!pending || pending.token !== widgetState.token) return false;
  clearTimeout(pending.timer);
  clearTimeout(pending.pollTimer);
  widgetState.pending = null;
  widgetState.ready = true;
  widgetState.paused = !playing;
  widgetState.widget?.setVolume?.(
    100,
  );
  if (refreshDuration) refreshWidgetDuration();
  else widgetState.durationRefreshPending = true;
  const position = Math.max(0, Number(pending.position) || 0);
  widgetState.widget?.seekTo?.(position * 1_000);
  widgetState.position = position;
  if (startPlayback && pending.autoplay && !widgetState.pauseRequested) {
    widgetState.paused = false;
    armWidgetPlayProbe();
    widgetState.widget?.play?.();
    playing = true;
  }
  if (playing) startWidgetStatePolling();
  pending.resolve({
    ready: true,
    playing,
    duration: widgetState.duration,
  });
  return true;
}

function confirmWidgetReady(pending = widgetState.pending) {
  if (!pending || widgetState.pending !== pending || pending.token !== widgetState.token) return;
  widgetState.widget?.getCurrentSound?.((sound) => {
    if (widgetState.pending !== pending || pending.token !== widgetState.token || !pendingMatchesSound(pending, sound)) return;
    completeWidgetPending({ playing: !!pending.autoplay, startPlayback: !!pending.autoplay });
  });
}

function finishWidgetTrack(token = widgetState.token) {
  if (token !== widgetState.token || widgetState.pending || widgetState.pauseRequested ||
    widgetState.finishedToken === token) return false;
  // FINISH/PAUSE for the old sound can arrive after seek/load has started.
  if (widgetState.starting && (!widgetState.duration || widgetState.position < widgetState.duration - 0.75)) return false;
  widgetState.finishedToken = token;
  clearWidgetPlayProbe();
  // Stop the old poll before the callback starts the next song's poll.
  stopWidgetStatePolling();
  widgetState.paused = true;
  widgetState.position = widgetState.duration;
  widgetUpdate({ reason: "finish", playing: false, ended: true });
  return true;
}

function pollPendingSound(pending) {
  const check = () => {
    if (widgetState.pending !== pending) return;
    let answered = false;
    pending.pollTimer = setTimeout(() => {
      if (!answered && widgetState.pending === pending) check();
    }, 420);
    widgetState.widget?.getCurrentSound?.((sound) => {
      answered = true;
      clearTimeout(pending.pollTimer);
      if (widgetState.pending !== pending) return;
      if (pendingMatchesSound(pending, sound)) {
        completeWidgetPending({
          playing: !!pending.autoplay,
          startPlayback: !!pending.autoplay,
        });
        return;
      }
      pending.pollTimer = setTimeout(check, 160);
    });
  };
  pending.pollTimer = setTimeout(check, 80);
}

function stopWidgetStatePolling() {
  clearTimeout(widgetState.statePollTimer);
  widgetState.statePollTimer = 0;
  widgetState.statePollToken++;
  widgetState.statePollPaused = null;
  widgetState.statePollEnded = false;
}

function startWidgetStatePolling() {
  stopWidgetStatePolling();
  const token = widgetState.statePollToken;
  const tick = () => {
    if (token !== widgetState.statePollToken || !widgetState.widget) return;
    widgetState.widget.getPosition?.((milliseconds) => {
      if (token !== widgetState.statePollToken) return;
      const position = Math.max(0, Number(milliseconds) || 0) / 1_000;
      if (Number.isFinite(position)) {
        widgetState.position = position;
        if (position > 0.2) widgetState.starting = false;
      }
      widgetState.widget.getDuration?.((durationMilliseconds) => {
        if (token !== widgetState.statePollToken) return;
        const duration =
          Math.max(0, Number(durationMilliseconds) || 0) / 1_000;
        if (duration) widgetState.duration = duration;
      });
      widgetState.widget.isPaused?.((paused) => {
        if (token !== widgetState.statePollToken) return;
        const isPaused = !!paused;
        const ended =
          isPaused &&
          widgetState.duration > 0 &&
          widgetState.position >= widgetState.duration - 0.75;
        if (ended && !widgetState.statePollEnded) {
          widgetState.statePollEnded = true;
          finishWidgetTrack();
          return;
        }
        if (
          !isPaused ||
          widgetState.statePollPaused === null ||
          widgetState.statePollPaused !== isPaused
        ) {
          widgetState.paused = isPaused;
          widgetUpdate({
            reason: isPaused ? "pause" : "progress",
            playing: !isPaused,
          });
        }
        widgetState.statePollPaused = isPaused;
      });
    });
    if (token === widgetState.statePollToken) widgetState.statePollTimer = setTimeout(tick, 900);
  };
  widgetState.statePollTimer = setTimeout(tick, 700);
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
        startWidgetStatePolling();
        widgetUpdate({ reason: "progress", playing: true });
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
    if (pending) confirmWidgetReady(pending);
    else
      refreshWidgetDuration();
  });
  widget.bind(events.PLAY, () => {
    if (widgetState.pauseRequested) {
      widgetState.widget?.pause?.();
      return;
    }
    if (widgetState.pending) { confirmWidgetReady(); return; }
    widgetState.paused = false;
    startWidgetStatePolling();
    widgetUpdate({ reason: "play", playing: true });
  });
  widget.bind(events.PAUSE, () => {
    if (widgetState.pending || widgetState.starting && !widgetState.pauseRequested) return;
    widgetState.paused = true;
    if (widgetState.pauseRequested) {
      clearWidgetPlayProbe();
      stopWidgetStatePolling();
    }
    widgetUpdate({ reason: "pause", playing: false });
  });
  widget.bind(events.PLAY_PROGRESS, (progress = {}) => {
    if (widgetState.pauseRequested) return;
    if (widgetState.pending) { confirmWidgetReady(); return; }
    if (widgetState.durationRefreshPending) {
      widgetState.durationRefreshPending = false;
      refreshWidgetDuration();
    }
    const position = Math.max(0, Number(progress.currentPosition) || 0) / 1_000;
    // A last progress message from the previous sound must not end its replacement.
    if (widgetState.starting && widgetState.duration > 0 && position >= widgetState.duration - 0.75) return;
    widgetState.playProbeProgress = true;
    clearWidgetPlayProbe();
    ui.playbackError = "";
    ui.playbackErrorKey = "";
    widgetState.position = position;
    if (widgetState.position > 0.2) widgetState.starting = false;
    widgetUpdate({ reason: "progress", playing: true });
  });
  widget.bind(events.FINISH, () => {
    const token = widgetState.token;
    if (!widgetState.starting) { finishWidgetTrack(token); return; }
    // Confirm an immediate FINISH against the current iframe, not a stale message.
    widgetState.widget?.getPosition?.((milliseconds) => {
      if (token !== widgetState.token || widgetState.pending || widgetState.pauseRequested) return;
      widgetState.position = Math.max(0, Number(milliseconds) || 0) / 1_000;
      finishWidgetTrack(token);
    });
  });
  widget.bind(events.ERROR, () => {
    clearWidgetPlayProbe();
    stopWidgetStatePolling();
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
  { position = 0, autoplay = false } = {},
) {
  if (!handlesPlayback(track))
    throw new Error("La pista no contiene un enlace válido de SoundCloud.");
  const permalinkUrl = canonicalSoundCloudUrl(
    track.permalinkUrl || track.url,
  );
  const reuse = !!widgetState.widget && widgetState.ready && !widgetState.pending &&
    comparableSoundCloudUrl(widgetState.permalinkUrl) === comparableSoundCloudUrl(permalinkUrl);
  cancelWidgetPending(false);
  clearWidgetPlayProbe();
  stopWidgetStatePolling();
  const token = ++widgetState.token;
  widgetState.ready = reuse;
  widgetState.paused = !autoplay;
  widgetState.pauseRequested = !autoplay;
  widgetState.position = Math.max(0, Number(position) || 0);
  widgetState.duration = Math.max(0, Number(track.duration) || 0);
  widgetState.durationRefreshPending = false;
  widgetState.permalinkUrl = permalinkUrl;
  widgetState.starting = !!autoplay;
  if (reuse) {
    // Repeating never calls load(): keep the already-authorized SoundCloud iframe.
    widgetState.widget.seekTo(widgetState.position * 1_000);
    if (autoplay) {
      armWidgetPlayProbe();
      widgetState.widget.play();
      startWidgetStatePolling();
    } else widgetState.widget.pause();
    return { ready: true, playing: autoplay, duration: widgetState.duration };
  }
  await loadSoundCloudWidgetApi();
  if (token !== widgetState.token || autoplay && widgetState.pauseRequested) return false;
  const promise = new Promise((resolve, reject) => {
    widgetState.pending = {
      token,
      resolve,
      reject,
      position,
      autoplay,
      permalinkUrl,
      soundcloudId: track.soundcloudId || "",
      pollTimer: 0,
      timer: setTimeout(() => {
        if (widgetState.pending?.token !== token) return;
        widgetState.pending = null;
        reject(new Error("SoundCloud no confirmó que la pista estuviera lista."));
      }, 15_000),
    };
  });
  if (!widgetState.widget) createWidget(permalinkUrl, autoplay);
  else {
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
      callback: () => {
        if (token === widgetState.token) confirmWidgetReady();
      },
    });
  }
  pollPendingSound(widgetState.pending);
  return promise;
}

async function togglePlayback(track, { position = 0, playing: requestedPlaying } = {}) {
  if (requestedPlaying === true) {
    pausePlayback();
    return { playing: false };
  }
  const requestedPermalink = canonicalSoundCloudUrl(
    track?.permalinkUrl || track?.url,
  );
  if (
    !widgetState.widget ||
    !widgetState.ready ||
    widgetState.permalinkUrl !== requestedPermalink
  ) {
    await loadPlayback(track, { position, autoplay: true });
    return { playing: true };
  }
  if (widgetState.paused) {
    widgetState.paused = false;
    armWidgetPlayProbe();
    widgetState.widget.play();
    startWidgetStatePolling();
    return { playing: true };
  }
  widgetState.paused = true;
  widgetState.widget.pause();
  return { playing: false };
}

function pausePlayback() {
  widgetState.token++;
  widgetState.pauseRequested = true;
  cancelWidgetPending(false);
  widgetState.playProbeToken++;
  clearWidgetPlayProbe();
  stopWidgetStatePolling();
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
  ui.lyricsRequest++;
  ui.lyricsBusy = false;
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
  renderPicker();
}

const discoveryMusicIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l12-2v13M9 9l12-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/></svg>';

function discoveryCard(track, source, compactCard = false) {
  const key = source === "recent" ? track.id : source === "trend" ? track.permalinkUrl : resultKey(track);
  const busy = pickerSelecting === `${source}:${key}`;
  const artwork = /^https:\/\//i.test(track.artwork || "") ? track.artwork : "";
  const assigning = !!picker?.context;
  const label = assigning ? `Instanciar ${track.title}` : `Reproducir ${track.title}`;
  const foot = source === "trend"
    ? `${track.listeners} lector${track.listeners === 1 ? "" : "es"} · ${track.plays} escucha${track.plays === 1 ? "" : "s"} · ${track.uses} uso${track.uses === 1 ? "" : "s"}`
    : source === "recent" ? "Escuchada en Hanami" : "SoundCloud · enlace verificado";
  return `<article class="music-discovery-card ${compactCard ? "compact-card" : ""}">
    <div class="music-discovery-art">
      ${artwork ? `<img src="${esc(artwork)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<i aria-hidden="true">${discoveryMusicIcon}</i>`}
      ${compactCard ? "" : discoveryCardContent(track, source, key, label, busy, assigning)}
    </div>
    ${compactCard ? discoveryCardContent(track, source, key, label, busy, assigning) : ""}
    <p class="music-discovery-card-foot">${esc(foot)}</p>
  </article>`;
}

function discoveryCardContent(track, source, key, label, busy, assigning) {
  return `<div class="music-discovery-card-content"><span><b>${esc(track.title || "Sin título")}</b><em>${esc(track.artist || "Artista desconocido")}</em></span><button type="button" data-music-picker-pick="${esc(key)}" data-music-picker-source="${source}" aria-label="${esc(label)}" title="${esc(label)}" ${pickerSelecting ? "disabled" : ""}>${busy ? "…" : assigning ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 4 13 8-13 8Z"/></svg>'}</button></div>`;
}

function localPlaylistsHtml() {
  const lists = window.HanamiReaderPlayer?.snapshot?.().playlists || [];
  const tracks = window.HanamiReaderMusic?.listTracks?.() || [];
  const assigning = !!picker?.context;
  return `<section class="music-discovery-section music-local-playlists" aria-labelledby="musicPickerLists"><header><div><small>EN ESTE DISPOSITIVO</small><h3 id="musicPickerLists">Tus listas <span class="music-discovery-count">${lists.length}</span></h3></div></header>
    <p class="music-discovery-note">Abre una lista y elige una canción. Tus listas son personales y no se publican en el grupo.</p>
    ${lists.length ? lists.map((list) => {
      const available = list.trackIds.map((id) => tracks.find((track) => track.id === id)).filter(Boolean);
      const missing = list.trackIds.length - available.length;
      return `<details class="music-local-playlist" data-music-picker-list="${esc(list.id)}"><summary><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h12M4 18h12"/></svg><span><b>${esc(list.name)}</b><small>${available.length} canción${available.length === 1 ? "" : "es"}${missing ? ` · ${missing} no disponible${missing === 1 ? "" : "s"}` : ""}</small></span><svg class="music-local-list-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary><div class="music-local-list-tracks">
        ${available.length ? available.map((track) => {
          const artwork = /^https:\/\//i.test(track.artwork || "") ? track.artwork : "";
          const busy = pickerSelecting === `local:${track.id}`;
          const label = `${assigning ? "Instanciar" : "Reproducir"} ${track.title}`;
          return `<article class="music-local-track"><div class="music-local-track-art">${artwork ? `<img src="${esc(artwork)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<i aria-hidden="true">${discoveryMusicIcon}</i>`}</div><span><b>${esc(track.title || "Sin título")}</b><small>${esc(track.artist || "Artista desconocido")}</small></span><button type="button" data-music-picker-pick="${esc(track.id)}" data-music-picker-source="local" data-music-picker-playlist="${esc(list.id)}" aria-label="${esc(label)}" title="${esc(label)}" ${pickerSelecting ? "disabled" : ""}>${busy ? "…" : assigning ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 4 12 8-12 8Z"/></svg>'}</button></article>`;
        }).join("") : '<p class="music-local-list-empty">Esta lista no tiene canciones disponibles en este navegador.</p>'}
      </div></details>`;
    }).join("") : '<div class="music-discovery-empty"><b>Todavía no tienes listas</b><p>Crea una desde el reproductor → Listas. Aparecerá aquí con las canciones que hayas guardado.</p></div>'}
  </section>`;
}

function pickerHtml() {
  const discovery = discoverySnapshot();
  const recent = recentTracks();
  const assigning = !!picker?.context;
  return `<header class="music-discovery-top"><button type="button" class="music-discovery-back" data-music-picker-close aria-label="Volver a la lectura"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7"/></svg></button><div><small>MÚSICA PARA TU LECTURA</small><h2>Música</h2></div></header>
  <main class="music-discovery-content">
    ${assigning ? `<p class="music-discovery-context">Elige una pista para la página ${Number(picker.context.pageIndex || 0) + 1}. Su tarjeta aparecerá en el lateral al llegar a ese punto de lectura.</p>` : ""}
    <form class="music-url-search" data-music-picker-form novalidate>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg>
      <input type="url" inputmode="url" autocomplete="off" spellcheck="false" data-music-picker-query value="${esc(ui.query)}" placeholder="Pega la URL de una canción…" aria-label="URL de una canción de SoundCloud" aria-describedby="musicPickerUrlWarning">
      <button type="submit" data-music-picker-search aria-label="Buscar canción por URL" ${ui.searchBusy || !ui.query.trim() ? "disabled" : ""}>${ui.searchBusy ? "…" : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>'}</button>
    </form>
    <p id="musicPickerUrlWarning" class="music-url-warning">Por ahora, solo se aceptan URL de canciones de SoundCloud; no nombres de canciones ni artistas.</p>
    <p class="music-picker-status ${pickerError ? "error" : ""}" data-music-picker-status role="status" aria-live="polite">${esc(pickerError || (ui.searchBusy || ui.query ? ui.searchStatus : ""))}</p>
    ${ui.results.length ? `<section class="music-discovery-section" aria-labelledby="musicPickerResults"><header><div><small>ENLACE ENCONTRADO</small><h3 id="musicPickerResults">${ui.results.length === 1 ? "Tu canción" : "Resultados"}</h3></div></header><div class="music-discovery-carousel" data-music-carousel="results">${ui.results.map((track) => discoveryCard(track, "result")).join("")}</div></section>` : ""}
    ${localPlaylistsHtml()}
    <section class="music-discovery-section" aria-labelledby="musicPickerRecent"><header><div><small>PARA TI</small><h3 id="musicPickerRecent">Escuchado recientemente <span class="music-discovery-count">${recent.length}</span></h3></div>${recent.length > 1 ? '<button type="button" data-music-picker-more="recent" aria-label="Ver más canciones recientes"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button>' : ""}</header>
      ${recent.length ? `<div class="music-discovery-carousel" data-music-carousel="recent">${recent.map((track) => discoveryCard(track, "recent")).join("")}</div>` : '<div class="music-discovery-empty"><b>Tu próxima lectura puede tener banda sonora</b><p>Las canciones que escuches en Hanami aparecerán aquí. Pega un enlace para empezar.</p></div>'}
    </section>
    <section class="music-discovery-section" aria-labelledby="musicPickerTrends"><header><div><small>TENDENCIAS</small><h3 id="musicPickerTrends">Lo más sonado <span class="music-discovery-count">${discovery.trends.length}</span></h3></div><button type="button" data-music-picker-refresh aria-label="Actualizar tendencias" ${discovery.trendsStatus === "loading" ? "disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6 8a7 7 0 0 1 12-2l2 2M18 16a7 7 0 0 1-12 2l-2-2"/></svg></button></header>
      ${discovery.trends.length ? `<p class="music-discovery-note">${esc(discovery.trendsMessage)}</p><div class="music-discovery-carousel compact" data-music-carousel="trends">${discovery.trends.map((track) => discoveryCard(track, "trend", true)).join("")}</div>` : `<div class="music-discovery-empty" data-music-trends-state="${esc(discovery.trendsStatus)}"><b>${discovery.trendsStatus === "loading" ? "Cargando tendencias…" : discovery.trendsStatus === "error" ? "Tendencias no disponibles" : discovery.trendsStatus === "unavailable" ? "Conecta la comunidad" : "Aún no hay tendencias"}</b><p>${esc(discovery.trendsMessage)}</p>${discovery.trendsStatus === "error" ? '<button type="button" data-music-picker-refresh>Volver a intentar</button>' : ""}</div>`}
    </section>
  </main>`;
}

function renderPicker() {
  if (!picker?.node.isConnected) return;
  const node = picker.node;
  const scrollTop = node.scrollTop;
  const carousels = [...node.querySelectorAll("[data-music-carousel]")].map((item) => [item.dataset.musicCarousel, item.scrollLeft]);
  const inputFocused = document.activeElement?.matches("[data-music-picker-query]");
  const active = node.contains(document.activeElement) ? document.activeElement : null;
  const focusedList = active?.closest("[data-music-picker-list]")?.dataset.musicPickerList;
  let focusSelector = active?.matches("[data-music-picker-close]") ? "[data-music-picker-close]" : "";
  if (active?.matches("summary") && focusedList) focusSelector = `[data-music-picker-list="${CSS.escape(focusedList)}"] > summary`;
  else if (active?.matches("[data-music-picker-pick]")) {
    const scope = focusedList ? `[data-music-picker-list="${CSS.escape(focusedList)}"] ` : "";
    focusSelector = `${scope}[data-music-picker-source="${CSS.escape(active.dataset.musicPickerSource)}"][data-music-picker-pick="${CSS.escape(active.dataset.musicPickerPick)}"]`;
  }
  const openLists = [...node.querySelectorAll("[data-music-picker-list][open]")].map((list) => list.dataset.musicPickerList);
  const selection = inputFocused ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
  node.innerHTML = pickerHtml();
  for (const id of openLists) {
    const list = node.querySelector(`[data-music-picker-list="${CSS.escape(id)}"]`);
    if (list) list.open = true;
  }
  node.scrollTop = scrollTop;
  for (const [name, left] of carousels) {
    const carousel = node.querySelector(`[data-music-carousel="${name}"]`);
    if (carousel) carousel.scrollLeft = left;
  }
  updatePickerNavigation();
  if (inputFocused) {
    const input = node.querySelector("[data-music-picker-query]");
    input.focus({ preventScroll: true });
    if (selection?.[0] != null) {
      try { input.setSelectionRange(...selection); } catch {}
    }
  } else if (focusSelector) {
    const control = node.querySelector(focusSelector);
    if (control && !control.disabled) control.focus({ preventScroll: true });
    else if (focusedList) node.querySelector(`[data-music-picker-list="${CSS.escape(focusedList)}"] > summary`)?.focus({ preventScroll: true });
    else node.focus({ preventScroll: true });
  }
}

function updatePickerNavigation() {
  if (!picker) return;
  const carousel = picker.node.querySelector('[data-music-carousel="recent"]');
  const button = picker.node.querySelector('[data-music-picker-more="recent"]');
  if (button && carousel) button.hidden = carousel.scrollWidth <= carousel.clientWidth + 1;
}

function destroyPicker() {
  if (!picker) return;
  const previous = picker;
  picker = null;
  previous.node.remove();
  for (const [node, inert] of previous.inert) node.inert = inert;
  document.body.classList.remove("reader-music-picker-open");
  document.querySelector("#readerViewport")?.focus({ preventScroll: true });
}

function closePicker(fromHistory = false) {
  if (!picker) return;
  if (!fromHistory && window.HanamiScreens?.is("reader-music-services")) {
    window.HanamiScreens.back();
    return;
  }
  destroyPicker();
}

function openPicker({ context = null, restoring = false } = {}) {
  destroyPicker();
  const root = document.querySelector("#reader");
  if (!root || root.classList.contains("hidden")) return false;
  pickerError = "";
  pickerSelecting = "";
  // The separate selector never inherits a legacy text-search query.
  if (!/^https:\/\//i.test(ui.query)) {
    ui.query = "";
    ui.results = [];
  }
  const node = document.createElement("section");
  node.className = "reader-music-services reader-music-picker";
  node.dataset.musicPicker = "";
  node.setAttribute("role", "dialog");
  node.setAttribute("aria-modal", "true");
  node.setAttribute("aria-label", context ? "Instanciar una pista de música" : "Buscar música");
  node.tabIndex = -1;
  const inert = [...root.children]
    .filter((child) => !child.matches(".reader-comment-editor,.reader-page-actions-overlay,.reader-music-picker"))
    .map((child) => [child, child.inert]);
  for (const [child] of inert) child.inert = true;
  root.append(node);
  picker = { node, context, inert };
  document.body.classList.add("reader-music-picker-open");
  if (!restoring && window.HanamiScreens) {
    window.HanamiScreens.push(
      "reader-music-services",
      { pageIndex: context?.pageIndex ?? null },
      {
        restore: () => openPicker({ context, restoring: true }),
        suspend: destroyPicker,
      },
    );
  }
  node.addEventListener("input", (event) => {
    if (!event.target.matches("[data-music-picker-query]")) return;
    ui.query = event.target.value;
    pickerError = "";
    if (ui.searchBusy) {
      ++soundCloudSearchToken;
      ui.searchBusy = false;
    }
    node.querySelector("[data-music-picker-search]").disabled = !ui.query.trim();
    if (!ui.query.trim()) {
      ui.results = [];
      ui.searchStatus = "";
      renderPicker();
    }
  });
  node.addEventListener("submit", (event) => {
    if (!event.target.matches("[data-music-picker-form]")) return;
    event.preventDefault();
    pickerError = "";
    void searchSoundCloud(node.querySelector("[data-music-picker-query]").value, { urlOnly: true });
  });
  node.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.hasAttribute("data-music-picker-close")) closePicker();
    if (button.hasAttribute("data-music-picker-refresh")) void loadTrends();
    if (button.dataset.musicPickerMore) {
      const carousel = node.querySelector(`[data-music-carousel="${button.dataset.musicPickerMore}"]`);
      carousel?.scrollBy({
        left: carousel.clientWidth * 0.85,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    }
    if (button.dataset.musicPickerPick) void selectPickerTrack(button.dataset.musicPickerSource, button.dataset.musicPickerPick, button.dataset.musicPickerPlaylist);
  });
  node.addEventListener("error", (event) => {
    const image = event.target;
    if (!image.matches?.(".music-discovery-art > img,.music-local-track-art > img")) return;
    image.insertAdjacentHTML("beforebegin", `<i aria-hidden="true">${discoveryMusicIcon}</i>`);
    image.remove();
  }, true);
  node.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation(); closePicker();
    } else if (event.key === "Tab") {
      const controls = [...node.querySelectorAll("button:not([disabled]),input,summary")].filter((item) => item.getClientRects().length && !item.closest("details:not([open]) .music-local-list-tracks"));
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && [node, first].includes(document.activeElement)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    }
  });
  renderPicker();
  requestAnimationFrame(() => node.querySelector("[data-music-picker-close]")?.focus({ preventScroll: true }));
  void loadTrends();
  return true;
}

async function selectPickerTrack(source, key, playlistId) {
  if (!picker || pickerSelecting) return;
  const instance = picker;
  const track = source === "recent" ? recentTracks().find((item) => item.id === key) :
    source === "trend" ? discoverySnapshot().trends.find((item) => item.permalinkUrl === key) :
    source === "local" ? window.HanamiReaderMusic?.listTracks?.().find((item) => item.id === key) :
    ui.results.find((item) => resultKey(item) === key);
  if (!track) return;
  pickerSelecting = `${source}:${key}`;
  pickerError = "";
  renderPicker();
  try {
    const music = window.HanamiReaderMusic;
    if (!music) throw new Error("El reproductor todavía no está listo.");
    await music.ready;
    const url = canonicalMusicUrl(track.permalinkUrl || track.url);
    let remote = music.snapshot().tracks.find((item) =>
      source === "recent" || source === "local" ? item.id === track.id :
      !!url && canonicalMusicUrl(item.permalinkUrl || item.url) === url,
    );
    if (!remote) {
      if (!url) throw new Error("Esta pista local ya no está disponible.");
      remote = await music.addUrl(url, {
        title: track.title, artist: track.artist, album: track.album || "",
        artwork: track.artwork || "", duration: track.duration || 0, provider: "soundcloud",
        soundcloudId: track.soundcloudId || track.id || "",
        soundcloudUrn: track.soundcloudUrn || "", permalinkUrl: url, userUrl: track.userUrl || "",
      });
    }
    if (instance !== picker) return;
    const binding = instance.context ? assignTrack(remote, instance.context) : null;
    const started = binding
      ? await music.playPin(remote.id, { id: binding.id, groupId: binding.groupId, title: remote.title })
      : source === "local" && playlistId ? await window.HanamiReaderPlayer.playList(playlistId, remote.id) : await music.play(remote.id);
    if (instance !== picker) return;
    if (!started) {
      pickerError = `${instance.context ? "La pista quedó guardada en esta página. " : ""}${adapter?.getStatus?.() || "No se pudo iniciar la reproducción. Puedes intentarlo desde el reproductor."}`;
      return;
    }
    window.HanamiToast?.(binding?.shareState === "pending" ? "Pista añadida · pendiente de compartir en el grupo" : instance.context ? "Pista añadida a esta página" : "Reproduciendo canción");
    closePicker();
  } catch (error) {
    if (instance === picker) pickerError = error.message || "No se pudo seleccionar la pista.";
  } finally {
    pickerSelecting = "";
    renderPicker();
  }
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
        `<p data-music-lyric="${index}" aria-current="${index === ui.activeLyric ? "true" : "false"}"${index === ui.activeLyric ? ' class="active"' : ""}${Number.isFinite(line.time) ? ` data-music-lyric-time="${line.time}"` : ""}>${esc(line.text)}</p>`,
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

function panelHtml({ track } = {}) {
  return `<section class="reader-music-services" data-music-services>
    <header><span><small>SERVICIOS EXTERNOS</small><b>Buscar y reconocer</b></span><em>HANAMI · v137</em></header>
    <nav aria-label="Servicios de música">
      <button data-music-service-tab="soundcloud" class="${ui.tab === "soundcloud" ? "active" : ""}">Buscar</button>
      <button data-music-service-tab="lyrics" class="${ui.tab === "lyrics" ? "active" : ""}">Letras</button>
    </nav>
    ${soundCloudPanelHtml(track)}
    ${lyricsPanelHtml(track)}
  </section>`;
}
function lyricsOnlyHtml({ track } = {}) {
  return `<section class="reader-music-services player-lyrics-only" data-music-services>${lyricsPanelHtml(track)}</section>`;
}
async function openLyrics() {
  ui.tab = "lyrics";
  if (trackKey(currentTrack()) !== ui.trackKey) hydrateLyrics();
  render();
  if (currentTrack() && !ui.lyrics) await loadLyrics();
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

async function searchSoundCloud(query = ui.query, { urlOnly = false } = {}) {
  const value = compact(query);
  if (urlOnly) {
    let url;
    try { url = new URL(value); } catch {}
    const host = url?.hostname.toLowerCase().replace(/^(www|m)\./, "");
    if (!url || url.protocol !== "https:" || url.username || url.password ||
        !["soundcloud.com", "on.soundcloud.com"].includes(host)) {
      ui.query = value;
      ui.results = [];
      ui.searchStatus = "Por ahora, pega una URL HTTPS de una canción de SoundCloud; no se aceptan búsquedas por nombre.";
      pickerError = ui.searchStatus;
      render();
      return;
    }
  }
  if (!value) {
    ui.searchStatus = "Escribe una canción, artista o enlace de SoundCloud.";
    render();
    return;
  }
  ui.query = value;
  const request = ++soundCloudSearchToken;
  ui.searchBusy = true;
  ui.recognitionStatus = "";
  ui.searchStatus = /^https:\/\//i.test(value)
    ? "Comprobando el enlace con SoundCloud…"
    : "Buscando en SoundCloud…";
  render();
  try {
    const params = new URLSearchParams({ q: value });
    const data = await apiJson(`/api/music/soundcloud/search?${params}`);
    if (request !== soundCloudSearchToken) return;
    ui.results = Array.isArray(data.results) ? data.results : [];
    ui.searchStatus = ui.results.length
      ? `${ui.results.length} resultado${ui.results.length === 1 ? "" : "s"} reproducible${ui.results.length === 1 ? "" : "s"} mediante SC.Widget.`
      : "No se encontraron pistas reproducibles para esta búsqueda.";
  } catch (error) {
    if (request !== soundCloudSearchToken) return;
    ui.results = [];
    if (error?.kind === "soundcloud_not_configured") ui.searchConfigured = false;
    ui.searchStatus = error?.message || "No se pudo buscar en SoundCloud.";
  } finally {
    if (request === soundCloudSearchToken) {
      ui.searchBusy = false;
      render();
    }
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
  const request = ++ui.lyricsRequest;
  const key = trackKey(track);
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
    if (request !== ui.lyricsRequest || key !== trackKey(currentTrack())) return;
    const parsed = parseLrc(result.lyrics);
    ui.lyrics = { ...result, ...parsed };
    ui.lyricsStatus = `${parsed.synced ? "Letras sincronizadas" : "Letras"} de ${result.provider}.`;
    saveLyricsCache(trackKey(track), result);
    ui.activeLyric = -1;
  } catch (error) {
    if (request !== ui.lyricsRequest || key !== trackKey(currentTrack())) return;
    ui.lyrics = null;
    ui.lyricsStatus = error?.message || "No se encontraron letras.";
  } finally {
    if (request === ui.lyricsRequest) { ui.lyricsBusy = false; render(); }
  }
}

function connect(nextAdapter) {
  adapter = nextAdapter;
  hydrateLyrics();
  widgetState.widget?.setVolume?.(100);
  void loadSoundCloudWidgetApi().catch(() => {});
  void loadCapabilities();
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
    const current = Number(node.dataset.musicLyric) === active;
    node.classList.toggle("active", current);
    node.setAttribute("aria-current", current ? "true" : "false");
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
    picker: {
      open: !!picker,
      pageIndex: picker?.context?.pageIndex ?? null,
      recentCount: recentTracks().length,
      trendsCount: discoverySnapshot().trends.length,
      trendsStatus: discoverySnapshot().trendsStatus,
    },
    soundcloud: {
      ready: widgetState.ready,
      paused: widgetState.paused,
      permalinkUrl: widgetState.permalinkUrl,
      position: widgetState.position,
      duration: widgetState.duration,
      playbackError: ui.playbackError,
    },
  };
}

const service = {
  connect,
  panelHtml,
  lyricsOnlyHtml,
  openLyrics,
  prepareLibrary: () => { ui.tab = "soundcloud"; },
  onPlayerChange,
  syncUi,
  snapshot,
  handlesPlayback,
  loadPlayback,
  togglePlayback,
  pausePlayback,
  stopPlayback,
  seekPlayback,
  getPlaybackPosition,
  getPlaybackDuration,
  isPlaybackPaused,
  openPicker,
  closePicker,
};

if (typeof document !== "undefined") {
  addEventListener("hanami-music-discovery-change", renderPicker);
  addEventListener("hanami-reader-player-personal-change", renderPicker);
  addEventListener("resize", updatePickerNavigation);
  document.addEventListener("input", (event) => {
    const target = event.target;
    if (target.matches("[data-music-soundcloud-query]")) ui.query = target.value;
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