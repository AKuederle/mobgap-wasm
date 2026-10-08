/* Versioned runtime URLs are served only from a fully prepared asset cache. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const prefix = new URL('runtime-cached/', self.registration.scope);
  if (!url.href.startsWith(prefix.href)) return;
  const [version, ...parts] = url.pathname.slice(prefix.pathname.length).split('/');
  const asset = new URL(parts.filter(Boolean).join('/'), new URL('runtime/', self.registration.scope));
  event.respondWith((async () => {
    const cache = await caches.open(`mobgap-runtime-${version}`);
    const response = await cache.match(asset);
    if (!response) console.error('Analysis cache miss:', version, url.href, asset.href);
    return response ?? new Response('The prepared analysis cache is incomplete.', { status: 503 });
  })());
});
