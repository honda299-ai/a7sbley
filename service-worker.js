/* =========================================================
   A7SBLEY / EHSEBLI — Service Worker V11.5
   PWA Engine + Offline Precache + Push Notifications
   ========================================================= */

const VERSION = '20.2';
const CACHE_VERSION = `a7sbley-v${VERSION}`;
const RUNTIME_CACHE = `a7sbley-runtime-v${VERSION}`;

// Must all succeed, otherwise install fails and is retried (no silent half-cache)
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './tailwind.css',
  './manifest.json',
  './app.js',
  './logo.png',
  './icon-192.png',
  './icon-512.png',
  './icon.svg'
];
// Nice to have; a failure here does not block install
const OPTIONAL_ASSETS = [
  './apple-touch-icon.png',
  './favicon.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png'
];

// Third-party static libraries that are safe to cache for offline use
const CACHEABLE_CDN = [
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'www.gstatic.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

/* ---------- Install ---------- */
// No automatic skipWaiting(): the page shows an "update available" banner and
// sends SKIP_WAITING, so users never get new JS mixed with an old open page.
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(CORE_ASSETS);
    await Promise.allSettled(OPTIONAL_ASSETS.map((u) => cache.add(u)));
  })());
});

/* ---------- Activate ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith('a7sbley-') && k !== CACHE_VERSION && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

/* ---------- Fetch ---------- */
async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (fallbackUrl) {
      const fb = await caches.match(fallbackUrl);
      if (fb) return fb;
    }
    throw err;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: request.url.startsWith(self.location.origin) });
  const network = fetch(request).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  return cached || (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Firestore / Auth / Storage API traffic is never touched by the SW
  if (!sameOrigin && !CACHEABLE_CDN.includes(url.hostname)) return;

  if (!sameOrigin) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }

  // HTML pages: network first, offline fallback to the app shell
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, CACHE_VERSION, './index.html'));
    return;
  }

  // Own static assets: serve fast from cache, refresh in background
  event.respondWith(staleWhileRevalidate(request, CACHE_VERSION));
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
    if (event.data) data = { ...data, ...event.data.json() };
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
  const targetUrl = new URL(event.notification.data?.url || './', self.location.origin).href;
  // Only ever navigate inside our own origin
  const safeUrl = targetUrl.startsWith(self.location.origin) ? targetUrl : self.location.origin + '/';
  event.waitUntil((async () => {
    const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of list) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        await client.focus();
        try { await client.navigate(safeUrl); } catch (e) { /* ignore */ }
        return;
      }
    }
    if (clients.openWindow) await clients.openWindow(safeUrl);
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'SHOW_LOCAL_NOTIFICATION') {
    const { title, body, url } = event.data;
    self.registration.showNotification(title || 'احسبلي | a7sbley', {
      body: body || '',
      icon: './icon-192.png',
      badge: './icon-192.png',
      vibrate: [200, 100, 200],
      tag: 'a7sbley-local-notification',
      data: { url: url || './' }
    });
  }
});
