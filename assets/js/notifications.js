/* TimeWise — notification center. Shows real due/upcoming tasks from the shared store. */

(function () {
  'use strict';

  var Store = window.TimeWiseStore;
  var Settings = window.TimeWiseSettings;
  var button = document.getElementById('notification-btn');
  if (!button || !Store) return;

  var panel = null;
  var list = null;
  var countLabel = null;
  var live = null;

  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'notifications-panel');

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function announce(message) {
    if (!live) {
      live = document.createElement('div');
      live.className = 'sr-only';
      live.setAttribute('aria-live', 'polite');
      document.body.appendChild(live);
    }
    live.textContent = '';
    live.textContent = message;
  }

  // Evaluate "now" in the account's chosen time zone so the bell agrees with
  // the schedule shown on other devices and with the push reminder job.
  function nowInfo() {
    var zone = (Settings && Settings.get().timezone) || 'UTC';
    try {
      var parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      }).formatToParts(new Date());
      var value = function (type) {
        var found = parts.filter(function (part) { return part.type === type; })[0];
        return found ? found.value : '';
      };
      return {
        date: value('year') + '-' + value('month') + '-' + value('day'),
        minutes: Number(value('hour')) * 60 + Number(value('minute'))
      };
    } catch (e) {
      var now = new Date();
      var month = String(now.getMonth() + 1).padStart(2, '0');
      var day = String(now.getDate()).padStart(2, '0');
      return {
        date: now.getFullYear() + '-' + month + '-' + day,
        minutes: now.getHours() * 60 + now.getMinutes()
      };
    }
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
    var now = nowInfo();
    var nowMinutes = now.minutes;
    var muted = new Set((Settings && Settings.get().mutedTags) || []);
    var items = [];

    Store.getTasks().forEach(function (task) {
      if (task.done || !task.due) return;
      if (task.tag && muted.has(task.tag)) return;
      // Snoozed tasks stay quiet until their snooze window is over.
      if (task.snoozedUntil && new Date(task.snoozedUntil) > new Date()) return;
      var taskMinutes = minutes(task.time);
      var lead = Number(task.reminderMinutes);

      if (task.due < now.date) {
        items.push({ task: task, kind: 'overdue', label: 'Overdue · ' + task.due, rank: 0, stamp: task.due + (task.time || '') });
      } else if (task.due === now.date) {
        if (taskMinutes === null) {
          items.push({ task: task, kind: 'later', label: 'Anytime today', rank: 2, stamp: '99:99' });
          return;
        }
        var diff = taskMinutes - nowMinutes;
        if (diff < 0) {
          items.push({ task: task, kind: 'overdue', label: 'Overdue by ' + (-diff) + ' min', rank: 0, stamp: task.time });
        } else if (diff <= lead) {
          items.push({ task: task, kind: 'soon', label: diff === 0 ? 'Due now' : 'Due in ' + diff + ' min', rank: 1, stamp: task.time });
        } else if (diff <= 240) {
          items.push({ task: task, kind: 'later', label: 'Today at ' + humanTime(task.time), rank: 2, stamp: task.time });
        }
      } else if (task.due > now.date && task.due <= nextDate(now.date, 1)) {
        items.push({ task: task, kind: 'later', label: 'Due tomorrow · ' + humanTime(task.time), rank: 3, stamp: task.due + task.time });
      }
    });

    items.sort(function (a, b) { return a.rank - b.rank || a.stamp.localeCompare(b.stamp); });
    return items.slice(0, 8);
  }

  function nextDate(iso, days) {
    var date = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + days));
    return date.toISOString().slice(0, 10);
  }

  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.className = 'notifications-panel';
    panel.id = 'notifications-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'notifications-heading');
    panel.innerHTML =
      '<div class="notifications-head"><strong id="notifications-heading">Notifications</strong>' +
      '<button class="icon-btn" id="notifications-close" type="button" aria-label="Close notifications">✕</button>' +
      '<span id="notification-count"></span></div>' +
      '<ul class="notifications-list" id="notifications-list"></ul>' +
      '<a class="notifications-foot" href="calendar.html">Open calendar</a>';
    var host = button.parentElement || document.body;
    host.appendChild(panel);
    list = panel.querySelector('#notifications-list');
    countLabel = panel.querySelector('#notification-count');
    panel.querySelector('#notifications-close').addEventListener('click', closePanel);
    list.addEventListener('click', function (event) {
      var snoozeButton = event.target.closest('.notification-snooze');
      if (!snoozeButton) return;
      event.preventDefault();
      var title = snoozeButton.getAttribute('data-title') || 'Task';
      Store.snoozeTask(snoozeButton.dataset.id, 60);
      announce(title + ' snoozed for one hour.');
      render();
      var next = list.querySelector('.notification-snooze');
      if (next) next.focus();
    });
    panel.hidden = true;
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
          '" data-title="' + safeTitle + '" title="Snooze for 1 hour" aria-label="Snooze ' + safeTitle + ' for 1 hour">⏰</button>' +
      '</li>';
    }).join('');
  }

  function closePanel() {
    if (!panel) return;
    panel.classList.remove('is-open');
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  }

  button.addEventListener('click', function (event) {
    event.stopPropagation();
    ensurePanel();
    var open = !panel.classList.contains('is-open');
    panel.classList.toggle('is-open', open);
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) {
      render();
      var first = panel.querySelector('#notifications-close');
      if (first) first.focus();
    }
  });

  document.addEventListener('click', function (event) {
    if (!panel || panel.hidden || panel.contains(event.target) || button.contains(event.target)) return;
    closePanel();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && panel && panel.classList.contains('is-open')) {
      closePanel();
      button.focus();
    }
  });

  Store.subscribe(render);
  render();
})();
