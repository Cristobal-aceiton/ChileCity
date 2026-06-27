// ── Constantes compartidas por todas las funciones de /api ──────────────────
// Centralizadas aquí en vez de repetidas (y potencialmente desincronizadas)
// en cada archivo de /api por separado.

// ID de Discord del super admin. Se puede sobreescribir con la variable de
// entorno SUPER_ADMIN_ID en Vercel sin tocar código.
export const SUPER_ADMIN_ID = process.env.SUPER_ADMIN_ID || "1192236737565577287";

// URL base del sitio (sin slash final). Se usa para construir el redirect_uri
// de Discord OAuth y para restringir CORS. Configúrala en Vercel con la
// variable de entorno APP_URL si tu dominio cambia.
export const BASE_URL = (process.env.APP_URL || "https://chile-city.vercel.app").replace(/\/+$/, "");
