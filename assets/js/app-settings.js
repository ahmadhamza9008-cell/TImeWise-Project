/* TimeWise — reflect shared preferences in the app shell on every screen. */

(function () {
  'use strict';

  var Settings = window.TimeWiseSettings;
  if (!Settings) return;

  function initials(name) {
    return String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2)
      .map(function (part) { return part.charAt(0).toUpperCase(); }).join('') || 'A';
  }

  function apply(settings) {
    var name = settings.name;

    document.documentElement.dataset.theme = settings.theme === 'dark' ? 'dark' : 'light';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', settings.theme === 'dark' ? '#0b1220' : '#0f172a');

    document.querySelectorAll('.user-info strong').forEach(function (el) { el.textContent = name; });

    document.querySelectorAll('.user-avatar').forEach(function (el) { el.textContent = initials(name); });

    document.querySelectorAll('.topbar-avatar').forEach(function (el) {
      el.textContent = initials(name);
      el.setAttribute('aria-label', name);
      el.title = name;
    });

    var greeting = document.getElementById('greeting');
    if (greeting) {
      var hour = new Date().getHours();
      try {
        var parts = new Intl.DateTimeFormat('en-GB', {
          timeZone: settings.timezone || 'UTC', hour: '2-digit', hourCycle: 'h23'
        }).formatToParts(new Date());
        var found = parts.filter(function (part) { return part.type === 'hour'; })[0];
        if (found) hour = Number(found.value);
      } catch (e) { /* keep browser-local hour */ }
      var part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
      greeting.textContent = 'Good ' + part + ', ' + name.split(/\s+/)[0];
    }
  }

  Settings.subscribe(apply);
  apply(Settings.get());
})();
