import {
  getMe,
  getMyGroups,
  getGroupMembers,
  renameGroup,
  createGroup,
  getGroupInvite,
  joinByInvite,
  updateGroupColor,
  leaveGroup,
  deleteGroup,
} from "./api.js?v=5014";

const ACTIVE_GROUP_ID_KEY = "active_group_id";

let state = {
  me: null,
  groups: [],
  activeGroup: null,
  members: [],
};

function $(id){ return document.getElementById(id); }

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function openSheet(id){
  $("sheetBackdrop") && ($("sheetBackdrop").hidden = false);
  $(id)?.classList.add("open");
}
function closeAllSheets(){
  document.querySelectorAll(".sheet.open").forEach(s => s.classList.remove("open"));
  $("sheetBackdrop") && ($("sheetBackdrop").hidden = true);
}

function setActiveGroup(group){
  state.activeGroup = group || null;
  if(group) localStorage.setItem(ACTIVE_GROUP_ID_KEY, String(group.id));
  else localStorage.removeItem(ACTIVE_GROUP_ID_KEY);
  renderGroupCard();
  renderGroupSheet();
  renderGroupsSheet();
  document.dispatchEvent(new CustomEvent("group:changed", { detail: state.activeGroup }));
}

async function refreshGroups(){
  state.groups = await getMyGroups();
  const storedId = Number(localStorage.getItem(ACTIVE_GROUP_ID_KEY) || 0) || null;
  const next = (storedId ? state.groups.find(g => g.id === storedId) : null) || state.groups[0] || null;
  setActiveGroup(next);
}

function renderGroupCard(){
  const title = $("groupCardTitle");
  const sub = $("groupCardSub");
  const g = state.activeGroup;
  if(!g){
    if(title) title.textContent = "Группа";
    if(sub) sub.textContent = "Создайте или выберите группу";
    return;
  }
  if(title) title.textContent = `Группа “${g.name}”`;
  if(sub) sub.textContent = "Нажмите, чтобы открыть участников и настройки группы";
}

function renderMembers(){
  const wrap = $("groupMembersList");
  if(!wrap) return;
  wrap.innerHTML = "";
  if(!state.members.length){
    wrap.innerHTML = `<div class="color-hint">Пока нет участников</div>`;
    return;
  }
  state.members.forEach(m => {
    const row = document.createElement("div");
    row.className = "member-item";
    row.innerHTML = `
      <div class="member-dot" style="background:${m.color || '#007AFF'}"></div>
      <div class="member-name">${escapeHtml(m.name || m.login)}</div>
      <div class="member-sub">@${escapeHtml(m.login)}</div>
    `;
    wrap.appendChild(row);
  });
}

function renderGroupSheet(){
  const g = state.activeGroup;
  const title = $("groupSheetTitle");
  const renameWrap = $("renameWrap");
  const deleteBtn = $("deleteGroupBtn");
  const leaveBtn = $("leaveGroupBtn");

  if(!g){
    if(title) title.textContent = "Группа";
    if(renameWrap) renameWrap.hidden = true;
    if(deleteBtn) deleteBtn.hidden = true;
    if(leaveBtn) leaveBtn.hidden = true;
    return;
  }

  if(title) title.textContent = `Группа “${g.name}”`;
  const isOwner = !!(state.me && g.owner_id === state.me.id);
  if(renameWrap) renameWrap.hidden = !isOwner;
  if(deleteBtn) deleteBtn.hidden = !isOwner;
  if(leaveBtn) leaveBtn.hidden = isOwner;
  if($("groupNameInput")) $("groupNameInput").value = g.name || "";
  if($("myColorInput")) $("myColorInput").value = g.member_color || "#007AFF";
}

function renderGroupsSheet(){
  const list = $("groupsList");
  if(!list) return;
  list.innerHTML = "";

  if(!state.groups.length){
    list.innerHTML = `<div class="color-hint">Пока нет групп</div>`;
    return;
  }

  state.groups.forEach(g => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "groups-item";
    const active = state.activeGroup && state.activeGroup.id === g.id;
    item.innerHTML = `
      <div class="groups-item-left">
        <div class="groups-dot ${active ? "is-active" : ""}" style="background:${g.member_color || "#5d5d5d"}"></div>
        <div class="groups-name">${escapeHtml(g.name)}</div>
      </div>
      <div class="row-arrow">›</div>
    `;
    item.addEventListener("click", async () => {
      setActiveGroup(g);
      closeAllSheets();
      await loadMembers();
    });
    list.appendChild(item);
  });
}

async function loadMembers(){
  if(!state.activeGroup){ state.members = []; renderMembers(); return; }
  try{
    state.members = await getGroupMembers(state.activeGroup.id);
  }catch{
    state.members = [];
  }
  renderMembers();
}

async function ensureBootstrapped(){
  if(!state.me){
    try { state.me = await getMe(); } catch {}
  }
  await refreshGroups();
}

async function processInviteFromUrl(){
  const params = new URLSearchParams(location.search);
  const inviteCode = (params.get("invite") || "").trim();
  if(!inviteCode) return;
  try{
    const group = await joinByInvite(inviteCode);
    await refreshGroups();
    setActiveGroup(state.groups.find(g => g.id === group.id) || group);
    await loadMembers();
    const url = new URL(location.href);
    url.searchParams.delete("invite");
    history.replaceState({}, "", url.toString());
    alert(`Вы присоединились к группе «${group.name}».`);
  }catch(err){
    console.warn(err);
  }
}

