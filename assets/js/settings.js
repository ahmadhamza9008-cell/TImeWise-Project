/* TimeWise — shared user preferences.
   Stored locally for instant access; synced to the Supabase profile when signed in. */

window.TimeWiseSettings = (function () {
  'use strict';

  var KEY = 'timewise_settings';
  var Backend = window.TimeWiseBackend;

  var defaults = {
    name: 'Friend',
    focusMinutes: 25,
    weekStart: 'monday',
    theme: 'light'
  };

  function normalize(value) {
    var focus = Number(value && value.focusMinutes);
    return {
      name: String((value && value.name) || defaults.name).slice(0, 60),
      focusMinutes: focus === 25 || focus === 50 ? focus : defaults.focusMinutes,
      weekStart: value && value.weekStart === 'sunday' ? 'sunday' : 'monday',
      theme: value && value.theme === 'dark' ? 'dark' : 'light'
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      return normalize(raw ? JSON.parse(raw) : defaults);
    } catch (e) {
      return normalize(defaults);
    }
  }

  var settings = load();
  var listeners = [];
  var remoteReady = false;
  var applyingRemote = false;
  var hydratedUser = null;

  function emit() {
    listeners.forEach(function (listener) {
      try { listener(get()); } catch (e) { /* keep other listeners alive */ }
    });
  }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* storage unavailable */ }
  }

  function get() {
    return Object.assign({}, settings);
  }

  function pushRemote() {
    if (!remoteReady || applyingRemote || !Backend || !Backend.saveProfile) return;
    Backend.saveProfile(get()).catch(function () { /* keep local settings if sync fails */ });
  }

  function set(patch) {
    var next = normalize(Object.assign({}, settings, patch));
    var changed = Object.keys(next).some(function (key) { return next[key] !== settings[key]; });
    if (!changed) return get();
    settings = next;
    persist();
    emit();
    pushRemote();
    return get();
  }

  function reset() {
    settings = normalize(defaults);
    persist();
    emit();
    pushRemote();
    return get();
  }

  function subscribe(listener) {
    listeners.push(listener);
    return function () {
      listeners = listeners.filter(function (item) { return item !== listener; });
    };
  }

  function hydrate(user) {
    if (!user || !Backend || !Backend.getProfile) return;
    hydratedUser = user.id;

    Backend.getProfile().then(function (profile) {
      if (hydratedUser !== user.id) return;
      if (profile) {
        applyingRemote = true;
        set(profile);
        applyingRemote = false;
        remoteReady = true;
        return;
      }

      if (hydratedUser !== user.id) return;

      // Existing accounts may predate the profiles table — seed one from auth data.
      var meta = user.user_metadata || {};
      var name = String(meta.full_name || meta.name || '').trim();
      if (!name && user.email) name = user.email.split('@')[0];
      applyingRemote = true;
      set({ name: name || defaults.name });
      applyingRemote = false;
      remoteReady = true;
      Backend.saveProfile(get()).catch(function () { /* retry on next change */ });
    }).catch(function () {
      // The table may not exist yet; local preferences still work.
      remoteReady = false;
    });
  }

  if (Backend && Backend.onAuthChange) {
    Backend.onAuthChange(function (session) {
      if (!session || !session.user) {
        remoteReady = false;
        hydratedUser = null;
        return;
      }
      if (session.user.id !== hydratedUser) hydrate(session.user);
    });
  }

  return { get: get, set: set, reset: reset, subscribe: subscribe, hydrate: hydrate };
})();
