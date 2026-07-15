// PHENIX: NULL EDEN — service worker (PWA/TWA). Network-first + AGGRESSIVE self-update:
// always prefer fresh files, purge every old cache on activate, take control immediately,
// and (with the index.html registration) auto-reload the page when a new version ships —
// so phones stop getting stuck on a stale build. The ?v chain stays the real version control.
const CACHE = 'phenix-shell-v2';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));  // drop stale shells
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((res) => {
      try { const c = res.clone(); caches.open(CACHE).then((cc) => cc.put(e.request, c)); } catch (_) {}
      return res;
    }).catch(() => caches.match(e.request))
  );
});
