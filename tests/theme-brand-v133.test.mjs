import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const file=name=>readFile(new URL(name,root),'utf8');
const [index,css,manifestText,sw,pkgText,more]=await Promise.all([
  file('public/index.html'),file('public/styles.css'),file('public/manifest.webmanifest'),file('public/sw.js'),file('package.json'),file('public/more-tab.js')
]);
const manifest=JSON.parse(manifestText),pkg=JSON.parse(pkgText);
for(const token of ['brand-knot','brand-mark','hanami-knot-logo.png','aria-label="Ir al inicio de Hanami"'])assert(index.includes(token),token);
for(const token of ['--black:#170b0d','--paper:#fbf9d1','--purple:#9a3f3f','--acid:#e6cfa9','--red:#c1856d','/* v133 — crimson knot identity */'])assert(css.includes(token),token);
assert(more.includes('mt-knot-logo')&&more.includes('hanami-knot-logo.png'));
assert.equal(manifest.theme_color,'#170b0d');assert.equal(manifest.background_color,'#170b0d');
assert(sw.includes("hanami-crimson-knot-v140"));assert(sw.includes("'/assets/hanami-knot-logo.png'"));
assert.equal(pkg.version,'5.14.0');assert(pkg.scripts.test.includes('node tests/theme-brand-v133.test.mjs'));
for(const asset of ['public/assets/hanami-knot-logo.png','public/assets/hanami-pwa-192.png','public/assets/hanami-pwa-512.png','public/assets/hanami-pwa-maskable-512.png','public/assets/hanami-apple-touch-180.png','public/favicon.ico'])assert((await stat(new URL(asset,root))).size>1000,asset);
console.log('PASS: v133 applies the crimson-knot logo, four-color warm palette and cache-safe PWA assets');
