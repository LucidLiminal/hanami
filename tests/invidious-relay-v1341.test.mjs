import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  chooseInvidiousAudio,
  normalizeInvidiousOrigin,
  openInvidiousAudio,
  publicInvidiousResolution,
  resolveInvidiousAudio as resolveInvidiousOnServer,
} from "../api/music-services.mjs";
import {
  normalizeInvidiousUrl,
  resolveInvidiousAudio as resolveInvidiousInBrowser,
} from "../public/reader-music-services.js";

const instance = "https://inv.example";
const videoId = "InvFallback";
const relayVideoId = "RelayOpen01";
const expires = Math.floor(Date.now() / 1000) + 3600;
const streamUrl = (id) => `${instance}/videoplayback?id=${id}&expire=${expires}&fmt=140`;
const fixture = (id) => ({
  title: id === relayVideoId ? "Relay Open" : "Crimson Night",
  author: "Hanami",
  lengthSeconds: 187,
  videoThumbnails: [
    { url: "https://i.ytimg.com/small.jpg", width: 120, height: 90 },
    { url: "https://i.ytimg.com/large.jpg", width: 1280, height: 720 },
  ],
  adaptiveFormats: [
    {
      type: 'audio/webm; codecs="opus"',
      bitrate: 160000,
      url: `${instance}/companion/audio?id=${id}&expire=${expires}&fmt=251`,
      audioQuality: "AUDIO_QUALITY_MEDIUM",
    },
    {
      type: 'audio/mp4; codecs="mp4a.40.2"',
      bitrate: 128000,
      url: streamUrl(id),
      audioQuality: "AUDIO_QUALITY_MEDIUM",
      audioSampleRate: "44100",
      audioChannels: 2,
      clen: "424242",
    },
    {
      type: 'audio/mp4; codecs="mp4a.40.2"',
      bitrate: 256000,
      url: `https://rr1---sn.invalid.googlevideo.com/videoplayback?id=${id}`,
    },
    {
      type: 'video/mp4; codecs="avc1.4d401f"',
      bitrate: 900000,
      url: `${instance}/videoplayback?id=${id}&expire=${expires}&fmt=136`,
    },
  ],
});

assert.equal(normalizeInvidiousUrl(`${instance}/`), instance);
assert.throws(() => normalizeInvidiousUrl("http://inv.example"), /HTTPS/);
assert.throws(
  () => normalizeInvidiousUrl("https://user:secret@inv.example"),
  /credenciales/,
);
assert.throws(() => normalizeInvidiousOrigin("http://inv.example"), /HTTPS/);
assert.throws(() => normalizeInvidiousOrigin("https://127.0.0.1"), /público/);
assert.throws(() => normalizeInvidiousOrigin("https://inv.example/path"), /ruta/);
assert.equal(normalizeInvidiousOrigin(instance), instance);

const selected = chooseInvidiousAudio(fixture(videoId), instance);
assert.equal(selected.mimeType, 'audio/mp4; codecs="mp4a.40.2"');
assert.equal(selected.bitrate, 128000);
assert.equal(selected.contentLength, 424242);
assert.match(selected.url, /^https:\/\/inv\.example\/videoplayback/);
assert(!selected.url.includes("googlevideo.com"));

