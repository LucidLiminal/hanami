-- Hanami v144: stable identities and verified, room-scoped URL aliases.
-- Apply after v117/v118/v124/v137. No annotation IDs, page_key values,
-- author IDs, revisions, tombstones or progress timestamps are rewritten.
begin;

-- Server-side safety copy before adding any identity metadata. These tables
-- are private, preserved on repeated runs, and inaccessible to app clients.
create schema if not exists hanami_recovery;
revoke all on schema hanami_recovery from public, anon, authenticated;
create table if not exists hanami_recovery.reader_comments_before_v144
  as table public.reader_comments;
create table if not exists hanami_recovery.music_pins_before_v144
  as table public.group_reader_music_pins;
create table if not exists hanami_recovery.group_progress_before_v144
  as table public.group_reading_progress;
revoke all on all tables in schema hanami_recovery from public, anon, authenticated;
alter table hanami_recovery.reader_comments_before_v144 enable row level security;
alter table hanami_recovery.music_pins_before_v144 enable row level security;
alter table hanami_recovery.group_progress_before_v144 enable row level security;

create table if not exists public.reading_content_works (
  id uuid primary key default gen_random_uuid(),
  source_id text not null check (char_length(source_id) between 1 and 160),
  created_at timestamptz not null default now()
);
create table if not exists public.reading_content_chapters (
  id uuid primary key default gen_random_uuid(),
  source_id text not null check (char_length(source_id) between 1 and 160),
  work_id uuid references public.reading_content_works(id),
  remote_scope text not null default '',
  remote_id text not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists reading_content_remote_identity
  on public.reading_content_chapters(source_id, remote_scope, remote_id)
  where remote_id <> '';
create table if not exists public.reading_chapter_aliases (
  group_id uuid not null references public.reading_groups(id) on delete cascade,
  source_id text not null check (char_length(source_id) between 1 and 160),
  work_ref text not null check (char_length(work_ref) between 1 and 2048),
  chapter_ref text not null check (char_length(chapter_ref) between 1 and 2048),
  chapter_id uuid not null references public.reading_content_chapters(id),
  work_id uuid references public.reading_content_works(id),
  remote_id text not null default '',
  verified boolean not null default false,
  pages_equivalent boolean not null default true,
  evidence text not null default '' check (char_length(evidence) <= 600),
  verified_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key(group_id, source_id, work_ref, chapter_ref)
);
alter table public.reading_content_works enable row level security;
alter table public.reading_content_chapters enable row level security;
alter table public.reading_chapter_aliases enable row level security;
revoke all on public.reading_content_works, public.reading_content_chapters,
  public.reading_chapter_aliases from public, anon, authenticated;

alter table public.reader_comments
  add column if not exists chapter_id uuid references public.reading_content_chapters(id),
  add column if not exists work_id uuid references public.reading_content_works(id),
  add column if not exists identity_version smallint not null default 1;
alter table public.group_reader_music_pins
  add column if not exists chapter_id uuid references public.reading_content_chapters(id),
  add column if not exists work_id uuid references public.reading_content_works(id),
  add column if not exists identity_version smallint not null default 1;
alter table public.group_reading_progress
  add column if not exists chapter_id uuid references public.reading_content_chapters(id),
  add column if not exists work_id uuid references public.reading_content_works(id);
create index if not exists reader_comments_stable_chapter
  on public.reader_comments(group_id, chapter_id) where deleted_at is null;
create index if not exists music_pins_stable_chapter
  on public.group_reader_music_pins(group_id, chapter_id) where deleted_at is null;

create or replace function public.hanami_remote_chapter_id(p_source text, p_ref text)
returns text language plpgsql immutable set search_path = public, pg_temp as $$
declare v_match text[];
begin
  if p_source <> 'hanami.es.olympus' then return ''; end if;
  v_match := regexp_match(p_ref,
    '(?i)(?:^|/)capitulo/([0-9]{1,20}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:/|[?#]|$)');
  return lower(coalesce(v_match[1], ''));
end $$;
revoke all on function public.hanami_remote_chapter_id(text,text) from public, anon, authenticated;

-- Identity token used for legacy reads. URL text is a locator/fallback only,
-- never the primary key of a newly registered chapter.
create or replace function public.hanami_chapter_token(
  p_group uuid, p_source text, p_work text, p_chapter text)
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_remote text;
begin
  select chapter_id into v_id from public.reading_chapter_aliases
    where group_id=p_group and source_id=p_source and work_ref=p_work and chapter_ref=p_chapter;
  if v_id is not null then return 'id|' || v_id::text; end if;
  v_remote := public.hanami_remote_chapter_id(p_source,p_chapter);
  if v_remote <> '' then
    select id into v_id from public.reading_content_chapters
      where source_id=p_source and remote_scope='source' and remote_id=v_remote;
    if v_id is not null then return 'id|' || v_id::text; end if;
    return 'remote|' || p_source || '|' || v_remote;
  end if;
  return 'legacy|' || jsonb_build_array(p_source,p_work,p_chapter)::text;
end $$;
revoke all on function public.hanami_chapter_token(uuid,text,text,text) from public, anon, authenticated;

create or replace function public.register_group_chapter_identity(
  p_group uuid, p_source_id text, p_work_ref text, p_chapter_ref text,
  p_chapter_id uuid, p_work_id uuid,
  p_remote_chapter_id text default '', p_remote_scope text default 'work')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_alias public.reading_chapter_aliases; v_chapter public.reading_content_chapters;
  v_work uuid; v_remote text; v_scope text;
begin
  if auth.uid() is null or not public.is_group_member(p_group) then
    raise exception 'Group access required' using errcode='42501';
  end if;
  if p_source_id='hanami.local' or char_length(p_source_id) not between 1 and 160
    or char_length(p_work_ref) not between 1 and 2048
    or char_length(p_chapter_ref) not between 1 and 2048
    or p_chapter_id is null or p_work_id is null
    or char_length(coalesce(p_remote_chapter_id,'')) > 160 then
    raise exception 'Invalid chapter identity' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('hanami-identity:'||p_source_id,0));
  select * into v_alias from public.reading_chapter_aliases
    where group_id=p_group and source_id=p_source_id and work_ref=p_work_ref and chapter_ref=p_chapter_ref;
  if found then
    if not v_alias.verified and v_alias.remote_id<>'' and coalesce(p_remote_chapter_id,'')<>''
      and v_alias.remote_id<>lower(p_remote_chapter_id) then
      raise exception 'The source changed the chapter identity; review the alias instead of moving records automatically' using errcode='22023';
    end if;
    return to_jsonb(v_alias);
  end if;
  select work_id into v_work from public.reading_chapter_aliases
    where group_id=p_group and source_id=p_source_id and work_ref=p_work_ref limit 1;
  v_work := coalesce(v_work,p_work_id);
  insert into public.reading_content_works(id,source_id) values(v_work,p_source_id) on conflict(id) do nothing;
  if not exists(select 1 from public.reading_content_works where id=v_work and source_id=p_source_id) then
    raise exception 'Work belongs to another source' using errcode='22023';
  end if;
  v_remote := public.hanami_remote_chapter_id(p_source_id,p_chapter_ref);
  if v_remote='' and p_source_id='hanami.es.olympus' and
    coalesce(p_remote_chapter_id,'') ~* '^([0-9]{1,20}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$' then
    v_remote:=lower(p_remote_chapter_id);
  end if;
  if v_remote <> '' then v_scope := 'source';
  else
    v_remote := coalesce(p_remote_chapter_id,'');
    -- Only the explicitly supported Olympus adapter has source-global IDs.
    -- Unknown adapters are scoped to the canonical work, not chapter number.
    v_scope := 'work|' || v_work::text;
  end if;
  if v_remote <> '' then
    select * into v_chapter from public.reading_content_chapters
      where source_id=p_source_id and remote_scope=v_scope and remote_id=v_remote;
  end if;
  if v_chapter.id is null then
    select * into v_chapter from public.reading_content_chapters where id=p_chapter_id;
    if found and (v_chapter.source_id<>p_source_id or v_chapter.remote_id<>v_remote or v_chapter.remote_scope<>v_scope) then
      raise exception 'Chapter belongs to another identity' using errcode='22023';
    end if;
    if v_chapter.id is null then
      insert into public.reading_content_chapters(id,source_id,work_id,remote_scope,remote_id)
        values(p_chapter_id,p_source_id,v_work,v_scope,v_remote) returning * into v_chapter;
    end if;
  end if;
  v_work := coalesce(v_chapter.work_id,v_work);
  insert into public.reading_chapter_aliases(group_id,source_id,work_ref,chapter_ref,chapter_id,work_id,remote_id)
    values(p_group,p_source_id,p_work_ref,p_chapter_ref,v_chapter.id,v_work,v_chapter.remote_id)
    returning * into v_alias;
  return to_jsonb(v_alias);
