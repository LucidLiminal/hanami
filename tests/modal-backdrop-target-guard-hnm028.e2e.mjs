import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base=process.env.HANAMI_TEST_URL||'http://127.0.0.1:4173';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/local/bin/chromium',args:['--no-sandbox']});
const results=[];
try {
  for(const mobile of [true,false]) {
    const label=mobile?'mobile':'desktop';
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},hasTouch:mobile,isMobile:mobile,serviceWorkers:'block'});
    await context.addInitScript(()=>{
      localStorage.setItem('hanami-reduce-motion','true');
      localStorage.setItem('hanami-library',JSON.stringify([{id:'hnm028-work',title:'Filtros HNM-028',url:'/fixture/work',sourceId:'fixture',favorite:true,categories:['default'],thumbnailUrl:'/assets/fallen.webp'}]));
    });
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/sources',r=>r.fulfill({contentType:'application/json',body:JSON.stringify([{id:'fixture',name:'Fuente HNM-028',lang:'es'}])}));
    await page.route('**/api/extensions',r=>r.fulfill({contentType:'application/json',body:'{"items":[]}'}));
    await page.route('**/api/source/**',r=>{
      const path=new URL(r.request().url()).pathname;
      return r.fulfill({contentType:'application/json',body:JSON.stringify(path.endsWith('/details')?{title:'Filtros HNM-028',url:'/fixture/work',thumbnailUrl:'/assets/fallen.webp'}:path.endsWith('/chapters')?[{url:'/fixture/chapter',name:'Capítulo 1',number:1}]:[])});
    });
    const tap=async locator=>{await locator.waitFor({state:'visible'});const box=await locator.boundingBox();assert(box,'target must be visible');const x=box.x+box.width/2,y=box.y+box.height/2;if(mobile)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y)};
    const ready=async()=>{await page.goto(base+'/library');await page.waitForFunction(()=>document.documentElement.dataset.hanamiReady==='true'&&window.HanamiOverlays)};
    const closed=()=>page.waitForFunction(()=>window.HanamiOverlays.count()===0);
    const monitor=async selector=>page.evaluate(selector=>{
      window.__hnm028Underlay=[];
      for(const type of ['pointerdown','pointerup','click'])document.querySelector(selector).addEventListener(type,e=>window.__hnm028Underlay.push({type:e.type,trusted:e.isTrusted}));
    },selector);

    // The previous fix passed a synthetic dialog test but failed this real filter panel.
    await ready();await tap(page.locator('[data-lib-id="hnm028-work"]'));
    await page.locator('#libraryRoot .mihon-detail').waitFor();
    await tap(page.locator('[data-md-filter]').first());
    await page.waitForFunction(()=>window.HanamiOverlays.current()?.classList.contains('md-settings'));
    await tap(page.locator('[data-set-tab="sort"]'));
    await page.locator('[data-sort="number"]').waitFor();
    await monitor('[data-md-back]');await tap(page.locator('[data-md-back]'));await closed();
    assert.equal(await page.locator('#libraryRoot .mihon-detail').count(),1,'outside tap closes filters, not the detail');
    assert.deepEqual(await page.evaluate(()=>window.__hnm028Underlay),[],'no pointerdown/up/click reaches the underlying Back button');
    // No dead period: the very next deliberate tap must reach the same button.
    await tap(page.locator('[data-md-back]'));
    await page.waitForFunction(()=>!document.querySelector('#libraryRoot .mihon-detail'));

    // A real toolbar popup must not activate the main navigation underneath.
    await tap(page.locator('[data-lib-toolbar-more]'));
    await page.waitForFunction(()=>window.HanamiOverlays.count()===1);
    await monitor('[data-tab="explore"]');await tap(page.locator('[data-tab="explore"]'));await closed();
    assert.equal(await page.evaluate(()=>document.body.dataset.root),'library');
    assert.deepEqual(await page.evaluate(()=>window.__hnm028Underlay),[]);
    await tap(page.locator('[data-tab="explore"]'));
    await page.waitForFunction(()=>document.body.dataset.root==='explore');
    await tap(page.locator('[data-tab="library"]'));
    await page.waitForFunction(()=>document.body.dataset.root==='library');

    // Real native library settings: preserve padding/internal actions and consume the backdrop click.
    await page.evaluate(()=>window.HanamiLibrary.openSettings());
    await page.waitForFunction(()=>document.querySelector('#modal').open&&window.HanamiOverlays.count()===1);
    const rect=await page.locator('#modal').boundingBox();
    if(mobile)await page.touchscreen.tap(rect.x+3,rect.y+3);else await page.mouse.click(rect.x+3,rect.y+3);
    assert.equal(await page.locator('#modal').evaluate(n=>n.open),true,'padding is not the backdrop');
    await monitor('[data-lib-toolbar-more]');
    const underlay=await page.locator('[data-lib-toolbar-more]').boundingBox();
    assert(underlay.y+underlay.height/2<rect.y,'the tested button must lie outside the dialog');
    await tap(page.locator('[data-lib-toolbar-more]'));await closed();
    assert.equal(await page.locator('#modal').evaluate(n=>n.open),false);
    assert.deepEqual(await page.evaluate(()=>window.__hnm028Underlay),[]);
    await tap(page.locator('[data-lib-toolbar-more]'));
    await page.waitForFunction(()=>window.HanamiOverlays.count()===1);
    await page.keyboard.press('Escape');await closed();

    // Browser Back and repeated opens must not leave orphan history entries/listeners.
    for(let i=0;i<8;i++) {
      await tap(page.locator('[data-lib-toolbar-more]'));
      await page.waitForFunction(()=>window.HanamiOverlays.count()===1);
      if(i%2)await page.goBack();else await tap(page.locator('[data-tab="explore"]'));
      await closed();
      assert.equal(await page.evaluate(()=>document.body.dataset.root),'library');
    }
    // Explicitly hold a trusted outside pointer: no close on down, only on completed click.
    {
      await tap(page.locator('[data-lib-toolbar-more]'));
      await page.waitForFunction(()=>window.HanamiOverlays.count()===1);
      const box=await page.locator('[data-tab="explore"]').boundingBox();
      let cdp;
      if(mobile){cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]})}
      else{await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down()}
      await page.waitForTimeout(50);
      assert.equal(await page.evaluate(()=>window.HanamiOverlays.count()),1);
      if(mobile){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach()}
      else await page.mouse.up();
      await closed();
      assert.equal(await page.evaluate(()=>document.body.dataset.root),'library');
    }
    const workload=await page.evaluate(async()=>{
      const original=document.querySelectorAll;let fullScans=0;
      document.querySelectorAll=function(selector){if(selector.startsWith('#modal,#extensionMenu'))fullScans++;return original.call(this,selector)};
      const probe=document.createElement('div');document.body.append(probe);await new Promise(r=>setTimeout(r,0));fullScans=0;
      for(let i=0;i<40;i++){probe.classList.toggle('hnm028-unrelated');await new Promise(r=>setTimeout(r,0))}
      document.querySelectorAll=original;probe.remove();return{classChanges:40,fullScans};
    });
    assert.equal(workload.fullScans,0,'unrelated class changes must not scan the whole document');
    await page.screenshot({path:`/data/hanami-hnm028-r2-${label}.png`,fullPage:true});
    assert.deepEqual(errors,[]);
    results.push({mode:label,filterAndMenuClickThrough:'blocked',nextTap:'works',backAndEscape:'works',workload});
    await context.close();
  }
} finally {await browser.close()}
console.log(JSON.stringify(results));
console.log('PASS: HNM-028 real touch and mouse protect filters, popups, dialog padding, history and next taps');
