import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
const detail=await readFile(new URL('../public/manga-detail.js',import.meta.url),'utf8'),css=await readFile(new URL('../public/styles.css',import.meta.url),'utf8'),sw=await readFile(new URL('../public/sw.js',import.meta.url),'utf8'),pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
for(const token of ['md-two-pane','md-info-pane','Ficha de la obra','md-chapter-pane','aria-label="Capítulos"'])assert(detail.includes(token),token);
for(const token of ['/* v103 — Mihon tablet adaptive grid + two-panel manga detail */','(min-width:720px)','(orientation:landscape) and (min-width:600px)','repeat(auto-fill,minmax(128px,1fr))','grid-template-columns:minmax(320px,450px) minmax(0,1fr)','overflow-y:auto','overscroll-behavior:contain','.md-chapter-pane .md-chapter-tools{position:sticky','.md-settings{inset:50% auto auto 50%','dialog,#modal{margin:auto'])assert(css.includes(token),token);
assert(sw.includes('hanami-supabase-sql-keyword-v124'));assert.equal(pkg.version,'5.8.57');assert(pkg.scripts.test.includes('node tests/tablet-adaptive-detail-v103.test.mjs'));
console.log('PASS: tablet uses adaptive 128px library grid, two-pane detail, independent scroll and adaptive sheets');
