import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";
import handler from "../api/index.mjs";

// Browser -> real Hanami API handler -> real Olympus adapter -> fixture upstream.
// No production Supabase, Olympus or Vercel is contacted by this test.
const publicRoot = path.resolve(fileURLToPath(new URL("../public/", import.meta.url)));
const source = "hanami.es.olympus";
const slug = "las-flo5324anico-chingon";
const old = "https://olympusxyz.com/series/comic-el-mecanico-legendario";
const canonical = `https://olympusxyz.com/series/comic-${slug}`;
const savedChapter = `https://olympusxyz.com/capitulo/1001/comic-${slug}`;
const fixtureImage = await sharp(Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="740" height="1100"><rect width="740" height="1100" fill="#2c1b29"/><path d="M0 700L740 250V1100H0Z" fill="#863247"/><circle cx="380" cy="370" r="180" fill="#ddc49b"/></svg>',
)).webp().toBuffer();
const rows = Array.from({ length: 81 }, (_, index) => ({
  id: 1081 - index, name: `Capítulo ${81 - index}`, published_at: "2026-01-01",
}));
let publicBroken = false;
const upstreamCalls = [], pageErrors = [];
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (value) => {
  const url = new URL(value);
  upstreamCalls.push({ url: url.href, broken: publicBroken });
  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" },
  });
  if (url.hostname === "panel.olympusxyz.com") return json({ error: "upstream unavailable" }, 520);
  if (url.hostname === "cdn.fixture.test")
    return new Response(fixtureImage, { headers: { "content-type": "image/webp" } });
  assert.equal(url.hostname, "olympusxyz.com", "Fixture must never fetch unrelated origins");
  if (url.href === old) return new Response("not found", { status: 404 });
  if (url.pathname === "/api/series/list")
    return json({ data: [{ id: 9, name: "El mecánico legendario", slug, type: "comic" }] });
  if (url.pathname === `/api/series/${slug}/chapters`) {
    if (publicBroken) return json({ error: "upstream unavailable" }, 520);
    const page = Number(url.searchParams.get("page"));
    return json({
      data: rows.slice((page - 1) * 40, page * 40),
      links: { next: page < 3 ? `/api/series/${slug}/chapters?page=${page + 1}` : null },
      meta: { current_page: page, last_page: 3, per_page: 40, total: 81 },
    });
  }
  if (url.pathname === `/api/series/${slug}`)
    return json({ data: {
      id: 9, name: "El mecánico legendario", description: "Prueba de recuperación de capítulos.",
      genres: [{ name: "Acción" }], cover: "https://cdn.fixture.test/cover.webp",
    } });
  if (url.pathname.startsWith("/capitulo/"))
    return new Response(`<main class="strip"><div class="panel"><img src="https://cdn.fixture.test/pages/01.webp"><img data-src="https://cdn.fixture.test/pages/02.webp"></div></main>`,
      { headers: { "content-type": "text/html" } });
  if (url.href === canonical)
    return new Response(`<main><h1>El mecánico legendario</h1><meta property="og:url" content="${canonical}"><a href="/capitulo/1081/comic-${slug}">Capítulo 81</a></main>`,
      { headers: { "content-type": "text/html" } });
  return new Response(`<main><a href="/series/comic-${slug}">El mecánico legendario</a></main>`,
    { headers: { "content-type": "text/html" } });
};

