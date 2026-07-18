import { neon } from "@neondatabase/serverless";
import { requireSession } from "../lib/auth.js";
import { BASE_URL } from "../lib/constants.js";
import { ensureLogrosSchema, LOGROS } from "../lib/logros.js";

let schemaReady = false;
async function ensureSchema(sql) {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS dni (
      id           SERIAL PRIMARY KEY,
      discord_id   TEXT UNIQUE NOT NULL,
      rut          TEXT UNIQUE NOT NULL,
      nombre1      TEXT NOT NULL,
      nombre2      TEXT NOT NULL,
      apellido1    TEXT NOT NULL,
      apellido2    TEXT NOT NULL,
      fecha_nac    TEXT NOT NULL,
      nacionalidad TEXT NOT NULL DEFAULT 'Chilena',
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE dni ADD COLUMN IF NOT EXISTS discord_username TEXT`;
  await ensureLogrosSchema(sql);

  // Tabla de vehículos registrados (compartida con api/tienda.js y
  // api/comisaria.js). Se declara acá también por si este endpoint corre
  // antes que exista.
  await sql`
    CREATE TABLE IF NOT EXISTS vehiculos_registrados (
      id                          SERIAL PRIMARY KEY,
      inventario_id               INTEGER NOT NULL UNIQUE,
      patente                     TEXT NOT NULL UNIQUE,
      modelo                      TEXT NOT NULL,
      color                       TEXT NOT NULL,
      anio                        INTEGER NOT NULL,
      estado                      TEXT NOT NULL DEFAULT 'Activo',
      propietario_actual_id       TEXT NOT NULL,
      propietario_actual_nombre   TEXT,
      duenos_anteriores           JSONB NOT NULL DEFAULT '[]',
      fecha_inscripcion           TIMESTAMPTZ DEFAULT NOW(),
      created_at                  TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_vehiculos_propietario ON vehiculos_registrados(propietario_actual_id)
  `;
  schemaReady = true;
}

function toNumber(v) { return v == null ? 0 : Number(v); }

// ── Control de acceso: esta base de datos es exclusiva para personal ────────
// policial (Policía Virtual). Un civil (o cualquier otro rol) solo debe ver
// un mensaje indicando que el acceso está restringido, nunca los datos.
async function esPoliciaVirtual(sql, discord_id) {
  const rows = await sql`SELECT id FROM policia_virtual WHERE discord_id = ${discord_id}`;
  return rows.length > 0;
}
async function tieneAccesoPolicial(sql, discord_id) {
  return esPoliciaVirtual(sql, discord_id);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", BASE_URL);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const session = requireSession(req, res);
  if (!session) return;

  try {
    const sql = neon(process.env.DATABASE_URL);

    // Tabla policia_virtual puede no existir aún si comisaria.js nunca corrió
    // antes que este endpoint; se declara acá también por seguridad.
    await sql`
      CREATE TABLE IF NOT EXISTS policia_virtual (
        id          SERIAL PRIMARY KEY,
        discord_id  TEXT UNIQUE NOT NULL,
        nombre      TEXT,
        autorizado_por_id   TEXT NOT NULL,
        autorizado_por_nombre TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    if (!(await tieneAccesoPolicial(sql, session.id))) {
      return res.status(403).json({
        denied: true,
        error: "Esta base de datos es de uso exclusivo para personal policial.",
      });
    }

    await ensureSchema(sql);

    const { q, vista } = req.query;

    // ── Paginación ───────────────────────────────────────────────────────
    // Antes se traían hasta 200 ciudadanos (o 100 en una búsqueda) en una
    // sola llamada, junto con todo su inventario/multas/antecedentes. Si la
    // ciudad crece a miles de DNIs eso se vuelve una respuesta enorme y
    // lenta. Ahora se pagina: el cliente pide "page" (desde 1) y "limit"
    // (tope 60), y el servidor además devuelve el total de registros que
    // calzan con la búsqueda para que el front sepa si hay más páginas.
    const PAGE_SIZE_DEFAULT = 30;
    const PAGE_SIZE_MAX     = 60;
    const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(PAGE_SIZE_MAX, Math.max(1, parseInt(req.query.limit, 10) || PAGE_SIZE_DEFAULT));
    const offset = (page - 1) * limit;

    // ── Vista "Vehículos": listado maestro de TODOS los vehículos ──────────
    // registrados en la ciudad (no solo los del ciudadano seleccionado),
    // con el nombre/RUT/usuario Discord del dueño actual para que el
    // policía pueda buscar directo por patente, modelo, dueño o RUT.
    if (vista === "vehiculos") {
      const busqV = q && q.trim() ? `%${q.trim().replace(/^@/, "").toLowerCase()}%` : null;
      let vehRows, totalVRow;
      if (busqV) {
        [vehRows, totalVRow] = await Promise.all([
          sql`
            SELECT v.*, d.nombre1, d.nombre2, d.apellido1, d.apellido2, d.rut, d.discord_username
            FROM vehiculos_registrados v
            LEFT JOIN dni d ON d.discord_id = v.propietario_actual_id
            WHERE LOWER(v.patente) LIKE ${busqV}
               OR LOWER(v.modelo)  LIKE ${busqV}
               OR LOWER(v.color)   LIKE ${busqV}
               OR LOWER(d.nombre1)   LIKE ${busqV}
               OR LOWER(d.nombre2)   LIKE ${busqV}
               OR LOWER(d.apellido1) LIKE ${busqV}
               OR LOWER(d.apellido2) LIKE ${busqV}
               OR LOWER(d.rut)       LIKE ${busqV}
               OR LOWER(d.discord_username) LIKE ${busqV}
            ORDER BY v.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
          `,
          sql`
            SELECT COUNT(*)::int AS total
            FROM vehiculos_registrados v
            LEFT JOIN dni d ON d.discord_id = v.propietario_actual_id
            WHERE LOWER(v.patente) LIKE ${busqV}
               OR LOWER(v.modelo)  LIKE ${busqV}
               OR LOWER(v.color)   LIKE ${busqV}
               OR LOWER(d.nombre1)   LIKE ${busqV}
               OR LOWER(d.nombre2)   LIKE ${busqV}
               OR LOWER(d.apellido1) LIKE ${busqV}
               OR LOWER(d.apellido2) LIKE ${busqV}
               OR LOWER(d.rut)       LIKE ${busqV}
               OR LOWER(d.discord_username) LIKE ${busqV}
          `,
        ]);
      } else {
        [vehRows, totalVRow] = await Promise.all([
          sql`
            SELECT v.*, d.nombre1, d.nombre2, d.apellido1, d.apellido2, d.rut, d.discord_username
            FROM vehiculos_registrados v
            LEFT JOIN dni d ON d.discord_id = v.propietario_actual_id
            ORDER BY v.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
          `,
          sql`SELECT COUNT(*)::int AS total FROM vehiculos_registrados`,
        ]);
      }
      const totalV = totalVRow[0]?.total || 0;
      return res.status(200).json({
        vista: "vehiculos",
        page,
        limit,
        total: totalV,
        hasMore: offset + vehRows.length < totalV,
        vehiculos: vehRows.map(v => ({
          id: v.id,
          patente: v.patente,
          modelo: v.modelo,
          color: v.color,
          anio: v.anio,
          estado: v.estado,
          propietario_actual_id: v.propietario_actual_id,
          propietario_nombre: [v.nombre1, v.apellido1].filter(Boolean).join(" ") || v.propietario_actual_nombre || "Sin dueño registrado",
          propietario_rut: v.rut || null,
          propietario_username: v.discord_username || null,
          duenos_anteriores: v.duenos_anteriores || [],
        })),
      });
    }

    // Búsqueda de DNIs (paginada)
    let dnis, totalRow;
    if (q && q.trim()) {
      // Acepta buscar con o sin "@" delante del usuario de Discord.
      const busq = `%${q.trim().replace(/^@/, "").toLowerCase()}%`;
      [dnis, totalRow] = await Promise.all([
        sql`
          SELECT * FROM dni
          WHERE LOWER(nombre1)   LIKE ${busq}
             OR LOWER(nombre2)   LIKE ${busq}
             OR LOWER(apellido1) LIKE ${busq}
             OR LOWER(apellido2) LIKE ${busq}
             OR LOWER(rut)       LIKE ${busq}
             OR LOWER(discord_username) LIKE ${busq}
             OR discord_id IN (
                  SELECT propietario_actual_id FROM vehiculos_registrados
                  WHERE LOWER(patente) LIKE ${busq}
                )
          ORDER BY apellido1, nombre1
          LIMIT ${limit} OFFSET ${offset}
        `,
        sql`
          SELECT COUNT(*)::int AS total FROM dni
          WHERE LOWER(nombre1)   LIKE ${busq}
             OR LOWER(nombre2)   LIKE ${busq}
             OR LOWER(apellido1) LIKE ${busq}
             OR LOWER(apellido2) LIKE ${busq}
             OR LOWER(rut)       LIKE ${busq}
             OR LOWER(discord_username) LIKE ${busq}
             OR discord_id IN (
                  SELECT propietario_actual_id FROM vehiculos_registrados
                  WHERE LOWER(patente) LIKE ${busq}
                )
        `,
      ]);
    } else {
      [dnis, totalRow] = await Promise.all([
        sql`SELECT * FROM dni ORDER BY apellido1, nombre1 LIMIT ${limit} OFFSET ${offset}`,
        sql`SELECT COUNT(*)::int AS total FROM dni`,
      ]);
    }
    const total = totalRow[0]?.total || 0;

    const ids = dnis.map(d => d.discord_id);
    let inventarios = [], multas = [], antecedentes = [], logrosRows = [], vehiculos = [];

    if (ids.length > 0) {
      [inventarios, multas, antecedentes, logrosRows, vehiculos] = await Promise.all([
        sql`SELECT * FROM inventario WHERE discord_id = ANY(${ids}) ORDER BY comprado_at DESC`,
        sql`SELECT * FROM multas WHERE ciudadano_id = ANY(${ids}) ORDER BY created_at DESC`,
        sql`SELECT * FROM antecedentes WHERE ciudadano_id = ANY(${ids}) ORDER BY created_at DESC`,
        sql`SELECT discord_id, codigo, created_at FROM logros_usuario WHERE discord_id = ANY(${ids})`,
        sql`SELECT * FROM vehiculos_registrados WHERE propietario_actual_id = ANY(${ids}) ORDER BY created_at DESC`,
      ]);
    }

    // Construir mapas por discord_id
    const invMap = {}, multaMap = {}, antMap = {}, logroMap = {}, vehMap = {};
    for (const v of vehiculos) {
      if (!vehMap[v.propietario_actual_id]) vehMap[v.propietario_actual_id] = [];
      vehMap[v.propietario_actual_id].push(v);
    }
    for (const item of inventarios) {
      if (!invMap[item.discord_id]) invMap[item.discord_id] = [];
      invMap[item.discord_id].push({ ...item, precio_pagado: toNumber(item.precio_pagado) });
    }
    for (const m of multas) {
      if (!multaMap[m.ciudadano_id]) multaMap[m.ciudadano_id] = [];
      multaMap[m.ciudadano_id].push({ ...m, valor: toNumber(m.valor) });
    }
    for (const a of antecedentes) {
      if (!antMap[a.ciudadano_id]) antMap[a.ciudadano_id] = [];
      antMap[a.ciudadano_id].push(a);
    }
    for (const lg of logrosRows) {
      if (!logroMap[lg.discord_id]) logroMap[lg.discord_id] = {};
      logroMap[lg.discord_id][lg.codigo] = lg.created_at;
    }

    return res.status(200).json({
      page,
      limit,
      total,
      hasMore: offset + dnis.length < total,
      registros: dnis.map(d => {
        const obtenidos = logroMap[d.discord_id] || {};
        const logros = LOGROS.map(l => ({
          ...l,
          obtenido: Boolean(obtenidos[l.codigo]),
          fecha: obtenidos[l.codigo] || null,
        }));
        return {
          discord_id:       d.discord_id,
          discord_username: d.discord_username || null,
          nombre1:      d.nombre1,
          nombre2:      d.nombre2,
          apellido1:    d.apellido1,
          apellido2:    d.apellido2,
          rut:          d.rut,
          fecha_nac:    d.fecha_nac,
          nacionalidad: d.nacionalidad || "Chilena",
          inventario:   invMap[d.discord_id]   || [],
          multas:       multaMap[d.discord_id]  || [],
          antecedentes: antMap[d.discord_id]    || [],
          vehiculos:    vehMap[d.discord_id]    || [],
          logros,
        };
      }),
      // Si la búsqueda calza con el formato de una patente (ABC-123), el
      // front puede usar esta bandera para abrir automáticamente el perfil
      // del propietario vinculado a ese vehículo.
      matchPatente: !!(q && /^[A-Za-z0-9]{3}-[A-Za-z0-9]{3}$/.test(q.trim())),
    });
  } catch (err) {
    console.error("Error en /api/perfil-publico:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
}
