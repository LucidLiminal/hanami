import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

// Serve the actual app on an ephemeral port; no running backend or credentials
// are needed to reproduce these reader-only interaction regressions.
const publicRoot = resolve(new URL("../public/", import.meta.url).pathname);
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".webmanifest": "application/manifest+json",
};
const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (url.pathname.startsWith("/api/")) {
    const data = url.pathname === "/api/sources"
      ? [{ id: "fixture.source", name: "Fixture", lang: "es", runtime: "vercel-js", status: "ready" }]
      : url.pathname === "/api/social-config" ? { enabled: false }
      : url.pathname === "/api/music/capabilities"
        ? { soundcloud: { widget: false, oembed: false, searchConfigured: false } }
        : [];
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(data));
    return;
  }
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/" || !extname(pathname)) pathname = "/index.html";
  const file = resolve(publicRoot, `.${pathname}`);
  if (!file.startsWith(`${publicRoot}${sep}`)) {
    response.writeHead(403); response.end(); return;
  }
  try {
    if (!(await stat(file)).isFile()) throw new Error("not-file");
    response.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404); response.end("Not found");
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}`;
const pageImage = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="390" height="1200"><rect width="390" height="1200" fill="#321315"/><path d="M30 200h330M30 600h330" stroke="#e6cfa9"/></svg>',
);
const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROMIUM_PATH || "/usr/local/bin/chromium",
  args: ["--no-sandbox"],
});
const failures = [];
let passed = 0;

async function scenario(name, callback, mode = "ltr") {
  if (process.env.HANAMI_TEST_FILTER && !name.includes(process.env.HANAMI_TEST_FILTER)) return;
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: "block",
  });
  const errors = [];
  try {
    await context.addInitScript((mode) => {
      localStorage.setItem("hanami-reader-settings", JSON.stringify({
        mode, zones: "l", longTap: true, doubleTap: true, transitions: false, wake: false,
      }));
    }, mode);
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base);
    await page.waitForFunction(() => !!window.HanamiReaderPageActions && !!window.HanamiSelectionToolbar);
    await page.evaluate(({ pageImage, mode }) => window.HanamiReader.open({
      title: "Regresión HNM-020", sourceId: "fixture.source",
      mangaId: "fixture-manga", mangaUrl: "/fixture/manga",
      chapter: { url: "/fixture/chapter/1", number: 1, name: "Capítulo 1" },
      pages: [0, 1, 2].map(() => ({ imageUrl: pageImage })),
      resume: { pageIndex: ["webtoon", "continuous"].includes(mode) ? 0 : 1 },
    }), { pageImage, mode });
    await page.waitForFunction(() => [...document.querySelectorAll("#readerViewport figure > img")]
      .some((image) => image.complete && image.naturalWidth));
    await page.waitForTimeout(450);
    const cdp = await context.newCDPSession(page);
    await callback(page, cdp);
    assert.deepEqual(errors, [], "no uncaught browser errors");
    passed++;
    console.log(`PASS: ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(`FAIL: ${name}\n  ${error.message}`);
  } finally {
    await context.close();
  }
}

