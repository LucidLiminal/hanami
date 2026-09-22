const KEY='hanami-screen-stack-v1';
const runtime=new Map(),restorers=new Map();
let records=[];try{records=JSON.parse(sessionStorage.getItem(KEY)||'[]')}catch{}
const id=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`;
let currentId=history.state?.hanamiScreenId||null,handling=false;const navigationType=performance.getEntriesByType?.('navigation')?.[0]?.type||'navigate';let reloadPending=navigationType==='reload'&&!!currentId&&!!records.find(x=>x.id===currentId);
function persist(){sessionStorage.setItem(KEY,JSON.stringify(records.slice(-80)))}
function notify(r,action){dispatchEvent(new CustomEvent('hanami-screen-change',{detail:{screen:{...r},action}}))}
function record(screenId){return records.find(x=>x.id===screenId)}
function updateData(patch={}){const r=record(currentId);if(!r)return null;r.data={...(r.data||{}),...patch};persist();history.replaceState({...history.state,hanamiScreenId:r.id},'');notify(r,'update');return r}
function registerType(types,handler){(Array.isArray(types)?types:[types]).forEach(type=>restorers.set(type,handler))}
async function restoreCurrent(){const target=record(currentId);if(!target){reloadPending=false;return false}const chain=[];for(let r=target;r;r=record(r.parent))chain.unshift(r);let restored=false,last=null;for(const r of chain){const handler=restorers.get(r.type);if(!handler)continue;currentId=r.id;const result=await handler(r);if(result===false)continue;restored=true;last=r}reloadPending=false;if(restored&&last){if(last.id!==target.id){target.closed=true;persist()}currentId=last.id;history.replaceState({...history.state,hanamiScreenId:last.id},'');notify(last,'rehydrate');requestAnimationFrame(()=>scrollTo({top:Number(last.data?._scrollY)||0,behavior:'instant'}))}return restored}
function spec(type,data={}){return{id:id(),type,data,parent:currentId,closed:false,at:Date.now()}}
function bind(r,handlers={}){runtime.set(r.id,handlers);currentId=r.id;persist();return r}
function push(type,data={},handlers={}){const r=spec(type,data);records.push(r);bind(r,handlers);history.pushState({...history.state,hanamiScreenId:r.id},'');notify(r,'push');return r.id}
function replace(type,data={},handlers={}){const old=record(currentId),r={...spec(type,data),id:currentId||id(),parent:old?.parent||null};records=records.filter(x=>x.id!==r.id);records.push(r);bind(r,handlers);history.replaceState({...history.state,hanamiScreenId:r.id},'');notify(r,'replace');return r.id}
function root(tab,handlers={}){const current=record(currentId),restore=handlers.restore;if(current?.type!=='root')return push('root',{tab},handlers);const currentTab=current.data?.tab||'library';if(tab===currentTab){runtime.set(current.id,handlers);notify(current,'root');return current.id}if(tab==='library'){const parent=record(current.parent);if(parent?.type==='root'&&parent.data?.tab==='library'&&!parent.closed){current.closed=true;persist();history.back();return parent.id}return replace('root',{tab},handlers)}if(currentTab==='library')return push('root',{tab},handlers);return replace('root',{tab},handlers)}
function markClosed(screenId=currentId){const r=record(screenId);if(r){r.closed=true;persist()}return r?.parent||null}
function fallback(){const roots=records.filter(x=>x.type==='root'&&!x.closed),r=roots.at(-1);if(r){currentId=r.id;runtime.get(r.id)?.restore?.(r);return}window.HanamiAppShowTab?.('library',false)}
function back(){if(handling)return;if(history.length>1)history.back();else fallback()}
function onPop(e){const destination=e.state?.hanamiScreenId;if(!destination||destination===currentId)return;const previous=currentId,prevRuntime=runtime.get(previous),r=record(destination);e.stopImmediatePropagation();handling=true;try{prevRuntime?.suspend?.();if(!r||r.closed){currentId=destination;queueMicrotask(()=>{handling=false;back()});return}currentId=destination;const fn=runtime.get(destination)?.restore;if(fn)fn(r);else window.dispatchEvent(new CustomEvent('hanami-screen-restore',{detail:r}));notify(r,'pop');}finally{if(handling)handling=false}}
addEventListener('popstate',onPop,true);
if(!currentId){const r=spec('root',{tab:'library'});records.push(r);currentId=r.id;history.replaceState({...history.state,hanamiScreenId:r.id},'');persist()}
window.HanamiScreens={push,replace,root,back,markClosed,updateData,registerType,restoreCurrent,needsRestore:()=>reloadPending,current:()=>record(currentId),is:type=>record(currentId)?.type===type,register(id,handlers){runtime.set(id,handlers)},snapshot:()=>records.map(x=>({...x}))};
