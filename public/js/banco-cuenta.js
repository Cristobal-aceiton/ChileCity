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
  });
})();
