/* Reading modes are deliberately different from an ordinary music repeat switch. */
export const READING_MODES = Object.freeze([
  { id: "pin-loop", number: 1, label: "Repetir hasta la siguiente pista", short: "Lector · Repetir", hint: "Repite hasta el siguiente marcador.", description: "Repite la canción activa hasta que aparezca la siguiente pista en la página.", legacyRepeat: "one" },
  { id: "pin-once", number: 2, label: "Esperar a la siguiente pista", short: "Lector · Una vez", hint: "Una canción; espera al siguiente marcador.", description: "Reproduce la canción una vez y espera a la siguiente pista de la lectura.", legacyRepeat: "off" },
  { id: "queue-loop", number: 3, label: "Repetir la lista completa", short: "Lista · Repetir", hint: "Repite la lista. Ignora los marcadores.", description: "Ignora los marcadores de página y repite la lista completa de principio a fin.", legacyRepeat: "all" },
  { id: "queue-once", number: 4, label: "Reproducir la lista una vez", short: "Lista · Una vez", hint: "Una vuelta a la lista. Ignora los marcadores.", description: "Ignora los marcadores de página. Al terminar la lista, se detiene.", legacyRepeat: "off" },
]);
export function normalizeReadingMode(value) {
  return READING_MODES.some((mode) => mode.id === value) ? value : "pin-loop";
}
export function readingModeInfo(value) {
  return READING_MODES.find((mode) => mode.id === normalizeReadingMode(value));
}
export function followsReadingPins(value) {
  return normalizeReadingMode(value).startsWith("pin-");
}
export function trackEndAction(value, hasNext) {
  const mode = normalizeReadingMode(value);
  if (mode === "pin-loop") return "repeat-track";
  if (mode === "pin-once") return "wait-pin";
  if (hasNext) return "next";
  return mode === "queue-loop" ? "restart-queue" : "stop";
}
/* Coordinates are measured in the scrolling viewport, not against the window. */
export function chooseVisiblePin(pins, activeId, direction = 1) {
  const ordered = [...pins].sort((a, b) => a.order - b.order);
  const active = ordered.find((pin) => pin.id === activeId);
  const visible = ordered.filter((pin) => pin.visible && pin.available !== false);
  if (!visible.length) return null;
  if (!active) return direction < 0 ? visible.at(-1) : visible[0];
  const candidates = visible.filter((pin) => direction < 0 ? pin.order < active.order : pin.order > active.order);
  return direction < 0 ? candidates.at(-1) || null : candidates[0] || null;
}