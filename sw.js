const CACHE_NAME = "boyaca-bmx-pwa-v15";
const ASSETS_TO_CACHE = [
  "./",
  "./app.html",
  "./login.html",
  "./index.html",
  "./registro.html",
  "./registro-valida.html",
  "./admin.html",
  "./portal-store.js",
  "./js/store.js",
  "./manifest.json",
  "./assets/hero-bmx.webp",
  "./assets/hero-bmx.jpg",
  "./assets/flyer-valida.webp",
  "./assets/flyer-valida.jpg",
  "./assets/icon.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE).catch(() => {}))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(async () => {
        // Buscar en cache ignorando query params (ej: store.js?v=9 -> store.js)
        const cached = await caches.match(event.request, { ignoreSearch: true });
        if (cached) return cached;
        // Solo para navegación de páginas retornar app.html
        if (event.request.mode === 'navigate') {
          const appHtml = await caches.match('./app.html');
          if (appHtml) return appHtml;
        }
        return new Response('Red no disponible', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      })
  );
});
