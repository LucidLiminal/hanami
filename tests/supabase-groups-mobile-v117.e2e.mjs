import assert from "node:assert/strict";
import { chromium } from "playwright";

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
          "authorization,apikey,content-type,prefer,x-client-info",
        "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
      },
      body: JSON.stringify(body),
    });
  if (route.request().method() === "OPTIONS") return reply({});
  if (url.pathname.endsWith("/auth/v1/user"))
    return reply({
        id: "11111111-1111-4111-8111-111111111111",
        email: "noche@example.com",
    });
  if (url.pathname.endsWith("/rest/v1/rpc/list_my_reading_groups"))
    return reply([
        {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Amigos de medianoche",
          quote: "Nos vemos entre viñetas.",
          invite_code: "NOCHE117",
          owner_id: "11111111-1111-4111-8111-111111111111",
          member_count: 2,
          members: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              name: "Noche",
              initials: "NO",
              role: "owner",
            },
          ],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);
  if (url.pathname.endsWith("/rest/v1/reader_comments"))
    return reply([]);
  if (url.pathname.endsWith("/rest/v1/rpc/list_group_library"))
    return reply([]);
  return reply({});
});
await page.goto(
  "http://127.0.0.1:4173/#access_token=test-token&refresh_token=test-refresh&expires_in=3600&token_type=bearer",
);
await page.waitForFunction(
  () =>
    document.documentElement.dataset.hanamiReady === "true" &&
    window.HanamiSocialSync?.state?.().authenticated,
);
await page.evaluate(() =>
  Promise.all([
    window.HanamiSocialSync.ready,
    window.HanamiReaderComments.ready,
  ]),
);
await page.locator('[data-tab="groups"]').click();
await page.locator(".reading-groups-home").waitFor({ state: "visible" });
await page.waitForTimeout(300);
assert(await page.getByText("SUPABASE CONECTADO", { exact: true }).isVisible());
assert(await page.getByText("noche@example.com", { exact: false }).isVisible());
assert(await page.getByText("Amigos de medianoche", { exact: true }).isVisible());
assert.equal(await page.locator(".reading-room-cloud").count(), 1);
await page.getByText("Amigos de medianoche", { exact: true }).click();
await page.locator(".reading-group-detail").waitFor({ state: "visible" });
assert(
  await page.getByText("SALA SINCRONIZADA", { exact: true }).isVisible(),
);
await page.locator("[data-social-sync]").click();
await page.waitForTimeout(250);
assert.equal((await page.evaluate(() => HanamiSocialSync.state().lastError)), "");
assert(await page.locator(".reading-group-detail").isVisible());
assert.deepEqual(errors, []);
await page.screenshot({
  path: "/data/hanami-v117-supabase-mobile.png",
  fullPage: true,
});
await browser.close();
console.log(
  "PASS: mobile 390x844 restores magic-link auth, remote room membership and manual Supabase sync",
);