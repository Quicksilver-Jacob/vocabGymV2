// VocabGym - Service Worker (PWA offline support)
var CACHE_APP = 'v1-app-shell';
var CACHE_JS = 'v1-js-core';
var CACHE_DATA = 'v1-js-data';
var CACHE_CDN = 'v1-cdn';
var CACHE_AUDIO = 'v1-audio';

// Files to pre-cache on install
var APP_SHELL = [
  '/',
  '/index.html'
];

var JS_CORE = [
  '/js/vocab-gym.js',
  '/js/core.js',
  '/js/db.js',
  '/js/speech.js',
  '/js/session-core.js',
  '/js/share.js',
  '/js/ui-dashboard.js',
  '/js/ui-dictation.js',
  '/js/ui-multiple-choice.js',
  '/js/ui-spelling.js',
  '/js/ui-ledger.js',
  '/js/ui-search.js',
  '/js/ui-wordcard.js',
  '/js/ui-profiles.js',
  '/js/srs.js'
];

var CDN_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

// Install: pre-cache static assets
self.addEventListener('install', function(e) {
  e.waitUntil(
    Promise.all([
      caches.open(CACHE_APP).then(function(c) { return c.addAll(APP_SHELL); }),
      caches.open(CACHE_JS).then(function(c) { return c.addAll(JS_CORE); }),
      caches.open(CACHE_CDN).then(function(c) { return c.addAll(CDN_URLS); })
    ]).then(function() {
      return self.skipWaiting();
    })
  );
});

// Activate: clean old caches
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.map(function(key) {
          if (key !== CACHE_APP && key !== CACHE_JS && key !== CACHE_DATA && key !== CACHE_CDN && key !== CACHE_AUDIO) {
            return caches.delete(key);
          }
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch: route by type
self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);

  // Skip non-GET
  if (e.request.method !== 'GET') return;

  // Audio: network first, cache on success
  if (url.hostname === 'dict.youdao.com' && url.pathname === '/dictvoice') {
    e.respondWith(
      caches.open(CACHE_AUDIO).then(function(cache) {
        return cache.match(e.request).then(function(cached) {
          return fetch(e.request).then(function(response) {
            if (response.ok) cache.put(e.request, response.clone());
            return response;
          }).catch(function() {
            return cached || new Response('Audio unavailable offline', { status: 503 });
          });
        });
      })
    );
    return;
  }

  // CDN: cache first
  if (CDN_URLS.some(function(u) { return e.request.url.indexOf(u) >= 0; })) {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        return cached || fetch(e.request).then(function(response) {
          return caches.open(CACHE_CDN).then(function(cache) {
            cache.put(e.request, response.clone());
            return response;
          });
        });
      })
    );
    return;
  }

  // JS files: cache first
  if (url.pathname.endsWith('.js')) {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        return cached || fetch(e.request).then(function(response) {
          return caches.open(CACHE_JS).then(function(cache) {
            cache.put(e.request, response.clone());
            return response;
          });
        });
      })
    );
    return;
  }

  // HTML / root: cache first
  if (e.request.destination === 'document' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        return cached || fetch(e.request).then(function(response) {
          return caches.open(CACHE_APP).then(function(cache) {
            cache.put(e.request, response.clone());
            return response;
          });
        });
      })
    );
    return;
  }

  // Large data files: stale-while-revalidate (lazy cached on first fetch)
  if (url.pathname.indexOf('/js/dictionary.js') >= 0 ||
      url.pathname.indexOf('/js/sentences.js') >= 0 ||
      url.pathname.indexOf('/js/exchange-data.js') >= 0 ||
      url.pathname.indexOf('/js/root-') >= 0 ||
      url.pathname.indexOf('/js/ielts-vocab-data.js') >= 0) {
    e.respondWith(
      caches.open(CACHE_DATA).then(function(cache) {
        return cache.match(e.request).then(function(cached) {
          var fetchPromise = fetch(e.request).then(function(response) {
            if (response.ok) cache.put(e.request, response.clone());
            return response;
          });
          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  // Default: network first for everything else
  e.respondWith(
    fetch(e.request).catch(function() {
      return caches.match(e.request);
    })
  );
});
