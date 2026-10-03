import "./chapter-identity.js";
const CONFIG_KEY = "hanami-supabase-config-v1";
const SESSION_KEY = "hanami-supabase-session-v1";
let config = null;
let session = null;
let syncing = false;
let lastError = "";
let groupCache = [];

const read = (key, fallback = null) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) =>
  value == null
    ? localStorage.removeItem(key)
    : localStorage.setItem(key, JSON.stringify(value));
const emit = () =>
  dispatchEvent(new CustomEvent("hanami-social-state", { detail: state() }));
const state = () => ({
  configured: !!(config?.url && config?.anonKey),
  authenticated: !!session?.access_token,
  user: session?.user || null,
  anonymous: !!session?.user?.is_anonymous,
  displayName:
    session?.user?.user_metadata?.display_name ||
    session?.user?.email?.split("@")[0] ||
    "",
  syncing,
  lastError,
});
function normalizeConfig(value) {
  if (!value?.url || !value?.anonKey) return null;
  const url = new URL(String(value.url));
  if (url.protocol !== "https:" && url.hostname !== "127.0.0.1")
    throw new Error("Supabase debe utilizar HTTPS.");
  return {
    url: url.href.replace(/\/+$/, ""),
    anonKey: String(value.anonKey).trim(),
  };
}
function headers(extra = {}, authenticated = true) {
  return {
    apikey: config.anonKey,
    authorization: `Bearer ${
      authenticated && session?.access_token
        ? session.access_token
        : config.anonKey
    }`,
    ...extra,
  };
}
async function jsonRequest(path, options = {}, authenticated = true) {
  if (!config) throw new Error("Supabase no está configurado.");
  const response = await fetch(`${config.url}${path}`, {
    ...options,
    headers: headers(options.headers, authenticated),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) {
    const error = new Error(
      payload?.msg ||
        payload?.message ||
        payload?.error_description ||
        payload?.error ||
        `Supabase respondió HTTP ${response.status}`,
    );
    error.code = payload?.code || "";
    error.status = response.status;
    throw error;
  }
  return payload;
}
async function loadConfig() {
  const local = read(CONFIG_KEY);
  if (local) return normalizeConfig(local);
  try {
    const response = await fetch("/api/social-config", { cache: "no-store" });
    if (!response.ok) return null;
    const remote = await response.json();
    return remote.enabled ? normalizeConfig(remote) : null;
  } catch {
    return null;
  }
}
function captureMagicLink() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  if (!hash.get("access_token")) return false;
  session = {
    access_token: hash.get("access_token"),
    refresh_token: hash.get("refresh_token"),
    expires_at:
      Math.floor(Date.now() / 1000) + Number(hash.get("expires_in") || 3600),
    token_type: hash.get("token_type") || "bearer",
  };
  write(SESSION_KEY, session);
  history.replaceState(history.state, "", location.pathname + location.search);
  return true;
}
async function hydrateUser() {
  if (!session?.access_token || !config) return null;
  if (
    session.refresh_token &&
    Number(session.expires_at || 0) < Math.floor(Date.now() / 1000) + 60
  )
    await refreshSession();
  session.user = await jsonRequest("/auth/v1/user");
  write(SESSION_KEY, session);
  return session.user;
}
async function refreshSession() {
  const payload = await jsonRequest(
    "/auth/v1/token?grant_type=refresh_token",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    },
    false,
  );
  session = {
    ...payload,
    expires_at:
      Math.floor(Date.now() / 1000) + Number(payload.expires_in || 3600),
  };
  write(SESSION_KEY, session);
  return session;
}
function cleanDisplayName(value) {
  const clean = String(value || "").trim().replace(/\s+/g, " ");
  if (clean.length < 2 || clean.length > 40)
    throw new Error("El nombre debe tener entre 2 y 40 caracteres.");
  return clean;
}
function storeSession(payload) {
  if (!payload?.access_token || !payload?.refresh_token || !payload?.user)
    throw new Error("Supabase no devolvió una sesión anónima válida.");
  session = {
    ...payload,
    expires_at:
      Math.floor(Date.now() / 1000) + Number(payload.expires_in || 3600),
  };
  write(SESSION_KEY, session);
  emit();
  return session.user;
}
async function signInAnonymously(displayName) {
  const clean = cleanDisplayName(displayName);
  if (session?.access_token) {
    await updateProfile(clean);
    return session.user;
  }
  const payload = await jsonRequest(
    "/auth/v1/signup",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: { display_name: clean } }),
    },
    false,
  );
  return storeSession(payload);
}
async function signOut() {
  if (session?.access_token)
    await jsonRequest("/auth/v1/logout", { method: "POST" }).catch(() => {});
  session = null;
  write(SESSION_KEY, null);
  emit();
}
function configure(url, anonKey) {
  config = normalizeConfig({ url, anonKey });
  write(CONFIG_KEY, config);
  lastError = "";
  emit();
  return config;
}
function mapGroup(row) {
  return {
    id: row.id,
    name: row.name,
    inviteCode: row.invite_code,
    ownerId: row.owner_id,
    members: row.members || [],
    memberCount: Number(row.member_count || row.members?.length || 1),
    cover: row.cover || "/assets/reading-room-bedroom.webp",
    quote: row.quote || "La misma historia, desde lugares distintos.",
    remote: true,
    createdAt: Date.parse(row.created_at) || Date.now(),
    updatedAt: Date.parse(row.updated_at) || Date.now(),
  };
}
async function listGroups() {
  const rows = await jsonRequest("/rest/v1/rpc/list_my_reading_groups", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  groupCache = (rows || []).map(mapGroup);
  return groupCache;
}
async function createGroup({ name, quote }) {
  const rows = await jsonRequest("/rest/v1/rpc/create_reading_group", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ group_name: name, group_quote: quote || null }),
  });
  return mapGroup(Array.isArray(rows) ? rows[0] : rows);
}
async function updateGroup(groupId, { name, quote, cover }) {
  const rows = await jsonRequest("/rest/v1/rpc/update_reading_group", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      target_group: groupId,
      group_name: name,
      group_quote: quote,
      group_cover: cover || null,
    }),
  });
  const group = mapGroup(Array.isArray(rows) ? rows[0] : rows);
  groupCache = [
    group,
    ...groupCache.filter((candidate) => candidate.id !== group.id),
  ];
  return group;
}
async function leaveGroup(groupId) {
  await jsonRequest("/rest/v1/rpc/leave_reading_group", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ target_group: groupId }),
  });
  groupCache = groupCache.filter((group) => group.id !== groupId);
  return true;
}
async function manageMember(groupId, userId, action) {
  const rows = await jsonRequest("/rest/v1/rpc/manage_reading_group_member", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      target_group: groupId,
      target_user: userId,
      member_action: action,
    }),
  });
  const group = mapGroup(Array.isArray(rows) ? rows[0] : rows);
  groupCache = [
    group,
    ...groupCache.filter((candidate) => candidate.id !== group.id),
  ];
  return group;
}
async function uploadGroupCover(groupId, file) {
  if (!file?.type?.startsWith("image/"))
    throw new Error("Selecciona una imagen válida.");
  if (file.size > 4 * 1024 * 1024)
    throw new Error("La imagen no puede superar 4 MB.");
  const extension =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : file.type === "image/gif"
          ? "gif"
          : "jpg";
  const path = `${groupId}/cover.${extension}`;
  const response = await fetch(
    `${config.url}/storage/v1/object/group-covers/${path}`,
    {
      method: "POST",
      headers: headers({
        "content-type": file.type,
        "x-upsert": "true",
      }),
      body: file,
    },
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || "No se pudo subir la imagen del grupo.");
  }
  return `${config.url}/storage/v1/object/public/group-covers/${path}?v=${Date.now()}`;
}
async function updateProfile(displayName) {
  const clean = cleanDisplayName(displayName);
  if (!session?.user?.id) throw new Error("No hay una identidad activa.");
  const rows = await jsonRequest(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}&select=*`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        prefer: "return=representation",
      },
      body: JSON.stringify({
        display_name: clean,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  session.user = {
    ...session.user,
    user_metadata: {
      ...(session.user.user_metadata || {}),
      display_name: clean,
    },
  };
  write(SESSION_KEY, session);
  emit();
  return Array.isArray(rows) ? rows[0] : rows;
}
async function redeemInvite(code, displayName) {
  const cleanCode = String(code || "").trim().toUpperCase();
  const cleanName = cleanDisplayName(displayName);
  if (!/^[A-Z0-9-]{8,20}$/.test(cleanCode))
    throw new Error("Escribe un código de invitación válido.");
  const createdIdentity = !session?.access_token;
  if (createdIdentity) await signInAnonymously(cleanName);
  try {
    const rows = await jsonRequest(
      "/rest/v1/rpc/redeem_reading_group_invite",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          invite_code_input: cleanCode,
          display_name_input: cleanName,
        }),
      },
    );
    await updateProfile(cleanName);
    const group = mapGroup(Array.isArray(rows) ? rows[0] : rows);
    groupCache = [
      group,
      ...groupCache.filter((candidate) => candidate.id !== group.id),
    ];
    return group;
  } catch (error) {
    if (createdIdentity) await signOut();
    throw error;
  }
}
async function createInvite(groupId, expiresInHours = 168, maxUses = 1) {
  const rows = await jsonRequest(
    "/rest/v1/rpc/create_reading_group_invite",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target_group: groupId,
        expires_in_hours: Number(expiresInHours),
        allowed_uses: Number(maxUses),
      }),
    },
  );
  return Array.isArray(rows) ? rows[0] : rows;
}
async function listInvites(groupId) {
  const rows = await jsonRequest(
    "/rest/v1/rpc/list_reading_group_invites",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target_group: groupId }),
    },
  );
  return rows || [];
}
async function revokeInvite(inviteId) {
  return jsonRequest("/rest/v1/rpc/revoke_reading_group_invite", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ target_invite: inviteId }),
  });
}
function mapLibraryEntry(row) {
  return {
    id: row.id,
    groupId: row.group_id,
    sourceId: row.source_id,
    mangaUrl: row.manga_url,
    title: row.title,
    thumbnailUrl: row.thumbnail_url || "",
    genre: Array.isArray(row.genre) ? row.genre : [],
    status: row.status || "",
    description: row.description || "",
    recommendedBy: row.recommended_by,
    recommendedByName: row.recommended_by_name || "Lector",
    recommendation: row.recommendation || "",
    categoryIds: Array.isArray(row.category_ids) ? row.category_ids : [],
    progress: Array.isArray(row.progress) ? row.progress : [],
    createdAt: Date.parse(row.created_at) || Date.now(),
    updatedAt: Date.parse(row.updated_at) || Date.now(),
    remote: true,
    syncState: "synced",
  };
}
async function listGroupCategories(groupId) {
  const rows = await jsonRequest(
    "/rest/v1/rpc/list_group_library_categories",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target_group: groupId }),
    },
  );
  return (rows || []).map((row) => ({
    id: row.id,
    groupId: row.group_id,
    name: row.name,
    position: Number(row.sort_order ?? row.position) || 0,
    entryIds: Array.isArray(row.entry_ids) ? row.entry_ids : [],
  }));
}
async function manageGroupCategory(groupId, action, categoryId, name) {
  return jsonRequest("/rest/v1/rpc/manage_group_library_category", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      target_group: groupId,
      category_action: action,
      target_category: categoryId || null,
      category_name: name || null,
    }),
  });
}
async function reorderGroupCategories(groupId, categoryIds) {
  return jsonRequest("/rest/v1/rpc/reorder_group_library_categories", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      target_group: groupId,
      ordered_categories: categoryIds,
    }),
  });
}
async function setEntryCategories(groupId, entryId, categoryIds) {
  return jsonRequest("/rest/v1/rpc/set_group_library_entry_categories", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      target_group: groupId,
      target_entry: entryId,
      target_categories: categoryIds || [],
    }),
  });
}
async function deleteGroupEntry(groupId, entryId) {
  return jsonRequest("/rest/v1/rpc/delete_group_library_entry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      target_group: groupId,
      target_entry: entryId,
    }),
  });
}
async function listGroupLibrary(groupId) {
  const rows = await jsonRequest("/rest/v1/rpc/list_group_library", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ target_group: groupId }),
  });
  return (rows || []).map(mapLibraryEntry);
}
async function recommendManga(entry) {
  const rows = await jsonRequest(
    "/rest/v1/rpc/recommend_group_manga",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target_group: entry.groupId,
        target_source_id: entry.sourceId,
        target_manga_url: entry.mangaUrl,
        target_title: entry.title,
        target_thumbnail_url: entry.thumbnailUrl || null,
        target_genre: Array.isArray(entry.genre) ? entry.genre : [],
        target_status: entry.status || null,
        target_description: entry.description || null,
        target_recommendation: entry.recommendation || "",
      }),
    },
  );
  const row = Array.isArray(rows) ? rows[0] : rows;
  return mapLibraryEntry({
    ...row,
    recommended_by_name:
      session.user.user_metadata?.display_name ||
      session.user.email?.split("@")[0] ||
      "Tú",
    progress: [],
  });
}
async function saveGroupProgress(item) {
  const rows = await jsonRequest(
    "/rest/v1/group_reading_progress?on_conflict=group_id,entry_id,user_id&select=*",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({
        group_id: item.groupId,
        entry_id: item.entryId,
        user_id: session.user.id,
        chapter_url: item.chapterUrl || null,
        chapter_number:
          item.chapterNumber == null ? null : String(item.chapterNumber),
        chapter_name: item.chapterName || null,
        page_index: Number(item.pageIndex) || 0,
        page_count: Number(item.pageCount) || 0,
        completed: !!item.completed,
        updated_at: new Date(item.updatedAt || Date.now()).toISOString(),
      }),
    },
  );
  return Array.isArray(rows) ? rows[0] : rows;
}
function dataUrlBlob(value) {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(value || "");
  if (!match) return null;
  const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: match[1] });
}
async function uploadMedia(record) {
  const blob = dataUrlBlob(record.media);
  if (!blob) return record.mediaPath || null;
  const extension =
    blob.type === "image/gif"
      ? "gif"
      : blob.type === "image/png"
        ? "png"
        : blob.type === "image/webp"
          ? "webp"
          : "jpg";
  const path = `${record.groupId}/${record.id}.${extension}`;
  const response = await fetch(
    `${config.url}/storage/v1/object/comment-media/${path}`,
    {
      method: "POST",
      headers: headers({
        "content-type": blob.type,
        "x-upsert": "true",
      }),
      body: blob,
    },
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || "No se pudo subir el adjunto.");
  }
  return path;
}
function remoteComment(record, mediaPath) {
  return {
    id: record.id,
    group_id: record.groupId,
    author_id: session.user.id,
    page_key: record.pageKey,
    x: record.x,
    y: record.y,
    width: record.width,
    text: record.text || "",
    media_path: mediaPath,
    revision: record.revision || 1,
    created_at: new Date(record.createdAt || Date.now()).toISOString(),
    updated_at: new Date(record.updatedAt || Date.now()).toISOString(),
    deleted_at: record.deletedAt
      ? new Date(record.deletedAt).toISOString()
      : null,
  };
}
async function pushOperation(operation) {
  const record = window.HanamiReaderComments?.record?.(operation.recordKey);
  if (!record) {
    await window.HanamiReaderComments?.markOperation?.(operation.id);
    return;
  }
  const identityContext = record.originalContext ||
    window.HanamiChapterIdentity?.commentContext(record.pageKey,record.groupId);
  if (identityContext) await registerChapterIdentities(record.groupId,[identityContext]);
  const mediaPath = await uploadMedia(record);
  const rows = await jsonRequest(
    "/rest/v1/reader_comments?on_conflict=id&select=*",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(remoteComment(record, mediaPath)),
    },
  );
  await window.HanamiReaderComments?.markOperation?.(
    operation.id,
    Array.isArray(rows) ? rows[0] : rows,
  );
}
async function signedMediaUrl(path) {
  if (!path) return "";
  const payload = await jsonRequest(
    `/storage/v1/object/sign/comment-media/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expiresIn: 3600 }),
    },
  );
  const signed = payload?.signedURL || payload?.signedUrl || "";
  return signed
    ? `${config.url}/storage/v1${signed.startsWith("/") ? "" : "/"}${signed}`
    : "";
}
async function pullComments(groupId) {
  await pullChapterAliases(groupId);
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const batch = await jsonRequest(
      `/rest/v1/reader_comments?group_id=eq.${encodeURIComponent(groupId)}&select=*&order=updated_at.asc,id.asc&limit=500&offset=${offset}`,
    );
    rows.push(...(batch || []));
    if (!Array.isArray(batch) || batch.length < 500) break;
  }
  await Promise.all(
    (rows || []).map(async (row) => {
      if (row.media_path) row.media_url = await signedMediaUrl(row.media_path);
    }),
  );
  await window.HanamiReaderComments?.mergeRemote?.(rows || []);
  return rows || [];
}
async function sync(groupId = window.HanamiReadingGroups?.activeId?.()) {
  if (!state().authenticated || !groupId || groupId === "local-room")
    return { pushed: 0, pulled: 0 };
  syncing = true;
  lastError = "";
  emit();
  let pushed = 0;
  try {
    const operations =
      (await window.HanamiReaderComments?.pendingOperations?.(groupId)) || [];
    for (const operation of operations) {
      await pushOperation(operation);
      pushed++;
    }
    const rows = await pullComments(groupId);
    return { pushed, pulled: rows.length };
  } catch (error) {
    lastError = error.message;
    throw error;
  } finally {
    syncing = false;
    emit();
  }
}
async function listMusicTrends(limit = 30) {
  await ready;
  if (session?.access_token && session.refresh_token &&
      Number(session.expires_at || 0) < Math.floor(Date.now() / 1000) + 60)
    await refreshSession();
  return jsonRequest("/rest/v1/rpc/list_reader_music_trends", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ p_limit: Math.max(1, Math.min(50, Number(limit) || 30)) }),
    signal: AbortSignal.timeout(15000),
  });
}

