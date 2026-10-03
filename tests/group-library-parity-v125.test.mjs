import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [library, shelf, groupLibrary, categories, css, navigation, social, sql, sw, packageText] =
  await Promise.all([
    readFile(new URL("../public/library.js", import.meta.url), "utf8"),
    readFile(new URL("../public/library-groups.js", import.meta.url), "utf8"),
    readFile(new URL("../public/group-library.js", import.meta.url), "utf8"),
    readFile(new URL("../public/categories.js", import.meta.url), "utf8"),
    readFile(new URL("../public/library-groups.css", import.meta.url), "utf8"),
    readFile(new URL("../public/navigation.js", import.meta.url), "utf8"),
    readFile(new URL("../public/social-sync.js", import.meta.url), "utf8"),
    readFile(
      new URL("../supabase/hanami-library-parity-v125.sql", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
const pkg = JSON.parse(packageText);

assert(shelf.includes('class="lib-tabs group-library-categories"'));
assert(shelf.includes('role="tablist"'));
assert(shelf.includes('role="tab"'));
assert(shelf.includes(">Predeterminada${showCounts"));
assert(!shelf.includes("library-group-entry-more"));
assert(shelf.includes("lib-check"));
assert(shelf.includes("handleEntryClick"));

for (const token of [
  "HanamiSelectionToolbar.top",
  "HanamiSelectionToolbar.bottom",
  "beginSelection",
  "entryHoldTimer",
  "chooseBulkScoped",
  "manageScoped",
  "data-group-selection-category",
  "data-group-selection-delete",
  "data-group-category-filter",
  "touchstart",
  "ArrowLeft",
])
  assert(groupLibrary.includes(token), token);

assert(library.includes("groupSelected"));
assert(library.includes("HanamiGroupLibrary.selectionTop()"));
assert(library.includes("HanamiGroupLibrary.selectionBottom"));
assert(categories.includes("window.HanamiCategories.manageScoped"));
assert(categories.includes("window.HanamiCategories.chooseBulkScoped"));
assert(categories.includes('class="category-list"'));
assert(categories.includes('class="category-tri"'));
assert(navigation.includes("s==='library-group'"));
assert(!css.includes(".group-library-categories button"));
assert(social.includes("reorderGroupCategories"));
assert(sql.includes("reorder_group_library_categories"));

assert(sw.includes("hanami-crimson-knot-v140"));
assert.equal(pkg.version, "5.14.0");
assert(
  pkg.scripts.test.includes(
    "node tests/reader-music-v128.test.mjs",
  ),
);

console.log(
  "PASS: group shelves reuse Library tabs, category sub-screens, long-press selection and contextual toolbars",
);