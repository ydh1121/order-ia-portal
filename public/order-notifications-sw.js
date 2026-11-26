// This worker handles notifications only. It does not intercept requests or
// cache product pages, credentials, API results or notification bodies.
const inFlight = new Set();
const destination = '/ia?view=product-r3&screen=profile&state=notification';
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let payload; try {payload = event.data?.json();} catch {return;}
  if (payload?.version !== 1 || !/^[a-f0-9]{32}$/.test(payload.id || '') || payload.url !== destination ||
      !['오더 · 시세 알림', '오더 · 새 알림'].includes(payload.title) || typeof payload.body !== 'string' || payload.body.length > 200 || inFlight.has(payload.id)) return;
  inFlight.add(payload.id);
  event.waitUntil((async () => {
    const cache = await caches.open('order-push-receipts-v1');
    const key = new Request(new URL('/__order-push-receipt/' + payload.id, self.location.origin));
    if (await cache.match(key)) return;
    await cache.put(key, new Response('received'));
    try {
      await self.registration.showNotification(payload.title, {body: payload.body, tag: payload.id, renotify: false, data: {url: destination}});
    } catch (error) {await cache.delete(key); throw error;}
    const prior = await cache.keys();
    if (prior.length > 1000) await Promise.all(prior.slice(0, prior.length - 1000).map(item => cache.delete(item)));
  })().finally(() => inFlight.delete(payload.id)));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.notification.data?.url !== destination) return;
  event.waitUntil((async () => {
    const url = new URL(destination, self.location.origin);
    const windows = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    const existing = windows.find(client => {try {const current = new URL(client.url); return current.origin === url.origin && current.pathname === '/ia' && current.searchParams.get('view') === 'product-r3';} catch {return false;}});
    if (existing) {await existing.navigate(url.href); await existing.focus();}
    else await self.clients.openWindow(url.href);
  })());
});
