/* TimeWise store unit tests — no dependencies, run with: node tests/store.test.js */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const STORE_PATH = path.join(__dirname, '..', 'assets', 'js', 'store.js');

function makeStorage(initial) {
  const data = Object.assign({}, initial || {});
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: (key) => { delete data[key]; },
    clear: () => { Object.keys(data).forEach((key) => delete data[key]); },
    _data: data
  };
}

function createStore(storage) {
  const sandbox = {
    localStorage: storage || makeStorage(),
    console,
    Date,
    Math,
    JSON,
    Promise,
    String,
    Number,
    Object,
    Array,
    Boolean,
    RegExp,
    Intl,
    CustomEvent: function CustomEvent(type, options) {
      this.type = type;
      this.detail = options && options.detail;
    }
  };
  sandbox.window = {
    dispatchEvent: () => true,
    addEventListener: () => {}
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(STORE_PATH, 'utf8'), sandbox, { filename: STORE_PATH });
  return { store: sandbox.window.TimeWiseStore, storage: sandbox.localStorage, env: sandbox };
}

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
  }
}

test('seeds five demo tasks with one completed', () => {
  const { store } = createStore();
  const tasks = store.getTasks();
  assert.strictEqual(tasks.length, 5);
  assert.strictEqual(tasks.filter((task) => task.done).length, 1);
});

test('isToday includes undated and today tasks only', () => {
  const { store } = createStore();
  const today = store.today();
  assert.strictEqual(store.isToday({ due: '' }), true);
  assert.strictEqual(store.isToday({ due: today }), true);
  assert.strictEqual(store.isToday({ due: '2000-01-01' }), false);
});

test('addTask inserts at the top and persists', () => {
  const { store, storage } = createStore();
  const before = store.getTasks().length;
  const added = store.addTask({ title: 'Write tests', priority: 'high' });
  assert.strictEqual(store.getTasks().length, before + 1);
  assert.strictEqual(store.getTasks()[0].title, 'Write tests');
  assert.strictEqual(store.getTasks()[0].priority, 'high');
  assert.ok(storage.getItem('timewise_tasks'));
  assert.strictEqual(added.done, false);
});

test('toggleTask flips completion state', () => {
  const { store } = createStore();
  const id = store.getTasks()[1].id;
  const before = store.getTasks().find((task) => task.id === id).done;
  store.toggleTask(id);
  assert.strictEqual(store.getTasks().find((task) => task.id === id).done, !before);
});

test('updateTask patches fields without losing others', () => {
  const { store } = createStore();
  const id = store.getTasks()[1].id;
  const original = store.getTasks().find((task) => task.id === id);
  store.updateTask(id, { title: 'Renamed task' });
  const updated = store.getTasks().find((task) => task.id === id);
  assert.strictEqual(updated.title, 'Renamed task');
  assert.strictEqual(updated.tag, original.tag);
});

test('deleteTask removes only the requested task', () => {
  const { store } = createStore();
  const id = store.getTasks()[0].id;
  const before = store.getTasks().length;
  store.deleteTask(id);
  assert.strictEqual(store.getTasks().length, before - 1);
  assert.strictEqual(store.getTasks().some((task) => task.id === id), false);
});

test('clearCompleted removes done tasks and reports the count', () => {
  const { store } = createStore();
  const removed = store.clearCompleted();
  assert.strictEqual(removed, 1);
  assert.strictEqual(store.getTasks().some((task) => task.done), false);
});

test('subscribers are notified after a mutation', () => {
  const { store } = createStore();
  let calls = 0;
  const unsubscribe = store.subscribe(() => { calls++; });
  store.addTask({ title: 'Notify me' });
  assert.strictEqual(calls, 1);
  unsubscribe();
  store.addTask({ title: 'Do not notify' });
  assert.strictEqual(calls, 1);
});

test('legacy dashboard storage is migrated', () => {
  const legacy = JSON.stringify([
    { id: 'old-1', title: 'Old task', time: '09:00', tag: 'Admin', done: false }
  ]);
  const { store, storage } = createStore(makeStorage({ timewise_dashboard_tasks: legacy }));
  assert.strictEqual(store.getTasks().length, 1);
  assert.strictEqual(store.getTasks()[0].title, 'Old task');
  store.toggleTask('old-1');
  assert.ok(storage.getItem('timewise_tasks'));
  assert.strictEqual(storage.getItem('timewise_dashboard_tasks'), null);
});

