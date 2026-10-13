const CACHE_NAME = "biteboss-v72.3";
const SHELL = [
  "./",
  "./index.html?v=72.3",
  "./styles.css?v=72.3",
  "./bootstrap.js?v=72.3",
  "./app.js?v=72.3",
  "./app-config.js?v=72.3",
  "./supabase.js?v=72.3",
  "./manifest.webmanifest?v=72.3",
  "./privacy-policy.html?v=72.3",
  "./support.html?v=72.3"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith("biteboss-") && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if(request.method !== "GET") return;

  const url = new URL(request.url);
  if(url.origin !== self.location.origin) return;

  const isNavigation = request.mode === "navigate";
  const isCriticalAsset = /\/(?:app\.js|styles\.css|index\.html)(?:\?|$)/.test(url.pathname + url.search);

  if(isNavigation || isCriticalAsset){
    event.respondWith(
      fetch(request, { cache:"no-store" })
        .then(response => {
          if(response.ok){
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then(hit => hit || caches.match("./index.html?v=72.3") || caches.match("./index.html"))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(hit => {
      const network = fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});
