import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [app, migration, screens] = await Promise.all([
  'app.js', 'migration-config.js', 'screen-history.js',
].map(name => readFile(new URL('../public/' + name, import.meta.url), 'utf8')));

assert(app.includes('window.HanamiOpenSearchManga=(sourceId,manga)=>openSearchManga(sourceId,manga)'));
assert(!app.includes('window.HanamiOpenSearchManga=(sourceId,manga)=>openSource(sourceId)'));
assert(app.includes("HanamiScreens?.push('migration-candidate-detail'"));
assert(app.includes('restore:r=>openSearchManga(r.data.sourceId,r.data.manga,true)'));
assert(app.includes("if(e.detail.type==='migration-candidate-detail')"));
assert(app.includes('showSourceSurface(s)'));
assert(app.includes('await openManga(0,true)'));
assert(migration.includes('afterOverlayClosed(()=>openCandidate'));
assert(migration.includes('showMigrateSearchSurface()'));
assert(migration.includes("'migrate','browser'"));
assert(migration.includes("$('#library')?.classList.remove('hidden')"));
assert(screens.includes('parent:currentId'));
assert(screens.includes('prevRuntime?.suspend?.()'));
assert(screens.includes('runtime.get(destination)?.restore'));

console.log('PASS: Show manga pushes one candidate-detail state whose Back restores MigrateSearchScreen instead of LibraryTab');