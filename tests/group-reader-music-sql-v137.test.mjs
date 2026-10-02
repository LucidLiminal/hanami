import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const { PGlite } = await import(process.env.PGLITE_PATH || "@electric-sql/pglite");
const db = new PGlite();
const migration = await readFile(new URL("../supabase/hanami-group-reader-music-v137.sql", import.meta.url), "utf8");
const [owner, member, outsider, muted] = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"];
const group = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherGroup = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const page = (index = 0, room = group) => JSON.stringify([room, "fixture.source", "/fixture/book", "/fixture/chapter/1", index]);
const track = { url: "https://soundcloud.com/fixture/first-track", title: "First Track", artist: "Fixture", artwork: "https://i1.sndcdn.com/artwork-fixture.jpg", duration: 120, soundcloudId: "123456" };
async function as(role, user, operation) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user || ""]);
  try { return await operation(); }
  finally { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub', '', false)"); }
}
async function upsert(id, key = page(), metadata = track, revision = 1, room = group, x = .2) {
  return (await db.query("select (public.upsert_group_reader_music_pin($1::uuid,$2::uuid,$3,$4::float8,$5::float8,$6::jsonb,$7::bigint)).*", [room,id,key,x,.4,JSON.stringify(metadata),revision])).rows[0];
}
async function list(room = group, keys = [page()]) {
  return (await db.query("select * from public.list_group_reader_music_pins($1::uuid,$2::jsonb)", [room,JSON.stringify(keys)])).rows;
}
async function remove(id, revision = 2, room = group) {
  return (await db.query("select (public.delete_group_reader_music_pin($1::uuid,$2::uuid,$3::bigint)).*", [room,id,revision])).rows[0];
}
try {
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    create table public.profiles(id uuid primary key, display_name text);
    create table public.reading_groups(id uuid primary key, owner_id uuid references public.profiles(id));
    create table public.reading_group_members(group_id uuid, user_id uuid, role text, state text, primary key(group_id,user_id));
    create function public.is_group_member(target_group uuid) returns boolean language sql stable security definer set search_path=public as $$
      select exists(select 1 from reading_group_members where group_id=target_group and user_id=auth.uid() and state in ('active','muted'));
    $$;
    create function public.can_post_to_group(target_group uuid) returns boolean language sql stable security definer set search_path=public as $$
      select exists(select 1 from reading_group_members where group_id=target_group and user_id=auth.uid() and state='active');
    $$;
    create function public.can_manage_group(target_group uuid) returns boolean language sql stable security definer set search_path=public as $$
      select exists(select 1 from reading_group_members where group_id=target_group and user_id=auth.uid() and state='active' and role in ('owner','moderator'));
    $$;
  `);
  for (const user of [owner,member,outsider,muted]) await db.query("insert into profiles values($1,'Fixture')", [user]);
  await db.query("insert into reading_groups values($1,$2),($3,$4)", [group,owner,otherGroup,outsider]);
  for (const [room,user,role,state] of [[group,owner,"owner","active"],[group,member,"member","active"],[group,muted,"member","muted"],[otherGroup,outsider,"owner","active"]])
    await db.query("insert into reading_group_members values($1,$2,$3,$4)", [room,user,role,state]);
  await db.exec(migration);
  await db.exec(migration);
  const id = randomUUID();
  const first = await as("authenticated", owner, () => upsert(id, page(), { ...track, author_id: outsider, group_id: otherGroup }));
  assert.equal(first.author_id, owner);
  assert.equal(first.group_id, group);
  assert.equal(first.track.author_id, undefined);
  await as("authenticated", owner, async () => {
    const retry = await upsert(id);
    assert.equal(retry.revision, 1);
    assert.equal(String(retry.updated_at), String(first.updated_at));
    const edit = await upsert(id, page(), { ...track, title: "Edited" }, 2);
    assert.equal(edit.track.title, "Edited");
    assert.equal((await upsert(id)).track.title, "Edited");
    await assert.rejects(() => upsert(randomUUID(), page(), track, 1, group, 2), /Invalid music marker/);
    await assert.rejects(() => upsert(randomUUID(), page(0,otherGroup)), /group scope/);
    await assert.rejects(() => upsert(randomUUID(), JSON.stringify([null,"x","y","z",0])), /group scope/);
    await assert.rejects(() => upsert(randomUUID(), "{}"), /Invalid music page/);
    await assert.rejects(() => upsert(randomUUID(), page(), { ...track,url:"https://soundcloud.com/x/sets" }), /canonical public SoundCloud/);
    await assert.rejects(() => upsert(randomUUID(), page(), { ...track,artwork:"https://evil.test/a.jpg" }), /SoundCloud CDN/);
    await assert.rejects(() => upsert(randomUUID(), page(), { ...track,duration:-1 }), /Invalid track duration/);
    await assert.rejects(() => db.query("select * from group_reader_music_pins"), /permission denied/);
    await assert.rejects(() => list(group,Array(101).fill(page())), /between 1 and 100/);
  });
  await as("authenticated", member, async () => {
    const rows = await list(); assert.equal(rows.length,1); assert.equal(rows[0].x,.2);
    await assert.rejects(() => upsert(id,page(),track,3), /another author/);
    await assert.rejects(() => remove(id,3), /author or group management/);
  });
  await as("authenticated", muted, async () => {
    assert.equal((await list()).length,1);
    await assert.rejects(() => upsert(randomUUID()), /cannot publish/);
  });
  await as("authenticated", outsider, async () => {
    await assert.rejects(() => list(), /not a member/);
    await assert.rejects(() => upsert(randomUUID()), /cannot publish/);
    await assert.rejects(() => upsert(id,page(0,otherGroup),track,3,otherGroup), /another author or page/);
  });
  await as("anon", "", async () => {
    await assert.rejects(() => list(), /permission denied/);
    await assert.rejects(() => upsert(randomUUID()), /permission denied/);
  });
  const memberPin = randomUUID();
  await as("authenticated", member, () => upsert(memberPin));
  await as("authenticated", owner, async () => {
    const deleted = await remove(memberPin);
    assert(deleted.deleted_at);
    assert.equal((await list()).length,1);
  });
  await as("authenticated", member, async () => {
    assert((await upsert(memberPin)).deleted_at, "stale retries cannot revive moderated deletions");
  });
  await db.query("update reading_group_members set state='blocked' where group_id=$1 and user_id=$2",[group,member]);
  await as("authenticated", member, () => assert.rejects(() => list(), /not a member/));
  await as("authenticated", owner, async () => {
    for(let n=0;n<19;n++) await upsert(randomUUID());
    assert.equal((await list()).length,20);
    await assert.rejects(() => upsert(randomUUID()), /20 shared music markers/);
  });
  await db.exec("update group_reader_music_pins set updated_at=now()-interval '2 minutes'");
  await as("authenticated", owner, async () => {
    for(let n=1;n<=60;n++) await upsert(randomUUID(),page(n));
    await assert.rejects(() => upsert(randomUUID(),page(61)), /Too many music marker changes/);
    assert.equal((await list(group,Array.from({length:61},(_,n)=>page(n)))).length,80, "page batches are exhaustive, not silently truncated");
  });
  console.log("PASS: real PostgreSQL v137 private group pins, safe reapply, actor isolation, active/muted/blocked permissions, revision retries, owner moderation, URL/art validation, page caps and exhaustive reads");
} finally { await db.close(); }