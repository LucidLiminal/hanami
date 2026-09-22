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
await page.addInitScript(() => {
  localStorage.setItem(
    "hanami-library",
    JSON.stringify([
      {
        id: "m1",
        title: "Ciudad después de medianoche",
        sourceId: "hanami.es.olympus",
        url: "/series/ciudad-medianoche",
        thumbnailUrl: "/assets/fallen.webp",
        genre: ["Drama"],
        favorite: true,
      },
    ]),
  );
});
await page.goto("http://127.0.0.1:4173/");
await page.waitForFunction(
  () => document.documentElement.dataset.hanamiReady === "true",
);
await page.evaluate(() =>
  Promise.all([
    window.HanamiSocialSync.ready,
    window.HanamiReaderComments.ready,
  ]),
);
await page.locator('[data-tab="groups"]').click();
await page.locator(".reading-room-card").click();
await page.locator(".group-library-section").waitFor({ state: "visible" });
await page.locator("[data-group-library-recommend]").click();
await page.locator("[data-group-recommend-item]").waitFor({ state: "visible" });
page.once("dialog", (dialog) => dialog.accept("Luna dijo que el final merece la pena."));
await page.locator("[data-group-recommend-item]").click();
await page
  .locator(".group-library-card h4", { hasText: "Ciudad después de medianoche" })
  .waitFor();
assert(
  await page
    .locator(".group-library-card blockquote", {
      hasText: "Luna dijo que el final merece la pena.",
    })
    .isVisible(),
);
const state = await page.evaluate(async () => {
  const groupId = HanamiReadingGroups.activeId();
  const entry = HanamiGroupLibrary.entries(groupId)[0];
  await HanamiGroupLibrary.openEntry(groupId, entry.id);
  dispatchEvent(
    new CustomEvent("hanami-reader-progress", {
      detail: {
        sourceId: entry.sourceId,
        mangaUrl: entry.mangaUrl,
        chapterUrl: "/chapter/3",
        chapterNumber: 3,
        chapterName: "Capítulo 3",
        pageIndex: 7,
        pageCount: 20,
        completed: false,
      },
    }),
  );
  HanamiReadingGroups.detail(HanamiReadingGroups.active(), true);
  return {
    groupId,
    entryId: entry.id,
    context: HanamiGroupLibrary.context(),
  };
});
assert.equal(state.context.groupId, state.groupId);
assert.equal(state.context.entryId, state.entryId);
await page.getByText("Capítulo 3 · 8/20", { exact: true }).waitFor();
assert(
  await page.locator(".group-progress-list b", { hasText: "Tú" }).isVisible(),
);
assert.deepEqual(errors, []);
await page.screenshot({
  path: "/data/hanami-v118-group-library-mobile.png",
  fullPage: true,
});
await browser.close();
console.log(
  "PASS: mobile 390x844 recommends from personal library and shows per-member chapter/page progress in the independent group library",
);