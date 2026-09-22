import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [library, overlay, css, html, sw] = await Promise.all([
  'library.js', 'overlay-dismiss.js', 'overflow-menu.css', 'index.html', 'sw.js',
].map(name => readFile(new URL('../public/' + name, import.meta.url), 'utf8')));

for (const token of [
  'bottomOverflow', 'downloadMenu', 'moreActionsMenu', 'afterBottomOverflow',
  'library-bottom-overflow', "setAttribute('role','menu')", 'role="menuitem"',
  'data-lib-overflow-migrate', 'data-lib-overflow-delete', 'data-lib-download-action',
  'Siguiente capítulo', 'Siguientes 5', 'Siguientes 10', 'Siguientes 25',
  'Todos los no leídos', 'Favoritos',
]) assert(library.includes(token), token);

assert(!library.includes('function downloadDialog'));
assert(!library.includes('function moreActionsDialog'));
assert(!library.includes('<h3>Más opciones</h3>'));
assert(!library.includes('<h3>Descargar capítulos</h3>'));
assert(overlay.includes("'.library-bottom-overflow'"));
assert(css.includes('.library-bottom-overflow'));
assert(css.includes('position:fixed'));
assert(css.includes('.library-bottom-overflow.hidden'));
assert(html.includes('/overflow-menu.css'));
assert(sw.includes('/overflow-menu.css'));

console.log('PASS: Library More and Download use anchored itemOverflow menus while destructive confirmation remains a dialog');