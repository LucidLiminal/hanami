-- Hanami v144 R2: correct group-cover Storage policies.
-- Run in Supabase SQL Editor after the group administration migration.
-- Fix: unqualified name inside the subquery referred to reading_groups.name.
-- Always use storage.objects.name for the uploaded object path.
-- Keep SELECT, INSERT and UPDATE for owner upsert; do not disable RLS.
-- No files or group records are modified. Safe to run repeatedly.
-- Compare UUID text without casting untrusted paths to UUID.
begin;
drop policy if exists "group covers owner select" on storage.objects;
drop policy if exists "group covers owner insert" on storage.objects;
drop policy if exists "group covers owner update" on storage.objects;

create policy "group covers owner select" on storage.objects
  for select to authenticated using (
    bucket_id = 'group-covers'
    and exists (
      select 1 from public.reading_groups as cover_group
      where cover_group.id::text = (storage.foldername(storage.objects.name))[1]
        and cover_group.owner_id = auth.uid()
    )
  );

create policy "group covers owner insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'group-covers'
    and exists (
      select 1 from public.reading_groups as cover_group
      where cover_group.id::text = (storage.foldername(storage.objects.name))[1]
        and cover_group.owner_id = auth.uid()
    )
  );

create policy "group covers owner update" on storage.objects
  for update to authenticated using (
    bucket_id = 'group-covers'
    and exists (
      select 1 from public.reading_groups as cover_group
      where cover_group.id::text = (storage.foldername(storage.objects.name))[1]
        and cover_group.owner_id = auth.uid()
    )
  ) with check (
    bucket_id = 'group-covers'
    and exists (
      select 1 from public.reading_groups as cover_group
      where cover_group.id::text = (storage.foldername(storage.objects.name))[1]
        and cover_group.owner_id = auth.uid()
    )
  );

commit;
