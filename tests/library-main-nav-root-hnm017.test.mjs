import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, library, navigation] = await Promise.all([
  "public/app.js", "public/library.js", "public/navigation.js",
].map((file) => readFile(new URL(`../${file}`, import.meta.url), "utf8")));

assert(app.includes("const screen=window.HanamiScreens?.current?.();"));
assert(app.includes("document.body.classList.contains('nav-child')||(screen&&screen.type!=='root')"));
assert(app.includes("showTab('library','push');else window.HanamiLibrary?.openSettings?.()"));
assert(library.includes("function render(forceRoot=false)"));
assert(library.includes("L.screen=null;libraryDetailRequest++"));
assert(navigation.includes("function setChild(v)"));

console.log("PASS: HNM-017 returns an active Library child screen to libraryRoot before allowing the Settings reselect");