function bindUI(){
  $("sheetBackdrop")?.addEventListener("click", closeAllSheets);
  document.addEventListener("keydown", (e) => { if(e.key === "Escape") closeAllSheets(); });

  $("closeGroup")?.addEventListener("click", closeAllSheets);
  $("closeInvite")?.addEventListener("click", closeAllSheets);
  $("closeGroups")?.addEventListener("click", closeAllSheets);

  $("groupCard")?.addEventListener("click", async () => {
    await ensureBootstrapped();
    await loadMembers();
    renderGroupSheet();
    openSheet("groupSheet");
  });

  $("inviteBtn")?.addEventListener("click", async () => {
    await ensureBootstrapped();
    if(!state.activeGroup){
      $("inviteLink").value = "";
      $("inviteHint").textContent = "Сначала создайте или выберите группу.";
      return openSheet("inviteSheet");
    }
    try{
      const invite = await getGroupInvite(state.activeGroup.id);
      $("inviteLink").value = `${location.origin}${location.pathname}?invite=${encodeURIComponent(invite.invite_code)}`;
      $("inviteHint").textContent = "Отправьте ссылку человеку. После входа он присоединится к группе.";
      openSheet("inviteSheet");
    }catch(err){
      console.warn(err);
      alert("Не удалось получить ссылку приглашения");
    }
  });

  $("copyInviteBtn")?.addEventListener("click", async () => {
    const value = ($("inviteLink")?.value || "").trim();
    if(!value) return;
    try{
      await navigator.clipboard.writeText(value);
    }catch{
      $("inviteLink").select();
      document.execCommand("copy");
    }
  });

  $("groupsBtn")?.addEventListener("click", async () => {
    await ensureBootstrapped();
    renderGroupsSheet();
    openSheet("groupsSheet");
  });

  $("createGroupBtn")?.addEventListener("click", async () => {
    const name = ($("newGroupName")?.value || "").trim();
    if(!name) return;
    try{
      const g = await createGroup(name);
      $("newGroupName").value = "";
      await refreshGroups();
      setActiveGroup(state.groups.find(x => x.id === g.id) || g);
      await loadMembers();
      closeAllSheets();
    }catch(err){
      alert(err?.message || "Не удалось создать группу");
    }
  });

  $("saveGroupNameBtn")?.addEventListener("click", async () => {
    if(!state.activeGroup) return;
    const name = ($("groupNameInput")?.value || "").trim();
    if(!name) return;
    try{
      const updated = await renameGroup(state.activeGroup.id, name);
      state.groups = state.groups.map(g => g.id === updated.id ? { ...g, ...updated, member_color: g.member_color } : g);
      setActiveGroup(state.groups.find(g => g.id === updated.id));
    }catch(err){
      alert(err?.message || "Не удалось сохранить название");
    }
  });

  $("myColorPalette")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".palette-swatch");
    if(!btn) return;
    const color = btn.getAttribute("data-color");
    if(color) $("myColorInput").value = color;
  });

  $("saveMyColorBtn")?.addEventListener("click", async () => {
    if(!state.activeGroup) return;
    const color = $("myColorInput")?.value || "#007AFF";
    try{
      const updated = await updateGroupColor(state.activeGroup.id, color);
      state.activeGroup = { ...state.activeGroup, member_color: color };
      state.groups = state.groups.map(g => g.id === state.activeGroup.id ? { ...g, member_color: color } : g);
      renderGroupSheet();
      renderGroupsSheet();
      await loadMembers();
      document.dispatchEvent(new CustomEvent("group:color-updated", { detail: { groupId: state.activeGroup.id, color } }));
    }catch(err){
      alert(err?.message || "Не удалось сохранить цвет");
    }
  });

  $("leaveGroupBtn")?.addEventListener("click", async () => {
    if(!state.activeGroup) return;
    const ok = window.confirm("Выйти из группы?");
    if(!ok) return;
    try{
      await leaveGroup(state.activeGroup.id);
      await refreshGroups();
      await loadMembers();
      closeAllSheets();
    }catch(err){
      alert(err?.message || "Не удалось выйти из группы");
    }
  });

  $("deleteGroupBtn")?.addEventListener("click", async () => {
    if(!state.activeGroup) return;
    const ok = window.confirm("Удалить группу? Это действие нельзя отменить.");
    if(!ok) return;
    try{
      await deleteGroup(state.activeGroup.id);
      await refreshGroups();
      await loadMembers();
      closeAllSheets();
    }catch(err){
      alert(err?.message || "Не удалось удалить группу");
    }
  });

  document.addEventListener("profile:updated", async (e) => {
    if(e?.detail?.me) state.me = e.detail.me;
    await loadMembers();
    renderGroupSheet();
  });
}

export async function initFriends(){
  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", initFriends, { once:true });
    return;
  }
  bindUI();
  try{
    await ensureBootstrapped();
    await loadMembers();
    renderGroupCard();
    renderGroupSheet();
    renderGroupsSheet();
    await processInviteFromUrl();
  }catch(err){
    console.warn("initFriends", err);
  }
}
