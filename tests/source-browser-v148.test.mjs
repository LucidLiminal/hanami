import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SourcePageBuffer, mangaKeys, savedMangaKeys, normalizeMangaUrl} from '../public/source-browser.js';

const source = 'fixture';
const item = (id, extra={}) => ({
  id:`/series/${id}`, remoteWorkId:String(id), url:`https://fixture.test/series/${id}`,
  title:`Obra ${id}`, sourceId:source, ...extra,
});
const page = (n, total=247) => ({
  mangas:Array.from({length:Math.max(0,Math.min(15,total-(n-1)*15))},(_,i)=>item((n-1)*15+i+1)),
  hasNextPage:n*15<total, page:n, nextPage:n*15<total?n+1:null, total,
});

let buffer = new SourcePageBuffer(source);
for(let n=1;n<=17;n++) buffer.append(page(n),n);
assert.equal(buffer.items.length,247,'No arbitrary 15/200-result cap');
assert.equal(buffer.page,17);
assert.equal(buffer.hasNextPage,false);
assert.equal(buffer.total,247);
assert.equal(new Set(buffer.items.map(row=>row.url)).size,247);
assert.deepEqual(buffer.items.map(row=>row.remoteWorkId),Array.from({length:247},(_,i)=>String(i+1)));

buffer = new SourcePageBuffer(source);
buffer.append({mangas:[item(1),item(2)],hasNextPage:true},1);
const added = buffer.append({
  mangas:[item(2),item(1,{url:'https://fixture.test/renamed-1'}),item(3)],hasNextPage:false,
},2);
assert.deepEqual(added.map(row=>row.remoteWorkId),['3']);
assert.equal(buffer.items.length,3,'Overlaps and source-scoped remote IDs deduplicate');
assert.equal(buffer.items[1].remoteWorkId,'2','Already rendered indexes stay stable');

for(const response of [
  null, {}, {mangas:{}}, {mangas:[],page:2}, {mangas:[],hasNextPage:'true'},
  {mangas:[],hasNextPage:true}, {mangas:[{}]},
  {mangas:[item(1)],hasNextPage:true,nextPage:7},
]) {
  const test = new SourcePageBuffer(source);
  assert.throws(()=>test.append(response,1));
  assert.equal(test.page,0,'Rejected pages never advance the retry cursor');
  assert.equal(test.items.length,0);
}
buffer = new SourcePageBuffer(source);
buffer.append({mangas:[item(1),item(2)],hasNextPage:true},1);
assert.throws(()=>buffer.append({mangas:[item(2),item(1)],hasNextPage:true},2),/repitió/);
assert.equal(buffer.page,1);
buffer.append({mangas:[item(3)],hasNextPage:false},2);
assert.equal(buffer.page,2,'The same failed cursor can succeed on Retry');

buffer = new SourcePageBuffer(source);
buffer.append({mangas:[item(1),item(2),item(3),item(4)],hasNextPage:true},1);
buffer.append({mangas:[item(1)],hasNextPage:true},2);
buffer.append({mangas:[item(2)],hasNextPage:true},3);
assert.throws(()=>buffer.append({mangas:[item(3)],hasNextPage:true},4),/no aportó/);
assert.equal(buffer.page,3);

buffer = new SourcePageBuffer(source);
buffer.append({mangas:[],hasNextPage:false},1);
assert.equal(buffer.items.length,0);
assert.equal(buffer.hasNextPage,false);
buffer = new SourcePageBuffer('hanami.local');
buffer.append({mangas:[item(1,{sourceId:'hanami.local',url:'hanami-local://series/one'})]},1);
assert.equal(buffer.hasNextPage,false,'Legacy/local extensions may omit pagination metadata');

assert.equal(normalizeMangaUrl('/series/one/#reader','https://fixture.test/'),'https://fixture.test/series/one');
assert.notEqual(normalizeMangaUrl('/one?edition=a'),normalizeMangaUrl('/one?edition=b'));
const identity = ref => ref.mangaUrl?.includes('verified-alias')?'work-verified':'';
const library = [
  item(1,{favorite:true}), item(2,{favorite:false}), item(3,{sourceId:'different-source',favorite:true}),
  item(4,{workId:'work-verified'}), item(5,{url:'https://fixture.test/new-slug',favorite:true}),
  item(6,{title:'Título coincidente'}),
];
const saved = savedMangaKeys(library,source,identity);
const exists = manga => mangaKeys(manga,source,identity).some(key=>saved.has(key));
assert(exists(item(1,{url:'https://fixture.test/series/1/#x'})));
assert(!exists(item(2)),'History-only records are not saved works');
assert(!exists(item(3)),'Other sources do not mark this source as saved');
assert(exists(item(40,{url:'https://fixture.test/verified-alias'})),'Verified aliases match without writing identities');
assert(exists(item(5,{url:'https://fixture.test/old-slug'})),'Remote IDs survive a slug change');
assert(!exists(item(60,{title:'Título coincidente'})),'Titles alone never identify saved works');
assert.deepEqual(mangaKeys(item(1,{sourceId:'another'}),source),[]);
assert.equal(savedMangaKeys(null,source).size,0);

const [html,app,css,sw,pkg] = await Promise.all(
  ['public/index.html','public/app.js','public/browse-tab.css','public/sw.js','package.json']
    .map(file=>readFile(new URL('../'+file,import.meta.url),'utf8')),
);
const toolbar = html.match(/<div class="toolbar browse-source-appbar"[\s\S]*?<\/div>/)?.[0]||'';
assert(toolbar.includes('id="sourceQuery"'));
assert(toolbar.includes('id="sourceSearchForm"'));
assert(!html.includes('data-source-search'));
assert(!app.includes("hasAttribute('data-source-search')"));
assert(app.includes("$('#sourceSearchForm').addEventListener('submit'"));
assert(html.includes('data-source-popular')&&html.includes('data-source-latest'));
assert(css.includes('.source-card.in-library'));
assert(css.includes('.source-saved-badge[hidden]{display:none}'));
assert(sw.includes("'/source-browser.js'"));
assert(sw.includes('hanami-crimson-knot-v149'));
assert.equal(JSON.parse(pkg).version,'5.23.0');
console.log('PASS: v148 source pages accumulate 247 unique works, preserve retry cursors and mark only verified personal-library matches');