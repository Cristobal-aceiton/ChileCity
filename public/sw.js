// ── Service Worker — ChileCity RP ────────────────────────────────────────────
// Estrategia:
//   - /api/*           → SIEMPRE red (nunca cache: saldo, inventario, sesión, etc.
//                         son datos en vivo y cachearlos sería mostrar info vieja
//                         o de otro usuario).
//   - HTML (navegación) → network-first con fallback a cache si no hay señal.
//   - JS/CSS/íconos     → network-first con fallback a cache: siempre intenta
//                         traer la versión más nueva del servidor primero, y
//                         solo usa lo cacheado si no hay conexión. Así los
//                         cambios de CSS/JS se ven al toque sin depender de que
//                         alguien recuerde subir CACHE_VERSION en cada deploy.
//
// Subir CACHE_VERSION cuando quieras forzar que los clientes descarten TODO
// el cache anterior de una (por ejemplo si cambiaste muchos archivos a la vez).

const CACHE_VERSION = "v11";
const CACHE_NAME = `chilecity-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "/",
  "/styles.css",
  "/favicon.svg",
  "/js/app.js",
  "/js/notificaciones.js",
  "/js/registro-civil.js",
  "/js/banco.js",
  "/js/tienda.js",
  "/js/vehiculos.js",
  "/js/concesionario.js",
  "/js/mis-autos.js",
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
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {
        // Si falla el precache (ej. sin red en el install), no bloqueamos
        // la instalación del SW — igual sirve para lo que ya se cachee después.
      })
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

  // Estáticos (JS/CSS/íconos) → network-first: intenta traer lo último del
  // servidor y actualiza el cache; si no hay red, recién ahí usa lo cacheado.
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request))
  );
});
