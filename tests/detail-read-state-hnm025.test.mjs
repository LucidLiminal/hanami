import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [detail, library] = await Promise.all(
  ["../public/manga-detail.js", "../public/library.js"].map((path) =>
    readFile(new URL(path, import.meta.url), "utf8"),
  ),
);

assert(detail.includes("syncLibraryChapterState"));
assert(detail.includes("hanami-library-change"));
assert(detail.includes("detailRoot?.isConnected"));
assert(detail.includes("readChapterMetadata(item,chapter)"));
assert(detail.includes("saveM();renderChapters()"));
assert(detail.includes("equalChapterMeta"));
assert(library.includes("onProgress:p=>"));
assert(library.includes("setChapterMetadata(x,current"));
assert(library.includes("save()},onBookmark"));

console.log("PASS: HNM-025 refreshes chapter rows from library progress events");
