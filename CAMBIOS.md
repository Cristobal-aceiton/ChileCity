# Cambios aplicados — ChileCity RP v23 (botón único "Admin" + fix de seguridad en Policía Virtual)

## ⚠️ Variables de entorno requeridas

Las mismas que v22 — sin cambios. El acceso admin sigue funcionando igual
que siempre: `SUPER_ADMIN_ID` (o la variable de entorno) más la tabla
`admins`, que el super admin gestiona **desde dentro del propio Panel
Admin**, agregando IDs de Discord.

---

## 🧭 Un solo botón "Admin" para todo el staff

Antes existían pantallas administrativas (Admin Banco, Admin Tienda, Admin
Empresas, Admin Casino, Panel Admin) sin ningún botón real que llevara a
ellas — habían quedado huérfanas tras un cambio anterior. Ahora:

- La card **"Admin"** del dashboard (visible para cualquier usuario logueado)
  abre `panel-admin-screen`, que primero **analiza el acceso** contra el
  servidor (`GET /api/admin?action=verificar`, nunca confía en el cliente)
  con la misma animación de "Analizando tu acceso..." que ya usaba Comisaría.
  - Si la cuenta no está en la tabla `admins` → pantalla de "Sin acceso" con
    botón para volver al dashboard.
  - Si es admin → se muestra el hub con una grilla de **Herramientas**
    (Admin Banco / Admin Tienda / Admin Empresas / Admin Casino) que antes
    no tenían ningún punto de entrada, más las secciones que ya existían:
    Enviar Notificación, Gestión de Policías Virtuales y Gestión de Logros.
  - La sección "Gestión de Admins" (agregar/quitar por Discord ID) sigue
    siendo **exclusiva del super admin** — se oculta para el resto.
- Los 4 sub-paneles (Admin Banco/Tienda/Empresas/Casino) ahora regresan con
  su botón "Volver" al hub del Panel Admin (`volverPanelAdmin()`) en vez de
  saltar directo al dashboard, para reforzar que son herramientas agrupadas.
- La card **"Staff"** ahora abre Comisaría Virtual (`abrirComisaria()`),
  donde ya vivían las herramientas de Policía Virtual (se muestran solas si
  la cuenta está autorizada como policía).

## 🔒 Seguridad — Gestión de Policía Virtual sin protección

Se detectó que `api/comisaria.js` tenía comentarios de "solo admins" en
`autorizarPolicia`, `revocarPolicia`, `listarPolicias` y `buscarPolicia`,
pero **nunca validaba esa condición en el código** — cualquier sesión válida
(cualquier usuario logueado) podía llamar esas rutas directamente y
otorgarse a sí mismo (o a cualquiera) el rol de Policía Virtual, sin pasar
por el Panel Admin ni por ningún admin real. Corregido: las cuatro rutas
ahora validan explícitamente contra la tabla `admins` antes de ejecutar
cualquier cambio. El endpoint de `logs` ahora acepta tanto a policías como
a admins (antes solo a policías).

### Archivos tocados
- `api/comisaria.js` — nuevo helper `esAdminComisaria()`, gate en
  `listarPolicias`, `buscarPolicia`, `autorizarPolicia`, `revocarPolicia`,
  `logs`.
- `public/index.html` — cards "Admin"/"Staff" con `onclick`, grilla de
  Herramientas dentro de `panel-admin-screen`, bloques de "Analizando
  acceso" / "Sin acceso", botones "Volver" de los 4 sub-paneles apuntando
  al hub.
- `public/js/app.js` — `abrirPanelAdmin()`, `volverPanelAdmin()`,
  `abrirAdminBanco()`, `abrirAdminTiendaPanel()`, `abrirAdminEmpresasPanel()`.
- `public/js/comisaria.js` — eliminado código muerto de inyección dinámica
  de la tab de policías (apuntaba a un `id` de card que ya no existía).

---



## ⚠️ Variables de entorno requeridas

Las mismas que v20 — sin cambios.

---

## 📱 Pull-to-refresh en pantallas con datos en vivo

Nuevo `public/js/pull-to-refresh.js`: gesto táctil genérico (sin librerías)
que detecta el arrastre hacia abajo cuando el `scrollTop` de la pantalla ya
está en 0, con resistencia progresiva y un indicador giratorio. Activado en:

