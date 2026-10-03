import assert from 'node:assert/strict';

const catalogue = {
  data: [
    { id: 1, name: 'Academia privada Laprossa', slug: 'academia-privada-laprossa', cover: 'https://media.example/laprossa.webp', type: 'comic' },
    { id: 2, name: 'El mecánico legendario', slug: 'el-mecanico-legendario', cover: 'https://media.example/mecanico.webp', type: 'comic' },
    { id: 3, name: 'Academia del héroe', slug: 'academia-del-heroe', cover: 'https://media.example/heroe.webp', type: 'novel' },
  ],
};
const calls = [];
globalThis.fetch = async url => {
  const u = new URL(url);
  calls.push(u.href);
  assert.equal(u.pathname, '/api/series/list');
  return {
    ok: true,
    status: 200,
    url: u.href,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => catalogue,
    text: async () => JSON.stringify(catalogue),
  };
};

const { default: olympus, manifest } = await import('../extensions/olympus/index.mjs?migrate-search-v72');
const result = await olympus.search({ query: 'mecanico', page: 1 });
assert.equal(manifest.version, '1.4.0');
assert.equal(calls.length, 1);
assert.equal(calls[0], 'https://olympusxyz.com/api/series/list');
assert.deepEqual(result.mangas.map(x => x.title), ['El mecánico legendario']);
assert.equal(result.mangas[0].url, 'https://olympusxyz.com/series/comic-el-mecanico-legendario');
assert.equal(result.hasNextPage, false);
assert(!result.mangas.some(x => x.title.includes('Academia')));

const multiWord = await olympus.search({ query: 'academia heroe', page: 1 });
assert.deepEqual(multiWord.mangas.map(x => x.title), ['Academia del héroe']);
assert.equal(multiWord.mangas[0].url, 'https://olympusxyz.com/series/novela-academia-del-heroe');

console.log('PASS: MigrateSearch query uses the official Olympus searchable catalogue and returns only matching works');