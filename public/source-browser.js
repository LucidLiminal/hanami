const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const saveIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4V3Z"/></svg>';

export function normalizeMangaUrl(value, base = 'https://identity.invalid/') {
  try { const url = new URL(String(value || ''), base); url.hash = ''; if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, ''); return url.href; }
  catch { return String(value || '').trim(); }
}
export function mangaKeys(manga, sourceId, resolveIdentity, base) {
  const keys = [], scope = String(sourceId || manga.sourceId || '');
  if (!scope || manga.sourceId && String(manga.sourceId) !== scope) return keys;
  if (manga.url) keys.push(`${scope}|url|${normalizeMangaUrl(manga.url, base)}`);
  const remote = String(manga.remoteWorkId ?? manga.seriesId ?? '').trim();
  if (remote) keys.push(`${scope}|remote|${remote}`);
  const work = manga.workId || resolveIdentity?.({sourceId:scope,mangaUrl:manga.url,mangaId:manga.id,remoteWorkId:remote});
  if (work) keys.push(`${scope}|work|${work}`);
  return keys;
}
export function savedMangaKeys(library, sourceId, resolveIdentity, base) {
  return new Set((Array.isArray(library) ? library : []).filter(item => item.favorite !== false && String(item.sourceId || '') === String(sourceId)).flatMap(item => mangaKeys(item, sourceId, resolveIdentity, base)));
}
export class SourcePageBuffer {
  constructor(sourceId, resolveIdentity, base) {
    Object.assign(this,{sourceId,resolveIdentity,base,items:[],page:0,hasNextPage:true,total:null,keys:new Set(),signatures:new Set(),noProgress:0});
  }
  append(response, requested) {
    if (!response || !Array.isArray(response.mangas) || requested !== this.page + 1 ||
        response.page != null && Number(response.page) !== requested ||
        response.hasNextPage != null && typeof response.hasNextPage !== 'boolean' ||
        response.hasNextPage && response.nextPage != null && Number(response.nextPage) !== requested + 1)
      throw Error('La fuente devolvió una página de resultados inválida.');
    const rows = response.mangas.filter(manga => manga && typeof manga.url === 'string' && manga.url.trim());
    if (response.mangas.length && !rows.length) throw Error('No se reconocieron obras válidas en la respuesta.');
    const next = response.hasNextPage === true;
    if (!rows.length && next) throw Error('La fuente anunció más resultados, pero devolvió una página vacía.');
    const signature = rows.map(manga => String(manga.remoteWorkId || '') + '|' + normalizeMangaUrl(manga.url,this.base)).sort().join('\n');
    if (rows.length && this.signatures.has(signature)) throw Error('La fuente repitió una página. Se detuvo la carga para evitar un bucle.');
    const added = [], newKeys = new Set(this.keys);
    for (const manga of rows) {
      const keys = mangaKeys(manga,this.sourceId,this.resolveIdentity,this.base);
      if (keys.length && !keys.some(key => newKeys.has(key))) added.push(manga);
      keys.forEach(key => newKeys.add(key));
    }
    const noProgress = rows.length && !added.length ? this.noProgress + 1 : 0;
    if (noProgress >= 3 && next) throw Error('La fuente no aportó obras nuevas tras varias páginas.');
    this.keys = newKeys; this.noProgress = noProgress;
    if (rows.length) this.signatures.add(signature);
    this.items.push(...added); this.page = requested; this.hasNextPage = next;
    if (response.total != null && Number.isInteger(Number(response.total)) && Number(response.total) >= 0) this.total = Number(response.total);
    return added;
  }
}

