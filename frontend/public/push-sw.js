/* push-sw.js — Handlers de Web Push para la PWA de Reparto.
 * El service worker generado por vite-plugin-pwa lo importa con importScripts,
 * así conservamos todo el precache/offline y agregamos push encima.
 * Estas notificaciones las entrega el navegador aunque la app esté cerrada. */

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_e) { /* payload no-JSON */ }

  const title = data.title || 'MG Reparto';
  const options = {
    body: data.body || '',
    icon: '/icons/pwa-192.png',
    badge: '/icons/pwa-192.png',
    tag: data.tag || 'reparto',
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
