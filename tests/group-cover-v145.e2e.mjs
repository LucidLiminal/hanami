import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import sharp from "sharp";

// Self-contained local app and mocked Storage API. Never connects to production.
const publicRoot = path.resolve(fileURLToPath(new URL("../public/", import.meta.url)));
const group = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherGroup = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const owner = "11111111-1111-4111-8111-111111111111";
const supabase = "https://cover-test.supabase.co";
const canonical = `${group}/cover.webp`;
const publicCover = (objectPath) =>
  `${supabase}/storage/v1/object/public/group-covers/${objectPath}`;
const mimeTypes = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".json": "application/json", ".webmanifest": "application/manifest+json",
};
const server = http.createServer(async (request, response) => {
  try {
    let pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname === "/seed") {
      response.writeHead(200, { "content-type": "text/html" });
      return response.end("<!doctype html><html><body>Local cover test</body></html>");
    }
    if (pathname === "/") pathname = "/index.html";
    const filename = path.resolve(publicRoot, `.${pathname}`);
    if (!filename.startsWith(`${publicRoot}${path.sep}`)) throw new Error("Invalid path");
    const bytes = await fs.readFile(filename);
    response.writeHead(200, { "content-type": mimeTypes[path.extname(filename)] || "application/octet-stream" });
    response.end(bytes);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const svg = (width, height, color) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${color}"/></svg>`,
);
const png = await sharp(svg(3200, 1800, "#a32848")).png().toBuffer();
const jpg = await sharp(svg(1800, 1200, "#224488")).withMetadata({ orientation: 6 }).jpeg().toBuffer();
const webp = await sharp(Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1080"><rect x="100" y="100" width="400" height="600" fill="#d53a62"/></svg>',
)).webp().toBuffer();
const gif = await sharp(svg(240, 160, "#77aa22")).gif().toBuffer();
let seed = 42;
const rawNoise = Buffer.alloc(1600 * 1200 * 3);
for (let index = 0; index < rawNoise.length; index++) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  rawNoise[index] = seed >>> 24;
}
const noise = await sharp(rawNoise, { raw: { width: 1600, height: 1200, channels: 3 } })
  .png({ compressionLevel: 0 }).toBuffer();
assert(noise.length > 1024 * 1024 && noise.length < 10 * 1024 * 1024);

const objects = new Map([
  [`${group}/cover.jpg`, jpg],
  [`${group}/cover.png`, png],
  [`${group}/cover.gif`, gif],
  [`${group}/old/cover.png`, png],
  [`${otherGroup}/cover.jpg`, jpg],
]);
const foreignBefore = Buffer.from(objects.get(`${otherGroup}/cover.jpg`));
let row = {
  id: group, owner_id: owner, name: "Sala de pruebas", quote: "Leer juntos.",
  cover: publicCover(`${group}/cover.jpg`), invite_code: "ABCD1234",
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  members: [{ id: owner, name: "Pruebas", initials: "P", role: "owner", state: "active" }],
  member_count: 1,
};
const settings = {
  failUpload: false, failSave: false, failDelete: false,
  silentDelete: false, failList: false, malformedList: false,
};
const calls = [];
const pageErrors = [];
const routeErrors = [];
const uploadedSizes = [];

function listObjects(prefix) {
  const byName = new Map();
  for (const [objectPath, bytes] of objects) {
    if (!objectPath.startsWith(prefix)) continue;
    const remaining = objectPath.slice(prefix.length);
    const slash = remaining.indexOf("/");
    if (slash >= 0) {
      const name = remaining.slice(0, slash);
      if (!byName.has(name)) byName.set(name, { name, id: null, metadata: null });
    } else {
      byName.set(remaining, {
        name: remaining, id: `fixture-${remaining}`,
        metadata: { size: bytes.length },
      });
    }
  }
  return [...byName.values()].sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
}