export function createSourceBrowser({root,results,status,queryInput,fetchPage,getScreen,onItems,onData,getLibrary,getDisplay,resolveIdentity,localActions=()=>''}) {
  const cache = new Map();
  let current = null, generation = 0, observer = null, frame = 0, libraryFrame = 0;
  const label = mode => ({popular:'Popular',latest:'Recientes',search:'Búsqueda'}[mode] || 'Resultados');
  function owns(context) {
    return !!context && context === current && context.active && context.generation === generation &&
      !root.classList.contains('hidden') && root.dataset.browserView === 'list' &&
      (!context.screenId || getScreen?.()?.id === context.screenId);
  }
  function stash(context, remember) {
    if (!context) return;
    if (remember && owns(context)) {
      context.scrollY = Math.round(window.scrollY);
      if (getScreen?.()?.type === 'source') onData?.({loadedPages:context.buffer.page,_scrollY:context.scrollY});
    }
    if(context.invalidated)return;
    cache.delete(context.key); cache.set(context.key,{buffer:context.buffer,scrollY:context.scrollY});
    while (cache.size > 8) cache.delete(cache.keys().next().value);
  }
  function suspend({remember=true}={}) {
    stash(current,remember);
    if (current) {current.active=false;current.controller?.abort();}
    generation++; observer?.disconnect(); observer=null;
    if (frame) cancelAnimationFrame(frame); frame=0;
  }
  function updateChrome(context) {
    const search = context.mode === 'search';
    root.querySelectorAll('[data-source-popular],[data-source-latest]').forEach(button=>{
      const selected = button.hasAttribute(`data-source-${context.mode}`);
      button.classList.toggle('is-active',selected);button.setAttribute('aria-pressed',String(selected));
    });
    results.setAttribute('aria-label',search ? `Resultados de búsqueda: ${context.query}` : label(context.mode));
    const count = context.buffer.items.length;
    const quantity = context.buffer.hasNextPage && context.buffer.total > count ?
      `${count} de ${context.buffer.total} obras` : `${count} obra${count===1?'':'s'}`;
    status.textContent = context.loading && !count ? 'Consultando la fuente…' :
      `${quantity} · ${label(context.mode)}${search ? ` · «${context.query}»` : ''}`;
    results.setAttribute('aria-busy',String(context.loading));
  }
  function renderCard(manga,index,saved) {
    const title = manga.title || 'Obra sin título';
    return `<button type="button" class="card source-card${saved?' in-library':''}" data-manga="${index}" data-in-library="${saved}" aria-label="${escapeHtml(title)}${saved?' · En tu biblioteca':''}"><span class="source-card-cover"><img loading="lazy" decoding="async" src="${escapeHtml(manga.thumbnailUrl || '/assets/fallen.webp')}" alt=""><span class="source-saved-badge" title="En tu biblioteca" aria-hidden="true"${saved?'':' hidden'}>${saveIcon}</span></span><div class="source-card-copy"><b>${escapeHtml(title)}</b><small>${escapeHtml(current.source.name)}</small></div></button>`;
  }
  function savedKeys(context) { return savedMangaKeys(getLibrary?.()||[],context.source.id,resolveIdentity,context.base); }
  function appendCards(context,added) {
    const saved = savedKeys(context), offset = context.buffer.items.length-added.length;
    context.grid.insertAdjacentHTML('beforeend',added.map((manga,index)=>renderCard(manga,offset+index,mangaKeys(manga,context.source.id,resolveIdentity,context.base).some(key=>saved.has(key)))).join(''));
  }
  function syncLibrary() {
    if (!owns(current)) return;
    const saved = savedKeys(current);
    current.grid.querySelectorAll('[data-manga]').forEach(card=>{
      const manga=current.buffer.items[Number(card.dataset.manga)];if(!manga)return;
      const exists=mangaKeys(manga,current.source.id,resolveIdentity,current.base).some(key=>saved.has(key));
      card.classList.toggle('in-library',exists);card.dataset.inLibrary=String(exists);
      card.setAttribute('aria-label',`${manga.title||'Obra sin título'}${exists?' · En tu biblioteca':''}`);
      card.querySelector('.source-saved-badge').hidden=!exists;
    });
  }
  function renderFooter(context) {
    if (!owns(context)) return;
    const empty = !context.buffer.items.length;
    context.empty.hidden = !empty || context.loading || !!context.error;
    context.spinner.hidden = !context.loading;
    context.more.hidden = context.loading || !context.error && !context.buffer.hasNextPage;
    context.more.textContent = context.error ? 'Reintentar' : 'Cargar más';
    context.message.textContent = context.error || (context.loading ? 'Cargando más obras…' : context.buffer.hasNextPage ? 'Más obras al seguir bajando.' : empty ? '' : 'No hay más obras en este listado.');
    context.message.classList.toggle('is-error',!!context.error);
    context.message.setAttribute('role',context.error?'alert':'status');
    updateChrome(context);
  }
  function schedule(context) {
    if (frame) cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{
      frame=0;
      if (!owns(context)||context.restoring||context.loading||context.error||!context.buffer.hasNextPage) return;
      const rect=context.sentinel.getBoundingClientRect();
      if (rect.top <= innerHeight + 600 && rect.bottom >= -100) void loadMore();
    });
  }
  async function fetchMore(context) {
    if (!owns(context)||context.loading||!context.buffer.hasNextPage) return false;
    context.loading=true;context.error='';context.controller=new AbortController();renderFooter(context);
    try {
      const page=context.buffer.page+1;
      const response=await fetchPage({source:context.source,mode:context.mode,query:context.query,page,signal:context.controller.signal});
      if(!owns(context))return false;
      const added=context.buffer.append(response,page);
      appendCards(context,added);onItems?.(context.buffer.items);
      onData?.({mode:context.mode,query:context.query,loadedPages:context.buffer.page});
      stash(context,false);return true;
    } catch(error) {
      if(owns(context))context.error=String(error?.message||error);
      return false;
    } finally {
      if(owns(context)){context.loading=false;renderFooter(context);schedule(context);}
    }
  }
  async function loadMore() {return fetchMore(current);}
  async function load({source,mode='popular',query='',screenId,restorePages=1,restoring=false,fresh=false}) {
    suspend();
    const key=JSON.stringify([screenId||source.id,source.id,mode,query]);
    if(fresh)cache.delete(key);
    const cached=cache.get(key);
    const base=source.baseUrl||location.origin;
    const context=current={source,mode,query,screenId,key,base,buffer:cached?.buffer||new SourcePageBuffer(source.id,resolveIdentity,base),scrollY:cached?.scrollY||(restoring?Number(getScreen?.()?.data?._scrollY)||0:0),active:true,generation,loading:false,error:'',restoring:true};
    root.dataset.browserView='list';queryInput.value=mode==='search'?query:'';
    queryInput.setAttribute('aria-label',`Buscar en ${source.name}`);
    results.innerHTML=localActions(source)+`<div class="cards source-cards browse-${escapeHtml(getDisplay?.()||'comfortable')}"></div><p class="browse-empty" hidden>Sin resultados. Prueba con otra búsqueda.</p><div class="browse-pagination"><span class="browse-load-spinner" aria-hidden="true" hidden></span><p class="browse-page-message"></p><button type="button" class="browse-load-more" data-browse-load-more>Cargar más</button><span class="browse-sentinel" aria-hidden="true"></span></div>`;
    context.grid=results.querySelector('.source-cards');context.empty=results.querySelector('.browse-empty');context.spinner=results.querySelector('.browse-load-spinner');context.message=results.querySelector('.browse-page-message');context.more=results.querySelector('[data-browse-load-more]');context.sentinel=results.querySelector('.browse-sentinel');
    appendCards(context,context.buffer.items);onItems?.(context.buffer.items);
    onData?.({mode,query,loadedPages:context.buffer.page,_scrollY:context.scrollY});renderFooter(context);
    if(typeof IntersectionObserver==='function') {
      observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))schedule(context)},{rootMargin:'600px 0px'});
      observer.observe(context.sentinel);
    }
    const goal=Math.max(1,Math.trunc(Number(restorePages)||1));
    while(owns(context)&&context.buffer.page<goal&&context.buffer.hasNextPage){if(!await fetchMore(context))break;}
    if(!owns(context))return false;
    context.restoring=false;renderFooter(context);
    requestAnimationFrame(()=>{if(owns(context)){scrollTo({top:context.scrollY,behavior:'instant'});schedule(context);}});
    return true;
  }
  function setDisplay(mode) {
    if(!owns(current)||!['comfortable','compact','list'].includes(mode))return;
    current.grid.className=`cards source-cards browse-${mode}`;schedule(current);
  }
  function refresh() {
    if(!owns(current))return false;
    invalidateSource(current.source.id);
    return load({source:current.source,mode:current.mode,query:current.query,screenId:current.screenId,restorePages:current.buffer.page,restoring:true,fresh:true});
  }
  function invalidateSource(sourceId) {
    for(const key of cache.keys())if(JSON.parse(key)[1]===sourceId)cache.delete(key);
    if(current?.source.id===sourceId)current.invalidated=true;
  }
  root.addEventListener('click',event=>{if(event.target.closest('[data-browse-load-more]'))void loadMore();});
  root.querySelector('.source-tabs')?.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const tabs=[...root.querySelectorAll('[data-source-popular],[data-source-latest]')];
    const index=tabs.indexOf(event.target);if(index<0)return;
    event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
    tabs[next].focus();tabs[next].click();
  });
  addEventListener('scroll',()=>{if(owns(current))schedule(current)},{passive:true});
  addEventListener('resize',()=>{if(owns(current))schedule(current)},{passive:true});
  addEventListener('hanami-screen-change',event=>{if(current?.active&&current.screenId&&event.detail?.screen?.id!==current.screenId)suspend({remember:false});});
  for(const event of ['hanami-library-change','hanami-categories-change','hanami-chapter-identity-change','storage'])addEventListener(event,()=>{if(libraryFrame)cancelAnimationFrame(libraryFrame);libraryFrame=requestAnimationFrame(()=>{libraryFrame=0;syncLibrary();});});
  return {load,loadMore,suspend,setDisplay,refresh,invalidateSource,syncLibrary,snapshot:()=>current?{sourceId:current.source.id,mode:current.mode,query:current.query,loadedPages:current.buffer.page,loadedCount:current.buffer.items.length,hasNextPage:current.buffer.hasNextPage,total:current.buffer.total,loading:current.loading,error:current.error}:null};
}
