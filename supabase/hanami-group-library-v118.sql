-- Hanami v118 · biblioteca independiente del grupo y progreso por miembro

create table if not exists public.group_library_entries (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.reading_groups(id) on delete cascade,
  source_id text not null,
  manga_url text not null,
  title text not null check (char_length(title) between 1 and 240),
  thumbnail_url text,
  genre text[] not null default '{}',
  status text,
  description text,
  recommended_by uuid not null references public.profiles(id) on delete cascade,
  recommendation text not null default '' check (char_length(recommendation) <= 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(group_id, source_id, manga_url)
);

create table if not exists public.group_reading_progress (
  group_id uuid not null references public.reading_groups(id) on delete cascade,
  entry_id uuid not null references public.group_library_entries(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  chapter_url text,
  chapter_number text,
  chapter_name text,
  page_index integer not null default 0 check (page_index >= 0),
  page_count integer not null default 0 check (page_count >= 0),
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(group_id, entry_id, user_id)
);

create index if not exists group_library_entries_group_created
  on public.group_library_entries(group_id, created_at desc);
create index if not exists group_reading_progress_entry_updated
  on public.group_reading_progress(entry_id, updated_at desc);

alter table public.group_library_entries enable row level security;
alter table public.group_reading_progress enable row level security;

drop policy if exists "group library visible to members" on public.group_library_entries;
drop policy if exists "members recommend manga" on public.group_library_entries;
drop policy if exists "recommender or owner updates manga" on public.group_library_entries;
drop policy if exists "recommender or owner removes manga" on public.group_library_entries;
drop policy if exists "group progress visible to members" on public.group_reading_progress;
drop policy if exists "members create own progress" on public.group_reading_progress;
drop policy if exists "members update own progress" on public.group_reading_progress;

create policy "group library visible to members" on public.group_library_entries
  for select using (public.is_group_member(group_id));
create policy "members recommend manga" on public.group_library_entries
  for insert with check (
    public.is_group_member(group_id) and recommended_by = auth.uid()
  );
create policy "recommender or owner updates manga" on public.group_library_entries
  for update using (
    recommended_by = auth.uid() or exists (
      select 1 from public.reading_groups
      where id = group_library_entries.group_id and owner_id = auth.uid()
    )
  ) with check (public.is_group_member(group_id));
create policy "recommender or owner removes manga" on public.group_library_entries
  for delete using (
    recommended_by = auth.uid() or exists (
      select 1 from public.reading_groups
      where id = group_library_entries.group_id and owner_id = auth.uid()
    )
  );
create policy "group progress visible to members" on public.group_reading_progress
  for select using (public.is_group_member(group_id));
create policy "members create own progress" on public.group_reading_progress
  for insert with check (
    public.is_group_member(group_id) and user_id = auth.uid()
  );
create policy "members update own progress" on public.group_reading_progress
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_group_member(group_id));

create or replace function public.list_group_library(target_group uuid)
returns table (
  id uuid,
  group_id uuid,
  source_id text,
  manga_url text,
  title text,
  thumbnail_url text,
  genre text[],
  status text,
  description text,
  recommended_by uuid,
  recommended_by_name text,
  recommendation text,
  progress jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer set search_path = public
as $$
  select
    entry.id,
    entry.group_id,
    entry.source_id,
    entry.manga_url,
    entry.title,
    entry.thumbnail_url,
    entry.genre,
    entry.status,
    entry.description,
    entry.recommended_by,
    recommender.display_name,
    entry.recommendation,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'userId', progress.user_id,
          'userName', member.display_name,
          'initials', upper(left(member.display_name, 2)),
          'chapterUrl', progress.chapter_url,
          'chapterNumber', progress.chapter_number,
          'chapterName', progress.chapter_name,
          'pageIndex', progress.page_index,
          'pageCount', progress.page_count,
          'completed', progress.completed,
          'updatedAt', extract(epoch from progress.updated_at) * 1000
        )
        order by progress.updated_at desc
      ) filter (where progress.user_id is not null),
      '[]'::jsonb
    ),
    entry.created_at,
    entry.updated_at
  from public.group_library_entries entry
  join public.profiles recommender on recommender.id = entry.recommended_by
  left join public.group_reading_progress progress on progress.entry_id = entry.id
  left join public.profiles member on member.id = progress.user_id
  where entry.group_id = target_group
    and public.is_group_member(target_group)
  group by entry.id, recommender.display_name
  order by entry.created_at desc;
$$;

create or replace function public.recommend_group_manga(
  target_group uuid,
  target_source_id text,
  target_manga_url text,
  target_title text,
  target_thumbnail_url text default null,
  target_genre text[] default '{}',
  target_status text default null,
  target_description text default null,
  target_recommendation text default ''
)
returns setof public.group_library_entries
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_group_member(target_group) then
    raise exception 'No perteneces a este grupo';
  end if;
  return query
  insert into public.group_library_entries(
    group_id,
    source_id,
    manga_url,
    title,
    thumbnail_url,
    genre,
    status,
    description,
    recommended_by,
    recommendation
  )
  values (
    target_group,
    target_source_id,
    target_manga_url,
    target_title,
    target_thumbnail_url,
    coalesce(target_genre, '{}'),
    target_status,
    target_description,
    auth.uid(),
    coalesce(target_recommendation, '')
  )
  on conflict (group_id, source_id, manga_url) do update set
    title = excluded.title,
    thumbnail_url = coalesce(excluded.thumbnail_url, group_library_entries.thumbnail_url),
    genre = case
      when cardinality(excluded.genre) > 0 then excluded.genre
      else group_library_entries.genre
    end,
    status = coalesce(excluded.status, group_library_entries.status),
    description = coalesce(excluded.description, group_library_entries.description),
    updated_at = now()
  returning *;
end;
$$;

grant execute on function public.list_group_library(uuid) to authenticated;
grant execute on function public.recommend_group_manga(
  uuid, text, text, text, text, text[], text, text, text
) to authenticated;