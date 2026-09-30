import assert from "node:assert/strict";
import { chromium } from "playwright";

function wav({ seconds = 5, frequency = 220, sampleRate = 16000 } = {}) {
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
    const envelope = Math.min(1, index / 160, (samples - index) / 160);
    buffer.writeInt16LE(
      Math.round(Math.sin((2 * Math.PI * frequency * index) / sampleRate) * envelope * 11000),
      44 + index * 2,
    );
  }
  return buffer;
}

const videoId = "InvFallback";
const audioFailureId = "AudioFail34";
const instance = "https://inv.example";
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
const requests = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => requests.push(request.url()));
await page.addInitScript(
  ({ instance }) => {
    localStorage.setItem(
      "hanami-reader-invidious-v1",
      JSON.stringify({ url: instance, savedAt: Date.now() }),
    );
  },
  { instance },
);

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
          title: "Fallback Night",
          artist: "Hanami",
          artwork: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          duration: 5,
          durationText: "0:05",
          provider: "youtube",
        },
        {
          id: audioFailureId,
          videoId: audioFailureId,
          title: "Proxy Recovery",
          artist: "Hanami",
          artwork: `https://i.ytimg.com/vi/${audioFailureId}/hqdefault.jpg`,
          duration: 5,
          durationText: "0:05",
          provider: "youtube",
        },
      ],
    }),
  });
});
await page.route("**/api/music/youtube/resolve", async (route) => {
  const requestedId = JSON.parse(route.request().postData() || "{}").videoId;
  if (requestedId === audioFailureId) {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        provider: "youtube-innertube",
        videoId: audioFailureId,
        expiresAt: Date.now() + 60 * 60_000,
        stream: {
          url: `/api/music/youtube/audio/${audioFailureId}`,
          mimeType: 'audio/wav; codecs="1"',
          bitrate: 256000,
        },
        track: {
          videoId: audioFailureId,
          title: "Proxy Recovery",
          artist: "Hanami",
          duration: 5,
          artwork: `https://i.ytimg.com/vi/${audioFailureId}/hqdefault.jpg`,
        },
      }),
    });
    return;
  }
  await route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({
      error: "YouTube bloqueó la resolución anónima del servidor.",
      kind: "youtube_bot_check",
    }),
  });
});
await page.route("**/api/music/invidious/resolve", async (route) => {
  const input = JSON.parse(route.request().postData() || "{}");
  assert.equal(input.instanceUrl, instance);
  assert([videoId, audioFailureId].includes(input.videoId));
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      provider: "youtube-invidious-relay",
      videoId: input.videoId,
      expiresAt: Date.now() + 60 * 60_000,
      invidiousOrigin: instance,
      stream: {
        url: `/api/music/invidious/audio/${input.videoId}?instance=${encodeURIComponent(instance)}`,
        mimeType: 'audio/wav; codecs="1"',
        bitrate: 256000,
      },
      track: {
        videoId: input.videoId,
        title: input.videoId === audioFailureId ? "Proxy Recovery" : "Fallback Night",
        artist: "Hanami",
        duration: 5,
        artwork: `https://i.ytimg.com/vi/${input.videoId}/hqdefault.jpg`,
      },
      proxied: true,
      browserDirect: false,
    }),
  });
});
await page.route("**/api/music/youtube/audio/*", async (route) => {
  await route.fulfill({
    status: 502,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify({ error: "Googlevideo rechazó el stream" }),
  });
});
await page.route("**/api/music/invidious/audio/*", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "audio/wav",
    headers: {
      "accept-ranges": "bytes",
      "cache-control": "no-store",
    },
    body: audio,
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
      '<svg xmlns="http://www.w3.org/2000/svg" width="390" height="1000"><rect width="390" height="1000" fill="#170b0d"/><text x="195" y="500" text-anchor="middle" fill="#e6cfa9" font-size="36">V134.1</text></svg>',
    );
  window.HanamiReader.open(
    {
      title: "Fallback Invidious Relay",
      sourceId: "hanami.music.v1341",
      mangaUrl: "/music-v1341",
      chapter: { url: "/music-v1341/chapter-1", number: 1, name: "Capítulo musical" },
      pages: [{ imageUrl: image }],
    },
    true,
  );
});
await page.locator("[data-r-music]").click();
await page.locator(".reader-music-services").waitFor({ state: "visible" });
assert.equal(
  await page.locator(".reader-music-invidious summary em").textContent(),
  "inv.example",
);
await page.locator(".reader-music-invidious summary").click();
await page.locator(".reader-music-invidious[open]").waitFor({ state: "visible" });
assert.match(
  await page.locator(".reader-music-invidious p").textContent(),
  /retransmite el audio/i,
);
const invidiousOverflow = await page.locator(".reader-music-invidious").evaluate((node) => ({
  viewport: document.documentElement.clientWidth,
  left: node.getBoundingClientRect().left,
  right: node.getBoundingClientRect().right,
}));
assert(invidiousOverflow.left >= -1, JSON.stringify(invidiousOverflow));
assert(invidiousOverflow.right <= invidiousOverflow.viewport + 1, JSON.stringify(invidiousOverflow));

