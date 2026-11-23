const CACHE_SHELL = 'yole-shell-v3';
const CACHE_MEDIA = 'yole-media-v3';
const CACHE_API = 'yole-api-v3';

const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_SHELL).then((cache) => cache.addAll(SHELL_URLS)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  const valid = new Set([CACHE_SHELL, CACHE_MEDIA, CACHE_API]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !valid.has(k)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

async function staleWhileRevalidate(event, request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  const cached = (await cache.match(request)) || (fallbackUrl ? await cache.match(fallbackUrl) : null);

  const isOffline = typeof self.navigator !== 'undefined' && self.navigator.onLine === false;
  if (isOffline && cached) {
    return cached;
  }

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone()).catch(() => undefined);
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(networkPromise);
    return cached;
  }

  const net = await networkPromise;
  return net || Response.error();
}

async function networkFirstWithCache(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  const isOffline = typeof self.navigator !== 'undefined' && self.navigator.onLine === false;

  if (!isOffline) {
    try {
      const response = await fetch(request);
      if (response && response.ok) {
        cache.put(request, response.clone()).catch(() => undefined);
      }
      return response;
    } catch {
      // Fall through silently to cache
    }
  }

  const cached = await cache.match(request);
  if (cached) return cached;
  if (fallbackUrl) {
    const fb = await cache.match(fallbackUrl);
    if (fb) return fb;
  }
  return Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept Supabase auth endpoints
  if (url.pathname.includes('/auth/v1/')) return;

  // Navigation requests (SPA): instant cached shell + silent background update when online
  if (request.mode === 'navigate') {
    event.respondWith(staleWhileRevalidate(event, request, CACHE_SHELL, '/index.html'));
    return;
  }

  // Supabase Storage WebP product images & app images: cache-first + silent background refresh
  if (
    url.pathname.includes('/storage/v1/object/public/') ||
    request.destination === 'image'
  ) {
    event.respondWith(staleWhileRevalidate(event, request, CACHE_MEDIA));
    return;
  }

  // Supabase REST GET queries: network-first when online, cached silently when offline
  if (url.hostname.endsWith('supabase.co') && url.pathname.includes('/rest/v1/')) {
    event.respondWith(networkFirstWithCache(request, CACHE_API));
    return;
  }

  // Same-origin static assets (JS/CSS/fonts/manifest)
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(event, request, CACHE_SHELL));
  }
});
