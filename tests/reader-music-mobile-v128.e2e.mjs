import assert from "node:assert/strict";
import { chromium } from "playwright";

function wav({ seconds = 12, frequency = 220, sampleRate = 8000 } = {}) {
  const samples = Math.floor(seconds * sampleRate);
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples; i++) {
    const envelope = Math.min(1, i / 100, (samples - i) / 100);
    const sample = Math.sin((2 * Math.PI * frequency * i) / sampleRate);
    buffer.writeInt16LE(Math.round(sample * envelope * 7000), 44 + i * 2);
  }
  return buffer;
}

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

async function openReader(title = "Lectura con música") {
  await page.evaluate((readerTitle) => {
    const image =
      "data:image/svg+xml," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="390" height="1000"><rect width="390" height="1000" fill="#1e1225"/><text x="195" y="500" text-anchor="middle" fill="#d0bcff" font-size="42">HANAMI</text></svg>',
      );
    window.HanamiReader.open(
      {
        title: readerTitle,
        sourceId: "hanami.music.test",
        mangaUrl: "/music-reader",
        chapter: { url: "/chapter/music", number: 1, name: "Capítulo musical" },
        pages: [{ imageUrl: image }, { imageUrl: image }],
      },
      true,
    );
  }, title);
  await page.locator("#reader:not(.hidden)").waitFor({ state: "visible" });
  await page.locator("[data-r-music]").click();
  await page.locator(".reader-music").waitFor({ state: "visible" });
}

await page.goto("http://127.0.0.1:4173/");
await page.waitForFunction(() => !!window.HanamiReaderMusic);
await page.evaluate(() => window.HanamiReaderMusic.ready);
await openReader();

assert.equal(await page.locator(".reader-music-track").count(), 0);
await page.locator("[data-music-files]").setInputFiles([
  { name: "Luna - Moonlight.wav", mimeType: "audio/wav", buffer: wav({ frequency: 220 }) },
  { name: "Ame - Rain.wav", mimeType: "audio/wav", buffer: wav({ frequency: 260 }) },
  { name: "Akari - Dawn.wav", mimeType: "audio/wav", buffer: wav({ frequency: 330 }) },
]);
await page.waitForFunction(() => window.HanamiReaderMusic.snapshot().tracks.length === 3);
assert.equal(await page.locator(".reader-music-track").count(), 3);

const moonlight = page.locator(".reader-music-track", { hasText: "Moonlight" });
await moonlight.locator("[data-music-play]").click();
await page.waitForFunction(() => {
  const state = window.HanamiReaderMusic.snapshot();
  return state.playing && state.tracks.find((track) => track.id === state.current)?.title === "Moonlight";
});
let snapshot = await page.evaluate(() => window.HanamiReaderMusic.snapshot());
assert.equal(snapshot.queue.length, 3);
assert.equal(snapshot.playing, true);
assert(snapshot.duration > 10);
assert.equal(await page.locator("#readerMusicMini").isVisible(), true);
assert.equal(await page.locator("[data-music-mini-title]").textContent(), "Moonlight");

await page.locator(".reader-music [data-music-next]").click();
await page.waitForFunction(() => {
  const state = window.HanamiReaderMusic.snapshot();
  return state.tracks.find((track) => track.id === state.current)?.title === "Rain";
});
await page.locator("[data-music-shuffle]").click();
await page.locator("[data-music-repeat]").click();
await page.locator("[data-music-crossfade]").check();
await page.locator("[data-music-crossfade-seconds]").fill("1.5");
await page.locator("[data-music-crossfade-seconds]").dispatchEvent("change");
await page.locator("[data-music-sleep]").selectOption("15");
snapshot = await page.evaluate(() => window.HanamiReaderMusic.snapshot());
assert.equal(snapshot.shuffle, true);
assert.equal(snapshot.repeat, "all");
assert.equal(snapshot.crossfade, true);
assert.equal(snapshot.crossfadeSeconds, 1.5);
assert(snapshot.sleepAt > Date.now());
const beforeCrossfade = snapshot.current;
await page.evaluate(() => {
  const state = window.HanamiReaderMusic.snapshot();
  window.HanamiReaderMusic.seek(Math.max(0, state.duration - 1));
});
await page.waitForFunction(
  (previous) => window.HanamiReaderMusic.snapshot().current !== previous,
  beforeCrossfade,
  { timeout: 6000 },
);
snapshot = await page.evaluate(() => window.HanamiReaderMusic.snapshot());
assert.notEqual(snapshot.current, beforeCrossfade);
assert.equal(snapshot.playing, true);

await page.locator("[data-music-close]").click();
assert.equal(await page.locator("#readerSheet").evaluate((node) => node.classList.contains("hidden")), true);
const beforeShell = await page.evaluate(() => window.HanamiReaderMusic.snapshot());
await page.evaluate(() => {
  const image = document.querySelector("#readerViewport img")?.src || "";
  window.HanamiReader.open(
    {
      title: "Otro capítulo",
      sourceId: "hanami.music.test",
      mangaUrl: "/music-reader",
      chapter: { url: "/chapter/music-2", number: 2, name: "Capítulo 2" },
      pages: [{ imageUrl: image }],
    },
    true,
  );
});
await page.waitForTimeout(250);
const afterShell = await page.evaluate(() => window.HanamiReaderMusic.snapshot());
assert.equal(afterShell.current, beforeShell.current);
assert.equal(afterShell.playing, true);
assert.equal(await page.locator("#readerMusicMini").isVisible(), true);

// Reload: IndexedDB library, queue, current track and preferences survive. Playback
// intentionally restores paused because browsers forbid unsolicited autoplay.
await page.reload();
await page.waitForFunction(() => !!window.HanamiReaderMusic);
await page.evaluate(() => window.HanamiReaderMusic.ready);
await openReader("Persistencia musical");
snapshot = await page.evaluate(() => window.HanamiReaderMusic.snapshot());
assert.equal(snapshot.tracks.length, 3);
assert.equal(snapshot.queue.length, 3);
assert(snapshot.current);
assert.equal(snapshot.playing, false);
assert.equal(snapshot.shuffle, true);
assert.equal(snapshot.repeat, "all");
assert.equal(snapshot.crossfade, true);
assert.equal(snapshot.crossfadeSeconds, 1.5);
assert.equal(await page.locator(".reader-music-track").count(), 3);
await page.locator(".reader-music [data-music-toggle]").click();
await page.waitForFunction(() => window.HanamiReaderMusic.snapshot().playing);

assert.deepEqual(errors, []);
await page.screenshot({ path: "/data/hanami-v128-reader-music-mobile.png", fullPage: true });
await browser.close();
console.log(
  "PASS: mobile 390x844 imports local songs, plays an editable persistent queue in Reader, keeps playback across chapter shells, and restores library/settings after reload",
);
