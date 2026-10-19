import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const BASE = "https://olympusxyz.com";
const PANEL = "https://panel.olympusxyz.com";
const series = `${BASE}/series/comic-fixture`;
const html = `<main><h1>Fixture</h1><a href="/capitulo/103/comic-fixture">Capítulo 3</a></main>`;
const chapter = (id, number) => ({ id, name: `Capítulo ${number}`, published_at: "2026-01-01" });
const jsonResponse = (url, payload, status = 200, extra = {}) => ({
  ok: status >= 200 && status < 300, status, url,
  headers: new Headers({ "content-type": "application/json", ...extra }),
  json: async () => payload, text: async () => JSON.stringify(payload),
});
const htmlResponse = (url, body = html, status = 200) => ({
  ok: status >= 200 && status < 300, status, url,
  headers: new Headers({ "content-type": "text/html" }), text: async () => body,
});
function paginated(rows, page = 1, last = 1, total = rows.length) {
  return {
    data: rows,
    links: { next: page < last ? `https://ignored.invalid/not-followed?page=${page + 1}` : null },
    meta: { current_page: page, last_page: last, total, per_page: 2 },
  };
}

let sequence = 0;
async function scenario({ publicApi, panelApi, pageHtml = html, onSeries, catalog }) {
  const calls = [];
  globalThis.fetch = async (value, options) => {
    const url = new URL(value);
    calls.push({ url, options });
    if (url.pathname === "/api/series/list")
      return catalog?.(url) || jsonResponse(url.href, { data: [] });
    if (url.pathname.endsWith("/chapters")) {
      assert(options.signal instanceof AbortSignal);
      assert.equal(options.headers.Referer, series);
      if (url.origin === BASE) return publicApi(url);
      if (url.origin === PANEL) return panelApi(url);
      throw new Error(`Unexpected chapter host: ${url.hostname}`);
    }
    if (url.href === series) {
      onSeries?.();
      return htmlResponse(url.href, pageHtml);
    }
    return jsonResponse(url.href, {}, 404);
  };
  const { default: adapter, manifest } = await import(
    `../extensions/olympus/index.mjs?public-chapters-case=${++sequence}`
  );
  assert.equal(manifest.version, "1.6.0");
  assert.equal(manifest.upstream, "keiyoushi/extensions-source/src/es/olympusscanlation");
  return {
    adapter, calls,
    chapterCalls: () => calls.filter((call) => call.url.pathname.endsWith("/chapters")),
  };
}
const unavailable = (url) => jsonResponse(url.href, { error: "upstream unavailable" }, 520);
const missing = (url) => jsonResponse(url.href, {}, 404);
const complete = (url, offset = 100) => {
  const page = Number(url.searchParams.get("page"));
  return jsonResponse(url.href, paginated(
    page === 1 ? [chapter(offset + 3, 3), chapter(offset + 2, 2)]
      : [chapter(offset + 1, 1), chapter(offset, 0)],
    page, 2, 4,
  ));
};
const originalFetch = globalThis.fetch;

