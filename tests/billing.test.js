/* TimeWise billing unit tests — no dependencies: node tests/billing.test.js */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BILLING_PATH = path.join(__dirname, '..', 'assets', 'js', 'billing.js');

function makeStorage(initial) {
  const data = Object.assign({}, initial || {});
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: (key) => { delete data[key]; },
    _data: data
  };
}

function createBilling(options) {
  const opts = options || {};
  const storage = makeStorage(opts.storage);
  const calls = [];
  const navigated = [];
  let authCallback = null;
  let signedIn = opts.session !== null;

  const backend = {
    isConfigured: () => opts.backendConfigured !== false,
    getSession: () => Promise.resolve(opts.session === undefined
      ? { user: { id: 'user-1' } }
      : opts.session),
    getSubscription: () => {
      if (!signedIn) return Promise.resolve(null);
      return opts.subscriptionError
        ? Promise.reject(new Error(opts.subscriptionError))
        : Promise.resolve(opts.subscription || null);
    },
    invokeFunction: (name, body) => {
      calls.push({ name, body });
      return Promise.resolve({ url: 'https://checkout.paystack.test/session' });
    },
    onAuthChange: (callback) => { authCallback = callback; },
    _auth: (session) => {
      signedIn = Boolean(session && session.user);
      if (authCallback) authCallback(session);
    }
  };

  const sandbox = {
    localStorage: storage,
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
    setTimeout,
    clearTimeout,
    CustomEvent: function CustomEvent(type, options) {
      this.type = type;
      this.detail = options && options.detail;
    }
  };
  sandbox.window = {
    addEventListener: () => {},
    dispatchEvent: () => true,
    location: { assign: (url) => navigated.push(url) },
    TimeWiseConfig: {
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'sb_publishable_example_key_with_length',
      paystackPublicKey: opts.paystackKey === undefined ? 'pk_test_example' : opts.paystackKey
    },
    TimeWiseBackend: backend
  };
  if (opts.store) sandbox.window.TimeWiseStore = opts.store;

  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(BILLING_PATH, 'utf8'), sandbox, { filename: BILLING_PATH });
  return { billing: sandbox.window.TimeWiseBilling, backend, storage, calls, navigated };
}

function settle() {
  // Let getSession().then(setUser) and getSubscription().then(applyRow) run.
  return new Promise((resolve) => setImmediate(() => setImmediate(resolve)));
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('local demo mode unlocks all limits', async () => {
  const { billing } = createBilling({ paystackKey: '' });
  await settle();
  const state = billing.getState();
  assert.strictEqual(state.demo, true);
  assert.strictEqual(state.enforcement, false);
  assert.strictEqual(billing.checkTaskCreation(500).allowed, true);
  assert.strictEqual(billing.checkSubtaskCreation(500).allowed, true);
  const limits = billing.limits();
  assert.strictEqual(limits.maxActiveTasks, null);
  assert.strictEqual(limits.maxSubtasksPerTask, null);
});

test('free plan blocks the 26th active task and 4th step', async () => {
  const { billing } = createBilling({
    subscription: { plan: 'free', status: 'inactive' }
  });
  await settle();
  assert.strictEqual(billing.getState().plan, 'free');
  assert.strictEqual(billing.checkTaskCreation(24).allowed, true);
  assert.strictEqual(billing.checkTaskCreation(25).allowed, false);
  assert.match(billing.checkTaskCreation(25).message, /25 active tasks/);
  assert.strictEqual(billing.checkSubtaskCreation(2).allowed, true);
  assert.strictEqual(billing.checkSubtaskCreation(3).allowed, false);
});

test('active pro plan unlocks task and step limits', async () => {
  const { billing } = createBilling({
    subscription: { plan: 'pro', status: 'active', current_period_end: new Date(Date.now() + 86400000).toISOString() }
  });
  await settle();
  assert.strictEqual(billing.getState().plan, 'pro');
  assert.strictEqual(billing.checkTaskCreation(500).allowed, true);
  assert.strictEqual(billing.checkSubtaskCreation(500).allowed, true);
});

test('canceled and expired plans fall back to free', async () => {
  const canceled = createBilling({ subscription: { plan: 'pro', status: 'canceled' } });
  await settle();
  assert.strictEqual(canceled.billing.getState().plan, 'free');

  const expired = createBilling({
    subscription: {
      plan: 'pro', status: 'active',
      current_period_end: new Date(Date.now() - 1000).toISOString()
    }
  });
  await settle();
  assert.strictEqual(expired.billing.getState().plan, 'free');
});

test('cached entitlement survives a temporary fetch error', async () => {
  const cacheKey = 'timewise_billing:user-1';
  const cached = JSON.stringify({
    plan: 'pro', status: 'active',
    currentPeriodEnd: new Date(Date.now() + 86400000).toISOString(),
    cancelAtPeriodEnd: false
  });
  const { billing } = createBilling({ storage: { [cacheKey]: cached }, subscriptionError: 'offline' });
  await settle();
  const state = billing.getState();
  assert.strictEqual(state.plan, 'pro');
  assert.match(state.error, /offline/);
});

test('checkout and portal call the secure Edge Functions', async () => {
  const { billing, calls, navigated } = createBilling({
    subscription: { plan: 'free', status: 'inactive' }
  });
  await settle();
  await billing.startCheckout();
  await billing.openPortal();
  assert.deepStrictEqual(calls.map((call) => call.name), ['initialize-paystack-payment', 'manage-paystack-subscription']);
  assert.strictEqual(navigated.length, 2);
  assert.match(navigated[0], /checkout\.paystack\.test/);
});

test('signing out clears entitlement state', async () => {
  const { billing, backend } = createBilling({
    subscription: { plan: 'pro', status: 'active' }
  });
  await settle();
  assert.strictEqual(billing.getState().plan, 'pro');
  backend._auth(null);
  await settle();
  assert.strictEqual(billing.getState().plan, 'free');
});

async function main() {
  let passed = 0;
  for (const item of tests) {
    try {
      await item.fn();
      passed++;
      console.log('  ok  ' + item.name);
    } catch (error) {
      console.error('  FAIL ' + item.name + ': ' + error.message);
    }
  }
  console.log('\n' + passed + '/' + tests.length + ' billing tests passed');
  if (passed !== tests.length) process.exitCode = 1;
}

main();
