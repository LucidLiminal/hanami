import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pageFileName, pointContext } from "../public/reader-page-actions.js";

const files = {};
for (const name of [
  "public/reader.js", "public/reader-page-actions.js", "public/reader-music.js",
  "public/reader-music-services.js", "public/reader-music-discovery.js",
  "public/reader-actions.css", "public/social-sync.js", "public/index.html",
  "public/sw.js", "public/library.js", "public/app.js",
  "supabase/hanami-reader-music-v136.sql", "package.json",
]) files[name] = await readFile(new URL(`../${name}`, import.meta.url), "utf8");

const reader = files["public/reader.js"];
const actions = files["public/reader-page-actions.js"];
const services = files["public/reader-music-services.js"];
const sql = files["supabase/hanami-reader-music-v136.sql"];
assert(reader.includes("HanamiReaderPageActions?.open"));
assert(!reader.includes("HanamiReaderComments?.begin"), "long press must show choices, not directly open comments");
assert(!reader.includes("navigator.clipboard?.writeText(u)"), "copy must copy the image, not its URL");
assert(reader.includes("pinch.size===1"), "pinching must cancel the long-press menu");
assert(reader.includes("v.oncontextmenu="));
assert(reader.includes("e.key==='ContextMenu'"));
assert(reader.includes("reader-page-actions-overlay,.reader-comment-editor"));
for (const label of [
  "Poner como portada", "Copiar al portapapeles", "Compartir", "Guardar",
  "Hacer un comentario", "Instanciar una pista de música",
]) assert(actions.includes(label), label);
for (const token of [
  "new ClipboardItem", '"image/png": pngBlob(instance)', "files: [file]",
  "data-page-cover-accept", "originalThumbnailUrl", "customThumbnailUrl",
  "HanamiReaderComments?.begin", "openPicker({ context: instance.context })",
  "guardOpeningClick", "cleanupGesture",
  'window.HanamiScreens.push(\n      "reader-page-actions"',
]) assert(actions.includes(token), token);

const context = {
  title: "A/B: C?", chapterNumber: "12", pageIndex: 3, mangaUrl: "/manga/example",
};
assert.equal(pageFileName(context, "image/png"), "A-B- C- - 12 - 4.png");
assert.equal(pageFileName({ ...context, chapterNumber: 0 }, "application/pdf").endsWith(".pdf"), true);
assert(pageFileName({ ...context, chapterNumber: 0 }, "image/png").includes(" - 0 - "));
assert.equal(pageFileName({ title: "\u0000unsafe/name", pageIndex: 0 }, "image/webp").includes("\u0000"), false);

const figure = {
  dataset: {
    kind: "image", src: "/selected-chapter/page-4.png",
    commentContext: JSON.stringify({
      sourceId: "selected.source", mangaId: "manga-1", mangaUrl: "/selected-manga",
      chapterUrl: "/previous-loaded-chapter", pageIndex: 3, pageUrl: "/selected-chapter/page-4.png",
    }),
  },
  querySelector: () => ({ getBoundingClientRect: () => ({ left: 10, top: 20, width: 200, height: 400 }) }),
};
const point = pointContext(figure, 60, 320, { title: "Selected manga", mangaUrl: "/other-manga" });
assert.equal(point.x, 0.25);
assert.equal(point.y, 0.75);
assert.equal(point.chapterUrl, "/previous-loaded-chapter", "use the pressed figure, not the current chapter");
assert.equal(point.mangaUrl, "/selected-manga");
assert.equal(pointContext(figure, -10, 9999).x, 0);
assert.equal(pointContext(figure, -10, 9999).y, 1);

assert(services.includes('node.className = "reader-music-services reader-music-picker"'));
for (const token of [
  "data-music-picker-query", "urlOnly: true", "Por ahora, solo se aceptan URL",
  "PARA TI", "Escuchado recientemente", "TENDENCIAS", "Lo más sonado",
  "assignTrack(remote, instance.context)", "recentTracks()", "loadTrends()",
]) assert(services.includes(token), token);
assert(files["public/reader-music.js"].includes("sessionId: playbackSessionId"));
assert(files["public/reader-music.js"].includes('emit("listened")'));
assert(files["public/reader-actions.css"].includes("grid-template-columns: repeat(3"));
assert(files["public/reader-actions.css"].includes("prefers-reduced-motion"));
assert(files["public/library.js"].includes("customThumbnailUrl||d.thumbnailUrl"));
assert(files["public/app.js"].includes("customThumbnailUrl||manga.thumbnailUrl"));

for (const path of ["/reader-actions.css", "/reader-page-actions.js", "/reader-music-discovery.js"]) {
  assert(files["public/sw.js"].includes(path), `offline shell: ${path}`);
}
assert(files["public/index.html"].includes('src="/reader-page-actions.js"'));
assert(files["public/index.html"].includes('href="/reader-actions.css"'));
assert(files["public/sw.js"].includes("hanami-crimson-knot-v141"));
assert.equal(JSON.parse(files["package.json"]).version, "5.15.0");

