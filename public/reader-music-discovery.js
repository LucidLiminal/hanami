import { followsReadingPins, chooseVisiblePin } from "./reader-music-policy.js";
import { isRemoteMusicGroup, queueSharedPin, sharedBindingsFor, sharedMusicSnapshot, scheduleGroupPins, hasPendingMusicPin } from "./reader-music-group.js";
import { installPinCards, renderPinCards, syncPinCards } from "./reader-music-pin-cards.js";
/*
 * Personal listening history stays local. Community trends receive only public
 * SoundCloud activity, never reading coordinates or comments. Page coordinates
 * and public track metadata are shared separately with authorized members of
 * the selected private reading group; local audio files are never uploaded.
 */
const STORAGE_KEY = "hanami-reader-music-discovery-v1";
const MAX_RECENT = 30;
const MAX_PENDING = 500;
const MAX_BINDINGS = 2000;

export function canonicalMusicUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");
    if (url.protocol !== "https:" || host !== "soundcloud.com" || url.username || url.password) return "";
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 2 || ["sets", "likes", "tracks", "albums", "reposts"].includes(parts[1])) return "";
    if (!parts.every((part) => /^[a-zA-Z0-9_.-]+$/.test(part))) return "";
    return `https://soundcloud.com/${parts.join("/")}`;
  } catch { return ""; }
}

export function instancePageKey(context = {}) {
  return JSON.stringify([
    context.groupId || "local-room",
    context.sourceId || "",
    context.mangaUrl || context.mangaId || "",
    context.chapterUrl || "",
    Number(context.pageIndex) || 0,
  ]);
}

function read() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      history: Array.isArray(parsed.history) ? parsed.history.slice(0, MAX_RECENT) : [],
      bindings: Array.isArray(parsed.bindings) ? parsed.bindings.slice(0, MAX_BINDINGS) : [],
      pending: Array.isArray(parsed.pending) ? parsed.pending.slice(0, MAX_PENDING) : [],
    };
  } catch { return { history: [], bindings: [], pending: [] }; }
}

const state = read();
let trends = [];
let trendsStatus = "idle";
let trendsMessage = "";
let syncError = "";
let syncing = false;
let trendsRequest = 0;
const countedSessions = new Set();
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const incognito = () => {
  try { return JSON.parse(localStorage.getItem("hanami-incognito") || "false") === true; }
  catch { return false; }
};

