import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const { version } = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const expectedLabel = `Hanami Web ${version}`;
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
    route.fulfill({
      contentType: "application/json",
      body: "[]",
    }),
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
      Boolean(window.HanamiMoreTab?.render) &&
      window.HanamiAppVersion?.version,
  );
  assert.equal(
    await page.evaluate(() => window.HanamiAppVersion.version),
    version,
  );

  await page.locator('[data-tab="more"]').click();
  const rootAbout = page.locator('[data-mt-open="about"]');
  await rootAbout.waitFor({ state: "visible" });
  assert.match((await rootAbout.innerText()).replace(/\s+/g, " "), new RegExp(expectedLabel));

  await rootAbout.click();
  const about = page.locator(".mt-about");
  await about.waitFor({ state: "visible" });
  const aboutText = await about.innerText();
  assert(aboutText.includes(version));
  assert(!aboutText.includes("5.8.40"));
  assert(!aboutText.includes("5.9.5"));
  await page.screenshot({
    path: "/data/hanami-v150-about-version-hnm021.png",
    fullPage: true,
  });

  await page.locator("[data-mt-back]").click();
  const settings = page.locator('[data-mt-open="settings"]');
  await settings.waitFor({ state: "visible" });
  await settings.click();
  const settingsAbout = page.locator('[data-mt-setting="about"]');
  await settingsAbout.waitFor({ state: "visible" });
  assert.match(
    (await settingsAbout.innerText()).replace(/\s+/g, " "),
    new RegExp(expectedLabel),
  );
  assert.deepEqual(errors, []);

  await context.close();
} finally {
  await browser.close();
}

console.log(
  "PASS: HNM-021 shows the packaged version in More, Settings and About",
);