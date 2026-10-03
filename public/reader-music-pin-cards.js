import { playerIcon } from "./reader-player-view.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const chevron = (direction) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${direction === "left" ? "m14 6-6 6 6 6" : "m10 6 6 6-6 6"}"/></svg>`;
const trash = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>';
const change = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h11l-3-3M17 17H6l3 3M18 7l2 2-2 2M6 17l-2-2 2-2"/></svg>';
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

let api;
let expandedId = "";
let lastEntries = [];
let lastBounds;
let signature = "";
let drag = null;
const suppressedClicks = new Set();

export function pinCardHtml(entry, expanded = false) {
  const { binding, track, pageIndex = 0, canRemove = true, canChange = canRemove } = entry;
  const title = track.title || "Sin título";
  const artist = track.artist || "Artista desconocido";
  const artwork = /^https:\/\//i.test(track.artwork || "") ? track.artwork : "";
  const panelId = `readerMusicPin-${String(binding.id).replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const shared = binding.shareState === "shared";
  const pending = binding.shareState === "pending";
  const cardLabel = canChange
    ? `Pista: ${title}. Arrastra verticalmente para cambiar el punto de lectura.`
    : `Pista: ${title}`;
  return `<article class="reader-music-pin${expanded ? " is-expanded" : ""}" data-reader-music-pin="${esc(binding.id)}" data-share-state="${esc(binding.shareState || "local")}" data-music-pin-draggable="${canChange}" role="group" aria-label="${esc(cardLabel)}">
    <button type="button" class="reader-music-pin-expand" data-music-pin-expand aria-expanded="${expanded}" aria-controls="${panelId}" aria-label="${esc(`Mostrar pista: ${title}`)}" title="${esc(title)}" ${expanded ? "hidden" : ""}>${chevron("left")}<i data-pin-playing-dot aria-hidden="true" hidden></i></button>
    <div class="reader-music-pin-content" id="${panelId}" ${expanded ? "" : "hidden inert"}>
      <header><span>Página ${Number(pageIndex) + 1}${shared ? " · Grupo" : pending ? " · Pendiente" : " · Personal"}</span><button type="button" class="reader-music-pin-minimize" data-music-pin-minimize aria-label="Minimizar pista" title="Minimizar">${chevron("right")}</button></header>
      <div class="reader-music-pin-track">
        <figure class="album-cover${artwork ? " has-art" : ""}">${artwork ? `<img data-pin-art draggable="false" src="${esc(artwork)}" alt="${esc(`${title} — ${artist}`)}" loading="lazy" referrerpolicy="no-referrer">` : ""}<i aria-hidden="true">${playerIcon("disc")}</i></figure>
        <hgroup><h3 class="track-title">${esc(title)}</h3><p class="track-artist">${esc(artist)}</p></hgroup>
      </div>
      <div class="reader-music-pin-actions"><button type="button" class="reader-music-pin-play" data-music-pin-toggle aria-label="${esc(`Reproducir ${title}`)}">${playerIcon("play")}<span data-pin-toggle-label>Reproducir</span></button><button type="button" class="reader-music-pin-change" data-music-pin-change aria-label="${esc(`Cambiar canción: ${title}`)}" title="${canChange ? "Cambiar canción" : "Solo la persona que creó la pista puede cambiarla"}" ${canChange ? "" : "disabled"}>${change}</button><button type="button" class="reader-music-pin-remove" data-music-pin-remove aria-label="${esc(`Eliminar pin de ${title} y quitar la canción de la cola`)}" title="${canRemove ? "Eliminar pin y quitar de la cola" : "Solo el autor o un moderador autorizado puede eliminar esta pista"}" ${canRemove ? "" : "disabled"}>${trash}</button></div>
      <p class="reader-music-pin-status" data-pin-status role="status"></p>
    </div>
  </article>`;
}

function dockNode() {
  const reader = document.querySelector("#reader");
  if (!reader) return null;
  let dock = reader.querySelector("#readerMusicPins");
  if (!dock) {
    dock = document.createElement("aside");
    dock.id = "readerMusicPins";
    dock.className = "reader-music-pin-dock";
    dock.setAttribute("aria-label", "Pistas de música de las páginas visibles");
    reader.append(dock);
    signature = "";
  }
  return dock;
}

