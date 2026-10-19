import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { PGlite } = await import(process.env.PGLITE_PATH || "@electric-sql/pglite");
const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111";
const stranger = "22222222-2222-4222-8222-222222222222";
const member = "33333333-3333-4333-8333-333333333333";
const moderator = "44444444-4444-4444-8444-444444444444";
const otherOwner = "55555555-5555-4555-8555-555555555555";
const group = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherGroup = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const canonical = `${group}/cover.webp`;
const isRlsDenial = (error) =>
  error.code === "42501" && /row-level security policy/.test(error.message);

async function as(user, fn, role = "authenticated") {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user || ""]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}
const upsert = (path = canonical, revision = 1, bucket = "group-covers") =>
  db.query(
    `insert into storage.objects(bucket_id, name, owner_id, metadata)
     values ($1, $2, auth.uid()::text, $3::jsonb)
     on conflict (bucket_id, name) do update
       set owner_id = excluded.owner_id, metadata = excluded.metadata
     returning name, owner_id, metadata`,
    [bucket, path, JSON.stringify({ revision })],
  );

try {
  await db.exec(`
    create role authenticated;
    create role anon;
    create schema auth;
    create schema storage;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;$$;
    create function storage.foldername(value text) returns text[] language sql immutable as
      $$select (string_to_array(value, '/'))[1:array_length(string_to_array(value, '/'), 1) - 1];$$;
    grant usage on schema auth, storage to authenticated, anon;
    grant execute on function auth.uid(), storage.foldername(text) to authenticated, anon;
    create table public.reading_groups(id uuid primary key, name text not null, owner_id uuid not null);
    create table public.reading_group_members(
      group_id uuid, user_id uuid, role text not null default 'member',
      state text not null default 'active', primary key(group_id, user_id)
    );
    create table storage.buckets(
      id text primary key, name text not null, public boolean not null,
      file_size_limit bigint, allowed_mime_types text[]
    );
    create table storage.objects(
      bucket_id text not null, name text not null, owner_id text,
      metadata jsonb not null default '{}'::jsonb, primary key(bucket_id, name)
    );
    insert into public.reading_groups values
      ('${group}', 'Club de lectura', '${owner}'),
      ('${otherGroup}', 'Otro grupo', '${otherOwner}');
    insert into public.reading_group_members(group_id, user_id, role) values
      ('${group}', '${owner}', 'owner'),
      ('${group}', '${member}', 'member'),
      ('${group}', '${moderator}', 'moderator'),
      ('${otherGroup}', '${otherOwner}', 'owner');
    insert into storage.buckets values
      ('group-covers', 'group-covers', true, 4194304, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
      ('comment-media', 'comment-media', false, 8388608, array['image/jpeg']);
    insert into storage.objects(bucket_id, name, owner_id) values
      ('group-covers', '${group}/cover.jpg', '${owner}'),
      ('group-covers', '${group}/cover.jpeg', '${owner}'),
      ('group-covers', '${group}/cover.png', '${owner}'),
      ('group-covers', '${group}/cover.gif', '${owner}'),
      ('group-covers', '${group}/old/cover.png', '${owner}'),
      ('group-covers', '${otherGroup}/cover.jpg', '${otherOwner}');
    alter table public.reading_groups enable row level security;
    alter table public.reading_group_members enable row level security;
    alter table storage.objects enable row level security;
    grant select on public.reading_groups, public.reading_group_members to authenticated, anon;
    grant select, insert, update, delete on storage.objects to authenticated, anon;
    create policy "legacy overly permissive storage" on storage.objects
      for all to public using (true) with check (true);
  `);
  const parity = await readFile(
    new URL("../supabase/hanami-library-parity-v125.sql", import.meta.url), "utf8",
  );
  const memberFunction = parity.match(
    /create or replace function public\.is_group_member\(target_group uuid\)[\s\S]*?\$\$;/,
  )?.[0];
  assert(memberFunction);
  await db.exec(memberFunction);
  await db.exec(`
    create policy "groups visible to members" on public.reading_groups
      for select using (public.is_group_member(id));
    create policy "members visible inside group" on public.reading_group_members
      for select using (public.is_group_member(group_id));
  `);

  const sql = await readFile(
    new URL("../supabase/hanami-group-cover-storage-v145.sql", import.meta.url), "utf8",
  );
  await db.exec(sql);
  await db.exec(sql);
  assert.equal((await db.query("select * from storage.objects")).rows.length, 6,
    "Migration must not delete existing metadata/files");
  const bucket = (await db.query("select * from storage.buckets where id = 'group-covers'")).rows[0];
  assert.equal(Number(bucket.file_size_limit), 1048576);
  assert.deepEqual(bucket.allowed_mime_types, ["image/webp"]);
  assert.equal(bucket.public, true);
  const unrelated = (await db.query("select * from storage.buckets where id = 'comment-media'")).rows[0];
  assert.equal(Number(unrelated.file_size_limit), 8388608);
  assert.deepEqual(unrelated.allowed_mime_types, ["image/jpeg"]);

  await as(owner, async () => {
    assert.equal((await upsert()).rows[0].owner_id, owner);
    assert.equal((await upsert(canonical, 2)).rows[0].metadata.revision, 2);
    assert.equal(
      (await db.query("select name from storage.objects where bucket_id = 'group-covers'")).rows.length,
      6, "Owner can list canonical and legacy objects for cleanup, but not another group",
    );
    for (const path of [
      `${group}/cover.jpg`, `${group}/cover.png`, `${group}/other.webp`,
      `${group}/nested/cover.webp`, `${group}//cover.webp`, `${group}/../cover.webp`,
      `${group.toUpperCase()}/cover.webp`, `${otherGroup}/cover.webp`,
      "no-es-un-uuid/cover.webp", "cover.webp",
    ]) await assert.rejects(() => upsert(path), isRlsDenial);
    await assert.rejects(
      () => db.query(
        "update storage.objects set name = $1 where bucket_id = 'group-covers' and name = $2 returning name",
        [`${group}/extra.webp`, canonical],
      ), isRlsDenial,
    );
    assert.equal(
      (await db.query(
        "update storage.objects set metadata = '{}'::jsonb where bucket_id = 'group-covers' and name = $1 returning name",
        [`${group}/cover.jpg`],
      )).rows.length, 0, "Cannot update a legacy file in place",
    );
  });

  for (const user of [stranger, member, moderator, otherOwner]) {
    await as(user, async () => {
      await assert.rejects(upsert, isRlsDenial);
      assert.equal((await db.query(
        "select * from storage.objects where bucket_id = 'group-covers' and name = $1", [canonical],
      )).rows.length, 0);
      assert.equal((await db.query(
        "update storage.objects set metadata = '{}'::jsonb where bucket_id = 'group-covers' and name = $1 returning name",
        [canonical],
      )).rows.length, 0);
      assert.equal((await db.query(
        "delete from storage.objects where bucket_id = 'group-covers' and name = $1 returning name",
        [canonical],
      )).rows.length, 0);
    });
  }
  await as(null, async () => {
    await assert.rejects(upsert, isRlsDenial);
    assert.equal((await db.query("select * from storage.objects where bucket_id = 'group-covers'")).rows.length, 0);
    assert.equal((await db.query("delete from storage.objects where bucket_id = 'group-covers' returning name")).rows.length, 0);
  }, "anon");

  await db.query("update public.reading_groups set name = $1 where id = $2", [`${group}/fake.webp`, group]);
  await as(owner, async () => {
    assert.equal((await upsert(canonical, 3)).rows[0].metadata.revision, 3);
    // SQL here models policy checks only. Production deletion uses Storage API.
    const removed = await db.query(
      "delete from storage.objects where bucket_id = 'group-covers' and name <> $1 returning name",
      [canonical],
    );
    assert.equal(removed.rows.length, 5);
    assert.equal((await db.query("select * from storage.objects where bucket_id = 'group-covers'")).rows.length, 1);
    await upsert("unrelated-object", 1, "comment-media");
  });
  await as(otherOwner, async () => {
    await upsert(`${otherGroup}/cover.webp`);
    assert.equal((await db.query("select * from storage.objects where bucket_id = 'group-covers'")).rows.length, 2);
  });
  const policies = await db.query("select policyname from pg_policies where schemaname = 'storage'");
  assert(policies.rows.some((row) => row.policyname === "legacy overly permissive storage"));
  assert.equal(policies.rows.filter((row) => row.policyname.startsWith("group covers ")).length, 8);
  console.log("PASS: v145 bucket configured for 1 MiB/WebP; canonical owner upsert and legacy delete; repeated migration preserves files");
  console.log("PASS: real group/member RLS plus restrictive guards block extra filenames, members, moderators, strangers and anonymous clients");
  console.log("PASS: renamed groups, other buckets and unrelated policies remain correct; Storage API byte enforcement needs production verification");
} finally {
  await db.close();
}