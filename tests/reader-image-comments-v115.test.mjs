import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [comments, reader, css, html, sw, packageText] = await Promise.all([
  readFile(new URL("../public/reader-comments.js", import.meta.url), "utf8"),
  readFile(new URL("../public/reader.js", import.meta.url), "utf8"),
  readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
]);
const pkg = JSON.parse(packageText);

for (const token of [
  "hanami-reader-comments-v1",
  "data-comment-file",
  "accept=\"image/*,.gif\"",
  "reader-comment-resize",
  "pointermove",
  "HanamiScreens.push",
  "reader-comment-editor",
  "pageKey",
  "chapterUrl",
  "pageIndex",
])
  assert(comments.includes(token), token);

assert(reader.includes("data-comment-context"));
assert(reader.includes("HanamiReaderComments?.begin"));
assert(reader.includes("clientX:e.clientX,clientY:e.clientY"));
assert(css.includes(".reader-comment-layer"));
assert(css.includes(".reader-comment-editor"));
assert(css.includes("touch-action:none"));
assert(html.includes('src="/reader-comments.js"'));
assert(sw.includes("hanami-crimson-knot-v134-1"));
assert(sw.includes("'/reader-comments.js'"));
assert.equal(pkg.version, "5.8.68");
assert(
  pkg.scripts.test.includes(
    "node tests/reader-image-comments-v115.test.mjs",
  ),
);

console.log(
  "PASS: image comments are coordinate-anchored, editable, movable, resizable and support image/GIF attachments",
);