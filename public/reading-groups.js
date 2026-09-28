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
  return document.querySelector(
    document.body.dataset.root === "library" ? "#libraryRoot" : "#groupsRoot",
  );
}
function roomCard(group, index) {
  const current = group.id === activeId();
  return `<article class="reading-room-card ${current ? "active" : ""}" data-group-open="${esc(group.id)}"><div class="reading-room-cover"><img src="${esc(group.cover || coverFor(index))}" alt=""><span>${current ? "sala activa" : `${group.memberCount || group.members?.length || 1} miembro(s)`}</span>${group.remote ? '<i class="reading-room-cloud" title="Sala sincronizada">☁</i>' : ""}<b>${String(index + 1).padStart(2, "0")}</b></div><div><small>${group.remote ? "SALA PRIVADA" : "COPIA LOCAL"} // ${date(group.updatedAt)}</small><h3>${esc(group.name)}</h3><p>${esc(group.quote || "Una habitación privada para leer y comentar.")}</p></div></article>`;
}
function socialControls() {
  const social = window.HanamiSocialSync?.state?.() || {};
  if (!social.configured)
    return `<span class="offline"></span><div><b>SUPABASE SIN CONFIGURAR</b><small>Añade SUPABASE_URL y SUPABASE_ANON_KEY en Vercel, o configura este navegador.</small></div><button class="btn acid" data-social-configure>Configurar</button>`;
  if (!social.authenticated)
    return `<span class="waiting"></span><div><b>ACCESO POR INVITACIÓN</b><small>Entra con un código privado. No necesitas correo ni contraseña.</small></div><button class="btn acid" data-group-join>Entrar con código</button>`;
  return `<span></span><div><b>${social.syncing ? "SINCRONIZANDO…" : "DISPOSITIVO CONECTADO"}</b><small>${esc(social.displayName || "Identidad anónima")}${social.lastError ? ` · ${esc(social.lastError)}` : ""}</small></div><div class="reading-social-actions"><button class="btn acid" data-social-sync ${social.syncing ? "disabled" : ""}>Sincronizar</button><button class="btn" data-social-signout>Olvidar</button></div>`;
}
function render() {
  const target = root();
  if (!target) return;
  document.body.classList.remove("group-access-mode");
  window.HanamiNavigation?.setChild?.(false);
  const all = groups();
  const current = active();
  const pending = window.HanamiReaderComments?.pendingCount?.() ?? 0;
  target.innerHTML = `<section class="reading-groups-home"><header class="reading-groups-appbar"><div><small>HANAMI // PRIVATE READING ROOMS</small><h2>Grupos de<br><i>lectura.</i></h2></div><button data-group-profile aria-label="Editar perfil">${esc(profile().initials)}</button></header><div class="reading-groups-hero"><img src="/assets/reading-room-bedroom.webp" alt="Habitación nocturna"><div><span>INVITE ONLY // V120</span><h3>Read the same night.</h3><p>Salas privadas, acceso por invitación y una identidad que permanece en este dispositivo.</p><div><button class="btn acid" data-group-open="${esc(current?.id || "")}">Entrar en ${esc(current?.name || "la sala")}</button><button class="btn" data-group-create>Crear grupo</button></div></div><aside><small>SALA ACTIVA</small><div class="reading-group-avatars">${(current?.members || []).slice(0, 5).map((member) => `<i title="${esc(member.name)}">${esc(member.initials || initials(member.name))}</i>`).join("")}</div><blockquote>“${esc(current?.quote || "Lee despacio.")}”</blockquote><b>${pending} cambio(s) pendiente(s)</b></aside></div><div class="reading-groups-heading"><div><small>YOUR PRIVATE ROOMS</small><h3>Salas</h3></div><div><button class="btn" data-group-join>Entrar con invitación</button><button class="btn" data-group-import>Importar</button><input class="hidden" type="file" accept="application/json,.json" data-group-import-file></div></div><div class="reading-room-grid">${all.map(roomCard).join("")}</div><footer class="reading-groups-status">${socialControls()}</footer><div class="reading-groups-portable"><button class="btn" data-group-export>Exportar sala activa</button><small>La exportación JSON sigue disponible como copia portátil.</small></div></section>`;
}
function adoptSocialIdentity(name) {
  const social = window.HanamiSocialSync?.state?.() || {};
  if (!social.user?.id) return profile();
  const previous = profile();
  const next = {
    ...previous,
    id: social.user.id,
    name: name || social.displayName || previous.name,
    initials: initials(name || social.displayName || previous.name),
    anonymous: !!social.anonymous,
    updatedAt: Date.now(),
  };
  write(PROFILE_KEY, next);
  saveGroups(
    groups().map((group) => ({
      ...group,
      ownerId: group.ownerId === previous.id ? next.id : group.ownerId,
      members: (group.members || []).map((member) =>
        member.id === previous.id ? { ...member, ...next } : member,
      ),
    })),
  );
  return next;
}
function accessScreen(mode = "join", restoring = false) {
  if (!root()) return false;
  document.body.classList.add("group-access-mode");
  window.HanamiNavigation?.setChild?.(true);
  const joining = mode === "join";
  const social = window.HanamiSocialSync?.state?.() || {};
  root().innerHTML = `<section class="reading-group-access"><header><button data-access-back aria-label="Atrás">←</button><div><small>INVITE ONLY // V120</small><h2>${joining ? "Entrar con invitación." : "Crear una sala."}</h2></div></header><div class="reading-access-layout"><form data-access-form="${joining ? "join" : "create"}"><span>${joining ? "PRIVATE ENTRY" : "ROOM ZERO"}</span><h3>${joining ? "Tu código abre una sola puerta." : "Empieza la primera noche."}</h3><p>${joining ? "La invitación se consume al entrar. Hanami creará una identidad privada para este navegador." : "Crearemos una identidad privada en este dispositivo y una sala remota preparada para invitar a tus amigos."}</p>${joining ? '<label>Código de invitación<input name="inviteCode" required minlength="8" maxlength="20" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX"></label>' : '<label>Nombre de la sala<input name="roomName" required minlength="2" maxlength="80" placeholder="Lecturas de medianoche"></label><label>Frase de la sala<input name="roomQuote" maxlength="180" placeholder="La misma historia, desde lugares distintos."></label>'}<label>Tu nombre visible<input name="displayName" required minlength="2" maxlength="40" autocomplete="nickname" value="${esc(social.displayName || (profile().name === "Tú" ? "" : profile().name))}" placeholder="Cómo te verán en la sala"></label><button class="btn acid" type="submit">${joining ? "Entrar en la sala" : "Crear sala privada"}</button></form><aside><b>IDENTIDAD DE DISPOSITIVO</b><p>No necesitas correo. La sesión queda guardada en este navegador.</p><small>Si borras los datos de Hanami o pulsas «Olvidar», no podrás recuperar todavía esta identidad en otro dispositivo.</small></aside></div></section>`;
  if (!restoring)
    window.HanamiScreens?.push(
      "reading-group-access",
      { mode },
      { restore: () => accessScreen(mode, true) },
    );
  return true;
}
function showGroupAfterAccess(group) {
  if (!group) return;
  mergeRemoteGroups([group], false);
  setActive(group.id);
  window.HanamiLibraryGroups?.activate?.(group.id, false);
  const current = window.HanamiScreens?.current?.();
  if (current) {
    window.HanamiScreens.markClosed(current.id);
    window.HanamiScreens.back();
  } else {
    window.HanamiAppShowTab?.("library", false);
    window.HanamiLibrary?.render?.();
  }
}
function detail(group, restoring = false) {
  if (!group || !root()) return;
  document.body.classList.remove("group-access-mode");
  window.HanamiNavigation?.setChild?.(true);
  setActive(group.id);
  const socialUser = window.HanamiSocialSync?.state?.().user;
  const canInvite = group.remote && socialUser?.id === group.ownerId;
  root().innerHTML = `<section class="reading-group-detail"><header><button data-group-back aria-label="Atrás">←</button><div><small>PRIVATE ROOM // V121</small><h2>${esc(group.name)}</h2></div><button data-group-more>•••</button></header><div class="reading-group-banner"><img src="${esc(group.cover)}" alt=""><div><span>${group.remote ? "SALA SINCRONIZADA" : "SALA LOCAL"}</span><blockquote>“${esc(group.quote)}”</blockquote></div></div><div class="reading-group-columns"><section><div class="reading-groups-heading"><div><small>PRESENCE</small><h3>Miembros</h3></div>${canInvite ? '<button class="btn" data-group-invites>Crear invitación</button>' : ""}</div><div class="reading-member-list">${(group.members || []).map((member) => `<article><i>${esc(member.initials || initials(member.name))}</i><div><b>${esc(member.name)}</b><small>${member.id === group.ownerId ? "ADMINISTRA LA SALA" : "MIEMBRO"}</small></div><span>${member.id === socialUser?.id ? "este dispositivo" : "miembro"}</span></article>`).join("")}</div></section><aside><small>SYNC QUEUE</small><strong>${window.HanamiReaderComments?.pendingCount?.() ?? 0}</strong><p>${group.remote ? "Cambios preparados para Supabase." : "Sala local disponible sin conexión."}</p>${group.remote ? '<button class="btn acid" data-social-sync>Sincronizar ahora</button>' : '<button class="btn acid" data-group-export>Exportar ahora</button>'}<button class="btn" data-group-rename>Editar sala</button></aside></div></section>`;
  window.HanamiGroupLibrary?.ensure?.(group.id);
  if (!restoring && window.HanamiScreens)
    window.HanamiScreens.push(
      "reading-group",
      { id: group.id },
      { restore: () => detail(groups().find((item) => item.id === group.id), true) },
    );
}
function inviteStatus(invite) {
  if (invite.revoked_at) return "revocada";
  if (new Date(invite.expires_at).getTime() <= Date.now()) return "caducada";
  if (Number(invite.use_count) >= Number(invite.max_uses)) return "utilizada";
  return "activa";
}
async function invitesScreen(group = active(), restoring = false, created = null) {
  if (!group || !root()) return false;
  document.body.classList.add("group-access-mode");
  window.HanamiNavigation?.setChild?.(true);
  root().innerHTML = `<section class="reading-group-invites"><header><button data-invites-back aria-label="Atrás">←</button><div><small>ACCESS DESK // V120</small><h2>Invitaciones.</h2></div></header><div class="reading-invite-loading">Preparando códigos privados…</div></section>`;
  if (!restoring)
    window.HanamiScreens?.push(
      "reading-group-invites",
      { id: group.id },
      { restore: () => invitesScreen(groups().find((item) => item.id === group.id), true) },
    );
  try {
    const invites = await window.HanamiSocialSync.listInvites(group.id);
    const createdBlock = created
      ? `<section class="reading-invite-created"><small>NUEVA INVITACIÓN · SOLO SE MUESTRA AHORA</small><strong>${esc(created.code)}</strong><p>Caduca ${new Date(created.expires_at).toLocaleString("es")} · ${created.max_uses} uso(s)</p><button class="btn acid" data-copy-created-code="${esc(created.code)}">Copiar código</button></section>`
      : "";
    root().innerHTML = `<section class="reading-group-invites"><header><button data-invites-back aria-label="Atrás">←</button><div><small>ACCESS DESK // V120</small><h2>Invitaciones.</h2></div></header><div class="reading-invite-intro"><div><span>SALA PRIVADA</span><h3>${esc(group.name)}</h3><p>Cada código se guarda mediante hash, caduca y solo puede utilizarse una vez.</p></div><button class="btn acid" data-invite-create>Generar invitación</button></div>${createdBlock}<div class="reading-invite-list">${invites.length ? invites.map((invite) => { const status = inviteStatus(invite); return `<article class="${status}"><i>${esc(invite.code_hint)}</i><div><b>Código ····-${esc(invite.code_hint)}</b><small>${status.toUpperCase()} · ${invite.use_count}/${invite.max_uses} usos · caduca ${new Date(invite.expires_at).toLocaleString("es")}</small></div>${status === "activa" ? `<button class="btn" data-invite-revoke="${esc(invite.id)}">Revocar</button>` : ""}</article>`; }).join("") : '<div class="reading-invite-empty">Todavía no has creado invitaciones para esta sala.</div>'}</div><aside><b>UNA PUERTA, UNA PERSONA.</b><p>Genera un código distinto para cada amigo. Si un código sale de vuestro círculo, revócalo antes de que se utilice.</p></aside></section>`;
  } catch (error) {
    window.HanamiSnackbar?.show?.(error.message, { kind: "error" });
    detail(group, true);
    return false;
  }
  return true;
}
async function createGroup() {
  const social = window.HanamiSocialSync?.state?.() || {};
  if (social.configured && !social.authenticated) {
    accessScreen("create");
    return null;
  }
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
  const social = window.HanamiSocialSync?.state?.() || {};
  if (social.configured) {
    accessScreen("join");
    return null;
  }
  const code = prompt("Código de invitación")?.trim().toUpperCase();
  if (!code) return;
  const existing = groups().find((group) => group.inviteCode === code);
  if (existing) {
    setActive(existing.id);
    return detail(existing);
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
  if (shouldRender) {
    if (document.body.dataset.root === "library")
      window.HanamiLibrary?.render?.();
    else if (document.body.dataset.root === "groups") render();
  }
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
async function editProfile() {
  const current = profile();
  const name = prompt("Tu nombre visible", current.name)?.trim();
  if (!name) return;
  if (window.HanamiSocialSync?.state?.().authenticated)
    await window.HanamiSocialSync.updateProfile(name);
  write(PROFILE_KEY, { ...current, name, initials: initials(name), updatedAt: Date.now() });
  const all = groups().map((group) => ({
    ...group,
    members: (group.members || []).map((member) =>
      member.id === current.id ? { ...member, name, initials: initials(name) } : member,
    ),
  }));
  saveGroups(all);
  if (root()?.querySelector(".reading-group-detail")) detail(active(), true);
  else render();
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
  if (button.hasAttribute("data-group-create")) {
    const social = window.HanamiSocialSync?.state?.() || {};
    if (social.configured && !social.authenticated) accessScreen("create");
    else await socialAction(createGroup);
  }
  if (button.hasAttribute("data-group-join")) {
    const social = window.HanamiSocialSync?.state?.() || {};
    if (social.configured) accessScreen("join");
    else await socialAction(joinGroup);
  }
  if (button.hasAttribute("data-group-profile"))
    await socialAction(editProfile, "Nombre actualizado");
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
  if (button.hasAttribute("data-social-signout")) {
    const accepted = confirm(
      "Esta identidad anónima solo vive en este dispositivo. Si la olvidas, todavía no podrás recuperarla. ¿Continuar?",
    );
    if (accepted)
      await socialAction(
        () => window.HanamiSocialSync.signOut(),
        "Identidad olvidada en este dispositivo",
      );
  }
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
  if (button.hasAttribute("data-access-back") || button.hasAttribute("data-invites-back"))
    window.HanamiScreens?.back();
  if (button.hasAttribute("data-group-invites"))
    await invitesScreen(active());
  if (button.hasAttribute("data-invite-create")) {
    const created = await socialAction(
      () => window.HanamiSocialSync.createInvite(activeId(), 168, 1),
      "Invitación de un solo uso creada",
    );
    if (created) {
      await navigator.clipboard?.writeText(created.code).catch(() => {});
      await invitesScreen(active(), true, created);
    }
  }
  if (button.dataset.copyCreatedCode) {
    await navigator.clipboard?.writeText(button.dataset.copyCreatedCode).catch(() => {});
    window.HanamiSnackbar?.show?.("Código copiado", { kind: "success" });
  }
  if (button.dataset.inviteRevoke) {
    const accepted = confirm("¿Revocar esta invitación?");
    if (accepted) {
      const result = await socialAction(
        () => window.HanamiSocialSync.revokeInvite(button.dataset.inviteRevoke),
        "Invitación revocada",
      );
      if (result) await invitesScreen(active(), true);
    }
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
document.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-access-form]");
  if (!form) return;
  event.preventDefault();
  const submit = form.querySelector('[type="submit"]');
  const values = new FormData(form);
  const displayName = String(values.get("displayName") || "").trim();
  submit.disabled = true;
  submit.setAttribute("aria-busy", "true");
  try {
    let group;
    if (form.dataset.accessForm === "join") {
      group = await window.HanamiSocialSync.redeemInvite(
        values.get("inviteCode"),
        displayName,
      );
      adoptSocialIdentity(displayName);
      window.HanamiSnackbar?.show?.(`Bienvenido a ${group.name}`, {
        kind: "success",
      });
    } else {
      if (!window.HanamiSocialSync.state().authenticated)
        await window.HanamiSocialSync.signInAnonymously(displayName);
      else await window.HanamiSocialSync.updateProfile(displayName);
      adoptSocialIdentity(displayName);
      group = await window.HanamiSocialSync.createGroup({
        name: String(values.get("roomName") || "").trim(),
        quote:
          String(values.get("roomQuote") || "").trim() ||
          "La misma historia, desde lugares distintos.",
      });
      window.HanamiSnackbar?.show?.("Sala privada creada", {
        kind: "success",
      });
    }
    showGroupAfterAccess(group);
  } catch (error) {
    window.HanamiSnackbar?.show?.(error.message, { kind: "error" });
    submit.disabled = false;
    submit.removeAttribute("aria-busy");
  }
});
document.addEventListener("input", (event) => {
  if (event.target.name !== "inviteCode") return;
  const raw = event.target.value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
  event.target.value = raw.match(/.{1,4}/g)?.join("-") || "";
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
  accessScreen,
  invitesScreen,
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
window.HanamiScreens?.registerType?.("reading-group-access", (record) =>
  accessScreen(record.data?.mode || "join", true),
);
window.HanamiScreens?.registerType?.("reading-group-invites", (record) =>
  invitesScreen(groups().find((item) => item.id === record.data?.id), true),
);