(() => {
  "use strict";

  const STORAGE_KEY = "calendar_events_v4";

  // Настройки отображения (пока локально). Меняются из profile.js через события.
  const settings = {
    weekStart: localStorage.getItem("weekStart") || "mon", // "mon" | "sun"
    timeFormat: localStorage.getItem("timeFormat") || "24", // "24" | "12"
  };

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
    weekStartDate: null,
    viewMode: "month", // "month" | "week"
    pressTimer: null,
    touchStartX: null,
    touchStartY: null,
    activeTab: "calendar",
  };

  const $ = (id) => document.getElementById(id);

  function setActiveChip(id){
    const wrap = $("chipsRow");
    if(!wrap) return;
    wrap.querySelectorAll(".chip").forEach(b => b.classList.remove("is-active"));
    const el = $(id);
    if(el) el.classList.add("is-active");
  }

  function openFreeWindow(){
    const backdrop = $("sheetBackdrop");
    const sheet = $("freeWindowSheet");
    if(backdrop) backdrop.hidden = false;
    if(sheet) sheet.classList.add("open");
    loadFreeWindowGroups();
  }

  function closeFreeWindow(){
    $("freeWindowSheet")?.classList.remove("open");
    const anyOpen = document.querySelector(".sheet.open");
    if(!anyOpen) $("sheetBackdrop") && ($("sheetBackdrop").hidden = true);
  }

  async function loadFreeWindowGroups(){
    const list = $("freeWindowGroups");
    if(!list) return;
    list.innerHTML = `<div class="color-hint">Загружаем группы…</div>`;
    let groups = [];
    try{
      const res = await fetch("/api/groups");
      if(res.ok) groups = await res.json();
    }catch{}
    if(!Array.isArray(groups) || !groups.length){
      list.innerHTML = `<div class="color-hint">Пока нет групп (создайте на вкладке «Друзья»)</div>`;
      return;
    }
    list.innerHTML = "";
    for(const g of groups){
      const item = document.createElement("button");
      item.type="button";
      item.className="groups-item";
      item.innerHTML = `<div class="groups-item-left"><div class="groups-dot"></div><div class="groups-name">${escapeHtml(g.name)}</div></div><div class="row-arrow">›</div>`;
      item.addEventListener("click", () => {
        const resultWrap = $("freeWindowResultWrap");
        const resEl = $("freeWindowResult");
        if(resultWrap) resultWrap.hidden = false;

        // демо-логика: "окно" на сегодня/завтра
        const base = new Date();
        const startH = 16 + (seedHash(String(g.id)) % 3); // 16..18
        const endH = startH + 2;
        const dayStr = `${pad2(base.getDate())}.${pad2(base.getMonth()+1)}`;
        const startStr = formatTime(`${pad2(startH)}:00`);
        const endStr = formatTime(`${pad2(endH)}:00`);
        if(resEl) resEl.textContent = `Ближайшее общее окно для “${g.name}”: ${dayStr} ${startStr} – ${endStr} (2ч)`;

        // кнопка создать — просто открываем addSheet с заполненной датой
        $("freeWindowCreateBtn")?.addEventListener("click", () => {
          closeFreeWindow();
          openAddSheet(startOfDay(base));
          $("eventTimeStart").value = `${pad2(startH)}:00`;
          $("eventTimeEnd").value = `${pad2(endH)}:00`;
        }, { once:true });
      });
      list.appendChild(item);
    }
    if(window.lucide) window.lucide.createIcons();
  }



    function seedHash(str){ let h=0; for(let i=0;i<str.length;i++){ h=(h*31 + str.charCodeAt(i))>>>0; } return h; }

function pad2(n){ return String(n).padStart(2,"0"); }
  function isoDate(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
  function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
  function startOfDay(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

  function startOfWeek(date){
    const d = startOfDay(date);
    const jsDow = d.getDay(); // 0..6 (0=Sun)
    const offset = settings.weekStart === "mon"
      ? (jsDow + 6) % 7   // Mon=0 ... Sun=6
      : jsDow;            // Sun=0 ... Sat=6
    d.setDate(d.getDate() - offset);
    return d;
  }

  function dayLabelRuShort(d){
    const labelsSun = ["ВС","ПН","ВТ","СР","ЧТ","ПТ","СБ"];
    return labelsSun[d.getDay()];
  }

  function formatDateShort(iso){
    // iso: YYYY-MM-DD
    const [y,m,d] = String(iso).split("-").map(Number);
    const dt = new Date(y, (m||1)-1, d||1);
    return `${pad2(dt.getDate())}.${pad2(dt.getMonth()+1)}`;
  }



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

  function formatTime(timeStr){
    const t = (timeStr||"").trim();
    if(!t) return "";
    if(settings.timeFormat === "24") return t;
    const m = t.match(/^([0-2]\d):([0-5]\d)$/);
    if(!m) return t;
    let h = Number(m[1]);
    const min = m[2];
    const suffix = h >= 12 ? "PM" : "AM";
    h = ((h + 11) % 12) + 1;
    return `${h}:${min} ${suffix}`;
  }

  function formatTimeRange(s,e){
    const a = (s||"").trim();
    const b = (e||"").trim();
    if(!a && !b) return "Весь день";
    if(a && !b) return `${formatTime(a)} – ?`;
    if(!a && b) return `? – ${formatTime(b)}`;
    return `${formatTime(a)} – ${formatTime(b)}`;
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
    const prevPage = document.querySelector(".page.is-active");
    state.activeTab = tab;

    const pages = {
      friends: $("page-friends"),
      calendar: $("page-calendar"),
      profile: $("page-profile"),
    };

    const nextPage = pages[tab];
    if(prevPage && nextPage && prevPage !== nextPage){
      prevPage.classList.add("is-leaving");
      window.setTimeout(() => prevPage.classList.remove("is-leaving"), 190);
    }


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


function getWeekdayHeaderEls(){
  // Пытаемся найти 7 элементов заголовка дней недели в разметке.
  // (В разных версиях верстки могли быть разные контейнеры/классы)
  const selectors = [
    "#weekdaysRow .weekday",
    "#weekdaysRow div",
    "#weekdaysRow span",
    "#weekDaysRow div",
    "#weekDays div",
    "#weekdays div",
    ".weekdays div",
    ".weekdays span",
    ".dow-row div",
    ".calendar-dow div",
    ".day-names div",
    ".day-names span",
  ];
  for(const sel of selectors){
    const els = Array.from(document.querySelectorAll(sel));
    if(els.length === 7) return els;
  }
  // fallback: попробуем взять 7 ближайших элементов перед сеткой календаря
  const grid = $("daysGrid");
    grid.classList.remove("week-mode");
    document.querySelector(".calendar")?.classList.remove("week-mode");

  if(grid){
    const parent = grid.parentElement;
    if(parent){
      const candidates = Array.from(parent.querySelectorAll("div,span"))
        .filter(el => el !== grid && el.textContent && el.textContent.trim().length <= 2);
      // Ищем подряд 7 коротких лейблов
      if(candidates.length >= 7){
        // последняя семёрка чаще всего и есть заголовок
        return candidates.slice(0,7);
      }
    }
  }
  return [];
}

function renderWeekHeader(){
  const els = getWeekdayHeaderEls();
  if(!els || els.length !== 7) return;

  const mon = ["ПН","ВТ","СР","ЧТ","ПТ","СБ","ВС"];
  const sun = ["ВС","ПН","ВТ","СР","ЧТ","ПТ","СБ"];
  const labels = settings.weekStart === "sun" ? sun : mon;

  els.forEach((el, i) => { el.textContent = labels[i]; });
}

  
  function renderUpcoming(){
    const wrapCalendar = $("upcomingList");
    const wrapFriends = $("friendsUpcomingList");
    if(!wrapCalendar && !wrapFriends) return;

    const today = startOfDay(new Date());
    const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
    const all = loadEvents();

    const items = all
      .map(e => ({...e}))
      .filter(e => {
        if(!e.date) return false;
        const d = new Date(e.date + "T00:00:00");
        return d >= today && d < to;
      })
      .sort((a,b) => {
        if(a.date !== b.date) return String(a.date).localeCompare(String(b.date));
        return String(a.start_time || "").localeCompare(String(b.start_time || ""));
      })
      .slice(0, 5);

    function renderTo(wrap){
      if(!wrap) return;
      wrap.innerHTML = "";
      if(items.length === 0){
        const empty = document.createElement("div");
        empty.className = "up-empty";
        empty.textContent = "Пока нет событий на ближайшие дни.";
        wrap.appendChild(empty);
        return;
      }

      for(const ev of items){
        const row = document.createElement("div");
        row.className = "up-row";
        const when = ev.date ? formatDateShort(ev.date) : "";
        const time = ev.start_time ? ` • ${formatTime(ev.start_time)}` : "";
        row.innerHTML = `
          <div class="up-when">${escapeHtml(when + time)}</div>
          <div class="up-main">
            <div class="up-title">${escapeHtml(ev.title || "Событие")}</div>
            <div class="up-sub">${escapeHtml(ev.location || "")}</div>
          </div>
        `;
        wrap.appendChild(row);
      }
    }

    renderTo(wrapCalendar);
    renderTo(wrapFriends);
  }


function ensureMonthDom(){
  const grid = $("daysGrid");
  if(grid){
    grid.classList.remove("week-mode");
    // на всякий случай: если где-то мог появиться inline style
    grid.style.display = "";
    grid.style.flexDirection = "";
  }
  document.querySelector(".calendar")?.classList.remove("week-mode");
}

function renderMonth(){
    renderHeader();
    renderWeekHeader();

    ensureMonthDom();
    const grid = $("daysGrid");
    if(!grid) return;
    grid.innerHTML = "";

    const y = state.currentMonth.getFullYear();
    const m = state.currentMonth.getMonth();
    const first = new Date(y,m,1);

    // Смещение сетки месяца с учётом настройки начала недели
    // JS: 0=Вс ... 6=Сб
    let dow = first.getDay();
    let prevDays;
    if(settings.weekStart === "mon"){
      // Monday-first: превратить 0(Вс) -> 7, и сдвиг = dow-1
      if(dow === 0) dow = 7;
      prevDays = dow - 1;
    } else {
      // Sunday-first: сдвиг как есть (0..6)
      prevDays = dow;
    }

    const start = new Date(y,m,1 - prevDays);

    for(let i=0;i<42;i++){
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate()+i);
      const other = d.getMonth() !== m;
      grid.appendChild(createDayCell(d, other));
    }
  }

  

  function renderWeek(){
    // header: показываем месяц выбранной даты (или начала недели)
    const base = state.selectedDate || state.weekStartDate || new Date();
    state.currentMonth = startOfMonth(base);
    renderHeader();

    const grid = $("daysGrid");
    grid.innerHTML = "";
    grid.classList.add("week-mode");
    document.querySelector(".calendar")?.classList.add("week-mode");

    if(!state.weekStartDate) state.weekStartDate = startOfWeek(base);

    const start = state.weekStartDate;

    for(let i=0;i<7;i++){
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate()+i);
      const iso = isoDate(d);
      const events = eventsForIso(iso).slice(0, 4);

      const card = document.createElement("div");
      card.className = "week-day-card";
      const headRight = `${d.getDate()} ${monthNameRu(d)}`;
      card.innerHTML = `
        <div class="week-day-head">
          <div class="week-day-left">
            <div class="week-day-name">${dayLabelRuShort(d)}</div>
            <div class="week-day-date">${escapeHtml(headRight)}</div>
          </div>
          <div class="week-day-meta">
            ${isSameDay(d, new Date()) ? '<span class="week-tag">Сегодня</span>' : ''}
          </div>
        </div>
        <div class="week-day-events">
          ${
            events.length
              ? events.map(ev => `
                  <div class="week-ev">
                    <div class="week-ev-time">${escapeHtml(formatTime(ev.start_time || ""))}</div>
                    <div class="week-ev-title">${escapeHtml(ev.title || "Событие")}</div>
                  </div>
                `).join("")
              : `<div class="week-empty">Нет событий</div>`
          }
        </div>
      `;

      if(isSameDay(d, state.selectedDate)) card.classList.add("is-selected");

      card.addEventListener("click", () => {
        state.selectedDate = startOfDay(d);
        renderWeek();
        openBusySheet(d);
      });

      attachLongPress(card, d);

      grid.appendChild(card);
    }
  }

  function render(){
    // плавное обновление сетки/списка календаря
    const grid = $("daysGrid");
    if(grid){
      grid.classList.add("is-switching");
      // снимаем класс чуть позже, чтобы был fade-in
      window.setTimeout(() => grid.classList.remove("is-switching"), 160);
    }

    // синхронизируем заголовки дней недели
    renderWeekHeader();

    if(state.viewMode === "week") {
      renderWeek();
    } else {
      ensureMonthDom();
      renderMonth();
    }

    renderUpcoming();
  }

  function prevWeek(){
    if(!state.weekStartDate) state.weekStartDate = startOfWeek(state.selectedDate || new Date());
    state.weekStartDate = new Date(state.weekStartDate.getFullYear(), state.weekStartDate.getMonth(), state.weekStartDate.getDate() - 7);
    state.selectedDate = startOfDay(state.weekStartDate);
    render();
  }

  function nextWeek(){
    if(!state.weekStartDate) state.weekStartDate = startOfWeek(state.selectedDate || new Date());
    state.weekStartDate = new Date(state.weekStartDate.getFullYear(), state.weekStartDate.getMonth(), state.weekStartDate.getDate() + 7);
    state.selectedDate = startOfDay(state.weekStartDate);
    render();
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
      render();
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

      if(state.viewMode === "week"){
        if(dx < 0) nextWeek();
        else prevWeek();
      } else {
        if(dx < 0) nextMonth();
        else prevMonth();
      }
    }, {passive:true});
  }

  function prevMonth(){
    state.currentMonth = startOfMonth(new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth()-1, 1));
    render();
  }
  function nextMonth(){
    state.currentMonth = startOfMonth(new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth()+1, 1));
    render();
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
    render();
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

    // settings events from profile.js
    document.addEventListener("settings:weekStart", (e) => {
      settings.weekStart = e.detail === "sun" ? "sun" : "mon";
      // обновляем и сетку, и шапку дней
      if(state.viewMode === "week") state.weekStartDate = startOfWeek(state.selectedDate || new Date());
      render();
    });
    document.addEventListener("settings:timeFormat", (e) => {
      settings.timeFormat = e.detail === "12" ? "12" : "24";
      render();
    });


    // month controls
    $("prevMonth").addEventListener("click", prevMonth);
    $("nextMonth").addEventListener("click", nextMonth);
    
    // quick chips
    $("chipToday")?.addEventListener("click", () => {
      state.viewMode = "month";
      state.weekStartDate = null;
      state.selectedDate = startOfDay(new Date());
      state.currentMonth = startOfMonth(state.selectedDate);
      // жёстко возвращаем DOM в month-mode
      ensureMonthDom();
      renderMonth();
      renderUpcoming();
      setActiveChip("chipToday");
    });
    $("chipTomorrow")?.addEventListener("click", () => {
      state.viewMode = "month";
      state.weekStartDate = null;
      const d = new Date();
      d.setDate(d.getDate()+1);
      state.selectedDate = startOfDay(d);
      state.currentMonth = startOfMonth(state.selectedDate);
      ensureMonthDom();
      renderMonth();
      renderUpcoming();
      setActiveChip("chipTomorrow");
    });
    $("chipWeekend")?.addEventListener("click", () => {
      const d = new Date();
      const dow = d.getDay()===0 ? 7 : d.getDay();
      const add = (6 - dow); // to Saturday
      d.setDate(d.getDate()+add);
      state.selectedDate = startOfDay(d);
      state.viewMode = "month";
      state.weekStartDate = null;
      state.currentMonth = startOfMonth(state.selectedDate);
      ensureMonthDom();
      renderMonth();
      renderUpcoming();
      setActiveChip("chipWeekend");
    });
    $("chipWeek")?.addEventListener("click", () => {
      if(state.viewMode === "week"){
        state.viewMode = "month";
        state.weekStartDate = null;
        ensureMonthDom();
        renderMonth();
        renderUpcoming();
      } else {
        state.viewMode = "week";
        state.weekStartDate = startOfWeek(state.selectedDate || new Date());
        render(); // week render
      }
      setActiveChip("chipWeek");
    });
    $("chipFindWindow")?.addEventListener("click", () => openFreeWindow());

$("todayBtn").addEventListener("click", () => {
      const t = new Date();
      state.currentMonth = startOfMonth(t);
      state.viewMode = "month";
      state.selectedDate = startOfDay(t);
      render();
      openBusySheet(t);
    });

    // sheets
    $("sheetBackdrop").addEventListener("click", closeAllSheets);
    
    $("closeFreeWindow")?.addEventListener("click", closeFreeWindow);
    $("freeWindowDoneBtn")?.addEventListener("click", closeFreeWindow);
$("closeBusy").addEventListener("click", closeAllSheets);
    $("closeAdd").addEventListener("click", closeAllSheets);
    $("saveEventBtn").addEventListener("click", saveFromAdd);

    render();
    bindSwipe();
  }

  document.addEventListener("DOMContentLoaded", init);
})();