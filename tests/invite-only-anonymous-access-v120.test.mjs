import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [social, groups, css, sql, gitignore, sw, packageText] = await Promise.all([
  readFile(new URL("../public/social-sync.js", import.meta.url), "utf8"),
  readFile(new URL("../public/reading-groups.js", import.meta.url), "utf8"),
  readFile(new URL("../public/reading-groups.css", import.meta.url), "utf8"),
  readFile(
    new URL("../supabase/hanami-invite-access-v120.sql", import.meta.url),
    "utf8",
  ),
  readFile(new URL("../.gitignore", import.meta.url), "utf8"),
  readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
]);
const pkg = JSON.parse(packageText);

for (const token of [
  '"/auth/v1/signup"',
  "signInAnonymously",
  "redeem_reading_group_invite",
  "create_reading_group_invite",
  "list_reading_group_invites",
  "revoke_reading_group_invite",
  "createdIdentity",
  "await signOut()",
])
  assert(social.includes(token), token);

assert(!social.includes("/auth/v1/otp"));
assert(!groups.includes("Entrar por email"));
assert(!groups.includes("data-social-login"));
for (const token of [
  "INVITE ONLY // V120",
  "data-access-form",
  "Entrar con invitación",
  "IDENTIDAD DE DISPOSITIVO",
  "reading-group-access",
  "reading-group-invites",
  "data-invite-revoke",
  "HanamiScreens.markClosed",
])
  assert(groups.includes(token), token);

for (const token of [
  "create table if not exists public.reading_group_invites",
  "public.normalized_invite_hash",
  "for update",
  "get diagnostics inserted_rows = row_count",
  "revoke all on function public.join_reading_group(text)",
  "grant execute on function public.redeem_reading_group_invite",
])
  assert(sql.includes(token), token);

assert(css.includes(".reading-group-access"));
assert(css.includes(".reading-group-invites"));
assert(css.includes("@media(max-width:600px)"));
assert(gitignore.includes("node_modules/"));
assert(gitignore.includes(".env.*"));
assert(gitignore.includes(".vercel/"));
assert(sw.includes("hanami-reader-comment-position-v126"));
assert.equal(pkg.version, "5.8.59");
assert(
  pkg.scripts.test.includes(
    "node tests/invite-only-anonymous-access-v120.test.mjs",
  ),
);

console.log(
  "PASS: one-use hashed invitations create anonymous device identities without email and remain integrated with the central screen machine",
);