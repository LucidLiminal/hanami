import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { READING_MODES, readingModeInfo, followsReadingPins, trackEndAction, chooseVisiblePin } from "../public/reader-music-policy.js";
import { playerHtml } from "../public/reader-player-view.js";
import { isRemoteMusicGroup } from "../public/reader-music-group.js";
import { canonicalLibraryPageKey } from "../public/reader-music-discovery.js";

assert.deepEqual(READING_MODES.map((mode) => mode.number), [1, 2, 3, 4]);
assert.equal(readingModeInfo("invalid").id, "pin-loop");
assert.equal(followsReadingPins("pin-loop"), true);
assert.equal(followsReadingPins("pin-once"), true);
assert.equal(followsReadingPins("queue-loop"), false);
assert.equal(followsReadingPins("queue-once"), false);
for (const hasNext of [false, true]) {
  assert.equal(trackEndAction("pin-loop", hasNext), "repeat-track");
  assert.equal(trackEndAction("pin-once", hasNext), "wait-pin");
}
assert.equal(trackEndAction("queue-loop", true), "next");
assert.equal(trackEndAction("queue-loop", false), "restart-queue");
assert.equal(trackEndAction("queue-once", true), "next");
assert.equal(trackEndAction("queue-once", false), "stop");
const pins = [
  { id: "c", order: 2, visible: true }, { id: "a", order: 0, visible: true },
  { id: "b", order: 1, visible: true }, { id: "missing", order: 3, visible: true, available: false },
];
assert.equal(chooseVisiblePin(pins, "", 1).id, "a");
assert.equal(chooseVisiblePin(pins, "a", 1).id, "b");
assert.equal(chooseVisiblePin(pins, "c", -1).id, "b");
assert.equal(chooseVisiblePin(pins, "c", 1), null);
assert.equal(chooseVisiblePin(pins.map((pin) => ({ ...pin, visible: false })), "a"), null);
assert.equal(isRemoteMusicGroup("local-room"), false);
assert.equal(isRemoteMusicGroup("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), true);
const legacyPage = JSON.stringify(["local-room", "fixture.source", "device-book-id", "/chapter/1", 2]);
const storedWorks = [{ id: "device-book-id", sourceId: "fixture.source", url: "/book/stable-url" }];
assert.equal(canonicalLibraryPageKey(legacyPage, storedWorks), JSON.stringify(["local-room", "fixture.source", "/book/stable-url", "/chapter/1", 2]));
assert.equal(canonicalLibraryPageKey(legacyPage, [{ ...storedWorks[0], sourceId: "another.source" }]), legacyPage);
assert.equal(canonicalLibraryPageKey("malformed", storedWorks), "malformed");
const markup = playerHtml({
  track: { id: "fixture", title: '<script>alert("x")</script>', artist: "Artista", artwork: "https://i1.sndcdn.com/art.jpg" },
  tracks: [], queue: ["fixture"], position: 3, duration: 334, positionText: "00:03", durationText: "05:34",
  playing: true, readingMode: "pin-loop", shuffle: false, status: "",
});
for (const token of ["player-header", "btn-collapse", "player-status", "header-actions", "player-main", "album-art-container", "track-info-section", "track-title", "track-artist", "btn-add-playlist", "btn-favorite", "progress-bar", "time-indicators", "btn-prev", "btn-play-pause", "btn-next", "secondary-controls", "btn-mode", "btn-repeat", "player-footer", "btn-share", "btn-source"]) assert(markup.includes(token), token);
assert(!markup.includes('<script>alert'));
assert(markup.includes("&lt;script&gt;"));
assert(!markup.includes("reader-music-library"));
assert(!markup.includes("SERVICIOS EXTERNOS"));
assert(markup.includes('data-player-tool="group"'));
const core = await readFile(new URL("../public/reader-music.js", import.meta.url), "utf8");
const discovery = await readFile(new URL("../public/reader-music-discovery.js", import.meta.url), "utf8");
const css = await readFile(new URL("../public/reader-player.css", import.meta.url), "utf8");
const sw = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
assert(core.includes("queueVisited"));
assert(core.includes("readingSuspended"));
assert(core.includes("stopPinPlayback"));
assert(core.includes('registerType?.("reader-music"'));
assert(core.includes('finishedNaturally'));
assert(discovery.includes('document.addEventListener("scroll"'));
assert(discovery.includes("hanami-music-pins-reconciled"));
assert(discovery.includes("request !== followRequest"));
assert(css.includes(".player-tool-sheet"));
for (const asset of ["reader-music-policy.js", "reader-player-view.js", "reader-player.css", "reader-music-group.js"]) assert(sw.includes(asset));
console.log("PASS: v137 full-player structure, safe metadata, four reading modes, ordered pin selection, pause/cancellation boundaries and offline dependencies");