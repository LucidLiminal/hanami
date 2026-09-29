import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Writable } from "node:stream";
import handler from "../api/index.mjs";
import {
  openYouTubeAudio,
  publicYouTubeResolution,
} from "../api/music-services.mjs";

const videoId = "PrOxYv131_A";
const future = Date.now() + 60 * 60_000;
process.env.HANAMI_YOUTUBE_RESOLVER_URL = "https://extractor.v131.test/resolve";
process.env.HANAMI_YOUTUBE_RESOLVER_TOKEN = "server-only";
const requests = [];
const fetchImpl = async (url, options = {}) => {
  requests.push({ url: String(url), options });
  if (String(url) === process.env.HANAMI_YOUTUBE_RESOLVER_URL)
    return new Response(
      JSON.stringify({
        stream: {
          url: "https://rr1---sn-test.googlevideo.com/videoplayback?id=v131",
          mimeType: 'audio/mp4; codecs="mp4a.40.2"',
          bitrate: 128000,
        },
        expiresAt: future,
        track: { title: "Proxy Test", artist: "Hanami", duration: 180 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  if (String(url).includes("googlevideo.com"))
    return new Response(Uint8Array.from([0, 0, 0, 24, 102, 116, 121, 112]), {
      status: 206,
      headers: {
        "content-type": "audio/mp4",
        "content-length": "8",
        "content-range": "bytes 0-7/3000000",
        "accept-ranges": "bytes",
      },
    });
  throw new Error(`Unexpected URL ${url}`);
};

const opened = await openYouTubeAudio(videoId, {
  range: "bytes=0-7",
  fetchImpl,
});
assert.equal(opened.response.status, 206);
assert.equal(opened.response.headers.get("content-range"), "bytes 0-7/3000000");
assert.equal(requests.length, 2);
assert.equal(requests[0].options.headers.authorization, "Bearer server-only");
assert.equal(requests[1].options.headers.range, "bytes=0-7");
assert(!("origin" in requests[1].options.headers));
await assert.rejects(
  openYouTubeAudio(videoId, {
    range: "bytes=0-7,10-17",
    fetchImpl,
  }),
  (error) => error.statusCode === 416 && error.kind === "validation",
);

const retryVideoId = "ReTrYv131_C";
let resolverCalls = 0;
let remoteCalls = 0;
const retried = await openYouTubeAudio(retryVideoId, {
  fetchImpl: async (url, options = {}) => {
    if (String(url) === process.env.HANAMI_YOUTUBE_RESOLVER_URL) {
      resolverCalls++;
      return new Response(
        JSON.stringify({
          stream: {
            url: `https://rr1---sn-test.googlevideo.com/videoplayback?id=retry-${resolverCalls}`,
            mimeType: "audio/mp4",
          },
          expiresAt: future,
        }),
        { status: 200 },
      );
    }
    remoteCalls++;
    if (remoteCalls <= 3) return new Response("", { status: 403 });
    return new Response(Uint8Array.from([9]), {
      status: 206,
      headers: { "content-type": "audio/mp4", "content-range": "bytes 0-0/1" },
    });
  },
});
assert.equal(retried.response.status, 206);
assert.equal(resolverCalls, 2, "403 forces one fresh InnerTube resolution");
assert.equal(remoteCalls, 4, "three header strategies precede the fresh stream");

const publicResult = publicYouTubeResolution(opened.resolution);
assert.equal(publicResult.proxied, true);
assert.equal(publicResult.stream.url, `/api/music/youtube/audio/${videoId}`);
assert(!JSON.stringify(publicResult).includes("googlevideo.com"));
delete process.env.HANAMI_YOUTUBE_RESOLVER_URL;
delete process.env.HANAMI_YOUTUBE_RESOLVER_TOKEN;

const routeVideoId = "RoUtEv131_B";
process.env.HANAMI_YOUTUBE_RESOLVER_URL = "https://extractor.v131.test/resolve";
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  if (String(url) === process.env.HANAMI_YOUTUBE_RESOLVER_URL)
    return new Response(
      JSON.stringify({
        stream: {
          url: "https://rr1---sn-test.googlevideo.com/videoplayback?id=route-v131",
          mimeType: "audio/mp4",
        },
        expiresAt: future,
      }),
      { status: 200 },
    );
  if (String(url).includes("googlevideo.com")) {
    assert.equal(options.headers.range, "bytes=10-17");
    return new Response(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]), {
      status: 206,
      headers: {
        "content-type": "audio/mp4",
        "content-length": "8",
        "content-range": "bytes 10-17/3000000",
        "accept-ranges": "bytes",
      },
    });
  }
  throw new Error(`Unexpected route URL ${url}`);
};
class AudioResponse extends Writable {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = {};
    this.chunks = [];
  }
  status(code) {
    this.statusCode = code;
    return this;
  }
  setHeader(name, value) {
    this.headers[String(name).toLowerCase()] = String(value);
    return this;
  }
  _write(chunk, _encoding, callback) {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }
}
const routeResponse = new AudioResponse();
const finished = new Promise((resolve, reject) => {
  routeResponse.once("finish", resolve);
  routeResponse.once("error", reject);
});
await handler(
  {
    method: "GET",
    headers: { range: "bytes=10-17" },
    query: { path: `music/youtube/audio/${routeVideoId}` },
  },
  routeResponse,
);
await finished;
assert.equal(routeResponse.statusCode, 206);
assert.equal(routeResponse.headers["content-type"], "audio/mp4");
assert.equal(routeResponse.headers["content-range"], "bytes 10-17/3000000");
assert.equal(routeResponse.headers["access-control-allow-origin"], "*");
assert.equal(Buffer.concat(routeResponse.chunks).length, 8);
globalThis.fetch = originalFetch;
delete process.env.HANAMI_YOUTUBE_RESOLVER_URL;

const [api, music, client, e2e, sw, packageText] = await Promise.all(
  [
    "../api/index.mjs",
    "../api/music-services.mjs",
    "../public/reader-music-services.js",
    "../tests/music-services-mobile-v129.e2e.mjs",
    "../public/sw.js",
    "../package.json",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
);
assert(api.includes("openYouTubeAudio"));
assert(api.includes("publicYouTubeResolution"));
assert(api.includes("parts[2]==='audio'"));
assert(api.includes("Readable.fromWeb(response.body)"));
assert(api.includes("'content-range'"));
assert(api.includes("'access-control-allow-origin','*'"));
assert(api.indexOf("parts[2]==='audio'") < api.indexOf("if(parts[0]==='music')return"));
assert(music.includes("proxiedPlayback: true"));
assert(music.includes("/api/music/youtube/audio/"));
assert(client.includes("resolved.stream.url"));
assert(client.includes("Migrates v129/v130 records"));
assert(client.includes("track.url === proxyUrl"));
assert(e2e.includes("/api/music/youtube/audio/${videoId}"));
assert(sw.includes("hanami-googlevideo-retry-v132"));
const pkg = JSON.parse(packageText);
assert.equal(pkg.version, "5.8.65");
assert(pkg.scripts.test.includes("node tests/youtube-audio-proxy-v131.test.mjs"));

console.log(
  "PASS: v131 keeps signed Googlevideo URLs server-side and relays byte ranges through a same-origin audio endpoint for playback, seeking and Web Audio effects",
);
