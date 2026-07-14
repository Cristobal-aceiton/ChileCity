// ── Juego de Ruleta ──────────────────────────────────────────────────────
// Ruleta americana (38 casilleros: 0, 00, 1-36). El resultado SIEMPRE lo
// calcula el servidor (/api/banco?action=ruleta_jugar) — este archivo solo
// dibuja la rueda, arma la apuesta que el usuario elige y anima el giro
// hasta el número que el servidor ya decidió.

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

  // ── Estado de la apuesta actual ─────────────────────────────────────────
  let tipoActual = "color";
  let valorActual = null;
  let girando = false;
  let rotacionActual = 0; // grados acumulados del canvas (para no "rebobinar")

  // ── Elementos ────────────────────────────────────────────────────────────
  const elSaldo       = document.getElementById('saldo');
  const elCanvas       = document.getElementById('rul-canvas');
  const elChip         = document.getElementById('rul-resultado-chip');
  const elMensaje       = document.getElementById('rul-mensaje');
  const elTabs         = document.getElementById('rul-tabs');
  const elOpciones     = document.getElementById('rul-opciones');
  const elMonto         = document.getElementById('rul-monto');
  const elGirar         = document.getElementById('rul-girar');
  const elHistorialLista = document.getElementById('rul-historial-lista');

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
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // ── Animar el giro hasta que el número ganador quede bajo el puntero ────
  function girarHasta(numeroGanador) {
    const n = ORDEN_RUEDA.length;
    const idx = ORDEN_RUEDA.indexOf(numeroGanador);
    const anguloSector = 360 / n;
    // Ángulo (en grados) al que hay que rotar para que el sector "idx"
    // quede arriba, bajo el puntero. Sumamos varias vueltas completas para
    // que el giro se vea bien.
    const anguloObjetivo = -(idx * anguloSector);
    const vueltas = 6 * 360;
    // Siempre giramos "hacia adelante" respecto a la rotación acumulada
    const base = Math.floor(rotacionActual / 360) * 360;
    let destino = base + vueltas + anguloObjetivo;
    if (destino <= rotacionActual) destino += 360;

    rotacionActual = destino;
    elCanvas.style.transform = `rotate(${rotacionActual}deg)`;
  }

  // ── UI: tabs de tipo de apuesta ──────────────────────────────────────────
  const OPCIONES_POR_TIPO = {
    color: [
      { valor: 'rojo', label: 'Rojo', clase: 'rojo' },
      { valor: 'negro', label: 'Negro', clase: 'negro' },
    ],
    paridad: [
      { valor: 'par', label: 'Par' },
      { valor: 'impar', label: 'Impar' },
    ],
    mitad: [
      { valor: '1-18', label: '1 a 18' },
      { valor: '19-36', label: '19 a 36' },
    ],
    docena: [
      { valor: '1', label: '1ª docena (1-12)' },
      { valor: '2', label: '2ª docena (13-24)' },
      { valor: '3', label: '3ª docena (25-36)' },
    ],
    numero: (() => {
      const arr = [{ valor: '0', label: '0', clase: 'verde' }, { valor: '00', label: '00', clase: 'verde' }];
      for (let i = 1; i <= 36; i++) arr.push({ valor: String(i), label: String(i), clase: colorDe(String(i)) });
      return arr;
    })(),
  };

  function renderOpciones() {
    elOpciones.innerHTML = '';
    valorActual = null;
    actualizarBotonGirar();

    OPCIONES_POR_TIPO[tipoActual].forEach(op => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rul-opcion' + (op.clase ? ' ' + op.clase : '');
      btn.textContent = op.label;
      btn.dataset.valor = op.valor;
      btn.addEventListener('click', () => {
        valorActual = op.valor;
        [...elOpciones.children].forEach(c => c.classList.remove('seleccionada'));
        btn.classList.add('seleccionada');
        actualizarBotonGirar();
      });
      elOpciones.appendChild(btn);
    });
  }

  elTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.rul-tab');
    if (!btn || girando) return;
    tipoActual = btn.dataset.tipo;
    [...elTabs.children].forEach(c => c.classList.remove('activo'));
    btn.classList.add('activo');
    renderOpciones();
  });

  function actualizarBotonGirar() {
    elGirar.disabled = girando || !valorActual || !elMonto.value || Number(elMonto.value) <= 0;
  }
  elMonto.addEventListener('input', actualizarBotonGirar);

  // ── Saldo ─────────────────────────────────────────────────────────────
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
    elMensaje.style.color = esError ? '#fca5a5' : '#4ade80';
  }

  async function girar() {
    if (girando || !valorActual) return;
    const monto = Number(elMonto.value);
    if (!monto || monto <= 0) return;

    girando = true;
    elGirar.disabled = true;
    elTabs.querySelectorAll('.rul-tab').forEach(b => b.disabled = true);
    mostrarMensaje('');
    elChip.style.display = 'none';

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
        elTabs.querySelectorAll('.rul-tab').forEach(b => b.disabled = false);
        actualizarBotonGirar();
        return;
      }

      girarHasta(data.numeroGanador);

      // Esperamos a que termine la animación (coincide con la transición CSS)
      setTimeout(() => {
        const color = data.color;
        elChip.textContent = data.numeroGanador + ' · ' + color;
        elChip.style.background = color === 'rojo' ? '#b91c1c' : color === 'negro' ? '#111827' : '#15803d';
        elChip.style.display = 'block';

        if (data.gano) {
          mostrarMensaje(`¡Ganaste ${formatCLP(data.pago)}! 🎉`, false);
        } else {
          mostrarMensaje('Perdiste esta ronda. ¡Suerte la próxima!');
        }

        elSaldo.textContent = formatCLP(data.nuevoSaldo);
        cargarHistorial();

        girando = false;
        elTabs.querySelectorAll('.rul-tab').forEach(b => b.disabled = false);
        actualizarBotonGirar();
      }, 4600);
    } catch (e) {
      mostrarMensaje('Error de conexión. Intenta de nuevo.');
      girando = false;
      elTabs.querySelectorAll('.rul-tab').forEach(b => b.disabled = false);
      actualizarBotonGirar();
    }
  }

  elGirar.addEventListener('click', girar);

  // ── Init ─────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    dibujarRueda();
    renderOpciones();
    cargarSaldo();
    cargarHistorial();
  });
})();
