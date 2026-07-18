import { neon } from "@neondatabase/serverless";
import crypto from "crypto";
import { requireSession } from "../lib/auth.js";
import { SUPER_ADMIN_ID, BASE_URL, RATE_TRANSFER_SEG, RATE_CASINO_SEG, CASINO_MIN_APUESTA, CASINO_MAX_APUESTA } from "../lib/constants.js";
import { checkRateLimit } from "../lib/rateLimit.js";
import { ensureLogrosSchema, otorgarLogro, checkLogrosSaldo, listarLogrosUsuario } from "../lib/logros.js";
import { ensureStaffLogsSchema, registrarStaffLog } from "../lib/staffLogs.js";

const SALDO_INICIAL = 1000000;

// ── Config de Préstamos ──────────────────────────────────────────────────────
const PRESTAMO_MONTO_MAX      = 50000000; // tope de monto solicitable
const PRESTAMO_CUOTAS_MIN     = 1;
const PRESTAMO_CUOTAS_MAX     = 12;
const PRESTAMO_INTERVALO_DIAS = 2; // cada cuántos días se cobra automáticamente

function generarNumeroCuenta() {
  const seg = () => Math.floor(Math.random() * 9000 + 1000).toString();
  return `${seg()}-${seg()}-${seg()}-${seg()}`;
}

// ── Ruleta (americana, 38 casilleros: 0, 00, 1-36) ───────────────────────────
const RULETA_ROJOS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

function ruletaColor(numero) {
  if (numero === "0" || numero === "00") return "verde";
  return RULETA_ROJOS.has(Number(numero)) ? "rojo" : "negro";
}

// Gira la ruleta de forma criptográficamente aleatoria e imparcial (0-37,
// donde el índice 37 representa el "00"). Se hace en el servidor para que
// nadie pueda predecir o manipular el resultado desde el navegador.
function ruletaGirar() {
  const idx = crypto.randomInt(38); // 0..37
  return idx === 37 ? "00" : String(idx);
}

// Calcula si una apuesta gana y su multiplicador (cuánto se devuelve por
// cada peso apostado, incluyendo la apuesta original). Devuelve 0 si pierde.
function ruletaMultiplicador(tipo, valor, numeroGanador) {
  const n = numeroGanador;
  const esVerde = n === "0" || n === "00";
  switch (tipo) {
    case "numero":
      return String(valor) === n ? 36 : 0;
    case "color":
      if (esVerde) return 0;
      return ruletaColor(n) === valor ? 2 : 0;
    case "paridad":
      if (esVerde) return 0;
      const num = Number(n);
      const esPar = num !== 0 && num % 2 === 0;
      return (valor === "par") === esPar ? 2 : 0;
    case "mitad":
      if (esVerde) return 0;
      const nn = Number(n);
      if (valor === "1-18") return nn >= 1 && nn <= 18 ? 2 : 0;
      if (valor === "19-36") return nn >= 19 && nn <= 36 ? 2 : 0;
      return 0;
    case "docena":
      if (esVerde) return 0;
      const d = Number(n);
      if (valor === "1") return d >= 1 && d <= 12 ? 3 : 0;
      if (valor === "2") return d >= 13 && d <= 24 ? 3 : 0;
      if (valor === "3") return d >= 25 && d <= 36 ? 3 : 0;
      return 0;
    default:
      return 0;
  }
}

