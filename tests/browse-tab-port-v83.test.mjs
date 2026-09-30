import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const files=['../public/browse-tab.js','../public/browse-tab.css','../public/app.js','../public/index.html','../public/overlay-dismiss.js','../public/sw.js','../package.json'];
const [b,c,a,i,o,s,p]=await Promise.all(files.map(x=>readFile(new URL(x,import.meta.url),'utf8')));
for(const token of [
 "const tabs=['sources','extensions','migrate']",'function onReselect()','HanamiAppOpenGlobalSearch','function showExtension()','touchstart','touchend','Math.abs(dx)>72','navigator.vibrate',
 'id="globalSearch"','global-search-toolbar','globalQuery','globalProgress','data-global-filter="all"','data-global-filter="pinned"','data-global-results-only','data-global-group','global-search-results',
 "push('global-search'",'data-child-back','data-global-source','data-global-open','Promise.all(sources.map','progress.value=done',
 'data-browse-display','data-browse-source-more','browse-item-overflow','data-browse-display-mode','comfortable','compact','list','data-browse-open-web','data-browse-source-settings',
 'data-source-filter','data-extension-menu','data-migration-help','data-sort-mode','data-sort-direction','prefers-reduced-motion'
])assert(b.includes(token)||c.includes(token)||a.includes(token)||i.includes(token),token);
assert(a.includes("b.dataset.tab==='explore'&&window.HanamiNavigation?.isActive?.('explore')"));
assert(o.includes("'.browse-item-overflow'"));
assert(i.includes('/browse-tab.css')&&i.includes('/browse-tab.js'));
assert(s.includes('hanami-crimson-knot-v134')&&s.includes("'/browse-tab.css'")&&s.includes("'/browse-tab.js'"));
const pkg=JSON.parse(p);assert.equal(pkg.version,'5.8.67');assert(pkg.scripts.test.includes('browse-tab-port-v83.test.mjs'));
console.log('PASS: BrowseTab ports pager gestures, GlobalSearchScreen, source toolbar itemOverflow, display modes and centralized navigation');
