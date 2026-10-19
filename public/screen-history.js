const KEY='hanami-screen-stack-v1';
const runtime=new Map(),restorers=new Map();
let records=[];try{records=JSON.parse(sessionStorage.getItem(KEY)||'[]')}catch{}
const id=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`;
let currentId=history.state?.hanamiScreenId||null,handling=false,backPending=false,transition=0,rehydratingId=null;
const navigationType=performance.getEntriesByType?.('navigation')?.[0]?.type||'navigate';let reloadPending=navigationType==='reload'&&!!currentId&&!!records.find(x=>x.id===currentId);
const traceLog=[];
let traceEnabled=sessionStorage.getItem('hanami-navigation-debug-v1')==='true';
const screenSummary=r=>r?{id:r.id,type:r.type,parent:r.parent,tab:r.data?.tab||null}:null;
function trace(action,extra={}){
 if(!traceEnabled)return;
 const entry={at:Date.now(),action,screen:screenSummary(record(currentId)),...extra};
 traceLog.push(entry);if(traceLog.length>120)traceLog.shift();
 console.debug('[Hanami Navigation]',entry);
}
function visible(node){
 return !!node&&node.isConnected&&!node.closest('.hidden,[hidden],.tab-transition-layer')&&
  (typeof node.checkVisibility!=='function'||node.checkVisibility());
}
function debugSnapshot(){
 return{
  screen:screenSummary(record(currentId)),
  history:{screenId:history.state?.hanamiScreenId||null,overlay:!!history.state?.hanamiOverlay},
  pending:handling||backPending||!!rehydratingId,
  ui:typeof document==='undefined'?null:{
   root:document.body?.dataset.root||null,child:!!document.body?.classList.contains('nav-child'),
   surfaces:['library','updates','history','more','sources','extensions','migrate','browser','browseChild','globalSearch'].filter(x=>visible(document.getElementById(x))),
   details:[...document.querySelectorAll('.mihon-detail')].filter(visible).length,
   reader:visible(document.getElementById('reader')),overlays:window.HanamiOverlays?.count?.()||0
  }
 };
}
const debug={
 enable(value=true){traceEnabled=!!value;sessionStorage.setItem('hanami-navigation-debug-v1',String(traceEnabled));trace('debug:enabled');return debugSnapshot()},
 snapshot:debugSnapshot,
 report:()=>({snapshot:debugSnapshot(),events:traceLog.map(x=>({...x}))}),
 clear(){traceLog.length=0}
};
function persist(){sessionStorage.setItem(KEY,JSON.stringify(records.slice(-80)))}
function notify(r,action){trace(action);dispatchEvent(new CustomEvent('hanami-screen-change',{detail:{screen:{...r},action}}))}
function record(screenId){return records.find(x=>x.id===screenId)}
function updateData(patch={}){const r=record(currentId);if(!r)return null;r.data={...(r.data||{}),...patch};persist();if(!rehydratingId||rehydratingId===r.id){history.replaceState({...history.state,hanamiScreenId:r.id},'');notify(r,'update')}return r}
function registerType(types,handler){(Array.isArray(types)?types:[types]).forEach(type=>restorers.set(type,handler))}
async function restoreCurrent(){const target=record(currentId);if(!target){reloadPending=false;return false}rehydratingId=target.id;const token=++transition,chain=[];const seen=new Set();for(let r=target;r&&!seen.has(r.id);r=record(r.parent)){seen.add(r.id);chain.unshift(r)}let restored=false,last=null;for(const r of chain){if(token!==transition)return true;const handler=restorers.get(r.type);if(!handler||r.closed)continue;currentId=r.id;const result=await handler(r);if(token!==transition)return true;if(result===false)continue;restored=true;last=r}reloadPending=false;rehydratingId=null;if(restored&&last){if(last.id!==target.id){target.closed=true;persist()}currentId=last.id;history.replaceState({...history.state,hanamiScreenId:last.id},'');notify(last,'rehydrate');requestAnimationFrame(()=>{if(currentId===last.id)scrollTo({top:Number(last.data?._scrollY)||0,behavior:'instant'})})}return restored}
function spec(type,data={}){return{id:id(),type,data,parent:currentId,closed:false,at:Date.now()}}
function bind(r,handlers={}){transition++;handling=false;backPending=false;reloadPending=false;rehydratingId=null;runtime.set(r.id,handlers);currentId=r.id;persist();return r}
function push(type,data={},handlers={}){const r=spec(type,data);records.push(r);bind(r,handlers);history.pushState({...history.state,hanamiScreenId:r.id},'');notify(r,'push');return r.id}
function replace(type,data={},handlers={}){const old=record(currentId),r={...spec(type,data),id:currentId||id(),parent:old?.parent||null};records=records.filter(x=>x.id!==r.id);records.push(r);bind(r,handlers);history.replaceState({...history.state,hanamiScreenId:r.id},'');notify(r,'replace');return r.id}
function root(tab,handlers={}){const current=record(currentId),restore=handlers.restore;if(current?.type!=='root')return push('root',{tab},handlers);const currentTab=current.data?.tab||'library';if(tab===currentTab){runtime.set(current.id,handlers);notify(current,'root');return current.id}if(tab==='library'){const parent=record(current.parent);if(parent?.type==='root'&&parent.data?.tab==='library'&&!parent.closed){current.closed=true;persist();history.back();return parent.id}return replace('root',{tab},handlers)}if(currentTab==='library')return push('root',{tab},handlers);return replace('root',{tab},handlers)}
function markClosed(screenId=currentId){const r=record(screenId);if(r){r.closed=true;persist()}return r?.parent||null}
function ancestry(screenId){
 const chain=[],seen=new Set();
 for(let r=record(screenId);r&&!seen.has(r.id);r=record(r.parent)){seen.add(r.id);chain.push(r)}
 return chain;
}
async function suspendDeparted(previous,destination,token){
 const kept=new Set(ancestry(destination).map(r=>r.id));
 for(const r of ancestry(previous)){
  if(kept.has(r.id))break;
  const suspend=runtime.get(r.id)?.suspend;
  if(suspend){trace('suspend',{leaving:screenSummary(r)});await suspend(r)}
  if(token!==transition)return;
 }
}
async function restoreRecord(r){
 const handler=runtime.get(r.id)?.restore||restorers.get(r.type);
 if(!handler){trace('restore:missing',{target:screenSummary(r)});window.dispatchEvent(new CustomEvent('hanami-screen-restore',{detail:r}));return false}
 trace('restore:start',{target:screenSummary(r)});
 return (await handler(r))!==false;
}
async function recover(target,token){
 // Unsupported/transient destinations must not leave the outgoing UI on screen.
 for(const r of ancestry(target?.parent)){
  if(r.closed)continue;
  currentId=r.id;
  if(await restoreRecord(r)){
   if(token!==transition)return false;
   history.replaceState({...history.state,hanamiScreenId:r.id,hanamiOverlay:undefined},'');
   notify(r,'fallback');return true;
  }
  if(token!==transition)return false;
 }
 const r=records.find(x=>x.type==='root'&&x.data?.tab==='library'&&!x.closed)||records.find(x=>x.type==='root'&&!x.closed);
 if(r){currentId=r.id;await restoreRecord(r);if(token!==transition)return false;history.replaceState({...history.state,hanamiScreenId:r.id,hanamiOverlay:undefined},'');notify(r,'fallback');return true}
 window.HanamiAppShowTab?.('library',false);return false;
}
async function fallback(){
 const token=++transition,previous=currentId;
 handling=true;
 try{await suspendDeparted(previous,null,token);if(token===transition)await recover(null,token)}
 finally{if(token===transition){handling=false;backPending=false}}
}
function back(){
 if(window.HanamiOverlays?.current?.()){trace('back:overlay');window.HanamiOverlays.close();return true}
 if(backPending){trace('back:coalesced');return true}
 trace('back:request');
 if(history.length>1){backPending=true;history.back();return true}
 void fallback();return true;
}
async function onPop(e){
 const destination=e.state?.hanamiScreenId;
 if(!destination||(destination===currentId&&!rehydratingId)){backPending=false;return}
 const previous=currentId,r=record(destination),token=++transition;
 e.stopImmediatePropagation();handling=true;currentId=destination;reloadPending=false;rehydratingId=null;
 window.HanamiOverlays?.discardForNavigation?.();
 trace('pop:start',{from:screenSummary(record(previous)),to:screenSummary(r)});
 try{
  await suspendDeparted(previous,destination,token);
  if(token!==transition)return;
  if(r?.closed){backPending=false;history.back();return}
  backPending=false;
  if(!r||!await restoreRecord(r)){
   if(token!==transition)return;
   if(r){r.closed=true;persist()}
   await recover(r,token);return;
  }
  if(token!==transition)return;
  notify(r,'pop');
  requestAnimationFrame(()=>{if(currentId===r.id&&r.type!=='reader')scrollTo({top:Number(r.data?._scrollY)||0,behavior:'instant'})});
 }catch(error){
  if(token!==transition)return;
  trace('restore:error',{message:String(error?.message||error)});
  window.dispatchEvent(new CustomEvent('hanami-screen-error',{detail:{screen:screenSummary(r),message:String(error?.message||error)}}));
  await recover(r,token);
 }finally{if(token===transition){handling=false;backPending=false;trace('pop:settled')}}
}
addEventListener('popstate',onPop,true);
if(!currentId){const r=spec('root',{tab:'library'});records.push(r);currentId=r.id;history.replaceState({...history.state,hanamiScreenId:r.id},'');persist()}
window.HanamiScreens={push,replace,root,back,markClosed,updateData,registerType,restoreCurrent,needsRestore:()=>reloadPending,current:()=>record(currentId),is:type=>record(currentId)?.type===type,register(id,handlers){runtime.set(id,{...runtime.get(id),...handlers})},snapshot:()=>records.map(x=>({...x})),debug};
