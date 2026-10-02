/*
 * Browser adaptation of Mihon's ReaderPageActionsDialog / ReaderViewModel.
 * See THIRD_PARTY_NOTICES.md for the upstream sources and license.
 */
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const icons = {
  cover: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m4 17 5-5 4 4 3-3 4 4"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/>',
  save: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  comment: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-1 1v-9.5A8.5 8.5 0 0 1 11.5 3h1a8.5 8.5 0 0 1 8.5 8.5Z"/><path d="M7 9h10M7 13h7"/>',
  music: '<path d="M9 18V5l12-2v13M9 9l12-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/>',
};
const labels = {
  cover: "Poner como portada",
  copy: "Copiar al portapapeles",
  share: "Compartir",
  save: "Guardar",
  comment: "Hacer un comentario",
  music: "Instanciar una pista de música",
};
let current = null;

export function pageFileName(context, mimeType = "image/jpeg") {
  const extension = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
    "image/svg+xml": "svg",
    "application/pdf": "pdf",
  }[mimeType.split(";")[0]] || "jpg";
  const clean = (value) =>
    String(value ?? "").normalize("NFKC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").trim();
  const title = clean(context.title || "Hanami").slice(0, 100) || "Hanami";
  const chapter = clean((context.chapterNumber ?? "") !== "" ? context.chapterNumber : context.chapterName || "capítulo").slice(0, 40);
  return `${title} - ${chapter} - ${Number(context.pageIndex || 0) + 1}.${extension}`;
}

export function pointContext(figure, clientX, clientY, reader = {}) {
  let context = {};
  try {
    context = JSON.parse(figure?.dataset.commentContext || "{}");
  } catch {}
  const image = figure?.querySelector("img,iframe");
  const rect = image?.getBoundingClientRect();
  if (!figure || !rect?.width || !rect?.height) return null;
  return {
    ...reader,
    ...context,
    title: reader.title || context.title || "Hanami",
    mangaUrl: context.mangaUrl || reader.mangaUrl || "",
    pageUrl: figure.dataset.src || context.pageUrl || image.src,
    kind: figure.dataset.kind || "image",
    x: clamp((Number.isFinite(clientX) ? clientX - rect.left : rect.width / 2) / rect.width, 0, 1),
    y: clamp((Number.isFinite(clientY) ? clientY - rect.top : rect.height / 2) / rect.height, 0, 1),
  };
}

export function coverFor(manga = {}, sourceId = manga.sourceId) {
  try {
    const library = JSON.parse(localStorage.getItem("hanami-library") || "[]");
    const entry = library.find(
      (item) => item.sourceId === sourceId && item.url === (manga.url || manga.mangaUrl),
    );
    return entry?.customThumbnailUrl || manga.customThumbnailUrl || manga.thumbnailUrl || "";
  } catch {
    return manga.thumbnailUrl || "";
  }
}

function readerFocus() {
  document.querySelector("#readerViewport")?.focus({ preventScroll: true });
}

function destroy({ focus = true } = {}) {
  if (!current) return;
  const instance = current;
  current = null;
  instance.cleanupGesture?.();
  instance.node.remove();
  for (const [node, inert] of instance.inert) node.inert = inert;
  document.body.classList.remove("reader-page-actions-open");
  if (focus) readerFocus();
}

function close(fromHistory = false) {
  if (!current) return;
  if (!fromHistory && window.HanamiScreens?.is("reader-page-actions")) {
    window.HanamiScreens.back();
    return;
  }
  destroy();
}

function transition(callback) {
  const screenId = current?.screenId;
  if (screenId) window.HanamiScreens?.markClosed(screenId);
  destroy({ focus: false });
  callback();
}

function showStatus(message, error = false) {
  if (!current) return;
  const status = current.node.querySelector("[data-page-action-status]");
  status.textContent = message;
  status.classList.toggle("error", error);
}

async function pageBlob(instance) {
  if (!instance.blob) {
    instance.blob = (async () => {
      const url = instance.context.pageUrl;
      if (!url) throw new Error("Esta página aún no tiene una imagen disponible.");
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`No se pudo obtener la imagen (HTTP ${response.status}).`);
      const blob = await response.blob();
      if (!blob.size) throw new Error("La imagen está vacía.");
      if (blob.size > 30 * 1024 * 1024) throw new Error("La imagen supera el límite de 30 MB.");
      if (instance.context.kind !== "pdf" && !blob.type.startsWith("image/"))
        throw new Error("La fuente no ha devuelto una imagen válida.");
      return blob;
    })();
    instance.blob.catch(() => { instance.blob = null; });
  }
  return instance.blob;
}