async function setupContext(browser, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block" });
  await context.addInitScript(({ owner, supabase, group }) => {
    localStorage.setItem("hanami-supabase-config-v1", JSON.stringify({ url: supabase, anonKey: "fixture-anon-key" }));
    localStorage.setItem("hanami-supabase-session-v1", JSON.stringify({
      access_token: "fixture-token", refresh_token: "fixture-refresh",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: owner, is_anonymous: true, user_metadata: { display_name: "Pruebas" } },
    }));
    localStorage.setItem("hanami-reading-profile-v1", JSON.stringify({ id: owner, name: "Pruebas", initials: "P" }));
    localStorage.setItem("hanami-reading-groups-v1", "[]");
    localStorage.setItem("hanami-active-reading-group", group);
    localStorage.setItem("hanami-screen-history-v1", "[]");
  }, { owner, supabase, group });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    try {
      if (url.origin === supabase) {
        const method = request.method();
        const pathname = url.pathname;
        const call = { method, pathname };
        calls.push(call);
        if (pathname === "/auth/v1/user")
          return route.fulfill({ json: { id: owner, is_anonymous: true, user_metadata: { display_name: "Pruebas" } } });
        if (pathname.endsWith("/list_my_reading_groups"))
          return route.fulfill({ json: [row] });
        if (pathname.endsWith("/update_reading_group")) {
          call.kind = "save";
          if (settings.failSave)
            return route.fulfill({ status: 400, json: { message: "No se pudo guardar el grupo." } });
          const body = request.postDataJSON();
          row = { ...row, name: body.group_name, quote: body.group_quote, cover: body.group_cover, updated_at: new Date().toISOString() };
          return route.fulfill({ json: [row] });
        }
        if (pathname === "/storage/v1/object/list/group-covers") {
          call.kind = "list";
          const body = request.postDataJSON();
          call.prefix = body.prefix;
          call.offset = body.offset;
          assert(body.prefix === group || body.prefix.startsWith(`${group}/`));
          if (settings.failList) return route.fulfill({ status: 403, json: { message: "List denied" } });
          if (settings.malformedList)
            return route.fulfill({ json: [{ name: "../foreign.webp", id: "bad", metadata: {} }] });
          return route.fulfill({ json: listObjects(`${body.prefix}/`).slice(body.offset, body.offset + body.limit) });
        }
        if (pathname === "/storage/v1/object/group-covers" && method === "DELETE") {
          call.kind = "delete";
          call.prefixes = request.postDataJSON().prefixes;
          assert(call.prefixes.every((value) => value.startsWith(`${group}/`) && value !== canonical));
          if (settings.failDelete)
            return route.fulfill({ status: 403, json: { message: "Delete denied" } });
          const removed = [];
          if (!settings.silentDelete)
            for (const objectPath of call.prefixes) {
              if (objects.delete(objectPath)) removed.push({ name: objectPath });
            }
          return route.fulfill({ json: removed });
        }
        if (pathname.startsWith("/storage/v1/object/group-covers/") && method === "POST") {
          call.kind = "upload";
          const objectPath = pathname.slice("/storage/v1/object/group-covers/".length);
          const bytes = request.postDataBuffer();
          assert.equal(objectPath, canonical);
          assert.equal(request.headers()["content-type"], "image/webp");
          assert.equal(request.headers()["x-upsert"], "true");
          assert.equal(request.headers().authorization, "Bearer fixture-token");
          assert(bytes.length <= 1048576);
          uploadedSizes.push(bytes.length);
          if (settings.failUpload)
            return route.fulfill({ status: 403, json: { message: "No se pudo subir la portada." } });
          objects.set(objectPath, bytes);
          return route.fulfill({ json: { Key: `group-covers/${objectPath}` } });
        }
        if (pathname.startsWith("/storage/v1/object/public/group-covers/")) {
          const objectPath = pathname.slice("/storage/v1/object/public/group-covers/".length);
          const bytes = objects.get(objectPath);
          return bytes
            ? route.fulfill({ contentType: objectPath.endsWith(".webp") ? "image/webp" : "image/png", body: bytes })
            : route.fulfill({ status: 404, body: "Missing cover" });
        }
        return route.fulfill({ json: [] });
      }
      if (url.origin === base && url.pathname.startsWith("/api/")) {
        if (url.pathname === "/api/social-config")
          return route.fulfill({ json: { enabled: true, url: supabase, anonKey: "fixture-anon-key" } });
        if (url.pathname === "/api/status")
          return route.fulfill({ json: { online: true, runtime: "vercel-serverless", sources: 0 } });
        if (url.pathname === "/api/sources") return route.fulfill({ json: [] });
        if (url.pathname === "/api/extensions") return route.fulfill({ json: { items: [], total: 0 } });
        return route.fulfill({ json: { mangas: [], hasNextPage: false } });
      }
      if (url.origin !== base) return route.abort();
      return route.continue();
    } catch (error) {
      routeErrors.push(error.message);
      return route.fulfill({ status: 500, json: { message: error.message } });
    }
  });
  return context;
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
async function upload(page, bytes, type, targetGroup = group) {
  return page.evaluate(async ({ base64, type, targetGroup }) => {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (value) => value.charCodeAt(0));
    const file = new File([bytes], "input-image", { type });
    return window.HanamiSocialSync.uploadGroupCover(targetGroup, file);
  }, { base64: bytes.toString("base64"), type, targetGroup });
}
async function save(page, cover) {
  return page.evaluate(({ group, cover }) =>
    window.HanamiSocialSync.updateGroup(group, { name: "Sala de pruebas", quote: "Leer juntos.", cover }),
  { group, cover });
}
async function verifyStoredImage() {
  const bytes = objects.get(canonical);
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.format, "webp");
  assert(Math.max(metadata.width, metadata.height) <= 1280);
  assert(bytes.length > 0 && bytes.length <= 1048576);
  return metadata;
}
const ownPaths = () => [...objects.keys()].filter((value) => value.startsWith(`${group}/`)).sort();

