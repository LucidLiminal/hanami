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

await context.addInitScript(() => {
  const events = {
    READY: "READY",
    PLAY: "PLAY",
    PAUSE: "PAUSE",
    PLAY_PROGRESS: "PLAY_PROGRESS",
    FINISH: "FINISH",
    SEEK: "SEEK",
    ERROR: "ERROR",
  };
  const telemetry = {
    instances: 0,
    loads: [],
    plays: 0,
    pauses: 0,
    seeks: [],
    volumes: [],
  };
  function Widget(frame) {
    telemetry.instances++;
    const listeners = new Map();
    let position = 0;
    const duration = 185_000;
    let paused = true;
    let currentId = "123456";
    let currentUrl = "https://soundcloud.com/hanami/crimson-reader";
    let progressTimer = 0;
    const emit = (name, detail = {}) => {
      for (const listener of listeners.get(name) || []) listener(detail);
    };
    const stopProgress = () => {
      clearInterval(progressTimer);
      progressTimer = 0;
    };
    const startProgress = () => {
      stopProgress();
      progressTimer = setInterval(() => {
        if (paused) return;
        position = Math.min(duration, position + 1_000);
        emit(events.PLAY_PROGRESS, {
          currentPosition: position,
          relativePosition: position / duration,
          loadProgress: 1,
        });
      }, 80);
    };
    const ready = () => setTimeout(() => emit(events.READY), 20);
    const api = {
      bind(name, listener) {
        const values = listeners.get(name) || [];
        values.push(listener);
        listeners.set(name, values);
      },
      load(url, options = {}) {
        telemetry.loads.push({ url, options });
        currentUrl = url;
        currentId = url.includes("second-reader") ? "654321" : "123456";
        position = 0;
        paused = !options.auto_play;
      },
      play() {
        telemetry.plays++;
        paused = false;
        emit(events.PLAY);
        startProgress();
      },
      pause() {
        telemetry.pauses++;
        paused = true;
        stopProgress();
        emit(events.PAUSE);
      },
      seekTo(milliseconds) {
        position = Math.max(0, Number(milliseconds) || 0);
        telemetry.seeks.push(position);
        emit(events.SEEK, { currentPosition: position });
      },
      setVolume(value) {
        telemetry.volumes.push(value);
      },
      getDuration(callback) {
        callback(duration);
      },
      getPosition(callback) {
        callback(position);
      },
      isPaused(callback) {
        callback(paused);
      },
      getCurrentSound(callback) {
        callback({
          id: currentId,
          title: "Crimson Reader",
          permalink_url: currentUrl,
        });
      },
    };
    ready();
    return api;
  }
  Widget.Events = events;
  window.__SC_WIDGET_TELEMETRY__ = telemetry;
  window.SC = { Widget };
});

const page = await context.newPage();
const errors = [];
const requests = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => requests.push(request.url()));

await page.route("https://w.soundcloud.com/player/**", (route) =>
  route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><title>SoundCloud Widget Test</title>",
  }),
);
await page.route("**/api/music/capabilities", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      soundcloud: {
        widget: true,
        oembed: true,
        search: true,
        searchConfigured: true,
        proxiedPlayback: false,
      },
      recognition: { provider: "Shazam" },
      lyrics: { providers: ["LRCLIB"] },
    }),
  }),
);
await page.route("**/api/music/soundcloud/search?**", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      provider: "soundcloud",
      source: "api",
      results: [
        {
          id: "123456",
          soundcloudId: "123456",
          soundcloudUrn: "soundcloud:tracks:123456",
          title: "Crimson Reader",
          artist: "Hanami",
          album: "Night Library",
          artwork:
            "https://i1.sndcdn.com/artworks-hanami-t500x500.jpg",
          duration: 185,
          durationText: "3:05",
          permalinkUrl:
            "https://soundcloud.com/hanami/crimson-reader",
          userUrl: "https://soundcloud.com/hanami",
          access: "playable",
          provider: "soundcloud",
        },
      ],
    }),
  }),
);

async function openReader(title = "SoundCloud Reader") {
  await page.evaluate((readerTitle) => {
    const image =
      "data:image/svg+xml," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="390" height="1000"><rect width="390" height="1000" fill="#170b0d"/><text x="195" y="500" text-anchor="middle" fill="#e6cfa9" font-size="34">SOUNDCLOUD</text></svg>',
      );
    window.HanamiReader.open(
      {
        title: readerTitle,
        sourceId: "hanami.soundcloud.test",
        mangaUrl: "/soundcloud-reader",
        chapter: {
          url: "/chapter/soundcloud",
          number: 1,
          name: "Capítulo SoundCloud",
        },
        pages: [{ imageUrl: image }],
      },
      false,
    );
  }, title);
  await page.locator("#reader:not(.hidden)").waitFor({ state: "visible" });
  await page.locator("[data-r-music]").click();
  await page.locator(".reader-music").waitFor({ state: "visible" });
}

async function openCollection() {
  await page.locator('.player-screen [data-player-tool="queue"]').click();
  await page.locator('.player-tool-sheet').waitFor({ state: 'visible' });
  await page.locator('.player-tool-tabs [data-player-tool="library"]').click();
}
async function closeCollection() {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.HanamiScreens.is('reader-music'));
}