function emit() {
  if (typeof window !== "undefined") dispatchEvent(new CustomEvent("hanami-music-discovery-change"));
}
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    syncError = "No queda espacio para guardar el historial y las pistas de página.";
    return false;
  }
}
let libraryText = null;
let libraryItems = [];
function savedLibrary() {
  try {
    if (typeof localStorage === "undefined") return [];
    const text = localStorage.getItem("hanami-library") || "[]";
    if (text !== libraryText) {
      libraryText = text;
      const parsed = JSON.parse(text);
      libraryItems = Array.isArray(parsed) ? parsed : [];
    }
    return libraryItems;
  } catch { return []; }
}
export function canonicalLibraryPageKey(key, library = []) {
  try {
    const parts = JSON.parse(key);
    if (!Array.isArray(parts) || parts.length !== 5) return key;
    const work = library.find((item) => item.sourceId === parts[1] && item.id === parts[2] && typeof item.url === "string" && item.url);
    if (!work) return key;
    return JSON.stringify([parts[0], parts[1], work.url, parts[3], parts[4]]);
  } catch { return key; }
}
function migrateLegacyMusicBindings() {
  const original = state.bindings;
  let changed = false;
  state.bindings = original.map((binding) => {
    if (binding.shareState && binding.shareState !== "local") return binding;
    const pageKey = canonicalLibraryPageKey(binding.pageKey, savedLibrary());
    if (pageKey === binding.pageKey) return binding;
    changed = true;
    return { ...binding, pageKey };
  });
  if (changed && !save()) state.bindings = original;
}
function scope(context = {}) {
  // Library readers historically supplied a device-local mangaId but no URL.
  // Resolve music's identity only; leave comment and progress keys unchanged.
  const work = !context.mangaUrl && context.mangaId ? savedLibrary().find((item) =>
    item.id === context.mangaId && item.sourceId === context.sourceId) : null;
  return { ...context, mangaUrl: context.mangaUrl || work?.url || "", groupId: context.groupId || window.HanamiReadingGroups?.activeId?.() || "local-room" };
}
migrateLegacyMusicBindings();
function publicMetadata(track) {
  const url = canonicalMusicUrl(track.permalinkUrl || track.url);
  if (!url || track.provider !== "soundcloud") return null;
  const artwork = String(track.artwork || "").trim();
  return {
    url,
    title: String(track.title || "Pista de SoundCloud").slice(0, 200),
    artist: String(track.artist || "SoundCloud").slice(0, 160),
    // The shared-pin RPC deliberately accepts only SoundCloud's image CDN.
    // Other cover sources stay visible locally but must not block the outbox.
    artwork: /^https:\/\/i[0-9]*\.sndcdn\.com\//i.test(artwork) ? artwork.slice(0, 2048) : "",
    duration: Math.max(0, Math.min(86400, Number(track.duration) || 0)),
  };
}
function canShareBinding(groupId, metadata, connection = window.HanamiSocialSync?.state?.() || {}) {
  return isRemoteMusicGroup(groupId) && !!metadata && connection.configured &&
    connection.authenticated && !incognito();
}
function pageContextForBinding(binding) {
  try {
    const [groupId, sourceId, mangaUrl, chapterUrl, pageIndex] = JSON.parse(binding.pageKey);
    if (![groupId, sourceId, mangaUrl, chapterUrl].every((value) => typeof value === "string"))
      return null;
    return {
      groupId, sourceId, mangaUrl, chapterUrl, pageIndex: Number(pageIndex) || 0,
      x: Math.max(0, Math.min(1, Number(binding.x) || 0)),
      y: Math.max(0, Math.min(1, Number(binding.y) || 0)),
    };
  } catch { return null; }
}
function recordActivity(track, kind) {
  if (incognito()) return;
  const metadata = publicMetadata(track);
  const social = window.HanamiSocialSync?.state?.();
  if (!metadata || !social?.configured || !social.authenticated || !social.user?.id) return;
  if (state.pending.length >= MAX_PENDING) {
    syncError = "La actividad pendiente está llena. Se enviará cuando vuelva la conexión.";
    return;
  }
  const activity = { id: crypto.randomUUID(), actorId: social.user.id, kind, track: metadata };
  state.pending.push(activity);
  if (!save()) {
    state.pending.pop();
    return;
  }
  void flushActivity();
}

export function noteListen(track, sessionId) {
  if (!track?.id || !sessionId || incognito() || countedSessions.has(sessionId)) return false;
  countedSessions.add(sessionId);
  if (countedSessions.size > 1000) countedSessions.delete(countedSessions.values().next().value);
  const previous = state.history.find((item) => item.id === track.id);
  state.history = [
    { id: track.id, lastPlayedAt: Date.now(), playCount: (Number(previous?.playCount) || 0) + 1 },
    ...state.history.filter((item) => item.id !== track.id),
  ].slice(0, MAX_RECENT);
  save();
  recordActivity(track, "play");
  emit();
  return true;
}

export function recentTracks() {
  const tracks = window.HanamiReaderMusic?.listTracks?.() || [];
  return state.history.map((item) => {
    const track = tracks.find((entry) => entry.id === item.id);
    return track ? { ...track, ...item } : null;
  }).filter(Boolean);
}

