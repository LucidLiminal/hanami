import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [migration, app, sw, pkg] = await Promise.all([
  readFile(new URL('../public/migration-config.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/sw.js', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
]);

assert.match(migration, /function showMigrationSurface\(\)/);
assert.match(migration, /\['updates','history','more','sources','extensions','migrate','browser','browseChild','globalSearch'\]/);
assert.match(migration, /\$\('#library'\)\?\.classList\.remove\('hidden'\)/);
assert.match(migration, /\$\('#exploreChrome'\)\?\.classList\.add\('hidden'\)/);
assert.match(migration, /function renderConfig\(\)\{showMigrationSurface\(\)/);
assert.match(migration, /function open\(mangaIds,restoring=false\).*?HanamiScreens\?\.push\('migration-config'/s);
assert.match(app, /if\(b\.hasAttribute\('data-migrate-continue'\)\)\{const ids=\$\$\('\[data-migrate-item\]:checked'\).*?HanamiMigrationConfig\?\.open\(ids\)\}/s);
assert.match(app, /showBrowseChild\('migrate-manga'.*?\(\)=>renderMigrationItems\(true\)/s);
assert.equal(JSON.parse(pkg).version, '5.12.0');
assert(sw.includes('hanami-crimson-knot-v138'));
console.log('PASS: Continuar abre MigrationConfig sobre la superficie visible y Atrás restaura MigrateManga');
