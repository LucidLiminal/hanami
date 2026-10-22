import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, navigation, app, deepLinks] = await Promise.all(
  [
    "../public/index.html",
    "../public/navigation.js",
    "../public/app.js",
    "../public/deep-links.js",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
);

assert.match(html, /<title>Hanami \/\/ Biblioteca<\/title>/);
assert.match(html, /<body data-root="library">/);
assert.match(html, /<section id="hero" class="hero hidden">/);
assert.match(html, /<div id="exploreChrome" class="explore-chrome hidden">/);
assert.match(html, /<nav id="exploreTabs" class="tabs explore-tabs hidden"/);
assert.match(html, /<section id="library" class="panel">/);
assert.match(html, /<section id="sources" class="panel hidden">/);
assert.match(
  html,
  /<button class="active" data-tab="library" aria-current="page">/,
);
assert.match(html, /<button data-tab="explore">/);
assert.match(navigation, /let active='library',child=false/);
assert.match(app, /showTab\('library','replace'\)/);
assert.match(deepLinks, /window\.HanamiAppShowTab\?\.\('library','replace'\)/);

console.log("PASS: HNM-026 paints Biblioteca before route modules load");
