const LIBRARY_KEY = "hanami-group-libraries-v1";
const PROGRESS_KEY = "hanami-group-progress-v1";
const CONTEXT_KEY = "hanami-group-reading-context-v1";
const CATEGORY_KEY = "hanami-group-library-categories-v1";
const ACTIVE_CATEGORY_KEY = "hanami-group-library-active-category-v1";
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) =>
  localStorage.setItem(key, JSON.stringify(value));
const keyFor = (sourceId, mangaUrl) => `${sourceId}|${mangaUrl}`;
let loadedGroups = new Set();
let progressTimer = 0;

function libraries() {
  return read(LIBRARY_KEY, {});
}
function entries(groupId) {
  return libraries()[groupId] || [];
}
function saveEntries(groupId, value) {
  const all = libraries();
  all[groupId] = value;
  write(LIBRARY_KEY, all);
}
function categoryStore() {
  return read(CATEGORY_KEY, {});
}
function categories(groupId) {
  return categoryStore()[groupId] || [];
}
function saveCategories(groupId, value) {
  const all = categoryStore();
  all[groupId] = value;
  write(CATEGORY_KEY, all);
}
function activeCategories() {
  return read(ACTIVE_CATEGORY_KEY, {});
}
function activeCategory(groupId) {
  const value = activeCategories()[groupId] || "all";
  return value === "all" || categories(groupId).some((item) => item.id === value)
    ? value
    : "all";
}
function setActiveCategory(groupId, categoryId) {
  const all = activeCategories();
  all[groupId] = categoryId;
  write(ACTIVE_CATEGORY_KEY, all);
  rerenderGroup(groupId);
}
function group(groupId) {
  return (
    window.HanamiReadingGroups?.groups?.().find((item) => item.id === groupId) ||
    null
  );
}
function isOwner(groupId) {
  const userId = window.HanamiSocialSync?.state?.().user?.id || profile().id;
  return group(groupId)?.ownerId === userId;
}
function isRemote(groupId) {
  return !!group(groupId)?.remote;
}
function progresses() {
  return read(PROGRESS_KEY, {});
}
function saveProgresses(value) {
  write(PROGRESS_KEY, value);
}
function rerenderGroup(groupId) {
  if (
    document.body.dataset.root === "library" &&
    window.HanamiLibraryGroups?.scope?.() === groupId
  )
    window.HanamiLibrary?.render?.();
  else if (window.HanamiReadingGroups?.active?.()?.id === groupId)
    window.HanamiReadingGroups?.detail?.(
      window.HanamiReadingGroups.active(),
      true,
    );
}
function profile() {
  const user = window.HanamiSocialSync?.state?.().user;
  if (user?.id) {
    const name =
      user.user_metadata?.display_name ||
      user.email?.split("@")[0] ||
      "Tú";
    return {
      id: user.id,
      name,
      initials:
        name
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part[0])
          .join("")
          .toUpperCase() || "TÚ",
    };
  }
  return window.HanamiReadingGroups?.profile?.() || {
    id: "local-user",
    name: "Tú",
    initials: "TÚ",
  };
}
function progressFor(groupId, entryId) {
  return Object.values(progresses()).filter(
    (item) => item.groupId === groupId && item.entryId === entryId,
  );
}
function progressLabel(item) {
  if (!item) return "Sin empezar";
  const chapter =
    item.chapterName ||
    (item.chapterNumber != null ? `Cap. ${item.chapterNumber}` : "En lectura");
  if (item.completed) return `${chapter} · completado`;
  if (item.pageCount)
    return `${chapter} · ${Math.min(item.pageCount, (item.pageIndex || 0) + 1)}/${item.pageCount}`;
  return chapter;
}
function memberProgress(groupId, entryId) {
  const rows = progressFor(groupId, entryId);
  if (!rows.length)
    return '<div class="group-progress-empty">Nadie ha empezado todavía.</div>';
  return `<div class="group-progress-list">${rows
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(
      (item) =>
        `<div title="${esc(progressLabel(item))}"><i>${esc(item.initials || "?")}</i><span><b>${esc(item.userName || "Lector")}</b><small>${esc(progressLabel(item))}</small></span></div>`,
    )
    .join("")}</div>`;
}
function card(entry, groupId) {
  return `<article class="group-library-card" data-group-library-open="${esc(entry.id)}" data-group-id="${esc(groupId)}"><button class="group-library-cover"><img src="${esc(entry.thumbnailUrl || "/assets/fallen.webp")}" alt=""><span>${entry.remote ? "compartido" : "pendiente"}</span></button><div><small>RECOMENDADO POR ${esc(entry.recommendedByName || "un miembro")}</small><h4>${esc(entry.title)}</h4><blockquote>“${esc(entry.recommendation || "Creo que deberíamos leer esto.")}”</blockquote>${memberProgress(groupId, entry.id)}<div class="group-library-actions"><button data-group-library-details="${esc(entry.id)}" data-group-id="${esc(groupId)}">Ver obra</button><button data-group-library-read="${esc(entry.id)}" data-group-id="${esc(groupId)}">Leer</button></div></div></article>`;
}
function section(group) {
  const list = entries(group.id);
  return `<section class="group-library-section"><div class="reading-groups-heading"><div><small>SHARED SHELF // INDEPENDENT</small><h3>Biblioteca compartida</h3></div><div><button class="btn" data-group-library-refresh="${esc(group.id)}">Actualizar</button><button class="btn acid" data-group-library-recommend="${esc(group.id)}">Recomendar lectura</button></div></div><p class="group-library-intro">Las recomendaciones y el progreso de esta sala son independientes de tu Biblioteca personal.</p>${list.length ? `<div class="group-library-grid">${list.map((entry) => card(entry, group.id)).join("")}</div>` : '<div class="group-library-empty"><b>La estantería está vacía.</b><span>Recomienda una obra de tu biblioteca para empezar a leer juntos.</span></div>'}</section>`;
}
function mergeRemote(groupId, remote = []) {
  const local = entries(groupId);
  const merged = [...local];
  const allProgress = progresses();
  for (const incoming of remote) {
    const index = merged.findIndex(
      (item) =>
        item.id === incoming.id ||
        keyFor(item.sourceId, item.mangaUrl) ===
          keyFor(incoming.sourceId, incoming.mangaUrl),
    );
    if (index < 0) merged.push({ ...incoming, remote: true, syncState: "synced" });
    else {
      const oldId = merged[index].id;
      if (oldId !== incoming.id) {
        for (const [key, item] of Object.entries(allProgress)) {
          if (item.groupId !== groupId || item.entryId !== oldId) continue;
          const next = {
            ...item,
            entryId: incoming.id,
            syncState: "pending",
          };
          delete allProgress[key];
          allProgress[`${groupId}|${incoming.id}|${item.userId}`] = next;
        }
      }
      merged[index] = {
        ...merged[index],
        ...incoming,
        remote: true,
        syncState: "synced",
      };
    }
  }
  saveEntries(groupId, merged);
  for (const entry of remote)
    for (const item of entry.progress || []) {
      const id = `${groupId}|${entry.id}|${item.userId}`;
      allProgress[id] = { ...item, groupId, entryId: entry.id, syncState: "synced" };
    }
  saveProgresses(allProgress);
  return merged;
}
async function refresh(groupId, rerender = true) {
  if (
    isRemote(groupId) &&
    window.HanamiSocialSync?.state?.().authenticated
  ) {
    await flush(groupId);
    const [remote, remoteCategories] = await Promise.all([
      window.HanamiSocialSync.listGroupLibrary(groupId),
      window.HanamiSocialSync.listGroupCategories(groupId),
    ]);
    for (const entry of remote)
      entry.categoryIds = remoteCategories
        .filter((category) => category.entryIds?.includes(entry.id))
        .map((category) => category.id);
    mergeRemote(groupId, remote);
    saveCategories(groupId, remoteCategories);
    await window.HanamiSocialSync.pullComments(groupId);
  }
  loadedGroups.add(groupId);
  if (rerender) rerenderGroup(groupId);
  return entries(groupId);
}
function categoryDialog(groupId) {
  if (!isOwner(groupId)) return;
  const modal = document.querySelector("#modal");
  const body = document.querySelector("#modalBody");
  const list = categories(groupId);
  body.innerHTML = `<section class="dialog-section group-category-dialog"><small class="eyebrow">BIBLIOTECA DEL GRUPO</small><h3>Categorías</h3><p>Estas categorías solo organizan la estantería compartida.</p><div class="group-category-list">${list.length ? list.map((item) => `<article><b>${esc(item.name)}</b><div><button class="btn" data-group-category-rename="${esc(item.id)}" data-group-id="${esc(groupId)}">Renombrar</button><button class="btn danger" data-group-category-delete="${esc(item.id)}" data-group-id="${esc(groupId)}">Eliminar</button></div></article>`).join("") : '<p class="empty">Todavía no hay categorías.</p>'}</div><button class="btn acid" data-group-category-add="${esc(groupId)}">Añadir categoría</button></section>`;
  if (!modal.open) modal.showModal();
}
async function addCategory(groupId) {
  const name = prompt("Nombre de la categoría")?.trim();
  if (!name) return;
  if (isRemote(groupId) && window.HanamiSocialSync?.state?.().authenticated)
    await window.HanamiSocialSync.manageGroupCategory(
      groupId,
      "create",
      null,
      name,
    );
  else
    saveCategories(groupId, [
      ...categories(groupId),
      { id: crypto.randomUUID(), groupId, name, position: categories(groupId).length },
    ]);
  await refresh(groupId, false);
  categoryDialog(groupId);
  rerenderGroup(groupId);
}
async function renameCategory(groupId, categoryId) {
  const current = categories(groupId).find((item) => item.id === categoryId);
  const name = prompt("Nuevo nombre", current?.name || "")?.trim();
  if (!name) return;
  if (isRemote(groupId) && window.HanamiSocialSync?.state?.().authenticated)
    await window.HanamiSocialSync.manageGroupCategory(
      groupId,
      "rename",
      categoryId,
      name,
    );
  else
    saveCategories(
      groupId,
      categories(groupId).map((item) =>
        item.id === categoryId ? { ...item, name } : item,
      ),
    );
  await refresh(groupId, false);
  categoryDialog(groupId);
  rerenderGroup(groupId);
}
async function deleteCategory(groupId, categoryId) {
  if (!confirm("¿Eliminar esta categoría? Las recomendaciones no se borrarán."))
    return;
  if (isRemote(groupId) && window.HanamiSocialSync?.state?.().authenticated)
    await window.HanamiSocialSync.manageGroupCategory(
      groupId,
      "delete",
      categoryId,
      null,
    );
  else {
    saveCategories(
      groupId,
      categories(groupId).filter((item) => item.id !== categoryId),
    );
    saveEntries(
      groupId,
      entries(groupId).map((item) => ({
        ...item,
        categoryIds: (item.categoryIds || []).filter(
          (id) => id !== categoryId,
        ),
      })),
    );
  }
  setActiveCategory(groupId, "all");
  await refresh(groupId, false);
  categoryDialog(groupId);
}
function entryManageDialog(groupId, entryId) {
  const entry = entries(groupId).find((item) => item.id === entryId);
  const userId = profile().id;
  if (!entry || (!isOwner(groupId) && entry.recommendedBy !== userId)) return;
  const modal = document.querySelector("#modal");
  const body = document.querySelector("#modalBody");
  const selected = new Set(entry.categoryIds || []);
  body.innerHTML = `<section class="dialog-section group-entry-manage-dialog"><small class="eyebrow">RECOMENDACIÓN</small><h3>${esc(entry.title)}</h3>${categories(groupId).length ? `<fieldset><legend>Categorías</legend>${categories(groupId).map((item) => `<label><input type="checkbox" data-group-entry-category="${esc(item.id)}" ${selected.has(item.id) ? "checked" : ""}> ${esc(item.name)}</label>`).join("")}</fieldset>` : '<p class="empty">Crea categorías desde la administración de la sala.</p>'}<div><button class="btn acid" data-group-entry-categories-save="${esc(entryId)}" data-group-id="${esc(groupId)}">Guardar categorías</button><button class="btn danger" data-group-entry-delete="${esc(entryId)}" data-group-id="${esc(groupId)}">Eliminar recomendación</button></div></section>`;
  if (!modal.open) modal.showModal();
}
async function saveEntryCategories(groupId, entryId) {
  const ids = [
    ...document.querySelectorAll(
      "#modalBody [data-group-entry-category]:checked",
    ),
  ].map((item) => item.dataset.groupEntryCategory);
  if (isRemote(groupId) && window.HanamiSocialSync?.state?.().authenticated)
    await window.HanamiSocialSync.setEntryCategories(groupId, entryId, ids);
  saveEntries(
    groupId,
    entries(groupId).map((item) =>
      item.id === entryId ? { ...item, categoryIds: ids } : item,
    ),
  );
  document.querySelector("#modal")?.close();
  await refresh(groupId);
}
async function deleteEntry(groupId, entryId) {
  if (!confirm("¿Eliminar esta recomendación de la biblioteca del grupo?"))
    return;
  if (isRemote(groupId) && window.HanamiSocialSync?.state?.().authenticated)
    await window.HanamiSocialSync.deleteGroupEntry(groupId, entryId);
  saveEntries(
    groupId,
    entries(groupId).filter((item) => item.id !== entryId),
  );
  document.querySelector("#modal")?.close();
  await refresh(groupId);
}
function ensure(groupId) {
  if (loadedGroups.has(groupId)) return;
  loadedGroups.add(groupId);
  refresh(groupId).catch((error) =>
    window.HanamiSnackbar?.show?.(error.message, { kind: "error" }),
  );
}
function localLibrary() {
  return read("hanami-library", []).filter((item) => item.favorite !== false);
}
function recommendDialog(groupId) {
  const personal = localLibrary();
  const modal = document.querySelector("#modal");
  const body = document.querySelector("#modalBody");
  body.innerHTML = `<div class="dialog-section group-recommend-dialog"><small class="eyebrow">BIBLIOTECA DEL GRUPO</small><h3>Recomendar una lectura</h3><p>La obra se copiará como referencia. Tu Biblioteca personal no se modificará.</p>${personal.length ? `<div>${personal.map((item) => `<button data-group-recommend-item="${esc(item.id)}" data-group-id="${esc(groupId)}"><img src="${esc(item.thumbnailUrl || "/assets/fallen.webp")}" alt=""><span><b>${esc(item.title)}</b><small>${esc(item.sourceId || "Fuente desconocida")}</small></span></button>`).join("")}</div>` : '<p class="empty">No tienes obras en tu Biblioteca personal.</p>'}</div>`;
  modal.showModal();
}
async function recommend(groupId, libraryId) {
  const manga = localLibrary().find((item) => String(item.id) === libraryId);
  if (!manga) return;
  const reason =
    prompt("¿Por qué recomiendas esta obra?", "Creo que deberíamos leerla juntos.")?.trim() ||
    "Creo que deberíamos leerla juntos.";
  const user = profile();
  let entry = {
    id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    groupId,
    sourceId: manga.sourceId,
    mangaUrl: manga.url,
    title: manga.title,
    thumbnailUrl: manga.thumbnailUrl || "",
    genre: Array.isArray(manga.genre) ? manga.genre : [],
    status: manga.status || "",
    description: manga.description || "",
    recommendedBy: user.id,
    recommendedByName: user.name,
    recommendation: reason,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    syncState: "pending",
    remote: false,
  };
  const list = entries(groupId);
  const existing = list.find(
    (item) =>
      keyFor(item.sourceId, item.mangaUrl) ===
      keyFor(entry.sourceId, entry.mangaUrl),
  );
  if (existing) entry = { ...existing, ...entry, id: existing.id };
  saveEntries(groupId, [
    ...list.filter((item) => item.id !== entry.id),
    entry,
  ]);
  if (isRemote(groupId) && window.HanamiSocialSync?.state?.().authenticated) {
    const remote = await window.HanamiSocialSync.recommendManga(entry);
    mergeRemote(groupId, [remote]);
  }
  document.querySelector("#modal")?.close();
  rerenderGroup(groupId);
}
function setContext(groupId, entry) {
  sessionStorage.setItem(
    CONTEXT_KEY,
    JSON.stringify({
      groupId,
      entryId: entry.id,
      sourceId: entry.sourceId,
      mangaUrl: entry.mangaUrl,
      openedAt: Date.now(),
    }),
  );
  window.HanamiReadingGroups?.setActive?.(groupId);
}
async function openEntry(groupId, entryId) {
  const entry = entries(groupId).find((item) => item.id === entryId);
  if (!entry) return;
  if (entry.sourceId === "hanami.local") {
    const local = localLibrary().some(
      (item) => item.sourceId === entry.sourceId && item.url === entry.mangaUrl,
    );
    if (!local) {
      window.HanamiSnackbar?.show?.(
        "Esta obra usa la fuente Local y no existe en este dispositivo.",
        { kind: "warning" },
      );
      return;
    }
  }
  setContext(groupId, entry);
  await window.HanamiSocialSync?.pullComments?.(groupId).catch(() => {});
  window.HanamiAppOpenGroupManga?.(groupId, entry);
}
function restoreDetails(groupId, entryId) {
  const entry = entries(groupId).find((item) => item.id === entryId);
  if (!entry) return false;
  setContext(groupId, entry);
  return window.HanamiAppOpenGroupManga?.(groupId, entry, true);
}
function context() {
  try {
    return JSON.parse(sessionStorage.getItem(CONTEXT_KEY) || "null");
  } catch {
    return null;
  }
}
function localProgress(detail) {
  const reading = context();
  if (
    !reading ||
    String(reading.sourceId) !== String(detail.sourceId) ||
    (reading.mangaUrl &&
      detail.mangaUrl &&
      String(reading.mangaUrl) !== String(detail.mangaUrl))
  )
    return;
  const user = profile();
  const all = progresses();
  const id = `${reading.groupId}|${reading.entryId}|${user.id}`;
  all[id] = {
    ...all[id],
    groupId: reading.groupId,
    entryId: reading.entryId,
    userId: user.id,
    userName: user.name,
    initials: user.initials,
    chapterUrl: detail.chapterUrl,
    chapterNumber: detail.chapterNumber,
    chapterName: detail.chapterName,
    pageIndex: detail.pageIndex,
    pageCount: detail.pageCount,
    completed: !!detail.completed,
    updatedAt: Date.now(),
    syncState: "pending",
  };
  saveProgresses(all);
  clearTimeout(progressTimer);
  progressTimer = setTimeout(() => flushProgress(reading.groupId), 1200);
}
async function flushProgress(groupId) {
  if (
    !isRemote(groupId) ||
    !window.HanamiSocialSync?.state?.().authenticated
  )
    return;
  const all = progresses();
  for (const [id, item] of Object.entries(all)) {
    if (item.groupId !== groupId || item.syncState !== "pending") continue;
    await window.HanamiSocialSync.saveGroupProgress(item);
    all[id] = { ...item, syncState: "synced", syncedAt: Date.now() };
  }
  saveProgresses(all);
}
async function flush(groupId) {
  if (
    !isRemote(groupId) ||
    !window.HanamiSocialSync?.state?.().authenticated
  )
    return;
  const list = entries(groupId);
  for (const entry of list.filter((item) => item.syncState === "pending")) {
    const remote = await window.HanamiSocialSync.recommendManga(entry);
    mergeRemote(groupId, [remote]);
  }
  await flushProgress(groupId);
}
function exportBundle(groupId) {
  return {
    entries: entries(groupId),
    progress: Object.values(progresses()).filter(
      (item) => item.groupId === groupId,
    ),
  };
}
function importBundle(groupId, bundle = {}) {
  const current = entries(groupId);
  const merged = [...current];
  for (const incoming of bundle.entries || []) {
    const index = merged.findIndex(
      (item) =>
        item.id === incoming.id ||
        keyFor(item.sourceId, item.mangaUrl) ===
          keyFor(incoming.sourceId, incoming.mangaUrl),
    );
    if (index < 0) merged.push(incoming);
    else if ((incoming.updatedAt || 0) >= (merged[index].updatedAt || 0))
      merged[index] = { ...merged[index], ...incoming };
  }
  saveEntries(groupId, merged);
  const all = progresses();
  for (const item of bundle.progress || [])
    all[`${groupId}|${item.entryId}|${item.userId}`] = {
      ...item,
      groupId,
    };
  saveProgresses(all);
  return merged;
}
document.addEventListener("click", async (event) => {
  const target = event.target.closest(
    "[data-group-library-recommend],[data-group-recommend-item],[data-group-library-open],[data-group-library-details],[data-group-library-read],[data-group-library-refresh],[data-group-category-filter],[data-group-category-manage],[data-group-category-add],[data-group-category-rename],[data-group-category-delete],[data-group-entry-manage],[data-group-entry-categories-save],[data-group-entry-delete]",
  );
  if (!target) return;
  if (target.dataset.groupLibraryRecommend)
    recommendDialog(target.dataset.groupLibraryRecommend);
  if (target.dataset.groupRecommendItem)
    await recommend(target.dataset.groupId, target.dataset.groupRecommendItem);
  const entryId =
    target.dataset.groupLibraryOpen ||
    target.dataset.groupLibraryDetails ||
    target.dataset.groupLibraryRead;
  if (entryId) await openEntry(target.dataset.groupId, entryId);
  if (target.dataset.groupLibraryRefresh)
    await refresh(target.dataset.groupLibraryRefresh);
  if (target.dataset.groupCategoryFilter)
    setActiveCategory(target.dataset.groupId, target.dataset.groupCategoryFilter);
  if (target.dataset.groupCategoryManage)
    categoryDialog(target.dataset.groupCategoryManage);
  if (target.dataset.groupCategoryAdd)
    await addCategory(target.dataset.groupCategoryAdd);
  if (target.dataset.groupCategoryRename)
    await renameCategory(
      target.dataset.groupId,
      target.dataset.groupCategoryRename,
    );
  if (target.dataset.groupCategoryDelete)
    await deleteCategory(
      target.dataset.groupId,
      target.dataset.groupCategoryDelete,
    );
  if (target.dataset.groupEntryManage)
    entryManageDialog(target.dataset.groupId, target.dataset.groupEntryManage);
  if (target.dataset.groupEntryCategoriesSave)
    await saveEntryCategories(
      target.dataset.groupId,
      target.dataset.groupEntryCategoriesSave,
    );
  if (target.dataset.groupEntryDelete)
    await deleteEntry(target.dataset.groupId, target.dataset.groupEntryDelete);
});
addEventListener("hanami-reader-progress", (event) =>
  localProgress(event.detail || {}),
);
addEventListener("online", () => {
  const reading = context();
  if (reading) flush(reading.groupId).catch(() => {});
});
addEventListener("hanami-screen-change", (event) => {
  if (event.detail?.screen?.type === "reading-group")
    sessionStorage.removeItem(CONTEXT_KEY);
});
window.HanamiGroupLibrary = {
  section,
  ensure,
  refresh,
  entries,
  categories,
  activeCategory,
  isOwner,
  categoryDialog,
  progressFor,
  recommendDialog,
  openEntry,
  restoreDetails,
  flush,
  context,
  exportBundle,
  importBundle,
};