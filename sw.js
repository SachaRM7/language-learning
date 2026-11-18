// Service Worker — HelloArabic
// Stratégie : cache-first (CSS/JS/images), network-first (JSON), stale-while-revalidate (audio)

const CACHE_VERSION = 'v1.1.0';
const CACHE_NAME = `helloarabic-${CACHE_VERSION}`;
// Textes du Coran (API) : cache séparé, conservé entre les versions de l'app
const QURAN_CACHE = 'helloarabic-quran-api';
const QURAN_API_HOSTS = ['api.quran.com', 'api.alquran.cloud'];

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/css/variables.css',
  '/css/base.css',
  '/css/components.css',
  '/css/layout.css',
  '/css/pages/home.css',
  '/css/pages/words.css',
  '/css/pages/conversations.css',
  '/css/pages/review.css',
  '/css/pages/quran.css',
  '/css/pages/tajwid.css',
  '/js/app.js',
  '/js/router.js',
  '/js/store.js',
  '/js/db.js',
  '/js/audio.js',
  '/js/utils.js',
  '/js/srs.js',
  '/js/quran/api.js',
  '/js/quran/prefs.js',
  '/js/quran/tajweed.js',
  '/js/quran/range-player.js',
  '/js/pages/quran-home.js',
  '/js/pages/quran-reader.js',
  '/js/pages/tajwid-home.js',
  '/js/pages/tajwid-lesson.js',
  '/data/quran/surahs.json',
  '/data/tajwid/levels.json',
  '/manifest.json',
];

// Install: pré-cache les assets essentiels
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

// Activate: supprime les anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== QURAN_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: stratégie selon l'URL
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ne pas intercepter les requêtes non-GET ou cross-origin non-essentielles
  if (request.method !== 'GET') return;

  // Coran : données JSON des API (texte, minutage) — disponibles hors ligne une fois lues
  if (QURAN_API_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request, QURAN_CACHE));
    return;
  }

  // Récitations (MP3 externes) : laissées au navigateur (requêtes partielles / streaming)
  if (url.origin !== self.location.origin && /\.mp3$/i.test(url.pathname)) return;

  // Audio : stale-while-revalidate
  if (url.pathname.startsWith('/audio/')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // JSON data : network-first (données dynamiques)
  if (url.pathname.startsWith('/data/') && url.pathname.endsWith('.json')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // CSS, JS, images, fonts : cache-first
  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('{}', { headers: { 'Content-Type': 'application/json' } });
  }
}

async function staleWhileRevalidate(request, cacheName = CACHE_NAME) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || fetchPromise;
}
