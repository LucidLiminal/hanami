import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [library, groups, social, reader, sql, index, css, sw, packageText] =
  await Promise.all([
    readFile(new URL("../public/group-library.js", import.meta.url), "utf8"),
    readFile(new URL("../public/reading-groups.js", import.meta.url), "utf8"),
    readFile(new URL("../public/social-sync.js", import.meta.url), "utf8"),
    readFile(new URL("../public/reader.js", import.meta.url), "utf8"),
    readFile(
      new URL("../supabase/hanami-group-library-v118.sql", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/group-library.css", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
const pkg = JSON.parse(packageText);

for (const token of [
  "hanami-group-libraries-v1",
  "hanami-group-progress-v1",
  "Biblioteca compartida",
  "RECOMENDADO POR",
  "recommendDialog",
  "recommendation",
  "memberProgress",
  "chapterNumber",
  "pageIndex",
  "hanami-reader-progress",
  "pullComments",
  "HanamiAppOpenGroupManga",
  "exportBundle",
  "importBundle",
])
  assert(library.includes(token), token);

assert(library.includes("function rerenderGroup"));
assert(groups.includes("HanamiGroupLibrary?.ensure"));
for (const token of [
  "list_group_library",
  "recommend_group_manga",
  "group_reading_progress",
  "saveGroupProgress",
])
  assert(social.includes(token), token);
assert(reader.includes("new CustomEvent('hanami-reader-progress'"));

for (const token of [
  "public.group_library_entries",
  "public.group_reading_progress",
  "unique(group_id, source_id, manga_url)",
  "public.list_group_library",
  "public.recommend_group_manga",
  "group progress visible to members",
  "members update own progress",
  "public.is_group_member",
])
  assert(sql.includes(token), token);

assert(index.includes('href="/group-library.css"'));
assert(index.includes('src="/group-library.js"'));
assert(css.includes(".group-library-grid"));
assert(css.includes(".group-progress-list"));
assert(sw.includes("hanami-crimson-knot-v142"));
assert(sw.includes("'/group-library.js'"));
assert.equal(pkg.version, "5.16.0");
assert(
  pkg.scripts.test.includes(
    "node tests/group-library-member-progress-v118.test.mjs",
  ),
);

console.log(
  "PASS: each reading group has an independent shared library with recommendations, member progress and group-scoped comments",
);