end $$;
revoke all on function public.register_group_chapter_identity(uuid,text,text,text,uuid,uuid,text,text) from public, anon;
grant execute on function public.register_group_chapter_identity(uuid,text,text,text,uuid,uuid,text,text) to authenticated;

create or replace function public.list_group_chapter_aliases(p_group uuid,p_offset integer default 0,p_limit integer default 250)
returns setof public.reading_chapter_aliases language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not public.is_group_member(p_group) then
    raise exception 'Group access required' using errcode='42501';
  end if;
  if p_offset<0 or p_limit not between 1 and 500 then raise exception 'Invalid alias batch' using errcode='22023'; end if;
  return query select * from public.reading_chapter_aliases where group_id=p_group
    order by source_id,work_ref,chapter_ref offset p_offset limit p_limit;
end $$;
revoke all on function public.list_group_chapter_aliases(uuid,integer,integer) from public,anon;
grant execute on function public.list_group_chapter_aliases(uuid,integer,integer) to authenticated;

create or replace function public.list_group_music_identity_inventory(p_group uuid,p_offset integer default 0,p_limit integer default 250)
returns setof public.group_reader_music_pins language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not public.is_group_member(p_group) then
    raise exception 'Group access required' using errcode='42501';
  end if;
  if p_offset<0 or p_limit not between 1 and 500 then raise exception 'Invalid music batch' using errcode='22023'; end if;
  return query select * from public.group_reader_music_pins where group_id=p_group and deleted_at is null
    order by id offset p_offset limit p_limit;
