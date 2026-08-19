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
        // stale prefetch/navigation fetch when a newer one supersedes it)
        // rejects with AbortError — that's not a real failure and must
        // propagate as a normal cancellation, never get treated as a
        // reason to substitute other content.
        if (err && err.name === "AbortError") throw err;

        // Falling back to a substitute page only makes sense for a real,
        // full-page navigation (typing a URL, a hard refresh, opening the
        // installed app while offline) — request.mode is "navigate" for
        // those. Next.js's client-side router uses plain background
        // fetch() calls (mode "cors"/"same-origin") both for switching
        // routes AND for same-route query-param changes (e.g. the
        // day/week picker on /today, which re-fetches /today with
        // different ?day=/?week= params) — those almost never have an
        // exact cache hit (their signatures are effectively unique per
        // request), so any failure here used to fall through to
        // caches.match("/today"), silently replacing whatever the user
        // actually navigated to — a different route, or a different day/
        // week on the same route — with a stale snapshot of Today. For
        // anything that isn't a top-level navigation, let the failure
        // propagate instead so Next's router handles it as a failed
        // fetch rather than a fake success.
        if (req.mode !== "navigate") throw err;

        return caches.match(req).then((cached) => cached || caches.match("/today"));
      })
  );
});
