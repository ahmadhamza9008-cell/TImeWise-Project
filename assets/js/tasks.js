/* TimeWise — task management interactions (vanilla JavaScript).
   Uses the shared TimeWiseStore so the dashboard stays in sync. */

(function () {
  'use strict';

  function prefersReducedMotion() {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  var Store = window.TimeWiseStore;
  var Billing = window.TimeWiseBilling;
  var activeFilter = 'all';

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

  function tomorrowISO() {
    var date = new Date();
    date.setDate(date.getDate() + 1);
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    return date.getFullYear() + '-' + month + '-' + day;
  }

  function dueLabel(task) {
    if (!task.due) return 'No due date';
    if (task.due === Store.today()) return 'Today';
    if (task.due === tomorrowISO()) return 'Tomorrow';
    var formatted = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(task.due + 'T00:00:00'));
    return task.due < Store.today() ? 'Overdue · ' + formatted : formatted;
  }

  function priorityRank(priority) {
    return { high: 0, medium: 1, low: 2 }[priority] === undefined ? 3 : { high: 0, medium: 1, low: 2 }[priority];
  }

  var list = document.getElementById('task-list');
  var emptyState = document.getElementById('empty-state');
  var listCount = document.getElementById('list-count');
  var search = document.getElementById('task-search');
  var priorityFilter = document.getElementById('priority-filter');
  var sortSelect = document.getElementById('sort-tasks');

  function getVisibleTasks(all) {
    var query = search ? search.value.trim().toLowerCase() : '';
    var priority = priorityFilter ? priorityFilter.value : 'all';
    var sort = sortSelect ? sortSelect.value : 'manual';

    var visible = all.filter(function (task) {
      if (query && task.title.toLowerCase().indexOf(query) === -1 && (task.notes || '').toLowerCase().indexOf(query) === -1 && task.tag.toLowerCase().indexOf(query) === -1) return false;
      if (priority !== 'all' && task.priority !== priority) return false;
      if (activeFilter === 'today') return Store.isToday(task);
      if (activeFilter === 'upcoming') return !task.done && Boolean(task.due) && task.due > Store.today();
      if (activeFilter === 'completed') return task.done;
      return true;
    });

    if (sort === 'due') {
      visible.sort(function (a, b) {
        return (a.due || '9999-12-31').localeCompare(b.due || '9999-12-31') || (a.time || '').localeCompare(b.time || '');
      });
    } else if (sort === 'priority') {
      visible.sort(function (a, b) { return priorityRank(a.priority) - priorityRank(b.priority) || a.title.localeCompare(b.title); });
    } else if (sort === 'title') {
      visible.sort(function (a, b) { return a.title.localeCompare(b.title); });
    }
    return visible;
  }

  function renderList() {
    if (!list) return;
    var all = Store.getTasks();
    var visible = getVisibleTasks(all);

    list.innerHTML = '';
    visible.forEach(function (task) {
      var safeTitle = escapeHtml(task.title);
      var overdue = Boolean(task.due) && task.due < Store.today() && !task.done;
      var due = dueLabel(task) + (task.time && task.time !== 'Anytime' ? ' · ' + escapeHtml(task.time) : '');
      var repeat = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }[task.repeat];
      var doneSteps = (task.subtasks || []).filter(function (step) { return step.done; }).length;
      var snoozed = task.snoozedUntil && new Date(task.snoozedUntil) > new Date();
      var li = document.createElement('li');
      li.className = 'task-item task-row' + (task.done ? ' done' : '') + (overdue ? ' overdue' : '');
      li.dataset.id = task.id;
      li.innerHTML =
        '<button class="task-check" type="button" aria-pressed="' + task.done + '" aria-label="' +
          (task.done ? 'Mark as not done: ' : 'Mark as done: ') + safeTitle + '">' +
          '<svg class="icon" aria-hidden="true"><use href="#i-check"></use></svg>' +
        '</button>' +
        '<div class="task-main">' +
          '<span class="task-title">' + safeTitle + '</span>' +
          '<span class="task-meta">' +
            '<span class="priority-badge ' + escapeHtml(task.priority) + '">' + escapeHtml(task.priority) + '</span>' +
            '<time class="due-label' + (overdue ? ' overdue' : '') + '" datetime="' + escapeHtml(task.due) + '">' + escapeHtml(due) + '</time>' +
            '<span class="task-tag">' + escapeHtml(task.tag) + '</span>' +
            (repeat ? '<span class="repeat-badge" title="Repeats ' + repeat.toLowerCase() + '">↻ ' + repeat + '</span>' : '') +
            (snoozed ? '<span class="snooze-badge">Snoozed</span>' : '') +
            (task.subtasks && task.subtasks.length
              ? '<span class="subtask-progress">☑ ' + doneSteps + '/' + task.subtasks.length + '</span>'
              : '') +
          '</span>' +
          (task.subtasks && task.subtasks.length
            ? '<ul class="subtask-checklist">' + task.subtasks.map(function (step) {
                return '<li><button class="subtask-check' + (step.done ? ' done' : '') + '" type="button" data-subtask-id="' +
                  escapeHtml(step.id) + '" aria-pressed="' + step.done + '" aria-label="' +
                  (step.done ? 'Mark incomplete: ' : 'Mark complete: ') + escapeHtml(step.title) + '">' +
                  (step.done ? '✓' : '') + '</button><span>' + escapeHtml(step.title) + '</span></li>';
              }).join('') + '</ul>'
            : '') +
          (task.notes ? '<p class="task-notes">' + escapeHtml(task.notes) + '</p>' : '') +
        '</div>' +
        '<div class="task-actions">' +
          (!task.done ? '<button class="task-snooze" type="button" title="Snooze for 1 hour" aria-label="Snooze ' + safeTitle + ' for 1 hour">⏰</button>' : '') +
          '<button class="task-edit" type="button" aria-label="Edit ' + safeTitle + '">' +
            '<svg class="icon" aria-hidden="true"><use href="#i-edit"></use></svg>' +
          '</button>' +
          '<button class="task-delete" type="button" aria-label="Delete ' + safeTitle + '">' +
            '<svg class="icon" aria-hidden="true"><use href="#i-trash"></use></svg>' +
          '</button>' +
        '</div>';
      list.appendChild(li);
    });

    if (emptyState) {
      emptyState.hidden = visible.length !== 0;
      emptyState.textContent = activeFilter === 'completed' ? 'No completed tasks yet.' : 'No tasks match this view.';
    }
    if (listCount) listCount.textContent = 'Showing ' + visible.length + ' of ' + all.length;
  }

  function renderSummary() {
    var all = Store.getTasks();
    var done = all.filter(function (task) { return task.done; }).length;
    var open = all.length - done;
    var high = all.filter(function (task) { return task.priority === 'high' && !task.done; }).length;
    var percent = all.length ? Math.round((done / all.length) * 100) : 0;
    var set = function (id, value) { var el = document.getElementById(id); if (el) el.textContent = String(value); };

    set('summary-open', open);
    set('summary-done', done);
    set('summary-high', high);

    var fill = document.getElementById('progress-fill');
    if (fill) fill.style.width = percent + '%';

    var caption = document.getElementById('summary-caption');
    if (caption) {
      caption.textContent = all.length === 0
        ? 'No tasks yet — add your first one.'
        : percent === 100 ? 'Everything is done. Great work!' : percent + '% complete · ' + open + ' task' + (open === 1 ? '' : 's') + ' to go.';
    }
    set('side-open-count', open);
  }

  function render() {
    renderList();
    renderSummary();
  }

  if (list) {
    list.addEventListener('click', function (event) {
      var item = event.target.closest('.task-item');
      if (!item) return;
      var id = item.dataset.id;
      var task = Store.getTasks().filter(function (entry) { return entry.id === id; })[0];

      if (event.target.closest('.task-check')) {
        Store.toggleTask(id);
      } else if (event.target.closest('.subtask-check')) {
        Store.toggleSubtask(id, event.target.closest('.subtask-check').dataset.subtaskId);
      } else if (event.target.closest('.task-snooze')) {
        Store.snoozeTask(id, 60);
        showToast('Snoozed for 1 hour.');
      } else if (event.target.closest('.task-delete')) {
        Store.deleteTask(id);
        if (editingId === id) resetForm();
        showToast('Task deleted.');
      } else if (event.target.closest('.task-edit') && task) {
        startEdit(task);
      }
    });
  }

  // Filters, search and sorting
  document.querySelectorAll('.filter-tabs button').forEach(function (button) {
    button.setAttribute('aria-pressed', String(button.classList.contains('active')));
    button.addEventListener('click', function () {
      document.querySelectorAll('.filter-tabs button').forEach(function (other) {
        other.classList.remove('active');
        other.setAttribute('aria-pressed', 'false');
      });
      button.classList.add('active');
      button.setAttribute('aria-pressed', 'true');
      activeFilter = button.dataset.filter;
      render();
    });
  });
  if (search) search.addEventListener('input', render);
  if (priorityFilter) priorityFilter.addEventListener('change', render);
  if (sortSelect) sortSelect.addEventListener('change', render);

  // Add / edit form
  var form = document.getElementById('task-form');
  var titleInput = document.getElementById('task-title');
  var formError = document.getElementById('form-error');
  var formTitle = document.getElementById('form-title');
  var formSubtitle = document.getElementById('form-subtitle');
  var submitButton = document.getElementById('submit-task');
  var cancelButton = document.getElementById('cancel-edit');
  var subtaskEditor = document.getElementById('subtask-editor');
  var addSubtaskButton = document.getElementById('add-subtask');
  var editingId = null;

  function addSubtaskRow(title, id, done) {
    if (!subtaskEditor) return;
    var row = document.createElement('div');
    row.className = 'subtask-input-row';
    row.dataset.subtaskId = id || '';
    row.dataset.done = done ? 'true' : 'false';
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'subtask-title';
    input.placeholder = 'Step description';
    input.setAttribute('aria-label', 'Subtask description');
    input.value = title || '';
    var remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'subtask-remove';
    remove.textContent = '×';
    remove.setAttribute('aria-label', 'Remove step');
    row.appendChild(input);
    row.appendChild(remove);
    subtaskEditor.appendChild(row);
  }

  function renderSubtaskRows(items) {
    if (!subtaskEditor) return;
    subtaskEditor.innerHTML = '';
    (items && items.length ? items : [{}]).forEach(function (item) {
      addSubtaskRow(item.title, item.id, item.done);
    });
  }

  function collectSubtasks() {
    if (!subtaskEditor) return [];
    return Array.prototype.map.call(subtaskEditor.querySelectorAll('.subtask-input-row'), function (row) {
      var input = row.querySelector('.subtask-title');
      return {
        id: row.dataset.subtaskId || 's' + Date.now() + Math.random().toString(36).slice(2, 6),
        title: input ? input.value.trim() : '',
        done: row.dataset.done === 'true'
      };
    }).filter(function (item) { return item.title; });
  }

  if (addSubtaskButton) {
    addSubtaskButton.addEventListener('click', function () {
      if (Billing && Billing.checkSubtaskCreation) {
        var stepCheck = Billing.checkSubtaskCreation(collectSubtasks().length);
        if (!stepCheck.allowed) {
          showToast(stepCheck.message);
          return;
        }
      }
      addSubtaskRow('');
      var rows = subtaskEditor.querySelectorAll('.subtask-title');
      if (rows.length) rows[rows.length - 1].focus();
    });
  }
  if (subtaskEditor) {
    subtaskEditor.addEventListener('click', function (event) {
      if (event.target.closest('.subtask-remove')) {
        var row = event.target.closest('.subtask-input-row');
        if (row) row.remove();
        if (!subtaskEditor.children.length) addSubtaskRow('');
      }
    });
  }

  function resetForm() {
    if (form) form.reset();
    editingId = null;
    if (formError) formError.textContent = '';
    if (formTitle) formTitle.textContent = 'Add a task';
    if (formSubtitle) formSubtitle.textContent = 'Capture it now, sort it later.';
    if (submitButton) submitButton.textContent = 'Add task';
    if (cancelButton) cancelButton.hidden = true;
    renderSubtaskRows([]);
  }

  function startEdit(task) {
    if (!form) return;
    editingId = task.id;
    titleInput.value = task.title;
    document.getElementById('task-priority').value = task.priority;
    document.getElementById('task-due').value = task.due || '';
    document.getElementById('task-time').value = task.time === 'Anytime' ? '' : task.time;
    document.getElementById('task-tag').value = task.tag;
    document.getElementById('task-repeat').value = task.repeat || 'none';
    document.getElementById('task-reminder').value = String(task.reminderMinutes === undefined ? 10 : task.reminderMinutes);
    document.getElementById('task-notes').value = task.notes || '';
    renderSubtaskRows(task.subtasks || []);
    if (formError) formError.textContent = '';
    if (formTitle) formTitle.textContent = 'Edit task';
    if (formSubtitle) formSubtitle.textContent = 'Update the details below.';
    if (submitButton) submitButton.textContent = 'Save changes';
    if (cancelButton) cancelButton.hidden = false;
    titleInput.focus();
    if (form && form.scrollIntoView) form.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
  }

  if (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var title = titleInput.value.trim();
      if (!title) {
        if (formError) formError.textContent = 'Give your task a name.';
        titleInput.focus();
        return;
      }

      var data = {
        title: title,
        priority: document.getElementById('task-priority').value,
        due: document.getElementById('task-due').value,
        time: document.getElementById('task-time').value.trim() || 'Anytime',
        tag: document.getElementById('task-tag').value,
        repeat: document.getElementById('task-repeat').value,
        reminderMinutes: Number(document.getElementById('task-reminder').value),
        subtasks: collectSubtasks(),
        notes: document.getElementById('task-notes').value.trim()
      };

      if (editingId) {
        Store.updateTask(editingId, data);
        showToast('Task updated.');
      } else {
        if (Billing && Billing.checkTaskCreation) {
          var activeCount = Store.getTasks().filter(function (task) { return !task.done; }).length;
          var taskCheck = Billing.checkTaskCreation(activeCount);
          if (!taskCheck.allowed) {
            if (formError) formError.textContent = taskCheck.message;
            showToast(taskCheck.message);
            return;
          }
        }
        Store.addTask(data);
        showToast('Task added.');
      }
      resetForm();
    });
  }

  if (cancelButton) cancelButton.addEventListener('click', resetForm);

  var newTaskButton = document.getElementById('new-task-btn');
  if (newTaskButton && titleInput) {
    newTaskButton.addEventListener('click', function () {
      if (editingId) resetForm();
      titleInput.focus();
    });
  }

  // Clear completed — two-step confirmation avoids an accidental delete
  var clearButton = document.getElementById('clear-completed');
  var clearArmed = false;
  var clearTimer;
  if (clearButton) {
    clearButton.addEventListener('click', function () {
      if (!clearArmed) {
        clearArmed = true;
        clearButton.textContent = 'Click again to confirm';
        clearTimeout(clearTimer);
        clearTimer = setTimeout(function () {
          clearArmed = false;
          clearButton.textContent = 'Clear completed';
        }, 3500);
        return;
      }
      var removed = Store.clearCompleted();
      clearArmed = false;
      clearButton.textContent = 'Clear completed';
      showToast(removed + ' completed task' + (removed === 1 ? '' : 's') + ' cleared.');
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
  window.addEventListener('resize', function () {
    if (window.innerWidth > 860) setSidebar(false);
    else if (sidebar && 'inert' in sidebar) sidebar.inert = !sidebar.classList.contains('is-open');
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    setSidebar(false);
    if (editingId) resetForm();
  });

  document.querySelectorAll('[data-soon]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      showToast(link.dataset.soon);
    });
  });

  window.addEventListener('timewise:error', function (event) { showToast(event.detail); });

  // Initial state
  renderSubtaskRows([]);
  Store.subscribe(render);
  render();
})();
