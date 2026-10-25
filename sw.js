// Offline support: app files are served from the cache and refreshed in the background.
// Bump VERSION whenever you upload new app files.
const VERSION = "harden-2.4.0";
const SHELL = [
  "./", "index.html", "styles.css", "manifest.webmanifest",
  "js/app.js", "js/core.js", "js/reminders.js", "js/timer.js", "js/charts.js", "js/data.js", "js/logic.js", "js/github.js", "js/pdf.js",
  "js/views/dashboard.js", "js/views/session.js", "js/views/program.js", "js/views/measures.js",
  "js/views/report.js", "js/views/logbook.js", "js/views/settings.js", "js/views/payments.js",
  "vendor/pdf-lib.min.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.hostname === "api.github.com") return; // sync always goes to the network
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(e.request, { ignoreSearch: sameOrigin });
      const fresh = fetch(e.request).then((res) => {
        if (res.ok || res.type === "opaque") cache.put(e.request, res.clone());
        return res;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});
