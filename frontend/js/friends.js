// frontend/js/friends.js
import { getMe, getMyGroups, getGroupMembers, renameGroup, updateMyColor, createGroup } from "./api.js";

const ACTIVE_GROUP_ID_KEY = "active_group_id";

let state = {
  me: null,
  groups: [],
  activeGroup: null,
};

function byId(id) {
  return document.getElementById(id);
}

/* ===== Sheets (local, no external deps) ===== */
function openSheetById(sheetId) {
  const backdrop = byId("sheetBackdrop");
  const sheet = byId(sheetId);

  if (backdrop) backdrop.hidden = false;
  if (sheet) sheet.classList.add("open");
}

function closeAllSheets() {
  document.querySelectorAll(".sheet.open").forEach((s) => s.classList.remove("open"));
  const backdrop = byId("sheetBackdrop");
  if (backdrop) backdrop.hidden = true;
}

/* ===== Data helpers ===== */
async function loadDefaultGroup() {
  if (!state.groups?.length) state.groups = await getMyGroups();

  const storedId = Number(localStorage.getItem(ACTIVE_GROUP_ID_KEY) || 0) || null;
  state.activeGroup =
    (storedId ? state.groups.find((g) => g.id === storedId) : null) ||
    state.groups?.[0] ||
    null;
}

async function ensureGroupsLoaded() {
  if (!state.me) {
    try { state.me = await getMe(); } catch (_) {}
  }
  if (!state.groups?.length) {
    try { state.groups = await getMyGroups(); } catch (_) { state.groups = []; }
  }
  await loadDefaultGroup();
}

function renderGroupCard() {
  const title = byId("groupCardTitle");
  const sub = byId("groupCardSub");

  const g = state.activeGroup;
  if (!g) {
    if (title) title.textContent = "Группа";
    if (sub) sub.textContent = "Создайте или выберите группу";
    return;
  }

  if (title) title.textContent = `Группа “${g.name}”`;

  // обновляем карточку на странице
  renderGroupCard();
  if (sub) sub.textContent = "Откройте, чтобы увидеть участников и свой цвет";
}

function renderGroupsSheet() {
  const listEl = byId("groupsList");
  if (!listEl) return;

  listEl.innerHTML = "";

  if (!state.groups?.length) {
    listEl.innerHTML = `<div class="color-hint">Пока нет групп</div>`;
    return;
  }

  for (const g of state.groups) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "groups-item";
    const isActive = state.activeGroup && state.activeGroup.id === g.id;

    item.innerHTML = `
      <div class="groups-item-left">
        <div class="groups-dot ${isActive ? "is-active" : ""}"></div>
        <div class="groups-name">${escapeHtml(g.name)}</div>
      </div>
      <div class="row-arrow">›</div>
    `;

    item.addEventListener("click", () => {
      state.activeGroup = g;
      localStorage.setItem(ACTIVE_GROUP_ID_KEY, String(g.id));
      renderGroupCard();
      renderGroupSheet();
      closeAllSheets();
    });

    listEl.appendChild(item);
  }
}

function renderGroupSheet() {
  const title = byId("groupSheetTitle");
  const renameWrap = byId("renameWrap");
  const input = byId("groupNameInput");

  const g = state.activeGroup;

  if (!g) {
    if (title) title.textContent = "Группа";
    if (renameWrap) renameWrap.hidden = true;
    return;
  }

  if (title) title.textContent = `Группа “${g.name}”`;

  // обновляем карточку на странице
  renderGroupCard();

  const isOwner = !!(state.me && g.owner_id === state.me.id);
  if (renameWrap) renameWrap.hidden = !isOwner;
  if (isOwner && input) input.value = g.name;
}

