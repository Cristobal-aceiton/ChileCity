// ══════════════════════════════════════════════════════════════════════════
// Conexión de banco.html con la API real (/api/banco).
// La identidad del usuario viene de la cookie de sesión (cc_session), por
// eso no hace falta mandar discord_id a mano: el navegador la envía sola en
// cada fetch same-origin.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  const $ = (id) => document.getElementById(id);

  let cuentaActual = null;

  function formatCLP(monto) {
    const n = Number(monto) || 0;
    return '$' + n.toLocaleString('es-CL');
  }

  // Enmascara el número de cuenta dejando solo los últimos 4 dígitos visibles.
  function maskNumeroCuenta(numero) {
    const limpio = String(numero || '').replace(/[^0-9]/g, '');
    if (limpio.length <= 4) return numero || '';
    const ultimos4 = limpio.slice(-4);
    const grupos = Math.max(0, Math.ceil(limpio.length / 4) - 1);
    return `${'•••• '.repeat(grupos).trim()} ${ultimos4}`.trim();
  }

  // ── Carga saldo + número de cuenta ───────────────────────────────────────
  async function cargarCuenta() {
    const saldoEl   = $('saldo-1');
    const cuentaEl  = $('n-cuenta');
    const miniEl    = $('N-tarjeta-mini');
    const fullEl    = $('N-tarjeta-full');

    try {
      const res = await fetch('/api/banco?action=cuenta');

      if (res.status === 401) {
        if (saldoEl) saldoEl.textContent = 'Inicia sesión';
        if (cuentaEl) cuentaEl.textContent = '—';
        if (miniEl) miniEl.textContent = 'Inicia sesión';
        return;
      }

      if (res.status === 404) {
        if (saldoEl) saldoEl.textContent = '$0';
        if (cuentaEl) cuentaEl.textContent = 'Sin cuenta';
        if (miniEl) miniEl.textContent = 'Debes abrir tu cuenta';
        if (fullEl) fullEl.textContent = 'Número de cuenta: aún no tienes cuenta bancaria';
        return;
      }

      if (!res.ok) throw new Error('No se pudo cargar la cuenta');

      const data = await res.json();
      cuentaActual = data.cuenta;

      if (saldoEl) saldoEl.textContent = formatCLP(cuentaActual.saldo);
      if (cuentaEl) cuentaEl.textContent = cuentaActual.numero_cuenta;
      if (miniEl) miniEl.textContent = maskNumeroCuenta(cuentaActual.numero_cuenta);
      if (fullEl) fullEl.textContent = 'Número de cuenta: ' + cuentaActual.numero_cuenta;

    } catch (err) {
      console.error('Error cargando la cuenta:', err);
      if (saldoEl) saldoEl.textContent = 'Error';
      if (cuentaEl) cuentaEl.textContent = 'Error';
    }
  }

  // ── Transferencias ───────────────────────────────────────────────────────
  window.abrirTransferencia = function () {
    const msgEl = $('transfer-msg');
    if (msgEl) {
      msgEl.textContent = '';
      msgEl.className = 'transfer-msg';
    }
    mostrarSeccion('transferir');
  };

  async function enviarTransferencia(ev) {
    ev.preventDefault();

    const rutInput   = $('transfer-rut');
    const montoInput = $('transfer-monto');
    const msgEl      = $('transfer-msg');
    const btn        = $('transfer-btn');

    const rut   = rutInput.value.trim();
    const monto = parseInt(montoInput.value, 10);

    msgEl.textContent = '';
    msgEl.className = 'transfer-msg';

    if (!rut) {
      msgEl.textContent = 'Ingresa el RUT del destinatario.';
      msgEl.classList.add('error');
      return;
    }
    if (!monto || monto <= 0) {
      msgEl.textContent = 'Ingresa un monto válido.';
      msgEl.classList.add('error');
      return;
    }

    btn.disabled = true;
    const textoOriginal = btn.textContent;
    btn.textContent = 'Enviando...';

    try {
      const res = await fetch('/api/banco?action=transferir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rut_destino: rut, monto: monto }),
      });
      const data = await res.json();

      if (!res.ok) {
        msgEl.textContent = data.error || 'No se pudo realizar la transferencia.';
        msgEl.classList.add('error');
        return;
      }

      msgEl.textContent = 'Transferencia exitosa. Nuevo saldo: ' + formatCLP(data.nuevoSaldo);
      msgEl.classList.add('exito');
      rutInput.value = '';
      montoInput.value = '';

      await cargarCuenta();
    } catch (err) {
      console.error('Error en la transferencia:', err);
      msgEl.textContent = 'Error de conexión. Intenta de nuevo.';
      msgEl.classList.add('error');
    } finally {
      btn.disabled = false;
      btn.textContent = textoOriginal;
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    cargarCuenta();
    const form = $('transfer-form');
    if (form) form.addEventListener('submit', enviarTransferencia);
    const formContacto = $('contacto-form');
    if (formContacto) formContacto.addEventListener('submit', agregarContacto);
  });

  // Escapa texto antes de meterlo en innerHTML (nombres, descripciones, etc.
  // pueden venir de otros usuarios, así que nunca se insertan crudos).
  function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  // ── Historial ─────────────────────────────────────────────────────────────
  window.abrirHistorial = function () {
    mostrarSeccion('historial');
    cargarHistorial();
  };

  async function cargarHistorial() {
    const lista = $('historial-lista');
    if (!lista) return;
    lista.innerHTML = '<p class="hist-vacio">Cargando movimientos...</p>';

    try {
      const res = await fetch('/api/banco?action=historial');

      if (res.status === 401) {
        lista.innerHTML = '<p class="hist-vacio">Inicia sesión para ver tu historial.</p>';
        return;
      }
      if (!res.ok) throw new Error('No se pudo cargar el historial');

      const data = await res.json();
      const transacciones = data.transacciones || [];

      if (transacciones.length === 0) {
        lista.innerHTML = '<p class="hist-vacio">Sin movimientos aún.</p>';
        return;
      }

      lista.innerHTML = transacciones.map(function (t) {
        const signo = t.tipo === 'egreso' ? '-' : '+';
        const fecha = new Date(t.created_at).toLocaleDateString('es-CL', {
          day: '2-digit', month: '2-digit', year: 'numeric',
        });
        return (
          '<div class="hist-item">' +
            '<div class="hist-item-info">' +
              '<span class="hist-item-desc">' + escHtml(t.descripcion || t.tipo) + '</span>' +
              '<span class="hist-item-fecha">' + fecha + '</span>' +
            '</div>' +
            '<div class="hist-item-monto ' + escHtml(t.tipo) + '">' + signo + formatCLP(t.monto) + '</div>' +
          '</div>'
        );
      }).join('');
    } catch (err) {
      console.error('Error cargando el historial:', err);
      lista.innerHTML = '<p class="hist-vacio">Error al cargar el historial.</p>';
    }
  }

  // ── Contactos ─────────────────────────────────────────────────────────────
  window.abrirContactos = function () {
    const msgEl = $('contacto-msg');
    if (msgEl) {
      msgEl.textContent = '';
      msgEl.className = 'transfer-msg';
    }
    mostrarSeccion('contactos');
    cargarContactos();
  };

  async function cargarContactos() {
    const lista = $('contactos-lista');
    if (!lista) return;
    lista.innerHTML = '<p class="hist-vacio">Cargando contactos...</p>';

    try {
      const res = await fetch('/api/banco?action=contactos');

      if (res.status === 401) {
        lista.innerHTML = '<p class="hist-vacio">Inicia sesión para ver tus contactos.</p>';
        return;
      }
      if (!res.ok) throw new Error('No se pudo cargar los contactos');

      const data = await res.json();
      const contactos = data.contactos || [];

      if (contactos.length === 0) {
        lista.innerHTML = '<p class="hist-vacio">Aún no tienes contactos guardados.</p>';
        return;
      }

      lista.innerHTML = contactos.map(function (c) {
        return (
          '<div class="contacto-item">' +
            '<div class="contacto-item-info">' +
              '<span class="contacto-item-nombre">' + escHtml(c.nombre) + '</span>' +
              '<span class="contacto-item-rut">' + escHtml(c.rut) + '</span>' +
            '</div>' +
            '<button type="button" class="contacto-item-borrar" onclick="borrarContacto(' + c.id + ')" title="Eliminar">&times;</button>' +
          '</div>'
        );
      }).join('');
    } catch (err) {
      console.error('Error cargando los contactos:', err);
      lista.innerHTML = '<p class="hist-vacio">Error al cargar los contactos.</p>';
    }
  }

  async function agregarContacto(ev) {
    ev.preventDefault();

    const nombreInput = $('contacto-nombre');
    const rutInput    = $('contacto-rut');
    const msgEl       = $('contacto-msg');
    const btn         = $('contacto-btn');

    const nombre = nombreInput.value.trim();
    const rut    = rutInput.value.trim();

    msgEl.textContent = '';
    msgEl.className = 'transfer-msg';

    if (!nombre) {
      msgEl.textContent = 'Ingresa el nombre del contacto.';
      msgEl.classList.add('error');
      return;
    }
    if (!rut) {
      msgEl.textContent = 'Ingresa el RUT del contacto.';
      msgEl.classList.add('error');
      return;
    }

    btn.disabled = true;
    const textoOriginal = btn.textContent;
    btn.textContent = 'Agregando...';

    try {
      const res = await fetch('/api/banco?action=contacto_agregar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre, rut: rut }),
      });
      const data = await res.json();

      if (!res.ok) {
        msgEl.textContent = data.error || 'No se pudo agregar el contacto.';
        msgEl.classList.add('error');
        return;
      }

      msgEl.textContent = 'Contacto agregado.';
      msgEl.classList.add('exito');
      nombreInput.value = '';
      rutInput.value = '';

      await cargarContactos();
    } catch (err) {
      console.error('Error agregando contacto:', err);
      msgEl.textContent = 'Error de conexión. Intenta de nuevo.';
      msgEl.classList.add('error');
    } finally {
      btn.disabled = false;
      btn.textContent = textoOriginal;
    }
  }

  window.borrarContacto = async function (id) {
    try {
      const res = await fetch('/api/banco?action=contacto_borrar&id=' + encodeURIComponent(id), {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('No se pudo eliminar el contacto');
      await cargarContactos();
    } catch (err) {
      console.error('Error eliminando contacto:', err);
    }
  };
})();
