import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [social, groups, comments, sql, api, index, css, sw, packageText] =
  await Promise.all([
    readFile(new URL("../public/social-sync.js", import.meta.url), "utf8"),
    readFile(new URL("../public/reading-groups.js", import.meta.url), "utf8"),
    readFile(new URL("../public/reader-comments.js", import.meta.url), "utf8"),
    readFile(
      new URL("../supabase/hanami-social-v117.sql", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../api/index.mjs", import.meta.url), "utf8"),
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/reading-groups.css", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
const pkg = JSON.parse(packageText);

for (const token of [
  "hanami-supabase-config-v1",
  "hanami-supabase-session-v1",
  "/auth/v1/token?grant_type=refresh_token",
  "list_my_reading_groups",
  "create_reading_group",
  "reader_comments?on_conflict=id",
  "comment-media",
  "pendingOperations",
  "mergeRemote",
  "signedMediaUrl",
])
  assert(social.includes(token), token);

for (const token of [
  "data-social-configure",
  "data-social-sync",
  "data-social-signout",
  "mergeRemoteGroups",
  "Sala sincronizada",
  "V120",
])
  assert(groups.includes(token), token);

for (const token of [
  "pendingOperations",
  "markOperation",
  "mergeRemote",
  "syncState: \"synced\"",
  "reader-comment-author",
])
  assert(comments.includes(token), token);

for (const token of [
  "create table if not exists public.profiles",
  "create table if not exists public.reading_groups",
  "create table if not exists public.reading_group_members",
  "create table if not exists public.reader_comments",
  "enable row level security",
  "public.is_group_member",
  "public.create_reading_group",
  "public.join_reading_group",
  "storage.buckets",
  "comment-media",
  "auth.uid()",
])
  assert(sql.includes(token), token);

assert(api.includes("raw==='social-config'"));
assert(api.includes("process.env.SUPABASE_URL"));
assert(api.includes("process.env.SUPABASE_ANON_KEY"));
assert(!api.includes("SUPABASE_SERVICE_ROLE_KEY"));
assert(index.includes('src="/social-sync.js"'));
assert(css.includes(".reading-room-cloud"));
assert(css.includes(".reading-social-actions"));
assert(sw.includes("hanami-crimson-knot-v135"));
assert(sw.includes("'/social-sync.js'"));
assert.equal(pkg.version, "5.9.0");
assert(
  pkg.scripts.test.includes(
    "node tests/supabase-groups-auth-sync-v117.test.mjs",
  ),
);

console.log(
  "PASS: Supabase sessions, private groups, RLS, media storage and offline comment queue synchronization remain wired after invite-only auth supersedes magic links",
);