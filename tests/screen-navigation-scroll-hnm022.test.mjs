import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(
  new URL("../public/screen-history.js", import.meta.url),
  "utf8",
);
const listeners = new Map();
const frames = [];
const scrollCalls = [];
const history = { entries: [{}], index: 0 };

Object.assign(history, {
  replaceState(state) {
    this.entries[this.index] = structuredClone(state);
  },
  pushState(state) {
    this.entries.splice(this.index + 1);
    this.entries.push(structuredClone(state));
    this.index++;
  },
  back() {
    const next = this.index - 1;
    if (next < 0) return;
    this.index = next;
    const event = {
      type: "popstate",
      state: structuredClone(this.state),
      stopImmediatePropagation() {},
    };
    queueMicrotask(() => {
      for (const listener of listeners.get("popstate") || []) listener(event);
    });
  },
});
Object.defineProperties(history, {
  state: {
    configurable: true,
    get() {
      return this.entries[this.index];
    },
  },
  length: {
    configurable: true,
    get() {
      return this.entries.length;
    },
  },
});

const storage = new Map();
const context = {
  history,
  sessionStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
  },
  crypto: { randomUUID: () => `screen-${Math.random()}` },
  performance: { getEntriesByType: () => [{ type: "navigate" }] },
  scrollY: 0,
  scrollTo(options) {
    scrollCalls.push(options);
    context.scrollY = Number(options?.top) || 0;
  },
  requestAnimationFrame(callback) {
    frames.push(callback);
    return frames.length;
  },
  queueMicrotask,
  console: { debug() {} },
  CustomEvent: class {
    constructor(type, options) {
      this.type = type;
      this.detail = options?.detail;
    }
  },
  document: {
    body: { dataset: { root: "library" }, classList: { contains: () => false } },
    getElementById: () => null,
    querySelectorAll: () => [],
  },
  addEventListener(type, listener) {
    listeners.set(type, [...(listeners.get(type) || []), listener]);
  },
  dispatchEvent(event) {
    for (const listener of listeners.get(event.type) || []) listener(event);
  },
};
context.window = context;
vm.createContext(context);
vm.runInContext(source, context);

const flushFrames = () => {
  while (frames.length) frames.shift()();
};
const screen = () => context.HanamiScreens.current();

context.scrollY = 481;
const settingsId = context.HanamiScreens.push("more-settings", {
  name: "settings",
});
flushFrames();
assert.equal(scrollCalls.at(-1).top, 0);
assert.equal(scrollCalls.at(-1).left, 0);
assert.equal(scrollCalls.at(-1).behavior, "instant");
assert.equal(context.scrollY, 0);
assert.equal(
  context.HanamiScreens.snapshot().find((item) => item.type === "root").data
    ._scrollY,
  481,
  "opening a child preserves the departed root position",
);

context.scrollY = 236;
context.HanamiScreens.replace("more-setting", { name: "about" });
flushFrames();
assert.equal(screen().type, "more-setting");
assert.equal(context.scrollY, 0, "replacement child screens also start at top");

context.scrollY = 712;
context.HanamiScreens.push("reader-music", {});
flushFrames();
assert.equal(
  scrollCalls.filter((call) => call?.top === 0).length,
  2,
  "reader tools retain their own scroll owner instead of moving the document",
);

context.HanamiScreens.registerType("more-setting", () => true);
context.HanamiScreens.back();
await Promise.resolve();
await Promise.resolve();
await Promise.resolve();
flushFrames();
assert.equal(context.scrollY, 712, "Back restores the parent scroll position");
assert.equal(screen().id, settingsId);

console.log(
  "PASS: HNM-022 starts navigated screens at top while preserving Back and reader overlays",
);