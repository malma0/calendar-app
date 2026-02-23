import { getMe, getMyGroups, getGroupMembers, renameGroup } from "./api.js";
import { openSheet, closeAllSheets } from "./ui/sheets.js";

const $ = (id) => document.getElementById(id);

let state = {
  me: null,
  groups: [],
  activeGroup: null,
};

export async function initFriends(){
  // кнопки закрытия sheet
  $("closeGroup")?.addEventListener("click", closeAllSheets);

  // открытие Group sheet
  $("openGroupBtn")?.addEventListener("click", async () => {
    if(e.key !== "Enter") return;
    await loadDefaultGroup();
    renderGroupSheet();
    openSheet("groupSheet");
  });

  // открытие по Enter (если фокус на карточке)
  $("groupCard")?.addEventListener("keydown", async (e) => {
    if(e.key !== "Enter") return;
    await loadDefaultGroup();
    renderGroupSheet();
    openSheet("groupSheet");
  });

  // кнопки в sheet
  $("groupMembersBtn")?.addEventListener("click", async () => {
    if(!state.activeGroup) return;
    const members = await getGroupMembers(state.activeGroup.id);
    alert("Участники:\n" + members.map(m => `${m.full_name || m.username} (${m.username})`).join("\n"));
  });

  $("saveGroupNameBtn")?.addEventListener("click", async () => {
    if(!state.activeGroup) return;
    const name = ($("groupNameInput").value || "").trim();
    if(!name) return;

    const updated = await renameGroup(state.activeGroup.id, name);
    state.activeGroup = updated;
    $("groupSheetTitle").textContent = `Группа “${updated.name}”`;
    closeAllSheets();
  });

  // первичная загрузка
  try{
    state.me = await getMe();
    state.groups = await getMyGroups();
    await loadDefaultGroup();
    // тут позже красиво отрендерим группу на странице, пока оставим демо-текст
  }catch(e){
    // если не залогинен — ничего не ломаем
    console.warn(e);
  }
}

async function loadDefaultGroup(){
  if(!state.groups?.length){
    state.groups = await getMyGroups();
  }
  state.activeGroup = state.groups?.[0] || null;
}

function renderGroupSheet(){
  const g = state.activeGroup;
  if(!g){
    $("groupSheetTitle").textContent = "Группа";
    $("renameWrap").hidden = true;
    return;
  }

  $("groupSheetTitle").textContent = `Группа “${g.name}”`;

  // показываем переименование только owner
  const isOwner = state.me && (g.owner_id === state.me.id);
  $("renameWrap").hidden = !isOwner;
  if(isOwner){
    $("groupNameInput").value = g.name;
  }
}