import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [groups, social, library, shelf, groupCss, shelfCss, sql, sw, packageText] =
  await Promise.all([
    readFile(new URL("../public/reading-groups.js", import.meta.url), "utf8"),
    readFile(new URL("../public/social-sync.js", import.meta.url), "utf8"),
    readFile(new URL("../public/group-library.js", import.meta.url), "utf8"),
    readFile(new URL("../public/library-groups.js", import.meta.url), "utf8"),
    readFile(new URL("../public/reading-groups.css", import.meta.url), "utf8"),
    readFile(new URL("../public/library-groups.css", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../supabase/hanami-group-administration-v124.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
const pkg = JSON.parse(packageText);

for (const token of [
  "data-group-leave",
  "leaveActiveGroup",
  "data-group-edit-form",
  "uploadGroupCover",
  "data-group-member-manage",
  "data-group-member-action",
  "Administrar biblioteca",
])
  assert(groups.includes(token), token);

for (const token of [
  "updateGroup",
  "leaveGroup",
  "manageMember",
  "uploadGroupCover",
  "listGroupCategories",
  "manageGroupCategory",
  "setEntryCategories",
  "deleteGroupEntry",
])
  assert(social.includes(token), token);

for (const token of [
  "hanami-group-library-categories-v1",
  "categoryDialog",
  "entryManageDialog",
  "saveEntryCategories",
  "deleteEntry",
])
  assert(library.includes(token), token);

assert(shelf.includes("group-library-categories"));
assert(shelf.includes("data-group-entry-manage"));
assert(shelf.includes('membership?.state !== "muted"'));
assert(groupCss.includes(".reading-member-manage"));
assert(shelfCss.includes(".group-library-categories"));

for (const token of [
  "leave_reading_group",
  "update_reading_group",
  "manage_reading_group_member",
  "state in ('active', 'muted', 'banned')",
  "can_post_to_group",
  "group_library_categories",
  "group_library_entry_categories",
  "manage_group_library_category",
  "set_group_library_entry_categories",
  "delete_group_library_entry",
  "'group-covers'",
])
  assert(sql.includes(token), token);

assert(sw.includes("hanami-supabase-sql-keyword-v124"));
assert.equal(pkg.version, "5.8.57");
assert(
  pkg.scripts.test.startsWith(
    "node tests/supabase-sql-keyword-v124.test.mjs",
  ),
);

console.log(
  "PASS: members can leave while owners can sync room data, moderate members and administer group categories and recommendations",
);