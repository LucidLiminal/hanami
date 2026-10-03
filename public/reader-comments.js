const LEGACY_STORE = "hanami-reader-comments-v1";
const DB_NAME = "hanami-reader-comments-v2";
const DB_VERSION = 1;
const MAX_MEDIA_BYTES = 2_000_000;
let cache = [];
let queueCache = [];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );

function pageKey(context) {
  return [
    context.sourceId || "",
    context.mangaUrl || context.mangaId || "",
    context.chapterUrl || context.chapterNumber || "",
    context.pageIndex ?? 0,
  ].join("|");
}
function groupId(context = {}) {
  return (
    context.groupId ||
    window.HanamiReadingGroups?.activeId?.() ||
    localStorage.getItem("hanami-active-reading-group") ||
    "local-room"
  );
}
function authorId(comment = {}) {
  return (
    comment.authorId ||
    window.HanamiReadingGroups?.profile?.().id ||
    "local-user"
  );
}
function recordKey(context, id) {
  return `${groupId(context)}|${pageKey(context)}|${id}`;
}
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const comments = db.createObjectStore("comments", { keyPath: "_key" });
      comments.createIndex("groupId", "groupId");
      comments.createIndex("pageKey", "pageKey");
      db.createObjectStore("syncQueue", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function allFrom(storeName) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName).objectStore(storeName).getAll();
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
async function putInto(storeName, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => {
      db.close();
      resolve(value);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
async function deleteFrom(storeName, key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
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
function queue(operation, record) {
  const item = {
    id: `${Date.now()}-${crypto.randomUUID?.() || Math.random()}`,
    operation,
    recordKey: record._key,
    groupId: record.groupId,
    revision: record.revision,
    createdAt: Date.now(),
    state: "pending",
  };
  queueCache.push(item);
  void putInto("syncQueue", item);
  dispatchEvent(
    new CustomEvent("hanami-reader-comments-queue", {
      detail: { pending: queueCache.length },
    }),
  );
}
function list(context) {
  const key = pageKey(context);
  const group = groupId(context);
  return cache.filter(
    (comment) =>
      comment.groupId === group &&
      comment.pageKey === key &&
      !comment.deletedAt,
  );
}
function persist(context, comment) {
  const previous = cache.find(
    (item) => item._key === recordKey(context, comment.id),
  );
  const record = {
    ...previous,
    ...comment,
    _key: recordKey(context, comment.id),
    pageKey: pageKey(context),
    groupId: groupId(context),
    authorId: authorId(comment),
    authorName:
      comment.authorName ||
      window.HanamiReadingGroups?.profile?.().name ||
      "Tú",
    revision: (previous?.revision || comment.revision || 0) + 1,
    syncState: "pending",
    updatedAt: Date.now(),
  };
  const index = cache.findIndex((item) => item._key === record._key);
  if (index < 0) cache.push(record);
  else cache[index] = record;
  void putInto("comments", record);
  queue(previous ? "update" : "create", record);
  return record;
}
function remove(context, id) {
  const key = recordKey(context, id);
  const previous = cache.find((item) => item._key === key);
  if (!previous) return;
  const record = {
    ...previous,
    deletedAt: Date.now(),
    updatedAt: Date.now(),
    revision: (previous.revision || 0) + 1,
    syncState: "pending",
  };
  cache[cache.indexOf(previous)] = record;
  void putInto("comments", record);
  queue("delete", record);
}
async function migrateLegacy() {
  let legacy = {};
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_STORE) || "{}");
  } catch {}
  for (const [key, comments] of Object.entries(legacy)) {
    for (const comment of Array.isArray(comments) ? comments : []) {
      const record = {
        ...comment,
        _key: `local-room|${key}|${comment.id}`,
        pageKey: key,
        groupId: "local-room",
        authorId: authorId(comment),
        revision: comment.revision || 1,
        syncState: "pending",
        migratedAt: Date.now(),
      };
      if (!cache.some((item) => item._key === record._key)) {
        cache.push(record);
        await putInto("comments", record);
        queue("create", record);
      }
    }
  }
  if (Object.keys(legacy).length) localStorage.removeItem(LEGACY_STORE);
}
async function exportBundle(selectedGroupId = groupId()) {
  await ready;
  return {
    schema: "hanami-reader-comments-v2",
    groupId: selectedGroupId,
    comments: cache.filter(
      (comment) => comment.groupId === selectedGroupId && !comment.deletedAt,
    ),
  };
}
async function importBundle(bundle = {}) {
  await ready;
  for (const incoming of bundle.comments || []) {
    if (!incoming?.id || !incoming.pageKey) continue;
    const record = {
      ...incoming,
      groupId: bundle.groupId || incoming.groupId || groupId(),
      syncState: "pending",
      revision: Math.max(1, Number(incoming.revision) || 1),
    };
    record._key = `${record.groupId}|${record.pageKey}|${record.id}`;
    const current = cache.find((item) => item._key === record._key);
    if (current && current.revision > record.revision) continue;
    if (current) cache[cache.indexOf(current)] = record;
    else cache.push(record);
    await putInto("comments", record);
    queue(current ? "update" : "create", record);
  }
  renderAll();
  return cache;
}
async function pendingOperations(selectedGroupId = groupId()) {
  await ready;
  return queueCache
    .filter(
      (item) =>
        item.state === "pending" && item.groupId === selectedGroupId,
    )
    .sort((a, b) => a.createdAt - b.createdAt);
}
function record(key) {
  return cache.find((item) => item._key === key) || null;
}
async function markOperation(operationId, remote = null) {
  await ready;
  const operation = queueCache.find((item) => item.id === operationId);
  queueCache = queueCache.filter((item) => item.id !== operationId);
  await deleteFrom("syncQueue", operationId);
  if (operation) {
    const current = record(operation.recordKey);
    if (current) {
      const synced = {
        ...current,
        revision: Math.max(
          current.revision || 1,
          Number(remote?.revision) || 1,
        ),
        mediaPath: remote?.media_path || current.mediaPath || null,
        syncState: "synced",
        syncedAt: Date.now(),
      };
      cache[cache.indexOf(current)] = synced;
      await putInto("comments", synced);
    }
  }
  dispatchEvent(
    new CustomEvent("hanami-reader-comments-queue", {
      detail: { pending: queueCache.length },
    }),
  );
}
function fromRemote(row) {
  return {
    id: row.id,
    _key: `${row.group_id}|${row.page_key}|${row.id}`,
    pageKey: row.page_key,
    groupId: row.group_id,
    authorId: row.author_id,
    authorName: row.author?.display_name || "Lector",
    x: Number(row.x),
    y: Number(row.y),
    width: Number(row.width),
    text: row.text || "",
    media: row.media_url || "",
    mediaPath: row.media_path || null,
    revision: Number(row.revision) || 1,
    createdAt: Date.parse(row.created_at) || Date.now(),
    updatedAt: Date.parse(row.updated_at) || Date.now(),
    deletedAt: row.deleted_at ? Date.parse(row.deleted_at) : null,
    syncState: "synced",
    syncedAt: Date.now(),
  };
}
async function mergeRemote(rows = []) {
  await ready;
  for (const row of rows) {
    if (!row?.id || !row.group_id || !row.page_key) continue;
    const incoming = fromRemote(row);
    const current = record(incoming._key);
    if (
      current?.syncState === "pending" &&
      Number(current.revision) >= Number(incoming.revision)
    )
      continue;
    if (current && Number(current.revision) > Number(incoming.revision))
      continue;
    if (current) {
      if (!incoming.media && current.media)
        incoming.media = current.media;
      cache[cache.indexOf(current)] = incoming;
    } else cache.push(incoming);
    await putInto("comments", incoming);
  }
  renderAll();
  return cache;
}
const ready = (async () => {
  cache = await allFrom("comments");
  queueCache = await allFrom("syncQueue");
  await migrateLegacy();
  dispatchEvent(
    new CustomEvent("hanami-reader-comments-ready", {
      detail: { comments: cache.length, pending: queueCache.length },
    }),
  );
  renderAll();
  return true;
})().catch((error) => {
  console.error("[Hanami comments]", error);
  return false;
});
function contextFromFigure(figure) {
  try {
    return JSON.parse(figure.dataset.commentContext || "{}");
  } catch {
    return {};
  }
}
function pageImage(figure) {
  return (
    [...(figure?.children || [])].find((node) => node.tagName === "IMG") ||
    null
  );
}
function imageMetrics(figure) {
  const image = pageImage(figure);
  if (!image) return null;
  const figureRect = figure.getBoundingClientRect();
  const imageRect = image.getBoundingClientRect();
  if (!imageRect.width || !imageRect.height) return null;
  return { image, figureRect, imageRect };
}
function positionCard(card, figure, comment) {
  const metrics = imageMetrics(figure);
  if (!metrics) return;
  const left =
    metrics.imageRect.left -
    metrics.figureRect.left +
    comment.x * metrics.imageRect.width;
  const top =
    metrics.imageRect.top -
    metrics.figureRect.top +
    comment.y * metrics.imageRect.height;
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
  card.style.width = `${clamp(comment.width || 0.42, 0.24, 0.88) * metrics.imageRect.width}px`;
}
const pendingGeometry = new Set();
let geometryFrame = 0;
function relayoutFigure(figure) {
  if (!figure?.isConnected) return;
  const context = contextFromFigure(figure);
  const comments = new Map(list(context).map((comment) => [comment.id, comment]));
  for (const card of figure.querySelectorAll(".reader-comment")) {
    const comment = comments.get(card.dataset.readerComment);
    if (comment) positionCard(card, figure, comment);
  }
}
function scheduleFigureGeometry(figure) {
  if (!figure?.isConnected) return;
  pendingGeometry.add(figure);
  if (geometryFrame) return;
  // The reader clears a temporary min-height in its image onload handler.
  // Wait two frames so the card follows the settled, not pre-load, rectangle.
  geometryFrame = requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      geometryFrame = 0;
      const figures = [...pendingGeometry];
      pendingGeometry.clear();
      figures.forEach(relayoutFigure);
    }),
  );
}
function renderFigure(figure) {
  if (!figure?.dataset.commentContext || figure.dataset.kind === "pdf") return;
  figure.querySelector(".reader-comment-layer")?.remove();
  const context = contextFromFigure(figure);
  const comments = list(context);
  if (!comments.length) return;
  const layer = document.createElement("div");
  layer.className = "reader-comment-layer";
  layer.setAttribute("aria-label", "Comentarios sobre la página");
  for (const comment of comments) {
    const card = document.createElement("article");
    card.className = "reader-comment";
    card.dataset.readerComment = comment.id;
    card.tabIndex = 0;
    card.setAttribute("aria-label", `Comentario: ${comment.text || "imagen"}`);
    card.innerHTML = `<span class="reader-comment-pin" aria-hidden="true"></span><button class="reader-comment-body" type="button" data-comment-open><small class="reader-comment-author">${escapeHtml(comment.authorName || "Lector")}</small>${comment.media ? `<img src="${escapeHtml(comment.media)}" alt="">` : ""}${comment.text ? `<span>${escapeHtml(comment.text)}</span>` : ""}</button><button class="reader-comment-resize" type="button" aria-label="Cambiar tamaño"></button>`;
    layer.append(card);
    positionCard(card, figure, comment);
  }
  figure.append(layer);
  scheduleFigureGeometry(figure);
}
function renderAll() {
  document
    .querySelectorAll("#readerViewport figure[data-comment-context]")
    .forEach(renderFigure);
}
function contextAt(figure, clientX, clientY) {
  const context = contextFromFigure(figure);
  const metrics = imageMetrics(figure);
  if (!metrics) return null;
  return {
    ...context,
    x: clamp((clientX - metrics.imageRect.left) / metrics.imageRect.width, 0, 1),
    y: clamp((clientY - metrics.imageRect.top) / metrics.imageRect.height, 0, 1),
  };
}

