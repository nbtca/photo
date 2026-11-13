const CACHE = 'shared-photos';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event =>
  event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const { request } = event;
  const { pathname } = new URL(request.url);
  if (request.method !== 'POST' || pathname !== '/share') return;
  event.respondWith((async () => {
    const files = (await request.formData())
      .getAll('photos')
      .filter(file => file instanceof File);
    await caches.delete(CACHE);
    const cache = await caches.open(CACHE);
    await Promise.all(files.map((file, index) => cache.put(
      `/shared/${index}`,
      new Response(file, {
        headers: {
          'Content-Type': file.type,
          'X-File-Name': encodeURIComponent(file.name),
        },
      }),
    )));
    return Response.redirect('/?shared', 303);
  })());
});
