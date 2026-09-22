const GROUPS_KEY = "hanami-reading-groups-v1";
const PROFILE_KEY = "hanami-reading-profile-v1";
const ACTIVE_KEY = "hanami-active-reading-group";
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) =>
  localStorage.setItem(key, JSON.stringify(value));
const randomId = () =>
  crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const inviteCode = () =>
  crypto
    .getRandomValues(new Uint8Array(5))
    .reduce((value, byte) => value + "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[byte % 32], "");

function profile() {
  let value = read(PROFILE_KEY, null);
  if (!value) {
    value = { id: randomId(), name: "Tú", initials: "TÚ", createdAt: Date.now() };
    write(PROFILE_KEY, value);
  }
  return value;
}
function groups() {
  let value = read(GROUPS_KEY, []);
  if (!value.length) {
    const user = profile();
    value = [
      {
        id: "local-room",
        name: "Mi sala nocturna",
        inviteCode: inviteCode(),
        ownerId: user.id,
        members: [{ id: user.id, name: user.name, initials: user.initials }],
        cover: "/assets/reading-room-bedroom.webp",
        quote: "Deja algo escrito antes de cerrar el capítulo.",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
    write(GROUPS_KEY, value);
  }
  return value;
}
function activeId() {
  const all = groups();
  const stored = localStorage.getItem(ACTIVE_KEY);
  const id = all.some((group) => group.id === stored) ? stored : all[0].id;
  localStorage.setItem(ACTIVE_KEY, id);
  return id;
}
function active() {
  return groups().find((group) => group.id === activeId()) || null;
}
function setActive(id) {
  if (!groups().some((group) => group.id === id)) return false;
  localStorage.setItem(ACTIVE_KEY, id);
  dispatchEvent(new CustomEvent("hanami-reading-group-change", { detail: { id } }));
  window.HanamiReaderComments?.renderAll?.();
  return true;
}
function saveGroups(value) {
  write(GROUPS_KEY, value);
  dispatchEvent(new CustomEvent("hanami-reading-groups-change", { detail: { groups: value } }));
}
function initials(name) {
  return (
    String(name || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?"
  );
}
function coverFor(index) {
  return [
    "/assets/reading-room-bedroom.webp",
    "/assets/reading-room-graffiti.webp",
    "/assets/reading-room-nazuna.webp",
  ][index % 3];
}
function date(value) {
  return new Date(value || Date.now()).toLocaleDateString("es", {
    day: "numeric",
    month: "short",
  });
}
function root() {
  return document.querySelector("#groupsRoot");
}
function roomCard(group, index) {
  const current = group.id === activeId();
  return `<article class="reading-room-card ${current ? "active" : ""}" data-group-open="${esc(group.id)}"><div class="reading-room-cover"><img src="${esc(group.cover || coverFor(index))}" alt=""><span>${current ? "sala activa" : `${group.memberCount || group.members?.length || 1} miembro(s)`}</span>${group.remote ? '<i class="reading-room-cloud" title="Sala sincronizada">☁</i>' : ""}<b>${String(index + 1).padStart(2, "0")}</b></div><div><small>${esc(group.inviteCode)} // ${date(group.updatedAt)}</small><h3>${esc(group.name)}</h3><p>${esc(group.quote || "Una habitación privada para leer y comentar.")}</p></div></article>`;
}
function socialControls() {
  const social = window.HanamiSocialSync?.state?.() || {};
  if (!social.configured)
    return `<span class="offline"></span><div><b>SUPABASE SIN CONFIGURAR</b><small>Añade SUPABASE_URL y SUPABASE_ANON_KEY en Vercel, o configura este navegador.</small></div><button class="btn acid" data-social-configure>Configurar</button>`;
  if (!social.authenticated)
    return `<span class="waiting"></span><div><b>BACKEND PREPARADO</b><small>Inicia sesión por enlace mágico para crear y compartir salas privadas.</small></div><button class="btn acid" data-social-login>Entrar por email</button>`;
  return `<span></span><div><b>${social.syncing ? "SINCRONIZANDO…" : "SUPABASE CONECTADO"}</b><small>${esc(social.user?.email || "Sesión autenticada")}${social.lastError ? ` · ${esc(social.lastError)}` : ""}</small></div><div class="reading-social-actions"><button class="btn acid" data-social-sync ${social.syncing ? "disabled" : ""}>Sincronizar</button><button class="btn" data-social-signout>Salir</button></div>`;
}
function render() {
  const target = root();
  if (!target) return;
  const all = groups();
  const current = active();
  const pending = window.HanamiReaderComments?.pendingCount?.() ?? 0;
  target.innerHTML = `<section class="reading-groups-home"><header class="reading-groups-appbar"><div><small>HANAMI // PRIVATE READING ROOMS</small><h2>Grupos de<br><i>lectura.</i></h2></div><button data-group-profile aria-label="Editar perfil">${esc(profile().initials)}</button></header><div class="reading-groups-hero"><img src="/assets/reading-room-bedroom.webp" alt="Habitación nocturna"><div><span>ROOM SYNC // V117</span><h3>Read the same night.</h3><p>Salas privadas, identidad por email y comentarios preparados para viajar entre dispositivos.</p><div><button class="btn acid" data-group-open="${esc(current?.id || "")}">Entrar en ${esc(current?.name || "la sala")}</button><button class="btn" data-group-create>Crear grupo</button></div></div><aside><small>SALA ACTIVA</small><div class="reading-group-avatars">${(current?.members || []).slice(0, 5).map((member) => `<i title="${esc(member.name)}">${esc(member.initials || initials(member.name))}</i>`).join("")}</div><blockquote>“${esc(current?.quote || "Lee despacio.")}”</blockquote><b>${pending} cambio(s) pendiente(s)</b></aside></div><div class="reading-groups-heading"><div><small>YOUR PRIVATE ROOMS</small><h3>Salas</h3></div><div><button class="btn" data-group-join>Unirse con código</button><button class="btn" data-group-import>Importar</button><input class="hidden" type="file" accept="application/json,.json" data-group-import-file></div></div><div class="reading-room-grid">${all.map(roomCard).join("")}</div><footer class="reading-groups-status">${socialControls()}</footer><div class="reading-groups-portable"><button class="btn" data-group-export>Exportar sala activa</button><small>La exportación JSON sigue disponible como copia portátil.</small></div></section>`;
}
function detail(group, restoring = false) {
  if (!group || !root()) return;
  window.HanamiNavigation?.setChild?.(false);
  setActive(group.id);
  root().innerHTML = `<section class="reading-group-detail"><header><button data-group-back aria-label="Atrás">←</button><div><small>PRIVATE ROOM // ${esc(group.inviteCode)}</small><h2>${esc(group.name)}</h2></div><button data-group-more>•••</button></header><div class="reading-group-banner"><img src="${esc(group.cover)}" alt=""><div><span>${group.remote ? "SALA SINCRONIZADA" : "SALA LOCAL"}</span><blockquote>“${esc(group.quote)}”</blockquote></div></div>${window.HanamiGroupLibrary?.section?.(group) || ""}<div class="reading-group-columns"><section><div class="reading-groups-heading"><div><small>PRESENCE</small><h3>Miembros</h3></div><button class="btn" data-group-copy-code>Copiar invitación</button></div><div class="reading-member-list">${(group.members || []).map((member, index) => `<article><i>${esc(member.initials || initials(member.name))}</i><div><b>${esc(member.name)}</b><small>${member.id === group.ownerId ? "ADMINISTRA LA SALA" : "MIEMBRO"}</small></div><span>${index ? "miembro" : "en este dispositivo"}</span></article>`).join("")}</div></section><aside><small>SYNC QUEUE</small><strong>${window.HanamiReaderComments?.pendingCount?.() ?? 0}</strong><p>${group.remote ? "Cambios preparados para Supabase." : "Sala local disponible sin conexión."}</p>${group.remote ? '<button class="btn acid" data-social-sync>Sincronizar ahora</button>' : '<button class="btn acid" data-group-export>Exportar ahora</button>'}<button class="btn" data-group-rename>Editar sala</button></aside></div></section>`;
  window.HanamiGroupLibrary?.ensure?.(group.id);
  if (!restoring && window.HanamiScreens)
    window.HanamiScreens.push(
      "reading-group",
      { id: group.id },
      { restore: () => detail(groups().find((item) => item.id === group.id), true) },
    );
}
async function createGroup() {
  const name = prompt("Nombre del grupo", "Lecturas de medianoche")?.trim();
  if (!name) return;
  const quote =
    prompt(
      "Frase del grupo",
      "La misma historia, desde lugares distintos.",
    )?.trim() || "La misma historia, desde lugares distintos.";
  if (window.HanamiSocialSync?.state?.().authenticated) {
    const group = await window.HanamiSocialSync.createGroup({ name, quote });
    mergeRemoteGroups([group]);
    setActive(group.id);
    render();
    return group;
  }
  const all = groups();
  const user = profile();
  const group = {
    id: randomId(),
    name,
    inviteCode: inviteCode(),
    ownerId: user.id,
    members: [{ ...user }],
    cover: coverFor(all.length),
    quote,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  all.push(group);
  saveGroups(all);
  setActive(group.id);
  render();
}
async function joinGroup() {
  const code = prompt("Código de invitación")?.trim().toUpperCase();
  if (!code) return;
  const existing = groups().find((group) => group.inviteCode === code);
  if (existing) {
    setActive(existing.id);
    return detail(existing);
  }
  if (window.HanamiSocialSync?.state?.().authenticated) {
    const group = await window.HanamiSocialSync.joinGroup(code);
    mergeRemoteGroups([group]);
    setActive(group.id);
    detail(group);
    return group;
  }
  const name = prompt(
    "La sala todavía no está en este dispositivo. Escribe su nombre",
    `Sala ${code}`,
  )?.trim();
  if (!name) return;
  const all = groups();
  const user = profile();
  const group = {
    id: randomId(),
    name,
    inviteCode: code,
    ownerId: "",
    members: [{ ...user }],
    cover: coverFor(all.length),
    quote: "Sala importada; esperando sincronización remota.",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  all.push(group);
  saveGroups(all);
  setActive(group.id);
  render();
}
function mergeRemoteGroups(
  remote = [],
  shouldRender = !root()?.querySelector(".reading-group-detail"),
) {
  if (!remote.length) return groups();
  const all = groups();
  for (const incoming of remote) {
    const index = all.findIndex((group) => group.id === incoming.id);
    const value = {
      ...(index >= 0 ? all[index] : {}),
      ...incoming,
      cover: incoming.cover || coverFor(Math.max(index, all.length)),
      remote: true,
    };
    if (index >= 0) all[index] = value;
    else all.push(value);
  }
  saveGroups(all);
  if (shouldRender) render();
  return all;
}
async function exportActive() {
  const group = active();
  const bundle = await window.HanamiReaderComments?.exportBundle?.(group.id);
  const payload = {
    schema: "hanami-reading-group-v1",
    exportedAt: new Date().toISOString(),
    group,
    comments: bundle?.comments || [],
    groupLibrary: window.HanamiGroupLibrary?.exportBundle?.(group.id) || null,
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `hanami-${group.name.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
async function importBundle(file) {
  const payload = JSON.parse(await file.text());
  if (payload.schema !== "hanami-reading-group-v1" || !payload.group)
    throw new Error("Archivo de grupo incompatible.");
  const all = groups();
  const index = all.findIndex((group) => group.id === payload.group.id);
  if (index < 0) all.push(payload.group);
  else all[index] = { ...all[index], ...payload.group, updatedAt: Date.now() };
  saveGroups(all);
  await window.HanamiReaderComments?.importBundle?.({
    groupId: payload.group.id,
    comments: payload.comments || [],
  });
  window.HanamiGroupLibrary?.importBundle?.(
    payload.group.id,
    payload.groupLibrary || {},
  );
  setActive(payload.group.id);
  render();
}
function editProfile() {
  const current = profile();
  const name = prompt("Tu nombre visible", current.name)?.trim();
  if (!name) return;
  write(PROFILE_KEY, { ...current, name, initials: initials(name), updatedAt: Date.now() });
  const all = groups().map((group) => ({
    ...group,
    members: (group.members || []).map((member) =>
      member.id === current.id ? { ...member, name, initials: initials(name) } : member,
    ),
  }));
  saveGroups(all);
  render();
}
async function socialAction(action, success) {
  const preserveDetail = !!root()?.querySelector(".reading-group-detail");
  try {
    const result = await action();
    if (success) window.HanamiSnackbar?.show?.(success, { kind: "success" });
    if (preserveDetail && active()) detail(active(), true);
    else render();
    return result;
  } catch (error) {
    window.HanamiSnackbar?.show?.(error.message, { kind: "error" });
    return null;
  }
}
document.addEventListener("click", async (event) => {
  const button = event.target.closest("button,[data-group-open]");
  if (!button) return;
  if (button.dataset.groupOpen)
    detail(groups().find((group) => group.id === button.dataset.groupOpen));
  if (button.hasAttribute("data-group-create"))
    await socialAction(createGroup);
  if (button.hasAttribute("data-group-join"))
    await socialAction(joinGroup);
  if (button.hasAttribute("data-group-profile")) editProfile();
  if (button.hasAttribute("data-group-export")) exportActive();
  if (button.hasAttribute("data-group-import"))
    root()?.querySelector("[data-group-import-file]")?.click();
  if (button.hasAttribute("data-social-configure")) {
    const url = prompt(
      "URL del proyecto Supabase",
      read("hanami-supabase-config-v1", {})?.url || "",
    )?.trim();
    const key =
      url &&
      prompt(
        "Clave pública anon de Supabase",
        read("hanami-supabase-config-v1", {})?.anonKey || "",
      )?.trim();
    if (url && key)
      await socialAction(
        async () => window.HanamiSocialSync.configure(url, key),
        "Supabase configurado",
      );
  }
  if (button.hasAttribute("data-social-login")) {
    const email = prompt("Correo para recibir el enlace mágico")?.trim();
    if (email)
      await socialAction(
        () => window.HanamiSocialSync.signIn(email),
        "Revisa tu correo para entrar en Hanami",
      );
  }
  if (button.hasAttribute("data-social-signout"))
    await socialAction(
      () => window.HanamiSocialSync.signOut(),
      "Sesión cerrada",
    );
  if (button.hasAttribute("data-social-sync")) {
    const result = await socialAction(
      () => window.HanamiSocialSync.sync(activeId()),
    );
    if (result)
      window.HanamiSnackbar?.show?.(
        `${result.pushed} cambio(s) enviados · ${result.pulled} recibidos`,
        { kind: "success" },
      );
    if (root()?.querySelector(".reading-group-detail")) detail(active(), true);
  }
  if (button.hasAttribute("data-group-back")) window.HanamiScreens?.back();
  if (button.hasAttribute("data-group-copy-code")) {
    navigator.clipboard?.writeText(active()?.inviteCode || "");
    window.HanamiSnackbar?.show?.("Código de invitación copiado");
  }
  if (button.hasAttribute("data-group-rename")) {
    const group = active();
    const name = prompt("Nombre de la sala", group.name)?.trim();
    const quote = name && prompt("Frase de la sala", group.quote)?.trim();
    if (name && quote) {
      saveGroups(
        groups().map((item) =>
          item.id === group.id ? { ...item, name, quote, updatedAt: Date.now() } : item,
        ),
      );
      detail(active(), true);
    }
  }
});
document.addEventListener("change", async (event) => {
  if (!event.target.matches("[data-group-import-file]") || !event.target.files?.[0])
    return;
  try {
    await importBundle(event.target.files[0]);
    window.HanamiSnackbar?.show?.("Sala y comentarios importados", { kind: "success" });
  } catch (error) {
    window.HanamiSnackbar?.show?.(error.message, { kind: "error" });
  }
  event.target.value = "";
});
addEventListener("hanami-reader-comments-ready", () => {
  if (!root()?.querySelector(".reading-group-detail")) render();
});
addEventListener("hanami-social-state", () => {
  const remote = window.HanamiSocialSync?.cachedGroups?.() || [];
  const inDetail = !!root()?.querySelector(".reading-group-detail");
  if (remote.length) mergeRemoteGroups(remote, !inDetail);
  if (
    document.body.dataset.root === "groups" &&
    !inDetail
  )
    render();
});
window.HanamiReadingGroups = {
  render,
  detail,
  groups,
  active,
  activeId,
  setActive,
  profile,
  mergeRemoteGroups,
};
profile();
groups();
window.HanamiSocialSync?.ready?.then(() => {
  const remote = window.HanamiSocialSync?.cachedGroups?.() || [];
  if (remote.length) mergeRemoteGroups(remote);
});