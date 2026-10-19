import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { PGlite } = await import(process.env.PGLITE_PATH || "@electric-sql/pglite");
const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111";
const member = "22222222-2222-4222-8222-222222222222";
const group = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

async function as(user, fn) {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;$$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;

    create table public.reading_groups (
      id uuid primary key,
      name text not null,
      quote text not null,
      cover text,
      invite_code text not null,
      owner_id uuid not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create function public.group_result(target_group uuid)
    returns table (
      id uuid, name text, quote text, cover text, invite_code text, owner_id uuid,
      member_count bigint, members jsonb, created_at timestamptz, updated_at timestamptz
    )
    language sql stable security definer set search_path = public, pg_temp as $$
      select g.id, g.name, g.quote, g.cover, g.invite_code, g.owner_id,
        1::bigint, '[]'::jsonb, g.created_at, g.updated_at
      from public.reading_groups g
      where g.id = target_group;
    $$;
  `);
  await db.query(
    `insert into public.reading_groups(id, name, quote, cover, invite_code, owner_id)
     values ($1, 'Sala original', 'Cita original', 'https://old.example/cover.jpg', 'INVITE', $2)`,
    [group, owner],
  );

  const hotfix = await readFile(
    new URL("../supabase/hanami-group-editor-hotfix-v144.sql", import.meta.url),
    "utf8",
  );
  await db.exec(hotfix);

  await as(owner, async () => {
    const first = await db.query(
      `select * from public.update_reading_group($1::uuid, $2, $3, $4)`,
      [group, "Sala actualizada", "", "https://new.example/cover.webp"],
    );
    assert.equal(first.rows[0].name, "Sala actualizada");
    assert.equal(first.rows[0].quote, "Cita original");
    assert.equal(first.rows[0].cover, "https://new.example/cover.webp");

    const second = await db.query(
      `select * from public.update_reading_group($1::uuid, $2, $3, $4)`,
      [group, "Sala final", "Cita nueva", ""],
    );
    assert.equal(second.rows[0].name, "Sala final");
    assert.equal(second.rows[0].quote, "Cita nueva");
    assert.equal(second.rows[0].cover, "https://new.example/cover.webp");
  });

  await as(member, async () => {
    await assert.rejects(
      () =>
        db.query(`select * from public.update_reading_group($1::uuid, $2, $3, $4)`, [
          group,
          "No autorizado",
          "",
          "",
        ]),
      /Solo la persona propietaria puede editar la sala/,
    );
  });

  console.log(
    "PASS: group editor hotfix updates cover and quote without ambiguity and preserves owner-only access",
  );
} finally {
  await db.close();
}