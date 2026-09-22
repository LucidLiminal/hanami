const DURATION=200,GAP=.35;let sequence=0,current=null;
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||(()=>{try{return JSON.parse(localStorage.getItem('hanami-reduce-motion')||'false')}catch{return false}})();
function visibleMainChildren(){const main=document.querySelector('body>main');return main?[...main.children].filter(node=>!node.classList.contains('hidden')&&getComputedStyle(node).display!=='none'):[]}
function sanitize(node){node.removeAttribute?.('id');node.removeAttribute?.('autofocus');node.querySelectorAll?.('[id],[autofocus]').forEach(child=>{child.removeAttribute('id');child.removeAttribute('autofocus')});node.setAttribute?.('aria-hidden','true');node.inert=true;return node}
function cancel(){
  if(!current)return;
  clearTimeout(current.timer);current.incoming.forEach(node=>node.classList.remove('tab-fade-through-in'));current.layer.remove();document.body.classList.remove('tab-transition-running');document.querySelector('body>main')?.removeAttribute('aria-busy');current=null
}
function begin({from,to}={}){
  cancel();if(!from||from===to||reduced())return null;
  const main=document.querySelector('body>main'),visible=visibleMainChildren();if(!main||!visible.length)return null;
  const layer=document.createElement('div'),snapshot=document.createElement('div'),rect=main.getBoundingClientRect(),id=++sequence;
  layer.className='tab-transition-layer';layer.dataset.transitionId=String(id);layer.setAttribute('aria-hidden','true');
  snapshot.className='tab-transition-snapshot';snapshot.style.cssText=`left:${rect.left}px;top:${rect.top}px;width:${rect.width}px`;
  visible.forEach(node=>snapshot.append(sanitize(node.cloneNode(true))));layer.append(snapshot);document.body.append(layer);void layer.offsetWidth;layer.classList.add('tab-fade-through-out');
  document.body.classList.add('tab-transition-running');main.setAttribute('aria-busy','true');current={id,layer,incoming:[],timer:0,from,to};dispatchEvent(new CustomEvent('hanami-tab-transition-start',{detail:{id,from,to,duration:DURATION,gap:GAP}}));return id
}
function finish(id){
  if(!id||!current||current.id!==id)return false;
  current.incoming=visibleMainChildren();current.incoming.forEach(node=>{node.classList.remove('tab-fade-through-in');void node.offsetWidth;node.classList.add('tab-fade-through-in')});
  current.timer=setTimeout(()=>{if(!current||current.id!==id)return;const detail={id,from:current.from,to:current.to};cancel();dispatchEvent(new CustomEvent('hanami-tab-transition-end',{detail}))},DURATION+34);return true
}
addEventListener('pagehide',cancel);document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel()});
window.HanamiTabTransitions={begin,finish,cancel,reduced,duration:DURATION,gap:GAP,isRunning:()=>!!current};