import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

// Simulate a previously installed v150 PWA, update normally, then boot offline.
const root=resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const currentWorker=await readFile(resolve(root,'sw.js'),'utf8');
const newCache='hanami-crimson-knot-v150-hnm028-r2',oldCache='hanami-crimson-knot-v150';
assert(currentWorker.includes(`const CACHE='${newCache}'`));
let updated=false;
const server=http.createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    res.setHeader('Cache-Control','no-store');
    if(path.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end(path==='/api/extensions'?'{}':'[]');return}
    const requested=path==='/'||!extname(path)?'/index.html':path;
    const file=resolve(root,'.'+requested);
    if(!file.startsWith(root+sep)&&file!==resolve(root,'index.html')){res.writeHead(403).end();return}
    let data=await readFile(file);
    if(!updated&&path==='/sw.js')data=Buffer.from(currentWorker.replace(newCache,oldCache));
    if(!updated&&path==='/overlay-dismiss.js')data=Buffer.from("window.HanamiOverlays={revision:'previous-cache-fixture',scan(){},current(){return null},count(){return 0},close(){return false},discardForNavigation(){}};");
    const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.webmanifest':'application/manifest+json','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon'};
    res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(data);
  }catch{res.writeHead(404).end()}
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/local/bin/chromium',args:['--no-sandbox']});
try{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'allow'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/library');
  await page.waitForFunction(()=>window.HanamiOverlays?.revision==='previous-cache-fixture'&&document.documentElement.dataset.hanamiReady==='true');
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  assert((await page.evaluate(()=>caches.keys())).includes(oldCache));
  await page.evaluate(async()=>{
    await window.HanamiDownloads.init();
    // A real manifest keeps the fixture page from the app's orphan-cache cleanup.
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('hanami-downloads',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('manifests','readwrite');
      tx.objectStore('manifests').put({key:'fixture::/hnm028-saved-chapter',sourceId:'fixture',chapterUrl:'/hnm028-saved-chapter',pages:[{imageUrl:location.origin+'/hnm028-saved-page'}],updatedAt:Date.now()});
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });db.close();
    await (await caches.open('hanami-chapter-pages-v1')).put('/hnm028-saved-page',new Response('keep-page'));
    await (await caches.open('hanami-covers-v1')).put('/hnm028-saved-cover',new Response('keep-cover'));
  });
  updated=true;
  await page.evaluate(async()=>{
    const changed=new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
    await (await navigator.serviceWorker.getRegistration()).update();await changed;
  });
  await page.waitForFunction(async()=>{
    const keys=await caches.keys();return keys.includes('hanami-crimson-knot-v150-hnm028-r2')&&!keys.includes('hanami-crimson-knot-v150');
  });
  await page.reload();await page.waitForFunction(()=>window.HanamiOverlays?.revision==='hnm028-r2'&&document.documentElement.dataset.hanamiReady==='true');
  await context.setOffline(true);await page.goto(base+'/library');
  await page.waitForFunction(()=>window.HanamiOverlays?.revision==='hnm028-r2'&&document.documentElement.dataset.hanamiReady==='true');
  const saved=await page.evaluate(async()=>Promise.all(['hanami-chapter-pages-v1','hanami-covers-v1'].map(async(name,i)=>(await (await caches.open(name)).match('/hnm028-saved-'+(i?'cover':'page')))?.text())));
  assert.deepEqual(saved,['keep-page','keep-cover']);assert.deepEqual(errors,[]);
  await context.close();
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
console.log('PASS: HNM-028 updates an installed v150 PWA, loads R2 offline and preserves pages/covers');
