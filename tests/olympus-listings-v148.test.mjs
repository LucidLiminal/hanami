import assert from 'node:assert/strict';

const BASE='https://olympusxyz.com';
const row = id => ({id,name:`Obra ${id}`,slug:`obra-${id}`,cover:`/covers/${id}.webp`,type:'comic'});
const response = (url,payload,status=200,type='application/json') => ({
  ok:status>=200&&status<300,status,url,
  headers:new Headers({'content-type':type}),
  json:async()=>payload,text:async()=>typeof payload==='string'?payload:JSON.stringify(payload),
});
const envelope = (page,total=300) => ({
  data:Array.from({length:Math.max(0,Math.min(15,total-(page-1)*15))},(_,i)=>row((page-1)*15+i+1)),
  current_page:page,last_page:Math.max(1,Math.ceil(total/15)),total,per_page:15,
  next_page_url:page*15<total?`/api/rankings?column=total_ranking&page=${page+1}`:null,
});
let sequence=0;
const originalFetch=globalThis.fetch;
async function scenario(handler) {
  const calls=[];
  globalThis.fetch=async(value,options)=>{
    const url=new URL(value);calls.push(url);
    assert.equal(url.origin,BASE,'Listing requests stay on the public origin');
    assert(options.signal instanceof AbortSignal);
    return handler(url);
  };
  const {default:adapter,manifest}=await import(`../extensions/olympus/index.mjs?listings-v148=${++sequence}`);
  assert.equal(manifest.version,'1.6.0');
  return {adapter,calls};
}
function nuxt(payload) {
  const table=[null];
  function add(value) {
    const index=table.length;table.push(null);
    table[index]=Array.isArray(value)?value.map(add):value&&typeof value==='object'?
      Object.fromEntries(Object.entries(value).map(([key,child])=>[key,add(child)])):value;
    return index;
  }
  table[0]=['ShallowReactive',add(payload)];
  return `<main><a href="/series/comic-recommendation">Recommendation</a></main><script id="__NUXT_DATA__" type="application/json">${JSON.stringify(table)}</script>`;
}
try {
  let test=await scenario(url=>{
    const popular=url.pathname==='/api/rankings',page=Number(url.searchParams.get('page'));
    assert(popular||url.pathname==='/api/new-chapters');
    if(popular) {
      assert.equal(url.searchParams.get('period'),'total_ranking','Use the official public proxy parameter');
      assert(!url.searchParams.has('column'),'Do not follow the backend column-based next URL');
    }
    return response(url.href,envelope(page,popular?200:300));
  });
  for(const [mode,total,last] of [['popular',200,14],['latest',300,20]]) {
    const rows=[];let page=1,result;
    do {
      result=await test.adapter[mode]({page});
      assert.equal(result.page,page);
      assert.equal(result.lastPage,last);
      assert.equal(result.total,total);
      assert.equal(result.nextPage,page<last?page+1:null);
      rows.push(...result.mangas);page++;
    }while(result.hasNextPage);
    assert.equal(rows.length,total);
    assert.equal(new Set(rows.map(item=>item.url)).size,total);
    assert(rows.every(item=>item.remoteWorkId&&item.thumbnailUrl.startsWith(BASE)));
    assert.equal(page,last+1);
  }
  assert.equal(test.calls.length,34,'Only advertised pages are requested, including partial last pages');
  const {default:apiHandler}=await import('../api/index.mjs');
  async function apiList(operation,page,query=''){
    let status,payload;
    const res={status(value){status=value;return this},setHeader(){return this},json(value){payload=value;return this}};
    await apiHandler({method:'GET',query:{path:`source/hanami.es.olympus/${operation}`,page:String(page),q:query}},res);
    assert.equal(status,200);return payload;
  }
  const apiPopular=await apiList('popular',14),apiLatest=await apiList('latest',2);
  assert.equal(apiPopular.mangas.length,5);
  assert.equal(apiPopular.page,14);assert.equal(apiPopular.hasNextPage,false);assert.equal(apiPopular.total,200);
  assert.equal(apiLatest.page,2);assert.equal(apiLatest.nextPage,3);assert.equal(apiLatest.hasNextPage,true);
  assert(apiPopular.mangas.every(item=>item.sourceId==='hanami.es.olympus'));
  assert.equal(apiLatest.mangas[0].remoteWorkId,'16','The real API preserves source identity and page metadata');

  test=await scenario(url=>{
    assert.equal(url.pathname,'/api/series');
    assert.equal(url.searchParams.get('type'),'comic');
    const page=Number(url.searchParams.get('page'));
    return response(url.href,{data:{
      recommended_series:envelope(1,15),
      series:envelope(page,18),
    }});
  });
  const catalog=await test.adapter.search({query:'',page:2});
  assert.equal(catalog.mangas[0].remoteWorkId,'16');
  assert.equal(catalog.mangas.length,3);
  assert.equal(catalog.hasNextPage,false);
  assert(!catalog.mangas.some(item=>item.remoteWorkId==='1'),'Recommendations are not catalogue results');

  test=await scenario(url=>{
    assert.equal(url.pathname,'/api/series/list');
    return response(url.href,{data:Array.from({length:49},(_,i)=>({
      ...row(i),name:i<46?`Mecánico ${i}`:'Sin coincidencia',
    }))});
  });
  const matches=[];
  for(let page=1;page<=3;page++) {
    const result=await test.adapter.search({query:'mecanico',page});
    matches.push(...result.mangas);
    assert.equal(result.hasNextPage,page<3);
  }
  assert.equal(matches.length,46);
  assert(matches.every(item=>item.title.includes('Mecánico')));
  const apiSearch=await apiList('search',3,'mecanico');
  assert.equal(apiSearch.mangas.length,6);assert.equal(apiSearch.hasNextPage,false);

  for(const bad of [
    {}, {data:[row(1)]}, {...envelope(1),current_page:2},
    {...envelope(1),last_page:2.5}, {...envelope(1),data:[]},
    {...envelope(1),data:[{id:1}]},
    {...envelope(1),next_page_url:'https://foreign.invalid/list?page=2'},
    {...envelope(1),next_page_url:'/api/new-chapters?page=4'},
    {...envelope(1,1),next_page_url:'/api/new-chapters?page=2'},
  ]) {
    test=await scenario(url=>response(url.href,bad));
    await assert.rejects(()=>test.adapter.latest({page:1}),error=>error.kind==='source_invalid_response');
    assert.equal(test.calls.length,1,'Corrupt JSON metadata is not hidden by unrelated HTML results');
  }
  for(const status of [403,429,520]) {
    test=await scenario(url=>response(url.href,{},status));
    await assert.rejects(()=>test.adapter.popular({page:1}),new RegExp(`HTTP ${status}`));
    assert.equal(test.calls.length,1,'Do not silently scrape the homepage on an upstream outage');
  }
  test=await scenario(url=>response(url.href,{...envelope(1,0),data:[]}));
  assert.equal((await test.adapter.latest()).hasNextPage,false);

  test=await scenario(url=>{
    if(url.pathname.startsWith('/api/'))return response(url.href,{},404);
    assert.equal(url.pathname,'/capitulos');
    const page=Number(url.searchParams.get('page'));
    return response(url.href,nuxt({data:{new_chapters:envelope(page,17)}}),200,'text/html');
  });
  const ssr=await test.adapter.latest({page:2});
  assert.deepEqual(ssr.mangas.map(item=>item.remoteWorkId),['16','17']);
  assert.equal(ssr.hasNextPage,false);
  assert.equal(ssr.total,17,'SSR fallback preserves the real pagination envelope, not arbitrary links');

  test=await scenario(url=>{
    if(url.pathname.startsWith('/api/'))return response(url.href,'legacy html route',200,'text/html');
    assert.equal(url.pathname,'/rankings');
    return response(url.href,'<main><a href="/series/comic-legacy"><img src="/legacy.webp" alt="Legacy"></a><a href="/rankings?page=2">Siguiente</a><a href="/capitulos?page=3">Otro listado</a></main>',200,'text/html');
  });
  const legacy=await test.adapter.popular({page:1});
  assert.equal(legacy.mangas.length,1);
  assert.equal(legacy.hasNextPage,true);
  assert(test.calls.every(url=>url.pathname!=='/'),'Never substitute the homepage carousel');
  console.log('PASS: Olympus v148 paginates 200 genuine ranking / 300 recent fixtures, validates metadata, filters searches and safely decodes SSR fallback');
}finally{globalThis.fetch=originalFetch;}