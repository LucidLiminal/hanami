import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [groupLibrary, app, groups, sw, packageText] = await Promise.all([
  readFile(new URL("../public/group-library.js", import.meta.url), "utf8"),
  readFile(new URL("../public/app.js", import.meta.url), "utf8"),
  readFile(new URL("../public/reading-groups.js", import.meta.url), "utf8"),
  readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
]);
const pkg = JSON.parse(packageText);

assert(groupLibrary.includes("HanamiAppOpenGroupManga"));
assert(!groupLibrary.includes("HanamiAppOpenDeepManga"));
assert(groupLibrary.includes("restoreDetails"));
assert(app.includes("function openGroupMihonDetails"));
assert(app.includes("HanamiMangaDetail.mount"));
assert(app.includes("'group-manga-detail'"));
assert(app.includes("readGroupMihonChapter"));
assert(app.includes("mangaUrl:screen.entry.mangaUrl"));
assert(app.includes("HanamiReader.open"));
assert(app.includes("HanamiScreens?.registerType?.('group-manga-detail'"));
assert(groups.includes("HanamiNavigation?.setChild?.(false)"));
assert(sw.includes("hanami-crimson-knot-v140"));
assert.equal(pkg.version, "5.14.0");
assert(
  pkg.scripts.test.includes(
    "node tests/group-mihon-details-v119.test.mjs",
  ),
);

console.log(
  "PASS: group library entries open a dedicated restorable Mihon Details screen and reader flow instead of the canonical source detail route",
);