- **Banco** (`#banco-screen`) → refresca saldo y cuenta (`cargarBanco()`).
- **Apuestas** (`#apuestas-screen`) → refresca saldo y, según la pestaña
  activa, partidos o historial personal (nueva función `apRefrescarActivo()`
  en `apuestas.js`).
- **Campanita de notificaciones** (`#notif-list`) → refresca la bandeja
  (`notifCargar()`). El indicador se cuelga como hermano de la lista, no
  como hijo, porque `notifRenderLista()` reemplaza el `innerHTML` de la
  lista en cada sondeo y lo hubiera borrado.

Da un pulso corto de vibración (`navigator.vibrate(12)`) justo al cruzar el
umbral de soltar, como confirmación táctil de que el refresco se va a
disparar.

## 📡 Indicador de sin conexión

Nuevo banner discreto (`#offline-banner` en `app.js`) que escucha los
eventos `online`/`offline` del navegador y se muestra en la parte superior
de la pantalla con el texto "Sin conexión — mostrando datos guardados".
El `sw.js` ya servía contenido cacheado sin red, pero eso era invisible
para el usuario — esto evita que alguien haga una apuesta o transferencia
creyendo que se procesó cuando en realidad nunca llegó al servidor.

## 📳 Haptic feedback (navigator.vibrate)

- `feedbackResultado()` en `app.js` — el punto único ya compartido entre
  Casino y Apuestas Deportivas para victorias/derrotas — ahora vibra
  además de sonar: patrón doble corto en victoria, pulso seco en derrota.
  Cubre automáticamente todos los juegos de casino y las apuestas
  deportivas sin tocar cada archivo de juego por separado.
- `notifCargar()` en `notificaciones.js` — vibración corta al llegar una
  notificación nueva (multa, transferencia recibida, resultado de apuesta),
  junto con el sonido y la animación de campanita que ya existían.
- Todas las llamadas están envueltas en `if (navigator.vibrate)` + try/catch:
  en navegadores que no lo soportan (Safari/iOS) quedan como no-op, no
  rompen nada.

## 🧾 Recibo de transferencia (reemplaza el toast de 3s)

Nuevo modal `#modal-recibo-transferencia` (mismo patrón visual que los
modales admin existentes: `admin-modal-overlay` + `.visible`), con ícono
de check, monto grande, destinatario (nombre si está en los Contactos
guardados del usuario, si no el RUT), fecha/hora y el nuevo saldo. Se
dispara desde `hacerTransferencia()` en `banco.js` vía la nueva función
`mostrarReciboTransferencia()`, y el usuario lo cierra a propósito con el
botón "Listo" (o Escape) — no se autodescarta solo. El mensaje inline
(`#transfer-success`) se mantiene como apoyo, no se quitó.

### Archivos tocados
- `public/js/pull-to-refresh.js` — nuevo.
- `public/js/app.js` — banner offline, vibración en `feedbackResultado()`.
- `public/js/notificaciones.js` — vibración en notificación nueva.
- `public/js/apuestas.js` — `apRefrescarActivo()`.
- `public/js/banco.js` — `mostrarReciboTransferencia()`, caché de contactos.
- `public/index.html` — modal de recibo, script tag de pull-to-refresh.js.
- `public/styles.css` — estilos de `.ptr-indicator`, `#offline-banner`,
  `.tx-receipt-*`.
- `public/sw.js` — agrega `pull-to-refresh.js` al precache, sube a `v2`.



## ⚠️ Variables de entorno requeridas

Las mismas que v15 — sin cambios.

---

## 🐛 Bugfix — Cobro automático de multas nunca funcionaba

- `api/comisaria.js`, acción `agregarMulta`: el código intentaba descontar el
  monto de la multa desde una tabla llamada `cuentas`, que **no existe en
  ningún lado del proyecto** (la tabla real es `banco`, usada en
  `banco.js`/`casino.js`/`tienda.js`/`apuestas.js`). El error quedaba
  silenciado por un `catch` que asumía "la cuenta puede no existir", pero en
  realidad la query fallaba siempre por nombre de tabla incorrecto.