function ruletaValorValido(tipo, valor) {
  if (tipo === "numero") return valor === "00" || (/^\d+$/.test(String(valor)) && Number(valor) >= 0 && Number(valor) <= 36);
  if (tipo === "color") return valor === "rojo" || valor === "negro";
  if (tipo === "paridad") return valor === "par" || valor === "impar";
  if (tipo === "mitad") return valor === "1-18" || valor === "19-36";
  if (tipo === "docena") return valor === "1" || valor === "2" || valor === "3";
  return false;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseMonto(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

async function getAdminIds(sql) {
  try {
    const rows = await sql`SELECT discord_id FROM admins`;
    return rows.map(r => r.discord_id);
  } catch {
    return [SUPER_ADMIN_ID];
  }
}

// Etiqueta legible para logs de staff: "Nombre Apellido (discord_id)" si el
// usuario tiene DNI registrado, o solo "(discord_id)" si no.
async function etiquetaUsuario(sql, discord_id_target) {
  try {
    const rows = await sql`SELECT nombre1, apellido1 FROM dni WHERE discord_id = ${discord_id_target}`;
    if (rows.length > 0) return `${rows[0].nombre1} ${rows[0].apellido1} (${discord_id_target})`;
  } catch {}
  return discord_id_target;
}

let schemaReady = false;
async function initTables(sql) {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS banco (
      id            SERIAL PRIMARY KEY,
      discord_id    TEXT UNIQUE NOT NULL,
      numero_cuenta TEXT UNIQUE NOT NULL,
      saldo         BIGINT NOT NULL DEFAULT 1000000,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS transacciones (
      id            SERIAL PRIMARY KEY,
      discord_id    TEXT NOT NULL,
      tipo          TEXT NOT NULL,
      monto         BIGINT NOT NULL,
      descripcion   TEXT,
      contraparte   TEXT,
      saldo_after   BIGINT NOT NULL,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_transacciones_discord_id ON transacciones(discord_id)
  `;
  // Cuenta de Ahorro (Fase 4): vive dentro de la misma fila de "banco" — no
  // es una tabla aparte porque cada usuario tiene a lo más una. Se activa
  // una sola vez (irreversible) y solo admite mover plata hacia/desde la
  // Cuenta Corriente del mismo usuario, nunca a terceros.
  await sql`ALTER TABLE banco ADD COLUMN IF NOT EXISTS ahorro_activa BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE banco ADD COLUMN IF NOT EXISTS ahorro_saldo BIGINT NOT NULL DEFAULT 0`;
  await sql`
    CREATE TABLE IF NOT EXISTS sueldos (
      id            SERIAL PRIMARY KEY,
      discord_id    TEXT NOT NULL,
      nombre        TEXT NOT NULL,
      monto         BIGINT NOT NULL,
      dias          INTEGER NOT NULL,
      ultimo_cobro  TIMESTAMPTZ DEFAULT NOW(),
      activo        BOOLEAN DEFAULT TRUE,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_sueldos_discord_id ON sueldos(discord_id)
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS admins (
      id          SERIAL PRIMARY KEY,
      discord_id  TEXT UNIQUE NOT NULL,
      nombre      TEXT,
      agregado_por TEXT NOT NULL DEFAULT 'system',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    INSERT INTO admins (discord_id, nombre, agregado_por)
    VALUES (${SUPER_ADMIN_ID}, 'Super Admin', 'system')
    ON CONFLICT (discord_id) DO NOTHING
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS contactos_banco (
      id            SERIAL PRIMARY KEY,
      discord_id    TEXT NOT NULL,
      nombre        TEXT NOT NULL,
      rut           TEXT NOT NULL,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(discord_id, rut)
    )
  `;
  // Préstamos: el usuario los solicita desde el Banco (monto, razón, cuotas
  // y aceptación explícita del cobro automático). Quedan en 'pendiente'
  // hasta que un admin/staff los aprueba o rechaza desde el Panel Admin.
  // Una vez aprobados, se cobra automáticamente cada PRESTAMO_INTERVALO_DIAS
  // días: si no hay saldo suficiente, se cobra lo que haya y la diferencia
  // (deuda_ciclo) se suma al monto a cobrar en el siguiente ciclo.
  await sql`
    CREATE TABLE IF NOT EXISTS prestamos (
      id                   SERIAL PRIMARY KEY,
      discord_id           TEXT NOT NULL,
      monto                BIGINT NOT NULL,
      razon                TEXT NOT NULL,
      cuotas_totales       INTEGER NOT NULL,
      cuota_monto          BIGINT NOT NULL,
      saldo_pendiente      BIGINT NOT NULL,
      deuda_ciclo          BIGINT NOT NULL DEFAULT 0,
      cuotas_pagadas       INTEGER NOT NULL DEFAULT 0,
      acepta_cobro_auto    BOOLEAN NOT NULL DEFAULT FALSE,
      estado               TEXT NOT NULL DEFAULT 'pendiente', -- pendiente|aprobado|rechazado|pagado
      ultimo_cobro         TIMESTAMPTZ,
      revisado_por         TEXT,
      revisado_por_nombre  TEXT,
      revisado_en          TIMESTAMPTZ,
      motivo_rechazo       TEXT,
      created_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_prestamos_discord_id ON prestamos(discord_id)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_prestamos_estado ON prestamos(estado)
  `;

  // La tabla "staff" vive originalmente en api/admin.js. Se re-declara acá
  // (misma definición, CREATE TABLE IF NOT EXISTS) porque Admin Banco ahora
  // también es accesible para el rol Staff, no solo para admins.
  await sql`
    CREATE TABLE IF NOT EXISTS staff (
      id           SERIAL PRIMARY KEY,
      discord_id   TEXT UNIQUE NOT NULL,
      nombre       TEXT,
      agregado_por_id     TEXT NOT NULL,
      agregado_por_nombre TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  schemaReady = true;
}

async function getStaffIds(sql) {
  try {
    const rows = await sql`SELECT discord_id FROM staff`;
    return rows.map(r => r.discord_id);
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  // CORS restringido al propio dominio (antes era "*", abierto a cualquiera)
  res.setHeader("Access-Control-Allow-Origin", BASE_URL);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const sql = neon(process.env.DATABASE_URL);
    await initTables(sql);
    await ensureLogrosSchema(sql);
    await ensureStaffLogsSchema(sql);

    const ADMIN_IDS = await getAdminIds(sql);
    const STAFF_IDS = await getStaffIds(sql);
    const { action } = req.query;

    // Identidad real del usuario: SIEMPRE viene de la cookie de sesión
    // firmada, nunca de un discord_id/admin_id que mande el cliente.
    // Esto es lo que evita que alguien pueda transferirse plata de otra
    // cuenta o auto-asignarse como admin con solo cambiar un parámetro.
    const session = requireSession(req, res);
    if (!session) return; // requireSession ya respondió 401
    const discord_id = session.id;
    const discord_name = session.name || session.tag || discord_id;
    const esAdmin = ADMIN_IDS.includes(discord_id);
    // Staff tiene acceso a Admin Banco (saldos y sueldos), igual que un
    // admin, pero sigue sin poder gestionar otros admins/staff.
    const esStaff = STAFF_IDS.includes(discord_id);
    const puedeAdminBanco = esAdmin || esStaff;

    // ── GET: estado de cuenta ────────────────────────────────────────────────
    if (req.method === "GET" && action === "cuenta") {
      // Por defecto cada uno solo ve su propia cuenta. Un admin puede pedir
      // la cuenta de otro discord_id (ej. para gestionar sus sueldos), pero
      // un usuario normal no puede hacerlo aunque mande ese parámetro.
      let targetId = discord_id;
      const { discord_id: discordIdQuery } = req.query;
      if (discordIdQuery && discordIdQuery !== discord_id) {
        if (!puedeAdminBanco) return res.status(403).json({ error: "No autorizado" });
        targetId = discordIdQuery;
      }

      const rows = await sql`SELECT * FROM banco WHERE discord_id = ${targetId}`;
      if (rows.length === 0) return res.status(404).json({ existe: false });

      const sueldos = await sql`
        SELECT * FROM sueldos WHERE discord_id = ${targetId} AND activo = TRUE
      `;

      const ahora = new Date();
      let saldoActualizado = toNumber(rows[0].saldo);

      for (const sueldo of sueldos) {
        const ultimoCobro = new Date(sueldo.ultimo_cobro);
        const diasDesde = (ahora - ultimoCobro) / (1000 * 60 * 60 * 24);
        if (diasDesde >= sueldo.dias) {
          const montoSueldo = toNumber(sueldo.monto);
          saldoActualizado += montoSueldo;
          await sql`UPDATE banco SET saldo = saldo + ${montoSueldo} WHERE discord_id = ${targetId}`;
          await sql`UPDATE sueldos SET ultimo_cobro = ${ahora.toISOString()} WHERE id = ${sueldo.id}`;
          await sql`
            INSERT INTO transacciones (discord_id, tipo, monto, descripcion, saldo_after)
            VALUES (${targetId}, 'sueldo', ${montoSueldo}, ${'Sueldo: ' + sueldo.nombre}, ${saldoActualizado})
          `;
          // Logro: Tu Primer Sueldo (idempotente: solo se otorga la primera vez)
          await otorgarLogro(sql, targetId, "primer_sueldo");
        }
      }

      // ── Cobro automático de cuotas de préstamos aprobados ──────────────────
      // Mismo patrón que los sueldos: se revisa cada vez que se consulta la
      // cuenta. Si pasaron >= PRESTAMO_INTERVALO_DIAS desde el último cobro,
      // se intenta cobrar la cuota (más cualquier deuda arrastrada del ciclo
      // anterior). Si no alcanza el saldo, se cobra lo que haya y la
      // diferencia se acumula en "deuda_ciclo" para el próximo intento.
      const prestamosActivos = await sql`
        SELECT * FROM prestamos
        WHERE discord_id = ${targetId} AND estado = 'aprobado' AND saldo_pendiente > 0
      `;

      for (const prestamo of prestamosActivos) {
        if (!prestamo.ultimo_cobro) continue;
        const ultimoCobroP = new Date(prestamo.ultimo_cobro);
        const diasDesdeP = (ahora - ultimoCobroP) / (1000 * 60 * 60 * 24);
        if (diasDesdeP < PRESTAMO_INTERVALO_DIAS) continue;

        const saldoPendienteActual = toNumber(prestamo.saldo_pendiente);
        const deudaCicloActual = toNumber(prestamo.deuda_ciclo);
        const montoObjetivo = Math.min(toNumber(prestamo.cuota_monto) + deudaCicloActual, saldoPendienteActual);
        const montoCobrado = Math.max(0, Math.min(saldoActualizado, montoObjetivo));
        const nuevaDeudaCiclo = montoObjetivo - montoCobrado;
        const nuevoSaldoPendiente = saldoPendienteActual - montoCobrado;
        const nuevoEstadoPrestamo = nuevoSaldoPendiente <= 0 ? 'pagado' : 'aprobado';
        const nuevasCuotasPagadas = Math.min(
          toNumber(prestamo.cuotas_totales),
          toNumber(prestamo.cuotas_pagadas) + (nuevaDeudaCiclo === 0 ? 1 : 0)
        );

        if (montoCobrado > 0) {
          saldoActualizado -= montoCobrado;
          await sql`UPDATE banco SET saldo = saldo - ${montoCobrado} WHERE discord_id = ${targetId}`;
          const descCuota = `Cuota préstamo: ${prestamo.razon}` +
            (nuevaDeudaCiclo > 0 ? ` (pago parcial, quedan $${nuevaDeudaCiclo.toLocaleString('es-CL')} pendientes)` : '');
          await sql`
            INSERT INTO transacciones (discord_id, tipo, monto, descripcion, saldo_after)
            VALUES (${targetId}, 'egreso', ${montoCobrado}, ${descCuota}, ${saldoActualizado})
          `;
        }

        await sql`
          UPDATE prestamos
          SET saldo_pendiente = ${nuevoSaldoPendiente},
              deuda_ciclo = ${nuevaDeudaCiclo},
              cuotas_pagadas = ${nuevasCuotasPagadas},
              ultimo_cobro = ${ahora.toISOString()},
              estado = ${nuevoEstadoPrestamo}
          WHERE id = ${prestamo.id}
        `;
      }

      // Revisa logros de saldo (3M/20M/50M/100M/1000M) con el saldo final
      await checkLogrosSaldo(sql, targetId, saldoActualizado);

      const updated = await sql`SELECT * FROM banco WHERE discord_id = ${targetId}`;
      const sueldosActivos = await sql`
        SELECT * FROM sueldos WHERE discord_id = ${targetId} AND activo = TRUE
      `;
      const prestamoActivo = await sql`
        SELECT * FROM prestamos
        WHERE discord_id = ${targetId} AND estado IN ('pendiente','aprobado')
        ORDER BY created_at DESC LIMIT 1
      `;

      let proximoSueldo = null;
      if (sueldosActivos.length > 0) {
        let menorTiempoRestante = Infinity;
        for (const s of sueldosActivos) {
          const ult = new Date(s.ultimo_cobro);
          const fechaProximo = new Date(ult.getTime() + s.dias * 24 * 60 * 60 * 1000);
          const restante = fechaProximo - ahora;
          if (restante > 0 && restante < menorTiempoRestante) {
            menorTiempoRestante = restante;
            proximoSueldo = { nombre: s.nombre, monto: toNumber(s.monto), msRestantes: restante };
          }
        }
      }

      let prestamoActivoOut = null;
      if (prestamoActivo.length > 0) {
        const p = prestamoActivo[0];
        let proximoCobroMs = null;
        if (p.estado === 'aprobado' && p.ultimo_cobro) {
          const fechaProximo = new Date(new Date(p.ultimo_cobro).getTime() + PRESTAMO_INTERVALO_DIAS * 24 * 60 * 60 * 1000);
          proximoCobroMs = fechaProximo - ahora;
        }
        prestamoActivoOut = {
          id: p.id,
          monto: toNumber(p.monto),
          razon: p.razon,
          cuotas_totales: p.cuotas_totales,
          cuota_monto: toNumber(p.cuota_monto),
          saldo_pendiente: toNumber(p.saldo_pendiente),
          deuda_ciclo: toNumber(p.deuda_ciclo),
          cuotas_pagadas: p.cuotas_pagadas,
          estado: p.estado,
          proximoCobroMs,
        };
      }

      return res.status(200).json({
        existe: true,
        cuenta: {
          ...updated[0],
          saldo: toNumber(updated[0].saldo),
          ahorro_activa: !!updated[0].ahorro_activa,
          ahorro_saldo: toNumber(updated[0].ahorro_saldo),
        },
        sueldos: sueldosActivos.map(s => ({ ...s, monto: toNumber(s.monto) })),
        proximoSueldo,
        prestamoActivo: prestamoActivoOut,
      });
    }

    // ── POST: crear cuenta ───────────────────────────────────────────────────
    if (req.method === "POST" && action === "crear") {
      const dni = await sql`SELECT id FROM dni WHERE discord_id = ${discord_id}`;
      if (dni.length === 0)
        return res.status(403).json({ error: "Debes crear tu DNI primero" });

      const existe = await sql`SELECT id FROM banco WHERE discord_id = ${discord_id}`;
      if (existe.length > 0)
        return res.status(409).json({ error: "Ya tienes una cuenta bancaria" });

      let numero;
      for (let i = 0; i < 10; i++) {
        numero = generarNumeroCuenta();
        const check = await sql`SELECT id FROM banco WHERE numero_cuenta = ${numero}`;
        if (check.length === 0) break;
      }

      const rows = await sql`
        INSERT INTO banco (discord_id, numero_cuenta, saldo)
        VALUES (${discord_id}, ${numero}, ${SALDO_INICIAL})
        RETURNING *
      `;

      await sql`
        INSERT INTO transacciones (discord_id, tipo, monto, descripcion, saldo_after)
        VALUES (${discord_id}, 'ingreso', ${SALDO_INICIAL}, 'Apertura de cuenta bancaria', ${SALDO_INICIAL})
      `;

      // Logro: El Comienzo (abrir la cuenta bancaria)
      await otorgarLogro(sql, discord_id, "comienzo");

      return res.status(201).json({
        existe: true,
        cuenta: { ...rows[0], saldo: toNumber(rows[0].saldo), ahorro_activa: false, ahorro_saldo: 0 },
      });
    }

    // ── POST: abrir Cuenta de Ahorro ─────────────────────────────────────────
    // Irreversible: una vez activada no se puede volver a "cerrar" desde acá.
    if (req.method === "POST" && action === "ahorro_abrir") {
      const cuenta = await sql`SELECT * FROM banco WHERE discord_id = ${discord_id}`;
      if (cuenta.length === 0)
        return res.status(404).json({ error: "No tienes cuenta bancaria" });
      if (cuenta[0].ahorro_activa)
        return res.status(409).json({ error: "Ya tienes una Cuenta de Ahorro activa" });

      const rows = await sql`
        UPDATE banco SET ahorro_activa = TRUE, ahorro_saldo = 0
        WHERE discord_id = ${discord_id}
        RETURNING *
      `;
      return res.status(200).json({
        ok: true,
        cuenta: {
          ...rows[0],
          saldo: toNumber(rows[0].saldo),
          ahorro_activa: true,
          ahorro_saldo: toNumber(rows[0].ahorro_saldo),
        },
      });
    }

    // ── POST: mover plata entre Corriente y Ahorro (mismo usuario) ──────────
    // Nunca a terceros: es un traspaso interno entre las dos cuentas de la
    // misma persona, por eso no pide RUT destinatario.
    if (req.method === "POST" && action === "ahorro_mover") {
      const { direccion, monto } = req.body || {};
      if (direccion !== "deposito" && direccion !== "retiro")
        return res.status(400).json({ error: "Dirección inválida" });

      const montoNum = parseMonto(monto);
      if (montoNum === null || montoNum <= 0)
        return res.status(400).json({ error: "Monto inválido" });

      const cuenta = await sql`SELECT * FROM banco WHERE discord_id = ${discord_id}`;
      if (cuenta.length === 0)
        return res.status(404).json({ error: "No tienes cuenta bancaria" });
      if (!cuenta[0].ahorro_activa)
        return res.status(400).json({ error: "Debes activar tu Cuenta de Ahorro primero" });

      const saldoCorriente = toNumber(cuenta[0].saldo);
      const saldoAhorro = toNumber(cuenta[0].ahorro_saldo);

      let nuevoSaldoCorriente, nuevoSaldoAhorro, descOrigen, descDestino;
      if (direccion === "deposito") {
        if (saldoCorriente < montoNum)
          return res.status(400).json({ error: "Saldo insuficiente en tu Cuenta Corriente" });
        nuevoSaldoCorriente = saldoCorriente - montoNum;
        nuevoSaldoAhorro = saldoAhorro + montoNum;
        descOrigen = "Depósito a Cuenta de Ahorro";
      } else {
        if (saldoAhorro < montoNum)
          return res.status(400).json({ error: "Saldo insuficiente en tu Cuenta de Ahorro" });
        nuevoSaldoCorriente = saldoCorriente + montoNum;
        nuevoSaldoAhorro = saldoAhorro - montoNum;
        descOrigen = "Retiro desde Cuenta de Ahorro";
      }

      await sql`
        UPDATE banco SET saldo = ${nuevoSaldoCorriente}, ahorro_saldo = ${nuevoSaldoAhorro}
        WHERE discord_id = ${discord_id}
      `;
      await sql`
        INSERT INTO transacciones (discord_id, tipo, monto, descripcion, saldo_after)
        VALUES (${discord_id}, 'ajuste', ${montoNum}, ${descOrigen}, ${nuevoSaldoCorriente})
      `;

      await checkLogrosSaldo(sql, discord_id, nuevoSaldoCorriente);

      return res.status(200).json({
        ok: true,
        nuevoSaldo: nuevoSaldoCorriente,
        nuevoAhorroSaldo: nuevoSaldoAhorro,
      });
    }

    // ── POST: transferir ─────────────────────────────────────────────────────
    if (req.method === "POST" && action === "transferir") {
      const { rut_destino, monto } = req.body;
      if (!rut_destino || !monto)
        return res.status(400).json({ error: "Faltan campos" });

      // Rate limiting
      const rl = await checkRateLimit(sql, discord_id, "transfer", RATE_TRANSFER_SEG);
      if (rl) return res.status(429).json({ error: rl });

      const montoNum = parseMonto(monto);
      if (montoNum === null || montoNum <= 0)
        return res.status(400).json({ error: "Monto inválido" });

      const origen = await sql`SELECT * FROM banco WHERE discord_id = ${discord_id}`;
      if (origen.length === 0)
        return res.status(404).json({ error: "No tienes cuenta bancaria" });

      const saldoOrigenActual = toNumber(origen[0].saldo);
      if (saldoOrigenActual < montoNum)
        return res.status(400).json({ error: "Saldo insuficiente" });

      const dniDest = await sql`SELECT discord_id FROM dni WHERE rut = ${rut_destino}`;
      if (dniDest.length === 0)
        return res.status(404).json({ error: "RUT destino no encontrado" });

      const destDiscordId = dniDest[0].discord_id;
      if (destDiscordId === discord_id)
        return res.status(400).json({ error: "No puedes transferirte a ti mismo" });

      const destBanco = await sql`SELECT * FROM banco WHERE discord_id = ${destDiscordId}`;
      if (destBanco.length === 0)
        return res.status(404).json({ error: "El destinatario no tiene cuenta bancaria" });

      const nuevoSaldoOrigen = saldoOrigenActual - montoNum;
      const nuevoSaldoDest   = toNumber(destBanco[0].saldo) + montoNum;

      await sql`UPDATE banco SET saldo = ${nuevoSaldoOrigen} WHERE discord_id = ${discord_id}`;
      await sql`UPDATE banco SET saldo = ${nuevoSaldoDest}   WHERE discord_id = ${destDiscordId}`;

      const dniOrigen = await sql`SELECT nombre1, apellido1, rut FROM dni WHERE discord_id = ${discord_id}`;
      const nombreOrigen = dniOrigen.length > 0 ? `${dniOrigen[0].nombre1} ${dniOrigen[0].apellido1}` : discord_id;

      await sql`
        INSERT INTO transacciones (discord_id, tipo, monto, descripcion, contraparte, saldo_after)
        VALUES (${discord_id}, 'egreso', ${montoNum}, ${'Transferencia a RUT ' + rut_destino}, ${rut_destino}, ${nuevoSaldoOrigen})
      `;
      await sql`
        INSERT INTO transacciones (discord_id, tipo, monto, descripcion, contraparte, saldo_after)
        VALUES (${destDiscordId}, 'ingreso', ${montoNum}, ${'Transferencia recibida de ' + nombreOrigen}, ${dniOrigen[0]?.rut || discord_id}, ${nuevoSaldoDest})
      `;

      await checkLogrosSaldo(sql, discord_id, nuevoSaldoOrigen);
      await checkLogrosSaldo(sql, destDiscordId, nuevoSaldoDest);

      return res.status(200).json({ ok: true, nuevoSaldo: nuevoSaldoOrigen });
    }

    // ── GET: mis logros ───────────────────────────────────────────────────────
    if (req.method === "GET" && action === "logros") {
      const logros = await listarLogrosUsuario(sql, discord_id);
      return res.status(200).json({ logros });
    }

    // ── GET: historial ───────────────────────────────────────────────────────
    if (req.method === "GET" && action === "historial") {
      const rows = await sql`
        SELECT * FROM transacciones WHERE discord_id = ${discord_id}
        ORDER BY created_at DESC LIMIT 50
      `;
      return res.status(200).json({
        transacciones: rows.map(t => ({ ...t, monto: toNumber(t.monto), saldo_after: toNumber(t.saldo_after) })),
      });
    }

    // ══════════════════════════════════════════════════════════════════════
    // PRÉSTAMOS
    // ══════════════════════════════════════════════════════════════════════

    // ── POST: solicitar préstamo ─────────────────────────────────────────────
    if (req.method === "POST" && action === "prestamo_solicitar") {
      const cuenta = await sql`SELECT * FROM banco WHERE discord_id = ${discord_id}`;
      if (cuenta.length === 0)
        return res.status(404).json({ error: "No tienes cuenta bancaria" });

      let { monto, razon, cuotas, acepta_cobro_auto } = req.body || {};
      const montoNum = parseMonto(monto);
      const cuotasNum = parseMonto(cuotas);
      razon = (razon || "").toString().trim().slice(0, 200);

      if (montoNum === null || montoNum <= 0)
        return res.status(400).json({ error: "Ingresa un monto válido." });
      if (montoNum > PRESTAMO_MONTO_MAX)
        return res.status(400).json({ error: `El monto máximo por préstamo es $${PRESTAMO_MONTO_MAX.toLocaleString('es-CL')}.` });
      if (!razon)
        return res.status(400).json({ error: "Indica la razón del préstamo." });
      if (cuotasNum === null || cuotasNum < PRESTAMO_CUOTAS_MIN || cuotasNum > PRESTAMO_CUOTAS_MAX)
        return res.status(400).json({ error: `Las cuotas deben ser entre ${PRESTAMO_CUOTAS_MIN} y ${PRESTAMO_CUOTAS_MAX}.` });
      if (acepta_cobro_auto !== true)
        return res.status(400).json({ error: "Debes aceptar el cobro automático de las cuotas para solicitar el préstamo." });

      // Solo se permite un préstamo activo (pendiente o aprobado sin pagar) a la vez
      const existente = await sql`
        SELECT id FROM prestamos WHERE discord_id = ${discord_id} AND estado IN ('pendiente','aprobado')
      `;
      if (existente.length > 0)
        return res.status(409).json({ error: "Ya tienes un préstamo pendiente o activo. Debes terminar de pagarlo (o esperar la respuesta del admin) antes de pedir otro." });

      const cuotaMonto = Math.ceil(montoNum / cuotasNum);

      const rows = await sql`
        INSERT INTO prestamos (discord_id, monto, razon, cuotas_totales, cuota_monto, saldo_pendiente, acepta_cobro_auto, estado)
        VALUES (${discord_id}, ${montoNum}, ${razon}, ${cuotasNum}, ${cuotaMonto}, ${montoNum}, TRUE, 'pendiente')
        RETURNING *
      `;

      return res.status(201).json({
        ok: true,
        prestamo: { ...rows[0], monto: toNumber(rows[0].monto), cuota_monto: toNumber(rows[0].cuota_monto), saldo_pendiente: toNumber(rows[0].saldo_pendiente) },
      });
    }

    // ── GET: mis préstamos ───────────────────────────────────────────────────
    if (req.method === "GET" && action === "prestamos_mios") {
      const rows = await sql`
        SELECT * FROM prestamos WHERE discord_id = ${discord_id}
        ORDER BY created_at DESC LIMIT 30
      `;
      return res.status(200).json({
        prestamos: rows.map(p => ({
          ...p,
          monto: toNumber(p.monto),
          cuota_monto: toNumber(p.cuota_monto),
          saldo_pendiente: toNumber(p.saldo_pendiente),
          deuda_ciclo: toNumber(p.deuda_ciclo),
        })),
      });
    }

    // ── POST: cancelar solicitud de préstamo (solo si sigue pendiente) ──────
    if (req.method === "POST" && action === "prestamo_cancelar") {
      const { prestamo_id } = req.body || {};
      const rows = await sql`
        SELECT * FROM prestamos WHERE id = ${prestamo_id} AND discord_id = ${discord_id}
      `;
      if (rows.length === 0) return res.status(404).json({ error: "Préstamo no encontrado." });
      if (rows[0].estado !== 'pendiente')
        return res.status(400).json({ error: "Solo puedes cancelar una solicitud que aún está pendiente de revisión." });

      await sql`UPDATE prestamos SET estado = 'rechazado', motivo_rechazo = 'Cancelado por el usuario', revisado_en = NOW() WHERE id = ${prestamo_id}`;
      return res.status(200).json({ ok: true });
    }

    // ── ADMIN: listar préstamos ──────────────────────────────────────────────
    if (req.method === "GET" && action === "admin_prestamos") {
      if (!puedeAdminBanco)
        return res.status(403).json({ error: "No autorizado" });

      const { estado: estadoFiltro } = req.query;
      const rows = estadoFiltro
        ? await sql`
            SELECT p.*, d.nombre1, d.apellido1, d.rut
            FROM prestamos p
            LEFT JOIN dni d ON p.discord_id = d.discord_id
            WHERE p.estado = ${estadoFiltro}
            ORDER BY p.created_at DESC
            LIMIT 100
          `
        : await sql`
            SELECT p.*, d.nombre1, d.apellido1, d.rut
            FROM prestamos p
            LEFT JOIN dni d ON p.discord_id = d.discord_id
            ORDER BY p.created_at DESC
            LIMIT 100
          `;

      return res.status(200).json({
        prestamos: rows.map(p => ({
          ...p,
          monto: toNumber(p.monto),
          cuota_monto: toNumber(p.cuota_monto),
          saldo_pendiente: toNumber(p.saldo_pendiente),
          deuda_ciclo: toNumber(p.deuda_ciclo),
        })),
      });
    }

    // ── ADMIN: aprobar préstamo ──────────────────────────────────────────────
    if (req.method === "POST" && action === "admin_prestamo_aprobar") {
      if (!puedeAdminBanco)
        return res.status(403).json({ error: "No autorizado" });

      const { prestamo_id } = req.body || {};
      const rows = await sql`SELECT * FROM prestamos WHERE id = ${prestamo_id}`;
      if (rows.length === 0) return res.status(404).json({ error: "Préstamo no encontrado." });
      const prestamo = rows[0];
      if (prestamo.estado !== 'pendiente')
        return res.status(400).json({ error: "Este préstamo ya fue revisado." });

      const cuentaDest = await sql`SELECT * FROM banco WHERE discord_id = ${prestamo.discord_id}`;
      if (cuentaDest.length === 0) return res.status(404).json({ error: "El usuario ya no tiene cuenta bancaria." });

      const montoNum = toNumber(prestamo.monto);
      const nuevoSaldo = toNumber(cuentaDest[0].saldo) + montoNum;

      await sql`UPDATE banco SET saldo = ${nuevoSaldo} WHERE discord_id = ${prestamo.discord_id}`;
      await sql`
        INSERT INTO transacciones (discord_id, tipo, monto, descripcion, saldo_after)
        VALUES (${prestamo.discord_id}, 'ingreso', ${montoNum}, ${'Préstamo aprobado: ' + prestamo.razon}, ${nuevoSaldo})
      `;
      await sql`
        UPDATE prestamos
        SET estado = 'aprobado', ultimo_cobro = NOW(), revisado_por = ${discord_id},
            revisado_por_nombre = ${discord_name}, revisado_en = NOW()
        WHERE id = ${prestamo_id}
      `;

      await checkLogrosSaldo(sql, prestamo.discord_id, nuevoSaldo);

      const etiquetaPrestamo = await etiquetaUsuario(sql, prestamo.discord_id);
      await registrarStaffLog(sql, discord_id, discord_name, "PRESTAMO_APROBAR",
        `Aprobó un préstamo de $${montoNum.toLocaleString('es-CL')} (${prestamo.cuotas_totales} cuotas) a ${etiquetaPrestamo} — "${prestamo.razon}"`);

      return res.status(200).json({ ok: true, nuevoSaldo });
    }

    // ── ADMIN: rechazar préstamo ─────────────────────────────────────────────
    if (req.method === "POST" && action === "admin_prestamo_rechazar") {
      if (!puedeAdminBanco)
        return res.status(403).json({ error: "No autorizado" });

      const { prestamo_id, motivo } = req.body || {};
      const rows = await sql`SELECT * FROM prestamos WHERE id = ${prestamo_id}`;
      if (rows.length === 0) return res.status(404).json({ error: "Préstamo no encontrado." });
      const prestamo = rows[0];
      if (prestamo.estado !== 'pendiente')
        return res.status(400).json({ error: "Este préstamo ya fue revisado." });

      await sql`
        UPDATE prestamos
        SET estado = 'rechazado', motivo_rechazo = ${(motivo || '').toString().trim().slice(0, 200) || null},
            revisado_por = ${discord_id}, revisado_por_nombre = ${discord_name}, revisado_en = NOW()
        WHERE id = ${prestamo_id}
      `;

      const etiquetaRechazo = await etiquetaUsuario(sql, prestamo.discord_id);
      await registrarStaffLog(sql, discord_id, discord_name, "PRESTAMO_RECHAZAR",
        `Rechazó un préstamo de $${toNumber(prestamo.monto).toLocaleString('es-CL')} a ${etiquetaRechazo}${motivo ? ` — "${motivo}"` : ""}`);

      return res.status(200).json({ ok: true });
    }

    // ── GET: top 10 más ricos ────────────────────────────────────────────────
    // Ranking público (cualquier usuario con sesión puede verlo, no requiere
    // ser admin/staff). Se trae el top 10 por saldo y, aparte, la posición
    // del usuario que consulta (aunque no esté en el top 10) para mostrarla
    // en el footer del ranking.
    if (req.method === "GET" && action === "top10") {
      const top = await sql`
        SELECT discord_id, saldo FROM banco ORDER BY saldo DESC LIMIT 10
      `;

      // Nombres y avatares de Discord vía la tabla dni (si no existe o falla,
      // se sigue sin ellos: el front cae a "Ciudadano" + discord_id truncado
      // y a un ícono placeholder).
      let nombresPorId = {};
      let avataresPorId = {};
      try {
        const ids = top.map(r => r.discord_id);
        if (ids.length > 0) {
          const dnis = await sql`
            SELECT discord_id, discord_username, discord_avatar FROM dni WHERE discord_id = ANY(${ids})
          `;
          nombresPorId  = Object.fromEntries(dnis.map(d => [d.discord_id, d.discord_username]));
          avataresPorId = Object.fromEntries(dnis.map(d => [d.discord_id, d.discord_avatar]));
        }
      } catch {}

      const ranking = top.map((r, i) => ({
        posicion: i + 1,
        discord_id: r.discord_id,
        discord_username: nombresPorId[r.discord_id] || null,
        discord_avatar: avataresPorId[r.discord_id] || null,
        saldo: toNumber(r.saldo),
      }));

      // Posición del usuario que consulta (para mostrar "Tu posición: #47"
      // si no aparece en el top 10).
      let miPosicion = null;
      const yaEstaEnTop = ranking.some(r => r.discord_id === discord_id);
      if (!yaEstaEnTop) {
        const cuenta = await sql`SELECT saldo FROM banco WHERE discord_id = ${discord_id}`;
        if (cuenta.length > 0) {
          const mejores = await sql`SELECT COUNT(*)::int AS n FROM banco WHERE saldo > ${cuenta[0].saldo}`;
          miPosicion = { posicion: mejores[0].n + 1, saldo: toNumber(cuenta[0].saldo) };
        }
      }

      return res.status(200).json({ ranking, miPosicion });
    }

    // ── ADMIN: listar usuarios con cuenta ────────────────────────────────────
    if (req.method === "GET" && action === "admin_usuarios") {
      if (!puedeAdminBanco)
        return res.status(403).json({ error: "No autorizado" });

      const rows = await sql`
        SELECT b.discord_id, b.numero_cuenta, b.saldo, b.created_at,
               d.nombre1, d.apellido1, d.rut
        FROM banco b
        LEFT JOIN dni d ON b.discord_id = d.discord_id
        ORDER BY b.created_at DESC
      `;
      return res.status(200).json({
        usuarios: rows.map(u => ({ ...u, saldo: toNumber(u.saldo) })),
      });
    }

    // ── ADMIN: ajustar saldo ──────────────────────────────────────────────────
    if (req.method === "POST" && action === "admin_saldo") {
      if (!puedeAdminBanco)
        return res.status(403).json({ error: "No autorizado" });

      const { discord_id_target, monto, descripcion } = req.body;
      const montoNum = parseMonto(monto);
      if (montoNum === null)
        return res.status(400).json({ error: "Monto inválido" });

      const cuenta = await sql`SELECT * FROM banco WHERE discord_id = ${discord_id_target}`;
      if (cuenta.length === 0) return res.status(404).json({ error: "Usuario sin cuenta" });

      const nuevoSaldo = toNumber(cuenta[0].saldo) + montoNum;
      if (nuevoSaldo < 0) return res.status(400).json({ error: "Saldo no puede quedar negativo" });
      if (!Number.isSafeInteger(nuevoSaldo))
        return res.status(400).json({ error: "El monto resultante es demasiado grande" });

      await sql`UPDATE banco SET saldo = ${nuevoSaldo} WHERE discord_id = ${discord_id_target}`;
      const tipo = montoNum >= 0 ? "ingreso" : "egreso";
      await sql`
        INSERT INTO transacciones (discord_id, tipo, monto, descripcion, saldo_after)
        VALUES (${discord_id_target}, ${tipo}, ${Math.abs(montoNum)}, ${descripcion || 'Ajuste administrativo'}, ${nuevoSaldo})
      `;

      await checkLogrosSaldo(sql, discord_id_target, nuevoSaldo);

      const etiqueta = await etiquetaUsuario(sql, discord_id_target);
      await registrarStaffLog(sql, discord_id, discord_name,
        montoNum >= 0 ? "SALDO_AGREGAR" : "SALDO_QUITAR",
        `${montoNum >= 0 ? "Agregó" : "Quitó"} $${Math.abs(montoNum).toLocaleString('es-CL')} ${montoNum >= 0 ? "a" : "de"} ${etiqueta}${descripcion ? ` — "${descripcion}"` : ""}`);

      return res.status(200).json({ ok: true, nuevoSaldo });
    }

    // ── ADMIN: resetear cuenta ────────────────────────────────────────────────
    if (req.method === "POST" && action === "admin_reset_cuenta") {
      if (!puedeAdminBanco)
        return res.status(403).json({ error: "No autorizado" });

      const { discord_id_target } = req.body;
      if (!discord_id_target)
        return res.status(400).json({ error: "Falta discord_id_target" });

      const cuenta = await sql`SELECT * FROM banco WHERE discord_id = ${discord_id_target}`;
      if (cuenta.length === 0) return res.status(404).json({ error: "Usuario sin cuenta" });

      await sql`UPDATE banco SET saldo = ${SALDO_INICIAL} WHERE discord_id = ${discord_id_target}`;
      await sql`
        INSERT INTO transacciones (discord_id, tipo, monto, descripcion, saldo_after)
        VALUES (${discord_id_target}, 'ajuste', ${SALDO_INICIAL}, 'Cuenta reseteada por administrador', ${SALDO_INICIAL})
      `;

      const etiquetaReset = await etiquetaUsuario(sql, discord_id_target);
      await registrarStaffLog(sql, discord_id, discord_name, "CUENTA_RESETEAR",
        `Reseteó la cuenta de ${etiquetaReset} a $${SALDO_INICIAL.toLocaleString('es-CL')}`);

      return res.status(200).json({ ok: true, nuevoSaldo: SALDO_INICIAL });
    }

    // ── ADMIN: ajustar saldo a TODAS las cuentas de una sola vez ──────────────
    // Suma o resta el mismo monto a cada cuenta del banco. Si restar dejaría
    // a alguna cuenta en negativo, esa cuenta puntual se deja en $0 en vez de
    // fallar toda la operación (así un "quitar 50k a todos" no se cae solo
    // porque un usuario tenía 20k) — se informa cuántas cuentas quedaron
    // "clampeadas" a $0 para que el admin lo sepa.
    if (req.method === "POST" && action === "admin_saldo_masivo") {
      if (!puedeAdminBanco)
        return res.status(403).json({ error: "No autorizado" });

      const { monto, descripcion } = req.body;
      const montoNum = parseMonto(monto);
      if (montoNum === null || montoNum === 0)
        return res.status(400).json({ error: "Monto inválido" });

      const cuentas = await sql`SELECT discord_id, saldo FROM banco`;
      if (cuentas.length === 0)
        return res.status(404).json({ error: "No hay cuentas registradas" });

      const tipo = montoNum >= 0 ? "ingreso" : "egreso";
      const descFinal = (descripcion && descripcion.trim()) ||
        (montoNum >= 0 ? "Ajuste masivo administrativo" : "Descuento masivo administrativo");

      let afectadas = 0;
      let clampeadas = 0;
      for (const cuenta of cuentas) {
        const saldoActual = toNumber(cuenta.saldo);
        let nuevoSaldo = saldoActual + montoNum;
        if (nuevoSaldo < 0) { nuevoSaldo = 0; clampeadas++; }
        if (!Number.isSafeInteger(nuevoSaldo)) continue;
        if (nuevoSaldo === saldoActual) continue;

        await sql`UPDATE banco SET saldo = ${nuevoSaldo} WHERE discord_id = ${cuenta.discord_id}`;
        await sql`
          INSERT INTO transacciones (discord_id, tipo, monto, descripcion, saldo_after)
          VALUES (${cuenta.discord_id}, ${tipo}, ${Math.abs(nuevoSaldo - saldoActual)}, ${descFinal}, ${nuevoSaldo})
        `;
        await checkLogrosSaldo(sql, cuenta.discord_id, nuevoSaldo);
        afectadas++;
      }

      await registrarStaffLog(sql, discord_id, discord_name,
        montoNum >= 0 ? "SALDO_MASIVO_AGREGAR" : "SALDO_MASIVO_QUITAR",
        `${montoNum >= 0 ? "Agregó" : "Quitó"} $${Math.abs(montoNum).toLocaleString('es-CL')} ${montoNum >= 0 ? "a" : "de"} TODAS las cuentas (${afectadas}/${cuentas.length} afectadas${clampeadas ? `, ${clampeadas} llegaron a $0` : ''})${descripcion ? ` — "${descripcion}"` : ""}`);

      return res.status(200).json({ ok: true, afectadas, clampeadas, total: cuentas.length });
    }

    // ── ADMIN: crear sueldo ───────────────────────────────────────────────────
    if (req.method === "POST" && action === "admin_sueldo_crear") {
      if (!puedeAdminBanco)
        return res.status(403).json({ error: "No autorizado" });

      const { discord_id_target, nombre, monto, dias } = req.body;
      const montoNum = parseMonto(monto);
      const diasNum  = parseMonto(dias);
      if (!nombre || montoNum === null || montoNum <= 0 || diasNum === null || diasNum <= 0)
        return res.status(400).json({ error: "Datos inválidos" });

      const rows = await sql`
        INSERT INTO sueldos (discord_id, nombre, monto, dias, ultimo_cobro)
        VALUES (${discord_id_target}, ${nombre}, ${montoNum}, ${diasNum}, NOW())
        RETURNING *
      `;

      const etiquetaSueldo = await etiquetaUsuario(sql, discord_id_target);
      await registrarStaffLog(sql, discord_id, discord_name, "SUELDO_AGREGAR",
        `Agregó el sueldo "${nombre}" ($${montoNum.toLocaleString('es-CL')} cada ${diasNum} día(s)) a ${etiquetaSueldo}`);

      return res.status(201).json({ sueldo: { ...rows[0], monto: toNumber(rows[0].monto) } });
    }

    // ── ADMIN: eliminar sueldo ────────────────────────────────────────────────
    if (req.method === "DELETE" && action === "admin_sueldo_borrar") {
      if (!puedeAdminBanco)
        return res.status(403).json({ error: "No autorizado" });

      const { sueldo_id } = req.query;
      const existente = await sql`SELECT * FROM sueldos WHERE id = ${sueldo_id}`;
      await sql`UPDATE sueldos SET activo = FALSE WHERE id = ${sueldo_id}`;

      if (existente.length > 0) {
        const etiquetaBorrar = await etiquetaUsuario(sql, existente[0].discord_id);
        await registrarStaffLog(sql, discord_id, discord_name, "SUELDO_QUITAR",
          `Quitó el sueldo "${existente[0].nombre}" ($${toNumber(existente[0].monto).toLocaleString('es-CL')}) a ${etiquetaBorrar}`);
      }

      return res.status(200).json({ ok: true });
    }

    // ── GET: listar contactos ─────────────────────────────────────────────────
    if (req.method === "GET" && action === "contactos") {
      const rows = await sql`
        SELECT * FROM contactos_banco WHERE discord_id = ${discord_id}
        ORDER BY created_at ASC
      `;
      return res.status(200).json({ contactos: rows });
    }

    // ── POST: agregar contacto ────────────────────────────────────────────────
    if (req.method === "POST" && action === "contacto_agregar") {
      const { nombre, rut } = req.body;
      if (!nombre || !rut)
        return res.status(400).json({ error: "Faltan campos" });

      const count = await sql`
        SELECT COUNT(*) FROM contactos_banco WHERE discord_id = ${discord_id}
      `;
      if (parseInt(count[0].count) >= 5)
        return res.status(400).json({ error: "Máximo 5 contactos permitidos" });

      // Verificar que el RUT existe en el sistema
      const dniCheck = await sql`SELECT discord_id, nombre1, apellido1 FROM dni WHERE rut = ${rut}`;
      if (dniCheck.length === 0)
        return res.status(404).json({ error: "RUT no encontrado en el sistema" });
      if (dniCheck[0].discord_id === discord_id)
        return res.status(400).json({ error: "No puedes agregarte a ti mismo" });

      try {
        const rows = await sql`
          INSERT INTO contactos_banco (discord_id, nombre, rut)
          VALUES (${discord_id}, ${nombre.trim()}, ${rut.trim()})
          RETURNING *
        `;
        return res.status(201).json({ contacto: rows[0] });
      } catch (e) {
        if (e.message?.includes("unique") || e.code === "23505")
          return res.status(409).json({ error: "Este RUT ya está en tus contactos" });
        throw e;
      }
    }

    // ── DELETE: eliminar contacto ─────────────────────────────────────────────
    if (req.method === "DELETE" && action === "contacto_borrar") {
      const { id } = req.query;
      await sql`
        DELETE FROM contactos_banco WHERE id = ${id} AND discord_id = ${discord_id}
      `;
      return res.status(200).json({ ok: true });
    }

    // ── POST: jugar una tirada de Ruleta ──────────────────────────────────────
    if (req.method === "POST" && action === "ruleta_jugar") {
      const { tipo, valor, monto } = req.body;
      if (!tipo || valor === undefined || valor === null)
        return res.status(400).json({ error: "Falta el tipo o valor de la apuesta" });
      if (!ruletaValorValido(tipo, valor))
        return res.status(400).json({ error: "Apuesta inválida" });

      const rl = await checkRateLimit(sql, discord_id, "casino", RATE_CASINO_SEG);
      if (rl) return res.status(429).json({ error: rl });

      const montoNum = parseMonto(monto);
      if (montoNum === null || montoNum <= 0)
        return res.status(400).json({ error: "Monto inválido" });
      if (montoNum < CASINO_MIN_APUESTA)
        return res.status(400).json({ error: `La apuesta mínima es $${CASINO_MIN_APUESTA.toLocaleString("es-CL")}.` });
      if (montoNum > CASINO_MAX_APUESTA)
        return res.status(400).json({ error: `La apuesta máxima es $${CASINO_MAX_APUESTA.toLocaleString("es-CL")}.` });

      const cuenta = await sql`SELECT * FROM banco WHERE discord_id = ${discord_id}`;
      if (cuenta.length === 0)
        return res.status(404).json({ error: "No tienes cuenta bancaria" });

      const saldoActual = toNumber(cuenta[0].saldo);
      if (saldoActual < montoNum)
        return res.status(400).json({ error: "Saldo insuficiente" });

      // Resultado del giro: se calcula en el servidor, el cliente solo lo anima.
      const numeroGanador = ruletaGirar();
      const color = ruletaColor(numeroGanador);
      const mult = ruletaMultiplicador(tipo, valor, numeroGanador);
      const gano = mult > 0;
      const pago = gano ? montoNum * mult : 0;
      const nuevoSaldo = saldoActual - montoNum + pago;

      await sql`UPDATE banco SET saldo = ${nuevoSaldo} WHERE discord_id = ${discord_id}`;

      const desc = `Ruleta: apuesta ${tipo}=${valor} por $${montoNum.toLocaleString("es-CL")} → salió ${numeroGanador} (${color})`;
      await sql`
        INSERT INTO transacciones (discord_id, tipo, monto, descripcion, saldo_after)
        VALUES (${discord_id}, 'casino', ${gano ? pago - montoNum : -montoNum}, ${desc}, ${nuevoSaldo})
      `;

      if (gano) await otorgarLogro(sql, discord_id, "suertudo");
      await checkLogrosSaldo(sql, discord_id, nuevoSaldo);

      return res.status(200).json({
        ok: true,
        numeroGanador,
        color,
        gano,
        pago,
        nuevoSaldo,
      });
    }

    // ── GET: historial reciente de tiradas de Ruleta ──────────────────────────
    if (req.method === "GET" && action === "ruleta_historial") {
      const rows = await sql`
        SELECT monto, descripcion, saldo_after, created_at FROM transacciones
        WHERE discord_id = ${discord_id} AND tipo = 'casino'
        ORDER BY created_at DESC
        LIMIT 15
      `;
      return res.status(200).json({ historial: rows });
    }

    return res.status(405).json({ error: "Método no permitido" });
  } catch (err) {
    console.error("Error en /api/banco:", err);
    return res.status(500).json({ error: "Error interno del servidor. Intenta de nuevo." });
  }
}
