import { READING_MODES, normalizeReadingMode, readingModeInfo, followsReadingPins, trackEndAction } from "./reader-music-policy.js";
import { playerHtml, syncPlayer, installPlayerUI, closeTool } from "./reader-player-view.js";
/*
 * Hanami Reader Music — browser adaptation informed by TSuki's GPL-3.0
 * MediaTrack, local library, editable queue and compact/full player concepts.
 * Upstream attribution: THIRD_PARTY_NOTICES.md
 */
const DB_NAME = "hanami-reader-music-v1";
const DB_VERSION = 1;
const TRACK_STORE = "tracks";
const STATE_KEY = "hanami-reader-music-state-v1";
const MAX_LOCAL_FILE_BYTES = 250 * 1024 * 1024;
const FIXED_VOLUME = 1;
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const defaults = {
  queue: [],
  index: -1,
  position: 0,
  shuffle: false,
  repeat: "off",
  readingMode: "pin-loop",
  queueVisited: [],
};
function readState() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STATE_KEY) || "{}") };
  } catch {
    return { ...defaults };
  }
}
const state = readState();
state.queue = Array.isArray(state.queue) ? state.queue : [];
state.index = Number.isInteger(state.index) ? state.index : -1;
state.repeat = ["off", "all", "one"].includes(state.repeat)
  ? state.repeat
  : "off";
state.readingMode = normalizeReadingMode(state.readingMode);
state.queueVisited = Array.isArray(state.queueVisited) ? state.queueVisited.filter((id) => state.queue.includes(id)) : [];
state.repeat = readingModeInfo(state.readingMode).legacyRepeat;
for (const legacyPreference of [
  "volume",
  "crossfade",
  "crossfadeSeconds",
  "sleepAt",
  "sleepEnd",
])
  delete state[legacyPreference];

