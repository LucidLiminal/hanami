/*
 * Local listening history and page instances; only public SoundCloud track
 * activity is sent to the optional community backend. No reading context,
 * local files, comments or individual history are published.
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
function scope(context = {}) {
  return { ...context, groupId: context.groupId || window.HanamiReadingGroups?.activeId?.() || "local-room" };
}
function publicMetadata(track) {
  const url = canonicalMusicUrl(track.permalinkUrl || track.url);
  if (!url || track.provider !== "soundcloud") return null;
  return {
    url,
    title: String(track.title || "Pista de SoundCloud").slice(0, 200),
    artist: String(track.artist || "SoundCloud").slice(0, 160),
    artwork: /^https:\/\//i.test(track.artwork || "") ? String(track.artwork).slice(0, 2048) : "",
    duration: Math.max(0, Math.min(86400, Number(track.duration) || 0)),
  };
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

export function assignTrack(track, context) {
  if (!track?.id || !context) throw new Error("Selecciona una pista y una página válidas.");
  const scoped = scope(context);
  const pageKey = instancePageKey(scoped);
  const x = Math.max(0, Math.min(1, Number(scoped.x) || 0));
  const y = Math.max(0, Math.min(1, Number(scoped.y) || 0));
  const previous = state.bindings.find((item) => item.pageKey === pageKey && Math.hypot(item.x - x, item.y - y) < 0.03);
  if (!previous && state.bindings.length >= MAX_BINDINGS)
    throw new Error("Has alcanzado el límite de pistas guardadas en páginas.");
  const binding = {
    id: previous?.id || crypto.randomUUID(),
    pageKey, x, y,
    trackId: track.id,
    track: {
      id: track.id, title: track.title, artist: track.artist, artwork: track.artwork || "",
      type: track.type, url: track.url || "", provider: track.provider || "",
      permalinkUrl: track.permalinkUrl || "", soundcloudId: track.soundcloudId || "",
      soundcloudUrn: track.soundcloudUrn || "", duration: Number(track.duration) || 0,
    },
    createdAt: Date.now(),
  };
  const oldBindings = state.bindings;
  state.bindings = [...state.bindings.filter((item) => item.id !== binding.id), binding];
  if (!save()) {
    state.bindings = oldBindings;
    throw new Error(syncError);
  }
  if (!previous || previous.trackId !== track.id) recordActivity(track, "use");
  renderAll();
  emit();
  return binding;
}

export async function flushActivity() {
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
  return { recent: recentTracks(), trends: [...trends], trendsStatus, trendsMessage, pendingCount: state.pending.length, syncError };
}

function figureContext(figure) {
  try { return scope(JSON.parse(figure.dataset.commentContext || "{}")); }
  catch { return scope({}); }
}
function renderFigure(figure) {
  if (!figure?.isConnected) return;
  figure.querySelector(".reader-music-anchor-layer")?.remove();
  const bindings = state.bindings.filter((item) => item.pageKey === instancePageKey(figureContext(figure)));
  const image = figure.querySelector("img,iframe");
  if (!bindings.length || !image) return;
  const rect = image.getBoundingClientRect(), parent = figure.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const layer = document.createElement("div");
  layer.className = "reader-music-anchor-layer";
  layer.setAttribute("aria-label", "Pistas de esta página");
  layer.innerHTML = bindings.map((item) => {
    const left = rect.left - parent.left + Math.max(24, Math.min(rect.width - 24, item.x * rect.width));
    const top = rect.top - parent.top + Math.max(24, Math.min(rect.height - 24, item.y * rect.height));
    return `<button type="button" class="reader-music-pin" data-reader-music-pin="${esc(item.id)}" style="left:${left}px;top:${top}px" aria-label="Reproducir o pausar ${esc(item.track.title)}" title="${esc(item.track.title)} · ${esc(item.track.artist)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l12-2v13M9 9l12-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/></svg></button>`;
  }).join("");
  figure.append(layer);
}
function renderAll() {
  if (typeof document === "undefined") return;
  document.querySelectorAll("#readerViewport figure[data-comment-context]").forEach(renderFigure);
}
async function playBinding(id) {
  const binding = state.bindings.find((item) => item.id === id);
  const music = window.HanamiReaderMusic;
  if (!binding || !music) return;
  try {
    await music.ready;
    let track = music.snapshot().tracks.find((item) => item.id === binding.trackId);
    if (!track && binding.track.url) track = await music.addUrl(binding.track.url, binding.track);
    if (!track) throw new Error("Esta pista local ya no está en tu biblioteca de música.");
    const before = music.snapshot();
    const sameTrack = before.current === track.id;
    const started = sameTrack ? await music.toggle() : await music.play(track.id);
    if (started === false && !(sameTrack && before.playing))
      window.HanamiToast?.("La pista está guardada, pero no se pudo iniciar. Abre el reproductor para ver el error.");
  } catch (error) { window.HanamiToast?.(error.message); }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  addEventListener("hanami-reader-music-change", (event) => {
    const { track, playing, reason, sessionId } = event.detail || {};
    if (playing && reason === "listened") noteListen(track, sessionId);
  });
  addEventListener("online", () => { void flushActivity(); });
  addEventListener("hanami-social-state", () => { void flushActivity(); });
  addEventListener("resize", renderAll);
  document.addEventListener("load", (event) => {
    if (event.target.matches?.("#readerViewport figure > img,#readerViewport figure > iframe")) renderFigure(event.target.closest("figure"));
  }, true);
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-reader-music-pin]");
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void playBinding(button.dataset.readerMusicPin);
  }, true);
  new MutationObserver((records) => {
    if (records.some((record) => [...record.addedNodes].some((node) =>
      node.nodeType === 1 && (node.matches?.("figure[data-comment-context]") || node.querySelector?.("figure[data-comment-context]")),
    ))) requestAnimationFrame(renderAll);
  }).observe(document.documentElement, { childList: true, subtree: true });
  window.HanamiMusicDiscovery = { assignTrack, recentTracks, loadTrends, flushActivity, snapshot: discoverySnapshot, renderAll };
}