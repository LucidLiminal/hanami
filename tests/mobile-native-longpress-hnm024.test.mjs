import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const [guard, css, index, sw, library] = await Promise.all(
  [
    "../public/mobile-interaction-guard.js",
    "../public/mobile-interaction-guard.css",
    "../public/index.html",
    "../public/sw.js",
    "../public/library.js",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
);

for (const eventName of ["contextmenu", "selectstart", "dragstart"]) {
  assert(guard.includes(`"${eventName}"`), `${eventName} is intercepted`);
}
assert(guard.includes("data-allow-native-press"));
assert(guard.includes("navigator.maxTouchPoints"));
assert(css.includes("-webkit-touch-callout: none"));
assert(css.includes("-webkit-user-drag: none"));
assert(index.includes('/mobile-interaction-guard.css'));
assert(index.includes('/mobile-interaction-guard.js'));
assert(sw.includes('"/mobile-interaction-guard.css"') || sw.includes("'/mobile-interaction-guard.css'"));
assert(sw.includes('"/mobile-interaction-guard.js"') || sw.includes("'/mobile-interaction-guard.js'"));
assert(library.includes("holdTimer=setTimeout") && library.includes("render()},500)"), "library keeps its 500 ms own long press");

const listeners = new Map();
let coarse = true;
const context = {
  navigator: { maxTouchPoints: 1 },
  window: {
    matchMedia: () => ({ matches: coarse }),
  },
  document: {
    addEventListener(type, listener, capture) {
      listeners.set(type, { listener, capture });
    },
  },
};
vm.runInNewContext(guard, context, { filename: "mobile-interaction-guard.js" });

function target({ interactive = false, editable = false } = {}) {
  return {
    closest(selector) {
      if (editable && selector.includes("input")) return this;
      if (interactive && selector.includes(".lib-item")) return this;
      return null;
    },
  };
}
function eventFor(node) {
  return {
    target: node,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

for (const eventName of ["contextmenu", "selectstart", "dragstart"]) {
  assert.equal(listeners.get(eventName)?.capture, true, `${eventName} captures before native UI`);
  const event = eventFor(target({ interactive: true }));
  listeners.get(eventName).listener(event);
  assert.equal(event.defaultPrevented, true, `${eventName} is blocked on an app card`);
}
const editableEvent = eventFor(target({ interactive: true, editable: true }));
listeners.get("contextmenu").listener(editableEvent);
assert.equal(editableEvent.defaultPrevented, false, "editable fields preserve native behavior");
coarse = false;
context.navigator.maxTouchPoints = 0;
const desktopEvent = eventFor(target({ interactive: true }));
listeners.get("contextmenu").listener(desktopEvent);
assert.equal(desktopEvent.defaultPrevented, false, "desktop pointer behavior is unchanged");

console.log("PASS: HNM-024 blocks native long-press UI on touch interactive surfaces only");