export function assignTrack(track, context, { replaceBindingId = "" } = {}) {
  if (!track?.id || !context) throw new Error("Selecciona una pista y una página válidas.");
  const scoped = scope(context);
  const pageKey = instancePageKey(scoped);
  const x = Math.max(0, Math.min(1, Number(scoped.x) || 0));
  const y = Math.max(0, Math.min(1, Number(scoped.y) || 0));
  const connection = window.HanamiSocialSync?.state?.() || {};
  const actorId = connection.user?.id || "";
  const metadata = publicMetadata(track);
  const shouldShare = canShareBinding(scoped.groupId, metadata, connection);
  const requestedId = String(replaceBindingId || "");
  const replacement = requestedId ? state.bindings.find((item) => item.id === requestedId && !item.deletedAt) : null;
  if (requestedId && (!replacement || !canChangeBinding(replacement)))
    throw new Error("Ya no puedes cambiar esta pista.");
  if (replacement && replacement.pageKey !== pageKey)
    throw new Error("La pista ya no pertenece a esta página.");
  if (replacement && ["shared", "pending"].includes(replacement.shareState) &&
    isRemoteMusicGroup(replacement.groupId) && !metadata)
    throw new Error("Una pista compartida solo puede cambiarse por una canción de SoundCloud.");
  const previous = replacement || state.bindings.find((item) => item.pageKey === pageKey &&
    (!item.actorId || item.actorId === actorId) && !item.deletedAt &&
    Math.hypot(item.x - x, item.y - y) < 0.03);
  if (!previous && state.bindings.length >= MAX_BINDINGS)
    throw new Error("Has alcanzado el límite de pistas guardadas en páginas.");
  const binding = {
    id: previous?.id || crypto.randomUUID(),
    pageKey, x, y, groupId: scoped.groupId, actorId,
    revision: (Number(previous?.revision) || 0) + 1,
    shareState: shouldShare ? "pending" : "local",
    trackId: track.id,
    track: {
      id: track.id, title: track.title, artist: track.artist, artwork: track.artwork || "",
      type: track.type, url: track.url || "", provider: track.provider || "",
      permalinkUrl: track.permalinkUrl || "", soundcloudId: track.soundcloudId || "",
      soundcloudUrn: track.soundcloudUrn || "", duration: Number(track.duration) || 0,
    },
    createdAt: previous?.createdAt || Date.now(),
  };
  const oldBindings = state.bindings;
  state.bindings = [...state.bindings.filter((item) => item.id !== binding.id), binding];
  if (!save()) {
    state.bindings = oldBindings;
    throw new Error(syncError);
  }
  if (!previous || previous.trackId !== track.id) recordActivity(track, "use");
  if (shouldShare && !queueSharedPin(binding, { ...metadata, soundcloudId: track.soundcloudId || "" })) {
    binding.shareState = "local";
    save();
  }
  renderAll();
  emit();
  return binding;
}

