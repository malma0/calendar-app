let editorMode = { type: "create-proposal", id: null, groupId: null };
function $(id){ return document.getElementById(id); }

let groupsCache = [];
let selectedGroupId = null;

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
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const res = await fetch(`${getApiBase()}${path}`, { ...options, headers });
  if (!res.ok){
    let message = "Ошибка запроса";
    try {
      const data = await res.json();
      message = data.detail || message;
    } catch {}
    throw new Error(message);
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

function syncMeetingEditorHeader(){
  const title = document.querySelector('#meetingProposalPage .meeting-page-title');
  const saveBtn = $("freeWindowCreateBtn");
  if (title) title.textContent = editorMode.type === 'edit-event' ? 'Редактировать событие' : editorMode.type === 'edit-proposal' ? 'Редактировать сбор' : 'Предложить встречу';
  if (saveBtn) saveBtn.textContent = editorMode.type === 'create-proposal' ? 'Сохранить' : 'Сохранить изменения';
}

function openPlanner(){
  const page = $("meetingProposalPage");
  if (!page) return;
  syncMeetingEditorHeader();
  page.removeAttribute("hidden");
  requestAnimationFrame(() => {
    page.classList.add("open");
    const body = page.querySelector(".meeting-body--form-only");
    if (body) body.scrollTop = 0;
  });
  document.body.classList.add("fullscreen-open");
}

function closePlanner(){
  editorMode = { type: "create-proposal", id: null, groupId: null };
  $("meetingProposalPage")?.classList.remove("open");
  setTimeout(() => { $("meetingProposalPage")?.setAttribute("hidden", "hidden"); }, 240);
  document.body.classList.remove("fullscreen-open");
}

function getSelectedGroup(){
  return groupsCache.find(g => String(g.id) === String(selectedGroupId)) || null;
}

function renderProposalList(list){
  const wrap = $("meetingProposalsList");
  if (!wrap) return;
  if (!list.length){
    wrap.innerHTML = '<div class="color-hint">Пока никто не предложил встречу.</div>';
    return;
  }
  wrap.innerHTML = list.map(item => {
    const canClass = item.current_user_vote === 'yes' ? 'is-active' : '';
    const noClass = item.current_user_vote === 'no' ? 'is-active' : '';
    return `
      <div class="proposal-card" data-proposal-id="${item.id}">
        <div class="proposal-card-top">
          <div>
            <div class="proposal-title">${escapeHtml(item.title)}</div>
            <div class="proposal-meta">${escapeHtml(item.date)} · ${escapeHtml(item.start_time)}–${escapeHtml(item.end_time)} · создал ${escapeHtml(item.creator_name)}</div>
          </div>
          <div class="proposal-badge">СБОР</div>
        </div>
        ${item.description ? `<div class="proposal-desc">${escapeHtml(item.description)}</div>` : ''}
        <div class="proposal-stats">Смогут: ${item.summary.yes} · Не смогут: ${item.summary.no} · Без ответа: ${item.summary.pending}</div>
        <div class="proposal-votes">
          ${item.members.map(member => `<span class="vote-chip vote-${member.vote}">${escapeHtml(member.name)}: ${member.vote === 'yes' ? 'может' : member.vote === 'no' ? 'не может' : member.vote === 'maybe' ? 'может быть' : 'ждём ответ'}</span>`).join('')}
        </div>
        <div class="proposal-actions">
          <button class="mini-vote-btn ${canClass}" type="button" data-vote="yes">Я смогу</button>
          <button class="mini-vote-btn mini-vote-btn--danger ${noClass}" type="button" data-vote="no">Я не смогу</button>
        </div>
      </div>
    `;
  }).join('');

  wrap.querySelectorAll('[data-proposal-id] [data-vote]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('[data-proposal-id]');
      const proposalId = card?.dataset.proposalId;
      const vote = btn.dataset.vote;
      if (!proposalId || !vote) return;
      try {
        await api(`/api/meeting-proposals/${proposalId}/vote`, { method:'POST', body: JSON.stringify({ vote }) });
        await loadProposals();
        document.dispatchEvent(new CustomEvent('meeting:updated'));
      } catch (err) {
        alert(err.message || 'Не удалось сохранить голос');
      }
    });
  });
}

async function loadProposals(){
  const group = getSelectedGroup();
  const wrap = $("meetingProposalsList");
  if (!group){
    if (wrap) wrap.innerHTML = '<div class="color-hint">Выберите группу, чтобы увидеть предложения встречи.</div>';
    return;
  }
  if (wrap) wrap.innerHTML = '<div class="color-hint">Загружаем предложения встречи...</div>';
  const list = await api(`/api/groups/${group.id}/meeting-proposals?limit=12`);
  renderProposalList(list || []);
}

function updateMeetingTitlePlaceholder(){
  const input = $("meetingTitle");
  const group = getSelectedGroup();
  if (!input) return;
  input.placeholder = `Например: Сбор группы ${group?.name || ''}`.trim();
}

function renderGroupSelect(){
  const select = $("meetingGroupSelect");
  if (!select) return;
  select.innerHTML = groupsCache.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
  select.disabled = false;
  if (groupsCache.length){
    selectedGroupId = selectedGroupId || editorMode.groupId || groupsCache[0].id;
    select.value = String(selectedGroupId);
    updateMeetingTitlePlaceholder();
  }
}

