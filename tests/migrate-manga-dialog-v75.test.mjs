import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [migration, css, html, sw] = await Promise.all([
  'migration-config.js', 'migration-dialog.css', 'index.html', 'sw.js',
].map(name => readFile(new URL('../public/' + name, import.meta.url), 'utf8')));

for (const token of [
  "MIGRATION_FLAGS=['chapter','category','customCover','notes','removeDownload']",
  'Qué incluir', 'data-migration-flag', 'data-migration-show',
  'data-migration-copy', 'data-migration-run', 'Mostrar obra', 'Copiar', 'Migrar',
  'hanami-migration-flags', 'migrationApplicable', 'hasCustomCover', 'hasDownloads',
  'migration-dialog-loading', 'runDialogMigration', 'replace', 'crypto.randomUUID',
  '/details', '/chapters', 'applyChapterFlag', 'migrateTracking', 'deleteDownloads',
  "flags.has('category')", "flags.has('chapter')", "flags.has('customCover')",
  "flags.has('notes')", "flags.has('removeDownload')",
]) assert(migration.includes(token), token);

assert(!migration.includes('data-migration-confirm'));
assert(!migration.includes('Se conservarán categorías, progreso, historial y notas.'));
assert(css.includes('.migrate-manga-dialog'));
assert(css.includes('.migration-flag-list'));
assert(css.includes('.migration-dialog-actions'));
assert(css.includes('.migration-dialog-loading'));
assert(html.includes('/migration-dialog.css'));
assert(sw.includes('/migration-dialog.css'));

console.log('PASS: MigrateMangaDialog ports applicable persistent flags, Show manga, Copy, Migrate, loading state and selective data transfer');