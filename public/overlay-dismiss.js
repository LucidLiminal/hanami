const SELECTORS=['#modal','#extensionMenu','.md-more','.md-download-menu','.md-settings','#readerSheet','#readerTransition','.notes-menu','.track-menu','.lib-toolbar-menu','.migration-config-menu','.library-bottom-overflow','.updates-item-overflow','.browse-item-overflow'];
const stack=[];let serial=0,fromPop=false;
const isDialog=n=>n?.tagName==='DIALOG';
// The full music player and its child tools own their screen-history entries.
// Other reader sheets (settings, viewer mode, etc.) remain generic overlays.
const managed=n=>!(n?.id==='readerSheet'&&n.classList.contains('reader-player-open'));
const visible=n=>!!n&&n.isConnected&&!n.closest('.hidden,[hidden],[inert],.tab-transition-layer')&&(isDialog(n)?n.open:!n.classList.contains('hidden'));
const findEntry=n=>stack.find(x=>x.node===n);
function closeNode(n){if(!n)return;if(isDialog(n)){if(n.open)n.close()}else n.classList.add('hidden')}
function pushOverlay(node){if(!managed(node)||!visible(node)||findEntry(node))return;const entry={node,token:`overlay-${Date.now()}-${++serial}`,hidden:false,closing:false};stack.push(entry);history.pushState({...history.state,hanamiOverlay:entry.token},'',location.href);window.dispatchEvent(new CustomEvent('hanami-overlay-open',{detail:{token:entry.token}}))}
function finishHidden(entry){const i=stack.indexOf(entry);if(i<0)return;if(i!==stack.length-1){stack.splice(i,1);return}entry.hidden=true;if(history.state?.hanamiOverlay===entry.token){if(!entry.closing){entry.closing=true;history.back()}}else stack.pop()}
function scan(){document.querySelectorAll(SELECTORS.join(',')).forEach(n=>{if(!managed(n))return;const e=findEntry(n);if(visible(n)){if(!e)pushOverlay(n)}else if(e&&!fromPop)finishHidden(e)});for(const e of [...stack])if(!e.node.isConnected&&!fromPop)finishHidden(e)}
const OVERLAY_SELECTOR=SELECTORS.join(',');
const VISIBILITY_CLASSES=new Set(['hidden','tab-transition-layer']);
const visibilityClasses=value=>String(value||'').split(/\s+/).filter(x=>VISIBILITY_CLASSES.has(x)).sort().join(' ');
const includesOverlay=node=>node?.nodeType===1&&(node.matches(OVERLAY_SELECTOR)||!!node.querySelector(OVERLAY_SELECTOR));
function overlayMutations(records){
 // Class changes in cards, progress indicators and reader animations do not
 // change the overlay stack. Discover new panels only in the added subtrees.
 for(const record of records){
  if(record.type==='childList'){
   if(stack.some(entry=>!entry.node.isConnected)||[...record.addedNodes].some(includesOverlay)){scan();return}
   continue;
  }
  const node=record.target;
  if(node.matches(OVERLAY_SELECTOR)||findEntry(node)){scan();return}
  if(record.attributeName==='class'&&visibilityClasses(record.oldValue)===visibilityClasses(node.getAttribute('class')))continue;
  if(includesOverlay(node)){scan();return}
 }
}
const observer=new MutationObserver(overlayMutations);
function requestClose(){const entry=stack.at(-1);if(!entry)return false;if(history.state?.hanamiOverlay===entry.token){if(!entry.closing){entry.closing=true;history.back()}}else{stack.pop();closeNode(entry.node)}return true}
function discardForNavigation(){
 // The browser already moved to another screen (possibly skipping overlays).
 // Discard their visual state without issuing a second history.back().
 fromPop=true;
 for(const entry of stack.splice(0))closeNode(entry.node);
 queueMicrotask(()=>{fromPop=false;scan()});
}
addEventListener('popstate',e=>{const entry=stack.at(-1);if(!entry)return;stack.pop();fromPop=true;closeNode(entry.node);queueMicrotask(()=>{fromPop=false;scan()});e.preventDefault();e.stopImmediatePropagation();window.dispatchEvent(new CustomEvent('hanami-overlay-close',{detail:{token:entry.token}}))},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&stack.length){e.preventDefault();e.stopImmediatePropagation();requestClose()}},true);
document.addEventListener('cancel',e=>{if(isDialog(e.target)&&findEntry(e.target)){e.preventDefault();requestClose()}},true);
// Keep the boundary alive until the terminal click has been consumed. Closing
// on pointerdown/up exposes the underlay to the remainder of that same gesture.
// This applies equally to native dialogs, filter sheets and popup menus.
let overlayGesture=null;
function outsideOverlay(node,event){
 if(!node.contains(event.target))return true;
 if(!isDialog(node)||event.target!==node)return false;
 // Native backdrop events target the dialog itself. Its padding is still body.
 const rect=node.getBoundingClientRect();
 return event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom;
}
function consumeOutsideEvent(event){
 if(event.cancelable)event.preventDefault();
 event.stopImmediatePropagation();
}
document.addEventListener('pointerdown',event=>{
 const entry=stack.at(-1);
 if(!entry){overlayGesture=null;return}
 const outside=outsideOverlay(entry.node,event);
 if(event.isPrimary!==false)overlayGesture={entry,pointerId:event.pointerId,startsOutside:outside,endsOutside:null};
 if(outside)consumeOutsideEvent(event);
},true);
document.addEventListener('pointerup',event=>{
 const entry=stack.at(-1);if(!entry)return;
 const outside=outsideOverlay(entry.node,event);
 const gesture=overlayGesture?.entry===entry&&overlayGesture.pointerId===event.pointerId?overlayGesture:null;
 if(gesture)gesture.endsOutside=outside;
 if(outside||gesture?.startsOutside)consumeOutsideEvent(event);
},true);
document.addEventListener('pointercancel',event=>{
 const gesture=overlayGesture;
 if(!gesture||gesture.pointerId!==event.pointerId)return;
 overlayGesture=null;
 if(gesture.startsOutside)consumeOutsideEvent(event);
},true);
document.addEventListener('click',event=>{
 const entry=stack.at(-1);
 const gesture=overlayGesture?.entry===entry?overlayGesture:null;
 overlayGesture=null;
 if(!entry)return;
 const outside=outsideOverlay(entry.node,event);
 if(!outside&&!gesture?.startsOutside&&!gesture?.endsOutside)return;
 consumeOutsideEvent(event);
 // A drag crossing the boundary is not a tap and must not activate either side.
 if(outside&&(!gesture||(gesture.startsOutside&&gesture.endsOutside!==false)))requestClose();
},true);
addEventListener('DOMContentLoaded',()=>{observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','open','hidden','inert'],attributeOldValue:true});scan()},{once:true});
window.HanamiOverlays={close:requestClose,current:()=>stack.at(-1)?.node||null,count:()=>stack.length,scan,discardForNavigation,revision:'hnm028-r2'};
