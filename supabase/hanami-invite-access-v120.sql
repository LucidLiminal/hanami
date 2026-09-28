-- Hanami v120 · identidad anónima e invitaciones de acceso de un solo uso
-- Ejecutar después de hanami-social-v117.sql y hanami-group-library-v118.sql.

create extension if not exists pgcrypto;

create table if not exists public.reading_group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.reading_groups(id) on delete cascade,
  code_hash text not null unique,
  code_hint text not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  max_uses integer not null default 1 check (max_uses between 1 and 25),
  use_count integer not null default 0 check (use_count >= 0 and use_count <= max_uses),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists reading_group_invites_group_created
  on public.reading_group_invites(group_id, created_at desc);

alter table public.reading_group_invites enable row level security;
revoke all on table public.reading_group_invites from anon, authenticated;

create or replace function public.normalized_invite_hash(raw_code text)
returns text
language sql
immutable
security definer
set search_path = public, extensions
as $$
  select encode(
    digest(regexp_replace(upper(coalesce(raw_code, '')), '[^A-Z0-9]', '', 'g'), 'sha256'),
    'hex'
  );
$$;

create or replace function public.can_manage_group(target_group uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.reading_group_members
    where group_id = target_group
      and user_id = auth.uid()
      and role in ('owner', 'moderator')
  );
$$;

create or replace function public.create_reading_group_invite(
  target_group uuid,
  expires_in_hours integer default 168,
  allowed_uses integer default 1
)
returns table (
  id uuid,
  code text,
  code_hint text,
  expires_at timestamptz,
  max_uses integer,
  use_count integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  raw_code text;
  pretty_code text;
  invite_id uuid;
begin
  if not public.can_manage_group(target_group) then
    raise exception 'Solo la administración de la sala puede crear invitaciones';
  end if;
  if coalesce(expires_in_hours, 0) not between 1 and 720 then
    raise exception 'La caducidad debe estar entre 1 y 720 horas';
  end if;
  if coalesce(allowed_uses, 0) not between 1 and 25 then
    raise exception 'Los usos permitidos deben estar entre 1 y 25';
  end if;

  raw_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12));
  pretty_code := substr(raw_code, 1, 4) || '-' ||
                 substr(raw_code, 5, 4) || '-' ||
                 substr(raw_code, 9, 4);

  insert into public.reading_group_invites(
    group_id,
    code_hash,
    code_hint,
    created_by,
    max_uses,
    expires_at
  )
  values (
    target_group,
    public.normalized_invite_hash(pretty_code),
    right(raw_code, 4),
    auth.uid(),
    allowed_uses,
    now() + make_interval(hours => expires_in_hours)
  )
  returning reading_group_invites.id into invite_id;

  return query
  select
    invite.id,
    pretty_code,
    invite.code_hint,
    invite.expires_at,
    invite.max_uses,
    invite.use_count,
    invite.created_at
  from public.reading_group_invites invite
  where invite.id = invite_id;
end;
$$;

create or replace function public.list_reading_group_invites(target_group uuid)
returns table (
  id uuid,
  code_hint text,
  expires_at timestamptz,
  max_uses integer,
  use_count integer,
  revoked_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_manage_group(target_group) then
    raise exception 'No puedes administrar las invitaciones de esta sala';
  end if;
  return query
  select
    invite.id,
    invite.code_hint,
    invite.expires_at,
    invite.max_uses,
    invite.use_count,
    invite.revoked_at,
    invite.created_at
  from public.reading_group_invites invite
  where invite.group_id = target_group
  order by invite.created_at desc
  limit 40;
end;
$$;

create or replace function public.revoke_reading_group_invite(target_invite uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group uuid;
begin
  select group_id into target_group
  from public.reading_group_invites
  where id = target_invite;
  if target_group is null or not public.can_manage_group(target_group) then
    raise exception 'No puedes revocar esta invitación';
  end if;
  update public.reading_group_invites
  set revoked_at = coalesce(revoked_at, now())
  where id = target_invite;
  return true;
end;
$$;

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
security definer
set search_path = public
as $$
declare
  invite public.reading_group_invites%rowtype;
  clean_name text;
  inserted_rows integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Necesitas una identidad de dispositivo';
  end if;
  clean_name := trim(coalesce(display_name_input, ''));
  if char_length(clean_name) not between 2 and 40 then
    raise exception 'El nombre debe tener entre 2 y 40 caracteres';
  end if;

  select candidate.* into invite
  from public.reading_group_invites candidate
  where candidate.code_hash = public.normalized_invite_hash(invite_code_input)
  for update;

  if invite.id is null then
    raise exception 'Código de invitación no válido';
  end if;
  if invite.revoked_at is not null then
    raise exception 'Esta invitación fue revocada';
  end if;
  if invite.expires_at <= now() then
    raise exception 'Esta invitación ha caducado';
  end if;
  if invite.use_count >= invite.max_uses then
    raise exception 'Esta invitación ya fue utilizada';
  end if;

  update public.profiles
  set display_name = clean_name, updated_at = now()
  where profiles.id = auth.uid();

  insert into public.reading_group_members(group_id, user_id, role)
  values (invite.group_id, auth.uid(), 'member')
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

-- El código reutilizable de v117 deja de ser una vía de acceso remoto.
revoke all on function public.join_reading_group(text) from public, anon, authenticated;

revoke all on function public.normalized_invite_hash(text) from public, anon, authenticated;
revoke all on function public.can_manage_group(uuid) from public, anon, authenticated;
revoke all on function public.create_reading_group_invite(uuid, integer, integer) from public, anon;
revoke all on function public.list_reading_group_invites(uuid) from public, anon;
revoke all on function public.revoke_reading_group_invite(uuid) from public, anon;
revoke all on function public.redeem_reading_group_invite(text, text) from public, anon;

grant execute on function public.create_reading_group_invite(uuid, integer, integer) to authenticated;
grant execute on function public.list_reading_group_invites(uuid) to authenticated;
grant execute on function public.revoke_reading_group_invite(uuid) to authenticated;
grant execute on function public.redeem_reading_group_invite(text, text) to authenticated;