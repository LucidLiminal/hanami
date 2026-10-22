import assert from "node:assert/strict";
import { chromium } from "playwright";

const sourceId = "fixture.hnm025";
const workUrl = "/fixture/hnm025-work";
const chapterUrl = "/fixture/hnm025-chapter-1";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/usr/local/bin/chromium",
  args: ["--no-sandbox"],
});

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    serviceWorkers: "block",
  });
  await context.addInitScript(({ sourceId, workUrl }) => {
    localStorage.setItem("hanami-reduce-motion", "true");
    localStorage.setItem("hanami-install-seeded", "true");
    localStorage.setItem("hanami-installed-sources", JSON.stringify([sourceId]));
    localStorage.setItem(
      "hanami-library",
      JSON.stringify([
        {
          id: "hnm025-work",
          title: "Estado al volver",
          url: workUrl,
          sourceId,
          favorite: true,
          categories: ["default"],
          thumbnailUrl: "/assets/fallen.webp",
        },
      ]),
    );
  }, { sourceId, workUrl });

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/sources", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([{ id: sourceId, name: "Fuente HNM-025", lang: "es" }]),
    }),
  );
  await page.route("**/api/extensions", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [] }) }),
  );
  await page.route("**/api/source/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/details")) {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ title: "Estado al volver", url: workUrl, thumbnailUrl: "/assets/fallen.webp" }),
      });
    }
    if (path.endsWith("/chapters")) {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([{ url: chapterUrl, name: "Capítulo 1", number: 1 }]),
      });
    }
    if (path.endsWith("/pages")) {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([{ imageUrl: "http://127.0.0.1:4173/assets/fallen.webp" }]),
      });
    }
    return route.fulfill({ status: 404, body: "missing fixture" });
  });

  await page.goto("http://127.0.0.1:4173/library");
  await page.waitForFunction(() => document.documentElement.dataset.hanamiReady === "true");
  await page.locator('[data-lib-id="hnm025-work"]').click();
  const detail = page.locator("#libraryRoot .mihon-detail");
  await detail.waitFor();
  await detail.evaluate((node) => { node.dataset.hnm025Mounted = "before-reader"; });
  const chapter = page.locator('[data-md-chapter="0"]');
  await chapter.waitFor();
  assert.equal(await chapter.evaluate((node) => node.classList.contains("unread")), true);

  await chapter.click();
  await page.locator("#reader:not(.hidden)").waitFor();
  await page.locator("[data-r-close]").click();
  await page.waitForFunction(
    () => document.querySelector("#reader")?.classList.contains("hidden") && document.querySelector('[data-md-chapter="0"]')?.classList.contains("read"),
  );

  assert.equal(
    await detail.getAttribute("data-hnm025-mounted"),
    "before-reader",
    "the original detail stays mounted and receives the progress event",
  );
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("hanami-library"))[0]);
  assert.equal(saved._chapterMeta["/fixture/hnm025-chapter-1"].read, true);
  assert.equal(saved.readCount, 1);
  await page.screenshot({ path: "/data/hanami-v150-detail-read-state-hnm025-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  await context.close();
} finally {
  await browser.close();
}

console.log("PASS: HNM-025 refreshes an already-mounted detail after completing a chapter");
