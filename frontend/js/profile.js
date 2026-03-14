import { getMe, clearToken, updateMe } from "./api.js?v=5015";

const LS = {
  avatar: "profile_avatar",
  theme: "theme_mode",
  notifMaster: "notif_master",
  notifPlans: "notif_plans",
  weekStart: "weekStart",
  timeFormat: "timeFormat",
  notifGroupProposals: "notif_group_proposals",
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

function syncThemeToggleText() {
  const toggle = byId("themeToggle");
  if (!toggle) return;
  const row = toggle.closest(".list-row, .settings-row, .sheet-row, .row, .option-row, .field-row") || toggle.parentElement;
  if (!row) return;
  const candidates = Array.from(row.querySelectorAll("label, span, p, div"));
  const labelEl = candidates.find(el => {
    const t = (el.textContent || "").trim();
    return t && /т[её]мн|светл/i.test(t) && !el.querySelector("input");
  });
  if (labelEl) labelEl.textContent = "Светлая тема";
}

function initThemeUI() {
  const saved = localStorage.getItem(LS.theme) || "dark";
  applyTheme(saved);
  syncThemeToggleText();
  byId("themeToggle")?.addEventListener("change", (e) => {
    applyTheme(e.target.checked ? "light" : "dark");
    syncThemeToggleText();
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
  if (localStorage.getItem(LS.notifGroupProposals) === null) localStorage.setItem(LS.notifGroupProposals, "1");
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
  const groupProposals = localStorage.getItem(LS.notifGroupProposals) === "1";
  if (byId("notifMaster")) byId("notifMaster").checked = master;
  if (byId("notifPlans")) byId("notifPlans").checked = plans;
  if (byId("notifGroupProposals")) byId("notifGroupProposals").checked = groupProposals;
  animateCollapse(byId("notifSubWrap"), master);
}

function renderProfileHeader(me) {
  setAvatarEl(byId("profileAvatar"), me?.avatar || getLocalAvatar());
  if (byId("profileLogin")) byId("profileLogin").textContent = me?.username || "Профиль";
}

function openProfileEdit(me) {
  const fs = byId("profileEdit");
  if (!fs) return;
  if (byId("editNickname")) byId("editNickname").value = me?.username || "";
  if (byId("editFullName")) byId("editFullName").value = me?.full_name || "";
  setAvatarEl(byId("editAvatarPreview"), me?.avatar || getLocalAvatar());
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
      console.warn(err?.message || "Не удалось сохранить профиль");
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
    try{
      const username = (byId("editNickname")?.value || me?.username || "").trim();
      const full_name = (byId("editFullName")?.value || me?.full_name || "").trim();
      me = await updateMe(username, full_name, dataUrl);
      renderProfileHeader(me);
      document.dispatchEvent(new CustomEvent("profile:updated", { detail: { me } }));
    }catch{}
  });

  byId("notifMaster")?.addEventListener("change", (e) => {
    const on = !!e.target.checked;
    localStorage.setItem(LS.notifMaster, on ? "1" : "0");
    animateCollapse(byId("notifSubWrap"), on);
    document.dispatchEvent(new CustomEvent("notifications:settings-changed"));
  });
  byId("notifPlans")?.addEventListener("change", (e) => { localStorage.setItem(LS.notifPlans, e.target.checked ? "1":"0"); document.dispatchEvent(new CustomEvent("notifications:settings-changed")); });
  byId("notifGroupProposals")?.addEventListener("change", (e) => { localStorage.setItem(LS.notifGroupProposals, e.target.checked ? "1":"0"); document.dispatchEvent(new CustomEvent("notifications:settings-changed")); });
}
