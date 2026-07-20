// ── Juego de Ruleta ──────────────────────────────────────────────────────
// Ruleta americana (38 casilleros: 0, 00, 1-36). El resultado SIEMPRE lo
// calcula el servidor (/api/banco?action=ruleta_jugar) — este archivo solo
// dibuja la rueda, arma la apuesta que el usuario elige (solo color: rojo,
// negro o verde) y anima el giro hasta el número que el servidor decidió.

(function () {
  // Orden real de los casilleros en una ruleta americana, en sentido horario
  // partiendo desde arriba (donde apunta el puntero).
  const ORDEN_RUEDA = [
    "0","28","9","26","30","11","7","20","32","17","5","22","34","15","3","24","36","13","1",
    "00","27","10","25","29","12","8","19","31","18","6","21","33","16","4","23","35","14"
  ];
  const ROJOS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

  function colorDe(numero) {
    if (numero === "0" || numero === "00") return "verde";
    return ROJOS.has(Number(numero)) ? "rojo" : "negro";
  }

  function formatCLP(n) {
    return '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');
  }

  function sfx(nombre) {
    if (window.ccSfx && typeof window.ccSfx[nombre] === 'function') window.ccSfx[nombre]();
  }

  // ── Íconos SVG (sin emojis) para cada color de apuesta ──────────────────
  const ICONOS = {
    rojo: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="9"/></svg>',
    negro: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="9"/></svg>',
    verde: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="9"/></svg>',
  };

  // ── Estado de la apuesta actual (siempre tipo "color") ──────────────────
  const tipoActual = "color";
  let valorActual = null;
  let girando = false;
  let rotacionActual = 0; // grados acumulados del canvas (para no "rebobinar")
  let tickInterval = null;

  // ── Elementos ────────────────────────────────────────────────────────────
  const elSaldo         = document.getElementById('saldo');
  const elCanvas         = document.getElementById('rul-canvas');
  const elChip           = document.getElementById('rul-resultado-chip');
  const elMensaje        = document.getElementById('rul-mensaje');
  const elOpciones       = document.getElementById('rul-opciones');
  const elMonto          = document.getElementById('rul-monto');
  const elGirar           = document.getElementById('rul-girar');
  const elGirarLabel      = elGirar ? elGirar.childNodes[elGirar.childNodes.length - 1] : null;
  const elHistorialLista  = document.getElementById('rul-historial-lista');

  // ── Dibujo de la rueda (una sola vez, después solo se rota con CSS) ─────
  function dibujarRueda() {
    const ctx = elCanvas.getContext('2d');
    const w = elCanvas.width, h = elCanvas.height;
    const cx = w / 2, cy = h / 2, radio = w / 2 - 4;
    const n = ORDEN_RUEDA.length;
    const anguloSector = (Math.PI * 2) / n;

    ctx.clearRect(0, 0, w, h);

    ORDEN_RUEDA.forEach((numero, i) => {
      const inicio = i * anguloSector - Math.PI / 2 - anguloSector / 2;
      const fin = inicio + anguloSector;

      const color = colorDe(numero);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radio, inicio, fin);
      ctx.closePath();
      ctx.fillStyle = color === 'rojo' ? '#c0182c' : color === 'negro' ? '#181818' : '#0f8a3c';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,215,0,.35)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Número
      const angMedio = (inicio + fin) / 2;
      ctx.save();
      ctx.translate(cx + Math.cos(angMedio) * (radio * 0.82), cy + Math.sin(angMedio) * (radio * 0.82));
      ctx.rotate(angMedio + Math.PI / 2);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(numero, 0, 0);
      ctx.restore();
    });

    // Centro decorativo
    ctx.beginPath();
    ctx.arc(cx, cy, radio * 0.14, 0, Math.PI * 2);
    ctx.fillStyle = '#1f2937';
    ctx.fill();
    ctx.strokeStyle = '#e02020';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // ── Animar el giro hasta que el número ganador quede bajo el puntero ────
  function girarHasta(numeroGanador) {
    const n = ORDEN_RUEDA.length;
    const idx = ORDEN_RUEDA.indexOf(numeroGanador);
    const anguloSector = 360 / n;
    const anguloObjetivo = -(idx * anguloSector);
    const vueltas = 6 * 360;
    const base = Math.floor(rotacionActual / 360) * 360;
    let destino = base + vueltas + anguloObjetivo;
    if (destino <= rotacionActual) destino += 360;

    rotacionActual = destino;
    elCanvas.classList.add('rul-girando');
    elCanvas.style.transform = `rotate(${rotacionActual}deg)`;

    // Pequeños "tics" sonoros mientras gira, cada vez más espaciados.
    let intervalo = 60;
    let acumulado = 0;
    clearInterval(tickInterval);
    function tick() {
      sfx('girarTick');
      acumulado += intervalo;
      intervalo *= 1.12;
      if (acumulado < 4300) {
        tickInterval = setTimeout(tick, intervalo);
      }
    }
    tick();
  }

  // ── Opciones de apuesta: solo color (rojo / negro / verde) ──────────────
  const OPCIONES_COLOR = [
    { valor: 'rojo', label: 'Rojo', clase: 'rojo', mult: 'x2' },
    { valor: 'negro', label: 'Negro', clase: 'negro', mult: 'x2' },
    { valor: 'verde', label: 'Verde', clase: 'verde', mult: 'x14' },
  ];

  function renderOpciones() {
    elOpciones.innerHTML = '';
    OPCIONES_COLOR.forEach(op => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rul-opcion' + (op.clase ? ' ' + op.clase : '');
      btn.dataset.valor = op.valor;
      btn.innerHTML = (ICONOS[op.valor] || '') +
        `<span>${op.label}</span><span class="rul-opcion-mult">${op.mult}</span>`;
      btn.addEventListener('click', () => {
        if (girando) return;
        valorActual = op.valor;
        [...elOpciones.children].forEach(c => c.classList.remove('seleccionada'));
        btn.classList.add('seleccionada');
        sfx('seleccion');
        actualizarBotonGirar();
      });
      elOpciones.appendChild(btn);
    });
  }

  function actualizarBotonGirar() {
    elGirar.disabled = girando || !valorActual || !elMonto.value || Number(elMonto.value) <= 0;
  }
  elMonto.addEventListener('input', actualizarBotonGirar);

  // ── Saldo ─────────────────────────────────────────────────────────────
  async function cargarSaldo(animar) {
    try {
      const r = await fetch('/api/banco?action=cuenta', { credentials: 'same-origin' });
      if (r.status === 401) { window.location.href = '/'; return; }
      if (!r.ok) throw new Error();
      const data = await r.json();
      elSaldo.textContent = formatCLP(data.saldo);
      if (animar) {
        elSaldo.classList.remove('rul-saldo-anim');
        void elSaldo.offsetWidth;
        elSaldo.classList.add('rul-saldo-anim');
      }
    } catch {
      elSaldo.textContent = '—';
    }
  }

  // ── Historial ─────────────────────────────────────────────────────────
  async function cargarHistorial() {
    try {
      const r = await fetch('/api/banco?action=ruleta_historial', { credentials: 'same-origin' });
      if (!r.ok) return;
      const data = await r.json();
      elHistorialLista.innerHTML = '';
      (data.historial || []).forEach(h => {
        const li = document.createElement('li');
        const monto = Number(h.monto);
        const span = document.createElement('span');
        span.textContent = h.descripcion;
        const spanMonto = document.createElement('span');
        spanMonto.textContent = (monto >= 0 ? '+' : '') + formatCLP(monto);
        spanMonto.style.color = monto >= 0 ? '#4ade80' : '#f87171';
        spanMonto.style.fontWeight = '700';
        li.appendChild(span);
        li.appendChild(spanMonto);
        elHistorialLista.appendChild(li);
      });
    } catch {}
  }

  // ── Girar ─────────────────────────────────────────────────────────────
  function mostrarMensaje(msg, esError = true) {
    elMensaje.textContent = msg || '';
    elMensaje.classList.toggle('rul-gano', !esError && !!msg);
  }

  function setGirarUI(activo) {
    if (!elGirar) return;
    const svg = elGirar.querySelector('svg');
    if (svg) svg.classList.toggle('rul-spin', activo);
  }

  async function girar() {
    if (girando || !valorActual) return;
    const monto = Number(elMonto.value);
    if (!monto || monto <= 0) return;

    girando = true;
    elGirar.disabled = true;
    setGirarUI(true);
    mostrarMensaje('');
    elChip.style.display = 'none';
    elChip.classList.remove('rul-chip-anim');

    try {
      const r = await fetch('/api/banco?action=ruleta_jugar', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: tipoActual, valor: valorActual, monto }),
      });
      const data = await r.json();
      if (!r.ok) {
        mostrarMensaje(data.error || 'Ocurrió un error. Intenta de nuevo.');
        girando = false;
        setGirarUI(false);
        actualizarBotonGirar();
        return;
      }

      girarHasta(data.numeroGanador);

      // Esperamos a que termine la animación (coincide con la transición CSS)
      setTimeout(() => {
        elCanvas.classList.remove('rul-girando');
        clearInterval(tickInterval);

        const color = data.color;
        elChip.textContent = data.numeroGanador + ' · ' + color;
        elChip.style.background = color === 'rojo' ? '#b91c1c' : color === 'negro' ? '#111827' : '#15803d';
        elChip.style.display = 'block';
        elChip.classList.add('rul-chip-anim');

        if (data.gano) {
          mostrarMensaje(`¡Ganaste ${formatCLP(data.pago)}!`, false);
          sfx('gano');
        } else {
          mostrarMensaje('Perdiste esta ronda. ¡Suerte la próxima!');
          sfx('perdio');
        }

        elSaldo.textContent = formatCLP(data.nuevoSaldo);
        cargarHistorial();

        girando = false;
        setGirarUI(false);
        actualizarBotonGirar();
      }, 4600);
    } catch (e) {
      mostrarMensaje('Error de conexión. Intenta de nuevo.');
      girando = false;
      setGirarUI(false);
      actualizarBotonGirar();
    }
  }

  elGirar.addEventListener('click', girar);

  // ── Init ─────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    dibujarRueda();
    renderOpciones();
    cargarSaldo(false);
    cargarHistorial();
  });
})();
