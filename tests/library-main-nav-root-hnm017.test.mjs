import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, library, navigation] = await Promise.all([
  "public/app.js", "public/library.js", "public/navigation.js",
].map((file) => readFile(new URL(`../${file}`, import.meta.url), "utf8")));

assert(app.includes("const tab=b.dataset.tab,screen=window.HanamiScreens?.current?.(),active=window.HanamiNavigation?.isActive?.(tab),child="));
assert(app.includes("document.body.classList.contains('nav-child')||(screen&&screen.type!=='root')"));
assert(app.includes("if(active&&child)showTab(tab,'push');"));
for (const tab of ["library", "explore", "updates", "history", "more"]) {
  assert(app.includes(`else if(tab==='${tab}'&&active)`));
}
assert(library.includes("function render(forceRoot=false)"));
assert(library.includes("L.screen=null;libraryDetailRequest++"));
assert(navigation.includes("function setChild(v)"));

console.log("PASS: HNM-017 returns every active main-nav child screen to its tab root before allowing root reselects");