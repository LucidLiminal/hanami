import assert from "node:assert/strict";
import { chromium } from "playwright";

const USER_ID = "11111111-1111-4111-8111-111111111121";
const GROUP_ID = "22222222-2222-4222-8222-222222222121";
const ENTRY_ID = "33333333-3333-4333-8333-333333333121";
const now = new Date().toISOString();

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
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

await page.addInitScript(() => {
  localStorage.setItem(
    "hanami-library",
    JSON.stringify([
      {
        id: "personal-1",
        title: "Mi lectura personal",
        sourceId: "hanami.es.olympus",
        url: "/series/personal",
        thumbnailUrl: "/assets/fallen.webp",
        categories: ["default"],
        favorite: true,
      },
    ]),
  );
});
await page.route("**/api/social-config", (route) =>
  route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      enabled: true,
      url: "http://127.0.0.1:4173/fake-supabase",
      anonKey: "anon-test",
    }),
  }),
);
await page.route("**/fake-supabase/**", async (route) => {
  const url = new URL(route.request().url());
  const reply = (body) =>
    route.fulfill({
      contentType: "application/json",
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers":
          "authorization,apikey,content-type,prefer",
        "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
      },
      body: JSON.stringify(body),
    });
  if (route.request().method() === "OPTIONS") return reply({});
  if (url.pathname.endsWith("/auth/v1/user"))
    return reply({
      id: USER_ID,
      is_anonymous: true,
      user_metadata: { display_name: "Luna" },
    });
  if (url.pathname.endsWith("/rest/v1/rpc/list_my_reading_groups"))
    return reply([
      {
        id: GROUP_ID,
        name: "Amigos de medianoche",
        quote: "Nos vemos entre viñetas.",
        cover: "/assets/reading-room-bedroom.webp",
        invite_code: "LEGACY-HIDDEN",
        owner_id: USER_ID,
        member_count: 2,
        members: [
          {
            id: USER_ID,
            name: "Luna",
            initials: "LU",
            role: "owner",
          },
          {
            id: "44444444-4444-4444-8444-444444444121",
            name: "Noche",
            initials: "NO",
            role: "member",
          },
        ],
        created_at: now,
        updated_at: now,
      },
    ]);
  if (url.pathname.endsWith("/rest/v1/rpc/list_group_library"))
    return reply([
      {
        id: ENTRY_ID,
        group_id: GROUP_ID,
        source_id: "hanami.es.olympus",
        manga_url: "/series/ciudad-medianoche",
        title: "Ciudad después de medianoche",
        thumbnail_url: "/assets/fallen.webp",
        genre: ["Drama"],
        status: "ONGOING",
        description: "Una lectura compartida.",
        recommended_by: USER_ID,
        recommended_by_name: "Luna",
        recommendation: "El final merece la pena.",
        progress: [
          {
            userId: USER_ID,
            userName: "Luna",
            initials: "LU",
            chapterNumber: 3,
            chapterName: "Capítulo 3",
            pageIndex: 7,
            pageCount: 20,
            completed: false,
            updatedAt: Date.now(),
          },
        ],
        created_at: now,
        updated_at: now,
      },
    ]);
  if (url.pathname.endsWith("/rest/v1/reader_comments")) return reply([]);
  return reply([]);
});

await page.goto(
  "http://127.0.0.1:4173/library#access_token=test-token&refresh_token=test-refresh&expires_in=3600&token_type=bearer",
);
await page.waitForFunction(
  () =>
    document.documentElement.dataset.hanamiReady === "true" &&
    window.HanamiSocialSync?.state?.().authenticated,
);
await page.evaluate(() => window.HanamiSocialSync.ready);
await page.locator("#libraryRoot .library-room-switcher").waitFor();

assert.equal(await page.locator('.main-nav [data-tab="groups"]').count(), 0);
assert.equal(await page.locator(".main-nav [data-tab]").count(), 5);
assert(await page.locator("#libraryRoot").getByText("SALA ACTIVA", { exact: true }).isVisible());
assert(await page.getByRole("button", { name: "Mi biblioteca personal" }).isVisible());
assert(
  await page
    .locator(`[data-library-room="${GROUP_ID}"] img`)
    .isVisible(),
);
assert(await page.locator("[data-library-room-add]").isVisible());

await page.locator(`[data-library-room="${GROUP_ID}"]`).click();
await page
  .getByText("Biblioteca compartida", { exact: true })
  .waitFor({ state: "visible" });
await page
  .getByText("Ciudad después de medianoche", { exact: true })
  .waitFor({ state: "visible" });
assert(await page.getByText("Capítulo 3 · 8/20", { exact: true }).isVisible());
await page.screenshot({
  path: "/data/hanami-v121-library-rooms-mobile.png",
  fullPage: true,
});

const room = page.locator(
  `#libraryRoot [data-library-room="${GROUP_ID}"]`,
);
assert.equal(await room.count(), 1);
await room.dispatchEvent("pointerdown", {
  pointerType: "touch",
  clientX: 110,
  clientY: 240,
});
await page.waitForTimeout(620);
await page.locator(".reading-group-detail").waitFor({ state: "visible" });
assert(await page.getByText("MIEMBROS", { exact: false }).isVisible());
assert(await page.getByText("SYNC QUEUE", { exact: true }).isVisible());
assert(await page.getByText("Crear invitación", { exact: true }).isVisible());
await page.screenshot({
  path: "/data/hanami-v121-room-details-mobile.png",
  fullPage: true,
});

await page.locator("[data-group-back]").click();
await page.locator("#libraryRoot .library-room-switcher").waitFor();
await page.locator("[data-library-room-add]").click();
await page.locator(".library-room-add-dialog").waitFor({ state: "visible" });
assert(
  await page.getByText("Entrar con invitación", { exact: true }).isVisible(),
);
assert(await page.getByText("Crear grupo", { exact: true }).isVisible());
await page.screenshot({
  path: "/data/hanami-v121-add-room-dialog-mobile.png",
  fullPage: true,
});

assert.deepEqual(errors, []);
await browser.close();
console.log(
  "PASS: mobile 390x844 switches Library scope by tap, opens room details by long press and exposes the final add-room dialog",
);