// MewFit offline cache: network-first for the page, cache-first for fonts.
const CACHE = 'mewfit-v25';
const CORE = ['./', './index.html', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return res; })));
    return;
  }
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return res; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});

// phone reminders sent by the Worker's 5-minute schedule (payload is encrypted JSON: { kind, title, body })
self.addEventListener('push', e => {
  let m = {}; try { m = e.data ? e.data.json() : {}; } catch (x) { m = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(m.title || 'MewFit', {
    body: m.body || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: m.tag || m.kind || 'mewfit', renotify: true,
    data: { url: m.kind === 'train' ? './#train' : m.kind === 'food' ? './#eat' : './#today' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) { c.navigate && c.navigate(url).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
