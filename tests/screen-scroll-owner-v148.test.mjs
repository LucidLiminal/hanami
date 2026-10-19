import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const code=await readFile(new URL('../public/screen-restoration.js',import.meta.url),'utf8');
const listeners=new Map(),timers=new Map(),updates=[];
let current={id:'source-a',type:'source'},pending=false,serial=0;
const screens={
  registerType(){},current:()=>current,isTransitioning:()=>pending,
  updateData:patch=>updates.push({id:current.id,...patch}),
};
const context=vm.createContext({
  window:{HanamiScreens:screens},scrollY:0,
  addEventListener:(name,fn)=>listeners.set(name,fn),
  setTimeout:fn=>{timers.set(++serial,fn);return serial},
  clearTimeout:id=>timers.delete(id),queueMicrotask,
});
vm.runInContext(code,context);
const scroll=y=>{context.scrollY=y;listeners.get('scroll')()};
const flush=()=>{const callbacks=[...timers.values()];timers.clear();callbacks.forEach(fn=>fn())};
scroll(400);
current={id:'detail-b',type:'explore-detail'};flush();
assert.equal(updates.length,0,'A departed source cannot write its delayed scroll to the detail');
current={id:'source-a',type:'source'};pending=true;
scroll(0);flush();listeners.get('pagehide')();
assert.equal(updates.length,0,'Intermediate layout clamps during a long rehydration are ignored');
pending=false;scroll(850);flush();
assert.equal(updates.length,1);assert.equal(updates[0].id,'source-a');assert.equal(updates[0]._scrollY,850);
scroll(900);pending=true;flush();
assert.equal(updates.length,1,'A transition starting during the debounce cancels the write');
pending=false;context.scrollY=920;listeners.get('pagehide')();
assert.equal(updates[1]._scrollY,920,'Stable pagehide persists the last position immediately');
current={id:'reader',type:'reader'};scroll(1000);flush();listeners.get('pagehide')();
assert.equal(updates.length,2,'Reader owns its separate page progress');
current=null;scroll(0);flush();listeners.get('pagehide')();
assert.equal(updates.length,2);
console.log('PASS: v148 scroll persistence is screen-owned and ignores temporary positions during asynchronous rehydration');