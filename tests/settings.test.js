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
    JSON
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(SETTINGS_PATH, 'utf8'), sandbox, { filename: SETTINGS_PATH });
  return { settings: sandbox.window.TimeWiseSettings, storage: sandbox.localStorage };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
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
  assert.deepStrictEqual(plain(settings.get()), { name: 'Friend', focusMinutes: 25, weekStart: 'monday', theme: 'light' });
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
  assert.deepStrictEqual(plain(settings.get()), { name: 'Friend', focusMinutes: 25, weekStart: 'monday', theme: 'light' });
});

test('reset restores defaults and notifies', () => {
  const { settings } = createSettings();
  let calls = 0;
  settings.subscribe(() => { calls++; });
  settings.set({ name: 'Someone Else', focusMinutes: 50, weekStart: 'sunday', theme: 'dark' });
  settings.reset();
  assert.strictEqual(calls, 2);
  assert.deepStrictEqual(plain(settings.get()), { name: 'Friend', focusMinutes: 25, weekStart: 'monday', theme: 'light' });
});

const failed = results.filter((result) => !result.ok);
results.forEach((result) => {
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}${result.ok ? '' : ' — ' + result.error}`);
});
console.log(`\n${results.length - failed.length}/${results.length} settings tests passed.`);
process.exit(failed.length ? 1 : 0);
