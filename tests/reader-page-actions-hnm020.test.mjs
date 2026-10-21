import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const [reader, actions, css, toolbar, styles] = await Promise.all([
  "public/reader.js", "public/reader-page-actions.js", "public/reader-actions.css", "public/selection-toolbar.js", "public/styles.css",
].map((file) => readFile(new URL(`../${file}`, import.meta.url), "utf8")));

assert(css.includes(".mihon-reader.reader-page-actions-active #readerBottom { transform: none; opacity: 1; }"));
assert(css.includes(".mihon-reader.reader-page-actions-active #readerViewport { overflow: hidden; touch-action: none; }"));
assert(!css.includes("[data-reader-page-action]:active > span"));
assert(css.includes("[data-reader-page-action].show-action-label > span"));
assert(toolbar.includes("'.main-nav [data-tab]'"));
assert(toolbar.includes("'.reader-navigation:not(.reader-page-actions-nav)>button'"));
assert(styles.includes(".main-nav button>span,"));
assert(styles.includes("[data-reader-navigation]:not(.reader-page-actions-nav)>button>small"));
assert(styles.includes(".main-nav button.show-action-label>span,"));
assert(actions.includes('root.addEventListener("click", instance.handleOutsideClick, true)'));
assert(actions.includes('instance.root.removeEventListener("click", instance.handleOutsideClick, true)'));
assert(actions.includes("event.stopImmediatePropagation();\n    close();"));
assert(actions.includes("window.HanamiReader?.cancelPageGestures?.()"));
assert(reader.includes("function cancelPageGestures(){clearTimeout(hold);lastTap=0;pinch.clear();touch=null;"));
assert(reader.includes("pageActionsActive()||lastTap!==now"));
assert(reader.includes("v.onpointerdown=e=>{if(!S||pageActionsActive()"));
assert(reader.includes("v.onpointermove=e=>{if(!S||pageActionsActive())return;"));
assert(reader.includes("if(pageActionsActive()){touch=null;return}"));
assert(reader.includes("${pageActionsActive()?'reader-page-actions-active':''}"));

// Exercise the production shared recognizer with deterministic timers, not just
// string assertions. No browser or dependencies are required by `npm test`.
function gestureHarness(selector) {
  let now = 0, sequence = 0;
  const timers = new Map(), documentEvents = new Map(), windowEvents = new Map();
  const classes = new Set();
  const button = {
    disabled: false, isConnected: true,
    classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) },
    closest: (selectors) => selectors.split(",").includes(selector) ? button : null,
  };
  const listen = (events) => (name, callback) => {
    if (!events.has(name)) events.set(name, []);
    events.get(name).push(callback);
  };
  const document = {
    addEventListener: listen(documentEvents), hidden: false,
    body: { classList: { contains: () => false } },
  };
  const window = { addEventListener: listen(windowEvents) };
  const setTimeout = (callback, delay) => {
    const id = ++sequence;
    timers.set(id, { at: now + delay, callback });
    return id;
  };
  vm.runInNewContext(toolbar, {
    document, window, navigator: { vibrate() {} },
    setTimeout, clearTimeout: (id) => timers.delete(id),
  });
  function advance(ms) {
    const until = now + ms;
    for (;;) {
      const next = [...timers.entries()].filter(([, timer]) => timer.at <= until)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
    }
    now = until;
  }
  function send(type, extra = {}) {
    const event = {
      target: button, pointerId: 1, clientX: 20, clientY: 20, button: 0, isPrimary: true, detail: 1,
      prevented: false, stopped: false,
      preventDefault() { this.prevented = true; },
      stopImmediatePropagation() { this.stopped = true; },
      ...extra,
    };
    for (const callback of documentEvents.get(type) || []) {
      callback(event);
      if (event.stopped) break;
    }
    return event;
  }
  return {
    button, classes, advance, send,
    blur: () => windowEvents.get("blur").forEach((callback) => callback()),
  };
}

for (const selector of [
  ".selection-bottombar button", ".library-toolbar-actions button",
  ".main-nav [data-tab]", ".reader-navigation:not(.reader-page-actions-nav)>button",
  ".reader-page-actions-nav > [data-reader-page-action]",
]) {
  const h = gestureHarness(selector);
  const visible = () => h.classes.has("show-action-label");
  h.send("pointerdown");
  h.advance(499);
  assert.equal(visible(), false, `${selector}: a short press cannot reveal labels`);
  h.advance(1);
  assert.equal(visible(), true);
  h.send("pointerup");
  assert.equal(h.send("click").prevented, true, "the long-press release is not an action");
  h.advance(2399);
  assert.equal(visible(), true);
  h.advance(1);
  assert.equal(visible(), false);

  h.send("pointerdown");
  h.advance(80);
  h.send("pointerup");
  assert.equal(h.send("click").prevented, false, "the following short action is usable");
  h.send("pointerdown");
  h.advance(200);
  h.send("pointermove", { clientX: 33 });
  h.advance(500);
  assert.equal(visible(), false, "moving more than 12px cancels the hold");
  h.send("pointercancel");

  h.send("pointerdown");
  h.advance(500);
  h.send("pointercancel");
  h.send("pointerdown");
  h.send("pointerup");
  assert.equal(h.send("click").prevented, false, "cancelled holds cannot swallow the next tap");
  h.advance(2400);

  h.send("pointerdown");
  h.send("pointerup", { pointerId: 2 });
  h.advance(500);
  assert.equal(visible(), true, "another pointer cannot release the held button");
  h.send("pointerup");
  assert.equal(h.send("click", { detail: 0 }).prevented, false, "keyboard activation remains accessible");
  h.advance(2400);

  h.send("pointerdown");
  h.send("pointerdown", { pointerId: 2, isPrimary: false });
  h.advance(600);
  assert.equal(visible(), false, "multitouch cancels the pending label");
  h.send("pointerdown", { button: 2 });
  h.advance(600);
  assert.equal(visible(), false, "secondary mouse buttons cannot start label holds");
  h.send("pointerdown");
  h.button.isConnected = false;
  h.advance(600);
  assert.equal(visible(), false, "removed toolbars cannot receive delayed labels");
  h.button.isConnected = true;
  h.send("pointerdown");
  h.blur();
  h.advance(600);
  assert.equal(visible(), false, "leaving the window cancels a pending hold");
  h.button.disabled = true;
  h.send("pointerdown");
  h.advance(600);
  assert.equal(visible(), false, "disabled actions cannot show labels");
  assert.equal(h.send("contextmenu").prevented, true);
}

console.log("PASS: HNM-018/HNM-020 share cancellable 500ms labels without triggering long-press releases");