// frontend/js/profile.js
import { getMe, clearToken } from "./api.js";

/**
 * Профиль (локально, без сложной синхронизации):
 * - Никнейм: видно только пользователю (localStorage)
 * - Username: пока сохраняем локально (бэк добавим позже)
 * - Аватар: можно выбрать картинку (dataURL) или оставить emoji
 */

const LS = {
  nickname: "profile_nickname",
  username: "profile_username_local",
  avatar: "profile_avatar", // dataURL или emoji
  theme: "theme_mode", // "dark" | "light"
  notifMaster: "notif_master",
  notifPlans: "notif_plans",
  notifFreeDay: "notif_free_day",
  notifFreeSlot: "notif_free_slot",
};

function byId(id) {
  return document.getElementById(id);
}

/* ===== Sheets ===== */
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

/* ===== Theme ===== */
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

/* ===== Notifications ===== */
function setNotifUIFromStorage() {
  const master = localStorage.getItem(LS.notifMaster) === "1";
  const plans = localStorage.getItem(LS.notifPlans) === "1";
  const freeDay = localStorage.getItem(LS.notifFreeDay) === "1";
  const freeSlot = localStorage.getItem(LS.notifFreeSlot) === "1";

  const masterEl = byId("notifMaster");
  const subWrap = byId("notifSubWrap");
  const plansEl = byId("notifPlans");
  const freeDayEl = byId("notifFreeDay");
  const freeSlotEl = byId("notifFreeSlot");

  if (masterEl) masterEl.checked = master;
  if (plansEl) plansEl.checked = plans;
  if (freeDayEl) freeDayEl.checked = freeDay;
  if (freeSlotEl) freeSlotEl.checked = freeSlot;

  if (subWrap) subWrap.hidden = !master;
}

function bindNotifToggles() {
  byId("notifMaster")?.addEventListener("change", (e) => {
    const on = !!e.target.checked;
    localStorage.setItem(LS.notifMaster, on ? "1" : "0");
    setNotifUIFromStorage();
  });

  byId("notifPlans")?.addEventListener("change", (e) => {
    localStorage.setItem(LS.notifPlans, e.target.checked ? "1" : "0");
  });

  byId("notifFreeDay")?.addEventListener("change", (e) => {
    localStorage.setItem(LS.notifFreeDay, e.target.checked ? "1" : "0");
  });

  byId("notifFreeSlot")?.addEventListener("change", (e) => {
    localStorage.setItem(LS.notifFreeSlot, e.target.checked ? "1" : "0");
  });
}

/* ===== Profile UI ===== */
function getLocalAvatar() {
  return localStorage.getItem(LS.avatar) || "🦈";
}

function setAvatarEl(el, avatarValue) {
  if (!el) return;

  // dataURL (image)
  if (avatarValue.startsWith("data:image/")) {
    el.textContent = "";
    el.style.backgroundImage = `url('${avatarValue}')`;
    el.style.backgroundSize = "cover";
    el.style.backgroundPosition = "center";
    el.classList.add("avatar-img");
    return;
  }

  // emoji/text
  el.classList.remove("avatar-img");
  el.style.backgroundImage = "";
  el.textContent = avatarValue || "🦈";
}

function readProfileFromStorage() {
  return {
    nickname: localStorage.getItem(LS.nickname) || "",
    username: localStorage.getItem(LS.username) || "",
    avatar: getLocalAvatar(),
  };
}

function writeProfileToStorage({ nickname, username, avatar }) {
  localStorage.setItem(LS.nickname, nickname || "");
  localStorage.setItem(LS.username, username || "");
  if (avatar) localStorage.setItem(LS.avatar, avatar);
}

async function loadMeDefaults() {
  try {
    const me = await getMe();
    return me;
  } catch (_) {
    return null;
  }
}

function renderProfileHeader(me) {
  const avatarEl = byId("profileAvatar");
  const nickEl = byId("profileNickname");

  const local = readProfileFromStorage();

  // nickname: локальный > full_name > username
  const nickname =
    local.nickname ||
    me?.full_name ||
    me?.username ||
    "Профиль";

  // avatar
  setAvatarEl(avatarEl, local.avatar);

  if (nickEl) nickEl.textContent = nickname;
}

function openProfileEdit(me) {
  const fs = byId("profileEdit");
  if (!fs) return;

  const local = readProfileFromStorage();

  const nicknameInput = byId("editNickname");
  const usernameInput = byId("editUsername");
  const avatarPreview = byId("editAvatarPreview");

  const nickname =
    local.nickname ||
    me?.full_name ||
    me?.username ||
    "";

  const username =
    local.username ||
    me?.username ||
    "";

  if (nicknameInput) nicknameInput.value = nickname;
  if (usernameInput) usernameInput.value = username;

  // preview avatar
  setAvatarEl(avatarPreview, local.avatar);

  fs.hidden = false;
  // Доп. страховка: на iOS Safari иногда атрибут hidden может не сработать
  // при наличии CSS display для класса.
  fs.style.display = "flex";
  // закрываем нижние sheets если открыты
  closeAllSheets();
}

function closeProfileEdit() {
  const fs = byId("profileEdit");
  if (!fs) return;
  fs.hidden = true;
  // Доп. страховка, чтобы окно точно исчезало и не перехватывало клики
  fs.style.display = "none";
}

function bindProfileEdit(meRef) {
  // открыть по клику на header
  byId("profileHeader")?.addEventListener("click", () => openProfileEdit(meRef.current));
  byId("profileHeader")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") openProfileEdit(meRef.current);
  });

  byId("profileEditBack")?.addEventListener("click", closeProfileEdit);

  byId("profileEditSave")?.addEventListener("click", () => {
    const nickname = (byId("editNickname")?.value || "").trim();
    const username = (byId("editUsername")?.value || "").trim();
    const avatar = getLocalAvatar();

    writeProfileToStorage({ nickname, username, avatar });
    renderProfileHeader(meRef.current);
    closeProfileEdit();
  });

  // avatar pick
  const fileInput = byId("avatarFileInput");
  byId("editAvatarBtn")?.addEventListener("click", () => fileInput?.click());

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

  // logout
  byId("logoutBtn")?.addEventListener("click", () => {
    clearToken();
    // простая перезагрузка
    location.reload();
  });
}

function bindProfileSheets() {
  // notifications
  byId("notificationsBtn")?.addEventListener("click", () => {
    setNotifUIFromStorage();
    openSheetById("notificationsSheet");
  });
  byId("closeNotifications")?.addEventListener("click", closeAllSheets);
  byId("notificationsDoneBtn")?.addEventListener("click", closeAllSheets);

  // settings
  byId("settingsBtn")?.addEventListener("click", () => {
    openSheetById("settingsSheet");
  });
  byId("closeSettings")?.addEventListener("click", closeAllSheets);
  byId("settingsDoneBtn")?.addEventListener("click", closeAllSheets);

  // backdrop click closes sheets (но не full screen)
  byId("sheetBackdrop")?.addEventListener("click", closeAllSheets);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      // сначала full screen
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

  // safety: never auto-open profile editor on page load
  closeProfileEdit();
  closeAllSheets();

  const meRef = { current: null };
  meRef.current = await loadMeDefaults();

  renderProfileHeader(meRef.current);

  initThemeUI();
  setNotifUIFromStorage();
  bindNotifToggles();

  bindProfileSheets();
  bindProfileEdit(meRef);

  // lucide icons inside hidden blocks
  if (window.lucide) window.lucide.createIcons();
}
