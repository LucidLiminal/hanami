import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/usr/local/bin/chromium",
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
  const makePage = (color, label) =>
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="1100"><rect width="390" height="1100" fill="${color}"/><text x="195" y="550" text-anchor="middle" fill="white" font-size="64">${label}</text></svg>`,
    );
  window.HanamiReader.open({
    title: "Prueba v126",
    sourceId: "hanami.test",
    mangaUrl: "/manga/prueba-v126",
    chapter: { url: "/chapter/126", number: 126, name: "Capítulo 126" },
    pages: [
      { imageUrl: makePage("#201326", "1") },
      { imageUrl: makePage("#302040", "2") },
      { imageUrl: makePage("#49305e", "3") },
    ],
  });
});

const target = page.locator('#readerViewport figure[data-page="2"] img');
await target.scrollIntoViewIfNeeded();
await target.waitFor({ state: "visible" });
await page.waitForTimeout(400);
const before = await page.evaluate(() => ({
  scrollTop: document.querySelector("#readerViewport").scrollTop,
  count: document.querySelector("#readerCount").textContent,
}));
assert.match(before.count, /^3 \/ 3/);

const box = await target.boundingBox();
assert(box);
await page.mouse.move(box.x + box.width * 0.45, box.y + 240);
await page.mouse.down();
await page.waitForTimeout(620);
await page.mouse.up();
await page.locator(".reader-comment-editor").waitFor({ state: "visible" });
await page.locator("[data-comment-text]").fill("La posición no debe cambiar");
await page.locator("[data-comment-save]").click();
await page.locator(".reader-comment-editor").waitFor({ state: "hidden" });
await page.waitForTimeout(250);

const after = await page.evaluate(() => ({
  scrollTop: document.querySelector("#readerViewport").scrollTop,
  count: document.querySelector("#readerCount").textContent,
  comments: document.querySelectorAll(".reader-comment").length,
}));
assert.equal(after.count, before.count);
assert(Math.abs(after.scrollTop - before.scrollTop) < 3);
assert.equal(after.comments, 1);
assert.deepEqual(errors, []);

await browser.close();
console.log(
  "PASS: mobile 390x844 keeps page and scroll after publishing a comment",
);