- Resultado antes del fix: **ninguna multa se cobraba automáticamente**,
  todas quedaban en estado `pendiente` aunque el ciudadano tuviera saldo
  suficiente.
- Corregido: ahora consulta y actualiza `banco`, como el resto del sistema.
  **Esto cambia comportamiento visible**: de aquí en adelante, si el
  ciudadano multado tiene saldo suficiente en su cuenta, la multa se
  cobra sola al crearla y queda `pagada` automáticamente (como decía el
  comentario original del código, que nunca se había cumplido).

## 🚀 Rendimiento — Índices en la base de datos

Se agregaron índices `CREATE INDEX IF NOT EXISTS` (no bloquean, idempotentes
como las tablas) en las columnas que se filtran en cada `WHERE` de forma
constante y que antes dependían de un table scan completo:

| Tabla              | Columna       | Dónde se usa                          |
|---------------------|---------------|----------------------------------------|
| `transacciones`     | `discord_id`  | Historial bancario de cada usuario     |
| `sueldos`           | `discord_id`  | Cobro de sueldo recurrente             |
| `multas`            | `ciudadano_id`| Multas por ciudadano (Comisaría/Perfil)|
| `antecedentes`      | `ciudadano_id`| Antecedentes por ciudadano             |
| `inventario`        | `discord_id`  | Inventario de tienda por usuario       |
| `casino_apuestas`   | `discord_id`  | Historial de casino                    |
| `sport_apuestas`    | `discord_id`  | Apuestas deportivas por usuario        |
| `sport_apuestas`    | `partido_id`  | Apuestas por partido (resolución/pagos)|

No se indexaron `denuncias.denunciante_id` ni `comisaria_logs.usuario_id`
porque sus búsquedas usan `ILIKE '%...%'` (substring) — un índice B-tree
normal no ayuda ahí, se necesitaría una extensión `pg_trgm` aparte. Se deja
pendiente si en algún momento esas búsquedas se sienten lentas con datos
reales.

## 📱 PWA — Service Worker

- Nuevo `public/sw.js`: cachea JS/CSS/íconos con estrategia
  *stale-while-revalidate* (responde con lo cacheado al instante y actualiza
  en segundo plano), y la navegación (`/`) con *network-first* + fallback a
  cache si no hay señal.
- **`/api/*` y `/auth/*` nunca se cachean** — son datos en vivo (saldo,
  sesión, inventario); cachearlos mostraría info vieja o de otra sesión.
- Registrado en `public/js/app.js` al final de `window.load`, con manejo de
  error silencioso si el navegador no soporta Service Workers.
- `vercel.json`: rewrite `/sw.js` → `/public/sw.js` + header
  `Cache-Control: no-cache` (para que las actualizaciones del SW lleguen
  rápido a los clientes) y `Service-Worker-Allowed: /`.

## 🔍 SEO — robots.txt y sitemap.xml

- Nuevos `public/robots.txt` (permite todo excepto `/api/` y `/auth/`) y
  `public/sitemap.xml` (con la home; el resto de las secciones son parte de
  la SPA detrás de login, no rutas indexables por separado).
- `vercel.json`: rewrites `/robots.txt` y `/sitemap.xml` hacia sus archivos
  en `/public`.

## 🖼️ Rendimiento — Íconos PNG comprimidos

- `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` pasados por
  `optipng -o4` (compresión **sin pérdida**, mismos píxeles exactos).
  Reducción modesta (~3-6%) porque ya estaban relativamente optimizados.
- Se evaluó `pngquant` (compresión con pérdida, reduce a 256 colores) pero
  se descartó: el logo tiene degradados metálicos finos que se notarían con
  banding visible a esa paleta reducida. Se priorizó mantener la calidad
  visual intacta.

## 🖼️ Rendimiento — `loading="lazy"` en imágenes de listas

- Se agregó `loading="lazy"` a las imágenes generadas dinámicamente en:
  `tienda.js` (catálogo + inventario), `perfil-publico.js` (inventario por
  ciudadano), `admin-tienda.js` (catálogo + inventario admin),
  `comisaria.js` (fotos de antecedentes), `empresas.js` (logos + avatares),
  `apuestas.js` (logos de equipos).