async function imageCanvas(blob, { maxWidth = Infinity, maxHeight = Infinity } = {}) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight)
      throw new Error("No se pudo leer el tamaño de la imagen.");
    if (image.naturalWidth * image.naturalHeight > 80_000_000)
      throw new Error("La imagen es demasiado grande para procesarla en este dispositivo.");
    const ratio = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("El dispositivo no permite procesar imágenes.");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function pngBlob(instance) {
  const original = await pageBlob(instance);
  if (original.type === "image/png") return original;
  const canvas = await imageCanvas(original);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("No se pudo convertir la imagen a PNG.")),
      "image/png",
    ),
  );
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function setCover(instance) {
  const list = JSON.parse(localStorage.getItem("hanami-library") || "[]");
  const match = (item) =>
    (instance.context.mangaId && item.id === instance.context.mangaId) ||
    (item.sourceId === instance.context.sourceId && item.url === instance.context.mangaUrl);
  const entry = list.find(match);
  if (!entry || entry.favorite === false)
    throw new Error("Añade esta obra a tu biblioteca antes de cambiar su portada.");
  const canvas = await imageCanvas(await pageBlob(instance), { maxWidth: 720, maxHeight: 1280 });
  const dataUrl = canvas.toDataURL("image/jpeg", 0.84);
  if (dataUrl.length > 1_000_000)
    throw new Error("No se pudo preparar una portada suficientemente pequeña.");
  const originalThumbnailUrl = entry.originalThumbnailUrl || entry.thumbnailUrl || "";
  // Preserve the library's in-memory reader callback before publishing the new list.
  instance.onCover?.(dataUrl);
  const latest = JSON.parse(localStorage.getItem("hanami-library") || "[]");
  const target = latest.find(match);
  if (!target) throw new Error("La obra ya no está en la biblioteca.");
  Object.assign(target, {
    originalThumbnailUrl,
    customThumbnailUrl: dataUrl,
    thumbnailUrl: dataUrl,
    coverUpdatedAt: Date.now(),
  });
  localStorage.setItem("hanami-library", JSON.stringify(latest));
  window.dispatchEvent(new CustomEvent("hanami-library-change", { detail: { list: latest, cover: true } }));
  window.HanamiCoverCache?.invalidate?.(originalThumbnailUrl);
}

async function runAction(action) {
  const instance = current;
  if (!instance || instance.busy) return;
  if (action === "comment") {
    transition(() => window.HanamiReaderComments?.begin({
      figure: instance.figure,
      context: instance.context,
    }));
    return;
  }
  if (action === "music") {
    if (!window.HanamiReaderMusicServices?.openPicker) {
      showStatus("El selector de música todavía no está disponible.", true);
      return;
    }
    transition(() => window.HanamiReaderMusicServices.openPicker({ context: instance.context }));
    return;
  }
  if (action === "cover") {
    instance.node.querySelector("[data-page-action-grid]").hidden = true;
    instance.node.querySelector("[data-page-cover-confirm]").hidden = false;
    instance.node.querySelector("[data-page-cover-accept]").focus({ preventScroll: true });
    return;
  }
  instance.busy = true;
  for (const button of instance.node.querySelectorAll("[data-reader-page-action]")) button.disabled = true;
  showStatus("Preparando la imagen…");
  try {
    if (action === "copy") {
      if (!window.isSecureContext || !navigator.clipboard?.write || typeof ClipboardItem === "undefined")
        throw new Error("Este navegador no permite copiar imágenes. Puedes usar Guardar o Compartir.");
      // Start write in the user gesture; Safari accepts a promise-valued ClipboardItem.
      await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob(instance) })]);
      window.HanamiToast?.("Imagen copiada al portapapeles");
    } else if (action === "share") {
      if (!navigator.share || !navigator.canShare)
        throw new Error("Este navegador no permite compartir archivos. Guarda la imagen para compartirla.");
      const blob = await pageBlob(instance);
      const file = new File([blob], pageFileName(instance.context, blob.type), { type: blob.type });
      if (!navigator.canShare({ files: [file] }))
        throw new Error("El dispositivo no puede compartir este formato. Usa Guardar.");
      await navigator.share({ files: [file], title: instance.context.title });
    } else if (action === "save") {
      const blob = await pageBlob(instance);
      downloadBlob(blob, pageFileName(instance.context, blob.type));
      window.HanamiToast?.("Imagen preparada para guardar");
    } else if (action === "cover-confirm") {
      await setCover(instance);
      window.HanamiToast?.("Portada actualizada");
    }
    if (current === instance) close();
  } catch (error) {
    if (current !== instance) return;
    showStatus(
      error.name === "AbortError" ? "Acción cancelada." :
      error.name === "NotAllowedError" ? "El navegador no ha permitido esta acción. Comprueba sus permisos o usa Guardar." :
      error.message || "No se pudo completar la acción.",
      error.name !== "AbortError",
    );
  } finally {
    instance.busy = false;
    if (current === instance) {
      for (const button of instance.node.querySelectorAll("[data-reader-page-action]")) {
        button.disabled = instance.context.kind === "pdf" && ["cover", "copy", "comment"].includes(button.dataset.readerPageAction);
      }
    }
  }
}

