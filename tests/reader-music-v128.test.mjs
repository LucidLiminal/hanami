import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [music, reader, css, html, sw, notices, readme, packageText] =
  await Promise.all([
    readFile(new URL("../public/reader-music.js", import.meta.url), "utf8"),
    readFile(new URL("../public/reader.js", import.meta.url), "utf8"),
    readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../THIRD_PARTY_NOTICES.md", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
const pkg = JSON.parse(packageText);

for (const token of [
  'const DB_NAME = "hanami-reader-music-v1"',
  "indexedDB.open",
  "new Audio()",
  "importAudioFiles",
  "addRemoteTrack",
  "importM3u",
  "playTrack",
  "setQueue",
  "moveQueue",
  "toggleShuffle",
  "cycleRepeat",
  "beginCrossfade",
  "setSleep",
  "navigator.mediaSession",
  "MediaMetadata",
  'window.HanamiScreens.push(\n      "reader-music"',
  "hanami-reader-music-change",
  "window.HanamiReaderMusic",
])
  assert(music.includes(token), `reader-music.js: ${token}`);

for (const token of [
  "data-music-files",
  "data-music-url",
  "data-music-search",
  "data-music-seek",
  "data-music-volume",
  "data-music-crossfade",
  "data-music-sleep",
  "data-music-shuffle-queue",
])
  assert(music.includes(token), token);

assert(reader.includes("data-r-music"));
assert(reader.includes("HanamiReaderMusic?.attach?.()"));
assert(reader.includes("HanamiReaderMusic?.open?.()"));
assert(html.includes('src="/reader-music.js"'));
assert(sw.includes("hanami-reader-music-v128"));
assert(sw.includes("'/reader-music.js'"));
assert(css.includes(".reader-music-mini"));
assert(css.includes(".reader-music-controls"));
assert(css.includes(".reader-music-queue-row"));
assert(notices.includes("TSuki music player"));
assert(notices.includes("GNU General Public License v3.0"));
assert(readme.includes("## Música durante la lectura"));
assert.equal(pkg.version, "5.8.61");
assert(
  pkg.scripts.test.startsWith("node tests/reader-music-v128.test.mjs"),
);

console.log(
  "PASS: TSuki-inspired Reader Music ports a persistent local library, editable queue, playback controls, crossfade, sleep timer and Media Session into the chapter viewer",
);
