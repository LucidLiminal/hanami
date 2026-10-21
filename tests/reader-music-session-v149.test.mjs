import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [reader, music, player, sw, packageText] = await Promise.all([
  read("public/reader.js"),
  read("public/reader-music.js"),
  read("public/reader-player-view.js"),
  read("public/sw.js"),
  read("package.json"),
]);

assert(music.includes("function endReaderSession"));
assert(music.includes("endSession: endReaderSession"));
assert(music.includes("++loadToken"), "ending a session invalidates late loads");
assert(music.includes("state.queueVisited = []"));
assert(music.includes("delete active.dataset.musicSource"));
assert(music.includes("navigator.mediaSession.metadata = null"));
assert(music.includes("closePanel(true);"));
assert(player.includes("data-music-close"));
assert(reader.includes("function resetMusicForChapter"));
assert(reader.includes("endSession?.('reader-closed')"));
assert((reader.match(/endSession\?\.\('chapter-change'\)/g) || []).length >= 2,
  "both replacement and continuous chapter transitions reset music");
assert(sw.includes("hanami-crimson-knot-v150"));
assert.equal(JSON.parse(packageText).version, "5.24.0");
console.log("PASS: v149 bounds playback, queue and player UI to the current reader chapter/session");
