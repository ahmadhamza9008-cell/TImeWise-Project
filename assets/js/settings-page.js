/* TimeWise — settings screen behavior. */

(function () {
  'use strict';

  var Settings = window.TimeWiseSettings;
  var Store = window.TimeWiseStore;
  var Backend = window.TimeWiseBackend;
  var todayISO = Store.today();

  var toast = document.getElementById('toast');
  var toastTimer;
  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 2600);
  }

  function initials(name) {
    return String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2)
      .map(function (part) { return part.charAt(0).toUpperCase(); }).join('') || 'A';
  }

  // Profile
  var nameInput = document.getElementById('profile-name');
  var avatarPreview = document.getElementById('avatar-preview');
  var profileForm = document.getElementById('profile-form');

  function renderProfile(value) {
    if (nameInput && document.activeElement !== nameInput) nameInput.value = value.name;
    if (avatarPreview) avatarPreview.textContent = initials(value.name);
  }

  if (Settings) {
    Settings.subscribe(renderProfile);
    renderProfile(Settings.get());
  }

  if (profileForm && nameInput) {
    profileForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var name = nameInput.value.trim();
      if (!name) return showToast('Enter a display name.');
      if (Settings) Settings.set({ name: name });
      showToast('Profile updated.');
    });
  }

  // Preferences
  var focusInputs = document.querySelectorAll('input[name="focus"]');
  var themeInputs = document.querySelectorAll('input[name="theme"]');
  var weekSelect = document.getElementById('week-start');

  function renderPreferences(value) {
    focusInputs.forEach(function (input) { input.checked = Number(input.value) === value.focusMinutes; });
    themeInputs.forEach(function (input) { input.checked = input.value === value.theme; });
    if (weekSelect) weekSelect.value = value.weekStart;
  }

  if (Settings) {
    Settings.subscribe(renderPreferences);
    renderPreferences(Settings.get());
  }

  focusInputs.forEach(function (input) {
    input.addEventListener('change', function () {
      if (input.checked && Settings) Settings.set({ focusMinutes: Number(input.value) });
    });
  });
  themeInputs.forEach(function (input) {
    input.addEventListener('change', function () {
      if (input.checked && Settings) Settings.set({ theme: input.value });
    });
  });
  if (weekSelect && Settings) {
    weekSelect.addEventListener('change', function () { Settings.set({ weekStart: weekSelect.value }); });
  }

  // Data
  var dataCount = document.getElementById('data-count');
  function renderDataCount() {
    var count = Store.getTasks().length;
    if (dataCount) dataCount.textContent = count + (count === 1 ? ' task' : ' tasks');
  }
  Store.subscribe(renderDataCount);
  renderDataCount();

  function exportCsv() {
    var tasks = Store.getTasks();
    if (!tasks.length) return showToast('No tasks to export.');
    var columns = ['title', 'time', 'tag', 'priority', 'due', 'notes', 'done', 'subtasks', 'reminder_minutes', 'focus_minutes'];
    function cell(value) { return '"' + String(value).replace(/"/g, '""') + '"'; }
    var sessions = Store.getSessions ? Store.getSessions() : [];
    function focusFor(task) {
      return sessions.filter(function (session) { return session.taskId && session.taskId === task.id; })
        .reduce(function (sum, session) { return sum + Number(session.durationMinutes || 0); }, 0);
    }
    var lines = [columns.join(',')];
    tasks.forEach(function (task) {
      lines.push(columns.map(function (key) {
        if (key === 'subtasks') {
          return cell((task.subtasks || []).map(function (step) { return (step.done ? '[x] ' : '[ ] ') + step.title; }).join('; '));
        }
        if (key === 'focus_minutes') return cell(focusFor(task));
        return cell(task[key]);
      }).join(','));
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
  var exportButton = document.getElementById('export-btn');
  if (exportButton) exportButton.addEventListener('click', exportCsv);

  function armButton(button, label, action) {
    var original = button.innerHTML;
    var timer;
    button.addEventListener('click', function () {
      if (button.dataset.armed === '1') {
        clearTimeout(timer);
        button.dataset.armed = '';
        button.innerHTML = original;
        action();
        return;
      }
      button.dataset.armed = '1';
      button.textContent = label;
      timer = setTimeout(function () {
        button.dataset.armed = '';
        button.innerHTML = original;
      }, 4000);
    });
  }

  var clearButton = document.getElementById('clear-completed-btn');
  if (clearButton) {
    armButton(clearButton, 'Click again to confirm', function () {
      var removed = Store.clearCompleted();
      showToast(removed ? 'Removed ' + removed + ' completed task' + (removed === 1 ? '' : 's') + '.' : 'No completed tasks to remove.');
    });
  }

  var resetButton = document.getElementById('reset-data-btn');
  if (resetButton) {
    armButton(resetButton, 'Click again to reset', function () {
      try {
        localStorage.removeItem('timewise_tasks');
        localStorage.removeItem('timewise_dashboard_tasks');
        localStorage.removeItem('timewise_focus_sessions');
      } catch (e) { /* storage unavailable */ }
      window.location.reload();
    });
  }

  // Account
  var connectionText = document.getElementById('connection-text');
  var settingsSignOut = document.getElementById('settings-sign-out');

  if (Backend && Backend.getSession) {
    Backend.getSession().then(function (session) {
      if (connectionText) {
        connectionText.textContent = session && session.user && session.user.email
          ? 'Signed in as ' + session.user.email + '. Tasks sync with Supabase.'
          : 'Local demo — tasks are saved on this device. Add Supabase credentials to sync across devices.';
      }
      if (settingsSignOut) settingsSignOut.hidden = !session;
    }).catch(function () {
      if (connectionText) connectionText.textContent = 'Connection unavailable. Using local demo mode.';
    });
    if (settingsSignOut) {
      settingsSignOut.addEventListener('click', function () {
        Backend.signOut().then(function () { window.location.href = 'index.html'; });
      });
    }
  } else if (connectionText) {
    connectionText.textContent = 'Local demo — tasks are saved on this device.';
  }

  // Settings search — filter the panels by their visible text
  var settingsSearch = document.getElementById('settings-search');
  var settingsGrid = document.querySelector('.settings-grid');
  if (settingsSearch && settingsGrid) {
    var panels = Array.prototype.slice.call(settingsGrid.querySelectorAll('.panel'));
    var emptyNote = document.createElement('p');
    emptyNote.className = 'settings-search-empty';
    emptyNote.textContent = 'No settings match that search.';
    emptyNote.hidden = true;
    settingsGrid.appendChild(emptyNote);

    settingsSearch.addEventListener('input', function () {
      var query = settingsSearch.value.trim().toLowerCase();
      var matches = 0;
      panels.forEach(function (panel) {
        var visible = !query || panel.textContent.toLowerCase().indexOf(query) !== -1;
        panel.hidden = !visible;
        if (visible) matches++;
      });
      emptyNote.hidden = matches > 0;
    });
  }

  // Web Push controls (Settings only)
  if (window.TimeWisePush) window.TimeWisePush.init();

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

  window.addEventListener('timewise:error', function (event) { showToast(event.detail); });
})();
