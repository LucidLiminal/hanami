const $=s=>document.querySelector(s),E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const get=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},set=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const CREATE_DEFAULTS={libraryEntries:true,categories:true,chapters:true,tracking:true,history:true,readEntries:true,appSettings:true,extensionStores:true,sourceSettings:true,privateSettings:false};
const RESTORE_DEFAULTS={libraryEntries:true,categories:true,appSettings:true,extensionStores:true,sourceSettings:true};
const LIBRARY_KEYS=['hanami-library'],CATEGORY_KEYS=['hanami-categories','hanami-category-preferences','hanami-library-category'];
const EXTENSION_KEYS=['hanami-installed-sources','hanami-extension-filters','hanami-extension-list-detailed','hanami-install-seeded','hanami-extension-stores'];
const SOURCE_KEYS=['hanami-source-registry','hanami-source-filters','hanami-disabled-sources','hanami-pinned-sources','hanami-recent-source','hanami-migration-sources','hanami-migrate-direction','hanami-migrate-sort'];
const PRIVATE_KEYS=['hanami-tracker-services','hanami-incognito','hanami-incognito-extensions'];
let host=null,head='',createOptions={...CREATE_DEFAULTS},restoreOptions={...RESTORE_DEFAULTS},restorePayload=null,restoreName='';
const toast=t=>window.HanamiToast?.(t);
const bytes=n=>{n=Number(n)||0;for(const u of['B','KB','MB','GB','TB']){if(n<1024||u==='TB')return`${n<10&&u!=='B'?n.toFixed(1):Math.round(n)} ${u}`;n/=1024}};
const filename=(prefix='hanami')=>`${prefix}_${new Date().toISOString().slice(0,16).replace('T','_').replace(':','-')}.hanamibk.json`;
const allHanamiKeys=()=>Object.keys(localStorage).filter(k=>k.startsWith('hanami-'));
const snapshot=keys=>Object.fromEntries(keys.filter(k=>localStorage.getItem(k)!=null).map(k=>[k,get(k,null)]));
function cleanLibrary(options){
 const list=structuredClone(get('hanami-library',[]));
 for(const manga of list){
  if(!options.chapters){delete manga._chapters;delete manga._chapterMeta;delete manga.totalChapters;delete manga.readCount;delete manga.unreadCount}
  if(!options.history){for(const k of['lastRead','lastReadChapterUrl','lastReadChapterNumber','readingProgress','started'])delete manga[k]}
 }
 return list
}
function createBackup(options=createOptions,automatic=false){
 const claimed=new Set([...LIBRARY_KEYS,...CATEGORY_KEYS,...EXTENSION_KEYS,...SOURCE_KEYS,...PRIVATE_KEYS,'hanami-tracks']);
 const settingsKeys=allHanamiKeys().filter(k=>!claimed.has(k)&&!k.startsWith('hanami-dl-')&&!k.startsWith('hanami-chapter-meta-')&&!k.startsWith('hanami-notes-')&&!k.startsWith('hanami-data-'));
 const sections={};
 if(options.libraryEntries){
  sections.library={'hanami-library':cleanLibrary(options)};
  if(options.chapters)Object.assign(sections.library,snapshot(allHanamiKeys().filter(k=>k.startsWith('hanami-chapter-meta-'))));
  Object.assign(sections.library,snapshot(allHanamiKeys().filter(k=>k.startsWith('hanami-notes-'))));
  if(options.tracking)Object.assign(sections.library,snapshot(['hanami-tracks']));
 }
 if(options.categories)sections.categories=snapshot(CATEGORY_KEYS);
 if(options.appSettings){sections.appSettings=snapshot(settingsKeys.filter(k=>options.privateSettings||!PRIVATE_KEYS.includes(k)));if(options.privateSettings)Object.assign(sections.appSettings,snapshot(PRIVATE_KEYS))}
 if(options.extensionStores)sections.extensionStores=snapshot(EXTENSION_KEYS);
 if(options.sourceSettings)sections.sourceSettings=snapshot(SOURCE_KEYS);
 return{format:'hanami-backup',version:2,createdAt:new Date().toISOString(),automatic,options:{...options},sections}
}
function canCreate(o){return o.libraryEntries||o.categories||o.appSettings||o.extensionStores||o.sourceSettings}
function download(name,blob){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function saveManual(){
 if(!canCreate(createOptions))return;
 const name=filename(),blob=new Blob([JSON.stringify(createBackup(),null,2)],{type:'application/json'});
 try{
  if(window.showSaveFilePicker){const handle=await showSaveFilePicker({suggestedName:name,types:[{description:'Copia de Hanami',accept:{'application/json':['.json']}}]}),w=await handle.createWritable();await w.write(blob);await w.close()}
  else download(name,blob);
  toast('Copia de seguridad creada');window.HanamiScreens?.back()
 }catch(e){if(e.name!=='AbortError')toast('No se pudo crear la copia')}
}
function legacySections(settings){
 const groups={library:{},categories:{},appSettings:{},extensionStores:{},sourceSettings:{}};
 for(const[k,v]of Object.entries(settings||{})){
  if(LIBRARY_KEYS.includes(k)||k==='hanami-tracks'||k.startsWith('hanami-chapter-meta-')||k.startsWith('hanami-notes-')||k.startsWith('hanami-dl-'))groups.library[k]=v;
  else if(CATEGORY_KEYS.includes(k))groups.categories[k]=v;
  else if(EXTENSION_KEYS.includes(k))groups.extensionStores[k]=v;
  else if(SOURCE_KEYS.includes(k))groups.sourceSettings[k]=v;
  else groups.appSettings[k]=v
 }
 return groups
}
function normalizeBackup(value){
 if(value?.format==='hanami-backup'&&value.version>=2&&value.sections)return value;
 if(value?.version===1&&value.settings)return{format:'hanami-backup',version:1,createdAt:null,sections:legacySections(value.settings)};
 throw Error('El archivo no contiene una copia de Hanami compatible.')
}
function restoreGroups(payload){
 return{libraryEntries:!!payload.sections.library,categories:!!payload.sections.categories,appSettings:!!payload.sections.appSettings,extensionStores:!!payload.sections.extensionStores,sourceSettings:!!payload.sections.sourceSettings}
}
function missingComponents(payload){
 const sourceValues=Object.values(payload.sections.sourceSettings||{}),text=JSON.stringify(sourceValues),installed=new Set(get('hanami-source-registry',[]).map(x=>String(x.id))),ids=[...text.matchAll(/hanami\.[a-z0-9._-]+/gi)].map(x=>x[0]),sources=[...new Set(ids.filter(id=>!installed.has(id)))];
 const tracks=(payload.sections.library||{})['hanami-tracks']||[],sessions=get('hanami-tracker-services',{}),trackers=[...new Set((Array.isArray(tracks)?tracks:[]).map(x=>x.serviceId).filter(id=>id&&!sessions[id]?.connected))];
 return{sources,trackers}
}
function applyRestore(){
 if(!restorePayload)return;
 const groups=restorePayload.sections;
 const selected=[];
 if(restoreOptions.libraryEntries&&groups.library)selected.push(groups.library);
 if(restoreOptions.categories&&groups.categories)selected.push(groups.categories);
 if(restoreOptions.appSettings&&groups.appSettings)selected.push(groups.appSettings);
 if(restoreOptions.extensionStores&&groups.extensionStores)selected.push(groups.extensionStores);
 if(restoreOptions.sourceSettings&&groups.sourceSettings)selected.push(groups.sourceSettings);
 selected.forEach(group=>Object.entries(group).forEach(([k,v])=>set(k,v)));
 toast('Copia restaurada');setTimeout(()=>location.reload(),350)
}
function check(label,key,options,enabled=true){return`<label class="data-check ${enabled?'':'disabled'}"><input type="checkbox" data-data-option="${key}" ${options[key]?'checked':''} ${enabled?'':'disabled'}><span>${E(label)}</span></label>`}
function appbar(title){return`<div class="destination-appbar child-appbar"><button data-data-screen-back>←</button><h2>${E(title)}</h2></div>`}
function openCreate(restoring=false){
 if(!restoring)window.HanamiScreens?.push('data-backup-create',{}, {restore:()=>openCreate(true)});
 if(!restoring)createOptions={...CREATE_DEFAULTS};host.innerHTML=appbar('CREAR COPIA')+`<main class="data-subscreen"><section class="data-card"><h3>BIBLIOTECA</h3>${check('Obras','libraryEntries',createOptions)}${check('Capítulos y progreso','chapters',createOptions,createOptions.libraryEntries)}${check('Seguimiento','tracking',createOptions,createOptions.libraryEntries)}${check('Historial','history',createOptions,createOptions.libraryEntries)}${check('Categorías','categories',createOptions)}${check('Entradas leídas fuera de la biblioteca','readEntries',createOptions,createOptions.libraryEntries)}</section><section class="data-card"><h3>AJUSTES</h3>${check('Ajustes de la aplicación','appSettings',createOptions)}${check('Extensiones instaladas','extensionStores',createOptions)}${check('Ajustes de fuentes','sourceSettings',createOptions)}${check('Ajustes privados','privateSettings',createOptions,createOptions.appSettings||createOptions.sourceSettings)}</section><button class="data-fab" data-data-create-confirm ${canCreate(createOptions)?'':'disabled'}>Crear</button></main>`
}
function renderRestore(){
 const available=restoreGroups(restorePayload),missing=missingComponents(restorePayload),warning=missing.sources.length||missing.trackers.length?`<div class="data-warning"><b>Componentes no disponibles</b>${missing.sources.length?`<small>Fuentes: ${E(missing.sources.join(', '))}</small>`:''}${missing.trackers.length?`<small>Servicios sin conectar: ${E(missing.trackers.join(', '))}</small>`:''}<span>Puedes continuar; esos componentes se conservarán cuando sea posible.</span></div>`:'';
 host.innerHTML=appbar('RESTAURAR COPIA')+`<main class="data-subscreen">${warning}<p class="data-file">${E(restoreName)}</p><section class="data-card">${check('Biblioteca','libraryEntries',restoreOptions,available.libraryEntries)}${check('Categorías','categories',restoreOptions,available.categories)}${check('Ajustes de la aplicación','appSettings',restoreOptions,available.appSettings)}${check('Extensiones instaladas','extensionStores',restoreOptions,available.extensionStores)}${check('Ajustes de fuentes','sourceSettings',restoreOptions,available.sourceSettings)}</section><button class="data-fab" data-data-restore-confirm ${Object.entries(restoreOptions).some(([k,v])=>v&&available[k])?'':'disabled'}>Restaurar</button></main>`
}
function openRestore(payload,name,restoring=false){restorePayload=payload;restoreName=name;restoreOptions={...RESTORE_DEFAULTS};if(!restoring)window.HanamiScreens?.push('data-backup-restore',{name},{restore:()=>renderRestore()});renderRestore()}
function idb(){
 return new Promise((resolve,reject)=>{const r=indexedDB.open('hanami-data-storage',1);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains('handles'))d.createObjectStore('handles');if(!d.objectStoreNames.contains('backups'))d.createObjectStore('backups',{keyPath:'createdAt'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
}
async function dbGet(store,key){const d=await idb();return new Promise((resolve,reject)=>{const r=d.transaction(store).objectStore(store).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function dbPut(store,value,key){const d=await idb();return new Promise((resolve,reject)=>{const r=d.transaction(store,'readwrite').objectStore(store).put(value,key);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)})}
async function dbBackupsPut(value){const d=await idb();await new Promise((resolve,reject)=>{const tx=d.transaction('backups','readwrite'),s=tx.objectStore('backups');s.put(value);const q=s.getAll();q.onsuccess=()=>q.result.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(4).forEach(x=>s.delete(x.createdAt));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
async function chooseStorage(){
 if(!window.showDirectoryPicker)return toast('Este navegador no permite elegir una carpeta persistente.');
 try{const handle=await showDirectoryPicker({mode:'readwrite'});await dbPut('handles',handle,'backup-directory');set('hanami-storage-directory-name',handle.name);renderMain();toast('Ubicación de copias actualizada')}catch(e){if(e.name!=='AbortError')toast('No se pudo acceder a la carpeta')}
}
async function cacheBytes(){
 if(!window.caches)return 0;let total=0;for(const name of await caches.keys()){if(name===window.HanamiCoverCache?.cacheName)continue;const c=await caches.open(name);for(const req of await c.keys())if(req.url.includes('/api/image')||req.url.includes('/pages')){const r=await c.match(req),n=Number(r?.headers.get('content-length'));total+=n||0}}return total
}
async function clearChapterCache(silent=false){
 let removed=0;if(window.caches)for(const name of await caches.keys()){if(name===window.HanamiCoverCache?.cacheName)continue;const c=await caches.open(name);for(const req of await c.keys())if(req.url.includes('/api/image')||req.url.includes('/pages'))if(await c.delete(req))removed++}
 if(!silent)toast(removed?`Caché eliminado: ${removed} archivo(s)`:'No había caché temporal de capítulos');refreshUsage()
}
async function usage(){
 const local=new Blob(allHanamiKeys().map(k=>k+(localStorage.getItem(k)||''))).size,cache=await cacheBytes(),covers=await window.HanamiCoverCache?.stats?.()||{bytes:0,entries:0,pinned:0},estimate=await navigator.storage?.estimate?.()||{};
 return{local,cache,covers,used:Math.max(local+cache+covers.bytes,estimate.usage||0),quota:estimate.quota||0}
}
async function refreshUsage(){const box=$('[data-data-usage]');if(!box)return;const u=await usage(),pct=u.quota?Math.min(100,u.used/u.quota*100):0;box.innerHTML=`<div class="data-usage-head"><b>${bytes(u.used)} usados</b><small>${u.quota?bytes(u.quota)+' disponibles para el sitio':'Cuota administrada por el navegador'}</small></div><div class="data-meter"><i style="width:${pct}%"></i></div><div class="data-breakdown"><span>Datos de Hanami <b>${bytes(u.local)}</b></span><span>Caché de capítulos <b>${bytes(u.cache)}</b></span><span>Portadas (${u.covers.entries}, ${u.covers.pinned} de Biblioteca) <b>${bytes(u.covers.bytes)}</b></span></div>`}
function relative(t){if(!t)return'Nunca';const d=Math.max(0,Date.now()-t),h=Math.floor(d/36e5);return h<1?'Hace menos de una hora':h<24?`Hace ${h} h`:`Hace ${Math.floor(h/24)} día(s)`}
function renderMain(){
 if(!host)return;const interval=get('hanami-backup-interval',12),last=get('hanami-last-auto-backup',0),dir=get('hanami-storage-directory-name','Almacenamiento interno del navegador'),autoClear=get('hanami-auto-clear-chapter-cache',false);
 host.innerHTML=head+`<main class="data-settings"><button class="setting-row" data-data-storage><span><b>Ubicación de almacenamiento</b><small>${E(dir)}</small></span><i>›</i></button><p class="data-info">La carpeta elegida se usa para copias automáticas cuando el navegador mantiene el permiso. Hanami conserva sus datos principales en el almacenamiento seguro del sitio.</p><section class="data-group"><h3>COPIAS DE SEGURIDAD</h3><div class="data-segments"><button data-data-create>Crear copia</button><label>Restaurar copia<input type="file" data-data-restore-file accept=".json,application/json"></label></div><label class="setting-row"><span><b>Frecuencia de copias automáticas</b><small>Se ejecutan cuando Hanami está abierto</small></span><select data-data-interval>${[[0,'Desactivadas'],[6,'Cada 6 horas'],[12,'Cada 12 horas'],[24,'Cada 24 horas'],[48,'Cada 48 horas'],[168,'Semanalmente']].map(([v,l])=>`<option value="${v}" ${interval===v?'selected':''}>${l}</option>`).join('')}</select></label><p class="data-info">Se conservan hasta cuatro copias automáticas. Última copia: <b>${relative(last)}</b>.</p></section><section class="data-group"><h3>USO DEL ALMACENAMIENTO</h3><div class="data-storage-card" data-data-usage><p>Calculando…</p></div><button class="setting-row" data-data-clear-cache><span><b>Limpiar caché de capítulos</b><small>Conserva progreso, biblioteca y descargas</small></span><i>×</i></button><button class="setting-row" data-data-clear-covers><span><b>Limpiar caché de portadas</b><small>Permite conservar las obras de la Biblioteca</small></span><i>×</i></button><label class="setting-row"><span><b>Limpiar caché automáticamente</b><small>Al iniciar Hanami</small></span><input type="checkbox" data-data-auto-clear ${autoClear?'checked':''}></label></section><section class="data-group"><h3>EXPORTAR</h3><button class="setting-row" data-data-csv><span><b>Lista de biblioteca</b><small>Archivo CSV con título, autor y artista</small></span><i>↗</i></button></section></main>`;refreshUsage()
}

async function coverCacheDialog(){
 const stats=await window.HanamiCoverCache?.stats?.()||{entries:0,pinned:0,bytes:0},d=$('#modal');$('#modalBody').innerHTML=`<section class="data-cover-cache-dialog"><small class="eyebrow">CACHÉ DE PORTADAS</small><h3>Liberar espacio</h3><p>${stats.entries} portada(s) · ${bytes(stats.bytes)}</p><label class="data-check"><input type="checkbox" data-data-preserve-library checked><span><b>Conservar portadas de Biblioteca</b><small>Mantiene disponibles sin conexión las obras guardadas</small></span></label><p class="data-info">Las portadas de Explorar, búsquedas, Historial y Actualizaciones se descargarán de nuevo cuando sean necesarias.</p><button class="btn danger" data-data-clear-covers-confirm>Limpiar portadas</button></section>`;d.showModal()
}
async function clearCoverCache(){const preserve=$('[data-data-preserve-library]')?.checked!==false,removed=await window.HanamiCoverCache?.clear?.({preserveLibrary:preserve})||0;$('#modal').close();toast(removed?`${removed} portada(s) eliminadas`:'No había portadas para eliminar');refreshUsage()}
function csvDialog(){
 const d=$('#modal');$('#modalBody').innerHTML=`<section class="data-export-dialog"><small class="eyebrow">EXPORTAR</small><h3>Qué incluir</h3>${check('Título','csvTitle',{csvTitle:true})}${check('Autor','csvAuthor',{csvAuthor:true})}${check('Artista','csvArtist',{csvArtist:true})}<button class="btn acid" data-data-csv-save>Guardar CSV</button></section>`;d.showModal()
}
function csvEscape(v){v=String(v??'');return/[\\r\\n\",]/.test(v)?`"${v.replaceAll('"','""')}"`:v}
function exportCsv(){
 const title=$('[data-data-option="csvTitle"]')?.checked,author=$('[data-data-option="csvAuthor"]')?.checked,artist=$('[data-data-option="csvArtist"]')?.checked,rows=get('hanami-library',[]).map(m=>[title&&m.title,author&&m.author,artist&&m.artist].filter((_,i)=>[title,author,artist][i]).map(csvEscape).join(',')).join('\\r\\n');
 download('hanami_library.csv',new Blob([rows],{type:'text/csv;charset=utf-8'}));$('#modal').close();toast('Biblioteca exportada')
}
async function writeAutoToDirectory(backup){
 const handle=await dbGet('handles','backup-directory').catch(()=>null);if(!handle)return false;const permission=await handle.queryPermission?.({mode:'readwrite'});if(permission!=='granted')return false;const file=await handle.getFileHandle(filename('hanami_auto'),{create:true}),w=await file.createWritable();await w.write(JSON.stringify(backup));await w.close();return true
}
async function runAutoBackup(force=false){
 const hours=Number(get('hanami-backup-interval',12)),last=Number(get('hanami-last-auto-backup',0)),next=Number(get('hanami-next-auto-backup',0));if(!hours)return false;
 if(!force&&!next){set('hanami-next-auto-backup',Date.now()+hours*36e5);return false}
 if(!force&&Date.now()<(next||last+hours*36e5))return false;
 const backup=createBackup(CREATE_DEFAULTS,true);await dbBackupsPut(backup);await writeAutoToDirectory(backup).catch(()=>false);set('hanami-last-auto-backup',Date.now());set('hanami-next-auto-backup',Date.now()+hours*36e5);if(host&&$('[data-data-usage]'))renderMain();return true
}
async function readRestore(file){try{const payload=normalizeBackup(JSON.parse(await file.text()));openRestore(payload,file.name)}catch(e){toast(e.message||'Copia no válida')}}
document.addEventListener('click',e=>{const b=e.target.closest('button,[data-data-storage],[data-data-create],[data-data-clear-cache],[data-data-csv]');if(!b)return;if(b.hasAttribute('data-data-screen-back'))window.HanamiScreens?.back();if(b.hasAttribute('data-data-storage'))chooseStorage();if(b.hasAttribute('data-data-create'))openCreate();if(b.hasAttribute('data-data-create-confirm'))saveManual();if(b.hasAttribute('data-data-restore-confirm'))applyRestore();if(b.hasAttribute('data-data-clear-cache'))clearChapterCache();if(b.hasAttribute('data-data-clear-covers'))coverCacheDialog();if(b.hasAttribute('data-data-clear-covers-confirm'))clearCoverCache();if(b.hasAttribute('data-data-csv'))csvDialog();if(b.hasAttribute('data-data-csv-save'))exportCsv()});
document.addEventListener('change',e=>{const i=e.target;if(i.hasAttribute('data-data-restore-file')){const f=i.files?.[0];if(f)readRestore(f)}if(i.hasAttribute('data-data-option')){const key=i.dataset.dataOption;if(key in createOptions){createOptions[key]=i.checked;openCreate(true)}else if(key in restoreOptions){restoreOptions[key]=i.checked;renderRestore()}if(key==='csvTitle'){for(const k of['csvAuthor','csvArtist']){const x=$(`[data-data-option="${k}"]`);if(x){if(!i.checked)x.checked=false;x.disabled=!i.checked}}}}if(i.hasAttribute('data-data-interval')){set('hanami-backup-interval',Number(i.value));set('hanami-next-auto-backup',Date.now()+Number(i.value)*36e5);renderMain()}if(i.hasAttribute('data-data-auto-clear'))set('hanami-auto-clear-chapter-cache',i.checked)});
function mount(root,header){host=root;head=header;renderMain()}
setTimeout(()=>{if(get('hanami-auto-clear-chapter-cache',false))clearChapterCache(true).catch(()=>{});runAutoBackup().catch(()=>{})},1200);setInterval(()=>runAutoBackup().catch(()=>{}),36e5);
window.HanamiDataStorage={mount,openCreate,restore:record=>record.type==='data-backup-create'?openCreate(true):false,createBackup,normalizeBackup,runAutoBackup};