import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../public/overlay-dismiss.js',import.meta.url),'utf8');
const selectors='#modal,#extensionMenu,.md-more,.md-download-menu,.md-settings,#readerSheet,#readerTransition,.notes-menu,.track-menu,.lib-toolbar-menu,.migration-config-menu,.library-bottom-overflow,.updates-item-overflow,.browse-item-overflow';
class Node {
  constructor({id='',classes=[],dialog=false,parent=null}={}) {
    this.id=id;this.tagName=dialog?'DIALOG':'DIV';this.nodeType=1;this.parentElement=parent;
    this.isConnected=true;this.open=dialog;this.classes=new Set(classes);this.attributes=new Set();
    this.classList={contains:x=>this.classes.has(x),add:x=>this.classes.add(x)};
    this.rect={left:30,top:300,right:360,bottom:800};
  }
  matches(selector){return selector.split(',').some(s=>s[0]==='#'?this.id===s.slice(1):s[0]==='.'?this.classes.has(s.slice(1)):false)}
  contains(node){for(let n=node;n;n=n.parentElement)if(n===this)return true;return false}
  closest(){for(let n=this;n;n=n.parentElement)if(n.classes.has('hidden')||n.classes.has('tab-transition-layer')||n.attributes.has('hidden')||n.attributes.has('inert'))return n;return null}
  querySelector(){return null}
  getBoundingClientRect(){return this.rect}
  getAttribute(name){return name==='class'?[...this.classes].join(' '):null}
  close(){this.open=false}
}
function harness(spec={id:'modal',dialog:true}) {
  const body=new Node(),panel=new Node({...spec,parent:body}),inside=new Node({parent:panel}),outside=new Node({parent:body});
  const listeners=new Map(),microtasks=[];
  let mutationCallback,queries=0,backCalls=0;
  const listen=(scope,type,callback)=>{const key=scope+':'+type;const list=listeners.get(key)||[];list.push(callback);listeners.set(key,list)};
  const history={state:{screen:'library'},pushState(s){this.state=s},back(){backCalls++}};
  const document={body,querySelectorAll(s){assert.equal(s,selectors);queries++;return[panel]},addEventListener:(t,f)=>listen('document',t,f)};
  const window={dispatchEvent(){}};
  vm.runInNewContext(source,{
    document,window,history,location:{href:'http://localhost/library'},
    MutationObserver:class {constructor(f){mutationCallback=f}observe(){}},
    CustomEvent:class {constructor(type,options){this.type=type;this.detail=options?.detail}},
    addEventListener:(t,f)=>listen('window',t,f),queueMicrotask:f=>microtasks.push(f),setTimeout,clearTimeout,
  });
  function emit(scope,type,options={}) {
    const e={target:outside,pointerId:28,isPrimary:true,clientX:10,clientY:20,cancelable:true,detail:1,
      preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true},stopPropagation(){this.stopped=true},...options};
    for(const f of listeners.get(scope+':'+type)||[]){f(e);if(e.stopped)break}
    return e;
  }
  emit('window','DOMContentLoaded');
  return {panel,inside,outside,history,api:window.HanamiOverlays,emit,
    get backCalls(){return backCalls},get queries(){return queries},
    mutate:records=>mutationCallback(records),
    pop(){history.state={screen:'library'};emit('window','popstate');while(microtasks.length)microtasks.shift()()},
  };
}
function fire(h,type,target,options={}){return h.emit('document',type,{target,...options})}

