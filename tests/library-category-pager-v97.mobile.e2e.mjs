import{chromium}from'playwright';
import assert from'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'/usr/local/bin/chromium',args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
  localStorage.setItem('hanami-library-category',JSON.stringify('all'));
  localStorage.setItem('hanami-categories',JSON.stringify([
    {id:'default',name:'Predeterminada',order:0},
    {id:'acción',name:'Acción',order:1},
    {id:'vacía',name:'Vacía',order:2},
  ]));
  localStorage.setItem('hanami-library',JSON.stringify([
    {id:'m1',title:'Medianoche',url:'/m1',sourceId:'hanami.es.olympus',categories:['default'],totalChapters:1,unreadCount:1},
    {id:'m2',title:'Violeta',url:'/m2',sourceId:'hanami.es.olympus',categories:['acción'],totalChapters:1,unreadCount:1},
  ]));
});
await page.goto('http://127.0.0.1:4173/');
await page.locator('[data-tab="library"]').click();
const tabs=page.locator('[data-lib-tab]');
assert.equal(await tabs.count(),3);
assert.deepEqual(await tabs.evaluateAll(nodes=>nodes.map(node=>node.dataset.libTab)),['default','acción','vacía']);
assert.equal(await page.locator('[data-lib-tab="all"]').count(),0);
assert.equal(await page.locator('[data-lib-tab="default"]').getAttribute('aria-selected'),'true');
assert.equal(await page.locator('.library-pager .lib-item').count(),1);
const cdp=await page.context().newCDPSession(page);
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:330,y:300}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:90,y:300}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
await page.waitForTimeout(120);
assert.equal(await page.locator('[data-lib-tab="acción"]').getAttribute('aria-selected'),'true');
assert.equal(await page.locator('.library-pager .lib-item').count(),1);
await page.locator('[data-lib-tab="acción"]').focus();
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(80);
assert.equal(await page.locator('[data-lib-tab="vacía"]').getAttribute('aria-selected'),'true');
assert.equal(await page.locator('.library-pager .library-page-empty').count(),1);
await page.keyboard.press('ArrowRight');
assert.equal(await page.locator('[data-lib-tab="vacía"]').getAttribute('aria-selected'),'true');
assert.equal(await tabs.count(),3);
assert.deepEqual(errors,[]);
await browser.close();
console.log('PASS: mobile category pager migrates all, swipes real categories, supports keyboard and keeps empty pages');
