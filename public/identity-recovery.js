import * as identity from "./chapter-identity.js";
import * as backup from "./identity-backup.js";
import { mergeFetchedChapterMetadata, setChapterMetadata } from "./library-progress.js";

const E = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const remote = (id) => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id || "");
let dialog, report, scopeId = "local-room", visibleRows = 20, remotePins = [];
function activeScope() {
  const id = window.HanamiReadingGroups?.activeId?.() || "local-room";
  return remote(id) && !window.HanamiSocialSync?.state?.().authenticated ? "local-room" : id;
}
function library() { const values = read("hanami-library", []); return Array.isArray(values) ? values : []; }
function targets(groupId) {
  const result = [];
  for (const item of library()) for (const chapter of item._chapters || []) {
    const context = identity.chapterContext(item, chapter, groupId);
    const row = identity.resolveChapter(context);
    result.push({ context, chapterId: row?.id, title: item.title || item.url,
      name: chapter.name || `Capítulo ${chapter.number ?? "?"}`, pageCount: row?.pageCount ?? null });
  }
  for (const figure of document.querySelectorAll("#readerViewport figure[data-comment-context]")) {
    try {
      const context = { ...JSON.parse(figure.dataset.commentContext), groupId };
      const row = identity.resolveChapter(context);
      result.push({ context, chapterId: row?.id, title: context.mangaUrl || context.mangaId,
        name: context.chapterName || `Capítulo ${context.chapterNumber ?? "?"}`, pageCount: Number(context.pageCount) || row?.pageCount || null });
    } catch {}
  }
  return [...new Map(result.map((row) => [JSON.stringify([row.context.sourceId,row.context.mangaUrl || row.context.mangaId,row.context.chapterUrl]),row])).values()];
}
export async function inventory(groupId = activeScope(), { refreshRemote = false } = {}) {
  await backup.ready;
  await identity.ready;
  let warning = "", denied = false;
  if (refreshRemote && remote(groupId) && navigator.onLine !== false) {
    try {
      await window.HanamiSocialSync?.pullComments(groupId);
      remotePins = await window.HanamiSocialSync?.musicIdentityInventory(groupId) || [];
    } catch (error) {
      denied = error.code === "42501" || error.status === 403;
      remotePins = [];
      warning = denied ? "No tienes acceso a esta sala. Sus registros no se muestran." :
        "No se pudo completar la lectura remota. El inventario contiene únicamente los datos locales disponibles.";
    }
  } else if (refreshRemote) remotePins = [];
  const snapshot = await window.HanamiReaderComments?.recoverySnapshot?.() || { comments: [], pending: [] };
  const music = window.HanamiMusicDiscovery?.snapshot?.() || read("hanami-reader-music-discovery-v1", { bindings: [] });
  const actor = window.HanamiSocialSync?.state?.().user?.id || "";
  const candidates = targets(groupId), rows = new Map();
  const add = (context, kind, id, pageIndex = null, preview = "") => {
    if (!context) return;
    const key = JSON.stringify([context.groupId,context.sourceId,context.mangaUrl || context.mangaId,context.chapterUrl]);
    let row = rows.get(key);
    if (!row) {
      row = { key, context, comments: new Set(), music: new Set(), readStates: new Set(), pages: new Set(), previews: [] };
      rows.set(key,row);
    }
    row[kind].add(id);
    if (Number.isInteger(pageIndex)) row.pages.add(pageIndex);
    if (preview && row.previews.length < 3) row.previews.push(String(preview).slice(0,160));
  };
  if (!denied) {
    for (const comment of snapshot.comments) {
      if (comment.groupId !== groupId || comment.deletedAt) continue;
      add(identity.commentContext(comment.pageKey,comment.groupId),"comments",comment.id,
        identity.commentContext(comment.pageKey,comment.groupId)?.pageIndex,comment.text);
    }
    const localPins = (music.bindings || []).filter((pin) => !pin.deletedAt &&
      (!pin.actorId || !remote(pin.groupId) || pin.actorId === actor));
    for (const pin of localPins) {
      const context = identity.musicContext(pin.pageKey);
      if (context?.groupId === groupId) add(context,"music",pin.id,context.pageIndex,pin.track?.title);
    }
    for (const pin of remotePins) {
      const context = identity.musicContext(pin.page_key);
      if (context?.groupId === groupId) add(context,"music",pin.id,context.pageIndex,pin.track?.title);
    }
  }
  // Personal states remain personal; they are never uploaded by this inventory.
  for (const item of library()) for (const [url,meta] of Object.entries(item._chapterMeta || {})) {
    if (!meta.read && !meta.bookmark && !meta.lastPageRead) continue;
    add(identity.chapterContext(item,{url},"local-room"),"readStates",`${item.id}|${url}`);
  }
  const list = [...rows.values()].map((row) => ({
    ...row, comments: [...row.comments], music: [...row.music], readStates: [...row.readStates], pages: [...row.pages],
    recognized: candidates.some((target) => identity.sameChapter(
      { ...row.context,groupId },target.context)),
    layoutReview: !!identity.resolveChapter(row.context)?.layoutNeedsReview,
  }));
  const conflicts = library().flatMap((item) => Object.entries(item._identityConflicts || {}).map(([id,value]) =>
    ({ itemId: item.id, chapterId: id, title: item.title || item.url, ...value })));
  return {
    groupId, warning, denied, rows: list, targets: candidates, conflicts,
    pendingComments: snapshot.pending.filter((row) => row.groupId === groupId && row.state === "pending").length,
    pendingMusic: read("hanami-reader-music-group-outbox-v137", []).filter((row) => row.groupId === groupId).length,
    backend: window.HanamiSocialSync?.identityStatus?.() || { available: null },
  };
}
function createDialog() {
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.className = "identity-recovery-dialog";
  dialog.id = "identityRecoveryDialog";
  dialog.setAttribute("aria-labelledby","identityRecoveryTitle");
  document.body.append(dialog);
  dialog.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    try {
      button.disabled = true;
      if (button.hasAttribute("data-identity-close")) dialog.close();
      if (button.hasAttribute("data-identity-refresh")) await refresh(true);
      if (button.hasAttribute("data-identity-more")) { visibleRows += 20; render(); }
      if (button.hasAttribute("data-identity-export")) await backup.exportCheckpoint("before-v144");
      if (button.hasAttribute("data-identity-current-backup")) {
        const value = await backup.checkpoint("Copia completa solicitada desde recuperación");
        await backup.exportCheckpoint(value.id);
      }
      if (button.hasAttribute("data-identity-link")) await confirmLink(Number(button.dataset.identityLink));
      if (button.hasAttribute("data-identity-resolve-state")) await resolveState(Number(button.dataset.identityResolveState));
      if (button.hasAttribute("data-identity-undo")) {
        if (!confirm("Se desharán las equivalencias posteriores a la copia elegida. No se borrarán comentarios, canciones ni colas, y no se rebobinarán nuevas lecturas.")) return;
        const id = dialog.querySelector("[data-identity-checkpoint]").value;
        await backup.restoreIdentityRegistry(id);
        await refresh(false);
      }
    } catch (error) { message(error.message || "No se pudo completar la operación.",true); }
    finally { if (button.isConnected) button.disabled = false; }
  });
  dialog.addEventListener("change", async (event) => {
    if (event.target.hasAttribute("data-identity-scope")) {
      scopeId = event.target.value; visibleRows = 20;
      await refresh(true).catch((error) => message(error.message,true));
    }
  });
  return dialog;
}
function message(text,error = false) {
  const node = dialog?.querySelector("[data-identity-message]");
  if (node) { node.textContent = text; node.dataset.error = String(error); }
}
function rowHtml(row,index) {
  const compatible = report.targets.map((target,i) => ({ target,i }))
    .filter(({target}) => target.context.sourceId === row.context.sourceId);
  const quantity = (n,one,many) => `${n} ${n===1?one:many}`;
  const count = `${quantity(row.comments.length,"comentario","comentarios")} · ${quantity(row.music.length,"canción","canciones")} · ${quantity(row.readStates.length,"estado personal","estados personales")}`;
  return `<article class="identity-recovery-row" data-identity-row="${index}">
    <header><b>${E(row.context.sourceId)}</b><span>${row.layoutReview ? "Revisión de páginas requerida" : row.recognized ? "Reconocido por identidad" : "Pendiente de equivalencia"}</span></header>
    <p>${E(count)}</p>
    <details><summary>Ver referencias originales</summary><dl><dt>Obra</dt><dd>${E(row.context.mangaUrl || row.context.mangaId)}</dd><dt>Capítulo</dt><dd>${E(row.context.chapterUrl)}</dd></dl>${row.previews.map((text)=>`<blockquote>${E(text)}</blockquote>`).join("")}</details>
    <label>Capítulo equivalente<select data-identity-target><option value="">Selecciona un destino verificado…</option>${compatible.map(({target,i})=>`<option value="${i}">${E(target.title)} · ${E(target.name)} · ${E(target.context.chapterUrl)}</option>`).join("")}</select></label>
    <label class="identity-check"><input type="checkbox" data-identity-same-chapter>He comprobado que la obra y el capítulo son los mismos.</label>
    <label class="identity-check"><input type="checkbox" data-identity-same-pages>He comprobado que las páginas mantienen su orden y distribución.</label>
    ${row.context.groupId !== "local-room" ? '<label class="identity-check"><input type="checkbox" data-identity-personal>Aplicar también al progreso personal correspondiente.</label>' : ""}
    ${remote(row.context.groupId) ? '<label class="identity-check"><input type="checkbox" data-identity-share>Compartir la equivalencia con esta sala (propietario o moderador).</label>' : ""}
    <button class="btn" data-identity-link="${index}" ${compatible.length ? "" : "disabled"}>Confirmar equivalencia</button>
    ${compatible.length ? "" : "<small>Abre o actualiza la obra de destino para cargar sus capítulos. No se ha asignado ningún destino automáticamente.</small>"}
  </article>`;
}
function render() {
  if (!dialog || !report) return;
  const groups = window.HanamiReadingGroups?.groups?.() || [];
  const options = [...new Map([{ id:"local-room",name:"Datos locales / personales" },...groups].map((row)=>[row.id,row])).values()];
  const pending = report.rows.filter((row) => !row.recognized || row.layoutReview);
  const rows = [...pending,...report.rows.filter((row)=>row.recognized && !row.layoutReview)];
  report.displayRows = rows;
  dialog.innerHTML = `<header class="identity-recovery-head"><div><small>PROTECCIÓN DE DATOS · V144</small><h2 id="identityRecoveryTitle">Identidad y recuperación</h2></div><button aria-label="Cerrar recuperación" data-identity-close>×</button></header>
    <main class="identity-recovery-body">
      <p>Una dirección puede cambiar; tus anotaciones no deben perder su identidad. Aquí se revisan equivalencias sin mover ni borrar los registros originales.</p>
      <div class="identity-recovery-tools"><label>Ámbito<select data-identity-scope>${options.map((group)=>`<option value="${E(group.id)}" ${scopeId===group.id?"selected":""} ${remote(group.id)&&!window.HanamiSocialSync?.state?.().authenticated?"disabled":""}>${E(group.name)}</option>`).join("")}</select></label><button class="btn" data-identity-refresh>Actualizar inventario</button></div>
      <p class="identity-recovery-status" data-identity-message role="status" aria-live="polite">${E(report.warning || `${pending.length} identidades pendientes · ${report.pendingComments} comentarios y ${report.pendingMusic} pistas pendientes de sincronizar.`)}</p>
      ${report.backend.available===false?'<p class="identity-recovery-notice">La recuperación local funciona. Para compartir identidades y localizar música remota por alias, aplica <code>hanami-chapter-identity-v144.sql</code> y recarga Hanami.</p>':""}
      <section class="identity-recovery-backup"><h3>Copia previa protegida</h3><p>Incluye los comentarios, las colas, el progreso y la biblioteca musical local con sus archivos. No incluye las sesiones ni la configuración de autenticación de Hanami. Se descarga a tu dispositivo; no se sube a ningún servicio.</p><div><button class="btn" data-identity-export>Descargar copia previa</button><button class="btn" data-identity-current-backup>Crear copia completa actual</button></div><details><summary>Deshacer equivalencias</summary><p>Solo deshace equivalencias locales. Conserva los IDs permanentes, las anotaciones y los cambios de lectura posteriores. No revierte equivalencias ya publicadas en una sala ni restaura registros borrados ni sobrescribe revisiones remotas.</p><label>Copia de referencia<select data-identity-checkpoint>${(report.checkpoints||[]).map((item)=>`<option value="${E(item.id)}">${E(new Date(item.createdAt).toLocaleString())} · ${E(item.reason)}</option>`).join("")}</select></label><button class="btn" data-identity-undo>Deshacer equivalencias posteriores</button></details></section>
      ${report.conflicts.length?`<section><h3>Estados de lectura que requieren revisión</h3>${report.conflicts.map((conflict,index)=>`<article class="identity-recovery-row" data-identity-conflict="${index}"><b>${E(conflict.title)}</b><p>${E(conflict.chapterUrl)}</p><p>Hay estados históricos contradictorios. No se ha aplicado «leído» de forma indiscriminada.</p><label>Lectura<select data-identity-read-choice><option value="">Elige el estado correcto…</option><option value="yes">Leído</option><option value="no">No leído</option></select></label><label>Marcador<select data-identity-bookmark-choice><option value="">Elige el estado correcto…</option><option value="yes">Marcado</option><option value="no">Sin marcador</option></select></label><button class="btn" data-identity-resolve-state="${index}">Guardar estado confirmado</button></article>`).join("")}</section>`:""}
      <section><h3>Asociaciones conservadas</h3><p>Los destinos proceden de la última lista de capítulos guardada o del lector. Ábrelos primero si la fuente acaba de cambiar.</p>${rows.length?rows.slice(0,visibleRows).map(rowHtml).join(""):'<p class="identity-recovery-empty">No hay asociaciones almacenadas en este ámbito.</p>'}${rows.length>visibleRows?`<button class="btn" data-identity-more>Mostrar 20 más (${rows.length-visibleRows} restantes)</button>`:""}</section>
    </main>`;
}
async function refresh(refreshRemote) {
  report = await inventory(scopeId,{refreshRemote});
  report.checkpoints = await backup.checkpoints();
  render();
}
async function confirmLink(index) {
  const row = report.displayRows[index], element = dialog.querySelector(`[data-identity-row="${index}"]`);
  const value = element.querySelector("[data-identity-target]").value;
  if (value === "") throw new Error("Selecciona el capítulo de destino; no se ha cambiado nada.");
  const target = report.targets[Number(value)];
  const confirmed = element.querySelector("[data-identity-same-chapter]").checked;
  const pagesEquivalent = element.querySelector("[data-identity-same-pages]").checked;
  if (target.pageCount != null && row.pages.some((page) => page >= target.pageCount))
    throw new Error("Hay anotaciones en páginas que no existen en el destino. Revisa la edición antes de vincularlas.");
  const includePersonal = !!element.querySelector("[data-identity-personal]")?.checked;
  const share = !!element.querySelector("[data-identity-share]")?.checked;
  await identity.verifyAlias(row.context,{...target.context,groupId:row.context.groupId},{
    confirmed,pagesEquivalent,includePersonal,evidence:"Equivalencia y distribución de páginas confirmadas explícitamente en recuperación.",
  });
  if (share) {
    const alias = identity.pendingVerifiedAliases(row.context.groupId).find((item) =>
      item.sourceId===row.context.sourceId && item.workRef===(row.context.mangaUrl || row.context.mangaId) &&
      item.chapterRef===row.context.chapterUrl);
    try { await window.HanamiSocialSync.publishVerifiedAlias(row.context.groupId,alias); }
    catch (error) {
      await refresh(false);
      message(`La equivalencia local está guardada, pero no se compartió: ${error.message}`,true);
      return;
    }
  }
  const items = library();
  for (const item of items) mergeFetchedChapterMetadata(item,item._chapters || []);
  localStorage.setItem("hanami-library",JSON.stringify(items));
  dispatchEvent(new CustomEvent("hanami-library-change",{detail:{list:items}}));
  await refresh(false); message("Equivalencia guardada. Los registros y las operaciones pendientes conservan sus claves originales.");
}
async function resolveState(index) {
  const conflict = report.conflicts[index], element = dialog.querySelector(`[data-identity-conflict="${index}"]`);
  const readValue = element.querySelector("[data-identity-read-choice]").value;
  const bookmarkValue = element.querySelector("[data-identity-bookmark-choice]").value;
  if (!readValue || !bookmarkValue) throw new Error("Confirma tanto el estado de lectura como el marcador.");
  await backup.checkpoint("Antes de resolver un conflicto de lectura");
  const items = library(), item = items.find((row)=>String(row.id)===String(conflict.itemId));
  const chapter = item?._chapters?.find((row)=>identity.resolveChapter(identity.chapterContext(item,row))?.id===conflict.chapterId);
  if (!chapter) throw new Error("El capítulo ha cambiado. Actualiza el inventario antes de confirmar.");
  setChapterMetadata(item,chapter,{read:readValue==="yes",bookmark:bookmarkValue==="yes"},{explicitRead:true,explicitBookmark:true});
  mergeFetchedChapterMetadata(item,item._chapters);
  localStorage.setItem("hanami-library",JSON.stringify(items));
  dispatchEvent(new CustomEvent("hanami-library-change",{detail:{list:items}}));
  await refresh(false); message("Estado confirmado y guardado por identidad estable.");
}
export async function open() {
  scopeId=activeScope(); visibleRows=20;
  createDialog().innerHTML='<div class="identity-recovery-body"><h2>Preparando recuperación…</h2><p>Se está comprobando la copia previa. No se están reasignando registros.</p><button class="btn" data-identity-close>Cerrar</button></div>';
  if (!dialog.open) dialog.showModal();
  try { await refresh(true); }
  catch(error) {
    dialog.innerHTML=`<div class="identity-recovery-body"><h2>No se ha iniciado la migración</h2><p>${E(error.message)}</p><p>No borres comentarios, música ni colas. Comprueba el espacio libre y recarga Hanami para volver a crear la copia.</p><button class="btn" data-identity-close>Cerrar</button></div>`;
  }
}
document.addEventListener("click",(event)=>{if(event.target.closest("[data-identity-recovery]")?.hasAttribute("data-identity-recovery"))void open();});
window.HanamiIdentityRecovery={open,inventory};