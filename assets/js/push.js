/* TimeWise — Web Push subscription controls for the Settings screen. */

(function () {
  'use strict';

  var Config = window.TimeWiseConfig || {};
  var Backend = window.TimeWiseBackend;
  var statusEl = document.getElementById('push-status');
  var toggle = document.getElementById('push-toggle');
  var hint = document.getElementById('push-hint');

  function showToast(message) {
    var toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(function () { toast.classList.remove('show'); }, 3000);
  }

  function supported() {
    return Boolean(
      Config.vapidPublicKey &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  }

  function currentTimezone() {
    var Settings = window.TimeWiseSettings;
    var zone = Settings && Settings.get().timezone;
    return zone || (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  }

  // Keep the server-side reminder zone in sync when the profile zone changes
  // (including when the user travels or switches devices).
  function refreshTimezone() {
    if (!supported() || !Backend || !Backend.savePushSubscription) return Promise.resolve();
    return navigator.serviceWorker.ready
      .then(function (registration) { return registration.pushManager.getSubscription(); })
      .then(function (subscription) {
        if (!subscription) return null;
        return Backend.savePushSubscription(subscription, currentTimezone());
      })
      .catch(function () { return null; });
  }

  window.addEventListener('timewise:profile-changed', refreshTimezone);
  window.addEventListener('focus', refreshTimezone);

  function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(base64);
    var output = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
    return output;
  }

  function setStatus(message, showButton) {
    if (statusEl) statusEl.textContent = message;
    if (toggle) toggle.hidden = !showButton;
    if (hint) hint.hidden = !showButton;
  }

  function refresh() {
    if (!supported()) {
      setStatus('Push needs an HTTPS origin, a service worker, and a configured VAPID public key.', false);
      return Promise.resolve(null);
    }
    if (Notification.permission === 'denied') {
      setStatus('Notifications are blocked in your browser settings.', false);
      return Promise.resolve(null);
    }
    return navigator.serviceWorker.ready.then(function (registration) {
      return registration.pushManager.getSubscription();
    }).then(function (subscription) {
      if (toggle) {
        toggle.textContent = subscription ? 'Disable notifications' : 'Enable notifications';
        toggle.dataset.subscribed = subscription ? '1' : '';
      }
      setStatus(
        subscription
          ? 'Enabled — reminders arrive at the lead time set on each task.'
          : (Notification.permission === 'granted'
            ? 'Ready — click Enable to start receiving reminders.'
            : 'Turn on reminders for tasks that are due soon.'),
        true
      );
      return subscription;
    }).catch(function () {
      setStatus('Could not check your notification subscription.', false);
      return null;
    });
  }

  function enable() {
    if (!supported()) return Promise.resolve();
    return Notification.requestPermission().then(function (permission) {
      if (permission !== 'granted') {
        setStatus('Notification permission was not granted.', true);
        return null;
      }
      return navigator.serviceWorker.ready.then(function (registration) {
        return registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(Config.vapidPublicKey)
        });
      }).then(function (subscription) {
        if (!Backend || !Backend.savePushSubscription) throw new Error('Backend is unavailable.');
        var timezone = currentTimezone();
        return Backend.savePushSubscription(subscription, timezone).then(function () {
          showToast('Push notifications enabled.');
          return refresh();
        });
      });
    }).catch(function (error) {
      showToast('Could not enable notifications: ' + error.message);
      return refresh();
    });
  }

  function disable() {
    if (!supported()) return Promise.resolve();
    return navigator.serviceWorker.ready
      .then(function (registration) { return registration.pushManager.getSubscription(); })
      .then(function (subscription) {
        if (!subscription) return null;
        var remove = Backend && Backend.removePushSubscription
          ? Backend.removePushSubscription(subscription.endpoint)
          : Promise.resolve();
        return subscription.unsubscribe().then(function () { return remove; });
      })
      .then(function () {
        showToast('Push notifications disabled.');
        return refresh();
      })
      .catch(function (error) {
        showToast('Could not disable notifications: ' + error.message);
        return refresh();
      });
  }

  function init() {
    if (!toggle) return;
    toggle.addEventListener('click', function () {
      if (toggle.dataset.subscribed === '1') disable();
      else enable();
    });
    refresh();
  }

  window.TimeWisePush = { init: init, refresh: refresh, refreshTimezone: refreshTimezone };
})();
