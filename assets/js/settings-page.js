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

  // Time zone — offer every zone the browser knows, then the current value.
  var timezoneInput = document.getElementById('timezone');
  var timezoneOptions = document.getElementById('timezone-options');
  if (timezoneOptions && typeof Intl !== 'undefined' && Intl.supportedValuesOf) {
    try {
      Intl.supportedValuesOf('timeZone').forEach(function (zone) {
        var option = document.createElement('option');
        option.value = zone;
        timezoneOptions.appendChild(option);
      });
    } catch (e) { /* older browser — free text still works */ }
  }

  var pushEnabledInput = document.getElementById('push-enabled');
  var quietEnabledInput = document.getElementById('quiet-enabled');
  var quietStartInput = document.getElementById('quiet-start');
  var quietEndInput = document.getElementById('quiet-end');
  var mutedTagsInput = document.getElementById('muted-tags');

  function renderNotificationPrefs(value) {
    if (timezoneInput && document.activeElement !== timezoneInput) timezoneInput.value = value.timezone;
    if (pushEnabledInput) pushEnabledInput.checked = value.pushEnabled !== false;
    var quietOn = Boolean(value.quietStart && value.quietEnd);
    if (quietEnabledInput) quietEnabledInput.checked = quietOn;
    if (quietStartInput) quietStartInput.value = value.quietStart || '';
    if (quietEndInput) quietEndInput.value = value.quietEnd || '';
    if (mutedTagsInput && document.activeElement !== mutedTagsInput) {
      mutedTagsInput.value = (value.mutedTags || []).join(', ');
    }
  }

  function saveNotificationPrefs() {
    if (!Settings) return;
    var quietOn = quietEnabledInput && quietEnabledInput.checked;
    Settings.set({
      timezone: timezoneInput ? timezoneInput.value.trim() : '',
      pushEnabled: pushEnabledInput ? pushEnabledInput.checked : true,
      quietStart: quietOn && quietStartInput ? quietStartInput.value : '',
      quietEnd: quietOn && quietEndInput ? quietEndInput.value : '',
      mutedTags: mutedTagsInput
        ? mutedTagsInput.value.split(',').map(function (tag) { return tag.trim(); }).filter(Boolean)
        : []
    });
  }

  if (Settings) {
    Settings.subscribe(renderNotificationPrefs);
    renderNotificationPrefs(Settings.get());
    [timezoneInput, pushEnabledInput, quietEnabledInput, quietStartInput, quietEndInput, mutedTagsInput]
      .forEach(function (input) {
        if (input) input.addEventListener('change', saveNotificationPrefs);
      });
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

  // Full JSON backup — tasks, subtasks, focus sessions and preferences.
  var exportJsonButton = document.getElementById('export-json-btn');
  if (exportJsonButton) {
    exportJsonButton.addEventListener('click', function () {
      var data = Store.exportData ? Store.exportData() : { tasks: Store.getTasks(), sessions: Store.getSessions() };
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'timewise-backup-' + todayISO + '.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('Backup exported with ' + data.tasks.length + ' tasks and ' + data.sessions.length + ' focus sessions.');
    });
  }

  var importButton = document.getElementById('import-btn');
  var importFile = document.getElementById('import-file');
  var importMode = document.getElementById('import-mode');
  if (importButton && importFile) {
    importButton.addEventListener('click', function () { importFile.click(); });
    importFile.addEventListener('change', function () {
      var file = importFile.files && importFile.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var payload;
        try {
          payload = JSON.parse(String(reader.result));
        } catch (e) {
          showToast('That file is not valid JSON.');
          return;
        }
        var mode = importMode && importMode.value === 'replace' ? 'replace' : 'merge';
        try {
          if (!Store.importData) throw new Error('Restore is unavailable in this build.');
          var result = Store.importData(payload, mode);
          if (payload.settings && Settings) Settings.applyRemote(payload.settings);
          showToast('Restored ' + result.tasks + ' tasks and ' + result.sessions + ' focus sessions.');
        } catch (e) {
          showToast('Restore failed: ' + e.message);
        }
      };
      reader.onerror = function () { showToast('Could not read that file.'); };
      reader.readAsText(file);
      importFile.value = '';
    });
  }

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

  window.addEventListener('timewise:error', function (event) { showToast(event.detail); });
})();
