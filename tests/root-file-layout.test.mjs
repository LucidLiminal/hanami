import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const rootDocs=fs.readdirSync(root,{withFileTypes:true})
  .filter(entry=>entry.isFile() && ['.md','.sha256'].includes(path.extname(entry.name).toLowerCase()))
  .map(entry=>entry.name);
assert.deepEqual(rootDocs,[],`Documentation and checksum files must not return to the project root: ${rootDocs.join(', ')}`);
for(const directory of [
  'docs/overview','docs/features/library','docs/features/reader','docs/features/groups',
  'docs/features/explore','docs/features/navigation','docs/features/migration','docs/operations',
  'docs/releases/hotfixes','docs/releases/validation','docs/reference','checksums/current','checksums/archive'
]) assert.ok(fs.statSync(path.join(root,directory)).isDirectory(),`Missing organized directory: ${directory}`);
for(const file of ['docs/INDEX.md','docs/ROOT_FILES_RELOCATION.md','checksums/README.md','checksums/current/V150_FILE_MANIFEST.sha256'])
  assert.ok(fs.statSync(path.join(root,file)).isFile(),`Missing documentation artifact: ${file}`);
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
console.log('PASS: root Markdown/checksum files are organized and the current manifest is valid');