- No se tocó la imagen de fondo (`video-bg`) ni los íconos PWA — esas ya
  usan `fetchpriority="high"` porque son visibles de inmediato y no deben
  ir con `lazy`.

### Archivos tocados
- `api/comisaria.js` — bugfix tabla `cuentas` → `banco`, índices.
- `api/banco.js`, `api/tienda.js`, `api/casino.js`, `api/apuestas.js` — índices.
- `public/sw.js` — nuevo, Service Worker.
- `public/js/app.js` — registro del Service Worker.
- `public/robots.txt`, `public/sitemap.xml` — nuevos.
- `public/icon-*.png` — comprimidos sin pérdida.
- `public/js/tienda.js`, `perfil-publico.js`, `admin-tienda.js`, `comisaria.js`, `empresas.js`, `apuestas.js` — `loading="lazy"`.
- `vercel.json` — rewrites de `/sw.js`, `/robots.txt`, `/sitemap.xml`.

---

# Cambios aplicados — ChileCity RP v15 (auditoría de mejoras)

## ⚠️ Variables de entorno requeridas

Las mismas que v14 — sin cambios.

---

## 🔒 Seguridad — Headers HTTP

- `vercel.json`: se agregó un bloque `headers` aplicado a todo el sitio:
  - `Content-Security-Policy` — restringe scripts/estilos/fuentes/imágenes a
    `'self'` (más Google Fonts, que ya se usaba) y bloquea que el sitio sea
    embebido en un `<iframe>` ajeno (`frame-ancestors 'none'`).
  - `X-Content-Type-Options: nosniff` — evita que el navegador "adivine" el
    tipo de un archivo servido (mitiga ataques de MIME-sniffing).
  - `X-Frame-Options: DENY` — refuerzo del `frame-ancestors` para navegadores
    viejos que no leen CSP.
  - `Referrer-Policy: strict-origin-when-cross-origin` — no filtra la URL
    completa al navegar a sitios externos.
  - `Permissions-Policy` — deshabilita cámara/micrófono/geolocalización, que
    el sitio no usa.
- La CSP usa `'unsafe-inline'` en `script-src`/`style-src` porque el HTML
  actual tiene `onclick=` inline y `style=""` en varios lugares — si en algún
  momento se migran esos handlers a `addEventListener` y los estilos inline a
  clases CSS, se puede sacar `'unsafe-inline'` y la política queda mucho más
  estricta.

## ⚡ Rendimiento — Caché de estáticos

- `vercel.json`: se agregaron `Cache-Control` para los assets que no cambian
  seguido:
  - `/js/*` y `/styles.css` → `max-age=3600, must-revalidate` (una hora,
    revalida después). Si más adelante versionas los nombres de archivo
    (hash en el nombre), se puede subir a `immutable` con `max-age` largo.
  - Íconos PWA, logo y favicon → `max-age=2592000, immutable` (30 días, no
    cambian salvo que tú los reemplaces a mano).

## 🧹 Limpieza — `vercel.json`

- Se eliminaron 9 entradas de `rewrites` que eran no-operativas (`source`
  igual a `destination`, ej. `/api/dni` → `/api/dni`): Vercel ya enruta
  automáticamente cualquier archivo dentro de `/api` a su mismo path, así
  que esas líneas no hacían nada. Se mantuvieron solo los rewrites que sí
  cambian el path (`/auth/login`, `/api/logout`, assets en `/public`, etc).
- **No se tocó la cantidad de funciones en `/api`** (siguen siendo 12:
  admin, apuestas, banco, callback, casino, comisaria, dni, login,
  notificaciones, perfil-publico, session, tienda) — el plan gratuito de
  Vercel quedó respetado.

## 🗜️ Rendimiento — CSS minificado

- `public/styles.css`: pasado por `clean-css` (nivel `O2`, conserva
  estructura pero quita comentarios, espacios y declaraciones redundantes).
  129 KB → 92.6 KB (~28% más liviano). El contenido visual es idéntico, solo
  cambió el formato del archivo.

## ⏸️ Lo que NO se hizo en esta pasada (y por qué)

- **Autoalojar la imagen de fondo (actualmente en Imgur)**: no se pudo
  descargar desde este entorno porque no tengo acceso de red a `imgur.com`
  (solo a un set acotado de dominios técnicos: npm, PyPI, GitHub, etc).
  Si quieres, descarga tú la imagen y súbela a `public/`, o pásamela como
  archivo adjunto y yo la optimizo (WebP + tamaños) y actualizo las
  referencias en `index.html`.
