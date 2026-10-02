import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  musicCapabilities,
  normalizeSoundCloudOEmbed,
  normalizeSoundCloudTrack,
  normalizeSoundCloudUrl,
  resetSoundCloudAuthForTests,
  resolveSoundCloudUrl,
  searchSoundCloud,
} from "../api/music-services.mjs";

const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

assert.equal(
  normalizeSoundCloudUrl("https://soundcloud.com/hanami/night-drive#comments"),
  "https://soundcloud.com/hanami/night-drive",
);
assert.equal(
  normalizeSoundCloudUrl("https://on.soundcloud.com/example"),
  "https://on.soundcloud.com/example",
);
assert.equal(
  normalizeSoundCloudUrl(
    "https://soundcloud.com/katyperry/last-friday-night-t-g-i-f?utm_source=clipboard&utm_medium=text&utm_campaign=social_sharing",
  ),
  "https://soundcloud.com/katyperry/last-friday-night-t-g-i-f",
);
assert.throws(
  () => normalizeSoundCloudUrl("https://soundcloud.com.evil.test/track"),
  /soundcloud\.com/i,
);
assert.throws(
  () => normalizeSoundCloudUrl("http://soundcloud.com/artist/track"),
  /HTTPS/i,
);

const oembedFixture = {
  title: "Night Drive by Akari",
  author_name: "Akari",
  author_url: "https://soundcloud.com/akari",
  thumbnail_url:
    "https://i1.sndcdn.com/artworks-example-large.jpg",
  html:
    '<iframe src="https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/123456&amp;show_artwork=true"></iframe>',
};
const embedded = normalizeSoundCloudOEmbed(
  oembedFixture,
  "https://soundcloud.com/akari/night-drive",
);
assert.equal(embedded.title, "Night Drive");
assert.equal(embedded.artist, "Akari");
assert.equal(embedded.soundcloudId, "123456");
assert.equal(embedded.soundcloudUrn, "soundcloud:tracks:123456");
assert.match(embedded.artwork, /-t500x500\.jpg$/);
assert.throws(
  () =>
    normalizeSoundCloudOEmbed(
      {
        ...oembedFixture,
        html:
          '<iframe src="https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/playlists/99"></iframe>',
      },
      "https://soundcloud.com/akari/sets/night-drive",
    ),
  /no el de un perfil o una lista/i,
);

let oembedRequest = "";
const resolved = await resolveSoundCloudUrl(
  "https://soundcloud.com/akari/night-drive?si=share",
  {
    fetchImpl: async (url) => {
      oembedRequest = String(url);
      return json(oembedFixture);
    },
  },
);
assert.equal(resolved.provider, "soundcloud-widget");
assert.equal(resolved.track.soundcloudId, "123456");
assert.match(oembedRequest, /^https:\/\/soundcloud\.com\/oembed\?/);
assert.match(oembedRequest, /format=json/);

const normalized = normalizeSoundCloudTrack({
  id: 22,
  urn: "soundcloud:tracks:22",
  title: "Crimson Reader",
  metadata_artist: "Hanami",
  permalink_url: "https://soundcloud.com/hanami/crimson-reader",
  artwork_url: "https://i1.sndcdn.com/artworks-test-large.jpg",
  duration: 185_000,
  access: "playable",
  streamable: true,
  embeddable_by: "all",
  user: {
    username: "Hanami",
    permalink_url: "https://soundcloud.com/hanami",
    verified: true,
  },
});
assert.equal(normalized.duration, 185);
assert.equal(normalized.durationText, "3:05");
assert.equal(normalized.verified, true);
assert.equal(
  normalizeSoundCloudTrack({
    ...normalized,
    permalink_url: normalized.permalinkUrl,
    access: "blocked",
  }),
  null,
);

