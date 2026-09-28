import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [reader, pkgText, sw] = await Promise.all([
  readFile(new URL("../public/reader.js", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
]);
const pkg = JSON.parse(pkgText);

assert(
  reader.includes(
    "if(S===session&&!R().classList.contains('hidden'))return true",
  ),
  "reader history restoration must retain the live reader session",
);
assert(
  !reader.includes("restore:()=>open(o,true)"),
  "reader must not reopen from the stale initial resume point",
);
assert.equal(pkg.version, "5.8.60");
assert(sw.includes("hanami-group-progress-resume-v127"));

console.log(
  "PASS: returning from a comment preserves the live reader position",
);