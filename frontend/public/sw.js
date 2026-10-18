const CACHE_NAME = 'fiona-dispatch-v6';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/alpha-logo.webp',
  '/icons/fiona-192.svg',
  '/icons/fiona-512.svg',
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

  const isViteModule = requestUrl.pathname.startsWith('/src/')
    || requestUrl.pathname.startsWith('/@')
    || requestUrl.pathname.startsWith('/node_modules/');
  if (isViteModule) {
    event.respondWith(fetch(event.request));
    return;
  }

  const isAppDocument = event.request.mode === 'navigate'
    || requestUrl.pathname === '/'
    || requestUrl.pathname === '/index.html';
  if (isAppDocument) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response?.status === 200 && response.type === 'basic') {
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html')))
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
        .catch(() => caches.match('/index.html'));
    })
  );
});
