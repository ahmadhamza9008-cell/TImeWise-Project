/* TimeWise — progressive web app registration and install prompt. */

(function () {
  'use strict';

  if ('serviceWorker' in navigator && /^https?:$/.test(window.location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () {
        /* Service workers are optional; the app still works online. */
      });
    });
  }

  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return;

  var deferredPrompt = null;
  var banner = null;

  function ensureBanner() {
    if (banner) return banner;
    banner = document.createElement('div');
    banner.className = 'install-banner';
    banner.setAttribute('role', 'status');
    banner.innerHTML =
      '<span class="install-icon" aria-hidden="true">◷</span>' +
      '<span class="install-text"><strong>Install TimeWise</strong><small>Keep your plan one tap away.</small></span>' +
      '<button class="install-accept" type="button">Install</button>' +
      '<button class="install-dismiss" type="button" aria-label="Dismiss install suggestion">×</button>';
    document.body.appendChild(banner);

    banner.querySelector('.install-accept').addEventListener('click', function () {
      if (!deferredPrompt) return hide();
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () { deferredPrompt = null; hide(); });
    });
    banner.querySelector('.install-dismiss').addEventListener('click', function () {
      try { sessionStorage.setItem('timewiseInstallDismissed', '1'); } catch (e) { /* storage unavailable */ }
      hide();
    });
    return banner;
  }

  function hide() {
    if (banner) banner.classList.remove('is-visible');
  }

  function show() {
    try {
      if (sessionStorage.getItem('timewiseInstallDismissed') === '1') return;
    } catch (e) { /* storage unavailable */ }
    var el = ensureBanner();
    requestAnimationFrame(function () { el.classList.add('is-visible'); });
  }

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredPrompt = event;
    show();
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    hide();
  });
})();
