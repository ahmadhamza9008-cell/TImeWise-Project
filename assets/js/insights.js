/* TimeWise — insights screen. All metrics are derived from the shared task store. */

(function () {
  'use strict';

  var Store = window.TimeWiseStore;
  var Settings = window.TimeWiseSettings;
  var todayISO = Store.today();
  var range = 'all';
  var CIRCUMFERENCE = 2 * Math.PI * 46;

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

  function showToast(message) {
    var toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(function () { toast.classList.remove('show'); }, 2600);
  }

  function weekStartDate() {
    var today = parseISO(todayISO);
    var offset = Settings && Settings.get().weekStart === 'sunday' ? today.getDay() : (today.getDay() + 6) % 7;
    return new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
  }

  function inRange(task) {
    if (range === 'all') return true;
    if (!task.due) return false;
    if (range === 'month') {
      var due = parseISO(task.due);
      var now = parseISO(todayISO);
      return due.getFullYear() === now.getFullYear() && due.getMonth() === now.getMonth();
    }
    var start = weekStartDate();
    var end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return parseISO(task.due) >= start && parseISO(task.due) <= end;
  }

  function filteredTasks() {
    var search = document.getElementById('task-search');
    var query = search ? search.value.trim().toLowerCase() : '';
    return Store.getTasks().filter(function (task) {
      if (!inRange(task)) return false;
      if (!query) return true;
      return task.title.toLowerCase().indexOf(query) !== -1 ||
        (task.notes || '').toLowerCase().indexOf(query) !== -1 ||
        task.tag.toLowerCase().indexOf(query) !== -1;
    });
  }

  function formatMinutes(totalMinutes) {
    var minutes = Math.max(0, Math.round(totalMinutes));
    var hours = Math.floor(minutes / 60);
    var rest = minutes % 60;
    if (hours && rest) return hours + 'h ' + rest + 'm';
    if (hours) return hours + 'h';
    return rest + 'm';
  }

  function sessionDate(session) {
    var date = new Date(session.startedAt);
    return isNaN(date.getTime()) ? null : date;
  }

  function filteredSessions() {
    if (!Store.getSessions) return [];
    return Store.getSessions().filter(function (session) {
      var date = sessionDate(session);
      if (!date || range === 'all') return Boolean(date);
      if (range === 'month') {
        var now = parseISO(todayISO);
        return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
      }
      var start = weekStartDate();
      var end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
      return date >= start && date < end;
    });
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function renderStats(tasks) {
    var done = tasks.filter(function (task) { return task.done; }).length;
    var rate = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    setText('stat-total', String(tasks.length));
    setText('stat-done', String(done));
    setText('stat-rate', rate + '%');
    setText('stat-open', String(tasks.length - done));
    setText('stat-total-note', tasks.length ? 'Tracked tasks' : 'Nothing tracked yet');
    setText('stat-done-note', done ? 'Tasks completed' : 'Finish one to start');
    setText('stat-rate-note', rate >= 80 ? 'Great momentum' : rate >= 40 ? 'Steady progress' : 'Room to grow');
    setText('stat-open-note', tasks.length - done === 1 ? 'Open task' : 'Open tasks');
  }

  function renderDonut(tasks) {
    var done = tasks.filter(function (task) { return task.done; }).length;
    var rate = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    var value = document.getElementById('donut-value');
    if (value) {
      value.style.strokeDasharray = (rate / 100 * CIRCUMFERENCE).toFixed(2) + ' ' + CIRCUMFERENCE.toFixed(2);
    }
    setText('donut-percent', rate + '%');
    setText('legend-done', String(done));
    setText('legend-open', String(tasks.length - done));
  }

  function renderBarList(containerId, rows, className) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    var max = rows.reduce(function (highest, row) { return Math.max(highest, row.count); }, 0) || 1;
    rows.forEach(function (row) {
      var li = document.createElement('li');
      li.className = 'bar-row ' + className;
      li.innerHTML =
        '<div class="bar-row-head"><span>' + escapeHtml(row.label) + '</span><strong>' + row.count + '</strong></div>' +
        '<div class="bar-track"><span class="bar-fill" style="width:' + Math.round(row.count / max * 100) + '%"></span></div>';
      container.appendChild(li);
    });
    if (!rows.length) {
      var empty = document.createElement('li');
      empty.className = 'bar-row';
      empty.innerHTML = '<div class="bar-row-head"><span>No data in this range</span></div>';
      container.appendChild(empty);
    }
  }

  function renderPriority(tasks) {
    var labels = { high: 'High', medium: 'Medium', low: 'Low' };
    var rows = ['high', 'medium', 'low'].map(function (key) {
      return {
        label: labels[key],
        key: key,
        count: tasks.filter(function (task) { return task.priority === key; }).length
      };
    });
    renderBarList('priority-list', rows, 'priority');
    document.querySelectorAll('#priority-list .bar-row').forEach(function (row, index) {
      row.classList.add(rows[index].key);
    });
  }

  function renderWeekdays(tasks) {
    var chart = document.getElementById('weekday-chart');
    if (!chart) return;
    var start = weekStartDate();
    var sundayStart = Boolean(Settings && Settings.get().weekStart === 'sunday');
    var names = sundayStart
      ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    var counts = names.map(function (_, index) {
      var iso = toISO(new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
      return tasks.filter(function (task) { return task.due === iso; }).length;
    });
    var max = Math.max.apply(null, counts.concat([1]));
    chart.innerHTML = '';
    chart.setAttribute('aria-label', 'Tasks due this week: ' + names.map(function (name, index) {
      return name + ' ' + counts[index];
    }).join(', '));
    names.forEach(function (name, index) {
      var column = document.createElement('div');
      column.className = 'bar-col' + (toISO(new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)) === todayISO ? ' today' : '');
      column.innerHTML = '<span class="bar" style="--h:' + Math.round(counts[index] / max * 100) + '%"></span><small>' + name + '</small>';
      chart.appendChild(column);
    });
    setText('week-total', counts.reduce(function (sum, count) { return sum + count; }, 0) + ' tasks');
  }

  function renderTags(tasks) {
    var counts = {};
    tasks.forEach(function (task) { counts[task.tag] = (counts[task.tag] || 0) + 1; });
    var rows = Object.keys(counts).map(function (label) { return { label: label, count: counts[label] }; })
      .sort(function (a, b) { return b.count - a.count || a.label.localeCompare(b.label); })
      .slice(0, 5);
    renderBarList('tag-list', rows, 'tag');
  }

  function renderFocus(tasks) {
    var sessions = filteredSessions();
    var totalMinutes = sessions.reduce(function (sum, session) { return sum + Number(session.durationMinutes || 0); }, 0);
    setText('focus-total', formatMinutes(totalMinutes));
    setText('focus-sessions', String(sessions.length));
    setText('focus-average', formatMinutes(sessions.length ? totalMinutes / sessions.length : 0));

    var empty = document.getElementById('focus-empty');
    if (empty) empty.hidden = sessions.length !== 0;

    var minutesByTask = {};
    sessions.forEach(function (session) {
      var label = session.taskTitle || 'Unlinked session';
      minutesByTask[label] = (minutesByTask[label] || 0) + Number(session.durationMinutes || 0);
    });
    var rows = Object.keys(minutesByTask).map(function (label) {
      return { label: label, minutes: minutesByTask[label] };
    }).sort(function (a, b) { return b.minutes - a.minutes; }).slice(0, 5);
    var list = document.getElementById('focus-task-list');
    if (list) {
      list.innerHTML = rows.length
        ? rows.map(function (row) {
            var width = totalMinutes ? Math.round(row.minutes / totalMinutes * 100) : 0;
            return '<li class="bar-row"><div class="bar-row-head"><span>' + escapeHtml(row.label) +
              '</span><strong>' + formatMinutes(row.minutes) + '</strong></div>' +
              '<div class="bar-track"><span class="bar-fill" style="width:' + width + '%"></span></div></li>';
          }).join('')
        : '';
    }
    exportCsv.currentSessions = sessions;
  }

  function exportCsv(tasks) {
    if (!tasks.length && !(exportCsv.currentSessions || []).length) return showToast('Nothing to export in this range.');
    var columns = ['title', 'time', 'tag', 'priority', 'due', 'notes', 'done', 'subtasks', 'reminder_minutes', 'focus_minutes'];
    function cell(value) { return '"' + String(value).replace(/"/g, '""') + '"'; }
    var sessions = exportCsv.currentSessions || [];
    function focusFor(task) {
      return sessions.filter(function (session) { return session.taskId && session.taskId === task.id; })
        .reduce(function (sum, session) { return sum + Number(session.durationMinutes || 0); }, 0);
    }
    var lines = [columns.join(',')];
    tasks.forEach(function (task) {
      var values = columns.map(function (key) {
        if (key === 'subtasks') {
          return cell((task.subtasks || []).map(function (step) { return (step.done ? '[x] ' : '[ ] ') + step.title; }).join('; '));
        }
        if (key === 'focus_minutes') return cell(focusFor(task));
        return cell(task[key]);
      });
      lines.push(values.join(','));
    });
    var blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'timewise-tasks-' + todayISO + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Exported ' + tasks.length + ' tasks to CSV.');
  }

  function render() {
    var tasks = filteredTasks();
    var hasSessions = filteredSessions().length > 0;
    var empty = document.getElementById('insights-empty');
    var grid = document.querySelector('.insights-grid');
    if (empty) empty.hidden = tasks.length !== 0 || hasSessions;
    if (grid) grid.style.display = tasks.length || hasSessions ? 'grid' : 'none';
    renderStats(tasks);
    renderDonut(tasks);
    renderPriority(tasks);
    renderWeekdays(tasks);
    renderTags(tasks);
    renderFocus(tasks);
    exportCsv.currentTasks = tasks;
  }

  document.querySelectorAll('.insight-range button').forEach(function (button) {
    button.addEventListener('click', function () {
      range = button.dataset.range;
      document.querySelectorAll('.insight-range button').forEach(function (item) {
        var active = item === button;
        item.classList.toggle('active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      render();
    });
  });

  var search = document.getElementById('task-search');
  if (search) search.addEventListener('input', render);

  var exportButton = document.getElementById('export-btn');
  if (exportButton) exportButton.addEventListener('click', function () { exportCsv(exportCsv.currentTasks || []); });

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
  }
  if (menuBtn) menuBtn.addEventListener('click', function () { setSidebar(true); });
  if (closeBtn) closeBtn.addEventListener('click', function () { setSidebar(false); });
  if (overlay) overlay.addEventListener('click', function () { setSidebar(false); });
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape') setSidebar(false); });
  window.addEventListener('resize', function () { if (window.innerWidth > 860) setSidebar(false); });

  document.querySelectorAll('[data-soon]').forEach(function (link) {
    link.addEventListener('click', function (event) { event.preventDefault(); showToast(link.dataset.soon); });
  });
  window.addEventListener('timewise:error', function (event) { showToast(event.detail); });

  Store.subscribe(render);
  if (Settings) Settings.subscribe(render);
  render();
})();
