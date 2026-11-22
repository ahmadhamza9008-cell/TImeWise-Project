/* TimeWise — shared task store.
   Synchronous local cache for the UI, with optional Supabase sync in the background.
   Supabase becomes the source of truth once a user is signed in. */

window.TimeWiseStore = (function () {
  'use strict';

  var KEY = 'timewise_tasks';
  var LEGACY_KEY = 'timewise_dashboard_tasks';
  var SESSIONS_KEY = 'timewise_focus_sessions';
  var REPEAT_VALUES = ['none', 'daily', 'weekly', 'monthly'];
  var REMINDER_VALUES = [-1, 0, 5, 10, 15, 30, 60]; // -1 = never remind
  var Backend = window.TimeWiseBackend;

  // "Today" follows the account's chosen IANA time zone so every device and
  // the reminder job agree on the calendar day.
  function zoneToday() {
    try {
      var Settings = window.TimeWiseSettings;
      var zone = (Settings && Settings.get().timezone) || 'UTC';
      if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
        var parts = new Intl.DateTimeFormat('en-GB', {
          timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(new Date());
        var value = function (type) {
          var found = parts.filter(function (part) { return part.type === type; })[0];
          return found ? found.value : '';
        };
        return value('year') + '-' + value('month') + '-' + value('day');
      }
    } catch (e) { /* fall back to browser local date */ }
    return dateToISO(new Date());
  }

  function isoDate(offsetDays) {
    var base = zoneToday();
    var date = new Date(Date.UTC(
      Number(base.slice(0, 4)), Number(base.slice(5, 7)) - 1,
      Number(base.slice(8, 10)) + (offsetDays || 0)
    ));
    return date.toISOString().slice(0, 10);
  }

  function dateToISO(date) {
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    return date.getFullYear() + '-' + month + '-' + day;
  }

  function parseISODate(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    var year = Number(match[1]);
    var month = Number(match[2]) - 1;
    var day = Number(match[3]);
    var date = new Date(year, month, day);
    if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
    return date;
  }

  function nextDueFor(task) {
    var today = parseISODate(isoDate(0));
    var base = parseISODate(task.due);
    if (!base || (today && base < today)) base = today || new Date();
    var repeat = String(task.repeat || 'none');

    if (repeat === 'daily') {
      base.setDate(base.getDate() + 1);
    } else if (repeat === 'weekly') {
      base.setDate(base.getDate() + 7);
    } else if (repeat === 'monthly') {
      var day = base.getDate();
      var nextMonth = new Date(base.getFullYear(), base.getMonth() + 1, 1);
      var lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
      nextMonth.setDate(Math.min(day, lastDay));
      base = nextMonth;
    }
    return dateToISO(base);
  }

  function defaults() {
    return [
      { id: 'seed-1', title: 'Review sprint notes', time: '09:00', tag: 'Deep work', priority: 'high', due: isoDate(0), notes: '', done: true, createdAt: new Date().toISOString() },
      { id: 'seed-2', title: 'Draft project proposal', time: '10:30', tag: 'Deep work', priority: 'high', due: isoDate(0), notes: 'Focus on scope and timeline.', done: false, createdAt: new Date().toISOString() },
      { id: 'seed-3', title: 'Design review', time: '13:00', tag: 'Meeting', priority: 'medium', due: isoDate(0), notes: '', done: false, createdAt: new Date().toISOString() },
      { id: 'seed-4', title: 'Inbox & admin', time: '15:30', tag: 'Admin', priority: 'low', due: isoDate(0), notes: '', done: false, createdAt: new Date().toISOString() },
      { id: 'seed-5', title: 'Prepare notes for next week', time: 'Anytime', tag: 'Personal', priority: 'medium', due: isoDate(1), notes: '', done: false, createdAt: new Date().toISOString() }
    ];
  }

  function normalize(task) {
    return {
      id: task.id || 'seed-' + Date.now(),
      title: task.title || 'Untitled task',
      time: task.time || 'Anytime',
      tag: task.tag || 'Personal',
      priority: task.priority || 'medium',
      due: task.due || '',
      notes: task.notes || '',
      repeat: REPEAT_VALUES.indexOf(String(task.repeat || 'none')) !== -1 ? String(task.repeat || 'none') : 'none',
      subtasks: Array.isArray(task.subtasks) ? task.subtasks.map(function (item) {
        return { id: item.id || 's' + Date.now() + Math.random().toString(36).slice(2, 6), title: String(item.title || 'Untitled step'), done: Boolean(item.done) };
      }) : [],
      planOrder: Number.isFinite(Number(task.planOrder)) ? Number(task.planOrder) : null,
      reminderMinutes: REMINDER_VALUES.indexOf(Number(task.reminderMinutes)) !== -1 ? Number(task.reminderMinutes) : 10,
      snoozedUntil: task.snoozedUntil || null,
      done: Boolean(task.done),
      createdAt: task.createdAt || new Date().toISOString()
    };
  }

  function normalizeSession(session) {
    return {
      id: session.id || 'f' + Date.now() + Math.random().toString(36).slice(2, 6),
      taskId: session.taskId || null,
      taskTitle: session.taskTitle || '',
      durationMinutes: Number(session.durationMinutes) > 0 ? Number(session.durationMinutes) : 25,
      startedAt: session.startedAt || new Date().toISOString()
    };
  }

  function loadLocal() {
    try {
      var raw = localStorage.getItem(keyFor(KEY)) || localStorage.getItem(keyFor(LEGACY_KEY));
      if (!raw) return currentUserId ? [] : defaults().map(normalize);
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(normalize);
    } catch (e) { /* fall through */ }
    return currentUserId ? [] : defaults().map(normalize);
  }

  var currentUserId = null;
  var tasks = loadLocal();
  var sessions = loadSessions();
  var listeners = [];
  var remoteReady = false;
  var syncing = false;

  // Storage is namespaced by account so one signed-in user can never see
  // another user's cached data on a shared browser.
  function keyFor(base) {
    return currentUserId ? base + ':' + currentUserId : base;
  }

  function persistLocal() {
    try {
      localStorage.setItem(keyFor(KEY), JSON.stringify(tasks));
      localStorage.removeItem(keyFor(LEGACY_KEY));
    } catch (e) { /* storage unavailable */ }
  }

  function loadSessions() {
    try {
      var raw = localStorage.getItem(keyFor(SESSIONS_KEY));
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(normalizeSession) : [];
    } catch (e) {
      return [];
    }
  }

  function persistSessions() {
    try { localStorage.setItem(keyFor(SESSIONS_KEY), JSON.stringify(sessions)); } catch (e) { /* storage unavailable */ }
  }

  function emit() {
    listeners.forEach(function (listener) {
      try { listener(getTasks()); } catch (e) { /* keep other listeners alive */ }
    });
  }

  function reportError(message) {
    window.dispatchEvent(new CustomEvent('timewise:error', { detail: String(message) }));
  }

  function getTasks() {
    return tasks.map(function (task) {
      return Object.assign({}, task, { subtasks: task.subtasks.map(function (item) { return Object.assign({}, item); }) });
    });
  }

  function getSessions() {
    return sessions.map(function (session) { return Object.assign({}, session); });
  }

  function applyRemote(remote) {
    tasks = remote.map(normalize);
    remoteReady = true;
    persistLocal();
    emit();
  }

  function migrateLocalToRemote() {
    var local = tasks.slice();
    var created = [];
    return local.reduce(function (chain, task) {
      return chain.then(function () {
        return Backend.insertTask(task).then(function (row) { if (row) created.push(row); });
      });
    }, Promise.resolve()).then(function () {
      return Backend.fetchTasks();
    }).then(function (remote) {
      if (remote && remote.length) applyRemote(remote);
      else if (created.length) applyRemote(created);
    });
  }

  function syncFromRemote() {
    if (!Backend || syncing) return Promise.resolve();
    syncing = true;
    return Backend.fetchTasks()
      .then(function (remote) {
        if (remote === null) return;
        if (remote.length === 0 && tasks.length) return migrateLocalToRemote();
        applyRemote(remote);
      })
      .then(function () {
        if (!Backend.fetchSessions) return;
        return Backend.fetchSessions().then(function (remote) {
          if (!remote) return;
          if (!remote.length && sessions.length) {
            sessions.forEach(function (session) {
              Backend.insertSession(session).catch(function () { /* keep local session */ });
            });
            return;
          }
          sessions = remote.map(normalizeSession);
          persistSessions();
          emit();
        });
      })
      .catch(function (error) { reportError('Could not sync tasks: ' + error.message); })
      .then(function () { syncing = false; });
  }

  function afterMutation(promise) {
    persistLocal();
    emit();
    if (remoteReady && Backend && promise) {
      Promise.resolve(promise)
        .then(function (row) {
          if (row && row.id) {
            tasks = tasks.map(function (task) { return task.id === row.id ? normalize(row) : task; });
            persistLocal();
            emit();
          }
        })
        .catch(function (error) { reportError('Could not save change: ' + error.message); });
    }
  }

  function addTask(data) {
    var task = normalize(Object.assign({}, data, { done: false }));
    if (task.repeat !== 'none' && !task.due) task.due = isoDate(0);
    task.id = 't' + Date.now() + Math.random().toString(36).slice(2, 6);
    tasks.unshift(task);
    persistLocal();
    emit();

    if (remoteReady && Backend) {
      Backend.insertTask(task).then(function (row) {
        if (!row) return;
        tasks = tasks.map(function (item) { return item.id === task.id ? normalize(row) : item; });
        persistLocal();
        emit();
      }).catch(function (error) { reportError('Could not save task: ' + error.message); });
    }
    return Object.assign({}, task);
  }

  function updateTask(id, patch) {
    var updated = null;
    tasks = tasks.map(function (task) {
      if (task.id !== id) return task;
      updated = normalize(Object.assign({}, task, patch, { id: id }));
      return updated;
    });
    if (!updated) return;
    var remote = remoteReady && Backend ? Backend.updateTask(id, updated) : null;
    afterMutation(remote);
  }

  function deleteTask(id) {
    tasks = tasks.filter(function (task) { return task.id !== id; });
    var remote = remoteReady && Backend ? Backend.deleteTask(id) : null;
    afterMutation(remote);
  }

  function toggleTask(id) {
    var updated = null;
    tasks = tasks.map(function (task) {
      if (task.id !== id) return task;
      if (!task.done && task.repeat && task.repeat !== 'none') {
        // A completed recurring task stays open and moves to its next occurrence.
        updated = Object.assign({}, task, { done: false, due: nextDueFor(task) });
      } else {
        updated = Object.assign({}, task, { done: !task.done });
      }
      return updated;
    });
    if (!updated) return;
    var remote = remoteReady && Backend ? Backend.updateTask(id, updated) : null;
    afterMutation(remote);
  }

  function clearCompleted() {
    var removed = tasks.filter(function (task) { return task.done; }).length;
    tasks = tasks.filter(function (task) { return !task.done; });
    var remote = remoteReady && Backend ? Backend.clearCompleted() : null;
    afterMutation(remote);
    return removed;
  }

  function reorderTasks(orderedIds) {
    var byId = {};
    tasks.forEach(function (task) { byId[task.id] = task; });
    var next = [];
    orderedIds.forEach(function (id) {
      if (byId[id] && !next.some(function (item) { return item.id === id; })) {
        next.push(Object.assign({}, byId[id], { planOrder: next.length }));
      }
    });
    // Keep any tasks the caller didn't include (e.g. filtered-out rows) at the end.
    tasks.forEach(function (task) {
      if (!next.some(function (item) { return item.id === task.id; })) {
        next.push(Object.assign({}, task, { planOrder: next.length }));
      }
    });
    tasks = next;
    persistLocal();
    emit();
    if (remoteReady && Backend) {
      tasks.forEach(function (task) {
        // The backend update replaces the whole row, so pass the full task here.
        Backend.updateTask(task.id, task).catch(function () { /* keep local order */ });
      });
    }
  }

  function toggleSubtask(taskId, subtaskId) {
    var updated = null;
    tasks = tasks.map(function (task) {
      if (task.id !== taskId) return task;
      var subtasks = task.subtasks.map(function (item) {
        return item.id === subtaskId ? Object.assign({}, item, { done: !item.done }) : item;
      });
      updated = Object.assign({}, task, { subtasks: subtasks });
      return updated;
    });
    if (!updated) return;
    var remote = remoteReady && Backend ? Backend.updateTask(taskId, updated) : null;
    afterMutation(remote);
  }

  function snoozeTask(id, minutes) {
    var until = new Date();
    until.setMinutes(until.getMinutes() + (Number(minutes) || 60));
    updateTask(id, { snoozedUntil: until.toISOString() });
  }

  function addSession(data) {
    var session = normalizeSession(Object.assign({}, data, { startedAt: data.startedAt || new Date().toISOString() }));
    sessions.unshift(session);
    persistSessions();
    emit();
    if (remoteReady && Backend && Backend.insertSession) {
      Backend.insertSession(session).then(function (row) {
        if (!row || !row.id) return;
        sessions = sessions.map(function (item) { return item.id === session.id ? normalizeSession(row) : item; });
        persistSessions();
        emit();
      }).catch(function (error) { reportError('Could not save focus session: ' + error.message); });
    }
    return Object.assign({}, session);
  }

  // Full, lossless backup payload (tasks, subtasks, focus sessions, settings).
  function exportData() {
    var Settings = window.TimeWiseSettings;
    return {
      app: 'TimeWise',
      version: 1,
      exportedAt: new Date().toISOString(),
      tasks: getTasks(),
      sessions: getSessions(),
      settings: Settings ? Settings.get() : null
    };
  }

  // Restore from a backup. mode 'replace' overwrites current data; 'merge'
  // adds anything missing while keeping existing rows.
  function importData(payload, mode) {
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.tasks)) {
      throw new Error('That file is not a TimeWise backup.');
    }
    var incomingTasks = payload.tasks.map(normalize);
    var incomingSessions = Array.isArray(payload.sessions)
      ? payload.sessions.map(normalizeSession) : [];
    var previousTaskIds = tasks.map(function (task) { return task.id; });

    if (mode === 'replace') {
      tasks = incomingTasks;
      sessions = incomingSessions;
    } else {
      var taskIds = {};
      tasks = tasks.concat(incomingTasks).filter(function (task) {
        if (taskIds[task.id]) return false;
        taskIds[task.id] = true;
        return true;
      });
      var sessionIds = {};
      sessions = sessions.concat(incomingSessions).filter(function (session) {
        if (sessionIds[session.id]) return false;
        sessionIds[session.id] = true;
        return true;
      });
    }

    persistLocal();
    persistSessions();
    emit();

    // Mirror the restore into Supabase so other devices see it too.
    if (remoteReady && Backend) {
      if (mode === 'replace') {
        previousTaskIds.forEach(function (id) {
          if (!tasks.some(function (task) { return task.id === id; })) {
            Backend.deleteTask(id).catch(function () { /* keep local row */ });
          }
        });
      }
      tasks.forEach(function (task) {
        var write = isUuid(task.id)
          ? Backend.updateTask(task.id, task)
          : Backend.insertTask(task);
        Promise.resolve(write).catch(function () { /* keep local row */ });
      });
      if (Backend.insertSession) {
        sessions.forEach(function (session) {
          Promise.resolve(Backend.insertSession(session)).catch(function () { /* keep local row */ });
        });
      }
    }
    return { tasks: tasks.length, sessions: sessions.length };
  }

  function subscribe(listener) {
    listeners.push(listener);
    return function () {
      listeners = listeners.filter(function (item) { return item !== listener; });
    };
  }

  var syncStartedFor = null;

  function setUser(userId) {
    if (userId === currentUserId) return;
    currentUserId = userId;
    remoteReady = false;
    if (userId !== syncStartedFor) syncStartedFor = null;
    tasks = loadLocal();
    sessions = loadSessions();
    emit();
  }

  // Realtime can emit a burst of events for a single bulk update (e.g. a
  // reorder). Debounce so we refetch once instead of once per row.
  var syncTimer = null;
  function debouncedSync() {
    if (typeof setTimeout === 'undefined') return syncFromRemote();
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () { syncFromRemote(); }, 250);
  }

  function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value));
  }

  function startSync(session) {
    if (!session || !session.user || syncStartedFor === session.user.id) return;
    syncStartedFor = session.user.id;
    setUser(session.user.id);
    syncFromRemote();
    Backend.subscribeTasks(debouncedSync);
  }

  // React to authentication changes
  if (Backend) {
    if (Backend.onAuthChange) {
      Backend.onAuthChange(function (session) {
        if (session && session.user) startSync(session);
        else {
          setUser(null);
          syncStartedFor = null;
          remoteReady = false;
        }
      });
    }

    Backend.getSession().then(function (session) {
      if (session && session.user) startSync(session);
    });
  }

  // Refetch when the tab becomes visible so another device's changes still
  // appear if the realtime socket was dropped.
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('focus', function () {
      if (remoteReady && Backend) syncFromRemote();
    });
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden && remoteReady && Backend) syncFromRemote();
      });
    }
  }

  return {
    getTasks: getTasks,
    addTask: addTask,
    updateTask: updateTask,
    deleteTask: deleteTask,
    toggleTask: toggleTask,
    toggleSubtask: toggleSubtask,
    snoozeTask: snoozeTask,
    reorderTasks: reorderTasks,
    getSessions: getSessions,
    addSession: addSession,
    clearCompleted: clearCompleted,
    exportData: exportData,
    importData: importData,
    setUser: setUser,
    subscribe: subscribe,
    today: function () { return isoDate(0); },
    isToday: function (task) { return !task.due || task.due === isoDate(0); }
  };
})();
