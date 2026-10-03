import "./chapter-identity.js";
/* Private group markers are separate from anonymous/community trend aggregates. */
const KEY = "hanami-reader-music-group-outbox-v137";
const MAX_PENDING = 500;
export const isRemoteMusicGroup = (value) => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(String(value || ""));
const sharedUrl = (value) => /^https:\/\/soundcloud\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(value || "").trim())
  ? String(value).trim() : "";
const sharedArtwork = (value) => /^https:\/\/i[0-9]*\.sndcdn\.com\//i.test(String(value || "").trim())
  ? String(value).trim().slice(0, 2048) : "";
function normalizeSharedTrack(track) {
  if (!track || typeof track !== "object") return null;
  const url = sharedUrl(track.url) || sharedUrl(track.permalinkUrl);
  if (!url) return null;
  const duration = Number(track.duration);
  const soundcloudId = String(track.soundcloudId || "");
  return {
    ...track,
    url,
    permalinkUrl: url,
    provider: "soundcloud",
    title: String(track.title || "Pista de SoundCloud").trim().slice(0, 200) || "Pista de SoundCloud",
    artist: String(track.artist || "SoundCloud").trim().slice(0, 160) || "SoundCloud",
    artwork: sharedArtwork(track.artwork),
    duration: Number.isFinite(duration) && duration >= 0 && duration <= 86400 ? duration : 0,
    soundcloudId: /^[0-9]{1,20}$/.test(soundcloudId) ? soundcloudId : "",
  };
}
function read() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(value) ? value
      .filter((item) => item?.id && item.actorId && isRemoteMusicGroup(item.groupId) && item.record?.id)
      .map((item) => {
        if (item.kind === "delete") return item;
        const track = normalizeSharedTrack(item.record.track);
        return track ? { ...item, kind: "upsert", record: { ...item.record, track } } : item;
      })
      .slice(0, MAX_PENDING) : [];
  } catch { return []; }
}
let pending = read();
let shared = new Map();
let status = "idle";
let message = "";
let flushing = null;
let pulling = null;
let scheduled = 0;
let lastScope = "";
let identity = "";
let readDenied = false;
const activeId = () => window.HanamiReadingGroups?.activeId?.() || "local-room";
const social = () => window.HanamiSocialSync?.state?.() || {};
const incognito = () => {
  try { return JSON.parse(localStorage.getItem("hanami-incognito") || "false") === true; }
  catch { return false; }
};
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(pending)); return true; }
  catch { message = "No queda espacio para guardar las pistas pendientes de compartir."; status = "error"; emit(); return false; }
}
function emit() {
  if (typeof window !== "undefined") dispatchEvent(new CustomEvent("hanami-music-pin-sync", { detail: sharedMusicSnapshot() }));
}
function canonicalPage(value) {
  try {
    const page = JSON.parse(value);
    return Array.isArray(page) && page.length === 5 ? JSON.stringify(page) : "";
  } catch { return ""; }
}
export function sharedMusicSnapshot() {
  const actor = typeof window === "undefined" ? "" : social().user?.id;
  const group = typeof window === "undefined" ? "local-room" : activeId();
  return { groupId: group, status, message, readDenied, pendingCount: pending.filter((item) => item.actorId === actor && item.groupId === group).length, sharedCount: [...shared.values()].filter((item) => item.groupId === group).length };
}
export function sharedBindingsFor(pageKey) {
  if (!social().authenticated) return [];
  const api = window.HanamiChapterIdentity;
  return [...shared.values()].filter((item) => !api ? item.pageKey === pageKey :
    api.samePage({ ...api.musicContext(item.pageKey),chapterId:item.chapterId || "",
      recordIdentity:!!item.chapterId },api.musicContext(pageKey)));
}
export function hasPendingMusicPin(id) {
  return pending.some((item) => item.actorId === social().user?.id && item.record.id === id);
}
export function queueSharedPin(binding, metadata, kind = "upsert") {
  const connection = social();
  if (incognito() || !connection.configured || !connection.authenticated || !connection.user?.id || !isRemoteMusicGroup(binding.groupId)) return false;
  const track = kind === "upsert" ? normalizeSharedTrack(metadata) : null;
  if (kind === "upsert" && !track) return false;
  const previous = pending;
  const operation = { id: crypto.randomUUID(), actorId: connection.user.id, groupId: binding.groupId, kind, record: {
    id: binding.id, groupId: binding.groupId, pageKey: binding.pageKey, x: binding.x, y: binding.y,
    revision: binding.revision || 1, track,
  } };
  const remaining = pending.filter((item) => !(item.actorId === operation.actorId && item.groupId === operation.groupId && item.record.id === binding.id));
  if (remaining.length >= MAX_PENDING) { message = "Hay demasiadas pistas pendientes. Espera a que vuelva la conexión."; status = "error"; emit(); return false; }
  pending = [...remaining, operation];
  if (!save()) { pending = previous; return false; }
  status = navigator.onLine === false ? "offline" : "syncing";
  message = navigator.onLine === false ? "La pista se compartirá cuando vuelva la conexión." : "Compartiendo pistas…";
  emit();
  void flushSharedPins();
  return true;
}
function ack(operation, row, shareState, error = "") {
  dispatchEvent(new CustomEvent("hanami-music-pin-ack", { detail: { id: operation.record.id, revision: operation.record.revision, row, shareState, error } }));
}
export async function flushSharedPins() {
  if (flushing) return flushing;
  if (incognito() || navigator.onLine === false) return;
  await window.HanamiSocialSync?.ready;
  await window.HanamiIdentityBackup?.ready;
  if (flushing) return flushing;
  const actor = social().user?.id;
  if (!social().authenticated || !actor) return;
  flushing = (async () => {
    for (;;) {
      if (incognito() || social().user?.id !== actor) break;
      let operation = pending.find((item) => item.actorId === actor);
      if (!operation) break;
      if (operation.kind !== "delete") {
        const track = normalizeSharedTrack(operation.record.track);
        if (!track) {
          pending = pending.filter((item) => item.id !== operation.id);
          save();
          ack(operation, null, "local", "Esta pista no cumple los requisitos para compartirse y quedó solo en este dispositivo.");
          status = "error";
          message = "Se omitió una pista no compatible; las demás pistas pendientes siguen sincronizándose.";
          emit();
          continue;
        }
        if (JSON.stringify(track) !== JSON.stringify(operation.record.track)) {
          operation = { ...operation, kind: "upsert", record: { ...operation.record, track } };
          pending = pending.map((item) => item.id === operation.id ? operation : item);
          save();
        }
      }
      try {
        const result = operation.kind === "delete"
          ? await window.HanamiSocialSync.deleteGroupMusicPin(operation)
          : await window.HanamiSocialSync.saveGroupMusicPin(operation);
        if (social().user?.id !== actor) break;
        const row = Array.isArray(result) ? result[0] : result;
        pending = pending.filter((item) => item.id !== operation.id);
        save();
        const mapped = row && mapRow(row);
        if (mapped) shared.set(mapped.id, mapped);
        else shared.delete(operation.record.id);
        ack(operation, row, "shared");
      } catch (error) {
        const denied = error.code === "42501" || error.status === 403;
        if (denied) {
          pending = pending.filter((item) => item.id !== operation.id);
          save();
          ack(operation, null, "local", "No tienes permiso para publicar pistas en este grupo. La pista sigue guardada en este dispositivo.");
          status = "denied"; message = "El grupo no permite publicar con tu cuenta actual."; emit();
          continue;
        }
        const invalid = error.code === "22023" || error.status === 400 || error.status === 422;
        if (invalid) {
          pending = pending.filter((item) => item.id !== operation.id);
          save();
          ack(operation, null, "local", "Esta pista no pudo compartirse. Se conservó solo en este dispositivo.");
          status = "error";
          message = "Se omitió una pista no compatible; las demás pistas pendientes siguen sincronizándose.";
          emit();
          continue;
        }
        status = error.code === "PGRST202" || error.status === 404 ? "unavailable" : "error";
        message = status === "unavailable" ? "Activa las pistas compartidas con la migración hanami-group-reader-music-v137.sql." : error.message || "No se pudieron compartir las pistas. Se conservarán para reintentar.";
        emit();
        break;
      }
    }
  })();
  try { await flushing; }
  finally { flushing = null; emit(); }
}
function mapRow(row) {
  const pageKey = canonicalPage(row.page_key);
  if (!pageKey || !isRemoteMusicGroup(row.group_id) || !/^https:\/\/soundcloud\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(row.track?.url || "") || row.deleted_at ||
    !Number.isFinite(Number(row.x)) || !Number.isFinite(Number(row.y)) || Number(row.x) < 0 || Number(row.x) > 1 || Number(row.y) < 0 || Number(row.y) > 1) return null;
  const track = { ...row.track, provider: "soundcloud", permalinkUrl: row.track.url, type: "external" };
  return { id: row.id, pageKey, chapterId:row.chapter_id || "",workId:row.work_id || "",
    groupId: row.group_id, actorId: row.author_id, x: Number(row.x), y: Number(row.y), revision: Number(row.revision), trackId: "", track, createdAt: Date.parse(row.created_at) || 0, shareState: "shared", remote: true };
}
export async function syncVisibleGroupPins(force = false) {
  if (pulling) return pulling;
  const connection = social();
  const group = activeId(), actor = connection.user?.id;
  const pageKeys = window.HanamiMusicDiscovery?.sharedPageKeys?.(group) || [];
  if (!isRemoteMusicGroup(group) || !pageKeys.length) return;
  if (!connection.configured || !connection.authenticated || !actor) {
    shared.clear(); status = "unavailable"; message = "Conecta tu cuenta de Hanami para compartir pistas en el grupo."; emit(); return;
  }
  if (navigator.onLine === false) { status = "offline"; message = "Sin conexión. Las pistas ya cargadas siguen disponibles."; emit(); return; }
  const scope = JSON.stringify([actor, group, pageKeys]);
  if (!force && scope === lastScope) return;
  lastScope = scope;
  pulling = (async () => {
    status = "syncing"; message = "Sincronizando pistas del grupo…"; emit();
    await flushSharedPins();
    const rows = [];
    try {
      for (let offset = 0; offset < pageKeys.length; offset += 100) {
        const batch = await window.HanamiSocialSync.listGroupMusicPins(group, pageKeys.slice(offset, offset + 100), actor);
        if (social().user?.id !== actor || activeId() !== group) return;
        rows.push(...(Array.isArray(batch) ? batch : []));
      }
      const requested = new Set(pageKeys);
      for (const [id, value] of shared) if (requested.has(value.pageKey) ||
        pageKeys.some((key) => window.HanamiChapterIdentity?.sameMusicPage(key, value.pageKey))) shared.delete(id);
      rows.map(mapRow).filter(Boolean).forEach((item) => shared.set(item.id, item));
      dispatchEvent(new CustomEvent("hanami-music-pins-reconciled", {
        detail: { groupId: group, actorId: actor, pageKeys, ids: rows.filter((row) => !row.deleted_at).map((row) => row.id) },
      }));
      readDenied = false;
      status = "ready"; message = "Las pistas de esta lectura están sincronizadas.";
      emit();
    } catch (error) {
      if (social().user?.id !== actor || activeId() !== group) return;
      const denied = error.code === "42501" || error.status === 403;
      readDenied = denied;
      if (denied) shared.clear();
      status = denied ? "denied" : error.code === "PGRST202" || error.status === 404 ? "unavailable" : "error";
      message = denied ? "Ya no tienes acceso a las pistas de este grupo." : status === "unavailable" ? "Activa las pistas compartidas con la migración hanami-group-reader-music-v137.sql." : error.message || "No se pudieron obtener las pistas del grupo.";
      emit();
    }
  })();
  try { await pulling; }
  finally { pulling = null; }
}
export function scheduleGroupPins(force = false) {
  clearTimeout(scheduled);
  scheduled = setTimeout(() => { void syncVisibleGroupPins(force); }, 250);
}
if (typeof window !== "undefined" && typeof document !== "undefined") {
  addEventListener("online", () => { void flushSharedPins(); scheduleGroupPins(true); });
  addEventListener("hanami-reading-group-change", () => { shared.clear(); lastScope = ""; readDenied = false; status = "idle"; message = ""; emit(); scheduleGroupPins(true); });
  addEventListener("hanami-social-state", () => {
    const next = JSON.stringify([social().configured, social().authenticated, social().user?.id]);
    if (next === identity) return;
    identity = next; shared.clear(); lastScope = ""; emit(); void flushSharedPins(); scheduleGroupPins(true);
  });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") scheduleGroupPins(true); });
  setInterval(() => {
    const reader = document.querySelector("#reader");
    if (reader && !reader.classList.contains("hidden") && document.visibilityState === "visible") scheduleGroupPins(true);
  }, 25000);
  window.HanamiGroupMusic = { sync: () => syncVisibleGroupPins(true), flush: flushSharedPins, snapshot: sharedMusicSnapshot };
}