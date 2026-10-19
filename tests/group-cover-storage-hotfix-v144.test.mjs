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

async function as(user, fn, role = "authenticated") {
  assert(["authenticated", "anon"].includes(role));
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
    user || "",
  ]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

const isRlsDenial = (error) =>
  error.code === "42501" && /row-level security policy/.test(error.message);
const upsert = (path = `${group}/cover.jpg`, bucket = "group-covers", revision = 1) =>
  db.query(
    `insert into storage.objects(bucket_id, name, owner_id, metadata)
     values ($1, $2, auth.uid()::text, $3::jsonb)
     on conflict(bucket_id, name) do update
       set owner_id = excluded.owner_id, metadata = excluded.metadata
     returning bucket_id, name, owner_id, metadata`,
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

    -- Keep the real name column: omitting it concealed the original scope bug.
    create table public.reading_groups(
      id uuid primary key,
      name text not null,
      owner_id uuid not null
    );
    create table public.reading_group_members(
      group_id uuid references public.reading_groups(id),
      user_id uuid,
      role text not null default 'member',
      state text not null default 'active',
      primary key(group_id, user_id)
    );
    create table storage.objects(
      bucket_id text not null,
      name text not null,
      owner_id text,
      metadata jsonb not null default '{}'::jsonb,
      primary key(bucket_id, name)
    );
    insert into public.reading_groups values
      ('${group}', 'Club de lectura', '${owner}'),
      ('${otherGroup}', 'Otro grupo', '${otherOwner}');
    insert into public.reading_group_members(group_id, user_id, role) values
      ('${group}', '${owner}', 'owner'),
      ('${group}', '${member}', 'member'),
      ('${group}', '${moderator}', 'moderator'),
      ('${otherGroup}', '${otherOwner}', 'owner');
    insert into storage.objects(bucket_id, name, owner_id)
      values ('group-covers', '${otherGroup}/cover.jpg', '${otherOwner}');
    alter table storage.objects enable row level security;
    alter table public.reading_groups enable row level security;
    alter table public.reading_group_members enable row level security;
    grant select, insert, update on storage.objects to authenticated, anon;
    grant select on public.reading_groups, public.reading_group_members to authenticated, anon;
    create policy "unrelated storage policy" on storage.objects for select
      using (bucket_id = 'unrelated-bucket' and owner_id = auth.uid()::text);
  `);

  // Use the shipped membership function and actual nested group/member RLS.
  const paritySql = await readFile(
    new URL("../supabase/hanami-library-parity-v125.sql", import.meta.url),
    "utf8",
  );
  const membershipFunction = paritySql.match(
    /create or replace function public\.is_group_member\(target_group uuid\)[\s\S]*?\$\$;/,
  )?.[0];
  assert(membershipFunction, "Missing shipped membership function");
  await db.exec(membershipFunction);
  await db.exec(`
    create policy "groups visible to members" on public.reading_groups
      for select using (public.is_group_member(id));
    create policy "members visible inside group" on public.reading_group_members
      for select using (public.is_group_member(group_id));
  `);

  const hotfix = await readFile(
    new URL("../supabase/hanami-group-cover-storage-hotfix-v144-r2.sql", import.meta.url),
    "utf8",
  );
  const correctedCheck = `select 1 from public.reading_groups as cover_group
      where cover_group.id::text = (storage.foldername(storage.objects.name))[1]
        and cover_group.owner_id = auth.uid()`;
  const legacyCheck = `select 1 from public.reading_groups
      where id = (storage.foldername(name))[1]::uuid
        and owner_id = auth.uid()`;
  assert.equal(hotfix.split(correctedCheck).length - 1, 4);
  assert.equal(
    await readFile(new URL("../supabase/hanami-group-cover-storage-hotfix-v144.sql", import.meta.url), "utf8"),
    hotfix,
    "The original hotfix path must also contain the corrected policies",
  );

  // Demonstrate the exact failure despite SELECT/INSERT/UPDATE all being present.
  await db.exec(hotfix.replaceAll(correctedCheck, legacyCheck));
  await as(owner, async () => {
    assert.equal((await db.query("select id from public.reading_groups")).rows.length, 1);
    await assert.rejects(upsert, isRlsDenial);
  });

  await db.exec(hotfix);
  await db.exec(hotfix); // Must be safely repeatable.
  await as(owner, async () => {
    const first = await upsert();
    assert.equal(first.rows[0].owner_id, owner);
    const second = await upsert(`${group}/cover.jpg`, "group-covers", 2);
    assert.equal(second.rows[0].name, `${group}/cover.jpg`);
    assert.equal(second.rows[0].metadata.revision, 2);
    await upsert(`${group}/cover.png`);
    assert.equal(
      (await db.query("select name from storage.objects where bucket_id = 'group-covers'")).rows.length,
      2,
    );
  });

  for (const user of [stranger, member, moderator]) {
    await as(user, async () => {
      await assert.rejects(() => upsert(`${group}/intruder.jpg`), isRlsDenial);
      await assert.rejects(upsert, isRlsDenial);
      assert.equal(
        (await db.query("select name from storage.objects where bucket_id = 'group-covers'")).rows.length,
        0,
      );
      assert.equal(
        (await db.query("update storage.objects set metadata = '{}'::jsonb returning name")).rows.length,
        0,
      );
    });
  }
  await as(null, async () => {
    await assert.rejects(upsert, isRlsDenial);
    assert.equal((await db.query("select name from storage.objects")).rows.length, 0);
  }, "anon");

  // Neither a human group name nor a path-like one may affect authorization.
  for (const name of ["Renombrado / con separadores", `${group}/fake.jpg`]) {
    await db.query("update public.reading_groups set name = $1 where id = $2", [name, group]);
    await as(owner, async () => {
      await upsert(`${group}/cover.webp`);
      for (const path of [
        `${otherGroup}/cover.jpg`,
        "cccccccc-cccc-4ccc-8ccc-cccccccccccc/cover.jpg",
        "no-es-un-uuid/cover.jpg",
        "cover.jpg",
      ]) {
        await assert.rejects(() => upsert(path), isRlsDenial);
      }
      await assert.rejects(() => upsert(`${group}/cover.jpg`, "comment-media"), isRlsDenial);
      await assert.rejects(
        () => db.query(
          "update storage.objects set name = $1 where bucket_id = 'group-covers' and name = $2 returning name",
          [`${otherGroup}/moved.jpg`, `${group}/cover.jpg`],
        ),
        isRlsDenial,
      );
    });
  }
  await as(otherOwner, async () => {
    const result = await upsert(`${otherGroup}/cover.jpg`, "group-covers", 3);
    assert.equal(result.rows[0].owner_id, otherOwner);
    assert.equal(
      (await db.query("select name from storage.objects where bucket_id = 'group-covers'")).rows.length,
      1,
    );
  });
  await as(owner, async () => {
    const result = await db.query(
      "select metadata from storage.objects where bucket_id = 'group-covers' and name = $1",
      [`${group}/cover.jpg`],
    );
    assert.equal(result.rows[0].metadata.revision, 2, "Denied attempts must not change the image");
  });

  assert.equal(
    (await db.query("select policyname from pg_policies where policyname = 'unrelated storage policy'")).rows.length,
    1,
    "Do not remove unrelated Storage policies",
  );
  for (const filename of [
    "hanami-group-administration-v123.sql",
    "hanami-group-administration-v124.sql",
    "hanami-library-parity-v125.sql",
  ]) {
    const sql = await readFile(new URL(`../supabase/${filename}`, import.meta.url), "utf8");
    assert.equal(sql.split(correctedCheck).length - 1, 4, `${filename}: qualify every cover policy`);
  }
  console.log(
    "PASS: reproduced legacy name-shadowing RLS error; R2 permits owner insert/upsert with real group/member RLS",
  );
  console.log(
    "PASS: rejects member, moderator, stranger, anonymous user, other-group writes, malformed paths and cross-group moves",
  );
  console.log(
    "PASS: group renaming does not affect permissions; denied writes preserve images; policies are idempotent and unrelated policies remain",
  );
} finally {
  await db.close();
}