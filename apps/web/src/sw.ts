/// <reference lib="webworker" />
/**
 * Service worker ÚNICO de CODA (vite-plugin-pwa, strategies: "injectManifest").
 *
 * Reemplaza a los dos SW que competían antes de PWA-1:
 *  - el generateSW de Workbox (sin handlers de push → Web Push roto en prod), y
 *  - el `public/sw.js` manual (con push, pero pisado por el build).
 *
 * Reglas de cache (seguridad):
 *  - NUNCA cachear `/api/` — las respuestas personales (movimientos, /me, scores)
 *    no deben persistir en CacheStorage. El `api-cache` legado se purga en activate.
 *  - Precache de assets estáticos versionados (Workbox, revisiones por build).
 *  - Runtime cache solo para imágenes y fuentes (contenido no sensible).
 */

import {
  cleanupOutdatedCaches,
  matchPrecache,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare let self: ServiceWorkerGlobalScope;

/* ─── Precache (manifest inyectado por vite-plugin-pwa en el build) ─── */

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Flujo de actualización con prompt (PWAUpdatePrompt + useRegisterSW): el cliente
// manda SKIP_WAITING cuando el usuario acepta "Actualizar".
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

// Purga de caches legados en TODOS los clientes al activar esta versión:
//  - 'api-cache': respuestas de /api/ con datos personales (runtimeCaching anterior).
//  - 'coda-v2': cache del SW manual pre-Workbox.
// El precache viejo de Workbox lo limpia cleanupOutdatedCaches().
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all(["api-cache", "coda-v2"].map((name) => caches.delete(name).catch(() => false))),
  );
});

/* ─── Rutas ─── */

// Navegación SPA: NetworkFirst en vez de servir el index PRECACHEADO.
//
// Por qué: los chunks de ruta son lazy con hash por build. Si el SW sirviera un
// index.html viejo cacheado (tras varios deploys), ese HTML apunta a hashes que ya
// no existen en el server → "Failed to fetch dynamically imported module" (404) y la
// app se cae. Con NetworkFirst, cada navegación trae el index FRESCO del server (con
// los hashes correctos) mientras haya red — sin depender de que el SW se actualice —
// y cae al shell precacheado solo si estás offline.
const navigationHandler = new NetworkFirst({
  cacheName: "app-shell",
  networkTimeoutSeconds: 4,
  plugins: [new ExpirationPlugin({ maxEntries: 1, maxAgeSeconds: 86400 })],
});
registerRoute(
  new NavigationRoute(
    async (options) => {
      const res = await navigationHandler.handle(options).catch(() => undefined);
      // Sin red y sin copia previa en app-shell → shell precacheado (offline).
      return res ?? (await matchPrecache("/index.html")) ?? Response.error();
    },
    { denylist: [/^\/api\//, /^\/robots\.txt$/, /^\/sitemap\.xml$/] },
  ),
);

// Imágenes: CacheFirst acotado (no sensibles; los PDFs de cartolas van por /api y NO se cachean).
registerRoute(
  /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
  new CacheFirst({
    cacheName: "images-cache",
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 86400 })],
  }),
  "GET",
);

// Fuentes de Google (si se usan): estáticas e inmutables.
registerRoute(
  /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
  new CacheFirst({
    cacheName: "fonts-cache",
    plugins: [new ExpirationPlugin({ maxAgeSeconds: 31536000 })],
  }),
  "GET",
);

/* ─── Push Notifications (migrado de public/sw.js) ─── */

interface PushPayload {
  title?: string;
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: { url?: string };
}

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload: PushPayload;
  try {
    payload = event.data.json() as PushPayload;
  } catch {
    payload = { title: "CODA", body: event.data.text() };
  }

  // `actions`/`vibrate`/`renotify` son del Notification API de SW; los tipos DOM de
  // TS no los incluyen en NotificationOptions, de ahí el cast.
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/favicon.svg",
    badge: payload.badge || "/favicon.svg",
    tag: payload.tag || "coda-notification",
    renotify: true,
    data: payload.data || {},
    actions: [
      { action: "open", title: "Ver" },
      { action: "dismiss", title: "Cerrar" },
    ],
    vibrate: [100, 50, 100],
  } as NotificationOptions;

  event.waitUntil(self.registration.showNotification(payload.title || "CODA", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const urlToOpen = (event.notification.data as { url?: string } | undefined)?.url || "/";
  const fullUrl = new URL(urlToOpen, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === fullUrl && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(fullUrl);
      }
    }),
  );
});
