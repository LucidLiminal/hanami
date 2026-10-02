import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [sql, social, sw, packageText] = await Promise.all([
  readFile(
    new URL(
      "../supabase/hanami-group-administration-v124.sql",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(new URL("../public/social-sync.js", import.meta.url), "utf8"),
  readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
]);
const pkg = JSON.parse(packageText);

assert(sql.includes("sort_order integer"));
assert(sql.includes("category.position as sort_order"));
assert(!sql.includes("position integer,"));
assert(social.includes("row.sort_order ?? row.position"));
assert(sw.includes("hanami-crimson-knot-v1354"));
assert.equal(pkg.version, "5.9.4");
assert(
  pkg.scripts.test.includes("node tests/reader-music-v128.test.mjs"),
);

console.log(
  "PASS: Supabase category RPC avoids the reserved position identifier and keeps client compatibility",
);