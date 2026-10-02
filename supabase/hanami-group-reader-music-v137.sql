-- Hanami v137: private, member-authorized soundtrack markers.
-- Requires the existing v117 social schema and v124 group authorization helpers.
begin;
do $$
begin
  if to_regprocedure('public.is_group_member(uuid)') is null
     or to_regprocedure('public.can_post_to_group(uuid)') is null then
    raise exception 'Apply the Hanami v117 and v124 group migrations first.';
  end if;
end $$;

create table if not exists public.group_reader_music_pins (
  id uuid primary key,
  group_id uuid not null references public.reading_groups(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  page_key text not null,
  x double precision not null check (x between 0 and 1),
  y double precision not null check (y between 0 and 1),
  track jsonb not null,
  revision bigint not null default 1 check (revision between 1 and 2147483647),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists group_reader_music_pins_page
  on public.group_reader_music_pins(group_id, page_key) where deleted_at is null;
create index if not exists group_reader_music_pins_author_activity
  on public.group_reader_music_pins(author_id, updated_at);
alter table public.group_reader_music_pins enable row level security;
revoke all on public.group_reader_music_pins from public, anon, authenticated;

create or replace function public.normalize_group_music_page(p_group uuid, p_page_key text)
returns text language plpgsql immutable set search_path = public, pg_temp as $$
declare v_page jsonb;
begin
  if p_page_key is null or char_length(p_page_key) > 8192 then
    raise exception 'Invalid music page key' using errcode = '22023';
  end if;
  begin v_page := p_page_key::jsonb;
  exception when others then raise exception 'Invalid music page key' using errcode = '22023';
  end;
  if jsonb_typeof(v_page) is distinct from 'array' then
    raise exception 'Invalid music page key' using errcode = '22023';
  end if;
  if jsonb_array_length(v_page) <> 5
     or jsonb_typeof(v_page->0) <> 'string' or coalesce(v_page->>0, '') <> p_group::text
     or jsonb_typeof(v_page->1) <> 'string' or char_length(v_page->>1) > 160
     or jsonb_typeof(v_page->2) <> 'string' or char_length(v_page->>2) not between 1 and 2048
     or jsonb_typeof(v_page->3) <> 'string' or char_length(v_page->>3) not between 1 and 2048
     or jsonb_typeof(v_page->4) <> 'number' or (v_page->>4) !~ '^(0|[1-9][0-9]{0,5})$' then
    raise exception 'Invalid music page key or group scope' using errcode = '22023';
  end if;
  return v_page::text;
end $$;
revoke all on function public.normalize_group_music_page(uuid, text) from public, anon, authenticated;

create or replace function public.upsert_group_reader_music_pin(
  p_group uuid, p_pin_id uuid, p_page_key text, p_x double precision,
  p_y double precision, p_track jsonb, p_revision bigint
)
returns public.group_reader_music_pins
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_page text;
  v_url text;
  v_art text;
  v_duration numeric;
  v_track jsonb;
  v_existing public.group_reader_music_pins;
  v_result public.group_reader_music_pins;
begin
  if v_actor is null or not public.can_post_to_group(p_group) then
    raise exception 'You cannot publish music in this reading group' using errcode = '42501';
  end if;
  if p_pin_id is null or p_revision is null or p_revision not between 1 and 2147483647
     or p_x is null or p_y is null or not (p_x between 0 and 1) or not (p_y between 0 and 1)
     or jsonb_typeof(p_track) <> 'object' then
    raise exception 'Invalid music marker' using errcode = '22023';
  end if;
  v_page := public.normalize_group_music_page(p_group, p_page_key);
  v_url := btrim(coalesce(p_track->>'url', ''));
  if v_url !~ '^https://soundcloud[.]com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'
     or split_part(v_url, '/', 5) in ('sets', 'likes', 'tracks', 'albums', 'reposts') then
    raise exception 'Only canonical public SoundCloud track URLs can be shared' using errcode = '22023';
  end if;
  v_art := coalesce(p_track->>'artwork', '');
  if v_art <> '' and (char_length(v_art) > 2048 or v_art !~ '^https://i[0-9]*[.]sndcdn[.]com/') then
    raise exception 'Artwork must use the SoundCloud CDN' using errcode = '22023';
  end if;
  if p_track ? 'duration' and jsonb_typeof(p_track->'duration') <> 'number' then
    raise exception 'Invalid track duration' using errcode = '22023';
  end if;
  v_duration := coalesce((p_track->>'duration')::numeric, 0);
  if v_duration not between 0 and 86400 then
    raise exception 'Invalid track duration' using errcode = '22023';
  end if;
  v_track := jsonb_build_object(
    'url', v_url, 'permalinkUrl', v_url, 'provider', 'soundcloud',
    'title', left(coalesce(nullif(btrim(p_track->>'title'), ''), 'Pista de SoundCloud'), 200),
    'artist', left(coalesce(nullif(btrim(p_track->>'artist'), ''), 'SoundCloud'), 160),
    'artwork', v_art, 'duration', v_duration,
    'soundcloudId', case when coalesce(p_track->>'soundcloudId', '') ~ '^[0-9]{1,20}$' then p_track->>'soundcloudId' else '' end
  );
  perform pg_advisory_xact_lock(hashtextextended('hanami-music-actor:' || v_actor::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('hanami-music-page:' || p_group::text || v_page, 0));
  select * into v_existing from public.group_reader_music_pins where id = p_pin_id for update;
  if found then
    if v_existing.author_id <> v_actor or v_existing.group_id <> p_group or v_existing.page_key <> v_page then
      raise exception 'This music marker belongs to another author or page' using errcode = '42501';
    end if;
    -- Retried/old revisions cannot overwrite a newer edit or revive a deleted pin.
    if p_revision <= v_existing.revision then return v_existing; end if;
  end if;
  if v_existing.id is null or v_existing.deleted_at is not null then
    if (select count(*) from public.group_reader_music_pins
        where group_id = p_group and page_key = v_page and deleted_at is null) >= 20 then
      raise exception 'This page already has 20 shared music markers' using errcode = '54000';
    end if;
  end if;
  if (select count(*) from public.group_reader_music_pins
      where author_id = v_actor and id <> p_pin_id and updated_at > now() - interval '1 minute') >= 60 then
    raise exception 'Too many music marker changes. Try again later.' using errcode = '54000';
  end if;
  insert into public.group_reader_music_pins(id, group_id, author_id, page_key, x, y, track, revision)
  values(p_pin_id, p_group, v_actor, v_page, p_x, p_y, v_track, p_revision)
  on conflict (id) do update set
    x = excluded.x, y = excluded.y, track = excluded.track,
    revision = excluded.revision, updated_at = now(), deleted_at = null
  returning * into v_result;
  return v_result;
end $$;

create or replace function public.list_group_reader_music_pins(p_group uuid, p_page_keys jsonb)
returns setof public.group_reader_music_pins
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_pages text[]; v_key jsonb;
begin
  if auth.uid() is null or not public.is_group_member(p_group) then
    raise exception 'You are not a member of this reading group' using errcode = '42501';
  end if;
  if jsonb_typeof(p_page_keys) is distinct from 'array' then
    raise exception 'Request between 1 and 100 music pages' using errcode = '22023';
  end if;
  if jsonb_array_length(p_page_keys) not between 1 and 100 then
    raise exception 'Request between 1 and 100 music pages' using errcode = '22023';
  end if;
  v_pages := array[]::text[];
  for v_key in select value from jsonb_array_elements(p_page_keys) loop
    if jsonb_typeof(v_key) <> 'string' then raise exception 'Invalid music page' using errcode = '22023'; end if;
    v_pages := array_append(v_pages, public.normalize_group_music_page(p_group, v_key #>> '{}'));
  end loop;
  -- No hidden limit: each requested page is bounded to 20 active pins on writes.
  return query select * from public.group_reader_music_pins
    where group_id = p_group and page_key = any(v_pages) and deleted_at is null
    order by page_key, y, x, id;
end $$;

create or replace function public.delete_group_reader_music_pin(p_group uuid, p_pin_id uuid, p_revision bigint)
returns public.group_reader_music_pins
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_pin public.group_reader_music_pins;
begin
  if auth.uid() is null or not public.can_post_to_group(p_group) then
    raise exception 'You cannot change music in this reading group' using errcode = '42501';
  end if;
  select * into v_pin from public.group_reader_music_pins where id = p_pin_id and group_id = p_group for update;
  if not found then return null; end if;
  if v_pin.author_id <> auth.uid() and not public.can_manage_group(p_group) then
    raise exception 'Only the author or group management may delete this music marker' using errcode = '42501';
  end if;
  if v_pin.deleted_at is not null then return v_pin; end if;
  if p_revision is null or p_revision not between 1 and 2147483647 then
    raise exception 'Invalid marker revision' using errcode = '22023';
  end if;
  if p_revision < v_pin.revision then return v_pin; end if;
  update public.group_reader_music_pins set deleted_at = now(), updated_at = now(),
    revision = least(2147483647, greatest(revision + 1, p_revision))
    where id = v_pin.id returning * into v_pin;
  return v_pin;
end $$;
revoke all on function public.upsert_group_reader_music_pin(uuid, uuid, text, double precision, double precision, jsonb, bigint) from public, anon;
revoke all on function public.list_group_reader_music_pins(uuid, jsonb) from public, anon;
revoke all on function public.delete_group_reader_music_pin(uuid, uuid, bigint) from public, anon;
grant execute on function public.upsert_group_reader_music_pin(uuid, uuid, text, double precision, double precision, jsonb, bigint) to authenticated;
grant execute on function public.list_group_reader_music_pins(uuid, jsonb) to authenticated;
grant execute on function public.delete_group_reader_music_pin(uuid, uuid, bigint) to authenticated;
notify pgrst, 'reload schema';
commit;