self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("reps-v1").then((cache) =>
      cache.addAll(["/today", "/icon-192.png", "/icon-512.png"])
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open("reps-v1").then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch((err) => {
        // A request the page itself cancelled (e.g. Next.js aborting a
        // stale prefetch/navigation fetch when the user navigates again
        // before the first one resolves — very routine, happens on every
        // quick tab switch) rejects with AbortError. That must propagate
        // as a normal cancellation, not get swallowed into a fake
        // "successful" fallback response: since /today is the only route
        // precached at install and exact RSC-fetch URLs almost never
        // get a real cache hit (they carry unique per-request query
        // params), any swallowed abort here fell through to
        // caches.match("/today") — silently serving Today's page in
        // place of whatever route (Routines, Progress, ...) was actually
        // being navigated to.
        if (err && err.name === "AbortError") throw err;
        return caches.match(req).then((cached) => cached || caches.match("/today"));
      })
  );
});
