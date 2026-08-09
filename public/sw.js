/* Karti offline service worker.
 * - NetworkFirst for HTML navigations (with cache fallback for offline).
 * - CacheFirst for hashed static assets.
 * - Skips non-GET and cross-origin (Supabase / API) requests.
 */
const VERSION = 'karti-v4';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const SHELL_URLS = [
  '/',
  '/auth',
  '/app',
  '/app/cabin',
  '/app/cards',
  '/app/manage-cards',
  '/app/packages',
  '/app/sales',
  '/app/customers',
  '/app/payments',
  '/app/agents',
  '/app/networks',
  '/app/requests',
  '/app/settings',
  '/offline.html',
  '/manifest.webmanifest',
  '/favicon.ico',
];


self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.allSettled(SHELL_URLS.map((u) => cache.add(u).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith('karti-') && !n.startsWith(VERSION))
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

function isAssetRequest(url) {
  return (
    url.pathname.startsWith('/_build/') ||
    url.pathname.startsWith('/assets/') ||
    /\.(js|css|woff2?|ttf|otf|png|jpg|jpeg|svg|webp|ico)$/i.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Only handle same-origin requests. Supabase/API traffic goes to the network as usual.
  if (url.origin !== self.location.origin) return;

  // HTML navigations: network-first, fallback to cached shell.
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(SHELL_CACHE);
          cache.put(req, fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const cached = (await cache.match(req)) || (await cache.match('/')) || (await cache.match('/app'));
          if (cached) return cached;
          return new Response(
            '<!doctype html><meta charset="utf-8"><title>غير متصل</title><body style="font-family:system-ui;padding:24px;text-align:center" dir="rtl"><h1>لا يوجد اتصال</h1><p>سيتم استئناف العمل تلقائياً عند عودة الإنترنت.</p></body>',
            { headers: { 'content-type': 'text/html; charset=utf-8' }, status: 200 },
          );
        }
      })(),
    );
    return;
  }

  // Hashed static assets: cache-first.
  if (isAssetRequest(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const fresh = await fetch(req);
          if (fresh.ok) cache.put(req, fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          if (cached) return cached;
          throw new Error('offline-and-no-cache');
        }
      })(),
    );
  }
});
