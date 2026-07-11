// ── Service Worker — ChileCity RP ────────────────────────────────────────────
//
// ⚠️ CHECKLIST — LEER ANTES DE CADA DEPLOY QUE TOQUE public/*.css o public/js/*.js:
//   1) Sube CACHE_VERSION acá abajo (ej: "v25" → "v26").
//   2) Sube el mismo número en TODOS los `?v=` de <link>/<script> en index.html
//      (el link de styles.css y CADA <script src="/js/...">).
//   Si te olvidas de esto, el navegador puede seguir sirviendo JS/CSS viejo
//   indefinidamente en celulares — no por un bug del SW, sino porque el
//   navegador solo re-descarga un archivo si su URL cambia o si detecta que
//   sw.js cambió byte a byte. Este checklist es la única fuente de verdad.
//
// ── Por qué el CSS/JS a veces no se actualizaba (causa raíz) ────────────────
//   Antes, `styles.css` sí tenía `?v=N` en el HTML, pero los `/js/*.js` NO
//   tenían ningún parámetro de versión: se pedían siempre con la MISMA url
//   exacta. Eso significa que la cache-key en el Cache Storage nunca cambiaba
//   aunque el contenido del archivo sí. El SW usaba "stale-while-revalidate"
//   (mostrar lo cacheado ya mismo, actualizar en segundo plano) — perfecto
//   para velocidad, pero si la re-descarga en segundo plano nunca alcanzaba a
//   completarse (señal mala, app en background, pestaña cerrada antes de
//   tiempo) el usuario podía quedarse días con un JS desactualizado sin
//   ningún indicio visual de que eso pasaba.
//
//   La solución real no es "cachear mejor", es "versionar todo": cada archivo
//   estático ahora se pide con `?v=N` en la URL. Eso hace que cada versión
//   sea, para el navegador y el Cache Storage, un recurso *distinto* — nunca
//   hay ambigüedad entre "la versión vieja cacheada" y "la nueva". Por eso
//   ahora los estáticos versionados usan cache-first (son inmutables: si la
//   URL no cambió, el contenido tampoco) y el HTML (que es el que declara
//   qué `?v=` usar) usa network-first, para que SIEMPRE se sepa cuál es la
//   última versión disponible en cuanto haya señal.
//
// ── Estrategia final ─────────────────────────────────────────────────────────
//   - /api/*, /auth/*        → SIEMPRE red, nunca cache (saldo, sesión, etc.)
//   - Navegación (HTML)      → network-first con timeout corto, cae a cache
//                              solo si no hay red. Así el HTML (que decide
//                              qué versión de CSS/JS pedir) es lo más fresco
//                              posible siempre que haya conexión.
//   - Estáticos CON ?v=      → cache-first (inmutables por versión: si ya
//                              está cacheada esa versión exacta, se sirve al
//                              toque sin ir a la red; si es nueva, se pide y
//                              se cachea de una).
//   - Estáticos SIN ?v=      → stale-while-revalidate (íconos, manifest,
//                              favicon: cambian poco y no es crítico que se
//                              vean "al toque" tras un deploy).

const CACHE_VERSION = "v53";
const CACHE_NAME = `chilecity-${CACHE_VERSION}`;

// Cuánto esperamos a la red para HTML/estáticos versionados nuevos antes de
// rendirnos y caer a cache (si existe) o fallar.
const NETWORK_TIMEOUT_MS = 4000;

const PRECACHE_URLS = [
  "/",
  `/styles.css?v=${CACHE_VERSION.replace("v", "")}`,
  `/page-loader.css?v=${CACHE_VERSION.replace("v", "")}`,
  `/clean-theme.css?v=${CACHE_VERSION.replace("v", "")}`,
  "/favicon.svg",
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

// Helper: red con timeout duro. Usa AbortController de verdad (no un simple
// setTimeout que "abandona" la promesa) para no dejar fetches colgados, y
// para no reventar si `resolve`/`reject` ya se llamó una vez.
function fetchConTimeout(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(request, { cache: "no-store", signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

// Network-first: intenta red primero (con timeout), cae a cache si falla.
// Tiene sentido cortar acá porque SIEMPRE hay un fallback razonable (el HTML
// cacheado de la versión anterior).
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await fetchConTimeout(request, NETWORK_TIMEOUT_MS);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error("sin red y sin cache");
  }
}

// Cache-first: para estáticos versionados (?v=N). Como la URL cambia cada
// vez que cambia el contenido, "ya está en cache" == "es exactamente esta
// versión" — no hay riesgo de servir algo desactualizado.
//
// ⚠️ IMPORTANTE: acá NO se usa timeout. Si hay un cache-miss (primera vez que
// se pide esta versión, típicamente recién hecho un deploy) no existe ningún
// fallback razonable — el archivo viejo ya no sirve porque es otra versión.
// Antes esto usaba el mismo timeout "duro" de 4s que networkFirst: en una
// conexión de celular lenta, si la descarga tardaba justo un poco más de 4s,
// la promesa se rechazaba por timeout pero el fetch real seguía en curso en
// segundo plano — y cuando por fin respondía (incluso con éxito), llamaba a
// resolve() sobre una promesa que ya había sido rechazada, así que esa
// respuesta se descartaba y NUNCA se guardaba en cache. El resultado: justo
// ese archivo (un CSS o algún JS puntual) fallaba esa vez sin reintento,
// mientras que el resto de los archivos —que sí alcanzaron a bajar a
// tiempo— se veían bien. Eso es lo que se sentía como "el CSS no se
// actualiza en algunas partes": no era una versión vieja, era una descarga
// que fallaba en seco. Ahora simplemente se espera a la red, sin cortar
// antes de tiempo.
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request, { cache: "no-store" });
  if (res.ok) cache.put(request, res.clone());
  return res;
}

// Stale-while-revalidate: para estáticos sin versión (íconos, manifest).
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const networkPromise = fetch(request, { cache: "no-store" })
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  if (cached) return cached;
  return (await networkPromise) || cache.match(request);
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

  // Navegación (HTML) → network-first, usando la URL real pedida como key.
  // ⚠️ Antes el sitio era una sola página (SPA) y acá se forzaba siempre la
  // key "/", así que cualquier navegación (a /banco.html, /casino.html, etc.)
  // terminaba sirviendo el HTML de la landing. Ahora que cada apartado es un
  // archivo .html real, cada navegación debe cachear y responder con SU
  // propia URL — si no, el service worker "secuestra" toda navegación de
  // vuelta a la landing en cuanto queda instalado en el dispositivo.
  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst(request)
        .catch(() => caches.match(request))
        .then((res) => res || caches.match("/"))
    );
    return;
  }

  const tieneVersion = url.searchParams.has("v");

  if (tieneVersion) {
    event.respondWith(cacheFirst(request).catch(() => caches.match(request)));
  } else {
    event.respondWith(staleWhileRevalidate(request).catch(() => caches.match(request)));
  }
});

// Permite forzar la activación inmediata del SW en espera desde la página
// (ej. un botón "Actualizar ahora" en el banner de nueva versión) enviando
// { type: "SKIP_WAITING" } vía postMessage.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
