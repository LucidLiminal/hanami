import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import handler from "../api/index.mjs";

const [html, reader, services, more, sw, dev, favicon, packageText] = await Promise.all([
  readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  readFile(new URL("../public/reader.js", import.meta.url), "utf8"),
  readFile(new URL("../public/reader-music-services.js", import.meta.url), "utf8"),
  readFile(new URL("../public/more-tab.js", import.meta.url), "utf8"),
  readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  readFile(new URL("../dev.mjs", import.meta.url), "utf8"),
  readFile(new URL("../public/favicon.ico", import.meta.url)),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
]);

assert(html.includes('<meta name="mobile-web-app-capable" content="yes">'));
assert(html.includes('<meta name="apple-mobile-web-app-capable" content="yes">'));
assert(html.includes('<link rel="icon" href="/favicon.ico" sizes="any">'));
assert.equal(favicon.readUInt16LE(0), 0);
assert.equal(favicon.readUInt16LE(2), 1, "valid ICO header");
assert(favicon.length > 1000);
assert(sw.includes("hanami-crimson-knot-v139"));
assert(sw.includes("'/favicon.ico'"));
assert(dev.includes("url.pathname.startsWith('/api/')"));
assert(dev.includes("req.query.path = url.pathname.replace"));
assert(dev.includes("'.ico': 'image/x-icon'"));

const applyFunction = reader.match(/function apply\(\)\{.*?\}\nfunction unit/s)?.[0] || "";
assert(applyFunction);
assert(!applyFunction.includes("requestFullscreen"), "opening/rendering must never auto-request fullscreen");
assert(reader.includes("async function setFullscreen(enabled,control)"));
assert(reader.includes("t.dataset.pref==='fullscreen'"));
assert(reader.includes("document.addEventListener('fullscreenchange'"));
assert(reader.includes("fullscreen:false"));
assert(services.includes("La API musical no está activa"));
assert(services.includes("npm run dev"));

// The install event is deliberately deferred for Hanami's explicit Install
// button; prompt() is called only from that user action.
assert(more.includes("beforeinstallprompt"));
assert(more.includes("event.preventDefault()"));
assert(more.includes("await event.prompt()"));

let statusCode = 0;
let payload;
const response = {
  status(code) {
    statusCode = code;
    return this;
  },
  setHeader() {
    return this;
  },
  json(value) {
    payload = value;
    return value;
  },
  send(value) {
    payload = value;
    return value;
  },
};
await handler(
  { method: "GET", query: { path: "music/capabilities" }, body: undefined },
  response,
);
assert.equal(statusCode, 200);
assert.equal(payload.soundcloud.widget, true);
assert.equal(payload.soundcloud.proxiedPlayback, false);
assert.equal("equalizer" in payload, false);

const pkg = JSON.parse(packageText);
assert.equal(pkg.version, "5.13.0");
assert(pkg.scripts.test.includes("node tests/runtime-console-v130.test.mjs"));
assert(pkg.scripts.test.includes("node tests/soundcloud-widget-v135.test.mjs"));

console.log(
  "PASS: v130 serves the music API through the local runtime, adds modern PWA/favicon metadata, diagnoses static hosting and gates fullscreen behind an explicit user gesture",
);
