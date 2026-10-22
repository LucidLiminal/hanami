import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const overlay = await readFile(
  new URL("../public/overlay-dismiss.js", import.meta.url),
  "utf8",
);

assert(overlay.includes("pendingModalDismissal={node:n,pointerId:e.pointerId,released:false}"));
assert(overlay.includes("document.addEventListener('pointerup'"));
assert(overlay.includes("pending.released=true"));
assert(overlay.includes("document.addEventListener('pointercancel'"));
assert(overlay.includes("if(!pending?.released)return"));
assert(overlay.includes("e.stopImmediatePropagation()"));
assert(overlay.includes("modalDismissalTimer=setTimeout"));

console.log(
  "PASS: HNM-028 reserves a modal-backdrop pointer sequence for dismissal only",
);
