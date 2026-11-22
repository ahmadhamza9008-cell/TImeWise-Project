/* TimeWise service worker — offline app shell for the installable PWA. */

const CACHE_NAME = 'timewise-v8';
const NETWORK_TIMEOUT_MS = 1500;

const CORE_ASSETS = [
  './',
  './index.html',
  './register.html',
  './login.html',
  './dashboard.html',
  './tasks.html',
  './calendar.html',
  './insights.html',
  './settings.html',
  './pricing.html',
  './reset.html',
  './terms.html',
  './privacy.html',
  './manifest.webmanifest',
  './assets/img/favicon.svg',
  './assets/img/icon-192.png',
  './assets/img/icon-512.png',
  './assets/css/styles.css',
  './assets/css/auth.css',
  './assets/css/dashboard.css',
  './assets/css/tasks.css',
  './assets/css/calendar.css',
  './assets/css/insights.css',
  './assets/css/settings.css',
  './assets/css/pricing.css',
  './assets/css/notifications.css',
  './assets/js/a11y.js',
  './assets/js/config.js',
  './assets/js/supabase.js',
  './assets/js/main.js',
  './assets/js/auth.js',
  './assets/js/store.js',
  './assets/js/app-status.js',
  './assets/js/dashboard.js',
  './assets/js/tasks.js',
  './assets/js/calendar.js',
  './assets/js/insights.js',
  './assets/js/settings.js',
  './assets/js/app-settings.js',
  './assets/js/settings-page.js',
  './assets/js/billing.js',
  './assets/js/pricing.js',
  './assets/js/push.js',
  './assets/js/reset.js',
  './assets/js/notifications.js',
  './assets/js/pwa.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Network timeout')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    // Don't make the user wait on a slow or offline network when a cached
    // shell is available.
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    return (await cache.match(request)) || (await cache.match('./index.html')) || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

/* Web Push reminders */
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = { body: event.data ? event.data.text() : '' };
  }
  var title = payload.title || 'TimeWise';
  var options = {
    body: payload.body || 'You have a task coming up.',
    icon: payload.icon || './assets/img/icon-192.png',
    badge: payload.badge || './assets/img/icon-192.png',
    tag: payload.tag || 'timewise-reminder',
    data: payload.data || { url: './tasks.html' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || './tasks.html';
  var url = new URL(target, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
      for (var i = 0; i < clients.length; i++) {
        if (clients[i].url === url && 'focus' in clients[i]) return clients[i].focus();
      }
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request));
    return;
  }
  event.respondWith(cacheFirst(event.request));
});
