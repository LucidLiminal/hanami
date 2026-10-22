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
  await context.addInitScript(() => {
    localStorage.setItem("hanami-reduce-motion", "true");
    localStorage.setItem(
      "hanami-library",
      JSON.stringify([
        {
          id: "hnm027-a",
          title: "Selección uno",
          url: "/fixture/hnm027-a",
          sourceId: "fixture",
          favorite: true,
          categories: ["default"],
          thumbnailUrl: "/assets/fallen.webp",
        },
        {
          id: "hnm027-b",
          title: "Selección dos",
          url: "/fixture/hnm027-b",
          sourceId: "fixture",
          favorite: true,
          categories: ["default"],
          thumbnailUrl: "/assets/fallen.webp",
        },
      ]),
    );
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
  await page.route("**/api/source/fixture/**", (route) =>
    route.fulfill({ contentType: "application/json", body: "[]" }),
  );
  await page.goto("http://127.0.0.1:4173/library");
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.hanamiReady === "true" &&
      document.querySelectorAll(".lib-item").length === 2,
  );

  const result = await page.evaluate(async () => {
    const heldCard = document.querySelector('[data-lib-id="hnm027-a"]');
    heldCard.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        pointerType: "touch",
        pointerId: 27,
        clientX: 40,
        clientY: 180,
        button: 0,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 540));
    const releasedCardWasReplaced = !heldCard.isConnected;
    document.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        pointerType: "touch",
        pointerId: 27,
        clientX: 40,
        clientY: 180,
        button: 0,
      }),
    );
    heldCard.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    const selected = () =>
      [...document.querySelectorAll(".lib-item.selected")].map(
        (item) => item.dataset.libId,
      );
    const afterHold = selected();
    document.querySelector('[data-lib-id="hnm027-b"]').click();
    const afterFirstTap = selected();
    document.querySelector('[data-lib-id="hnm027-b"]').click();
    const afterSecondTap = selected();
    return {
      releasedCardWasReplaced,
      detailOpen: Boolean(document.querySelector("#libraryRoot .mihon-detail")),
      afterHold,
      afterFirstTap,
      afterSecondTap,
    };
  });

  assert.equal(result.releasedCardWasReplaced, true);
  assert.equal(result.detailOpen, false, "releasing the hold must not open the work");
  assert.deepEqual(result.afterHold, ["hnm027-a"]);
  assert.deepEqual(
    result.afterFirstTap.sort(),
    ["hnm027-a", "hnm027-b"],
    "the first touch after the hold must select the next work",
  );
  assert.deepEqual(
    result.afterSecondTap,
    ["hnm027-a"],
    "a following touch must still deselect normally",
  );
  await page.screenshot({
    path: "/data/hanami-v150-selection-first-tap-hnm027-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await context.close();
} finally {
  await browser.close();
}

console.log("PASS: HNM-027 keeps the first post-hold library tap actionable");
