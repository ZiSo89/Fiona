const APP_BASE = '/app';
const CACHE_NAME = 'fiona-dispatch-v19';
const APP_SHELL = [
  `${APP_BASE}/`,
  `${APP_BASE}/index.html`,
  `${APP_BASE}/manifest.webmanifest`,
  `${APP_BASE}/alpha-logo.webp`,
  `${APP_BASE}/icons/fiona-192.png?v=19`,
  `${APP_BASE}/icons/fiona-512.png?v=19`,
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('fiona-dispatch-') && key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin || requestUrl.pathname.startsWith('/api/')) return;
  if (requestUrl.pathname === '/tracker' || requestUrl.pathname.startsWith('/tracker/')) return;
  if (requestUrl.pathname !== APP_BASE && !requestUrl.pathname.startsWith(`${APP_BASE}/`)) return;

  const isViteModule = requestUrl.pathname.startsWith(`${APP_BASE}/src/`)
    || requestUrl.pathname.startsWith(`${APP_BASE}/@`)
    || requestUrl.pathname.startsWith(`${APP_BASE}/node_modules/`);
  if (isViteModule) {
    event.respondWith(fetch(event.request));
    return;
  }

  const isAppDocument = event.request.mode === 'navigate'
    || requestUrl.pathname === APP_BASE
    || requestUrl.pathname === `${APP_BASE}/`
    || requestUrl.pathname === `${APP_BASE}/index.html`;
  if (isAppDocument) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response?.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(`${APP_BASE}/index.html`, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match(`${APP_BASE}/index.html`)))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          return response;
        })
        .catch(() => caches.match(`${APP_BASE}/index.html`));
    })
  );
});