test('malformed stored data falls back to defaults', () => {
  const { store } = createStore(makeStorage({ timewise_tasks: '{not json' }));
  assert.strictEqual(store.getTasks().length, 5);
});

function iso(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

test('tasks default to not repeating', () => {
  const { store } = createStore();
  assert.strictEqual(store.addTask({ title: 'One off' }).repeat, 'none');
});

test('recurring tasks without a due date start today', () => {
  const { store } = createStore();
  assert.strictEqual(store.addTask({ title: 'Daily habit', repeat: 'daily' }).due, iso(0));
});

test('completing a daily task advances it one day and keeps it open', () => {
  const { store } = createStore();
  const task = store.addTask({ title: 'Standup', repeat: 'daily', due: iso(0), time: '09:00' });
  store.toggleTask(task.id);
  const updated = store.getTasks().find((item) => item.id === task.id);
  assert.strictEqual(updated.done, false);
  assert.strictEqual(updated.due, iso(1));
});

test('weekly recurrence advances seven days', () => {
  const { store } = createStore();
  const task = store.addTask({ title: 'Review', repeat: 'weekly', due: iso(0) });
  store.toggleTask(task.id);
  assert.strictEqual(store.getTasks().find((item) => item.id === task.id).due, iso(7));
});

test('monthly recurrence clamps to the last day of short months', () => {
  const { store } = createStore();
  const task = store.addTask({ title: 'Rent', repeat: 'monthly', due: '2027-01-31' });
  store.toggleTask(task.id);
  assert.strictEqual(store.getTasks().find((item) => item.id === task.id).due, '2027-02-28');
});

test('new tasks get enhancement defaults', () => {
  const { store } = createStore();
  const task = store.addTask({ title: 'Enhanced' });
  assert.strictEqual(task.subtasks.length, 0);
  assert.strictEqual(task.reminderMinutes, 10);
  assert.strictEqual(task.snoozedUntil, null);
});

test('invalid reminder values fall back to 10 minutes', () => {
  const { store } = createStore();
  assert.strictEqual(store.addTask({ title: 'Bad lead', reminderMinutes: 12 }).reminderMinutes, 10);
  assert.strictEqual(store.addTask({ title: 'Zero lead', reminderMinutes: 0 }).reminderMinutes, 0);
});

test('stored subtasks and reminder values are normalized', () => {
  const raw = JSON.stringify([{
    id: 'legacy-1', title: 'Legacy', due: '',
    subtasks: [{ title: 'Step A', done: 1 }],
    reminderMinutes: 45
  }]);
  const { store } = createStore(makeStorage({ timewise_tasks: raw }));
  const task = store.getTasks()[0];
  assert.strictEqual(task.subtasks.length, 1);
  assert.strictEqual(task.subtasks[0].done, true);
  assert.ok(task.subtasks[0].id);
  assert.strictEqual(task.reminderMinutes, 10);
});

test('getTasks returns independent subtask copies', () => {
  const { store } = createStore();
  const first = store.getTasks()[0];
  first.subtasks.push({ id: 'x', title: 'Nope', done: false });
  assert.strictEqual(store.getTasks()[0].subtasks.length, 0);
});

test('toggleSubtask flips only the requested step', () => {
  const { store } = createStore();
  const task = store.addTask({
    title: 'Checklist',
    subtasks: [{ id: 'a', title: 'One', done: false }, { id: 'b', title: 'Two', done: false }]
  });
  store.toggleSubtask(task.id, 'a');
  const steps = store.getTasks().find((item) => item.id === task.id).subtasks;
  assert.strictEqual(steps[0].done, true);
  assert.strictEqual(steps[1].done, false);
});

test('snoozeTask sets a future timestamp', () => {
  const { store } = createStore();
  const task = store.addTask({ title: 'Snooze me' });
  store.snoozeTask(task.id, 60);
  const until = new Date(store.getTasks().find((item) => item.id === task.id).snoozedUntil);
  assert.ok(until.getTime() > Date.now());
});

test('reorderTasks persists planOrder', () => {
  const { store, storage } = createStore();
  const tasks = store.getTasks();
  const ids = [tasks[2].id, tasks[0].id, tasks[1].id].concat(tasks.slice(3).map((item) => item.id));
  store.reorderTasks(ids);
  const reordered = store.getTasks();
  assert.strictEqual(reordered[0].id, ids[0]);
  assert.strictEqual(reordered[0].planOrder, 0);
  assert.strictEqual(reordered[1].planOrder, 1);
  assert.ok(JSON.parse(storage.getItem('timewise_tasks')).some((item) => item.planOrder === 1));
});

test('focus sessions are added, listed, and persisted', () => {
  const { store, storage } = createStore();
  assert.strictEqual(store.getSessions().length, 0);
  const session = store.addSession({ taskTitle: 'Deep work', durationMinutes: 25 });
  assert.strictEqual(store.getSessions().length, 1);
  assert.strictEqual(store.getSessions()[0].id, session.id);
  assert.strictEqual(store.getSessions()[0].durationMinutes, 25);
  assert.ok(JSON.parse(storage.getItem('timewise_focus_sessions')).length === 1);
});

test('a reminder value of -1 means never remind', () => {
  const { store } = createStore();
  assert.strictEqual(store.addTask({ title: 'No alerts', reminderMinutes: -1 }).reminderMinutes, -1);
});

test('exportData includes tasks, sessions and settings', () => {
  const { store, env } = createStore();
  env.window.TimeWiseSettings = { get: () => ({ name: 'Ada', timezone: 'Africa/Lagos', mutedTags: ['Admin'] }) };
  store.addTask({ title: 'Backed up', subtasks: [{ id: 's1', title: 'Step', done: true }] });
  store.addSession({ taskTitle: 'Focus', durationMinutes: 50 });
  const data = store.exportData();
  assert.strictEqual(data.app, 'TimeWise');
  assert.strictEqual(data.version, 1);
  assert.ok(data.exportedAt);
  assert.strictEqual(data.tasks.length, 6);
  assert.strictEqual(data.tasks[0].subtasks[0].title, 'Step');
  assert.strictEqual(data.sessions.length, 1);
  assert.strictEqual(data.settings.name, 'Ada');
});

test('importData merge keeps existing tasks and adds missing ones', () => {
  const { store } = createStore();
  const before = store.getTasks().length;
  const backup = {
    tasks: [{ id: 'restored-1', title: 'Restored', due: '', time: '09:00' }],
    sessions: [{ id: 'restored-session', taskTitle: 'Old focus', durationMinutes: 25 }]
  };
  const result = store.importData(backup, 'merge');
  assert.strictEqual(result.tasks, before + 1);
  assert.strictEqual(store.getTasks().length, before + 1);
  assert.strictEqual(store.getSessions().length, 1);
  assert.ok(store.getTasks().some((task) => task.title === 'Restored'));
});

test('importData replace overwrites current data', () => {
  const { store } = createStore();
  const backup = { tasks: [{ id: 'only', title: 'Only task', due: '' }], sessions: [] };
  const result = store.importData(backup, 'replace');
  assert.strictEqual(result.tasks, 1);
  assert.deepStrictEqual(store.getTasks().map((task) => task.title), ['Only task']);
});

test('importData rejects invalid files', () => {
  const { store } = createStore();
  assert.throws(() => store.importData(null, 'merge'), /not a TimeWise backup/);
  assert.throws(() => store.importData({ sessions: [] }, 'merge'), /not a TimeWise backup/);
});

test('setUser namespaces cached data by account', () => {
  const initial = { 'timewise_tasks': JSON.stringify([{ id: 'mine', title: 'My task', due: '' }]) };
  const { store, storage } = createStore(makeStorage(initial));
  assert.strictEqual(store.getTasks()[0].title, 'My task');
  store.setUser('user-123');
  assert.strictEqual(store.getTasks().length, 0);
  store.addTask({ title: 'Account task' });
  assert.ok(storage.getItem('timewise_tasks:user-123'));
  store.setUser(null);
  assert.strictEqual(store.getTasks()[0].title, 'My task');
  assert.ok(storage.getItem('timewise_tasks'));
});

const failed = results.filter((result) => !result.ok);
results.forEach((result) => {
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}${result.ok ? '' : ' — ' + result.error}`);
});
console.log(`\n${results.length - failed.length}/${results.length} store tests passed.`);
process.exit(failed.length ? 1 : 0);
