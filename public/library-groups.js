const SCOPE_KEY = "hanami-library-room-scope-v1";
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const readScope = () => localStorage.getItem(SCOPE_KEY) || "personal";
const writeScope = (value) => localStorage.setItem(SCOPE_KEY, value);
let suppressRoomClick = false;
let roomHoldTimer = 0;
let roomHoldPoint = null;

function groups() {
  return (window.HanamiReadingGroups?.groups?.() || []).filter(
    (group) => group.id !== "local-room",
  );
}
function groupById(id) {
  return groups().find((group) => String(group.id) === String(id)) || null;
}
function scope() {
  const value = readScope();
  if (value === "local-room") {
    writeScope("personal");
    return "personal";
  }
  return value === "personal" || groupById(value) ? value : "personal";
}
function activeGroup() {
  const value = scope();
  return value === "personal" ? null : groupById(value);
}
function isGroup() {
  return !!activeGroup();
}
function initials(name) {
  return (
    String(name || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "TÚ"
  );
}
function profile() {
  return (
    window.HanamiReadingGroups?.profile?.() || {
      name: "Tú",
      initials: "TÚ",
    }
  );
}
function roomButton(group, index) {
  const selected = scope() === group.id;
  const cover =
    group.cover ||
    [
      "/assets/reading-room-bedroom.webp",
      "/assets/reading-room-graffiti.webp",
      "/assets/reading-room-nazuna.webp",
    ][index % 3];
  return `<button class="library-room ${selected ? "active" : ""}" data-library-room="${esc(group.id)}" aria-pressed="${selected}" aria-label="${esc(group.name)}. Toca para abrir su biblioteca; mantén pulsado para ver los detalles."><span><img src="${esc(cover)}" alt=""></span></button>`;
}
function bar() {
  const user = profile();
  const rooms = groups();
  return `<section class="library-room-switcher"><nav aria-label="Bibliotecas y grupos de lectura"><button class="library-room personal ${scope() === "personal" ? "active" : ""}" data-library-room="personal" aria-pressed="${scope() === "personal"}" aria-label="Mi biblioteca personal"><span>${esc(user.initials || initials(user.name))}</span></button>${rooms.map(roomButton).join("")}<button class="library-room add" data-library-room-add aria-label="Añadir grupo de lectura"><span>＋</span></button></nav></section>`;
}
function progressSummary(groupId, entryId) {
  const rows = window.HanamiGroupLibrary?.progressFor?.(groupId, entryId) || [];
  if (!rows.length) return `<small class="library-group-progress-empty">Nadie ha empezado.</small>`;
  return `<div class="library-group-progress">${rows
    .slice()
    .sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt))
    .slice(0, 4)
    .map((item) => {
      const chapter =
        item.chapterName ||
        (item.chapterNumber != null ? `Cap. ${item.chapterNumber}` : "Leyendo");
      const progress = item.completed
        ? "completado"
        : item.pageCount
          ? `${Math.min(item.pageCount, Number(item.pageIndex || 0) + 1)}/${item.pageCount}`
          : "en curso";
      return `<span title="${esc(`${item.userName || "Lector"} · ${chapter} · ${progress}`)}"><i>${esc(item.initials || "?")}</i><small>${esc(chapter)} · ${esc(progress)}</small></span>`;
    })
    .join("")}</div>`;
}
function groupEntry(entry, groupId) {
  const selected = window.HanamiGroupLibrary?.isSelected?.(entry.id);
  return `<article class="lib-item comfortable library-group-item ${selected ? "selected" : ""}" data-library-group-entry="${esc(entry.id)}" data-group-id="${esc(groupId)}"><div class="lib-cover"><img src="${esc(entry.thumbnailUrl || "/assets/fallen.webp")}" alt=""><span class="library-group-recommender">${entry.remote ? "compartido" : "pendiente"}</span><input class="check lib-check" type="checkbox" tabindex="-1" ${selected ? "checked" : ""}></div><div class="lib-meta"><b>${esc(entry.title)}</b><small>Recomendado por ${esc(entry.recommendedByName || "un miembro")}</small><blockquote>“${esc(entry.recommendation || "Deberíamos leer esto juntos.")}”</blockquote>${progressSummary(groupId, entry.id)}</div></article>`;
}
function recommendationItem(groupId) {
  return `<button class="lib-item comfortable library-group-add-item" data-library-group-recommend="${esc(groupId)}" aria-label="Recomendar una lectura"><span class="lib-cover" aria-hidden="true"><i>＋</i></span><span class="lib-meta"><b>Recomendar lectura</b></span></button>`;
}
function pager(query = "") {
  const group = activeGroup();
  if (!group) return "";
  const members = group.members || [];
  const userId =
    window.HanamiSocialSync?.state?.().user?.id || profile().id;
  const membership = members.find((member) => member.id === userId);
  const canRecommend = !group.remote || membership?.state !== "muted";
  const categoryList =
    window.HanamiGroupLibrary?.categories?.(group.id) || [];
  const activeCategory =
    window.HanamiGroupLibrary?.activeCategory?.(group.id) || "default";
  const categoryPreferences = window.HanamiCategories?.preferences?.() || {};
  const showCounts = categoryPreferences.showCounts !== false;
  const term = String(query || "").trim().toLowerCase();
  const allEntries = window.HanamiGroupLibrary?.entries?.(group.id) || [];
  const entries = allEntries.filter(
    (entry) =>
      (activeCategory === "default"
        ? !(entry.categoryIds || []).length
        : (entry.categoryIds || []).includes(activeCategory)) &&
      (!term ||
        String(entry.title || "").toLowerCase().includes(term) ||
        String(entry.recommendation || "").toLowerCase().includes(term)),
  );
  const tabs =
    categoryPreferences.showTabs === false
      ? ""
      : `<div class="lib-tabs group-library-categories" role="tablist" aria-label="Categorías de Biblioteca"><button role="tab" aria-selected="${activeCategory === "default"}" tabindex="${activeCategory === "default" ? "0" : "-1"}" class="${activeCategory === "default" ? "on" : ""}" data-group-category-filter="default" data-group-id="${esc(group.id)}">Predeterminada${showCounts ? ` (${allEntries.filter((entry) => !(entry.categoryIds || []).length).length})` : ""}</button>${categoryList.map((category) => `<button role="tab" aria-selected="${activeCategory === category.id}" tabindex="${activeCategory === category.id ? "0" : "-1"}" class="${activeCategory === category.id ? "on" : ""}" data-group-category-filter="${esc(category.id)}" data-group-id="${esc(group.id)}">${esc(category.name)}${showCounts ? ` (${allEntries.filter((entry) => (entry.categoryIds || []).includes(category.id)).length})` : ""}</button>`).join("")}</div>`;
  window.HanamiGroupLibrary?.ensure?.(group.id);
  return `<section class="library-group-shelf"><header><aside><div><small>SALA ACTIVA</small><b>${esc(group.name)}</b><blockquote>“${esc(group.quote || "Leamos algo juntos.")}”</blockquote></div><div class="reading-group-avatars">${members
    .slice(0, 5)
    .map(
      (member) =>
        `<i title="${esc(member.name)}">${esc(member.initials || initials(member.name))}</i>`,
    )
    .join("")}</div></aside><p>Recomendaciones y progreso independientes de tu biblioteca personal.</p></header>${tabs}<div class="library-pager" data-library-scope="${esc(group.id)}"><div class="library-grid mode-comfortable">${canRecommend ? recommendationItem(group.id) : ""}${entries.map((entry) => groupEntry(entry, group.id)).join("")}</div>${!entries.length ? `<div class="library-page-empty"><p class="empty">${term || activeCategory !== "default" ? "No se encontraron recomendaciones." : canRecommend ? "La biblioteca de esta sala está vacía." : "No hay recomendaciones en esta sala."}</p></div>` : ""}</div></section>`;
}
function activate(value, render = true) {
  if (value !== "personal" && !groupById(value)) return false;
  writeScope(value);
  if (value !== "personal") {
    window.HanamiReadingGroups?.setActive?.(value);
    window.HanamiGroupLibrary?.ensure?.(value);
  }
  if (render) window.HanamiLibrary?.render?.();
  dispatchEvent(
    new CustomEvent("hanami-library-room-change", { detail: { scope: value } }),
  );
  return true;
}
function addDialog() {
  const modal = document.querySelector("#modal");
  const body = document.querySelector("#modalBody");
  body.innerHTML = `<section class="dialog-section library-room-add-dialog"><small class="eyebrow">READING ROOMS</small><h3>Añadir una sala</h3><p>Usa una invitación privada o crea un grupo nuevo para compartir lecturas y comentarios.</p><div><button class="btn acid" data-library-room-join>Entrar con invitación</button><button class="btn" data-library-room-create>Crear grupo</button></div></section>`;
  if (!modal.open) modal.showModal();
}
function openDetails(groupId) {
  const group = groupById(groupId);
  if (!group) return;
  activate(group.id, false);
  navigator.vibrate?.(30);
  window.HanamiReadingGroups?.detail?.(group);
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest(
    "[data-library-room],[data-library-room-add],[data-library-room-join],[data-library-room-create],[data-library-group-entry],[data-library-group-recommend]",
  );
  if (!target) return;
  if (target.dataset.libraryRoom) {
    if (suppressRoomClick) {
      suppressRoomClick = false;
      return;
    }
    activate(target.dataset.libraryRoom);
  }
  if (target.hasAttribute("data-library-room-add")) addDialog();
  if (
    target.hasAttribute("data-library-room-join") ||
    target.hasAttribute("data-library-room-create")
  ) {
    document.querySelector("#modal")?.close();
    window.HanamiReadingGroups?.accessScreen?.(
      target.hasAttribute("data-library-room-join") ? "join" : "create",
    );
  }
  if (
    target.dataset.libraryGroupEntry &&
    !window.HanamiGroupLibrary?.handleEntryClick?.(
      target.dataset.groupId,
      target.dataset.libraryGroupEntry,
    )
  )
    await window.HanamiGroupLibrary?.openEntry?.(
      target.dataset.groupId,
      target.dataset.libraryGroupEntry,
    );
  if (target.dataset.libraryGroupRecommend)
    window.HanamiGroupLibrary?.recommendDialog?.(
      target.dataset.libraryGroupRecommend,
    );
});

