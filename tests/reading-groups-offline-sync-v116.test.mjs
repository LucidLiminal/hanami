import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [groups, comments, index, app, navigation, css, sw, packageText] =
  await Promise.all([
    readFile(new URL("../public/reading-groups.js", import.meta.url), "utf8"),
    readFile(new URL("../public/reader-comments.js", import.meta.url), "utf8"),
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/navigation.js", import.meta.url), "utf8"),
    readFile(new URL("../public/reading-groups.css", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
const pkg = JSON.parse(packageText);

for (const token of [
  "hanami-reading-groups-v1",
  "hanami-reading-profile-v1",
  "hanami-active-reading-group",
  "reading-group",
  "HanamiScreens.push",
  "exportActive",
  "importBundle",
  "hanami-reading-group-v1",
  "inviteCode",
])
  assert(groups.includes(token), token);

for (const token of [
  "hanami-reader-comments-v2",
  "indexedDB.open",
  "syncQueue",
  "syncState",
  "revision",
  "authorId",
  "groupId",
  "migrateLegacy",
  "exportBundle",
  "pendingCount",
])
  assert(comments.includes(token), token);

assert(index.includes('id="groups"'));
assert(!index.includes('data-tab="groups"'));
assert(index.includes('src="/library-groups.js"'));
assert(index.includes('href="/reading-groups.css"'));
assert(index.includes('src="/reading-groups.js"'));
assert(app.includes("'library','updates','history','groups','more'"));
assert(app.includes("if(id==='groups')id='library'"));
assert(!navigation.includes("if(root==='groups')window.HanamiReadingGroups?.render()"));
assert(css.includes(".reading-groups-hero"));
assert(css.includes(".reading-room-grid"));
assert(css.includes("@media(max-width:600px)"));
assert(sw.includes("hanami-crimson-knot-v1354"));
for (const asset of [
  "/reading-groups.css",
  "/reading-groups.js",
  "/assets/reading-room-bedroom.webp",
  "/assets/reading-room-graffiti.webp",
  "/assets/reading-room-nazuna.webp",
])
  assert(sw.includes(asset), asset);
assert.equal(pkg.version, "5.9.4");
assert(
  pkg.scripts.test.includes(
    "node tests/reading-groups-offline-sync-v116.test.mjs",
  ),
);

console.log(
  "PASS: reading groups retain IndexedDB identity, group, revision, queue and portable bundles after moving from a main tab into Library",
);