const mime = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".json": "application/json", ".webmanifest": "application/manifest+json",
};
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      request.query = Object.fromEntries(url.searchParams);
      request.query.path = url.pathname.replace(/^\/api\/?/, "");
      let body = "";
      for await (const chunk of request) body += chunk;
      request.body = body;
      response.status = (code) => { response.statusCode = code; return response; };
      response.json = (value) => {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify(value)); return response;
      };
      response.send = (value) => { response.end(value); return response; };
      return await handler(request, response);
    }
    const pathname = !path.extname(url.pathname) ? "/index.html" : url.pathname;
    const filename = path.resolve(publicRoot, `.${pathname}`);
    if (!filename.startsWith(`${publicRoot}${path.sep}`)) throw new Error("Invalid local path");
    const content = await fs.readFile(filename);
    response.writeHead(200, { "content-type": mime[path.extname(filename)] || "application/octet-stream" });
    response.end(content);
  } catch (error) {
    response.writeHead(500);
    response.end(error.message);
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const output = process.env.HANAMI_TEST_ARTIFACTS_DIR;
try {
  if (output) await fs.mkdir(output, { recursive: true });
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    publicBroken = false;
    const context = await browser.newContext({ viewport, serviceWorkers: "block" });
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "cdn.fixture.test")
        return route.fulfill({ contentType: "image/webp", body: fixtureImage });
      if (url.origin !== base) return route.abort();
      if (url.pathname === "/api/social-config") return route.fulfill({ json: { enabled: false } });
      if (url.pathname.startsWith("/api/") &&
          !url.pathname.startsWith(`/api/source/${source}/`) &&
          !["/api/sources", "/api/extensions", "/api/status", "/api/image"].includes(url.pathname))
        return route.fulfill({ json: { items: [], mangas: [], total: 0 } });
      return route.continue();
    });
    await context.addInitScript(({ old, source, savedChapter }) => {
      if (window.top !== window || localStorage.getItem("olympus-v146-fixture-seeded")) return;
      localStorage.setItem("olympus-v146-fixture-seeded", "true");
      localStorage.setItem("hanami-library-room-scope-v1", "personal");
      localStorage.setItem("hanami-reading-profile-v1", JSON.stringify({ id: "fixture-reader", name: "Pruebas", initials: "P" }));
      localStorage.setItem("hanami-install-seeded", "true");
      localStorage.setItem("hanami-installed-sources", JSON.stringify([source]));
      localStorage.setItem("hanami-library", JSON.stringify([{
        id: "legacy-olympus", title: "El mecánico legendario", url: old,
        sourceId: source, favorite: true, categories: ["default"], categoryIds: ["default"],
        thumbnailUrl: "/assets/reading-room-bedroom.webp", remoteWorkId: "9",
        totalChapters: 1, readCount: 1, unreadCount: 0,
        _chapters: [{ id: "1001", remoteId: "1001", remoteIdScope: "source", url: savedChapter, name: "Capítulo 1", number: 1 }],
        _chapterMeta: { [savedChapter]: { read: true, bookmark: true, lastPageRead: 1 } },
      }]));
    }, { old, source, savedChapter });
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const begin = upstreamCalls.length;
    await page.goto(`${base}/library`);
    await page.waitForFunction(() => document.documentElement.dataset.hanamiReady === "true" && window.HanamiLibraryGroups);
    await page.evaluate(async () => {
      await window.HanamiSocialSync?.ready;
      window.HanamiLibraryGroups.activate("personal");
    });
    await page.locator('[data-lib-id="legacy-olympus"]').waitFor({ timeout: 5000 }).catch(async (error) => {
      const debug = await page.evaluate(() => ({
        root: document.body.dataset.root,
        library: JSON.parse(localStorage.getItem("hanami-library") || "[]"),
        cards: [...document.querySelectorAll("[data-lib-id]")].map((item) => item.dataset.libId),
        text: document.body.innerText.slice(0, 1600),
      }));
      console.log("Fixture debug:", JSON.stringify({ ...debug, pageErrors }));
      if (output) await page.screenshot({ path: path.join(output, "fixture-error.png") });
      throw error;
    });
    await page.locator('[data-lib-id="legacy-olympus"]').click();
    await page.waitForFunction(() => {
      const manga = JSON.parse(localStorage.getItem("hanami-library"))?.[0];
      return manga?._chapters?.length === 81;
    });
    let manga = await page.evaluate(() => JSON.parse(localStorage.getItem("hanami-library"))[0]);
    assert.equal(manga.url, canonical);
    assert(manga._chapterMeta[savedChapter].read && manga._chapterMeta[savedChapter].bookmark);
    await page.locator('[data-md-chapter="0"]').waitFor();
    assert.equal(await page.locator("[data-md-chapter]").count(), 81);
    await page.locator('img[src*="cdn.fixture.test"]').first().evaluate((image) => image.decode());
    assert(!upstreamCalls.slice(begin).some((call) => new URL(call.url).hostname === "panel.olympusxyz.com"));
    if (output) await page.screenshot({ path: path.join(output, `olympus-detail-${viewport.width}.png`) });
    await page.locator('[data-md-chapter="0"] b').click();
    await page.waitForFunction(() => [...document.querySelectorAll("#readerViewport figure img")]
      .some((image) => image.naturalWidth > 0));
    if (output) await page.screenshot({ path: path.join(output, `olympus-reader-${viewport.width}.png`) });
    await page.evaluate(() => window.HanamiReader.close());

    publicBroken = true;
    const failure = await page.evaluate(async ({ source, canonical }) => {
      const result = await fetch(`/api/source/${source}/chapters`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: canonical, title: "El mecánico legendario" }),
      });
      return { status: result.status, body: await result.json() };
    }, { source, canonical });
    assert.equal(failure.status, 502);
    assert.equal(failure.body.kind, "source_unavailable");
    assert(!Array.isArray(failure.body));
    await page.evaluate(async () => {
      await window.HanamiLibrary.refreshItems(["legacy-olympus"]);
    });
    manga = await page.evaluate(() => JSON.parse(localStorage.getItem("hanami-library"))[0]);
    assert.equal(manga._chapters.length, 81);
    assert(manga._chapterMeta[savedChapter].read && manga._chapterMeta[savedChapter].bookmark);
    await context.close();
  }
  assert.deepEqual(pageErrors, []);
  console.log("PASS: actual API + adapter recovers stale URL and renders 81 paginated chapters without contacting the 520 panel");
  console.log("PASS: mobile/desktop reader opens; both APIs failing returns source_unavailable, not a partial list; cached read/bookmark state preserved");
  console.log("PASS: no browser page exceptions; no production network or database mutations");
  if (output) await fs.writeFile(path.join(output, "e2e-results.json"), JSON.stringify({
    upstream: "fixtures", realHanamiHandler: true, realOlympusAdapter: true,
    chapterCount: 81, viewports: [390, 1280], pageErrors,
    successfulPhasePanelCalls: upstreamCalls.filter((call) =>
      !call.broken && new URL(call.url).hostname === "panel.olympusxyz.com").length,
    productionModified: false,
  }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  globalThis.fetch = nativeFetch;
}