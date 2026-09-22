import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [migration, library, screens] = await Promise.all([
  'migration-config.js', 'library.js', 'screen-history.js',
].map(name => readFile(new URL('../public/' + name, import.meta.url), 'utf8')));

assert(migration.includes("afterOverlayClosed(()=>window.HanamiLibrary?.openMigrationResult(target.id))"));
assert(!migration.includes("window.HanamiToast?.(replace?'Migración completada':'Obra copiada');openCandidate(key)"));
assert(library.includes('openMigrationResult,continue:continueLibraryItem'));
assert(library.includes('function openMigrationResult(id)'));
assert(library.includes("HanamiScreens.replace('library-detail'"));
assert(library.includes('showLibrarySurface()'));
assert(library.includes("x.id!=='library'"));
assert(library.includes('openLibraryManga(x.id,true)'));
assert(library.includes('function restoreLibraryDetail(id){showLibrarySurface()'));
assert(screens.includes('parent:old?.parent||null'));

console.log('PASS: completed migration replaces the migration flow with Library detail whose Back parent is LibraryTab');