function open({ figure, clientX, clientY, reader = {}, onCover, context, gesture = false, restoring = false } = {}) {
  const point = context || pointContext(figure, clientX, clientY, reader);
  if (!point || !figure) return false;
  destroy({ focus: false });
  const node = document.createElement("section");
  node.className = "reader-page-actions-overlay";
  node.innerHTML = `<div class="reader-page-actions bottombar" data-reader-page-actions role="dialog" aria-modal="true" aria-labelledby="readerPageActionsTitle" tabindex="-1">
    <i class="reader-page-actions-handle" aria-hidden="true"></i>
    <header><div><small>ACCIONES DE PÁGINA</small><h2 id="readerPageActionsTitle">Página ${Number(point.pageIndex || 0) + 1}</h2></div><button type="button" data-page-actions-close aria-label="Cerrar acciones">×</button></header>
    <div class="reader-page-actions-grid" data-page-action-grid>${Object.entries(labels).map(([action, label]) => `<button type="button" data-reader-page-action="${action}" ${point.kind === "pdf" && ["cover", "copy", "comment"].includes(action) ? 'disabled title="Esta acción necesita una imagen"' : ""}><svg viewBox="0 0 24 24" aria-hidden="true">${icons[action]}</svg><span>${label}</span></button>`).join("")}</div>
    <section class="reader-page-cover-confirm" data-page-cover-confirm hidden><h3>¿Usar esta página como portada?</h3><p>Cambiará la portada de esta obra en tu biblioteca.</p><div><button type="button" data-page-cover-cancel>Cancelar</button><button type="button" data-page-cover-accept>Usar como portada</button></div></section>
    <p class="reader-page-action-status" data-page-action-status role="status" aria-live="polite"></p>
  </div>`;
  const root = document.querySelector("#reader") || document.body;
  const inert = [...root.children]
    .filter((child) => !child.matches(".reader-page-actions-overlay,.reader-comment-editor,.reader-music-picker"))
    .map((child) => [child, child.inert]);
  for (const [child] of inert) child.inert = true;
  root.append(node);
  current = { node, context: point, figure, onCover, busy: false, inert, screenId: null };
  const instance = current;
  // A long touch may synthesize a click after the sheet appears under the finger.
  // Ignore only that opening release, never the user's next intentional press.
  if (gesture) {
    let openingRelease = true;
    const clearOpeningRelease = () => {
      openingRelease = false;
      instance.cleanupGesture?.();
    };
    const guardOpeningClick = (event) => {
      if (current !== instance || !openingRelease || !node.contains(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      clearOpeningRelease();
    };
    instance.cleanupGesture = () => {
      document.removeEventListener("pointerdown", clearOpeningRelease, true);
      document.removeEventListener("keydown", clearOpeningRelease, true);
      document.removeEventListener("click", guardOpeningClick, true);
    };
    document.addEventListener("pointerdown", clearOpeningRelease, true);
    document.addEventListener("keydown", clearOpeningRelease, true);
    document.addEventListener("click", guardOpeningClick, true);
  }
  document.body.classList.add("reader-page-actions-open");
  if (!restoring && window.HanamiScreens) {
    instance.screenId = window.HanamiScreens.push(
      "reader-page-actions",
      { pageIndex: point.pageIndex },
      {
        restore: () => open({ figure, context: point, onCover, restoring: true }),
        suspend: () => destroy(),
      },
    );
  } else instance.screenId = window.HanamiScreens?.current?.()?.id;
  node.addEventListener("click", (event) => {
    if (event.target === node || event.target.closest("[data-page-actions-close]")) close();
    const action = event.target.closest("[data-reader-page-action]")?.dataset.readerPageAction;
    if (action) void runAction(action);
    if (event.target.closest("[data-page-cover-accept]")) void runAction("cover-confirm");
    if (event.target.closest("[data-page-cover-cancel]")) {
      node.querySelector("[data-page-cover-confirm]").hidden = true;
      node.querySelector("[data-page-action-grid]").hidden = false;
      node.querySelector('[data-reader-page-action="cover"]').focus({ preventScroll: true });
    }
  });
  node.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab") {
      const controls = [...node.querySelectorAll("button:not([disabled])")].filter((button) => button.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === node.querySelector('[role="dialog"]'))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    }
  });
  requestAnimationFrame(() => node.querySelector('[role="dialog"]').focus({ preventScroll: true }));
  return true;
}

if (typeof window !== "undefined") {
  window.HanamiReaderPageActions = { open, close, coverFor, pointContext };
}