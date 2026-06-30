import { neon } from "@neondatabase/serverless";
import { requireSession } from "../lib/auth.js";
import { BASE_URL } from "../lib/constants.js";

// ── Notificaciones in-app ────────────────────────────────────────────────────
// Junta en una sola respuesta los tres eventos que le importan al usuario
// dentro de la app: multas nuevas, resultados de apuestas deportivas ya
// resueltas, y transferencias bancarias recibidas. No se crea una tabla por
// cada tipo de notificación: simplemente se leen las tablas que ya existen
// (multas, sport_apuestas, transacciones) y se compara su fecha contra la
// última vez que el usuario abrió la campanita (notif_estado.last_visto).

let schemaReady = false;
async function ensureSchema(sql) {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS notif_estado (
      discord_id  TEXT PRIMARY KEY,
      last_visto  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  schemaReady = true;
}

function toNumber(v) { return v == null ? 0 : Number(v); }

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
    let estado = await sql`SELECT last_visto FROM notif_estado WHERE discord_id = ${discordId}`;
    if (estado.length === 0) {
      await sql`
        INSERT INTO notif_estado (discord_id, last_visto)
        VALUES (${discordId}, NOW())
        ON CONFLICT (discord_id) DO NOTHING
      `;
      estado = await sql`SELECT last_visto FROM notif_estado WHERE discord_id = ${discordId}`;
    }
    const lastVisto = estado[0].last_visto;

    const LIMITE_POR_TIPO = 12;

    const [multas, transferencias, apuestas] = await Promise.all([
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

    items.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const itemsFinal = items.slice(0, 20).map(it => ({
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