let resolveRequest;
const serverResolution = await resolveInvidiousOnServer(videoId, {
  instanceUrl: `${instance}/`,
  fetchImpl: async (url, options) => {
    resolveRequest = { url: String(url), options };
    return new Response(JSON.stringify(fixture(videoId)), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  },
});
assert.equal(resolveRequest.url, `${instance}/api/v1/videos/${videoId}?local=true`);
assert.equal(resolveRequest.options.redirect, "error");
assert.equal(serverResolution.provider, "youtube-invidious-relay");
assert.equal(serverResolution.invidiousOrigin, instance);
assert.match(serverResolution.stream.url, /^https:\/\/inv\.example\/videoplayback/);
assert.equal(serverResolution.track.artwork, "https://i.ytimg.com/large.jpg");

const publicResolution = publicInvidiousResolution(serverResolution);
assert.equal(publicResolution.provider, "youtube-invidious-relay");
assert.equal(publicResolution.browserDirect, false);
assert.equal(publicResolution.invidiousOrigin, instance);
assert.equal(
  publicResolution.stream.url,
  `/api/music/invidious/audio/${videoId}?instance=${encodeURIComponent(instance)}`,
);
assert(!publicResolution.stream.url.includes("videoplayback"));
assert(!publicResolution.stream.url.includes("expire="));
assert(!JSON.stringify(publicResolution).includes(streamUrl(videoId)));

let jsonCalls = 0;
let audioCalls = 0;
const opened = await openInvidiousAudio(relayVideoId, instance, {
  range: "bytes=5-",
  fetchImpl: async (url, options) => {
    const requested = String(url);
    if (requested.includes("/api/v1/videos/")) {
      jsonCalls++;
      assert.equal(requested, `${instance}/api/v1/videos/${relayVideoId}?local=true`);
      return new Response(JSON.stringify(fixture(relayVideoId)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    audioCalls++;
    assert.equal(requested, streamUrl(relayVideoId));
    assert.equal(options.headers.range, "bytes=5-");
    assert.equal(options.headers["accept-encoding"], "identity");
    assert.equal(options.redirect, "error");
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 206,
      headers: {
        "content-type": "audio/mp4",
        "content-length": "3",
        "content-range": "bytes 5-7/8",
        "accept-ranges": "bytes",
      },
    });
  },
});
assert.equal(jsonCalls, 1);
assert.equal(audioCalls, 1);
assert.equal(opened.response.status, 206);
assert.equal(opened.response.headers.get("content-range"), "bytes 5-7/8");
await assert.rejects(
  openInvidiousAudio(relayVideoId, instance, {
    range: "items=0-1",
    fetchImpl: async () => new Response(),
  }),
  /rango/,
);

let browserRequest;
const browserResolution = await resolveInvidiousInBrowser(videoId, {
  instanceUrl: instance,
  fetchImpl: async (url, options) => {
    browserRequest = { url: String(url), options };
    return new Response(JSON.stringify(publicResolution), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  },
});
assert.equal(browserRequest.url, "/api/music/invidious/resolve");
assert.deepEqual(JSON.parse(browserRequest.options.body), { videoId, instanceUrl: instance });
assert.equal(browserResolution.stream.url, publicResolution.stream.url);

const originalFetch = globalThis.fetch;
const routeVideoId = "HandlerRly1";
const routeResponse = {
  statusCode: 0,
  headers: {},
  value: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value;
    return this;
  },
  json(value) {
    this.value = value;
    return this;
  },
};
try {
  globalThis.fetch = async (url) => {
    assert.equal(String(url), `${instance}/api/v1/videos/${routeVideoId}?local=true`);
    return new Response(JSON.stringify(fixture(routeVideoId)), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const { default: handler } = await import("../api/index.mjs");
  await handler(
    {
      query: { path: "music/invidious/resolve" },
      method: "POST",
      body: { videoId: routeVideoId, instanceUrl: instance },
      headers: {},
    },
    routeResponse,
  );
} finally {
  globalThis.fetch = originalFetch;
}
assert.equal(routeResponse.statusCode, 200);
assert.equal(routeResponse.headers["cache-control"], "no-store");
assert.equal(routeResponse.value.provider, "youtube-invidious-relay");
assert.equal(
  routeResponse.value.stream.url,
  `/api/music/invidious/audio/${routeVideoId}?instance=${encodeURIComponent(instance)}`,
);

const previousNodeEnv = process.env.NODE_ENV;
const previousVercelEnv = process.env.VERCEL_ENV;
const previousOrigins = process.env.HANAMI_INVIDIOUS_ALLOWED_ORIGINS;
try {
  process.env.NODE_ENV = "production";
  delete process.env.VERCEL_ENV;
  delete process.env.HANAMI_INVIDIOUS_ALLOWED_ORIGINS;
  assert.throws(() => normalizeInvidiousOrigin(instance), /HANAMI_INVIDIOUS_ALLOWED_ORIGINS/);
  process.env.HANAMI_INVIDIOUS_ALLOWED_ORIGINS = instance;
  assert.equal(normalizeInvidiousOrigin(instance), instance);
  assert.throws(
    () => normalizeInvidiousOrigin("https://other.example"),
    /no está autorizada/,
  );
} finally {
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
  if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = previousVercelEnv;
  if (previousOrigins === undefined) delete process.env.HANAMI_INVIDIOUS_ALLOWED_ORIGINS;
  else process.env.HANAMI_INVIDIOUS_ALLOWED_ORIGINS = previousOrigins;
}

const [api, services, serviceWorker, docs, env, packageText] = await Promise.all(
  [
    "../api/index.mjs",
    "../public/reader-music-services.js",
    "../public/sw.js",
    "../INVIDIOUS_RELAY_V134_1.md",
    "../.env.example",
    "../package.json",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
);
assert(api.includes("music/invidious/resolve"));
assert(api.includes("streamInvidiousAudio"));
assert(api.includes("openInvidiousAudio"));
assert(services.includes("/api/music/invidious/resolve"));
assert(services.includes("youtube-invidious-relay"));
assert(!services.includes("/api/v1/videos/"));
assert(!services.includes("/videoplayback"));
assert(serviceWorker.includes("hanami-crimson-knot-v134-1"));
assert(docs.includes("Browser → Hanami → Invidious"));
assert(env.includes("HANAMI_INVIDIOUS_ALLOWED_ORIGINS"));
assert.equal(JSON.parse(packageText).version, "5.8.68");

console.log(
  "PASS: v134.1 resolves and relays Invidious audio through Hanami, so browser CORS never touches the selected instance.",
);
