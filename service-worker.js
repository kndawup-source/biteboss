const CACHE_NAME = "biteboss-v75.20";
const SHELL = [
  "./",
  "./index.html?v=75.20",
  "./styles.css?v=75.20",
  "./bootstrap.js?v=75.20",
  "./app.js?v=75.20",
  "./app-config.js?v=75.20",
  "./supabase.js?v=75.20",
  "./ui-helpers.js?v=75.20",
  "./manifest.webmanifest?v=75.20",
  "./privacy-policy.html?v=75.20",
  "./support.html?v=75.20",
  "./admin.html?v=75.20",
  "./admin.css?v=75.20",
  "./admin.js?v=75.20",
  "./store-admin.html?v=75.20",
  "./store-admin.css?v=75.20",
  "./store-admin.js?v=75.20"
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

  // Serverless/API responses are live data and must never be satisfied from the app-shell cache.
  if(url.pathname.startsWith("/api/")){
    event.respondWith(fetch(request));
    return;
  }

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
          caches.match(request).then(hit => hit || caches.match("./index.html?v=75.20") || caches.match("./index.html"))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(hit => {
      const network = fetch(request)
        .then(response => {
          if(response.ok){
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});
