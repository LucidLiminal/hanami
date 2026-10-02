-- Hanami v136: public track aggregates, NOT public personal listening histories.
-- Run once in the same Supabase project used by Hanami's social features.
begin;

create table if not exists public.reader_music_tracks (
  url text primary key check (
    url ~ '^https://soundcloud[.]com/[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$'
    and char_length(url) <= 2048
  ),
  title text not null check (char_length(title) between 1 and 200),
  artist text not null check (char_length(artist) between 1 and 160),
  artwork text not null default '' check (char_length(artwork) <= 2048),
  duration double precision not null default 0 check (duration between 0 and 86400),
  created_at timestamptz not null default now()
);
create table if not exists public.reader_music_activity (
  id uuid primary key,
  actor_id uuid not null references auth.users(id) on delete cascade,
  track_url text not null references public.reader_music_tracks(url) on delete cascade,
  kind text not null check (kind in ('play', 'use')),
  created_at timestamptz not null default now()
);
create index if not exists reader_music_activity_ranking
  on public.reader_music_activity(created_at desc, track_url, actor_id);
create index if not exists reader_music_activity_rate
  on public.reader_music_activity(actor_id, track_url, kind, created_at desc);

alter table public.reader_music_tracks enable row level security;
alter table public.reader_music_activity enable row level security;
revoke all on public.reader_music_tracks from anon, authenticated;
revoke all on public.reader_music_activity from anon, authenticated;

create or replace function public.record_reader_music_activity(
  p_event_id uuid,
  p_track jsonb,
  p_kind text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  v_track_url text := p_track ->> 'url';
  inserted_id uuid;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_event_id is null or p_kind not in ('play', 'use') or p_kind is null then
    raise exception 'Invalid music activity' using errcode = '22023';
  end if;
  if v_track_url is null
    or v_track_url !~ '^https://soundcloud[.]com/[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$'
    or char_length(v_track_url) > 2048 then
    raise exception 'Only canonical public SoundCloud track URLs are accepted' using errcode = '22023';
  end if;

  -- Serialize writes by actor to make the rate checks atomic.
  perform pg_advisory_xact_lock(hashtextextended(actor::text, 136));
  if exists (select 1 from public.reader_music_activity where id = p_event_id) then
    return jsonb_build_object('accepted', false, 'duplicate', true);
  end if;
  if (select count(*) from public.reader_music_activity
      where actor_id = actor and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Music activity rate limit reached' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.reader_music_activity
    where actor_id = actor and track_url = v_track_url
      and kind = p_kind and created_at > now() - interval '30 seconds'
  ) then
    return jsonb_build_object('accepted', false, 'rate_limited', true);
  end if;

  insert into public.reader_music_tracks(url, title, artist, artwork, duration)
  values (
    v_track_url,
    left(coalesce(nullif(btrim(p_track ->> 'title'), ''), 'Pista de SoundCloud'), 200),
    left(coalesce(nullif(btrim(p_track ->> 'artist'), ''), 'SoundCloud'), 160),
    case when coalesce(p_track ->> 'artwork', '') ~ '^https://[a-zA-Z0-9-]+[.]sndcdn[.]com/' then left(p_track ->> 'artwork', 2048) else '' end,
    greatest(0, least(86400, coalesce((p_track ->> 'duration')::double precision, 0)))
  ) on conflict (url) do nothing;

  insert into public.reader_music_activity(id, actor_id, track_url, kind)
  values (p_event_id, actor, v_track_url, p_kind)
  on conflict (id) do nothing returning id into inserted_id;
  return jsonb_build_object('accepted', inserted_id is not null);
end;
$$;

create or replace function public.list_reader_music_trends(p_limit integer default 30)
returns table (
  url text, title text, artist text, artwork text, duration double precision,
  plays bigint, uses bigint, listeners bigint, score bigint
)
language sql stable
security definer
set search_path = public, pg_temp
as $$
  select t.url, t.title, t.artist, t.artwork, t.duration,
    count(*) filter (where a.kind = 'play') as plays,
    count(*) filter (where a.kind = 'use') as uses,
    count(distinct a.actor_id) as listeners,
    (count(*) filter (where a.kind = 'play') + 3 * count(*) filter (where a.kind = 'use')) as score
  from public.reader_music_tracks t
  join public.reader_music_activity a on a.track_url = t.url
  where a.created_at >= now() - interval '30 days'
    and (auth.uid() is null or a.actor_id <> auth.uid())
  group by t.url, t.title, t.artist, t.artwork, t.duration
  order by score desc, listeners desc, max(a.created_at) desc, t.url
  limit greatest(1, least(50, coalesce(p_limit, 30)));
$$;

revoke all on function public.record_reader_music_activity(uuid, jsonb, text) from public;
revoke all on function public.list_reader_music_trends(integer) from public;
grant execute on function public.record_reader_music_activity(uuid, jsonb, text) to authenticated;
grant execute on function public.list_reader_music_trends(integer) to anon, authenticated;
notify pgrst, 'reload schema';
commit;