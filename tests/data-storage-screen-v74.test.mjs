import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [data, nav, html, css, sw] = await Promise.all([
  'data-storage.js', 'navigation.js', 'index.html', 'data-storage.css', 'sw.js',
].map(name => readFile(new URL('../public/' + name, import.meta.url), 'utf8')));

for (const token of [
  'HanamiDataStorage', 'data-data-storage', 'data-data-create', 'data-data-restore-file',
  'data-data-interval', 'hanami-last-auto-backup', 'hanami-next-auto-backup',
  'data-data-usage', 'data-data-clear-cache', 'data-data-auto-clear', 'data-data-csv',
  'libraryEntries', 'chapters', 'tracking', 'history', 'categories', 'readEntries',
  'appSettings', 'extensionStores', 'sourceSettings', 'privateSettings',
  'data-backup-create', 'data-backup-restore', 'showDirectoryPicker',
  'showSaveFilePicker', 'navigator.storage', 'hanami-data-storage',
]) assert(data.includes(token), token);

assert(data.includes("format:'hanami-backup',version:2"));
assert(data.includes("slice(4)"));
assert(data.includes('hanami_library.csv'));
assert(nav.includes("HanamiScreens.push('data-storage'"));
assert(nav.includes("HanamiDataStorage.mount(root,childHead('DATOS Y ALMACENAMIENTO'))"));
assert(!nav.includes("data-export"));
assert(!nav.includes("data-import"));
assert(html.indexOf('/data-storage.js') < html.indexOf('/navigation.js'));
assert(html.includes('/data-storage.css'));
assert(sw.includes('/data-storage.js') && sw.includes('/data-storage.css'));
assert(css.includes('.data-settings') && css.includes('.data-segments') && css.includes('.data-storage-card'));

console.log('PASS: Mihon SettingsDataScreen is ported to More with storage, selective backup/restore, automatic backups, cache usage and CSV export');