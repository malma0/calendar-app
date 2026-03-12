import { API_BASE, getToken } from "./api.js?v=5015";

const VAPID_KEY_CACHE = "ot_push_vapid_public_key";
const LS = { master: "notif_master", plans: "notif_plans", proposals: "notif_group_proposals" };

function isSupported(){
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function isSecureEnough(){
  return window.isSecureContext || ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

function getBool(key, fallback=true){
  const val = localStorage.getItem(key);
  return val === null ? fallback : val === "1";
}

function pushEnabled(){
  return getBool(LS.master, true) && (getBool(LS.plans, true) || getBool(LS.proposals, true));
}

function urlB64ToUint8Array(base64String){
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(ch => ch.charCodeAt(0)));
}

async function api(path, options = {}){
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function getPublicKey(){
  const cached = localStorage.getItem(VAPID_KEY_CACHE);
  if (cached) return cached;
  const data = await api("/push/public-key");
  if (!data?.public_key || !data?.supported) throw new Error("Push недоступен на backend");
  localStorage.setItem(VAPID_KEY_CACHE, data.public_key);
  return data.public_key;
}

async function getRegistration(){
  const reg = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
  await navigator.serviceWorker.ready;
  return reg;
}

async function subscribe(){
  const reg = await getRegistration();
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  const publicKey = await getPublicKey();
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlB64ToUint8Array(publicKey),
  });
}

async function syncPush(askPermission = false){
  if (!isSupported() || !isSecureEnough()) return;
  if (!getToken()) return;
  const reg = await getRegistration();
  const existing = await reg.pushManager.getSubscription();

  if (!pushEnabled()) {
    if (existing) {
      try {
        await api('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: existing.endpoint }) });
      } catch {}
      try { await existing.unsubscribe(); } catch {}
    }
    return;
  }

  let permission = Notification.permission;
  if (permission === 'default' && askPermission) {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') return;

  const subscription = existing || await subscribe();
  await api('/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: subscription.toJSON() }) });
}

function bind(){
  document.addEventListener('notifications:settings-changed', () => {
    syncPush(true).catch(() => {});
  });
  window.addEventListener('auth:ready', () => {
    syncPush(false).catch(() => {});
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncPush(false).catch(() => {});
  });
}

bind();
syncPush(false).catch(() => {});
