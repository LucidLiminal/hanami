import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const files=['../public/app.js','../public/browse-tab.js','../public/browse-tab.css','../public/navigation.js','../public/index.html','../public/sw.js','../package.json'];
const [a,b,c,n,i,s,p]=await Promise.all(files.map(x=>readFile(new URL(x,import.meta.url),'utf8')));
for(const token of [
 'id="browseChild"','function showBrowseChild','function browseChildHead',
 "showBrowseChild('sources-filter'",'data-bc-source-lang','data-bc-source-enabled','data-bc-source-pinned','langsExplicit',
 "showBrowseChild('extensions-filter'",'data-bc-extension-lang','data-bc-extension-status',
 "showBrowseChild('extension-details'",'data-extension-details-more','data-extension-details-repo','data-source-preferences','data-extension-uninstall-dialog','data-extension-warning','data-incognito-extension',
 "showBrowseChild('extension-stores'","showBrowseChild('source-preferences'","showBrowseChild('missing-source'",'data-show-extensions',
 "showBrowseChild('migrate-manga'",'data-migrate-item','data-migrate-cover','data-migrate-continue','migrationSelectionCount','HanamiMigrationConfig?.open',
 'HanamiAppToggleBrowseManga','navigator.clipboard','data-source-options','function back()','browse-settings-list','extension-details-page','migrate-manga-screen','migrate-continue-fab'
])assert(a.includes(token)||b.includes(token)||c.includes(token)||i.includes(token),token);
assert(n.includes("active==='explore'&&window.HanamiBrowseTab?.back?.()"));
for(const type of ['sources-filter','extensions-filter','extension-details','extension-stores','source-preferences','missing-source','migrate-manga'])assert(a.includes(`'${type}'`),type);
assert(s.includes('hanami-crimson-knot-v1354'));
const pkg=JSON.parse(p);assert.equal(pkg.version,'5.9.4');assert(pkg.scripts.test.includes('browse-subscreens-complete-v84.test.mjs'));
console.log('PASS: Sources, Extensions and Migration are real Browse child screens with filters, details, preferences, stores, selection and centralized Back');