/* ===== Init ===== */
export async function initFriends() {
  // ВАЖНО: ждём DOM, чтобы элементы точно существовали
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFriends, { once: true });
    return;
  }

  const groupCard = byId("groupCard");
  const closeBtn = byId("closeGroup");
  const closeInviteBtn = byId("closeInvite");
  const closeGroupsBtn = byId("closeGroups");
  const closeNotificationsBtn = byId("closeNotifications");
  const closeSettingsBtn = byId("closeSettings");
  const backdrop = byId("sheetBackdrop");

  // закрытия
  closeBtn?.addEventListener("click", closeAllSheets);
  closeInviteBtn?.addEventListener("click", closeAllSheets);
  closeGroupsBtn?.addEventListener("click", closeAllSheets);
  closeNotificationsBtn?.addEventListener("click", closeAllSheets);
  closeSettingsBtn?.addEventListener("click", closeAllSheets);
  byId("inviteDoneBtn")?.addEventListener("click", closeAllSheets);
  byId("groupsDoneBtn")?.addEventListener("click", closeAllSheets);
  byId("notificationsDoneBtn")?.addEventListener("click", closeAllSheets);
  byId("settingsDoneBtn")?.addEventListener("click", closeAllSheets);
  backdrop?.addEventListener("click", closeAllSheets);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllSheets();
  });

  // если карточки нет — просто выходим (чтобы ничего не падало)
  if (!groupCard) {
    console.warn("groupCard not found");
    return;
  }

  // открытие sheet по клику на карточку
  groupCard.addEventListener("click", async () => {
  try {
    await ensureGroupsLoaded();
    renderGroupSheet();

    // 1) Мой цвет в UI
    try{
      if(state.me?.color) setMyColorUI(state.me.color);
    }catch{}

    // 2) Загружаем участников и рисуем
    if(state.activeGroup){
      let members = [];
      try{
        members = await getGroupMembers(state.activeGroup.id);
      }catch(e){
        console.warn("getGroupMembers failed", e);
        members = [];
      }

      // owner username (если можем найти)
      const ownerId = state.activeGroup.owner_id;
      const owner = members.find(x => x.id === ownerId) || null;
      const ownerUsername = owner?.username || null;

      // применяем локальные оверрайды (добавленные/удалённые)
      const merged = mergeMembers(String(state.activeGroup.id), members);

      const isOwner = !!(state.me && state.activeGroup.owner_id === state.me.id);
      renderMembers(merged, { isOwner, ownerUsername });
    }

    openSheetById("groupSheet");
  } catch (err) {
    console.warn(err);
    openSheetById("groupSheet");
  }
});
  // открытие по Enter (если фокус на карточке)
  groupCard.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    groupCard.click();
  });

  // "Приглашения" (мини-окно)
  byId("inviteBtn")?.addEventListener("click", async () => {
    try {
      if (!state.me) {
        try { state.me = await getMe(); } catch (_) {}
      }
      await ensureGroupsLoaded();

      const linkInput = byId("inviteLink");
      const hint = byId("inviteHint");

      if (!state.activeGroup) {
        if (linkInput) linkInput.value = "";
        if (hint) hint.textContent = "Сначала создайте/выберите группу.";
        openSheetById("inviteSheet");
        return;
      }

      // пока демо-ссылка — логику вступления добавим позже
      const demoLink = `${location.origin}/join?group=${encodeURIComponent(state.activeGroup.id)}&code=demo`;
      if (linkInput) linkInput.value = demoLink;
      if (hint) hint.textContent = "Пока демо: ссылка не активирует вступление. Сделаем после того, как «комната» заработает.";

      openSheetById("inviteSheet");
    } catch (e) {
      console.warn(e);
      openSheetById("inviteSheet");
    }
  });

  
  // "Группы" — выбор/создание групп
  byId("groupsBtn")?.addEventListener("click", async () => {
    try {
      await ensureGroupsLoaded();
      renderGroupsSheet();
      openSheetById("groupsSheet");
    } catch (e) {
      console.warn(e);
      openSheetById("groupsSheet");
    }
  });

  byId("createGroupBtn")?.addEventListener("click", async () => {
    const name = (byId("newGroupName")?.value || "").trim();
    if (!name) return;
    try {
      const g = await createGroup(name);
      state.groups = await getMyGroups();
      state.activeGroup = state.groups.find((x) => x.id === g.id) || g;
      localStorage.setItem(ACTIVE_GROUP_ID_KEY, String(state.activeGroup.id));
      const inp = byId("newGroupName");
      if (inp) inp.value = "";
      renderGroupCard();
      renderGroupSheet();
      renderGroupsSheet();
      closeAllSheets();
    } catch (e) {
      console.warn(e);
      alert("Не удалось создать группу");
    }
  });

