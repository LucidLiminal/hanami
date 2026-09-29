import assert from "node:assert/strict";
import { chromium } from "playwright";

function wav({ seconds = 8, frequency = 246.94, sampleRate = 16000 } = {}) {
  const samples = Math.floor(seconds * sampleRate);
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
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
  buffer.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++) {
    const time = index / sampleRate;
    const envelope = Math.min(1, index / 180, (samples - index) / 180);
    const sample =
      Math.sin(2 * Math.PI * frequency * time) * 0.65 +
      Math.sin(2 * Math.PI * frequency * 1.5 * time) * 0.2;
    buffer.writeInt16LE(Math.round(sample * envelope * 12000), 44 + index * 2);
  }
  return buffer;
}

const videoId = "AbCdEfGhI_1";
const audio = wav();
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

await page.route("**/api/music/youtube/search?**", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      provider: "youtube-innertube",
      results: [
        {
          id: videoId,
          videoId,
          title: "Night Drive",
          artist: "Akari",
          album: "Moon City",
          artwork: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          duration: 8,
          durationText: "0:08",
          provider: "youtube",
        },
      ],
    }),
  });
});
await page.route("**/api/music/youtube/resolve", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      provider: "youtube-innertube",
      videoId,
      expiresAt: Date.now() + 60 * 60_000,
      stream: {
        url: "https://audio.hanami.test/night-drive.wav",
        mimeType: 'audio/wav; codecs="1"',
        bitrate: 256000,
      },
      track: {
        videoId,
        title: "Night Drive",
        artist: "Akari",
        duration: 8,
        artwork: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      },
    }),
  });
});
await page.route("https://audio.hanami.test/**", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "audio/wav",
    headers: {
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
      "accept-ranges": "bytes",
    },
    body: audio,
  });
});
await page.route("**/api/music/lyrics?**", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      provider: "LRCLIB",
      type: "synced",
      lyrics:
        "[00:00.00]City lights are calling\n[00:01.20]Reading through the night\n[00:03.00]Keep moving forward",
    }),
  });
});
await page.route("https://i.ytimg.com/**", (route) => route.abort());

await page.goto("http://127.0.0.1:4173/");
await page.waitForFunction(() => !!window.HanamiReaderMusic?.registerExternalServices);
await page.evaluate(() => window.HanamiReaderMusic.ready);
await page.evaluate(() => {
  const image =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="390" height="1000"><rect width="390" height="1000" fill="#19111f"/><text x="195" y="500" text-anchor="middle" fill="#d0bcff" font-size="36">V129</text></svg>',
    );
  window.HanamiReader.open(
    {
      title: "Búsqueda musical",
      sourceId: "hanami.music.v129",
      mangaUrl: "/music-v129",
      chapter: { url: "/music-v129/chapter-1", number: 1, name: "Capítulo musical" },
      pages: [{ imageUrl: image }],
    },
    true,
  );
});
await page.locator("[data-r-music]").click();
await page.locator(".reader-music-services").waitFor({ state: "visible" });
assert.equal(await page.locator("[data-music-url]").isVisible(), false, "manual URL starts collapsed");

await page.locator("[data-music-youtube-query]").fill("Night Drive Akari");
await page.locator("[data-music-youtube-search]").click();
await page.locator(`[data-music-youtube-add="${videoId}"]`).waitFor({ state: "visible" });
assert.equal(await page.locator(".reader-music-online-result").count(), 1);
assert.match(await page.locator(".reader-music-online-result").innerText(), /Night Drive/);
await page.screenshot({
  path: "/data/hanami-v129-youtube-search-mobile.png",
  fullPage: true,
});
await page.locator(`[data-music-youtube-add="${videoId}"]`).click();
await page.waitForFunction(() => {
  const state = window.HanamiReaderMusic.snapshot();
  return state.current === "youtube-AbCdEfGhI_1" && state.playing;
});
let snapshot = await page.evaluate(() => window.HanamiReaderMusic.snapshot());
assert.equal(snapshot.tracks[0].provider, "youtube");
assert.equal(snapshot.tracks[0].videoId, videoId);
assert(snapshot.tracks[0].expiresAt > Date.now());
assert.equal(await page.locator("[data-music-title]").first().textContent(), "Night Drive");

await page.locator('[data-music-service-tab="lyrics"]').click();
await page.locator("[data-music-load-lyrics]").click();
await page.locator("[data-music-lyric]").first().waitFor({ state: "visible" });
assert.equal(await page.locator("[data-music-lyric]").count(), 3);
await page.evaluate(() => window.HanamiReaderMusic.seek(1.5));
await page.waitForFunction(() => document.querySelectorAll("[data-music-lyric].active").length === 1);
assert.match(await page.locator("[data-music-lyric].active").textContent(), /Reading through/);

await page.locator('[data-music-service-tab="effects"]').click();
await page.locator("[data-music-eq-enabled]").check();
await page.waitForFunction(() => {
  const eq = window.HanamiReaderMusic.snapshot().external?.equalizer;
  return eq?.enabled && eq?.attached;
});
await page.locator("[data-music-eq-preset]").selectOption("bass");
snapshot = await page.evaluate(() => window.HanamiReaderMusic.snapshot());
assert.equal(snapshot.external.equalizer.preset, "bass");
assert.equal(snapshot.external.equalizer.bands.length, 10);
assert(snapshot.external.equalizer.bass > 0);

const overflow = await page.locator(".reader-music").evaluate((node) => ({
  viewport: document.documentElement.clientWidth,
  left: node.getBoundingClientRect().left,
  right: node.getBoundingClientRect().right,
}));
assert(overflow.left >= -1, JSON.stringify(overflow));
assert(overflow.right <= overflow.viewport + 1, JSON.stringify(overflow));
assert.deepEqual(errors, []);
await page.screenshot({ path: "/data/hanami-v129-music-services-mobile.png", fullPage: true });
await browser.close();
console.log(
  "PASS: mobile 390x844 searches YouTube Music without URLs, resolves and plays a result, follows synced lyrics and applies the 10-band Web Audio equalizer",
);