export function renderPinCards(entries = [], bounds) {
  lastEntries = entries;
  lastBounds = bounds;
  const dock = dockNode();
  if (!dock) return;
  const visibleExpanded = entries.some((entry) => entry.binding.id === expandedId);
  dock.hidden = entries.length === 0;
  if (!entries.length) {
    dock.replaceChildren();
    signature = "";
    return;
  }
  const reader = document.querySelector("#reader");
  const barsVisible = !reader.classList.contains("bars-off");
  const topBar = barsVisible ? reader.querySelector("#readerTop")?.getBoundingClientRect() : null;
  const bottomBar = barsVisible ? reader.querySelector("#readerBottom")?.getBoundingClientRect() : null;
  const top = Math.max((bounds?.top || 0) + 8, topBar ? topBar.bottom + 8 : 8);
  const bottom = Math.min((bounds?.bottom || innerHeight) - 8, bottomBar ? bottomBar.top - 8 : innerHeight - 8);
  dock.style.top = `${Math.max(8, top)}px`;
  dock.style.bottom = `${Math.max(8, innerHeight - Math.max(top + 48, bottom))}px`;
  dock.classList.toggle("has-expanded-pin", visibleExpanded);
  const nextSignature = JSON.stringify([expandedId, entries.map(({ binding, track, pageIndex, canRemove, canChange }) =>
    [binding.id, binding.shareState, track.title, track.artist, track.artwork, pageIndex, canRemove, canChange])]);
  if (signature !== nextSignature) {
    const focused = document.activeElement?.closest("[data-reader-music-pin]")?.dataset.readerMusicPin;
    const focusedAction = document.activeElement?.dataset.musicPinToggle !== undefined ? "[data-music-pin-toggle]" :
      document.activeElement?.dataset.musicPinChange !== undefined ? "[data-music-pin-change]" :
      document.activeElement?.dataset.musicPinMinimize !== undefined ? "[data-music-pin-minimize]" : "[data-music-pin-expand]";
    signature = nextSignature;
    dock.innerHTML = `<div class="reader-music-pin-stack">${entries.map((entry) => pinCardHtml(entry, entry.binding.id === expandedId)).join("")}</div>`;
    if (focused) dock.querySelector(`[data-reader-music-pin="${CSS.escape(focused)}"] ${focusedAction}`)?.focus({ preventScroll: true });
  }
  syncPinCards();
}

export function syncPinCards(snapshot = window.HanamiReaderMusic?.snapshot?.()) {
  document.querySelectorAll(".reader-music-pin[data-reader-music-pin]").forEach((card) => {
    const active = snapshot?.pin?.id === card.dataset.readerMusicPin;
    const playing = active && snapshot.playing;
    card.dataset.playing = String(!!playing);
    const title = card.querySelector(".track-title")?.textContent || "la canción";
    const button = card.querySelector("[data-music-pin-toggle]");
    if (button) {
      button.setAttribute("aria-label", `${playing ? "Pausar" : "Reproducir"} ${title}`);
      button.setAttribute("aria-pressed", String(!!playing));
      const desired = playing ? "pause" : "play";
      if (button.dataset.icon !== desired) {
        button.dataset.icon = desired;
        button.innerHTML = `${playerIcon(desired)}<span data-pin-toggle-label>${playing ? "Pausar" : "Reproducir"}</span>`;
      }
    }
    const dot = card.querySelector("[data-pin-playing-dot]");
    if (dot) dot.hidden = !playing;
    const status = card.querySelector("[data-pin-status]");
    if (status) status.textContent = active && snapshot.waitingForPin ? "Esperando el siguiente marcador" : active ? playing ? "Reproduciendo" : "En pausa" : "";
  });
}

function entryFor(id) {
  return lastEntries.find((entry) => entry.binding.id === id) || null;
}

function targetCoordinate(id, clientY) {
  const anchor = document.querySelector(`[data-reader-music-anchor="${CSS.escape(id)}"]`);
  const media = anchor?.closest("figure")?.querySelector("img,iframe");
  const rect = media?.getBoundingClientRect();
  if (!rect || rect.height < 1) return null;
  return clamp((clientY - rect.top) / rect.height, 0, 1);
}

function clearDrag(current = drag) {
  if (!current) return;
  if (drag === current) drag = null;
  current.card.style.removeProperty("transform");
  delete current.card.dataset.dragging;
  try {
    if (current.card.hasPointerCapture?.(current.pointerId))
      current.card.releasePointerCapture(current.pointerId);
  } catch {}
}

function suppressClick(id) {
  suppressedClicks.add(id);
  setTimeout(() => suppressedClicks.delete(id), 600);
}

