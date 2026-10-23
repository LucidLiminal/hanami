import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const rootMarkdown=fs.readdirSync(root,{withFileTypes:true})
  .filter(entry=>entry.isFile() && path.extname(entry.name).toLowerCase()==='.md')
  .map(entry=>entry.name).sort();
const rootChecksums=fs.readdirSync(root,{withFileTypes:true})
  .filter(entry=>entry.isFile() && path.extname(entry.name).toLowerCase()==='.sha256')
  .map(entry=>entry.name).sort();
assert.deepEqual(rootMarkdown,['README.md'],`Only the conventional GitHub README may live at the project root: ${rootMarkdown.join(', ')}`);
assert.deepEqual(rootChecksums,[],`Checksum files must remain outside the project root: ${rootChecksums.join(', ')}`);
assert.ok(fs.statSync(path.join(root,'LICENSE')).isFile(),'The root LICENSE status file must remain visible to GitHub visitors');
assert.ok(fs.readFileSync(path.join(root,'README.md'),'utf8').includes('(docs/INDEX.md)'),'The root README must link to docs/INDEX.md');
assert.ok(!fs.existsSync(path.join(root,'docs/overview/README.md')),'README must not be duplicated below docs/overview');
for(const directory of [
  'docs/overview','docs/features/library','docs/features/reader','docs/features/groups',
  'docs/features/explore','docs/features/navigation','docs/features/migration','docs/operations',
  'docs/releases/hotfixes','docs/releases/validation','docs/reference','checksums/current','checksums/archive'
]) assert.ok(fs.statSync(path.join(root,directory)).isDirectory(),`Missing organized directory: ${directory}`);
for(const file of ['docs/INDEX.md','docs/ROOT_FILES_RELOCATION.md','checksums/README.md','checksums/current/V150_FILE_MANIFEST.sha256'])
  assert.ok(fs.statSync(path.join(root,file)).isFile(),`Missing documentation artifact: ${file}`);
const walk=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  const target=path.join(directory,entry.name);
  return entry.isDirectory()?walk(target):[target];
});
for(const source of walk(root).filter(file=>path.extname(file).toLowerCase()==='.md')){
  const content=fs.readFileSync(source,'utf8');
  for(const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){
    const reference=match[1].split('#',1)[0].trim();
    if(!reference || /^[a-z][a-z0-9+.-]*:/i.test(reference)) continue;
    assert.ok(fs.existsSync(path.resolve(path.dirname(source),reference)),`Broken local Markdown link: ${path.relative(root,source)} -> ${reference}`);
  }
}
const manifest=path.join(root,'checksums/current/V150_FILE_MANIFEST.sha256');
const rows=fs.readFileSync(manifest,'utf8').trim().split('\n').filter(Boolean);
assert.ok(rows.length>0,'The current manifest must contain file checksums');
assert.ok(!rows.some(row=>row.endsWith('  checksums/current/V150_FILE_MANIFEST.sha256')),'The current manifest must not contain itself');
for(const row of rows){
  const match=/^([a-f0-9]{64})  (.+)$/.exec(row);
  assert.ok(match,`Malformed manifest row: ${row}`);
  const [,expected,relative]=match;
  const target=path.join(root,relative);
  assert.ok(fs.statSync(target).isFile(),`Manifest target is missing: ${relative}`);
  const actual=crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
  assert.equal(actual,expected,`Checksum mismatch: ${relative}`);
}
console.log('PASS: GitHub root documents, organized docs and the current manifest are valid');