- **Dividir `index.html` (140 KB) en fragmentos cargados on-demand**: es un
  cambio estructural grande (cómo se cargan las secciones del dashboard) con
  riesgo real de romper algo que no puedo probar en un navegador real desde
  acá. Si quieres avanzar en esto, mejor hacerlo de forma incremental,
  sección por sección, probando en tu entorno de Vercel preview antes de
  pasar a producción.

### Archivos tocados
- `vercel.json` — headers de seguridad, caché de estáticos, limpieza de rewrites redundantes.
- `public/styles.css` — minificado.

---

# Cambios aplicados — ChileCity RP v14

## ⚠️ Variables de entorno requeridas

Las mismas que v13 — sin cambios.

---

## 🔒 Seguridad — XSS almacenado en Banco y Panel Admin

- `public/js/banco.js`: la descripción de las transacciones, los nombres de
  usuario/RUT del panel admin, los nombres de sueldo y los contactos
  guardados se renderizaban con `innerHTML` **sin escapar**. Si alguien
  escribía HTML/JS en el concepto de una transferencia (por ejemplo), se
  ejecutaba en la pantalla de quien viera ese historial. Ahora todos esos
  campos pasan por `escHtml()`, igual que en comisaría/perfil público.
- `public/js/panel-admin.js`: el nombre de Discord y el ID de cada admin en
  la lista del Panel Admin tampoco se escapaban. Corregido por consistencia
  y defensa en profundidad.
- Se auditó el resto de los módulos (`casino.js`, `tienda.js`,
  `admin-tienda.js`, `empresas.js`, `apuestas.js`): ya escapaban
  correctamente todo el texto proveniente de usuarios, no requerían cambios.

## 📱 PWA — Set completo de íconos

- El manifest solo traía un ícono de 128×128 sin propósito `maskable` bien
  formado (recortaba mal en algunos launchers Android). Se generaron
  `icon-192.png`, `icon-512.png` (purpose `any`) e `icon-maskable-512.png`
  (con relleno de seguridad y fondo `#0a0a0f`) a partir del logo original,
  y se agregaron sus rewrites correspondientes en `vercel.json`.

## 🖼️ Rendimiento — imagen de fondo

- `index.html`: se agregó `<link rel="preload" fetchpriority="high">` para
  la imagen de fondo, además de `fetchpriority="high"` y `decoding="async"`
  en el `<img>`, ya que es contenido visible de inmediato (no debe ir con
  `loading="lazy"`).
- Se agregó un fundido de entrada (`opacity` + `transition`) para que la
  imagen no aparezca de golpe ("pop-in") mientras carga, con manejo de
  `onerror` para que la pantalla no se quede oscura si la imagen falla.
- Nota: la imagen sigue sirviéndose desde Imgur sin variantes responsivas;
  para una mejora real de peso conviene autoalojar una versión comprimida
  (WebP, varias resoluciones) — no se pudo hacer en este cambio por no
  tener acceso de red para descargarla y recomprimirla.

## 🔊 Sonidos y microinteracciones

- Nuevas funciones globales en `app.js`: `sonidoNotificacion()` (ping suave,
  dos tonos) y `sonidoConfirmacion()` (click corto tipo "listo"), con el
  mismo motor de Web Audio que ya usaban los sonidos de victoria/derrota del
  casino — sin archivos de audio externos.
- La campanita de notificaciones ahora también suena (sutil) cuando llega
  una notificación nueva, además de agitarse como antes.
- Transferencias bancarias exitosas y toasts de tipo `success` (compras en
  tienda, acciones varias) reproducen `sonidoConfirmacion()`.
- Generar la Cédula de Identidad por primera vez ahora tiene una animación
  de aparición (`rc-carnet-reveal`) + sonido de confirmación — pero solo la
  primera vez que se crea, no cada vez que se abre Registro Civil con un
  carnet ya existente.

