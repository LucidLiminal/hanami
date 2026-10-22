import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const library = await readFile(
  new URL("../public/library.js", import.meta.url),
  "utf8",
);

assert(library.includes("suppressClick:null"));
assert(library.includes("L.suppressClick={id,pointerId:e.pointerId}"));
assert(library.includes("pending.pointerId!==e.pointerId"));
assert(library.includes("releaseClickTimer=setTimeout"));
assert(
  library.includes(
    "if(L.suppressClick?.id===b.dataset.libId){clearSuppressedLibraryClick();return}",
  ),
);
assert(!library.includes("if(L.suppressClick){L.suppressClick=false;return}"));

console.log(
  "PASS: HNM-027 scopes long-press click suppression to its released card",
);
