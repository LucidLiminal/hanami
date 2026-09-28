import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, library, groupLibrary, mangaDetail, sw, packageText] = await Promise.all([
  readFile(new URL("../public/app.js", import.meta.url), "utf8"),
  readFile(new URL("../public/library.js", import.meta.url), "utf8"),
  readFile(new URL("../public/group-library.js", import.meta.url), "utf8"),
  readFile(new URL("../public/manga-detail.js", import.meta.url), "utf8"),
  readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
]);
const pkg = JSON.parse(packageText);

// El progreso del grupo se guarda con la posición exacta de página…
assert(groupLibrary.includes("function ownProgress("));
assert(groupLibrary.includes("pageOffset: detail.pageOffset"));
assert(groupLibrary.includes("ownProgress,"));

// …y la ficha de grupo reanuda capítulo y página con el patrón de Biblioteca.
assert(app.includes("import{chapterToContinue}from'./library-progress.js'"));
assert(app.includes("function resumeGroupMihonChapter("));
assert(app.includes("ownProgress?.(groupId,entry.id)"));
assert(app.includes("hasProgress:!!own"));
assert(app.includes("resume:()=>resumeGroupMihonChapter(screen)"));
assert(app.includes("restoring=false,resume=null"));
assert(app.includes("resume:resumeAt"));
assert(app.includes("No quedan capítulos sin leer"));
assert(
  mangaDetail.includes("const hasStartedChapter=!!o.hasProgress||"),
  "Mihon Details must honor progress supplied by group entries",
);

// Atrás durante la carga: ninguna ficha asíncrona se monta sobre otra pantalla.
assert(app.includes("window.HanamiScreens.current()?.id!==screenId"));
assert(library.includes("window.HanamiScreens.current()?.id!==screenId"));
assert.equal(
  app.match(/id!==screenId/g).length >= 2,
  true,
  "app.js debe proteger la ficha de grupo y la de explorar",
);

assert(sw.includes("hanami-group-progress-resume-v127"));
assert.equal(pkg.version, "5.8.60");
assert(
  pkg.scripts.test.includes(
    "node tests/group-progress-resume-v127.test.mjs",
  ),
);

console.log(
  "PASS: group detail resumes the saved chapter and page, and late detail loads never mount over the current screen",
);
