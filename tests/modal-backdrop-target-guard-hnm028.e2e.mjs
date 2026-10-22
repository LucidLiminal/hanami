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
  await page.goto("http://127.0.0.1:4173/library");
  await page.waitForFunction(
    () => document.documentElement.dataset.hanamiReady === "true" && window.HanamiOverlays,
  );

  const afterPointerDown = await page.evaluate(async () => {
    const modal = document.querySelector("#modal");
    const button = document.querySelector('[data-tab="explore"]');
    document.querySelector("#modalBody").innerHTML = "<p>Prueba de backdrop</p>";
    modal.showModal();
    window.HanamiOverlays.scan();
    await new Promise((resolve) => setTimeout(resolve, 0));
    window.__hnm028UnderlayClicks = 0;
    button.addEventListener("click", () => window.__hnm028UnderlayClicks++);
    modal.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        pointerType: "touch",
        pointerId: 28,
      }),
    );
    return {
      modalOpen: modal.open,
      root: document.body.dataset.root,
      overlayCount: window.HanamiOverlays.count(),
    };
  });

  assert.deepEqual(afterPointerDown, {
    modalOpen: true,
    root: "library",
    overlayCount: 1,
  });

  await page.evaluate(async () => {
    const button = document.querySelector('[data-tab="explore"]');
    button.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        pointerType: "touch",
        pointerId: 28,
      }),
    );
    button.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
    );
  });
  await page.waitForFunction(() => !document.querySelector("#modal").open);
  const result = await page.evaluate(() => ({
    root: document.body.dataset.root,
    clicks: window.__hnm028UnderlayClicks,
    overlayCount: window.HanamiOverlays.count(),
  }));
  assert.deepEqual(result, {
    root: "library",
    clicks: 0,
    overlayCount: 0,
  });
  await page.screenshot({
    path: "/data/hanami-v150-modal-backdrop-hnm028-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await context.close();
} finally {
  await browser.close();
}

console.log("PASS: HNM-028 closes the modal without activating its underlay");
