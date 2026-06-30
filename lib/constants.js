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

// ── Límites de apuesta para el casino ────────────────────────────────────────
// Ajustables por variables de entorno sin tocar código.
export const CASINO_MIN_APUESTA = Number(process.env.CASINO_MIN_APUESTA) || 1000;
export const CASINO_MAX_APUESTA = Number(process.env.CASINO_MAX_APUESTA) || 850000000;

// ── Rate limiting (segundos entre acciones) ───────────────────────────────────
export const RATE_CASINO_SEG   = Number(process.env.RATE_CASINO_SEG)   || 3;
export const RATE_APUESTA_SEG  = Number(process.env.RATE_APUESTA_SEG)  || 5;
export const RATE_TRANSFER_SEG = Number(process.env.RATE_TRANSFER_SEG) || 10;
