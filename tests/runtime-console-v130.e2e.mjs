import assert from "node:assert/strict";
import { chromium } from "playwright";
const base = process.env.HANAMI_TEST_URL || "http://127.0.0.1:4173";

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/usr/local/bin/chromium",
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: "block",
});
const page = await context.newPage();
await page.addInitScript(() => {
  window.__fullscreenCalls = 0;
  Object.defineProperty(Element.prototype, "requestFullscreen", {
    configurable: true,
    value() {
      window.__fullscreenCalls++;
      return Promise.resolve();
    },
  });
});
const issues = [];
page.on("pageerror", (error) => issues.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") issues.push(`console: ${message.text()}`);
});

await page.goto(base + "/");
await page.waitForFunction(() => !!window.HanamiReader);
await page.evaluate(() => {
  const image =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="390" height="900"><rect width="100%" height="100%" fill="#111"/></svg>',
    );
  window.HanamiReader.open(
    {
      title: "Consola v130",
      sourceId: "test",
      mangaUrl: "/test",
      chapter: { url: "/chapter/test", number: 1, name: "Capítulo" },
      pages: [{ imageUrl: image }],
    },
    true,
  );
});
await page.waitForTimeout(200);
assert.equal(await page.evaluate(() => window.__fullscreenCalls), 0);
await page.locator("[data-r-settings]").click();
await page.locator('[data-r-tab="general"]').click();
await page.locator('[data-pref="fullscreen"]').check();
assert.equal(await page.evaluate(() => window.__fullscreenCalls), 1);
assert.equal(
  await page.locator('meta[name="mobile-web-app-capable"]').getAttribute("content"),
  "yes",
);
const favicon = await page.request.get(base + "/favicon.ico");
assert.equal(favicon.status(), 200);
assert.match(favicon.headers()["content-type"], /image\/x-icon/);
const api = await page.request.get(base + "/api/music/capabilities");
assert.equal(api.status(), 200);
assert.deepEqual(issues, []);

await browser.close();
console.log(
  "PASS: Chromium opens Reader without automatic fullscreen, enters it only from the user's toggle, and loads the modern PWA metadata, favicon and music API without console errors",
);
