// ── Juego de Cara o Cruz ──────────────────────────────────────────────────
// El resultado SIEMPRE lo calcula el servidor (/api/casino?action=jugar,
// juego=moneda). Este archivo solo anima la moneda y refleja lo que el
// servidor ya decidió.

(function () {
  function formatCLP(n) {
    return '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');
  }

  let valorActual = null;
  let lanzando = false;

  const elSaldo = document.getElementById('saldo');
  const elMoneda = document.getElementById('mn-moneda');
  const elMensaje = document.getElementById('mn-mensaje');
  const elOpciones = document.getElementById('mn-opciones');
  const elMonto = document.getElementById('mn-monto');
  const elLanzar = document.getElementById('mn-lanzar');
  const elHistorialLista = document.getElementById('mn-historial-lista');

  function actualizarBotonLanzar() {
    elLanzar.disabled = lanzando || !valorActual || !elMonto.value || Number(elMonto.value) <= 0;
  }
  elMonto.addEventListener('input', actualizarBotonLanzar);

  elOpciones.addEventListener('click', (e) => {
    const btn = e.target.closest('.mn-opcion');
    if (!btn || lanzando) return;
    valorActual = btn.dataset.valor;
    [...elOpciones.children].forEach(c => c.classList.remove('seleccionada'));
    btn.classList.add('seleccionada');
    actualizarBotonLanzar();
  });

  function mostrarMensaje(msg, esError = true) {
    elMensaje.textContent = msg || '';
    elMensaje.style.color = esError ? '#fca5a5' : '#4ade80';
  }

  async function cargarSaldo() {
    try {
      const r = await fetch('/api/banco?action=cuenta', { credentials: 'same-origin' });
      if (r.status === 401) { window.location.href = '/'; return; }
      if (!r.ok) throw new Error();
      const data = await r.json();
      elSaldo.textContent = formatCLP(data.saldo);
    } catch {
      elSaldo.textContent = '—';
    }
  }

  async function cargarHistorial() {
    try {
      const r = await fetch('/api/casino?action=historial', { credentials: 'same-origin' });
      if (!r.ok) return;
      const data = await r.json();
      elHistorialLista.innerHTML = '';
      (data.apuestas || [])
        .filter(a => a.juego === 'moneda')
        .slice(0, 15)
        .forEach(a => {
          const li = document.createElement('li');
          const gananciaMonto = a.gano ? (a.premio - a.monto) : -a.monto;
          const span = document.createElement('span');
          span.textContent = `Salió ${a.resultado} — apostaste a ${a.eleccion}`;
          const spanMonto = document.createElement('span');
          spanMonto.textContent = (gananciaMonto >= 0 ? '+' : '') + formatCLP(gananciaMonto);
          spanMonto.style.color = gananciaMonto >= 0 ? '#4ade80' : '#f87171';
          spanMonto.style.fontWeight = '700';
          li.appendChild(span);
          li.appendChild(spanMonto);
          elHistorialLista.appendChild(li);
        });
    } catch {}
  }

  async function lanzar() {
    if (lanzando || !valorActual) return;
    const monto = Number(elMonto.value);
    if (!monto || monto <= 0) return;

    lanzando = true;
    elLanzar.disabled = true;
    elOpciones.querySelectorAll('.mn-opcion').forEach(b => b.disabled = true);
    mostrarMensaje('');

    try {
      const r = await fetch('/api/casino?action=jugar', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ juego: 'moneda', monto, eleccion: valorActual }),
      });
      const data = await r.json();
      if (!r.ok) {
        mostrarMensaje(data.error || 'Ocurrió un error. Intenta de nuevo.');
        lanzando = false;
        elOpciones.querySelectorAll('.mn-opcion').forEach(b => b.disabled = false);
        actualizarBotonLanzar();
        return;
      }

      elMoneda.classList.remove('girando');
      // Forzar reflow para poder re-disparar la animación
      void elMoneda.offsetWidth;
      // Si salió cruz, terminamos en 180deg extra para que quede la cara correcta arriba
      elMoneda.style.setProperty('--mn-extra', data.resultado === 'cruz' ? '180deg' : '0deg');
      elMoneda.classList.add('girando');
      if (data.resultado === 'cruz') {
        elMoneda.style.animationName = 'mnFlipCruz';
      } else {
        elMoneda.style.animationName = 'mnFlip';
      }

      setTimeout(() => {
        if (data.gano) {
          mostrarMensaje(`¡Salió ${data.resultado}! Ganaste ${formatCLP(data.premio)} 🎉`, false);
        } else {
          mostrarMensaje(`Salió ${data.resultado}. Perdiste esta ronda.`);
        }

        elSaldo.textContent = formatCLP(data.nuevoSaldo);
        cargarHistorial();

        lanzando = false;
        elOpciones.querySelectorAll('.mn-opcion').forEach(b => b.disabled = false);
        actualizarBotonLanzar();
      }, 1650);
    } catch (e) {
      mostrarMensaje('Error de conexión. Intenta de nuevo.');
      lanzando = false;
      elOpciones.querySelectorAll('.mn-opcion').forEach(b => b.disabled = false);
      actualizarBotonLanzar();
    }
  }

  elLanzar.addEventListener('click', lanzar);

  document.addEventListener('DOMContentLoaded', () => {
    cargarSaldo();
    cargarHistorial();
  });

  // Variante de la animación que termina mostrando "cruz" hacia el frente
  const style = document.createElement('style');
  style.textContent = `
    @keyframes mnFlipCruz {
      0%   { transform: rotateY(0) rotateX(0); }
      20%  { transform: rotateY(360deg) rotateX(8deg); }
      50%  { transform: rotateY(1080deg) rotateX(-6deg); }
      80%  { transform: rotateY(1800deg) rotateX(4deg); }
      100% { transform: rotateY(1980deg) rotateX(0); }
    }
  `;
  document.head.appendChild(style);
})();