// копирование ссылки
  byId("copyInviteBtn")?.addEventListener("click", async () => {
    const link = (byId("inviteLink")?.value || "").trim();
    if (!link) return;
    try {
      await copyToClipboard(link);
      const btn = byId("copyInviteBtn");
      if (btn) {
        btn.classList.add("is-copied");
        setTimeout(() => btn.classList.remove("is-copied"), 900);
      }
    } catch (e) {
      console.warn(e);
      alert("Не удалось скопировать. Скопируйте вручную.");
    }
  });

  // переименование (только owner — UI уже скрывает кнопку, но мы не доверяем UI)
  byId("saveGroupNameBtn")?.addEventListener("click", async () => {
    if (!state.activeGroup) return;

    const input = byId("groupNameInput");
    const name = (input?.value || "").trim();
    if (!name) return;

    try {
      // если не знаем me — пробуем получить
      if (!state.me) {
        try {
          state.me = await getMe();
        } catch (_) {}
      }

      const isOwner = !!(state.me && state.activeGroup.owner_id === state.me.id);
      if (!isOwner) {
        alert("Только админ может менять название группы");
        return;
      }

      const updated = await renameGroup(state.activeGroup.id, name);
      state.activeGroup = updated;
      renderGroupSheet();
      closeAllSheets();
    } catch (err) {
      console.warn(err);
      alert("Не удалось сохранить название");
    }
  });

  
  // добавление участника (только админ) — пока локально (заглушка), бэк подключим позже
  byId("addMemberBtn")?.addEventListener("click", async () => {
    if(!state.activeGroup) return;
    // подстрахуемся
    if (!state.me) { try { state.me = await getMe(); } catch (_) {} }
    const isOwner = !!(state.me && state.activeGroup.owner_id === state.me.id);
    if(!isOwner){
      alert("Только админ может добавлять участников");
      return;
    }

    const username = (byId("addMemberUsername")?.value || "").trim().replace(/^@/,"");
    if(!username) return;

    const gid = String(state.activeGroup.id);
    const overrides = loadMemberOverrides();
    const ov = overrides[gid] || { added: [], removedUsernames: [] };

    // если ранее удаляли — убираем из removed
    ov.removedUsernames = (ov.removedUsernames||[]).filter(u => String(u) !== String(username));

    // добавляем "фейкового" участника
    const fake = {
      id: `local_${Date.now()}`,
      username,
      full_name: username,
      color: "#c9b08a",
    };
    ov.added = Array.isArray(ov.added) ? ov.added : [];
    if(!ov.added.some(x => String(x.username)===String(username))) ov.added.push(fake);

    overrides[gid] = ov;
    saveMemberOverrides(overrides);

    if(byId("addMemberUsername")) byId("addMemberUsername").value = "";

    // перерисовка
    let baseMembers = [];
    try{ baseMembers = await getGroupMembers(state.activeGroup.id); }catch{ baseMembers = []; }
    const merged = mergeMembers(gid, baseMembers);
    const owner = baseMembers.find(x => x.id === state.activeGroup.owner_id) || null;
    const ownerUsername = owner?.username || null;
    renderMembers(merged, { isOwner:true, ownerUsername });
  });

  // удаление участника (делегирование кликов по списку)
  document.getElementById("groupMembersList")?.addEventListener("click", async (e) => {
    const btn = e.target?.closest?.('button[data-action="remove"]');
    if(!btn) return;

    if(!state.activeGroup) return;
    if (!state.me) { try { state.me = await getMe(); } catch (_) {} }
    const isOwner = !!(state.me && state.activeGroup.owner_id === state.me.id);
    if(!isOwner){
      alert("Только админ может удалять участников");
      return;
    }

    const username = btn.getAttribute("data-username");
    if(!username) return;

    const gid = String(state.activeGroup.id);
    const overrides = loadMemberOverrides();
    const ov = overrides[gid] || { added: [], removedUsernames: [] };

    ov.removedUsernames = Array.isArray(ov.removedUsernames) ? ov.removedUsernames : [];
    if(!ov.removedUsernames.includes(username)) ov.removedUsernames.push(username);

    // если он был в added — тоже убираем
    ov.added = Array.isArray(ov.added) ? ov.added.filter(x => String(x.username)!==String(username)) : [];

    overrides[gid] = ov;
    saveMemberOverrides(overrides);

    // перерисовка
    let baseMembers = [];
    try{ baseMembers = await getGroupMembers(state.activeGroup.id); }catch{ baseMembers = []; }
    const merged = mergeMembers(gid, baseMembers);
    const owner = baseMembers.find(x => x.id === state.activeGroup.owner_id) || null;
    const ownerUsername = owner?.username || null;
    renderMembers(merged, { isOwner:true, ownerUsername });
  });

function renderMembers(list){
  const wrap = document.getElementById("groupMembersList");
  if(!wrap) return;

  wrap.innerHTML = "";

  if(!list?.length){
    wrap.innerHTML = `<div class="color-hint">Пока нет участников</div>`;
    return;
  }

  for(const m of list){
    const name = m.full_name || m.username;
    const color = m.color || "#c9b08a";

    const row = document.createElement("div");
    row.className = "member-item";
    row.innerHTML = `
      <div class="member-dot" style="background:${color}"></div>
      <div class="member-name">${escapeHtml(name)}</div>
      <div class="member-sub">@${escapeHtml(m.username)}</div>
    `;
    wrap.appendChild(row);
  }
}

function setMyColorUI(color){
  const input = document.getElementById("myColorInput");
  const preview = document.getElementById("myColorPreview");
  if(input) input.value = color;
  if(preview) preview.style.background = color;
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

async function copyToClipboard(text){
  // modern
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  // fallback
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(ta);
  if (!ok) throw new Error("execCommand copy failed");
}

  // первичная подгрузка (не критично)
  try {
    state.me = await getMe();
    state.groups = await getMyGroups();
    await loadDefaultGroup();
    renderGroupCard();
    renderGroupSheet();
  } catch (err) {
    // если не залогинен — ок
    console.warn(err);
  }

  document.getElementById("myColorInput")?.addEventListener("input", (e) => {
  setMyColorUI(e.target.value);
});

// быстрые пресеты цветов (чтобы не было пусто)
document.getElementById("myColorPalette")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".palette-swatch");
  if(!btn) return;
  const color = btn.getAttribute("data-color");
  if(!color) return;
  const input = document.getElementById("myColorInput");
  if(input) input.value = color;
  setMyColorUI(color);
});


document.getElementById("saveMyColorBtn")?.addEventListener("click", async () => {
  const color = document.getElementById("myColorInput")?.value || "#c9b08a";

  // чтобы было видно сразу даже если бэк упал
  localStorage.setItem("myColor", color);
  setMyColorUI(color);

  try{
    await updateMyColor(color);
  }catch(e){
    console.warn(e);
    // не блокируем — локально уже применили
  }
});

}