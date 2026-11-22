/* TimeWise — notification center. Shows real due/upcoming tasks from the shared store. */

(function () {
  'use strict';

  var Store = window.TimeWiseStore;
  var button = document.getElementById('notification-btn');
  if (!button || !Store) return;

  var panel = null;
  var list = null;
  var countLabel = null;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function toISO(date) {
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    return date.getFullYear() + '-' + month + '-' + day;
  }

  function minutes(time) {
    var match = /^(\d{1,2}):(\d{2})$/.exec(String(time || ''));
    if (!match) return null;
    var hours = Number(match[1]);
    var mins = Number(match[2]);
    if (hours > 23 || mins > 59) return null;
    return hours * 60 + mins;
  }

  function humanTime(value) {
    var total = minutes(value);
    if (total === null) return 'Anytime';
    var hours = Math.floor(total / 60);
    var mins = total % 60;
    return String(hours).padStart(2, '0') + ':' + String(mins).padStart(2, '0');
  }

  function buildItems() {
    var now = new Date();
    var nowMinutes = now.getHours() * 60 + now.getMinutes();
    var today = Store.today();
    var tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    var tomorrow = toISO(tomorrowDate);
    var items = [];

    Store.getTasks().forEach(function (task) {
      if (task.done || !task.due) return;
      // Snoozed tasks stay quiet until their snooze window is over.
      if (task.snoozedUntil && new Date(task.snoozedUntil) > now) return;
      var taskMinutes = minutes(task.time);

      if (task.due < today) {
        items.push({ task: task, kind: 'overdue', label: 'Overdue · ' + task.due, rank: 0, stamp: task.due + (task.time || '') });
      } else if (task.due === today) {
        if (taskMinutes === null) {
          items.push({ task: task, kind: 'later', label: 'Anytime today', rank: 2, stamp: '99:99' });
          return;
        }
        var diff = taskMinutes - nowMinutes;
        if (diff < 0) {
          items.push({ task: task, kind: 'overdue', label: 'Overdue by ' + (-diff) + ' min', rank: 0, stamp: task.time });
        } else if (diff <= 60) {
          items.push({ task: task, kind: 'soon', label: diff === 0 ? 'Due now' : 'Due in ' + diff + ' min', rank: 1, stamp: task.time });
        } else if (diff <= 240) {
          items.push({ task: task, kind: 'later', label: 'Today at ' + humanTime(task.time), rank: 2, stamp: task.time });
        }
      } else if (task.due === tomorrow) {
        items.push({ task: task, kind: 'later', label: 'Due tomorrow · ' + humanTime(task.time), rank: 3, stamp: task.due + task.time });
      }
    });

    items.sort(function (a, b) { return a.rank - b.rank || a.stamp.localeCompare(b.stamp); });
    return items.slice(0, 8);
  }

  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.className = 'notifications-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Notifications');
    panel.innerHTML =
      '<div class="notifications-head"><strong>Notifications</strong><span id="notification-count"></span></div>' +
      '<ul class="notifications-list" id="notifications-list"></ul>' +
      '<a class="notifications-foot" href="calendar.html">Open calendar</a>';
    var host = button.parentElement || document.body;
    host.appendChild(panel);
    list = panel.querySelector('#notifications-list');
    countLabel = panel.querySelector('#notification-count');
    list.addEventListener('click', function (event) {
      var snoozeButton = event.target.closest('.notification-snooze');
      if (!snoozeButton) return;
      event.preventDefault();
      Store.snoozeTask(snoozeButton.dataset.id, 60);
      render();
    });
    return panel;
  }

  function render() {
    ensurePanel();
    var items = buildItems();
    var dot = button.querySelector('.notification-dot');
    if (dot) dot.style.display = items.length ? '' : 'none';
    button.setAttribute('aria-label', 'Notifications' + (items.length ? ' (' + items.length + ')' : ''));
    if (countLabel) countLabel.textContent = items.length ? items.length + ' new' : 'All caught up';

    if (!list) return;
    if (!items.length) {
      list.innerHTML = '<li class="notifications-empty">You’re all caught up.</li>';
      return;
    }
    list.innerHTML = items.map(function (item) {
      var icon = item.kind === 'overdue' ? '!' : item.kind === 'soon' ? '◷' : '·';
      var safeTitle = escapeHtml(item.task.title);
      return '<li class="notification-row">' +
        '<a class="notification-item ' + item.kind + '" href="tasks.html">' +
          '<span class="notification-icon" aria-hidden="true">' + icon + '</span>' +
          '<span class="notification-body"><strong>' + safeTitle + '</strong>' +
          '<small>' + escapeHtml(item.label) + '</small></span></a>' +
        '<button class="notification-snooze" type="button" data-id="' + escapeHtml(item.task.id) +
          '" title="Snooze for 1 hour" aria-label="Snooze ' + safeTitle + ' for 1 hour">⏰</button>' +
      '</li>';
    }).join('');
  }

  button.addEventListener('click', function (event) {
    event.stopPropagation();
    ensurePanel();
    var open = panel.classList.toggle('is-open');
    button.setAttribute('aria-expanded', String(open));
    if (open) render();
  });

  document.addEventListener('click', function (event) {
    if (!panel || panel.contains(event.target) || button.contains(event.target)) return;
    panel.classList.remove('is-open');
    button.setAttribute('aria-expanded', 'false');
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && panel && panel.classList.contains('is-open')) {
      panel.classList.remove('is-open');
      button.setAttribute('aria-expanded', 'false');
      button.focus();
    }
  });

  Store.subscribe(render);
  render();
})();