let editor = null;
function destroyEditor() {
  editor?.node.remove();
  editor = null;
  document.body.classList.remove("reader-comment-editor-open");
}
function closeEditor(fromHistory = false) {
  if (!editor) return;
  if (!fromHistory && window.HanamiScreens?.is("reader-comment-editor")) {
    window.HanamiScreens.back();
    return;
  }
  destroyEditor();
}
function fileAsDataUrl(file) {
  if (!file) return Promise.resolve("");
  if (!file.type.startsWith("image/"))
    return Promise.reject(new Error("Selecciona una imagen o GIF."));
  if (file.size > MAX_MEDIA_BYTES)
    return Promise.reject(new Error("La imagen debe ocupar menos de 2 MB."));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("No se pudo leer."));
    reader.readAsDataURL(file);
  });
}
function openEditor(context, existing = null, restoring = false) {
  destroyEditor();
  const draft = existing || {
    id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    x: context.x,
    y: context.y,
    width: 0.42,
    text: "",
    media: "",
    createdAt: Date.now(),
  };
  const node = document.createElement("section");
  node.className = "reader-comment-editor";
  node.setAttribute("role", "dialog");
  node.setAttribute("aria-modal", "true");
  node.setAttribute("aria-label", existing ? "Editar comentario" : "Nuevo comentario");
  node.innerHTML = `<header><button type="button" data-comment-back aria-label="Atrás">←</button><div><b>${existing ? "Editar comentario" : "Nuevo comentario"}</b><small>Página ${(context.pageIndex || 0) + 1} · ${Math.round(draft.x * 100)}%, ${Math.round(draft.y * 100)}%</small></div><button type="button" data-comment-save>Guardar</button></header><main><label>Nota<textarea data-comment-text maxlength="1200" placeholder="Escribe algo sobre este punto…">${escapeHtml(draft.text)}</textarea></label><label class="reader-comment-file">Imagen o GIF<input data-comment-file type="file" accept="image/*,.gif"><span data-comment-file-label>${draft.media ? "Imagen adjunta" : "Añadir archivo · máximo 2 MB"}</span></label><div class="reader-comment-preview ${draft.media ? "" : "hidden"}" data-comment-preview>${draft.media ? `<img src="${escapeHtml(draft.media)}" alt="Vista previa">` : ""}<button type="button" data-comment-remove-media>Quitar imagen</button></div><label>Tamaño<input data-comment-width type="range" min="24" max="88" value="${Math.round((draft.width || 0.42) * 100)}"></label><p data-comment-error role="alert"></p>${existing ? '<button class="reader-comment-delete" type="button" data-comment-delete>Eliminar comentario</button>' : ""}</main>`;
  (document.querySelector("#reader") || document.body).append(node);
  document.body.classList.add("reader-comment-editor-open");
  editor = { node, context, draft: { ...draft } };
  if (!restoring && window.HanamiScreens) {
    window.HanamiScreens.push(
      "reader-comment-editor",
      {
        key: pageKey(context),
        commentId: draft.id,
        pageIndex: context.pageIndex,
      },
      { suspend: destroyEditor },
    );
  }
  const text = node.querySelector("[data-comment-text]");
  const preview = node.querySelector("[data-comment-preview]");
  const error = node.querySelector("[data-comment-error]");
  node.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.hasAttribute("data-comment-back")) closeEditor();
    if (button.hasAttribute("data-comment-remove-media")) {
      editor.draft.media = "";
      preview.classList.add("hidden");
      preview.querySelector("img")?.remove();
      node.querySelector("[data-comment-file-label]").textContent =
        "Añadir archivo · máximo 2 MB";
    }
    if (button.hasAttribute("data-comment-delete")) {
      remove(context, draft.id);
      renderAll();
      closeEditor();
    }
    if (button.hasAttribute("data-comment-save")) {
      const value = text.value.trim();
      if (!value && !editor.draft.media) {
        error.textContent = "Escribe una nota o añade una imagen.";
        return;
      }
      persist(context, {
        ...editor.draft,
        text: value,
        width: +node.querySelector("[data-comment-width]").value / 100,
        updatedAt: Date.now(),
      });
      renderAll();
      closeEditor();
    }
  });
  node
    .querySelector("[data-comment-file]")
    .addEventListener("change", async (event) => {
      error.textContent = "";
      try {
        editor.draft.media = await fileAsDataUrl(event.target.files?.[0]);
        preview.innerHTML = `<img src="${escapeHtml(editor.draft.media)}" alt="Vista previa"><button type="button" data-comment-remove-media>Quitar imagen</button>`;
        preview.classList.remove("hidden");
        node.querySelector("[data-comment-file-label]").textContent =
          event.target.files?.[0]?.name || "Imagen adjunta";
      } catch (reason) {
        error.textContent = reason.message;
        event.target.value = "";
      }
    });
  requestAnimationFrame(() => text.focus());
}
function begin({ figure, clientX, clientY, context }) {
  if (!figure || figure.dataset.kind === "pdf") return false;
  const point = context || contextAt(figure, clientX, clientY);
  if (!point) return false;
  openEditor(point);
  return true;
}
function edit(figure, id) {
  const context = contextFromFigure(figure);
  const comment = list(context).find((item) => item.id === id);
  if (comment) openEditor(context, comment);
}

