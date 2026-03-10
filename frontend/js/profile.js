import { getMe, clearToken, updateMe } from "./api.js?v=5014";

const LS = {
  avatar: "profile_avatar",
  theme: "theme_mode",
  notifMaster: "notif_master",
  notifPlans: "notif_plans",
  notifFreeDay: "notif_free_day",
  notifFreeSlot: "notif_free_slot",
  weekStart: "weekStart",
  timeFormat: "timeFormat",
};

function byId(id) { return document.getElementById(id); }

function openSheetById(sheetId) {
  const backdrop = byId("sheetBackdrop");
  const sheet = byId(sheetId);
  if (backdrop) {
    backdrop.hidden = false;
    backdrop.classList.add("visible");
  }
  if (sheet) {
    sheet.hidden = false;
    requestAnimationFrame(() => sheet.classList.add("open"));
  }
}
function closeAllSheets() {
  document.querySelectorAll(".sheet.open").forEach((s) => {
    s.classList.remove("open");
    if (s.id === "notificationsSheet" || s.id === "settingsSheet") s.hidden = true;
  });
  const backdrop = byId("sheetBackdrop");
  if (backdrop) {
    backdrop.classList.remove("visible");
    backdrop.hidden = true;
  }
}

function setAvatarEl(el, value){
  if(!el) return;
  if(value && /^data:image\//.test(value)){
    el.innerHTML = `<img src="${value}" alt="" />`;
    el.classList.add("has-image");
  } else {
    el.textContent = "👤";
    el.classList.remove("has-image");
  }
}
function getLocalAvatar(){ return localStorage.getItem(LS.avatar) || ""; }

function applyTheme(mode) {
  const body = document.body;
  if (!body) return;
  const isLight = mode === "light";
  body.classList.toggle("theme-light", isLight);
  const toggle = byId("themeToggle");
  if (toggle) toggle.checked = isLight;
  localStorage.setItem(LS.theme, isLight ? "light" : "dark");
}
function initThemeUI() {
  const saved = localStorage.getItem(LS.theme) || "dark";
  applyTheme(saved);
  byId("themeToggle")?.addEventListener("change", (e) => {
    applyTheme(e.target.checked ? "light" : "dark");
  });
}

function initSettingsExtras(){
  const weekSeg = byId("weekStartSeg");
  const timeSeg = byId("timeFormatSeg");
  const savedWeek = localStorage.getItem(LS.weekStart) || "mon";
  const savedTime = localStorage.getItem(LS.timeFormat) || "24";
  function setActive(seg, value){
    if(!seg) return;
    seg.querySelectorAll(".seg-btn").forEach(btn=> btn.classList.toggle("active", btn.getAttribute("data-value") === value));
  }
  setActive(weekSeg, savedWeek);
  setActive(timeSeg, savedTime);
  weekSeg?.addEventListener("click", (e)=>{
    const btn = e.target.closest(".seg-btn");
    if(!btn) return;
    const v = btn.getAttribute("data-value");
    localStorage.setItem(LS.weekStart, v);
    setActive(weekSeg, v);
    document.dispatchEvent(new CustomEvent("settings:weekStart", { detail: v }));
  });
  timeSeg?.addEventListener("click", (e)=>{
    const btn = e.target.closest(".seg-btn");
    if(!btn) return;
    const v = btn.getAttribute("data-value");
    localStorage.setItem(LS.timeFormat, v);
    setActive(timeSeg, v);
    document.dispatchEvent(new CustomEvent("settings:timeFormat", { detail: v }));
  });
}

function ensureNotifDefaults() {
  if (localStorage.getItem(LS.notifMaster) === null) localStorage.setItem(LS.notifMaster, "1");
  if (localStorage.getItem(LS.notifPlans) === null) localStorage.setItem(LS.notifPlans, "1");
  if (localStorage.getItem(LS.notifFreeDay) === null) localStorage.setItem(LS.notifFreeDay, "1");
  if (localStorage.getItem(LS.notifFreeSlot) === null) localStorage.setItem(LS.notifFreeSlot, "1");
}
function animateCollapse(el, open) {
  if (!el) return;
  if (open) {
    el.hidden = false;
    const h = el.scrollHeight;
    el.style.maxHeight = "0px";
    el.style.opacity = "0";
    requestAnimationFrame(() => {
      el.style.maxHeight = h + "px";
      el.style.opacity = "1";
    });
  } else {
    const h = el.scrollHeight;
    el.style.maxHeight = h + "px";
    el.style.opacity = "1";
    requestAnimationFrame(() => {
      el.style.maxHeight = "0px";
      el.style.opacity = "0";
    });
    window.setTimeout(() => { el.hidden = true; }, 180);
  }
}
function setNotifUIFromStorage() {
  ensureNotifDefaults();
  const master = localStorage.getItem(LS.notifMaster) === "1";
  const plans = localStorage.getItem(LS.notifPlans) === "1";
  const freeDay = localStorage.getItem(LS.notifFreeDay) === "1";
  const freeSlot = localStorage.getItem(LS.notifFreeSlot) === "1";
  if (byId("notifMaster")) byId("notifMaster").checked = master;
  if (byId("notifPlans")) byId("notifPlans").checked = plans;
  if (byId("notifFreeDay")) byId("notifFreeDay").checked = freeDay;
  if (byId("notifFreeSlot")) byId("notifFreeSlot").checked = freeSlot;
  animateCollapse(byId("notifSubWrap"), master);
}

