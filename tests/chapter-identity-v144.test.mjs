import assert from "node:assert/strict";
import { createHash,randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
const values = new Map();
globalThis.localStorage = {
  getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),
  removeItem:key=>values.delete(key),key:i=>[...values.keys()][i],get length(){return values.size;},
};
const api = await import("../public/chapter-identity.js");
const progress = await import("../public/library-progress.js");
const backup = await import("../public/identity-backup.js");
await api.ready;
for(const name of ["chapter|hanami.es.olympus|remote|123","work|fuente|remote|中文","page|abc|index|0"]){
  const hash=createHash("sha1").update(Buffer.from("e0b1b4de294657a4967f6575cb0e71d9","hex")).update(name).digest().subarray(0,16);
  hash[6]=(hash[6]&15)|80;hash[8]=(hash[8]&63)|128;
  const hex=hash.toString("hex"),expected=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  assert.equal(api.uuidFor(name),expected);
}
const room="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",other="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const old={groupId:room,sourceId:"hanami.es.olympus",mangaUrl:"https://old.example/series/old",
  chapterUrl:"https://old.example/capitulo/123/old-slug",pageIndex:0,chapterNumber:7};
const current={...old,mangaUrl:"https://new.example/series/new",chapterUrl:"https://new.example/capitulo/123/new-slug"};
const first=api.withIdentity(old,{create:true}),second=api.withIdentity(current,{create:true});
assert.equal(first.chapterId,second.chapterId);assert.equal(first.pageId,second.pageId);
assert(api.samePage(old,current));assert(!api.samePage(old,{...current,groupId:other}));
assert(!api.samePage(old,{...current,sourceId:"another.source"}));
assert(!api.samePage(old,{...current,pageIndex:1}));
assert(!api.samePage({...old,chapterId:randomUUID(),recordIdentity:true},current),"stored IDs must beat equal URLs");
const unknown={...old,sourceId:"fixture.unknown",chapterUrl:"https://fixture/old"};
assert(!api.sameChapter(unknown,{...unknown,chapterUrl:"https://fixture/new",chapterNumber:7}),"never merge by number");
const item={id:"stable-local-book",sourceId:old.sourceId,url:old.mangaUrl,_chapters:[{url:old.chapterUrl,number:7}],
  _chapterMeta:{[old.chapterUrl]:{read:true,bookmark:true,lastPageRead:4}},readingProgress:{chapterUrl:old.chapterUrl,pageIndex:4,completed:false}};
progress.mergeFetchedChapterMetadata(item,[{url:current.chapterUrl,number:7}]);
assert.equal(item.readCount,1);assert(item._chapterMeta[current.chapterUrl].bookmark);
assert(item._chapterMeta[old.chapterUrl].read);assert(item._chapterMetaById[first.chapterId].read);
assert.equal(progress.chapterToContinue(item._chapters,item).chapter.url,current.chapterUrl);
progress.setChapterMetadata(item,item._chapters[0],{read:false},{explicitRead:true});
progress.mergeFetchedChapterMetadata(item,[{url:"https://third.example/capitulo/123/third",number:7}]);
assert.equal(item.readCount,0,"explicit mark-unread survives alias changes");
const conflictItem={id:"conflict",sourceId:old.sourceId,url:old.mangaUrl,_chapters:[{url:old.chapterUrl,number:7}],
  _chapterMeta:{[old.chapterUrl]:{read:true,bookmark:true},[current.chapterUrl]:{read:false,bookmark:false}}};
progress.mergeFetchedChapterMetadata(conflictItem,[{url:current.chapterUrl,number:7}]);
assert(conflictItem._identityConflicts[first.chapterId]);
progress.setChapterMetadata(conflictItem,conflictItem._chapters[0],{lastPageRead:2},{explicitRead:false});
assert(conflictItem._identityConflicts[first.chapterId],"partial reading must not discard conflicts");
assert(conflictItem._chapterMeta[old.chapterUrl].read,"partial reading must not overwrite historical read=true");
progress.setChapterMetadata(conflictItem,conflictItem._chapters[0],{read:false,bookmark:true},{explicitRead:true,explicitBookmark:true});
assert(!conflictItem._identityConflicts[first.chapterId]);
const older={...old,chapterUrl:"https://old.example/capitulo/999/old"};
await assert.rejects(()=>api.verifyAlias(older,current,{confirmed:false,pagesEquivalent:true}),/Confirma/);
await assert.rejects(()=>api.verifyAlias(older,{...current,sourceId:"other"},{confirmed:true,pagesEquivalent:true}),/fuentes distintas/);
const pendingBefore=JSON.stringify([{id:"pending-1",recordKey:"original-transport-key",state:"pending"}]);
localStorage.setItem("hanami-reader-music-group-outbox-v137",pendingBefore);
await api.verifyAlias(older,current,{confirmed:true,pagesEquivalent:true});
assert(api.samePage(older,current));
assert(!api.samePage({...older,groupId:other},{...current,groupId:other}),"a verified room alias cannot leak to other rooms");
assert.equal(localStorage.getItem("hanami-reader-music-group-outbox-v137"),pendingBefore);
api.registerPageLayout(current,2);api.registerPageLayout(current,3);
assert(!api.anchorsAllowed(current));
await api.verifyAlias(current,current,{confirmed:true,pagesEquivalent:true});
assert(api.anchorsAllowed(current));
const generic={groupId:room,sourceId:"fixture.canonical",mangaUrl:"https://fixture/book",chapterUrl:"https://fixture/chapter",pageIndex:0};
const provisional=api.withIdentity(generic,{create:true}),authoritative=randomUUID();
api.acceptRemoteAlias({group_id:room,source_id:generic.sourceId,work_ref:generic.mangaUrl,chapter_ref:generic.chapterUrl,
  chapter_id:authoritative,work_id:randomUUID(),remote_id:"",verified:false,updated_at:new Date().toISOString()});
assert.equal(api.resolveChapter(generic).id,authoritative);
assert(api.samePage({...generic,chapterId:provisional.chapterId,recordIdentity:true},generic),"reconcile provisional IDs without rekeying records");
assert(!backup.isReadingKey("hanami-supabase-session-v1"));
assert(!backup.isReadingKey("hanami-supabase-config-v1"));
assert(backup.isReadingKey("hanami-reader-music-group-outbox-v137"));
for(const path of ["../public/sw.js","../public/data-storage.js","../public/index.html"]){
 const text=await readFile(new URL(path,import.meta.url),"utf8");
 assert(text.includes(path.includes("sw")?"identity-backup.js":path.includes("index")?"identity-recovery.css":"data-identity-recovery"));
}
console.log("PASS: v144 stable UUIDs, domain/slug changes, scoped aliases, explicit unread, conflict preservation, pending keys, layout guard, canonical reconciliation and secret-free backup keys");