import assert from "node:assert/strict";
import { chromium } from "playwright";

const USER_ID = "11111111-1111-4111-8111-111111111150";
const GROUP_ID = "22222222-2222-4222-8222-222222222150";
const now = new Date().toISOString();
let room = {
  id: GROUP_ID,
  name: "Amigos de medianoche",
  quote: "Nos vemos entre viñetas.",
  cover: "/assets/reading-room-bedroom.webp",
};

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

function groupRow() {
  return {
    ...room,
    invite_code: "LEGACY-HIDDEN",
    owner_id: USER_ID,
    member_count: 2,
    members: [
      { id: USER_ID, name: "Luna", initials: "LU", role: "owner" },
      {
        id: "44444444-4444-4444-8444-444444444150",
        name: "Noche",
        initials: "NO",
        role: "member",
      },
    ],
    created_at: now,
    updated_at: new Date().toISOString(),
  };
}

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
    return reply([groupRow()]);
  if (url.pathname.endsWith("/rest/v1/rpc/update_reading_group")) {
    const update = JSON.parse(route.request().postData() || "{}");
    room = {
      ...room,
      name: update.group_name,
      quote: update.group_quote,
      cover: update.group_cover || room.cover,
    };
    return reply([groupRow()]);
  }
  return reply([]);
});

await page.goto(
  "http://127.0.0.1:4173/library#access_token=test-token&refresh_token=test-refresh&expires_in=3600&token_type=bearer",
);
await page.waitForFunction(
  (groupId) =>
    document.documentElement.dataset.hanamiReady === "true" &&
    window.HanamiSocialSync?.state?.().authenticated &&
    window.HanamiReadingGroups?.groups?.().some((group) => group.id === groupId),
  GROUP_ID,
);
await page.evaluate((groupId) => {
  const group = window.HanamiReadingGroups.groups().find((item) => item.id === groupId);
  window.HanamiReadingGroups.detail(group);
}, GROUP_ID);

await page.locator(".reading-group-detail").waitFor({ state: "visible" });
await page.getByText("Editar sala", { exact: true }).click();
await page.locator(".reading-group-admin").waitFor({ state: "visible" });
assert.equal(await page.locator("#modal[open]").count(), 0);
assert.equal(
  await page.evaluate(() => window.HanamiScreens.current()?.type),
  "reading-group-admin",
);
assert(await page.getByText("Administrar sala.", { exact: true }).isVisible());
assert(await page.locator('[name="coverFile"]').isVisible());
assert(await page.locator(".reading-group-cover-preview").isVisible());
await page.screenshot({
  path: "/data/hanami-v150-group-admin-screen-mobile.png",
  fullPage: true,
});

await page.locator('[name="name"]').fill("Sala v150");
await page.locator('[name="quote"]').fill("Una pantalla para la sala.");
await page.getByText("Guardar cambios", { exact: true }).click();
await page.locator(".reading-group-detail").waitFor({ state: "visible" });
assert(await page.getByText("Sala v150", { exact: true }).isVisible());
assert.equal(
  await page.evaluate(() => window.HanamiScreens.current()?.type),
  "reading-group",
);

await page.getByText("Editar sala", { exact: true }).click();
await page.locator(".reading-group-admin").waitFor({ state: "visible" });
await page.locator("[data-group-edit-back]").click();
await page.locator(".reading-group-detail").waitFor({ state: "visible" });
assert.equal(
  await page.evaluate(() => window.HanamiScreens.current()?.type),
  "reading-group",
);
assert.deepEqual(errors, []);

await browser.close();
console.log(
  "PASS: v150 opens room administration as a screen, saves changes and returns with Back",
);