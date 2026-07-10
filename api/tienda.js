import { neon } from "@neondatabase/serverless";
import { requireSession } from "../lib/auth.js";
import { SUPER_ADMIN_ID, BASE_URL } from "../lib/constants.js";
import { ensureLogrosSchema, otorgarLogro } from "../lib/logros.js";

async function getAdminIds(sql) {
  try {
    const rows = await sql`SELECT discord_id FROM admins`;
    return rows.map(r => r.discord_id);
  } catch {
    return [SUPER_ADMIN_ID];
  }
}

function parseMonto(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const CATEGORIAS_VALIDAS = ["vehiculos", "armas", "licencias", "otros"];

// Formato de patente exigido: 3 caracteres (letras o números) + guion + 3
// caracteres (letras o números). Ej: ABC-123, A3V-VSD.
const PATENTE_REGEX = /^[A-Z0-9]{3}-[A-Z0-9]{3}$/;

function randomAnio() {
  return Math.floor(Math.random() * (2026 - 2000 + 1)) + 2000;
}

let schemaReady = false;
async function initTables(sql) {
  if (schemaReady) return;
  // Tabla de productos de la tienda
  await sql`
    CREATE TABLE IF NOT EXISTS tienda_productos (
      id          SERIAL PRIMARY KEY,
      nombre      TEXT NOT NULL,
      precio      BIGINT NOT NULL,
      categoria   TEXT NOT NULL,
      imagen_url  TEXT,
      activo      BOOLEAN DEFAULT TRUE,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Tabla de inventario (compras de usuarios)
  await sql`
    CREATE TABLE IF NOT EXISTS inventario (
      id            SERIAL PRIMARY KEY,
      discord_id    TEXT NOT NULL,
      producto_id   INTEGER NOT NULL,
      nombre        TEXT NOT NULL,
      precio_pagado BIGINT NOT NULL,
      categoria     TEXT NOT NULL,
      imagen_url    TEXT,
      comprado_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_inventario_discord_id ON inventario(discord_id)
  `;

  // Tabla de vehículos registrados (Registro Civil vehicular). Vive ligada
  // 1:1 a un ítem del inventario (inventario_id) mediante el registro de
  // patente que hace el propietario desde su inventario.
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

  // Tabla del Mercado (marketplace entre ciudadanos): cada publicación apunta
  // a un ítem puntual del inventario del vendedor. El nombre/categoría/foto
  // se copian desde ese ítem al publicar (no se piden de nuevo), y el
  // vendedor solo aporta descripción + precio.
  await sql`
    CREATE TABLE IF NOT EXISTS mercado_publicaciones (
      id              SERIAL PRIMARY KEY,
      vendedor_id     TEXT NOT NULL,
      vendedor_nombre TEXT,
      inventario_id   INTEGER NOT NULL,
      nombre          TEXT NOT NULL,
      categoria       TEXT NOT NULL,
      imagen_url      TEXT,
      descripcion     TEXT NOT NULL,
      precio          BIGINT NOT NULL,
      activa          BOOLEAN NOT NULL DEFAULT TRUE,
      comprador_id    TEXT,
      vendida_at      TIMESTAMPTZ,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_mercado_activa ON mercado_publicaciones(activa)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_mercado_vendedor ON mercado_publicaciones(vendedor_id)
  `;
  schemaReady = true;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", BASE_URL);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const sql = neon(process.env.DATABASE_URL);
    await initTables(sql);
    await ensureLogrosSchema(sql);

    const { action } = req.query;

    // ── GET: listar productos activos (catálogo público, no requiere sesión) ──
    if (req.method === "GET" && action === "productos") {
      const { categoria } = req.query;
      let rows;
      if (categoria && CATEGORIAS_VALIDAS.includes(categoria)) {
        rows = await sql`
          SELECT * FROM tienda_productos
          WHERE activo = TRUE AND categoria = ${categoria}
          ORDER BY created_at DESC
        `;
      } else {
        rows = await sql`
          SELECT * FROM tienda_productos
          WHERE activo = TRUE
          ORDER BY categoria, created_at DESC
        `;
      }
      return res.status(200).json({
        productos: rows.map(p => ({ ...p, precio: toNumber(p.precio) })),
      });
    }

    // ── PUBLIC: base de datos — todos los DNI con su inventario ────────────
    // (Queda público a propósito: es el "padrón" de la ciudad, igual que en
    // el diseño original.)
    if (req.method === "GET" && action === "base_datos") {
      const { q } = req.query;

      let dnis;
      if (q && q.trim()) {
        const busq = `%${q.trim().toLowerCase()}%`;
        dnis = await sql`
          SELECT * FROM dni
          WHERE LOWER(nombre1)   LIKE ${busq}
             OR LOWER(nombre2)   LIKE ${busq}
             OR LOWER(apellido1) LIKE ${busq}
             OR LOWER(apellido2) LIKE ${busq}
             OR LOWER(rut)       LIKE ${busq}
          ORDER BY apellido1, nombre1
        `;
      } else {
        dnis = await sql`SELECT * FROM dni ORDER BY apellido1, nombre1`;
      }

      const ids = dnis.map(d => d.discord_id);
      let inventarios = [];
      if (ids.length > 0) {
        inventarios = await sql`
          SELECT * FROM inventario
          WHERE discord_id = ANY(${ids})
          ORDER BY comprado_at DESC
        `;
      }

      const invMap = {};
      for (const item of inventarios) {
        if (!invMap[item.discord_id]) invMap[item.discord_id] = [];
        invMap[item.discord_id].push({ ...item, precio_pagado: toNumber(item.precio_pagado) });
      }

      return res.status(200).json({
        registros: dnis.map(d => ({
          discord_id: d.discord_id,
          nombre1:    d.nombre1,
          nombre2:    d.nombre2,
          apellido1:  d.apellido1,
          apellido2:  d.apellido2,
          rut:        d.rut,
          fecha_nac:  d.fecha_nac,
          inventario: invMap[d.discord_id] || [],
        })),
      });
    }

    // ── A partir de aquí, todas las acciones requieren sesión ────────────────
    const session = requireSession(req, res);
    if (!session) return;
    const discord_id = session.id;
    const discord_name = session.name || session.tag || discord_id;

    const ADMIN_IDS_TIENDA = await getAdminIds(sql);
    const esAdmin = ADMIN_IDS_TIENDA.includes(discord_id);

    // ── POST: comprar producto ────────────────────────────────────────────────
    if (req.method === "POST" && action === "comprar") {
      const { producto_id } = req.body;
      if (!producto_id)
        return res.status(400).json({ error: "Faltan campos" });

      // Verificar producto existe y está activo
      const productos = await sql`
        SELECT * FROM tienda_productos WHERE id = ${producto_id} AND activo = TRUE
      `;
      if (productos.length === 0)
        return res.status(404).json({ error: "Producto no encontrado o no disponible" });

      const producto = productos[0];
      const precio = toNumber(producto.precio);

      // Verificar que el usuario no tenga ya este producto en su inventario
      const yaComprado = await sql`
        SELECT id FROM inventario
        WHERE discord_id = ${discord_id} AND producto_id = ${producto_id}
        LIMIT 1
      `;
      if (yaComprado.length > 0)
        return res.status(409).json({ error: "Ya tienes este producto en tu inventario." });

      // Verificar cuenta bancaria y saldo
      const cuentas = await sql`SELECT * FROM banco WHERE discord_id = ${discord_id}`;
      if (cuentas.length === 0)
        return res.status(403).json({ error: "Necesitas una cuenta bancaria para comprar" });

      const saldoActual = toNumber(cuentas[0].saldo);
      if (saldoActual < precio)
        return res.status(400).json({
          error: "Fondos insuficientes",
          saldo: saldoActual,
          precio,
          faltante: precio - saldoActual,
        });

      const nuevoSaldo = saldoActual - precio;

      // Descontar saldo
      await sql`UPDATE banco SET saldo = ${nuevoSaldo} WHERE discord_id = ${discord_id}`;

      // Registrar transacción en banco
      await sql`
        INSERT INTO transacciones (discord_id, tipo, monto, descripcion, saldo_after)
        VALUES (
          ${discord_id},
          'egreso',
          ${precio},
          ${'Compra en tienda: ' + producto.nombre},
          ${nuevoSaldo}
        )
      `;

      // Agregar al inventario
      const items = await sql`
        INSERT INTO inventario (discord_id, producto_id, nombre, precio_pagado, categoria, imagen_url)
        VALUES (${discord_id}, ${producto.id}, ${producto.nombre}, ${precio}, ${producto.categoria}, ${producto.imagen_url})
        RETURNING *
      `;

      // Logro: Tu Primer Auto (cualquier producto de la categoría "vehiculos")
      if (producto.categoria === "vehiculos") {
        await otorgarLogro(sql, discord_id, "primer_auto");
      }

      return res.status(200).json({
        ok: true,
        nuevoSaldo,
        item: { ...items[0], precio_pagado: toNumber(items[0].precio_pagado) },
      });
    }

    // ── GET: mi propio inventario ────────────────────────────────────────────
    if (req.method === "GET" && action === "inventario") {
      const rows = await sql`
        SELECT i.*, v.id AS vehiculo_id, v.patente, v.color AS v_color,
               v.anio AS v_anio, v.estado AS v_estado,
               v.fecha_inscripcion AS v_fecha_inscripcion
        FROM inventario i
        LEFT JOIN vehiculos_registrados v ON v.inventario_id = i.id
        WHERE i.discord_id = ${discord_id}
        ORDER BY i.comprado_at DESC
      `;
      return res.status(200).json({
        items: rows.map(i => ({
          ...i,
          precio_pagado: toNumber(i.precio_pagado),
          vehiculo: i.vehiculo_id ? {
            id: i.vehiculo_id,
            patente: i.patente,
            color: i.v_color,
            anio: i.v_anio,
            estado: i.v_estado,
            fecha_inscripcion: i.v_fecha_inscripcion,
          } : null,
        })),
      });
    }

    // ── POST: registrar vehículo (Registro Civil vehicular) ──────────────────
    if (req.method === "POST" && action === "registrarVehiculo") {
      const { item_id, patente, color } = req.body;
      if (!item_id || !patente || !color)
        return res.status(400).json({ error: "Faltan campos requeridos" });

      const patenteNorm = String(patente).trim().toUpperCase();
      if (!PATENTE_REGEX.test(patenteNorm))
        return res.status(400).json({ error: "Formato de patente inválido. Debe ser ABC-123." });

      const colorTrim = String(color).trim();
      if (!colorTrim) return res.status(400).json({ error: "Debes indicar un color." });

      const items = await sql`
        SELECT * FROM inventario WHERE id = ${item_id} AND discord_id = ${discord_id}
      `;
      if (items.length === 0)
        return res.status(404).json({ error: "Ese ítem no existe en tu inventario." });
      const item = items[0];
      if (item.categoria !== "vehiculos")
        return res.status(400).json({ error: "Solo los vehículos se pueden registrar." });

      const yaRegistrado = await sql`
        SELECT id FROM vehiculos_registrados WHERE inventario_id = ${item_id}
      `;
      if (yaRegistrado.length > 0)
        return res.status(409).json({ error: "Este vehículo ya está registrado." });

      const patenteOcupada = await sql`
        SELECT id FROM vehiculos_registrados WHERE patente = ${patenteNorm}
      `;
      if (patenteOcupada.length > 0)
        return res.status(409).json({ error: "Esa patente ya está en uso." });

      // Nombre del propietario: se prioriza el nombre real de su cédula
      const dniRows = await sql`SELECT nombre1, apellido1 FROM dni WHERE discord_id = ${discord_id}`;
      const propietarioNombre = dniRows.length > 0
        ? `${dniRows[0].nombre1} ${dniRows[0].apellido1}`
        : discord_name;

      const anio = randomAnio();
      const rows = await sql`
        INSERT INTO vehiculos_registrados
          (inventario_id, patente, modelo, color, anio, estado, propietario_actual_id, propietario_actual_nombre, duenos_anteriores)
        VALUES
          (${item_id}, ${patenteNorm}, ${item.nombre}, ${colorTrim}, ${anio}, 'Activo', ${discord_id}, ${propietarioNombre}, '[]')
        RETURNING *
      `;
      return res.status(201).json({ vehiculo: rows[0] });
    }

    // ── GET: obtener un registro vehicular (por item_id o vehiculo_id) ───────
    if (req.method === "GET" && action === "vehiculo") {
      const { item_id, vehiculo_id } = req.query;
      let rows;
      if (vehiculo_id) {
        rows = await sql`SELECT * FROM vehiculos_registrados WHERE id = ${vehiculo_id}`;
      } else if (item_id) {
        rows = await sql`SELECT * FROM vehiculos_registrados WHERE inventario_id = ${item_id}`;
      } else {
        return res.status(400).json({ error: "Falta item_id o vehiculo_id" });
      }
      if (rows.length === 0)
        return res.status(404).json({ error: "Vehículo no encontrado" });
      return res.status(200).json({ vehiculo: rows[0] });
    }

    // ── GET: buscar posible nuevo propietario para transferencia ─────────────
    // Busca por ID de Discord, RUT/DNI, nombre de Discord o nombre de personaje.
    if (req.method === "GET" && action === "buscarPropietario") {
      const { q } = req.query;
      if (!q || !q.trim()) return res.status(400).json({ error: "Falta parámetro de búsqueda" });
      const busq = `%${q.trim().replace(/^@/, "").toLowerCase()}%`;
      const rows = await sql`
        SELECT discord_id, rut, discord_username, nombre1, apellido1
        FROM dni
        WHERE LOWER(discord_id) LIKE ${busq}
           OR LOWER(rut) LIKE ${busq}
           OR LOWER(discord_username) LIKE ${busq}
           OR LOWER(nombre1 || ' ' || apellido1) LIKE ${busq}
        LIMIT 10
      `;
      return res.status(200).json({
        usuarios: rows.map(r => ({
          discord_id: r.discord_id,
          rut: r.rut,
          discord_username: r.discord_username,
          nombre_completo: `${r.nombre1} ${r.apellido1}`,
        })),
      });
    }

    // ── POST: transferir vehículo a un nuevo propietario ──────────────────────
    if (req.method === "POST" && action === "transferirVehiculo") {
      const { vehiculo_id, nuevo_propietario_id } = req.body;
      if (!vehiculo_id || !nuevo_propietario_id)
        return res.status(400).json({ error: "Faltan campos requeridos" });

      const vehiculos = await sql`SELECT * FROM vehiculos_registrados WHERE id = ${vehiculo_id}`;
      if (vehiculos.length === 0)
        return res.status(404).json({ error: "Vehículo no encontrado" });
      const vehiculo = vehiculos[0];

      if (vehiculo.propietario_actual_id !== discord_id)
        return res.status(403).json({ error: "No eres el propietario actual de este vehículo." });

      if (nuevo_propietario_id === discord_id)
        return res.status(400).json({ error: "El nuevo propietario debe ser distinto al actual." });

      const nuevoDni = await sql`SELECT nombre1, apellido1 FROM dni WHERE discord_id = ${nuevo_propietario_id}`;
      if (nuevoDni.length === 0)
        return res.status(404).json({ error: "El nuevo propietario no tiene cédula registrada." });
      const nuevoNombre = `${nuevoDni[0].nombre1} ${nuevoDni[0].apellido1}`;

      const historial = Array.isArray(vehiculo.duenos_anteriores) ? vehiculo.duenos_anteriores : [];
      historial.push({
        discord_id: vehiculo.propietario_actual_id,
        nombre: vehiculo.propietario_actual_nombre,
        fecha_hasta: new Date().toISOString(),
      });

      const rows = await sql`
        UPDATE vehiculos_registrados
        SET propietario_actual_id = ${nuevo_propietario_id},
            propietario_actual_nombre = ${nuevoNombre},
            duenos_anteriores = ${JSON.stringify(historial)}::jsonb
        WHERE id = ${vehiculo_id}
        RETURNING *
      `;

      // Mover el ítem de inventario al nuevo propietario
      await sql`UPDATE inventario SET discord_id = ${nuevo_propietario_id} WHERE id = ${vehiculo.inventario_id}`;

      return res.status(200).json({ vehiculo: rows[0] });
    }

    // ══════════════════════════════════════════════════════════════════════
    // MERCADO — compraventa de ítems del inventario entre ciudadanos
    // ══════════════════════════════════════════════════════════════════════

    // ── GET: listado público de publicaciones activas ────────────────────────
    if (req.method === "GET" && action === "mercado_listado") {
      const { categoria } = req.query;
      let rows;
      if (categoria && CATEGORIAS_VALIDAS.includes(categoria)) {
        rows = await sql`
          SELECT * FROM mercado_publicaciones
          WHERE activa = TRUE AND categoria = ${categoria}
          ORDER BY created_at DESC
        `;
      } else {
        rows = await sql`
          SELECT * FROM mercado_publicaciones
          WHERE activa = TRUE
          ORDER BY created_at DESC
        `;
      }
      return res.status(200).json({
        publicaciones: rows.map(p => ({ ...p, precio: toNumber(p.precio) })),
      });
    }

    // ── GET: mis publicaciones (activas y vendidas) ───────────────────────────
    if (req.method === "GET" && action === "mercado_mis_publicaciones") {
      const rows = await sql`
        SELECT * FROM mercado_publicaciones
        WHERE vendedor_id = ${discord_id}
        ORDER BY activa DESC, created_at DESC
      `;
      return res.status(200).json({
        publicaciones: rows.map(p => ({ ...p, precio: toNumber(p.precio) })),
      });
    }

    // ── POST: publicar un ítem del inventario en el mercado ───────────────────
    if (req.method === "POST" && action === "mercado_publicar") {
      const { item_id, descripcion, precio } = req.body;
      if (!item_id || !descripcion || !String(descripcion).trim())
        return res.status(400).json({ error: "Faltan campos requeridos." });

      const descTrim = String(descripcion).trim();
      if (descTrim.length > 300)
        return res.status(400).json({ error: "La descripción no puede superar los 300 caracteres." });

      const precioNum = parseMonto(precio);
      if (precioNum === null || precioNum <= 0)
        return res.status(400).json({ error: "El precio debe ser un número entero mayor a 0." });

      const items = await sql`
        SELECT * FROM inventario WHERE id = ${item_id} AND discord_id = ${discord_id}
      `;
      if (items.length === 0)
        return res.status(404).json({ error: "Ese ítem no existe en tu inventario." });
      const item = items[0];

      const yaPublicado = await sql`
        SELECT id FROM mercado_publicaciones WHERE inventario_id = ${item_id} AND activa = TRUE
      `;
      if (yaPublicado.length > 0)
        return res.status(409).json({ error: "Ese ítem ya está publicado en el mercado." });

      const rows = await sql`
        INSERT INTO mercado_publicaciones
          (vendedor_id, vendedor_nombre, inventario_id, nombre, categoria, imagen_url, descripcion, precio)
        VALUES
          (${discord_id}, ${discord_name}, ${item_id}, ${item.nombre}, ${item.categoria}, ${item.imagen_url}, ${descTrim}, ${precioNum})
        RETURNING *
      `;
      return res.status(201).json({
        publicacion: { ...rows[0], precio: toNumber(rows[0].precio) },
      });
    }

    // ── POST: bajar (despublicar) una publicación propia ──────────────────────
    if (req.method === "POST" && action === "mercado_despublicar") {
      const { publicacion_id } = req.body;
      if (!publicacion_id)
        return res.status(400).json({ error: "Falta publicacion_id" });

      const pubs = await sql`SELECT * FROM mercado_publicaciones WHERE id = ${publicacion_id}`;
      if (pubs.length === 0)
        return res.status(404).json({ error: "Publicación no encontrada." });
      if (pubs[0].vendedor_id !== discord_id)
        return res.status(403).json({ error: "No puedes bajar una publicación que no es tuya." });
      if (!pubs[0].activa)
        return res.status(409).json({ error: "Esa publicación ya no está activa." });

      await sql`UPDATE mercado_publicaciones SET activa = FALSE WHERE id = ${publicacion_id}`;
      return res.status(200).json({ ok: true });
    }

    // ── POST: comprar una publicación del mercado ─────────────────────────────
    if (req.method === "POST" && action === "mercado_comprar") {
      const { publicacion_id } = req.body;
      if (!publicacion_id)
        return res.status(400).json({ error: "Falta publicacion_id" });

      const pubs = await sql`SELECT * FROM mercado_publicaciones WHERE id = ${publicacion_id}`;
      if (pubs.length === 0)
        return res.status(404).json({ error: "Publicación no encontrada." });
      const pub = pubs[0];

      if (!pub.activa)
        return res.status(409).json({ error: "Esa publicación ya no está disponible." });
      if (pub.vendedor_id === discord_id)
        return res.status(400).json({ error: "No puedes comprar tu propia publicación." });

      const precio = toNumber(pub.precio);

      const cuentasComprador = await sql`SELECT * FROM banco WHERE discord_id = ${discord_id}`;
      if (cuentasComprador.length === 0)
        return res.status(403).json({ error: "Necesitas una cuenta bancaria para comprar." });
      const saldoComprador = toNumber(cuentasComprador[0].saldo);
      if (saldoComprador < precio)
        return res.status(400).json({
          error: "Fondos insuficientes",
          saldo: saldoComprador,
          precio,
          faltante: precio - saldoComprador,
        });

      const cuentasVendedor = await sql`SELECT * FROM banco WHERE discord_id = ${pub.vendedor_id}`;
      if (cuentasVendedor.length === 0)
        return res.status(409).json({ error: "El vendedor ya no tiene una cuenta bancaria activa." });
      const saldoVendedor = toNumber(cuentasVendedor[0].saldo);

      // El ítem podría haber sido movido/eliminado desde que se publicó
      const itemRows = await sql`SELECT * FROM inventario WHERE id = ${pub.inventario_id}`;
      if (itemRows.length === 0 || itemRows[0].discord_id !== pub.vendedor_id) {
        await sql`UPDATE mercado_publicaciones SET activa = FALSE WHERE id = ${publicacion_id}`;
        return res.status(409).json({ error: "Ese ítem ya no está disponible." });
      }

      const nuevoSaldoComprador = saldoComprador - precio;
      const nuevoSaldoVendedor  = saldoVendedor + precio;

      await sql`UPDATE banco SET saldo = ${nuevoSaldoComprador} WHERE discord_id = ${discord_id}`;
      await sql`UPDATE banco SET saldo = ${nuevoSaldoVendedor} WHERE discord_id = ${pub.vendedor_id}`;

      await sql`
        INSERT INTO transacciones (discord_id, tipo, monto, descripcion, saldo_after)
        VALUES (${discord_id}, 'egreso', ${precio}, ${'Compra en mercado: ' + pub.nombre}, ${nuevoSaldoComprador})
      `;
      await sql`
        INSERT INTO transacciones (discord_id, tipo, monto, descripcion, saldo_after)
        VALUES (${pub.vendedor_id}, 'ingreso', ${precio}, ${'Venta en mercado: ' + pub.nombre}, ${nuevoSaldoVendedor})
      `;

      // Mover el ítem de inventario al comprador
      await sql`UPDATE inventario SET discord_id = ${discord_id} WHERE id = ${pub.inventario_id}`;

      // Si es un vehículo con patente registrada, actualizar también su
      // propietario (mismo mecanismo que transferirVehiculo).
      const vehRows = await sql`SELECT * FROM vehiculos_registrados WHERE inventario_id = ${pub.inventario_id}`;
      if (vehRows.length > 0) {
        const veh = vehRows[0];
        const dniComprador = await sql`SELECT nombre1, apellido1 FROM dni WHERE discord_id = ${discord_id}`;
        const nombreComprador = dniComprador.length > 0
          ? `${dniComprador[0].nombre1} ${dniComprador[0].apellido1}`
          : discord_name;
        const historial = Array.isArray(veh.duenos_anteriores) ? veh.duenos_anteriores : [];
        historial.push({
          discord_id: veh.propietario_actual_id,
          nombre: veh.propietario_actual_nombre,
          fecha_hasta: new Date().toISOString(),
        });
        await sql`
          UPDATE vehiculos_registrados
          SET propietario_actual_id = ${discord_id},
              propietario_actual_nombre = ${nombreComprador},
              duenos_anteriores = ${JSON.stringify(historial)}::jsonb
          WHERE id = ${veh.id}
        `;
      }

      await sql`
        UPDATE mercado_publicaciones
        SET activa = FALSE, comprador_id = ${discord_id}, vendida_at = NOW()
        WHERE id = ${publicacion_id}
      `;

      return res.status(200).json({ ok: true, nuevoSaldo: nuevoSaldoComprador });
    }

    // ── ADMIN: listar todos los productos (incluyendo inactivos) ─────────────
    if (req.method === "GET" && action === "admin_productos") {
      if (!esAdmin)
        return res.status(403).json({ error: "No autorizado" });

      const rows = await sql`
        SELECT * FROM tienda_productos ORDER BY created_at DESC
      `;
      return res.status(200).json({
        productos: rows.map(p => ({ ...p, precio: toNumber(p.precio) })),
      });
    }

    // ── ADMIN: crear producto ────────────────────────────────────────────────
    if (req.method === "POST" && action === "admin_crear_producto") {
      if (!esAdmin)
        return res.status(403).json({ error: "No autorizado" });

      const { nombre, precio, categoria, imagen_url } = req.body;
      if (!nombre || !precio || !categoria)
        return res.status(400).json({ error: "Faltan campos obligatorios" });

      if (!CATEGORIAS_VALIDAS.includes(categoria))
        return res.status(400).json({ error: "Categoría inválida" });

      const precioNum = parseMonto(precio);
      if (precioNum === null || precioNum <= 0)
        return res.status(400).json({ error: "Precio inválido" });

      const rows = await sql`
        INSERT INTO tienda_productos (nombre, precio, categoria, imagen_url)
        VALUES (${nombre}, ${precioNum}, ${categoria}, ${imagen_url || null})
        RETURNING *
      `;
      return res.status(201).json({
        producto: { ...rows[0], precio: toNumber(rows[0].precio) },
      });
    }

    // ── ADMIN: editar producto ───────────────────────────────────────────────
    if (req.method === "PUT" && action === "admin_editar_producto") {
      if (!esAdmin)
        return res.status(403).json({ error: "No autorizado" });

      const { producto_id, nombre, precio, categoria, imagen_url } = req.body;
      if (!producto_id)
        return res.status(400).json({ error: "Falta producto_id" });

      const existe = await sql`SELECT id FROM tienda_productos WHERE id = ${producto_id}`;
      if (existe.length === 0)
        return res.status(404).json({ error: "Producto no encontrado" });

      const precioNum = precio ? parseMonto(precio) : null;
      if (precio !== undefined && (precioNum === null || precioNum <= 0))
        return res.status(400).json({ error: "Precio inválido" });

      if (categoria && !CATEGORIAS_VALIDAS.includes(categoria))
        return res.status(400).json({ error: "Categoría inválida" });

      const rows = await sql`
        UPDATE tienda_productos
        SET
          nombre     = COALESCE(${nombre || null}, nombre),
          precio     = COALESCE(${precioNum}, precio),
          categoria  = COALESCE(${categoria || null}, categoria),
          imagen_url = COALESCE(${imagen_url !== undefined ? imagen_url : null}, imagen_url)
        WHERE id = ${producto_id}
        RETURNING *
      `;
      return res.status(200).json({
        producto: { ...rows[0], precio: toNumber(rows[0].precio) },
      });
    }

    // ── ADMIN: eliminar (desactivar) producto ────────────────────────────────
    if (req.method === "DELETE" && action === "admin_eliminar_producto") {
      if (!esAdmin)
        return res.status(403).json({ error: "No autorizado" });

      const { producto_id } = req.query;
      await sql`UPDATE tienda_productos SET activo = FALSE WHERE id = ${producto_id}`;
      return res.status(200).json({ ok: true });
    }

    // ── ADMIN: listar todos los usuarios con inventario (con DNI) ────────────
    if (req.method === "GET" && action === "admin_inventarios") {
      if (!esAdmin)
        return res.status(403).json({ error: "No autorizado" });

      const rows = await sql`
        SELECT
          i.discord_id,
          COUNT(i.id)::int AS cantidad,
          d.nombre1,
          d.apellido1,
          d.rut
        FROM inventario i
        LEFT JOIN dni d ON d.discord_id = i.discord_id
        WHERE d.discord_id IS NOT NULL
        GROUP BY i.discord_id, d.nombre1, d.apellido1, d.rut
        ORDER BY d.apellido1, d.nombre1
      `;

      return res.status(200).json({
        usuarios: rows.map(r => ({
          discord_id: r.discord_id,
          nombre: `${r.nombre1 || ''} ${r.apellido1 || ''}`.trim() || r.discord_id,
          rut: r.rut || null,
          cantidad: r.cantidad,
        })),
      });
    }

    // ── ADMIN: obtener inventario de un usuario específico ─────────────────
    if (req.method === "GET" && action === "admin_inventario_usuario") {
      if (!esAdmin)
        return res.status(403).json({ error: "No autorizado" });

      const { discord_id: targetId } = req.query;
      if (!targetId)
        return res.status(400).json({ error: "Falta discord_id" });

      const rows = await sql`
        SELECT * FROM inventario
        WHERE discord_id = ${targetId}
        ORDER BY comprado_at DESC
      `;

      return res.status(200).json({
        items: rows.map(i => ({ ...i, precio_pagado: toNumber(i.precio_pagado) })),
      });
    }

    // ── ADMIN: eliminar item del inventario de un usuario ──────────────────
    if (req.method === "DELETE" && action === "admin_eliminar_item_inventario") {
      if (!esAdmin)
        return res.status(403).json({ error: "No autorizado" });

      const { item_id } = req.query;
      if (!item_id)
        return res.status(400).json({ error: "Falta item_id" });

      await sql`DELETE FROM inventario WHERE id = ${item_id}`;
      return res.status(200).json({ ok: true });
    }

    // ── ADMIN: base de datos con búsqueda (vista admin) ──────────────────────
    if (req.method === "GET" && action === "admin_base_datos") {
      if (!esAdmin)
        return res.status(403).json({ error: "No autorizado" });

      const { q } = req.query;

      let dnis;
      if (q && q.trim()) {
        const busq = `%${q.trim().toLowerCase()}%`;
        dnis = await sql`
          SELECT * FROM dni
          WHERE LOWER(nombre1)   LIKE ${busq}
             OR LOWER(nombre2)   LIKE ${busq}
             OR LOWER(apellido1) LIKE ${busq}
             OR LOWER(apellido2) LIKE ${busq}
             OR LOWER(rut)       LIKE ${busq}
          ORDER BY apellido1, nombre1
        `;
      } else {
        dnis = await sql`SELECT * FROM dni ORDER BY apellido1, nombre1`;
      }

      const ids = dnis.map(d => d.discord_id);
      let inventarios = [];
      if (ids.length > 0) {
        inventarios = await sql`
          SELECT * FROM inventario
          WHERE discord_id = ANY(${ids})
          ORDER BY comprado_at DESC
        `;
      }

      const invMap = {};
      for (const item of inventarios) {
        if (!invMap[item.discord_id]) invMap[item.discord_id] = [];
        invMap[item.discord_id].push({ ...item, precio_pagado: toNumber(item.precio_pagado) });
      }

      return res.status(200).json({
        registros: dnis.map(d => ({
          discord_id: d.discord_id,
          nombre1:   d.nombre1,
          nombre2:   d.nombre2,
          apellido1: d.apellido1,
          apellido2: d.apellido2,
          rut:       d.rut,
          fecha_nac: d.fecha_nac,
          inventario: invMap[d.discord_id] || [],
        })),
      });
    }

    return res.status(405).json({ error: "Método no permitido" });
  } catch (err) {
    console.error("Error en /api/tienda:", err);
    return res.status(500).json({ error: "Error interno del servidor. Intenta de nuevo." });
  }
}
