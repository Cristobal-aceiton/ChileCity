// ── Service Worker — ChileCity RP ────────────────────────────────────────────
// Estrategia:
//   - /api/*           → SIEMPRE red (nunca cache: saldo, inventario, sesión, etc.
//                         son datos en vivo y cachearlos sería mostrar info vieja
//                         o de otro usuario).
//   - HTML (navegación) → network-first con fallback a cache si no hay señal.
//   - JS/CSS/íconos     → cache-first con actualización en segundo plano
//                         (stale-while-revalidate), para que la app cargue
//                         instantáneo y de paso quede medio-funcional offline.
//
// Subir CACHE_VERSION cuando cambien JS/CSS importantes para forzar que los
// clientes viejos descarten el cache anterior.

const CACHE_VERSION = "v19";
const CACHE_NAME = `chilecity-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "/",
  "/styles.css?v=19",
  "/favicon.svg",
  "/js/app.js",
  "/js/notificaciones.js",
  "/js/registro-civil.js",
  "/js/banco.js",
  "/js/tienda.js",
  "/js/admin-tienda.js",
  "/js/empresas.js",
  "/js/logros.js",
  "/js/panel-admin.js",
  "/js/comisaria.js",
  "/js/casino.js",
  "/js/apuestas.js",
  "/js/pull-to-refresh.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        // cache:"reload" ignora el cache HTTP del navegador (Cache-Control:
        // max-age de /js/*.js y /styles.css) y va directo a la red, así el
        // precache siempre agarra la versión real más nueva y no una que el
        // navegador ya tenía guardada de antes (esto era lo que causaba que
        // un dispositivo quedara con JS/CSS viejo y otro no, dependiendo de
        // si ya había pedido esos archivos en la última hora).
        PRECACHE_URLS.map((url) =>
          fetch(url, { cache: "reload" })
            .then((res) => {
              if (res.ok) return cache.put(url, res);
            })
            .catch(() => {
              // Si un archivo puntual falla (sin red, etc.) no bloqueamos
              // el resto del precache.
            })
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(
          nombres
            .filter((nombre) => nombre.startsWith("chilecity-") && nombre !== CACHE_NAME)
            .map((nombre) => caches.delete(nombre))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // nunca interceptar POST/PUT/DELETE

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // solo same-origin

  // /api/* y /auth/* → directo a la red, nunca cache.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
    return;
  }

  // Navegación (HTML) → network-first, fallback a cache si no hay señal.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // Estáticos (JS/CSS/íconos) → stale-while-revalidate.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    )
  );
});
