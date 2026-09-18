const CACHE_NAME = 'guozi-pwa-shell-v4';
const APP_SHELL = ['/', '/manifest.webmanifest', '/assets/ink-shadow-ghost-master.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  // Live household state must never be served from the app-shell cache. The
  // UI already has explicit loading/error/offline states for failed requests.
  if (requestUrl.origin === self.location.origin && requestUrl.pathname.startsWith('/api/')) return;
  const appShellRequest = event.request.mode === 'navigate' || /\.(?:js|css)$/.test(requestUrl.pathname);
  if (appShellRequest) {
    event.respondWith(fetch(event.request).then((response) => {
      if (event.request.url.startsWith(self.location.origin)) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached ?? fetch(event.request).then((response) => {
      if (event.request.url.startsWith(self.location.origin)) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }))
  );
});
