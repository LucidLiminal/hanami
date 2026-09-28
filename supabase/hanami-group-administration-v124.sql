-- Hanami v124 · salida de grupos, administración y categorías compartidas

alter table public.reading_group_members
  add column if not exists state text not null default 'active'
  check (state in ('active', 'muted', 'banned'));

create or replace function public.is_group_member(target_group uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.reading_group_members
    where group_id = target_group
      and user_id = auth.uid()
      and state in ('active', 'muted')
  );
$$;

create or replace function public.can_post_to_group(target_group uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.reading_group_members
    where group_id = target_group
      and user_id = auth.uid()
      and state = 'active'
  );
$$;

create or replace function public.can_manage_group(target_group uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.reading_group_members
    where group_id = target_group
      and user_id = auth.uid()
      and role in ('owner', 'moderator')
      and state = 'active'
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
    count(m.user_id) filter (where m.state in ('active', 'muted')),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'name', p.display_name,
          'initials', upper(left(p.display_name, 2)),
          'role', m.role,
          'state', m.state
        )
        order by m.joined_at
      ) filter (
        where p.id is not null and m.state in ('active', 'muted')
      ),
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
    and mine.state in ('active', 'muted')
  order by result.updated_at desc;
$$;

create or replace function public.update_reading_group(
  target_group uuid,
  group_name text,
  group_quote text,
  group_cover text default null
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
begin
  if not exists (
    select 1 from public.reading_groups
    where reading_groups.id = target_group
      and reading_groups.owner_id = auth.uid()
  ) then
    raise exception 'Solo la persona propietaria puede editar la sala';
  end if;

  update public.reading_groups
  set
    name = trim(group_name),
    quote = coalesce(nullif(trim(group_quote), ''), quote),
    cover = coalesce(nullif(trim(group_cover), ''), cover),
    updated_at = now()
  where reading_groups.id = target_group;

  return query select * from public.group_result(target_group);
end;
$$;

create or replace function public.leave_reading_group(target_group uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if exists (
    select 1 from public.reading_groups
    where id = target_group and owner_id = auth.uid()
  ) then
    raise exception 'La persona propietaria no puede abandonar su propia sala';
  end if;

  delete from public.reading_group_members
  where group_id = target_group and user_id = auth.uid();
end;
$$;

create or replace function public.manage_reading_group_member(
  target_group uuid,
  target_user uuid,
  member_action text
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
begin
  if not exists (
    select 1 from public.reading_groups
    where reading_groups.id = target_group
      and reading_groups.owner_id = auth.uid()
  ) then
    raise exception 'Solo la persona propietaria puede administrar miembros';
  end if;
  if target_user = auth.uid() then
    raise exception 'No puedes modificar tu propia membresía';
  end if;

  if member_action = 'ban' then
    update public.reading_group_members
    set state = 'banned', role = 'member'
    where group_id = target_group and user_id = target_user;
  elsif member_action = 'mute' then
    update public.reading_group_members
    set state = 'muted'
    where group_id = target_group and user_id = target_user;
  elsif member_action = 'unmute' then
    update public.reading_group_members
    set state = 'active'
    where group_id = target_group and user_id = target_user;
  elsif member_action = 'moderator' then
    update public.reading_group_members
    set role = 'moderator'
    where group_id = target_group and user_id = target_user;
  elsif member_action = 'member' then
    update public.reading_group_members
    set role = 'member'
    where group_id = target_group and user_id = target_user;
  else
    raise exception 'Acción de miembro no válida';
  end if;

  update public.reading_groups set updated_at = now() where id = target_group;
  return query select * from public.group_result(target_group);
end;
$$;

-- Una persona baneada no puede volver a consumir una invitación.
create or replace function public.redeem_reading_group_invite(
  invite_code_input text,
  display_name_input text
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
security definer set search_path = public, extensions
as $$
declare
  invite public.reading_group_invites%rowtype;
  inserted_rows integer := 0;
  clean_name text;
begin
  if auth.uid() is null then
    raise exception 'Necesitas una identidad de dispositivo';
  end if;
  clean_name := trim(coalesce(display_name_input, ''));
  if char_length(clean_name) not between 2 and 40 then
    raise exception 'El nombre debe tener entre 2 y 40 caracteres';
  end if;

  update public.profiles
  set display_name = clean_name, updated_at = now()
  where profiles.id = auth.uid();

  select candidate.* into invite
  from public.reading_group_invites candidate
  where candidate.code_hash = public.normalized_invite_hash(invite_code_input)
    and candidate.revoked_at is null
    and candidate.expires_at > now()
    and candidate.use_count < candidate.max_uses
  for update skip locked;

  if invite.id is null then
    raise exception 'La invitación no existe, ha caducado o ya fue utilizada';
  end if;
  if exists (
    select 1 from public.reading_group_members
    where group_id = invite.group_id
      and user_id = auth.uid()
      and state = 'banned'
  ) then
    raise exception 'No puedes volver a entrar en esta sala';
  end if;

  insert into public.reading_group_members(group_id, user_id, role, state)
  values (invite.group_id, auth.uid(), 'member', 'active')
  on conflict do nothing;
  get diagnostics inserted_rows = row_count;

  if inserted_rows > 0 then
    update public.reading_group_invites
    set use_count = use_count + 1, last_used_at = now()
    where reading_group_invites.id = invite.id;
  end if;

  return query select * from public.group_result(invite.group_id);
end;
$$;

create table if not exists public.group_library_categories (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.reading_groups(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique(group_id, name)
);

create table if not exists public.group_library_entry_categories (
  group_id uuid not null references public.reading_groups(id) on delete cascade,
  entry_id uuid not null references public.group_library_entries(id) on delete cascade,
  category_id uuid not null references public.group_library_categories(id) on delete cascade,
  primary key(entry_id, category_id)
);

alter table public.group_library_categories enable row level security;
alter table public.group_library_entry_categories enable row level security;

drop policy if exists "group categories visible to members" on public.group_library_categories;
drop policy if exists "group category links visible to members" on public.group_library_entry_categories;
create policy "group categories visible to members"
  on public.group_library_categories for select
  using (public.is_group_member(group_id));
create policy "group category links visible to members"
  on public.group_library_entry_categories for select
  using (public.is_group_member(group_id));

create or replace function public.list_group_library_categories(target_group uuid)
returns table (
  id uuid,
  group_id uuid,
  name text,
  sort_order integer,
  entry_ids uuid[]
)
language sql
stable
security definer set search_path = public
as $$
  select
    category.id,
    category.group_id,
    category.name,
    category.position as sort_order,
    coalesce(
      array_agg(link.entry_id) filter (where link.entry_id is not null),
      '{}'::uuid[]
    )
  from public.group_library_categories category
  left join public.group_library_entry_categories link
    on link.category_id = category.id
  where category.group_id = target_group
    and public.is_group_member(target_group)
  group by category.id
  order by category.position, category.created_at;
$$;

create or replace function public.manage_group_library_category(
  target_group uuid,
  category_action text,
  target_category uuid default null,
  category_name text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.reading_groups
    where id = target_group and owner_id = auth.uid()
  ) then
    raise exception 'Solo la persona propietaria puede administrar categorías';
  end if;

  if category_action = 'create' then
    insert into public.group_library_categories(group_id, name, position)
    values (
      target_group,
      trim(category_name),
      coalesce((
        select max(position) + 1
        from public.group_library_categories
        where group_id = target_group
      ), 0)
    );
  elsif category_action = 'rename' then
    update public.group_library_categories
    set name = trim(category_name)
    where id = target_category and group_id = target_group;
  elsif category_action = 'delete' then
    delete from public.group_library_categories
    where id = target_category and group_id = target_group;
  else
    raise exception 'Acción de categoría no válida';
  end if;
end;
$$;

create or replace function public.set_group_library_entry_categories(
  target_group uuid,
  target_entry uuid,
  target_categories uuid[]
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.reading_groups
    where id = target_group and owner_id = auth.uid()
  ) then
    raise exception 'Solo la persona propietaria puede organizar la biblioteca';
  end if;

  delete from public.group_library_entry_categories
  where group_id = target_group and entry_id = target_entry;

  insert into public.group_library_entry_categories(group_id, entry_id, category_id)
  select target_group, target_entry, category.id
  from public.group_library_categories category
  where category.group_id = target_group
    and category.id = any(coalesce(target_categories, '{}'::uuid[]));
end;
$$;

create or replace function public.delete_group_library_entry(
  target_group uuid,
  target_entry uuid
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.group_library_entries entry
    join public.reading_groups room on room.id = entry.group_id
    where entry.id = target_entry
      and entry.group_id = target_group
      and (entry.recommended_by = auth.uid() or room.owner_id = auth.uid())
  ) then
    raise exception 'No puedes eliminar esta recomendación';
  end if;
  delete from public.group_library_entries
  where id = target_entry and group_id = target_group;
end;
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
  if not public.can_post_to_group(target_group) then
    raise exception 'No tienes permiso para recomendar en este grupo';
  end if;
  return query
  insert into public.group_library_entries(
    group_id, source_id, manga_url, title, thumbnail_url, genre, status,
    description, recommended_by, recommendation
  )
  values (
    target_group, target_source_id, target_manga_url, target_title,
    target_thumbnail_url, coalesce(target_genre, '{}'), target_status,
    target_description, auth.uid(), coalesce(target_recommendation, '')
  )
  on conflict (group_id, source_id, manga_url) do update set
    title = excluded.title,
    thumbnail_url = coalesce(
      excluded.thumbnail_url,
      group_library_entries.thumbnail_url
    ),
    genre = case
      when cardinality(excluded.genre) > 0 then excluded.genre
      else group_library_entries.genre
    end,
    status = coalesce(excluded.status, group_library_entries.status),
    description = coalesce(
      excluded.description,
      group_library_entries.description
    ),
    updated_at = now()
  returning *;
end;
$$;

drop policy if exists "comments created by author" on public.reader_comments;
create policy "comments created by author" on public.reader_comments
  for insert with check (
    public.can_post_to_group(group_id) and author_id = auth.uid()
  );

drop policy if exists "members recommend manga" on public.group_library_entries;
create policy "members recommend manga" on public.group_library_entries
  for insert with check (
    public.can_post_to_group(group_id) and recommended_by = auth.uid()
  );

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'group-covers',
  'group-covers',
  true,
  4194304,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "group covers owner insert" on storage.objects;
drop policy if exists "group covers owner update" on storage.objects;
create policy "group covers owner insert" on storage.objects
  for insert with check (
    bucket_id = 'group-covers'
    and exists (
      select 1 from public.reading_groups
      where id = (storage.foldername(name))[1]::uuid
        and owner_id = auth.uid()
    )
  );
create policy "group covers owner update" on storage.objects
  for update using (
    bucket_id = 'group-covers'
    and exists (
      select 1 from public.reading_groups
      where id = (storage.foldername(name))[1]::uuid
        and owner_id = auth.uid()
    )
  );

revoke all on function public.update_reading_group(uuid, text, text, text) from public, anon;
revoke all on function public.leave_reading_group(uuid) from public, anon;
revoke all on function public.manage_reading_group_member(uuid, uuid, text) from public, anon;
revoke all on function public.list_group_library_categories(uuid) from public, anon;
revoke all on function public.manage_group_library_category(uuid, text, uuid, text) from public, anon;
revoke all on function public.set_group_library_entry_categories(uuid, uuid, uuid[]) from public, anon;
revoke all on function public.delete_group_library_entry(uuid, uuid) from public, anon;

grant execute on function public.update_reading_group(uuid, text, text, text) to authenticated;
grant execute on function public.leave_reading_group(uuid) to authenticated;
grant execute on function public.manage_reading_group_member(uuid, uuid, text) to authenticated;
grant execute on function public.list_group_library_categories(uuid) to authenticated;
grant execute on function public.manage_group_library_category(uuid, text, uuid, text) to authenticated;
grant execute on function public.set_group_library_entry_categories(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.delete_group_library_entry(uuid, uuid) to authenticated;
grant execute on function public.can_post_to_group(uuid) to authenticated;
