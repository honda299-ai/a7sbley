/* =========================================================
   EHSEBLI / HONDA — Service Worker V9.5
   Network-First Strategy for Instant GitHub Pages Updates
   ========================================================= */

const CACHE_VERSION = 'ehsebli-v9.5';
const RUNTIME_CACHE = 'ehsebli-runtime-v9.5';

const PRECACHE_ASSETS = [
  './', './index.html', './styles.css', './app.js',
  './manifest.json', './icon.svg'
];

/* ---------- Install ---------- */
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_ASSETS).catch(() => {}))
  );
});

/* ---------- Activate: Delete all old caches immediately ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION && k !== RUNTIME_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* ---------- Fetch: Network-First so updates on GitHub Pages take effect instantly ---------- */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const skipHosts = [
    'firebase', 'googleapis', 'gstatic', 'tailwindcss',
    'jsdelivr', 'cloudflare', 'wa.me', 'firebaseio',
    'firebaseinstallations', 'google-analytics'
  ];
  if (skipHosts.some((h) => url.hostname.includes(h))) return;

  // Network First, fallback to cache
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, responseToCache));
        }
        return networkResponse;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
  );
});

/* ---------- Push Notifications ---------- */
self.addEventListener('push', (event) => {
  let data = {
    title: 'احسبلي',
    body: 'لديك تحديث جديد',
    icon: './icon.svg',
    badge: './icon.svg',
    url: './'
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: data.icon || './icon.svg',
    badge: data.badge || './icon.svg',
    vibrate: [200, 100, 200],
    tag: data.tag || 'ehsebli-notification',
    renotify: true,
    requireInteraction: data.requireInteraction || false,
    data: { url: data.url || './', ...data.data },
    actions: data.actions || [
      { action: 'open', title: 'فتح' },
      { action: 'close', title: 'إغلاق' }
    ]
  }));
});

/* ---------- Notification Click ---------- */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;

  const targetUrl = event.notification.data?.url || './';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus().then((c) => c.navigate(targetUrl));
          }
        }
        if (clients.openWindow) return clients.openWindow(targetUrl);
      })
  );
});

/* ---------- Message Handler ---------- */
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
