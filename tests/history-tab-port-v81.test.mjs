import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const files=['../public/history-tab.js','../public/history-tab.css','../public/navigation.js','../public/app.js','../public/index.html','../public/sw.js','../package.json'];
const [h,c,n,a,i,s,p]=await Promise.all(files.map(x=>readFile(new URL(x,import.meta.url),'utf8')));
for(const token of [
 'history-searchbar','data-ht-search','data-ht-search-input','data-ht-search-clear','data-ht-clear-all','history-date','history-item','data-ht-resume','data-ht-cover','data-ht-favorite','data-ht-delete',
 'history-delete-dialog','data-ht-reset-manga','data-ht-delete-confirm','data-ht-clear-all-confirm','history-duplicate-dialog','data-ht-duplicate-open','data-ht-duplicate-add','data-ht-duplicate-migrate',
 'HanamiCategories?.chooseSingle','HanamiMigrationConfig?.open','HanamiLibrary?.continue','HanamiLibrary?.open','No hay siguiente capítulo','Historial borrado','history-snackbar','history-fast-scroll','prefers-reduced-motion'
])assert(h.includes(token)||c.includes(token),token);
assert(!h.includes('itemOverflow')&&!h.includes('history-item-overflow'),'HistoryTab de Mihon no define itemOverflow');
assert(n.includes('if(window.HanamiHistoryTab)return window.HanamiHistoryTab.render()'));
assert(n.includes("active==='history'&&window.HanamiHistoryTab?.back?.()"));
assert(a.includes("window.HanamiHistoryTab?.onReselect?.()"));
assert(i.includes('/history-tab.css')&&i.includes('/history-tab.js'));
assert(s.includes('hanami-reader-comment-position-v126')&&s.includes("'/history-tab.css'")&&s.includes("'/history-tab.js'"));
const pkg=JSON.parse(p);assert.equal(pkg.version,'5.8.59');assert(pkg.scripts.test.includes('history-tab-port-v81.test.mjs'));
console.log('PASS: HistoryTab ports search, rows, resume, favorite, dialogs, duplicate/category/migration flows, animations and Back behavior');
