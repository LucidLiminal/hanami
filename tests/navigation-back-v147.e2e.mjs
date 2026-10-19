import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// Real app DOM and history; fixture API only. Never contacts external services.
const publicRoot =
  process.env.HANAMI_PUBLIC_ROOT ||
  fileURLToPath(new URL("../public/", import.meta.url));
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, "http://localhost");
    const name = path.resolve(
      publicRoot,
      "." + (path.extname(u.pathname) ? u.pathname : "/index.html"),
    );
    if (!name.startsWith(path.resolve(publicRoot) + path.sep))
      throw new Error("Invalid path");
    res.writeHead(200, {
      "content-type": mime[path.extname(name)] || "application/octet-stream",
    });
    res.end(await fs.readFile(name));
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/usr/local/bin/chromium",
  args: ["--no-sandbox"],
});
const manga = {
  id: "m1",
  title: "Obra de navegación",
  url: "/work",
  sourceId: "s1",
  thumbnailUrl: "/assets/fallen.webp",
  favorite: true,
  categories: ["default"],
  categoryIds: ["default"],
  totalChapters: 1,
  _chapters: [{ id: "c1", url: "/chapter-1", name: "Capítulo 1", number: 1 }],
};
const failures = [];
async function setup(viewport) {
  const context = await browser.newContext({
    viewport,
    hasTouch: viewport.width < 600,
    isMobile: viewport.width < 600,
    serviceWorkers: "block",
  });
  const errors = [];
  let delay = 0,
    failDetails = false;
  const operationDelays = {};
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    const p = url.pathname;
    if (!p.startsWith("/api/")) return route.continue();
    const operation = p.split("/").at(-1);
    if (operationDelays[operation])
      await new Promise((r) => setTimeout(r, operationDelays[operation]));
    let json = { items: [], mangas: [], total: 0 };
    if (p === "/api/social-config") json = { enabled: false };
    if (p === "/api/sources")
      json = [
        {
          id: "s1",
          name: "Fuente prueba",
          lang: "es",
          baseUrl: "https://fixture.test",
          runtime: "vercel-js",
          status: "ready",
        },
      ];
    if (p === "/api/extensions")
      json = {
        items: [
          {
            id: "s1",
            name: "Fuente prueba",
            lang: "es",
            version: "1.0.0",
            runtime: "vercel-js",
            sourceIds: ["s1"],
          },
        ],
      };
    if (/\/(popular|latest|search)$/.test(p)) json = { mangas: [manga] };
    if (p.endsWith("/details")) {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      if (failDetails)
        return route.fulfill({
          status: 502,
          json: { error: "Fixture delayed error" },
        });
      json = { ...manga, description: "Ficha de prueba", genre: ["Acción"] };
    }
    if (p.endsWith("/chapters")) json = manga._chapters;
    if (p.endsWith("/pages"))
      json = [{ imageUrl: base + "/assets/fallen.webp" }];
    return route.fulfill({ json });
  });
  await context.addInitScript((m) => {
    if (
      window.top !== window ||
      localStorage.getItem("navigation-fixture-seeded")
    )
      return;
    localStorage.setItem("navigation-fixture-seeded", "true");
    localStorage.setItem("hanami-reduce-motion", "true");
    localStorage.setItem("hanami-library-room-scope-v1", "personal");
    localStorage.setItem(
      "hanami-reading-profile-v1",
      JSON.stringify({ id: "fixture-reader", name: "Pruebas", initials: "P" }),
    );
    localStorage.setItem("hanami-install-seeded", "true");
    localStorage.setItem("hanami-installed-sources", JSON.stringify(["s1"]));
    localStorage.setItem("hanami-library", JSON.stringify([m]));
    localStorage.setItem(
      "hanami-reading-groups-v1",
      JSON.stringify([
        {
          id: "g1",
          name: "Sala de navegación",
          ownerId: "fixture-reader",
          cover: "/assets/fallen.webp",
          quote: "Pruebas",
          members: [{ id: "fixture-reader", name: "Pruebas", initials: "P" }],
        },
      ]),
    );
    localStorage.setItem(
      "hanami-group-libraries-v1",
      JSON.stringify({
        g1: [
          {
            id: "e1",
            title: m.title,
            sourceId: m.sourceId,
            mangaUrl: m.url,
            thumbnailUrl: m.thumbnailUrl,
          },
        ],
      }),
    );
  }, manga);
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/library");
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.hanamiReady === "true" &&
      window.HanamiLibraryGroups,
  );
  await page.evaluate(async () => {
    await Promise.all([
      window.HanamiSocialSync?.ready,
      window.HanamiReaderComments?.ready,
      window.HanamiChapterIdentity?.ready,
    ]);
    window.HanamiLibraryGroups.activate("personal");
  });
  await page
    .locator('[data-lib-id="m1"]')
    .waitFor({ timeout: 5000 })
    .catch(async (e) => {
      console.log(
        "SETUP",
        JSON.stringify({
          state: await state(page),
          storage: await page.evaluate(() => ({
            library: localStorage.getItem("hanami-library"),
            scope: localStorage.getItem("hanami-library-room-scope-v1"),
            text: document
              .querySelector("#libraryRoot")
              .innerText.slice(0, 1100),
          })),
          errors,
        }),
      );
      throw e;
    });
  return {
    context,
    page,
    errors,
    slow(ms, fail = false, operation = "details") {
      if (operation === "details") {
        delay = ms;
        failDetails = fail;
      } else operationDelays[operation] = ms;
    },
  };
}
async function state(page) {
  return page.evaluate(() => ({
    screen: HanamiScreens.current(),
    root: document.body.dataset.root,
    details: [...document.querySelectorAll(".mihon-detail")].filter((n) =>
      n.checkVisibility(),
    ).length,
    reader: document.querySelector("#reader").checkVisibility(),
    child: document.body.classList.contains("nav-child"),
    overlays: HanamiOverlays.count(),
  }));
}
async function settled(page, type) {
  await page.waitForFunction((t) => HanamiScreens.current()?.type === t, type, {
    timeout: 3000,
  });
  await page.waitForTimeout(180);
}
async function openLibrary(page) {
  await page.locator('[data-lib-id="m1"]').click();
  await page.locator("#libraryRoot [data-md-back]").waitFor();
}
async function openSource(page) {
  await page.locator('[data-tab="explore"]').click();
  await page.locator('[data-open-source="s1"]').first().click();
  await page.locator('[data-manga="0"]').click();
  await page.locator("#browseResults [data-md-back]").waitFor();
}
async function expectLibrary(page) {
  await settled(page, "root");
  const s = await state(page);
  assert.equal(s.root, "library");
  assert.equal(s.details, 0, JSON.stringify(s));
  assert.equal(s.reader, false, JSON.stringify(s));
  await page.locator('[data-lib-id="m1"]').waitFor({ timeout: 1000 });
}
const scenarios = {
  "group delayed rejection after Back": async ({ page, slow }) => {
    slow(450, true);
    await page.evaluate(() => {
      HanamiLibraryGroups.activate("g1");
      HanamiAppOpenGroupManga("g1", HanamiGroupLibrary.entries("g1")[0]);
    });
    await page.locator("[data-group-mihon-back]").click();
    await settled(page, "root");
    await page.waitForTimeout(650);
    assert.equal((await state(page)).details, 0);
    assert.equal((await state(page)).screen.type, "root");
  },
  "group delayed pages after Back": async ({ page, slow }) => {
    await page.evaluate(() => {
      HanamiLibraryGroups.activate("g1");
      HanamiAppOpenGroupManga("g1", HanamiGroupLibrary.entries("g1")[0]);
    });
    await page.locator("[data-md-back]").waitFor();
    slow(500, false, "pages");
    await page.locator('[data-md-chapter="0"]').click();
    await page.locator("[data-md-back]").click();
    await settled(page, "root");
    await page.waitForTimeout(750);
    assert.equal((await state(page)).reader, false);
    assert.equal((await state(page)).details, 0);
    assert.equal((await state(page)).screen.type, "root");
  },
  "group reader reload -> detail -> group library": async ({ page }) => {
    await page.evaluate(() => {
      HanamiLibraryGroups.activate("g1");
      HanamiAppOpenGroupManga("g1", HanamiGroupLibrary.entries("g1")[0]);
    });
    await page.locator('[data-md-chapter="0"]').click();
    await page.locator("#reader").waitFor();
    await page.reload();
    await page.locator("#reader").waitFor();
    await page.locator("[data-r-close]").click();
    await settled(page, "group-manga-detail");
    assert.equal((await state(page)).reader, false);
    await page.locator("[data-md-back]").click();
    await settled(page, "root");
    assert.equal((await state(page)).details, 0);
  },

  "source search context survives Back": async ({ page }) => {
    await page.locator('[data-tab="explore"]').click();
    await page.locator('[data-open-source="s1"]').first().click();
    await page.locator('[data-manga="0"]').waitFor();
    await page.locator("#sourceQuery").fill("Consulta conservada");
    await page.locator("#sourceQuery").press("Enter");
    await page.waitForFunction(
      () => HanamiScreens.current().data.query === "Consulta conservada",
    );
    await page.locator('[data-manga="0"]').click();
    await page.locator("[data-md-back]").waitFor();
    await page.locator("[data-md-back]").click();
    await settled(page, "source");
    assert.equal(
      await page.locator("#sourceQuery").inputValue(),
      "Consulta conservada",
    );
    assert.equal((await state(page)).screen.data.mode, "search");
    assert.equal((await state(page)).details, 0);
  },
  "Back during slow source rehydration": async ({ page, slow }) => {
    await openSource(page);
    slow(500, false, "popular");
    await page.reload();
    await page.locator("#browser:not(.hidden)").waitFor();
    await page.goBack();
    await settled(page, "source");
    await page.waitForTimeout(850);
    assert.equal((await state(page)).screen.type, "source");
    assert.equal((await state(page)).details, 0);
    await page.locator('[data-manga="0"]').waitFor();
  },
  "jump Back closes music child tool": async ({ page }) => {
    await openLibrary(page);
    await page.locator('[data-md-chapter="0"]').click();
    await page.locator("#reader").waitFor();
    await page.locator("[data-r-music]").click();
    await settled(page, "reader-music");
    await page.locator('[data-player-tool="queue"]').click();
    await settled(page, "reader-player-tool");
    await page.evaluate(() => history.go(-4));
    await expectLibrary(page);
    assert.equal(
      await page
        .locator("#readerSheet")
        .evaluate((n) => n.classList.contains("hidden")),
      true,
    );
  },

  "toolbar Back while menu closes": async ({ page }) => {
    await openLibrary(page);
    await page.locator("[data-md-more]").click();
    await page.waitForFunction(() => HanamiOverlays.count() === 1);
    await page.locator("[data-md-back]").click();
    await page.waitForTimeout(200);
    assert.equal((await state(page)).screen.type, "library-detail");
    assert.equal((await state(page)).details, 1);
    assert.equal((await state(page)).overlays, 0);
    await page.locator("[data-md-back]").click();
    await expectLibrary(page);
  },

  "source detail -> Back": async ({ page }) => {
    await openSource(page);
    await page.locator("#browseResults [data-md-back]").click();
    await settled(page, "source");
    assert.equal((await state(page)).details, 0);
    await page.locator('[data-manga="0"]').waitFor();
  },
  "source refresh -> Back": async ({ page }) => {
    await openSource(page);
    await page.locator("[data-md-more]").click();
    await page.locator("[data-md-refresh]").click();
    await page.locator("[data-md-back]").waitFor();
    await page.waitForTimeout(180);
    await page.locator("[data-md-back]").click();
    await settled(page, "source");
    assert.equal((await state(page)).details, 0);
  },
  "Escape detail after reload": async ({ page }) => {
    await openLibrary(page);
    await page.reload();
    await page.locator("[data-md-back]").waitFor();
    await page.keyboard.press("Escape");
    await expectLibrary(page);
  },
  "same-turn double detail Back": async ({ page }) => {
    await openLibrary(page);
    await page.evaluate(() => {
      const b = document.querySelector("[data-md-back]");
      b.click();
      b.click();
    });
    await expectLibrary(page);
    assert.equal(new URL(page.url()).pathname, "/library");
  },
  "menu Back closes only the menu": async ({ page }) => {
    await openLibrary(page);
    await page.locator("[data-md-more]").click();
    await page.waitForFunction(() => HanamiOverlays.count() === 1);
    await page.goBack();
    await page.waitForFunction(() => HanamiOverlays.count() === 0);
    assert.equal((await state(page)).screen.type, "library-detail");
    assert.equal((await state(page)).details, 1);
    await page.locator("[data-md-back]").click();
    await expectLibrary(page);
  },
  "modal Back preserves its detail": async ({ page }) => {
    await openLibrary(page);
    await page.locator("[data-md-more]").click();
    await page.locator("[data-md-debug]").click();
    await page.locator("#modal[open]").waitFor();
    await page.goBack();
    await page.waitForFunction(() => !document.querySelector("#modal").open);
    assert.equal((await state(page)).details, 1);
    await page.locator("[data-md-back]").click();
    await expectLibrary(page);
  },
  "detail menu -> migration -> Back": async ({ page }) => {
    await openLibrary(page);
    await page.locator("[data-md-more]").click();
    await page.locator("[data-md-migrate]").click();
    await settled(page, "migration-config");
    await page.locator("[data-migration-back]").click();
    await settled(page, "library-detail");
    await page.locator("[data-md-back]").waitFor();
    await page.locator("[data-md-back]").click();
    await expectLibrary(page);
  },
  "browser Back and Forward reader after reload": async ({ page }) => {
    await openLibrary(page);
    await page.locator('[data-md-chapter="0"]').click();
    await page.locator("#reader").waitFor();
    await page.reload();
    await page.locator("#reader").waitFor();
    await page.goBack();
    await settled(page, "library-detail");
    assert.equal((await state(page)).reader, false);
    await page.goForward();
    await settled(page, "reader");
    await page.locator("#reader").waitFor();
    await page.goBack();
    await settled(page, "library-detail");
    await page.goBack();
    await expectLibrary(page);
  },
  "jump Back closes reader and music": async ({ page }) => {
    await openLibrary(page);
    await page.locator('[data-md-chapter="0"]').click();
    await page.locator("#reader").waitFor();
    await page.locator("[data-r-music]").click();
    await settled(page, "reader-music");
    await page.evaluate(() => history.go(-3));
    await expectLibrary(page);
    assert.equal(await page.evaluate(() => document.body.style.overflow), "");
  },
  "background readiness cannot replace detail": async ({ page }) => {
    await openLibrary(page);
    await page.evaluate(() => {
      dispatchEvent(new CustomEvent("hanami-reader-comments-ready"));
      dispatchEvent(new CustomEvent("hanami-social-state"));
    });
    await page.waitForTimeout(150);
    assert.equal((await state(page)).screen.type, "library-detail");
    assert.equal((await state(page)).details, 1);
    await page.locator("[data-md-back]").click();
    await expectLibrary(page);
  },
  "group administration reload -> Back": async ({ page }) => {
    await page.evaluate(() => HanamiLibraryGroups.openDetails("g1"));
    await page.locator("[data-group-back]").waitFor();
    await page.reload();
    await page.locator("[data-group-back]").waitFor();
    await page.locator("[data-group-back]").click();
    await settled(page, "root");
    assert.equal(await page.locator(".reading-group-detail").count(), 0);
    assert.equal((await state(page)).root, "library");
  },
  "group manga reload -> Back": async ({ page }) => {
    await page.evaluate(() => {
      HanamiLibraryGroups.activate("g1");
      HanamiAppOpenGroupManga("g1", HanamiGroupLibrary.entries("g1")[0]);
    });
    await page.locator("[data-md-back]").waitFor();
    await page.reload();
    await page.locator("[data-md-back]").waitFor();
    await page.locator("[data-md-back]").click();
    await settled(page, "root");
    assert.equal((await state(page)).details, 0);
    assert.equal((await state(page)).root, "library");
  },
  "delayed detail success after Back": async ({ page, slow }) => {
    slow(450);
    await page.locator('[data-lib-id="m1"]').click();
    await page.locator("[data-lib-back]").waitFor();
    await page.locator("[data-lib-back]").click();
    await expectLibrary(page);
    await page.waitForTimeout(650);
    await expectLibrary(page);
  },
  "delayed pages cannot reopen reader": async ({ page, slow }) => {
    await openLibrary(page);
    slow(500, false, "pages");
    await page.locator('[data-md-chapter="0"]').click();
    await page.locator("[data-md-back]").click();
    await expectLibrary(page);
    await page.waitForTimeout(750);
    await expectLibrary(page);
  },
  "root siblings and fade-through settle": async ({ page }) => {
    await page.evaluate(() =>
      localStorage.setItem("hanami-reduce-motion", "false"),
    );
    await page.locator('[data-tab="history"]').click();
    await page.locator('[data-tab="more"]').click();
    await page.goBack();
    await expectLibrary(page);
    await page.waitForTimeout(300);
    assert.equal(await page.locator(".tab-transition-layer").count(), 0);
    assert.equal(
      await page.locator('[data-tab="library"]').getAttribute("aria-current"),
      "page",
    );
  },

  "library detail -> Back": async ({ page }) => {
    await openLibrary(page);
    await page.locator("[data-md-back]").click();
    await expectLibrary(page);
  },
  "detail refresh -> Back": async ({ page }) => {
    await openLibrary(page);
    await page.locator("[data-md-more]").click();
    await page.locator("[data-md-refresh]").click();
    await page.locator("[data-md-back]").waitFor();
    await page.waitForTimeout(180);
    await page.locator("[data-md-back]").click();
    await expectLibrary(page);
  },
  "library detail reload -> Back": async ({ page }) => {
    await openLibrary(page);
    await page.reload();
    await page.locator("#libraryRoot [data-md-back]").waitFor();
    await page.locator("[data-md-back]").click();
    await expectLibrary(page);
  },
  "source detail reload -> Back": async ({ page }) => {
    await openSource(page);
    await page.reload();
    await page.locator("#browseResults [data-md-back]").waitFor();
    await page.locator("#browseResults [data-md-back]").click();
    await settled(page, "source");
    assert.equal(
      (await state(page)).details,
      0,
      JSON.stringify(await state(page)),
    );
    await page.locator('[data-manga="0"]').waitFor({ timeout: 1000 });
  },
  "reader -> detail -> library": async ({ page }) => {
    await openLibrary(page);
    await page.locator('[data-md-chapter="0"]').click();
    await page.locator("#reader").waitFor();
    await page.locator("[data-r-close]").click();
    await settled(page, "library-detail");
    assert.equal((await state(page)).reader, false);
    await page.locator("[data-md-back]").click();
    await expectLibrary(page);
  },
  "reader reload -> detail -> library": async ({ page }) => {
    await openLibrary(page);
    await page.locator('[data-md-chapter="0"]').click();
    await page.locator("#reader").waitFor();
    await page.reload();
    await page.locator("#reader").waitFor();
    await page.locator("[data-r-close]").click();
    await settled(page, "library-detail");
    assert.equal(
      (await state(page)).reader,
      false,
      JSON.stringify(await state(page)),
    );
    await page.locator("[data-md-back]").click();
    await expectLibrary(page);
  },
  "Forward after detail reload and Back": async ({ page }) => {
    await openLibrary(page);
    await page.reload();
    await page.locator("[data-md-back]").waitFor();
    await page.locator("[data-md-back]").click();
    await expectLibrary(page);
    await page.goForward();
    await settled(page, "library-detail");
    await page
      .locator("#libraryRoot [data-md-back]")
      .waitFor({ timeout: 1000 });
    await page.goBack();
    await expectLibrary(page);
  },
  "delayed source rejection after Back": async ({ page, slow }) => {
    slow(450, true);
    await page.locator('[data-lib-id="m1"]').click();
    await page.locator("[data-lib-back]").waitFor();
    await page.locator("[data-lib-back]").click();
    await expectLibrary(page);
    await page.waitForTimeout(650);
    await expectLibrary(page);
  },
};
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 900 },
  ])
    for (const [name, run] of Object.entries(scenarios).filter(
      ([name]) =>
        !process.env.HANAMI_TEST_CASE ||
        new RegExp(process.env.HANAMI_TEST_CASE).test(name),
    )) {
      const f = await setup(viewport);
      try {
        await run(f);
        assert.deepEqual(f.errors, []);
        console.log("PASS", viewport.width, name);
      } catch (e) {
        const detail = {
          width: viewport.width,
          name,
          error: e.message,
          state: await state(f.page).catch(() => null),
          pageErrors: f.errors,
        };
        failures.push(detail);
        console.log("FAIL", JSON.stringify(detail));
        if (process.env.HANAMI_TEST_ARTIFACTS_DIR) {
          await fs.mkdir(process.env.HANAMI_TEST_ARTIFACTS_DIR, {
            recursive: true,
          });
          await f.page.screenshot({
            path: path.join(
              process.env.HANAMI_TEST_ARTIFACTS_DIR,
              viewport.width + "-" + name.replace(/\W+/g, "-") + ".png",
            ),
          });
        }
      } finally {
        await f.context.close();
      }
    }
  assert.deepEqual(
    failures,
    [],
    "Navigation state must agree with visible DOM",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
