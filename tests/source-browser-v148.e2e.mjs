import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

// Full real app and history. Only source/network responses are fixtures.
const publicRoot=fileURLToPath(new URL('../public/',import.meta.url));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,'http://localhost');
    const filename=path.resolve(publicRoot,'.'+(path.extname(u.pathname)?u.pathname:'/index.html'));
    if(!filename.startsWith(publicRoot))throw Error('Invalid path');
    const data=await fs.readFile(filename);
    res.writeHead(200,{'content-type':mime[path.extname(filename)]||'application/octet-stream'});res.end(data);
  }catch{res.writeHead(404);res.end('not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/local/bin/chromium',args:['--no-sandbox']});
const qaDir=process.env.HANAMI_QA_DIR;
const titles=['El Mago de Décima Clase','Supremacía de la Supervivencia','Sistema de cultivo del demonio celestial','El Dios Marcial que Regresó al nivel 2','No me interesa ser el sucesor; mejor me dedicaré a sanar.','La Regresión Inigualable del Caza Dragones','El extra de la novela (remake)','¡Nigromante! ¡Yo soy la plaga!'];
const manga=(index,sourceId='s1',query='')=>({
  id:`remote-${index}`,remoteWorkId:String(index),sourceId,
  url:`https://fixture.test/${query?'search/'+encodeURIComponent(query)+'/':''}series/work-${index}`,
  title:query?`${query} · ${index+1}`:`${sourceId==='s2'?'Otra fuente · ':''}${titles[index%titles.length]}${index>=8?' · '+(index+1):''}`,
  thumbnailUrl:qaDir?`/fixture-cover/${index%8}.webp`:'/assets/fallen.webp',
});
let passes=0;
function pass(width,name){passes++;console.log(`PASS ${width} ${name}`);}
async function freeze(page,name){
  if(!qaDir)return;
  await fs.mkdir(qaDir,{recursive:true});
  const cssFiles=await page.locator('link[rel="stylesheet"]').evaluateAll(nodes=>nodes.map(node=>new URL(node.href).pathname));
  let css=(await Promise.all(cssFiles.map(file=>fs.readFile(path.join(publicRoot,file),'utf8')))).join('\n');
  for(const match of [...css.matchAll(/url\((["']?)(\/assets\/[^)'"]+)\1\)/g)]){
    const file=match[2];const data=await fs.readFile(path.join(publicRoot,file)).catch(()=>null);
    if(data)css=css.replaceAll(match[0],`url("data:${mime[path.extname(file)]||'image/webp'};base64,${data.toString('base64')}")`);
  }
  const images=await page.locator('img[src]').evaluateAll(nodes=>[...new Set(nodes.map(node=>node.getAttribute('src')))]);
  const embedded={};
  for(const src of images){
    if(!src?.startsWith('/'))continue;
    const filename=src.startsWith('/fixture-cover/')?path.join(qaDir,'covers',path.basename(src)):path.join(publicRoot,src);
    const data=await fs.readFile(filename).catch(()=>null);
    if(data)embedded[src]=`data:${mime[path.extname(src)]||'image/webp'};base64,${data.toString('base64')}`;
  }
  const html=await page.evaluate(({css,embedded})=>{
    const clone=document.documentElement.cloneNode(true);
    clone.querySelectorAll('script,link,iframe').forEach(node=>node.remove());
    clone.querySelectorAll('input').forEach(node=>{node.setAttribute('value',node.value);if(node.checked)node.setAttribute('checked','');else node.removeAttribute('checked')});
    clone.querySelectorAll('textarea').forEach(node=>{node.textContent=node.value});
    clone.querySelectorAll('img[src]').forEach(node=>{
      const src=node.getAttribute('src');if(embedded[src])node.src=embedded[src];
      node.removeAttribute('loading');node.removeAttribute('srcset');
    });
    const style=document.createElement('style');style.textContent=css;clone.querySelector('head').append(style);
    const scroll=document.createElement('script');scroll.textContent=`addEventListener('load',()=>scrollTo(0,${window.scrollY}));`;
    clone.querySelector('body').append(scroll);
    return '<!doctype html>'+clone.outerHTML;
  },{css,embedded});
  await fs.writeFile(path.join(qaDir,`${name}.html`),html);
}
async function setup(viewport){
  const context=await browser.newContext({viewport,hasTouch:viewport.width<600,isMobile:viewport.width<600,serviceWorkers:'block',reducedMotion:'reduce'});
  const calls=[],errors=[],failures=new Set();
  let inFlight=0,maxInFlight=0;
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==base)return route.abort();
    if(url.pathname.startsWith('/fixture-cover/')){
      const file=path.join(qaDir,'covers',path.basename(url.pathname));
      return route.fulfill({path:file,contentType:'image/webp'});
    }
    if(!url.pathname.startsWith('/api/'))return route.continue();
    const parts=url.pathname.split('/'),operation=parts.at(-1),sourceId=parts[3],page=Number(url.searchParams.get('page')||1),query=url.searchParams.get('q')||'';
    let json={items:[]};
    if(url.pathname==='/api/social-config')json={enabled:false};
    if(url.pathname==='/api/sources')json=['s1','s2'].map(id=>({id,name:id==='s1'?'Olympus Scanlation':'Otra fuente',lang:'es',baseUrl:'https://fixture.test',runtime:'vercel-js',status:'ready'}));
    if(url.pathname==='/api/extensions')json={items:['s1','s2'].map(id=>({id,name:id==='s1'?'Olympus Scanlation':'Otra fuente',lang:'es',version:'1.0.0',runtime:'vercel-js',sourceIds:[id]}))};
    if(['popular','latest','search'].includes(operation)){
      calls.push({operation,sourceId,page,query});
      inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);
      await new Promise(resolve=>setTimeout(resolve,query==='lenta'?900:query==='cancelada'?300:18));
      inFlight--;
      if(query==='fallo'&&page===2&&!failures.has(query)){
        failures.add(query);
        return route.fulfill({status:502,json:{error:'La fuente no respondió. Puedes reintentar esta página.'}}).catch(()=>{});
      }
      const total=query==='vacía'?0:query?34:operation==='latest'?287:241;
      const actualPage=query==='repetida'&&page>1?1:page;
      const first=(actualPage-1)*15;
      json={mangas:Array.from({length:Math.min(15,Math.max(0,total-first))},(_,i)=>manga(first+i,sourceId,query)),page,hasNextPage:page*15<total,nextPage:page*15<total?page+1:null,total};
    }
    if(operation==='details'){
      const ref=JSON.parse(route.request().postData()||'{}');
      json={...ref,description:'Ficha real de Hanami con respuesta de fuente controlada.',genre:['Acción'],status:'ongoing'};
    }
    if(operation==='chapters')json=[{id:'c1',url:'https://fixture.test/chapter/1',name:'Capítulo 1',number:1}];
    return route.fulfill({json}).catch(()=>{});
  });
  await context.addInitScript(({saved})=>{
    if(window.top!==window||localStorage.getItem('source-v148-seeded'))return;
    localStorage.setItem('source-v148-seeded','true');
    localStorage.setItem('hanami-reduce-motion','true');
    localStorage.setItem('hanami-library-room-scope-v1','personal');
    localStorage.setItem('hanami-reading-profile-v1',JSON.stringify({id:'fixture-reader',name:'Pruebas',initials:'P'}));
    localStorage.setItem('hanami-install-seeded','true');
    localStorage.setItem('hanami-installed-sources',JSON.stringify(['s1','s2']));
    localStorage.setItem('hanami-library',JSON.stringify(saved));
  },{saved:[
    {...manga(0),id:'saved-0',favorite:true,categories:['default']},
    {...manga(1),id:'history-1',favorite:false,categories:['default']},
    {...manga(2,'s2'),id:'other-source',favorite:true,categories:['default']},
    {...manga(888),title:titles[3],id:'same-title',favorite:true,categories:['default']},
  ]});
  if(viewport.width===320)await context.addInitScript(()=>{window.IntersectionObserver=undefined});
  const page=await context.newPage();page.setDefaultTimeout(7000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/library');
  await page.waitForFunction(()=>document.documentElement.dataset.hanamiReady==='true'&&window.HanamiSourceBrowser&&window.HanamiLibraryGroups);
  await page.evaluate(async()=>{
    await Promise.all([HanamiSocialSync?.ready,HanamiReaderComments?.ready,HanamiChapterIdentity?.ready]);
    HanamiLibraryGroups.activate('personal');
    HanamiAppShowTab('sources','push');
  });
  await page.locator('[data-open-source="s1"]').first().click();
  await settle(page,'popular');
  return {context,page,calls,errors,getMaxInFlight:()=>maxInFlight};
}
async function settle(page,mode,sourceId='s1'){
  await page.waitForFunction(({mode,sourceId})=>{
    const state=HanamiSourceBrowser.snapshot();
    return HanamiScreens.current()?.type==='source'&&!HanamiScreens.debug.snapshot().pending&&
      document.querySelector('#browser').dataset.browserView==='list'&&
      state?.sourceId===sourceId&&state.mode===mode&&state.loadedPages>0&&!state.loading;
  },{mode,sourceId});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
async function search(page,query){
  await page.locator('#sourceQuery').fill(query);
  await page.locator('#sourceQuery').press('Enter');
  await settle(page,'search');
}
async function exhaust(page,total){
  const last=Math.ceil(total/15);
  while((await page.evaluate(()=>HanamiSourceBrowser.snapshot().loadedPages))<last){
    const previous=await page.evaluate(()=>HanamiSourceBrowser.snapshot().loadedPages);
    await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
    await page.waitForFunction(old=>{
      const state=HanamiSourceBrowser.snapshot();return state.error||state.loadedPages>old;
    },previous);
    assert.equal(await page.evaluate(()=>HanamiSourceBrowser.snapshot().error),'');
  }
  await page.waitForFunction(()=>!HanamiSourceBrowser.snapshot().loading);
  assert.equal(await page.locator('.source-cards [data-manga]').count(),total);
  assert.equal(await page.evaluate(()=>HanamiSourceBrowser.snapshot().hasNextPage),false);
  assert.equal(new Set(await page.locator('.source-cards [data-manga]').evaluateAll(nodes=>nodes.map(node=>node.dataset.manga))).size,total);
}
async function auditLayout(page){
  const issues=await page.evaluate(()=>{
    const visible=node=>node.checkVisibility()&&node.getBoundingClientRect().width;
    const problems=[];
    if(document.documentElement.scrollWidth>innerWidth+1)problems.push('horizontal overflow');
    for(const node of document.querySelectorAll('#browser .browse-source-appbar button,#sourceQuery,#browser .source-tabs button')){
      if(!visible(node))continue;
      const rect=node.getBoundingClientRect();if(rect.width<43||rect.height<43)problems.push('small target '+node.outerHTML.slice(0,90));
      if(rect.left<0||rect.right>innerWidth+1)problems.push('toolbar overflow');
    }
    const nodes=[...document.querySelectorAll('#browser .browse-source-appbar>*')].filter(visible);
    for(let i=1;i<nodes.length;i++)if(nodes[i].getBoundingClientRect().left<nodes[i-1].getBoundingClientRect().right-1)problems.push('toolbar overlap');
    return problems;
  });
  assert.deepEqual(issues,[]);
}
try{
  for(const viewport of [{width:390,height:844},{width:1280,height:900}]){
    const width=viewport.width,{context,page,calls,errors,getMaxInFlight}=await setup(viewport);
    try{
      assert(await page.locator('#sourceQuery').evaluate(node=>!!node.closest('.toolbar')));
      assert.equal(await page.locator('[data-source-search]').count(),0);
      assert.equal(await page.locator('.source-tabs button svg').count(),2);
      assert.equal(await page.locator('[data-source-popular]').getAttribute('aria-pressed'),'true');
      assert((await page.locator('#browseStatus').innerText()).includes('de 241 obras'),'Show loaded versus available works when the source declares a total');
      assert.equal(await page.locator('[data-manga="0"]').getAttribute('data-in-library'),'true');
      for(const index of [1,2,3])assert.equal(await page.locator(`[data-manga="${index}"]`).getAttribute('data-in-library'),'false');
      assert(await page.locator('[data-manga="0"] .source-saved-badge').isVisible());
      assert(Number(await page.locator('[data-manga="0"] img').evaluate(node=>getComputedStyle(node).opacity))<.6);
      await auditLayout(page);await freeze(page,`${width}-popular`);
      pass(width,'toolbar search, heart/check tabs, saved bookmark and readable responsive layout');

      const before=calls.length;
      await page.evaluate(()=>{
        const list=JSON.parse(localStorage.getItem('hanami-library'));
        const ref={id:'saved-4',remoteWorkId:'4',sourceId:'s1',url:'https://fixture.test/series/work-4',title:'Guardada',favorite:true};
        list.push(ref);localStorage.setItem('hanami-library',JSON.stringify(list));
        dispatchEvent(new CustomEvent('hanami-library-change',{detail:{list}}));
      });
      await page.waitForFunction(()=>document.querySelector('[data-manga="4"]').dataset.inLibrary==='true');
      await page.evaluate(()=>{
        const list=JSON.parse(localStorage.getItem('hanami-library')).filter(row=>row.id!=='saved-0');
        localStorage.setItem('hanami-library',JSON.stringify(list));dispatchEvent(new CustomEvent('hanami-library-change',{detail:{list}}));
      });
      await page.waitForFunction(()=>document.querySelector('[data-manga="0"]').dataset.inLibrary==='false');
      assert.equal(calls.length,before,'Library updates do not refetch/reset results');
      pass(width,'live add/remove updates saved styling without resetting the listing');

      await page.evaluate(()=>Promise.all(Array.from({length:4},()=>HanamiSourceBrowser.loadMore())));
      await exhaust(page,241);
      assert.equal(getMaxInFlight(),1,'Observer, scroll and repeated manual requests cannot overlap page fetches');
      let listingCalls=calls.filter(call=>call.operation==='popular');
      assert.deepEqual(listingCalls.map(call=>call.page),Array.from({length:17},(_,i)=>i+1));
      await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await page.waitForTimeout(90);
      assert.equal(calls.filter(call=>call.operation==='popular').length,17);
      pass(width,'vertical scrolling accumulates 241 unique popular works and stops at the genuine last page');

      await page.locator('[data-manga="219"]').scrollIntoViewIfNeeded();
      const y=await page.evaluate(()=>scrollY);
      await page.locator('[data-manga="219"]').click();
      await page.locator('#browseResults [data-md-back]').waitFor();
      assert.equal(await page.locator('.browse-source-appbar').isVisible(),false,'No duplicate source Back toolbar over the manga detail');
      await page.locator('#browseResults [data-md-back]').click();
      await settle(page,'popular');
      assert.equal(await page.locator('.source-card').count(),241);
      assert(Math.abs(await page.evaluate(()=>scrollY)-y)<8,'Back restores the scrolled catalogue');
      assert.equal(calls.filter(call=>call.operation==='popular').length,17,'Back reuses loaded results');
      pass(width,'detail at index 219 -> Back preserves all loaded pages and exact scroll');

      await page.reload();
      await page.waitForFunction(()=>HanamiSourceBrowser?.snapshot()?.loadedCount===241&&!HanamiSourceBrowser.snapshot().loading);
      await settle(page,'popular');
      assert.equal(await page.locator('.source-card').count(),241);
      if(Math.abs(await page.evaluate(()=>scrollY)-y)>=12) console.log('SCROLL_DIAGNOSTIC',JSON.stringify({expected:y,...await page.evaluate(()=>({actual:scrollY,screen:HanamiScreens.current(),snapshot:HanamiSourceBrowser.snapshot(),debug:HanamiScreens.debug.snapshot(),height:document.documentElement.scrollHeight,bodyClass:document.body.className}))}));
      assert(Math.abs(await page.evaluate(()=>scrollY)-y)<12,'Reload reconstructs the scrolled catalogue');
      await page.goForward();
      await page.locator('#browseResults [data-md-back]').waitFor();
      assert((await page.locator('.mihon-detail').innerText()).includes('220'));
      await page.locator('#browseResults [data-md-back]').click();await settle(page,'popular');
      pass(width,'reload rehydrates 17 pages and Forward opens the correct late result');

      await page.evaluate(()=>scrollTo(0,0));
      const requestsBeforeDisplay=calls.length;
      await page.locator('[data-browse-display]').click();
      if(width===390)await freeze(page,'390-display-menu');
      await page.locator('[data-browse-display-mode="list"]').click();
      await page.waitForFunction(()=>document.querySelector('.source-cards')?.classList.contains('browse-list'));
      assert.equal(await page.locator('.source-card').count(),241);assert.equal(calls.length,requestsBeforeDisplay);
      await auditLayout(page);if(width===390)await freeze(page,'390-list');
      await page.locator('[data-browse-display]').click();await page.locator('[data-browse-display-mode="compact"]').click();
      assert.equal(await page.locator('.source-card').count(),241);assert.equal(calls.length,requestsBeforeDisplay);
      await auditLayout(page);if(width===390)await freeze(page,'390-compact');
      await page.locator('[data-browse-display]').click();await page.locator('[data-browse-display-mode="comfortable"]').click();
      pass(width,'display menu changes layout in place, with no result loss or refetch');

      await page.locator('[data-source-latest]').click();await settle(page,'latest');
      assert.equal(await page.locator('[data-source-latest]').getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('#sourceQuery').inputValue(),'');
      if(width===390)await freeze(page,'390-latest');
      await exhaust(page,287);
      listingCalls=calls.filter(call=>call.operation==='latest');
      assert.deepEqual(listingCalls.map(call=>call.page),Array.from({length:20},(_,i)=>i+1));
      await page.locator('[data-source-latest]').focus();await page.locator('[data-source-latest]').press('Home');await settle(page,'popular');
      assert.equal(await page.locator('.source-card').count(),241);
      pass(width,'Recientes accumulates 287 works; keyboard tab switching retains both catalogues');

      await search(page,'café & luna');
      assert.equal(calls.filter(call=>call.query==='café & luna'&&call.page===1).length,1,'Enter submits once, not a search-button duplicate');
      assert.equal(await page.locator('#sourceQuery').inputValue(),'café & luna');
      assert.equal(await page.locator('.source-tabs [aria-pressed="true"]').count(),0);
      if(width===390)await freeze(page,'390-search');
      await page.locator('#sourceQuery').fill('Borrador sin enviar');
      await page.evaluate(()=>HanamiSourceBrowser.loadMore());
      assert.equal(await page.locator('#sourceQuery').inputValue(),'Borrador sin enviar','Background paging does not erase unsubmitted typing');
      assert.equal(calls.filter(call=>call.query==='Borrador sin enviar').length,0);
      pass(width,'Enter searches once, preserves query parameters and never overwrites a typing draft');

      await search(page,'fallo');
      await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
      await page.waitForFunction(()=>!!HanamiSourceBrowser.snapshot().error);
      assert.equal(await page.locator('.source-card').count(),15);
      if(width===390)await freeze(page,'390-page-error');
      await page.locator('[data-browse-load-more]').click();
      await page.waitForFunction(()=>HanamiSourceBrowser.snapshot().loadedPages>=2&&!HanamiSourceBrowser.snapshot().error);
      assert.equal(calls.filter(call=>call.query==='fallo'&&call.page===2).length,2);
      assert.equal(calls.filter(call=>call.query==='fallo'&&call.page===1).length,1);
      pass(width,'failed next page preserves prior cards and Retry repeats only the failed cursor');

      await search(page,'repetida');
      await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
      await page.waitForFunction(()=>HanamiSourceBrowser.snapshot().error.includes('repitió'));
      const stopped=calls.length;await page.waitForTimeout(120);
      assert.equal(calls.length,stopped);assert.equal(await page.locator('.source-card').count(),15);
      pass(width,'repeated upstream pages stop with a retryable error, not an infinite loop');

      await search(page,'vacía');
      assert.equal(await page.locator('.source-card').count(),0);
      assert(await page.locator('.browse-empty').isVisible());
      assert.equal(await page.locator('[data-browse-load-more]').isVisible(),false);
      if(width===390)await freeze(page,'390-empty');
      await page.locator('#sourceQuery').fill('lenta');await page.locator('#sourceQuery').press('Enter');
      await page.waitForFunction(()=>HanamiSourceBrowser.snapshot().loading);
      if(width===390)await freeze(page,'390-loading');
      await page.locator('[data-source-latest]').click();await settle(page,'latest');await page.waitForTimeout(950);
      assert.equal(await page.locator('.source-card').count(),287);
      assert.equal(await page.locator('#sourceQuery').inputValue(),'');
      assert.equal(await page.evaluate(()=>HanamiSourceBrowser.snapshot().query),'');
      pass(width,'empty/loading states are explicit; switching tabs cancels stale search responses');

      await page.locator('#sourceQuery').fill('cancelada');await page.locator('#sourceQuery').press('Enter');
      await page.waitForFunction(()=>HanamiSourceBrowser.snapshot().loading);
      await page.evaluate(()=>HanamiBrowseSource('s2'));await settle(page,'popular','s2');await page.waitForTimeout(350);
      assert((await page.locator('.source-card-copy b').first().innerText()).startsWith('Otra fuente'));
      await page.evaluate(()=>HanamiAppShowTab('library','push'));await page.waitForTimeout(80);
      assert.equal(await page.locator('#browser').isVisible(),false);
      assert.equal(await page.evaluate(()=>HanamiScreens.current().type),'root');
      pass(width,'changing sources/root screens prevents stale appends or reopening source surfaces');

      await page.evaluate(()=>HanamiBrowseSource('hanami.local'));await settle(page,'popular','hanami.local');
      assert(await page.locator('[data-local-create]').isVisible());
      assert.equal(await page.evaluate(()=>HanamiSourceBrowser.snapshot().hasNextPage),false);
      await page.locator('[data-source-latest]').click();await settle(page,'latest','hanami.local');
      await page.locator('[data-source-popular]').click();await settle(page,'popular','hanami.local');
      await page.locator('[data-local-create]').click();
      await page.locator('[name="local-title"]').fill('Serie local de prueba');
      await page.locator('[data-local-save-series]').click();
      await page.waitForFunction(()=>HanamiSourceBrowser.snapshot().loadedCount===1&&!HanamiSourceBrowser.snapshot().loading);
      await page.evaluate(()=>document.querySelector('#modal').close());
      assert.equal(await page.locator('.source-card-copy b').first().innerText(),'Serie local de prueba','Local CRUD invalidates the cached local listing');
      await page.locator('[data-source-latest]').click();await settle(page,'latest','hanami.local');
      assert.equal(await page.locator('.source-card').count(),1,'All cached local tabs are invalidated');
      assert.deepEqual(errors,[],'No browser runtime exceptions');
      pass(width,'local source retains its actions, invalidates edited results and honestly ends without remote pagination');
    }finally{await context.close();}
  }
  const {context,page,errors}=await setup({width:320,height:740});
  try{
    await auditLayout(page);
    assert.equal(await page.evaluate(()=>typeof IntersectionObserver),'undefined');
    await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
    await page.waitForFunction(()=>HanamiSourceBrowser.snapshot().loadedPages>=2);
    assert.deepEqual(errors,[]);
    pass(320,'narrow toolbar has no horizontal overflow and scroll pagination works without IntersectionObserver');
  }finally{await context.close();}
  console.log(`PASS: ${passes} source-browser E2E scenarios; all network traffic stayed within fixture routes`);
}finally{
  await browser.close();await new Promise(resolve=>server.close(resolve));
}