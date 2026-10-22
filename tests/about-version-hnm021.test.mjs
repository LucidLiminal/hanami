import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [packageText, version, more, navigation, index, sw] = await Promise.all([
  read("package.json"),
  read("public/app-version.js"),
  read("public/more-tab.js"),
  read("public/navigation.js"),
  read("public/index.html"),
  read("public/sw.js"),
]);
const packageVersion = JSON.parse(packageText).version;
const configured = version.match(/const VERSION = "([^"]+)";/);

assert(configured, "app-version.js declares the public app version");
assert.equal(configured[1], packageVersion);
assert(version.includes("window.HanamiAppVersion"));
assert(more.includes("HanamiAppVersion?.label"));
assert(more.includes("HanamiAppVersion?.version"));
assert(navigation.includes("HanamiAppVersion?.label"));
assert(!more.includes("5.8.40"));
assert(!more.includes("5.9.5"));
assert(!navigation.includes("Hanami Web 5.1"));
assert(!navigation.includes("5.1.0"));
assert(index.indexOf('/app-version.js') < index.indexOf('/more-tab.js'));
assert(sw.includes("'/app-version.js'"));

console.log(
  "PASS: HNM-021 keeps the About labels bound to the packaged Hanami version",
);