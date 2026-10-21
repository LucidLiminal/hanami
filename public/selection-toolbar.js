const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ICONS={close:'<path d="M15 18l-6-6 6-6"/>',all:'<rect x="5" y="5" width="14" height="14" rx="2"/><path d="m8 12 2.5 2.5L16 9"/>',invert:'<path d="M4 4h11v11H4zM9 9h11v11H9z"/>',category:'<path d="M4 5h6l2 2h8v12H4z"/>',read:'<path d="m4 12 5 5L20 6"/>',unread:'<circle cx="12" cy="12" r="8"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M5 20h14"/>',bookmark:'<path d="M6 4h12v16l-6-4-6 4z"/>',migrate:'<path d="M4 8h13m-3-3 3 3-3 3M20 16H7m3-3-3 3 3 3"/>',delete:'<path d="M5 7h14M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"/>',library:'<path d="M4 5h15v15H6a2 2 0 0 1-2-2zM4 5v13"/>',pause:'<path d="M8 5v14M16 5v14"/>',resume:'<path d="m9 6 9 6-9 6z"/>',more:'<path d="M5 12h.01M12 12h.01M19 12h.01"/>',until:'<path d="M4 12l4 4L18 6M13 18h7"/>'};
const icon=n=>`<svg aria-hidden="true" viewBox="0 0 24 24">${ICONS[n]||ICONS[n==='remove'?'delete':'unread']}</svg>`;
function top(screen,count,o={}){return `<div class="selection-topbar ${E(o.className||'')}" data-selection-toolbar="${E(screen)}" role="toolbar" aria-label="Acciones de selección"><button ${o.close||'data-selection-close'} aria-label="Cancelar selección">${icon('close')}</button><b aria-live="polite">${count}</b><span></span><button ${o.all||'data-selection-all'} aria-label="Seleccionar todo" title="Seleccionar todo">${icon('all')}</button><button ${o.invert||'data-selection-invert'} aria-label="Invertir selección" title="Invertir selección">${icon('invert')}</button></div>`}
function bottom(screen,actions){return `<nav class="selection-bottombar" data-selection-actions="${E(screen)}" aria-label="Acciones para elementos seleccionados">${actions.map(a=>`<button ${a.attr} ${a.disabled?'disabled':''} aria-label="${E(a.label)}" title="${E(a.label)}">${icon(a.icon)}<small aria-hidden="true">${E(a.label)}</small></button>`).join('')}</nav>`}
function activate(screen,count){document.body.classList.add('selection-toolbar-active');document.body.dataset.selectionScreen=screen;announce(`${count} seleccionado${count===1?'':'s'}`)}
function deactivate(screen){if(!screen||document.body.dataset.selectionScreen===screen){document.body.classList.remove('selection-toolbar-active');delete document.body.dataset.selectionScreen}}
function announce(text){let n=document.getElementById('selectionAnnouncer');if(!n){n=document.createElement('p');n.id='selectionAnnouncer';n.className='sr-only';n.setAttribute('aria-live','polite');document.body.append(n)}n.textContent=text}
function visibleClose(){return [...document.querySelectorAll('[data-selection-close],[data-lib-clear],[data-nav-cancel]')].reverse().find(x=>x.getClientRects().length&&!x.closest('.hidden'))}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('selection-toolbar-active')){const b=visibleClose();if(b){e.preventDefault();e.stopImmediatePropagation();b.click()} }},true);
window.HanamiSelectionToolbar={top,bottom,activate,deactivate,announce,icon};
// Selection bars and reader page actions share the same label gesture:
// a short press executes; a 500ms hold explains the icon without executing it.
// All icon-only navigation bars use this recognizer. A short press keeps its
// normal action; a 500ms hold exposes the accessible text label instead.
const actionButtonSelector = [
  '.selection-bottombar button',
  '.library-toolbar-actions button',
  '.main-nav [data-tab]',
  '.reader-navigation:not(.reader-page-actions-nav)>button',
  '.reader-page-actions-nav > [data-reader-page-action]',
].join(',');
let actionPress = null;
const suppressedActions = new WeakSet();
function cancelActionPress() {
  if (!actionPress) return;
  clearTimeout(actionPress.timer);
  actionPress = null;
}
document.addEventListener('pointerdown', e => {
  cancelActionPress();
  const button = e.target.closest?.(actionButtonSelector);
  if (!button || button.disabled || e.button !== 0 || e.isPrimary === false) return;
  // Cancellation may not generate a click. Never suppress the next intentional
  // press because the preceding long touch ended with pointercancel.
  suppressedActions.delete(button);
  const press = { button, pointerId: e.pointerId, x: e.clientX, y: e.clientY };
  actionPress = press;
  press.timer = setTimeout(() => {
    if (actionPress !== press || !button.isConnected || button.disabled) return;
    suppressedActions.add(button);
    button.classList.add('show-action-label');
    clearTimeout(button._labelTimer);
    button._labelTimer = setTimeout(() => button.classList.remove('show-action-label'), 2400);
    navigator.vibrate?.(25);
  }, 500);
}, true);
document.addEventListener('pointermove', e => {
  if (actionPress?.pointerId === e.pointerId &&
      Math.hypot(e.clientX - actionPress.x, e.clientY - actionPress.y) > 12) cancelActionPress();
}, true);
for (const eventName of ['pointerup', 'pointercancel']) {
  document.addEventListener(eventName, e => {
    if (actionPress?.pointerId === e.pointerId) cancelActionPress();
  }, true);
}
document.addEventListener('click', e => {
  const button = e.target.closest?.(actionButtonSelector);
  if (!button || !suppressedActions.has(button)) return;
  suppressedActions.delete(button);
  // Keyboard and programmatic activation do not belong to the held pointer.
  if (e.detail === 0) return;
  e.preventDefault();
  e.stopImmediatePropagation();
}, true);
document.addEventListener('contextmenu', e => {
  if (e.target.closest?.(actionButtonSelector)) e.preventDefault();
}, true);
window.addEventListener('blur', cancelActionPress);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancelActionPress();
});

