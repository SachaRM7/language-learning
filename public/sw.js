// Service Worker — HelloArabic
// Chemins relatifs à la portée du SW (fonctionne sur GitHub Pages sous /<repo>/).
// Stratégies :
//   - code (HTML/CSS/JS) et données JSON : network-first → les mises à jour arrivent immédiatement, cache en secours hors-ligne
//   - images, polices, audio : stale-while-revalidate

const CACHE_VERSION = 'v2.7.0';
const CACHE_NAME = `helloarabic-${CACHE_VERSION}`;

const PRECACHE_ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'css/variables.css',
  'css/base.css',
  'css/motion.css',
  'js/motion.js',
  'css/components.css',
  'css/layout.css',
  'css/pages/home.css',
  'css/pages/parcours.css',
  'css/pages/words.css',
  'css/pages/conversations.css',
  'css/pages/review.css',
  'css/pages/explore.css',
  'js/app.js',
  'js/router.js',
  'js/store.js',
  'js/db.js',
  'js/audio.js',
  'js/utils.js',
  'js/srs.js',
  'js/icons.js',
  'js/ui.js',
  'js/activity.js',
  'js/parcours.js',
  'js/sync.js',
  'js/pages/tuteur.js',
  'css/pages/tuteur.css',
  'css/pages/coran.css',
  'css/desktop.css',
  'js/quran.js',
  'js/decks.js',
  'data/quran/index.json',
  'js/pages/words-common.js',
  'data/courses.json',
  'data/themes.json',
  'data/parcours.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(PRECACHE_ASSETS.map((a) => cache.add(a))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('helloarabic-') && k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  const isSameOrigin = url.origin === self.location.origin;
  if (isSameOrigin && url.pathname.includes('/api/')) return; // jamais de cache pour l'API
  const isFont = url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com');
  if (!isSameOrigin && !isFont) return;

  const isMedia = /\.(png|jpe?g|webp|gif|svg|mp3|ogg|wav|woff2?)$/i.test(url.pathname) || isFont;
  event.respondWith(isMedia ? staleWhileRevalidate(request) : networkFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const shell = await cache.match('index.html');
      if (shell) return shell;
    }
    return new Response('Hors-ligne', { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request).then((response) => {
    if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || (await network) || new Response('', { status: 504 });
}