### Archivos tocados
- `public/js/banco.js`, `public/js/panel-admin.js` — fix de XSS.
- `public/manifest.json`, `vercel.json` — íconos PWA.
- `public/index.html`, `public/styles.css` — preload/fade de fondo, animación de carnet.
- `public/js/app.js` — nuevos sonidos `sonidoNotificacion()` / `sonidoConfirmacion()`.
- `public/js/notificaciones.js`, `public/js/tienda.js`, `public/js/registro-civil.js` — enganche de los nuevos sonidos.

---



## 🔔 Notificaciones — antecedentes + avisos de administración

### Qué cambia
- La campanita de notificaciones (`/api/notificaciones`) ahora también avisa cuando a un usuario **le registran un antecedente policial** (tabla `antecedentes`), además de multas, transferencias recibidas y resultados de apuestas deportivas que ya existían.
- Nueva tabla `notif_admin`: permite al Panel Admin **enviar avisos manuales** a todos los usuarios o a Discord IDs específicos. Aparecen en la campanita con el ícono 📢 y el título que escriba el admin.
- Cualquier cuenta que esté en la tabla `admins` (o el `SUPER_ADMIN_ID`) puede enviar avisos — mismo criterio de permisos que el resto del Panel Admin.
- Nuevo endpoint: `POST /api/notificaciones?action=enviar` con body `{ titulo, detalle, destinatarios }`, donde `destinatarios` es `"todos"` o un arreglo de Discord IDs (máx. 50).
- Se corrigió el scroll del panel de notificaciones: antes el encabezado ("Notificaciones" / "Marcar leídas") se desplazaba junto con la lista; ahora queda fijo arriba y solo la lista de notificaciones hace scroll, sin filtrarse el scroll hacia el resto de la página (`overscroll-behavior: contain`).
- Nueva sección **"Enviar Notificación"** dentro de Panel Admin → permite elegir entre "Todos los usuarios" o "Usuarios específicos" (Discord IDs separados por coma), con título y mensaje opcional.

### Archivos tocados
- `api/notificaciones.js` — antecedentes, tabla `notif_admin`, acción `enviar`.
- `public/js/notificaciones.js` — manejo del nuevo tipo `admin` y `antecedente`.
- `public/js/panel-admin.js` — `pnSetModo()` / `pnEnviarNotificacion()`.
- `public/index.html` — formulario "Enviar Notificación" en Panel Admin.
- `public/styles.css` — fix de scroll del panel de notificaciones.

---

## ⚠️ Variables de entorno requeridas (heredado)

## 🔴 Perfil Público (reemplaza Base de Datos)

### Qué cambia
- La sección **"Base de Datos"** fue eliminada completamente.
- La reemplaza **"Perfil Público"** — accesible solo para usuarios con sesión iniciada.
- La ruta pública `GET /api/tienda?action=base_datos` queda obsoleta (ya no se llama desde el frontend).
- La nueva API es `GET /api/perfil-publico` — requiere sesión (cookie httpOnly), devuelve todos los ciudadanos con su inventario, multas y antecedentes en una sola llamada paralela.

### Qué muestra cada ciudadano
Cada DNI registrado en la ciudad expande un panel con tres pestañas:
- **Inventario** — grid con imagen, nombre y precio pagado de cada item.
- **Multas** — lista con motivo, fecha, funcionario, monto y estado (pendiente/pagada).
- **Antecedentes** — lista con motivo, artículos, fecha, funcionario y tiempo de cárcel.

### Búsqueda
- Barra con debounce de 280 ms — no spamea el servidor mientras el usuario escribe.
- Botón ✕ para limpiar (también funciona con `Escape`).
- Busca por nombre, apellidos o RUT en todos los campos.

### Stats bar
Cuatro contadores en tiempo real: ciudadanos, items totales, multas y antecedentes.
Los últimos dos tienen color de alerta (amarillo y rojo).

---

## 🟡 Rendimiento

- `GET /api/perfil-publico` carga inventarios, multas y antecedentes en **paralelo** con `Promise.all`, no en secuencia — una sola ida a la BD en lugar de tres.
- El esquema de la tabla de `dni` solo se inicializa la primera vez que la función arranca (igual que el resto de las APIs en v12).
- La búsqueda en el frontend tiene debounce de 280 ms para no disparar peticiones en cada tecla.

---

## 🎨 Visual — Dashboard cards premium