let tracks = [];
let active = new Audio();
let playing = false;
let panelOpen = false;
let search = "";
let statusMessage = "";
let savePositionAt = 0;
let loadToken = 0;
let playbackSessionId = "";
let confirmedPlaybackSessionId = "";
let externalServices = null;
let resolveExternalServicesReady = null;
const externalServicesReady = new Promise((resolve) => {
  resolveExternalServicesReady = resolve;
});
const objectUrls = new WeakMap();
const shuffleHistory = [];
let waitingForPin = false;
let queueFinished = false;
let readingSuspended = false;
let currentPin = null;
let playerPreviousFocus = null;
let playerInertNodes = [];

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TRACK_STORE)) {
        const store = db.createObjectStore(TRACK_STORE, { keyPath: "id" });
        store.createIndex("addedAt", "addedAt");
        store.createIndex("title", "title");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function allTracks() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(TRACK_STORE).objectStore(TRACK_STORE).getAll();
    request.onsuccess = () => {
      db.close();
      resolve(request.result || []);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}
async function putTrack(track) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TRACK_STORE, "readwrite");
    tx.objectStore(TRACK_STORE).put(track);
    tx.oncomplete = () => {
      db.close();
      resolve(track);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
async function removeTrackRecord(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TRACK_STORE, "readwrite");
    tx.objectStore(TRACK_STORE).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
function persist() {
  const position = playbackPosition();
  state.position = position;
  localStorage.setItem(
    STATE_KEY,
    JSON.stringify({
      queue: state.queue,
      index: state.index,
      position,
      shuffle: state.shuffle,
      repeat: state.repeat,
      readingMode: state.readingMode,
      queueVisited: [...state.queueVisited],
    }),
  );
}
function trackById(id) {
  return tracks.find((track) => track.id === id) || null;
}
function currentTrack() {
  return trackById(state.queue[state.index]);
}
function externalPlayback(track = currentTrack()) {
  return !!track && !!externalServices?.handlesPlayback?.(track);
}
function requiresExternalPlayback(track = currentTrack()) {
  return (
    !!track &&
    (track.type === "external" || track.provider === "soundcloud")
  );
}
async function waitForExternalServices(timeout = 3_000) {
  if (externalServices) return true;
  await Promise.race([
    externalServicesReady,
    new Promise((resolve) => setTimeout(resolve, timeout)),
  ]);
  return !!externalServices;
}
function playbackPosition(track = currentTrack()) {
  if (externalPlayback(track)) {
    const value = Number(externalServices?.getPlaybackPosition?.());
    return Number.isFinite(value) ? Math.max(0, value) : Number(state.position) || 0;
  }
  return Number.isFinite(active.currentTime)
    ? Math.max(0, active.currentTime)
    : Number(state.position) || 0;
}
function playbackDuration(track = currentTrack()) {
  if (externalPlayback(track)) {
    const value = Number(externalServices?.getPlaybackDuration?.());
    return Number.isFinite(value) && value > 0 ? value : Number(track?.duration) || 0;
  }
  return Number.isFinite(active.duration) && active.duration > 0
    ? active.duration
    : Number(track?.duration) || 0;
}
function playbackPaused(track = currentTrack()) {
  if (externalPlayback(track)) {
    const value = externalServices?.isPlaybackPaused?.();
    return typeof value === "boolean" ? value : !playing;
  }
  return active.paused;
}
function formatTime(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const rest = Math.floor(value % 60);
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}
function normalizedFileName(name) {
  return String(name || "Pista")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[_]+/g, " ")
    .trim();
}
function titleFromFile(name) {
  const clean = normalizedFileName(name);
  const parts = clean.split(/\s+-\s+/);
  return {
    title: parts.length > 1 ? parts.slice(1).join(" - ") : clean,
    artist: parts.length > 1 ? parts[0] : "Artista desconocido",
  };
}
function decodeText(bytes, encoding = 3) {
  try {
    if (encoding === 0)
      return new TextDecoder("iso-8859-1").decode(bytes).replace(/\0+$/g, "");
    if (encoding === 1 || encoding === 2)
      return new TextDecoder("utf-16").decode(bytes).replace(/\0+$/g, "");
    return new TextDecoder("utf-8").decode(bytes).replace(/\0+$/g, "");
  } catch {
    return "";
  }
}
function synchsafe(bytes, offset) {
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  );
}
async function id3Metadata(file) {
  const fallback = titleFromFile(file.name);
  const metadata = { ...fallback, album: "" };
  try {
    const bytes = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
    if (String.fromCharCode(...bytes.slice(0, 3)) !== "ID3") return metadata;
    const version = bytes[3];
    const limit = Math.min(bytes.length, 10 + synchsafe(bytes, 6));
    let offset = 10;
    while (offset + 10 <= limit) {
      const frame = String.fromCharCode(...bytes.slice(offset, offset + 4));
      if (!/^[A-Z0-9]{4}$/.test(frame)) break;
      const size =
        version === 4
          ? synchsafe(bytes, offset + 4)
          : new DataView(bytes.buffer, bytes.byteOffset + offset + 4, 4).getUint32(0);
      if (!size || offset + 10 + size > limit) break;
      if (["TIT2", "TPE1", "TALB"].includes(frame)) {
        const encoding = bytes[offset + 10];
        const value = decodeText(
          bytes.slice(offset + 11, offset + 10 + size),
          encoding,
        ).trim();
        if (value) {
          if (frame === "TIT2") metadata.title = value;
          if (frame === "TPE1") metadata.artist = value;
          if (frame === "TALB") metadata.album = value;
        }
      }
      offset += 10 + size;
    }
  } catch {}
  return metadata;
}
function probeDuration(blob) {
  return new Promise((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(blob);
    const finish = (duration = 0) => {
      URL.revokeObjectURL(url);
      audio.removeAttribute("src");
      resolve(Number.isFinite(duration) ? duration : 0);
    };
    const timer = setTimeout(() => finish(0), 5000);
    audio.onloadedmetadata = () => {
      clearTimeout(timer);
      finish(audio.duration);
    };
    audio.onerror = () => {
      clearTimeout(timer);
      finish(0);
    };
    audio.preload = "metadata";
    audio.src = url;
  });
}
function localId(file) {
  const raw = `${file.name}|${file.size}|${file.lastModified}`;
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `local-${(hash >>> 0).toString(36)}`;
}
async function importAudioFiles(fileList) {
  const files = [...fileList];
  const playlists = files.filter((file) => /\.m3u8?$/i.test(file.name));
  const audioFiles = files.filter(
    (file) => file.type.startsWith("audio/") || !/\.m3u8?$/i.test(file.name),
  );
  let imported = 0;
  const failures = [];
  for (const file of audioFiles) {
    if (!file.type.startsWith("audio/") && !/\.(mp3|m4a|aac|wav|ogg|opus|flac)$/i.test(file.name)) {
      failures.push(`${file.name}: formato no compatible`);
      continue;
    }
    if (file.size > MAX_LOCAL_FILE_BYTES) {
      failures.push(`${file.name}: supera 250 MB`);
      continue;
    }
    try {
      const [metadata, duration] = await Promise.all([
        id3Metadata(file),
        probeDuration(file),
      ]);
      const previous = trackById(localId(file));
      const record = {
        id: localId(file),
        title: metadata.title || normalizedFileName(file.name),
        artist: metadata.artist || "Artista desconocido",
        album: metadata.album || "",
        duration,
        type: "local",
        mime: file.type || "audio/mpeg",
        size: file.size,
        fileName: file.name,
        blob: file,
        addedAt: previous?.addedAt || Date.now(),
        updatedAt: Date.now(),
      };
      await putTrack(record);
      const index = tracks.findIndex((track) => track.id === record.id);
      if (index < 0) tracks.push(record);
      else tracks[index] = record;
      imported++;
    } catch (error) {
      failures.push(`${file.name}: ${error?.message || "no se pudo guardar"}`);
    }
  }
  for (const playlist of playlists) {
    try {
      imported += await importM3u(await playlist.text());
    } catch (error) {
      failures.push(`${playlist.name}: ${error?.message || "playlist inválida"}`);
    }
  }
  sortTracks();
  if (imported) {
    const persistence = navigator.storage?.persist?.();
    persistence?.catch?.(() => false);
  }
  statusMessage = failures.length
    ? `${imported} importada(s) · ${failures[0]}`
    : `${imported} canción${imported === 1 ? " importada" : "es importadas"}`;
  renderPanel();
  emit("library");
  return { imported, failures };
}
async function addRemoteTrack(url, metadata = {}) {
  let parsed;
  try {
    parsed = new URL(url, location.href);
  } catch {
    throw new Error("La URL no es válida.");
  }
  if (!/^https?:$/.test(parsed.protocol))
    throw new Error("Usa una URL directa http o https.");
  const inferred = titleFromFile(decodeURIComponent(parsed.pathname.split("/").pop() || parsed.hostname));
  const encodedUrl = btoa(unescape(encodeURIComponent(parsed.href)))
    .replace(/[^a-z0-9]/gi, "")
    .slice(-40);
  const soundcloudKey = String(
    metadata.soundcloudId || metadata.soundcloudUrn || "",
  ).replace(/[^a-z0-9_-]/gi, "-");
  const id =
    metadata.provider === "soundcloud"
      ? `soundcloud-${soundcloudKey || encodedUrl}`
      : `stream-${encodedUrl}`;
  const previous = trackById(id);
  const record = {
    id,
    title: metadata.title || inferred.title || "Emisión de audio",
    artist: metadata.artist || inferred.artist || parsed.hostname,
    album: metadata.album || "",
    duration: Number(metadata.duration) || 0,
    type: metadata.provider === "soundcloud" ? "external" : "stream",
    url: parsed.href,
    provider: metadata.provider || previous?.provider || "",
    soundcloudId: metadata.soundcloudId || previous?.soundcloudId || "",
    soundcloudUrn: metadata.soundcloudUrn || previous?.soundcloudUrn || "",
    permalinkUrl: metadata.permalinkUrl || previous?.permalinkUrl || parsed.href,
    userUrl: metadata.userUrl || previous?.userUrl || "",
    artwork: metadata.artwork || previous?.artwork || "",
    mimeType: metadata.mimeType || previous?.mimeType || "",
    addedAt: previous?.addedAt || Date.now(),
    updatedAt: Date.now(),
  };
  await putTrack(record);
  const index = tracks.findIndex((track) => track.id === id);
  if (index < 0) tracks.push(record);
  else tracks[index] = record;
  sortTracks();
  return record;
}
async function importM3u(text) {
  const lines = String(text).split(/\r?\n/);
  let pending = null;
  let count = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#EXTINF:")) {
      const match = line.match(/^#EXTINF:([\d-]+),(.*)$/i);
      const label = match?.[2] || "";
      const named = titleFromFile(label);
      pending = {
        duration: Math.max(0, Number(match?.[1]) || 0),
        ...named,
      };
      continue;
    }
    if (line.startsWith("#")) continue;
    try {
      await addRemoteTrack(line, pending || {});
      count++;
    } catch {}
    pending = null;
  }
  return count;
}
function sortTracks() {
  tracks.sort((a, b) =>
    `${a.title}|${a.artist}`.localeCompare(`${b.title}|${b.artist}`, "es", {
      sensitivity: "base",
    }),
  );
}
function revokeAudioUrl(audio) {
  const url = objectUrls.get(audio);
  if (url) URL.revokeObjectURL(url);
  objectUrls.delete(audio);
}
function sourceFor(track, audio) {
  revokeAudioUrl(audio);
  if (track?.blob instanceof Blob) {
    const url = URL.createObjectURL(track.blob);
    objectUrls.set(audio, url);
    return url;
  }
  return track?.url || "";
}
function waitMetadata(audio) {
  if (audio.readyState >= 1) return Promise.resolve();
  return Promise.race([
    new Promise((resolve) => audio.addEventListener("loadedmetadata", resolve, { once: true })),
    new Promise((resolve) => setTimeout(resolve, 1800)),
  ]);
}
async function loadAudio(audio, track, position = 0, autoplay = false) {
  const sourceKey = `${track.id}|${track.type === "file" ? "local" : track.url || ""}`;
  if (audio.dataset.musicSource === sourceKey && audio.src && audio.readyState >= 1) {
    // A repeat keeps the authorized media element and its source alive.
    audio.currentTime = clamp(position, 0, Math.max(0, Number.isFinite(audio.duration) ? audio.duration - 0.15 : position));
    if (autoplay) await audio.play();
    else audio.pause();
    return;
  }
  audio.pause();
  audio.preload = "auto";
  audio.volume = FIXED_VOLUME;
  audio.src = sourceFor(track, audio);
  audio.dataset.musicSource = sourceKey;
  audio.load();
  // Start inside the originating click task. Waiting for loadedmetadata first
  // loses transient user activation in Safari/iOS and some installed PWAs.
  let playError = null;
  const playPromise = autoplay
    ? audio.play().catch((error) => {
        playError = error;
      })
    : null;
  await waitMetadata(audio);
  if (Number.isFinite(position) && position > 0 && Number.isFinite(audio.duration))
    audio.currentTime = clamp(position, 0, Math.max(0, audio.duration - 0.15));
  if (playPromise) {
    await playPromise;
    if (playError) throw playError;
  }
}
function queueNextIndex({ ended = false } = {}) {
  if (!state.queue.length || state.index < 0) return -1;
  if (ended) {
    const unvisited = state.queue.map((id, index) => ({ id, index }))
      .filter((item) => !state.queueVisited.includes(item.id));
    const action = trackEndAction(state.readingMode, unvisited.length > 0);
    if (action === "repeat-track") return state.index;
    if (action === "wait-pin" || action === "stop") return -1;
    if (action === "restart-queue") {
      state.queueVisited = [];
      const candidates = state.queue.map((_, index) => index).filter((index) => state.queue.length === 1 || index !== state.index);
      return state.shuffle ? candidates[Math.floor(Math.random() * candidates.length)] : 0;
    }
    const nextInOrder = unvisited.find((item) => item.index > state.index) || unvisited[0];
    return state.shuffle ? unvisited[Math.floor(Math.random() * unvisited.length)].index : nextInOrder.index;
  }
  const next = state.index + 1;
  if (next < state.queue.length) return next;
  return state.readingMode === "queue-loop" ? 0 : -1;
}
function queuePreviousIndex() {
  if (!state.queue.length) return -1;
  if (state.shuffle && shuffleHistory.length) return shuffleHistory.pop();
  if (state.index > 0) return state.index - 1;
  return state.readingMode === "queue-loop" ? state.queue.length - 1 : 0;
}
async function selectIndex(index, { autoplay = true, position = 0 } = {}) {
  const safe = Number(index);
  const track = trackById(state.queue[safe]);
  if (!track) return false;
  const token = ++loadToken;
  active.pause();
  playing = false;
  playbackSessionId = crypto.randomUUID();
  waitingForPin = false;
  queueFinished = false;
  active.volume = FIXED_VOLUME;
  statusMessage = "Cargando…";
  state.index = safe;
  state.position = position;
  persist();
  emit("loading");
  try {
    if (externalPlayback(track)) {
      const loaded = await externalServices.loadPlayback?.(track, {
        position,
        autoplay,
      });
      if (loaded === false)
        throw new Error("SoundCloud no pudo preparar esta canción.");
      const externalDuration = Number(loaded?.duration);
      if (Number.isFinite(externalDuration) && externalDuration > 0) {
        track.duration = externalDuration;
        track.updatedAt = Date.now();
        await putTrack(track);
      }
    } else {
      externalServices?.stopPlayback?.();
      try {
        await loadAudio(active, track, position, autoplay);
      } catch (loadError) {
        const recovered = await externalServices?.recoverLoadError?.(track, loadError);
        if (!recovered || typeof recovered !== "object") throw loadError;
        Object.assign(track, recovered, { updatedAt: Date.now() });
        await putTrack(track);
        await loadAudio(active, track, position, autoplay);
      }
    }
    if (token !== loadToken) return false;
    if (!state.queueVisited.includes(track.id)) state.queueVisited.push(track.id);
    if (autoplay) {
      playing = true;
      statusMessage = "";
    } else {
      playing = false;
      statusMessage = "Lista para reproducir";
    }
    updateMediaSession();
    persist();
    emit("track");
    return true;
  } catch (error) {
    if (token !== loadToken) return false;
    playing = false;
    statusMessage =
      error?.message ||
      (track.type === "stream"
        ? "No se pudo reproducir esta URL directa."
        : "No se pudo reproducir el archivo.");
    emit("error");
    return false;
  }
}
function setQueue(ids, startId = ids[0]) {
  const unique = [...new Set(ids)].filter((id) => trackById(id));
  state.queue = unique;
  state.index = Math.max(0, unique.indexOf(startId));
  state.position = 0;
  shuffleHistory.length = 0;
  state.queueVisited = [];
  persist();
}
async function playTrack(id) {
  readingSuspended = false;
  currentPin = null;
  const ordered = filteredTracks().map((track) => track.id);
  const ids = ordered.includes(id) ? ordered : tracks.map((track) => track.id);
  setQueue(ids, id);
  return selectIndex(state.index, { autoplay: true });
}
async function togglePlay() {
  const wasPlaying = playing;
  readingSuspended = wasPlaying;
  if (wasPlaying) ++loadToken;
  if (!wasPlaying) waitingForPin = false;
  if (queueFinished && state.queue.length) {
    readingSuspended = false;
    setQueue([...state.queue], state.queue[0]);
    return selectIndex(0, { autoplay: true });
  }
  if (!currentTrack()) {
    if (!tracks.length) {
      openPanel();
      statusMessage = "Añade canciones para empezar.";
      renderPanel();
      return;
    }
    setQueue(tracks.map((track) => track.id), tracks[0].id);
    await selectIndex(0, { autoplay: true });
    return playing;
  }
  if (externalPlayback()) {
    try {
      const result = await externalServices.togglePlayback?.(currentTrack(), {
        playing,
        position: playbackPosition(),
      });
      playing =
        typeof result?.playing === "boolean"
          ? result.playing
          : typeof result === "boolean"
            ? result
            : !playing;
      statusMessage = "";
    } catch (error) {
      playing = false;
      statusMessage =
        error?.message || "SoundCloud no permitió iniciar la reproducción.";
    }
    updateMediaSession();
    persist();
    emit("playback");
    return playing;
  }
  if (!active.src) {
    await selectIndex(state.index, {
      autoplay: true,
      position: Number(state.position) || 0,
    });
    return;
  }
  if (active.paused) {
    try {
      await active.play();
      playing = true;
      statusMessage = "";
    } catch {
      statusMessage = "Toca reproducir de nuevo para autorizar el audio.";
    }
  } else {
    active.pause();
    playing = false;
  }
  persist();
  emit("playback");
  return playing;
}
async function next({ ended = false } = {}) {
  // FINISH may arrive before the load promise's metadata write completes.
  // The song that just ended has been visited regardless of that timing.
  const endedId = ended ? state.queue[state.index] : null;
  if (endedId && !state.queueVisited.includes(endedId)) state.queueVisited.push(endedId);
  const target = queueNextIndex({ ended });
  if (target < 0) {
    ++loadToken;
    playing = false;
    waitingForPin = ended && state.readingMode === "pin-once";
    queueFinished = ended && state.readingMode === "queue-once";
    statusMessage = waitingForPin ? "Esperando a la siguiente pista de la lectura." : queueFinished ? "La lista ha terminado." : "";
    if (externalPlayback()) {
      externalServices?.pausePlayback?.();
    } else {
      active.pause();
    }
    state.position = playbackPosition();
    persist();
    updateMediaSession();
    emit("ended");
    return;
  }
  shuffleHistory.push(state.index);
  if (shuffleHistory.length > 50) shuffleHistory.shift();
  await selectIndex(target, { autoplay: true });
}
async function previous() {
  if (playbackPosition() > 5) {
    if (externalPlayback()) externalServices?.seekPlayback?.(0);
    else active.currentTime = 0;
    state.position = 0;
    persist();
    syncUi();
    return;
  }
  const target = queuePreviousIndex();
  if (target >= 0) await selectIndex(target, { autoplay: true });
}
function seek(seconds) {
  const duration = playbackDuration();
  if (!Number.isFinite(duration) || duration <= 0) return;
  const target = clamp(Number(seconds) || 0, 0, duration);
  if (externalPlayback()) externalServices?.seekPlayback?.(target);
  else active.currentTime = target;
  state.position = target;
  persist();
  syncUi();
}
function cycleRepeat() {
  const index = READING_MODES.findIndex((mode) => mode.id === state.readingMode);
  void setReadingMode(READING_MODES[(index + 1) % READING_MODES.length].id);
}
async function setReadingMode(value, { restart = true } = {}) {
  if (!READING_MODES.some((mode) => mode.id === value)) throw new Error("Modo de lectura no válido.");
  const changed = value !== state.readingMode;
  const autoplay = playing;
  state.readingMode = value;
  state.repeat = readingModeInfo(value).legacyRepeat;
  waitingForPin = false;
  queueFinished = false;
  persist();
  if (changed && restart && !followsReadingPins(value) && state.queue.length) {
    let ids = [...state.queue];
    if (currentPin?.id) {
      const readingQueue = await window.HanamiMusicDiscovery?.prepareReadingQueue?.();
      if (readingQueue?.length) ids = readingQueue;
    }
    if (state.readingMode !== value) return state.readingMode;
    currentPin = null;
    setQueue(ids, ids[0]);
    await selectIndex(0, { autoplay });
  }
  emit("preference");
  return value;
}
async function playPin(id, pin = {}, { automatic = false, queue = [] } = {}) {
  if (automatic && (!followsReadingPins(state.readingMode) || readingSuspended)) return false;
  if (!trackById(id)) return false;
  readingSuspended = false;
  waitingForPin = false;
  currentPin = { id: String(pin.id || ""), groupId: String(pin.groupId || "local-room"), title: String(pin.title || ""), viewerId: window.HanamiSocialSync?.state?.().user?.id || "" };
  const ordered = [...new Set([...queue, id])].filter((trackId) => trackById(trackId));
  setQueue(ordered.length ? ordered : [id], id);
  const success = await selectIndex(state.index, { autoplay: true });
  if (currentPin?.id !== String(pin.id || "")) return false;
  const finishedNaturally = waitingForPin && state.readingMode === "pin-once";
  if (!success && automatic && !finishedNaturally && !readingSuspended) {
    readingSuspended = true;
    statusMessage = "Pulsa Reproducir o el marcador para autorizar el audio de esta lectura.";
    emit("error");
  } else emit("pin");
  return success || finishedNaturally;
}
function stopPinPlayback(groupId, message = "Esta pista compartida ya no está disponible.") {
  if (currentPin?.groupId !== groupId || !followsReadingPins(state.readingMode)) return false;
  readingSuspended = true;
  waitingForPin = false;
  currentPin = null;
  active.pause();
  externalServices?.pausePlayback?.();
  playing = false;
  statusMessage = message;
  updateMediaSession();
  persist();
  emit("stop");
  return true;
}
function toggleShuffle() {
  state.shuffle = !state.shuffle;
  shuffleHistory.length = 0;
  persist();
  emit("preference");
}
function confirmListening() {
  if (!playing || !playbackSessionId || confirmedPlaybackSessionId === playbackSessionId) return;
  confirmedPlaybackSessionId = playbackSessionId;
  emit("listened");
}

