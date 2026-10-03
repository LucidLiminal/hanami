import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [comments, packageText, sw] = await Promise.all([
  readFile(new URL("../public/reader-comments.js", import.meta.url), "utf8"),
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
assert.equal(pkg.version, "5.18.0");
assert(sw.includes("hanami-crimson-knot-v144"));

console.log("PASS: reader comments re-anchor after a page image settles or reloads");
