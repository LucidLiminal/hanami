import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [css, sw, pkgText] = await Promise.all([
  readFile(new URL('../public/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../public/sw.js', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
]);
const pkg = JSON.parse(pkgText);

assert(!/\.md-chapter\.read\s*\{[^}]*opacity\s*:/s.test(css));
assert(!/\.md-chapter\.selected\.read[^}]*\{[^}]*opacity\s*:/s.test(css));
assert(css.includes('.md-chapter-swipe .md-chapter.read{background:#170b0d;color:#7c7464}'));
assert(css.includes('.md-chapter-swipe:nth-child(2n) .md-chapter.read{background:#200e10}'));
assert(css.includes('.md-chapter.read b{color:#8a8370'));
assert(sw.includes('hanami-crimson-knot-v142'));
assert.equal(pkg.version, '5.16.0');
assert(pkg.scripts.test.includes('node tests/read-chapter-swipe-visibility-v114.test.mjs'));

console.log('PASS: read chapters use opaque dark colors so swipe actions stay hidden until the row moves');