function configureAudio(audio) {
  audio.preload = "auto";
  audio.volume = FIXED_VOLUME;
  audio.addEventListener("playing", () => {
    if (audio === active) confirmListening();
  });
  audio.addEventListener("play", () => {
    if (audio !== active) return;
    playing = true;
    updateMediaSession();
    emit("playback");
  });
  audio.addEventListener("pause", () => {
    if (audio !== active) return;
    playing = false;
    updateMediaSession();
    emit("playback");
  });
  audio.addEventListener("timeupdate", () => {
    if (audio !== active) return;
    state.position = audio.currentTime || 0;
    const now = Date.now();
    if (now - savePositionAt > 1800) {
      savePositionAt = now;
      persist();
    }
    updatePositionState();
    syncUi();
  });
  audio.addEventListener("ended", () => {
    if (audio === active) void next({ ended: true });
  });
  audio.addEventListener("error", () => {
    if (audio !== active || !audio.src) return;
    playing = false;
    statusMessage = "La pista no está disponible.";
    emit("error");
  });
}
configureAudio(active);

function filteredTracks() {
  const query = search.trim().toLocaleLowerCase("es");
  if (!query) return tracks;
  return tracks.filter((track) =>
    `${track.title} ${track.artist} ${track.album}`.toLocaleLowerCase("es").includes(query),
  );
}
function trackRow(track) {
  const selected = currentTrack()?.id === track.id;
  return `<article class="reader-music-track ${selected ? "current" : ""}" data-music-track="${esc(track.id)}">
    <button class="reader-music-track-main" data-music-play="${esc(track.id)}" aria-label="Reproducir ${esc(track.title)}">
      <i aria-hidden="true">${selected && playing ? "▮▮" : "♪"}</i>
      <span><b>${esc(track.title)}</b><small>${esc(track.artist)}${track.album ? ` · ${esc(track.album)}` : ""}</small></span>
      <time>${track.duration ? formatTime(track.duration) : track.type === "stream" ? "URL" : "—"}</time>
    </button>
    <button data-music-next-up="${esc(track.id)}" title="Reproducir después" aria-label="Reproducir después">＋</button>
    <button data-music-delete="${esc(track.id)}" title="Eliminar" aria-label="Eliminar de música">×</button>
  </article>`;
}
function queueRow(id, index) {
  const track = trackById(id);
  if (!track) return "";
  return `<article class="reader-music-queue-row ${index === state.index ? "current" : ""}" data-music-queue-index="${index}">
    <button data-music-queue-play="${index}" aria-current="${index === state.index ? "true" : "false"}" aria-label="Reproducir ${esc(track.title)}${index === state.index ? ", pista activa" : ""}" title="${esc(track.title)} — ${esc(track.artist)}"><small aria-hidden="true">${index === state.index ? "♪" : String(index + 1)}</small><span><b>${esc(track.title)}</b><em>${esc(track.artist)}</em></span></button>
    <button data-music-queue-up="${index}" aria-label="Subir en la cola" ${index === 0 ? "disabled" : ""}>↑</button>
    <button data-music-queue-down="${index}" aria-label="Bajar en la cola" ${index === state.queue.length - 1 ? "disabled" : ""}>↓</button>
    <button data-music-queue-remove="${index}" aria-label="Quitar de la cola">×</button>
  </article>`;
}
function repeatLabel() {
  return state.repeat === "one" ? "Repetir 1" : state.repeat === "all" ? "Repetir todo" : "Sin repetir";
}
function playerModel() {
  const track = currentTrack(), duration = playbackDuration(track), position = playbackPosition(track);
  return { track, tracks, queue: [...state.queue], index: state.index, playing, duration, position,
    durationText: formatTime(duration), positionText: formatTime(position), status: statusMessage,
    readingMode: state.readingMode, shuffle: state.shuffle, waitingForPin, readingSuspended };
}
function panelHtml() {
  const visible = filteredTracks();
  const track = currentTrack();
  const libraryHtml = `    <section class="reader-music-library">
      <header><div><small>BIBLIOTECA</small><b>${tracks.length} canción${tracks.length === 1 ? "" : "es"}</b></div><label class="reader-music-import"><input data-music-files type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac,.m3u,.m3u8" multiple><span>＋ Archivos locales</span></label></header>
      <input class="reader-music-search" data-music-search type="search" value="${esc(search)}" placeholder="Filtrar tu biblioteca" aria-label="Filtrar biblioteca de música">
      <div class="reader-music-list">${visible.length ? visible.map(trackRow).join("") : `<div class="reader-music-empty"><b>${tracks.length ? "Sin coincidencias" : "Tu biblioteca está vacía"}</b><span>${tracks.length ? "Prueba con otro filtro." : "Busca en SoundCloud, pega un enlace o añade archivos locales."}</span></div>`}</div>
      <details class="reader-music-manual"><summary>Fuente manual (opcional)</summary><div class="reader-music-url"><input data-music-url type="url" inputmode="url" placeholder="URL directa de audio o stream"><button data-music-add-url>Añadir URL</button></div></details>
    </section>
`;
  const queueHtml = `    <section class="reader-music-queue"><div>${state.queue.length ? state.queue.map(queueRow).join("") : '<p class="reader-music-empty">Selecciona una canción para crear la cola.</p>'}</div><footer><button data-music-shuffle-queue ${state.queue.length < 2 ? "disabled" : ""}>Mezclar cola</button><button data-music-clear-queue ${state.queue.length ? "" : "disabled"}>Vaciar cola</button></footer></section>`;
  return playerHtml(playerModel(), {
    libraryHtml: `${externalServices?.panelHtml?.({ track }) || ""}${libraryHtml}`,
    queueHtml,
    lyricsHtml: externalServices?.lyricsOnlyHtml?.({ track }) || "",
  });
}
function renderPanel() {
  if (!panelOpen) return;
  const body = document.querySelector("#readerSheetBody");
  if (!body) return;
  const focus = body.contains(document.activeElement) ? document.activeElement : null;
  const attribute = focus ? [...focus.attributes].find((entry) => entry.name === "id" || entry.name.startsWith("data-player-") || entry.name.startsWith("data-music-")) : null;
  const selector = attribute ? `[${attribute.name}="${CSS.escape(attribute.value)}"]` : "";
  const scroll = body.querySelector(".player-tool-sheet")?.scrollTop || 0;
  body.innerHTML = panelHtml();
  const toolSheet = body.querySelector(".player-tool-sheet");
  if (toolSheet) toolSheet.scrollTop = scroll;
  if (selector) body.querySelector(selector)?.focus({ preventScroll: true });
  syncUi();
}
function miniHtml() {
  return `<div id="readerMusicMini" class="reader-music-mini hidden">
    <button class="reader-music-mini-track" data-music-open aria-label="Abrir reproductor"><i>♪</i><span><b data-music-mini-title></b><small data-music-mini-artist></small></span></button>
    <button data-music-toggle aria-label="Reproducir o pausar">▶</button>
    <button data-music-next aria-label="Siguiente canción">›|</button>
    <em data-music-mini-progress></em>
  </div>`;
}
function attach() {
  const bottom = document.querySelector("#readerBottom");
  if (!bottom) return;
  if (!bottom.querySelector("#readerMusicMini"))
    bottom.insertAdjacentHTML("afterbegin", miniHtml());
  syncUi();
}
function syncUi() {
  const track = currentTrack();
  const duration = playbackDuration(track);
  const position = playbackPosition(track);
  document.querySelectorAll("[data-music-title]").forEach((node) => {
    node.textContent = track?.title || "Tu música para leer";
  });
  document.querySelectorAll("[data-music-artist]").forEach((node) => {
    node.textContent = track?.artist || "Elige una canción para empezar";
  });
  document.querySelectorAll("[data-music-position]").forEach((node) => {
    node.textContent = formatTime(position);
  });
  document.querySelectorAll("[data-music-duration]").forEach((node) => {
    node.textContent = formatTime(duration);
  });
  document.querySelectorAll("[data-music-seek]").forEach((node) => {
    if (document.activeElement !== node) node.value = clamp(position, 0, Math.max(1, duration));
    node.max = Math.max(1, duration);
    node.disabled = !track || duration <= 0;
    node.setAttribute("aria-valuetext", `${formatTime(position)} de ${formatTime(duration)}`);
  });
  document.querySelectorAll("[data-music-toggle]").forEach((button) => {
    button.textContent = playing ? "Ⅱ" : "▶";
    button.setAttribute("aria-label", playing ? "Pausar" : "Reproducir");
  });
  const mini = document.querySelector("#readerMusicMini");
  if (mini) {
    mini.classList.toggle("hidden", !track);
    const title = mini.querySelector("[data-music-mini-title]");
    const artist = mini.querySelector("[data-music-mini-artist]");
    const progress = mini.querySelector("[data-music-mini-progress]");
    if (title) title.textContent = track?.title || "";
    if (artist) artist.textContent = track?.artist || "";
    if (progress)
      progress.style.setProperty(
        "--music-progress",
        `${duration ? clamp((position / duration) * 100, 0, 100) : 0}%`,
      );
  }
  document.querySelectorAll("[data-r-music]").forEach((button) => {
    button.classList.toggle("on", !!track && playing);
    button.title = track ? `${playing ? "Sonando" : "En pausa"}: ${track.title}` : "Música";
  });
  const status = document.querySelector("[data-music-status]");
  if (status) status.textContent = statusMessage;
  syncPlayer(playerModel());
  externalServices?.syncUi?.({ track, position, duration, playing });
}
function openPanel(restoring = false) {
  attach();
  const sheet = document.querySelector("#readerSheet");
  if (!sheet || document.querySelector("#reader")?.classList.contains("hidden")) return false;
  if (!restoring && window.HanamiOverlays?.current?.() === sheet) {
    addEventListener("hanami-overlay-close", () => openPanel(), { once: true });
    window.HanamiOverlays.close();
    return true;
  }
  if (
    !restoring &&
    window.HanamiScreens?.is?.("reader") &&
    !window.HanamiScreens.is("reader-music")
  )
    window.HanamiScreens.push(
      "reader-music",
      {},
      {
        restore: () => openPanel(true),
        suspend: () => closePanel(true),
      },
    );
  if (!panelOpen) {
    playerPreviousFocus = document.activeElement;
    playerInertNodes = ["#readerViewport", "#readerTop", "#readerBottom"].map((selector) => document.querySelector(selector)).filter(Boolean).map((node) => [node, node.inert]);
    playerInertNodes.forEach(([node]) => { node.inert = true; });
  }
  panelOpen = true;
  sheet.classList.add("reader-player-open");
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", "Reproductor de música");
  renderPanel();
  sheet.classList.remove("hidden");
  dispatchEvent(new CustomEvent("hanami-reader-player-visibility", { detail: { open: true } }));
  if (!restoring) requestAnimationFrame(() => sheet.querySelector(".btn-collapse")?.focus({ preventScroll: true }));
  return true;
}
function closePanel(fromHistory = false) {
  if (
    !fromHistory &&
    window.HanamiScreens?.is?.("reader-music")
  ) {
    window.HanamiScreens.back();
    return;
  }
  panelOpen = false;
  closeTool(true);
  const sheet = document.querySelector("#readerSheet");
  sheet?.classList.add("hidden");
  sheet?.classList.remove("reader-player-open");
  ["role", "aria-modal", "aria-label"].forEach((name) => sheet?.removeAttribute(name));
  playerInertNodes.forEach(([node, previous]) => { if (node.isConnected) node.inert = previous; });
  playerInertNodes = [];
  dispatchEvent(new CustomEvent("hanami-reader-player-visibility", { detail: { open: false } }));
  if (playerPreviousFocus?.isConnected) playerPreviousFocus.focus({ preventScroll: true });
}
function emit(reason) {
  attach();
  externalServices?.onPlayerChange?.({
    reason,
    track: currentTrack(),
    playing,
    position: playbackPosition(),
  });
  if (["loading", "track", "queue", "library", "preference", "pin", "error"].includes(reason)) renderPanel();
  syncUi();
  dispatchEvent(
    new CustomEvent("hanami-reader-music-change", {
      detail: {
        reason,
        track: currentTrack(),
        playing,
        sessionId: playbackSessionId,
        queue: [...state.queue],
        index: state.index,
      },
    }),
  );
}
function updateMediaSession() {
  if (!("mediaSession" in navigator)) return;
  const track = currentTrack();
  if (track && "MediaMetadata" in window) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album || "Hanami · Música para leer",
      artwork: /^https:\/\//i.test(track.artwork || "")
        ? [{ src: track.artwork, sizes: "512x512" }]
        : [],
    });
  }
  navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  updatePositionState();
}
function updatePositionState() {
  if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
  const duration = playbackDuration();
  if (!Number.isFinite(duration) || duration <= 0) return;
  try {
    navigator.mediaSession.setPositionState({
      duration,
      playbackRate: externalPlayback() ? 1 : active.playbackRate || 1,
      position: clamp(playbackPosition(), 0, duration),
    });
  } catch {}
}
function setMediaActions() {
  if (!("mediaSession" in navigator)) return;
  const actions = {
    play: () => playbackPaused() && void togglePlay(),
    pause: () => !playbackPaused() && void togglePlay(),
    previoustrack: () => void previous(),
    nexttrack: () => void next(),
    seekto: (details) => seek(details.seekTime || 0),
    seekbackward: (details) => seek(playbackPosition() - (details.seekOffset || 10)),
    seekforward: (details) => seek(playbackPosition() + (details.seekOffset || 10)),
    stop: () => {
      readingSuspended = true;
      waitingForPin = false;
      active.pause();
      externalServices?.pausePlayback?.();
      playing = false;
      persist();
      emit("stop");
    },
  };
  for (const [action, handler] of Object.entries(actions)) {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {}
  }
}
function insertNext(id) {
  if (!trackById(id)) return;
  const oldIndex = state.queue.indexOf(id);
  if (oldIndex >= 0) {
    state.queue.splice(oldIndex, 1);
    if (oldIndex < state.index) state.index--;
  }
  const target = Math.max(0, state.index + 1);
  state.queue.splice(target, 0, id);
  if (state.index < 0) state.index = 0;
  persist();
  statusMessage = "Añadida para reproducir después.";
  renderPanel();
}
function moveQueue(from, to) {
  if (from < 0 || to < 0 || from >= state.queue.length || to >= state.queue.length) return;
  const [id] = state.queue.splice(from, 1);
  state.queue.splice(to, 0, id);
  if (state.index === from) state.index = to;
  else if (from < state.index && to >= state.index) state.index--;
  else if (from > state.index && to <= state.index) state.index++;
  persist();
  renderPanel();
}
async function removeQueueIndex(index) {
  if (index < 0 || index >= state.queue.length) return false;
  const wasPlaying = playing;
  const wasCurrent = index === state.index;
  const removedId = state.queue[index];
  if (wasCurrent) {
    ++loadToken;
    currentPin = null;
    waitingForPin = false;
    queueFinished = false;
  }
  state.queue.splice(index, 1);
  state.queueVisited = state.queueVisited.filter((id) => id !== removedId);
  shuffleHistory.length = 0;
  if (!state.queue.length) {
    active.pause();
    externalServices?.stopPlayback?.();
    revokeAudioUrl(active);
    active.removeAttribute("src");
    state.index = -1;
    state.position = 0;
    playing = false;
    statusMessage = "La cola está vacía.";
  } else if (index < state.index) state.index--;
  else if (wasCurrent) {
    state.index = Math.min(index, state.queue.length - 1);
    await selectIndex(state.index, { autoplay: wasPlaying });
  }
  persist();
  renderPanel();
  emit("queue");
  return true;
}
function removeFromQueue(id) {
  return removeQueueIndex(state.queue.indexOf(id));
}
async function deleteTrack(id) {
  const track = trackById(id);
  if (!track) return;
  await removeTrackRecord(id);
  tracks = tracks.filter((item) => item.id !== id);
  const positions = state.queue
    .map((item, index) => (item === id ? index : -1))
    .filter((index) => index >= 0)
    .reverse();
  for (const index of positions) await removeQueueIndex(index);
  statusMessage = `${track.title} eliminada.`;
  renderPanel();
  emit("library");
}
function clearQueue() {
  readingSuspended = true;
  waitingForPin = false;
  currentPin = null;
  active.pause();
  externalServices?.stopPlayback?.();
  revokeAudioUrl(active);
  active.removeAttribute("src");
  state.queue = [];
  state.index = -1;
  state.position = 0;
  playing = false;
  persist();
  renderPanel();
  emit("queue");
}
function shuffleQueue() {
  if (state.queue.length < 2) return;
  const current = state.queue[state.index];
  const rest = state.queue.filter((_, index) => index !== state.index);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  state.queue = current ? [current, ...rest] : rest;
  state.index = current ? 0 : -1;
  persist();
  renderPanel();
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("button,[data-music-open]");
  if (!button) return;
  if (button.hasAttribute("data-music-open")) openPanel();
  if (button.hasAttribute("data-music-close")) closePanel();
  if (button.hasAttribute("data-music-toggle")) await togglePlay();
  if (button.hasAttribute("data-music-prev")) await previous();
  if (button.hasAttribute("data-music-next")) await next();
  if (button.hasAttribute("data-music-shuffle")) toggleShuffle();
  if (button.hasAttribute("data-music-repeat")) cycleRepeat();
  if (button.dataset.musicPlay) await playTrack(button.dataset.musicPlay);
  if (button.dataset.musicNextUp) insertNext(button.dataset.musicNextUp);
  if (button.dataset.musicDelete) await deleteTrack(button.dataset.musicDelete);
  if (button.dataset.musicQueuePlay != null)
    await selectIndex(Number(button.dataset.musicQueuePlay), { autoplay: true });
  if (button.dataset.musicQueueUp != null)
    moveQueue(Number(button.dataset.musicQueueUp), Number(button.dataset.musicQueueUp) - 1);
  if (button.dataset.musicQueueDown != null)
    moveQueue(Number(button.dataset.musicQueueDown), Number(button.dataset.musicQueueDown) + 1);
  if (button.dataset.musicQueueRemove != null)
    await removeQueueIndex(Number(button.dataset.musicQueueRemove));
  if (button.hasAttribute("data-music-shuffle-queue")) shuffleQueue();
  if (button.hasAttribute("data-music-clear-queue")) clearQueue();
  if (button.hasAttribute("data-music-add-url")) {
    const input = document.querySelector("[data-music-url]");
    try {
      const track = await addRemoteTrack(input?.value || "");
      if (input) input.value = "";
      statusMessage = `${track.title} añadida.`;
      renderPanel();
      emit("library");
    } catch (error) {
      statusMessage = error?.message || "No se pudo añadir la URL.";
      syncUi();
    }
  }
});
document.addEventListener("change", async (event) => {
  const target = event.target;
  if (target.matches("[data-music-files]")) {
    statusMessage = "Importando canciones…";
    syncUi();
    await importAudioFiles(target.files || []);
    target.value = "";
  }
  if (target.matches("[data-music-seek]")) seek(target.value);
});
document.addEventListener("input", (event) => {
  const target = event.target;
  if (target.matches("[data-music-search]")) {
    search = target.value;
    const list = document.querySelector(".reader-music-list");
    if (list) {
      const visible = filteredTracks();
      list.innerHTML = visible.length
        ? visible.map(trackRow).join("")
        : '<div class="reader-music-empty"><b>Sin coincidencias</b><span>Prueba con otra búsqueda.</span></div>';
    }
  }
  if (target.matches("[data-music-seek]")) {
    const position = document.querySelector("[data-music-position]");
    if (position) position.textContent = formatTime(target.value);
  }
});
document.addEventListener(
  "keydown",
  (event) => {
    if (document.querySelector(".reader-music-picker")) return;
    if (panelOpen && event.key === "Escape" && document.querySelector(".player-tool-sheet")) return;
    if (panelOpen && event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      closePanel();
      return;
    }
    if (event.target.closest?.(".reader-music") && event.key === " ")
      event.stopPropagation();
  },
  true,
);
addEventListener("pagehide", persist);
addEventListener("beforeunload", persist);

