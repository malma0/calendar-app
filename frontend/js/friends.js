// frontend/js/friends.js
import {
  getMe,
  getMyGroups,
  getGroupMembers,
  renameGroup,
  updateMyColor,
  createGroup,
  getGroupInvite,
  joinByInvite,
} from "./api.js?v=5013";

const ACTIVE_GROUP_ID_KEY = "active_group_id";

let state = {
  me: null,
  groups: [],
  activeGroup: null,
};

function byId(id) {
  return document.getElementById(id);
}

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
  renderGroupCard();

  const isOwner = !!(state.me && g.owner_id === state.me.id);
  if (renameWrap) renameWrap.hidden = !isOwner;
  if (isOwner && input) input.value = g.name;
}

async function processInviteFromUrl() {
  const params = new URLSearchParams(location.search);
  const inviteCode = (params.get("invite") || "").trim();
  if (!inviteCode) return;

  try {
    const group = await joinByInvite(inviteCode);
    state.groups = await getMyGroups();
    state.activeGroup = state.groups.find((g) => g.id === group.id) || group;
    localStorage.setItem(ACTIVE_GROUP_ID_KEY, String(state.activeGroup.id));
    renderGroupCard();
    renderGroupSheet();
    renderGroupsSheet();

    const url = new URL(location.href);
    url.searchParams.delete("invite");
    history.replaceState({}, "", url.toString());

    alert(`Вы присоединились к группе «${group.name}».`);
  } catch (err) {
    console.warn("Invite join failed", err);
  }
}

function renderMembers(list) {
  const wrap = byId("groupMembersList");
  if (!wrap) return;

  wrap.innerHTML = "";

  if (!list?.length) {
    wrap.innerHTML = `<div class="color-hint">Пока нет участников</div>`;
    return;
  }

  for (const m of list) {
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

function setMyColorUI(color) {
  const input = byId("myColorInput");
  if (input) input.value = color;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(ta);
  if (!ok) throw new Error("copy failed");
}

export async function initFriends() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFriends, { once: true });
    return;
  }

  const groupCard = byId("groupCard");
  const backdrop = byId("sheetBackdrop");

  byId("closeGroup")?.addEventListener("click", closeAllSheets);
  byId("closeInvite")?.addEventListener("click", closeAllSheets);
  byId("closeGroups")?.addEventListener("click", closeAllSheets);
  byId("closeNotifications")?.addEventListener("click", closeAllSheets);
  byId("closeSettings")?.addEventListener("click", closeAllSheets);
  backdrop?.addEventListener("click", closeAllSheets);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllSheets();
  });

  if (!groupCard) {
    console.warn("groupCard not found");
    return;
  }

  groupCard.addEventListener("click", async () => {
    try {
      await ensureGroupsLoaded();
      renderGroupSheet();

      if (state.me?.color) setMyColorUI(state.me.color);

      if (state.activeGroup) {
        let members = [];
        try {
          members = await getGroupMembers(state.activeGroup.id);
        } catch (e) {
          console.warn("getGroupMembers failed", e);
        }
        renderMembers(members);
      }

      openSheetById("groupSheet");
    } catch (err) {
      console.warn(err);
      openSheetById("groupSheet");
    }
  });

  groupCard.addEventListener("keydown", (e) => {
    if (e.key === "Enter") groupCard.click();
  });

  byId("inviteBtn")?.addEventListener("click", async () => {
    try {
      await ensureGroupsLoaded();

      const linkInput = byId("inviteLink");
      const hint = byId("inviteHint");

      if (!state.activeGroup) {
        if (linkInput) linkInput.value = "";
        if (hint) hint.textContent = "Сначала создайте или выберите группу.";
        openSheetById("inviteSheet");
        return;
      }

      const invite = await getGroupInvite(state.activeGroup.id);
      const realLink = `${location.origin}?invite=${encodeURIComponent(invite.invite_code)}`;

      if (linkInput) linkInput.value = realLink;
      if (hint) hint.textContent = "Отправьте ссылку человеку. После входа он сможет присоединиться к группе.";

      openSheetById("inviteSheet");
    } catch (e) {
      console.warn("inviteBtn click failed", e);
      alert("Не удалось открыть приглашение");
    }
  });

  byId("groupsBtn")?.addEventListener("click", async () => {
    try {
      await ensureGroupsLoaded();
      renderGroupsSheet();
      openSheetById("groupsSheet");
    } catch (e) {
      console.warn("groupsBtn click failed", e);
      alert("Не удалось загрузить группы");
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
      console.warn("createGroup failed", e);
      alert("Не удалось создать группу");
    }
  });

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
      alert("Не удалось скопировать ссылку");
    }
  });

  byId("saveGroupNameBtn")?.addEventListener("click", async () => {
    if (!state.activeGroup) return;

    const input = byId("groupNameInput");
    const name = (input?.value || "").trim();
    if (!name) return;

    try {
      if (!state.me) {
        try { state.me = await getMe(); } catch (_) {}
      }

      const isOwner = !!(state.me && state.activeGroup.owner_id === state.me.id);
      if (!isOwner) {
        alert("Только админ может менять название группы");
        return;
      }

      const updated = await renameGroup(state.activeGroup.id, name);
      state.activeGroup = updated;
      state.groups = state.groups.map((g) => g.id === updated.id ? updated : g);
      renderGroupCard();
      renderGroupSheet();
      renderGroupsSheet();
      closeAllSheets();
    } catch (err) {
      console.warn(err);
      alert("Не удалось сохранить название");
    }
  });

  byId("myColorInput")?.addEventListener("input", (e) => {
    setMyColorUI(e.target.value);
  });

  byId("myColorPalette")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".palette-swatch");
    if (!btn) return;
    const color = btn.getAttribute("data-color");
    if (!color) return;
    const input = byId("myColorInput");
    if (input) input.value = color;
    setMyColorUI(color);
  });

  byId("saveMyColorBtn")?.addEventListener("click", async () => {
    const color = byId("myColorInput")?.value || "#c9b08a";
    localStorage.setItem("myColor", color);
    setMyColorUI(color);

    try {
      await updateMyColor(color);
    } catch (e) {
      console.warn(e);
    }
  });

  try {
    state.me = await getMe();
    state.groups = await getMyGroups();
    await loadDefaultGroup();
    renderGroupCard();
    renderGroupSheet();
    renderGroupsSheet();
    await processInviteFromUrl();
  } catch (err) {
    console.warn("initFriends bootstrap failed", err);
  }
}