// All managed panel types, not just the native dialog, own the entire outside tap.
for(const spec of [{id:'modal',dialog:true},{id:'extensionMenu'},{id:'readerSheet'},{id:'readerTransition'},
  ...['md-settings','md-more','md-download-menu','notes-menu','track-menu','lib-toolbar-menu','migration-config-menu','library-bottom-overflow','updates-item-overflow','browse-item-overflow'].map(x=>({classes:[x]}))]) {
  const h=harness(spec);
  assert.equal(h.api.count(),1);
  const target=spec.dialog?h.panel:h.outside;
  assert.equal(fire(h,'pointerdown',target).stopped,true);
  assert.equal(h.backCalls,0,'pointerdown must not remove the interaction boundary');
  assert.equal(fire(h,'pointerup',target).stopped,true);
  assert.equal(h.backCalls,0,'pointerup must not expose controls before click');
  await new Promise(r=>setTimeout(r,12)); // A delayed compatibility click must still be consumed.
  assert.equal(fire(h,'click',target).stopped,true);
  assert.equal(h.backCalls,1,'only the consumed click requests dismissal');
  fire(h,'click',h.outside);
  assert.equal(h.backCalls,1,'a pending history.back must not be repeated');
  h.pop();assert.equal(h.api.count(),0);
  for(const type of ['pointerdown','pointerup','click'])assert(!fire(h,type,h.outside).stopped,'the next deliberate tap must work');
}
// Dialog padding belongs to the body; only coordinates outside its box are backdrop.
{
  const h=harness();
  for(const type of ['pointerdown','pointerup','click'])assert(!fire(h,type,h.panel,{clientX:35,clientY:305}).stopped);
  assert.equal(h.backCalls,0);
  for(const type of ['pointerdown','pointerup','click'])assert(fire(h,type,h.panel,{clientX:10,clientY:20}).stopped);
  assert.equal(h.backCalls,1);
}
// Crossing the boundary is not an outside tap; neither side receives an action.
for(const [from,to] of [['inside','outside'],['outside','inside']]) {
  const h=harness({classes:['md-settings']});
  fire(h,'pointerdown',h[from]);fire(h,'pointerup',h[to]);
  assert(fire(h,'click',h[to]).stopped);
  assert.equal(h.backCalls,0);
  for(const type of ['pointerdown','pointerup','click'])assert(!fire(h,type,h.inside).stopped);
}
{
  const h=harness({classes:['md-settings']});
  fire(h,'pointerdown',h.outside);fire(h,'pointercancel',h.outside);
  assert.equal(h.backCalls,0);
  for(const type of ['pointerdown','pointerup','click'])assert(!fire(h,type,h.inside).stopped);
}
// Hidden/inert ancestors still reconcile, but unrelated DOM churn does not rescan the document.
{
  const h=harness({classes:['md-settings']});const baseline=h.queries;
  for(let i=0;i<100;i++)h.mutate([{type:'attributes',attributeName:'class',oldValue:'',target:h.outside}]);
  h.mutate([{type:'childList',target:h.outside,addedNodes:[{nodeType:3}],removedNodes:[]}]);
  assert.equal(h.queries,baseline,'unrelated classes/text must not trigger document-wide scans');
  h.panel.classes.add('hidden');
  h.mutate([{type:'attributes',attributeName:'class',oldValue:'md-settings',target:h.panel}]);
  assert.equal(h.backCalls,1,'hiding the overlay must still reconcile its history');
}
// Ancestor visibility, added panels and removal still update the stack.
for(const attributeName of ['hidden','inert']) {
  const h=harness({classes:['md-settings']});
  const parent=h.panel.parentElement;parent.attributes.add(attributeName);parent.querySelector=()=>h.panel;
  h.mutate([{type:'attributes',attributeName,target:parent,oldValue:null}]);
  assert.equal(h.backCalls,1,attributeName+' on an ancestor must reconcile');
}
{
  const h=harness({classes:['md-settings','hidden']});assert.equal(h.api.count(),0);
  h.panel.classes.delete('hidden');
  h.mutate([{type:'childList',addedNodes:[h.panel],removedNodes:[]}]);
  assert.equal(h.api.count(),1,'new overlay subtrees must be discovered');
  h.panel.isConnected=false;
  h.mutate([{type:'childList',addedNodes:[],removedNodes:[h.panel]}]);
  assert.equal(h.backCalls,1,'removed overlays must reconcile');
}
{
  const h=harness({id:'readerSheet',classes:['reader-player-open']});
  assert.equal(h.api.count(),0,'the full player owns its screen-history entry');
}
console.log('PASS: HNM-028 consumes outside clicks for all panels without timers or unrelated DOM scans');
