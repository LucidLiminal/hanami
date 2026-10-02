import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import sharp from "sharp";

const base = process.env.HANAMI_TEST_URL || "http://127.0.0.1:4173";
const userId = "11111111-1111-4111-8111-111111111111";
const png = await sharp(new URL("../public/assets/nazuna.webp", import.meta.url).pathname)
  .resize(390, 1100, { fit: "cover" }).png().toBuffer();
const art = await Promise.all(["nightcar", "bedroom", "fallen"].map((name) =>
  sharp(new URL(`../public/assets/${name}.webp`, import.meta.url).pathname)
    .resize(400, 400, { fit: "cover" }).jpeg().toBuffer(),
));
const tracks = [
  { id: "123456", soundcloudId: "123456", title: "Crimson Reader", artist: "Hanami", duration: 185,
    permalinkUrl: "https://soundcloud.com/hanami/crimson-reader", artwork: "https://i1.sndcdn.com/v136-art-0.jpg" },
  { id: "654321", soundcloudId: "654321", title: "Second Reader", artist: "Hanami", duration: 185,
    permalinkUrl: "https://soundcloud.com/hanami/second-reader", artwork: "https://i1.sndcdn.com/v136-art-1.jpg" },
];
let trendRows = [
  { url: tracks[1].permalinkUrl, title: "Rain Over Tokyo", artist: "Comunidad Hanami",
    artwork: "https://i1.sndcdn.com/v136-art-1.jpg", duration: 185, plays: 28, uses: 11, listeners: 8 },
  { url: "https://soundcloud.com/hanami/midnight-pages", title: "Midnight Pages", artist: "Lectores nocturnos",
    artwork: "https://i1.sndcdn.com/v136-art-2.jpg", duration: 140, plays: 17, uses: 8, listeners: 6 },
  { url: "https://soundcloud.com/hanami/dawn", title: "Dawn", artist: "Hanami",
    artwork: "https://i1.sndcdn.com/v136-art-0.jpg", duration: 160, plays: 9, uses: 3, listeners: 4 },
];
const searches = [];
const activity = [];
let trendsFail = false;
let activityFail = false;

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/usr/local/bin/chromium",
  args: ["--no-sandbox"],
});
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: "block",
  });
  await context.addInitScript({ content: await readFile(new URL("fixtures/soundcloud-widget-v136.js", import.meta.url), "utf8") });
  await context.addInitScript(({ userId }) => {
    if (!localStorage.getItem("hanami-library")) {
      localStorage.setItem("hanami-library", JSON.stringify([{
        id: "fixture-manga", sourceId: "hanami.fixture", url: "/fixture/v136",
        title: "Lectura nocturna", thumbnailUrl: "/assets/fallen.webp",
        favorite: true, categories: ["default"], addedAt: Date.now(),
      }]));
    }
    localStorage.setItem("hanami-supabase-session-v1", JSON.stringify({
      access_token: "fixture-access-not-a-real-token", refresh_token: "fixture-refresh",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: userId, is_anonymous: true },
    }));
    window.__COPIED_IMAGES__ = [];
    window.__SHARED_IMAGES__ = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write: async (items) => {
        const blob = await items[0].getType("image/png");
        window.__COPIED_IMAGES__.push({ type: blob.type, size: blob.size, signature: [...new Uint8Array(await blob.arrayBuffer()).slice(0, 8)] });
      } },
    });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: ({ files }) => files?.[0] instanceof File });
    Object.defineProperty(navigator, "share", { configurable: true, value: async ({ files, title }) => {
      window.__SHARED_IMAGES__.push({ name: files[0].name, type: files[0].type, size: files[0].size, title });
    } });
  }, { userId });

  const page = await context.newPage();
  const touchSession = await context.newCDPSession(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const json = (route, data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  await page.route("**/v136-page-*.png", (route) => route.fulfill({ status: 200, contentType: "image/png", body: png }));
  await page.route("https://i1.sndcdn.com/v136-art-*.jpg", (route) => {
    const index = Number(route.request().url().match(/art-(\d)/)?.[1] || 0);
    return route.fulfill({ status: 200, contentType: "image/jpeg", body: art[index] });
  });
  await page.route("https://w.soundcloud.com/player/**", (route) => route.fulfill({
    status: 200, contentType: "text/html", body: "<!doctype html><title>Widget fixture</title>",
  }));
  await page.route("**/api/music/capabilities", (route) => json(route, { soundcloud: { widget: true, oembed: true, searchConfigured: false } }));
  await page.route("**/api/music/soundcloud/search?**", (route) => {
    const query = new URL(route.request().url()).searchParams.get("q");
    searches.push(query);
    return json(route, { results: [query.includes("second-reader") ? tracks[1] : tracks[0]] });
  });
  await page.route("**/api/social-config", (route) => json(route, { enabled: true, url: "https://v136.supabase.test", anonKey: "fixture-public-anon" }));
  await page.route("https://v136.supabase.test/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/v1/user")) return json(route, { id: userId, is_anonymous: true, user_metadata: { display_name: "Lector de prueba" } });
    if (url.pathname.endsWith("/rpc/list_reader_music_trends"))
      return trendsFail ? json(route, { code: "PGRST202", message: "Function missing from schema cache" }, 404) : json(route, trendRows);
    if (url.pathname.endsWith("/rpc/record_reader_music_activity")) {
      if (activityFail) return route.abort("internetdisconnected");
      activity.push(route.request().postDataJSON());
      return json(route, { accepted: true });
    }
    return json(route, []);
  });
  await page.goto(base);
  await page.waitForFunction(() => !!window.HanamiReaderPageActions && !!window.HanamiReaderMusicServices);
  await page.evaluate(async () => {
    await window.HanamiReaderMusic.ready;
    await window.HanamiSocialSync.ready;
    window.HanamiReader.open({
      title: "Lectura nocturna", sourceId: "hanami.fixture", mangaId: "fixture-manga", mangaUrl: "/fixture/v136",
      chapter: { url: "/fixture/chapter/9", number: 9, name: "Capítulo 9" },
      pages: [1, 2, 3].map((i) => ({ imageUrl: `/v136-page-${i}.png` })),
    });
  });
  const target = page.locator('#readerViewport figure[data-page="2"] > img');
  await page.locator("#readerSlider").evaluate((input) => {
    input.value = "3"; input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await target.waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelector("#readerCount")?.textContent.startsWith("3 / 3"));
  await page.waitForTimeout(250);

  const readerState = () => page.evaluate(() => ({
    top: document.querySelector("#readerViewport").scrollTop,
    count: document.querySelector("#readerCount").textContent,
  }));
  const before = await readerState();
  async function hold(xRatio = .42, yOffset = 240, touchMode = false) {
    const rect = await target.boundingBox();
    assert(rect);
    const point = { x: rect.x + rect.width * xRatio, y: Math.max(140, rect.y + yOffset) };
    if (touchMode) {
      await page.evaluate(() => {
        window.__GESTURE_EVENTS__ = [];
        if (window.__GESTURE_PROBE_INSTALLED__) return;
        window.__GESTURE_PROBE_INSTALLED__ = true;
        for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "contextmenu", "touchstart", "touchend", "click"]) {
          document.addEventListener(type, (event) => {
            window.__GESTURE_EVENTS__.push({ type, button: event.button, pointerType: event.pointerType,
              target: event.target.tagName + "." + event.target.className, x: event.clientX, y: event.clientY });
          }, { capture: true });
        }
      });
      await touchSession.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
      await page.waitForTimeout(650);
      await page.evaluate(() => { window.__MENU_BEFORE_RELEASE__ = !!document.querySelector("[data-reader-page-actions]"); });
      await touchSession.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      await page.waitForTimeout(650);
      await page.mouse.up();
    }
    try {
      await page.locator("[data-reader-page-actions]").waitFor({ state: "visible", timeout: 5000 });
    } catch (error) {
      console.log("Gesture diagnostic:", JSON.stringify(await page.evaluate(() => ({
        events: window.__GESTURE_EVENTS__, beforeRelease: window.__MENU_BEFORE_RELEASE__, screen: window.HanamiScreens.current()?.type,
        longTap: window.HanamiReader.settings.longTap, viewportInert: document.querySelector("#readerViewport").inert,
        count: document.querySelector("#readerCount").textContent,
      }))));
      throw error;
    }
    return point;
  }
  async function actionsHidden() {
    await page.locator("[data-reader-page-actions]").waitFor({ state: "hidden" });
    await page.waitForFunction(() => window.HanamiScreens.is("reader"));
  }
  async function proof(name) {
    await page.evaluate(() => window.HanamiSnackbar?.clear());
    await page.waitForFunction(() => !window.HanamiSnackbar?.current());
    const replacements = {
      page: `data:image/png;base64,${png.toString("base64")}`,
      art: art.map((buffer) => `data:image/jpeg;base64,${buffer.toString("base64")}`),
    };
    let html = await page.evaluate((replacements) => {
      const root = document.documentElement.cloneNode(true);
      const scrollSelectors = "#readerViewport,.reader-music-picker,[data-music-carousel]";
      const originals = [...document.querySelectorAll(scrollSelectors)];
      root.querySelectorAll(scrollSelectors).forEach((node, index) => {
        node.dataset.qaScrollTop = originals[index].scrollTop;
        node.dataset.qaScrollLeft = originals[index].scrollLeft;
      });
      root.querySelectorAll("script,iframe").forEach((node) => node.remove());
      root.querySelectorAll("img").forEach((image) => {
        if (/v136-page-/.test(image.src)) image.src = replacements.page;
        const match = image.src.match(/v136-art-(\d)/);
        if (match) image.src = replacements.art[Number(match[1])];
      });
      return "<!doctype html>" + root.outerHTML;
    }, replacements);
    for (const match of [...html.matchAll(/<link[^>]*href="(\/[^"]+\.css)"[^>]*>/g)]) {
      const css = await readFile(new URL(`../public${match[1]}`, import.meta.url), "utf8");
      html = html.replace(match[0], `<style>${css}</style>`);
    }
    html = html.replace("<head>", `<head><base href="${base}/">`);
    html = html.replace("</body>", '<script>addEventListener("load",()=>document.querySelectorAll("[data-qa-scroll-top]").forEach(n=>{n.scrollTop=Number(n.dataset.qaScrollTop);n.scrollLeft=Number(n.dataset.qaScrollLeft)}))</script></body>');
    await writeFile(`/data/hanami-v136-${name}.html`, html);
    await page.screenshot({ path: `/data/hanami-v136-${name}.png` });
  }

  await hold();
  const labels = await page.locator("[data-reader-page-action] span").allTextContents();
  assert.deepEqual(labels, [
    "Poner como portada", "Copiar al portapapeles", "Compartir", "Guardar",
    "Hacer un comentario", "Instanciar una pista de música",
  ]);
  assert.equal(await page.locator(".reader-comment-editor").count(), 0);
  await proof("actions-mobile");
  await page.locator('[data-reader-page-action="copy"]').click();
  await actionsHidden();
  const copied = await page.evaluate(() => window.__COPIED_IMAGES__);
  assert.equal(copied.length, 1);
  assert.equal(copied[0].type, "image/png");
  assert.deepEqual(copied[0].signature, [137, 80, 78, 71, 13, 10, 26, 10]);

  await hold(.42, 240, true);
  const downloadPromise = page.waitForEvent("download");
  await page.locator('[data-reader-page-action="save"]').click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "Lectura nocturna - 9 - 3.png");
  assert.deepEqual(await readFile(await download.path()), png);
  await actionsHidden();

  await hold(.42, 240, true);
  await page.locator('[data-reader-page-action="share"]').click();
  await actionsHidden();
  const shared = await page.evaluate(() => window.__SHARED_IMAGES__);
  assert.equal(shared.length, 1);
  assert.equal(shared[0].type, "image/png");
  assert.equal(shared[0].size, png.length);
  assert(shared[0].name.endsWith("3.png"));

  await hold();
  await page.locator('[data-reader-page-action="cover"]').click();
  await page.locator("[data-page-cover-confirm]").waitFor({ state: "visible" });
  await proof("cover-confirm-mobile");
  await page.locator("[data-page-cover-accept]").click();
  await actionsHidden();
  const cover = await page.evaluate(() => JSON.parse(localStorage.getItem("hanami-library"))[0]);
  assert(cover.customThumbnailUrl.startsWith("data:image/jpeg;base64,"));
  assert.equal(cover.thumbnailUrl, cover.customThumbnailUrl);
  assert.equal(cover.originalThumbnailUrl, "/assets/fallen.webp");
  assert.equal(await page.evaluate(() => window.HanamiReaderPageActions.coverFor({ url: "/fixture/v136", thumbnailUrl: "https://remote/new.jpg" }, "hanami.fixture")), cover.customThumbnailUrl);

  const pressed = await hold();
  await page.locator('[data-reader-page-action="comment"]').click();
  await page.locator(".reader-comment-editor").waitFor({ state: "visible" });
  await page.locator("[data-comment-text]").fill("Comentario después de elegir la acción");
  await page.locator("[data-comment-save]").click();
  await page.locator(".reader-comment-editor").waitFor({ state: "hidden" });
  await page.waitForFunction(() => window.HanamiScreens.is("reader"));
  await page.waitForTimeout(150);
  const afterComment = await readerState();
  assert.equal(afterComment.count, before.count);
  assert(Math.abs(afterComment.top - before.top) < 3, "comment must retain the exact reader position");
  const comment = await page.evaluate(() => {
    const figure = document.querySelector('#readerViewport figure[data-page="2"]');
    return window.HanamiReaderComments.list(JSON.parse(figure.dataset.commentContext))[0];
  });
  assert.equal(comment.text, "Comentario después de elegir la acción");
  assert(Math.abs(comment.x - 0.42) < .02);

  await hold(.12, 360);
  await page.locator('[data-reader-page-action="music"]').click();
  const picker = page.locator(".reader-music-picker");
  await picker.waitFor({ state: "visible" });
  for (const forbidden of [".reader-music-now", ".reader-music-library", ".reader-music-queue", "[data-music-files]", "[data-music-recognize]"]) {
    assert.equal(await picker.locator(forbidden).count(), 0, `standalone picker excludes ${forbidden}`);
  }
  await page.waitForFunction(() => window.HanamiReaderMusicServices.snapshot().picker.trendsStatus === "ready");
  assert.equal(await picker.locator('[data-music-carousel="trends"] .music-discovery-card').count(), 3);
  assert.equal(await picker.locator('[data-music-carousel="recent"]').count(), 0);
  await proof("music-empty-mobile");
  await picker.locator("[data-music-picker-query]").fill("The Prodigy Breathe");
  await picker.locator("[data-music-picker-search]").click();
  assert((await picker.locator("[data-music-picker-status]").textContent()).includes("URL HTTPS"));
  assert.equal(searches.length, 0);
  await proof("music-url-warning-mobile");
  await picker.locator("[data-music-picker-query]").fill("https://youtube.com/watch?v=example");
  await picker.locator("[data-music-picker-search]").click();
  assert.equal(searches.length, 0, "unsupported URL must not reach the API");
  await picker.locator("[data-music-picker-query]").fill(tracks[0].permalinkUrl);
  await picker.locator("[data-music-picker-search]").click();
  await picker.locator('[data-music-picker-source="result"]').waitFor();
  await proof("music-result-mobile");
  await picker.locator('[data-music-picker-source="result"]').click();
  await picker.waitFor({ state: "hidden", timeout: 20000 });
  await page.waitForFunction(() => window.HanamiScreens.is("reader"));
  await page.locator(".reader-music-pin").waitFor({ state: "visible", timeout: 5000 });
  await page.waitForFunction(() => window.HanamiMusicDiscovery.snapshot().recent.length === 1);
  await page.waitForFunction(() => window.HanamiMusicDiscovery.snapshot().pendingCount === 0);
  await proof("music-pin-mobile");
  assert.equal(searches.length, 1);
  assert(activity.some((item) => item.p_kind === "use"));
  assert(activity.some((item) => item.p_kind === "play"));
  assert(!JSON.stringify(activity).includes("/fixture/chapter"));
  assert(!JSON.stringify(activity).includes("/fixture/v136"));
  const afterMusic = await readerState();
  assert.equal(afterMusic.count, before.count);
  assert(Math.abs(afterMusic.top - before.top) < 3);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("hanami-reader-music-discovery-v1")));
  assert.equal(stored.bindings.length, 1);
  assert.equal(stored.bindings[0].trackId, "soundcloud-123456");
  assert(Math.abs(stored.bindings[0].x - .12) < .02);

  // A second listened track appears as history, not as an imported-only recommendation.
  const secondStarted = await page.evaluate(async (track) => {
    const added = await window.HanamiReaderMusic.addUrl(track.permalinkUrl, { ...track, provider: "soundcloud" });
    return window.HanamiReaderMusic.play(added.id);
  }, tracks[1]);
  assert.equal(secondStarted, true);
  await page.waitForFunction(() => window.HanamiMusicDiscovery.snapshot().recent.length === 2);
  await page.evaluate(() => window.HanamiReaderMusicServices.openPicker({
    context: { ...JSON.parse(document.querySelector('#readerViewport figure[data-page="2"]').dataset.commentContext), x: .65, y: .6 },
  }));
  await picker.waitFor();
  await page.waitForFunction(() => window.HanamiReaderMusicServices.snapshot().picker.trendsStatus === "ready");
  await picker.locator("[data-music-picker-query]").fill("");
  assert.equal(await picker.locator("[data-music-picker-search]").isDisabled(), true);
  await proof("music-discovery-mobile");
  await picker.evaluate((node) => {
    const section = node.querySelector("#musicPickerTrends").closest("section");
    node.scrollTop += section.getBoundingClientRect().top - node.getBoundingClientRect().top - 24;
  });
  await proof("music-trends-mobile");
  await picker.evaluate((node) => { node.scrollTop = 0; });
  await page.setViewportSize({ width: 1280, height: 900 });
  await proof("music-discovery-desktop");
  await picker.evaluate((node) => {
    const section = node.querySelector("#musicPickerTrends").closest("section");
    node.scrollTop += section.getBoundingClientRect().top - node.getBoundingClientRect().top - 24;
  });
  await proof("music-trends-desktop");
  await picker.evaluate((node) => { node.scrollTop = 0; });
  await page.setViewportSize({ width: 390, height: 844 });

  trendRows = [];
  await picker.locator("[data-music-picker-refresh]").click();
  await page.waitForFunction(() => window.HanamiReaderMusicServices.snapshot().picker.trendsStatus === "ready");
  assert.equal(await picker.locator('[data-music-carousel="trends"]').count(), 0);
  assert((await picker.locator('[data-music-trends-state="ready"]').textContent()).includes("otros lectores"));
  await proof("music-no-trends-mobile");
  trendsFail = true;
  await picker.locator("[data-music-picker-refresh]").click();
  await picker.locator('[data-music-trends-state="error"]').waitFor();
  assert((await picker.locator('[data-music-trends-state="error"]').textContent()).includes("hanami-reader-music-v136.sql"));
  await proof("music-error-mobile");
  await page.goBack();
  await picker.waitFor({ state: "hidden" });
  await page.waitForFunction(() => window.HanamiScreens.is("reader"));
  assert.equal((await readerState()).count, before.count);

  // Unsupported clipboard capability produces an honest error, not a link fallback.
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: {} }));
  await hold(.9, 460);
  await page.locator('[data-reader-page-action="copy"]').click();
  assert((await page.locator("[data-page-action-status]").textContent()).includes("no permite copiar imágenes"));
  await proof("copy-unavailable-mobile");
  await page.locator("[data-page-actions-close]").click();
  await actionsHidden();
  const barsBefore = await page.locator("#reader").evaluate((node) => node.classList.contains("bars-on"));
  await page.mouse.click(195, 422);
  await page.waitForTimeout(350);
  assert.notEqual(await page.locator("#reader").evaluate((node) => node.classList.contains("bars-on")), barsBefore,
    "the first intentional reader tap after closing an overlay must not be swallowed");

  await page.evaluate(() => {
    window.HanamiSocialSync.configure(null, null);
    window.HanamiReaderMusicServices.openPicker();
  });
  await picker.locator('[data-music-trends-state="unavailable"]').waitFor();
  assert((await picker.locator('[data-music-trends-state="unavailable"]').textContent()).includes("servidor compartido"));
  await proof("music-unconfigured-mobile");
  await picker.locator("[data-music-picker-close]").click();
  await picker.waitFor({ state: "hidden" });
  assert.deepEqual(errors, []);

  await page.reload();
  await page.waitForFunction(() => !!window.HanamiReaderMusic);
  await page.evaluate(() => window.HanamiReaderMusic.ready);
  assert.equal(await page.evaluate(() => window.HanamiMusicDiscovery.snapshot().recent.length), 2);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("hanami-library"))[0].customThumbnailUrl), cover.customThumbnailUrl);
  console.log("PASS: mobile/desktop v136 six actions, image clipboard/share/download, confirmed persistent cover, coordinate comment, URL-only independent picker, listening history, music pin, community RPCs and Back retain reader position");
} catch(error) {
  console.error("Reader diagnostic",JSON.stringify(await browser.contexts()[0].pages()[0].evaluate(()=>{
    const viewport=document.querySelector("#readerViewport");
    const rect=node=>{const r=node?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null};
    return {screen:window.HanamiScreens?.current()?.type,reader:document.querySelector("#reader")?.className,inert:viewport?.inert,viewport:rect(viewport),
      children:[...document.querySelector("#reader").children].map(n=>({id:n.id,cls:n.className,inert:n.inert})),
      bindings:window.HanamiMusicDiscovery?.snapshot()?.bindings.map(b=>({id:b.id,pageKey:b.pageKey,x:b.x,y:b.y,shareState:b.shareState})),
      anchors:[...document.querySelectorAll("[data-reader-music-anchor]")].map(n=>({id:n.dataset.readerMusicAnchor,rect:rect(n)})),
      figures:[...document.querySelectorAll("figure[data-comment-context]")].map(n=>({context:n.dataset.commentContext,rect:rect(n)}))};
  })));
  throw error;
} finally {
  await browser.close();
}