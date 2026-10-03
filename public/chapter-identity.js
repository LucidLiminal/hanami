import { assertBackup, ready as backupReady, checkpoint } from "./identity-backup.js";

export const KEY = "hanami-content-identity-v144";
const NAMESPACE = "e0b1b4de-2946-57a4-967f-6575cb0e71d9";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const OLYMPUS = "hanami.es.olympus";
const BROWSER = typeof window !== "undefined" && window === globalThis;
let state = readRegistry();
let dirty = false;
let version = 0;
let batchDepth = 0;
function readRegistry() {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(KEY) || "null");
    if (value?.version === 1 && Array.isArray(value.works) && Array.isArray(value.chapters) && Array.isArray(value.verified))
      return value;
  } catch {}
  return { version: 1, works: [], chapters: [], verified: [], redirects: [] };
}
function canonicalId(id, context) {
  const seen = new Set();
  while (id && !seen.has(id)) {
    seen.add(id);
    const row = (state.redirects || []).find((entry) => entry.sourceId === source(context) &&
      (entry.scope === "*" || entry.scope === scope(context)) && entry.from === id);
    if (!row) break;
    id = row.to;
  }
  return id;
}
// UUIDv5 from stable remote identifiers. Never hash a URL into a chapter ID.
function sha1(bytes) {
  const length = bytes.length;
  const padded = new Uint8Array(Math.ceil((length + 9) / 64) * 64);
  padded.set(bytes); padded[length] = 128;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(length / 0x20000000));
  view.setUint32(padded.length - 4, (length * 8) >>> 0);
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80), rol = (n, b) => (n << b) | (n >>> (32 - b));
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 80; i++) w[i] = rol(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      const f = i < 20 ? (b & c) | (~b & d) : i < 40 ? b ^ c ^ d : i < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
      const k = i < 20 ? 0x5a827999 : i < 40 ? 0x6ed9eba1 : i < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const t = (rol(a, 5) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = rol(b, 30); b = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20), result = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((n, i) => result.setUint32(i * 4, n));
  return out;
}
export function uuidFor(name) {
  const ns = Uint8Array.from(NAMESPACE.replaceAll("-", "").match(/../g), (s) => parseInt(s, 16));
  const value = new TextEncoder().encode(name), bytes = new Uint8Array(ns.length + value.length);
  bytes.set(ns); bytes.set(value, ns.length);
  const id = sha1(bytes).slice(0, 16); id[6] = (id[6] & 15) | 80; id[8] = (id[8] & 63) | 128;
  const hex = [...id].map((n) => n.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function randomId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  throw new Error("El navegador no puede crear identificadores seguros.");
}
export function normalizeReference(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return raw;
    url.hash = "";
    return url.href; // keep query parameters, path, host and case semantics
  } catch { return raw; }
}
function source(context) { return String(context.sourceId || ""); }
function workRef(context) { return normalizeReference(context.mangaUrl || context.mangaId || context.workRef || ""); }
function chapterRef(context) { return normalizeReference(context.chapterUrl || context.chapterRef || ""); }
function scope(context) { return String(context.groupId || "local-room"); }
export function remoteChapterId(context = {}) {
  const direct = context.remoteChapterId;
  if (direct != null && String(direct).trim()) { const value=String(direct).trim(); return UUID.test(value)?value.toLowerCase():value; }
  if (source(context) !== OLYMPUS) return "";
  try {
    const path = new URL(chapterRef(context), "https://identity.invalid").pathname;
    const value = decodeURIComponent(path.match(/^\/capitulo\/([^/]+)(?:\/|$)/i)?.[1] || "");
    return /^\d{1,20}$/.test(value) ? value : UUID.test(value) ? value.toLowerCase() : "";
  } catch { return ""; }
}
function addAlias(list, value) {
  if (value && !list.includes(value)) { list.push(value); dirty = true; }
}
function canCreate(create) {
  if (!create) return false;
  assertBackup();
  return true;
}
function save() {
  if (!dirty || batchDepth) return;
  assertBackup();
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(state)); }
  catch (error) { state = readRegistry(); dirty = false; throw new Error("No se pudo guardar la identidad. Los datos antiguos siguen intactos.", { cause: error }); }
  dirty = false; version++;
}
export function resolveWork(context = {}, { create = false } = {}) {
  const sourceId = source(context);
  if (!sourceId) return null;
  const refs = [...new Set([workRef(context), normalizeReference(context.mangaId)].filter(Boolean))];
  const remoteId = String(context.remoteWorkId ?? "");
  const id = remoteId ? uuidFor(`work|${sourceId}|remote|${remoteId}`) : "";
  const sharedWork = state.verified.find((row) => row.scope === scope(context) &&
    row.sourceId === sourceId && row.workRef === workRef(context) && row.workId);
  let work = sharedWork && state.works.find((row) => row.id === sharedWork.workId && row.sourceId === sourceId);
  work ||= state.works.find((row) => row.sourceId === sourceId &&
    (row.id === context.workId || id && row.id === id || refs.some((ref) => row.aliases.includes(ref))));
  if (!work && canCreate(create) && refs.length) {
    work = { id: id || randomId(), sourceId, remoteId, aliases: [], createdAt: Date.now() };
    state.works.push(work); dirty = true;
  }
  if (work && create) {
    canCreate(true); refs.forEach((ref) => addAlias(work.aliases, ref));
    if (context.workTitle && work.label !== context.workTitle) { work.label = String(context.workTitle); dirty = true; }
    save();
  }
  return work || null;
}
function verifiedAlias(context) {
  return state.verified.find((row) => row.scope === scope(context) && row.sourceId === source(context) &&
    row.workRef === workRef(context) && row.chapterRef === chapterRef(context));
}
export function resolveChapter(context = {}, { create = false } = {}) {
  const sourceId = source(context), reference = chapterRef(context);
  if (!sourceId || !reference) return null;
  const verified = verifiedAlias(context);
  if (verified) {
    const id = canonicalId(verified.chapterId,context);
    return state.chapters.find((row) => row.id === id && row.sourceId === sourceId) || null;
  }
  const remoteId = remoteChapterId(context);
  const work = resolveWork(context, { create });
  // Olympus's adapter exposes a source-global chapter primary key. Other
  // adapters' IDs are scoped to the work unless they explicitly declare global.
  const globalRemote = sourceId === OLYMPUS || context.remoteChapterIdScope === "source";
  const stableId = remoteId && (globalRemote || work) ?
    uuidFor(globalRemote ? `chapter|${sourceId}|remote|${remoteId}` : `chapter|${sourceId}|work|${work.id}|remote|${remoteId}`) : "";
  let chapter = state.chapters.find((row) => row.sourceId === sourceId &&
    (stableId && row.id === stableId ||
      remoteId && row.remoteId === remoteId && (globalRemote || row.workId === work?.id) ||
      (!remoteId || !row.remoteId || row.remoteId === remoteId) &&
        row.aliases.some((alias) => alias.workRef === workRef(context) && alias.chapterRef === reference) ||
      UUID.test(context.chapterId || "") && row.id === context.chapterId &&
        (!stableId || row.id === stableId) && (!work || row.workId === work.id)));
  if (!chapter && canCreate(create) && work) {
    chapter = {
      id: stableId || randomId(), workId: work.id, sourceId, remoteId,
      aliases: [], createdAt: Date.now(), pageCount: null, layoutVersion: 1,
    };
    state.chapters.push(chapter); dirty = true;
  }
  // Deterministic trusted remote IDs can be compared before a local registry
  // checkpoint completes, without creating or changing any stored record.
  if (!chapter && stableId) return { id: stableId, workId: work?.id || "", sourceId, remoteId, aliases: [], transient: true };
  if (chapter && create) {
    canCreate(true);
    if (!chapter.aliases.some((alias) => alias.workRef === workRef(context) && alias.chapterRef === reference)) {
      chapter.aliases.push({ workRef: workRef(context), chapterRef: reference }); dirty = true;
    }
    if (remoteId && !chapter.remoteId) { chapter.remoteId = remoteId; dirty = true; }
    if (context.chapterName && chapter.label !== context.chapterName) { chapter.label = String(context.chapterName); dirty = true; }
    if (context.chapterNumber != null && Number.isFinite(Number(context.chapterNumber)) &&
      chapter.number !== Number(context.chapterNumber)) { chapter.number = Number(context.chapterNumber); dirty = true; }
    save();
  }
  const canonical = chapter && canonicalId(chapter.id,context);
  return canonical ? state.chapters.find((row) => row.id === canonical && row.sourceId === sourceId) || chapter : null;
}
export function chapterContext(item = {}, chapter = {}, groupId = "local-room") {
  return {
    groupId, sourceId: item.sourceId || "", mangaUrl: item.mangaUrl || item.url || "",
    mangaId: item.mangaId || item.id || "", workId: item.workId || "",
    remoteWorkId: item.remoteWorkId ?? item.seriesId ?? "",
    workTitle: item.title || "",
    chapterUrl: chapter.url || chapter.chapterUrl || "",
    chapterId: chapter.chapterId || "", remoteChapterId: chapter.remoteId ?? chapter.remoteChapterId ?? "",
    remoteChapterIdScope: chapter.remoteIdScope || chapter.remoteChapterIdScope || "",
    chapterNumber: chapter.number ?? chapter.chapterNumber,
    chapterName: chapter.name || chapter.chapterName || "",
  };
}
export function prepareChapters(item, chapters = [], { groupId = "local-room", create = true } = {}) {
  if (!item?.sourceId) return chapters;
  batchDepth++;
  try {
    const work = resolveWork(chapterContext(item), { create });
    if (work) item.workId = work.id;
    for (const chapter of chapters) {
      const identity = resolveChapter(chapterContext(item, chapter, groupId), { create });
      if (identity) { chapter.chapterId = identity.id; chapter.workId = identity.workId; }
    }
  } finally { batchDepth--; save(); }
  return chapters;
}
export function withIdentity(context = {}, { create = false } = {}) {
  const chapter = resolveChapter(context, { create });
  if (!chapter) return { ...context };
  const index = Number(context.pageIndex);
  return {
    ...context, workId: chapter.workId || context.workId || "", chapterId: chapter.id,
    identityVersion: 2,
    ...(Number.isInteger(index) && index >= 0 ? { pageId: uuidFor(`page|${chapter.id}|index|${index}`) } : {}),
  };
}
export function commentContext(key, groupId = "local-room") {
  const fields = String(key || "").split("|");
  if (fields.length !== 4 || !/^\d+$/.test(fields[3])) return null;
  return { groupId, sourceId: fields[0], mangaUrl: fields[1], chapterUrl: fields[2], pageIndex: Number(fields[3]) };
}
export function musicContext(key) {
  try {
    const parts = JSON.parse(key);
    if (!Array.isArray(parts) || parts.length !== 5 || !parts.slice(0, 4).every((v) => typeof v === "string") ||
      !Number.isInteger(Number(parts[4])) || Number(parts[4]) < 0) return null;
    return { groupId: parts[0], sourceId: parts[1], mangaUrl: parts[2], chapterUrl: parts[3], pageIndex: Number(parts[4]) };
  } catch { return null; }
}
export function sameChapter(left, right) {
  if (!left || !right || source(left) !== source(right)) return false;
  const selectedId = (context) => {
    const verified = verifiedAlias(context);
    if (verified?.explicitVerified) return canonicalId(verified.chapterId,context);
    if (context.recordIdentity && UUID.test(context.chapterId || "")) return canonicalId(context.chapterId,context);
    return resolveChapter(context)?.id || "";
  };
  const a = selectedId(left), b = selectedId(right);
  if (a && b) return a === b;
  return !!chapterRef(left) && workRef(left) === workRef(right) && chapterRef(left) === chapterRef(right);
}
export function samePage(left, right) {
  return !!left && !!right && scope(left) === scope(right) &&
    Number(left.pageIndex) === Number(right.pageIndex) && sameChapter(left, right);
}
export function sameMusicPage(left, right) { return samePage(musicContext(left), musicContext(right)); }
export function musicAliases(key) {
  const context = musicContext(key), chapter = context && resolveChapter(context);
  if (!context || !chapter) return [key];
  const aliases = [...chapter.aliases, ...state.verified.filter((row) =>
    row.scope === scope(context) && row.sourceId === source(context) && row.chapterId === chapter.id)];
  return [...new Set([key, ...aliases.map((alias) =>
    JSON.stringify([scope(context), source(context), alias.workRef, alias.chapterRef, context.pageIndex]))])];
}
export function registerPageLayout(context, pageCount) {
  const chapter = resolveChapter(context, { create: true });
  if (!chapter || !Number.isInteger(pageCount) || pageCount < 0) return null;
  if (chapter.pageCount === pageCount) return chapter;
  if (chapter.pageCount != null && chapter.pageCount !== pageCount) {
    chapter.previousPageCount = chapter.pageCount;
    chapter.layoutVersion = (chapter.layoutVersion || 1) + 1;
    chapter.layoutNeedsReview = true;
  }
  chapter.pageCount = pageCount; dirty = true; save();
  if (chapter.layoutNeedsReview && BROWSER)
    window.HanamiSnackbar?.show?.("La fuente cambió el número de páginas. Las anotaciones se conservan; revisa Identidad y recuperación antes de reubicarlas.", { kind: "warning" });
  return chapter;
}
export function anchorsAllowed(context) {
  const chapter = resolveChapter(context);
  return !chapter?.layoutNeedsReview;
}
export async function verifyAlias(oldContext, targetContext, { confirmed = false, pagesEquivalent = false, includePersonal = false, evidence = "" } = {}) {
  if (!confirmed || !pagesEquivalent) throw new Error("Confirma que es el mismo capítulo y que conserva la distribución de páginas.");
  if (source(oldContext) !== source(targetContext)) throw new Error("La recuperación entre fuentes distintas requiere revisar también la edición; no se aplica automáticamente.");
  if (!chapterRef(oldContext) || !chapterRef(targetContext) || !workRef(oldContext) || !workRef(targetContext))
    throw new Error("Faltan las referencias de obra y capítulo.");
  await backupReady;
  await checkpoint("Antes de confirmar una equivalencia de capítulo");
  const target = resolveChapter(targetContext, { create: true });
  if (!target) throw new Error("No se pudo identificar el capítulo de destino.");
  if (target.layoutNeedsReview) { target.layoutNeedsReview = false; dirty = true; }
  const scopes = [...new Set([scope(oldContext), ...(includePersonal ? ["local-room"] : [])])];
  for (const groupId of scopes) {
    const entry = {
      scope: groupId, sourceId: source(oldContext), workRef: workRef(oldContext), chapterRef: chapterRef(oldContext),
      chapterId: target.id, workId: target.workId, targetWorkRef: workRef(targetContext),
      targetChapterRef: chapterRef(targetContext), confirmedAt: Date.now(), evidence: String(evidence).slice(0, 600),
      pagesEquivalent: true, publishState: "local",
      explicitVerified: true,
    };
    const i = state.verified.findIndex((row) => row.scope === entry.scope && row.sourceId === entry.sourceId &&
      row.workRef === entry.workRef && row.chapterRef === entry.chapterRef);
    if (i < 0) state.verified.push(entry); else state.verified[i] = entry;
    dirty = true;
  }
  save(); emit();
  return target;
}
export function registrySnapshot() { return structuredClone(state); }
export function identityVersion() { return version; }
function emit() {
  if (BROWSER && !batchDepth) dispatchEvent(new CustomEvent("hanami-chapter-identity-change"));
}
export function acceptRemoteAlias(row) {
  if (!row || !UUID.test(row.chapter_id || "") || !source({ sourceId: row.source_id })) return;
  const context = {
    groupId: row.group_id, sourceId: row.source_id, mangaUrl: row.work_ref, chapterUrl: row.chapter_ref,
  };
  const localChapter = state.chapters.find((item) => item.sourceId === row.source_id &&
    item.aliases.some((alias) => alias.workRef === workRef(context) && alias.chapterRef === chapterRef(context)));
  const previous = state.verified.find((item) => item.scope === String(row.group_id) &&
    item.sourceId === row.source_id && item.workRef === workRef(context) && item.chapterRef === chapterRef(context));
  if (previous?.targetChapterRef && previous.publishState !== "shared" &&
    previous.chapterId !== row.chapter_id) {
    previous.sharedConflict = { chapterId: row.chapter_id, updatedAt: row.updated_at };
    dirty = true; save(); emit(); return;
  }
  if (localChapter && localChapter.id !== row.chapter_id &&
    (!localChapter.remoteId || !row.remote_id || localChapter.remoteId === row.remote_id)) {
    state.redirects ||= [];
    if (!state.redirects.some((item) => item.from === localChapter.id && item.to === row.chapter_id)) {
      state.redirects.push({ from: localChapter.id, to: row.chapter_id, sourceId: row.source_id,
        scope: "*", reason: "authoritative exact-locator reconciliation" });
      dirty = true;
    }
  }
  if (row.work_id && !state.works.some((item) => item.id === row.work_id && item.sourceId === row.source_id)) {
    state.works.push({ id: row.work_id, sourceId: row.source_id, aliases: [workRef(context)], createdAt: Date.now() });
    dirty = true;
  }
  let chapter = state.chapters.find((item) => item.id === row.chapter_id && item.sourceId === row.source_id);
  if (!chapter) {
    chapter = { id: row.chapter_id, workId: row.work_id || "", sourceId: row.source_id,
      remoteId: row.remote_id || remoteChapterId(context), aliases: [], pageCount: null, layoutVersion: 1 };
    state.chapters.push(chapter); dirty = true;
  }
  if (!chapter.aliases.some((alias) => alias.workRef === workRef(context) && alias.chapterRef === chapterRef(context))) {
    chapter.aliases.push({ workRef: workRef(context), chapterRef: chapterRef(context) }); dirty = true;
  }
  const entry = {
    scope: String(row.group_id), sourceId: row.source_id, workRef: workRef(context), chapterRef: chapterRef(context),
    chapterId: chapter.id, workId: chapter.workId, pagesEquivalent: row.pages_equivalent !== false,
    publishState: "shared", confirmedAt: Date.parse(row.updated_at) || Date.now(),
    explicitVerified: row.verified === true,
  };
  for (const local of state.verified) {
    if (local.scope === entry.scope && local.sourceId === entry.sourceId &&
      local.targetWorkRef === entry.workRef && local.targetChapterRef === entry.chapterRef) {
      local.chapterId = chapter.id; local.workId = chapter.workId;
    }
  }
  if (previous && previous.chapterId === entry.chapterId && previous.workId === entry.workId &&
    previous.publishState === "shared" && previous.confirmedAt === entry.confirmedAt) {
    save(); return;
  }
  const i = state.verified.findIndex((item) => item.scope === entry.scope && item.sourceId === entry.sourceId &&
    item.workRef === entry.workRef && item.chapterRef === entry.chapterRef);
  if (i < 0) state.verified.push(entry); else state.verified[i] = entry;
  dirty = true; save(); emit();
}
export function acceptRemoteAliases(rows) {
  batchDepth++;
  try { for (const row of rows) acceptRemoteAlias(row); }
  finally { batchDepth--; save(); emit(); }
}
export function pendingVerifiedAliases(groupId) {
  return state.verified.filter((row) => row.scope === groupId && row.publishState !== "shared" && row.targetChapterRef);
}
export function markAliasPublished(entry) {
  const row = state.verified.find((item) => item.scope === entry.scope && item.sourceId === entry.sourceId &&
    item.workRef === entry.workRef && item.chapterRef === entry.chapterRef);
  if (row) { row.publishState = "shared"; dirty = true; save(); }
}
export const ready = backupReady.then(() => {
  if (typeof localStorage === "undefined") return;
  const library = JSON.parse(localStorage.getItem("hanami-library") || "[]");
  for (const item of Array.isArray(library) ? library : []) prepareChapters(item, item._chapters || []);
}).catch((error) => {
  if (BROWSER) console.warn("[Hanami identity]", error.message);
});
if (BROWSER) {
  window.HanamiChapterIdentity = {
    ready, withIdentity, chapterContext, prepareChapters, resolveChapter, resolveWork, sameChapter, samePage,
    commentContext, musicContext, sameMusicPage, musicAliases, registrySnapshot, verifyAlias,
    anchorsAllowed, registerPageLayout, acceptRemoteAlias, acceptRemoteAliases, pendingVerifiedAliases, markAliasPublished,
  };
  addEventListener("hanami-identity-restored", () => { state = readRegistry(); version++; emit(); });
  addEventListener("storage", (event) => {
    if (event.key === KEY) { state = readRegistry(); version++; emit(); }
  });
}