// ── Service Worker — ChileCity RP ────────────────────────────────────────────
// Estrategia:
//   - /api/*           → SIEMPRE red (nunca cache: saldo, inventario, sesión, etc.
//                         son datos en vivo y cachearlos sería mostrar info vieja
//                         o de otro usuario).
//   - HTML (navegación) → cache-primero-con-carrera: si hay algo cacheado, se
//                         entrega al toque y la red actualiza el cache de fondo
//                         para la próxima visita. Si no hay nada cacheado, se
//                         espera a la red pero con timeout.
//   - JS/CSS/íconos     → mismo patrón que arriba (stale-while-revalidate con
//                         carrera corta). Antes esto era "network-first puro":
//                         esperaba SIEMPRE a la red antes de mostrar algo, y en
//                         celular con señal mala el fetch podía demorar mucho
//                         (o nunca resolver) antes de caer al cache — por eso
//                         a veces el CSS/JS no cargaba. Ahora, si ya existe una
//                         versión en cache, se muestra de inmediato (carrera de
//                         solo 300ms contra la red) y se sigue refrescando el
//                         cache en segundo plano. Los cambios de CSS/JS se ven
//                         igual "al toque" porque `?v=N` en las URLs genera una
//                         key de cache nueva apenas subes la versión.
//
// Subir CACHE_VERSION cuando quieras forzar que los clientes descarten TODO
// el cache anterior de una (por ejemplo si cambiaste muchos archivos a la vez).

const CACHE_VERSION = "v15";
const CACHE_NAME = `chilecity-${CACHE_VERSION}`;

// Cuánto esperamos a la red antes de rendirnos del todo cuando NO hay nada
// cacheado todavía (primera visita, o cache borrado).
const NETWORK_TIMEOUT_MS = 4000;

// Cuando SÍ hay algo cacheado, cuánto esperamos "por si la red es rapidísima"
// antes de simplemente mostrar lo cacheado y actualizar de fondo.
const RACE_MS = 300;

const PRECACHE_URLS = [
  "/",
  "/styles.css",
  "/favicon.svg",
  "/js/app.js",
  "/js/dashboard-fx.js",
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
  "/js/base-datos.js",
  "/js/perfil-publico.js",
  "/js/perfil-publico-inline.js",
  "/js/parallax-landing.js",
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

// Helper: red con timeout duro (se usa cuando NO hay nada en cache todavía).
function fetchConTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout de red")), ms);
    fetch(request, { cache: "no-store" }).then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// Estrategia principal: cache-primero-con-carrera + actualización de fondo.
async function staleWhileRevalidate(request, cacheKey) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(cacheKey || request);

  // Siempre disparamos la red para refrescar el cache, pase lo que pase.
  const networkPromise = fetch(request, { cache: "no-store" })
    .then((res) => {
      if (res.ok) cache.put(cacheKey || request, res.clone());
      return res;
    })
    .catch(() => null);

  if (cached) {
    // Ya hay algo que mostrar: le damos a la red solo RACE_MS por si es
    // rapidísima, si no, mostramos lo cacheado ya mismo. Nunca dejamos al
    // usuario esperando por una red lenta/inestable cuando ya hay algo útil.
    const rapido = await Promise.race([
      networkPromise,
      new Promise((resolve) => setTimeout(() => resolve(null), RACE_MS)),
    ]);
    return rapido || cached;
  }

  // No hay nada cacheado (primera visita): hay que esperar a la red sí o sí,
  // pero con timeout para no colgar la pestaña indefinidamente.
  try {
    const res = await fetchConTimeout(request, NETWORK_TIMEOUT_MS);
    if (res.ok) cache.put(cacheKey || request, res.clone());
    return res;
  } catch {
    const fallback = await cache.match(cacheKey || request);
    if (fallback) return fallback;
    throw new Error("sin red y sin cache");
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // nunca interceptar POST/PUT/DELETE

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // solo same-origin

  // /api/* y /auth/* → directo a la red, nunca cache.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
    return;
  }

  // Navegación (HTML) → cache-primero-con-carrera, usando "/" como key fija
  // (SPA de una sola página).
  if (request.mode === "navigate") {
    event.respondWith(
      staleWhileRevalidate(request, "/").catch(() => caches.match("/"))
    );
    return;
  }

  // Estáticos (JS/CSS/íconos) → mismo patrón.
  event.respondWith(
    staleWhileRevalidate(request).catch(() => caches.match(request))
  );
});