process.env.HANAMI_SOUNDCLOUD_CLIENT_ID = "client-id";
process.env.HANAMI_SOUNDCLOUD_CLIENT_SECRET = "client-secret";
resetSoundCloudAuthForTests();
const calls = [];
const searchFetch = async (url, options = {}) => {
  calls.push({ url: String(url), options });
  if (String(url) === "https://secure.soundcloud.com/oauth/token") {
    assert.equal(options.method, "POST");
    assert.match(options.headers.authorization, /^Basic /);
    assert.match(String(options.body), /grant_type=client_credentials/);
    return json({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3_600,
    });
  }
  assert.match(String(url), /^https:\/\/api\.soundcloud\.com\/tracks\?/);
  assert.equal(options.headers.authorization, "OAuth access-token");
  return json({
    collection: [
      {
        id: 22,
        urn: "soundcloud:tracks:22",
        title: "Crimson Reader",
        metadata_artist: "Hanami",
        permalink_url: "https://soundcloud.com/hanami/crimson-reader",
        duration: 185_000,
        access: "playable",
        streamable: true,
        embeddable_by: "all",
        user: {
          username: "Hanami",
          permalink_url: "https://soundcloud.com/hanami",
        },
      },
      {
        id: 23,
        title: "Blocked",
        permalink_url: "https://soundcloud.com/hanami/blocked",
        duration: 10_000,
        access: "blocked",
        streamable: false,
      },
      {
        id: 24,
        title: "Private embed",
        permalink_url: "https://soundcloud.com/hanami/private-embed",
        duration: 10_000,
        access: "playable",
        streamable: true,
        embeddable_by: "me",
      },
    ],
  });
};
const searched = await searchSoundCloud("Crimson Reader v135", {
  fetchImpl: searchFetch,
});
assert.equal(searched.provider, "soundcloud");
assert.equal(searched.results.length, 1);
assert.equal(searched.results[0].soundcloudUrn, "soundcloud:tracks:22");
assert.equal(searched.omitted, 2);
assert.equal(calls.filter((call) => call.url.includes("/oauth/token")).length, 1);
assert.equal(musicCapabilities().soundcloud.searchConfigured, true);
delete process.env.HANAMI_SOUNDCLOUD_CLIENT_ID;
delete process.env.HANAMI_SOUNDCLOUD_CLIENT_SECRET;
resetSoundCloudAuthForTests();
await assert.rejects(
  searchSoundCloud("No credentials v135", {
    fetchImpl: async () => {
      throw new Error("No debería llamar a la red");
    },
  }),
  (error) =>
    error?.statusCode === 503 && error?.kind === "soundcloud_not_configured",
);

const [apiIndex, backend, services, player, styles, sw, packageText] =
  await Promise.all(
    [
      "../api/index.mjs",
      "../api/music-services.mjs",
      "../public/reader-music-services.js",
      "../public/reader-music.js",
      "../public/styles.css",
      "../public/sw.js",
      "../package.json",
    ].map((file) => readFile(new URL(file, import.meta.url), "utf8")),
  );
for (const legacy of ["music/youtube", "music/invidious"]) {
  assert(!apiIndex.includes(legacy), legacy);
}
for (const source of [backend, services]) {
  assert(!/youtube|invidious/i.test(source));
}
assert(apiIndex.includes("music/soundcloud/search"));
assert(apiIndex.includes("music/soundcloud/resolve"));
assert(services.includes("https://w.soundcloud.com/player/api.js"));
assert(!services.includes("script.crossOrigin"));
assert(services.includes("if (existing) existing.remove();"));
assert(services.includes('frame.allow = "autoplay; encrypted-media"'));
assert(services.includes("armWidgetPlayProbe"));
assert(services.includes("completeWidgetPending"));
assert(services.includes("pollPendingSound"));
assert(services.includes("canonicalSoundCloudUrl"));
assert(services.includes("startWidgetStatePolling"));
assert(services.includes("pollPendingSound(widgetState.pending);"));
assert(
  services.includes(
    "completeWidgetPending({ playing: true, refreshDuration: false })",
  ),
);
assert(
  services.includes(
    "SoundCloud no entregó audio para esta pista. Prueba otra versión o ábrela en SoundCloud.",
  ),
);
assert(
  services.indexOf("host.replaceChildren(frame);") <
    services.indexOf("globalThis.SC.Widget(frame)"),
);
assert(services.includes("events.PLAY_PROGRESS"));
assert(services.includes("data-music-soundcloud-query"));
assert(services.includes("data-music-soundcloud-add"));
assert(services.includes("handlesPlayback"));
assert(player.includes("externalServices.loadPlayback"));
assert(player.includes("updateExternalPlayback"));
assert(player.includes('metadata.provider === "soundcloud"'));
assert(styles.includes(".hanami-soundcloud-engine"));
assert(styles.includes(".reader-music-soundcloud-source"));
assert(sw.includes("hanami-crimson-knot-v1354"));
const pkg = JSON.parse(packageText);
assert.equal(pkg.version, "5.9.4");

console.log(
  "PASS: v135.4 confirms every load through getCurrentSound, strips tracking parameters and keeps playback state synchronized even when Widget events are missing.",
);