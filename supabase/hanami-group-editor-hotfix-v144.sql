-- Hanami v144 hotfix: eliminate output-column ambiguity when editing a group.
-- Safe to run once or repeatedly after the group administration migration.
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
security definer set search_path = public, pg_temp
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
    quote = coalesce(nullif(trim(group_quote), ''), reading_groups.quote),
    cover = coalesce(nullif(trim(group_cover), ''), reading_groups.cover),
    updated_at = now()
  where reading_groups.id = target_group;

  return query select * from public.group_result(target_group);
end;
$$;

revoke all on function public.update_reading_group(uuid, text, text, text) from public, anon;
grant execute on function public.update_reading_group(uuid, text, text, text) to authenticated;