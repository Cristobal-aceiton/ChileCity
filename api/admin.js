import { neon } from "@neondatabase/serverless";
import { requireSession } from "../lib/auth.js";
import { SUPER_ADMIN_ID, BASE_URL } from "../lib/constants.js";

const MAX_ADMINS = 4; // máximo de admins adicionales (sin contar al super admin)

let schemaReady = false;
async function initTable(sql) {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS admins (
      id          SERIAL PRIMARY KEY,
      discord_id  TEXT UNIQUE NOT NULL,
      nombre      TEXT,
      agregado_por TEXT NOT NULL DEFAULT 'system',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // Asegurarse de que el super admin siempre esté en la tabla
  await sql`
    INSERT INTO admins (discord_id, nombre, agregado_por)
    VALUES (${SUPER_ADMIN_ID}, 'Super Admin', 'system')
    ON CONFLICT (discord_id) DO NOTHING
  `;
  schemaReady = true;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", BASE_URL);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const sql = neon(process.env.DATABASE_URL);
    await initTable(sql);

    const { action } = req.query;

    // Quién está haciendo la petición se determina por la cookie de sesión,
    // nunca por un discord_id que mande el cliente.
    const session = requireSession(req, res);
    if (!session) return;
    const discord_id = session.id;

    // ── GET: verificar si yo soy admin ───────────────────────────────────────
    if (req.method === "GET" && action === "verificar") {
      const rows = await sql`SELECT * FROM admins WHERE discord_id = ${discord_id}`;
      const esSuperAdmin = discord_id === SUPER_ADMIN_ID;
      return res.status(200).json({
        esAdmin: rows.length > 0,
        esSuperAdmin,
      });
    }

    // ── GET: listar todos los admins (solo super admin) ──────────────────────
    if (req.method === "GET" && action === "listar") {
      if (discord_id !== SUPER_ADMIN_ID)
        return res.status(403).json({ error: "No autorizado" });

      const rows = await sql`SELECT * FROM admins ORDER BY created_at ASC`;
      return res.status(200).json({ admins: rows });
    }

    // ── POST: agregar admin (solo super admin) ────────────────────────────────
    if (req.method === "POST" && action === "agregar") {
      if (discord_id !== SUPER_ADMIN_ID)
        return res.status(403).json({ error: "No autorizado" });

      const { target_id, nombre } = req.body;
      if (!target_id) return res.status(400).json({ error: "Falta target_id" });
      if (target_id === SUPER_ADMIN_ID)
        return res.status(400).json({ error: "Ese ID ya es el super admin" });

      // Contar admins actuales (sin incluir el super admin)
      const count = await sql`
        SELECT COUNT(*) as cnt FROM admins WHERE discord_id != ${SUPER_ADMIN_ID}
      `;
      if (Number(count[0].cnt) >= MAX_ADMINS)
        return res.status(400).json({ error: `Límite de ${MAX_ADMINS} admins adicionales alcanzado` });

      // Verificar que no exista ya
      const existe = await sql`SELECT id FROM admins WHERE discord_id = ${target_id}`;
      if (existe.length > 0)
        return res.status(409).json({ error: "Ese usuario ya es admin" });

      const rows = await sql`
        INSERT INTO admins (discord_id, nombre, agregado_por)
        VALUES (${target_id}, ${nombre || null}, ${discord_id})
        RETURNING *
      `;
      return res.status(201).json({ admin: rows[0] });
    }

    // ── DELETE: eliminar admin (solo super admin) ─────────────────────────────
    if (req.method === "DELETE" && action === "eliminar") {
      if (discord_id !== SUPER_ADMIN_ID)
        return res.status(403).json({ error: "No autorizado" });

      const { target_id } = req.query;
      if (!target_id) return res.status(400).json({ error: "Falta target_id" });
      if (target_id === SUPER_ADMIN_ID)
        return res.status(400).json({ error: "No puedes eliminar al super admin" });

      await sql`DELETE FROM admins WHERE discord_id = ${target_id}`;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Método no permitido" });
  } catch (err) {
    console.error("Error en /api/admin:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
}
