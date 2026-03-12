function $(id){ return document.getElementById(id); }

let currentUser = null;

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

async function api(path, options = {}){
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const res = await fetch(`${getApiBase()}${path}`, { ...options, headers });
  if (!res.ok){
    let msg = "Ошибка запроса";
    try{ const data = await res.json(); msg = data.detail || msg; }catch{}
    throw new Error(msg);
  }
  return res.json();
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function initials(name){ return String(name || '?').trim().split(/\s+/).slice(0,2).map(s => s[0] || '').join('').toUpperCase() || '?'; }
function voteLabel(vote){ return vote === 'yes' ? 'может' : vote === 'no' ? 'не может' : 'ждём ответ'; }

function formatRuDate(dateStr){
  try{
    const [y,m,d]=String(dateStr).split('-').map(Number);
    const months=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
    return `${d} ${months[(m||1)-1]} ${y}`;
  }catch{
    return dateStr;
  }
}

function formatDateTime(item){
  return `${escapeHtml(item.date)} · ${escapeHtml(String(item.start_time||'').slice(0,5))}–${escapeHtml(String(item.end_time||'').slice(0,5))}`;
}

function userAvatar(member){
  return member?.avatar
    ? `<img src="${escapeHtml(member.avatar)}" alt="${escapeHtml(member.name || member.login || '')}" />`
    : escapeHtml(initials(member?.name));
}

function renderProposalCard(item, showCreator = true){

  const yesClass = item.current_user_vote === 'yes' ? 'is-active' : '';
  const noClass = item.current_user_vote === 'no' ? 'is-active' : '';

  return `<div class="proposal-compact-card" data-proposal-id="${item.id}">
    <div class="proposal-compact-head">
      <div>
        <div class="proposal-compact-title">${escapeHtml(item.title)}</div>
        <div class="proposal-compact-time">${formatDateTime(item)}${showCreator ? ` · создал ${escapeHtml(item.creator_name)}` : ''}</div>
      </div>
      <div class="proposal-status-pill">СБОР</div>
    </div>

    ${item.description ? `<div class="proposal-compact-desc">${escapeHtml(item.description)}</div>` : ''}

    <div class="proposal-compact-summary">
      <span class="proposal-summary-chip proposal-summary-chip--yes">Смогут · ${item.summary.yes}</span>
      <span class="proposal-summary-chip proposal-summary-chip--no">Не смогут · ${item.summary.no}</span>
      <span class="proposal-summary-chip proposal-summary-chip--pending">Без ответа · ${item.summary.pending}</span>
    </div>

    <div class="proposal-member-row">
      ${(item.members || []).map(member => `
        <div class="proposal-member-pill proposal-member-pill--${member.vote || 'pending'}">
          <span class="proposal-avatar">${userAvatar(member)}</span>
          <span>
            <span class="proposal-member-name">${escapeHtml(member.name)}</span>
            <span class="proposal-member-state"> · ${escapeHtml(voteLabel(member.vote))}</span>
          </span>
        </div>
      `).join('')}
    </div>

    <div class="proposal-actions-row">
      <button class="proposal-vote-btn proposal-vote-btn--yes ${yesClass}" type="button" data-vote="yes">Смогу</button>
      <button class="proposal-vote-btn proposal-vote-btn--no ${noClass}" type="button" data-vote="no">Не смогу</button>
    </div>

  </div>`;
}

export function initProposalDetails(){}