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
    localStorage.setItem("hanami-install-seeded", "true");
    localStorage.setItem("hanami-installed-sources", JSON.stringify(["fixture"]));
    localStorage.setItem(
      "hanami-library",
      JSON.stringify([
        {
          id: "hnm024-book",
          title: "Pulsación protegida",
          url: "/fixture/hnm024",
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
    route.fulfill({ contentType: "application/json", body: JSON.stringify([]) }),
  );
  await page.route("**/api/extensions", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [] }) }),
  );
  await page.goto("http://127.0.0.1:4173/library");
  await page.waitForFunction(
    () => document.documentElement.dataset.hanamiReady === "true" && window.HanamiMobilePressGuard,
  );
  const card = page.locator('[data-lib-id="hnm024-book"]');
  await card.waitFor();

  const nativeEvents = await card.locator("img").evaluate((image) => {
    const dispatch = (type) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      image.dispatchEvent(event);
      return event.defaultPrevented;
    };
    return {
      context: dispatch("contextmenu"),
      selection: dispatch("selectstart"),
      drag: dispatch("dragstart"),
      userSelect: getComputedStyle(image.closest(".lib-item")).userSelect,
    };
  });
  assert.deepEqual(
    [nativeEvents.context, nativeEvents.selection, nativeEvents.drag],
    [true, true, true],
    "the card owns its press instead of browser-native UI",
  );
  assert.equal(nativeEvents.userSelect, "none");

  const updatesSurfaceBlocked = await page.evaluate(() => {
    const item = document.createElement("article");
    item.className = "updates-item";
    const image = document.createElement("img");
    item.append(image);
    document.body.append(item);
    const event = new Event("contextmenu", { bubbles: true, cancelable: true });
    image.dispatchEvent(event);
    item.remove();
    return event.defaultPrevented;
  });
  assert.equal(updatesSurfaceBlocked, true, "the same guard covers cards from other tabs");

  const editableAllowed = await page.evaluate(() => {
    const input = document.createElement("input");
    document.body.append(input);
    const event = new Event("contextmenu", { bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    input.remove();
    return event.defaultPrevented;
  });
  assert.equal(editableAllowed, false, "form fields keep native press behavior");

  const pointerWasNotCancelled = await card.evaluate((node) => {
    const event = new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      pointerType: "touch",
      pointerId: 24,
      button: 0,
      clientX: 40,
      clientY: 180,
    });
    node.dispatchEvent(event);
    return event.defaultPrevented;
  });
  assert.equal(pointerWasNotCancelled, false, "the guard does not cancel the app long press");
  await page.waitForTimeout(560);
  await page.locator('[data-selection-toolbar="library"]').waitFor();
  await page.screenshot({
    path: "/data/hanami-v150-longpress-hnm024-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await context.close();
} finally {
  await browser.close();
}

console.log("PASS: HNM-024 preserves Hanami long press while blocking mobile native menus");
