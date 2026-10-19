-- Hanami v145: one bounded WebP cover per reading group.
-- Apply AFTER group administration/library parity migrations and BEFORE v145.
-- Existing files are not deleted or rewritten by this migration.
-- The app removes obsolete objects through the Storage API after a successful save.
-- Re-running older migrations afterward can reset bucket limits: re-run this last.
begin;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('group-covers', 'group-covers', true, 1048576, array['image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "group covers owner select" on storage.objects;
drop policy if exists "group covers owner insert" on storage.objects;
drop policy if exists "group covers owner update" on storage.objects;
drop policy if exists "group covers owner delete" on storage.objects;
drop policy if exists "group covers strict select" on storage.objects;
drop policy if exists "group covers strict insert" on storage.objects;
drop policy if exists "group covers strict update" on storage.objects;
drop policy if exists "group covers strict delete" on storage.objects;

-- Read all objects in the owner's group folder, including legacy covers.
create policy "group covers owner select" on storage.objects
  for select to authenticated using (
    bucket_id = 'group-covers'
    and exists (
      select 1 from public.reading_groups as cover_group
      where cover_group.id::text = (storage.foldername(storage.objects.name))[1]
        and cover_group.owner_id = auth.uid()
    )
  );

-- A complete path match permits only one filename, without UUID casts.
create policy "group covers owner insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'group-covers'
    and exists (
      select 1 from public.reading_groups as cover_group
      where storage.objects.name = cover_group.id::text || '/cover.webp'
        and cover_group.owner_id = auth.uid()
    )
  );

create policy "group covers owner update" on storage.objects
  for update to authenticated using (
    bucket_id = 'group-covers'
    and exists (
      select 1 from public.reading_groups as cover_group
      where storage.objects.name = cover_group.id::text || '/cover.webp'
        and cover_group.owner_id = auth.uid()
    )
  ) with check (
    bucket_id = 'group-covers'
    and exists (
      select 1 from public.reading_groups as cover_group
      where storage.objects.name = cover_group.id::text || '/cover.webp'
        and cover_group.owner_id = auth.uid()
    )
  );

-- Owners can remove obsolete files using the Storage API, not SQL deletion.
create policy "group covers owner delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'group-covers'
    and exists (
      select 1 from public.reading_groups as cover_group
      where cover_group.id::text = (storage.foldername(storage.objects.name))[1]
        and cover_group.owner_id = auth.uid()
    )
  );

-- Restrictive policies also constrain any permissive policy that may already
-- exist. Other buckets remain governed by their own unchanged policies.
create policy "group covers strict select" on storage.objects
  as restrictive for select to public using (
    bucket_id <> 'group-covers'
    or exists (
      select 1 from public.reading_groups as cover_group
      where cover_group.id::text = (storage.foldername(storage.objects.name))[1]
        and cover_group.owner_id = auth.uid()
    )
  );

create policy "group covers strict insert" on storage.objects
  as restrictive for insert to public with check (
    bucket_id <> 'group-covers'
    or exists (
      select 1 from public.reading_groups as cover_group
      where storage.objects.name = cover_group.id::text || '/cover.webp'
        and cover_group.owner_id = auth.uid()
    )
  );

create policy "group covers strict update" on storage.objects
  as restrictive for update to public using (
    bucket_id <> 'group-covers'
    or exists (
      select 1 from public.reading_groups as cover_group
      where storage.objects.name = cover_group.id::text || '/cover.webp'
        and cover_group.owner_id = auth.uid()
    )
  ) with check (
    bucket_id <> 'group-covers'
    or exists (
      select 1 from public.reading_groups as cover_group
      where storage.objects.name = cover_group.id::text || '/cover.webp'
        and cover_group.owner_id = auth.uid()
    )
  );

create policy "group covers strict delete" on storage.objects
  as restrictive for delete to public using (
    bucket_id <> 'group-covers'
    or exists (
      select 1 from public.reading_groups as cover_group
      where cover_group.id::text = (storage.foldername(storage.objects.name))[1]
        and cover_group.owner_id = auth.uid()
    )
  );

commit;