/* =========================================================
   A7SBLEY / EHSEBLI — Service Worker V10.5
   PWA Engine + Offline Precache + Push Notifications
   ========================================================= */

const CACHE_VERSION = 'a7sbley-v11.5';
const RUNTIME_CACHE = 'a7sbley-runtime-v10.5';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './logo.png',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './favicon.png'
];

/* ---------- Install ---------- */
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_ASSETS).catch((err) => console.warn('Cache error:', err)))
  );
});

/* ---------- Activate ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION && k !== RUNTIME_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* ---------- Fetch (Network First, Cache Fallback) ---------- */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const skipHosts = [
    'firebase', 'googleapis', 'gstatic', 'tailwindcss',
    'jsdelivr', 'cloudflare', 'wa.me', 'firebaseio',
    'firebaseinstallations', 'google-analytics', 'firebasestorage'
  ];
  if (skipHosts.some((h) => url.hostname.includes(h))) return;

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
    title: 'احسبلي | a7sbley',
    body: 'لديك تنبيه جديد في الحسابات',
    icon: './icon-192.png',
    badge: './icon-192.png',
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
    icon: data.icon || './icon-192.png',
    badge: data.badge || './icon-192.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'a7sbley-notification',
    renotify: true,
    data: { url: data.url || './', ...data.data }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
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

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