try {
  const context = await setupContext(browser);
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${base}/seed`);
  await page.evaluate(async () => {
    await import("/social-sync.js");
    await window.HanamiSocialSync.ready;
  });

  let start = calls.length;
  let cover = await upload(page, png, "image/png");
  assert(cover.startsWith(`${publicCover(canonical)}?v=`));
  let metadata = await verifyStoredImage();
  assert.equal(metadata.width, 1280);
  assert.equal(metadata.height, 720);
  assert.equal(ownPaths().length, 5, "Upload alone must not delete legacy covers");
  let saved = await save(page, cover);
  assert(!saved.coverCleanupWarning);
  assert.deepEqual(ownPaths(), [canonical]);
  let related = calls.slice(start).filter((call) => call.kind);
  assert(related.findIndex((call) => call.kind === "upload") < related.findIndex((call) => call.kind === "save"));
  assert(related.findIndex((call) => call.kind === "save") < related.findIndex((call) => call.kind === "delete"));
  assert(related.some((call) => call.kind === "list" && call.prefix === `${group}/old`));

  for (const [bytes, type] of [[jpg, "image/jpeg"], [gif, "image/gif"], [webp, "image/webp"], [noise, "image/png"]]) {
    cover = await upload(page, bytes, type);
    saved = await save(page, cover);
    assert(!saved.coverCleanupWarning);
    metadata = await verifyStoredImage();
    assert.deepEqual(ownPaths(), [canonical], `Only one object after ${type}`);
    if (type === "image/jpeg") {
      assert.equal(metadata.width, 853);
      assert.equal(metadata.height, 1280, "Apply JPEG EXIF rotation before sizing");
    }
    if (type === "image/gif") assert.equal(metadata.pages || 1, 1);
    if (type === "image/webp") assert.equal(metadata.hasAlpha, true);
  }
  console.log("PASS: real PNG/JPEG EXIF/GIF/WebP/noisy image => static WebP <= 1 MiB, <= 1280 px, one reusable object");

  start = calls.length;
  await assert.rejects(() => upload(page, Buffer.alloc(10 * 1024 * 1024 + 1), "image/png"), /10 MB/);
  await assert.rejects(() => upload(page, svg(30, 20, "red"), "image/svg+xml"), /JPG, PNG/);
  await assert.rejects(() => upload(page, Buffer.from("not a real PNG"), "image/png"), /dañado/);
  await assert.rejects(() => upload(page, png, "image/png", `${group}/../foreign`), /identificador válido/);
  assert.equal(calls.filter((call) => call.kind).length,
    calls.slice(0, start).filter((call) => call.kind).length, "Invalid files/paths must not call Storage");
  console.log("PASS: oversized input, unsupported/corrupt files and invalid group paths rejected before upload");

  const before = Buffer.from(objects.get(canonical));
  start = calls.length;
  settings.failUpload = true;
  await assert.rejects(() => upload(page, png, "image/png"), /subir/);
  settings.failUpload = false;
  assert.deepEqual(objects.get(canonical), before);
  assert(!calls.slice(start).some((call) => call.kind === "delete" || call.kind === "save"));

  objects.set(`${group}/cover.jpg`, jpg);
  row.cover = publicCover(`${group}/cover.jpg`);
  cover = await upload(page, webp, "image/webp");
  start = calls.length;
  settings.failSave = true;
  await assert.rejects(() => save(page, cover), /guardar el grupo/);
  settings.failSave = false;
  assert(objects.has(`${group}/cover.jpg`));
  assert(!calls.slice(start).some((call) => call.kind === "delete"));
  await save(page, cover);
  assert.deepEqual(ownPaths(), [canonical]);
  console.log("PASS: failed upload preserves stored cover; failed database save does not delete legacy covers");

  for (const flag of ["failDelete", "silentDelete", "failList", "malformedList"]) {
    objects.set(`${group}/cover.png`, png);
    settings[flag] = true;
    saved = await save(page, cover);
    settings[flag] = false;
    assert(saved.coverCleanupWarning, `Surface ${flag} without claiming a failed group save`);
    assert.equal(row.cover, cover);
    assert(objects.has(`${group}/cover.png`));
    saved = await save(page, cover);
    assert(!saved.coverCleanupWarning);
    assert.deepEqual(ownPaths(), [canonical]);
  }
  console.log("PASS: failed/silent deletion, denied listing and malformed paths produce a saved-with-warning result; next save retries");

  for (let index = 0; index < 150; index++)
    objects.set(`${group}/old-${String(index).padStart(3, "0")}.png`, png);
  start = calls.length;
  await save(page, cover);
  assert.deepEqual(ownPaths(), [canonical]);
  const removals = calls.slice(start).filter((call) => call.kind === "delete");
  assert.deepEqual(removals.map((call) => call.prefixes.length), [100, 50]);
  assert(calls.slice(start).some((call) => call.kind === "list" && call.offset === 100));
  assert.deepEqual(objects.get(`${otherGroup}/cover.jpg`), foreignBefore);
  console.log("PASS: paginated/batched cleanup preserves canonical cover and another group's files");
  await context.close();

  const output = process.env.HANAMI_TEST_ARTIFACTS_DIR;
  if (output) await fs.mkdir(output, { recursive: true });
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    const uiContext = await setupContext(browser, viewport);
    const ui = await uiContext.newPage();
    ui.on("pageerror", (error) => pageErrors.push(error.message));
    await ui.goto(base);
    await ui.waitForFunction(() => window.HanamiReadingGroups && window.HanamiSocialSync?.state().authenticated);
    await ui.evaluate(async (groupId) => {
      await window.HanamiSocialSync.ready;
      const groups = await window.HanamiSocialSync.listGroups();
      window.HanamiReadingGroups.mergeRemoteGroups(groups, false);
      window.HanamiReadingGroups.detail(window.HanamiReadingGroups.groups().find((item) => item.id === groupId), true);
      document.querySelector("[data-group-rename]").click();
    }, group);
    await ui.waitForSelector("[data-group-edit-form]");
    await ui.locator('input[name="coverFile"]').setInputFiles({
      name: "selected.png", mimeType: "image/png", buffer: png,
    });
    assert((await ui.locator(".reading-group-cover-preview").getAttribute("src")).startsWith("blob:"));
    const guidance = (await ui.locator("[data-group-edit-form]").innerText()).toLocaleLowerCase("es");
    assert(guidance.includes("máximo 1 mb"));
    assert(guidance.includes("imagen estática"));
    if (output) await ui.screenshot({ path: path.join(output, `cover-edit-${viewport.width}.png`) });
    await ui.locator('input[name="name"]').fill(`Sala ${viewport.width}`);
    await ui.locator('[data-group-edit-form] [type="submit"]').click();
    await ui.waitForFunction(() => !document.querySelector("#modal").open);
    assert.equal(row.name, `Sala ${viewport.width}`);
    assert.deepEqual(ownPaths(), [canonical]);
    await uiContext.close();
  }
  console.log("PASS: actual mobile/desktop edit form previews selected image, explains limits and saves normalized cover");
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(routeErrors, []);
  console.log("PASS: no page exceptions or escaped cross-group requests");
  if (output) await fs.writeFile(path.join(output, "results.json"), JSON.stringify({
    browser: "Chromium local", storage: "mocked API", productionModified: false,
    uploadedSizes, maximumStoredBytes: Math.max(...uploadedSizes), retainedPaths: [...objects.keys()],
    pageErrors, routeErrors,
  }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}