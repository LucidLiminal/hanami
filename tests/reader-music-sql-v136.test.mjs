import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

// Optional QA-only dependency. It is not needed by the Vercel application.
const { PGlite } = await import(process.env.PGLITE_PATH || "@electric-sql/pglite");
const db = new PGlite();
const migration = await readFile(new URL("../supabase/hanami-reader-music-v136.sql", import.meta.url), "utf8");
const users = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];
const track = {
  url: "https://soundcloud.com/fixture/crimson-reader",
  title: "Crimson Reader", artist: "Hanami", duration: 185,
  artwork: "https://i1.sndcdn.com/artworks-fixture.jpg",
};
async function asRole(role, userId, operation) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId || ""]);
  try { return await operation(); }
  finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}
async function record(eventId, metadata, kind) {
  const result = await db.query(
    "select public.record_reader_music_activity($1::uuid, $2::jsonb, $3::text) as result",
    [eventId, JSON.stringify(metadata), kind],
  );
  return result.rows[0].result;
}
async function trends(limit = 30) {
  return (await db.query("select * from public.list_reader_music_trends($1)", [limit])).rows;
}
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  for (const user of users) await db.query("insert into auth.users(id) values ($1)", [user]);
  await db.exec(migration);
  await db.exec(migration); // Safe to reapply during deployment.

  const event1 = randomUUID();
  await asRole("authenticated", users[0], async () => {
    assert.equal((await record(event1, { ...track, actor_id: users[1] }, "play")).accepted, true);
    assert.equal((await record(event1, track, "play")).duplicate, true);
    assert.equal((await record(randomUUID(), track, "play")).rate_limited, true);
    assert.equal((await trends()).length, 0, "one's own activity is not an 'other users' trend");
    await assert.rejects(() => record(randomUUID(), { ...track, url: "https://example.com/track" }, "use"), /canonical public SoundCloud/);
    await assert.rejects(() => db.query("select * from public.reader_music_activity"), /permission denied/);
    await assert.rejects(() => db.query("insert into public.reader_music_tracks(url,title,artist) values ('https://soundcloud.com/x/y','x','y')"), /permission denied/);
  });
  const row = (await db.query("select actor_id from public.reader_music_activity where id = $1", [event1])).rows[0];
  assert.equal(row.actor_id, users[0], "the actor must come from auth.uid(), never from client JSON");

  const oldEvent = randomUUID();
  await asRole("authenticated", users[1], async () => {
    assert.equal((await record(randomUUID(), track, "play")).accepted, true);
    assert.equal((await record(randomUUID(), track, "use")).accepted, true);
    assert.equal((await record(oldEvent, {
      ...track, url: "https://soundcloud.com/fixture/second-reader", title: "Second Reader",
      artwork: "https://tracking.example.invalid/image.jpg",
    }, "play")).accepted, true);
  });
  await asRole("authenticated", users[0], async () => {
    const rows = await trends();
    assert.equal(rows.length, 2);
    assert.equal(rows[0].url, track.url);
    assert.equal(Number(rows[0].plays), 1);
    assert.equal(Number(rows[0].uses), 1);
    assert.equal(Number(rows[0].listeners), 1);
    assert.equal(Number(rows[0].score), 4);
    assert.equal(rows[1].artwork, "", "community artwork must use SoundCloud's CDN");
    assert(!("actor_id" in rows[0]));
    assert.equal((await trends(-9)).length, 1, "bound the requested result count");
  });
  await asRole("anon", "", async () => {
    const rows = await trends();
    assert.equal(Number(rows[0].listeners), 2);
    assert.equal(Number(rows[0].plays), 2);
    await assert.rejects(() => db.query("select * from public.reader_music_activity"), /permission denied/);
    await assert.rejects(() => record(randomUUID(), track, "play"), /permission denied/);
  });
  await asRole("authenticated", "", async () => {
    await assert.rejects(() => record(randomUUID(), track, "play"), /Authentication required/);
  });
  await db.query("update public.reader_music_activity set created_at = now() - interval '31 days' where id = $1", [oldEvent]);
  await asRole("authenticated", users[0], async () => {
    assert.equal((await trends()).length, 1, "exclude activity older than the ranking window");
  });
  await asRole("authenticated", users[2], async () => {
    for (let i = 0; i < 30; i++) {
      assert.equal((await record(randomUUID(), {
        ...track, url: `https://soundcloud.com/fixture/rate-${i}`,
      }, "play")).accepted, true);
    }
    await assert.rejects(() => record(randomUUID(), {
      ...track, url: "https://soundcloud.com/fixture/over-limit",
    }, "play"), /rate limit reached/);
  });
  console.log("PASS: real PostgreSQL v136 migration, safe reapply, authenticated writes, RLS, no actor spoofing, UUID idempotency, rate limits, 30-day ranking, other-user filtering and aggregate-only reads");
} finally {
  await db.close();
}