import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [library, rooms, css, sw, packageText] = await Promise.all([
  readFile(new URL("../public/library.js", import.meta.url), "utf8"),
  readFile(new URL("../public/library-groups.js", import.meta.url), "utf8"),
  readFile(new URL("../public/library-groups.css", import.meta.url), "utf8"),
  readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
]);
const pkg = JSON.parse(packageText);

const barSource = rooms.slice(
  rooms.indexOf("function bar()"),
  rooms.indexOf("function progressSummary"),
);
assert(barSource.includes('<nav aria-label="Bibliotecas y grupos de lectura">'));
assert(!barSource.includes("<aside>"));
assert(!barSource.includes("<b>Mi biblioteca</b>"));
assert(!barSource.includes("<small>Individual</small>"));
assert(barSource.includes("data-library-room-add"));

for (const token of [
  "display: flex",
  "gap: 10px",
  "overflow-x: auto",
  "align-content: center",
  "flex-direction: row",
  "justify-content: flex-start",
  "align-items: center",
  "flex-wrap: nowrap",
])
  assert(css.includes(token), token);

assert(rooms.includes('<section class="library-group-shelf"><header><aside>'));
assert(
  rooms.includes(
    "Recomendaciones y progreso independientes de tu biblioteca personal.",
  ),
);
assert(rooms.includes("function recommendationItem"));
assert(rooms.includes("library-group-add-item"));
assert(
  rooms.indexOf("recommendationItem(group.id)") <
    rooms.indexOf("entries.map((entry) => groupEntry"),
);
assert(!rooms.includes("data-library-group-refresh"));
assert(css.includes(".library-group-add-item .lib-cover"));

assert(library.includes("data-lib-toolbar-more"));
assert(library.includes("data-lib-refresh-global"));
assert(library.includes("HanamiGroupLibrary?.refresh?.(g.id,false)"));

assert(sw.includes("hanami-group-administration-v123"));
assert.equal(pkg.version, "5.8.56");
assert(
  pkg.scripts.test.startsWith(
    "node tests/group-administration-v123.test.mjs",
  ),
);

console.log(
  "PASS: the room switcher is navigation-only, the active-room aside heads the shared shelf, recommend is its first card and toolbar refresh targets the active group",
);