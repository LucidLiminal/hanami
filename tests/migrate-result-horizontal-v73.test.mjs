import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
const grid = css.match(/\.migrate-result-grid\{([^}]*)\}/)?.[1] || '';
assert(grid.includes('grid-auto-flow:column'));
assert(grid.includes('grid-template-rows:1fr'));
assert(grid.includes('overflow-x:auto'));
assert(grid.includes('overflow-y:hidden'));
assert(grid.includes('scroll-snap-type:x'));
assert(!grid.includes('repeat(auto-fill'));
assert(!css.includes('.migrate-result-grid{grid-template-columns:repeat(2'));
assert(css.includes('.migrate-result-card{') && css.includes('scroll-snap-align:start'));

console.log('PASS: migrate-result-grid stays in one horizontally scrollable row');