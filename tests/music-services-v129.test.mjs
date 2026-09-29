import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  chooseAudioStream,
  fetchExternalLyrics,
  musicCapabilities,
  parseShazamResponse,
  parseYouTubeMusicSearch,
  recognizeShazam,
  resolveYouTubeAudio,
  searchYouTubeMusic,
} from "../api/music-services.mjs";
import { parseLrc } from "../public/reader-music-services.js";
import { signatureFromPcm } from "../public/music-recognition.js";

const videoId = "AbCdEfGhI_1";
const searchFixture = {
  contents: {
    tabbedSearchResultsRenderer: {
      tabs: [
        {
          tabRenderer: {
            content: {
              sectionListRenderer: {
                contents: [
                  {
                    musicShelfRenderer: {
                      contents: [
                        {
                          musicResponsiveListItemRenderer: {
                            flexColumns: [
                              {
                                musicResponsiveListItemFlexColumnRenderer: {
                                  text: { runs: [{ text: "Night Drive" }] },
                                },
                              },
                              {
                                musicResponsiveListItemFlexColumnRenderer: {
                                  text: {
                                    runs: [
                                      { text: "Canción" },
                                      { text: " • " },
                                      { text: "Akari" },
                                      { text: " • " },
                                      { text: "Moon City" },
                                      { text: " • " },
                                      { text: "3:42" },
                                    ],
                                  },
                                },
                              },
                            ],
                            overlay: {
                              musicItemThumbnailOverlayRenderer: {
                                content: {
                                  musicPlayButtonRenderer: {
                                    playNavigationEndpoint: { watchEndpoint: { videoId } },
                                  },
                                },
                              },
                            },
                            thumbnail: {
                              musicThumbnailRenderer: {
                                thumbnail: {
                                  thumbnails: [
                                    { url: "https://i.ytimg.com/small.jpg", width: 60, height: 60 },
                                    { url: "https://i.ytimg.com/large.jpg", width: 240, height: 240 },
                                  ],
                                },
                              },
                            },
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      ],
    },
  },
};

const parsedSearch = parseYouTubeMusicSearch(searchFixture);
assert.equal(parsedSearch.length, 1);
assert.deepEqual(
  {
    id: parsedSearch[0].videoId,
    title: parsedSearch[0].title,
    artist: parsedSearch[0].artist,
    album: parsedSearch[0].album,
    duration: parsedSearch[0].duration,
    artwork: parsedSearch[0].artwork,
  },
  {
    id: videoId,
    title: "Night Drive",
    artist: "Akari",
    album: "Moon City",
    duration: 222,
    artwork: "https://i.ytimg.com/large.jpg",
  },
);

let searchRequest;
const searchFetch = async (url, options) => {
  searchRequest = { url: String(url), options, body: JSON.parse(options.body) };
  return new Response(JSON.stringify(searchFixture), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
const searched = await searchYouTubeMusic("Night Drive Akari v129", { fetchImpl: searchFetch });
assert.equal(searched.results[0].videoId, videoId);
assert(searchRequest.url.includes("youtubei/v1/search"));
assert.equal(searchRequest.options.headers["x-youtube-client-name"], "67");
assert.equal(searchRequest.body.context.client.clientName, "WEB_REMIX");
assert.equal(searchRequest.body.query, "Night Drive Akari v129");
assert(searchRequest.body.params.includes("EgWKAQII"));

const future = Math.floor(Date.now() / 1000) + 3600;
const playerFixture = {
  playabilityStatus: { status: "OK" },
  videoDetails: { title: "Night Drive", author: "Akari", lengthSeconds: "222" },
  streamingData: {
    adaptiveFormats: [
      {
        itag: 251,
        mimeType: 'audio/webm; codecs="opus"',
        bitrate: 160000,
        url: `https://rr.example.googlevideo.com/audio.webm?expire=${future}`,
      },
      {
        itag: 140,
        mimeType: 'audio/mp4; codecs="mp4a.40.2"',
        bitrate: 128000,
        url: `https://rr.example.googlevideo.com/audio.m4a?expire=${future}`,
      },
      {
        itag: 22,
        mimeType: 'video/mp4; codecs="avc1"',
        bitrate: 999000,
        url: "https://rr.example.googlevideo.com/video.mp4",
      },
    ],
  },
};
assert.equal(chooseAudioStream(playerFixture).itag, 140, "browser-compatible M4A is preferred");
let playerRequest;
const playerFetch = async (url, options) => {
  playerRequest = { url: String(url), body: JSON.parse(options.body), headers: options.headers };
  return new Response(JSON.stringify(playerFixture), { status: 200 });
};
const resolved = await resolveYouTubeAudio(videoId, { fetchImpl: playerFetch });
assert.equal(resolved.stream.itag, 140);
assert.equal(resolved.videoId, videoId);
assert(resolved.expiresAt > Date.now());
assert.equal(playerRequest.body.videoId, videoId);
assert.equal(playerRequest.body.context.client.clientName, "ANDROID");

let adapterRequest;
process.env.HANAMI_YOUTUBE_RESOLVER_URL = "https://extractor.hanami.test/resolve";
process.env.HANAMI_YOUTUBE_RESOLVER_TOKEN = "test-token";
const adapterResolved = await resolveYouTubeAudio("QwErTyUiO_3", {
  fetchImpl: async (url, options) => {
    adapterRequest = { url: String(url), options, body: JSON.parse(options.body) };
    return new Response(
      JSON.stringify({
        stream: {
          url: `https://cdn.hanami.test/audio.m4a?expire=${future}`,
          mimeType: 'audio/mp4; codecs="mp4a.40.2"',
          bitrate: 128000,
        },
        track: { title: "Configured", artist: "Extractor", duration: 180 },
        expiresAt: future * 1000,
      }),
      { status: 200 },
    );
  },
});
assert.equal(adapterResolved.provider, "youtube-extractor-adapter");
assert.equal(adapterResolved.track.title, "Configured");
assert.equal(adapterRequest.url, process.env.HANAMI_YOUTUBE_RESOLVER_URL);
assert.equal(adapterRequest.options.headers.authorization, "Bearer test-token");
assert.deepEqual(adapterRequest.body, { videoId: "QwErTyUiO_3" });
delete process.env.HANAMI_YOUTUBE_RESOLVER_URL;
delete process.env.HANAMI_YOUTUBE_RESOLVER_TOKEN;

const cipherFetch = async () =>
  new Response(
    JSON.stringify({
      playabilityStatus: { status: "OK" },
      streamingData: {
        adaptiveFormats: [
          {
            itag: 251,
            mimeType: 'audio/webm; codecs="opus"',
            signatureCipher: "s=protected&url=https%3A%2F%2Fexample.invalid",
          },
        ],
      },
    }),
    { status: 200 },
  );
await assert.rejects(
  resolveYouTubeAudio("ZyXwVuTsR_2", { fetchImpl: cipherFetch }),
  (error) => error.statusCode === 422 && error.kind === "signature_required",
);

const rate = 16000;
const pcm = new Int16Array(rate * 6);
let seed = 123456789;
for (let index = 0; index < pcm.length; index++) {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  const noise = (seed / 2 ** 32) * 2 - 1;
  const time = index / rate;
  const frequency = 260 + (1200 * index) / pcm.length;
  const value =
    0.42 * Math.sin(2 * Math.PI * frequency * time) +
    0.28 * Math.sin(2 * Math.PI * frequency * 2.17 * time) +
    noise * 0.09;
  pcm[index] = Math.max(-32768, Math.min(32767, Math.round(value * 24000)));
}
const signature = signatureFromPcm(pcm, rate);
assert(signature);
assert(signature.peakCount > 0);
assert(signature.sampleDurationMs >= 3000);
const signatureBytes = Buffer.from(signature.uri.split(",")[1], "base64");
assert.equal(signatureBytes.readUInt32LE(0), 0xcafe2580);
assert.notEqual(signatureBytes.readUInt32LE(4), 0, "CRC32 is written into the payload");

const shazamFixture = {
  tagid: "tag-1",
  track: {
    key: "track-1",
    title: "Night Drive",
    subtitle: "Akari",
    url: "https://www.shazam.com/track/1",
    isrc: "JPABC1234567",
    images: { coverart: "https://img.example/cover.jpg" },
    genres: { primary: "Electronic" },
    sections: [
      {
        type: "SONG",
        metadata: [
          { title: "Album", text: "Moon City" },
          { title: "Released", text: "2026" },
        ],
      },
      { type: "LYRICS", text: "City lights" },
    ],
    hub: {
      options: [
        {
          type: "video",
          actions: [{ uri: `https://www.youtube.com/watch?v=${videoId}` }],
        },
      ],
      providers: [],
    },
  },
};
assert.equal(parseShazamResponse(shazamFixture).videoId, videoId);
let shazamRequest;
const shazamFetch = async (url, options) => {
  shazamRequest = { url: String(url), body: JSON.parse(options.body) };
  return new Response(JSON.stringify(shazamFixture), { status: 200 });
};
const recognized = await recognizeShazam(signature.uri, signature.sampleDurationMs, {
  fetchImpl: shazamFetch,
});
assert.equal(recognized.track.title, "Night Drive");
assert.equal(recognized.track.album, "Moon City");
assert(shazamRequest.url.includes("amp.shazam.com/discovery/v5"));
assert.equal(shazamRequest.body.signature.uri, signature.uri);

const lyricsFetch = async (url) => {
  const parsed = new URL(url);
  if (parsed.pathname.endsWith("/api/get"))
    return new Response(JSON.stringify(null), { status: 404 });
  if (parsed.pathname.endsWith("/api/search"))
    return new Response(
      JSON.stringify([
        { duration: 400, plainLyrics: "Wrong duration" },
        {
          duration: 222,
          syncedLyrics: "[00:01.00]City lights\n[00:03.50]Keep moving",
        },
      ]),
      { status: 200 },
    );
  throw new Error(`Unexpected lyrics URL: ${url}`);
};
const lyrics = await fetchExternalLyrics(
  { title: "Night Drive (Official Video)", artist: "Akari - Topic", duration: 222, videoId },
  { fetchImpl: lyricsFetch },
);
assert.equal(lyrics.provider, "LRCLIB");
assert.equal(lyrics.type, "synced");
assert(lyrics.lyrics.includes("City lights"));
const lrc = parseLrc("[ar:Akari]\n[00:01.00][00:02.00]City lights\n[00:03.50]Keep moving");
assert.equal(lrc.synced, true);
assert.equal(lrc.lines.length, 3);
assert.deepEqual(lrc.lines.map((line) => line.time), [1, 2, 3.5]);

const capabilities = musicCapabilities();
assert.equal(capabilities.youtube.directAudioOnly, true);
assert.equal(capabilities.youtube.signatureDecipher, false);
assert.equal(capabilities.youtube.drmBypass, false);
assert.equal(capabilities.equalizer.bands, 10);

const [
  api,
  serverMusic,
  readerMusic,
  services,
  recognition,
  equalizerSource,
  html,
  css,
  sw,
  readme,
  notices,
  packageText,
] = await Promise.all(
  [
    "../api/index.mjs",
    "../api/music-services.mjs",
    "../public/reader-music.js",
    "../public/reader-music-services.js",
    "../public/music-recognition.js",
    "../public/music-equalizer.js",
    "../public/index.html",
    "../public/styles.css",
    "../public/sw.js",
    "../README.md",
    "../THIRD_PARTY_NOTICES.md",
    "../package.json",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
);

for (const route of [
  "music/capabilities",
  "music/youtube/search",
  "music/youtube/resolve",
  "music/recognize",
  "music/lyrics",
])
  assert(api.includes(route), route);
for (const token of [
  "WEB_REMIX",
  "signatureCipher",
  "validateShazamSignature",
  "lrclib.net",
  "unison.boidu.dev",
  "lyrics.paxsenix.org",
  "lyrics-api.boidu.dev",
])
  assert(serverMusic.includes(token), token);
for (const token of [
  "data-music-youtube-query",
  "data-music-youtube-add",
  "data-music-recognize",
  "data-music-load-lyrics",
  "data-music-eq-enabled",
  "beforeLoad",
])
  assert(services.includes(token), token);
assert(readerMusic.includes("registerExternalServices"));
assert(readerMusic.includes('metadata.provider === "youtube"'));
assert(recognition.includes("0xcafe2580"));
assert(recognition.includes("getUserMedia"));
assert(equalizerSource.includes("createMediaElementSource"));
assert(equalizerSource.includes("createBiquadFilter"));
assert(equalizerSource.includes("createChannelSplitter"));
assert(html.includes('src="/reader-music-services.js"'));
for (const file of ["reader-music-services.js", "music-recognition.js", "music-equalizer.js"])
  assert(sw.includes(`'/${file}'`), file);
assert(sw.includes("hanami-reader-music-v129"));
assert(css.includes("Reader Music External Services v129"));
assert(readme.includes("sin pegar"));
assert(readme.includes("InnerTube"));
assert(notices.includes("ShazamSignatureGenerator.kt"));
assert(notices.includes("does not implement signature deciphering"));
const pkg = JSON.parse(packageText);
assert.equal(pkg.version, "5.8.62");
assert(pkg.scripts.test.startsWith("node tests/music-services-v129.test.mjs"));

console.log(
  "PASS: v129 ports search-first InnerTube playback, Shazam-compatible recognition, resilient external lyrics and a persistent 10-band Web Audio effects chain",
);