async function recordMusicActivity(activity) {
  await ready;
  if (!state().authenticated || activity.actorId !== session?.user?.id)
    throw new Error("La actividad no pertenece a la sesión actual.");
  if (session.refresh_token &&
      Number(session.expires_at || 0) < Math.floor(Date.now() / 1000) + 60)
    await refreshSession();
  if (activity.actorId !== session?.user?.id)
    throw new Error("La sesión ha cambiado antes de enviar la actividad.");
  return jsonRequest("/rest/v1/rpc/record_reader_music_activity", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      p_event_id: activity.id,
      p_track: activity.track,
      p_kind: activity.kind,
    }),
    signal: AbortSignal.timeout(15000),
  });
}

async function groupMusicRequest(actorId, path, payload) {
  await ready;
  if (!state().authenticated || actorId !== session?.user?.id)
    throw new Error("La sesión actual no puede sincronizar estas pistas.");
  if (session.refresh_token && Number(session.expires_at || 0) < Math.floor(Date.now() / 1000) + 60)
    await refreshSession();
  if (actorId !== session?.user?.id)
    throw new Error("La cuenta ha cambiado antes de sincronizar las pistas.");
  const result = await jsonRequest(path, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(15000),
  });
  if (actorId !== session?.user?.id) throw new Error("La cuenta ha cambiado durante la sincronización.");
  return result;
}
let identityBackend = null;
let identityError = "";
const identityRegistrations = new Map();
const missingIdentity = (error) => error.code === "PGRST202" || error.status === 404;
const remoteIdentityGroup = (value) => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(String(value || ""));
function identityStatus() { return { available: identityBackend, error: identityError }; }
async function registerChapterIdentities(groupId, contexts = []) {
  if (identityBackend === false || !session?.user?.id || !remoteIdentityGroup(groupId)) return [];
  await window.HanamiIdentityBackup?.ready;
  const api = window.HanamiChapterIdentity, actorId = session.user.id;
  if (!api) return [];
  const results = [];
  for (const original of contexts) {
    if (!original?.sourceId || original.sourceId === "hanami.local" || !original.chapterUrl ||
      !(original.mangaUrl || original.mangaId)) continue;
    const context = { ...original, groupId };
    const pending = api.pendingVerifiedAliases(groupId).some((row) =>
      row.sourceId === context.sourceId && row.workRef === (context.mangaUrl || context.mangaId) &&
      row.chapterRef === context.chapterUrl);
    if (pending) continue; // never publish a manually chosen local repair implicitly
    const resolved = api.withIdentity(context, { create: true });
    if (!resolved.chapterId || !resolved.workId) continue;
    const key = JSON.stringify([actorId,groupId,context.sourceId,context.mangaUrl || context.mangaId,context.chapterUrl]);
    if (!identityRegistrations.has(key)) {
      const request = groupMusicRequest(actorId,"/rest/v1/rpc/register_group_chapter_identity", {
        p_group: groupId, p_source_id: context.sourceId,
        p_work_ref: context.mangaUrl || context.mangaId, p_chapter_ref: context.chapterUrl,
        p_chapter_id: resolved.chapterId, p_work_id: resolved.workId,
        p_remote_chapter_id: String(context.remoteChapterId || ""),
        p_remote_scope: context.remoteChapterIdScope || "work",
      }).then((row) => {
        identityBackend = true; identityError = "";
        const value = Array.isArray(row) ? row[0] : row;
        api.acceptRemoteAlias(value);
        return value;
      }).catch((error) => {
        identityRegistrations.delete(key);
        if (missingIdentity(error)) { identityBackend = false; return null; }
        identityError = error.message; throw error;
      });
      identityRegistrations.set(key, request);
    }
    const row = await identityRegistrations.get(key);
    if (row) results.push(row);
    if (identityBackend === false) break;
  }
  return results;
}
async function pullChapterAliases(groupId) {
  if (identityBackend === false || !session?.user?.id || !remoteIdentityGroup(groupId)) return [];
  await window.HanamiIdentityBackup?.ready;
  const actorId = session.user.id, rows = [];
  try {
    for (let offset = 0; ; offset += 250) {
      const batch = await groupMusicRequest(actorId,"/rest/v1/rpc/list_group_chapter_aliases", {
        p_group: groupId, p_offset: offset, p_limit: 250,
      });
      rows.push(...(Array.isArray(batch) ? batch : []));
      if (!Array.isArray(batch) || batch.length < 250) break;
    }
    identityBackend = true; identityError = "";
    window.HanamiChapterIdentity?.acceptRemoteAliases(rows);
    return rows;
  } catch (error) {
    if (missingIdentity(error)) { identityBackend = false; return []; }
    identityError = error.message; throw error;
  }
}
async function publishVerifiedAlias(groupId, alias) {
  identityBackend = null;
  await registerChapterIdentities(groupId, [{
    sourceId: alias.sourceId, mangaUrl: alias.targetWorkRef, chapterUrl: alias.targetChapterRef,
  }]);
  if (identityBackend === false) throw new Error("Aplica hanami-chapter-identity-v144.sql para compartir esta equivalencia.");
  const row = await groupMusicRequest(session?.user?.id,"/rest/v1/rpc/verify_group_chapter_alias", {
    p_group: groupId, p_source_id: alias.sourceId, p_old_work_ref: alias.workRef,
    p_old_chapter_ref: alias.chapterRef, p_target_work_ref: alias.targetWorkRef,
    p_target_chapter_ref: alias.targetChapterRef, p_pages_equivalent: true,
    p_evidence: alias.evidence || "",
  });
  window.HanamiChapterIdentity?.markAliasPublished(alias);
  window.HanamiChapterIdentity?.acceptRemoteAlias(Array.isArray(row) ? row[0] : row);
  return row;
}
async function musicIdentityInventory(groupId) {
  if (!session?.user?.id || !remoteIdentityGroup(groupId)) return [];
  const actorId = session.user.id, rows = [];
  try {
    for (let offset = 0; ; offset += 250) {
      const batch = await groupMusicRequest(actorId,"/rest/v1/rpc/list_group_music_identity_inventory", {
        p_group: groupId, p_offset: offset, p_limit: 250,
      });
      rows.push(...(Array.isArray(batch) ? batch : []));
      if (!Array.isArray(batch) || batch.length < 250) break;
    }
    identityBackend = true;
    return rows;
  } catch (error) {
    if (missingIdentity(error)) { identityBackend = false; return []; }
    throw error;
  }
}
async function retryIdentitySupport(groupId) {
  identityBackend = null; identityError = ""; identityRegistrations.clear();
  return pullChapterAliases(groupId);
}
async function listGroupMusicPins(groupId, pageKeys, actorId = session?.user?.id) {
  const contexts = [...document.querySelectorAll("#readerViewport figure[data-comment-context]")]
    .map((node) => { try { return JSON.parse(node.dataset.commentContext); } catch { return null; } })
    .filter(Boolean);
  await registerChapterIdentities(groupId, contexts);
  if (identityBackend !== false) {
    try {
      const result = await groupMusicRequest(actorId,"/rest/v1/rpc/list_group_reader_music_pins_v144", {
        p_group: groupId, p_page_keys: pageKeys,
      });
      identityBackend = true; return result;
    } catch (error) {
      if (!missingIdentity(error)) throw error;
      identityBackend = false;
    }
  }
  return groupMusicRequest(actorId, "/rest/v1/rpc/list_group_reader_music_pins", {
    p_group: groupId, p_page_keys: pageKeys,
  });
}
async function saveGroupMusicPin(operation) {
  const record = operation.record;
  return groupMusicRequest(operation.actorId, "/rest/v1/rpc/upsert_group_reader_music_pin", {
    p_group: operation.groupId, p_pin_id: record.id, p_page_key: record.pageKey,
    p_x: record.x, p_y: record.y, p_track: record.track, p_revision: record.revision,
  });
}
async function deleteGroupMusicPin(operation) {
  return groupMusicRequest(operation.actorId, "/rest/v1/rpc/delete_group_reader_music_pin", {
    p_group: operation.groupId, p_pin_id: operation.record.id, p_revision: operation.record.revision,
  });
}