await page.locator("[data-music-youtube-query]").fill("Fallback Night Hanami");
await page.locator("[data-music-youtube-search]").click();
await page.locator(`[data-music-youtube-add="${videoId}"]`).click();
await page.waitForFunction(() => {
  const snapshot = window.HanamiReaderMusic.snapshot();
  return snapshot.current === "youtube-InvFallback" && snapshot.playing;
});
await page.waitForFunction(
  (id) => {
    const button = document.querySelector(`[data-music-youtube-add="${id}"]`);
    return button && !button.disabled && /Reproducir/.test(button.textContent || "");
  },
  videoId,
);

const snapshot = await page.evaluate(() => window.HanamiReaderMusic.snapshot());
assert.equal(snapshot.tracks[0].provider, "youtube");
assert.equal(snapshot.tracks[0].playbackProvider, "youtube-invidious-relay");
assert.equal(snapshot.tracks[0].invidiousOrigin, instance);
assert.match(snapshot.tracks[0].url, /^http:\/\/127\.0\.0\.1:4173\/api\/music\/invidious\/audio\/InvFallback\?/);
assert.equal(snapshot.external.invidious.configured, true);
assert.equal(snapshot.external.invidious.origin, instance);
assert.match(await page.locator("[data-music-search-status]").textContent(), /inv\.example/);
assert(requests.some((url) => url.endsWith("/api/music/invidious/resolve")));
assert(requests.some((url) => url.includes(`/api/music/invidious/audio/${videoId}?`)));
assert(!requests.some((url) => url.startsWith(`${instance}/`)));
assert(!requests.some((url) => /\.googlevideo\.com\//i.test(url)));

await page.locator(`[data-music-youtube-add="${audioFailureId}"]`).click();
await page.waitForFunction(
  (id) => {
    const snapshot = window.HanamiReaderMusic.snapshot();
    const track = snapshot.tracks.find((item) => item.videoId === id);
    return (
      snapshot.current === `youtube-${id}` &&
      snapshot.playing &&
      track?.playbackProvider === "youtube-invidious-relay"
    );
  },
  audioFailureId,
);
const recovered = await page.evaluate(
  (id) => window.HanamiReaderMusic.snapshot().tracks.find((track) => track.videoId === id),
  audioFailureId,
);
assert.equal(recovered.invidiousOrigin, instance);
assert.match(recovered.url, /\/api\/music\/invidious\/audio\/AudioFail34\?/);
assert(requests.some((url) => url.includes(`/api/music/youtube/audio/${audioFailureId}`)));
assert(requests.some((url) => url.includes(`/api/music/invidious/audio/${audioFailureId}?`)));
assert(!requests.some((url) => url.startsWith(`${instance}/`)));
assert(!requests.some((url) => /\.googlevideo\.com\//i.test(url)));

const overflow = await page.locator(".reader-music").evaluate((node) => ({
  viewport: document.documentElement.clientWidth,
  left: node.getBoundingClientRect().left,
  right: node.getBoundingClientRect().right,
}));
assert(overflow.left >= -1, JSON.stringify(overflow));
assert(overflow.right <= overflow.viewport + 1, JSON.stringify(overflow));
assert.deepEqual(errors, []);
await page.screenshot({
  path: "/data/hanami-v1341-invidious-relay-mobile.png",
  fullPage: true,
});
await browser.close();

console.log(
  "PASS: mobile v134.1 falls back through Hanami's same-origin relay without browser calls to Invidious or Googlevideo.",
);
