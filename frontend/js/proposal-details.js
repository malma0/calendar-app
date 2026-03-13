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
function formatRuDate(dateStr){ try{ const [y,m,d]=String(dateStr).split('-').map(Number); const months=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря']; return `${d} ${months[(m||1)-1]} ${y}`; }catch{return dateStr;} }
function formatDateTime(item){ return `${escapeHtml(item.date)} · ${escapeHtml(String(item.start_time||'').slice(0,5))}–${escapeHtml(String(item.end_time||'').slice(0,5))}`; }
function userAvatar(member){ return member?.avatar ? `<img src="${escapeHtml(member.avatar)}" alt="${escapeHtml(member.name || member.login || '')}" />` : escapeHtml(initials(member?.name)); }

function openSheet(){ const backdrop = $('sheetBackdrop'); const sheet = $('proposalDetailsSheet'); if (!sheet) return; if (backdrop){ backdrop.hidden = false; requestAnimationFrame(() => backdrop.classList.add('visible')); } sheet.hidden = false; requestAnimationFrame(() => sheet.classList.add('open')); }
function closeSheet(){ const backdrop = $('sheetBackdrop'); const sheet = $('proposalDetailsSheet'); sheet?.classList.remove('open'); if (backdrop) backdrop.classList.remove('visible'); setTimeout(() => { if (sheet) sheet.hidden = true; if (backdrop) backdrop.hidden = true; }, 260); }

function ownerActions(type, item){
  const canEdit = currentUser && ((type === 'proposal' && Number(item.creator_id) === Number(currentUser.id)) || (type === 'event' && Number(item.user_id) === Number(currentUser.id)));
  if (!canEdit) return '';
  return `<div class="proposal-owner-actions">
    <button class="proposal-detail-btn" type="button" data-edit-${type}="${item.id}">Редактировать</button>
    <button class="proposal-detail-btn proposal-detail-btn--danger" type="button" data-delete-${type}="${item.id}">Удалить</button>
  </div>`;
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
      ${(item.members || []).map(member => `<div class="proposal-member-pill proposal-member-pill--${member.vote || 'pending'}">
        <span class="proposal-avatar">${userAvatar(member)}</span>
        <span><span class="proposal-member-name">${escapeHtml(member.name)}</span><span class="proposal-member-state"> · ${escapeHtml(voteLabel(member.vote))}</span></span>
      </div>`).join('')}
    </div>
    <div class="proposal-actions-row">
      <button class="proposal-vote-btn proposal-vote-btn--yes ${yesClass}" type="button" data-vote="yes">Смогу</button>
      <button class="proposal-vote-btn proposal-vote-btn--no ${noClass}" type="button" data-vote="no">Не смогу</button>
    </div>
    ${ownerActions('proposal', item)}
  </div>`;
}

function renderEventCard(item){
  return `<div class="proposal-event-card" data-event-id="${item.id}">
    <div class="proposal-event-head">
      <div>
        <div class="proposal-event-title">${escapeHtml(item.title || 'Событие')}</div>
        <div class="proposal-event-time">${formatDateTime(item)}</div>
      </div>
      <div class="proposal-event-pill proposal-event-pill--default">ПЛАН</div>
    </div>
    ${item.description ? `<div class="proposal-compact-desc">${escapeHtml(item.description)}</div>` : ''}
    ${ownerActions('event', item)}
  </div>`;
}

async function ensureCurrentUser(){ if (!currentUser) currentUser = await api('/api/users/me'); return currentUser; }
async function vote(proposalId, voteValue){ await api(`/api/meeting-proposals/${proposalId}/vote`, { method: 'POST', body: JSON.stringify({ vote: voteValue }) }); }
async function fetchMonthEventsForDate(date){ const [year, month] = String(date).split('-').map(Number); if (!year || !month) return []; const rows = await api(`/api/events?year=${year}&month=${month}`); return (rows || []).filter(item => String(item.date) === String(date)); }
async function fetchDayProposals(date){ const groups = await api('/api/groups'); const all = []; for (const group of groups || []){ try{ const rows = await api(`/api/groups/${group.id}/meeting-proposals?limit=30`); rows.filter(item => String(item.date) === String(date)).forEach(item => all.push(item)); }catch{} } return all; }

async function loadByProposalId(proposalId){ const title = $('proposalDetailsTitle'); const list = $('proposalDetailsList'); if (!list) return; await ensureCurrentUser(); title && (title.textContent = 'Детали встречи'); list.innerHTML = '<div class="color-hint">Загружаем...</div>'; openSheet(); try{ const item = await api(`/api/meeting-proposals/${proposalId}`); document.dispatchEvent(new CustomEvent('proposal:seen-group', { detail: { groupId: item.group_id } })); list.innerHTML = renderProposalCard(item); bindActions(); }catch(err){ list.innerHTML = `<div class="color-hint">${escapeHtml(err.message || 'Не удалось загрузить встречу')}</div>`; } }

async function loadGroup(groupId, groupName){ const title = $('proposalDetailsTitle'); const list = $('proposalDetailsList'); if (!list) return; await ensureCurrentUser(); title && (title.textContent = `Предложения${groupName ? ` · ${groupName}` : ' группы'}`); list.innerHTML = '<div class="color-hint">Загружаем...</div>'; openSheet(); document.dispatchEvent(new CustomEvent('proposal:seen-group', { detail: { groupId } })); try{ const rows = await api(`/api/groups/${groupId}/meeting-proposals?limit=30`); if (!rows.length){ list.innerHTML = '<div class="color-hint">Для этой группы пока нет предложенных встреч.</div>'; return; } list.innerHTML = rows.map(item => renderProposalCard(item, false)).join(''); bindActions(); }catch(err){ list.innerHTML = `<div class="color-hint">${escapeHtml(err.message || 'Не удалось загрузить предложения')}</div>`; } }

async function loadByDate(date){ const title = $('proposalDetailsTitle'); const list = $('proposalDetailsList'); if (!list) return; await ensureCurrentUser(); title && (title.textContent = formatRuDate(date)); list.innerHTML = '<div class="color-hint">Загружаем...</div>'; openSheet(); try{ const [events, proposals] = await Promise.all([fetchMonthEventsForDate(date), fetchDayProposals(date)]); const parts = []; if (events.length){ parts.push('<div class="proposal-section-label">Обычные события</div>'); parts.push(events.map(renderEventCard).join('')); } if (proposals.length){ parts.push('<div class="proposal-section-label">Предложенные встречи</div>'); parts.push(proposals.map(item => renderProposalCard(item)).join('')); } if (!parts.length){ list.innerHTML = '<div class="color-hint">На этот день пока ничего нет.</div>'; return; } list.innerHTML = parts.join(''); bindActions(); }catch(err){ list.innerHTML = `<div class="color-hint">${escapeHtml(err.message || 'Не удалось загрузить день')}</div>`; } }

async function deleteProposal(proposalId){ await api(`/api/meeting-proposals/${proposalId}`, { method: 'DELETE' }); }
async function deleteEvent(eventId){ await api(`/api/events/${eventId}`, { method: 'DELETE' }); }

function bindActions(){
  const list = $('proposalDetailsList');
  if (!list) return;
  list.querySelectorAll('[data-proposal-id] [data-vote]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('[data-proposal-id]');
      const proposalId = Number(card?.dataset.proposalId || 0);
      const voteValue = btn.dataset.vote;
      if (!proposalId || !voteValue) return;
      try{ await vote(proposalId, voteValue); await loadByProposalId(proposalId); document.dispatchEvent(new CustomEvent('meeting:updated')); }catch(err){ alert(err.message || 'Не удалось сохранить голос'); }
    });
  });
  list.querySelectorAll('[data-edit-proposal]').forEach(btn => btn.addEventListener('click', () => { closeSheet(); document.dispatchEvent(new CustomEvent('meeting:edit-proposal', { detail: { proposalId: Number(btn.dataset.editProposal) } })); }));
  list.querySelectorAll('[data-edit-event]').forEach(btn => btn.addEventListener('click', () => { closeSheet(); document.dispatchEvent(new CustomEvent('meeting:edit-event', { detail: { eventId: Number(btn.dataset.editEvent) } })); }));
  list.querySelectorAll('[data-delete-proposal]').forEach(btn => btn.addEventListener('click', async () => { const id = Number(btn.dataset.deleteProposal); if (!id || !confirm('Удалить сбор?')) return; try{ await deleteProposal(id); closeSheet(); document.dispatchEvent(new CustomEvent('meeting:updated')); }catch(err){ alert(err.message || 'Не удалось удалить сбор'); } }));
  list.querySelectorAll('[data-delete-event]').forEach(btn => btn.addEventListener('click', async () => { const id = Number(btn.dataset.deleteEvent); if (!id || !confirm('Удалить событие?')) return; try{ await deleteEvent(id); closeSheet(); document.dispatchEvent(new CustomEvent('meeting:updated')); }catch(err){ alert(err.message || 'Не удалось удалить событие'); } }));
}

export function initProposalDetails(){
  $('closeProposalDetails')?.addEventListener('click', closeSheet);
  document.addEventListener('proposal:open', e => { const proposalId = Number(e.detail?.proposalId || 0); if (proposalId) loadByProposalId(proposalId).catch(() => {}); });
  document.addEventListener('proposal:open-date', e => { const date = e.detail?.date; if (date) loadByDate(date).catch(() => {}); });
  document.addEventListener('proposal:list-group', e => { const groupId = Number(e.detail?.groupId || 0); const groupName = e.detail?.groupName || ''; if (groupId) loadGroup(groupId, groupName).catch(() => {}); });
  document.addEventListener('meeting:created', () => { currentUser = null; });
  document.addEventListener('meeting:updated', () => { currentUser = null; });
}
