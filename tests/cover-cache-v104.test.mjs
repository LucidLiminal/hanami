import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import{planCoverEvictions}from'../public/cover-cache.js';
const now=40*864e5,active='https://covers.test/library.webp',rows=[
 {url:active,lastAccess:1,size:90,pinned:true},
 {url:'https://covers.test/expired.webp',lastAccess:1,size:20},
 {url:'https://covers.test/recent-a.webp',lastAccess:now-100,size:20},
 {url:'https://covers.test/recent-b.webp',lastAccess:now-50,size:20},
];
const expired=planCoverEvictions(rows,{now,activeUrls:[active],transientMaxAge:30*864e5,maxEntries:99,maxBytes:999,hardMaxEntries:99,hardMaxBytes:999});
assert.deepEqual(expired,['https://covers.test/expired.webp']);
const pressured=planCoverEvictions(rows.slice(2),{now,activeUrls:[],transientMaxAge:Infinity,maxEntries:1,maxBytes:999,hardMaxEntries:99,hardMaxBytes:999});assert.deepEqual(pressured,['https://covers.test/recent-a.webp']);
const protectedLibrary=planCoverEvictions(rows,{now,activeUrls:[active],transientMaxAge:Infinity,maxEntries:1,maxBytes:10,hardMaxEntries:99,hardMaxBytes:999});assert(!protectedLibrary.includes(active),'una portada activa de Biblioteca sobrevive al límite blando');
const [cover,sw,data,index,css,pkgText]=await Promise.all(['../public/cover-cache.js','../public/sw.js','../public/data-storage.js','../public/index.html','../public/styles.css','../package.json'].map(x=>readFile(new URL(x,import.meta.url),'utf8'))),pkg=JSON.parse(pkgText);
for(const token of ["CACHE='hanami-covers-v1'",'maxEntries:400','maxBytes:128*1024*1024','hardMaxEntries:800','transientMaxAge:30*DAY','MutationObserver','hanami-library-change','blocked.test','overscroll'])if(token!=='overscroll')assert(cover.includes(token),token);
for(const token of ["COVER_CACHE='hanami-covers-v1'","e.request.destination==='image'","c.match(e.request,{ignoreVary:true})","e.request.destination!=='image'","k!==COVER_CACHE"])assert(sw.includes(token),token);
for(const token of ['Portadas (${u.covers.entries}','data-data-clear-covers','data-data-preserve-library','data-data-clear-covers-confirm'])assert(data.includes(token),token);
assert(index.includes('/cover-cache.js'));assert(css.includes('.hanami-cover:not(.hanami-cover-ready)')&&css.includes('@media(prefers-reduced-motion:reduce)'));assert(sw.includes('hanami-crimson-knot-v134'));assert.equal(pkg.version,'5.8.67');assert(pkg.scripts.test.includes('node tests/cover-cache-v104.test.mjs'));
console.log('PASS: cover cache is offline-first, library-aware, size/age bounded, observable and independently clearable');
