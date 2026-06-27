import { neon } from "@neondatabase/serverless";

// ── Super Admin (dueño del sistema, hardcodeado) ──────────────────────────────
// Solo este ID puede gestionar los demás admins desde el Panel Admin.
const SUPER_ADMIN_ID = "1192236737565577287";
const MAX_ADMINS = 4; // máximo de admins adicionales (sin contar al super admin)

async function initTable(sql) {
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
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const sql = neon(process.env.DATABASE_URL);
    await initTable(sql);

    const { action } = req.query;

    // ── GET: verificar si un ID es admin ─────────────────────────────────────
    if (req.method === "GET" && action === "verificar") {
      const { discord_id } = req.query;
      if (!discord_id) return res.status(400).json({ error: "Falta discord_id" });

      const rows = await sql`SELECT * FROM admins WHERE discord_id = ${discord_id}`;
      const esSuperAdmin = discord_id === SUPER_ADMIN_ID;
      return res.status(200).json({
        esAdmin: rows.length > 0,
        esSuperAdmin,
      });
    }

    // ── GET: listar todos los admins ─────────────────────────────────────────
    if (req.method === "GET" && action === "listar") {
      const { discord_id } = req.query;
      if (discord_id !== SUPER_ADMIN_ID)
        return res.status(403).json({ error: "No autorizado" });

      const rows = await sql`SELECT * FROM admins ORDER BY created_at ASC`;
      return res.status(200).json({ admins: rows });
    }

    // ── POST: agregar admin ──────────────────────────────────────────────────
    if (req.method === "POST" && action === "agregar") {
      const { discord_id, target_id, nombre } = req.body;
      if (discord_id !== SUPER_ADMIN_ID)
        return res.status(403).json({ error: "No autorizado" });
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

    // ── DELETE: eliminar admin ───────────────────────────────────────────────
    if (req.method === "DELETE" && action === "eliminar") {
      const { discord_id, target_id } = req.query;
      if (discord_id !== SUPER_ADMIN_ID)
        return res.status(403).json({ error: "No autorizado" });
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
