import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [index, library, rooms, roomCss, groups, groupLibrary, app, deep, styles, sw, packageText] =
  await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/library.js", import.meta.url), "utf8"),
    readFile(new URL("../public/library-groups.js", import.meta.url), "utf8"),
    readFile(new URL("../public/library-groups.css", import.meta.url), "utf8"),
    readFile(new URL("../public/reading-groups.js", import.meta.url), "utf8"),
    readFile(new URL("../public/group-library.js", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/deep-links.js", import.meta.url), "utf8"),
    readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
const pkg = JSON.parse(packageText);

assert(!index.includes('data-tab="groups"'));
assert.equal((index.match(/data-tab="/g) || []).length, 5);
assert(index.includes('href="/library-groups.css"'));
assert(index.includes('src="/library-groups.js"'));
assert(styles.includes("grid-template-columns:repeat(5,1fr)"));

for (const token of [
  "HanamiLibraryGroups?.bar",
  "HanamiLibraryGroups?.pager",
  "HanamiLibraryGroups?.isGroup",
  "personalPager",
])
  assert(library.includes(token), token);

for (const token of [
  "library-room-switcher",
  "SALA ACTIVA",
  "data-library-room",
  "data-library-room-add",
  "Entrar con invitación",
  "Crear grupo",
  "roomHoldTimer",
  "openDetails",
  "data-library-group-entry",
  "library-group-shelf",
])
  assert(rooms.includes(token), token);

assert(/overflow-x:\s*auto/.test(roomCss));
assert(/border-radius:\s*50%/.test(roomCss));
assert(/@media\s*\(max-width:\s*600px\)/.test(roomCss));
assert(groups.includes('document.body.dataset.root === "library"'));
assert(groups.includes('window.HanamiNavigation?.setChild?.(true)'));
assert(!groups.includes("HanamiGroupLibrary?.section?.(group)"));
assert(groupLibrary.includes("function rerenderGroup"));
assert(app.includes("if(id==='groups')id='library'"));
assert(app.includes("showTab('library',false)"));
assert(app.includes("const root=$('#libraryRoot')"));
assert(deep.includes("['/groups','library']"));
assert(sw.includes("'/library-groups.css'"));
assert(sw.includes("'/library-groups.js'"));
assert(sw.includes("hanami-group-library-parity-v125"));
assert.equal(pkg.version, "5.8.58");
assert(
  pkg.scripts.test.startsWith(
    "node tests/group-library-parity-v125.test.mjs",
  ),
);

console.log(
  "PASS: Groups leaves the primary navigation and becomes a horizontal Library room switcher with tap scope, long-press details and add-room dialog",
);