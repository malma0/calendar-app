import { getMe, getMyGroups, getGroupMembers, renameGroup } from "./api.js";
import { openSheet, closeAllSheets } from "./ui/sheets.js";

console.log("friends.js version 3512 loaded");
const $ = (id) => document.getElementById(id);

let state = {
  me: null,
  groups: [],
  activeGroup: null,
};

export async function initFriends(){
  // закрытие sheet
  $("closeGroup")?.addEventListener("click", closeAllSheets);

  $("groupCard")?.onclick = async () => {
    alert("GROUP CLICK");
    openSheet("groupSheet")
  };

  // кнопки в sheet
  $("groupMembersBtn")?.addEventListener("click", async () => {
    if(!state.activeGroup) return;
    const members = await getGroupMembers(state.activeGroup.id);
    alert(
      "Участники:\n" +
      members.map(m => `${m.full_name || m.username} (${m.username})`).join("\n")
    );
  });

  $("saveGroupNameBtn")?.addEventListener("click", async () => {
    if(!state.activeGroup) return;
    const name = ($("groupNameInput")?.value || "").trim();
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
  }catch(err){
    // если не залогинен — ничего не ломаем
    console.warn(err);
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

  // переименование только owner
  const isOwner = state.me && (g.owner_id === state.me.id);
  $("renameWrap").hidden = !isOwner;
  if(isOwner){
    $("groupNameInput").value = g.name;
  }
}