function renderProfileHeader(me) {
  setAvatarEl(byId("profileAvatar"), getLocalAvatar());
  if (byId("profileLogin")) byId("profileLogin").textContent = me?.username || "Профиль";
}

function openProfileEdit(me) {
  const fs = byId("profileEdit");
  if (!fs) return;
  if (byId("editNickname")) byId("editNickname").value = me?.username || "";
  if (byId("editFullName")) byId("editFullName").value = me?.full_name || "";
  setAvatarEl(byId("editAvatarPreview"), getLocalAvatar());
  fs.hidden = false;
  fs.style.display = "flex";
  requestAnimationFrame(() => fs.classList.add("open"));
  closeAllSheets();
  document.body.classList.add("fullscreen-open");
}
function closeProfileEdit() {
  const fs = byId("profileEdit");
  if (!fs) return;
  fs.classList.remove("open");
  window.setTimeout(() => {
    fs.hidden = true;
    fs.style.display = "none";
  }, 230);
  document.body.classList.remove("fullscreen-open");
}

function bindProfileSheets() {
  byId("notificationsBtn")?.addEventListener("click", () => {
    openSheetById("notificationsSheet");
    requestAnimationFrame(() => setNotifUIFromStorage());
  });
  byId("closeNotifications")?.addEventListener("click", closeAllSheets);
  byId("notificationsDoneBtn")?.addEventListener("click", closeAllSheets);
  byId("settingsBtn")?.addEventListener("click", () => openSheetById("settingsSheet"));
  byId("closeSettings")?.addEventListener("click", closeAllSheets);
  byId("settingsDoneBtn")?.addEventListener("click", closeAllSheets);
  byId("sheetBackdrop")?.addEventListener("click", closeAllSheets);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const fs = byId("profileEdit");
      if (fs && !fs.hidden) return closeProfileEdit();
      closeAllSheets();
    }
  });
}

export async function initProfile() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initProfile, { once: true });
    return;
  }

  closeProfileEdit();
  closeAllSheets();
  initThemeUI();
  initSettingsExtras();
  setNotifUIFromStorage();
  bindProfileSheets();

  let me = await getMe().catch(() => null);
  renderProfileHeader(me);

  byId("profileHeader")?.addEventListener("click", () => openProfileEdit(me));
  byId("profileHeader")?.addEventListener("keydown", (e) => { if (e.key === "Enter") openProfileEdit(me); });
  byId("profileEditBack")?.addEventListener("click", closeProfileEdit);

  byId("profileEditSave")?.addEventListener("click", async () => {
    const username = (byId("editNickname")?.value || "").trim();
    const full_name = (byId("editFullName")?.value || "").trim();
    if(!username || !full_name) return;
    try{
      me = await updateMe(username, full_name);
      renderProfileHeader(me);
      document.dispatchEvent(new CustomEvent("profile:updated", { detail: { me } }));
      closeProfileEdit();
    }catch(err){
      alert(err?.message || "Не удалось сохранить профиль");
    }
  });

  const fileInput = byId("avatarFileInput");
  byId("editAvatarBtn")?.addEventListener("click", () => fileInput?.click());
  byId("logoutBtn")?.addEventListener("click", () => { clearToken(); location.reload(); });

  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    localStorage.setItem(LS.avatar, dataUrl);
    setAvatarEl(byId("editAvatarPreview"), dataUrl);
    setAvatarEl(byId("profileAvatar"), dataUrl);
  });

  byId("notifMaster")?.addEventListener("change", (e) => {
    const on = !!e.target.checked;
    localStorage.setItem(LS.notifMaster, on ? "1" : "0");
    animateCollapse(byId("notifSubWrap"), on);
  });
  byId("notifPlans")?.addEventListener("change", (e) => localStorage.setItem(LS.notifPlans, e.target.checked ? "1":"0"));
  byId("notifFreeDay")?.addEventListener("change", (e) => localStorage.setItem(LS.notifFreeDay, e.target.checked ? "1":"0"));
  byId("notifFreeSlot")?.addEventListener("change", (e) => localStorage.setItem(LS.notifFreeSlot, e.target.checked ? "1":"0"));
}