function beginDrag(event) {
  const card = event.target.closest?.(".reader-music-pin[data-reader-music-pin]");
  if (!card || card.dataset.musicPinDraggable !== "true") return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const id = card.dataset.readerMusicPin;
  if (!entryFor(id)) return;
  clearDrag();
  const rect = card.getBoundingClientRect();
  drag = {
    card, id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
    lastClientY: event.clientY, startTop: rect.top, cardHeight: rect.height, active: false,
  };
}

function moveDrag(event) {
  const current = drag;
  if (!current || event.pointerId !== current.pointerId) return;
  if (Number.isFinite(Number(event.clientY))) current.lastClientY = Number(event.clientY);
  const delta = current.lastClientY - current.startY;
  if (!current.active && Math.abs(delta) < 7) return;
  if (!current.active) {
    current.active = true;
    try { current.card.setPointerCapture(event.pointerId); } catch {}
  }
  if (event.cancelable) event.preventDefault();
  event.stopImmediatePropagation();
  const top = Number(current.card.closest(".reader-music-pin-dock")?.style.top.replace("px", "")) || lastBounds?.top || 8;
  const bottom = lastBounds?.bottom || innerHeight;
  const targetTop = clamp(current.startTop + delta, top, Math.max(top, bottom - current.cardHeight));
  current.card.dataset.dragging = "true";
  current.card.style.transform = `translateY(${targetTop - current.startTop}px)`;
}

function finishDrag(event) {
  const current = drag;
  if (!current || event.pointerId !== current.pointerId) return;
  const moved = current.active;
  // `pointercancel` and `lostpointercapture` can report (0, 0), rather than
  // the last finger location. Only pointerup is a reliable final coordinate.
  const clientY = event.type === "pointerup" && Number.isFinite(Number(event.clientY))
    ? Number(event.clientY) : current.lastClientY;
  // A touch pointer can be cancelled when its captured card is re-rendered.
  // Its last delivered coordinate is still the user's intended drop point.
  const y = moved ? targetCoordinate(current.id, clientY) : null;
  clearDrag(current);
  if (!moved || y == null) return;
  if (event.cancelable) event.preventDefault();
  event.stopImmediatePropagation();
  suppressClick(current.id);
  Promise.resolve(api?.move?.(current.id, y)).catch((error) =>
    window.HanamiToast?.(error?.message || "No se pudo mover el pin."));
}

export function installPinCards(callbacks) {
  api = callbacks;
  document.addEventListener("pointerdown", beginDrag, true);
  document.addEventListener("pointermove", moveDrag, true);
  document.addEventListener("pointerup", finishDrag, true);
  document.addEventListener("pointercancel", finishDrag, true);
  document.addEventListener("lostpointercapture", finishDrag, true);
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    const card = button?.closest(".reader-music-pin[data-reader-music-pin]");
    if (!card || button.disabled) return;
    if (suppressedClicks.delete(card.dataset.readerMusicPin)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const id = card.dataset.readerMusicPin;
    if (button.hasAttribute("data-music-pin-expand") || button.hasAttribute("data-music-pin-minimize")) {
      expandedId = button.hasAttribute("data-music-pin-expand") ? id : "";
      renderPinCards(lastEntries, lastBounds);
      const action = expandedId ? "[data-music-pin-minimize]" : "[data-music-pin-expand]";
      document.querySelector(`[data-reader-music-pin="${CSS.escape(id)}"] ${action}`)?.focus({ preventScroll: true });
    } else if (button.hasAttribute("data-music-pin-toggle")) {
      void api.play(id);
    } else if (button.hasAttribute("data-music-pin-change")) {
      Promise.resolve(api.change?.(id)).catch((error) =>
        window.HanamiToast?.(error?.message || "No se pudo abrir el selector de música."));
    } else if (button.hasAttribute("data-music-pin-remove")) {
      try {
        if (!api.remove(id)) return;
        expandedId = "";
        document.querySelector("#readerViewport")?.focus({ preventScroll: true });
      } catch (error) { window.HanamiToast?.(error.message || "No se pudo eliminar el pin."); }
    }
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !expandedId || !event.target.closest(".reader-music-pin")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const id = expandedId;
    expandedId = "";
    renderPinCards(lastEntries, lastBounds);
    document.querySelector(`[data-reader-music-pin="${CSS.escape(id)}"] [data-music-pin-expand]`)?.focus({ preventScroll: true });
  }, true);
  document.addEventListener("error", (event) => {
    if (!event.target.matches?.("[data-pin-art]")) return;
    event.target.closest(".album-cover")?.classList.remove("has-art");
    event.target.remove();
  }, true);
}