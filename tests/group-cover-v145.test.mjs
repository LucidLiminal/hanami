import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  GROUP_COVER_MAX_INPUT_BYTES,
  GROUP_COVER_MAX_OUTPUT_BYTES,
  groupCoverPath,
  prepareGroupCover,
  validateGroupCoverFile,
} from "../public/group-cover.js";

const group = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
assert.equal(groupCoverPath(group), `${group}/cover.webp`);
assert.equal(groupCoverPath(group.toUpperCase()), `${group}/cover.webp`);
for (const value of [null, "", "../group", `${group}/x`, "not-a-uuid"])
  assert.throws(() => groupCoverPath(value), /identificador válido/);

const file = (type = "image/png", size = 100) =>
  new Blob([new Uint8Array(size)], { type });
for (const type of ["image/png", "image/jpeg", "image/gif", "image/webp"])
  assert.doesNotThrow(() => validateGroupCoverFile(file(type)));
assert.throws(() => validateGroupCoverFile(file("image/svg+xml")), /JPG, PNG/);
assert.throws(() => validateGroupCoverFile(file("text/plain")), /JPG, PNG/);
assert.throws(() => validateGroupCoverFile(file("image/png", 0)), /imagen válida/);
assert.throws(
  () => validateGroupCoverFile(file("image/png", GROUP_COVER_MAX_INPUT_BYTES + 1)),
  /10 MB/,
);
assert.doesNotThrow(() =>
  validateGroupCoverFile(file("image/png", GROUP_COVER_MAX_INPUT_BYTES)),
);

const previous = {
  bitmap: globalThis.createImageBitmap,
  document: globalThis.document,
};
let fixture;
function setup(options = {}) {
  fixture = {
    width: 5000,
    height: 2500,
    sizes: [1000],
    mime: "image/webp",
    draws: [],
    qualities: [],
    closed: 0,
    decodes: 0,
    ...options,
  };
  globalThis.createImageBitmap = async () => {
    fixture.decodes++;
    return {
      width: fixture.width,
      height: fixture.height,
      close: () => fixture.closed++,
    };
  };
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, "canvas");
      const canvas = {
        width: 0,
        height: 0,
        getContext: () =>
          fixture.noContext
            ? null
            : {
                drawImage(_image, x, y, width, height) {
                  assert.equal(x, 0);
                  assert.equal(y, 0);
                  fixture.draws.push([width, height]);
                },
              },
        toBlob(callback, mime, quality) {
          assert.equal(mime, "image/webp");
          fixture.qualities.push(quality);
          const size = fixture.sizes.length > 1
            ? fixture.sizes.shift()
            : fixture.sizes[0];
          callback(new Blob([new Uint8Array(size)], { type: fixture.mime }));
        },
      };
      fixture.canvas = canvas;
      return canvas;
    },
  };
}

try {
  setup();
  let cover = await prepareGroupCover(file());
  assert.equal(cover.type, "image/webp");
  assert.deepEqual(fixture.draws, [[1280, 640]]);
  assert.equal(fixture.closed, 1);
  assert.equal(fixture.canvas.width, 0);
  assert.equal(fixture.canvas.height, 0);

  setup({ width: 90, height: 60 });
  await prepareGroupCover(file("image/jpeg"));
  assert.deepEqual(fixture.draws, [[90, 60]], "Do not upscale small images");

  setup({ width: 10000, height: 5000 });
  await assert.rejects(() => prepareGroupCover(file()), /40 megapíxeles/);
  assert.equal(fixture.closed, 1);
  assert.equal(fixture.draws.length, 0);

  setup({ width: 10000, height: 4000, sizes: [GROUP_COVER_MAX_OUTPUT_BYTES] });
  cover = await prepareGroupCover(file());
  assert.equal(cover.size, GROUP_COVER_MAX_OUTPUT_BYTES, "Accept the exact output limit");
  assert.deepEqual(fixture.draws, [[1280, 512]], "Accept the exact 40 MP input limit");

  setup({ sizes: [GROUP_COVER_MAX_OUTPUT_BYTES + 1, GROUP_COVER_MAX_OUTPUT_BYTES + 1, 1500] });
  cover = await prepareGroupCover(file());
  assert(cover.size <= GROUP_COVER_MAX_OUTPUT_BYTES);
  assert.deepEqual(fixture.qualities, [0.82, 0.7, 0.55]);

  setup({ sizes: [
    GROUP_COVER_MAX_OUTPUT_BYTES + 1,
    GROUP_COVER_MAX_OUTPUT_BYTES + 1,
    GROUP_COVER_MAX_OUTPUT_BYTES + 1,
    1500,
  ] });
  await prepareGroupCover(file());
  assert.deepEqual(fixture.draws, [[1280, 640], [960, 480]]);

  setup({ sizes: [GROUP_COVER_MAX_OUTPUT_BYTES + 1] });
  await assert.rejects(() => prepareGroupCover(file()), /reducir la portada/);
  assert.deepEqual(fixture.draws, [[1280, 640], [960, 480], [640, 320]]);
  assert.equal(fixture.qualities.length, 9);
  assert.equal(fixture.closed, 1);
  assert.equal(fixture.canvas.width, 0);

  setup({ mime: "image/png" });
  await assert.rejects(() => prepareGroupCover(file()), /navegador/);
  assert.equal(fixture.closed, 1);

  setup({ noContext: true });
  await assert.rejects(() => prepareGroupCover(file()), /preparar la imagen/);
  assert.equal(fixture.closed, 1);

  setup();
  await assert.rejects(
    () => prepareGroupCover(file("image/png", GROUP_COVER_MAX_INPUT_BYTES + 1)),
    /10 MB/,
  );
  assert.equal(fixture.decodes, 0, "Reject oversized input before decoding");
} finally {
  if (previous.bitmap === undefined) delete globalThis.createImageBitmap;
  else globalThis.createImageBitmap = previous.bitmap;
  if (previous.document === undefined) delete globalThis.document;
  else globalThis.document = previous.document;
}

const root = new URL("../", import.meta.url);
const [sw, social, groups, sql, packageText] = await Promise.all(
  ["public/sw.js", "public/social-sync.js", "public/reading-groups.js",
    "supabase/hanami-group-cover-storage-v145.sql", "package.json"]
    .map((path) => readFile(new URL(path, root), "utf8")),
);
assert(sw.includes("hanami-crimson-knot-v145"));
assert(sw.includes("'/group-cover.js'"));
assert(social.includes('import { groupCoverPath, prepareGroupCover }'));
assert(social.includes("cleanupOldGroupCovers(group.id, group.cover)"));
assert(groups.includes("readAsDataURL(optimized)"));
assert(groups.includes("releaseGroupCoverPreview"));
assert(sql.includes("1048576, array['image/webp']"));
assert(sql.includes("as restrictive for insert to public"));
assert(!/delete\s+from\s+storage\.objects/i.test(sql));
assert.equal(JSON.parse(packageText).version, "5.19.0");
console.log("PASS: bounded WebP normalization, aspect ratio, no upscale, quality/size fallback, resource cleanup and one UUID path");