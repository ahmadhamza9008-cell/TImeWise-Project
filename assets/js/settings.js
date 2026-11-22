/* TimeWise — shared user preferences.
   Stored locally for instant access; synced to the Supabase profile when signed in. */

window.TimeWiseSettings = (function () {
  'use strict';

  var KEY = 'timewise_settings';
  var Backend = window.TimeWiseBackend;

  function browserTimezone() {
    try {
      if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      }
    } catch (e) { /* fall through */ }
    return 'UTC';
  }

  function validTimezone(value) {
    if (!value || typeof value !== 'string') return false;
    try {
      if (typeof Intl === 'undefined' || !Intl.DateTimeFormat) return true;
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch (e) {
      return false;
    }
  }

  var defaults = {
    name: 'Friend',
    focusMinutes: 25,
    weekStart: 'monday',
    theme: 'light',
    timezone: browserTimezone(),
    pushEnabled: true,
    quietStart: '',
    quietEnd: '',
    mutedTags: []
  };

  function normalize(value) {
    var focus = Number(value && value.focusMinutes);
    var quietStart = String((value && value.quietStart) || '');
    var quietEnd = String((value && value.quietEnd) || '');
    var timezone = String((value && value.timezone) || defaults.timezone);
    return {
      name: String((value && value.name) || defaults.name).slice(0, 60),
      focusMinutes: focus === 25 || focus === 50 ? focus : defaults.focusMinutes,
      weekStart: value && value.weekStart === 'sunday' ? 'sunday' : 'monday',
      theme: value && value.theme === 'dark' ? 'dark' : 'light',
      timezone: validTimezone(timezone) ? timezone : defaults.timezone,
      pushEnabled: value && value.pushEnabled === false ? false : true,
      quietStart: /^([01]\d|2[0-3]):[0-5]\d$/.test(quietStart) ? quietStart : '',
      quietEnd: /^([01]\d|2[0-3]):[0-5]\d$/.test(quietEnd) ? quietEnd : '',
      mutedTags: Array.isArray(value && value.mutedTags)
        ? value.mutedTags.filter(function (tag) { return typeof tag === 'string'; }).slice(0, 30)
        : []
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
    var changed = Object.keys(next).some(function (key) {
      if (Array.isArray(next[key])) return JSON.stringify(next[key]) !== JSON.stringify(settings[key]);
      return next[key] !== settings[key];
    });
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

  function applyRemote(profile) {
    if (!profile) return get();
    applyingRemote = true;
    set(profile);
    applyingRemote = false;
    remoteReady = true;
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

  // Profile edits on another device update preferences everywhere.
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('timewise:profile-changed', function () {
      if (hydratedUser) hydrate({ id: hydratedUser });
    });
  }

  return { get: get, set: set, reset: reset, applyRemote: applyRemote, subscribe: subscribe, hydrate: hydrate };
})();
