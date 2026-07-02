// ── Logs de Staff ────────────────────────────────────────────────────────────
// Registro centralizado de acciones administrativas del staff (Admin Banco,
// Gestión de Logros, Administrar Empresas, Gestión de Policías, Gestión de
// Staff), visible desde el Panel Admin. Vive en un módulo compartido (no en
// /api) porque lo usan varios archivos de /api distintos y cada archivo de
// /api cuenta como una Serverless Function en el plan gratuito de Vercel.

export async function ensureStaffLogsSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS staff_logs (
      id            SERIAL PRIMARY KEY,
      actor_id      TEXT NOT NULL,
      actor_nombre  TEXT,
      accion        TEXT NOT NULL,
      detalle       TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_staff_logs_created_at ON staff_logs(created_at DESC)
  `;
}

/**
 * Registra una acción de staff. No lanza si falla (un log fallido no debe
 * tumbar la acción real que se está registrando), pero sí lo deja en consola.
 */
export async function registrarStaffLog(sql, actor_id, actor_nombre, accion, detalle) {
  try {
    await sql`
      INSERT INTO staff_logs (actor_id, actor_nombre, accion, detalle)
      VALUES (${actor_id}, ${actor_nombre || null}, ${accion}, ${detalle || null})
    `;
  } catch (e) {
    console.error("Error al registrar staff log:", e);
  }
}
