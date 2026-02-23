(() => {
  "use strict";

  const STORAGE_KEY = "calendar_events_v4";

  // Временно демо-участники. Потом подцепим из бэка группы.
  const MEMBERS = [
    { id: "me", name: "Вы", color: "#4d7cff" },
    { id: "f1", name: "Друг 1", color: "#ff5a52" },
    { id: "f2", name: "Друг 2", color: "#37d67a" },
  ];

  // Пока: текущий пользователь = Вы
  const CURRENT_USER_ID = "me";

  const LONG_PRESS_MS = 520;

  const state = {
    currentMonth: startOfMonth(new Date()),
    selectedDate: startOfDay(new Date()),
    pressTimer: null,
    touchStartX: null,
    touchStartY: null,
    activeTab: "calendar",
  };

  const $ = (id) => document.getElementById(id);

  function pad2(n){ return String(n).padStart(2,"0"); }
  function isoDate(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
  function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
  function startOfDay(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

  function monthNameRu(d){
    const m = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
    return m[d.getMonth()];
  }

  function escapeHtml(str){
    return String(str)
      .replaceAll("&","&amp;").replaceAll("<","&lt;")
      .replaceAll(">","&gt;").replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function formatTimeRange(s,e){
    const a = (s||"").trim();
    const b = (e||"").trim();
    if(!a && !b) return "Весь день";
    if(a && !b) return `${a} – ?`;
    if(!a && b) return `? – ${b}`;
    return `${a} – ${b}`;
  }

  function loadEvents(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    }catch{
      return [];
    }
  }
  function saveEvents(list){ localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }
  function addEvent(ev){ const all = loadEvents(); all.push(ev); saveEvents(all); }

  function eventsForIso(iso){
    return loadEvents()
      .filter(e => e.date === iso)
      .sort((a,b) => (a.start_time||"").localeCompare(b.start_time||""));
  }

  function busyUsersForIso(iso){
    const set = new Set(eventsForIso(iso).map(e => e.user_id));
    return [...set];
  }

  function isSameDay(a,b){
    return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
  }

  // ===== Tabs =====
  function setTab(tab){
    state.activeTab = tab;

    const pages = {
      friends: $("page-friends"),
      calendar: $("page-calendar"),
      profile: $("page-profile"),
    };

    // убрать/поставить активный класс
    Object.entries(pages).forEach(([key, el]) => {
      if(!el) return;
      el.classList.toggle("is-active", key === tab);
    });

    // табы
    document.querySelectorAll(".tab").forEach(btn => {
      const isActive = btn.dataset.tab === tab;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    closeAllSheets();
}

  // ===== Calendar rendering =====
  function renderHeader(){
    $("monthTitle").textContent = monthNameRu(state.currentMonth);
    $("yearTitle").textContent = String(state.currentMonth.getFullYear());
  }

  function renderMonth(){
    renderHeader();

    const grid = $("daysGrid");
    grid.innerHTML = "";

    const y = state.currentMonth.getFullYear();
    const m = state.currentMonth.getMonth();
    const first = new Date(y,m,1);

    // Monday=1..Sunday=7
    let dow = first.getDay();
    if(dow === 0) dow = 7;
    const prevDays = dow - 1;

    const start = new Date(y,m,1 - prevDays);

    for(let i=0;i<42;i++){
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate()+i);
      const other = d.getMonth() !== m;
      grid.appendChild(createDayCell(d, other));
    }
  }

  function createDayCell(date, otherMonth){
    const cell = document.createElement("div");
    cell.className = "day";
    if(otherMonth) cell.classList.add("other-month");

    const num = document.createElement("div");
    num.className = "day-number";
    num.textContent = String(date.getDate());
    cell.appendChild(num);

    const today = new Date();
    if(isSameDay(date, today)) cell.classList.add("today");
    if(isSameDay(date, state.selectedDate)) cell.classList.add("selected");

    const indicator = document.createElement("div");
    indicator.className = "busy-indicator";
    cell.appendChild(indicator);

    const iso = isoDate(date);
    const busyUsers = busyUsersForIso(iso);

    if(busyUsers.length === 1){
      const member = MEMBERS.find(m => m.id === busyUsers[0]) || MEMBERS[0];
      const dot = document.createElement("div");
      dot.className = "busy-dot";
      dot.style.background = member.color;
      indicator.appendChild(dot);
    } else if(busyUsers.length >= 2){
      const pill = document.createElement("div");
      pill.className = "busy-pill";
      busyUsers.slice(0,4).forEach(uid => {
        const member = MEMBERS.find(m => m.id === uid) || MEMBERS[0];
        const seg = document.createElement("div");
        seg.className = "busy-seg";
        seg.style.background = member.color;
        pill.appendChild(seg);
      });
      indicator.appendChild(pill);
    }

    // tap -> open busy sheet
    cell.addEventListener("click", () => {
      state.selectedDate = startOfDay(date);
      renderMonth();
      openBusySheet(date);
    });

    // long press -> open add sheet
    attachLongPress(cell, date);

    return cell;
  }

  function attachLongPress(el, date){
    const onDown = (e) => {
      if(e.pointerType === "mouse" && e.button !== 0) return;
      clearTimeout(state.pressTimer);
      state.pressTimer = setTimeout(() => {
        state.pressTimer = null;
        openAddSheet(date);
      }, LONG_PRESS_MS);
    };
    const cancel = () => {
      if(state.pressTimer) clearTimeout(state.pressTimer);
      state.pressTimer = null;
    };

    el.addEventListener("pointerdown", onDown, {passive:true});
    el.addEventListener("pointerup", cancel, {passive:true});
    el.addEventListener("pointercancel", cancel, {passive:true});
    el.addEventListener("pointerleave", cancel, {passive:true});
    el.addEventListener("pointermove", cancel, {passive:true});
  }

  // swipe month on calendar grid
  function bindSwipe(){
    const area = $("daysGrid");
    if(!area) return;

    area.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      state.touchStartX = t.clientX;
      state.touchStartY = t.clientY;
    }, {passive:true});

    area.addEventListener("touchend", (e) => {
      if(state.touchStartX == null || state.touchStartY == null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - state.touchStartX;
      const dy = t.clientY - state.touchStartY;

      state.touchStartX = null;
      state.touchStartY = null;

      if(Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return;

      if(dx < 0) nextMonth();
      else prevMonth();
    }, {passive:true});
  }

  function prevMonth(){
    state.currentMonth = startOfMonth(new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth()-1, 1));
    renderMonth();
  }
  function nextMonth(){
    state.currentMonth = startOfMonth(new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth()+1, 1));
    renderMonth();
  }

  // ===== Sheets =====
  function closeAllSheets(){
    document.querySelectorAll(".sheet").forEach(s => s.classList.remove("open"));
    $("sheetBackdrop").hidden = true;
  }

  function openBusySheet(date){
    const iso = isoDate(date);
    const list = eventsForIso(iso);

    $("sheetBackdrop").hidden = false;
    $("busySheet").classList.add("open");

    $("busyTitle").textContent = `${date.getDate()} ${monthNameRu(date)}`;

    const container = $("busyList");
    container.innerHTML = "";

    if(list.length === 0){
      container.innerHTML = `
        <div class="busy-item">
          <div class="busy-color" style="background: rgba(255,255,255,0.25)"></div>
          <div class="busy-main">
            <div class="busy-name">Нет занятости</div>
            <div class="busy-sub">Долгий тап по дню — чтобы добавить событие</div>
          </div>
        </div>
      `;
      return;
    }

    const byUser = new Map();
    for(const ev of list){
      if(!byUser.has(ev.user_id)) byUser.set(ev.user_id, []);
      byUser.get(ev.user_id).push(ev);
    }

    for(const m of MEMBERS){
      const items = byUser.get(m.id);
      if(!items || items.length === 0) continue;

      const lines = items
        .map(ev => `${escapeHtml(formatTimeRange(ev.start_time, ev.end_time))} • ${escapeHtml(ev.title)}`)
        .join("<br/>");

      const row = document.createElement("div");
      row.className = "busy-item";
      row.innerHTML = `
        <div class="busy-color" style="background:${m.color}"></div>
        <div class="busy-main">
          <div class="busy-name">${escapeHtml(m.name)}</div>
          <div class="busy-sub">${lines}</div>
        </div>
      `;
      container.appendChild(row);
    }
  }

  function openAddSheet(date){
    $("sheetBackdrop").hidden = false;
    $("addSheet").classList.add("open");

    $("eventTitle").value = "";
    $("eventDate").value = isoDate(date);
    $("eventTimeStart").value = "";
    $("eventTimeEnd").value = "";
  }

  function normalizeTime(v){
    const t = (v||"").trim();
    if(!t) return null;
    if(!/^\d{2}:\d{2}$/.test(t)) return null;
    return t;
  }

  function saveFromAdd(){
    const title = ($("eventTitle").value || "").trim();
    const date = ($("eventDate").value || "").trim();
    const start = normalizeTime($("eventTimeStart").value);
    const end = normalizeTime($("eventTimeEnd").value);

    if(!title){ $("eventTitle").focus(); return; }
    if(!date){ $("eventDate").focus(); return; }
    if(start && end && start >= end){
      alert("Конец должен быть позже начала.");
      $("eventTimeEnd").focus();
      return;
    }

    addEvent({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      user_id: CURRENT_USER_ID,
      title,
      date,
      start_time: start,
      end_time: end,
      created_at: new Date().toISOString(),
    });

    closeAllSheets();
    renderMonth();
    openBusySheet(new Date(date));
  }

  function init(){
    // tabs
    document.querySelector(".tabbar")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".tab");
      if(!btn) return;
      setTab(btn.dataset.tab);
    });
    setTab("calendar");

    if (window.lucide) window.lucide.createIcons();

    // month controls
    $("prevMonth").addEventListener("click", prevMonth);
    $("nextMonth").addEventListener("click", nextMonth);
    $("todayBtn").addEventListener("click", () => {
      const t = new Date();
      state.currentMonth = startOfMonth(t);
      state.selectedDate = startOfDay(t);
      renderMonth();
      openBusySheet(t);
    });

    // sheets
    $("sheetBackdrop").addEventListener("click", closeAllSheets);
    $("closeBusy").addEventListener("click", closeAllSheets);
    $("closeAdd").addEventListener("click", closeAllSheets);
    $("saveEventBtn").addEventListener("click", saveFromAdd);

    renderMonth();
    bindSwipe();
  }

  document.addEventListener("DOMContentLoaded", init);
})();