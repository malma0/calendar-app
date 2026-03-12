function $(id){ return document.getElementById(id); }
const KEYS = {
  master: 'ot_notif_master',
  plans: 'ot_notif_plans',
  freeDay: 'ot_notif_free_day',
  freeSlot: 'ot_notif_free_slot',
  proposal: 'ot_notif_group_proposals',
  seen: 'ot_seen_group_proposals',
  feed: 'ot_notification_feed_v1',
  proposalKnown: 'ot_notification_known_proposals_v1',
  planKnown: 'ot_notification_known_plans_v1',
  feedViewedAt: 'ot_notification_feed_viewed_at_v1',
  initialized: 'ot_notification_bootstrap_done_v1',
};
let currentUser = null;
let activeGroupId = null;
let lastSummary = { totalUnread: 0, byGroup: {}, totalsByGroup: {} };
let pollTimer = null;
let notificationsUiReady = false;

function getToken(){
  const exactKeys = ["access_token","token","auth_token","jwt","bearer_token","opentime_token"];
  for (const key of exactKeys){
    const value = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (value) return value.replace(/^Bearer\s+/i, "").trim();
  }
  return "";
}
function getApiBase(){
  const saved = localStorage.getItem("api_base_url") || sessionStorage.getItem("api_base_url") || "";
  if (saved) return saved.replace(/\/$/, "");
  const { protocol, hostname, port } = window.location;
  if (port === "5500") return `${protocol}//${hostname}:8080`;
  return "";
}
async function api(path){
  const token = getToken();
  const res = await fetch(`${getApiBase()}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error('Ошибка запроса');
  return res.json();
}
function readJson(key, fallback){ try{ return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }catch{ return fallback; } }
function writeJson(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
function getSeenMap(){ return readJson(KEYS.seen, {}); }
function setSeenMap(value){ writeJson(KEYS.seen, value || {}); }
function getKnownMap(key){ return readJson(key, {}); }
function setKnownMap(key, value){ writeJson(key, value || {}); }
function getFeed(){ return readJson(KEYS.feed, []); }
function setFeed(items){ writeJson(KEYS.feed, (items || []).slice(0, 40)); }
function getFeedViewedAt(){ return Number(localStorage.getItem(KEYS.feedViewedAt) || 0); }
function setFeedViewedAt(ts){ localStorage.setItem(KEYS.feedViewedAt, String(ts || Date.now())); }
function masterEnabled(){ return localStorage.getItem(KEYS.master) !== '0'; }
function plansEnabled(){ return localStorage.getItem(KEYS.plans) !== '0'; }
function proposalEnabled(){ return localStorage.getItem(KEYS.proposal) !== '0'; }
function proposalNotificationsEnabled(){ return masterEnabled() && proposalEnabled(); }
function browserNotificationsEnabled(){ return masterEnabled() && (plansEnabled() || proposalEnabled()); }
function ensureCheckbox(id, enabled){ const el=$(id); if (el) el.checked = !!enabled; }
function updateSubtoggles(){ const wrap=$("notifSubWrap"); if (wrap) wrap.hidden = !masterEnabled(); }
async function ensureCurrentUser(){ if (!currentUser) currentUser = await api('/api/users/me'); return currentUser; }
function markGroupSeen(groupId){ if (!groupId) return; const seen = getSeenMap(); seen[String(groupId)] = Date.now(); setSeenMap(seen); applyBadges(lastSummary); }
function getFriendsTab(){ return document.querySelector('.tab[data-tab="friends"]'); }
function ensureDot(parent, className){
  if (!parent) return null;
  let dot = parent.querySelector(`.${className.split(' ').join('.')}`);
  if (!dot){ dot = document.createElement('span'); dot.className = className; parent.appendChild(dot); }
  return dot;
}
function unreadFeedCount(){
  const viewedAt = getFeedViewedAt();
  return getFeed().filter(item => Number(item.createdAtTs || 0) > viewedAt).length;
}
function applyBadges(summary){
  const totalUnread = proposalNotificationsEnabled() ? Number(summary?.totalUnread || 0) : 0;
  const byGroup = summary?.byGroup || {};
  const tab = getFriendsTab();
  const hasFeedUnread = masterEnabled() && unreadFeedCount() > 0;
  const tabDot = tab ? ensureDot(tab, 'tab-notice-dot') : null;
  if (tabDot) tabDot.hidden = !(totalUnread > 0 || hasFeedUnread);

  const notifBtn = $('notificationsBtn');
  const notifDot = notifBtn ? ensureDot(notifBtn, 'tab-notice-dot tab-notice-dot--profile') : null;
  if (notifDot) notifDot.hidden = !hasFeedUnread;

  const launcher = $('openGroupProposalsBtn');
  const launcherDot = launcher ? ensureDot(launcher, 'proposal-launcher-dot') : null;
  const badge = $('openGroupProposalsBadge');
  const unreadForGroup = proposalNotificationsEnabled() && activeGroupId ? Number(byGroup[String(activeGroupId)] || 0) : 0;
  if (launcher){ launcher.classList.toggle('has-unread', unreadForGroup > 0); }
  if (launcherDot) launcherDot.hidden = unreadForGroup <= 0;
  if (badge){
    const totalForGroup = activeGroupId ? Number(summary?.totalsByGroup?.[String(activeGroupId)] || 0) : 0;
    badge.classList.toggle('is-muted', false);
    badge.textContent = String(totalForGroup);
  }
  renderNotificationFeed();
}
async function refreshBadges(){
  try{
    await ensureCurrentUser();
    const groups = await api('/api/groups');
    const seen = getSeenMap();
    const byGroup = {};
    const totalsByGroup = {};
    let totalUnread = 0;
    for (const group of groups || []){
      const rows = await api(`/api/groups/${group.id}/meeting-proposals?limit=30`);
      totalsByGroup[String(group.id)] = (rows || []).length;
      const unseen = (rows || []).filter(item => Number(item.creator_id) !== Number(currentUser.id)).filter(item => {
        const created = Date.parse(item.created_at || '') || 0;
        const seenAt = Number(seen[String(group.id)] || 0);
        return created > seenAt;
      });
      byGroup[String(group.id)] = unseen.length;
      totalUnread += unseen.length;
    }
    lastSummary = { totalUnread, byGroup, totalsByGroup };
  }catch{
    lastSummary = { totalUnread: 0, byGroup: {}, totalsByGroup: {} };
  }
  applyBadges(lastSummary);
}
function requestBrowserPermission(){
  if (!("Notification" in window)) return;
  if (!browserNotificationsEnabled()) return;
  if (Notification.permission === 'default') Notification.requestPermission().catch(() => {});
}
function addFeedItem(item){
  const feed = getFeed();
  const dedupe = `${item.type}:${item.entityId}`;
  if (feed.some(x => `${x.type}:${x.entityId}` === dedupe)) return;
  feed.unshift({ ...item, dedupe });
  setFeed(feed);
}
function showBrowserNotification(title, options = {}){
  if (!("Notification" in window)) return;
  if (!browserNotificationsEnabled()) return;
  if (Notification.permission !== 'granted') return;
  try{
    const n = new Notification(title, options);
    setTimeout(() => n.close(), 6000);
  }catch{}
}
function formatDateTime(dateStr, timeStr){
  if (!dateStr) return '';
  const [_, m, d] = String(dateStr).split('-').map(Number);
  const months = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
  return `${d} ${months[(m || 1) - 1]}${timeStr ? ' · ' + String(timeStr).slice(0,5) : ''}`;
}
function renderNotificationFeed(){
  if (!notificationsUiReady) return;
  const wrap = $('notificationsFeedList');
  if (!wrap) return;
  const feed = getFeed();
  if (!feed.length){
    wrap.innerHTML = '<div class="color-hint">Пока уведомлений нет.</div>';
    return;
  }
  const viewedAt = getFeedViewedAt();
  wrap.innerHTML = feed.map(item => {
    const unread = Number(item.createdAtTs || 0) > viewedAt;
    return `<button class="notification-item ${unread ? 'is-unread' : ''}" data-type="${item.type}" data-entity-id="${item.entityId}" data-group-id="${item.groupId || ''}" type="button">
      <div class="notification-item-top">
        <div class="notification-item-title">${item.title}</div>
        ${unread ? '<span class="notification-item-dot"></span>' : ''}
      </div>
      <div class="notification-item-body">${item.body || ''}</div>
      <div class="notification-item-meta">${item.meta || ''}</div>
    </button>`;
  }).join('');
}
function ensureFeedUi(){
  const existing = $('notificationsFeedWrap');
  if (existing) existing.remove();
  notificationsUiReady = false;
}
async function bootstrapKnownItems(){
  await ensureCurrentUser();
  const groups = await api('/api/groups');
  const knownProposals = getKnownMap(KEYS.proposalKnown);
  const knownPlans = getKnownMap(KEYS.planKnown);
  const now = Date.now();
  for (const group of groups || []){
    const proposals = await api(`/api/groups/${group.id}/meeting-proposals?limit=30`);
    for (const item of proposals || []) knownProposals[String(item.id)] = Date.parse(item.created_at || '') || now;
  }
  const today = new Date();
  const months = [[today.getFullYear(), today.getMonth()+1]];
  const next = new Date(today.getFullYear(), today.getMonth()+1, 1);
  months.push([next.getFullYear(), next.getMonth()+1]);
  for (const [year, month] of months){
    const rows = await api(`/api/events?year=${year}&month=${month}`);
    for (const item of rows || []) if (Number(item.user_id) !== Number(currentUser.id)) knownPlans[String(item.id)] = Date.parse(item.created_at || '') || now;
  }
  setKnownMap(KEYS.proposalKnown, knownProposals);
  setKnownMap(KEYS.planKnown, knownPlans);
  localStorage.setItem(KEYS.initialized, '1');
}
async function pollNotifications(){
  try{
    await ensureCurrentUser();
    if (localStorage.getItem(KEYS.initialized) !== '1') await bootstrapKnownItems();
    const groups = await api('/api/groups');
    const knownProposals = getKnownMap(KEYS.proposalKnown);
    const knownPlans = getKnownMap(KEYS.planKnown);
    for (const group of groups || []){
      const proposals = await api(`/api/groups/${group.id}/meeting-proposals?limit=30`);
      for (const item of proposals || []){
        const key = String(item.id);
        const createdTs = Date.parse(item.created_at || '') || Date.now();
        const isKnown = !!knownProposals[key];
        knownProposals[key] = createdTs;
        if (!isKnown && Number(item.creator_id) !== Number(currentUser.id) && proposalEnabled()){
          addFeedItem({
            type: 'proposal',
            entityId: item.id,
            groupId: group.id,
            title: `Новый сбор в группе «${group.name}»`,
            body: `${item.title || 'Без названия'} · ${formatDateTime(item.date, item.start_time)}${item.end_time ? '–' + String(item.end_time).slice(0,5) : ''}`,
            meta: 'Откройте, чтобы посмотреть и проголосовать',
            createdAtTs: createdTs,
          });
          showBrowserNotification(`Новый сбор · ${group.name}`, { body: `${item.title || 'Без названия'} · ${formatDateTime(item.date, item.start_time)}` });
        }
      }
    }
    const today = new Date();
    const months = [[today.getFullYear(), today.getMonth()+1]];
    const next = new Date(today.getFullYear(), today.getMonth()+1, 1);
    months.push([next.getFullYear(), next.getMonth()+1]);
    for (const [year, month] of months){
      const rows = await api(`/api/events?year=${year}&month=${month}`);
      for (const item of rows || []){
        const key = String(item.id);
        const createdTs = Date.parse(item.created_at || '') || Date.now();
        const isKnown = !!knownPlans[key];
        knownPlans[key] = createdTs;
        if (!isKnown && Number(item.user_id) !== Number(currentUser.id) && plansEnabled()){
          addFeedItem({
            type: 'plan',
            entityId: item.id,
            groupId: item.group_id,
            title: `Новый план от ${item.creator_name || item.creator_login || 'участника'}`,
            body: `${item.title || 'Без названия'} · ${formatDateTime(item.date, item.start_time)}${item.end_time ? '–' + String(item.end_time).slice(0,5) : ''}`,
            meta: 'Откройте календарь, чтобы посмотреть день',
            createdAtTs: createdTs,
          });
          showBrowserNotification(`Новый план · ${item.creator_name || item.creator_login || ''}`, { body: `${item.title || 'Без названия'} · ${formatDateTime(item.date, item.start_time)}` });
        }
      }
    }
    setKnownMap(KEYS.proposalKnown, knownProposals);
    setKnownMap(KEYS.planKnown, knownPlans);
  }catch{}
  await refreshBadges();
}
function bindToggles(){
  ensureCheckbox('notifMaster', masterEnabled());
  ensureCheckbox('notifPlans', plansEnabled());
  ensureCheckbox('notifGroupProposals', proposalEnabled());
  updateSubtoggles();
  $('notifMaster')?.addEventListener('change', e => {
    localStorage.setItem(KEYS.master, e.target.checked ? '1' : '0');
    updateSubtoggles();
    requestBrowserPermission();
    refreshBadges();
  });
  $('notifPlans')?.addEventListener('change', e => { localStorage.setItem(KEYS.plans, e.target.checked ? '1' : '0'); requestBrowserPermission(); pollNotifications(); });
  $('notifGroupProposals')?.addEventListener('change', e => {
    localStorage.setItem(KEYS.proposal, e.target.checked ? '1' : '0');
    requestBrowserPermission();
    pollNotifications();
  });
  $('notificationsBtn')?.addEventListener('click', () => {
    ensureFeedUi();
    setFeedViewedAt(Date.now());
    applyBadges(lastSummary);
  });
  $('closeNotifications')?.addEventListener('click', () => {
    setFeedViewedAt(Date.now());
    applyBadges(lastSummary);
  });
}
export function initProposalNotifications(){
  ensureFeedUi();
  bindToggles();
  requestBrowserPermission();
  document.addEventListener('group:changed', e => { activeGroupId = Number(e.detail?.id || e.detail?.groupId || e.detail?.detail?.id || e.detail?.detail?.groupId || 0) || Number(e.detail?.id || 0) || null; applyBadges(lastSummary); });
  document.addEventListener('proposal:launcher-rendered', e => { activeGroupId = Number(e.detail?.groupId || activeGroupId || 0) || activeGroupId; applyBadges(lastSummary); });
  document.addEventListener('proposal:list-group', e => { const groupId = Number(e.detail?.groupId || 0); if (groupId) { activeGroupId = groupId; markGroupSeen(groupId); setFeedViewedAt(Date.now()); } });
  document.addEventListener('proposal:seen-group', e => { const groupId = Number(e.detail?.groupId || 0); if (groupId) markGroupSeen(groupId); });
  document.addEventListener('meeting:created', () => setTimeout(pollNotifications, 200));
  document.addEventListener('meeting:updated', () => setTimeout(pollNotifications, 200));
  document.querySelectorAll('.tab[data-tab="friends"]').forEach(tab => tab.addEventListener('click', () => { if (activeGroupId) markGroupSeen(activeGroupId); }));
  setTimeout(pollNotifications, 700);
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollNotifications, 25000);
}
