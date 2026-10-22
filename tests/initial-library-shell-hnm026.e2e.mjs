import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = "http://127.0.0.1:4173/";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/usr/local/bin/chromium",
  args: ["--no-sandbox"],
});

const shell = () => ({
  title: document.title,
  root: document.body.dataset.root,
  heroHidden: document.querySelector("#hero")?.classList.contains("hidden"),
  exploreChromeHidden: document
    .querySelector("#exploreChrome")
    ?.classList.contains("hidden"),
  exploreTabsHidden: document
    .querySelector("#exploreTabs")
    ?.classList.contains("hidden"),
  libraryHidden: document.querySelector("#library")?.classList.contains("hidden"),
  sourcesHidden: document.querySelector("#sources")?.classList.contains("hidden"),
  libraryActive: document
    .querySelector('.main-nav [data-tab="library"]')
    ?.classList.contains("active"),
  libraryCurrent: document
    .querySelector('.main-nav [data-tab="library"]')
    ?.getAttribute("aria-current"),
  exploreActive: document
    .querySelector('.main-nav [data-tab="explore"]')
    ?.classList.contains("active"),
  exploreCurrent: document
    .querySelector('.main-nav [data-tab="explore"]')
    ?.getAttribute("aria-current"),
});

const expectedShell = {
  title: "Hanami // Biblioteca",
  root: "library",
  heroHidden: true,
  exploreChromeHidden: true,
  exploreTabsHidden: true,
  libraryHidden: false,
  sourcesHidden: true,
  libraryActive: true,
  libraryCurrent: "page",
  exploreActive: false,
  exploreCurrent: null,
};

try {
  const staticContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    javaScriptEnabled: false,
    serviceWorkers: "block",
  });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  assert.deepEqual(
    await staticPage.evaluate(shell),
    expectedShell,
    "the parser-rendered base shell must already be Biblioteca",
  );
  await staticContext.close();

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
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
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.hanamiReady === "true" &&
      document.body.dataset.root === "library",
  );
  assert.deepEqual(
    await page.evaluate(shell),
    expectedShell,
    "the completed startup must preserve the Library shell",
  );
  await page.screenshot({
    path: "/data/hanami-v150-initial-library-hnm026-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await context.close();
} finally {
  await browser.close();
}

console.log("PASS: HNM-026 opens the base URL directly on Biblioteca");
