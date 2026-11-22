/* TimeWise — subscription entitlements.
   The subscriptions table is the source of truth. The browser caches the plan
   per account for offline use. With Stripe unconfigured the app stays in
   local-demo mode: every feature is unlocked and no limits are enforced. */

window.TimeWiseBilling = (function () {
  'use strict';

  var Backend = window.TimeWiseBackend || null;
  var Store = window.TimeWiseStore || null;
  var CFG = window.TimeWiseConfig || {};
  var STORAGE_KEY = 'timewise_billing';
  var FREE_TASK_LIMIT = 25;
  var FREE_SUBTASK_LIMIT = 3;
  var ACTIVE_STATUSES = ['active', 'trialing'];

  var userId = null;
  var state = {
    plan: 'free',
    status: 'inactive',
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    error: null
  };
  var listeners = [];
  var refreshPromise = null;

  function configured() {
    var key = String(CFG.stripePublishableKey || '');
    return /^pk_(test|live)_/.test(key) && Boolean(Backend && Backend.isConfigured && Backend.isConfigured());
  }

  function storageKey() {
    return userId ? STORAGE_KEY + ':' + userId : STORAGE_KEY;
  }

  function load() {
    if (typeof localStorage === 'undefined') return;
    try {
      var raw = localStorage.getItem(storageKey());
      if (!raw) return;
      var row = JSON.parse(raw);
      if (!row || typeof row !== 'object') return;
      state.plan = row.plan === 'pro' ? 'pro' : 'free';
      state.status = String(row.status || 'inactive');
      state.currentPeriodEnd = row.currentPeriodEnd || null;
      state.cancelAtPeriodEnd = Boolean(row.cancelAtPeriodEnd);
    } catch (e) { /* ignore corrupt cache */ }
  }

  function persist() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(storageKey(), JSON.stringify({
        plan: state.plan,
        status: state.status,
        currentPeriodEnd: state.currentPeriodEnd,
        cancelAtPeriodEnd: state.cancelAtPeriodEnd
      }));
    } catch (e) { /* private browsing */ }
  }

  function isPro() {
    if (!configured()) return false;
    if (state.plan !== 'pro' || ACTIVE_STATUSES.indexOf(state.status) === -1) return false;
    if (state.currentPeriodEnd && Date.parse(state.currentPeriodEnd) <= Date.now()) return false;
    return true;
  }

  function getState() {
    return {
      plan: isPro() ? 'pro' : 'free',
      storedPlan: state.plan,
      status: state.status,
      currentPeriodEnd: state.currentPeriodEnd,
      cancelAtPeriodEnd: state.cancelAtPeriodEnd,
      configured: configured(),
      demo: !configured(),
      enforcement: configured(),
      error: state.error
    };
  }

  function emit() {
    var snapshot = getState();
    listeners.slice().forEach(function (listener) {
      try { listener(snapshot); } catch (e) { /* keep other listeners alive */ }
    });
  }

  function applyRow(row) {
    var source = row || {};
    state.plan = source.plan === 'pro' ? 'pro' : 'free';
    state.status = String(source.status || 'inactive');
    state.currentPeriodEnd = source.current_period_end || source.currentPeriodEnd || null;
    state.cancelAtPeriodEnd = Boolean(source.cancel_at_period_end || source.cancelAtPeriodEnd);
    state.error = null;
    persist();
    emit();
  }

  function refresh() {
    if (!configured() || !Backend || !Backend.getSubscription) return Promise.resolve(getState());
    if (refreshPromise) return refreshPromise;
    refreshPromise = Backend.getSubscription().then(function (row) {
      refreshPromise = null;
      applyRow(row);
      return getState();
    }).catch(function (error) {
      refreshPromise = null;
      state.error = (error && error.message) || 'Could not check your plan.';
      emit();
      return getState();
    });
    return refreshPromise;
  }

  function setUser(id) {
    var next = id || null;
    if (next === userId) return refresh();
    userId = next;
    refreshPromise = null;
    state.error = null;
    load();
    emit();
    return refresh();
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return function () {};
    listeners.push(listener);
    try { listener(getState()); } catch (e) { /* keep registration alive */ }
    return function () {
      listeners = listeners.filter(function (item) { return item !== listener; });
    };
  }

  function limits() {
    return configured()
      ? { maxActiveTasks: FREE_TASK_LIMIT, maxSubtasksPerTask: FREE_SUBTASK_LIMIT }
      : { maxActiveTasks: null, maxSubtasksPerTask: null };
  }

  function checkTaskCreation(activeCount) {
    if (!configured() || isPro()) return { allowed: true, remaining: null };
    var count = Math.max(0, Number(activeCount) || 0);
    if (count < FREE_TASK_LIMIT) return { allowed: true, remaining: FREE_TASK_LIMIT - count };
    return {
      allowed: false,
      remaining: 0,
      limit: FREE_TASK_LIMIT,
      message: 'Free includes ' + FREE_TASK_LIMIT + ' active tasks. Upgrade to Pro for unlimited tasks.'
    };
  }

  function checkSubtaskCreation(count) {
    if (!configured() || isPro()) return { allowed: true, remaining: null };
    var current = Math.max(0, Number(count) || 0);
    if (current < FREE_SUBTASK_LIMIT) return { allowed: true, remaining: FREE_SUBTASK_LIMIT - current };
    return {
      allowed: false,
      remaining: 0,
      limit: FREE_SUBTASK_LIMIT,
      message: 'Free includes ' + FREE_SUBTASK_LIMIT + ' steps per task. Upgrade to Pro for unlimited steps.'
    };
  }

  function requireSession() {
    if (!Backend || !Backend.getSession) return Promise.resolve(null);
    return Backend.getSession();
  }

  function startCheckout() {
    if (!configured()) {
      return Promise.reject(new Error('Billing is in local-demo mode — all features are unlocked.'));
    }
    return requireSession().then(function (session) {
      if (!session || !session.user) throw new Error('Sign in first to upgrade to Pro.');
      return Backend.invokeFunction('create-checkout-session', { plan: 'pro' });
    }).then(function (result) {
      if (result.url && window.location && window.location.assign) window.location.assign(result.url);
      return result;
    });
  }

  function openPortal() {
    if (!configured()) return Promise.reject(new Error('Billing is not configured in this build.'));
    return requireSession().then(function (session) {
      if (!session || !session.user) throw new Error('Sign in first to manage billing.');
      return Backend.invokeFunction('create-portal-session', {});
    }).then(function (result) {
      if (result.url && window.location && window.location.assign) window.location.assign(result.url);
      return result;
    });
  }

  function notify(message) {
    var toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    if (notify.timer) clearTimeout(notify.timer);
    notify.timer = setTimeout(function () { toast.classList.remove('show'); }, 3200);
  }

  // Settings "Your plan" panel — populated from the entitlement state.
  function initPlanPanel() {
    var nameEl = document.getElementById('plan-name');
    if (!nameEl) return;
    var detail = document.getElementById('plan-detail');
    var usage = document.getElementById('plan-usage');
    var upgrade = document.getElementById('plan-upgrade');
    var manage = document.getElementById('plan-manage');

    subscribe(function (snapshot) {
      nameEl.textContent = snapshot.demo ? 'Local demo' : (snapshot.plan === 'pro' ? 'TimeWise Pro' : 'Free plan');
      if (detail) {
        if (snapshot.demo) {
          detail.textContent = 'Stripe is not connected here, so every feature is unlocked.';
        } else if (snapshot.plan === 'pro') {
          detail.textContent = snapshot.cancelAtPeriodEnd
            ? 'Pro is active and will end at the close of the current billing period.'
            : 'Pro is active. Unlimited tasks and steps.';
        } else if (snapshot.error) {
          detail.textContent = 'Plan status unavailable: ' + snapshot.error;
        } else {
          detail.textContent = 'Free includes ' + FREE_TASK_LIMIT + ' active tasks and ' +
            FREE_SUBTASK_LIMIT + ' steps per task.';
        }
      }
      if (manage) manage.hidden = snapshot.demo || snapshot.plan !== 'pro';
      if (upgrade) {
        upgrade.textContent = snapshot.plan === 'pro' ? 'Compare plans' : 'See plans & upgrade';
        upgrade.hidden = false;
      }
    });

    if (usage && Store && Store.subscribe) {
      Store.subscribe(function (tasks) {
        var active = tasks.filter(function (task) { return !task.done; }).length;
        usage.textContent = configured()
          ? active + ' / ' + FREE_TASK_LIMIT + ' free tasks used'
          : active + ' active task' + (active === 1 ? '' : 's');
      });
    }

    if (upgrade) {
      upgrade.addEventListener('click', function (event) {
        var snapshot = getState();
        if (snapshot.demo || !snapshot.configured) return; // plain link to pricing.html
        event.preventDefault();
        startCheckout().catch(function (error) { notify(error.message); });
      });
    }
    if (manage) {
      manage.addEventListener('click', function () {
        openPortal().catch(function (error) { notify(error.message); });
      });
    }
  }

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('timewise:subscription-changed', function () {
      refreshPromise = null;
      refresh();
    });
    window.addEventListener('focus', function () { if (configured()) refresh(); });
  }

  if (Backend) {
    if (Backend.onAuthChange) {
      Backend.onAuthChange(function (session) {
        setUser(session && session.user ? session.user.id : null);
      });
    }
    if (Backend.getSession) {
      Backend.getSession().then(function (session) {
        setUser(session && session.user ? session.user.id : null);
      }).catch(function () { load(); emit(); });
    } else {
      load();
    }
  } else {
    load();
  }

  if (typeof document !== 'undefined') initPlanPanel();

  return {
    configured: configured,
    getState: getState,
    refresh: refresh,
    setUser: setUser,
    subscribe: subscribe,
    limits: limits,
    checkTaskCreation: checkTaskCreation,
    checkSubtaskCreation: checkSubtaskCreation,
    startCheckout: startCheckout,
    openPortal: openPortal
  };
})();
