(() => {
  "use strict";

  // ====== CONFIG ======
  const STORAGE_KEY = "calendar_app_events_v1";
  const LONG_PRESS_MS = 520;
  const isTouchLike = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;

  // Демо-участники (пока статично, дизайн не трогаем)
  const MEMBERS = [
    { id: "me", name: "Вы", color: "#007AFF", initial: "В" },
    { id: "f1", name: "Друг 1", color: "#FF3B30", initial: "Д1" },
    { id: "f2", name: "Друг 2", color: "#34C759", initial: "Д2" },
  ];

  // ====== STATE ======
  const state = {
    current: new Date(),
    selected: new Date(),
    pressTimer: null,
    pressedEl: null,
    pressedDate: null,
  };

  // ====== DOM ======
  const $ = (id) => document.getElementById(id);

  const dom = {
    monthYear: $("monthYear"),
    daysGrid: $("daysGrid"),
    selectedDate: $("selectedDate"),
    eventsList: $("eventsList"),
    dayEvents: $("dayEvents"),

    prevMonth: $("prevMonth"),
    nextMonth: $("nextMonth"),
    todayBtn: $("todayBtn"),

    addEventModal: $("addEventModal"),
    modalDate: $("modalDate"),
    closeEventModal: $("closeEventModal"),
    eventForm: $("eventForm"),
    eventTitle: $("eventTitle"),
    eventDate: $("eventDate"),
    eventTimeStart: $("eventTimeStart"),
    eventTimeEnd: $("eventTimeEnd"),

    longPressHint: $("longPressHint"),

    menuToggle: $("menuToggle"),
    mobileSidebar: $("mobileSidebar"),
    sidebarOverlay: $("sidebarOverlay"),
    closeSidebar: $("closeSidebar"),
  };

  // ====== STORAGE ======
  function loadEvents() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveEvents(events) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  }

  function addEvent(event) {
    const events = loadEvents();
    events.push(event);
    saveEvents(events);
  }

  function getEventsByISODate(isoDate) {
    const events = loadEvents().filter((e) => e.date === isoDate);
    // сортировка по start_time, затем title
    return events.sort((a, b) => {
      const ta = a.start_time || "";
      const tb = b.start_time || "";
      if (ta !== tb) return ta.localeCompare(tb);
      return (a.title || "").localeCompare(b.title || "");
    });
  }

  // ====== DATE HELPERS ======
  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function toISODate(d) {
    const year = d.getFullYear();
    const month = pad2(d.getMonth() + 1);
    const day = pad2(d.getDate());
    return `${year}-${month}-${day}`;
  }

  function sameDay(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function formatDateRu(d) {
    const monthNames = [
      "января", "февраля", "марта", "апреля", "мая", "июня",
      "июля", "августа", "сентября", "октября", "ноября", "декабря",
    ];
    const dayNames = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
    const dayOfWeek = dayNames[d.getDay()];
    return `${d.getDate()} ${monthNames[d.getMonth()]} (${dayOfWeek})`;
  }

  function monthTitleRu(date) {
    const monthNames = [
      "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
      "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
    ];
    return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
  }

  // ====== UI ======
  function showHint() {
    if (!dom.longPressHint) return;
    dom.longPressHint.classList.add("visible");
    setTimeout(() => dom.longPressHint.classList.remove("visible"), 3000);
  }

  function setSelectedDate(date) {
    state.selected = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    dom.selectedDate.textContent = formatDateRu(state.selected);
  }

  function showDayEvents() {
    dom.dayEvents.classList.add("visible");
  }

  function hideDayEvents() {
    dom.dayEvents.classList.remove("visible");
  }

  function renderNoEvents() {
    dom.eventsList.innerHTML = `
      <div class="event-card" style="border-left-color: var(--text-tertiary)">
        <div class="event-time">Весь день</div>
        <div class="event-title">Нет событий</div>
        <div class="event-user">
          <div class="user-avatar" style="background: var(--text-tertiary)">!</div>
          <span>Зажмите день для добавления</span>
        </div>
      </div>
    `;
    showDayEvents();
  }

  function renderEventsForSelectedDay() {
    const iso = toISODate(state.selected);
    const events = getEventsByISODate(iso);

    if (events.length === 0) {
      renderNoEvents();
      return;
    }

    dom.eventsList.innerHTML = "";
    for (const ev of events) {
      const member = MEMBERS.find((m) => m.id === ev.user_id) || MEMBERS[0];

      const time = formatTimeRange(ev.start_time, ev.end_time);
      const el = document.createElement("div");
      el.className = "event-card";
      el.style.borderLeftColor = member.color;
      el.innerHTML = `
        <div class="event-time">${escapeHtml(time)}</div>
        <div class="event-title">${escapeHtml(ev.title)}</div>
        <div class="event-user">
          <div class="user-avatar" style="background: ${member.color}">${escapeHtml(member.initial)}</div>
          <span>${escapeHtml(member.name)}</span>
        </div>
      `;
      dom.eventsList.appendChild(el);
    }

    showDayEvents();
  }

  function formatTimeRange(start, end) {
    const s = (start || "").trim();
    const e = (end || "").trim();
    if (!s && !e) return "Весь день";
    if (s && !e) return `${s} – ?`;
    if (!s && e) return `? – ${e}`;
    return `${s} – ${e}`;
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ====== CALENDAR RENDER ======
  function renderCalendar() {
    dom.monthYear.textContent = monthTitleRu(state.current);
    dom.daysGrid.innerHTML = "";

    const year = state.current.getFullYear();
    const month = state.current.getMonth();

    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);

    // weekday: Mon=1..Sun=7
    let firstDow = first.getDay();
    if (firstDow === 0) firstDow = 7;

    // days before month (prev month)
    for (let i = firstDow - 1; i > 0; i--) {
      const d = new Date(year, month, 1 - i);
      dom.daysGrid.appendChild(createDayCell(d, true));
    }

    // current month days
    for (let day = 1; day <= last.getDate(); day++) {
      const d = new Date(year, month, day);
      dom.daysGrid.appendChild(createDayCell(d, false));
    }

    // fill to 6 weeks (42)
    const total = 42;
    const used = (firstDow - 1) + last.getDate();
    const remaining = total - used;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      dom.daysGrid.appendChild(createDayCell(d, true));
    }
  }

  function createDayCell(date, isOtherMonth) {
    const cell = document.createElement("div");
    cell.className = "day";
    if (isOtherMonth) cell.classList.add("other-month");

    const iso = toISODate(date);
    cell.dataset.date = iso;

    const today = new Date();
    if (sameDay(date, today)) cell.classList.add("today");

    const number = document.createElement("div");
    number.className = "day-number";
    number.textContent = String(date.getDate());
    cell.appendChild(number);

    // индикатор (CSS у тебя скрывает display:none — дизайн не трогаем)
    const eventsIndicator = document.createElement("div");
    eventsIndicator.className = "events-indicator";
    cell.appendChild(eventsIndicator);

    // click selects day
    cell.addEventListener("click", () => {
      selectDayCell(cell, date);
    });

    // long press
    attachLongPress(cell, date);

    // если выбранный день в текущем месяце — подсветим при рендере
    if (sameDay(date, state.selected)) {
      cell.classList.add("selected");
    }

    // отметим, есть ли события (для логики показа событий)
    const has = getEventsByISODate(iso).length > 0;
    cell.dataset.hasEvents = has ? "true" : "false";

    return cell;
  }

  function selectDayCell(cell, date) {
    document.querySelectorAll(".day.selected").forEach((d) => d.classList.remove("selected"));
    cell.classList.add("selected");
    setSelectedDate(date);

    // показываем события
    renderEventsForSelectedDay();
  }

  function attachLongPress(el, date) {
    // На тач-устройствах используем pointer events, не блокируя скролл.
    const onDown = (e) => {
      // только ЛКМ или pointer touch/pen
      if (e.pointerType === "mouse" && e.button !== 0) return;

      state.pressedEl = el;
      state.pressedDate = date;

      clearTimeout(state.pressTimer);
      state.pressTimer = setTimeout(() => {
        state.pressTimer = null;
        openAddEventModal(date);
      }, LONG_PRESS_MS);
    };

    const cancel = () => {
      if (state.pressTimer) clearTimeout(state.pressTimer);
      state.pressTimer = null;
      state.pressedEl = null;
      state.pressedDate = null;
    };

    el.addEventListener("pointerdown", onDown, { passive: true });
    el.addEventListener("pointerup", cancel, { passive: true });
    el.addEventListener("pointercancel", cancel, { passive: true });
    el.addEventListener("pointerleave", cancel, { passive: true });
    el.addEventListener("pointermove", cancel, { passive: true });
  }

  // ====== MODAL ======
  function openAddEventModal(date) {
    setSelectedDate(date);
    dom.modalDate.textContent = formatDateRu(date);
    dom.eventDate.value = toISODate(date);

    // сброс формы (кроме даты)
    dom.eventTitle.value = "";
    dom.eventTimeStart.value = "";
    dom.eventTimeEnd.value = "";

    dom.addEventModal.classList.add("visible");
    dom.addEventModal.setAttribute("aria-hidden", "false");

    // фокус
    setTimeout(() => dom.eventTitle.focus(), 0);
  }

  function closeAddEventModal() {
    dom.addEventModal.classList.remove("visible");
    dom.addEventModal.setAttribute("aria-hidden", "true");
  }

  // ====== MOBILE SIDEBAR ======
  function openSidebar() {
    dom.mobileSidebar.classList.add("active");
    dom.sidebarOverlay.classList.add("active");
  }

  function closeSidebar() {
    dom.mobileSidebar.classList.remove("active");
    dom.sidebarOverlay.classList.remove("active");
  }

  // ====== EVENTS ======
  function normalizeTime(t) {
    const v = (t || "").trim();
    if (!v) return null;
    // ожидаем HH:MM
    if (!/^\d{2}:\d{2}$/.test(v)) return null;
    return v;
  }

  function handleSubmitEventForm(e) {
    e.preventDefault();

    const title = dom.eventTitle.value.trim();
    const date = dom.eventDate.value;

    if (!title) {
      dom.eventTitle.focus();
      return;
    }
    if (!date) {
      dom.eventDate.focus();
      return;
    }

    const start = normalizeTime(dom.eventTimeStart.value);
    const end = normalizeTime(dom.eventTimeEnd.value);

    // валидация времени: если оба есть — start < end
    if (start && end && start >= end) {
      alert("Время окончания должно быть позже времени начала.");
      dom.eventTimeEnd.focus();
      return;
    }

    const ev = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      title,
      date,
      start_time: start,
      end_time: end,
      // пока всегда "Вы"
      user_id: "me",
      created_at: new Date().toISOString(),
    };

    addEvent(ev);

    closeAddEventModal();

    // перерисуем календарь, чтобы клетки знали hasEvents
    renderCalendar();

    // подсветим выбранную дату и покажем список
    setSelectedDate(new Date(date));
    // найдём клетку даты и сделаем selected (после renderCalendar)
    const cell = document.querySelector(`.day[data-date="${date}"]`);
    if (cell) selectDayCell(cell, new Date(date));
    else renderEventsForSelectedDay();
  }

  // ====== INIT ======
  function init() {
    // init selected/current
    const now = new Date();
    state.current = new Date(now.getFullYear(), now.getMonth(), 1);
    state.selected = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    setSelectedDate(state.selected);
    renderCalendar();
    hideDayEvents();

    // hint
    setTimeout(showHint, 900);

    // month nav
    dom.prevMonth.addEventListener("click", () => {
      state.current = new Date(state.current.getFullYear(), state.current.getMonth() - 1, 1);
      renderCalendar();
      hideDayEvents();
    });

    dom.nextMonth.addEventListener("click", () => {
      state.current = new Date(state.current.getFullYear(), state.current.getMonth() + 1, 1);
      renderCalendar();
      hideDayEvents();
    });

    dom.todayBtn.addEventListener("click", () => {
      const t = new Date();
      state.current = new Date(t.getFullYear(), t.getMonth(), 1);
      state.selected = new Date(t.getFullYear(), t.getMonth(), t.getDate());
      setSelectedDate(state.selected);
      renderCalendar();
      hideDayEvents();
    });

    // modal close
    dom.closeEventModal.addEventListener("click", closeAddEventModal);
    dom.addEventModal.addEventListener("click", (e) => {
      if (e.target === dom.addEventModal) closeAddEventModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && dom.addEventModal.classList.contains("visible")) {
        closeAddEventModal();
      }
    });

    // form submit
    dom.eventForm.addEventListener("submit", handleSubmitEventForm);

    // mobile sidebar
    if (dom.menuToggle) dom.menuToggle.addEventListener("click", openSidebar);
    if (dom.closeSidebar) dom.closeSidebar.addEventListener("click", closeSidebar);
    if (dom.sidebarOverlay) dom.sidebarOverlay.addEventListener("click", closeSidebar);

    // на touch устройствах делаем подсказку релевантнее
    if (!isTouchLike && dom.longPressHint) {
      dom.longPressHint.textContent = "✨ Зажмите (или удерживайте ЛКМ) день для добавления события";
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();