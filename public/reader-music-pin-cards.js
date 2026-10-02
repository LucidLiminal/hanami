import { playerIcon } from "./reader-player-view.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const chevron = (direction) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${direction === "left" ? "m14 6-6 6 6 6" : "m10 6 6 6-6 6"}"/></svg>`;
const trash = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>';

let api;
let expandedId = "";
let lastEntries = [];
let lastBounds;
let signature = "";

export function pinCardHtml(entry, expanded = false) {
  const { binding, track, pageIndex = 0, canRemove = true } = entry;
  const title = track.title || "Sin título";
  const artist = track.artist || "Artista desconocido";
  const artwork = /^https:\/\//i.test(track.artwork || "") ? track.artwork : "";
  const panelId = `readerMusicPin-${String(binding.id).replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const shared = binding.shareState === "shared";
  const pending = binding.shareState === "pending";
  return `<article class="reader-music-pin${expanded ? " is-expanded" : ""}" data-reader-music-pin="${esc(binding.id)}" data-share-state="${esc(binding.shareState || "local")}" role="group" aria-label="${esc(`Pista: ${title}`)}">
    <button type="button" class="reader-music-pin-expand" data-music-pin-expand aria-expanded="${expanded}" aria-controls="${panelId}" aria-label="${esc(`Mostrar pista: ${title}`)}" title="${esc(title)}" ${expanded ? "hidden" : ""}>${chevron("left")}<i data-pin-playing-dot aria-hidden="true" hidden></i></button>
    <div class="reader-music-pin-content" id="${panelId}" ${expanded ? "" : "hidden inert"}>
      <header><span>Página ${Number(pageIndex) + 1}${shared ? " · Grupo" : pending ? " · Pendiente" : " · Personal"}</span><button type="button" class="reader-music-pin-minimize" data-music-pin-minimize aria-label="Minimizar pista" title="Minimizar">${chevron("right")}</button></header>
      <div class="reader-music-pin-track">
        <figure class="album-cover${artwork ? " has-art" : ""}">${artwork ? `<img data-pin-art src="${esc(artwork)}" alt="${esc(`${title} — ${artist}`)}" loading="lazy" referrerpolicy="no-referrer">` : ""}<i aria-hidden="true">${playerIcon("disc")}</i></figure>
        <hgroup><h3 class="track-title">${esc(title)}</h3><p class="track-artist">${esc(artist)}</p></hgroup>
      </div>
      <div class="reader-music-pin-actions"><button type="button" class="reader-music-pin-play" data-music-pin-toggle aria-label="${esc(`Reproducir ${title}`)}">${playerIcon("play")}<span data-pin-toggle-label>Reproducir</span></button><button type="button" class="reader-music-pin-remove" data-music-pin-remove aria-label="${esc(`Eliminar pin de ${title} y quitar la canción de la cola`)}" title="${canRemove ? "Eliminar pin y quitar de la cola" : "Solo el autor o un moderador autorizado puede eliminar esta pista"}" ${canRemove ? "" : "disabled"}>${trash}</button></div>
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
  const nextSignature = JSON.stringify([expandedId, entries.map(({ binding, track, pageIndex, canRemove }) =>
    [binding.id, binding.shareState, track.title, track.artist, track.artwork, pageIndex, canRemove])]);
  if (signature !== nextSignature) {
    const focused = document.activeElement?.closest("[data-reader-music-pin]")?.dataset.readerMusicPin;
    const focusedAction = document.activeElement?.dataset.musicPinToggle !== undefined ? "[data-music-pin-toggle]" :
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

export function installPinCards(callbacks) {
  api = callbacks;
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    const card = button?.closest(".reader-music-pin[data-reader-music-pin]");
    if (!card || button.disabled) return;
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