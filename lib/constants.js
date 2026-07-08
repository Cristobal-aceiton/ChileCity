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

// ── Casino: Limbo y Plinko ───────────────────────────────────────────────────
export const LIMBO_HOUSE_EDGE = 0.99; // 1% de margen de casa (igual línea que Stake)
export const LIMBO_MAX_MULT = 1000000;

// Tablas de multiplicadores de Plinko por filas/riesgo (misma estructura que
// Stake: más filas y más riesgo = multiplicadores más extremos en los bordes).
// Cada arreglo tiene (filas+1) valores, uno por "bucket" final, simétrico.
export const PLINKO_TABLAS = {
  "8-bajo":   [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
  "8-medio":  [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
  "8-alto":   [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
  "12-bajo":  [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
  "12-medio": [24, 7, 2, 1.3, 0.7, 0.4, 0.2, 0.4, 0.7, 1.3, 2, 7, 24],
  "12-alto":  [58, 9, 2, 0.7, 0.3, 0.2, 0.1, 0.2, 0.3, 0.7, 2, 9, 58],
  "16-bajo":  [16, 9, 2, 1.4, 1.2, 1.1, 1, 0.5, 0.3, 0.5, 1, 1.1, 1.2, 1.4, 2, 9, 16],
  "16-medio": [110, 41, 10, 5, 3, 1.5, 1, 0.3, 0.2, 0.3, 1, 1.5, 3, 5, 10, 41, 110],
  "16-alto":  [1000, 130, 26, 9, 4, 2, 0.5, 0.2, 0.1, 0.2, 0.5, 2, 4, 9, 26, 130, 1000],
};
export const PLINKO_FILAS_VALIDAS = [8, 12, 16];
export const PLINKO_RIESGOS_VALIDOS = ["bajo", "medio", "alto"];
