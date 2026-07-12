// PHENIX: NULL EDEN — minimal service worker (PWA/TWA requirement).
// Network-first: the game always prefers fresh files (the ?v cache-bust chain is
// the real version control); the SW exists so the app is installable and boots
// a cached shell offline if the network is briefly gone.
const CACHE = 'phenix-shell-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((res) => {
      try { const c = res.clone(); caches.open(CACHE).then((cc) => cc.put(e.request, c)); } catch (_) {}
      return res;
    }).catch(() => caches.match(e.request))
  );
});
