import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [comments, discovery, cards, packageText, sw] = await Promise.all([
  readFile(new URL("../public/reader-comments.js", import.meta.url), "utf8"),
  readFile(new URL("../public/reader-music-discovery.js", import.meta.url), "utf8"),
  readFile(new URL("../public/reader-music-pin-cards.js", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
]);
const pkg = JSON.parse(packageText);

for (const token of [
  "pageImage",
  "scheduleFigureGeometry",
  "relayoutFigure",
  'document.addEventListener(\n  "load"',
  "temporary min-height",
]) assert(comments.includes(token), token);
assert(!comments.includes("ResizeObserver"));
assert(!comments.includes("readerGeometryRoot"));
for (const token of ["renderPinCards", "syncPinState", "scheduleFollow"]) assert(discovery.includes(token), token);
for (const token of ["reader-music-pin-dock", "renderPinCards", "syncPinCards"]) assert(cards.includes(token), token);
assert(Number(pkg.version.split(".")[0]) > 5 || Number(pkg.version.split(".")[1]) >= 17);
assert(Number(sw.match(/hanami-crimson-knot-v(\d+)/)?.[1]) >= 143);

console.log("PASS: comment re-anchoring stays scoped to page-image load and preserves the reader music overlay");