const state = (page) => page.evaluate(() => {
  const reader = document.querySelector("#reader"), viewport = document.querySelector("#readerViewport");
  return {
    count: document.querySelector("#readerCount").textContent,
    top: viewport.scrollTop, left: viewport.scrollLeft,
    bars: reader.classList.contains("bars-on"),
    zoom: reader.style.getPropertyValue("--zoom"),
  };
});
async function openActions(page) {
  await page.evaluate(() => {
    const figure = document.querySelector("#readerViewport figure");
    assertOpen(window.HanamiReaderPageActions.open({ figure, clientX: 195, clientY: 400 }));
    function assertOpen(result) { if (!result) throw new Error("actions did not open"); }
  });
  await page.waitForFunction(() => window.HanamiScreens.is("reader-page-actions"));
  await page.waitForTimeout(230);
}
async function actionsClosed(page) {
  await page.waitForFunction(() => !document.querySelector("[data-reader-page-actions]")
    && window.HanamiScreens.is("reader"));
  // Detect delayed reader tap callbacks, not just the immediate screen state.
  await page.waitForTimeout(360);
}
async function touch(cdp, type, x = 195, y = 400) {
  await cdp.send("Input.dispatchTouchEvent", {
    type, touchPoints: type === "touchEnd" || type === "touchCancel"
      ? [] : [{ x, y, id: 1 }],
  });
}
async function holdPage(page, cdp) {
  await touch(cdp, "touchStart");
  await page.waitForTimeout(650);
  await touch(cdp, "touchEnd");
  await page.waitForFunction(() => !!document.querySelector("[data-reader-page-actions]"));
  await page.waitForTimeout(240);
}
const labelVisibility = (page) => page.locator('[data-reader-page-action="cover"] > span')
  .evaluate((label) => getComputedStyle(label).visibility);
const labelOpacity = (locator) => locator.evaluate((label) => getComputedStyle(label).opacity);

