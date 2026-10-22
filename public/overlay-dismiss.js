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
const observer=new MutationObserver(scan);
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
let pendingModalDismissal=null,modalDismissalTimer=null;const clearPendingModalDismissal=()=>{clearTimeout(modalDismissalTimer);modalDismissalTimer=null;pendingModalDismissal=null};document.addEventListener('pointerdown',e=>{const entry=stack.at(-1);if(!entry)return;const n=entry.node;if(isDialog(n)&&e.target===n){e.preventDefault();e.stopImmediatePropagation();clearPendingModalDismissal();pendingModalDismissal={node:n,pointerId:e.pointerId,released:false};return}if(!isDialog(n)&&!n.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();requestClose()}},true);document.addEventListener('pointerup',e=>{const pending=pendingModalDismissal;if(!pending||pending.pointerId!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();pending.released=true;if(stack.at(-1)?.node===pending.node)requestClose();else closeNode(pending.node);clearTimeout(modalDismissalTimer);modalDismissalTimer=setTimeout(()=>{if(pendingModalDismissal===pending)clearPendingModalDismissal()},0)},true);document.addEventListener('pointercancel',e=>{if(!pendingModalDismissal||pendingModalDismissal.pointerId!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();clearPendingModalDismissal()},true);document.addEventListener('click',e=>{const pending=pendingModalDismissal;if(!pending?.released)return;e.preventDefault();e.stopImmediatePropagation();clearPendingModalDismissal()},true);
addEventListener('DOMContentLoaded',()=>{observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','open']});scan()},{once:true});
window.HanamiOverlays={close:requestClose,current:()=>stack.at(-1)?.node||null,count:()=>stack.length,scan,discardForNavigation};