function updateExternalPlayback(update = {}) {
  const track = currentTrack();
  if (!externalPlayback(track)) return false;
  if (
    update.permalinkUrl &&
    track.permalinkUrl &&
    update.permalinkUrl !== track.permalinkUrl
  )
    return false;
  const position = Number(update.position);
  if (Number.isFinite(position) && position >= 0) state.position = position;
  const duration = Number(update.duration);
  if (Number.isFinite(duration) && duration > 0 && Math.abs((track.duration || 0) - duration) > 0.25) {
    track.duration = duration;
    track.updatedAt = Date.now();
    void putTrack(track).catch(() => {});
  }
  if (typeof update.playing === "boolean") playing = update.playing;
  if (update.error) {
    playing = false;
    statusMessage = String(update.error);
  } else if (update.reason === "play") statusMessage = "";
  updateMediaSession();
  if (update.ended) {
    playing = false;
    persist();
    emit("ended");
    void next({ ended: true });
    return true;
  }
  if (update.reason === "progress") {
    const now = Date.now();
    if (now - savePositionAt > 1_800) {
      savePositionAt = now;
      persist();
    }
    updatePositionState();
    syncUi();
    // PLAY can be absent on SC.Widget.load(); confirmed progress is evidence too.
    if (playing && state.position > 0.05) confirmListening();
    return true;
  }
  persist();
  emit(update.reason || "external");
  return true;
}