try {
  let test = await scenario({ publicApi: complete, panelApi: unavailable });
  let chapters = await test.adapter.chapters({ url: series });
  assert.deepEqual(chapters.map((row) => row.number), [3, 2, 1, 0]);
  assert.deepEqual(chapters.map((row) => row.remoteId), ["103", "102", "101", "100"]);
  assert(chapters.every((row) => row.remoteIdScope === "source"));
  assert(chapters.every((row) => row.url.startsWith(`${BASE}/capitulo/`)));
  assert.equal(test.chapterCalls().length, 2);
  assert(test.chapterCalls().every((call) => call.url.origin === BASE));
  assert.deepEqual(test.chapterCalls().map((call) => call.url.searchParams.get("page")), ["1", "2"]);
  assert(test.chapterCalls().every((call) =>
    call.url.searchParams.get("direction") === "desc" && call.url.searchParams.get("type") === "comic"));

  let attempts = 0;
  test = await scenario({
    publicApi: (url) => ++attempts === 1 ? unavailable(url)
      : jsonResponse(url.href, paginated([chapter(1, 1)])),
    panelApi: unavailable,
  });
  chapters = await test.adapter.chapters({ url: series });
  assert.equal(chapters.length, 1);
  assert.equal(attempts, 2, "Retry a transient response only once");
  assert(test.chapterCalls().every((call) => call.url.origin === BASE));

  for (const [status, extra] of [[503, { "retry-after": "60" }], [429, { "retry-after": "60" }], [403, {}]]) {
    test = await scenario({
      publicApi: (url) => jsonResponse(url.href, {}, status, extra),
      panelApi: (url) => jsonResponse(url.href, paginated([chapter(201, 1)])),
    });
    chapters = await test.adapter.chapters({ url: series });
    assert.equal(chapters[0].remoteId, "201");
    assert.equal(test.chapterCalls().filter((call) => call.url.origin === BASE).length, 1);
  }

  test = await scenario({
    publicApi: () => { throw new TypeError("fetch failed"); },
    panelApi: complete,
  });
  chapters = await test.adapter.chapters({ url: series });
  assert.equal(chapters.length, 4);
  assert.equal(test.chapterCalls().filter((call) => call.url.origin === BASE).length, 2);

  test = await scenario({ publicApi: missing, panelApi: complete });
  chapters = await test.adapter.chapters({ url: series });
  assert.equal(chapters.length, 4);
  assert(test.chapterCalls().some((call) => call.url.origin === BASE && call.url.searchParams.get("type") === "novel"));
  assert(test.chapterCalls().some((call) => call.url.origin === PANEL));
  console.log("PASS: public API first, full nested pagination, chapter zero and stable IDs; bounded transient retry and panel fallback");

  test = await scenario({
    publicApi: (url) => url.searchParams.get("page") === "1" ? complete(url) : unavailable(url),
    panelApi: (url) => complete(url, 200),
  });
  chapters = await test.adapter.chapters({ url: series });
  assert.deepEqual(chapters.map((row) => row.remoteId), ["203", "202", "201", "200"]);
  assert.equal(test.chapterCalls().filter((call) => call.url.origin === BASE).length, 3);
  assert.equal(test.chapterCalls().filter((call) => call.url.origin === PANEL).length, 2);

  test = await scenario({ publicApi: unavailable, panelApi: unavailable });
  await assert.rejects(() => test.adapter.chapters({ url: series }), (error) =>
    error.kind === "source_unavailable" && error.statusCode === 502 &&
    error.status === 520 && /lista completa/.test(error.message));
  assert.equal(test.chapterCalls().length, 4, "Do not repeat every slug/type on a failed host");

  for (const mode of ["missing-page", "wrong-total", "repeated-page", "too-many-pages", "malformed-row", "invalid-json"]) {
    test = await scenario({
      publicApi: (url) => {
        const page = Number(url.searchParams.get("page"));
        if (mode === "missing-page") return page === 1 ? complete(url) : missing(url);
        if (mode === "wrong-total")
          return jsonResponse(url.href, paginated([chapter(103, 3)], 1, 1, 99));
        if (mode === "repeated-page")
          return jsonResponse(url.href, paginated([chapter(103, 3)], 1, 2, 2));
        if (mode === "too-many-pages")
          return jsonResponse(url.href, paginated([chapter(103, 3)], 1, 101, 202));
        if (mode === "malformed-row")
          return jsonResponse(url.href, paginated([{ id: 103, name: "sin numeración" }]));
        return {
          ...jsonResponse(url.href, {}),
          json: async () => { throw new SyntaxError("Unexpected end of JSON"); },
        };
      },
      panelApi: missing,
    });
    await assert.rejects(() => test.adapter.chapters({ url: series }), (error) =>
      error.statusCode === 502 && error.kind === "source_error" && /lista completa/.test(error.message),
    mode);
    assert(test.chapterCalls().length < 10, "Incomplete pagination must stop early");
  }

  test = await scenario({
    publicApi: (url) => jsonResponse(url.href, paginated([], 1, 1, 0)),
    panelApi: unavailable,
  });
  assert.deepEqual(await test.adapter.chapters({ url: series }), []);
  assert.equal(test.chapterCalls().length, 1);
  console.log("PASS: no mixing partial endpoints or treating 520/partial pagination as a valid one-chapter/empty list");

  const fullHtml = html.replace("</main>",
    '<a href="/capitulo/102/comic-fixture">Capítulo 2</a>' +
    '<script>const unrelated="https://tracker.invalid/api/series/fixture/chapters";</script></main>');
  test = await scenario({ publicApi: missing, panelApi: missing, pageHtml: fullHtml });
  assert.deepEqual((await test.adapter.chapters({ url: series })).map((row) => row.number), [3, 2]);
  assert(test.calls.every((call) => [BASE, PANEL].includes(call.url.origin)));

  const realNow = Date.now;
  const started = realNow();
  try {
    Date.now = () => started;
    test = await scenario({
      publicApi: complete, panelApi: complete,
      onSeries: () => { Date.now = () => started + 27000; },
    });
    await assert.rejects(() => test.adapter.chapters({ url: series }), (error) =>
      error.kind === "source_unavailable" && error.statusCode === 504);
    assert.equal(test.chapterCalls().length, 0, "Do not start requests after the operation deadline");
  } finally {
    Date.now = realNow;
  }

  test = await scenario({
    publicApi: missing, panelApi: missing,
    catalog: (url) => jsonResponse(url.href, {}, 520),
  });
  await assert.rejects(() => test.adapter.search({ query: "fixture" }),
    /API pública de Olympus respondió HTTP 520/);
  console.log("PASS: 26-second operation budget, HTML compatibility for missing routes, approved hosts only and accurate public/panel error labels");

  globalThis.fetch = async (url) => htmlResponse(String(url), `
    <header><img src="https://media.fixture.test/comics/covers/9/cover.webp"></header>
    <main class="strip other"><!--[-->
      <div class="panel" data-i="0"><img src="https://media.fixture.test/comics/9/129112/c-9-portadas.webp"></div>
      <div class="panel second"><!-- SSR --><img data-src="https://media.fixture.test/comics/9/129112/banner.png"></div>
    <!--]--></main>
    <aside><img src="https://media.fixture.test/recommendations/01.webp"></aside>
    <script>const related="https://media.fixture.test/recommendations/02.webp";</script>
  `);
  const pages = await test.adapter.pages({ url: `${BASE}/capitulo/129112/comic-fixture` });
  assert.deepEqual(pages.map((page) => page.imageUrl), [
    "https://media.fixture.test/comics/9/129112/c-9-portadas.webp",
    "https://media.fixture.test/comics/9/129112/banner.png",
  ]);
  assert.deepEqual(pages.map((page) => page.index), [0, 1]);
  console.log("PASS: current reader panels retain legitimate portadas/banner filenames without adding recommendation images");
} finally {
  globalThis.fetch = originalFetch;
}

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const declared = JSON.parse(await readFile(new URL("../extensions/olympus/manifest.json", import.meta.url), "utf8"));
assert.equal(pkg.version, "5.22.0");
assert.equal(declared.version, "1.6.0");
assert.equal(declared.upstream, "keiyoushi/extensions-source/src/es/olympusscanlation");