- Las cards del dashboard cambiaron de layout **vertical → horizontal** (icono a la izquierda, texto centrado, flecha a la derecha).
- El icono de cada card tiene su propio `border-radius` y fondo, y escala suavemente al hacer hover.
- La flecha `›` de cada card ahora se desplaza levemente hacia la derecha al hover en lugar de aparecer desde la nada.
- Un indicador de color (línea de 3px en el borde izquierdo) aparece al hover, usando `--card-color` de cada card.
- `backdrop-filter: blur(12px)` en todas las cards para efecto glass más premium.
- En mobile (≤600px) el grid cambia a **1 columna**.

---

## ✨ Visual — Transiciones de sección

- `mostrarPantalla()` detecta si el usuario va del dashboard a una sección (`screen-enter`) o vuelve al dashboard (`screen-return`) y aplica animaciones distintas:
  - **Hacia sección**: desliza desde la derecha (`translateX(32px → 0)`).
  - **Volver al dashboard**: desliza desde la izquierda (`translateX(-24px → 0)`).
- Las animaciones duran 420 ms y 380 ms respectivamente, con la curva `cubic-bezier(0.16,1,0.3,1)`.

---

## 🧭 UX — Indicador de sección

- Al navegar entre secciones aparece una **píldora flotante** centrada en la parte superior con el nombre de la sección activa.
- Desaparece automáticamente después de 1.8 s.
- Diseño: fondo dark con `backdrop-filter`, borde sutil, fade + slide vertical.
- No aparece en landing ni dashboard.

---

## ✅ UX — Validación en tiempo real (Registro Civil)

- Los campos de nombre y apellido muestran borde **verde** al superar 2 caracteres válidos, y borde **rojo** + micro-animación de sacudida si se detecta un carácter inválido (números, símbolos).
- El campo de fecha muestra borde verde al seleccionarse.
- La validación ocurre en `input` (en cada tecla), no solo al enviar.

---

## 📱 UX — Mobile First pass

- `seccion-container` ahora respeta `safe-area-inset` de iOS (notch y barra de gestos).
- El header de sección, título y botón volver tienen tamaños optimizados para pantallas ≤480px.
- El header de cada card de Perfil Público oculta la meta (fecha/items) en pantallas pequeñas para no colapsar el layout.
- La barra de búsqueda de Perfil Público oculta el botón X nativo de Chrome/iOS (`.pp-search-input::-webkit-search-cancel-button`) para usar solo el nuestro.
- El grid de inventario dentro de Perfil Público reduce el ancho mínimo de items en mobile.

---

## Lo que NO se tocó

- Banco, Tienda, Casino, Apuestas, Comisaría, Panel Admin, Admin Banco, Admin Tienda — sin cambios.
- SEO / Open Graph / favicon — sin cambios.
- Rate limiting — sin cambios.
- Autenticación por cookie httpOnly — sin cambios.

---

## 👤 v22 — Card de Perfil en el Dashboard

- Nueva **card de perfil** arriba del dashboard: avatar de Discord con punto de estado, nombre, y badges (`@usuario` de Discord, RUT o aviso de "Sin cédula", cantidad de logros desbloqueados).
- **Biografía editable**: cada ciudadano puede escribir una bio corta (máx. 160 caracteres) desde su propia card, con botón de editar/guardar/cancelar. Requiere tener cédula creada.
  - Nueva columna `bio` en la tabla `dni` (se agrega sola con `ALTER TABLE ... IF NOT EXISTS`, no requiere migración manual).
  - Nuevo método `PATCH` en `/api/dni` para guardar la bio (no se creó un endpoint nuevo: ya se estaba en el límite de 12 funciones serverless de Vercel).
- Nueva **card de saldo bancario** al lado del perfil: muestra el saldo actual y el número de cuenta apenas se entra al dashboard (antes había que entrar a Banco para verlo), con botón directo "Ir al Banco".
- Diseño inspirado en la estructura de otros portales de roleplay (avatar + badges + saldo destacado), reinterpretado con la paleta y tipografía propias de ChileCity RP (rojo neón, Bebas Neue, fondo oscuro).
- Se eliminó el antiguo encabezado "Panel Principal / Hola, {nombre}" — reemplazado por la card de perfil.
