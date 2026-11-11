// Offline support: serve from cache, refresh the cache in the background.
const CACHE = 'pav-tuner-v4';
const SHELL = ['/', '/styles.css', '/js/app.js', '/js/pitch.js', '/js/tunings.js', '/js/scene.js', '/js/audio.js', '/js/fx.js',
  '/fonts/almendra-400-normal.woff2', '/fonts/almendra-700-normal.woff2', '/fonts/chakra-petch-400-normal.woff2', '/fonts/chakra-petch-600-normal.woff2',
  '/icons/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
      const fresh = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached ?? fresh;
    }),
  );
});
