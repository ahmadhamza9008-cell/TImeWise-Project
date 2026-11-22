/* TimeWise — cross-page accessibility helpers. */

(function () {
  'use strict';

  function enhance() {
    // Give every page a keyboard shortcut past the repeated app shell.
    var target = document.querySelector('main, .dashboard-main');
    if (target && !target.id) target.id = 'main-content';
    if (!document.querySelector('.skip-link')) {
      var link = document.createElement('a');
      link.className = 'skip-link';
      link.href = target ? '#main-content' : '#';
      link.textContent = 'Skip to main content';
      document.body.insertBefore(link, document.body.firstChild);
      if (target) {
        target.setAttribute('tabindex', '-1');
        link.addEventListener('click', function () { target.focus(); });
      }
    }

    // One polite live region for sync, settings and task status messages.
    var live = document.createElement('div');
    live.className = 'sr-only';
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('aria-atomic', 'true');
    live.id = 'timewise-live-status';
    document.body.appendChild(live);
    window.TimeWiseAnnounce = function (message) {
      if (!message) return;
      live.textContent = '';
      live.textContent = String(message);
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhance);
  else enhance();
})();
