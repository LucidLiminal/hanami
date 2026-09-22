import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/usr/local/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript(() => {
  localStorage.setItem(
    "hanami-reader-comments-v1",
    JSON.stringify({
      "hanami.test|/manga|/chapter|0": [
        { id: "legacy-comment", x: 0.4, y: 0.3, width: 0.42, text: "Migrado" },
      ],
    }),
  );
});
await page.goto("http://127.0.0.1:4173/");
await page.waitForFunction(() => document.documentElement.dataset.hanamiReady === "true");
await page.evaluate(() => window.HanamiReaderComments.ready);
const migration = await page.evaluate(
  () =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open("hanami-reader-comments-v2", 1);
      request.onsuccess = () => {
        const db = request.result;
        const all = db.transaction("comments").objectStore("comments").getAll();
        all.onsuccess = () =>
          resolve({
            count: all.result.length,
            groupId: all.result[0]?.groupId,
            legacy: localStorage.getItem("hanami-reader-comments-v1"),
          });
        all.onerror = () => reject(all.error);
      };
      request.onerror = () => reject(request.error);
    }),
);
assert.equal(migration.count, 1);
assert.equal(migration.groupId, "local-room");
assert.equal(migration.legacy, null);
await page.locator('[data-tab="groups"]').click();
await page.locator(".reading-groups-home").waitFor({ state: "visible" });
assert.equal(await page.locator(".main-nav [data-tab]").count(), 6);
assert(await page.getByText("Grupos de", { exact: false }).isVisible());
assert(await page.locator(".reading-groups-hero").isVisible());
assert.equal(await page.locator(".reading-room-card").count(), 1);
await page.locator(".reading-room-card").click();
await page.locator(".reading-group-detail").waitFor({ state: "visible" });
assert(await page.getByText("Miembros", { exact: true }).isVisible());
await page.locator("[data-group-back]").click();
await page.locator(".reading-groups-home").waitFor({ state: "visible" });
assert.deepEqual(errors, []);
await page.screenshot({
  path: "/data/hanami-v116-groups-mobile.png",
  fullPage: true,
});
await browser.close();
console.log(
  "PASS: mobile 390x844 renders six destinations, editorial groups home and centralized group detail Back",
);