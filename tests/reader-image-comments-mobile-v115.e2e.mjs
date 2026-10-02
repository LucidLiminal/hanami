import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.goto("http://127.0.0.1:4173/");
await page.evaluate(() => {
  const image =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="390" height="900"><rect width="390" height="900" fill="#201326"/><circle cx="195" cy="420" r="90" fill="#9a49d8"/></svg>',
    );
  window.HanamiReader.open({
    title: "Prueba v115",
    sourceId: "hanami.test",
    mangaUrl: "/manga/prueba",
    chapter: { url: "/chapter/1", number: 1, name: "Capítulo 1" },
    pages: [{ imageUrl: image }],
  });
});
const image = page.locator("#readerViewport figure img").first();
await image.waitFor({ state: "visible" });
await page.waitForFunction(() => {
  const image = document.querySelector("#readerViewport figure img");
  return image?.complete && image.naturalWidth > 0;
});
await page.waitForTimeout(150);
const box = await image.boundingBox();
assert(box);
await page.mouse.move(box.x + box.width * 0.45, box.y + 240);
await page.mouse.down();
await page.locator("[data-reader-page-actions]").waitFor({ state: "visible" });
await page.mouse.up();
await page.locator('[data-reader-page-action="comment"]').click();
await page.locator(".reader-comment-editor").waitFor({ state: "visible" });
await page.locator("[data-comment-text]").fill("Mira este detalle");
await page.locator("[data-comment-save]").click();
await page.waitForTimeout(250);
assert.equal(await page.locator(".reader-comment").count(), 1);
assert.equal(
  await page.locator(".reader-comment-body > span").innerText(),
  "Mira este detalle",
);
const card = page.locator(".reader-comment").first();
const before = await card.boundingBox();
await page.mouse.move(before.x + 35, before.y + 35);
await page.mouse.down();
await page.mouse.move(before.x + 75, before.y + 70, { steps: 4 });
await page.mouse.up();
const after = await card.boundingBox();
assert(after.x > before.x);
assert(after.y > before.y);
assert.deepEqual(errors, []);
await browser.close();
console.log(
  "PASS: mobile 390x844 long press creates and moves an image comment",
);