export async function flushActivity() {
  if (incognito()) return;
  if (syncing || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
  const social = window.HanamiSocialSync;
  await social?.ready;
  if (syncing) return;
  const identity = social?.state?.();
  if (!identity?.authenticated || !social.recordMusicActivity) return;
  const pending = state.pending.filter((item) => item.actorId === identity.user?.id);
  if (!pending.length) return;
  syncing = true;
  try {
    let item;
    while ((item = state.pending.find((entry) => entry.actorId === identity.user?.id))) {
      if (incognito()) break;
      await social.recordMusicActivity(item);
      state.pending = state.pending.filter((entry) => entry.id !== item.id);
      save();
    }
    syncError = "";
  } catch (error) {
    syncError = error.message || "La actividad se enviará cuando vuelva la conexión.";
  } finally { syncing = false; }
}

export async function loadTrends() {
  const request = ++trendsRequest;
  trendsStatus = "loading";
  trendsMessage = "Consultando la actividad de la comunidad…";
  emit();
  const social = window.HanamiSocialSync;
  await social?.ready;
  if (request !== trendsRequest) return;
  if (!social?.state?.().configured || !social.listMusicTrends) {
    trends = [];
    trendsStatus = "unavailable";
    trendsMessage = "Las tendencias necesitan el servidor compartido de Hanami. No se sustituyen por tu historial local.";
    emit();
    return;
  }
  try {
    const rows = await social.listMusicTrends(30);
    if (request !== trendsRequest) return;
    trends = (Array.isArray(rows) ? rows : []).filter((row) => canonicalMusicUrl(row.url)).map((row) => ({
      ...row,
      provider: "soundcloud",
      permalinkUrl: canonicalMusicUrl(row.url),
      plays: Math.max(0, Number(row.plays) || 0),
      uses: Math.max(0, Number(row.uses) || 0),
      listeners: Math.max(0, Number(row.listeners) || 0),
    }));
    trendsStatus = "ready";
    trendsMessage = trends.length
      ? "Lo más escuchado y usado por otros lectores en los últimos 30 días."
      : "Todavía no hay actividad de otros lectores. Las tendencias aparecerán cuando usen música en Hanami.";
  } catch (error) {
    if (request !== trendsRequest) return;
    trends = [];
    trendsStatus = "error";
    trendsMessage = /PGRST202|function.*not.*found|schema cache|record_reader_music|list_reader_music/i.test(`${error.code || ""} ${error.message}`)
      ? "Falta activar las tendencias en el servidor: aplica la migración hanami-reader-music-v136.sql."
      : "No se pudieron cargar las tendencias. Comprueba la conexión y vuelve a intentarlo.";
  }
  emit();
}

export function discoverySnapshot() {
  return { recent: recentTracks(), trends: [...trends], trendsStatus, trendsMessage, pendingCount: state.pending.length, syncError, shared: sharedMusicSnapshot(), bindings: state.bindings.map((item) => ({ ...item, track: { ...item.track } })) };
}

function figureContext(figure) {
  try { return scope(JSON.parse(figure.dataset.commentContext || "{}")); }
  catch { return scope({}); }
}
export function sharedPageKeys(groupId = window.HanamiReadingGroups?.activeId?.() || "local-room") {
  return [...new Set([...document.querySelectorAll("#readerViewport figure[data-comment-context]")].map((figure) =>
    instancePageKey({ ...figureContext(figure), groupId }),
  ))];
}
function bindingsForPage(pageKey) {
  const actor = window.HanamiSocialSync?.state?.().user?.id || "";
  const sharedState = sharedMusicSnapshot();
  const local = state.bindings.filter((item) => item.pageKey === pageKey &&
    (!item.actorId || !isRemoteMusicGroup(item.groupId) || item.actorId === actor) &&
    !(item.shareState === "shared" && sharedState.readDenied));
  return [...new Map([...sharedBindingsFor(pageKey), ...local].map((item) => [item.id, item])).values()].filter((item) => !item.deletedAt);
}
function renderFigure(figure) {
  if (!figure?.isConnected) return;
  const bindings = bindingsForPage(instancePageKey(figureContext(figure)));
  const image = figure.querySelector("img,iframe");
  if (!bindings.length || !image) { figure.querySelector(".reader-music-anchor-layer")?.remove(); delete figure.dataset.musicSignature; return; }
  const rect = image.getBoundingClientRect(), parent = figure.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const signature = JSON.stringify([rect.width, rect.height, rect.left - parent.left, rect.top - parent.top,
    bindings.map((item) => [item.id, item.x, item.y, item.track.title, item.track.artist, item.shareState])]);
  if (figure.dataset.musicSignature === signature && figure.querySelector(".reader-music-anchor-layer")) return;
  figure.dataset.musicSignature = signature;
  figure.querySelector(".reader-music-anchor-layer")?.remove();
  const layer = document.createElement("div");
  layer.className = "reader-music-anchor-layer";
  layer.setAttribute("aria-hidden", "true");
  layer.innerHTML = bindings.map((item) => {
    const left = rect.left - parent.left + Math.max(24, Math.min(rect.width - 24, item.x * rect.width));
    const top = rect.top - parent.top + Math.max(24, Math.min(rect.height - 24, item.y * rect.height));
    return `<span class="reader-music-anchor" data-reader-music-anchor="${esc(item.id)}" data-share-state="${esc(item.shareState || "local")}" style="left:${left}px;top:${top}px"></span>`;
  }).join("");
  figure.append(layer);
}
function renderAll() {
  if (typeof document === "undefined") return;
  document.querySelectorAll("#readerViewport figure[data-comment-context]").forEach(renderFigure);
  syncPinState();
  scheduleGroupPins();
  scheduleFollow();
}
function orderedBindings() {
  const result = [];
  document.querySelectorAll("#readerViewport figure[data-comment-context]").forEach((figure) => {
    bindingsForPage(instancePageKey(figureContext(figure))).sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id)).forEach((binding) => result.push(binding));
  });
  return result;
}
function canRemoveBinding(binding) {
  if (!["shared", "pending"].includes(binding.shareState) && !binding.remote) return true;
  if (incognito()) return false;
  const actor = window.HanamiSocialSync?.state?.().user?.id || "";
  if (!actor) return false;
  const group = window.HanamiReadingGroups?.groups?.().find((room) => room.id === binding.groupId);
  const member = group?.members?.find((person) => person.id === actor);
  const moderator = group?.ownerId === actor || member?.role === "moderator" || member?.role === "owner";
  return moderator || binding.actorId === actor && member?.state !== "muted" && member?.state !== "blocked";
}
function canChangeBinding(binding) {
  if (!binding || binding.remote) return false;
  if (!["shared", "pending"].includes(binding.shareState)) return true;
  if (incognito()) return false;
  const actor = window.HanamiSocialSync?.state?.().user?.id || "";
  if (!actor || binding.actorId !== actor) return false;
  const group = window.HanamiReadingGroups?.groups?.().find((room) => room.id === binding.groupId);
  const member = group?.members?.find((person) => person.id === actor);
  return member?.state !== "muted" && member?.state !== "blocked";
}
function editableBinding(id) {
  return state.bindings.find((item) => item.id === id && !item.deletedAt) || null;
}
export function changeBinding(id) {
  const binding = editableBinding(id);
  if (!binding || !canChangeBinding(binding))
    throw new Error("No tienes permiso para cambiar esta pista.");
  const context = pageContextForBinding(binding);
  if (!context) throw new Error("No se pudo recuperar el punto de lectura de esta pista.");
  const opened = window.HanamiReaderMusicServices?.openPicker?.({
    context, replaceBindingId: binding.id,
  });
  if (!opened) throw new Error("El selector de música todavía no está disponible.");
  return true;
}
export function replaceBindingTrack(id, track) {
  const binding = editableBinding(id);
  if (!binding || !canChangeBinding(binding))
    throw new Error("No tienes permiso para cambiar esta pista.");
  const context = pageContextForBinding(binding);
  if (!context) throw new Error("No se pudo recuperar el punto de lectura de esta pista.");
  // Do not let an asynchronous visibility check restart the previous song
  // between persisting this replacement and starting the selected song.
  followRequest++;
  followActiveId = binding.id;
  return assignTrack(track, context, { replaceBindingId: binding.id });
}
async function syncActiveReadingQueue() {
  const music = window.HanamiReaderMusic;
  const pinId = music?.snapshot?.().pin?.id;
  if (!music || !pinId) return;
  const queue = await prepareReadingQueue();
  if (music.snapshot?.().pin?.id === pinId) music.syncPinQueue?.(queue);
}
export function moveBinding(id, coordinate) {
  const binding = editableBinding(id);
  if (!binding || !canChangeBinding(binding))
    throw new Error("No tienes permiso para mover esta pista.");
  const y = Math.max(0, Math.min(1, Number(coordinate) || 0));
  if (Math.abs(y - (Number(binding.y) || 0)) < 0.0005) return binding;
  const connection = window.HanamiSocialSync?.state?.() || {};
  const metadata = publicMetadata(binding.track);
  const shouldShare = canShareBinding(binding.groupId, metadata, connection);
  const next = {
    ...binding, y, revision: (Number(binding.revision) || 0) + 1,
    shareState: shouldShare ? "pending" : "local",
  };
  const oldBindings = state.bindings;
  state.bindings = [...state.bindings.filter((item) => item.id !== binding.id), next];
  if (!save()) {
    state.bindings = oldBindings;
    throw new Error(syncError);
  }
  if (shouldShare && !queueSharedPin(next, { ...metadata, soundcloudId: binding.track.soundcloudId || "" })) {
    next.shareState = "local";
    save();
  }
  renderAll();
  emit();
  void syncActiveReadingQueue();
  return next;
}
async function resolveBindingTrack(binding) {
  const music = window.HanamiReaderMusic;
  await music.ready;
  let track = music.listTracks().find((item) => item.id === binding.trackId ||
    !!canonicalMusicUrl(binding.track.permalinkUrl || binding.track.url) && canonicalMusicUrl(item.permalinkUrl || item.url) === canonicalMusicUrl(binding.track.permalinkUrl || binding.track.url));
  if (!track && binding.track.url) track = await music.addUrl(binding.track.url, binding.track);
  if (!track) throw new Error("Esta pista local ya no está en tu biblioteca de música.");
  return track;
}
export async function prepareReadingQueue() {
  const ids = [];
  for (const binding of orderedBindings()) {
    try { const track = await resolveBindingTrack(binding); if (!ids.includes(track.id)) ids.push(track.id); }
    catch { /* Missing local files cannot be re-created on another device. */ }
  }
  return ids;
}
let followActiveId = "";
let followScope = "";
let lastTop = 0;
let direction = 1;
let visibleIds = new Set();
let followFrame = 0;
let followRequest = 0;
let lastMode = "pin-loop";
function syncPinState() {
  syncPinCards(window.HanamiReaderMusic?.snapshot?.());
}
function scheduleFollow() {
  if (followFrame) return;
  followFrame = requestAnimationFrame(() => { followFrame = 0; void followVisiblePins(); });
}
async function playBinding(id, automatic = false, request = 0) {
  const binding = orderedBindings().find((item) => item.id === id);
  const music = window.HanamiReaderMusic;
  if (!binding || !music) return false;
  if (!automatic) {
    // An explicit card action wins over an older asynchronous detection.
    followRequest++;
    followActiveId = id;
  }
  try {
    const track = await resolveBindingTrack(binding);
    if (automatic && request !== followRequest) return false;
    const before = music.snapshot();
    const samePin = before.current === track.id && before.pin?.id === binding.id;
    if (automatic && samePin) return true;
    const queue = orderedBindings().map((item) => music.listTracks().find((entry) => entry.id === item.trackId ||
      !!canonicalMusicUrl(item.track.url) && canonicalMusicUrl(entry.permalinkUrl || entry.url) === canonicalMusicUrl(item.track.url))?.id).filter(Boolean);
    const started = samePin && !automatic ? await music.toggle() :
      await music.playPin(track.id, { id: binding.id, groupId: binding.groupId, title: track.title }, { automatic, queue });
    if (!automatic && started === false && !(samePin && before.playing))
      window.HanamiToast?.("La pista está guardada, pero no se pudo iniciar. Abre el reproductor para ver el error.");
    return started;
  } catch (error) { if (!automatic) window.HanamiToast?.(error.message); return false; }
}
async function followVisiblePins() {
  const viewport = document.querySelector("#readerViewport");
  const reader = document.querySelector("#reader");
  const music = window.HanamiReaderMusic;
  if (!viewport || !reader || reader.classList.contains("hidden") || viewport.inert || !music ||
    window.HanamiScreens && !window.HanamiScreens.is("reader")) {
    renderPinCards([]);
    return;
  }
  const current = music.snapshot();
  const bounds = viewport.getBoundingClientRect();
  const bindings = orderedBindings();
  const pins = bindings.map((binding, order) => {
    const anchor = viewport.querySelector(`[data-reader-music-anchor="${CSS.escape(binding.id)}"]`);
    const rect = anchor?.getBoundingClientRect();
    const visible = !!rect && rect.width > 0 && rect.top >= bounds.top + 8 &&
      rect.top <= bounds.bottom - 8 && rect.left >= bounds.left && rect.left <= bounds.right;
    const stored = music.listTracks().find((track) => track.id === binding.trackId ||
      !!canonicalMusicUrl(binding.track.url) && canonicalMusicUrl(track.permalinkUrl || track.url) === canonicalMusicUrl(binding.track.url));
    return { id: binding.id, order, visible, available: !!binding.track.url || !!stored,
      binding, track: stored || binding.track, pageIndex: Number(JSON.parse(binding.pageKey)[4]) || 0,
      canRemove: canRemoveBinding(binding), canChange: canChangeBinding(binding) };
  });
  renderPinCards(pins.filter((pin) => pin.visible), bounds);
  if (!followsReadingPins(current.readingMode) || current.readingSuspended) return;
  const first = viewport.querySelector("figure[data-comment-context]");
  const context = first ? figureContext(first) : {};
  const nextScope = JSON.stringify([context.groupId, context.sourceId, context.mangaUrl || context.mangaId]);
  const resetScope = nextScope !== followScope;
  if (resetScope) { followScope = nextScope; followActiveId = current.pin?.groupId === context.groupId ? current.pin.id : ""; visibleIds.clear(); lastTop = viewport.scrollTop; direction = 1; followRequest++; }
  if (Math.abs(viewport.scrollTop - lastTop) > 1) direction = viewport.scrollTop > lastTop ? 1 : -1;
  lastTop = viewport.scrollTop;
  if (!pins.some((pin) => pin.id === followActiveId)) followActiveId = "";
  const nextVisible = new Set(pins.filter((pin) => pin.visible).map((pin) => pin.id));
  if (resetScope && followActiveId && current.playing) visibleIds = new Set(nextVisible);
  const candidates = pins.map((pin) => ({ ...pin, visible: pin.visible && (!followActiveId || !visibleIds.has(pin.id)) }));
  visibleIds = nextVisible;
  const next = chooseVisiblePin(candidates, followActiveId, direction);
  if (!next) return;
  followActiveId = next.id;
  const request = ++followRequest;
  await playBinding(next.id, true, request);
}
export function publishCurrentReading() {
  const groupId = window.HanamiReadingGroups?.activeId?.() || "local-room";
  const connection = window.HanamiSocialSync?.state?.();
  if (incognito()) throw new Error("La lectura de incógnito no publica pistas.");
  if (!isRemoteMusicGroup(groupId) || !connection?.configured || !connection.authenticated) throw new Error("Selecciona un grupo compartido y conecta tu cuenta de Hanami.");
  const keys = new Set(sharedPageKeys(groupId).map((key) => JSON.stringify(JSON.parse(key).slice(1))));
  const candidates = [...state.bindings].filter((binding) => {
    try { return keys.has(JSON.stringify(JSON.parse(binding.pageKey).slice(1))) && (!binding.actorId || binding.actorId === connection.user.id) && !binding.deletedAt; }
    catch { return false; }
  });
  let count = 0;
  for (const binding of candidates) {
    if (!publicMetadata(binding.track) || binding.groupId === groupId && ["shared", "pending"].includes(binding.shareState)) continue;
    const page = JSON.parse(binding.pageKey);
    assignTrack(binding.track, { groupId, sourceId: page[1], mangaUrl: page[2], chapterUrl: page[3], pageIndex: page[4], x: binding.x, y: binding.y });
    count++;
  }
  window.HanamiToast?.(count ? `${count} pista${count === 1 ? "" : "s"} preparada${count === 1 ? "" : "s"} para compartir.` : "No hay nuevas pistas públicas de SoundCloud para compartir en esta lectura.");
  return count;
}
export function removeBinding(id) {
  const binding = orderedBindings().find((item) => item.id === id) || state.bindings.find((item) => item.id === id);
  if (!binding) return false;
  if (!canRemoveBinding(binding)) throw new Error("No tienes permiso para eliminar esta pista del grupo.");
  if (binding.shareState === "shared" || binding.shareState === "pending") {
    const deleted = { ...binding, actorId: window.HanamiSocialSync?.state?.().user?.id || "", revision: (Number(binding.revision) || 0) + 1, deletedAt: Date.now(), shareState: "pending" };
    const old = state.bindings;
    state.bindings = [...state.bindings.filter((item) => item.id !== id), deleted];
    if (!save() || !queueSharedPin(deleted, null, "delete")) { state.bindings = old; save(); throw new Error("No se pudo preparar la eliminación de la pista compartida."); }
  } else { state.bindings = state.bindings.filter((item) => item.id !== id); save(); }
  followRequest++;
  if (followActiveId === id) followActiveId = "";
  const music = window.HanamiReaderMusic;
  const track = music?.listTracks?.().find((item) => item.id === binding.trackId ||
    !!canonicalMusicUrl(binding.track.url) && canonicalMusicUrl(item.permalinkUrl || item.url) === canonicalMusicUrl(binding.track.url));
  if (track) void music.removeFromQueue?.(track.id);
  renderAll(); emit(); return true;
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  addEventListener("hanami-reader-music-change", (event) => {
    const { track, playing, reason, sessionId } = event.detail || {};
    if (playing && reason === "listened") noteListen(track, sessionId);
    const current = window.HanamiReaderMusic?.snapshot?.();
    if (reason === "pin" && current?.pin?.id) {
      if (followActiveId !== current.pin.id) followRequest++;
      followActiveId = current.pin.id;
    }
    if (current?.readingMode !== lastMode) { lastMode = current.readingMode; visibleIds.clear(); if (followsReadingPins(lastMode)) followActiveId = current.pin?.id || ""; scheduleFollow(); }
    syncPinState();
  });
  addEventListener("hanami-music-pin-sync", () => {
    const shared = sharedMusicSnapshot();
    const current = window.HanamiReaderMusic?.snapshot?.();
    if (shared.readDenied) {
      followRequest++;
      window.HanamiReaderMusic?.stopPinPlayback?.(shared.groupId, "Ya no tienes acceso a la música de este grupo.");
    } else if (isRemoteMusicGroup(current?.pin?.groupId) && current.pin.viewerId !== (window.HanamiSocialSync?.state?.().user?.id || "")) {
      followRequest++;
      window.HanamiReaderMusic?.stopPinPlayback?.(current.pin.groupId, "La cuenta ha cambiado. Selecciona una pista con la sesión actual.");
    }
    renderAll(); emit();
  });
  addEventListener("hanami-music-pin-ack", (event) => {
    const { id, revision, row, shareState, error } = event.detail;
    const binding = state.bindings.find((item) => item.id === id);
    if (!binding || Number(binding.revision) !== Number(revision)) return;
    if (row?.deleted_at || binding.deletedAt && shareState === "local") state.bindings = state.bindings.filter((item) => item.id !== id);
    else Object.assign(binding, { shareState, deletedAt: null, revision: Number(row?.revision) || binding.revision });
    if (error) window.HanamiToast?.(error);
    save(); renderAll(); emit();
  });
  addEventListener("hanami-music-pins-reconciled", (event) => {
    const { pageKeys, ids, actorId } = event.detail;
    state.bindings = state.bindings.filter((item) => !(item.actorId === actorId && item.shareState === "shared" && pageKeys.includes(item.pageKey) && !ids.includes(item.id) && !hasPendingMusicPin(item.id)));
    save();
  });
  addEventListener("hanami-reader-player-visibility", (event) => { if (!event.detail.open) scheduleFollow(); });
  addEventListener("hanami-screen-change", scheduleFollow);
  document.addEventListener("scroll", (event) => { if (event.target.id === "readerViewport") scheduleFollow(); }, true);
  addEventListener("online", () => { void flushActivity(); });
  addEventListener("hanami-social-state", () => { void flushActivity(); });
  addEventListener("resize", renderAll);
  document.addEventListener("load", (event) => {
    if (event.target.matches?.("#readerViewport figure > img,#readerViewport figure > iframe")) renderFigure(event.target.closest("figure"));
  }, true);
  installPinCards({ play: playBinding, change: changeBinding, move: moveBinding, remove: removeBinding });
  const readerRoot = document.querySelector("#reader");
  if (readerRoot) new MutationObserver(scheduleFollow).observe(readerRoot, { attributes: true, attributeFilter: ["class"] });
  new MutationObserver((records) => {
    if (records.some((record) => [...record.addedNodes].some((node) =>
      node.nodeType === 1 && (node.matches?.("figure[data-comment-context]") || node.querySelector?.("figure[data-comment-context]")),
    ))) requestAnimationFrame(renderAll);
    if (records.some((record) => [...record.removedNodes].some((node) => node.nodeType === 1 && node.matches?.(".reader-music-picker,.reader-comment-editor")))) scheduleFollow();
  }).observe(document.documentElement, { childList: true, subtree: true });
  window.HanamiMusicDiscovery = {
    assignTrack, recentTracks, loadTrends, flushActivity, snapshot: discoverySnapshot,
    renderAll, sharedPageKeys, prepareReadingQueue, publishCurrentReading,
    changeBinding, replaceBindingTrack, moveBinding, removeBinding, followVisiblePins,
  };
}