/* TimeWise — dashboard interactions (vanilla JavaScript).
   Tasks are stored locally for now; Supabase replaces this in a later step. */

(function () {
  'use strict';

  function prefersReducedMotion() {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  var Store = window.TimeWiseStore;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function tagClass(tag) {
    if (tag === 'Deep work') return 'deep';
    if (tag === 'Meeting') return 'meeting';
    return '';
  }

  // Toast notifications
  var toast = document.getElementById('toast');
  var toastTimer;
  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 2600);
  }

  // Today's date (the greeting is handled by app-settings.js so name changes sync everywhere)
  var dateEl = document.getElementById('today-date');
  if (dateEl) {
    dateEl.textContent = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date());
  }

  // Task list
  var list = document.getElementById('task-list');
  var emptyState = document.getElementById('empty-state');
  var search = document.getElementById('task-search');
  var tasksStatValue = document.getElementById('tasks-stat-value');
  var tasksStatNote = document.getElementById('tasks-stat-note');
  var sideOpenCount = document.getElementById('side-open-count');

  function updateStats(tasks) {
    var done = tasks.filter(function (task) { return task.done; }).length;
    var open = tasks.length - done;
    if (tasksStatValue) tasksStatValue.textContent = done + ' / ' + tasks.length;
    if (tasksStatNote) tasksStatNote.textContent = tasks.length === 0 ? 'Add a task to start' : done === tasks.length ? 'All done for today' : open + ' remaining';
    if (sideOpenCount) sideOpenCount.textContent = String(open);
  }

  function renderTasks() {
    if (!list) return;
    var tasks = Store.getTasks().filter(Store.isToday);
    var query = search ? search.value.trim().toLowerCase() : '';
    var visible = tasks.filter(function (task) { return task.title.toLowerCase().indexOf(query) !== -1; });

    list.innerHTML = '';
    visible.forEach(function (task) {
      var safeTitle = escapeHtml(task.title);
      var repeat = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }[task.repeat];
      var doneSteps = (task.subtasks || []).filter(function (step) { return step.done; }).length;
      var li = document.createElement('li');
      li.className = 'task-item' + (task.done ? ' done' : '');
      li.dataset.id = task.id;
      li.draggable = true;
      li.title = 'Drag or use the arrow buttons to reorder your plan';
      li.innerHTML =
        '<button class="task-check" type="button" aria-pressed="' + task.done + '" aria-label="' +
          (task.done ? 'Mark as not done: ' : 'Mark as done: ') + safeTitle + '">' +
          '<svg class="icon" aria-hidden="true"><use href="#i-check"></use></svg>' +
        '</button>' +
        '<div class="task-main">' +
          '<span class="task-title">' + safeTitle + '</span>' +
          '<span class="task-meta"><time>' + escapeHtml(task.time) + '</time>' +
            '<span class="task-tag ' + tagClass(task.tag) + '">' + escapeHtml(task.tag) + '</span>' +
            (repeat ? '<span class="repeat-badge" title="Repeats ' + repeat.toLowerCase() + '">↻ ' + repeat + '</span>' : '') +
            (task.subtasks && task.subtasks.length
              ? '<span class="subtask-progress">☑ ' + doneSteps + '/' + task.subtasks.length + '</span>'
              : '') +
          '</span>' +
        '</div>' +
        '<span class="plan-move">' +
          '<button class="task-move" type="button" data-dir="up" aria-label="Move ' + safeTitle + ' up in plan">↑</button>' +
          '<button class="task-move" type="button" data-dir="down" aria-label="Move ' + safeTitle + ' down in plan">↓</button>' +
        '</span>' +
        '<button class="task-delete" type="button" aria-label="Delete ' + safeTitle + '">' +
          '<svg class="icon" aria-hidden="true"><use href="#i-trash"></use></svg>' +
        '</button>';
      list.appendChild(li);
    });

    if (emptyState) emptyState.hidden = visible.length !== 0;
    updateStats(tasks);
    renderTimerTasks();
  }

  if (list) {
    list.addEventListener('click', function (event) {
      var item = event.target.closest('.task-item');
      if (!item) return;
      var id = item.dataset.id;

      if (event.target.closest('.task-check')) {
        Store.toggleTask(id);
      } else if (event.target.closest('.task-delete')) {
        Store.deleteTask(id);
        showToast('Task removed.');
      } else {
        var move = event.target.closest('.task-move');
        if (move) {
          var ids = Array.prototype.map.call(list.querySelectorAll('.task-item'), function (item) { return item.dataset.id; });
          var from = ids.indexOf(id);
          var to = from + (move.dataset.dir === 'up' ? -1 : 1);
          if (from < 0 || to < 0 || to >= ids.length) return;
          ids.splice(to, 0, ids.splice(from, 1)[0]);
          Store.reorderTasks(ids);
          showToast('Plan reordered: ' + (move.dataset.dir === 'up' ? 'moved up.' : 'moved down.'));
          var restored = list.querySelector('[data-id="' + id + '"] .task-move[data-dir="' + move.dataset.dir + '"]');
          if (restored) restored.focus();
        }
      }
    });
  }

  var draggedId = null;
  if (list) {
    list.addEventListener('dragstart', function (event) {
      var item = event.target.closest('.task-item');
      if (!item) return;
      draggedId = item.dataset.id;
      item.classList.add('dragging');
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', draggedId);
      }
    });
    list.addEventListener('dragover', function (event) {
      if (!draggedId || !event.target.closest('.task-item')) return;
      event.preventDefault();
    });
    list.addEventListener('drop', function (event) {
      var target = event.target.closest('.task-item');
      if (!draggedId || !target || target.dataset.id === draggedId) return;
      event.preventDefault();
      var ids = Array.prototype.map.call(list.querySelectorAll('.task-item'), function (item) { return item.dataset.id; });
      var from = ids.indexOf(draggedId);
      var to = ids.indexOf(target.dataset.id);
      if (from < 0 || to < 0) return;
      ids.splice(to, 0, ids.splice(from, 1)[0]);
      Store.reorderTasks(ids);
      draggedId = null;
      showToast('Plan reordered.');
    });
    list.addEventListener('dragend', function () {
      draggedId = null;
      Array.prototype.forEach.call(list.querySelectorAll('.dragging'), function (item) { item.classList.remove('dragging'); });
    });
  }

  if (search) search.addEventListener('input', renderTasks);

  var quickAddForm = document.getElementById('quick-add-form');
  var quickAddInput = document.getElementById('quick-add-input');
  if (quickAddForm && quickAddInput) {
    quickAddForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var title = quickAddInput.value.trim();
      if (!title) return;
      Store.addTask({ title: title, time: 'Anytime', tag: 'Quick add', priority: 'medium' });
      quickAddInput.value = '';
      showToast('Task added to today’s plan.');
    });
  }

  var newTaskBtn = document.getElementById('new-task-btn');
  if (newTaskBtn && quickAddInput) {
    newTaskBtn.addEventListener('click', function () { quickAddInput.focus(); });
  }

  // Focus timer — default length comes from Settings
  var Settings = window.TimeWiseSettings;
  var duration = Settings ? Settings.get().focusMinutes : 25;
  var remaining = duration * 60;
  var timerId = null;
  var timerDisplay = document.getElementById('timer-display');
  var timerRing = document.getElementById('timer-ring');
  var timerToggle = document.getElementById('timer-toggle');
  var timerReset = document.getElementById('timer-reset');
  var timerHint = document.getElementById('timer-hint');
  var timerTaskSelect = document.getElementById('timer-task');
  var durationButtons = document.querySelectorAll('.timer-duration button');

  function renderTimerTasks() {
    if (!timerTaskSelect) return;
    var previous = timerTaskSelect.value;
    timerTaskSelect.innerHTML = '<option value="">No specific task</option>';
    Store.getTasks().filter(function (task) { return !task.done && Store.isToday(task); }).forEach(function (task) {
      var option = document.createElement('option');
      option.value = task.id;
      option.textContent = task.title;
      timerTaskSelect.appendChild(option);
    });
    if (previous && timerTaskSelect.querySelector('option[value="' + CSS.escape(previous) + '"]')) {
      timerTaskSelect.value = previous;
    }
  }

  function formatTime(seconds) {
    return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  }

  function updateTimer() {
    if (timerDisplay) timerDisplay.textContent = formatTime(remaining);
    if (timerRing) timerRing.style.setProperty('--progress', (1 - remaining / (duration * 60)).toFixed(4));
    document.title = timerId ? formatTime(remaining) + ' · Focus — TimeWise' : 'Dashboard — TimeWise';
  }

  function stopTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
    if (timerToggle) {
      var text = timerToggle.querySelector('span');
      var icon = timerToggle.querySelector('use');
      if (text) text.textContent = 'Start focus';
      if (icon) icon.setAttribute('href', '#i-play');
    }
    if (timerHint) timerHint.textContent = 'Pick a task, press start, and stay with it.';
    document.title = 'Dashboard — TimeWise';
  }

  function tick() {
    if (remaining > 0) {
      remaining--;
      updateTimer();
      if (remaining === 0) {
        stopTimer();
        if (timerHint) timerHint.textContent = 'Session complete — take a short break!';
        showToast('Focus session complete. Nice work!');
        if (Store.addSession) {
          var selectedId = timerTaskSelect ? timerTaskSelect.value : '';
          var selectedTask = null;
          if (selectedId) {
            selectedTask = Store.getTasks().filter(function (task) { return task.id === selectedId; })[0] || null;
          }
          Store.addSession({
            taskId: selectedTask ? selectedTask.id : null,
            taskTitle: selectedTask ? selectedTask.title : '',
            durationMinutes: duration,
            startedAt: new Date(Date.now() - duration * 60000).toISOString()
          });
        }
        renderFocusStats();
      }
    }
  }

  if (timerToggle) {
    timerToggle.addEventListener('click', function () {
      if (timerId) {
        stopTimer();
      } else {
        timerId = setInterval(tick, 1000);
        var text = timerToggle.querySelector('span');
        var icon = timerToggle.querySelector('use');
        if (text) text.textContent = 'Pause focus';
        if (icon) icon.setAttribute('href', '#i-pause');
        if (timerHint) timerHint.textContent = 'Stay with one task. You can do this.';
      }
    });
  }

  if (timerReset) {
    timerReset.addEventListener('click', function () {
      stopTimer();
      remaining = duration * 60;
      updateTimer();
    });
  }

  function applyDuration(minutes) {
    stopTimer();
    duration = minutes;
    remaining = minutes * 60;
    durationButtons.forEach(function (button) {
      var selected = Number(button.dataset.minutes) === minutes;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    updateTimer();
  }

  durationButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      var minutes = Number(button.dataset.minutes);
      if (Settings) Settings.set({ focusMinutes: minutes });
      else applyDuration(minutes);
    });
  });

  if (Settings) Settings.subscribe(function (value) { applyDuration(value.focusMinutes); renderFocusStats(); });

  // Focus insights derived from the sessions logged by this timer.
  function formatDuration(totalMinutes) {
    var minutes = Math.max(0, Math.round(totalMinutes));
    var hours = Math.floor(minutes / 60);
    var rest = minutes % 60;
    if (hours && rest) return hours + 'h ' + rest + 'm';
    if (hours) return hours + 'h';
    return rest + 'm';
  }

  function dateKey(value) {
    var d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function relativeDayLabel(key) {
    if (!key) return 'Earlier';
    var today = new Date();
    var yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (key === dateKey(today)) return 'Today';
    if (key === dateKey(yesterday)) return 'Yesterday';
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(key + 'T12:00:00'));
  }

  function timeLabel(value) {
    var d = new Date(value);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  }

  function renderFocusStats() {
    var sessions = Store.getSessions ? Store.getSessions() : [];
    var todayKey = dateKey(new Date());

    // Focus time today
    var todayMinutes = sessions.filter(function (session) { return dateKey(session.startedAt) === todayKey; })
      .reduce(function (sum, session) { return sum + Number(session.durationMinutes || 0); }, 0);
    var focusValue = document.getElementById('focus-stat-value');
    var focusNote = document.getElementById('focus-stat-note');
    if (focusValue) focusValue.textContent = formatDuration(todayMinutes);
    if (focusNote) focusNote.textContent = todayMinutes ? 'Logged today' : 'No sessions yet';

    // Consecutive-day streak (allow the streak to still count if today isn't over yet)
    var activeDays = {};
    sessions.forEach(function (session) { activeDays[dateKey(session.startedAt)] = true; });
    var cursor = new Date();
    if (!activeDays[todayKey]) cursor.setDate(cursor.getDate() - 1);
    var streak = 0;
    while (activeDays[dateKey(cursor)]) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    var streakValue = document.getElementById('streak-stat-value');
    var streakNote = document.getElementById('streak-stat-note');
    if (streakValue) streakValue.textContent = streak + (streak === 1 ? ' day' : ' days');
    if (streakNote) streakNote.textContent = streak ? (streak >= 7 ? 'Great consistency!' : 'Keep it going') : 'Start a session today';

    // Upcoming tasks today
    var nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    var upcoming = Store.getTasks().filter(function (task) {
      if (task.done || !Store.isToday(task)) return false;
      var match = /^(\d{1,2}):(\d{2})$/.exec(task.time || '');
      return match && (Number(match[1]) * 60 + Number(match[2])) >= nowMinutes;
    }).sort(function (a, b) { return a.time.localeCompare(b.time); });
    var upcomingValue = document.getElementById('upcoming-stat-value');
    var upcomingNote = document.getElementById('upcoming-stat-note');
    if (upcomingValue) upcomingValue.textContent = upcoming.length + (upcoming.length === 1 ? ' task' : ' tasks');
    if (upcomingNote) upcomingNote.textContent = upcoming.length ? 'Next at ' + upcoming[0].time : 'Nothing else today';

    // Weekly focus chart
    var weekStart = Settings && Settings.get().weekStart === 'sunday' ? 'sunday' : 'monday';
    var start = new Date();
    start.setHours(0, 0, 0, 0);
    var weekday = start.getDay();
    start.setDate(start.getDate() - (weekStart === 'sunday' ? weekday : (weekday + 6) % 7));
    var labels = weekStart === 'sunday'
      ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    var minutesByDay = [0, 0, 0, 0, 0, 0, 0];
    sessions.forEach(function (session) {
      var sessionDate = new Date(session.startedAt);
      if (isNaN(sessionDate.getTime())) return;
      sessionDate.setHours(0, 0, 0, 0);
      var diff = Math.round((sessionDate - start) / 86400000);
      if (diff >= 0 && diff < 7) minutesByDay[diff] += Number(session.durationMinutes || 0);
    });
    var maxMinutes = Math.max.apply(null, minutesByDay.concat([1]));
    var weekTotal = document.getElementById('week-total');
    if (weekTotal) weekTotal.textContent = formatDuration(minutesByDay.reduce(function (a, b) { return a + b; }, 0)) + ' total';
    var chart = document.getElementById('focus-chart');
    if (chart) {
      chart.innerHTML = minutesByDay.map(function (minutes, index) {
        var height = minutes ? Math.max(8, Math.round((minutes / maxMinutes) * 100)) : 0;
        var isToday = dateKey(new Date(start.getTime() + index * 86400000)) === todayKey;
        return '<div class="bar-col' + (isToday ? ' today' : '') + '">' +
          '<span class="bar" style="--h:' + height + '%"></span><small>' + labels[index] + '</small></div>';
      }).join('');
      chart.setAttribute('aria-label', 'Focus minutes this week: ' + labels.map(function (label, index) {
        return label + ' ' + minutesByDay[index];
      }).join(', '));
    }

    // Recent activity from completed tasks and focus sessions
    var activity = [];
    Store.getTasks().forEach(function (task) {
      if (task.done) {
        activity.push({
          at: task.createdAt || new Date().toISOString(),
          color: 'teal',
          label: '<strong>Completed</strong> ' + escapeHtml(task.title)
        });
      }
    });
    sessions.forEach(function (session) {
      activity.push({
        at: session.startedAt,
        color: 'blue',
        label: '<strong>Focus session</strong> ' + formatDuration(session.durationMinutes) +
          (session.taskTitle ? ' on ' + escapeHtml(session.taskTitle) : '')
      });
    });
    activity.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    var activityList = document.getElementById('activity-list');
    if (activityList) {
      activityList.innerHTML = activity.length
        ? activity.slice(0, 5).map(function (item) {
            return '<li><span class="activity-dot ' + item.color + '"></span><span>' + item.label +
              '<small>' + relativeDayLabel(dateKey(item.at)) + ', ' + timeLabel(item.at) + '</small></span></li>';
          }).join('')
        : '<li><span class="activity-dot teal"></span><span><strong>Nothing yet</strong> Complete a task or start a focus session.<small>Get started today</small></span></li>';
    }
  }

  var focusShortcut = document.getElementById('focus-shortcut');
  if (focusShortcut && timerToggle) {
    focusShortcut.addEventListener('click', function () {
      if (!timerId) timerToggle.click();
      if (timerRing && timerRing.scrollIntoView) timerRing.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
    });
  }

  // Sidebar
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

  // Placeholder actions until later checklist items are built
  document.querySelectorAll('[data-soon]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      showToast(link.dataset.soon);
    });
  });

  window.addEventListener('timewise:error', function (event) { showToast(event.detail); });

  // Initial state — react to changes made on the Tasks screen too
  Store.subscribe(function () { renderTasks(); renderFocusStats(); });
  renderTasks();
  renderFocusStats();
  updateTimer();
})();
