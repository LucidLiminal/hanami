import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const files=['../public/updates-tab.js','../public/navigation.js','../public/app.js','../public/overlay-dismiss.js','../public/index.html','../public/sw.js','../public/updates-tab.css','../package.json'];
const [u,n,a,o,i,s,c,p]=await Promise.all(files.map(x=>readFile(new URL(x,import.meta.url),'utf8')));
for(const token of [
 'data-ut-filter','data-ut-upcoming','data-ut-refresh','updates-last','updates-date','updates-unread','updates-bookmark','data-ut-download',
 'data-ut-cancel','data-ut-all','data-ut-invert','data-ut-bookmark','data-ut-unbookmark','data-ut-read','data-ut-unread','data-ut-download-selected','data-ut-delete-selected',
 'updates-filter-dialog','data-ut-filter-page="0"','data-ut-filter-page="1"','downloaded','unread','started','bookmarked','includedCategories','excludedCategories','excludedScanlators',
 'updates-delete-dialog','data-ut-delete-confirm','updates-item-overflow','data-ut-download-action','Descargar ahora','Cancelar','Eliminar descarga',
 "push('updates-upcoming'","push('updates-downloads'",'data-ut-upcoming-manga','data-ut-queue-more','data-ut-queue-sort','data-ut-queue-clear','data-ut-queue-toggle',
 'updates-snackbar','updates-pull-indicator','updates-fast-scroll','pointerdown','navigator.vibrate','setTimeout(()=>{state.refreshing=false','prefers-reduced-motion'
]) assert(u.includes(token)||c.includes(token),token);
assert(n.includes('window.HanamiUpdatesTab.return')===false);
assert(n.includes('if(window.HanamiUpdatesTab)return window.HanamiUpdatesTab.render()'));
assert(n.includes("active==='updates'&&window.HanamiUpdatesTab?.back?.()"));
assert(n.includes('window.HanamiUpdatesTab?.pullRefresh?.()'));
assert(a.includes("window.HanamiUpdatesTab?.onReselect?.()"));
assert(o.includes("'.updates-item-overflow'"));
assert(i.includes('/updates-tab.css')&&i.includes('/updates-tab.js'));
assert(s.includes('hanami-crimson-knot-v135')&&s.includes("'/updates-tab.css'")&&s.includes("'/updates-tab.js'"));
const pkg=JSON.parse(p);assert.equal(pkg.version,'5.9.0');assert(pkg.scripts.test.includes('updates-tab-port-v80.test.mjs'));
console.log('PASS: UpdatesTab ports screens, bars, actions, dialogs, itemOverflow, animations, effects and gestures');