function fillForm(data = {}){
  if ($("meetingGroupSelect") && data.group_id){
    $("meetingGroupSelect").value = String(data.group_id);
    selectedGroupId = String(data.group_id);
  }
  if ($("meetingTitle")) $("meetingTitle").value = data.title || '';
  if ($("meetingDescription")) $("meetingDescription").value = data.description || '';
  if ($("meetingDate")) $("meetingDate").value = data.date || '';
  if ($("meetingTimeStart")) $("meetingTimeStart").value = String(data.start_time || '').slice(0,5);
  if ($("meetingTimeEnd")) $("meetingTimeEnd").value = String(data.end_time || '').slice(0,5);
  updateMeetingTitlePlaceholder();
}

async function openMeetingPlanner(){
  groupsCache = await api('/api/groups');
  if (!groupsCache.length) throw new Error('Сначала создайте группу');
  editorMode = { type: 'create-proposal', id: null, groupId: groupsCache[0].id };
  renderGroupSelect();
  fillForm({});
  openPlanner();
}

async function openMeetingProposalEditor(proposalId){
  groupsCache = await api('/api/groups');
  const item = await api(`/api/meeting-proposals/${proposalId}`);
  editorMode = { type: 'edit-proposal', id: proposalId, groupId: item.group_id };
  renderGroupSelect();
  fillForm(item);
  $("meetingGroupSelect") && ($("meetingGroupSelect").disabled = true);
  openPlanner();
}

async function openMeetingEventEditor(eventId){
  const [year, month] = [(new Date()).getFullYear(), (new Date()).getMonth()+1];
  groupsCache = await api('/api/groups');
  const rows = await api(`/api/events?year=${year}&month=${month}`);
  const item = (rows || []).find(x => Number(x.id) === Number(eventId));
  if (!item) throw new Error('Событие не найдено');
  editorMode = { type: 'edit-event', id: eventId, groupId: item.group_id };
  renderGroupSelect();
  fillForm(item);
  $("meetingGroupSelect") && ($("meetingGroupSelect").disabled = true);
  openPlanner();
}

async function saveMeetingForm(){
  const group_id = Number($("meetingGroupSelect")?.value || 0);
  const rawTitle = ($("meetingTitle")?.value || '').trim();
  const title = rawTitle || `Сбор группы ${getSelectedGroup()?.name || ''}`.trim();
  const description = ($("meetingDescription")?.value || '').trim();
  const date = ($("meetingDate")?.value || '').trim();
  const start_time = ($("meetingTimeStart")?.value || '').trim();
  const end_time = ($("meetingTimeEnd")?.value || '').trim();
  if (!group_id || !title || !date || !start_time || !end_time) throw new Error('Заполните группу, название, дату, начало и конец');
  const btn = $("freeWindowCreateBtn");
  const payload = { group_id, title, description, date, start_time, end_time };
  const prev = btn?.textContent || '';
  if (btn){ btn.disabled = true; btn.textContent = 'Сохраняем...'; }
  try {
    if (editorMode.type === 'edit-proposal' && editorMode.id){
      await api(`/api/meeting-proposals/${editorMode.id}`, { method:'PUT', body: JSON.stringify(payload) });
    } else if (editorMode.type === 'edit-event' && editorMode.id){
      await api(`/api/events/${editorMode.id}`, { method:'PUT', body: JSON.stringify({ title, description, date, start_time, end_time }) });
    } else {
      await api('/api/meeting-proposals', { method:'POST', body: JSON.stringify(payload) });
    }
    if ($("meetingTitle")) $("meetingTitle").value = '';
    updateMeetingTitlePlaceholder();
    if ($("meetingDescription")) $("meetingDescription").value = '';
    if ($("meetingDate")) $("meetingDate").value = '';
    if ($("meetingTimeStart")) $("meetingTimeStart").value = '';
    if ($("meetingTimeEnd")) $("meetingTimeEnd").value = '';
    closePlanner();
    document.dispatchEvent(new CustomEvent(editorMode.type === 'create-proposal' ? 'meeting:created' : 'meeting:updated'));
    await loadProposals();
  } finally {
    if (btn){ btn.disabled = false; btn.textContent = prev; }
  }
}

export function initFindWindow(){
  $("chipFindWindow")?.addEventListener('click', async () => {
    try {
      await openMeetingPlanner();
    } catch (err) {
      alert(err.message || 'Не удалось открыть экран встречи');
    }
  });
  $("closeFreeWindow")?.addEventListener('click', closePlanner);
  document.addEventListener('meeting:edit-proposal', e => {
    const proposalId = Number(e.detail?.proposalId || 0);
    if (proposalId) openMeetingProposalEditor(proposalId).catch(err => alert(err.message || 'Не удалось открыть редактирование'));
  });
  document.addEventListener('meeting:edit-event', e => {
    const eventId = Number(e.detail?.eventId || 0);
    if (eventId) openMeetingEventEditor(eventId).catch(err => alert(err.message || 'Не удалось открыть редактирование'));
  });
  $("meetingGroupSelect")?.addEventListener('change', async e => {
    selectedGroupId = e.target.value;
    editorMode.groupId = selectedGroupId;
    updateMeetingTitlePlaceholder();
  });
  $("freeWindowCreateBtn")?.addEventListener('click', async () => {
    try {
      await saveMeetingForm();
    } catch (err) {
      alert(err.message || 'Не удалось предложить встречу');
    }
  });
  document.addEventListener('meeting:updated', () => loadProposals().catch(() => {}));
}
