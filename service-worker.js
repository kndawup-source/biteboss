const BUILD = "75.88";
const CACHE_NAME = `biteboss-v${BUILD}`;
const versioned = path => `${path}?v=${BUILD}`;
const SHELL = [
  "./",
  versioned("./index.html"),
  versioned("./styles.css"),
  versioned("./bootstrap.js"),
  versioned("./app.js"),
  versioned("./app-config.js"),
  versioned("./supabase.js"),
  versioned("./manifest.webmanifest"),
  versioned("./privacy-policy.html"),
  versioned("./support.html"),
  versioned("./admin.html"),
  versioned("./admin.css"),
  versioned("./admin.js"),
  versioned("./store-admin.html"),
  versioned("./store-admin.css"),
  versioned("./store-admin.js")
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
          caches.match(request).then(hit => hit || caches.match(versioned("./index.html")) || caches.match("./index.html"))
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
