import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const s = await readFile(new URL('../public/manga-detail.js', import.meta.url), 'utf8');
for (const x of [
  '<svg class="md-icon', 'data-md-download-menu', 'data-md-filter', 'data-md-more',
  'data-md-library', 'data-md-interval', 'data-md-track', 'data-md-webview',
  'data-select-all', 'data-select-invert', 'data-bulk="bookmark"',
  "allRead?'unread':'read'", 'data-bulk="download"', 'data-bulk="until"',
  'data-dl-now', 'data-dl-cancel', 'data-dl-delete', 'data-tri', 'data-sort', 'data-display'
]) assert(s.includes(x), x);
console.log('PASS: Mihon chapter icons and adaptive action semantics');
