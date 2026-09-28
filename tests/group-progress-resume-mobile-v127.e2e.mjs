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
  serviceWorkers: "block",
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
await page.route("**/api/sources", async (route) => {
  await delay(400);
  route.fulfill({
    contentType: "application/json",
    body: JSON.stringify([
      { id: "hanami.es.olympus", name: "Olympus", lang: "es", version: "1.0.0", runtime: "vercel-js", status: "ready" },
    ]),
  });
});
await page.route("**/api/extensions", async (route) => {
  await delay(400);
  route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [], total: 0 }) });
});
// Detalles y capítulos lentos para reproducir la ventana real de carga.
await page.route("**/api/source/hanami.es.olympus/details", async (route) => {
  await delay(700);
  route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      title: "Ciudad después de medianoche",
      url: "/series/ciudad-medianoche",
      thumbnailUrl: "/assets/fallen.webp",
      author: "Luna",
      description: "Una recomendación compartida para leer de noche.",
      genre: ["Drama"],
      status: "ongoing",
    }),
  });
});
await page.route("**/api/source/hanami.es.olympus/chapters", async (route) => {
  await delay(700);
  route.fulfill({
    contentType: "application/json",
    body: JSON.stringify([
      { url: "/chapter/3", name: "Capítulo 3", number: 3, dateUpload: Date.now() },
      { url: "/chapter/2", name: "Capítulo 2", number: 2, dateUpload: Date.now() - 86400000 },
      { url: "/chapter/1", name: "Capítulo 1", number: 1, dateUpload: Date.now() - 172800000 },
    ]),
  });
});
const makePage = (color, label) =>
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="1100"><rect width="390" height="1100" fill="${color}"/><text x="195" y="550" text-anchor="middle" fill="white" font-size="64">${label}</text></svg>`,
  );
await page.route("**/api/source/hanami.es.olympus/pages", (route) =>
  route.fulfill({
    contentType: "application/json",
    body: JSON.stringify([1, 2, 3, 4, 5].map((i) => ({ imageUrl: makePage("#201326", "P" + i) }))),
  }),
);

await page.addInitScript(() => {
  localStorage.setItem(
    "hanami-reading-groups-v1",
    JSON.stringify([
      { id: "g1", name: "Sala de prueba", inviteCode: "TESTCODE1", ownerId: "u1", members: [{ id: "u1", name: "Tú", initials: "TÚ" }], cover: "/assets/reading-room-bedroom.webp", quote: "Prueba.", createdAt: Date.now(), updatedAt: Date.now() },
    ]),
  );
  localStorage.setItem("hanami-reading-profile-v1", JSON.stringify({ id: "u1", name: "Tú", initials: "TÚ", createdAt: Date.now() }));
  localStorage.setItem("hanami-active-reading-group", "g1");
  localStorage.setItem(
    "hanami-group-libraries-v1",
    JSON.stringify({
      g1: [
        { id: "e1", groupId: "g1", sourceId: "hanami.es.olympus", mangaUrl: "/series/ciudad-medianoche", title: "Ciudad después de medianoche", thumbnailUrl: "/assets/fallen.webp", recommendedByName: "Luna", recommendation: "Leámosla juntos.", remote: false, syncState: "pending" },
      ],
    }),
  );
});

await page.goto("http://127.0.0.1:4173/");
await page.waitForFunction(() => document.documentElement.dataset.hanamiReady === "true");
await page.waitForTimeout(900);

const openGroupDetail = async () => {
  await page.evaluate(() => document.querySelector('[data-library-room="g1"]')?.click());
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('[data-library-group-entry="e1"]')?.click());
  await page.waitForSelector("#libraryRoot [data-md-resume]", { state: "attached" });
  await page.waitForTimeout(300);
};
const readerState = () =>
  page.evaluate(() => ({
    count: document.querySelector("#readerCount")?.textContent || "",
    chapter: document.querySelector("#readerChapter")?.textContent || "",
    progress: JSON.parse(localStorage.getItem("hanami-group-progress-v1") || "null"),
  }));
const shelfState = () =>
  page.evaluate(() => ({
    screen: HanamiScreens.current()?.type,
    detail: !!document.querySelector("#libraryRoot .mihon-detail"),
    shelf: !!document.querySelector("#libraryRoot .library-group-shelf"),
    resume: document.querySelector("[data-md-resume]")?.textContent || null,
  }));

// 1) Leer el capítulo 1 hasta la página 3 guarda el progreso del grupo.
await openGroupDetail();
assert.equal((await shelfState()).resume, "▶ Empezar");
await page.evaluate(() => [...document.querySelectorAll(".md-chapter")].at(-1)?.click());
await page.waitForSelector("#reader:not(.hidden)", { state: "attached" });
await page.waitForTimeout(1300);
await page.evaluate(() => {
  const slider = document.querySelector("#readerSlider");
  slider.value = 3;
  slider.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(1000);
let current = await readerState();
assert.match(current.count, /^3 \/ 5/);
const saved = current.progress?.["g1|e1|u1"];
assert(saved, "el progreso del grupo debe guardarse");
assert.equal(saved.chapterUrl, "/chapter/1");
assert.equal(saved.pageIndex, 2);
assert.equal(saved.completed, false);

// 2) Al volver, la ficha ofrece «Reanudar» y vuelve a la página guardada.
await page.evaluate(() => document.querySelector("[data-r-close]")?.click());
await page.waitForTimeout(1400);
let shelf = await shelfState();
assert.equal(shelf.screen, "group-manga-detail");
assert.equal(shelf.detail, true);
assert.equal(shelf.resume, "▶ Reanudar");
await page.evaluate(() => document.querySelector("[data-md-resume]")?.click());
await page.waitForSelector("#reader:not(.hidden)", { state: "attached" });
await page.waitForTimeout(1600);
current = await readerState();
assert.match(current.count, /^3 \/ 5 · Capítulo 1/, "debe reanudar en la página 3 del capítulo 1");

// 3) Completar el capítulo 1 hace que «Reanudar» abra el capítulo 2.
await page.evaluate(() => {
  const viewport = document.querySelector("#readerViewport");
  const chapter = viewport.querySelector('[data-reader-chapter="0"]');
  viewport.scrollTop =
    chapter.offsetTop + chapter.offsetHeight - viewport.clientHeight + 32;
});
await page.waitForTimeout(1200);
current = await readerState();
assert.equal(current.progress?.["g1|e1|u1"]?.completed, true, "el capítulo debe quedar completado");
await page.evaluate(() => document.querySelector("[data-r-close]")?.click());
await page.waitForTimeout(1400);
await page.evaluate(() => document.querySelector("[data-md-resume]")?.click());
await page.waitForSelector("#reader:not(.hidden)", { state: "attached" });
await page.waitForTimeout(1600);
current = await readerState();
assert.match(current.count, /Capítulo 2/, "tras completar el 1 debe continuar por el 2");
await page.evaluate(() => document.querySelector("[data-r-close]")?.click());
await page.waitForTimeout(1400);

// 4) Atrás desde la ficha vuelve a la estantería.
shelf = await shelfState();
assert.equal(shelf.screen, "group-manga-detail");
await page.evaluate(() => document.querySelector("[data-md-back]")?.click());
await page.waitForTimeout(800);
shelf = await shelfState();
assert.equal(shelf.screen, "root");
assert.equal(shelf.shelf, true);
assert.equal(shelf.detail, false);

// 5) Atrás durante la carga: la ficha NO se monta tarde sobre la estantería.
await page.evaluate(() => document.querySelector('[data-library-group-entry="e1"]')?.click());
await page.waitForSelector("#libraryRoot .group-mihon-loading", { state: "attached" });
await page.evaluate(() => document.querySelector("[data-group-mihon-back]")?.click());
await page.waitForTimeout(300);
shelf = await shelfState();
assert.equal(shelf.screen, "root");
assert.equal(shelf.shelf, true);
await page.waitForTimeout(1300); // la fuente responde tarde
shelf = await shelfState();
assert.equal(shelf.screen, "root");
assert.equal(shelf.detail, false, "la ficha no debe reaparecer tras pulsar atrás");
assert.equal(shelf.shelf, true);

assert.deepEqual(errors, []);
await page.screenshot({ path: "/data/hanami-v127-group-progress-mobile.png", fullPage: true });
await browser.close();
console.log(
  "PASS: mobile 390x844 resumes group reading at the saved page, continues with the next chapter, and back during load never leaves a ghost detail",
);
