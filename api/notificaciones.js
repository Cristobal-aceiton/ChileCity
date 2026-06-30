import { neon } from "@neondatabase/serverless";
import { requireSession } from "../lib/auth.js";
import { BASE_URL, SUPER_ADMIN_ID } from "../lib/constants.js";

// ── Notificaciones in-app ────────────────────────────────────────────────────
// Junta en una sola respuesta los eventos que le importan al usuario dentro
// de la app: multas nuevas, antecedentes nuevos, resultados de apuestas
// deportivas ya resueltas, transferencias bancarias recibidas, y avisos
// enviados manualmente desde el Panel Admin. No se crea una tabla por cada
// tipo: se leen las tablas que ya existen (multas, antecedentes,
// sport_apuestas, transacciones) y se compara su fecha contra la última vez
// que el usuario abrió la campanita (notif_estado.last_visto). Los avisos de
// administración sí tienen su propia tabla (notif_admin) porque no nacen de
// ningún otro proceso del sistema.

let schemaReady = false;
async function ensureSchema(sql) {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS notif_estado (
      discord_id  TEXT PRIMARY KEY,
      last_visto  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      limpiado_en TIMESTAMPTZ,
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // Por si la tabla ya existía de antes de agregar "limpiar bandeja".
  await sql`ALTER TABLE notif_estado ADD COLUMN IF NOT EXISTS limpiado_en TIMESTAMPTZ`;
  await sql`
    CREATE TABLE IF NOT EXISTS notif_admin (
      id            SERIAL PRIMARY KEY,
      titulo        TEXT NOT NULL,
      detalle       TEXT,
      destinatario  TEXT,
      enviado_por   TEXT,
      enviado_por_nombre TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // Misma tabla que crea /api/admin.js. Se replica aquí (idempotente, mismas
  // columnas) por si esta función corre antes que esa en un despliegue nuevo.
  await sql`
    CREATE TABLE IF NOT EXISTS admins (
      id          SERIAL PRIMARY KEY,
      discord_id  TEXT UNIQUE NOT NULL,
      nombre      TEXT,
      agregado_por TEXT NOT NULL DEFAULT 'system',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  schemaReady = true;
}

function toNumber(v) { return v == null ? 0 : Number(v); }

async function esAdmin(sql, discordId) {
  if (discordId === SUPER_ADMIN_ID) return true;
  const rows = await sql`SELECT 1 FROM admins WHERE discord_id = ${discordId}`;
  return rows.length > 0;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", BASE_URL);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const session = requireSession(req, res);
  if (!session) return;
  const discordId = session.id;

  try {
    const sql = neon(process.env.DATABASE_URL);
    await ensureSchema(sql);

    const { action } = req.query;

    if (req.method === "POST" && action === "enviar") {
      // Aviso manual desde el Panel Admin. Solo admins (o el super admin).
      const autorizado = await esAdmin(sql, discordId);
      if (!autorizado) return res.status(403).json({ error: "No autorizado." });

      let { titulo, detalle, destinatarios } = req.body || {};
      titulo = (titulo || "").toString().trim().slice(0, 120);
      detalle = (detalle || "").toString().trim().slice(0, 300);
      if (!titulo) return res.status(400).json({ error: "El título es obligatorio." });

      let nombreAdmin = session.name || discordId;

      // destinatarios puede ser: "todos", o un arreglo de discord_id (texto).
      if (destinatarios === "todos" || !destinatarios) {
        await sql`
          INSERT INTO notif_admin (titulo, detalle, destinatario, enviado_por, enviado_por_nombre)
          VALUES (${titulo}, ${detalle}, NULL, ${discordId}, ${nombreAdmin})
        `;
        return res.status(201).json({ ok: true, enviadoA: "todos" });
      }

      if (!Array.isArray(destinatarios)) {
        return res.status(400).json({ error: "Formato de destinatarios inválido." });
      }
      const ids = [...new Set(destinatarios.map(d => String(d).trim()).filter(Boolean))].slice(0, 50);
      if (ids.length === 0) return res.status(400).json({ error: "Indica al menos un destinatario." });

      for (const id of ids) {
        await sql`
          INSERT INTO notif_admin (titulo, detalle, destinatario, enviado_por, enviado_por_nombre)
          VALUES (${titulo}, ${detalle}, ${id}, ${discordId}, ${nombreAdmin})
        `;
      }
      return res.status(201).json({ ok: true, enviadoA: ids.length });
    }

    if (req.method === "POST" && action === "limpiar") {
      // Vaciar la bandeja: todo lo anterior a este instante deja de listarse,
      // aunque los datos originales (multas, transferencias, etc.) sigan
      // existiendo intactos en sus tablas — esto solo afecta qué se muestra
      // en la campanita de este usuario.
      await sql`
        INSERT INTO notif_estado (discord_id, last_visto, limpiado_en, updated_at)
        VALUES (${discordId}, NOW(), NOW(), NOW())
        ON CONFLICT (discord_id) DO UPDATE SET last_visto = NOW(), limpiado_en = NOW(), updated_at = NOW()
      `;
      return res.status(200).json({ ok: true });
    }

    if (req.method === "POST") {
      // Marcar como leídas: el usuario abrió la campanita.
      await sql`
        INSERT INTO notif_estado (discord_id, last_visto, updated_at)
        VALUES (${discordId}, NOW(), NOW())
        ON CONFLICT (discord_id) DO UPDATE SET last_visto = NOW(), updated_at = NOW()
      `;
      return res.status(200).json({ ok: true });
    }

    if (req.method !== "GET") {
      return res.status(405).json({ error: "Método no permitido." });
    }

    // Si el usuario nunca abrió la campanita, le creamos un punto de partida
    // en este mismo instante. Así no le aparecen como "nuevas" multas,
    // apuestas o transferencias de hace meses la primera vez que entra.
    let estado = await sql`SELECT last_visto, limpiado_en FROM notif_estado WHERE discord_id = ${discordId}`;
    if (estado.length === 0) {
      await sql`
        INSERT INTO notif_estado (discord_id, last_visto)
        VALUES (${discordId}, NOW())
        ON CONFLICT (discord_id) DO NOTHING
      `;
      estado = await sql`SELECT last_visto, limpiado_en FROM notif_estado WHERE discord_id = ${discordId}`;
    }
    const lastVisto = estado[0].last_visto;
    const limpiadoEn = estado[0].limpiado_en;

    const LIMITE_POR_TIPO = 12;

    const [multas, transferencias, apuestas, antecedentes, avisosAdmin] = await Promise.all([
      sql`
        SELECT id, motivo, valor, estado, created_at
        FROM multas
        WHERE ciudadano_id = ${discordId}
        ORDER BY created_at DESC
        LIMIT ${LIMITE_POR_TIPO}
      `,
      sql`
        SELECT id, monto, descripcion, contraparte, created_at
        FROM transacciones
        WHERE discord_id = ${discordId}
          AND tipo = 'ingreso'
          AND descripcion LIKE 'Transferencia recibida%'
        ORDER BY created_at DESC
        LIMIT ${LIMITE_POR_TIPO}
      `,
      sql`
        SELECT sa.id, sa.estado, sa.premio, sa.monto, sa.resuelto_at,
               sp.equipo_a, sp.equipo_b
        FROM sport_apuestas sa
        JOIN sport_partidos sp ON sp.id = sa.partido_id
        WHERE sa.discord_id = ${discordId}
          AND sa.estado IN ('ganada','perdida')
          AND sa.resuelto_at IS NOT NULL
        ORDER BY sa.resuelto_at DESC
        LIMIT ${LIMITE_POR_TIPO}
      `,
      sql`
        SELECT id, motivo, articulos, tiempo_carcel, created_at
        FROM antecedentes
        WHERE ciudadano_id = ${discordId}
        ORDER BY created_at DESC
        LIMIT ${LIMITE_POR_TIPO}
      `,
      sql`
        SELECT id, titulo, detalle, enviado_por_nombre, created_at
        FROM notif_admin
        WHERE destinatario IS NULL OR destinatario = ${discordId}
        ORDER BY created_at DESC
        LIMIT ${LIMITE_POR_TIPO}
      `,
    ]);

    const items = [];

    for (const m of multas) {
      items.push({
        tipo: "multa",
        id: `multa-${m.id}`,
        titulo: "Nueva multa registrada",
        detalle: `${m.motivo} · $${toNumber(m.valor).toLocaleString("es-CL")}`,
        fecha: m.created_at,
        icono: "🏷",
      });
    }

    for (const t of transferencias) {
      items.push({
        tipo: "transferencia",
        id: `transferencia-${t.id}`,
        titulo: "Transferencia recibida",
        detalle: `${t.descripcion} · +$${toNumber(t.monto).toLocaleString("es-CL")}`,
        fecha: t.created_at,
        icono: "💸",
      });
    }

    for (const a of apuestas) {
      const gano = a.estado === "ganada";
      items.push({
        tipo: "apuesta",
        id: `apuesta-${a.id}`,
        titulo: gano ? "¡Ganaste una apuesta!" : "Apuesta perdida",
        detalle: `${a.equipo_a} vs ${a.equipo_b}` +
          (gano ? ` · +$${toNumber(a.premio).toLocaleString("es-CL")}` : ` · -$${toNumber(a.monto).toLocaleString("es-CL")}`),
        fecha: a.resuelto_at,
        icono: gano ? "🏆" : "📉",
      });
    }

    for (const an of antecedentes) {
      items.push({
        tipo: "antecedente",
        id: `antecedente-${an.id}`,
        titulo: "Nuevo antecedente policial",
        detalle: `${an.motivo}` + (an.tiempo_carcel ? ` · ${an.tiempo_carcel}` : ""),
        fecha: an.created_at,
        icono: "🚓",
      });
    }

    for (const av of avisosAdmin) {
      items.push({
        tipo: "admin",
        id: `admin-${av.id}`,
        titulo: av.titulo,
        detalle: av.detalle ? av.detalle : `Enviado por Administración`,
        fecha: av.created_at,
        icono: "📢",
      });
    }

    // Si el usuario limpió la bandeja, todo lo anterior a ese momento
    // desaparece de la lista (no solo se marca como leído).
    const itemsVisibles = limpiadoEn
      ? items.filter(it => new Date(it.fecha) > new Date(limpiadoEn))
      : items;

    itemsVisibles.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const itemsFinal = itemsVisibles.slice(0, 30).map(it => ({
      ...it,
      nuevo: new Date(it.fecha) > new Date(lastVisto),
    }));

    const noLeidas = itemsFinal.filter(it => it.nuevo).length;

    return res.status(200).json({
      items: itemsFinal,
      noLeidas,
      ultimaVisita: lastVisto,
    });
  } catch (err) {
    console.error("Error en /api/notificaciones:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
}
