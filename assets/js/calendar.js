/* TimeWise — monthly calendar view. Uses the shared task store. */

(function () {
  'use strict';

  var Store = window.TimeWiseStore;
  var Settings = window.TimeWiseSettings;
  var todayISO = Store.today();

  function parseISO(value) {
    var parts = String(value).split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function toISO(date) {
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    return date.getFullYear() + '-' + month + '-' + day;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function timeRank(task) {
    return !task.time || task.time === 'Anytime' ? '99:99' : task.time;
  }

  function showToast(message) {
    var toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(function () { toast.classList.remove('show'); }, 2600);
  }

  var viewDate = parseISO(todayISO);
  var selectedDate = todayISO;
  var grid = document.getElementById('calendar-grid');
  var monthTitle = document.getElementById('calendar-title');
  var dayTitle = document.getElementById('day-title');
  var daySummary = document.getElementById('day-summary');
  var dayList = document.getElementById('day-task-list');
  var dayEmpty = document.getElementById('day-empty');
  var search = document.getElementById('task-search');

  function filteredTasks() {
    var query = search ? search.value.trim().toLowerCase() : '';
    return Store.getTasks().filter(function (task) {
      if (!task.due) return false;
      if (!query) return true;
      return task.title.toLowerCase().indexOf(query) !== -1 ||
        (task.notes || '').toLowerCase().indexOf(query) !== -1 ||
        task.tag.toLowerCase().indexOf(query) !== -1;
    });
  }

  function weekStartsSunday() {
    return Boolean(Settings && Settings.get().weekStart === 'sunday');
  }

  function renderWeekdayLabels() {
    var header = document.getElementById('calendar-weekdays');
    if (!header) return;
    var labels = weekStartsSunday()
      ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    header.innerHTML = labels.map(function (label) { return '<span>' + label + '</span>'; }).join('');
  }

  function renderCalendar(tasks) {
    if (!grid) return;
    var year = viewDate.getFullYear();
    var month = viewDate.getMonth();
    if (monthTitle) monthTitle.textContent = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(viewDate);
    renderWeekdayLabels();

    var first = new Date(year, month, 1);
    var offset = weekStartsSunday() ? first.getDay() : (first.getDay() + 6) % 7;
    var start = new Date(year, month, 1 - offset);

    grid.innerHTML = '';
    for (var index = 0; index < 42; index++) {
      var date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      var iso = toISO(date);
      var dayTasks = tasks.filter(function (task) { return task.due === iso; })
        .sort(function (a, b) { return timeRank(a).localeCompare(timeRank(b)); });
      var cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'calendar-day' +
        (date.getMonth() !== month ? ' other-month' : '') +
        (iso === todayISO ? ' today' : '') +
        (iso === selectedDate ? ' selected' : '');
      cell.dataset.date = iso;
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-label', new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(date) + ', ' + dayTasks.length + ' tasks');

      var html = '<span class="day-number">' + date.getDate() + '</span>';
      if (dayTasks.length) {
        html += '<span class="day-chips">';
        dayTasks.slice(0, 3).forEach(function (task) {
          html += '<span class="task-chip ' + escapeHtml(task.priority) + (task.done ? ' done' : '') + '">' +
            '<span class="chip-dot"></span><span class="chip-title">' + escapeHtml(task.title) + '</span></span>';
        });
        if (dayTasks.length > 3) html += '<span class="more-chip">+' + (dayTasks.length - 3) + ' more</span>';
        html += '</span>';
      }
      cell.innerHTML = html;
      grid.appendChild(cell);
    }
  }

  function renderDayPanel(tasks) {
    var dayTasks = tasks.filter(function (task) { return task.due === selectedDate; })
      .sort(function (a, b) { return timeRank(a).localeCompare(timeRank(b)); });
    var done = dayTasks.filter(function (task) { return task.done; }).length;

    if (dayTitle) {
      dayTitle.textContent = new Intl.DateTimeFormat('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long'
      }).format(parseISO(selectedDate));
    }
    if (daySummary) daySummary.textContent = dayTasks.length + ' task' + (dayTasks.length === 1 ? '' : 's') + ' · ' + done + ' done';

    if (dayList) {
      dayList.innerHTML = '';
      dayTasks.forEach(function (task) {
        var safeTitle = escapeHtml(task.title);
        var li = document.createElement('li');
        li.className = 'day-task-item' + (task.done ? ' done' : '');
        li.dataset.id = task.id;
        li.innerHTML =
          '<button class="day-check" type="button" aria-pressed="' + task.done + '" aria-label="' +
            (task.done ? 'Mark as not done: ' : 'Mark as done: ') + safeTitle + '">' +
            '<svg class="icon" aria-hidden="true"><use href="#i-check"></use></svg>' +
          '</button>' +
          '<span class="day-task-body"><span class="day-task-title">' + safeTitle + '</span>' +
            '<span class="day-task-meta"><span>' + escapeHtml(task.time) + '</span><span>' + escapeHtml(task.tag) + '</span></span>' +
          '</span>';
        dayList.appendChild(li);
      });
    }
    if (dayEmpty) dayEmpty.hidden = dayTasks.length !== 0;
  }

  function render() {
    var tasks = filteredTasks();
    renderCalendar(tasks);
    renderDayPanel(tasks);
  }

  if (grid) {
    grid.addEventListener('click', function (event) {
      var cell = event.target.closest('.calendar-day');
      if (!cell) return;
      selectedDate = cell.dataset.date;
      viewDate = parseISO(selectedDate);
      render();
    });
  }

  if (dayList) {
    dayList.addEventListener('click', function (event) {
      if (!event.target.closest('.day-check')) return;
      var item = event.target.closest('.day-task-item');
      if (item) Store.toggleTask(item.dataset.id);
    });
  }

  var prev = document.getElementById('prev-month');
  var next = document.getElementById('next-month');
  if (prev) prev.addEventListener('click', function () { viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1); render(); });
  if (next) next.addEventListener('click', function () { viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1); render(); });

  var todayButton = document.getElementById('today-btn');
  if (todayButton) todayButton.addEventListener('click', function () {
    selectedDate = Store.today();
    viewDate = parseISO(selectedDate);
    render();
  });

  if (search) search.addEventListener('input', render);

  var dayForm = document.getElementById('day-add-form');
  var dayInput = document.getElementById('day-task-title');
  if (dayForm && dayInput) {
    dayForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var title = dayInput.value.trim();
      if (!title) return;
      Store.addTask({
        title: title,
        due: selectedDate,
        time: 'Anytime',
        tag: 'Personal',
        priority: document.getElementById('day-task-priority').value
      });
      dayInput.value = '';
      showToast('Task added to ' + selectedDate + '.');
    });
  }

  var newTaskButton = document.getElementById('new-task-btn');
  if (newTaskButton && dayInput) newTaskButton.addEventListener('click', function () { dayInput.focus(); });

  // Sidebar and shared UI behavior
  var sidebar = document.getElementById('sidebar');
  var overlay = document.getElementById('sidebar-overlay');
  var menuBtn = document.getElementById('menu-btn');
  var closeBtn = document.getElementById('sidebar-close');

  function setSidebar(open) {
    if (!sidebar) return;
    sidebar.classList.toggle('is-open', open);
    if (overlay) overlay.hidden = !open;
    if (menuBtn) menuBtn.setAttribute('aria-expanded', String(open));
    // A closed off-canvas sidebar must leave the tab order, and focus must
    // move in/out with it for keyboard and screen-reader users.
    var offCanvas = window.innerWidth <= 860;
    if ('inert' in sidebar) sidebar.inert = offCanvas && !open;
    else sidebar.setAttribute('aria-hidden', String(offCanvas && !open));
    if (offCanvas && open && closeBtn) closeBtn.focus();
    else if (offCanvas && !open && sidebar.contains(document.activeElement) && menuBtn) menuBtn.focus();
  }
  setSidebar(false);
  if (menuBtn) menuBtn.addEventListener('click', function () { setSidebar(true); });
  if (closeBtn) closeBtn.addEventListener('click', function () { setSidebar(false); });
  if (overlay) overlay.addEventListener('click', function () { setSidebar(false); });
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape') setSidebar(false); });
  window.addEventListener('resize', function () {
    if (window.innerWidth > 860) setSidebar(false);
    else if (sidebar && 'inert' in sidebar) sidebar.inert = !sidebar.classList.contains('is-open');
  });

  document.querySelectorAll('[data-soon]').forEach(function (link) {
    link.addEventListener('click', function (event) { event.preventDefault(); showToast(link.dataset.soon); });
  });
  window.addEventListener('timewise:error', function (event) { showToast(event.detail); });

  Store.subscribe(render);
  if (Settings) Settings.subscribe(render);
  render();
})();
