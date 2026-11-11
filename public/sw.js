// Service worker mínimo: permite instalar la app. Siempre red primero (datos y código frescos);
// solo usa caché como respaldo si no hay internet. No toca Supabase ni peticiones que no sean GET.
const CACHE = "boaz-erp-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(
    fetch(r).then(res => {
      if (res.ok && (r.mode === "navigate" || /\.(js|css|png|svg|woff2?)$/.test(u.pathname))) {
        const copia = res.clone(); caches.open(CACHE).then(c => c.put(r, copia));
      }
      return res;
    }).catch(() => caches.match(r).then(m => m || (r.mode === "navigate" ? caches.match("/") : undefined)))
  );
});
