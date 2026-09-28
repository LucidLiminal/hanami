import assert from "node:assert/strict";
import { chromium } from "playwright";

const USER_ID = "11111111-1111-4111-8111-111111111120";
const GROUP_ID = "22222222-2222-4222-8222-222222222120";
const now = new Date().toISOString();
let inviteCreated = false;

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
          "authorization,apikey,content-type,prefer",
        "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
      },
      body: JSON.stringify(body),
    });
  if (route.request().method() === "OPTIONS") return reply({});
  if (url.pathname.endsWith("/auth/v1/signup"))
    return reply({
      access_token: "anonymous-access-token",
      refresh_token: "anonymous-refresh-token",
      expires_in: 3600,
      token_type: "bearer",
      user: {
        id: USER_ID,
        is_anonymous: true,
        user_metadata: { display_name: "Luna" },
      },
    });
  if (url.pathname.endsWith("/rest/v1/rpc/redeem_reading_group_invite"))
    return reply([
      {
        id: GROUP_ID,
        name: "Amigos de medianoche",
        quote: "Nos vemos entre viñetas.",
        invite_code: "LEGACY-HIDDEN",
        owner_id: USER_ID,
        member_count: 2,
        members: [
          {
            id: USER_ID,
            name: "Luna",
            initials: "LU",
            role: "member",
          },
        ],
        created_at: now,
        updated_at: now,
      },
    ]);
  if (url.pathname.endsWith("/rest/v1/profiles"))
    return reply([{ id: USER_ID, display_name: "Luna" }]);
  if (url.pathname.endsWith("/rest/v1/rpc/create_reading_group_invite")) {
    inviteCreated = true;
    return reply([
      {
        id: "44444444-4444-4444-8444-444444444120",
        code: "N0CH-E120-LUNA",
        code_hint: "LUNA",
        expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
        max_uses: 1,
        use_count: 0,
        created_at: now,
      },
    ]);
  }
  if (url.pathname.endsWith("/rest/v1/rpc/list_reading_group_invites"))
    return reply(
      inviteCreated
        ? [
            {
              id: "44444444-4444-4444-8444-444444444120",
              code_hint: "LUNA",
              expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
              max_uses: 1,
              use_count: 0,
              revoked_at: null,
              created_at: now,
            },
          ]
        : [],
    );
  if (url.pathname.endsWith("/rest/v1/rpc/list_group_library"))
    return reply([]);
  if (url.pathname.endsWith("/rest/v1/reader_comments")) return reply([]);
  return reply([]);
});

await page.goto("http://127.0.0.1:4173/groups");
await page.waitForFunction(
  () => document.documentElement.dataset.hanamiReady === "true",
);
await page.evaluate(() => window.HanamiSocialSync.ready);
await page.locator('[data-tab="groups"]').click();
await page.getByText("Entrar con invitación", { exact: true }).first().click();
await page.locator(".reading-group-access").waitFor({ state: "visible" });
assert(
  await page
    .getByText("Tu código abre una sola puerta.", { exact: true })
    .isVisible(),
);
await page.screenshot({
  path: "/data/hanami-v120-invite-access-mobile.png",
  fullPage: true,
});

await page.locator('[name="inviteCode"]').fill("ABCD-EF12-3456");
await page.locator('[name="displayName"]').fill("Luna");
await page.getByText("Entrar en la sala", { exact: true }).click();
await page.locator(".reading-group-detail").waitFor({ state: "visible" });
assert(
  await page.getByText("Amigos de medianoche", { exact: true }).isVisible(),
);
assert(
  await page.getByText("SALA SINCRONIZADA", { exact: true }).isVisible(),
);
assert.equal(
  await page.evaluate(() => HanamiSocialSync.state().anonymous),
  true,
);
assert.deepEqual(errors, []);
await page.screenshot({
  path: "/data/hanami-v120-invite-room-mobile.png",
  fullPage: true,
});
await page.getByText("Crear invitación", { exact: true }).click();
await page.locator(".reading-group-invites").waitFor({ state: "visible" });
await page.getByText("Generar invitación", { exact: true }).click();
await page.getByText("N0CH-E120-LUNA", { exact: true }).waitFor();
assert(await page.getByText("Código ····-LUNA", { exact: true }).isVisible());
await page.screenshot({
  path: "/data/hanami-v120-invite-manager-mobile.png",
  fullPage: true,
});
await browser.close();

console.log(
  "PASS: mobile 390x844 creates an anonymous device identity, consumes a one-use invitation and opens the synchronized room",
);