try {
  await scenario("hidden reader controls cannot hide the opened action bar", async (page, cdp) => {
    await page.touchscreen.tap(195, 422);
    await page.waitForTimeout(560);
    assert.equal((await state(page)).bars, false);
    await holdPage(page, cdp);
    const bottom = await page.locator("#readerBottom").evaluate((node) => ({
      opacity: getComputedStyle(node).opacity,
      top: node.getBoundingClientRect().top,
      bottom: node.getBoundingClientRect().bottom,
    }));
    assert.equal(bottom.opacity, "1", "page actions must be opaque even in bars-off");
    assert(bottom.top < 844 && bottom.bottom <= 845, "page actions must be on screen");
    assert.equal(await page.locator("[data-reader-page-action]").count(), 6);
    assert.equal(await page.locator("[data-reader-navigator]").isHidden(), true);
    assert.equal(await page.locator(".reader-page-actions-overlay,[role=dialog]").count(), 0);
    await page.keyboard.press("Escape");
    await actionsClosed(page);
    assert.equal((await state(page)).bars, false, "restore the previous hidden-controls state");
  });

  await scenario("outside touch closes actions without running a reader tap", async (page) => {
    const before = await state(page);
    await openActions(page);
    await page.touchscreen.tap(350, 422);
    await actionsClosed(page);
    assert.deepEqual(await state(page), before, "dismissal must not turn a page or toggle controls");
    await page.touchscreen.tap(350, 422);
    await page.waitForTimeout(370);
    assert((await state(page)).count.startsWith("3 / 3"), "the following intentional reader tap must work");
  });

  await scenario("labels require a long press, and releasing it cannot execute the action", async (page, cdp) => {
    await openActions(page);
    const cover = page.locator('[data-reader-page-action="cover"]');
    const box = await cover.boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await touch(cdp, "touchStart", x, y);
    await page.waitForTimeout(100);
    assert.equal(await labelVisibility(page), "hidden", "short presses must not reveal labels");
    await touch(cdp, "touchEnd");
    await page.locator("[data-page-cover-confirm]").waitFor();
    await page.locator("[data-page-cover-cancel]").click();
    await touch(cdp, "touchStart", x, y);
    await page.waitForTimeout(620);
    assert.equal(await labelVisibility(page), "visible", "a 500ms hold reveals the label");
    assert.equal(await cover.evaluate((node) => node.classList.contains("show-action-label")), true);
    await touch(cdp, "touchEnd");
    assert.equal(await page.locator("[data-page-cover-confirm]").count(), 0, "long-press release is not an action");
    await page.waitForTimeout(2450);
    assert.equal(await labelVisibility(page), "hidden", "labels dismiss automatically");
    await cover.tap();
    await page.locator("[data-page-cover-confirm]").waitFor();
    await page.locator("[data-page-cover-cancel]").click();
    assert.equal(await page.locator("[data-reader-page-action]").count(), 6);
  });

  await scenario("HNM-018 reader-navigation labels need a 500ms hold and its release does not change settings", async (page, cdp) => {
    const crop = page.locator("[data-r-crop]");
    const label = crop.locator("small");
    const box = await crop.boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const cropEnabled = () => page.locator("#reader").evaluate((node) => node.classList.contains("crop"));
    assert.equal(await labelOpacity(label), "0", "default reader controls must be icon-only");
    await touch(cdp, "touchStart", x, y);
    await page.waitForTimeout(120);
    assert.equal(await labelOpacity(label), "0", "short presses must not reveal reader labels");
    await touch(cdp, "touchEnd");
    await page.waitForTimeout(120);
    assert.equal(await cropEnabled(), true, "a short press keeps the reader action");
    await crop.click();
    await page.waitForTimeout(80);
    assert.equal(await cropEnabled(), false);
    await touch(cdp, "touchStart", x, y);
    await page.waitForTimeout(620);
    assert(Number(await labelOpacity(label)) > .9, "a 500ms hold reveals the reader label");
    assert.equal(await crop.evaluate((node) => node.classList.contains("show-action-label")), true);
    await touch(cdp, "touchEnd");
    await page.waitForTimeout(160);
    assert.equal(await cropEnabled(), false, "releasing a long press cannot alter reader settings");
    await page.waitForTimeout(2450);
    assert.equal(await labelOpacity(label), "0", "reader labels dismiss automatically");
  });

  await scenario("HNM-018 main navigation labels need a 500ms hold and its release does not navigate", async (page, cdp) => {
    await page.evaluate(() => window.HanamiReader.close(true));
    await page.waitForFunction(() => document.querySelector("#reader").classList.contains("hidden"));
    const updates = page.locator('[data-tab="updates"]');
    const updatesLabel = updates.locator("span");
    const updatesBox = await updates.boundingBox();
    const updateX = updatesBox.x + updatesBox.width / 2, updateY = updatesBox.y + updatesBox.height / 2;
    assert.equal(await labelOpacity(updatesLabel), "0", "main navigation must be icon-only by default");
    await touch(cdp, "touchStart", updateX, updateY);
    await page.waitForTimeout(120);
    assert.equal(await labelOpacity(updatesLabel), "0", "short presses must not reveal main-nav labels");
    await touch(cdp, "touchEnd");
    await page.waitForFunction(() => document.body.dataset.root === "updates");
    await page.waitForTimeout(380);
    assert.equal(await labelOpacity(updatesLabel), "0", "tab activation must not re-expose its label");
    const history = page.locator('[data-tab="history"]');
    const historyLabel = history.locator("span");
    const historyBox = await history.boundingBox();
    const historyX = historyBox.x + historyBox.width / 2, historyY = historyBox.y + historyBox.height / 2;
    await touch(cdp, "touchStart", historyX, historyY);
    await page.waitForTimeout(620);
    assert(Number(await labelOpacity(historyLabel)) > .9, "a 500ms hold reveals the main-nav label");
    assert.equal(await history.evaluate((node) => node.classList.contains("show-action-label")), true);
    await touch(cdp, "touchEnd");
    await page.waitForTimeout(160);
    assert.equal(await page.evaluate(() => document.body.dataset.root), "updates", "releasing a long press cannot navigate");
    await page.waitForTimeout(2450);
    assert.equal(await labelOpacity(historyLabel), "0", "main-nav labels dismiss automatically");
  });

  if (process.env.HANAMI_HNM020_BASELINE !== "1") {
    for (const [name, x, y] of [
      ["left", 30, 422], ["top", 195, 160], ["bottom", 195, 650], ["center", 195, 422],
    ]) {
      await scenario(`outside ${name} zone only dismisses the action bar`, async (page) => {
        const before = await state(page);
        await openActions(page);
        await page.touchscreen.tap(x, y);
        await actionsClosed(page);
        assert.deepEqual(await state(page), before);
      });
    }
    for (const mode of ["ltr", "rtl", "vertical"]) {
      await scenario(`${mode} swipes and pinches are suspended while actions are open`, async (page, cdp) => {
        const before = await state(page);
        await openActions(page);
        await touch(cdp, "touchStart", 300, 550);
        await touch(cdp, "touchMove", mode === "vertical" ? 300 : 80, mode === "vertical" ? 260 : 550);
        await touch(cdp, "touchEnd");
        await page.waitForTimeout(360);
        assert.deepEqual(await state(page), before);
        assert.equal(await page.locator("[data-reader-page-actions]").count(), 1);
        await page.mouse.move(300, 600);
        await page.mouse.down();
        await page.mouse.move(mode === "vertical" ? 300 : 80, mode === "vertical" ? 250 : 600, { steps: 5 });
        await page.mouse.up();
        await page.waitForTimeout(360);
        assert.deepEqual(await state(page), before, "pointer swipes must not run the reader handlers");
        // A mouse drag may emit an outside click and dismiss the bar, but that
        // click must still leave the page, zoom and reader controls untouched.
        if (!(await page.locator("[data-reader-page-actions]").count())) await openActions(page);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart", touchPoints: [{ x: 140, y: 350, id: 1 }, { x: 240, y: 450, id: 2 }],
        });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove", touchPoints: [{ x: 80, y: 280, id: 1 }, { x: 310, y: 550, id: 2 }],
        });
        await touch(cdp, "touchEnd");
        assert.deepEqual(await state(page), before);
        await page.keyboard.press("Escape");
        await actionsClosed(page);
        const start = mode === "vertical" ? [195, 600] : [300, 422];
        const finish = mode === "vertical" ? [195, 250] : [80, 422];
        await page.mouse.move(...start);
        await page.mouse.down();
        await page.mouse.move(...finish, { steps: 5 });
        await page.mouse.up();
        await page.waitForTimeout(360);
        assert.notEqual((await state(page)).count, before.count, "normal pointer swipes resume after closing");
      }, mode);
    }
    for (const mode of ["webtoon", "continuous"]) {
      await scenario(`${mode} does not scroll beneath the action bar`, async (page, cdp) => {
        await page.locator("#readerViewport").evaluate((node) => { node.scrollTop = 350; });
        await page.waitForTimeout(150);
        const before = await state(page);
        await openActions(page);
        await touch(cdp, "touchStart", 195, 620);
        await touch(cdp, "touchMove", 195, 250);
        await touch(cdp, "touchEnd");
        await page.mouse.move(195, 400);
        await page.mouse.wheel(0, 450);
        await page.waitForTimeout(350);
        assert.deepEqual(await state(page), before);
        assert.equal(await page.locator("[data-reader-page-actions]").count(), 1);
        await page.keyboard.press("Escape");
        await actionsClosed(page);
        await page.mouse.wheel(0, 450);
        await page.waitForTimeout(250);
        assert((await state(page)).top > before.top, "normal scrolling resumes after closing");
      }, mode);
    }
    await scenario("opening actions cancels already pending reader tap timers", async (page) => {
      const before = await state(page);
      await page.mouse.click(350, 422);
      await page.evaluate(() => window.HanamiReaderPageActions.open({
        figure: document.querySelector("#readerViewport figure"), clientX: 195, clientY: 400,
      }));
      await page.keyboard.press("Escape");
      await actionsClosed(page);
      assert.deepEqual(await state(page), before);
    });
    await scenario("outside reader controls dismiss actions without also executing", async (page) => {
      await openActions(page);
      await page.locator("[data-r-close]").click();
      await actionsClosed(page);
      assert.equal(await page.locator("#reader").isVisible(), true);
      await page.locator("[data-r-close]").click();
      await page.waitForFunction(() => document.querySelector("#reader").classList.contains("hidden"));
    });
    await scenario("keyboard focus outside actions cannot navigate or close the reader", async (page) => {
      const before = await state(page);
      await openActions(page);
      await page.locator("#readerViewport").focus();
      for (const key of ["PageDown", "ArrowRight", " ", "PageUp", "ArrowLeft", "ContextMenu"]) {
        await page.keyboard.press(key);
      }
      await page.waitForTimeout(350);
      assert.deepEqual(await state(page), before);
      assert.equal(await page.locator("[data-reader-page-actions]").count(), 1);
      await page.keyboard.press("Escape");
      await actionsClosed(page);
      assert.equal(await page.locator("#reader").isVisible(), true);
    });
    await scenario("Back/Forward restores the same inline actions and hidden-control state", async (page, cdp) => {
      await page.touchscreen.tap(195, 422);
      await page.waitForTimeout(560);
      const before = await state(page);
      await holdPage(page, cdp);
      await page.goBack();
      await actionsClosed(page);
      assert.deepEqual(await state(page), before);
      await page.goForward();
      await page.waitForFunction(() => !!document.querySelector("[data-reader-page-actions]"));
      await page.waitForTimeout(250);
      assert.equal(await page.locator("#readerBottom").evaluate((node) => getComputedStyle(node).opacity), "1");
      await page.keyboard.press("Escape");
      await actionsClosed(page);
      assert.deepEqual(await state(page), before);
      await openActions(page);
      await page.locator('[data-reader-page-action="cover"]').focus();
      await page.keyboard.press(" ");
      await page.locator("[data-page-cover-confirm]").waitFor();
    });
    await scenario("moving or cancelling a press does not strand label suppression", async (page, cdp) => {
      await openActions(page);
      const cover = page.locator('[data-reader-page-action="cover"]');
      const box = await cover.boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await touch(cdp, "touchStart", x, y);
      await touch(cdp, "touchMove", x + 20, y);
      await page.waitForTimeout(600);
      assert.equal(await labelVisibility(page), "hidden");
      await touch(cdp, "touchCancel");
      await touch(cdp, "touchStart", x, y);
      await page.waitForTimeout(600);
      assert.equal(await labelVisibility(page), "visible");
      await touch(cdp, "touchCancel");
      await cover.tap();
      await page.locator("[data-page-cover-confirm]").waitFor();
      await page.locator("[data-page-cover-cancel]").click();
      // A new intentional hold works after cancelling a previous gesture.
      await touch(cdp, "touchStart", x, y);
      await page.keyboard.press("Escape");
      await touch(cdp, "touchCancel");
      await actionsClosed(page);
      await page.waitForTimeout(600);
      assert.equal(await page.locator(".show-action-label").count(), 0);
    });
    await scenario("the shared selection toolbar keeps its long-label/short-action behavior", async (page) => {
      await page.evaluate(() => {
        window.HanamiReader.close(true);
        const nav = document.createElement("nav");
        nav.className = "selection-bottombar";
        nav.innerHTML = '<button type="button" aria-label="Prueba compartida"><small>Prueba compartida</small></button>';
        nav.style.cssText = "z-index:1000";
        document.body.append(nav);
        window.__selectionClicks = 0;
        nav.addEventListener("click", () => { window.__selectionClicks++; });
      });
      const button = page.locator(".selection-bottombar button");
      const box = await button.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(600);
      assert.equal(await button.evaluate((node) => node.classList.contains("show-action-label")), true);
      await page.mouse.up();
      assert.equal(await page.evaluate(() => window.__selectionClicks), 0);
      await button.click();
      assert.equal(await page.evaluate(() => window.__selectionClicks), 1);
    });
  }
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
console.log(`HNM-020: ${passed} passed, ${failures.length} failed.`);
if (failures.length) process.exitCode = 1;