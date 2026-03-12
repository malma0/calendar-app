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

const MONTHS = {
  'Январь': 1, 'Февраль': 2, 'Март': 3, 'Апрель': 4, 'Май': 5, 'Июнь': 6,
  'Июль': 7, 'Август': 8, 'Сентябрь': 9, 'Октябрь': 10, 'Ноябрь': 11, 'Декабрь': 12
};

let proposalDates = new Map();

async function fetchMonthEvents(){
  const monthTitle = document.getElementById('monthTitle');
  const yearTitle = document.getElementById('yearTitle');
  const month = MONTHS[(monthTitle?.textContent || '').trim()];
  const year = Number((yearTitle?.textContent || '').trim());
  if (!month || !year) return [];
  const token = getToken();
  const res = await fetch(`${getApiBase()}/api/events?year=${year}&month=${month}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) return [];
  return res.json();
}

async function decorateCalendar(){
  const grid = document.getElementById('daysGrid');
  const monthTitle = document.getElementById('monthTitle');
  const yearTitle = document.getElementById('yearTitle');
  if (!monthTitle || !yearTitle || !grid) return;
  const month = MONTHS[(monthTitle.textContent || '').trim()];
  const year = Number((yearTitle.textContent || '').trim());
  if (!month || !year) return;

  const events = await fetchMonthEvents();
  proposalDates = new Map();

  grid.querySelectorAll('.day').forEach(day => {
    day.classList.remove('proposal-day');
    day.querySelector('.proposal-day-indicator')?.remove();
    day.querySelector('.proposal-day-count')?.remove();
    if (day.classList.contains('other-month')) return;
    const dayNum = Number((day.querySelector('.day-number')?.textContent || '').trim());
    if (!dayNum) return;
    const key = `${year}-${String(month).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;
    const count = proposalDates.get(key) || 0;
    if (count > 0){
      day.classList.add('proposal-day');
      const dot = document.createElement('div');
      dot.className = 'proposal-day-indicator';
      day.appendChild(dot);
      if (count > 1){
        const badge = document.createElement('div');
        badge.className = 'proposal-day-count';
        badge.textContent = count > 9 ? '9+' : String(count);
        day.appendChild(badge);
      }
    }
  });
}

function getDateKeyFromDay(day){
  const monthTitle = document.getElementById('monthTitle');
  const yearTitle = document.getElementById('yearTitle');
  const month = MONTHS[(monthTitle?.textContent || '').trim()];
  const year = Number((yearTitle?.textContent || '').trim());
  const dayNum = Number((day?.querySelector('.day-number')?.textContent || '').trim());
  if (!month || !year || !dayNum) return null;
  return `${year}-${String(month).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;
}

function interceptCalendarClicks(){
  const grid = document.getElementById('daysGrid');
  if (!grid || grid.dataset.proposalBound === '1') return;
  grid.dataset.proposalBound = '1';
  grid.addEventListener('click', (e) => {
    const day = e.target.closest('.day.proposal-day');
    if (!day) return;
    const date = getDateKeyFromDay(day);
    if (!date) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    document.dispatchEvent(new CustomEvent('proposal:open-date', { detail: { date } }));
  }, true);
}

export function initProposalCalendar(){
  const obs = new MutationObserver(() => {
    decorateCalendar().catch(() => {});
    interceptCalendarClicks();
  });
  obs.observe(document.body, { childList:true, subtree:true, characterData:true });
  document.addEventListener('meeting:created', () => decorateCalendar().catch(() => {}));
  document.addEventListener('meeting:updated', () => decorateCalendar().catch(() => {}));
  setTimeout(() => { decorateCalendar().catch(() => {}); interceptCalendarClicks(); }, 600);
}
