const CACHE_NAME = 'salestable-shell-v1';
const IMAGE_CACHE_NAME = 'product-images-v1';
const DATA_CACHE_NAME = 'salestable-data-v1';

// Initial base assets to precache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (
            cacheName !== CACHE_NAME &&
            cacheName !== IMAGE_CACHE_NAME &&
            cacheName !== DATA_CACHE_NAME
          ) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // 1. Handle API Requests (Network-First, fallback to Cache)
  if (url.pathname.startsWith('/api/')) {
    // Only cache safe GET endpoints like products list and cost categories
    if (url.pathname === '/api/products' || url.pathname === '/api/sheet-settings' || url.pathname === '/api/uploaded-images') {
      event.respondWith(
        fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(DATA_CACHE_NAME).then((cache) => {
                cache.put(request, copy);
              });
            }
            return response;
          })
          .catch(() => {
            return caches.match(request);
          })
      );
      return;
    }
    // Other API requests are bypasses
    return;
  }

  // 2. Handle Image Requests (Cache-First, update on network)
  const isImage = 
    request.destination === 'image' ||
    url.pathname.endsWith('.jpg') || 
    url.pathname.endsWith('.jpeg') || 
    url.pathname.endsWith('.png') || 
    url.pathname.endsWith('.gif') || 
    url.pathname.endsWith('.webp') || 
    url.pathname.endsWith('.svg') || 
    url.pathname.startsWith('/api/uploaded-images/') ||
    url.hostname.includes('googleusercontent.com') ||
    url.hostname.includes('drive.google.com') ||
    url.hostname.includes('imgur.com') ||
    url.search.includes('export=download');

  if (isImage) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then((cachedResponse) => {
        if (cachedResponse) {
          const contentType = cachedResponse.headers.get('content-type');
          if (contentType && contentType.includes('text/html')) {
            // Self-healing: delete corrupted cache entry and fall through to network
            caches.open(IMAGE_CACHE_NAME).then((cache) => {
              cache.delete(request, { ignoreSearch: true });
            });
          } else {
            return cachedResponse;
          }
        }
        return fetch(request).then((networkResponse) => {
          const contentType = networkResponse.headers.get('content-type');
          const isHtml = contentType && contentType.includes('text/html');

          // Allow caching of successful non-HTML responses (status 200) or opaque cross-origin responses (status 0)
          if (!isHtml && (networkResponse.ok || networkResponse.status === 200 || networkResponse.status === 0)) {
            const copy = networkResponse.clone();
            caches.open(IMAGE_CACHE_NAME).then((cache) => {
              cache.put(request, copy);
            });
          }
          return networkResponse;
        }).catch(() => {
          // If offline and not in cache, let the browser render custom default placeholder in UI
          return null;
        });
      })
    );
    return;
  }

  // 3. Handle Static Assets (Stale-While-Revalidate for JS/CSS/HTML)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse.ok) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, copy);
          });
        }
        return networkResponse;
      }).catch((err) => {
        if (request.mode === 'navigate') {
          return caches.match('/index.html') || caches.match('/');
        }
        throw err;
      });

      return cachedResponse || fetchPromise;
    })
  );
});