let gesture = null;
document.addEventListener(
  "pointerdown",
  (event) => {
    const card = event.target.closest(".reader-comment");
    if (!card) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const figure = card.closest("figure");
    const context = contextFromFigure(figure);
    const comment = list(context).find(
      (item) => item.id === card.dataset.readerComment,
    );
    if (!comment) return;
    card.setPointerCapture?.(event.pointerId);
    gesture = {
      card,
      figure,
      context,
      comment: { ...comment },
      startX: event.clientX,
      startY: event.clientY,
      resize: !!event.target.closest(".reader-comment-resize"),
      moved: false,
    };
  },
  true,
);
document.addEventListener(
  "pointermove",
  (event) => {
    if (!gesture) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (Math.hypot(dx, dy) > 5) gesture.moved = true;
    const metrics = imageMetrics(gesture.figure);
    if (!metrics) return;
    if (gesture.resize) {
      gesture.comment.width = clamp(
        gesture.comment.width + dx / metrics.imageRect.width,
        0.24,
        0.88,
      );
      gesture.startX = event.clientX;
    } else {
      gesture.comment.x = clamp(
        (event.clientX - metrics.imageRect.left) / metrics.imageRect.width,
        0,
        1,
      );
      gesture.comment.y = clamp(
        (event.clientY - metrics.imageRect.top) / metrics.imageRect.height,
        0,
        1,
      );
    }
    positionCard(gesture.card, gesture.figure, gesture.comment);
  },
  true,
);
function finishGesture(event) {
  if (!gesture) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const current = gesture;
  gesture = null;
  if (current.moved) {
    current.comment.updatedAt = Date.now();
    persist(current.context, current.comment);
    renderFigure(current.figure);
  } else if (!current.resize) edit(current.figure, current.comment.id);
}
document.addEventListener("pointerup", finishGesture, true);
document.addEventListener("pointercancel", finishGesture, true);
window.addEventListener("resize", renderAll);
document.addEventListener(
  "load",
  (event) => {
    const image = event.target;
    const figure = image?.closest?.("figure[data-comment-context]");
    if (figure && pageImage(figure) === image) scheduleFigureGeometry(figure);
  },
  true,
);
window.addEventListener(
  "keydown",
  (event) => {
    if (event.key !== "Escape" || !editor) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeEditor();
  },
  true,
);
window.addEventListener("hanami-screen-change", (event) => {
  if (
    editor &&
    event.detail?.action === "pop" &&
    event.detail?.screen?.type !== "reader-comment-editor"
  )
    destroyEditor();
});
const observer = new MutationObserver((records) => {
  if (
    records.some((record) =>
      [...record.addedNodes].some(
        (node) =>
          node.nodeType === 1 &&
          (node.matches?.("figure[data-comment-context]") ||
            node.querySelector?.("figure[data-comment-context]")),
      ),
    )
  )
    requestAnimationFrame(renderAll);
});
observer.observe(document.documentElement, { childList: true, subtree: true });
window.HanamiReaderComments = {
  begin,
  renderAll,
  list,
  pageKey,
  openEditor,
  closeEditor,
  ready,
  exportBundle,
  importBundle,
  pendingOperations,
  markOperation,
  mergeRemote,
  record,
  pendingCount: () =>
    queueCache.filter((item) => item.state === "pending").length,
  database: DB_NAME,
};