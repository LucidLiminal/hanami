const CACHE='hanami-covers-v1',META_KEY='hanami-cover-cache-meta-v1';
const DAY=864e5,DEFAULTS={maxEntries:400,maxBytes:128*1024*1024,hardMaxEntries:800,hardMaxBytes:256*1024*1024,transientMaxAge:30*DAY};
const pending=new Map;
const blocked=/(?:^|\.)(?:up\.swordflake\.com|swiwetduchan\.shop|frisiansnoutedpuka\.cyou)$/i;
const read=()=>{try{return JSON.parse(localStorage.getItem(META_KEY)||'[]')}catch{return[]}};
const write=value=>localStorage.setItem(META_KEY,JSON.stringify(value));
const sizeOf=entry=>Math.max(0,Number(entry.size)||128*1024);
const totalSize=entries=>entries.reduce((sum,entry)=>sum+sizeOf(entry),0);

export function planCoverEvictions(entries,{now=Date.now(),activeUrls=[],...limits}={}){
  const policy={...DEFAULTS,...limits},active=new Set(activeUrls),rows=entries.map(entry=>({...entry,pinned:active.has(entry.url)})),removed=new Set;
  const candidates=()=>rows.filter(entry=>!removed.has(entry.url));
  rows.filter(entry=>!entry.pinned&&now-(Number(entry.lastAccess)||0)>policy.transientMaxAge).forEach(entry=>removed.add(entry.url));
  const evict=(hard=false)=>{
    const available=candidates().filter(entry=>hard||!entry.pinned).sort((a,b)=>(Number(a.lastAccess)||0)-(Number(b.lastAccess)||0));
    const maxEntries=hard?policy.hardMaxEntries:policy.maxEntries,maxBytes=hard?policy.hardMaxBytes:policy.maxBytes;
    while((candidates().length>maxEntries||totalSize(candidates())>maxBytes)&&available.length)removed.add(available.shift().url);
  };
  evict(false);evict(true);
  return[...removed];
}

function activeCoverUrls(){
  try{return new Set((JSON.parse(localStorage.getItem('hanami-library')||'[]')||[]).filter(item=>item.favorite!==false).map(item=>item.thumbnailUrl).filter(Boolean).map(url=>new URL(String(url),location.href).href))}catch{return new Set}
}
function eligible(url,img){
  if(!url||/^(?:blob:|data:)/i.test(url)||img?.closest?.('#reader,.reader,[data-reader-pages]'))return false;
  let parsed;try{parsed=new URL(url,location.href)}catch{return false}
  if(parsed.origin===location.origin&&parsed.pathname.startsWith('/assets/'))return false;
  return!blocked.test(parsed.hostname);
}
async function responseSize(response){
  const declared=Number(response.headers.get('content-length'));if(declared>0)return declared;
  if(response.type!=='opaque')try{return(await response.clone().blob()).size||0}catch{}
  return 128*1024;
}
function touch(url,{pinned=false,size}={}){
  const rows=read(),index=rows.findIndex(entry=>entry.url===url),previous=index>=0?rows[index]:{};
  const next={...previous,url,lastAccess:Date.now(),createdAt:previous.createdAt||Date.now(),pinned:!!(pinned||previous.pinned),size:Number(size)||previous.size||128*1024};
  if(index>=0)rows[index]=next;else rows.push(next);write(rows);return next
}
async function prune(){
  if(!('caches'in globalThis))return[];
  const active=activeCoverUrls(),rows=read().map(entry=>({...entry,pinned:active.has(entry.url)})),estimate=await navigator.storage?.estimate?.().catch?.(()=>null),pressure=estimate?.quota&&estimate.usage/estimate.quota>.82;
  const limits=pressure?{maxEntries:240,maxBytes:80*1024*1024}: {},urls=planCoverEvictions(rows,{activeUrls:active,...limits}),cache=await caches.open(CACHE);
  await Promise.all(urls.map(url=>cache.delete(url)));write(rows.filter(entry=>!urls.includes(entry.url)));return urls
}
async function warm(url,{pinned=false}={}){
  url=String(url||'');if(!eligible(url)||!('caches'in globalThis))return false;
  if(pending.has(url))return pending.get(url);
  const task=(async()=>{const cache=await caches.open(CACHE),hit=await cache.match(url,{ignoreVary:true});if(hit){touch(url,{pinned});return true}const remote=new URL(url,location.href),response=await fetch(remote.href,{mode:remote.origin===location.origin?'same-origin':'no-cors',credentials:remote.origin===location.origin?'same-origin':'omit',cache:'no-cache'});if(response.type!=='opaque'&&!response.ok)throw Error(`Cover HTTP ${response.status}`);const size=await responseSize(response);await cache.put(remote.href,response.clone());touch(remote.href,{pinned,size});await prune();return true})().catch(()=>false).finally(()=>pending.delete(url));
  pending.set(url,task);return task
}
function scan(root=document){
  const active=activeCoverUrls(),images=root.matches?.('img')?[root]:[...root.querySelectorAll?.('img')||[]];
  for(const img of images){const url=img.currentSrc||img.src;if(!eligible(url,img)||img.dataset.hanamiCoverCache===url)continue;img.dataset.hanamiCoverCache=url;img.classList.add('hanami-cover');const ready=()=>img.classList.add('hanami-cover-ready');img.complete&&img.naturalWidth?ready():img.addEventListener('load',ready,{once:true});const pinned=active.has(url)||active.has(img.getAttribute('src'));(globalThis.requestIdleCallback||setTimeout)(()=>warm(url,{pinned}),{timeout:1800})}
}
async function clear({preserveLibrary=true}={}){
  if(!('caches'in globalThis))return 0;const active=activeCoverUrls(),cache=await caches.open(CACHE),rows=read(),remove=rows.filter(entry=>!preserveLibrary||!active.has(entry.url));await Promise.all(remove.map(entry=>cache.delete(entry.url)));write(rows.filter(entry=>!remove.includes(entry)).map(entry=>({...entry,pinned:active.has(entry.url)})));return remove.length
}
async function stats(){const rows=read(),active=activeCoverUrls();return{entries:rows.length,pinned:rows.filter(entry=>active.has(entry.url)).length,bytes:totalSize(rows),cacheName:CACHE}}
async function invalidate(url){if(!url||!('caches'in globalThis))return false;const cache=await caches.open(CACHE),removed=await cache.delete(url);write(read().filter(entry=>entry.url!==url));return removed}
function reconcile(){const active=activeCoverUrls();write(read().map(entry=>({...entry,pinned:active.has(entry.url)})));scan();prune()}

if(typeof window!=='undefined'){
  window.HanamiCoverCache={warm,scan,clear,stats,prune,invalidate,reconcile,cacheName:CACHE};
  const start=()=>{scan();new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===1)scan(node)}))).observe(document.body,{childList:true,subtree:true});addEventListener('hanami-library-change',reconcile);setTimeout(reconcile,900)};
  document.readyState==='loading'?addEventListener('DOMContentLoaded',start,{once:true}):start();
}