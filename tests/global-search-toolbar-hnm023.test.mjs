import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [app, css, deepLinks] = await Promise.all([
  read("public/app.js"),
  read("public/browse-tab.css"),
  read("public/deep-links.js"),
]);
const toolbarStart = app.indexOf('<header class="global-search-toolbar">');
const toolbar = app.slice(toolbarStart, toolbarStart + 1400);

assert(toolbarStart >= 0, "the global search toolbar is rendered");
assert(!app.includes("global-search-main"));
assert(!app.includes("data-run-global"));
assert(toolbar.indexOf("data-child-back") < toolbar.indexOf('id="globalQuery"'));
assert(toolbar.indexOf('id="globalQuery"') < toolbar.indexOf('id="globalProgress"'));
assert(toolbar.indexOf('id="globalProgress"') < toolbar.indexOf("global-search-chips"));
assert.match(
  toolbar,
  /id="globalQuery" type="search" enterkeyhint="search" autocomplete="off" spellcheck="false"/,
);
assert(
  deepLinks.includes(
    "event.target?.id!=='globalQuery'||event.key!=='Enter'||event.isComposing",
  ),
);
assert(deepLinks.includes("window.HanamiAppRunGlobalSearch?.()"));
assert(
  css.includes(
    ".browse-global-screen .global-search-toolbar{position:sticky;top:0;z-index:35;display:grid;grid-auto-flow:row;grid-template-columns:48px minmax(0,1fr)",
  ),
);
assert(
  css.includes(
    ".browse-global-screen .global-search-progress{grid-column:1/-1;grid-row:2",
  ),
);
assert(
  css.includes(
    ".browse-global-screen .global-search-chips{grid-column:1/-1;grid-row:3;display:flex;flex-wrap:wrap;gap:8px;overflow-x:visible;justify-content:flex-start",
  ),
);

console.log(
  "PASS: HNM-023 uses a row-flow global search toolbar and keyboard search",
);