import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/usr/local/bin/chromium",
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  serviceWorkers: "block",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/api/sources", (route) =>
  route.fulfill({
    contentType: "application/json",
    body: JSON.stringify([
      {
        id: "hanami.es.olympus",
        name: "Olympus",
        lang: "es",
        version: "1.0.0",
        runtime: "vercel-js",
        status: "ready",
      },
    ]),
  }),
);
await page.route("**/api/extensions", (route) =>
  route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ items: [], total: 0 }),
  }),
);
await page.route("**/api/source/hanami.es.olympus/details", (route) =>
  route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      title: "Ciudad después de medianoche",
      url: "/series/ciudad-medianoche",
      thumbnailUrl: "/assets/fallen.webp",
      author: "Luna",
      description: "Una recomendación compartida para leer de noche.",
      genre: ["Drama"],
      status: "ongoing",
    }),
  }),
);
await page.route("**/api/source/hanami.es.olympus/chapters", (route) =>
  route.fulfill({
    contentType: "application/json",
    body: JSON.stringify([
      {
        url: "/chapter/2",
        name: "Capítulo 2",
        number: 2,
        dateUpload: Date.now(),
      },
      {
        url: "/chapter/1",
        name: "Capítulo 1",
        number: 1,
        dateUpload: Date.now() - 86400000,
      },
    ]),
  }),
);
await page.addInitScript(() => {
  localStorage.setItem(
    "hanami-group-libraries-v1",
    JSON.stringify({
      "local-room": [
        {
          id: "shared-1",
          groupId: "local-room",
          sourceId: "hanami.es.olympus",
          mangaUrl: "/series/ciudad-medianoche",
          title: "Ciudad después de medianoche",
          thumbnailUrl: "/assets/fallen.webp",
          recommendedByName: "Luna",
          recommendation: "Leámosla juntos.",
          remote: true,
          syncState: "synced",
        },
      ],
    }),
  );
});
await page.goto("http://127.0.0.1:4173/");
await page.waitForFunction(
  () => document.documentElement.dataset.hanamiReady === "true",
);
await page.locator('[data-tab="groups"]').click();
await page.locator(".reading-room-card").click();
await page.locator('[data-group-library-details="shared-1"]').click();
await page.locator("#groupsRoot .mihon-detail").waitFor({ state: "visible" });
assert.equal(
  await page.evaluate(() => HanamiScreens.current().type),
  "group-manga-detail",
);
assert(
  await page
    .locator("#groupsRoot .mihon-detail h2", {
      hasText: "Ciudad después de medianoche",
    })
    .isVisible(),
);
assert(await page.getByText("Una recomendación compartida", { exact: false }).isVisible());
assert.equal(await page.locator("#browser:not(.hidden)").count(), 0);
assert.deepEqual(errors, []);
await page.screenshot({
  path: "/data/hanami-v119-group-mihon-details-mobile.png",
  fullPage: true,
});
await browser.close();
console.log(
  "PASS: mobile 390x844 opens a shared recommendation directly in Mihon Details without the canonical source-detail route",
);