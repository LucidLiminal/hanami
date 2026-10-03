import { chapterContext, prepareChapters, resolveChapter, sameChapter } from './chapter-identity.js';

export function chapterNumber(chapter) {
  const direct = Number(chapter?.number ?? chapter?.chapterNumber);
  if (Number.isFinite(direct)) return direct;
  const hit = String(chapter?.name ?? '').match(/(?:cap(?:ítulo)?\s*)?(\d+(?:\.\d+)?)/i);
  return hit ? Number(hit[1]) : Number.NaN;
}
export function readingOrder(chapters) {
  return [...(chapters || [])].map((chapter,index)=>({chapter,index,n:chapterNumber(chapter)}))
    .sort((a,b)=>Number.isFinite(a.n)&&Number.isFinite(b.n)?a.n-b.n:b.index-a.index).map(x=>x.chapter);
}
function findChapter(chapters,item,progress) {
  const wanted=chapterContext(item,{url:progress.chapterUrl,chapterId:progress.chapterId});
  const stable=(chapters||[]).find(ch=>sameChapter(chapterContext(item,ch),wanted));
  const exact=(chapters||[]).find(ch=>ch.url===progress.chapterUrl && progress.chapterUrl);
  if(stable||exact)return stable||exact;
  // Historical resume fallback only, not a migration/annotation identity.
  if(progress.chapterNumber==null)return null;
  const numbered=(chapters||[]).filter(ch=>chapterNumber(ch)===Number(progress.chapterNumber));
  return numbered.length===1?numbered[0]:null;
}
export function nextUnreadChapter(chapters,item={}) {
  const ordered=readingOrder(chapters); if(!ordered.length)return null;
  const current=findChapter(ordered,item,{chapterUrl:item.lastReadChapterUrl,chapterId:item.lastReadChapterId,chapterNumber:item.lastReadChapterNumber});
  let index=current?ordered.indexOf(current):-1;
  if(index<0&&Number(item.readCount)>0)index=Math.min(ordered.length-1,Number(item.readCount)-1);
  return ordered[index+1]??(index<0?ordered[0]:null);
}
export function chapterToContinue(chapters,item={}) {
  const progress=item.readingProgress;
  if(progress&&!progress.completed){const current=findChapter(chapters,item,progress);if(current)return{chapter:current,resume:true};}
  const next=nextUnreadChapter(chapters,item);return next?{chapter:next,resume:false}:null;
}
export function applyReadProgress(item,chapters,chapter,{recordHistory=true}={}) {
  const ordered=readingOrder(chapters),position=ordered.findIndex(x=>x.url===chapter.url||sameChapter(chapterContext(item,x),chapterContext(item,chapter)));
  item.started=true;
  if(recordHistory){item.lastRead=Date.now();item.lastReadChapterUrl=chapter.url;item.lastReadChapterNumber=chapterNumber(chapter);if(chapter.chapterId)item.lastReadChapterId=chapter.chapterId;}
  if(position>=0)item.readCount=Math.max(Number(item.readCount)||0,position+1);
  item.totalChapters=ordered.length;item.unreadCount=Math.max(0,ordered.length-(Number(item.readCount)||0));return item;
}
export function matchingChapterIndexes(chapters,chapter) {
  const number=chapterNumber(chapter);if(!Number.isFinite(number)||number<0)return[];
  return(chapters||[]).map((candidate,index)=>chapterNumber(candidate)===number?index:-1).filter(index=>index>=0);
}
function identityId(item,chapter){return resolveChapter(chapterContext(item,chapter))?.id||'';}
function chooseMetadata(candidates,currentUrl) {
  const rows=candidates.filter(row=>row.meta&&typeof row.meta==='object');if(!rows.length)return{meta:null,conflict:false};
  let value={...rows[0].meta};for(const{meta}of rows)if((Number(meta.lastReadAt)||0)>(Number(value.lastReadAt)||0))value={...value,...meta};
  let conflict=false;const fields=[];
  for(const field of ['read','bookmark']){
    const stamp=field==='read'?'readStateUpdatedAt':'bookmarkStateUpdatedAt';
    const explicit=rows.filter(row=>Number(row.meta[stamp])>0).sort((a,b)=>Number(b.meta[stamp])-Number(a.meta[stamp]));
    if(explicit.length){value[field]=!!explicit[0].meta[field];value[stamp]=explicit[0].meta[stamp];continue;}
    const real=rows.filter(row=>!row.meta._identityDefault&&Object.hasOwn(row.meta,field));
    const values=new Set(real.map(row=>!!row.meta[field]));
    if(values.size>1){conflict=true;fields.push(field);const current=real.find(row=>row.url===currentUrl);value[field]=!!(current||real[0]).meta[field];}
    else if(real.length)value[field]=!!real[0].meta[field];
  }
  if(rows.some(row=>!row.meta._identityDefault))delete value._identityDefault;
  return{meta:value,conflict,fields};
}
export function readChapterMetadata(item={},chapter={}) {
  const id=identityId(item,chapter);return(id&&item._chapterMetaById?.[id])||item._chapterMeta?.[chapter.url]||{};
}
export function setChapterMetadata(item,chapter,changes,{explicitRead=false,explicitBookmark=false}={}) {
  prepareChapters(item,[chapter]);item._chapterMeta||={};item._chapterMetaById||={};
  const id=identityId(item,chapter),next={...readChapterMetadata(item,chapter),...changes};delete next._identityDefault;
  const conflict=item._identityConflicts?.[id],fields=conflict?.fields||['read','bookmark'];
  if(explicitRead)next.readStateUpdatedAt=Date.now();if(explicitBookmark)next.bookmarkStateUpdatedAt=Date.now();
  item._chapterMeta[chapter.url]=next;
  if(id){
    item._chapterMetaById[id]=next;
    for(const url of Object.keys(item._chapterMeta))if(identityId(item,{url})===id){
      if(!conflict){item._chapterMeta[url]=next;continue;}
      const prior=item._chapterMeta[url],mirrored={...prior,...next};
      if(fields.includes('read')&&!explicitRead){mirrored.read=prior.read;if(prior.readStateUpdatedAt)mirrored.readStateUpdatedAt=prior.readStateUpdatedAt;else delete mirrored.readStateUpdatedAt;}
      if(fields.includes('bookmark')&&!explicitBookmark){mirrored.bookmark=prior.bookmark;if(prior.bookmarkStateUpdatedAt)mirrored.bookmarkStateUpdatedAt=prior.bookmarkStateUpdatedAt;else delete mirrored.bookmarkStateUpdatedAt;}
      item._chapterMeta[url]=mirrored;
    }
    if(conflict){
      const unresolved=fields.filter(field=>field==='read'?!explicitRead:!explicitBookmark);
      if(unresolved.length)conflict.fields=unresolved;else delete item._identityConflicts[id];
    }
  }
  return next;
}
export function mergeFetchedChapterMetadata(item,chapters,{markNewDuplicates=false}={}) {
  const previous=item?._chapters||[],meta=item?._chapterMeta||{};
  const readNumbers=new Set(previous.filter(chapter=>meta[chapter.url]?.read).map(chapterNumber).filter(number=>Number.isFinite(number)&&number>=0));
  prepareChapters(item,previous);prepareChapters(item,chapters||[]);prepareChapters(item,Object.keys(meta).map(url=>({url})));
  item._chapterMeta=meta;item._chapterMetaById||={};item._identityConflicts||={};const candidates=new Map();
  for(const[url,value]of Object.entries(meta)){const id=identityId(item,{url});if(!id)continue;const list=candidates.get(id)||[];list.push({url,meta:value});candidates.set(id,list);}
  for(const chapter of chapters||[]){
    const id=identityId(item,chapter),list=[...(candidates.get(id)||[])];if(id&&item._chapterMetaById[id])list.push({url:'',meta:item._chapterMetaById[id]});
    const merged=chooseMetadata(list,chapter.url);let value=merged.meta||meta[chapter.url];
    if(!value){const number=chapterNumber(chapter);value={read:!!(markNewDuplicates&&Number.isFinite(number)&&readNumbers.has(number)),bookmark:false,_identityDefault:true};}
    // Preserve all ambiguous historical candidates instead of OR-ing read=true.
    if(merged.conflict&&id)item._identityConflicts[id]={chapterUrl:chapter.url,candidates:list,fields:merged.fields};
    meta[chapter.url]=value;if(id)item._chapterMetaById[id]=value;
  }
  item._chapters=chapters||[];item.totalChapters=item._chapters.length;
  item.readCount=item._chapters.filter(chapter=>readChapterMetadata(item,chapter)?.read).length;item.unreadCount=Math.max(0,item.totalChapters-item.readCount);
  if(item.readingProgress){const current=findChapter(item._chapters,item,item.readingProgress);if(current?.chapterId)item.readingProgress.chapterId=current.chapterId;}
  return item;
}
export function clampProgress(pageIndex,pageOffset,pageCount){return{pageIndex:Math.max(0,Math.min(Math.max(0,pageCount-1),Number(pageIndex)||0)),pageOffset:Math.max(0,Math.min(1,Number(pageOffset)||0))};}
export {prepareChapters,chapterContext,sameChapter};
