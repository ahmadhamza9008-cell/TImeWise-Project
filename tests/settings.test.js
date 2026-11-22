/* TimeWise settings unit tests — run with: node tests/settings.test.js */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SETTINGS_PATH = path.join(__dirname, '..', 'assets', 'js', 'settings.js');

function makeStorage(initial) {
  const data = Object.assign({}, initial || {});
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: (key) => { delete data[key]; }
  };
}

function createSettings(storage) {
  const sandbox = {
    localStorage: storage || makeStorage(),
    console,
    Date,
    String,
    Number,
    Object,
    JSON,
    Intl
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(SETTINGS_PATH, 'utf8'), sandbox, { filename: SETTINGS_PATH });
  return { settings: sandbox.window.TimeWiseSettings, storage: sandbox.localStorage };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaults() {
  return {
    name: 'Friend',
    focusMinutes: 25,
    weekStart: 'monday',
    theme: 'light',
    timezone: new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    pushEnabled: true,
    quietStart: '',
    quietEnd: '',
    mutedTags: []
  };
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

test('provides sensible defaults', () => {
  const { settings } = createSettings();
  assert.deepStrictEqual(plain(settings.get()), defaults());
});

test('set persists and notifies subscribers', () => {
  const { settings, storage } = createSettings();
  let calls = 0;
  settings.subscribe(() => { calls++; });
  settings.set({ name: 'Sam Lee', focusMinutes: 50, weekStart: 'sunday', theme: 'dark' });
  assert.strictEqual(calls, 1);
  assert.strictEqual(settings.get().name, 'Sam Lee');
  assert.strictEqual(settings.get().theme, 'dark');
  assert.strictEqual(JSON.parse(storage.getItem('timewise_settings')).focusMinutes, 50);
});

test('unchanged values do not notify', () => {
  const { settings } = createSettings();
  let calls = 0;
  settings.subscribe(() => { calls++; });
  settings.set({ focusMinutes: 25 });
  assert.strictEqual(calls, 0);
});

test('invalid values fall back to defaults', () => {
  const { settings } = createSettings(makeStorage({ timewise_settings: '{"focusMinutes":99,"weekStart":"friday","name":"","theme":"neon"}' }));
  assert.strictEqual(settings.get().focusMinutes, 25);
  assert.strictEqual(settings.get().weekStart, 'monday');
  assert.strictEqual(settings.get().name, 'Friend');
  assert.strictEqual(settings.get().theme, 'light');
});

test('malformed storage falls back to defaults', () => {
  const { settings } = createSettings(makeStorage({ timewise_settings: '{bad json' }));
  assert.deepStrictEqual(plain(settings.get()), defaults());
});

test('reset restores defaults and notifies', () => {
  const { settings } = createSettings();
  let calls = 0;
  settings.subscribe(() => { calls++; });
  settings.set({ name: 'Someone Else', focusMinutes: 50, weekStart: 'sunday', theme: 'dark' });
  settings.reset();
  assert.strictEqual(calls, 2);
  assert.deepStrictEqual(plain(settings.get()), defaults());
});

test('notification preferences normalize', () => {
  const { settings } = createSettings();
  settings.set({
    timezone: 'Africa/Lagos',
    pushEnabled: false,
    quietStart: '22:00',
    quietEnd: '07:00',
    mutedTags: ['Meeting', 'Admin']
  });
  const value = settings.get();
  assert.strictEqual(value.timezone, 'Africa/Lagos');
  assert.strictEqual(value.pushEnabled, false);
  assert.strictEqual(value.quietStart, '22:00');
  assert.strictEqual(value.quietEnd, '07:00');
  assert.deepStrictEqual(value.mutedTags, ['Meeting', 'Admin']);
});

test('invalid timezone and quiet hours are rejected', () => {
  const { settings } = createSettings();
  settings.set({ timezone: 'Mars/Olympus', quietStart: '25:99', quietEnd: null, mutedTags: 'Meeting' });
  const value = settings.get();
  assert.strictEqual(value.timezone, defaults().timezone);
  assert.strictEqual(value.quietStart, '');
  assert.strictEqual(value.quietEnd, '');
  assert.deepStrictEqual(plain(value.mutedTags), []);
});

test('array changes notify subscribers', () => {
  const { settings } = createSettings();
  let calls = 0;
  settings.subscribe(() => { calls++; });
  settings.set({ mutedTags: ['Work'] });
  assert.strictEqual(calls, 1);
  settings.set({ mutedTags: ['Work'] });
  assert.strictEqual(calls, 1);
});

test('applyRemote hydrates without changing identity', () => {
  const { settings } = createSettings();
  settings.applyRemote({ name: 'Synced', timezone: 'Asia/Tokyo', mutedTags: ['Focus'] });
  assert.strictEqual(settings.get().name, 'Synced');
  assert.strictEqual(settings.get().timezone, 'Asia/Tokyo');
  assert.deepStrictEqual(settings.get().mutedTags, ['Focus']);
});

const failed = results.filter((result) => !result.ok);
results.forEach((result) => {
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}${result.ok ? '' : ' — ' + result.error}`);
});
console.log(`\n${results.length - failed.length}/${results.length} settings tests passed.`);
process.exit(failed.length ? 1 : 0);
