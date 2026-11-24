const CACHE_SHELL = 'yole-shell-v10';
const CACHE_MEDIA = 'yole-media-v10';
const CACHE_API = 'yole-api-v10';

const SHELL_URLS = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

function stripRedirect(response) {
  if (!response || !response.redirected) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_SHELL)
      .then((cache) =>
        Promise.all(
          SHELL_URLS.map((u) =>
            fetch(u)
              .then((res) => (res && res.ok ? cache.put(u, stripRedirect(res)) : undefined))
              .catch(() => undefined)
          )
        )
      )
      .catch(() => undefined)
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
  const rawCached =
    (await cache.match(request)) || (fallbackUrl ? await cache.match(fallbackUrl) : null);
  const cached =
    rawCached && (request.mode !== 'cors' || rawCached.type !== 'opaque')
      ? stripRedirect(rawCached)
      : null;

  const isOffline = typeof self.navigator !== 'undefined' && self.navigator.onLine === false;
  if (isOffline && (cached || rawCached)) {
    return stripRedirect(cached || rawCached);
  }

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok && !response.redirected) {
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
      if (response && response.ok && !response.redirected) {
        const clean = stripRedirect(response.clone());
        cache.put(request, clean).catch(() => undefined);
      }
      return request.mode === 'navigate' ? stripRedirect(response) : response;
    } catch {
      // Fall through silently to cache
    }
  }

  const cached = await cache.match(request);
  if (cached) return stripRedirect(cached);
  if (fallbackUrl) {
    const fb = await cache.match(fallbackUrl);
    if (fb) return stripRedirect(fb);
  }
  return Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept Supabase auth endpoints or Studio Lexair Ads network
  if (
    url.pathname.includes('/auth/v1/') ||
    url.pathname.includes('/functions/v1/') ||
    url.hostname === 'studiolexair.ddns.net'
  ) {
    return;
  }

  // Navigation requests (SPA): network-first when online, cached clean shell when offline
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithCache(request, CACHE_SHELL, '/'));
    return;
  }

  // Own Supabase Storage WebP product images & same-origin images
  if (
    (url.hostname === 'lroyrrgcjjtijwutykzm.supabase.co' &&
      url.pathname.includes('/storage/v1/object/public/')) ||
    (url.origin === self.location.origin && request.destination === 'image')
  ) {
    event.respondWith(staleWhileRevalidate(event, request, CACHE_MEDIA));
    return;
  }

  // Own Supabase REST GET queries: network-first when online, cached silently when offline
  if (
    url.hostname === 'lroyrrgcjjtijwutykzm.supabase.co' &&
    url.pathname.includes('/rest/v1/')
  ) {
    event.respondWith(networkFirstWithCache(request, CACHE_API));
    return;
  }

  // Same-origin static assets (JS/CSS/fonts/manifest)
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(event, request, CACHE_SHELL));
  }
});
