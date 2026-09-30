import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  chooseInvidiousAudio,
  normalizeInvidiousUrl,
  resolveInvidiousAudio,
} from "../public/reader-music-services.js";

const videoId = "InvFallback";
const instance = "https://inv.example";
const expires = Math.floor(Date.now() / 1000) + 3600;

assert.equal(normalizeInvidiousUrl(`${instance}/`), instance);
assert.throws(
  () => normalizeInvidiousUrl("http://inv.example"),
  /HTTPS/,
);
assert.throws(
  () => normalizeInvidiousUrl("https://user:secret@inv.example"),
  /credenciales/,
);
assert.throws(
  () => normalizeInvidiousUrl("https://inv.example/subpath"),
  /solo el origen/,
);

const fixture = {
  title: "Crimson Night",
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
      url: `${instance}/videoplayback?id=${videoId}&expire=${expires}&fmt=251`,
      audioQuality: "AUDIO_QUALITY_MEDIUM",
    },
    {
      type: 'audio/mp4; codecs="mp4a.40.2"',
      bitrate: 128000,
      url: `${instance}/videoplayback?id=${videoId}&expire=${expires}&fmt=140`,
      audioQuality: "AUDIO_QUALITY_MEDIUM",
      audioSampleRate: "44100",
      audioChannels: 2,
      clen: "424242",
    },
    {
      type: 'audio/mp4; codecs="mp4a.40.2"',
      bitrate: 256000,
      url: `https://rr1---sn.invalid.googlevideo.com/videoplayback?id=${videoId}`,
    },
    {
      type: 'video/mp4; codecs="avc1.4d401f"',
      bitrate: 900000,
      url: `${instance}/videoplayback?id=${videoId}&expire=${expires}&fmt=136`,
    },
  ],
};

const selected = chooseInvidiousAudio(fixture, instance);
assert.equal(selected.mimeType, 'audio/mp4; codecs="mp4a.40.2"');
assert.equal(selected.bitrate, 128000);
assert.equal(selected.contentLength, 424242);
assert.match(selected.url, /^https:\/\/inv\.example\/videoplayback/);
assert(!selected.url.includes("googlevideo.com"));

let request;
const resolved = await resolveInvidiousAudio(videoId, {
  instanceUrl: `${instance}/`,
  fetchImpl: async (url, options) => {
    request = { url: String(url), options };
    return new Response(JSON.stringify(fixture), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-length": String(JSON.stringify(fixture).length),
        "access-control-allow-origin": "*",
      },
    });
  },
});

assert.equal(
  request.url,
  `${instance}/api/v1/videos/${videoId}?local=true`,
);
assert.equal(request.options.credentials, "omit");
assert.equal(request.options.referrerPolicy, "no-referrer");
assert.equal(resolved.provider, "youtube-invidious");
assert.equal(resolved.invidiousOrigin, instance);
assert.equal(resolved.browserDirect, true);
assert.equal(resolved.proxied, true);
assert.equal(resolved.track.title, "Crimson Night");
assert.equal(resolved.track.artist, "Hanami");
assert.equal(resolved.track.artwork, "https://i.ytimg.com/large.jpg");
assert(resolved.expiresAt > Date.now() + 30 * 60_000);
assert(!JSON.stringify(resolved).includes("googlevideo.com"));

await assert.rejects(
  resolveInvidiousAudio(videoId, {
    instanceUrl: instance,
    fetchImpl: async () =>
      new Response(JSON.stringify({ error: "disabled" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
  }),
  /desactivó o bloqueó/,
);

await assert.rejects(
  resolveInvidiousAudio(videoId, {
    instanceUrl: instance,
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          ...fixture,
          adaptiveFormats: [
            {
              type: "audio/mp4",
              bitrate: 128000,
              url: "https://rr1---sn.invalid.googlevideo.com/videoplayback",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  }),
  /stream de audio local/,
);

const [services, player, styles, serviceWorker, docs, packageText] = await Promise.all(
  [
    "../public/reader-music-services.js",
    "../public/reader-music.js",
    "../public/styles.css",
    "../public/sw.js",
    "../INVIDIOUS_FALLBACK_V134.md",
    "../package.json",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
);

for (const token of [
  "hanami-reader-invidious-v1",
  "resolveYouTubeWithFallback",
  "recoverLoadError",
  "local",
  "youtube-invidious",
  "browserDirect",
  "Hanami no rota servidores públicos",
])
  assert(services.includes(token), token);
assert(!services.includes("api.invidious.io/instances"));
assert(player.includes("playbackProvider"));
assert(player.includes("invidiousOrigin"));
assert(player.includes("externalServices?.recoverLoadError"));
assert(styles.includes("v134 — optional, user-selected Invidious fallback"));
assert(serviceWorker.includes("hanami-crimson-knot-v134"));
assert(docs.includes("No se incluye ninguna instancia pública predeterminada"));

const pkg = JSON.parse(packageText);
assert.equal(pkg.version, "5.8.67");
assert(pkg.scripts.test.startsWith("node tests/invidious-fallback-v134.test.mjs"));

console.log(
  "PASS: v134 uses an explicit user-selected Invidious instance only after Hanami fails, requires local proxied media and keeps Vercel out of the audio path",
);