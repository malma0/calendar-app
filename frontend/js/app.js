// ===== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ =====
let currentDate = new Date();
let currentMonth = currentDate.getMonth();
let currentYear = currentDate.getFullYear();
let selectedDate = new Date(currentYear, currentMonth, currentDate.getDate());
let longPressTimer = null;
let isTouchDevice = 'ontouchstart' in window;

// ===== ИНИЦИАЛИЗАЦИЯ =====
document.addEventListener('DOMContentLoaded', function() {
    renderCalendar();
    setupEventListeners();
    updateSelectedDateDisplay();
    hideDayEvents();
    
    // Показываем подсказку на 3 секунды
    setTimeout(() => {
        showLongPressHint();
    }, 1000);
});

// ===== КАЛЕНДАРЬ =====
function renderCalendar() {
    const daysGrid = document.getElementById('daysGrid');
    const monthYearElement = document.getElementById('monthYear');
    
    // Обновляем заголовок
    const monthNames = [
        'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ];
    monthYearElement.textContent = `${monthNames[currentMonth]} ${currentYear}`;
    
    // Очищаем сетку
    daysGrid.innerHTML = '';
    
    // Первый и последний день месяца
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    
    // День недели первого дня (понедельник = 1)
    let firstDayOfWeek = firstDay.getDay();
    if (firstDayOfWeek === 0) firstDayOfWeek = 7;
    
    // Дни предыдущего месяца
    for (let i = firstDayOfWeek - 1; i > 0; i--) {
        const date = new Date(currentYear, currentMonth, -i + 1);
        daysGrid.appendChild(createDayElement(date, true));
    }
    
    // Дни текущего месяца
    for (let day = 1; day <= lastDay.getDate(); day++) {
        const date = new Date(currentYear, currentMonth, day);
        daysGrid.appendChild(createDayElement(date, false));
    }
    
    // Дни следующего месяца
    const totalCells = 42; // 6 недель
    const daysSoFar = firstDayOfWeek - 1 + lastDay.getDate();
    const remainingDays = totalCells - daysSoFar;
    
    for (let i = 1; i <= remainingDays; i++) {
        const date = new Date(currentYear, currentMonth + 1, i);
        daysGrid.appendChild(createDayElement(date, true));
    }
}

function createDayElement(date, isOtherMonth) {
    const dayElement = document.createElement('div');
    dayElement.className = 'day';
    dayElement.dataset.date = date.toISOString().split('T')[0];
    
    if (isOtherMonth) {
        dayElement.classList.add('other-month');
    }
    
    // Проверка на сегодня
    const today = new Date();
    if (date.getDate() === today.getDate() && 
        date.getMonth() === today.getMonth() && 
        date.getFullYear() === today.getFullYear()) {
        dayElement.classList.add('today');
    }
    
    // Номер дня
    const dayNumber = document.createElement('div');
    dayNumber.className = 'day-number';
    dayNumber.textContent = date.getDate();
    dayElement.appendChild(dayNumber);
    
    // Индикаторы событий (скрыты)
    const eventsIndicator = document.createElement('div');
    eventsIndicator.className = 'events-indicator';
    
    // Демо: случайные события
    const hasEvents = Math.random() > 0.7;
    if (hasEvents) {
        const eventCount = Math.floor(Math.random() * 3) + 1;
        
        if (eventCount === 1) {
            const dot = document.createElement('div');
            dot.className = 'event-dot';
            dot.style.backgroundColor = getRandomColor();
            eventsIndicator.appendChild(dot);
        } else {
            const bar = document.createElement('div');
            bar.className = 'event-bar';
            
            const colors = [];
            for (let i = 0; i < Math.min(eventCount, 3); i++) {
                colors.push(getRandomColor());
            }
            
            if (colors.length === 2) {
                bar.style.background = `linear-gradient(to right, ${colors[0]} 50%, ${colors[1]} 50%)`;
            } else if (colors.length === 3) {
                bar.style.background = `linear-gradient(to right, ${colors[0]} 33%, ${colors[1]} 33% 66%, ${colors[2]} 66%)`;
            }
            
            eventsIndicator.appendChild(bar);
        }
        
        dayElement.dataset.hasEvents = 'true';
        dayElement.dataset.eventCount = eventCount;
    } else {
        dayElement.dataset.hasEvents = 'false';
    }
    
    dayElement.appendChild(eventsIndicator);
    
    // ===== ОБРАБОТЧИКИ ДЛЯ ТЕЛЕФОНА И КОМПЬЮТЕРА =====
    
    // Клик/тап по дню
    dayElement.addEventListener('click', handleDayClick.bind(null, date, dayElement));
    
    // Для touch устройств
    if (isTouchDevice) {
        let tapTimer;
        
        dayElement.addEventListener('touchstart', function(e) {
            e.preventDefault();
            tapTimer = setTimeout(() => {
                handleLongPress(date);
            }, 500);
        });
        
        dayElement.addEventListener('touchend', function(e) {
            e.preventDefault();
            clearTimeout(tapTimer);
        });
        
        dayElement.addEventListener('touchmove', function(e) {
            clearTimeout(tapTimer);
        });
    } else {
        // Для компьютера
        dayElement.addEventListener('mousedown', function(e) {
            if (e.button !== 0) return;
            longPressTimer = setTimeout(() => {
                handleLongPress(date);
            }, 500);
        });
        
        dayElement.addEventListener('mouseup', function() {
            clearTimeout(longPressTimer);
        });
        
        dayElement.addEventListener('mouseleave', function() {
            clearTimeout(longPressTimer);
        });
    }
    
    return dayElement;
}

// Обработка клика по дню
function handleDayClick(date, element) {
    // Убираем выделение со всех дней
    document.querySelectorAll('.day').forEach(day => {
        day.classList.remove('selected');
    });
    
    // Выделяем выбранный день
    element.classList.add('selected');
    
    selectedDate = date;
    updateSelectedDateDisplay();
    
    // Показываем события для этого дня
    if (element.dataset.hasEvents === 'true') {
        loadDemoEvents();
        showDayEvents();
    } else {
        showNoEventsMessage();
    }
}

// Long press - добавить событие
function handleLongPress(date) {
    selectedDate = date;
    showAddEventModal(date);
}

// ===== УПРАВЛЕНИЕ СОБЫТИЯМИ =====
function showDayEvents() {
    const dayEvents = document.querySelector('.day-events');
    dayEvents.classList.add('visible');
}

function hideDayEvents() {
    const dayEvents = document.querySelector('.day-events');
    dayEvents.classList.remove('visible');
}

function showNoEventsMessage() {
    const eventsList = document.getElementById('eventsList');
    eventsList.innerHTML = `
        <div class="event-card" style="border-left-color: var(--text-tertiary)">
            <div class="event-time">Весь день</div>
            <div class="event-title">Нет событий</div>
            <div class="event-user">
                <div class="user-avatar" style="background: var(--text-tertiary)">!</div>
                <span>Нажмите и удержите для добавления</span>
            </div>
        </div>
    `;
    showDayEvents();
}

// ===== МОДАЛЬНОЕ ОКНО =====
function showAddEventModal(date) {
    const modal = document.getElementById('addEventModal');
    const modalDate = document.getElementById('modalDate');
    
    modalDate.textContent = formatDate(date);
    modal.classList.add('visible');
    
    // Устанавливаем дату в форму
    document.getElementById('eventDate').value = date.toISOString().split('T')[0];
}

function closeAddEventModal() {
    const modal = document.getElementById('addEventModal');
    modal.classList.remove('visible');
}

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
function getRandomColor() {
    const colors = ['#007AFF', '#FF3B30', '#34C759', '#FF9500', '#AF52DE'];
    return colors[Math.floor(Math.random() * colors.length)];
}

function formatDate(date) {
    const monthNames = [
        'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
        'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
    ];
    const dayNames = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
    const dayOfWeek = dayNames[date.getDay()];
    return `${date.getDate()} ${monthNames[date.getMonth()]} (${dayOfWeek})`;
}

function updateSelectedDateDisplay() {
    document.getElementById('selectedDate').textContent = formatDate(selectedDate);
}

function showLongPressHint() {
    const hint = document.getElementById('longPressHint');
    hint.classList.add('visible');
    
    setTimeout(() => {
        hint.classList.remove('visible');
    }, 3000);
}

// ===== ЗАГРУЗКА СОБЫТИЙ =====
function loadDemoEvents() {
    const eventsList = document.getElementById('eventsList');
    
    const demoEvents = [
        {
            time: '13:00 – 14:00',
            title: 'Визит к врачу',
            user: { name: 'Вы', color: '#007AFF' },
            userInitial: 'В'
        },
        {
            time: '16:00 – 17:00',
            title: 'Совещание на работе',
            user: { name: 'Друг 1', color: '#FF3B30' },
            userInitial: 'Д1'
        },
        {
            time: '18:30 – 21:30',
            title: 'Настольные игры',
            user: { name: 'Друг 2', color: '#34C759' },
            userInitial: 'Д2'
        }
    ];
    
    eventsList.innerHTML = '';
    
    demoEvents.forEach(event => {
        const eventElement = document.createElement('div');
        eventElement.className = 'event-card';
        eventElement.style.borderLeftColor = event.user.color;
        eventElement.innerHTML = `
            <div class="event-time">${event.time}</div>
            <div class="event-title">${event.title}</div>
            <div class="event-user">
                <div class="user-avatar" style="background: ${event.user.color}">${event.userInitial}</div>
                <span>${event.user.name}</span>
            </div>
        `;
        eventsList.appendChild(eventElement);
    });
}

// ===== ОБРАБОТЧИКИ СОБЫТИЙ =====
function setupEventListeners() {
    // Навигация по месяцам
    document.getElementById('prevMonth').addEventListener('click', () => {
        currentMonth--;
        if (currentMonth < 0) {
            currentMonth = 11;
            currentYear--;
        }
        renderCalendar();
        hideDayEvents();
    });
    
    document.getElementById('nextMonth').addEventListener('click', () => {
        currentMonth++;
        if (currentMonth > 11) {
            currentMonth = 0;
            currentYear++;
        }
        renderCalendar();
        hideDayEvents();
    });
    
    // Сегодня
    document.getElementById('todayBtn').addEventListener('click', () => {
        const today = new Date();
        currentMonth = today.getMonth();
        currentYear = today.getFullYear();
        selectedDate = today;
        updateSelectedDateDisplay();
        renderCalendar();
        hideDayEvents();
    });
    
    // Модальное окно
    document.getElementById('closeEventModal').addEventListener('click', closeAddEventModal);
    
    document.querySelector('.modal-overlay').addEventListener('click', function(e) {
        if (e.target === this) {
            closeAddEventModal();
        }
    });
    
    // Форма
    document.getElementById('eventForm').addEventListener('submit', function(e) {
        e.preventDefault();
        
        const title = document.getElementById('eventTitle').value;
        const date = document.getElementById('eventDate').value;
        
        alert(`Событие "${title}" добавлено на ${formatDate(new Date(date))}`);
        closeAddEventModal();
        renderCalendar();
    });
    
    // Мобильное меню
    const menuToggle = document.getElementById('menuToggle');
    const mobileSidebar = document.getElementById('mobileSidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const closeSidebar = document.getElementById('closeSidebar');
    
    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            mobileSidebar.classList.add('active');
            sidebarOverlay.classList.add('active');
        });
        
        closeSidebar.addEventListener('click', () => {
            mobileSidebar.classList.remove('active');
            sidebarOverlay.classList.remove('active');
        });
        
        sidebarOverlay.addEventListener('click', () => {
            mobileSidebar.classList.remove('active');
            sidebarOverlay.classList.remove('active');
        });
    }
}