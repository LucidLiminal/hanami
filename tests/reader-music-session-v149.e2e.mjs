import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const publicRoot = resolve(new URL("../public/", import.meta.url).pathname);
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".webmanifest": "application/manifest+json",
};
const source = { id: "fixture.source", name: "Fixture", lang: "es", runtime: "vercel-js", status: "ready" };
const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (url.pathname.startsWith("/api/")) {
    const payload = url.pathname === "/api/sources" ? [source]
      : url.pathname === "/api/social-config" ? { enabled: false }
      : url.pathname === "/api/music/capabilities" ? { soundcloud: { widget: false, oembed: false, searchConfigured: false } }
      : [];
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(payload));
    return;
  }
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/" || !extname(pathname)) pathname = "/index.html";
  const file = resolve(publicRoot, `.${pathname}`);
  if (!file.startsWith(`${publicRoot}${sep}`)) { response.writeHead(403); response.end(); return; }
  try {
    if (!(await stat(file)).isFile()) throw new Error("not-file");
    response.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404); response.end("Not found");
  }
});
await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
const base = `http://127.0.0.1:${server.address().port}`;
const tinyPage = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="420" height="1200"><rect width="100%" height="100%" fill="#281012"/></svg>');
const chapter = (number) => ({ url: `/fixture/chapter/${number}`, number, name: `Capítulo ${number}` });
const pages = [0, 1].map(() => ({ imageUrl: tinyPage }));
function wavBase64() {
  const rate = 8000, frames = rate * 3, bytes = Buffer.alloc(44 + frames * 2);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36); bytes.writeUInt32LE(frames * 2, 40);
  for (let index = 0; index < frames; index++) bytes.writeInt16LE(Math.round(Math.sin(index * Math.PI * 2 * 220 / rate) * 1200), 44 + index * 2);
  return bytes.toString("base64");
}
const audio = wavBase64();
const errors = [];
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/local/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--mute-audio", "--autoplay-policy=no-user-gesture-required"],
});
async function fixtureContext() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await context.addInitScript(() => {
    localStorage.setItem("hanami-reader-settings", JSON.stringify({ mode: "continuous" }));
    window.__V149_AUDIO__ = [];
    const NativeAudio = window.Audio;
    window.Audio = new Proxy(NativeAudio, { construct(target, args) {
      const element = Reflect.construct(target, args);
      window.__V149_AUDIO__.push(element);
      return element;
    }});
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  await page.waitForFunction(() => !!window.HanamiReader && !!window.HanamiReaderMusic);
  await page.evaluate(async () => { await window.HanamiReaderMusic.ready; });
  return { context, page };
}
async function openReader(page, first = 1) {
  const list = [chapter(1), chapter(2)];
  await page.evaluate(({ first, list, pages }) => {
    const selected = list.find((item) => item.number === first);
    window.HanamiReader.open({
      title: "Sesión musical", sourceId: "fixture.source", mangaId: "fixture-work", mangaUrl: "/fixture/work",
      chapter: selected, pages, chapterList: list, chapterIndex: first - 1,
      loadChapter: async () => pages,
    });
  }, { first, list, pages });
  await page.locator("#reader:not(.hidden)").waitFor();
  // reader.js applies its saved location after a short delayed restore; wait
  // until that settles before exercising a continuous chapter transition.
  await page.waitForTimeout(450);
}
async function playAndOpen(page) {
  const id = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (value) => value.charCodeAt(0));
    const result = await window.HanamiReaderMusic.importFiles([new File([bytes], "Sesión v149.wav", { type: "audio/wav" })]);
    if (result.failures.length) throw new Error(result.failures.join(" | "));
    const track = window.HanamiReaderMusic.listTracks().find((item) => item.fileName === "Sesión v149.wav");
    await window.HanamiReaderMusic.play(track.id);
    window.HanamiReaderMusic.open();
    return track.id;
  }, audio);
  await page.waitForFunction(() => {
    const snapshot = window.HanamiReaderMusic.snapshot();
    return snapshot.queue.length === 1 && snapshot.panelOpen;
  });
  return id;
}
async function sessionSnapshot(page) {
  return page.evaluate(() => {
    const audio = window.__V149_AUDIO__[0];
    const state = window.HanamiReaderMusic.snapshot();
    return {
      queue: state.queue, current: state.current, playing: state.playing, panelOpen: state.panelOpen,
      sheetHidden: document.querySelector("#readerSheet")?.classList.contains("hidden"),
      readerHidden: document.querySelector("#reader")?.classList.contains("hidden"),
      source: audio?.getAttribute("src"), paused: audio?.paused,
      persisted: JSON.parse(localStorage.getItem("hanami-reader-music-state-v1") || "{}"),
    };
  });
}
try {
  {
    const { context, page } = await fixtureContext();
    await openReader(page);
    await playAndOpen(page);
    await page.evaluate(() => window.HanamiReader.close(true));
    await page.waitForFunction(() => window.HanamiReaderMusic.snapshot().queue.length === 0);
    const state = await sessionSnapshot(page);
    assert.deepEqual(state.queue, []);
    assert.equal(state.current, null);
    assert.equal(state.playing, false);
    assert.equal(state.panelOpen, false);
    assert.equal(state.sheetHidden, true);
    assert.equal(state.readerHidden, true);
    assert.equal(state.source, null);
    assert.equal(state.paused, true);
    assert.deepEqual(state.persisted.queue, []);
    await context.close();
  }
  {
    const { context, page } = await fixtureContext();
    await openReader(page, 1);
    await playAndOpen(page);
    await openReader(page, 2);
    await page.waitForFunction(() => window.HanamiReaderMusic.snapshot().queue.length === 0);
    const state = await sessionSnapshot(page);
    assert.equal(state.readerHidden, false);
    assert.equal(state.sheetHidden, true);
    assert.equal(state.panelOpen, false);
    assert.deepEqual(state.queue, []);
    assert.equal(state.playing, false);
    assert.equal(state.source, null);
    await context.close();
  }
  {
    const { context, page } = await fixtureContext();
    await openReader(page, 1);
    await playAndOpen(page);
    await page.evaluate(() => window.HanamiReaderMusic.close(true));
    await page.locator('[data-r-chapter="next"]').click();
    await page.waitForFunction(() => document.querySelector("#readerChapter")?.textContent.includes("Capítulo 2"));
    await page.waitForFunction(() => window.HanamiReaderMusic.snapshot().queue.length === 0);
    const state = await sessionSnapshot(page);
    assert.equal(state.readerHidden, false);
    assert.equal(state.sheetHidden, true);
    assert.equal(state.panelOpen, false);
    assert.deepEqual(state.queue, []);
    assert.equal(state.playing, false);
    assert.equal(state.source, null);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log("PASS: v149 closes and clears the music session on reader close, replacement chapters and continuous chapter changes");
} finally {
  await browser.close();
  await new Promise((resolveServer) => server.close(resolveServer));
}
