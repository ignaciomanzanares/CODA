/* CODA - Service Worker with Push Notifications + Cache */
const CACHE_NAME = 'coda-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/',
        '/index.html',
        '/favicon.svg',
        '/manifest.json'
      ]).catch(() => {});
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        const clone = response.clone();
        if (response.status === 200 && (url.pathname.startsWith('/assets/') || url.pathname === '/' || url.pathname === '/index.html')) {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});

/* ─── Push Notifications ─── */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: 'CODA',
      body: event.data.text(),
    };
  }

  const options = {
    body: payload.body || '',
    icon: payload.icon || '/favicon.svg',
    badge: payload.badge || '/favicon.svg',
    tag: payload.tag || 'coda-notification',
    renotify: true,
    data: payload.data || {},
    actions: [
      { action: 'open', title: 'Ver' },
      { action: 'dismiss', title: 'Cerrar' },
    ],
    vibrate: [100, 50, 100],
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'CODA', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const urlToOpen = event.notification.data?.url || '/';
  const fullUrl = new URL(urlToOpen, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === fullUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(fullUrl);
      }
    })
  );
});

self.addEventListener('notificationclose', (_event) => {
  // Analytics hook if needed
});
