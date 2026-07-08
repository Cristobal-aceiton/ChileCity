// ── Provably Fair — seeds y RNG determinista ─────────────────────────────────
// Mecánica estándar (la misma familia que usan Stake y casi todos los
// casinos "provably fair"):
//   1) El servidor genera un server_seed al azar y solo muestra su HASH
//      (SHA-256) al jugador — comprometido de antemano, sin revelar el valor
//      real todavía.
//   2) El jugador puede fijar su propio client_seed (o usar uno generado).
//   3) Cada apuesta usa un nonce que sube de a uno.
//   4) El resultado de la apuesta = HMAC_SHA256(server_seed, client_seed:nonce),
//      convertido a un número determinístico. Como el server_seed ya estaba
//      comprometido (su hash se mostró ANTES de conocer el client_seed), el
//      servidor no puede "elegir" el resultado después de ver la apuesta.
//   5) Cuando el jugador "rota" su seed, el server_seed viejo se revela en
//      texto plano — ahí se puede verificar cualquier apuesta pasada hecha
//      bajo ese seed, recalculando el HMAC y comparando el hash comprometido.
//
// Nota: la economía de este casino es saldo virtual interno de rol (CLP
// ficticio manejado por /api/banco), no dinero real — este mecanismo es
// sobre todo transparencia/credibilidad para los jugadores del servidor,
// pero está implementado de forma real y verificable, no es cosmético.

import crypto from "crypto";

export async function ensureSeedSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS casino_seeds (
      discord_id        TEXT PRIMARY KEY,
      server_seed       TEXT NOT NULL,
      server_seed_hash  TEXT NOT NULL,
      client_seed       TEXT NOT NULL,
      nonce             INT NOT NULL DEFAULT 0,
      created_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS casino_seeds_revelados (
      id                SERIAL PRIMARY KEY,
      discord_id        TEXT NOT NULL,
      server_seed       TEXT NOT NULL,
      server_seed_hash  TEXT NOT NULL,
      client_seed       TEXT NOT NULL,
      nonce_final       INT NOT NULL,
      revealed_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_casino_seeds_revelados_discord ON casino_seeds_revelados(discord_id)`;
}

function randomHex(bytes) {
  return crypto.randomBytes(bytes).toString("hex");
}
export function hashSeed(seed) {
  return crypto.createHash("sha256").update(seed).digest("hex");
}

// Devuelve un float determinístico en [0, 1) a partir de server_seed,
// client_seed y nonce — la misma fórmula se puede recalcular en el
// navegador (con SubtleCrypto) para verificar el resultado.
export function hmacFloat(serverSeed, clientSeed, nonce) {
  const h = crypto.createHmac("sha256", serverSeed).update(`${clientSeed}:${nonce}`).digest("hex");
  // Tomamos los primeros 13 chars hex (52 bits, de sobra para un float de
  // precisión normal) y normalizamos a [0,1).
  const int = parseInt(h.slice(0, 13), 16);
  return int / Math.pow(16, 13);
}

// Trae (o crea si no existe) el seed activo del usuario.
export async function getOrCreateSeed(sql, discord_id) {
  const rows = await sql`SELECT * FROM casino_seeds WHERE discord_id = ${discord_id}`;
  if (rows.length > 0) return rows[0];
  const server_seed = randomHex(32);
  const server_seed_hash = hashSeed(server_seed);
  const client_seed = randomHex(8);
  await sql`
    INSERT INTO casino_seeds (discord_id, server_seed, server_seed_hash, client_seed, nonce)
    VALUES (${discord_id}, ${server_seed}, ${server_seed_hash}, ${client_seed}, 0)
  `;
  return { discord_id, server_seed, server_seed_hash, client_seed, nonce: 0 };
}

// Consume el siguiente nonce (para usar en una apuesta) y devuelve el seed
// completo a usar en el cálculo del resultado de esa apuesta.
export async function consumeNonce(sql, discord_id) {
  const seed = await getOrCreateSeed(sql, discord_id);
  const nuevoNonce = seed.nonce + 1;
  await sql`UPDATE casino_seeds SET nonce = ${nuevoNonce} WHERE discord_id = ${discord_id}`;
  return { ...seed, nonce: nuevoNonce };
}

// Rota el seed: guarda el actual en el historial de revelados (server_seed
// en texto plano, ya se puede verificar), genera uno nuevo.
export async function rotarSeed(sql, discord_id, nuevoClientSeedOpcional) {
  const actual = await getOrCreateSeed(sql, discord_id);
  await sql`
    INSERT INTO casino_seeds_revelados (discord_id, server_seed, server_seed_hash, client_seed, nonce_final)
    VALUES (${discord_id}, ${actual.server_seed}, ${actual.server_seed_hash}, ${actual.client_seed}, ${actual.nonce})
  `;
  const nuevoServerSeed = randomHex(32);
  const nuevoHash = hashSeed(nuevoServerSeed);
  const clientSeed = (nuevoClientSeedOpcional && String(nuevoClientSeedOpcional).slice(0, 64)) || randomHex(8);
  await sql`
    UPDATE casino_seeds
    SET server_seed = ${nuevoServerSeed}, server_seed_hash = ${nuevoHash}, client_seed = ${clientSeed}, nonce = 0
    WHERE discord_id = ${discord_id}
  `;
  return {
    revelado: { server_seed: actual.server_seed, server_seed_hash: actual.server_seed_hash, client_seed: actual.client_seed, nonce_final: actual.nonce },
    nuevo: { server_seed_hash: nuevoHash, client_seed: clientSeed, nonce: 0 },
  };
}
