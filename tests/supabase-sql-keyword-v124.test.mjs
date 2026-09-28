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
assert(sw.includes("hanami-reader-comment-position-v126"));
assert.equal(pkg.version, "5.8.59");
assert(
  pkg.scripts.test.startsWith("node tests/reader-comment-position-v126.test.mjs"),
);

console.log(
  "PASS: Supabase category RPC avoids the reserved position identifier and keeps client compatibility",
);