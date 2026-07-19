// ── Juego de Minas ────────────────────────────────────────────────────────
// Tablero 5x5 (25 casillas). El servidor decide dónde están las minas y
// nunca las revela hasta que el jugador pisa una o termina la partida
// (/api/casino: mines_start, mines_reveal, mines_cashout, mines_estado).

(function () {
  const TOTAL_CASILLAS = 25;

  function formatCLP(n) {
    return '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');
  }

  const elSaldo = document.getElementById('saldo');
  const elMensaje = document.getElementById('mi-mensaje');
  const elConfig = document.getElementById('mi-config');
  const elMonto = document.getElementById('mi-monto');
  const elMinas = document.getElementById('mi-minas');
  const elIniciar = document.getElementById('mi-iniciar');
  const elInfo = document.getElementById('mi-info');
  const elMult = document.getElementById('mi-mult');
  const elPremio = document.getElementById('mi-premio');
  const elTablero = document.getElementById('mi-tablero');
  const elRetirar = document.getElementById('mi-retirar');
  const elHistorialLista = document.getElementById('mi-historial-lista');

  let partidaActiva = false;
  let montoActual = 0;
  let reveladas = [];
  let procesando = false;

  function mostrarMensaje(msg, esError = true) {
    elMensaje.textContent = msg || '';
    elMensaje.style.color = esError ? '#fca5a5' : '#4ade80';
  }

  function poblarSelectMinas() {
    elMinas.innerHTML = '';
    for (let i = 1; i <= 24; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `${i} mina${i > 1 ? 's' : ''}`;
      if (i === 3) opt.selected = true;
      elMinas.appendChild(opt);
    }
  }

  function crearTablero() {
    elTablero.innerHTML = '';
    for (let i = 0; i < TOTAL_CASILLAS; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mi-casilla';
      btn.dataset.idx = i;
      btn.addEventListener('click', () => revelar(i));
      elTablero.appendChild(btn);
    }
  }

  function pintarReveladas() {
    [...elTablero.children].forEach((btn, i) => {
      if (reveladas.includes(i)) {
        btn.classList.add('mi-revelada');
        btn.textContent = '💎';
      }
    });
  }

  function pintarMinas(posiciones) {
    [...elTablero.children].forEach((btn, i) => {
      if (posiciones.includes(i) && !reveladas.includes(i)) {
        btn.classList.add('mi-mina');
        btn.textContent = '💣';
      }
      btn.disabled = true;
    });
  }

  function actualizarInfo(multiplicador) {
    elMult.textContent = 'x' + Number(multiplicador).toFixed(2);
    elPremio.textContent = formatCLP(Math.floor(montoActual * multiplicador));
  }

  function mostrarEstadoJuego(activa) {
    partidaActiva = activa;
    elConfig.classList.toggle('mi-oculto', activa);
    elInfo.classList.toggle('mi-oculto', !activa);
    elTablero.classList.toggle('mi-oculto', !activa);
    elRetirar.classList.toggle('mi-oculto', !activa);
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
        .filter(a => a.juego === 'mines')
        .slice(0, 15)
        .forEach(a => {
          const gananciaMonto = a.gano ? (a.premio - a.monto) : -a.monto;
          const li = document.createElement('li');
          const span = document.createElement('span');
          span.textContent = `${a.eleccion} — ${a.resultado}`;
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

  async function retomarPartida() {
    try {
      const r = await fetch('/api/casino?action=mines_estado', { credentials: 'same-origin' });
      if (!r.ok) return;
      const data = await r.json();
      if (!data.activa) return;

      montoActual = data.monto;
      reveladas = data.reveladas || [];
      crearTablero();
      pintarReveladas();
      actualizarInfo(data.multiplicador);
      mostrarEstadoJuego(true);
      mostrarMensaje('Retomaste tu partida en curso.', false);
    } catch {}
  }

  elIniciar.addEventListener('click', async () => {
    if (procesando) return;
    const monto = Number(elMonto.value);
    const minas = Number(elMinas.value);
    if (!monto || monto <= 0) { mostrarMensaje('Ingresa un monto válido.'); return; }

    procesando = true;
    elIniciar.disabled = true;
    mostrarMensaje('');

    try {
      const r = await fetch('/api/casino?action=mines_start', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monto, minas }),
      });
      const data = await r.json();
      if (!r.ok) {
        mostrarMensaje(data.error || 'Ocurrió un error. Intenta de nuevo.');
        procesando = false;
        elIniciar.disabled = false;
        return;
      }

      montoActual = monto;
      reveladas = [];
      crearTablero();
      actualizarInfo(1);
      mostrarEstadoJuego(true);
      elSaldo.textContent = formatCLP(data.nuevoSaldo);
      procesando = false;
      elIniciar.disabled = false;
    } catch (e) {
      mostrarMensaje('Error de conexión. Intenta de nuevo.');
      procesando = false;
      elIniciar.disabled = false;
    }
  });

  async function revelar(idx) {
    if (procesando || !partidaActiva || reveladas.includes(idx)) return;
    procesando = true;
    elRetirar.disabled = true;

    try {
      const r = await fetch('/api/casino?action=mines_reveal', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ casilla: idx }),
      });
      const data = await r.json();
      if (!r.ok) {
        mostrarMensaje(data.error || 'Ocurrió un error.');
        procesando = false;
        elRetirar.disabled = false;
        return;
      }

      if (data.esMina) {
        reveladas.push(idx);
        pintarMinas(data.posiciones);
        mostrarMensaje('💥 ¡Pisaste una mina! Perdiste la apuesta.');
        cargarSaldo();
        cargarHistorial();
        setTimeout(() => mostrarEstadoJuego(false), 1400);
        procesando = false;
        return;
      }

      reveladas = data.reveladas;
      pintarReveladas();
      actualizarInfo(data.multiplicador);

      if (data.tableroCompleto) {
        mostrarMensaje(`¡Tablero completo! Ganaste ${formatCLP(data.premio)} 🎉`, false);
        elSaldo.textContent = formatCLP(data.nuevoSaldo);
        cargarHistorial();
        setTimeout(() => mostrarEstadoJuego(false), 1400);
      } else {
        mostrarMensaje('');
      }

      procesando = false;
      elRetirar.disabled = false;
    } catch (e) {
      mostrarMensaje('Error de conexión. Intenta de nuevo.');
      procesando = false;
      elRetirar.disabled = false;
    }
  }

  elRetirar.addEventListener('click', async () => {
    if (procesando || !partidaActiva || reveladas.length === 0) {
      if (reveladas.length === 0) mostrarMensaje('Revela al menos una casilla antes de retirar.');
      return;
    }
    procesando = true;
    elRetirar.disabled = true;

    try {
      const r = await fetch('/api/casino?action=mines_cashout', {
        method: 'POST',
        credentials: 'same-origin',
      });
      const data = await r.json();
      if (!r.ok) {
        mostrarMensaje(data.error || 'Ocurrió un error.');
        procesando = false;
        elRetirar.disabled = false;
        return;
      }

      mostrarMensaje(`Retiraste con x${data.multiplicador.toFixed(2)}: ganaste ${formatCLP(data.premio)} 🎉`, false);
      elSaldo.textContent = formatCLP(data.nuevoSaldo);
      cargarHistorial();
      mostrarEstadoJuego(false);
      procesando = false;
    } catch (e) {
      mostrarMensaje('Error de conexión. Intenta de nuevo.');
      procesando = false;
      elRetirar.disabled = false;
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    poblarSelectMinas();
    cargarSaldo();
    cargarHistorial();
    retomarPartida();
  });
})();
