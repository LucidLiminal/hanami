import assert from "node:assert/strict";
import { chromium } from "playwright";

const sources = [
  { id: "one", name: "Uno", lang: "es", baseUrl: "https://one.invalid" },
  { id: "two", name: "Dos", lang: "es", baseUrl: "https://two.invalid" },
];
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
      body: JSON.stringify(sources),
    }),
  );
  await page.route("**/api/extensions", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [] }),
    }),
  );
  await page.route("**/api/source/*/search*", (route) => {
    const source = new URL(route.request().url()).pathname.split("/")[3];
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        mangas: [
          {
            title: `Noche en ${source}`,
            url: `/${source}/noche`,
            thumbnailUrl: "/assets/fallen.webp",
          },
        ],
      }),
    });
  });

  await page.goto("http://127.0.0.1:4173/library");
  await page.waitForFunction(
    () => document.documentElement.dataset.hanamiReady === "true",
  );
  await page.locator('[data-tab="explore"]').click();
  await page.locator("[data-global-search]").click();
  const toolbar = page.locator(".global-search-toolbar");
  await toolbar.waitFor({ state: "visible" });

  assert.equal(await page.locator(".global-search-main").count(), 0);
  assert.equal(await page.locator("[data-run-global]").count(), 0);
  const input = page.locator("#globalQuery");
  assert.equal(await input.getAttribute("type"), "search");
  assert.equal(await input.getAttribute("enterkeyhint"), "search");
  const layout = await toolbar.evaluate((node) => {
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      };
    };
    return {
      height: node.getBoundingClientRect().height,
      children: [...node.children].map(box),
    };
  });
  assert.deepEqual(
    layout.children.map((child) => child.tag),
    ["BUTTON", "INPUT", "PROGRESS", "NAV"],
  );
  const [back, query, progress, chips] = layout.children;
  assert(query.left >= back.right, "the input must not overlap Back");
  assert(
    progress.bottom === 0 || progress.top >= Math.max(back.bottom, query.bottom),
  );
  assert(chips.top >= Math.max(back.bottom, query.bottom));
  assert(layout.height >= 110, "the toolbar reserves independent rows");

  await input.fill("Noche");
  await input.press("Enter");
  await page.getByText("Uno · 1", { exact: true }).waitFor();
  await page.getByText("Dos · 1", { exact: true }).waitFor();
  assert(
    (await page.locator("[data-global-group]").count()) >= 2,
    "Enter must render result groups for the enabled sources",
  );
  assert.deepEqual(errors, []);
  await page.screenshot({
    path: "/data/hanami-v150-global-search-hnm023-mobile.png",
    fullPage: true,
  });

  await context.close();
} finally {
  await browser.close();
}

console.log(
  "PASS: HNM-023 lays out global search cleanly and submits from Enter",
);