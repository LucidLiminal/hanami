-- Hanami v117 · grupos privados, comentarios y adjuntos
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Lector',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reading_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  quote text not null default 'La misma historia, desde lugares distintos.',
  cover text,
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10)),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reading_group_members (
  group_id uuid not null references public.reading_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'moderator', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.reader_comments (
  id uuid primary key,
  group_id uuid not null references public.reading_groups(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  page_key text not null,
  x double precision not null check (x between 0 and 1),
  y double precision not null check (y between 0 and 1),
  width double precision not null check (width between 0.18 and 0.95),
  text text not null default '' check (char_length(text) <= 1200),
  media_path text,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists reader_comments_group_page
  on public.reader_comments(group_id, page_key, updated_at);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles(id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), 'Lector')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_group_member(target_group uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.reading_group_members
    where group_id = target_group and user_id = auth.uid()
  );
$$;

create or replace function public.group_result(target_group uuid)
returns table (
  id uuid,
  name text,
  quote text,
  cover text,
  invite_code text,
  owner_id uuid,
  member_count bigint,
  members jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer set search_path = public
as $$
  select
    g.id,
    g.name,
    g.quote,
    g.cover,
    g.invite_code,
    g.owner_id,
    count(m.user_id),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'name', p.display_name,
          'initials', upper(left(p.display_name, 2)),
          'role', m.role
        )
        order by m.joined_at
      ) filter (where p.id is not null),
      '[]'::jsonb
    ),
    g.created_at,
    g.updated_at
  from public.reading_groups g
  left join public.reading_group_members m on m.group_id = g.id
  left join public.profiles p on p.id = m.user_id
  where g.id = target_group and public.is_group_member(g.id)
  group by g.id;
$$;

create or replace function public.list_my_reading_groups()
returns table (
  id uuid,
  name text,
  quote text,
  cover text,
  invite_code text,
  owner_id uuid,
  member_count bigint,
  members jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer set search_path = public
as $$
  select result.*
  from public.reading_group_members mine
  cross join lateral public.group_result(mine.group_id) result
  where mine.user_id = auth.uid()
  order by result.updated_at desc;
$$;

create or replace function public.create_reading_group(
  group_name text,
  group_quote text default null
)
returns table (
  id uuid,
  name text,
  quote text,
  cover text,
  invite_code text,
  owner_id uuid,
  member_count bigint,
  members jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer set search_path = public
as $$
declare
  created_id uuid;
begin
  insert into public.reading_groups(name, quote, owner_id)
  values (
    trim(group_name),
    coalesce(nullif(trim(group_quote), ''), 'La misma historia, desde lugares distintos.'),
    auth.uid()
  )
  returning reading_groups.id into created_id;
  insert into public.reading_group_members(group_id, user_id, role)
  values (created_id, auth.uid(), 'owner');
  return query select * from public.group_result(created_id);
end;
$$;

create or replace function public.join_reading_group(code text)
returns table (
  id uuid,
  name text,
  quote text,
  cover text,
  invite_code text,
  owner_id uuid,
  member_count bigint,
  members jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer set search_path = public
as $$
declare
  target_id uuid;
begin
  select candidate.id into target_id
  from public.reading_groups candidate
  where candidate.invite_code = upper(trim(code));
  if target_id is null then
    raise exception 'Código de invitación no válido';
  end if;
  insert into public.reading_group_members(group_id, user_id, role)
  values (target_id, auth.uid(), 'member')
  on conflict do nothing;
  return query select * from public.group_result(target_id);
end;
$$;

alter table public.profiles enable row level security;
alter table public.reading_groups enable row level security;
alter table public.reading_group_members enable row level security;
alter table public.reader_comments enable row level security;

drop policy if exists "profiles shared in rooms" on public.profiles;
drop policy if exists "profiles update self" on public.profiles;
drop policy if exists "groups visible to members" on public.reading_groups;
drop policy if exists "groups update by owner" on public.reading_groups;
drop policy if exists "members visible inside group" on public.reading_group_members;
drop policy if exists "comments visible to members" on public.reader_comments;
drop policy if exists "comments created by author" on public.reader_comments;
drop policy if exists "comments changed by author or owner" on public.reader_comments;
create policy "profiles shared in rooms" on public.profiles
  for select using (
    id = auth.uid() or exists (
      select 1
      from public.reading_group_members mine
      join public.reading_group_members theirs using (group_id)
      where mine.user_id = auth.uid() and theirs.user_id = profiles.id
    )
  );
create policy "profiles update self" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy "groups visible to members" on public.reading_groups
  for select using (public.is_group_member(id));
create policy "groups update by owner" on public.reading_groups
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "members visible inside group" on public.reading_group_members
  for select using (public.is_group_member(group_id));
create policy "comments visible to members" on public.reader_comments
  for select using (public.is_group_member(group_id));
create policy "comments created by author" on public.reader_comments
  for insert with check (
    public.is_group_member(group_id) and author_id = auth.uid()
  );
create policy "comments changed by author or owner" on public.reader_comments
  for update using (
    author_id = auth.uid() or exists (
      select 1 from public.reading_groups
      where id = reader_comments.group_id and owner_id = auth.uid()
    )
  ) with check (public.is_group_member(group_id));

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'comment-media',
  'comment-media',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "comment media read by room" on storage.objects;
drop policy if exists "comment media upload by room" on storage.objects;
drop policy if exists "comment media update by owner" on storage.objects;
drop policy if exists "comment media delete by owner" on storage.objects;
create policy "comment media read by room" on storage.objects
  for select using (
    bucket_id = 'comment-media'
    and public.is_group_member((storage.foldername(name))[1]::uuid)
  );
create policy "comment media upload by room" on storage.objects
  for insert with check (
    bucket_id = 'comment-media'
    and public.is_group_member((storage.foldername(name))[1]::uuid)
  );
create policy "comment media update by owner" on storage.objects
  for update using (
    bucket_id = 'comment-media'
    and owner_id = auth.uid()::text
  );
create policy "comment media delete by owner" on storage.objects
  for delete using (
    bucket_id = 'comment-media'
    and owner_id = auth.uid()::text
  );

grant execute on function public.list_my_reading_groups() to authenticated;
grant execute on function public.create_reading_group(text, text) to authenticated;
grant execute on function public.join_reading_group(text) to authenticated;