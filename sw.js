// PHENIX: NULL EDEN — service worker (PWA/TWA). Network-first + AGGRESSIVE self-update:
// always prefer fresh files, purge every old cache on activate, take control immediately,
// and (with the index.html registration) auto-reload the page when a new version ships —
// so phones stop getting stuck on a stale build. The ?v chain stays the real version control.
//
// 2026-07-17 hardening (Maria's console spam + wasted bandwidth):
//   1. NEVER touch non-http(s) requests (chrome-extension:// etc.) — Cache.put() rejects
//      on those schemes and every extension asset used to throw an Uncaught TypeError.
//   2. NEVER intercept Range/media requests (menu radio mp3/mp4 streams) — intercepting
//      them made EVERY media chunk download TWICE (media + sw fetch) ≈ 50 MB per menu
//      session, and Cache.put() rejects 206 Partial responses (more console errors).
//      The browser's native HTTP cache handles those better on its own.
//   3. Only cache clean same-origin 200 responses, and swallow put() failures — a full
//      or evicted cache must never surface as a page error.
// Cache name is tied to the BUILD VERSION (Maria 2026-07-19), not a hand-bumped counter.
// Keep this equal to the ?v= in index.html's main.js tag: on every deploy the name changes,
// the activate handler below drops every cache that is not the current one, and a mixed
// old/new build becomes impossible. (A manual 'v3' style counter is easy to forget, and a
// forgotten bump is exactly how a stale shell survives a deploy.)
const BUILD = '20260728000000';    // === index.html main.js ?v=
const CACHE = 'phenix-shell-' + BUILD;
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));  // drop stale shells
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (!req.url.startsWith('http')) return;          // chrome-extension:// etc — never handle
  if (req.headers.has('range')) return;             // media streams — browser-native (no 206 caching, no double fetch)
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.status === 200 && res.type === 'basic') {
        const c = res.clone();
        caches.open(CACHE).then((cc) => cc.put(req, c)).catch(() => {});  // cache errors stay silent
      }
      return res;
    }).catch(() => caches.match(req))
  );
});
