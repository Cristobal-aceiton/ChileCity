// ── Rate limiting usando la base de datos ────────────────────────────────────
// Funciona en entornos serverless donde no hay estado compartido en memoria.
// Usa un solo campo "last_action" por usuario/acción. Sin tabla extra:
// guarda el timestamp directamente en las tablas existentes cuando es posible,
// o en una tabla rate_limits genérica.

/**
 * Verifica y registra un rate limit para un usuario/acción.
 * Devuelve null si está permitido, o un mensaje de error si está bloqueado.
 *
 * @param {Function} sql  - Instancia neon sql
 * @param {string} discord_id
 * @param {string} accion - Identificador de la acción ('casino', 'apuesta', 'transfer')
 * @param {number} cooldownSeg - Segundos mínimos entre acciones
 */
export async function checkRateLimit(sql, discord_id, accion, cooldownSeg) {
  // Asegurar que la tabla existe (idempotente)
  await sql`
    CREATE TABLE IF NOT EXISTS rate_limits (
      discord_id  TEXT NOT NULL,
      accion      TEXT NOT NULL,
      last_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (discord_id, accion)
    )
  `;

  const rows = await sql`
    SELECT last_at FROM rate_limits
    WHERE discord_id = ${discord_id} AND accion = ${accion}
  `;

  if (rows.length > 0) {
    const last = new Date(rows[0].last_at);
    const diffSeg = (Date.now() - last.getTime()) / 1000;
    if (diffSeg < cooldownSeg) {
      const resta = Math.ceil(cooldownSeg - diffSeg);
      return `Espera ${resta} segundo${resta !== 1 ? 's' : ''} antes de volver a intentarlo.`;
    }
  }

  // Actualizar timestamp
  await sql`
    INSERT INTO rate_limits (discord_id, accion, last_at)
    VALUES (${discord_id}, ${accion}, NOW())
    ON CONFLICT (discord_id, accion) DO UPDATE SET last_at = NOW()
  `;

  return null; // permitido
}
