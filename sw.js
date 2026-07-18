const CACHE_NAME = 'bateria-champeta-v200';
// Only real files — directories (/samplers/, /images/) 404 on GitHub Pages and break addAll
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/virtual.html',
  '/contactanos.html',
  '/sobre-nosotros.html',
  '/politicas-privacidad.html',
  '/manifest.json',
  '/samplers-catalog.json',
  '/styles/reset.css',
  '/styles/tokens.css',
  '/styles/components/nav.css',
  '/styles/components/ticker.css',
  '/styles/responsive.css',
  '/styles/common.css',
  '/js/site-config.js',
  '/styles/index.css',
  '/styles/virtual.css',
  '/styles/contactanos.css',
  '/styles/politicas-privacidad.css',
  '/styles/sobre-nosotros.css',
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

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Caching static assets');
        return precacheStatic(cache);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== SAMPLER_CACHE)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.origin === 'https://formspree.io' || url.origin.includes('google-analytics') || url.origin.includes('googletagmanager')) {
    return;
  }

  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request).then((fetchResponse) => {
          const responseClone = fetchResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return fetchResponse;
        });
      })
    );
    return;
  }

  if (url.origin === 'https://cdnjs.cloudflare.com') {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request).then((fetchResponse) => {
          const responseClone = fetchResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return fetchResponse;
        });
      })
    );
    return;
  }

  if (url.pathname.startsWith('/samplers/')) {
    event.respondWith(
      caches.open(SAMPLER_CACHE).then((cache) => {
        return cache.match(event.request).then((response) => {
          if (response) return response;
          return fetch(event.request).then((fetchResponse) => {
            if (fetchResponse.ok) {
              cache.put(event.request, fetchResponse.clone());
            }
            return fetchResponse;
          }).catch(() => {
            return new Response('Audio file not available offline', { status: 404 });
          });
        });
      })
    );
    return;
  }

  if (url.origin === location.origin) {
    // JS/CSS network-first — avoids stale module exports vs new importers (cache-first mismatch)
    if (/\.(js|css)$/.test(url.pathname)) {
      event.respondWith(
        fetch(event.request)
          .then((fetchResponse) => {
            if (fetchResponse.ok) {
              const clone = fetchResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return fetchResponse;
          })
          .catch(() => caches.match(event.request).then((r) => r || new Response('Offline', { status: 503 })))
      );
      return;
    }

    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request).catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('/virtual.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
    );
  }
});
