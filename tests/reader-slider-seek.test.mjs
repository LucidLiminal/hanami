import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const r = await readFile(new URL('../public/reader.js', import.meta.url), 'utf8')
for (const x of [
  'function seekPage(i)',
  'S.seeking=true',
  'data-loading=\"true\"',
  "f.removeAttribute('data-loading')",
  "v.style.scrollBehavior='auto'",
  'figureDocumentTop(target)',
  'await loadFigure(target)',
  "querySelectorAll('[data-seek-anchor]')",
  "if(f!==target)f.style.overflowAnchor='none'",
  'token!==S.seekToken',
  'data-seek-anchor',
  'S.mutating||S.seeking',
  'R().oninput=preview',
  'if(continuous())seekPage(i)',
]) assert(r.includes(x), x)
assert(!r.includes("figure[data-page=\\\"${i}\\\"]`)?.scrollIntoView"))
console.log('PASS: slider seek uses atomic virtual anchor instead of long smooth scroll')
