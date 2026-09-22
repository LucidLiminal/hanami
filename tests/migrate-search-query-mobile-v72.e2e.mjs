import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  executablePath: '/usr/local/bin/chromium',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
const queries = [];
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/api/source/*/search?*', async route => {
  const query = new URL(route.request().url()).searchParams.get('q') || '';
  queries.push(query);
  const mangas = /mecanico/i.test(query)
    ? [{ title: 'El mecánico legendario', url: 'https://olympusxyz.com/series/comic-el-mecanico-legendario', thumbnailUrl: '/assets/fallen.webp' }]
    : [{ title: 'Academia privada Laprossa', url: 'https://olympusxyz.com/series/comic-academia-privada-laprossa', thumbnailUrl: '/assets/fallen.webp' }];
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mangas, hasNextPage: false }) });
});

await page.goto('http://127.0.0.1:4173/');
await page.waitForFunction(() => window.HanamiMigrationConfig && window.HanamiSourceRegistry?.list?.().length);
await page.evaluate(() => {
  localStorage.setItem('hanami-library', JSON.stringify([{
    id: 'm1',
    title: 'Academia',
    url: 'https://olympusxyz.com/series/comic-academia',
    sourceId: 'hanami.es.olympus',
    thumbnailUrl: '/assets/fallen.webp',
    categories: ['default'],
  }]));
  localStorage.setItem('hanami-installed-sources', JSON.stringify(['hanami.es.olympus']));
  localStorage.setItem('hanami-migration-sources', JSON.stringify(['hanami.es.olympus']));
});
await page.reload();
await page.waitForFunction(() => window.HanamiMigrationConfig && window.HanamiSourceRegistry?.list?.().length);
await page.locator('[data-tab="library"]').click();
await page.evaluate(() => window.HanamiMigrationConfig.open(['m1']));
await page.locator('[data-migration-continue]').click();
await page.locator('[data-migrate-search-query]').waitFor();
await page.locator('[data-migrate-search-query]').fill('mecanico');
await page.locator('[data-migrate-search-query]').press('Enter');
await page.getByText('El mecánico legendario', { exact: true }).waitFor();

assert(queries.includes('Academia'));
assert(queries.includes('mecanico'));
assert.equal(await page.getByText('El mecánico legendario', { exact: true }).count(), 1);
assert.equal(await page.getByText('Academia privada Laprossa', { exact: true }).count(), 0);
assert.deepEqual(errors, []);

await browser.close();
console.log('PASS: mobile MigrateSearch submits the edited query and replaces unfiltered results');