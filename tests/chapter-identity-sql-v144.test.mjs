import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const { PGlite } = await import(process.env.PGLITE_PATH || "@electric-sql/pglite");
const db=new PGlite();
const owner="11111111-1111-4111-8111-111111111111",member="22222222-2222-4222-8222-222222222222",outsider="33333333-3333-4333-8333-333333333333";
const group="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",other="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const source="hanami.es.olympus",oldWork="https://old.example/series/old",newWork="https://new.example/series/new";
const oldChapter="https://old.example/capitulo/123/old",newChapter="https://new.example/capitulo/123/new";
const page=(chapter,work=oldWork,room=group,index=0)=>JSON.stringify([room,source,work,chapter,index]);
const track={url:"https://soundcloud.com/fixture/track",title:"Fixture",artist:"Fixture",artwork:"",duration:10};
async function as(user,fn){await db.exec("set role authenticated");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);try{return await fn();}finally{await db.exec("reset role");await db.query("select set_config('request.jwt.claim.sub','',false)");}}
async function register(chapter,work=newWork,id=randomUUID(),workId=randomUUID(),room=group){
 return(await db.query("select public.register_group_chapter_identity($1::uuid,$2,$3,$4,$5::uuid,$6::uuid,$7,$8) as result",[room,source,work,chapter,id,workId,"","work"])).rows[0].result;
}
async function list(chapter,work=newWork,room=group){return(await db.query("select * from public.list_group_reader_music_pins_v144($1::uuid,$2::jsonb)",[room,JSON.stringify([page(chapter,work,room)])])).rows;}
try{
 await db.exec(`
 create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
 grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
 create table profiles(id uuid primary key,display_name text);
 create table reading_groups(id uuid primary key,owner_id uuid references profiles(id));
 create table reading_group_members(group_id uuid,user_id uuid,role text,state text,primary key(group_id,user_id));
 create function is_group_member(target_group uuid) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from reading_group_members where group_id=target_group and user_id=auth.uid() and state='active');$$;
 create function can_post_to_group(target_group uuid) returns boolean language sql stable security definer set search_path=public as $$select is_group_member(target_group);$$;
 create function can_manage_group(target_group uuid) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from reading_group_members where group_id=target_group and user_id=auth.uid() and state='active' and role in('owner','moderator'));$$;
 create table reader_comments(id uuid primary key,group_id uuid,author_id uuid,page_key text,x float8,y float8,width float8,text text,revision bigint,created_at timestamptz,updated_at timestamptz,deleted_at timestamptz);
 create table group_library_entries(id uuid primary key,group_id uuid,source_id text,manga_url text);
 create table group_reading_progress(group_id uuid,entry_id uuid,user_id uuid,chapter_url text,chapter_number text,page_index int,completed boolean,updated_at timestamptz);
 `);
 for(const user of [owner,member,outsider])await db.query("insert into profiles values($1,'Fixture')",[user]);
 await db.query("insert into reading_groups values($1,$2),($3,$4)",[group,owner,other,outsider]);
 for(const [room,user,role]of [[group,owner,"owner"],[group,member,"member"],[other,outsider,"owner"]])await db.query("insert into reading_group_members values($1,$2,$3,'active')",[room,user,role]);
 const musicMigration=await readFile(new URL("../supabase/hanami-group-reader-music-v137.sql",import.meta.url),"utf8");
 await db.exec(musicMigration);
 const pinId=randomUUID(),commentId=randomUUID();
 const pin=await as(owner,async()=> (await db.query("select (upsert_group_reader_music_pin($1::uuid,$2::uuid,$3,$4::float8,$5::float8,$6::jsonb,$7::bigint)).*",[group,pinId,page(oldChapter),.2,.3,JSON.stringify(track),1])).rows[0]);
 await db.query("insert into reader_comments values($1,$2,$3,$4,.2,.3,.4,'Preserved',7,'2026-01-01','2026-01-02',null)",[commentId,group,owner,`${source}|${oldWork}|${oldChapter}|0`]);
 const identityMigration=await readFile(new URL("../supabase/hanami-chapter-identity-v144.sql",import.meta.url),"utf8");
 await db.exec(identityMigration);await db.exec(identityMigration);
 const before=(await db.query("select * from reader_comments where id=$1",[commentId])).rows[0];
 assert.equal(before.revision,7);assert.equal(before.page_key,`${source}|${oldWork}|${oldChapter}|0`);
 assert.equal((await db.query("select count(*)::int as n from hanami_recovery.reader_comments_before_v144")).rows[0].n,1);
 await as(member,async()=>{
  const first=await register(newChapter);const retry=await register(newChapter);
  assert.equal(first.chapter_id,retry.chapter_id);
  const oldAlias=await register(oldChapter,oldWork);
  assert.equal(oldAlias.chapter_id,first.chapter_id);
  const rows=await list(newChapter);assert.equal(rows.length,1);assert.equal(rows[0].id,pinId);
  assert.equal(rows[0].page_key,pin.page_key);assert.equal(rows[0].revision,1);assert.equal(String(rows[0].created_at),String(pin.created_at));
  await assert.rejects(()=>db.query("select * from reading_content_chapters"),/permission denied/);
  await assert.rejects(()=>db.query("select * from hanami_recovery.reader_comments_before_v144"),/permission denied/);
  await assert.rejects(()=>db.query("select verify_group_chapter_alias($1::uuid,$2,$3,$4,$5,$6,true,'review')",[group,source,oldWork,"https://old.example/capitulo/999/old",newWork,newChapter]),/owner or moderator/);
 });
 await as(owner,async()=>{
  await db.query("select verify_group_chapter_alias($1::uuid,$2,$3,$4,$5,$6,true,'Explicit owner review')",[group,source,oldWork,"https://old.example/capitulo/999/old",newWork,newChapter]);
  assert.equal((await list("https://old.example/capitulo/999/old",oldWork)).length,1);
  await assert.rejects(()=>db.query("select verify_group_chapter_alias($1::uuid,$2,$3,$4,$5,$6,false,'')",[group,source,oldWork,"https://old.example/capitulo/998/old",newWork,newChapter]),/Page equivalence/);
  await assert.rejects(()=>db.query("select * from list_group_reader_music_pins_v144($1::uuid,$2::jsonb)",[group,JSON.stringify([page(newChapter,newWork,other)])]),/group scope/);
  await assert.rejects(()=>db.query("select * from list_group_reader_music_pins_v144($1::uuid,$2::jsonb)",[group,JSON.stringify(Array(101).fill(page(newChapter,newWork)))]),/Invalid music page batch/);
 });
 await as(outsider,async()=>{
  await assert.rejects(()=>list(newChapter),/Group access/);
  await assert.rejects(()=>register(newChapter),/Group access/);
  await assert.rejects(()=>db.query("select * from list_group_chapter_aliases($1::uuid,0,250)",[group]),/Group access/);
 });
 await db.query("update reader_comments set text=text where id=$1",[commentId]);
 const after=(await db.query("select * from reader_comments where id=$1",[commentId])).rows[0];
 assert(after.chapter_id);assert.equal(after.revision,before.revision);assert.equal(after.page_key,before.page_key);
 assert.equal(String(after.updated_at),String(before.updated_at));assert.equal(after.text,before.text);
 console.log("PASS: v144 PostgreSQL migrations idempotent; private snapshots, authoritative IDs, historical music lookup, owner-only verification, scope isolation and unchanged transport/revision/timestamps");
}finally{await db.close();}