end $$;
revoke all on function public.list_group_music_identity_inventory(uuid,integer,integer) from public,anon;
grant execute on function public.list_group_music_identity_inventory(uuid,integer,integer) to authenticated;

create or replace function public.verify_group_chapter_alias(
  p_group uuid, p_source_id text, p_old_work_ref text, p_old_chapter_ref text,
  p_target_work_ref text, p_target_chapter_ref text,
  p_pages_equivalent boolean, p_evidence text default '')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_target public.reading_chapter_aliases; v_alias public.reading_chapter_aliases;
begin
  if auth.uid() is null or not public.can_manage_group(p_group) then
    raise exception 'Only a group owner or moderator can verify shared identities' using errcode='42501';
  end if;
  if p_pages_equivalent is distinct from true or char_length(p_old_work_ref) not between 1 and 2048
    or char_length(p_old_chapter_ref) not between 1 and 2048 or char_length(coalesce(p_evidence,''))>600 then
    raise exception 'Page equivalence confirmation required' using errcode='22023';
  end if;
  select * into v_target from public.reading_chapter_aliases where group_id=p_group
    and source_id=p_source_id and work_ref=p_target_work_ref and chapter_ref=p_target_chapter_ref;
  if not found then raise exception 'Register the target chapter first' using errcode='22023'; end if;
  insert into public.reading_chapter_aliases(group_id,source_id,work_ref,chapter_ref,chapter_id,work_id,
    remote_id,verified,pages_equivalent,evidence,verified_by)
    values(p_group,p_source_id,p_old_work_ref,p_old_chapter_ref,v_target.chapter_id,v_target.work_id,
      v_target.remote_id,true,true,p_evidence,auth.uid())
    on conflict(group_id,source_id,work_ref,chapter_ref) do update set
      chapter_id=excluded.chapter_id,work_id=excluded.work_id,remote_id=excluded.remote_id,
      verified=true,pages_equivalent=true,evidence=excluded.evidence,verified_by=excluded.verified_by,updated_at=now()
    returning * into v_alias;
  return to_jsonb(v_alias);
end $$;
revoke all on function public.verify_group_chapter_alias(uuid,text,text,text,text,text,boolean,text) from public,anon;
grant execute on function public.verify_group_chapter_alias(uuid,text,text,text,text,text,boolean,text) to authenticated;

create or replace function public.hanami_music_page_token(p_group uuid,p_key text)
returns text language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_page jsonb;
begin
  begin v_page := p_key::jsonb; exception when others then return null; end;
  if jsonb_typeof(v_page) is distinct from 'array' or jsonb_array_length(v_page)<>5
    or v_page->>0<>p_group::text then return null; end if;
  return public.hanami_chapter_token(p_group,v_page->>1,v_page->>2,v_page->>3) || '|page|' || (v_page->>4);
