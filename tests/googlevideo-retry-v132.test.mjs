import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  publicYouTubeResolution,
  resolveYouTubeAudio,
  searchYouTubeMusic,
} from "../api/music-services.mjs";

const videoId = "ReTrYv132_D";
const searchResponse = {
  responseContext: { visitorData: "visitor-v132" },
  contents: {
    tabbedSearchResultsRenderer: {
      tabs: [],
    },
  },
};
await searchYouTubeMusic("retry-session-v132", {
  fetchImpl: async () =>
    new Response(JSON.stringify(searchResponse), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": "VISITOR_INFO1_LIVE=visitor-cookie-v132; Path=/; Secure",
      },
    }),
});
let playerRequest;
const resolved = await resolveYouTubeAudio(videoId, {
  fetchImpl: async (_url, options) => {
    playerRequest = { headers: options.headers, body: JSON.parse(options.body) };
    return new Response(
      JSON.stringify({
        playabilityStatus: { status: "OK" },
        responseContext: { visitorData: "visitor-v132-player" },
        videoDetails: { title: "Retry", author: "Hanami", lengthSeconds: "120" },
        streamingData: {
          adaptiveFormats: [
            {
              itag: 140,
              mimeType: 'audio/mp4; codecs="mp4a.40.2"',
              bitrate: 128000,
              url: "https://rr1---sn-test.googlevideo.com/videoplayback?id=retry-v132",
            },
          ],
        },
      }),
      { status: 200 },
    );
  },
});
assert.equal(playerRequest.body.context.client.visitorData, "visitor-v132");
assert.equal(playerRequest.headers["x-goog-visitor-id"], "visitor-v132");
assert.match(playerRequest.headers.cookie, /VISITOR_INFO1_LIVE=visitor-cookie-v132/);
assert.equal(resolved.proxyHeaders["x-youtube-client-name"], "3");
assert.equal(resolved.proxyHeaders["x-goog-visitor-id"], "visitor-v132-player");
assert.match(resolved.proxyHeaders.cookie, /VISITOR_INFO1_LIVE=visitor-cookie-v132/);
const publicResult = publicYouTubeResolution(resolved);
assert(!("proxyHeaders" in publicResult));
assert(!JSON.stringify(publicResult).includes("visitor-v132"));
assert.equal(publicResult.stream.url, `/api/music/youtube/audio/${videoId}`);

const [music, docs, sw, packageText] = await Promise.all(
  [
    "../api/music-services.mjs",
    "../GOOGLEVIDEO_RETRY_V132.md",
    "../public/sw.js",
    "../package.json",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
);
for (const token of [
  'setDefaultResultOrder("ipv4first")',
  "latestInnerTubeVisitorData",
  "latestInnerTubeCookie",
  "rememberInnerTubeSession",
  "preferWeb",
  '"accept-encoding": "identity"',
  "forceRefresh: true",
  "WEB_REMIX",
])
  assert(music.includes(token), token);
assert(docs.includes("Retry path"));
assert(sw.includes("hanami-crimson-knot-v134"));
const pkg = JSON.parse(packageText);
assert.equal(pkg.version, "5.8.67");
assert(pkg.scripts.test.includes("node tests/googlevideo-retry-v132.test.mjs"));

console.log(
  "PASS: v132 keeps the anonymous InnerTube session server-side, uses IPv4-first media retrieval and refreshes with Web Remix after Googlevideo 403 responses",
);
