import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/usr/local/bin/chromium",
  args: ["--no-sandbox"],
});

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.route("**/api/sources", (route) =>
    route.fulfill({ contentType: "application/json", body: "[]" }),
  );
  await page.route("**/api/extensions", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [] }),
    }),
  );

  await page.goto("http://127.0.0.1:4173/library");
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.hanamiReady === "true" &&
      Boolean(window.HanamiMoreTab),
  );
  await page.locator('[data-tab="more"]').click();
  await page
    .locator('[data-mt-open="settings"]')
    .evaluate((node) => node.scrollIntoView({ block: "center" }));
  const rootScroll = await page.evaluate(() => scrollY);
  assert(rootScroll > 100, "the fixture must leave the More root scrolled");

  await page.locator('[data-mt-open="settings"]').click();
  await page.locator('[data-mt-setting="about"]').waitFor({ state: "visible" });
  await page.waitForFunction(() => scrollY === 0);
  assert.equal(
    await page.evaluate(() => scrollY),
    0,
    "a new settings screen must start at the top",
  );
  await page.screenshot({
    path: "/data/hanami-v150-scroll-hnm022-mobile.png",
    fullPage: true,
  });

  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  const settingsScroll = await page.evaluate(() => scrollY);
  assert(settingsScroll > 0, "the settings fixture must become scrollable");

  await page.locator('[data-mt-setting="about"]').click();
  await page.locator(".mt-about").waitFor({ state: "visible" });
  await page.waitForFunction(() => scrollY === 0);
  assert.equal(
    await page.evaluate(() => scrollY),
    0,
    "a nested screen must also start at the top",
  );

  await page.goBack();
  await page.locator('[data-mt-setting="about"]').waitFor({ state: "visible" });
  await page.waitForFunction((saved) => scrollY === saved, settingsScroll);
  await page.goBack();
  await page.locator('[data-mt-open="settings"]').waitFor({ state: "visible" });
  await page.waitForTimeout(80);
  assert(
    (await page.evaluate(() => scrollY)) > 100,
    "Back must keep the prior More root position instead of resetting it",
  );
  assert.deepEqual(errors, []);

  await context.close();
} finally {
  await browser.close();
}

console.log(
  "PASS: HNM-022 resets fresh screens while preserving scroll on Back",
);