function registerExternalServices(services) {
  externalServices = services || null;
  if (externalServices && resolveExternalServicesReady) {
    resolveExternalServicesReady(true);
    resolveExternalServicesReady = null;
  }
  externalServices?.connect?.({
    getCurrentTrack: currentTrack,
    getPosition: playbackPosition,
    getDuration: playbackDuration,
    getPlaying: () => playing,
    getStatus: () => statusMessage,
    addRemoteTrack,
    playTrack,
    updateExternalPlayback,
    render: renderPanel,
    sync: syncUi,
    setStatus: (message) => {
      statusMessage = String(message || "");
      syncUi();
    },
  });
  renderPanel();
  return !!externalServices;
}

installPlayerUI({
  track: currentTrack,
  open: () => openPanel(true),
  render: renderPanel,
  sync: syncUi,
  setMode: setReadingMode,
  playList: async (ids, startId = ids[0]) => {
    await setReadingMode("queue-once", { restart: false });
    readingSuspended = false;
    currentPin = null;
    setQueue(ids, startId);
    return selectIndex(state.index, { autoplay: true });
  },
});

const ready = (async () => {
  try {
    tracks = await allTracks();
    const retired = tracks.filter((track) => !!track?.videoId);
    if (retired.length) {
      await Promise.all(retired.map((track) => removeTrackRecord(track.id)));
      tracks = tracks.filter((track) => !retired.includes(track));
      statusMessage = `${retired.length} pista${retired.length === 1 ? "" : "s"} de proveedores retirados eliminada${retired.length === 1 ? "" : "s"}.`;
    }
    sortTracks();
    state.queue = state.queue.filter((id) => trackById(id));
    if (!state.queue.length) state.index = -1;
    else state.index = clamp(state.index, 0, state.queue.length - 1);
    const restoredTrack = currentTrack();
    if (restoredTrack) {
      readingSuspended = true;
      const bridgeReady =
        !requiresExternalPlayback(restoredTrack) ||
        (await waitForExternalServices());
      if (bridgeReady)
        await selectIndex(state.index, {
          autoplay: false,
          position: Number(state.position) || 0,
        });
      else {
        playing = false;
        statusMessage =
          "El reproductor externo no está disponible. Recarga Hanami para volver a intentarlo.";
      }
    }
    persist();
    emit("ready");
  } catch (error) {
    statusMessage = `Música no disponible: ${error?.message || "error de almacenamiento"}`;
    console.error("[Hanami Reader Music]", error);
  }
  return true;
})();
window.HanamiScreens?.registerType?.("reader-music", async (record) => {
  await ready;
  if (!openPanel(true)) return false;
  window.HanamiScreens.register(record.id, {
    restore: () => openPanel(true),
    suspend: () => closePanel(true),
  });
  return true;
});
setMediaActions();

