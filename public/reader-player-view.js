import { READING_MODES, readingModeInfo, followsReadingPins } from "./reader-music-policy.js";

const PERSONAL_KEY = "hanami-reader-player-personal-v137";
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const paths = {
  collapse: '<path d="m6 9 6 6 6-6"/>',
  lyrics: '<path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5"/>',
  queue: '<path d="M4 6h16M4 12h11M4 18h11m3-3 3 3-3 3"/>',
  group: '<circle cx="9" cy="7" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3M17 4a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 4v3"/>',
  playlist: '<path d="M3 5h14M3 10h14M3 15h8m6-2v8m-4-4h8"/>',
  heart: '<path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"/>',
  previous: '<path d="M5 5v14m14-14-11 7 11 7z"/>',
  next: '<path d="M19 5v14M5 5l11 7-11 7z"/>',
  play: '<path d="m8 4 12 8-12 8z"/>',
  pause: '<path d="M7 4h3v16H7zm7 0h3v16h-3z"/>',
  shuffle: '<path d="M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c5 0 7-12 12-12h3m-4-4 4 4-4 4"/>',
  linear: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  repeat: '<path d="m17 2 4 4-4 4M3 10V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14 0v2a2 2 0 0 1-2 2H3"/>',
  share: '<circle cx="18" cy="4" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="20" r="3"/><path d="m8.6 10.5 6.8-5M8.6 13.5l6.8 5"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  source: '<path d="M14 3h7v7m0-7L10 14M11 3H4v17h17v-7"/>',
  disc: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M5 12a7 7 0 0 1 7-7m7 7a7 7 0 0 1-7 7"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
};
export const playerIcon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.disc}</svg>`;
function readPersonal() {
  try {
    const data = JSON.parse(localStorage.getItem(PERSONAL_KEY) || "{}");
    return {
      favorites: Array.isArray(data.favorites) ? [...new Set(data.favorites.filter((id) => typeof id === "string"))].slice(0, 2000) : [],
      playlists: Array.isArray(data.playlists) ? data.playlists.filter((list) => list?.id && typeof list.name === "string" && Array.isArray(list.trackIds)).slice(0, 100).map((list) => ({ id: list.id, name: list.name.slice(0, 80), trackIds: [...new Set(list.trackIds)].slice(0, 2000) })) : [],
    };
  } catch { return { favorites: [], playlists: [] }; }
}
const personal = readPersonal();
let adapter;
let tool = "";
let draftName = "";
let toolMessage = "";
let shareBusy = false;
const favorite = (id) => !!id && personal.favorites.includes(id);
function savePersonal() {
  try {
    localStorage.setItem(PERSONAL_KEY, JSON.stringify(personal));
    dispatchEvent(new CustomEvent("hanami-reader-player-personal-change"));
    return true;
  }
  catch { notify("No queda espacio para guardar tus listas y favoritos."); return false; }
}
function notify(message) { window.HanamiToast?.(message); }
function toolTitle() {
  return ({ queue: "Cola de reproducción", library: "Tu biblioteca", playlists: "Añadir a una lista", modes: "Modo de lectura", lyrics: "Letra de la canción", group: "Música del grupo" })[tool] || "";
}
function toolHtml(model, extras) {
  if (!tool) return "";
  let content = "";
  if (tool === "queue" || tool === "library") {
    content += `<nav class="player-tool-tabs" aria-label="Colección musical"><button data-player-tool="queue" aria-current="${tool === "queue" ? "page" : "false"}">Cola · ${model.queue.length}</button><button data-player-tool="library" aria-current="${tool === "library" ? "page" : "false"}">Biblioteca</button><button data-player-tool="playlists">Listas</button></nav>`;
    content += tool === "queue" ? extras.queueHtml : extras.libraryHtml;
  } else if (tool === "modes") {
    content = `<p class="player-tool-intro">Elige cómo acompaña la música a tu lectura.</p><div class="player-mode-options" role="radiogroup" aria-label="Comportamiento de reproducción">${READING_MODES.map((mode) =>
      `<button role="radio" aria-checked="${model.readingMode === mode.id}" data-player-mode="${mode.id}"><i>${mode.number}</i><span><b>${esc(mode.label)}</b><small>${esc(mode.description)}</small></span>${model.readingMode === mode.id ? '<em aria-hidden="true">✓</em>' : ""}</button>`).join("")}</div>`;
  } else if (tool === "lyrics") {
    content = extras.lyricsHtml || '<div class="player-tool-empty"><b>No hay una canción seleccionada</b><p>Elige una pista para consultar su letra.</p></div>';
  } else if (tool === "group") {
    const room = window.HanamiReadingGroups?.active?.();
    const state = window.HanamiGroupMusic?.snapshot?.() || {};
    content = `<p class="player-tool-intro">Las pistas de SoundCloud y sus posiciones se comparten en el grupo activo. Los archivos locales, favoritos, listas y controles de reproducción son personales.</p><div class="player-group-status"><b>${esc(room?.name || "Lectura personal")}</b><p>${esc(room?.remote ? state.message || "Preparando la sincronización…" : "Esta lectura se guarda en tu dispositivo.")}</p>${state.pendingCount ? `<small>${state.pendingCount} pista${state.pendingCount === 1 ? "" : "s"} pendiente${state.pendingCount === 1 ? "" : "s"}</small>` : ""}</div><div class="player-group-actions"><button data-player-sync-group>Actualizar pistas</button><button data-player-share-reading ${room?.remote ? "" : "disabled"}>Compartir mis pistas de esta lectura</button></div><h3 class="player-group-select-title">Leer en</h3><div class="player-mode-options"><button data-player-group="local-room" aria-pressed="${!room || room.id === "local-room"}"><span><b>Personal</b><small>Solo en este dispositivo</small></span></button>${(window.HanamiReadingGroups?.groups?.() || []).filter((group) => group.id !== "local-room").map((group) => `<button data-player-group="${esc(group.id)}" aria-pressed="${room?.id === group.id}"><span><b>${esc(group.name)}</b><small>${group.remote ? "Grupo privado compartido" : "Sala local"}</small></span>${room?.id === group.id ? '<em aria-hidden="true">✓</em>' : ""}</button>`).join("")}</div>`;
  } else if (tool === "playlists") {
    content = `<p class="player-tool-intro">${model.track ? `Añade <b>${esc(model.track.title)}</b> a una lista personal.` : "Tus listas se guardan en este dispositivo."}</p>
      <form data-player-create-list><label for="playerPlaylistName">Nueva lista</label><div class="player-list-create"><input id="playerPlaylistName" name="playlistName" maxlength="80" value="${esc(draftName)}" placeholder="Nombre de la lista" required><button type="submit">Crear</button></div></form>
      <div class="player-private-lists">${personal.playlists.length ? personal.playlists.map((list) => {
        const count = list.trackIds.filter((id) => model.tracks.some((track) => track.id === id)).length;
        const contains = !!model.track && list.trackIds.includes(model.track.id);
        return `<article><span><b>${esc(list.name)}</b><small>${count} canción${count === 1 ? "" : "es"}</small></span><button data-player-list-add="${esc(list.id)}" ${!model.track || contains ? "disabled" : ""}>${contains ? "Añadida" : "Añadir"}</button><button data-player-list-play="${esc(list.id)}" ${count ? "" : "disabled"} aria-label="Reproducir ${esc(list.name)}">${playerIcon("play")}</button></article>`;
      }).join("") : '<div class="player-tool-empty"><b>Tu primera lista</b><p>Crea una lista para organizar la música de tus lecturas.</p></div>'}</div>`;
  }
  return `<div class="player-tool-overlay"><button class="player-tool-backdrop" data-player-tool-close tabindex="-1" aria-label="Cerrar ${esc(toolTitle())}"></button><aside class="player-tool-sheet" role="dialog" aria-modal="true" aria-labelledby="playerToolTitle"><header><h2 id="playerToolTitle">${esc(toolTitle())}</h2><button class="player-icon-button" data-player-tool-close aria-label="Cerrar ${esc(toolTitle())}">${playerIcon("close")}</button></header><div class="player-tool-body">${content}<p class="player-tool-message" role="status">${esc(toolMessage)}</p></div></aside></div>`;
}
export function playerHtml(model, extras = {}) {
  const track = model.track;
  const mode = readingModeInfo(model.readingMode);
  const art = /^https:\/\//i.test(track?.artwork || "") ? track.artwork : "";
  const hasFile = !!track?.blob;
  const sourceUrl = /^https:\/\//i.test(track?.permalinkUrl || track?.url || "") ? track.permalinkUrl || track.url : "";
  const locked = tool ? " inert" : "";
  return `<div class="reader-music player-screen${track ? "" : " is-empty"}" data-music-root>
    <div class="player-dynamic-background" aria-hidden="true"><img data-player-background-art ${art ? `src="${esc(art)}"` : "hidden"} alt="" referrerpolicy="no-referrer"><i></i></div>
    <header class="player-header"${locked}>
      <button class="btn-collapse player-icon-button" data-music-close aria-label="Minimizar">${playerIcon("collapse")}</button>
      <span class="player-status" data-player-status>${model.playing ? "Reproduciendo" : track ? "En pausa" : "Música para tu lectura"}</span>
      <div class="header-actions"><button class="player-icon-button" data-player-tool="group" aria-label="Música del grupo">${playerIcon("group")}</button><button class="player-icon-button" data-player-tool="lyrics" aria-label="Letra de la canción" ${track ? "" : "disabled"}>${playerIcon("lyrics")}</button><button class="player-icon-button" data-player-tool="queue" aria-label="Cola de reproducción">${playerIcon("queue")}</button></div>
    </header>
    <main class="player-main"${locked}>
      <figure class="album-art-container album-cover ${art ? "has-art" : ""}">
        <img data-player-art ${art ? `src="${esc(art)}"` : "hidden"} alt="${esc(track ? `${track.title} – ${track.artist}` : "Sin canción seleccionada")}" referrerpolicy="no-referrer">
        <div class="player-art-fallback" aria-hidden="true">${playerIcon("disc")}</div>
      </figure>
      <div class="player-track-panel">
        <section class="track-info-section"><hgroup><h1 class="track-title" data-music-title>${esc(track?.title || "Tu música para leer")}</h1><h2 class="track-artist" data-music-artist>${esc(track?.artist || "Elige una canción para empezar")}</h2></hgroup><div class="track-actions"><button class="btn-add-playlist player-icon-button" data-player-tool="playlists" aria-label="Añadir a una lista" ${track ? "" : "disabled"}>${playerIcon("playlist")}</button><button class="btn-favorite player-icon-button" data-player-favorite aria-label="${favorite(track?.id) ? "Quitar de favoritos" : "Añadir a favoritos"}" aria-pressed="${favorite(track?.id)}" ${track ? "" : "disabled"}>${playerIcon("heart")}</button></div></section>
        <div class="progress-section track-timeline"><input type="range" class="progress-bar" data-music-seek min="0" max="${Math.max(1, model.duration)}" step="0.1" value="${Math.max(0, Math.min(model.position, model.duration || 1))}" aria-label="Posición de reproducción" ${track && model.duration > 0 ? "" : "disabled"}><div class="time-indicators"><span class="time-current" data-music-position>${model.positionText}</span><span class="time-total" data-music-duration>${model.durationText}</span></div></div>
        <div class="player-controls playback-controls" role="group" aria-label="Controles de reproducción"><button class="btn-prev player-icon-button" data-music-prev aria-label="Anterior" ${track ? "" : "disabled"}>${playerIcon("previous")}</button><button class="btn-play-pause main-action" data-music-toggle aria-label="${model.playing ? "Pausar" : "Reproducir"}">${playerIcon(model.playing ? "pause" : "play")}</button><button class="btn-next player-icon-button" data-music-next aria-label="Siguiente" ${track ? "" : "disabled"}>${playerIcon("next")}</button></div>
        <div class="secondary-controls"><button class="btn-mode" data-music-shuffle aria-label="${model.shuffle ? "Cambiar a orden lineal" : "Cambiar a orden aleatorio"}" aria-pressed="${model.shuffle}">${playerIcon(model.shuffle ? "shuffle" : "linear")}<span data-player-order>${model.shuffle ? "Aleatorio" : "Lineal"}</span></button><button class="btn-repeat" data-player-tool="modes" aria-label="Cambiar modo de lectura" aria-haspopup="dialog">${playerIcon("repeat")}<i data-player-mode-number>${mode.number}</i><span data-player-mode-label>${esc(mode.short)}</span></button></div>
        <p class="player-mode-description" data-player-mode-description>${esc(mode.hint)}</p>
        <p class="reader-music-status player-playback-status" data-music-status role="status">${esc(model.status)}</p>
        ${track ? "" : '<button class="player-choose-music" data-player-search>Elegir una canción</button>'}
      </div>
    </main>
    <footer class="player-footer audio-output-bar"${locked}><button class="btn-share" data-player-share ${track ? "" : "disabled"}>${playerIcon("share")}<span>Compartir</span></button>${hasFile ? `<button class="btn-save-file" data-player-save-file title="Guardar el archivo de audio importado">${playerIcon("download")}<span>Guardar archivo original</span></button>` : `<a class="btn-source" data-player-source ${sourceUrl ? `href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer"` : 'aria-disabled="true" tabindex="-1"'} title="Abrir canción en su fuente original">${playerIcon("source")}<span>Abrir canción en su fuente original</span></a>`}</footer>
    ${toolHtml(model, extras)}
  </div>`;
}
export function syncPlayer(model) {
  const root = document.querySelector(".player-screen");
  if (!root) return;
  const track = model.track;
  const status = root.querySelector("[data-player-status]");
  if (status) status.textContent = model.waitingForPin ? "Esperando la siguiente pista" : model.playing ? "Reproduciendo" : track ? "En pausa" : "Música para tu lectura";
  const art = root.querySelector("[data-player-art]");
  const artUrl = /^https:\/\//i.test(track?.artwork || "") ? track.artwork : "";
  if (art) {
    art.alt = track ? `${track.title} – ${track.artist}` : "Sin canción seleccionada";
    if (art.dataset.trackArt !== artUrl) {
      art.dataset.trackArt = artUrl;
      if (artUrl) { art.src = artUrl; art.hidden = false; }
      else { art.removeAttribute("src"); art.hidden = true; }
      art.closest("figure").classList.toggle("has-art", !!artUrl);
      const background = root.querySelector("[data-player-background-art]");
      if (background) {
        if (artUrl) { background.src = artUrl; background.hidden = false; }
        else { background.removeAttribute("src"); background.hidden = true; }
      }
    }
  }
  const toggle = root.querySelector(".btn-play-pause");
  if (toggle) toggle.innerHTML = playerIcon(model.playing ? "pause" : "play");
  const fav = root.querySelector("[data-player-favorite]");
  if (fav) {
    fav.setAttribute("aria-pressed", String(favorite(track?.id)));
    fav.setAttribute("aria-label", favorite(track?.id) ? "Quitar de favoritos" : "Añadir a favoritos");
    fav.disabled = !track;
  }
  root.querySelectorAll(".btn-prev,.btn-next,.btn-share,.btn-save-file,.btn-add-playlist,[data-player-tool='lyrics']").forEach((button) => { button.disabled = !track; });
  const info = readingModeInfo(model.readingMode);
  root.querySelector("[data-player-mode-number]").textContent = String(info.number);
  root.querySelector("[data-player-mode-label]").textContent = info.short;
  root.querySelector("[data-player-mode-description]").textContent = info.hint;
  root.querySelector("[data-player-order]").textContent = model.shuffle ? "Aleatorio" : "Lineal";
  const order = root.querySelector(".btn-mode");
  order.setAttribute("aria-pressed", String(model.shuffle));
  order.setAttribute("aria-label", model.shuffle ? "Cambiar a orden lineal" : "Cambiar a orden aleatorio");
}
function openTool(value, restoring = false) {
  if (!["queue", "library", "playlists", "modes", "lyrics", "group"].includes(value)) return false;
  if (restoring && !document.querySelector("#readerSheet.reader-player-open .player-screen")) adapter?.open?.();
  if (!document.querySelector("#readerSheet.reader-player-open .player-screen")) return false;
  const screens = window.HanamiScreens;
  if (!restoring && !tool && screens?.is?.("reader-music")) {
    screens.push("reader-player-tool", { tool: value }, {
      restore: (record) => openTool(record?.data?.tool || value, true),
      suspend: () => closeTool(true),
    });
  } else if (!restoring && screens?.is?.("reader-player-tool")) {
    screens.updateData?.({ tool: value });
  }
  tool = value;
  if (value === "library") window.HanamiReaderMusicServices?.prepareLibrary?.();
  toolMessage = "";
  adapter.render();
  requestAnimationFrame(() => document.querySelector(".player-tool-sheet [data-player-tool-close]")?.focus({ preventScroll: true }));
  if (value === "lyrics") void window.HanamiReaderMusicServices?.openLyrics?.();
  return true;
}
export function closeTool(fromHistory = false) {
  if (!tool) return false;
  if (!fromHistory && window.HanamiScreens?.is?.("reader-player-tool")) {
    window.HanamiScreens.back();
    return true;
  }
  tool = "";
  toolMessage = "";
  adapter?.render();
  return true;
}
export function currentPlayerTool() { return tool; }
async function shareTrack() {
  const track = adapter.track();
  if (!track || shareBusy) return;
  shareBusy = true;
  try {
    if (typeof navigator.share !== "function") throw new Error("Este navegador no dispone de compartir. Puedes copiar el enlace desde la fuente original.");
    if (track.blob instanceof Blob) {
      const file = new File([track.blob], track.fileName || `${track.title}.mp3`, { type: track.blob.type || "audio/mpeg" });
      if (!navigator.canShare?.({ files: [file] })) throw new Error("El navegador no permite compartir este archivo de audio.");
      await navigator.share({ title: track.title, files: [file] });
    } else {
      const url = track.permalinkUrl || track.url;
      if (!/^https?:\/\//i.test(url || "")) throw new Error("Esta pista no tiene un enlace para compartir.");
      await navigator.share({ title: track.title, text: `${track.title} — ${track.artist}`, url });
    }
  } catch (error) { if (error?.name !== "AbortError") notify(error.message || "No se pudo compartir la canción."); }
  finally { shareBusy = false; }
}
function saveLocalFile() {
  const track = adapter.track();
  if (!track) return;
  if (!(track.blob instanceof Blob)) return;
  const url = URL.createObjectURL(track.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = (track.fileName || `${track.title}.mp3`).replace(/[\\/:*?"<>|]/g, "_");
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function installPlayerUI(api) {
  adapter = api;
  window.HanamiScreens?.registerType?.("reader-player-tool", (record) => {
    if (!openTool(record.data?.tool || "queue", true)) return false;
    window.HanamiScreens.register(record.id, {
      restore: (restored) => openTool(restored.data?.tool || "queue", true),
      suspend: () => closeTool(true),
    });
    return true;
  });
  document.addEventListener("error", (event) => {
    if (event.target.matches?.("[data-player-art]")) {
      event.target.hidden = true;
      event.target.closest("figure")?.classList.remove("has-art");
    }
  }, true);
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button?.closest(".player-screen")) return;
    if (button.dataset.playerTool) {
      event.preventDefault(); event.stopImmediatePropagation();
      openTool(button.dataset.playerTool);
    } else if (button.hasAttribute("data-player-tool-close")) {
      event.preventDefault(); event.stopImmediatePropagation(); closeTool();
    } else if (button.dataset.playerMode) {
      event.preventDefault(); event.stopImmediatePropagation();
      void adapter.setMode(button.dataset.playerMode);
      closeTool();
    } else if (button.hasAttribute("data-player-favorite")) {
      const id = adapter.track()?.id;
      if (!id) return;
      const previous = [...personal.favorites];
      personal.favorites = favorite(id) ? personal.favorites.filter((item) => item !== id) : [...personal.favorites, id].slice(-2000);
      if (!savePersonal()) personal.favorites = previous;
      adapter.sync();
    } else if (button.dataset.playerGroup) {
      window.HanamiReadingGroups?.setActive?.(button.dataset.playerGroup);
      adapter.render();
    } else if (button.hasAttribute("data-player-sync-group")) {
      void window.HanamiGroupMusic?.sync?.();
    } else if (button.hasAttribute("data-player-share-reading")) {
      try { window.HanamiMusicDiscovery?.publishCurrentReading?.(); }
      catch (error) { notify(error.message); }
    } else if (button.dataset.playerListAdd) {
      const list = personal.playlists.find((entry) => entry.id === button.dataset.playerListAdd);
      const id = adapter.track()?.id;
      if (!list || !id) return;
      const previous = [...list.trackIds];
      list.trackIds = [...new Set([...list.trackIds, id])].slice(-2000);
      if (!savePersonal()) list.trackIds = previous;
      toolMessage = "Canción añadida a la lista.";
      adapter.render();
    } else if (button.dataset.playerListPlay) {
      const list = personal.playlists.find((entry) => entry.id === button.dataset.playerListPlay);
      if (list) void adapter.playList(list.trackIds);
    } else if (button.hasAttribute("data-player-search")) {
      void window.HanamiReaderMusicServices?.openPicker?.();
    } else if (button.hasAttribute("data-player-share")) void shareTrack();
    else if (button.hasAttribute("data-player-save-file")) saveLocalFile();
  }, true);
  document.addEventListener("input", (event) => {
    if (event.target.id === "playerPlaylistName") draftName = event.target.value;
  });
  document.addEventListener("submit", (event) => {
    if (!event.target.matches("[data-player-create-list]")) return;
    event.preventDefault();
    const name = draftName.trim().slice(0, 80);
    if (!name || personal.playlists.length >= 100) { toolMessage = "Escribe un nombre válido. Puedes guardar hasta 100 listas."; adapter.render(); return; }
    const id = adapter.track()?.id;
    const list = { id: crypto.randomUUID(), name, trackIds: id ? [id] : [] };
    personal.playlists.push(list);
    if (!savePersonal()) personal.playlists.pop();
    else { draftName = ""; toolMessage = "Lista creada."; }
    adapter.render();
  });
  addEventListener("hanami-music-pin-sync", () => { if (tool === "group") adapter.render(); });
  document.addEventListener("keydown", (event) => {
    const root = document.querySelector(".player-screen");
    if (!root || document.querySelector(".reader-music-picker")) return;
    if (event.key === "Escape" && tool) {
      event.preventDefault(); event.stopImmediatePropagation(); closeTool(); return;
    }
    if (event.key !== "Tab") return;
    const container = document.querySelector(".player-tool-sheet") || root;
    const elements = [...container.querySelectorAll("button:not(:disabled),input:not(:disabled),a[href],select")].filter((node) => !node.closest("[inert]") && node.offsetParent !== null);
    if (!elements.length) return;
    const first = elements[0], last = elements.at(-1);
    if (event.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !container.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  }, true);
  window.HanamiReaderPlayer = {
    openTool,
    closeTool,
    playList: (id, startId) => {
      const list = personal.playlists.find((entry) => entry.id === id);
      if (!list) return Promise.resolve(false);
      const available = window.HanamiReaderMusic?.listTracks?.() || [];
      const ids = list.trackIds.filter((trackId) => available.some((track) => track.id === trackId));
      return ids.length ? adapter.playList(ids, ids.includes(startId) ? startId : ids[0]) : Promise.resolve(false);
    },
    snapshot: () => ({ tool, favorites: [...personal.favorites], playlists: personal.playlists.map((list) => ({ ...list, trackIds: [...list.trackIds] })) }),
  };
}