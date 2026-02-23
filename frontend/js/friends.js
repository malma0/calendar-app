// frontend/js/friends.js
import { getMe, getMyGroups, getGroupMembers, renameGroup, updateMyColor } from "./api.js";

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
  state.activeGroup = state.groups?.[0] || null;
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
  const backdrop = byId("sheetBackdrop");

  // закрытия
  closeBtn?.addEventListener("click", closeAllSheets);
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
    if (!state.me) {
      try { state.me = await getMe(); } catch (_) {}
    }

    if (!state.groups?.length) {
      try { state.groups = await getMyGroups(); } catch (err) { state.groups = []; }
    }

    await loadDefaultGroup();
    renderGroupSheet();

    // 1) Мой цвет в UI
    const savedLocal = localStorage.getItem("myColor");
    const myColor = (state.me?.color || savedLocal || "#c9b08a");
    setMyColorUI(myColor);

    // 2) Сразу грузим участников и рендерим
    if(state.activeGroup){
      const members = await getGroupMembers(state.activeGroup.id);
      renderMembers(members);
    } else {
      renderMembers([]);
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

  // кнопка "Участники"
  byId("groupMembersBtn")?.addEventListener("click", async () => {
    if (!state.activeGroup) return;

    try {
      const members = await getGroupMembers(state.activeGroup.id);
      alert(
        "Участники:\n" +
          members
            .map((m) => `${m.full_name || m.username} (${m.username})`)
            .join("\n")
      );
    } catch (err) {
      console.warn(err);
      alert("Не удалось загрузить участников");
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

  // первичная подгрузка (не критично)
  try {
    state.me = await getMe();
    state.groups = await getMyGroups();
    await loadDefaultGroup();
  } catch (err) {
    // если не залогинен — ок
    console.warn(err);
  }

  document.getElementById("myColorInput")?.addEventListener("input", (e) => {
  setMyColorUI(e.target.value);
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