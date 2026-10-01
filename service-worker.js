/* =========================================================
   EHSEBLI / HONDA — Service Worker V9.2
   Offline Cache + Push Notifications
   ========================================================= */

const CACHE_VERSION = 'ehsebli-v9.2';
const RUNTIME_CACHE = 'ehsebli-runtime';

const PRECACHE_ASSETS = [
  './', './index.html', './styles.css', './app.js',
  './manifest.json', './icon.svg',
  './shortcut-expense.svg', './shortcut-income.svg',
  './shortcut-debts.svg', './shortcut-clients.svg'
];

/* ---------- Install ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

/* ---------- Activate ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ---------- Fetch ---------- */
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

  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
    )
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
  if (event.data?.type === 'SHOW_LOCAL_NOTIFICATION') {
    const { title, body, url } = event.data;
    self.registration.showNotification(title || 'احسبلي', {
      body: body || '',
      icon: './icon.svg',
      badge: './icon.svg',
      vibrate: [200, 100, 200],
      data: { url: url || './' }
    });
  }
});