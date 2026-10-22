const editableSelector = [
  "input",
  "textarea",
  "select",
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
  "[data-allow-native-press]",
].join(",");

const interactiveSurfaceSelector = [
  "button",
  "a[href]",
  '[role="button"]',
  '[role="menuitem"]',
  "[data-hanami-interactive]",
  ".lib-item",
  ".updates-item",
  ".history-item",
  ".card",
  ".migrate-result-card",
  ".migrate-manga-row",
  ".reading-room-card",
  ".library-group-item",
  ".group-library-card",
  ".extension-store-card",
  ".music-discovery-card",
  ".track-card",
  ".timeline-item",
].join(",");

function elementFor(target) {
  return target?.closest ? target : target?.parentElement || null;
}

function usesTouchInput() {
  const coarse = window.matchMedia?.("(pointer: coarse)");
  return coarse ? coarse.matches || navigator.maxTouchPoints > 0 : navigator.maxTouchPoints > 0;
}

function blocksNativePress(target) {
  const element = elementFor(target);
  return Boolean(
    usesTouchInput() &&
      element &&
      !element.closest(editableSelector) &&
      element.closest(interactiveSurfaceSelector),
  );
}

function preventNativePress(event) {
  if (blocksNativePress(event.target)) event.preventDefault();
}

for (const eventName of ["contextmenu", "selectstart", "dragstart"]) {
  document.addEventListener(eventName, preventNativePress, true);
}

window.HanamiMobilePressGuard = { blocksNativePress };
