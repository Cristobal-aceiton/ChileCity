import { neon } from "@neondatabase/serverless";
import { requireSession } from "../lib/auth.js";
import {
  BASE_URL, CASINO_MIN_APUESTA, CASINO_MAX_APUESTA, RATE_CASINO_SEG,
  LIMBO_HOUSE_EDGE, LIMBO_MAX_MULT, PLINKO_TABLAS, PLINKO_FILAS_VALIDAS, PLINKO_RIESGOS_VALIDOS,
} from "../lib/constants.js";
import { checkRateLimit } from "../lib/rateLimit.js";
import { ensureLogrosSchema, otorgarLogro, checkLogrosSaldo } from "../lib/logros.js";
import { ensureSeedSchema, consumeNonce, rotarSeed, getOrCreateSeed, hmacFloat } from "../lib/casinoSeed.js";

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function parseMonto(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

let schemaReady = false;
async function initTables(sql) {
  if (schemaReady) return;

  await sql`
    CREATE TABLE IF NOT EXISTS casino_apuestas (
      id           SERIAL PRIMARY KEY,
      discord_id   TEXT NOT NULL,
      juego        TEXT NOT NULL,
      monto        BIGINT NOT NULL,
      eleccion     TEXT NOT NULL,
      resultado    TEXT NOT NULL,
      gano         BOOLEAN NOT NULL,
      premio       BIGINT NOT NULL DEFAULT 0,
      saldo_after  BIGINT NOT NULL,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_casino_apuestas_discord_id ON casino_apuestas(discord_id)
  `;

  // Columnas de Provably Fair + nombre para el feed en vivo (se agregan con
  // ADD COLUMN IF NOT EXISTS para no romper instalaciones existentes).
  await sql`ALTER TABLE casino_apuestas ADD COLUMN IF NOT EXISTS nombre TEXT`;
  await sql`ALTER TABLE casino_apuestas ADD COLUMN IF NOT EXISTS server_seed_hash TEXT`;
  await sql`ALTER TABLE casino_apuestas ADD COLUMN IF NOT EXISTS client_seed TEXT`;
  await sql`ALTER TABLE casino_apuestas ADD COLUMN IF NOT EXISTS nonce INT`;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_casino_apuestas_created_at ON casino_apuestas(created_at DESC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS casino_ganancias (
      discord_id    TEXT PRIMARY KEY,
      total_ganado  BIGINT NOT NULL DEFAULT 0,
      nombre        TEXT
    )
  `;

  // Partida de Mines en curso (una por usuario). Es un juego de varios pasos
  // (abrir casillas de a una), así que necesita guardar estado entre requests
  // en vez de resolverse en una sola llamada como ruleta/moneda/avión/dado.
  await sql`
    CREATE TABLE IF NOT EXISTS casino_mines_activo (
      discord_id    TEXT PRIMARY KEY,
      monto         BIGINT NOT NULL,
      minas         INT NOT NULL,
      posiciones    INT[] NOT NULL,
      reveladas     INT[] NOT NULL DEFAULT '{}',
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  schemaReady = true;
}

/* ── MINES: config y matemática ───────────────────────────────────────────── */
const MINES_TOTAL_CASILLAS = 25; // grid 5x5
const MINES_HOUSE_EDGE = 0.95;   // 5% de margen de casa, igual de línea que los otros juegos

function minesGenerarPosiciones(cantidadMinas) {
  const posiciones = new Set();
  while (posiciones.size < cantidadMinas) {
    posiciones.add(Math.floor(Math.random() * MINES_TOTAL_CASILLAS));
  }
  return [...posiciones];
}

// Multiplicador justo = 1 / P(sobrevivir "reveladas" casillas sin pisar mina),
// luego se le aplica el margen de casa. Misma familia de fórmula que usa
// cualquier juego de Mines "provably fair".
function minesMultiplicador(cantidadMinas, reveladas) {
  const seguras = MINES_TOTAL_CASILLAS - cantidadMinas;
  if (reveladas <= 0) return 1;
  let prob = 1;
  for (let i = 0; i < reveladas; i++) {
    prob *= (seguras - i) / (MINES_TOTAL_CASILLAS - i);
  }
  const justo = 1 / prob;
  return Math.round(justo * MINES_HOUSE_EDGE * 10000) / 10000;
}

/* ── Resultado Ruleta ─────────────────────────────────────────────────────── */
// 38 slots: 18 red, 18 black, 2 green (similar to American roulette)
// `rand` es un float determinístico en [0,1) generado con HMAC(server_seed,
// client_seed:nonce) — así el resultado es 100% verificable por el jugador.
function spinRuleta(rand) {
  const r = Math.floor(rand * 38);
  if (r < 18) return "rojo";
  if (r < 36) return "negro";
  return "verde";
}

/* ── Resultado Cara o Cruz ──────────────────────────────────────────────── */
function lanzarMoneda(rand) {
  return rand < 0.5 ? "cara" : "cruz";
}

/* ── LIMBO: config y matemática ───────────────────────────────────────────── */
// El jugador elige un multiplicador objetivo, gana si el "crash" generado lo
// iguala o supera. Fórmula estándar de Limbo/Crash con margen de casa aplicado.
function limboResultado(rand) {
  // Evita división por cero / infinitos: rand nunca es exactamente 0.
  const r = Math.max(rand, 1e-9);
  const crash = Math.max(1, (LIMBO_HOUSE_EDGE / r));
  return Math.min(LIMBO_MAX_MULT, Math.round(crash * 100) / 100);
}

/* ── PLINKO: config y matemática ─────────────────────────────────────────── */
// Simula una bolita cayendo por `filas` niveles de clavos: en cada nivel
// tiene 50/50 de ir a la izquierda o derecha (distribución binomial), como
// una fila de Plinko real. El resultado final es el índice del "bucket"
// (0 = extremo izquierdo, filas = extremo derecho).
function plinkoResultado(filas, rand) {
  // Generamos `filas` decisiones binarias a partir de un único float
  // determinístico, tomando bits sucesivos — mantiene todo trazable a un
  // solo hmacFloat() por apuesta (más simple de verificar).
  let bucket = 0;
  let x = rand;
  for (let i = 0; i < filas; i++) {
    x = (x * 2) % 1; // extrae el "siguiente bit" del float
    if (x >= 0.5) bucket++;
  }
  return bucket;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", BASE_URL);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const sql = neon(process.env.DATABASE_URL);
    await initTables(sql);
    await ensureLogrosSchema(sql);
    await ensureSeedSchema(sql);

    const session = requireSession(req, res);
    if (!session) return;
    const discord_id = session.id;

    const { action } = req.query;

    // ── GET: historial del usuario ─────────────────────────────────────────
    if (req.method === "GET" && action === "historial") {
      const rows = await sql`
        SELECT * FROM casino_apuestas
        WHERE discord_id = ${discord_id}
        ORDER BY created_at DESC LIMIT 30
      `;
      return res.status(200).json({
        apuestas: rows.map(a => ({
          ...a,
          monto: toNumber(a.monto),
          premio: toNumber(a.premio),
          saldo_after: toNumber(a.saldo_after),
        })),
      });
    }

    // ── GET: estado del seed activo (provably fair) ────────────────────────
    if (req.method === "GET" && action === "seed_estado") {
      const seed = await getOrCreateSeed(sql, discord_id);
      return res.status(200).json({
        server_seed_hash: seed.server_seed_hash,
        client_seed: seed.client_seed,
        nonce: seed.nonce,
      });
    }

    // ── POST: rotar seed (revela el server seed anterior para verificar) ──
    if (req.method === "POST" && action === "seed_rotar") {
      const { client_seed } = req.body || {};
      if (client_seed && !/^[a-zA-Z0-9_-]{1,64}$/.test(String(client_seed)))
        return res.status(400).json({ error: "Client seed inválido (solo letras, números, - y _, máx 64 chars)." });
      const { revelado, nuevo } = await rotarSeed(sql, discord_id, client_seed);
      return res.status(200).json({ revelado, nuevo });
    }

    // ── GET: últimas apuestas de un seed ya revelado (para verificar) ──────
    if (req.method === "GET" && action === "seed_revelados") {
      const rows = await sql`
        SELECT server_seed, server_seed_hash, client_seed, nonce_final, revealed_at
        FROM casino_seeds_revelados
        WHERE discord_id = ${discord_id}
        ORDER BY revealed_at DESC LIMIT 10
      `;
      return res.status(200).json({ seeds: rows });
    }

    // ── GET: feed de apuestas en vivo (todos los jugadores, público) ───────
    if (req.method === "GET" && action === "feed_global") {
      const rows = await sql`
        SELECT juego, monto, premio, gano, nombre, created_at
        FROM casino_apuestas
        ORDER BY created_at DESC LIMIT 15
      `;
      return res.status(200).json({
        apuestas: rows.map(a => ({
          juego: a.juego,
          monto: toNumber(a.monto),
          premio: toNumber(a.premio),
          gano: a.gano,
          nombre: a.nombre || "Jugador",
          created_at: a.created_at,
        })),
      });
    }

    // ── GET: ranking top 5 ────────────────────────────────────────────────
    if (req.method === "GET" && action === "ranking") {
      const rows = await sql`
        SELECT discord_id, total_ganado, nombre
        FROM casino_ganancias
        ORDER BY total_ganado DESC LIMIT 5
      `;
      return res.status(200).json({
        ranking: rows.map(r => ({ ...r, total_ganado: toNumber(r.total_ganado) })),
      });
    }

    // ── POST: jugar ───────────────────────────────────────────────────────
    if (req.method === "POST" && action === "jugar") {
      const { juego, monto, eleccion } = req.body;

      // Rate limiting
      const rl = await checkRateLimit(sql, discord_id, "casino", RATE_CASINO_SEG);
      if (rl) return res.status(429).json({ error: rl });

      // Validación básica
      if (!juego || !eleccion) return res.status(400).json({ error: "Faltan campos." });
      const montoNum = parseMonto(monto);
      if (!montoNum) return res.status(400).json({ error: "Monto inválido. Debe ser entero positivo." });
      if (montoNum < CASINO_MIN_APUESTA)
        return res.status(400).json({ error: `La apuesta mínima es $${CASINO_MIN_APUESTA.toLocaleString("es-CL")}.` });
      if (montoNum > CASINO_MAX_APUESTA)
        return res.status(400).json({ error: `La apuesta máxima es $${CASINO_MAX_APUESTA.toLocaleString("es-CL")}.` });

      // Validar juego y elección
      if (juego === "ruleta" && !["rojo","negro","verde"].includes(eleccion))
        return res.status(400).json({ error: "Elección inválida para ruleta." });
      if (juego === "moneda" && !["cara","cruz"].includes(eleccion))
        return res.status(400).json({ error: "Elección inválida para cara o cruz." });
      if (juego === "avion") {
        const mult = parseFloat(eleccion);
        if (isNaN(mult) || mult < 1.1 || mult > 100)
          return res.status(400).json({ error: "Multiplicador inválido (entre 1.1x y 100x)." });
      }
      if (juego === "limbo") {
        const mult = parseFloat(eleccion);
        if (isNaN(mult) || mult < 1.01 || mult > LIMBO_MAX_MULT)
          return res.status(400).json({ error: `Multiplicador objetivo inválido (entre 1.01x y ${LIMBO_MAX_MULT}x).` });
      }
      if (juego === "plinko") {
        const [filasStr, riesgo] = String(eleccion).split(":");
        const filas = parseInt(filasStr);
        if (!PLINKO_FILAS_VALIDAS.includes(filas) || !PLINKO_RIESGOS_VALIDOS.includes(riesgo))
          return res.status(400).json({ error: "Configuración de Plinko inválida." });
      }
      if (!["ruleta","moneda","avion","limbo","plinko"].includes(juego))
        return res.status(400).json({ error: "Juego inválido." });

      // Verificar cuenta bancaria
      const cuentaRows = await sql`SELECT * FROM banco WHERE discord_id = ${discord_id}`;
      if (cuentaRows.length === 0)
        return res.status(404).json({ error: "No tienes cuenta bancaria." });

      const saldoActual = toNumber(cuentaRows[0].saldo);
      if (saldoActual < montoNum)
        return res.status(400).json({ error: "Saldo insuficiente." });

      // Obtener nombre del usuario (para ranking)
      let nombreUsuario = session.name || discord_id;
      const dniRows = await sql`SELECT nombre1, apellido1 FROM dni WHERE discord_id = ${discord_id}`;
      if (dniRows.length > 0) {
        nombreUsuario = `${dniRows[0].nombre1} ${dniRows[0].apellido1}`;
      }

      // ── Provably Fair: consumimos el siguiente nonce del seed activo del
      // jugador y derivamos TODOS los números aleatorios de este resultado a
      // partir de HMAC(server_seed, client_seed:nonce). El server_seed está
      // comprometido de antemano (solo se conoce su hash hasta que el
      // jugador rota su seed), así que el resultado es verificable después.
      const seedInfo = await consumeNonce(sql, discord_id);
      const rand = hmacFloat(seedInfo.server_seed, seedInfo.client_seed, seedInfo.nonce);

      // Generar resultado en servidor (anti-trampa)
      let resultado, gano, premio;
      if (juego === "ruleta") {
        resultado = spinRuleta(rand);
        gano = resultado === eleccion;
        if (gano) {
          const mult = resultado === "verde" ? 14 : 2;
          premio = montoNum * mult;
        } else {
          premio = 0;
        }
      } else if (juego === "moneda") {
        resultado = lanzarMoneda(rand);
        gano = resultado === eleccion;
        premio = gano ? montoNum * 2 : 0;
      } else if (juego === "avion") {
        // El avión: multiplicador de crash. Distribución exponencial con
        // house edge del 5%, derivada del mismo rand determinístico.
        let crashMultiplier;
        if (rand < 0.05) {
          // 5% crashea inmediatamente (antes de 1.1x)
          crashMultiplier = 1.0;
        } else {
          crashMultiplier = Math.max(1.0, 0.95 / (1 - rand));
          crashMultiplier = Math.round(crashMultiplier * 100) / 100;
        }
        const multObjetivo = parseFloat(eleccion);
        gano = crashMultiplier >= multObjetivo;
        resultado = crashMultiplier.toFixed(2);
        premio = gano ? Math.floor(montoNum * multObjetivo) : 0;
      } else if (juego === "limbo") {
        const multObjetivo = parseFloat(eleccion);
        const crash = limboResultado(rand);
        gano = crash >= multObjetivo;
        resultado = crash.toFixed(2);
        premio = gano ? Math.floor(montoNum * multObjetivo) : 0;
      } else if (juego === "plinko") {
        const [filasStr, riesgo] = eleccion.split(":");
        const filas = parseInt(filasStr);
        const bucket = plinkoResultado(filas, rand);
        const tabla = PLINKO_TABLAS[`${filas}-${riesgo}`];
        const mult = tabla[bucket];
        gano = mult >= 1;
        resultado = `bucket:${bucket}|x${mult}`;
        premio = Math.floor(montoNum * mult);
      }

      // Calcular nuevo saldo
      const nuevoSaldo = saldoActual - montoNum + premio;

      // Actualizar saldo bancario
      await sql`UPDATE banco SET saldo = ${nuevoSaldo} WHERE discord_id = ${discord_id}`;

      // Registrar transacción bancaria
      if (gano) {
        const ganancia = premio - montoNum;
        await sql`
          INSERT INTO transacciones (discord_id, tipo, monto, descripcion, saldo_after)
          VALUES (${discord_id}, 'ingreso', ${ganancia}, ${`Casino (${juego}) — ganó`}, ${nuevoSaldo})
        `;
      } else {
        await sql`
          INSERT INTO transacciones (discord_id, tipo, monto, descripcion, saldo_after)
          VALUES (${discord_id}, 'egreso', ${montoNum}, ${`Casino (${juego}) — perdió`}, ${nuevoSaldo})
        `;
      }

      // Guardar apuesta en historial del casino (incluye los datos de
      // Provably Fair usados: solo se guarda el HASH del server seed, nunca
      // el seed real — ese recién se conoce cuando el jugador rota su seed).
      await sql`
        INSERT INTO casino_apuestas
          (discord_id, juego, monto, eleccion, resultado, gano, premio, saldo_after, nombre, server_seed_hash, client_seed, nonce)
        VALUES
          (${discord_id}, ${juego}, ${montoNum}, ${eleccion}, ${resultado}, ${gano}, ${premio}, ${nuevoSaldo},
           ${nombreUsuario}, ${seedInfo.server_seed_hash}, ${seedInfo.client_seed}, ${seedInfo.nonce})
      `;

      // Logro: Suertudo (primera vez que gana en el casino)
      if (gano && premio > montoNum) {
        await otorgarLogro(sql, discord_id, "suertudo");
      }
      // Logros de saldo (3M/20M/50M/100M/1000M)
      await checkLogrosSaldo(sql, discord_id, nuevoSaldo);

      // Actualizar ranking si ganó
      if (gano && premio > montoNum) {
        const gananciaRanking = premio - montoNum;
        await sql`
          INSERT INTO casino_ganancias (discord_id, total_ganado, nombre)
          VALUES (${discord_id}, ${gananciaRanking}, ${nombreUsuario})
          ON CONFLICT (discord_id) DO UPDATE
          SET total_ganado = casino_ganancias.total_ganado + ${gananciaRanking},
              nombre = ${nombreUsuario}
        `;
      }

      return res.status(200).json({
        resultado,
        gano,
        premio,
        nuevoSaldo,
        monto: montoNum,
      });
    }

    // ── GET: estado de partida de Mines en curso (para retomar al recargar) ──
    if (req.method === "GET" && action === "mines_estado") {
      const rows = await sql`SELECT * FROM casino_mines_activo WHERE discord_id = ${discord_id}`;
      if (rows.length === 0) return res.status(200).json({ activa: false });
      const p = rows[0];
      const reveladas = p.reveladas || [];
      return res.status(200).json({
        activa: true,
        monto: toNumber(p.monto),
        minas: p.minas,
        reveladas,
        multiplicador: minesMultiplicador(p.minas, reveladas.length),
      });
    }

    // ── POST: iniciar partida de Mines ────────────────────────────────────
    if (req.method === "POST" && action === "mines_start") {
      const { monto, minas } = req.body;

      const rl = await checkRateLimit(sql, discord_id, "casino", RATE_CASINO_SEG);
      if (rl) return res.status(429).json({ error: rl });

      const montoNum = parseMonto(monto);
      if (!montoNum) return res.status(400).json({ error: "Monto inválido." });
      if (montoNum < CASINO_MIN_APUESTA)
        return res.status(400).json({ error: `La apuesta mínima es $${CASINO_MIN_APUESTA.toLocaleString("es-CL")}.` });
      if (montoNum > CASINO_MAX_APUESTA)
        return res.status(400).json({ error: `La apuesta máxima es $${CASINO_MAX_APUESTA.toLocaleString("es-CL")}.` });

      const minasNum = parseInt(minas);
      if (!Number.isInteger(minasNum) || minasNum < 1 || minasNum > 24)
        return res.status(400).json({ error: "Cantidad de minas inválida (1-24)." });

      const existente = await sql`SELECT discord_id FROM casino_mines_activo WHERE discord_id = ${discord_id}`;
      if (existente.length > 0)
        return res.status(400).json({ error: "Ya tienes una partida de Mines en curso." });

      const cuentaRows = await sql`SELECT * FROM banco WHERE discord_id = ${discord_id}`;
      if (cuentaRows.length === 0) return res.status(404).json({ error: "No tienes cuenta bancaria." });
      const saldoActual = toNumber(cuentaRows[0].saldo);
      if (saldoActual < montoNum) return res.status(400).json({ error: "Saldo insuficiente." });

      const posiciones = minesGenerarPosiciones(minasNum);
      const nuevoSaldo = saldoActual - montoNum;
      await sql`UPDATE banco SET saldo = ${nuevoSaldo} WHERE discord_id = ${discord_id}`;
      await sql`
        INSERT INTO transacciones (discord_id, tipo, monto, descripcion, saldo_after)
        VALUES (${discord_id}, 'egreso', ${montoNum}, 'Casino (mines) — apuesta', ${nuevoSaldo})
      `;
      await sql`
        INSERT INTO casino_mines_activo (discord_id, monto, minas, posiciones, reveladas)
        VALUES (${discord_id}, ${montoNum}, ${minasNum}, ${posiciones}, '{}')
      `;

      return res.status(200).json({ ok: true, nuevoSaldo, minas: minasNum, monto: montoNum });
    }

    // ── POST: revelar una casilla de Mines ────────────────────────────────
    if (req.method === "POST" && action === "mines_reveal") {
      const { casilla } = req.body;
      const casillaNum = parseInt(casilla);
      if (!Number.isInteger(casillaNum) || casillaNum < 0 || casillaNum >= MINES_TOTAL_CASILLAS)
        return res.status(400).json({ error: "Casilla inválida." });

      const rows = await sql`SELECT * FROM casino_mines_activo WHERE discord_id = ${discord_id}`;
      if (rows.length === 0) return res.status(400).json({ error: "No tienes una partida de Mines activa." });
      const partida = rows[0];
      const reveladas = partida.reveladas || [];
      if (reveladas.includes(casillaNum))
        return res.status(400).json({ error: "Esa casilla ya está revelada." });

      const esMina = partida.posiciones.includes(casillaNum);

      if (esMina) {
        // Perdió: se cierra la partida, se registra en el historial, no hay premio.
        await sql`DELETE FROM casino_mines_activo WHERE discord_id = ${discord_id}`;
        await sql`
          INSERT INTO casino_apuestas (discord_id, juego, monto, eleccion, resultado, gano, premio, saldo_after)
          VALUES (${discord_id}, 'mines', ${toNumber(partida.monto)}, ${`minas:${partida.minas}`}, ${`explotó en casilla ${casillaNum}`}, false, 0,
                  (SELECT saldo FROM banco WHERE discord_id = ${discord_id}))
        `;
        return res.status(200).json({
          gano: false,
          esMina: true,
          posiciones: partida.posiciones, // se revela el tablero completo al perder
        });
      }

      const nuevasReveladas = [...reveladas, casillaNum];
      const multiplicador = minesMultiplicador(partida.minas, nuevasReveladas.length);
      const seguras = MINES_TOTAL_CASILLAS - partida.minas;

      // Si ya reveló todas las casillas seguras, se hace cashout automático.
      if (nuevasReveladas.length >= seguras) {
        const premio = Math.floor(toNumber(partida.monto) * multiplicador);
        const cuentaRows = await sql`SELECT saldo FROM banco WHERE discord_id = ${discord_id}`;
        const saldoActual = toNumber(cuentaRows[0].saldo);
        const nuevoSaldo = saldoActual + premio;
        await sql`UPDATE banco SET saldo = ${nuevoSaldo} WHERE discord_id = ${discord_id}`;
        await sql`
          INSERT INTO transacciones (discord_id, tipo, monto, descripcion, saldo_after)
          VALUES (${discord_id}, 'ingreso', ${premio}, 'Casino (mines) — ganó (tablero completo)', ${nuevoSaldo})
        `;
        await sql`DELETE FROM casino_mines_activo WHERE discord_id = ${discord_id}`;
        await sql`
          INSERT INTO casino_apuestas (discord_id, juego, monto, eleccion, resultado, gano, premio, saldo_after)
          VALUES (${discord_id}, 'mines', ${toNumber(partida.monto)}, ${`minas:${partida.minas}`}, ${`x${multiplicador}`}, true, ${premio}, ${nuevoSaldo})
        `;
        await otorgarLogro(sql, discord_id, "suertudo");
        await checkLogrosSaldo(sql, discord_id, nuevoSaldo);
        let nombreUsuario = session.name || discord_id;
        const dniRows = await sql`SELECT nombre1, apellido1 FROM dni WHERE discord_id = ${discord_id}`;
        if (dniRows.length > 0) nombreUsuario = `${dniRows[0].nombre1} ${dniRows[0].apellido1}`;
        const gananciaRanking = premio - toNumber(partida.monto);
        if (gananciaRanking > 0) {
          await sql`
            INSERT INTO casino_ganancias (discord_id, total_ganado, nombre)
            VALUES (${discord_id}, ${gananciaRanking}, ${nombreUsuario})
            ON CONFLICT (discord_id) DO UPDATE
            SET total_ganado = casino_ganancias.total_ganado + ${gananciaRanking}, nombre = ${nombreUsuario}
          `;
        }
        return res.status(200).json({
          gano: true, esMina: false, tableroCompleto: true,
          multiplicador, premio, nuevoSaldo, reveladas: nuevasReveladas,
        });
      }

      await sql`UPDATE casino_mines_activo SET reveladas = ${nuevasReveladas} WHERE discord_id = ${discord_id}`;
      return res.status(200).json({ gano: null, esMina: false, multiplicador, reveladas: nuevasReveladas });
    }

    // ── POST: retirar (cashout) en Mines ──────────────────────────────────
    if (req.method === "POST" && action === "mines_cashout") {
      const rows = await sql`SELECT * FROM casino_mines_activo WHERE discord_id = ${discord_id}`;
      if (rows.length === 0) return res.status(400).json({ error: "No tienes una partida de Mines activa." });
      const partida = rows[0];
      const reveladas = partida.reveladas || [];
      if (reveladas.length === 0)
        return res.status(400).json({ error: "Revela al menos una casilla antes de retirar." });

      const multiplicador = minesMultiplicador(partida.minas, reveladas.length);
      const premio = Math.floor(toNumber(partida.monto) * multiplicador);

      const cuentaRows = await sql`SELECT saldo FROM banco WHERE discord_id = ${discord_id}`;
      const saldoActual = toNumber(cuentaRows[0].saldo);
      const nuevoSaldo = saldoActual + premio;
      await sql`UPDATE banco SET saldo = ${nuevoSaldo} WHERE discord_id = ${discord_id}`;
      await sql`
        INSERT INTO transacciones (discord_id, tipo, monto, descripcion, saldo_after)
        VALUES (${discord_id}, 'ingreso', ${premio}, 'Casino (mines) — retiro', ${nuevoSaldo})
      `;
      await sql`DELETE FROM casino_mines_activo WHERE discord_id = ${discord_id}`;
      await sql`
        INSERT INTO casino_apuestas (discord_id, juego, monto, eleccion, resultado, gano, premio, saldo_after)
        VALUES (${discord_id}, 'mines', ${toNumber(partida.monto)}, ${`minas:${partida.minas}`}, ${`retiro x${multiplicador}`}, true, ${premio}, ${nuevoSaldo})
      `;
      await otorgarLogro(sql, discord_id, "suertudo");
      await checkLogrosSaldo(sql, discord_id, nuevoSaldo);
      let nombreUsuario = session.name || discord_id;
      const dniRows = await sql`SELECT nombre1, apellido1 FROM dni WHERE discord_id = ${discord_id}`;
      if (dniRows.length > 0) nombreUsuario = `${dniRows[0].nombre1} ${dniRows[0].apellido1}`;
      const gananciaRanking = premio - toNumber(partida.monto);
      if (gananciaRanking > 0) {
        await sql`
          INSERT INTO casino_ganancias (discord_id, total_ganado, nombre)
          VALUES (${discord_id}, ${gananciaRanking}, ${nombreUsuario})
          ON CONFLICT (discord_id) DO UPDATE
          SET total_ganado = casino_ganancias.total_ganado + ${gananciaRanking}, nombre = ${nombreUsuario}
        `;
      }

      return res.status(200).json({ gano: true, multiplicador, premio, nuevoSaldo });
    }

    return res.status(405).json({ error: "Método no permitido." });
  } catch (err) {
    console.error("Error en /api/casino:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
}
