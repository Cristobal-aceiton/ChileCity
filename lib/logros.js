// ── Sistema de logros ────────────────────────────────────────────────────────
// Vive en /lib (no en /api) a propósito: Vercel Hobby limita a 12 Serverless
// Functions por proyecto y ya estábamos justo en el límite (ver nota en
// api/admin.js sobre empresas). En vez de sumar un api/logros.js nuevo, este
// módulo se importa desde los endpoints que ya generan los hechos que
// desbloquean cada logro (dni, banco, casino, tienda, admin) y la consulta /
// gestión desde el cliente vive como acciones extra dentro de api/banco.js
// (ver propio logro) y api/admin.js (gestión desde el panel admin).

export const LOGROS = [
  { codigo: "bienvenido",    nombre: "Bienvenido a la Ciudad", descripcion: "Creaste tu cédula de identidad (DNI).",          icono: "🪪", color: "#38bdf8" },
  { codigo: "comienzo",      nombre: "El Comienzo",            descripcion: "Abriste tu cuenta bancaria.",                    icono: "🏦", color: "#34d399" },
  { codigo: "primer_sueldo", nombre: "Tu Primer Sueldo",        descripcion: "Recibiste tu primer sueldo.",                    icono: "💵", color: "#a3e635" },
  { codigo: "progresando",   nombre: "Progresando",             descripcion: "Alcanzaste $3.000.000 en tu cuenta bancaria.",   icono: "📈", color: "#60a5fa" },
  { codigo: "primer_auto",   nombre: "Tu Primer Auto",          descripcion: "Compraste tu primer vehículo en la tienda.",     icono: "🚗", color: "#fb923c" },
  { codigo: "empresario",    nombre: "Empresario",              descripcion: "Un administrador registró una empresa a tu nombre.", icono: "🏢", color: "#34d399" },
  { codigo: "adinerada",     nombre: "Persona Adinerada",       descripcion: "Alcanzaste $20.000.000 en tu cuenta bancaria.",  icono: "💰", color: "#fbbf24" },
  { codigo: "suertudo",      nombre: "Suertudo",                descripcion: "Ganaste por primera vez en el casino.",          icono: "🍀", color: "#4ade80" },
  { codigo: "exitosa",       nombre: "Persona Exitosa",         descripcion: "Alcanzaste $50.000.000 en tu cuenta bancaria.",  icono: "🌟", color: "#f472b6" },
  { codigo: "millonario",    nombre: "Millonario",              descripcion: "Alcanzaste $100.000.000 en tu cuenta bancaria.", icono: "💎", color: "#818cf8" },
  { codigo: "billonario",    nombre: "Billonario",              descripcion: "Alcanzaste $1.000.000.000 en tu cuenta bancaria.", icono: "👑", color: "#f87171" },
];

const LOGROS_POR_CODIGO = new Set(LOGROS.map(l => l.codigo));

// Logros de saldo: son acumulativos (si tienes 100M, ya pasaste los 50M, 20M
// y 3M), así que cada vez que el saldo cambia se revisan todos de una.
const UMBRALES_SALDO = [
  { codigo: "progresando", monto: 3000000 },
  { codigo: "adinerada",   monto: 20000000 },
  { codigo: "exitosa",     monto: 50000000 },
  { codigo: "millonario",  monto: 100000000 },
  { codigo: "billonario",  monto: 1000000000 },
];

let schemaReady = false;
export async function ensureLogrosSchema(sql) {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS logros_usuario (
      id           SERIAL PRIMARY KEY,
      discord_id   TEXT NOT NULL,
      codigo       TEXT NOT NULL,
      otorgado_por TEXT NOT NULL DEFAULT 'system',
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(discord_id, codigo)
    )
  `;
  schemaReady = true;
}

/**
 * Otorga un logro a un usuario. Es seguro llamarlo muchas veces para el
 * mismo logro/usuario: gracias al UNIQUE + ON CONFLICT DO NOTHING, solo se
 * inserta (y devuelve true) la primera vez.
 */
export async function otorgarLogro(sql, discordId, codigo, otorgadoPor = "system") {
  if (!discordId || !LOGROS_POR_CODIGO.has(codigo)) return false;
  const rows = await sql`
    INSERT INTO logros_usuario (discord_id, codigo, otorgado_por)
    VALUES (${discordId}, ${codigo}, ${otorgadoPor})
    ON CONFLICT (discord_id, codigo) DO NOTHING
    RETURNING id
  `;
  return rows.length > 0;
}

export async function quitarLogro(sql, discordId, codigo) {
  await sql`DELETE FROM logros_usuario WHERE discord_id = ${discordId} AND codigo = ${codigo}`;
}

/** Revisa los umbrales de saldo y otorga todos los que correspondan. */
export async function checkLogrosSaldo(sql, discordId, saldo) {
  const saldoNum = Number(saldo) || 0;
  for (const u of UMBRALES_SALDO) {
    if (saldoNum >= u.monto) await otorgarLogro(sql, discordId, u.codigo);
  }
}

/** Devuelve el catálogo completo con el estado (obtenido/no) para un usuario. */
export async function listarLogrosUsuario(sql, discordId) {
  const rows = await sql`
    SELECT codigo, created_at FROM logros_usuario WHERE discord_id = ${discordId}
  `;
  const obtenidos = {};
  rows.forEach(r => { obtenidos[r.codigo] = r.created_at; });
  return LOGROS.map(l => ({
    ...l,
    obtenido: Boolean(obtenidos[l.codigo]),
    fecha: obtenidos[l.codigo] || null,
  }));
}
