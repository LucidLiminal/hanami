import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
const source = await fs.readFile(
  new URL("../public/screen-history.js", import.meta.url),
  "utf8",
);

function harness(saved) {
  const storage = saved?.storage || new Map(),
    listeners = new Map(),
    pending = new Set(),
    notifications = [],
    calls = [];
  let serial = 0;
  const history = saved?.history || { entries: [{}], index: 0 };
  const runEvent = (e) => {
    for (const fn of listeners.get(e.type) || []) {
      const result = fn(e);
      if (result?.then) {
        pending.add(result);
        result.finally(() => pending.delete(result)).catch(() => {});
      }
      if (e.stopped) break;
    }
    return true;
  };
  Object.assign(history, {
    replaceState(state) {
      this.entries[this.index] = structuredClone(state);
    },
    pushState(state) {
      this.entries.splice(this.index + 1);
      this.entries.push(structuredClone(state));
      this.index++;
    },
    go(delta) {
      calls.push(delta);
      const next = this.index + delta;
      if (next < 0 || next >= this.entries.length) return;
      this.index = next;
      const state = structuredClone(this.state);
      queueMicrotask(() =>
        runEvent({
          type: "popstate",
          state,
          stopImmediatePropagation() {
            this.stopped = true;
          },
        }),
      );
    },
    back() {
      this.go(-1);
    },
  });
  // Object.assign evaluates getters; define the two live browser accessors explicitly.
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
  const sessionStorage = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)),
  };
  const context = {
    history,
    sessionStorage,
    crypto: { randomUUID: () => `screen-${Date.now()}-${++serial}` },
    performance: {
      getEntriesByType: () => [{ type: saved ? "reload" : "navigate" }],
    },
    queueMicrotask,
    requestAnimationFrame: (fn) => {
      queueMicrotask(fn);
      return 1;
    },
    scrollTo: () => {},
    console: { debug: () => {} },
    CustomEvent: class {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    },
    document: {
      body: {
        dataset: { root: "library" },
        classList: { contains: () => false },
      },
      getElementById: () => null,
      querySelectorAll: () => [],
    },
    addEventListener(type, fn) {
      const handlers = listeners.get(type) || [];
      handlers.push(fn);
      listeners.set(type, handlers);
    },
    dispatchEvent: runEvent,
  };
  context.window = context;
  context.HanamiOverlays = {
    count: () => 0,
    discardForNavigation: () => calls.push("discard-overlays"),
  };
  context.addEventListener("hanami-screen-change", (e) =>
    notifications.push(e.detail),
  );
  vm.createContext(context);
  vm.runInContext(source, context);
  return {
    context,
    screens: context.HanamiScreens,
    storage,
    history,
    notifications,
    calls,
    async flush() {
      for (let i = 0; i < 20; i++) await Promise.resolve();
      await Promise.all([...pending]);
      for (let i = 0; i < 5; i++) await Promise.resolve();
    },
  };
}
function deferred() {
  let resolve;
  return {
    promise: new Promise((r) => (resolve = r)),
    resolve: () => resolve(),
  };
}
{
  const initial = harness();
  initial.screens.push("library-detail", { id: "m1" });
  const h = harness(initial),
    seen = [];
  h.screens.registerType(["root", "library-detail"], (r) => {
    seen.push(r.type);
  });
  await h.screens.restoreCurrent();
  assert.equal(h.screens.current().type, "library-detail");
  h.screens.back();
  await h.flush();
  assert.equal(h.screens.current().type, "root");
  assert.deepEqual(
    seen,
    ["root", "library-detail", "root"],
    "pop after reload must use the same typed restorers as rehydration",
  );
}
{
  const h = harness(),
    seen = [],
    gate = deferred();
  const parent = h.screens.push(
    "source",
    { id: "s1" },
    {
      restore: async () => {
        seen.push("start");
        await gate.promise;
        seen.push("paint");
      },
    },
  );
  h.screens.push("explore-detail", {});
  h.screens.back();
  h.screens.back();
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(h.history.state.hanamiScreenId, parent);
  assert.deepEqual(seen, ["start"]);
  assert.equal(
    h.calls.filter((x) => x === -1).length,
    1,
    "same-turn double Back schedules one browser traversal",
  );
  assert.equal(
    h.notifications.filter((x) => x.action === "pop").length,
    0,
    "do not announce pop completion before its renderer settles",
  );
  gate.resolve();
  await h.flush();
  assert.deepEqual(seen, ["start", "paint"]);
  assert.equal(h.notifications.at(-1).action, "pop");
}
{
  const h = harness(),
    seen = [];
  h.screens.root("library", { restore: () => seen.push("root") });
  for (const type of [
    "library-detail",
    "reader",
    "reader-music",
    "reader-player-tool",
  ])
    h.screens.push(
      type,
      {},
      {
        restore: () => seen.push("restore:" + type),
        suspend: () => seen.push("suspend:" + type),
      },
    );
  h.history.go(-4);
  await h.flush();
  assert.deepEqual(
    seen,
    [
      "suspend:reader-player-tool",
      "suspend:reader-music",
      "suspend:reader",
      "suspend:library-detail",
      "root",
    ],
    "multi-entry Back must close every departed layer, not only the top tool",
  );
}
{
  const h = harness(),
    seen = [];
  h.screens.push(
    "reader",
    {},
    {
      restore: () => seen.push("reader"),
      suspend: () => seen.push("close-reader"),
    },
  );
  h.screens.push(
    "reader-music",
    {},
    {
      restore: () => seen.push("music"),
      suspend: () => seen.push("close-music"),
    },
  );
  h.screens.back();
  await h.flush();
  seen.length = 0;
  h.history.go(1);
  await h.flush();
  assert.deepEqual(
    seen,
    ["music"],
    "Forward into a child must not suspend its retained parent reader",
  );
}
for (const mode of ["missing", "false", "throw"]) {
  const h = harness();
  let ui = "child";
  h.screens.root("library", {
    restore: () => {
      ui = "root";
    },
  });
  const handlers =
    mode === "missing"
      ? {}
      : {
          restore: () => {
            if (mode === "throw") throw Error("fixture");
            return false;
          },
        };
  h.screens.push("unsupported", {}, handlers);
  h.screens.push("child", {});
  h.screens.back();
  await h.flush();
  assert.equal(h.screens.current().type, "root");
  assert.equal(
    ui,
    "root",
    `${mode} restorer must fall back visually as well as logically`,
  );
}
{
  const h = harness();
  let ui = "reader",
    closed = 0;
  h.screens.root("library", {
    restore: () => {
      ui = "root";
    },
  });
  h.screens.push("reader", {}, { suspend: () => closed++ });
  h.history.entries = [h.history.state];
  h.history.index = 0;
  h.screens.back();
  await h.flush();
  assert.equal(closed, 1);
  assert.equal(ui, "root");
  assert.equal(
    h.history.state.hanamiScreenId,
    h.screens.current().id,
    "fallback must synchronize browser state too",
  );
}
{
  const h = harness(),
    gate = deferred();
  h.screens.push(
    "source",
    {},
    {
      restore: async () => {
        await gate.promise;
      },
    },
  );
  h.screens.push("explore-detail", {});
  h.screens.back();
  for (let i = 0; i < 10; i++) await Promise.resolve();
  h.screens.push("root", { tab: "more" });
  gate.resolve();
  await h.flush();
  assert.equal(h.screens.current().data.tab, "more");
  assert.notEqual(
    h.notifications.at(-1).action,
    "pop",
    "a superseded async restoration must not commit a stale destination",
  );
}
{
  const h = harness();
  h.screens.root("library", { restore: () => {} });
  const closed = h.screens.push("obsolete", {});
  h.screens.markClosed(closed);
  h.screens.push("child", {});
  h.screens.back();
  await h.flush();
  assert.equal(h.screens.current().type, "root");
}
{
  const h = harness();
  assert.equal(h.screens.debug.report().events.length, 0);
  h.screens.debug.enable();
  for (let i = 0; i < 140; i++)
    h.screens.updateData({ privateText: "not in diagnostics" });
  const report = h.screens.debug.report();
  assert.equal(report.events.length, 120);
  assert(
    !JSON.stringify(report).includes("not in diagnostics"),
    "diagnostic traces must omit screen payloads",
  );
  h.screens.debug.enable(false);
  assert.equal(h.storage.get("hanami-navigation-debug-v1"), "false");
}
{
  const initial = harness();
  initial.screens.push("source", {});
  initial.screens.push("explore-detail", {});
  const h = harness(initial),
    gate = deferred();
  let sourceRuns = 0,
    details = 0;
  h.screens.registerType("root", () => {});
  h.screens.registerType("source", async () => {
    sourceRuns++;
    h.screens.updateData({ query: "kept" });
    if (sourceRuns === 1) await gate.promise;
  });
  h.screens.registerType("explore-detail", () => {
    details++;
  });
  const restoration = h.screens.restoreCurrent();
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(
    h.history.state.hanamiScreenId,
    initial.screens.current().id,
    "ancestor hydration must not rewrite the browser destination",
  );
  h.screens.back();
  for (let i = 0; i < 15; i++) await Promise.resolve();
  gate.resolve();
  await restoration;
  await h.flush();
  assert.equal(h.screens.current().type, "source");
  assert.equal(
    details,
    0,
    "Back during ancestor hydration must cancel the original detail restoration",
  );
}
console.log(
  "PASS: behavioral history lifecycle — typed reload/pop parity, awaited paints, coalesced Back, full layer cleanup, retained parents, recovery, cancellation and bounded opt-in diagnostics",
);
