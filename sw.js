const CACHE_NAME = 'bateria-champeta-v220';

/**
 * Precache only real files (GitHub Pages returns 404 for bare directories).
 * Keep in sync with pages that fetch chrome (header/nav) and shared CSS/JS.
 */
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/virtual.html',
  '/contactanos.html',
  '/sobre-nosotros.html',
  '/politicas-privacidad.html',
  '/header.html',
  '/nav.html',
  '/manifest.json',
  '/samplers-catalog.json',
  '/styles/reset.css',
  '/styles/tokens.css',
  '/styles/components/nav.css',
  '/styles/components/ticker.css',
  '/styles/components/whatsapp-fab.css',
  '/styles/responsive.css',
  '/styles/common.css',
  '/styles/index.css',
  '/styles/virtual.css',
  '/styles/contactanos.css',
  '/styles/politicas-privacidad.css',
  '/styles/sobre-nosotros.css',
  '/js/site-config.js',
  '/js/common.js',
  '/js/audio-bus.js',
  '/js/audio-visualizer.js',
  '/js/sampler-path.js',
  '/js/sampler-browser.js',
  '/js/sampler-preview.js',
  '/js/note-repeat.js',
  '/js/pad-grid-config.js',
  '/js/pad-keyboard.js',
  '/js/session-recorder.js',
  '/js/battery-presets.js',
  '/js/pattern-loop.js',
  '/js/kit-config-share.js',
  '/js/virtual.js',
  '/js/contactanos.js',
  '/js/modal-utils.js',
  '/js/politicas-privacidad.js',
  '/js/sobre-nosotros.js',
  '/js/whatsapp-group-icon.js',
];

const SAMPLER_CACHE = 'bateria-champeta-samplers-v1';

/** Cache each URL; skip failures so one 404 does not abort install. */
async function precacheStatic(cache) {
  await Promise.all(
    STATIC_ASSETS.map(async (url) => {
      try {
        await cache.add(url);
      } catch (err) {
        console.warn('SW precache skip:', url, err);
      }
    })
  );
}

function putInCache(request, response) {
  if (!response || !response.ok) return;
  const clone = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
}

/** Network-first with cache fallback (JS/CSS/HTML navigations). */
function networkFirst(request) {
  return fetch(request)
    .then((response) => {
      putInCache(request, response);
      return response;
    })
    .catch(() =>
      caches.match(request).then((cached) => {
        if (cached) return cached;
        if (request.mode === 'navigate') {
          return caches.match('/virtual.html').then((page) => page || new Response('Offline', { status: 503 }));
        }
        return new Response('Offline', { status: 503 });
      })
    );
}

/** Cache-first with network fill (fonts / CDN). */
function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      putInCache(request, response);
      return response;
    });
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(precacheStatic).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== SAMPLER_CACHE)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Ads / analytics / forms — never intercept
  if (
    url.origin === 'https://formspree.io' ||
    url.hostname.includes('google-analytics') ||
    url.hostname.includes('googletagmanager') ||
    url.hostname.includes('googlesyndication')
  ) {
    return;
  }

  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (url.origin === 'https://cdnjs.cloudflare.com') {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Samplers: cache-on-success (large files, offline replay)
  if (url.origin === location.origin && url.pathname.startsWith('/samplers/')) {
    event.respondWith(
      caches.open(SAMPLER_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          }).catch(() => new Response('Audio file not available offline', { status: 404 }));
        })
      )
    );
    return;
  }

  if (url.origin !== location.origin) return;

  // App shell: network-first so deploys win over stale Cache Storage
  if (request.mode === 'navigate' || /\.(js|css|html)$/.test(url.pathname) || url.pathname.endsWith('/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).catch(() => new Response('Offline', { status: 503 })))
  );
});
