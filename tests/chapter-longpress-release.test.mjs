import assert from'node:assert/strict';import{readFile}from'node:fs/promises';const m=await readFile(new URL('../public/manga-detail.js',import.meta.url),'utf8');for(const x of ['suppressChapterClick=-1','if(suppressChapterClick===i)','suppressChapterClick=i','el.onpointerup=()=>{clearTimeout(hold);'
,'suppressChapterTimer=setTimeout(()=>suppressChapterClick=-1,700)'
,"el.onpointercancel=()=>{clearTimeout(hold);",'suppressChapterClick=-1','clearTimeout(suppressChapterTimer);return'])assert(m.includes(x),x);console.log('PASS: synthetic click after chapter long-press release is consumed once');