end $$;
revoke all on function public.hanami_music_page_token(uuid,text) from public,anon,authenticated;

create or replace function public.list_group_reader_music_pins_v144(p_group uuid,p_page_keys jsonb)
returns setof public.group_reader_music_pins language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_keys text[] := '{}'; v_key jsonb; v_page text;
begin
  if auth.uid() is null or not public.is_group_member(p_group) then
    raise exception 'Group access required' using errcode='42501';
  end if;
  if jsonb_typeof(p_page_keys) is distinct from 'array' or jsonb_array_length(p_page_keys) not between 1 and 100 then
    raise exception 'Invalid music page batch' using errcode='22023';
  end if;
  for v_key in select value from jsonb_array_elements(p_page_keys) loop
    if jsonb_typeof(v_key) is distinct from 'string' then raise exception 'Invalid music page' using errcode='22023'; end if;
    v_page := public.normalize_group_music_page(p_group,v_key#>>'{}');
    v_keys := array_append(v_keys,public.hanami_music_page_token(p_group,v_page));
  end loop;
  return query select pin.* from public.group_reader_music_pins pin where pin.group_id=p_group
    and pin.deleted_at is null and public.hanami_music_page_token(p_group,pin.page_key)=any(v_keys)
    order by pin.page_key,pin.y,pin.x,pin.id;
end $$;
revoke all on function public.list_group_reader_music_pins_v144(uuid,jsonb) from public,anon;
grant execute on function public.list_group_reader_music_pins_v144(uuid,jsonb) to authenticated;

-- Metadata is filled on normal writes, including legacy clients. Old records
-- remain readable through token/alias resolution without a destructive backfill.
create or replace function public.hanami_fill_annotation_identity()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_source text; v_work text; v_chapter text; v_parts text[]; v_page jsonb;
  v_token text; v_row public.reading_content_chapters;
begin
  if tg_table_name='reader_comments' then
    v_parts := string_to_array(new.page_key,'|');
    if array_length(v_parts,1)<>4 then return new; end if;
    v_source:=v_parts[1];v_work:=v_parts[2];v_chapter:=v_parts[3];
  else
    begin v_page:=new.page_key::jsonb; exception when others then return new; end;
    if jsonb_typeof(v_page) is distinct from 'array' or jsonb_array_length(v_page)<>5
      or v_page->>0<>new.group_id::text then return new; end if;
    v_source:=v_page->>1;v_work:=v_page->>2;v_chapter:=v_page->>3;
  end if;
  v_token:=public.hanami_chapter_token(new.group_id,v_source,v_work,v_chapter);
  if v_token like 'id|%' then
    select * into v_row from public.reading_content_chapters where id=substring(v_token from 4)::uuid;
    new.chapter_id:=v_row.id;new.work_id:=v_row.work_id;new.identity_version:=2;
  else
    new.chapter_id:=null;new.work_id:=null;new.identity_version:=1;
  end if;
  return new;
end $$;
revoke all on function public.hanami_fill_annotation_identity() from public,anon,authenticated;
drop trigger if exists hanami_comment_identity on public.reader_comments;
create trigger hanami_comment_identity before insert or update on public.reader_comments
  for each row execute function public.hanami_fill_annotation_identity();
drop trigger if exists hanami_music_identity on public.group_reader_music_pins;
create trigger hanami_music_identity before insert or update on public.group_reader_music_pins
  for each row execute function public.hanami_fill_annotation_identity();

create or replace function public.hanami_fill_group_progress_identity()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_entry public.group_library_entries; v_token text; v_row public.reading_content_chapters;
begin
  select * into v_entry from public.group_library_entries where id=new.entry_id and group_id=new.group_id;
  v_token:=public.hanami_chapter_token(new.group_id,v_entry.source_id,v_entry.manga_url,new.chapter_url);
  if v_token like 'id|%' then
    select * into v_row from public.reading_content_chapters where id=substring(v_token from 4)::uuid;
    new.chapter_id:=v_row.id;new.work_id:=v_row.work_id;
  else new.chapter_id:=null;new.work_id:=null;
  end if;
  return new;
end $$;
revoke all on function public.hanami_fill_group_progress_identity() from public,anon,authenticated;
drop trigger if exists hanami_group_progress_identity on public.group_reading_progress;
create trigger hanami_group_progress_identity before insert or update on public.group_reading_progress
  for each row execute function public.hanami_fill_group_progress_identity();
commit;