async function bootstrap() {
  config = await loadConfig();
  session = read(SESSION_KEY);
  captureMagicLink();
  if (config && session?.access_token) {
    try {
      await hydrateUser();
      const remote = await listGroups();
      window.HanamiReadingGroups?.mergeRemoteGroups?.(remote);
    } catch (error) {
      lastError = error.message;
      if (/jwt|token|session|unauthorized/i.test(lastError)) {
        session = null;
        write(SESSION_KEY, null);
      }
    }
  }
  emit();
  return state();
}
const ready = bootstrap();
addEventListener("online", () => {
  if (state().authenticated) sync().catch(() => {});
});
addEventListener("hanami-reader-comments-ready", () => {
  if (state().authenticated) sync().catch(() => {});
});
window.HanamiSocialSync = {
  ready,
  state,
  configure,
  signInAnonymously,
  signOut,
  updateProfile,
  listGroups,
  createGroup,
  updateGroup,
  leaveGroup,
  manageMember,
  uploadGroupCover,
  redeemInvite,
  createInvite,
  listInvites,
  revokeInvite,
  listGroupLibrary,
  listGroupCategories,
  manageGroupCategory,
  reorderGroupCategories,
  setEntryCategories,
  deleteGroupEntry,
  recommendManga,
  saveGroupProgress,
  listMusicTrends,
  recordMusicActivity,
  listGroupMusicPins,
  saveGroupMusicPin,
  deleteGroupMusicPin,
  sync,
  pullComments,
  registerChapterIdentities,
  pullChapterAliases,
  publishVerifiedAlias,
  musicIdentityInventory,
  retryIdentitySupport,
  identityStatus,
  cachedGroups: () => [...groupCache],
};