await page.goto((process.env.HANAMI_TEST_URL || "http://127.0.0.1:4173") + "/");
await page.waitForFunction(
  () => !!window.HanamiReaderMusic && !!window.HanamiReaderMusicServices,
);
await page.evaluate(() => window.HanamiReaderMusic.ready);
await openReader();
await openCollection();

await page
  .locator("[data-music-soundcloud-query]")
  .fill("Crimson Reader Hanami");
await page.locator("[data-music-soundcloud-search]").click();
const add = page.locator(
  '[data-music-soundcloud-add="soundcloud:tracks:123456"]',
);
await add.waitFor({ state: "visible" });
assert.equal(
  await page.locator(".reader-music-soundcloud-result").count(),
  1,
);
await add.click();
await page.waitForFunction(() => {
  const state = window.HanamiReaderMusic.snapshot();
  return (
    state.playing &&
    state.current === "soundcloud-123456" &&
    state.external?.soundcloud?.ready
  );
});

let snapshot = await page.evaluate(() => window.HanamiReaderMusic.snapshot());
assert.equal(snapshot.tracks.length, 1);
assert.equal(snapshot.tracks[0].provider, "soundcloud");
assert.equal(
  snapshot.tracks[0].permalinkUrl,
  "https://soundcloud.com/hanami/crimson-reader",
);
assert.equal(snapshot.duration, 185);
assert.equal(snapshot.external.soundcloud.paused, false);
assert.equal(snapshot.external.soundcloud.playbackError, "");
assert.equal(await page.locator("#hanamiSoundCloudWidget").count(), 1);
assert.match(
  await page.locator("#hanamiSoundCloudWidget").getAttribute("src"),
  /^https:\/\/w\.soundcloud\.com\/player\//,
);
assert.equal(
  await page.locator("#hanamiSoundCloudWidget").getAttribute("allow"),
  "autoplay; encrypted-media",
);
assert.equal(
  await page.locator(".reader-music-soundcloud-source").isVisible(),
  true,
);

await closeCollection();
await page.locator(".reader-music [data-music-toggle]").click();
await page.waitForFunction(
  () => !window.HanamiReaderMusic.snapshot().playing,
);
await page.locator(".reader-music [data-music-toggle]").click();
await page.waitForFunction(
  () => window.HanamiReaderMusic.snapshot().playing,
);
await page.evaluate(() => window.HanamiReaderMusic.seek(42));
await page.waitForFunction(
  () => window.HanamiReaderMusic.snapshot().position >= 42,
);
for (const selector of [
  "[data-music-volume]",
  "[data-music-crossfade]",
  "[data-music-crossfade-seconds]",
  "[data-music-sleep]",
  '[data-music-service-tab="effects"]',
  "[data-music-eq-enabled]",
]) {
  assert.equal(await page.locator(selector).count(), 0, selector);
}

const telemetry = await page.evaluate(() => window.__SC_WIDGET_TELEMETRY__);
assert(telemetry.plays >= 2);
assert(telemetry.pauses >= 1);
assert(telemetry.seeks.some((value) => value >= 42_000));
assert(telemetry.volumes.length >= 1);
assert(telemetry.volumes.every((value) => value === 100));
assert.equal(
  requests.some((url) => /\/api\/music\/.*\/audio\//.test(url)),
  false,
);

await page.reload();
await page.waitForFunction(
  () => !!window.HanamiReaderMusic && !!window.HanamiReaderMusicServices,
);
await page.evaluate(() => window.HanamiReaderMusic.ready);
await openReader("SoundCloud persistente");
snapshot = await page.evaluate(() => window.HanamiReaderMusic.snapshot());
assert.equal(snapshot.tracks.length, 1);
assert.equal(snapshot.current, "soundcloud-123456");
assert.equal(snapshot.playing, false);
assert.equal(snapshot.external.soundcloud.ready, true);
await page.locator(".reader-music [data-music-toggle]").click();
await page.waitForFunction(
  () => window.HanamiReaderMusic.snapshot().playing,
);

const transitioned = await page.evaluate(async () => {
  const track = await window.HanamiReaderMusic.addUrl(
    "https://soundcloud.com/hanami/second-reader",
    {
      provider: "soundcloud",
      soundcloudId: "654321",
      soundcloudUrn: "soundcloud:tracks:654321",
      title: "Second Reader",
      artist: "Hanami",
      duration: 185,
      permalinkUrl: "https://soundcloud.com/hanami/second-reader",
      userUrl: "https://soundcloud.com/hanami",
    },
  );
  const played = await window.HanamiReaderMusic.play(track.id);
  return { id: track.id, played };
});
assert.equal(transitioned.played, true);
await page.waitForFunction(
  (id) => {
    const state = window.HanamiReaderMusic.snapshot();
    return (
      state.current === id &&
      state.playing &&
      state.external?.soundcloud?.ready &&
      state.external.soundcloud.position > 0
    );
  },
  transitioned.id,
);
assert.equal(
  (await page.evaluate(() => window.HanamiReaderMusic.snapshot())).external
    .soundcloud.playbackError,
  "",
);

assert.deepEqual(errors, []);
await page.screenshot({
  path: "/data/hanami-v135-soundcloud-mobile.png",
  fullPage: true,
});
await browser.close();
console.log(
  "PASS: mobile v135 searches SoundCloud, persists its permalink and controls official SC.Widget playback without an audio relay.",
);