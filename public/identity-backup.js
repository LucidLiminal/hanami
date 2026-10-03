/*
 * Migration checkpoints are kept on this device, never sent to the server.
 * Only reading data is copied: authentication/session/configuration keys are
 * deliberately excluded. Existing comment/media/audio records and outboxes
 * are cloned together before identity migration is allowed to write.
 */
const DB = "hanami-identity-recovery-v144";
const BROWSER = typeof window !== "undefined" && window === globalThis;
const EXACT_KEYS = new Set([
  "hanami-library", "hanami-reader-comments-v1",
  "hanami-reader-music-discovery-v1", "hanami-reader-music-state-v1",
  "hanami-reader-music-group-outbox-v137", "hanami-group-libraries-v1",
  "hanami-group-progress-v1", "hanami-content-identity-v144",
]);
const DATABASES = ["hanami-reader-comments-v2", "hanami-reader-music-v1"];
let available = false;
let failure = "";
let boot = null;

export function isReadingKey(key) {
  return EXACT_KEYS.has(key) || key.startsWith("hanami-chapter-meta-") ||
    key.startsWith("hanami-identity-detail-");
}
function openRecovery() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("checkpoints", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Otra pestaña bloquea la copia de seguridad."));
  });
}
async function existingDatabase(name) {
  if (typeof indexedDB.databases === "function") {
    const names = await indexedDB.databases();
    if (!names.some((item) => item.name === name)) return null;
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    let absent = false;
    request.onupgradeneeded = () => { absent = true; request.transaction.abort(); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => absent ? resolve(null) : reject(request.error);
    request.onblocked = () => reject(new Error(`Otra pestaña bloquea ${name}.`));
  });
}
async function databaseSnapshot(name) {
  const db = await existingDatabase(name);
  if (!db) return null;
  try {
    const stores = {};
    const names = [...db.objectStoreNames];
    if (!names.length) return { version: db.version, stores };
    await new Promise((resolve, reject) => {
      const tx = db.transaction(names, "readonly");
      for (const name of names) {
        const store = tx.objectStore(name);
        const rows = store.getAll(), keys = store.getAllKeys();
        stores[name] = { keyPath: store.keyPath, autoIncrement: store.autoIncrement, values: [], keys: [] };
        rows.onsuccess = () => { stores[name].values = rows.result; };
        keys.onsuccess = () => { stores[name].keys = keys.result; };
      }
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("La copia fue interrumpida."));
    });
    return { version: db.version, stores };
  } finally { db.close(); }
}
function localSnapshot() {
  const result = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && isReadingKey(key)) result[key] = localStorage.getItem(key);
  }
  return result;
}
async function getCheckpoint(id) {
  const db = await openRecovery();
  try {
    return await new Promise((resolve, reject) => {
      const r = db.transaction("checkpoints").objectStore("checkpoints").get(id);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  } finally { db.close(); }
}
export async function checkpoint(reason = "manual", { initial = false } = {}) {
  if (typeof localStorage === "undefined" || typeof indexedDB === "undefined") {
    if (BROWSER) throw new Error("Este navegador no permite crear la copia de seguridad.");
    return null; // pure unit-test / server context
  }
  const id = initial ? "before-v144" : crypto.randomUUID();
  if (initial) {
    const existing = await getCheckpoint(id);
    if (existing) return existing;
  }
  const values = localSnapshot(); // capture before awaiting any database work
  const databases = {};
  for (const name of DATABASES) {
    const snapshot = await databaseSnapshot(name);
    if (snapshot) databases[name] = snapshot;
  }
  const value = {
    id, format: "hanami-identity-checkpoint", version: 1,
    createdAt: new Date().toISOString(), reason, localStorage: values, databases,
  };
  const db = await openRecovery();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("checkpoints", "readwrite");
      tx.objectStore("checkpoints").put(value);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("No se pudo guardar la copia."));
    });
  } finally { db.close(); }
  return value;
}
export async function ensureBackup() {
  if (boot) return boot;
  boot = checkpoint("Antes de introducir identidades estables", { initial: true })
    .then((value) => { available = true; return value; })
    .catch((error) => { failure = error?.message || "No se pudo crear la copia."; throw error; });
  return boot;
}
export function assertBackup() {
  if (!BROWSER) return;
  if (!available) throw new Error(failure || "La copia previa sigue en curso. Espera un momento y vuelve a intentarlo.");
}
export function backupStatus() { return { ready: available, error: failure }; }
export async function checkpoints() {
  const db = await openRecovery();
  try {
    return await new Promise((resolve, reject) => {
      const r = db.transaction("checkpoints").objectStore("checkpoints").getAll();
      r.onsuccess = () => resolve(r.result.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      r.onerror = () => reject(r.error);
    });
  } finally { db.close(); }
}
async function pack(value) {
  if (value instanceof Blob) {
    const bytes = new Uint8Array(await value.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return { __hanamiBlob: true, type: value.type, base64: btoa(binary) };
  }
  if (value instanceof ArrayBuffer) return pack(new Blob([value]));
  if (Array.isArray(value)) return Promise.all(value.map(pack));
  if (value && typeof value === "object")
    return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([k, v]) => [k, await pack(v)])));
  return value;
}
export async function exportCheckpoint(id = "before-v144") {
  const value = await getCheckpoint(id);
  if (!value) throw new Error("No existe esa copia de seguridad.");
  const packed = await pack(value);
  const blob = new Blob([JSON.stringify(packed)], { type: "application/json" });
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url;
  a.download = `hanami-identidad-${value.createdAt.slice(0, 19).replaceAll(":", "-")}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return packed;
}
// Revert aliases only. Never rewind comments/outboxes against newer remote
// revisions or resurrect tombstones as an automatic "restore" side effect.
export async function restoreIdentityRegistry(id) {
  const value = await getCheckpoint(id);
  if (!value) throw new Error("No existe esa copia.");
  await checkpoint("Antes de deshacer equivalencias");
  const key = "hanami-content-identity-v144";
  const current = JSON.parse(localStorage.getItem(key) || '{"version":1,"works":[],"chapters":[],"verified":[]}');
  const previous = JSON.parse(value.localStorage[key] || '{"verified":[]}');
  // IDs issued since the checkpoint remain permanent. Only reviewed alias
  // decisions are rolled back; restoring an empty old registry would mint new
  // IDs on the next fetch and break the very contract this migration protects.
  current.verified = Array.isArray(previous.verified) ? previous.verified : [];
  localStorage.setItem(key, JSON.stringify(current));
  dispatchEvent(new CustomEvent("hanami-identity-restored"));
}
export const ready = BROWSER
  ? ensureBackup() : Promise.resolve(null);
ready.catch(() => {}); // surfaced in the recovery UI, never silently erase data
if (BROWSER) {
  window.HanamiIdentityBackup = { ready, status: backupStatus, checkpoint, checkpoints, export: exportCheckpoint, restoreIdentityRegistry };
}