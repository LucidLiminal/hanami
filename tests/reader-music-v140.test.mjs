import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pinCardHtml } from "../public/reader-music-pin-cards.js";
import { playerHtml } from "../public/reader-player-view.js";

const entry = {
  binding: { id: "fixture-pin", shareState: "shared" },
  track: { title: '<img src=x onerror="alert(1)">', artist: "Artista & autor", artwork: "https://i1.sndcdn.com/album.jpg" },
  pageIndex: 2,
};
const collapsed = pinCardHtml(entry);
const expanded = pinCardHtml({ ...entry, canRemove: false }, true);
assert(collapsed.includes('class="reader-music-pin"'));
assert(collapsed.includes('aria-expanded="false"'));
assert(collapsed.includes("hidden inert"));
assert(expanded.includes("is-expanded"));
assert(expanded.includes('aria-expanded="true"'));
assert(expanded.includes("Página 3 · Grupo"));
assert(!expanded.includes('<img src=x'));
assert(expanded.includes("&lt;img"));
for (const token of ["album-cover", "track-title", "track-artist", "data-music-pin-toggle", "data-music-pin-change", "data-music-pin-remove", "data-music-pin-minimize"]) assert(expanded.includes(token), token);
assert.match(expanded, /data-music-pin-remove[^>]+disabled/);
assert.match(expanded, /data-music-pin-change[^>]+disabled/);
assert(collapsed.includes('data-music-pin-draggable="true"'));
const model = {
  track: { id: "sc", title: "Una pista", artist: "Artista", provider: "soundcloud", permalinkUrl: "https://soundcloud.com/artist/song" },
  tracks: [], queue: ["sc"], position: 0, duration: 90, positionText: "00:00", durationText: "01:30",
  playing: false, readingMode: "queue-once", shuffle: false, status: "",
};
const markup = playerHtml(model);
assert(markup.includes('data-player-source href="https://soundcloud.com/artist/song"'));
assert(markup.includes('target="_blank" rel="noopener noreferrer"'));
assert(markup.includes("Abrir canción en su fuente original"));
assert(!markup.includes("data-player-download"));
assert(!markup.includes(">Descargar<"));
assert(playerHtml({ ...model, track: { ...model.track, blob: new Blob(["fixture"]), fileName: "Local.wav" } }).includes("Guardar archivo original"));
const read = (name) => readFile(new URL(`../public/${name}`, import.meta.url), "utf8");
const [reader, css, core, services, sw, discovery, cards, cardsCss, group] = await Promise.all([
  read("reader.js"), read("styles.css"), read("reader-music.js"), read("reader-music-services.js"), read("sw.js"), read("reader-music-discovery.js"),
  read("reader-music-pin-cards.js"), read("reader-music-pin-cards.css"),
  read("reader-music-group.js"),
]);
assert(!reader.includes("readerIndicator"));
assert(!css.includes("readerIndicator"));
assert(core.includes("removeFromQueue"));
assert(core.includes("audio.dataset.musicSource === sourceKey"));
assert(core.includes("syncPinQueue"));
assert(services.includes("callback: () =>"));
assert(services.includes("confirmWidgetReady"));
assert(services.includes("finishedToken"));
assert(services.includes("if (reuse)"));
assert(services.includes("localPlaylistsHtml"));
assert(services.includes('data-music-picker-source="local"'));
assert(services.includes("openLists"));
assert(services.includes("replaceBindingId"));
assert(services.includes("prepareReadingQueue"));
assert(discovery.includes('data-reader-music-anchor='));
assert(discovery.includes("music.removeFromQueue"));
for (const token of ["changeBinding", "replaceBindingTrack", "moveBinding", "syncActiveReadingQueue"]) assert(discovery.includes(token), token);
assert(discovery.includes("SoundCloud's image CDN"));
for (const token of ["normalizeSharedTrack", "sharedArtwork", "las demás pistas pendientes siguen sincronizándose", "row.group_id"]) assert(group.includes(token), token);
for (const token of ["data-music-pin-change", "pointerdown", "targetCoordinate"]) assert(cards.includes(token), token);
assert(cardsCss.includes('data-dragging="true"'));
assert(cardsCss.includes(".reader-music-pin-change"));
for (const asset of ["reader-music-pin-cards.js", "reader-music-pin-cards.css", "reader-music-local-lists.css"]) assert(sw.includes(asset), asset);
assert(sw.includes("hanami-crimson-knot-v140"));
console.log("PASS: v140 repairs unsafe shared-track metadata, drains every compatible pending pin, and preserves pin replacement, drag, and queue behavior");