// Isolated storage and public-track telemetry tests, without a browser or SDK.
const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
};
globalThis.dispatchEvent = () => true;
const remote = {
  id: "soundcloud-test", title: "Night Drive", artist: "Hanami",
  provider: "soundcloud", url: "https://soundcloud.com/hanami/night-drive",
  permalinkUrl: "https://soundcloud.com/hanami/night-drive?si=private-share",
  artwork: "https://i1.sndcdn.com/fixture.jpg", duration: 120,
};
const local = { id: "local-1", title: "Local Song", artist: "Local", type: "local", blob: "PRIVATE-BLOB" };
let identity = { configured: false, authenticated: false };
const sent = [];
globalThis.window = {
  HanamiReaderMusic: { listTracks: () => [remote, local], snapshot: () => ({ tracks: [remote, local] }) },
  HanamiReadingGroups: { activeId: () => "private-group" },
  HanamiSocialSync: {
    ready: Promise.resolve(),
    state: () => identity,
    recordMusicActivity: async (activity) => { sent.push(activity); },
    listMusicTrends: async () => [],
  },
};
const {
  canonicalMusicUrl, instancePageKey, noteListen, recentTracks,
  assignTrack, loadTrends, flushActivity, discoverySnapshot,
} = await import("../public/reader-music-discovery.js");
assert.equal(canonicalMusicUrl(remote.permalinkUrl), remote.url);
assert.equal(canonicalMusicUrl("https://m.soundcloud.com/hanami/night-drive/#t=3"), remote.url);
for (const url of [
  "night drive", "http://soundcloud.com/hanami/night-drive", "https://example.com/a/b",
  "https://soundcloud.com/hanami", "https://soundcloud.com/hanami/sets",
  "https://soundcloud.com/hanami/sets/album", "https://user:password@soundcloud.com/a/b",
  "https://on.soundcloud.com/short",
]) assert.equal(canonicalMusicUrl(url), "", url);
assert.notEqual(instancePageKey({ ...point, groupId: "one" }), instancePageKey({ ...point, groupId: "two" }));

assert(noteListen(remote, "session-1"));
assert.equal(noteListen(remote, "session-1"), false, "pause/resume callbacks cannot double count");
assert(noteListen(remote, "session-2"));
assert.equal(recentTracks()[0].playCount, 2);
assert(noteListen(local, "session-local"));
assert.equal(recentTracks()[0].id, local.id);
values.set("hanami-incognito", "true");
assert.equal(noteListen(remote, "session-incognito"), false);
values.set("hanami-incognito", "false");

const binding = assignTrack(remote, { ...point, x: 0.25, y: 0.75 });
assert.equal(binding.x, 0.25);
assert.equal(binding.y, 0.75);
assert.equal(assignTrack(remote, { ...point, x: 0.25, y: 0.75 }).id, binding.id);
assert.equal(sent.length, 0, "never silently create a community identity");
await loadTrends();
assert.equal(discoverySnapshot().trendsStatus, "unavailable");
assert.equal(discoverySnapshot().trends.length, 0, "local recents are not fake community trends");

identity = { configured: true, authenticated: true, user: { id: "user-one" } };
assert(noteListen(remote, "session-public"));
await new Promise((resolve) => setImmediate(resolve));
await flushActivity();
assert.equal(sent.length, 1);
assert.equal(sent[0].track.url, remote.url);
assert(!JSON.stringify(sent).includes("private-share"));
assert(!JSON.stringify(sent).includes(point.chapterUrl));
assert(!JSON.stringify(sent).includes("PRIVATE-BLOB"));
assert.equal(discoverySnapshot().pendingCount, 0);
assert(noteListen(local, "local-authenticated"));
assert.equal(sent.length, 1, "local audio files must never be sent to community metrics");

window.HanamiSocialSync.listMusicTrends = async () => [
  { url: remote.url, title: remote.title, artist: remote.artist, plays: "8", uses: "2", listeners: "3" },
  { url: "javascript:bad", title: "Invalid" },
];
await loadTrends();
assert.equal(discoverySnapshot().trendsStatus, "ready");
assert.equal(discoverySnapshot().trends.length, 1);
assert.equal(discoverySnapshot().trends[0].plays, 8);
window.HanamiSocialSync.listMusicTrends = async () => { throw Object.assign(new Error("schema cache"), { code: "PGRST202" }); };
await loadTrends();
assert.equal(discoverySnapshot().trendsStatus, "error");
assert(discoverySnapshot().trendsMessage.includes("hanami-reader-music-v136.sql"));

for (const token of [
  "enable row level security", "revoke all on public.reader_music_activity from anon, authenticated",
  "actor uuid := auth.uid()", "pg_advisory_xact_lock", "on conflict (id) do nothing",
  "auth.uid() is null or a.actor_id <> auth.uid()", "count(distinct a.actor_id)",
  "interval '30 days'", "to authenticated", "to anon, authenticated", "notify pgrst",
]) assert(sql.includes(token), token);
assert(!/returns table\s*\([^)]*actor_id/is.test(sql), "the aggregate response must not expose user IDs");
assert(files["public/social-sync.js"].includes('"/rest/v1/rpc/list_reader_music_trends"'));
assert(files["public/social-sync.js"].includes('"/rest/v1/rpc/record_reader_music_activity"'));
console.log("PASS: v136 six image actions, captured coordinates, URL-only picker, real recents, private page instances and authenticated community aggregates");