document.addEventListener("pointerdown", (event) => {
  const target = event.target.closest("[data-library-room]");
  if (!target || target.dataset.libraryRoom === "personal") return;
  clearTimeout(roomHoldTimer);
  roomHoldPoint = { x: event.clientX, y: event.clientY };
  roomHoldTimer = setTimeout(() => {
    suppressRoomClick = true;
    roomHoldPoint = null;
    openDetails(target.dataset.libraryRoom);
  }, 520);
});
for (const type of ["pointerup", "pointercancel"])
  document.addEventListener(type, () => {
    clearTimeout(roomHoldTimer);
    roomHoldPoint = null;
  });
document.addEventListener("pointermove", (event) => {
  if (
    !roomHoldPoint ||
    Math.hypot(
      event.clientX - roomHoldPoint.x,
      event.clientY - roomHoldPoint.y,
    ) < 12
  )
    return;
  clearTimeout(roomHoldTimer);
  roomHoldPoint = null;
});

addEventListener("hanami-reading-groups-change", () => {
  if (document.body.dataset.root === "library") window.HanamiLibrary?.render?.();
});
addEventListener("hanami-social-state", () => {
  if (document.body.dataset.root === "library") window.HanamiLibrary?.render?.();
});

window.HanamiLibraryGroups = {
  bar,
  pager,
  scope,
  isGroup,
  activeGroup,
  activate,
  openDetails,
  addDialog,
};