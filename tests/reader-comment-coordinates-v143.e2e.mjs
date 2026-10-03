import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.HANAMI_TEST_URL || "http://127.0.0.1:4179";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="780" height="1400"><rect width="780" height="1400" fill="#2f1434"/><path d="M0 0h780v1400H0z" fill="none" stroke="#a84de5" stroke-width="24"/><circle cx="430" cy="920" r="170" fill="#e6cfa9"/></svg>`;
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
let imageDelay = 25;
await context.route("**/comment-coordinate-fixture.svg", async (route) => {
  await new Promise((resolve) => setTimeout(resolve, imageDelay));
  await route.fulfill({ contentType: "image/svg+xml", body: svg });
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

function readerPayload() {
  return {
    title: "Coordenadas v143",
    sourceId: "hanami.test",
    mangaUrl: "/manga/comment-coordinates-v143",
    chapter: { url: "/chapter/comment-coordinates-v143", number: 142, name: "Capítulo 142" },
    pages: [{ imageUrl: "/comment-coordinate-fixture.svg" }],
  };
}
async function openReader() {
  await page.evaluate((payload) => window.HanamiReader.open(payload), readerPayload());
  const image = page.locator('#readerViewport figure[data-page="0"] > img');
  await image.waitFor({ state: "visible" });
  return image;
}
async function waitForLoaded(image) {
  await page.waitForFunction(() => {
    const node = document.querySelector('#readerViewport figure[data-page="0"] > img');
    const rect = node?.getBoundingClientRect();
    return !!node?.complete && node.naturalWidth > 0 && !!rect?.height;
  });
  await image.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function geometry() {
  return page.evaluate(() => {
    const figure = document.querySelector('#readerViewport figure[data-page="0"]');
    const image = figure?.querySelector("img");
    const card = figure?.querySelector(".reader-comment");
    const context = JSON.parse(figure?.dataset.commentContext || "{}");
    const comment = window.HanamiReaderComments.list(context)[0];
    const figureRect = figure?.getBoundingClientRect();
    const imageRect = image?.getBoundingClientRect();
    const actualX = Number.parseFloat(card?.style.left || "");
    const actualY = Number.parseFloat(card?.style.top || "");
    return {
      actualX,
      actualY,
      expectedX: imageRect.left - figureRect.left + comment.x * imageRect.width,
      expectedY: imageRect.top - figureRect.top + comment.y * imageRect.height,
      x: comment.x,
      y: comment.y,
      image: { width: imageRect.width, height: imageRect.height },
    };
  });
}

try {
  await page.goto(base);
  await page.waitForFunction(
    () =>
      !!window.HanamiReader &&
      !!window.HanamiReaderComments &&
      !!window.HanamiReaderPageActions,
  );
  await page.evaluate(() => window.HanamiReaderComments.ready);
  const initialImage = await openReader();
  await waitForLoaded(initialImage);
  const box = await initialImage.boundingBox();
  assert(box, "reader image is visible");
  assert.equal(
    await page.evaluate(() => {
      const figure = document.querySelector('#readerViewport figure[data-page="0"]');
      const image = figure?.querySelector("img");
      const rect = image?.getBoundingClientRect();
      return window.HanamiReaderPageActions.open({
        figure,
        clientX: rect.left + rect.width * 0.57,
        clientY: rect.top + rect.height * 0.63,
        reader: {
          title: "Coordenadas v143",
          sourceId: "hanami.test",
          mangaUrl: "/manga/comment-coordinates-v143",
        },
      });
    }),
    true,
  );
  await page.locator("[data-reader-page-actions]").waitFor({ state: "visible" });
  await page.locator('[data-reader-page-action="comment"]').click();
  await page.locator(".reader-comment-editor").waitFor({ state: "visible" });
  await page.locator("[data-comment-text]").fill("Debe conservar su ancla tras recargar");
  await page.locator("[data-comment-save]").click();
  await page.locator(".reader-comment").waitFor({ state: "visible" });
  const initial = await geometry();
  assert(Math.abs(initial.actualY - initial.expectedY) < 2, `initial comment geometry: ${JSON.stringify(initial)}`);
  const card = page.locator(".reader-comment");
  const cardBox = await card.boundingBox();
  assert(cardBox, "comment card is visible before it is repositioned");
  await page.mouse.move(cardBox.x + 34, cardBox.y + 34);
  await page.mouse.down();
  await page.mouse.move(cardBox.x + 76, cardBox.y - 46, { steps: 6 });
  await page.mouse.up();
  await page.waitForFunction((beforeY) => {
    const figure = document.querySelector('#readerViewport figure[data-page="0"]');
    const context = JSON.parse(figure?.dataset.commentContext || "{}");
    return window.HanamiReaderComments.list(context)[0]?.y < beforeY - 0.05;
  }, initial.y);
  const before = await geometry();
  assert(Math.abs(before.actualY - before.expectedY) < 2, `moved comment geometry: ${JSON.stringify(before)}`);
  await page.waitForTimeout(180);

  imageDelay = 850;
  await page.reload();
  await page.waitForFunction(
    () =>
      !!window.HanamiReader &&
      !!window.HanamiReaderComments &&
      !!window.HanamiReaderPageActions,
  );
  await page.evaluate(() => window.HanamiReaderComments.ready);
  const restoredImage = await openReader();
  await page.locator(".reader-comment").waitFor({ state: "attached" });
  await waitForLoaded(restoredImage);
  await page.waitForTimeout(120);
  const restored = await geometry();
  assert(Number.isFinite(restored.actualY), `restored comment needs a Y coordinate: ${JSON.stringify(restored)}`);
  assert(Math.abs(restored.actualX - restored.expectedX) < 2, `restored X anchor: ${JSON.stringify(restored)}`);
  assert(Math.abs(restored.actualY - restored.expectedY) < 2, `restored Y anchor: ${JSON.stringify(restored)}`);
  assert.deepEqual(errors, []);
  console.log("PASS: comment coordinates are recalculated after a delayed image reload");
} finally {
  await browser.close();
}