window.HanamiReaderMusic = {
  ready,
  open: openPanel,
  close: closePanel,
  attach,
  importFiles: importAudioFiles,
  addUrl: addRemoteTrack,
  play: playTrack,
  playPin,
  stopPinPlayback,
  setReadingMode,
  toggleShuffle,
  setQueue: async (ids, startId) => {
    const autoplay = playing;
    currentPin = null;
    setQueue(ids, startId);
    const result = state.queue.length ? await selectIndex(state.index, { autoplay }) : false;
    renderPanel(); emit("queue"); return result;
  },
  toggle: togglePlay,
  next,
  previous,
  seek,
  remove: deleteTrack,
  removeFromQueue,
  registerExternalServices,
  listTracks: () => tracks.map(({ blob, ...track }) => ({ ...track, hasBlob: !!blob })),
  snapshot: () => ({
    tracks: tracks.map(({ blob, ...track }) => ({ ...track, hasBlob: !!blob })),
    queue: [...state.queue],
    index: state.index,
    current: currentTrack()?.id || null,
    playing,
    position: playbackPosition(),
    duration: playbackDuration(),
    shuffle: state.shuffle,
    repeat: state.repeat,
    readingMode: state.readingMode,
    queueVisited: [...state.queueVisited],
    waitingForPin,
    queueFinished,
    readingSuspended,
    pin: currentPin ? { ...currentPin } : null,
    panelOpen,
    external: externalServices?.snapshot?.() || null,
  }),
};
