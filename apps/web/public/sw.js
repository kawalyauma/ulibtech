/* EduShare service worker: installable PWA with basic offline support. */
const VERSION = 'v1';
const STATIC_CACHE = `es-static-${VERSION}`;
const PAGE_CACHE = `es-pages-${VERSION}`;
const IMAGE_CACHE = `es-images-${VERSION}`;
const PRECACHE = ['/offline', '/icon.svg', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request, cacheName, max) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    cache.put(request, res.clone());
    if (max) trim(cacheName, max);
  }
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000)),
    ]);
    if (res.ok) {
      cache.put(request, res.clone());
      trim(PAGE_CACHE, 40);
    }
    return res;
  } catch {
    return (await cache.match(request)) || (await caches.match('/offline')) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never intercept API calls or downloads (tracking and large files).
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/download/')) return;

  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/pdfjs/') ||
    url.pathname.startsWith('/icons/')
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
  if (url.pathname.startsWith('/media/thumbnails/')) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE, 200));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
  }
});
