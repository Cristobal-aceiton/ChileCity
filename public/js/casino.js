    // ══════════════════════════════════════════════════════════════════════
    //  CASINO
    // ══════════════════════════════════════════════════════════════════════
    let casinoSaldo = 0;
    let casinoEleccionRuleta = null;
    let casinoEleccionMoneda = null;
    let ruletaGirando = false;
    let monedaGirando = false;
    let ruletaAngle = 0; // current rotation of canvas

    // Tiene que ser el mismo valor que CASINO_MAX_APUESTA en lib/constants.js.
    // Se valida acá también para avisar al toque (sin esperar la respuesta
    // del servidor) y dejar clarísimo por qué no te deja apostar — antes no
    // pasaba nada visible y parecía que la página se había trabado.
    const MONTO_MAXIMO_CASINO = 850000000;

    // ── Casino Lobby ──────────────────────────────────────────────────────
    function casinoAbrirJuego(tab) {
      document.getElementById('casino-lobby-section').style.display = 'none';
      document.getElementById('casino-tabs-bar').style.display = 'flex';
      // Ranking y historial siempre visibles debajo
      casinoTab(tab);
    }
    function casinoVolverLobby() {
      document.getElementById('casino-lobby-section').style.display = 'block';
      document.getElementById('casino-tabs-bar').style.display = 'none';
      document.querySelectorAll('.casino-juego').forEach(p => p.classList.remove('visible'));
    }

    // ── Formateo ─────────────────────────────────────────────────────────
    function casinoFecha(iso) {
      if (!iso) return '';
      return new Date(iso).toLocaleDateString('es-CL', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
    }

    // ── Inicializar casino ────────────────────────────────────────────────
    async function cargarCasino() {
      if (!currentUser?.id) return;
      const casinoScreenEl = document.getElementById('casino-screen');
      if (casinoScreenEl) casinoScreenEl.scrollTop = 0;
      try {
        // Obtener saldo del banco
        const res = await fetch(`/api/banco?action=cuenta&discord_id=${currentUser.id}`);
        const data = await res.json();
        if (data.existe) {
          casinoSaldo = data.cuenta.saldo;
          ccAnimateNumber(document.getElementById('casino-saldo-val'), casinoSaldo, formatCLP);
        }
      } catch {}
      dibujarRuleta(0);
      await cargarRanking();
      await cargarHistorialCasino();
      if (typeof iniciarLiveFeedPolling === 'function') iniciarLiveFeedPolling();
      if (typeof pfCargarEstado === 'function') { pfCargarEstado(); pfCargarRevelados(); }
    }

    // ── Tabs ─────────────────────────────────────────────────────────────
    function casinoTab(tab) {
      document.querySelectorAll('.casino-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.casino-juego').forEach(p => p.classList.remove('visible'));
      document.getElementById('ctab-' + tab).classList.add('active');
      document.getElementById('casino-panel-' + tab).classList.add('visible');
      const casinoScreenEl = document.getElementById('casino-screen');
      if (casinoScreenEl) casinoScreenEl.scrollTop = 0;
    }

    // ── Elección ─────────────────────────────────────────────────────────
    function casinoElegir(juego, eleccion) {
      if (juego === 'ruleta') {
        casinoEleccionRuleta = eleccion;
        document.querySelectorAll('[id^="cop-rojo"],[id^="cop-negro"],[id^="cop-verde"]').forEach(b => {
          b.className = 'casino-opcion';
        });
        const btn = document.getElementById('cop-' + eleccion);
        if (btn) btn.classList.add('sel-' + eleccion);
        actualizarBtnRuleta();
      } else {
        casinoEleccionMoneda = eleccion;
        document.getElementById('cop-cara').className = 'casino-opcion';
        document.getElementById('cop-cruz').className = 'casino-opcion';
        document.getElementById('cop-' + eleccion).classList.add('sel-' + eleccion);
        actualizarBtnMoneda();
      }
    }

    function casinoActualizarGanancia(juego) {
      if (juego === 'ruleta') {
        const m = parseInt(document.getElementById('ruleta-monto').value) || 0;
        const el = document.getElementById('ruleta-ganancia-info');
        if (m > MONTO_MAXIMO_CASINO) {
          el.innerHTML = `<span style="color:#f87171;">La apuesta máxima es ${formatCLP(MONTO_MAXIMO_CASINO)}.</span>`;
        } else if (m > 0) {
          el.innerHTML = `Rojo/Negro: ganas <b style="color:#F59E0B">${formatCLP(m*2)}</b> &nbsp;|&nbsp; Verde: ganas <b style="color:#4ade80">${formatCLP(m*14)}</b>`;
        } else el.textContent = '';
        actualizarBtnRuleta();
      } else {
        const m = parseInt(document.getElementById('moneda-monto').value) || 0;
        const el = document.getElementById('moneda-ganancia-info');
        if (m > MONTO_MAXIMO_CASINO) {
          el.innerHTML = `<span style="color:#f87171;">La apuesta máxima es ${formatCLP(MONTO_MAXIMO_CASINO)}.</span>`;
        } else if (m > 0) el.innerHTML = `Si aciertas ganas <b style="color:#F59E0B">${formatCLP(m*2)}</b>`;
        else el.textContent = '';
        actualizarBtnMoneda();
      }
    }

    function actualizarBtnRuleta() {
      const m = parseInt(document.getElementById('ruleta-monto').value) || 0;
      document.getElementById('btn-ruleta').disabled = !(m > 0 && m <= MONTO_MAXIMO_CASINO && casinoEleccionRuleta && !ruletaGirando);
    }
    function actualizarBtnMoneda() {
      const m = parseInt(document.getElementById('moneda-monto').value) || 0;
      document.getElementById('btn-moneda').disabled = !(m > 0 && m <= MONTO_MAXIMO_CASINO && casinoEleccionMoneda && !monedaGirando);
    }

    // ── RULETA: dibujo canvas ────────────────────────────────────────────
    const RULETA_SECTORES = [
      // 38 sectores: 18 rojo, 18 negro, 2 verde (como ruleta americana)
      {c:'negro',label:'2'},{c:'rojo',label:'28'},{c:'negro',label:'9'},{c:'rojo',label:'26'},
      {c:'negro',label:'30'},{c:'rojo',label:'11'},{c:'negro',label:'7'},{c:'rojo',label:'20'},
      {c:'negro',label:'32'},{c:'rojo',label:'17'},{c:'negro',label:'5'},{c:'rojo',label:'22'},
      {c:'negro',label:'34'},{c:'rojo',label:'15'},{c:'negro',label:'3'},{c:'rojo',label:'24'},
      {c:'negro',label:'36'},{c:'rojo',label:'13'},{c:'verde',label:'0'},{c:'negro',label:'27'},
      {c:'rojo',label:'10'},{c:'negro',label:'25'},{c:'rojo',label:'29'},{c:'negro',label:'12'},
      {c:'rojo',label:'8'},{c:'negro',label:'19'},{c:'rojo',label:'31'},{c:'negro',label:'18'},
      {c:'rojo',label:'6'},{c:'negro',label:'21'},{c:'rojo',label:'33'},{c:'negro',label:'16'},
      {c:'rojo',label:'4'},{c:'negro',label:'23'},{c:'rojo',label:'35'},{c:'negro',label:'14'},
      {c:'rojo',label:'1'},{c:'verde',label:'00'}
    ];
    const N = RULETA_SECTORES.length;
    const SECTOR_ANGLE = (2 * Math.PI) / N;

    function dibujarRuleta(rotacion) {
      const canvas = document.getElementById('ruleta-canvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const W = canvas.width, H = canvas.height;
      const cx = W/2, cy = H/2, r = W/2 - 4;
      ctx.clearRect(0,0,W,H);

      // Fondo exterior
      ctx.beginPath(); ctx.arc(cx,cy,r+4,0,Math.PI*2);
      const outerGrad = ctx.createRadialGradient(cx,cy,r-10,cx,cy,r+4);
      outerGrad.addColorStop(0,'#2a2a2a'); outerGrad.addColorStop(1,'#1a1a1a');
      ctx.fillStyle = outerGrad; ctx.fill();

      // Borde exterior dorado
      ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
      ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 3; ctx.stroke();

      for (let i = 0; i < N; i++) {
        const angle = rotacion + i * SECTOR_ANGLE - Math.PI/2;
        const next  = angle + SECTOR_ANGLE;
        const sec   = RULETA_SECTORES[i];

        // Sector relleno
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r - 4, angle, next);
        ctx.closePath();
        if (sec.c === 'rojo')  ctx.fillStyle = '#c41e3a';
        else if (sec.c === 'negro') ctx.fillStyle = '#111111';
        else ctx.fillStyle = '#146b3a';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 0.5; ctx.stroke();

        // Número
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle + SECTOR_ANGLE/2);
        ctx.translate(r - 22, 0);
        ctx.rotate(Math.PI/2);
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${r < 120 ? 7 : 8}px Inter,sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(sec.label, 0, 0);
        ctx.restore();
      }

      // Centro
      ctx.beginPath(); ctx.arc(cx,cy,26,0,Math.PI*2);
      const cGrad = ctx.createRadialGradient(cx-5,cy-5,2,cx,cy,26);
      cGrad.addColorStop(0,'#3a3a3a'); cGrad.addColorStop(1,'#111');
      ctx.fillStyle = cGrad; ctx.fill();
      ctx.strokeStyle = 'rgba(212,175,55,0.6)'; ctx.lineWidth = 2; ctx.stroke();
    }

    // Calcular en qué color cae el puntero (puntero apunta a la parte superior → -PI/2)
    function sectorEnPuntero(angulo) {
      // El puntero está en la parte superior (angle = -PI/2)
      // normalizar el ángulo
      let normalized = ((angulo % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      // El puntero está en -PI/2 del canvas, que equivale a 3PI/2 normalizado
      // Sector 0 empieza en rotacion - PI/2
      let relAngle = (3 * Math.PI/2 - normalized + 2*Math.PI) % (2*Math.PI);
      let idx = Math.floor(relAngle / SECTOR_ANGLE) % N;
      return RULETA_SECTORES[idx].c;
    }

    // ── JUGAR RULETA ─────────────────────────────────────────────────────
    async function jugarRuleta() {
      const monto = parseInt(document.getElementById('ruleta-monto').value);
      if (!monto || monto <= 0) { mostrarToast('Ingresa un monto válido.', true); return; }
      if (monto > MONTO_MAXIMO_CASINO) { mostrarToast(`La apuesta máxima es ${formatCLP(MONTO_MAXIMO_CASINO)}.`, true); return; }
      if (monto > casinoSaldo) { mostrarToast('Saldo insuficiente.', true); return; }
      if (!casinoEleccionRuleta) { mostrarToast('Elige un color primero.', true); return; }
      if (ruletaGirando) return;
      ruletaGirando = true;
      document.getElementById('btn-ruleta').disabled = true;
      document.getElementById('ruleta-resultado').className = 'casino-resultado';

      // Llamar al servidor
      let serverData;
      try {
        const r = await fetch('/api/casino?action=jugar', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ juego: 'ruleta', monto, eleccion: casinoEleccionRuleta })
        });
        serverData = await r.json();
        if (!r.ok) { mostrarToast(serverData.error || 'Error al apostar.', true); ruletaGirando = false; actualizarBtnRuleta(); return; }
      } catch { mostrarToast('Error de conexión.', true); ruletaGirando = false; actualizarBtnRuleta(); return; }

      // Animar la ruleta al sector correcto
      const resultadoColor = serverData.resultado;
      // Encontrar un sector con ese color para aterrizar
      let targetIdx = RULETA_SECTORES.findIndex(s => s.c === resultadoColor);
      // Elegir uno random si hay varios
      const matching = RULETA_SECTORES.map((s,i) => s.c === resultadoColor ? i : -1).filter(x => x>=0);
      targetIdx = matching[Math.floor(Math.random() * matching.length)];

      // El puntero está en -PI/2 (top). Queremos que el sector targetIdx esté bajo el puntero.
      // El sector i inicia en: initialAngle + i * SECTOR_ANGLE - PI/2
      // Queremos que el centro del sector esté en -PI/2:
      // initialAngle + (targetIdx + 0.5) * SECTOR_ANGLE - PI/2 ≡ -PI/2 + 2kPI
      // initialAngle = -targetIdx * SECTOR_ANGLE - 0.5 * SECTOR_ANGLE + small_offset
      const offset = (Math.random() - 0.5) * SECTOR_ANGLE * 0.6; // pequeño random dentro del sector
      const targetAngle = -(targetIdx + 0.5) * SECTOR_ANGLE + offset;
      const spins = 6 + Math.floor(Math.random() * 4); // 6-9 vueltas
      const finalAngle = ruletaAngle + spins * 2 * Math.PI + ((targetAngle - ruletaAngle) % (2*Math.PI));

      // Reproducir sonido de giro (Web Audio API)
      casinoSonidoRuleta();

      // Animación
      const start = performance.now();
      const duration = 4000 + Math.random() * 1000;
      const startAngle = ruletaAngle;
      const delta = finalAngle - startAngle;

      function easeOut(t) { return 1 - Math.pow(1 - t, 4); }

      function tick(now) {
        let t = Math.min((now - start) / duration, 1);
        ruletaAngle = startAngle + delta * easeOut(t);
        dibujarRuleta(ruletaAngle);
        if (t < 1) { requestAnimationFrame(tick); }
        else {
          ruletaAngle = finalAngle;
          dibujarRuleta(ruletaAngle);
          casinoSonidoBall();
          // Mostrar resultado
          setTimeout(() => {
            casinoSaldo = serverData.nuevoSaldo;
            document.getElementById('casino-saldo-val').textContent = formatCLP(casinoSaldo);
            const resEl = document.getElementById('ruleta-resultado');
            const dotColor = resultadoColor === 'rojo' ? '#c41e3a' : resultadoColor === 'negro' ? '#333' : '#146b3a';
            const emoji = `<svg width="14" height="14" viewBox="0 0 14 14" style="vertical-align:middle;margin-right:4px;border-radius:50%;"><circle cx="7" cy="7" r="7" fill="${dotColor}"/></svg>`;
            if (serverData.gano) {
              resEl.className = 'casino-resultado gano visible';
              resEl.innerHTML = `${emoji} ¡Cayó <b>${resultadoColor.toUpperCase()}</b>! &nbsp;<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> ¡GANASTE! <br><span style="font-size:18px;color:#fbbf24;">+${formatCLP(serverData.premio)}</span>`;
            } else {
              resEl.className = 'casino-resultado perdio visible';
              resEl.innerHTML = `${emoji} Cayó <b>${resultadoColor.toUpperCase()}</b>. Elegiste ${casinoEleccionRuleta.toUpperCase()}.<br>Perdiste ${formatCLP(monto)}.`;
            }
            if (typeof feedbackResultado === 'function') feedbackResultado(resEl, serverData.gano);
            ruletaGirando = false;
            actualizarBtnRuleta();
            cargarRanking();
            cargarHistorialCasino();
          }, 500);
        }
      }
      requestAnimationFrame(tick);
    }

    // ── JUGAR MONEDA ─────────────────────────────────────────────────────
    async function jugarMoneda() {
      const monto = parseInt(document.getElementById('moneda-monto').value);
      if (!monto || monto <= 0) { mostrarToast('Ingresa un monto válido.', true); return; }
      if (monto > MONTO_MAXIMO_CASINO) { mostrarToast(`La apuesta máxima es ${formatCLP(MONTO_MAXIMO_CASINO)}.`, true); return; }
      if (monto > casinoSaldo) { mostrarToast('Saldo insuficiente.', true); return; }
      if (!casinoEleccionMoneda) { mostrarToast('Elige cara o cruz primero.', true); return; }
      if (monedaGirando) return;
      monedaGirando = true;
      document.getElementById('btn-moneda').disabled = true;
      document.getElementById('moneda-resultado').className = 'casino-resultado';

      let serverData;
      try {
        const r = await fetch('/api/casino?action=jugar', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ juego: 'moneda', monto, eleccion: casinoEleccionMoneda })
        });
        serverData = await r.json();
        if (!r.ok) { mostrarToast(serverData.error || 'Error al apostar.', true); monedaGirando = false; actualizarBtnMoneda(); return; }
      } catch { mostrarToast('Error de conexión.', true); monedaGirando = false; actualizarBtnMoneda(); return; }

      // Sonido lanzamiento
      casinoSonidoMoneda();

      // Animar moneda
      const wrap = document.getElementById('moneda-wrap');
      wrap.classList.remove('girando');
      void wrap.offsetWidth; // reflow
      wrap.classList.add('girando');

      setTimeout(() => {
        wrap.classList.remove('girando');
        // Mostrar resultado
        const resultado = serverData.resultado; // 'cara' o 'cruz'
        // Orientar la moneda: cara = 0deg, cruz = 180deg
        wrap.style.transform = resultado === 'cara' ? 'rotateY(0deg)' : 'rotateY(180deg)';

        casinoSonidoBall();
        casinoSaldo = serverData.nuevoSaldo;
        document.getElementById('casino-saldo-val').textContent = formatCLP(casinoSaldo);
        const resEl = document.getElementById('moneda-resultado');
        const svgCara = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="1.5" style="vertical-align:middle;margin-right:4px;"><circle cx="12" cy="12" r="10"/><path d="M9 8.5c.5-1 1.5-1.5 3-1.5s3 .8 3 2.2c0 1.5-1.5 2-3 2.3C10.5 11.8 9 12.3 9 13.8c0 1.4 1.5 2.2 3 2.2 1.5 0 2.5-.8 3-1.5"/></svg>';
        const svgCruz = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="1.5" style="vertical-align:middle;margin-right:4px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
        const emoji = resultado === 'cara' ? svgCara : svgCruz;
        if (serverData.gano) {
          resEl.className = 'casino-resultado gano visible';
          resEl.innerHTML = `${emoji} ¡Cayó <b>${resultado.toUpperCase()}</b>! &nbsp;<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2" style="vertical-align:middle"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> ¡GANASTE! <br><span style="font-size:18px;color:#fbbf24;">+${formatCLP(serverData.premio)}</span>`;
        } else {
          resEl.className = 'casino-resultado perdio visible';
          resEl.innerHTML = `${emoji} Cayó <b>${resultado.toUpperCase()}</b>. Elegiste ${casinoEleccionMoneda.toUpperCase()}.<br>Perdiste ${formatCLP(monto)}.`;
        }
        if (typeof feedbackResultado === 'function') feedbackResultado(resEl, serverData.gano);
        monedaGirando = false;
        actualizarBtnMoneda();
        cargarRanking();
        cargarHistorialCasino();
      }, 1500);
    }

    // ── Sonidos Web Audio ─────────────────────────────────────────────────
    let _audioCtx = null;
    function getAudioCtx() {
      if (!_audioCtx) {
        try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
      }
      return _audioCtx;
    }

    function casinoSonidoRuleta() {
      const ctx = getAudioCtx(); if (!ctx) return;
      // Sonido de tick rápido
      let t = ctx.currentTime;
      for (let i = 0; i < 20; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 600 + Math.random() * 200;
        osc.type = 'triangle';
        const delay = t + i * 0.12 * Math.pow(0.88, i);
        gain.gain.setValueAtTime(0.08, delay);
        gain.gain.exponentialRampToValueAtTime(0.001, delay + 0.06);
        osc.start(delay); osc.stop(delay + 0.06);
      }
    }

    function casinoSonidoBall() {
      const ctx = getAudioCtx(); if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
    }

    // ── Sonidos Avión ──────────────────────────────────────────────────────
    let avionEngineNode = null;
    let avionEngineGain = null;

    function casinoSonidoAvionDespegue() {
      const ctx = getAudioCtx(); if (!ctx) return;
      const t = ctx.currentTime;
      // Motor de avión: ruido de turbina que sube de tono
      const bufferSize = ctx.sampleRate * 1.5;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const bpf = ctx.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.setValueAtTime(180, t);
      bpf.frequency.linearRampToValueAtTime(480, t + 1.5);
      bpf.Q.value = 1.2;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.4);
      gain.gain.setValueAtTime(0.18, t + 1.1);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
      src.connect(bpf); bpf.connect(gain); gain.connect(ctx.destination);
      src.start(t); src.stop(t + 1.5);
      // Silbido de turbina
      const osc = ctx.createOscillator();
      const og = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(680, t + 1.4);
      og.gain.setValueAtTime(0.0, t);
      og.gain.linearRampToValueAtTime(0.06, t + 0.3);
      og.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
      osc.connect(og); og.connect(ctx.destination);
      osc.start(t); osc.stop(t + 1.5);
    }

    function casinoSonidoAvionVuelo(duration) {
      const ctx = getAudioCtx(); if (!ctx) return;
      stopAvionEngine();
      const t = ctx.currentTime;
      // Motor continuo mientras vuela
      const bufSrc = ctx.createBufferSource();
      bufSrc.loop = true;
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2-1);
      bufSrc.buffer = buf;
      const bpf = ctx.createBiquadFilter();
      bpf.type = 'bandpass'; bpf.frequency.value = 380; bpf.Q.value = 1.5;
      avionEngineGain = ctx.createGain();
      avionEngineGain.gain.setValueAtTime(0.0, t);
      avionEngineGain.gain.linearRampToValueAtTime(0.12, t + 0.5);
      avionEngineGain.gain.setValueAtTime(0.12, t + duration - 0.5);
      avionEngineGain.gain.linearRampToValueAtTime(0.0, t + duration);
      bufSrc.connect(bpf); bpf.connect(avionEngineGain); avionEngineGain.connect(ctx.destination);
      bufSrc.start(t);
      avionEngineNode = bufSrc;
      setTimeout(() => stopAvionEngine(), duration * 1000 + 100);
    }

    function stopAvionEngine() {
      if (avionEngineNode) {
        try { avionEngineNode.stop(); } catch {}
        avionEngineNode = null;
      }
    }

    function casinoSonidoAvionExplosion() {
      stopAvionEngine();
      const ctx = getAudioCtx(); if (!ctx) return;
      const t = ctx.currentTime;
      // Boom de explosión
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.8, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random()*2-1) * Math.pow(1 - i/data.length, 1.5);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const lpf = ctx.createBiquadFilter();
      lpf.type = 'lowpass'; lpf.frequency.value = 350;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      src.connect(lpf); lpf.connect(gain); gain.connect(ctx.destination);
      src.start(t);
      // Chisporroteo
      for (let i = 0; i < 5; i++) {
        const sparkosc = ctx.createOscillator();
        const sparkg = ctx.createGain();
        sparkosc.type = 'square';
        sparkosc.frequency.value = 200 + Math.random() * 600;
        const d2 = t + 0.05 + i * 0.06;
        sparkg.gain.setValueAtTime(0.08, d2);
        sparkg.gain.exponentialRampToValueAtTime(0.001, d2 + 0.08);
        sparkosc.connect(sparkg); sparkg.connect(ctx.destination);
        sparkosc.start(d2); sparkosc.stop(d2 + 0.08);
      }
    }

    function casinoSonidoAvionAterrizaje() {
      stopAvionEngine();
      const ctx = getAudioCtx(); if (!ctx) return;
      const t = ctx.currentTime;
      // Motor apagándose suavemente
      const bufSrc = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, ctx.sampleRate * 1.0, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2-1);
      bufSrc.buffer = buf;
      const bpf = ctx.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.setValueAtTime(380, t);
      bpf.frequency.exponentialRampToValueAtTime(120, t + 1.0);
      bpf.Q.value = 1.5;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
      bufSrc.connect(bpf); bpf.connect(gain); gain.connect(ctx.destination);
      bufSrc.start(t);
      // Ding de éxito
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        const og = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = [880, 1100, 1320][i];
        const d2 = t + 0.6 + i * 0.18;
        og.gain.setValueAtTime(0.12, d2);
        og.gain.exponentialRampToValueAtTime(0.001, d2 + 0.35);
        osc.connect(og); og.connect(ctx.destination);
        osc.start(d2); osc.stop(d2 + 0.35);
      }
    }

    function casinoSonidoMoneda() {
      const ctx = getAudioCtx(); if (!ctx) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 6; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 1200 - i * 60;
        osc.type = 'sine';
        const d = t + i * 0.22;
        gain.gain.setValueAtTime(0.09, d);
        gain.gain.exponentialRampToValueAtTime(0.001, d + 0.18);
        osc.start(d); osc.stop(d + 0.18);
      }
    }

    // ── Ranking ───────────────────────────────────────────────────────────
    async function cargarRanking() {
      try {
        const r = await fetch('/api/casino?action=ranking');
        if (!r.ok) return;
        const data = await r.json();
        const lista = document.getElementById('casino-ranking-lista');
        if (!data.ranking || data.ranking.length === 0) {
          lista.innerHTML = '<div class="ranking-empty">Aún no hay ganadores registrados.</div>';
          return;
        }
        const posClasses = ['gold','silver','bronze','other','other'];
        const posEmoji = ['1°','2°','3°','4°','5°'];
        lista.innerHTML = data.ranking.map((u,i) => `
          <div class="ranking-item">
            <div class="ranking-pos ${posClasses[i]}">${posEmoji[i]}</div>
            <div class="ranking-nombre">${escHtml(u.nombre || u.discord_id)}</div>
            <div class="ranking-ganado">${formatCLP(u.total_ganado)}</div>
          </div>
        `).join('');
      } catch {}
    }

    // ── Historial casino ──────────────────────────────────────────────────
    async function cargarHistorialCasino() {
      try {
        const r = await fetch('/api/casino?action=historial');
        if (!r.ok) return;
        const data = await r.json();
        const lista = document.getElementById('casino-historial-lista');
        if (!data.apuestas || data.apuestas.length === 0) {
          lista.innerHTML = '<div class="ranking-empty">Sin apuestas aún</div>';
          return;
        }
        const juegoLabel = { ruleta: 'Ruleta', moneda: 'Cara o Cruz', avion: 'Avión' };
        lista.innerHTML = data.apuestas.slice(0, 20).map(a => `
          <div class="ch-item">
            <span class="ch-badge ${a.gano ? 'gano' : 'perdio'}">${a.gano ? 'Ganó' : 'Perdió'}</span>
            <div class="ch-info">
              <div class="ch-juego">${juegoLabel[a.juego] || a.juego} — ${a.juego === 'avion' ? 'quería x' + a.eleccion + ', crasheó en x' + a.resultado : 'apostó ' + a.eleccion + ', salió ' + a.resultado}</div>
              <div class="ch-det">${casinoFecha(a.created_at)}</div>
            </div>
            <div class="ch-monto">
              <div class="ch-monto-val ${a.gano ? 'gano' : 'perdio'}">${a.gano ? '+' + formatCLP(a.premio - a.monto) : '-' + formatCLP(a.monto)}</div>
              <div class="ch-monto-fecha">Apostó ${formatCLP(a.monto)}</div>
            </div>
          </div>
        `).join('');
      } catch {}
    }

    /* ═══════════════════════════════════════════════════════════════
       APUESTAS DEPORTIVAS — JS completo
    ═══════════════════════════════════════════════════════════════ */
    let apSaldo = 0;
    let apPartidoActivo = null; // partido seleccionado para apostar
    let apTipoActivo = null;    // 'simple' | 'combinada'
    let apEleccion = null;      // 'A' | 'B' | 'empate'


    // ══════════════════════════════════════════════════════════════════════
    //  AVIÓN
    // ══════════════════════════════════════════════════════════════════════
    let avionVolando = false;
    let avionAnimFrame = null;

    function avionSliderChange() {
      const val = parseInt(document.getElementById('avion-mult-slider').value);
      const mult = (val / 100).toFixed(2);
      document.getElementById('avion-mult-label').textContent = 'x' + mult;
      avionActualizarInfo();
    }

    function avionActualizarInfo() {
      const monto = parseInt(document.getElementById('avion-monto').value) || 0;
      const mult = parseFloat((parseInt(document.getElementById('avion-mult-slider').value) / 100).toFixed(2));
      const infoEl = document.getElementById('avion-ganancia-info');
      const btn = document.getElementById('btn-avion');
      if (monto > MONTO_MAXIMO_CASINO) {
        infoEl.innerHTML = `<span style="color:#f87171;">La apuesta máxima es ${formatCLP(MONTO_MAXIMO_CASINO)}.</span>`;
        btn.disabled = true;
      } else if (monto > 0) {
        const ganancia = Math.floor(monto * mult);
        infoEl.innerHTML = `Si el avión llega a <b style="color:#06B6D4">x${mult}</b> ganarás <b style="color:#fbbf24">${formatCLP(ganancia)}</b>`;
        btn.disabled = avionVolando;
      } else {
        infoEl.textContent = '';
        btn.disabled = true;
      }
    }

    async function jugarAvion() {
      if (avionVolando) return;
      const monto = parseInt(document.getElementById('avion-monto').value);
      const mult = parseFloat((parseInt(document.getElementById('avion-mult-slider').value) / 100).toFixed(2));
      if (!monto || monto <= 0) { mostrarToast('Ingresa un monto válido.', true); return; }
      if (monto > MONTO_MAXIMO_CASINO) { mostrarToast(`La apuesta máxima es ${formatCLP(MONTO_MAXIMO_CASINO)}.`, true); return; }
      if (monto > casinoSaldo) { mostrarToast('Saldo insuficiente.', true); return; }

      avionVolando = true;
      document.getElementById('btn-avion').disabled = true;
      document.getElementById('avion-resultado').className = 'casino-resultado';
      document.getElementById('avion-estado').textContent = 'Despegando...';

      // Llamar al servidor
      let serverData;
      try {
        const r = await fetch('/api/casino?action=jugar', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ juego: 'avion', monto, eleccion: mult.toString() })
        });
        serverData = await r.json();
        if (!r.ok) {
          mostrarToast(serverData.error || 'Error al apostar.', true);
          avionVolando = false;
          avionActualizarInfo();
          return;
        }
      } catch {
        mostrarToast('Error de conexión.', true);
        avionVolando = false;
        avionActualizarInfo();
        return;
      }

      const crashMult = parseFloat(serverData.resultado);
      const gano = serverData.gano;

      // Animar el avión subiendo
      const multDisplay = document.getElementById('avion-mult-display');
      const avionEmoji = document.getElementById('avion-emoji');
      const estadoEl = document.getElementById('avion-estado');
      const display = document.getElementById('avion-display');

      display.style.background = 'linear-gradient(180deg,rgba(6,182,212,0.12) 0%,rgba(0,0,0,0) 100%)';
      avionEmoji.style.transform = 'rotate(-15deg) translateY(-5px)';
      estadoEl.textContent = 'Volando...';
      casinoSonidoAvionDespegue();
      setTimeout(() => casinoSonidoAvionVuelo(duration / 1000), 500);

      let current = 1.0;
      const targetMult = gano ? mult : crashMult;
      const duration = gano ? 2500 : Math.min(2500, 800 + crashMult * 400);
      const startTime = performance.now();

      function animarVuelo(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 2);
        current = 1.0 + (targetMult - 1.0) * eased;
        multDisplay.textContent = 'x' + current.toFixed(2);

        if (progress < 1) {
          avionAnimFrame = requestAnimationFrame(animarVuelo);
        } else {
          // Terminó la animación
          clearTimeout(avionAnimFrame);
          setTimeout(() => {
            multDisplay.textContent = 'x' + targetMult.toFixed(2);
            casinoSaldo = serverData.nuevoSaldo;
            document.getElementById('casino-saldo-val').textContent = formatCLP(casinoSaldo);

            const resEl = document.getElementById('avion-resultado');
            if (gano) {
              display.style.background = 'linear-gradient(180deg,rgba(16,185,129,0.12) 0%,rgba(0,0,0,0) 100%)';
              multDisplay.style.color = '#10B981';
              avionEmoji.style.transform = 'rotate(-25deg) translateY(-20px)';
              estadoEl.textContent = '¡Aterrizaje exitoso!';
              casinoSonidoAvionAterrizaje();
              resEl.className = 'casino-resultado gano visible';
              resEl.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:5px;"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg> ¡El avión llegó a <b>x${targetMult.toFixed(2)}</b>! <br><span style="font-size:18px;color:#fbbf24;">+${formatCLP(serverData.premio - monto)}</span>`;
              if (typeof feedbackResultado === 'function') feedbackResultado(resEl, true);
            } else {
              display.style.background = 'linear-gradient(180deg,rgba(239,68,68,0.12) 0%,rgba(0,0,0,0) 100%)';
              multDisplay.style.color = '#ef4444';
              avionEmoji.innerHTML = '<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L9.5 8.5 3 6l4.5 6L2 18l7-2 3 6 3-6 7 2-4.5-6L22 6l-6.5 2.5z" fill="rgba(239,68,68,0.2)"/></svg>';
              avionEmoji.style.transform = 'none';
              casinoSonidoAvionExplosion();
              estadoEl.textContent = `Explotó en x${crashMult.toFixed(2)}`;
              resEl.className = 'casino-resultado perdio visible';
              resEl.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff8080" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:5px;"><path d="M12 2L9.5 8.5 3 6l4.5 6L2 18l7-2 3 6 3-6 7 2-4.5-6L22 6l-6.5 2.5z"/></svg> El avión explotó en <b>x${crashMult.toFixed(2)}</b>. Querías x${mult.toFixed(2)}.<br>Perdiste ${formatCLP(monto)}.`;
              if (typeof feedbackResultado === 'function') feedbackResultado(resEl, false);
            }

            // Reset para próxima ronda
            setTimeout(() => {
              multDisplay.style.color = '#06B6D4';
              avionEmoji.innerHTML = '<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#06B6D4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" fill="rgba(6,182,212,0.15)"/></svg>';
              avionEmoji.style.transform = 'none';
              display.style.background = 'linear-gradient(180deg,rgba(6,182,212,0.08) 0%,rgba(0,0,0,0) 100%)';
              estadoEl.textContent = 'Esperando apuesta...';
              multDisplay.textContent = 'x1.00';
              avionVolando = false;
              avionActualizarInfo();
              cargarRanking();
              cargarHistorialCasino();
            }, 3000);
          }, 200);
        }
      }
      avionAnimFrame = requestAnimationFrame(animarVuelo);
    }

    /* ═══════════════════════════════════════════════════════════════
       SONIDOS GENERALES DEL CASINO (hover/click/win/lose reusables)
    ═══════════════════════════════════════════════════════════════ */
    function casinoSonidoClick() {
      const ctx = getAudioCtx(); if (!ctx) return;
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 320; osc.type = 'square';
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.start(); osc.stop(ctx.currentTime + 0.05);
    }
    function casinoSonidoHover() {
      const ctx = getAudioCtx(); if (!ctx) return;
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 900; osc.type = 'sine';
      gain.gain.setValueAtTime(0.025, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
      osc.start(); osc.stop(ctx.currentTime + 0.06);
    }
    function casinoSonidoWinChica() {
      const ctx = getAudioCtx(); if (!ctx) return;
      const t = ctx.currentTime;
      [523, 659, 784].forEach((f, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = f; osc.type = 'triangle';
        const st = t + i * 0.08;
        gain.gain.setValueAtTime(0.09, st);
        gain.gain.exponentialRampToValueAtTime(0.001, st + 0.35);
        osc.start(st); osc.stop(st + 0.35);
      });
    }
    function casinoSonidoWinGrande() {
      const ctx = getAudioCtx(); if (!ctx) return;
      const t = ctx.currentTime;
      [523, 659, 784, 1047, 1319].forEach((f, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = f; osc.type = 'triangle';
        const st = t + i * 0.09;
        gain.gain.setValueAtTime(0.11, st);
        gain.gain.exponentialRampToValueAtTime(0.001, st + 0.5);
        osc.start(st); osc.stop(st + 0.5);
      });
    }
    function casinoSonidoLose() {
      const ctx = getAudioCtx(); if (!ctx) return;
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + 0.4);
      osc.type = 'sawtooth';
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.42);
      osc.start(); osc.stop(ctx.currentTime + 0.42);
    }
    function casinoSonidoReveal() {
      const ctx = getAudioCtx(); if (!ctx) return;
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 700 + Math.random() * 120; osc.type = 'sine';
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.start(); osc.stop(ctx.currentTime + 0.18);
    }
    function casinoSonidoMina() {
      const ctx = getAudioCtx(); if (!ctx) return;
      const t = ctx.currentTime;
      const bufferSize = ctx.sampleRate * 0.3;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      const src = ctx.createBufferSource(); src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      src.connect(gain); gain.connect(ctx.destination);
      src.start(t);
      const osc = ctx.createOscillator(), oGain = ctx.createGain();
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.35);
      osc.type = 'sawtooth';
      oGain.gain.setValueAtTime(0.15, t);
      oGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(oGain); oGain.connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.35);
    }
    function casinoSonidoDado() {
      const ctx = getAudioCtx(); if (!ctx) return;
      let t = ctx.currentTime;
      for (let i = 0; i < 6; i++) {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 300 + Math.random() * 500;
        osc.type = 'triangle';
        const st = t + i * 0.045;
        gain.gain.setValueAtTime(0.06, st);
        gain.gain.exponentialRampToValueAtTime(0.001, st + 0.04);
        osc.start(st); osc.stop(st + 0.04);
      }
    }

    // Delega sonido de hover a cualquier botón/opción del casino (event delegation,
    // así funciona también para elementos que se crean dinámicamente como las
    // casillas de Mines).
    document.addEventListener('mouseover', (e) => {
      if (e.target.closest?.('.casino-lobby-card, .casino-opcion, .btn-casino, .mines-tile:not(.revelada), .dice-modo-btn')) {
        casinoSonidoHover();
      }
    }, { passive: true });

    /* ═══════════════════════════════════════════════════════════════
       EFECTO DE GRAN VICTORIA — confetti + popup, reusable en cualquier juego
    ═══════════════════════════════════════════════════════════════ */
    function casinoCelebrarWin(multiplicador, montoGanado) {
      const esGrande = multiplicador >= 5;
      if (esGrande) casinoSonidoWinGrande(); else casinoSonidoWinChica();

      const popup = document.createElement('div');
      popup.className = 'cc-win-popup' + (esGrande ? ' grande' : '');
      popup.innerHTML = `
        <div class="cc-win-mult">x${multiplicador.toFixed(2)}</div>
        <div class="cc-win-label">${esGrande ? 'GRAN VICTORIA' : 'GANASTE'}</div>
        <div class="cc-win-monto">+${formatCLP(montoGanado)}</div>
      `;
      document.body.appendChild(popup);
      requestAnimationFrame(() => popup.classList.add('show'));
      setTimeout(() => { popup.classList.remove('show'); setTimeout(() => popup.remove(), 400); }, esGrande ? 2200 : 1400);

      if (esGrande) {
        const wrap = document.createElement('div');
        wrap.className = 'cc-confetti-wrap';
        const colores = ['#00e701', '#fbbf24', '#ffffff', '#00c001'];
        for (let i = 0; i < 40; i++) {
          const piece = document.createElement('div');
          piece.className = 'cc-confetti-piece';
          piece.style.left = Math.random() * 100 + 'vw';
          piece.style.background = colores[Math.floor(Math.random() * colores.length)];
          piece.style.animationDelay = (Math.random() * 0.3) + 's';
          piece.style.animationDuration = (1.6 + Math.random() * 1.2) + 's';
          piece.style.transform = `rotate(${Math.random() * 360}deg)`;
          wrap.appendChild(piece);
        }
        document.body.appendChild(wrap);
        setTimeout(() => wrap.remove(), 3200);
      }
    }

    /* ═══════════════════════════════════════════════════════════════
       DICE
    ═══════════════════════════════════════════════════════════════ */
    let diceModo = 'under';
    const DICE_HOUSE_EDGE = 0.97;

    function diceMultiplicador(objetivo, modo) {
      const chance = modo === 'under' ? objetivo : (100 - objetivo);
      return Math.round((DICE_HOUSE_EDGE * 100 / chance) * 10000) / 10000;
    }

    function diceSetModo(modo) {
      diceModo = modo;
      casinoSonidoClick();
      document.getElementById('dice-modo-under').classList.toggle('active', modo === 'under');
      document.getElementById('dice-modo-over').classList.toggle('active', modo === 'over');
      diceRedibujar();
    }

    function diceSliderChange() { diceRedibujar(); }

    function diceRedibujar() {
      const objetivo = parseInt(document.getElementById('dice-slider').value);
      const mult = diceMultiplicador(objetivo, diceModo);
      const chance = diceModo === 'under' ? objetivo : (100 - objetivo);

      document.getElementById('dice-mult-val').textContent = 'x' + mult.toFixed(2);
      document.getElementById('dice-chance-val').textContent = chance.toFixed(2) + '%';
      document.getElementById('dice-marker-val').textContent = objetivo.toFixed(2);

      const marker = document.getElementById('dice-marker');
      const fill = document.getElementById('dice-track-fill');
      marker.style.left = objetivo + '%';
      if (diceModo === 'under') {
        fill.style.left = '0%'; fill.style.width = objetivo + '%';
        fill.style.background = 'var(--stk-red, #fb4b4b)';
      } else {
        fill.style.left = objetivo + '%'; fill.style.width = (100 - objetivo) + '%';
        fill.style.background = 'var(--stk-green, #00e701)';
      }
      diceActualizarInfo();
    }

    function diceActualizarInfo() {
      const monto = parseInt(document.getElementById('dice-monto').value) || 0;
      const objetivo = parseInt(document.getElementById('dice-slider').value);
      const mult = diceMultiplicador(objetivo, diceModo);
      const el = document.getElementById('dice-ganancia-info');
      const btn = document.getElementById('btn-dice');
      if (monto > MONTO_MAXIMO_CASINO) {
        el.innerHTML = `<span style="color:#f87171;">La apuesta máxima es ${formatCLP(MONTO_MAXIMO_CASINO)}.</span>`;
        btn.disabled = true;
      } else if (monto > 0) {
        el.innerHTML = `Si aciertas ganas <b style="color:#00e701">${formatCLP(Math.floor(monto * mult))}</b>`;
        btn.disabled = false;
      } else {
        el.textContent = '';
        btn.disabled = true;
      }
    }

    let diceJugando = false;
    async function jugarDice() {
      if (diceJugando) return;
      const monto = parseInt(document.getElementById('dice-monto').value);
      const objetivo = parseInt(document.getElementById('dice-slider').value);
      if (!monto || monto <= 0) { mostrarToast('Ingresa un monto válido.', true); return; }
      if (monto > MONTO_MAXIMO_CASINO) { mostrarToast(`La apuesta máxima es ${formatCLP(MONTO_MAXIMO_CASINO)}.`, true); return; }
      if (monto > casinoSaldo) { mostrarToast('Saldo insuficiente.', true); return; }

      diceJugando = true;
      document.getElementById('btn-dice').disabled = true;
      const resEl = document.getElementById('dice-resultado');
      resEl.className = 'casino-resultado';
      casinoSonidoDado();

      let data;
      try {
        const r = await fetch('/api/casino?action=jugar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ juego: 'dice', monto, eleccion: `${diceModo}:${objetivo}` })
        });
        data = await r.json();
        if (!r.ok) { mostrarToast(data.error || 'Error al apostar.', true); diceJugando = false; diceActualizarInfo(); return; }
      } catch {
        mostrarToast('Error de conexión.', true); diceJugando = false; diceActualizarInfo(); return;
      }

      const roll = parseFloat(data.resultado);
      const marker = document.getElementById('dice-marker');
      marker.style.transition = 'left .6s cubic-bezier(.16,1,.3,1)';
      const rollMarker = document.createElement('div');
      rollMarker.className = 'dice-roll-marker';
      document.querySelector('.dice-track').appendChild(rollMarker);
      requestAnimationFrame(() => { rollMarker.style.left = roll + '%'; rollMarker.classList.add('show'); });

      setTimeout(() => {
        casinoSaldo = data.nuevoSaldo;
        ccAnimateNumber(document.getElementById('casino-saldo-val'), casinoSaldo, formatCLP);
        const mult = diceMultiplicador(objetivo, diceModo);

        if (data.gano) {
          resEl.className = 'casino-resultado gano visible';
          resEl.innerHTML = `Salió <b>${roll.toFixed(2)}</b> — ¡ganaste! <br><span style="font-size:18px;color:#00e701;">+${formatCLP(data.premio - monto)}</span>`;
          if (typeof feedbackResultado === 'function') feedbackResultado(resEl, true);
          casinoCelebrarWin(mult, data.premio - monto);
        } else {
          resEl.className = 'casino-resultado perdio visible';
          resEl.innerHTML = `Salió <b>${roll.toFixed(2)}</b>. Perdiste ${formatCLP(monto)}.`;
          if (typeof feedbackResultado === 'function') feedbackResultado(resEl, false);
          casinoSonidoLose();
        }

        setTimeout(() => { rollMarker.remove(); marker.style.transition = ''; }, 900);
        diceJugando = false;
        diceActualizarInfo();
        cargarRanking();
        cargarHistorialCasino();
      }, 650);
    }

    /* ═══════════════════════════════════════════════════════════════
       MINES
    ═══════════════════════════════════════════════════════════════ */
    const MINES_TOTAL = 25;
    let minesActiva = false;
    let minesReveladas = [];
    let minesCantidadMinas = 3;
    let minesMonto = 0;
    let minesBloqueado = false;

    function minesConstruirGrid() {
      const grid = document.getElementById('mines-grid');
      grid.innerHTML = '';
      for (let i = 0; i < MINES_TOTAL; i++) {
        const tile = document.createElement('button');
        tile.className = 'mines-tile';
        tile.type = 'button';
        tile.dataset.i = i;
        tile.innerHTML = `<svg class="mines-icon-gema" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M6 3h12l3 5-9 13L3 8l3-5z"/><path d="M3 8h18M9 3l3 5 3-5M12 8l-3 13M12 8l3 13"/></svg>
                          <svg class="mines-icon-mina" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="7"/><path d="M12 2v3M4.2 6.2l2 2M19.8 6.2l-2 2M2 13h3M19 13h3"/></svg>`;
        tile.onclick = () => minesRevelarCasilla(i);
        grid.appendChild(tile);
      }
    }
    minesConstruirGrid();

    function minesActualizarBoton() {
      const monto = parseInt(document.getElementById('mines-monto').value) || 0;
      document.getElementById('btn-mines-start').disabled = !(monto > 0 && monto <= MONTO_MAXIMO_CASINO && !minesActiva);
    }

    async function minesIniciar() {
      const monto = parseInt(document.getElementById('mines-monto').value);
      const minas = parseInt(document.getElementById('mines-cantidad').value);
      if (!monto || monto <= 0) { mostrarToast('Ingresa un monto válido.', true); return; }
      if (monto > casinoSaldo) { mostrarToast('Saldo insuficiente.', true); return; }

      casinoSonidoClick();
      document.getElementById('btn-mines-start').disabled = true;
      let data;
      try {
        const r = await fetch('/api/casino?action=mines_start', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ monto, minas })
        });
        data = await r.json();
        if (!r.ok) { mostrarToast(data.error || 'Error al iniciar.', true); minesActualizarBoton(); return; }
      } catch { mostrarToast('Error de conexión.', true); minesActualizarBoton(); return; }

      casinoSaldo = data.nuevoSaldo;
      ccAnimateNumber(document.getElementById('casino-saldo-val'), casinoSaldo, formatCLP);

      minesActiva = true;
      minesReveladas = [];
      minesCantidadMinas = minas;
      minesMonto = monto;
      minesBloqueado = false;

      document.getElementById('mines-config-form').style.display = 'none';
      document.getElementById('btn-mines-start').style.display = 'none';
      document.getElementById('btn-mines-cashout').style.display = 'flex';
      document.getElementById('mines-topbar').style.display = 'flex';
      document.getElementById('mines-resultado').className = 'casino-resultado';
      minesConstruirGrid();
      minesActualizarTopbar();
    }

    function minesActualizarTopbar() {
      const mult = minesReveladas.length === 0 ? 1 : minesMultiplicadorLocal(minesCantidadMinas, minesReveladas.length);
      document.getElementById('mines-mult-actual').textContent = 'x' + mult.toFixed(2);
      const cashVal = Math.floor(minesMonto * mult);
      document.getElementById('mines-cashout-val').textContent = formatCLP(cashVal);
      document.getElementById('mines-cashout-btn-val').textContent = minesReveladas.length > 0 ? formatCLP(cashVal) : '';
      document.getElementById('btn-mines-cashout').style.opacity = minesReveladas.length > 0 ? '1' : '.5';
      document.getElementById('btn-mines-cashout').disabled = minesReveladas.length === 0;
    }

    function minesMultiplicadorLocal(minas, reveladas) {
      const seguras = MINES_TOTAL - minas;
      let prob = 1;
      for (let i = 0; i < reveladas; i++) prob *= (seguras - i) / (MINES_TOTAL - i);
      return Math.round((1 / prob) * 0.95 * 10000) / 10000;
    }

    async function minesRevelarCasilla(i) {
      if (!minesActiva || minesBloqueado) return;
      if (minesReveladas.includes(i)) return;
      minesBloqueado = true;

      const tile = document.querySelector(`.mines-tile[data-i="${i}"]`);
      let data;
      try {
        const r = await fetch('/api/casino?action=mines_reveal', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ casilla: i })
        });
        data = await r.json();
        if (!r.ok) { mostrarToast(data.error || 'Error.', true); minesBloqueado = false; return; }
      } catch { mostrarToast('Error de conexión.', true); minesBloqueado = false; return; }

      if (data.esMina) {
        casinoSonidoMina();
        tile.classList.add('mina', 'revelada');
        data.posiciones.forEach(p => {
          const t2 = document.querySelector(`.mines-tile[data-i="${p}"]`);
          if (t2 && p !== i) t2.classList.add('mina', 'revelada', 'mina-otra');
        });
        document.querySelectorAll('.mines-tile:not(.revelada)').forEach(t => t.classList.add('gema-perdida', 'revelada'));

        const resEl = document.getElementById('mines-resultado');
        resEl.className = 'casino-resultado perdio visible';
        resEl.innerHTML = `Pisaste una mina en la casilla ${i + 1}. Perdiste ${formatCLP(minesMonto)}.`;
        if (typeof feedbackResultado === 'function') feedbackResultado(resEl, false);

        minesFinalizarUI();
        cargarRanking(); cargarHistorialCasino();
        return;
      }

      casinoSonidoReveal();
      tile.classList.add('gema', 'revelada');
      minesReveladas = data.reveladas;
      minesActualizarTopbar();
      minesBloqueado = false;

      if (data.tableroCompleto) {
        casinoSaldo = data.nuevoSaldo;
        ccAnimateNumber(document.getElementById('casino-saldo-val'), casinoSaldo, formatCLP);
        const resEl = document.getElementById('mines-resultado');
        resEl.className = 'casino-resultado gano visible';
        resEl.innerHTML = `¡Tablero completo! Ganaste <b>${formatCLP(data.premio)}</b> (x${data.multiplicador.toFixed(2)})`;
        if (typeof feedbackResultado === 'function') feedbackResultado(resEl, true);
        casinoCelebrarWin(data.multiplicador, data.premio - minesMonto);
        minesFinalizarUI();
        cargarRanking(); cargarHistorialCasino();
      }
    }

    async function minesRetirar() {
      if (!minesActiva || minesReveladas.length === 0) return;
      casinoSonidoClick();
      document.getElementById('btn-mines-cashout').disabled = true;
      let data;
      try {
        const r = await fetch('/api/casino?action=mines_cashout', { method: 'POST' });
        data = await r.json();
        if (!r.ok) { mostrarToast(data.error || 'Error.', true); return; }
      } catch { mostrarToast('Error de conexión.', true); return; }

      casinoSaldo = data.nuevoSaldo;
      ccAnimateNumber(document.getElementById('casino-saldo-val'), casinoSaldo, formatCLP);

      const resEl = document.getElementById('mines-resultado');
      resEl.className = 'casino-resultado gano visible';
      resEl.innerHTML = `Retiraste a tiempo. Ganaste <b>${formatCLP(data.premio)}</b> (x${data.multiplicador.toFixed(2)})`;
      if (typeof feedbackResultado === 'function') feedbackResultado(resEl, true);
      casinoCelebrarWin(data.multiplicador, data.premio - minesMonto);

      document.querySelectorAll('.mines-tile:not(.revelada)').forEach(t => t.classList.add('gema-perdida', 'revelada'));
      minesFinalizarUI();
      cargarRanking(); cargarHistorialCasino();
    }

    function minesFinalizarUI() {
      minesActiva = false;
      minesReveladas = [];
      document.getElementById('btn-mines-cashout').style.display = 'none';
      document.getElementById('mines-topbar').style.display = 'none';
      setTimeout(() => {
        document.getElementById('mines-config-form').style.display = 'flex';
        document.getElementById('btn-mines-start').style.display = 'flex';
        minesActualizarBoton();
        minesConstruirGrid();
      }, 2200);
    }

    if (document.getElementById('dice-slider')) diceRedibujar();

    // ══════════════════════════════════════════════════════════════════════
    //  LIMBO
    // ══════════════════════════════════════════════════════════════════════
    function limboActualizarInfo() {
      const target = parseFloat(document.getElementById('limbo-target').value) || 0;
      const monto = parseInt(document.getElementById('limbo-monto').value) || 0;
      const chancePct = target > 1 ? (0.99 / target * 100) : 0;
      document.getElementById('limbo-chance-pill').textContent = target >= 1.01 ? `${chancePct.toFixed(2)}%` : '—';
      const el = document.getElementById('limbo-ganancia-info');
      if (monto > MONTO_MAXIMO_CASINO) {
        el.innerHTML = `<span style="color:#f87171;">La apuesta máxima es ${formatCLP(MONTO_MAXIMO_CASINO)}.</span>`;
      } else if (monto > 0 && target >= 1.01) {
        el.innerHTML = `Si aciertas ganas <b style="color:#00e701">${formatCLP(Math.floor(monto * target))}</b>`;
      } else el.textContent = '';
      document.getElementById('btn-limbo').disabled = !(monto > 0 && monto <= MONTO_MAXIMO_CASINO && target >= 1.01 && !limboJugando);
    }

    let limboJugando = false;
    async function jugarLimbo() {
      const target = parseFloat(document.getElementById('limbo-target').value) || 0;
      const monto = parseInt(document.getElementById('limbo-monto').value) || 0;
      if (!(monto > 0 && target >= 1.01)) return;
      limboJugando = true;
      casinoSonidoClick();
      document.getElementById('btn-limbo').disabled = true;
      const displayEl = document.getElementById('limbo-mult-display');
      const estadoEl = document.getElementById('limbo-estado');
      displayEl.className = 'limbo-mult-display';
      estadoEl.textContent = 'Jugando...';

      let data;
      try {
        const r = await fetch('/api/casino?action=jugar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ juego: 'limbo', monto, eleccion: target }),
        });
        data = await r.json();
        if (!r.ok) { mostrarToast(data.error || 'Error.', true); limboJugando = false; limboActualizarInfo(); estadoEl.textContent = 'Elige tu objetivo y apuesta'; return; }
      } catch { mostrarToast('Error de conexión.', true); limboJugando = false; limboActualizarInfo(); return; }

      const crash = parseFloat(data.resultado);
      // Animación corta: cuenta ascendente hasta el crash real.
      const inicio = performance.now();
      const duracion = Math.min(1800, 400 + crash * 60);
      function anim(t) {
        const p = Math.min(1, (t - inicio) / duracion);
        const val = 1 + (crash - 1) * (1 - Math.pow(1 - p, 3));
        displayEl.textContent = `x${val.toFixed(2)}`;
        if (p < 1) requestAnimationFrame(anim);
        else finalizar();
      }
      requestAnimationFrame(anim);

      function finalizar() {
        displayEl.textContent = `x${crash.toFixed(2)}`;
        displayEl.classList.toggle('perdio', !data.gano);
        casinoSaldo = data.nuevoSaldo;
        ccAnimateNumber(document.getElementById('casino-saldo-val'), casinoSaldo, formatCLP);
        const resEl = document.getElementById('limbo-resultado');
        resEl.className = `casino-resultado ${data.gano ? 'gano' : 'perdio'} visible`;
        resEl.innerHTML = data.gano
          ? `¡Ganaste! Crash x${crash.toFixed(2)} ≥ objetivo x${target.toFixed(2)} — <b>${formatCLP(data.premio)}</b>`
          : `Perdiste. Crash en x${crash.toFixed(2)} (objetivo x${target.toFixed(2)})`;
        if (typeof feedbackResultado === 'function') feedbackResultado(resEl, data.gano);
        if (data.gano) casinoCelebrarWin(target, data.premio - monto);
        estadoEl.textContent = 'Elige tu objetivo y apuesta';
        limboJugando = false;
        limboActualizarInfo();
        cargarRanking(); cargarHistorialCasino(); pfCargarEstado();
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    //  PLINKO
    // ══════════════════════════════════════════════════════════════════════
    let plinkoJugando = false;
    const PLINKO_TABLAS_CLIENTE = {
      "8-bajo":   [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
      "8-medio":  [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
      "8-alto":   [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
      "12-bajo":  [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
      "12-medio": [24, 7, 2, 1.3, 0.7, 0.4, 0.2, 0.4, 0.7, 1.3, 2, 7, 24],
      "12-alto":  [58, 9, 2, 0.7, 0.3, 0.2, 0.1, 0.2, 0.3, 0.7, 2, 9, 58],
      "16-bajo":  [16, 9, 2, 1.4, 1.2, 1.1, 1, 0.5, 0.3, 0.5, 1, 1.1, 1.2, 1.4, 2, 9, 16],
      "16-medio": [110, 41, 10, 5, 3, 1.5, 1, 0.3, 0.2, 0.3, 1, 1.5, 3, 5, 10, 41, 110],
      "16-alto":  [1000, 130, 26, 9, 4, 2, 0.5, 0.2, 0.1, 0.2, 0.5, 2, 4, 9, 26, 130, 1000],
    };

    function plinkoActualizarTabla() {
      const filas = document.getElementById('plinko-filas').value;
      const riesgo = document.getElementById('plinko-riesgo').value;
      const tabla = PLINKO_TABLAS_CLIENTE[`${filas}-${riesgo}`] || [];
      const row = document.getElementById('plinko-mults-row');
      row.innerHTML = tabla.map(m => `<div class="plinko-mult-cell ${m < 1 ? 'low' : ''}" data-mult="${m}">${m}x</div>`).join('');
      plinkoDibujarTablero(parseInt(filas));
    }
    function plinkoActualizarBoton() {
      const monto = parseInt(document.getElementById('plinko-monto').value) || 0;
      document.getElementById('btn-plinko').disabled = !(monto > 0 && monto <= MONTO_MAXIMO_CASINO && !plinkoJugando);
    }

    function plinkoDibujarTablero(filas, bolaPos) {
      const canvas = document.getElementById('plinko-canvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const padTop = 24, padBottom = 20, padSide = 18;
      const usableH = h - padTop - padBottom;
      const rowGap = usableH / filas;
      for (let row = 0; row < filas; row++) {
        const pinsEnFila = row + 3;
        const y = padTop + row * rowGap;
        const totalWidth = w - padSide * 2;
        const gap = totalWidth / (pinsEnFila - 1 || 1);
        for (let i = 0; i < pinsEnFila; i++) {
          const x = padSide + i * gap;
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.fill();
        }
      }
      if (bolaPos) {
        ctx.beginPath();
        ctx.arc(bolaPos.x, bolaPos.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#00e701';
        ctx.shadowColor = 'rgba(0,231,1,0.8)';
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    async function jugarPlinko() {
      const monto = parseInt(document.getElementById('plinko-monto').value) || 0;
      const filas = parseInt(document.getElementById('plinko-filas').value);
      const riesgo = document.getElementById('plinko-riesgo').value;
      if (!(monto > 0)) return;
      plinkoJugando = true;
      casinoSonidoClick();
      document.getElementById('btn-plinko').disabled = true;

      let data;
      try {
        const r = await fetch('/api/casino?action=jugar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ juego: 'plinko', monto, eleccion: `${filas}:${riesgo}` }),
        });
        data = await r.json();
        if (!r.ok) { mostrarToast(data.error || 'Error.', true); plinkoJugando = false; plinkoActualizarBoton(); return; }
      } catch { mostrarToast('Error de conexión.', true); plinkoJugando = false; plinkoActualizarBoton(); return; }

      const match = /bucket:(\d+)\|x([\d.]+)/.exec(data.resultado);
      const bucket = match ? parseInt(match[1]) : 0;
      const mult = match ? parseFloat(match[2]) : 0;

      // Generamos un camino visual aleatorio de L/R que termine en el bucket
      // correcto (el resultado real ya fue decidido por el servidor; esto
      // es solo la animación de la bolita cayendo).
      const rights = bucket, lefts = filas - bucket;
      let camino = Array(rights).fill(1).concat(Array(lefts).fill(-1));
      for (let i = camino.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [camino[i], camino[j]] = [camino[j], camino[i]];
      }

      const canvas = document.getElementById('plinko-canvas');
      const w = canvas.width, h = canvas.height;
      const padTop = 24, padBottom = 20, padSide = 18;
      const usableH = h - padTop - padBottom;
      const rowGap = usableH / filas;
      let xPos = w / 2, colOffset = 0;
      let paso = 0;

      function animarPaso() {
        if (paso >= filas) {
          plinkoDibujarTablero(filas);
          const row = document.getElementById('plinko-mults-row');
          const cells = row.querySelectorAll('.plinko-mult-cell');
          cells.forEach((c, i) => c.classList.toggle('hit', i === bucket));
          setTimeout(() => cells.forEach(c => c.classList.remove('hit')), 2200);

          casinoSaldo = data.nuevoSaldo;
          ccAnimateNumber(document.getElementById('casino-saldo-val'), casinoSaldo, formatCLP);
          const resEl = document.getElementById('plinko-resultado');
          const gano = mult >= 1;
          resEl.className = `casino-resultado ${gano ? 'gano' : 'perdio'} visible`;
          resEl.innerHTML = gano
            ? `¡Cayó en x${mult}! Ganaste <b>${formatCLP(data.premio)}</b>`
            : `Cayó en x${mult}. Perdiste parte de la apuesta.`;
          if (typeof feedbackResultado === 'function') feedbackResultado(resEl, gano);
          if (gano && data.premio > monto) casinoCelebrarWin(mult, data.premio - monto);
          plinkoJugando = false;
          plinkoActualizarBoton();
          cargarRanking(); cargarHistorialCasino(); pfCargarEstado();
          return;
        }
        colOffset += camino[paso];
        const pinsEnFila = paso + 3;
        const totalWidth = w - padSide * 2;
        const gap = totalWidth / (pinsEnFila - 1 || 1);
        const y = padTop + (paso + 1) * rowGap;
        xPos = w / 2 + colOffset * (gap / 2);
        plinkoDibujarTablero(filas, { x: xPos, y });
        paso++;
        setTimeout(animarPaso, 140);
      }
      plinkoDibujarTablero(filas, { x: xPos, y: padTop });
      setTimeout(animarPaso, 140);
    }

    // ══════════════════════════════════════════════════════════════════════
    //  PROVABLY FAIR
    // ══════════════════════════════════════════════════════════════════════
    function pfTogglePanel() {
      document.getElementById('pf-panel').classList.toggle('open');
    }
    function pfCopiar(id) {
      const el = document.getElementById(id);
      if (!el) return;
      navigator.clipboard?.writeText(el.value || el.textContent).then(() => {
        if (typeof mostrarToast === 'function') mostrarToast('Copiado.', false);
      }).catch(() => {});
    }
    async function pfCargarEstado() {
      try {
        const r = await fetch('/api/casino?action=seed_estado');
        const data = await r.json();
        if (!r.ok) return;
        document.getElementById('pf-server-hash').value = data.server_seed_hash;
        document.getElementById('pf-client-seed').value = data.client_seed;
        document.getElementById('pf-nonce').textContent = data.nonce;
      } catch {}
    }
    async function pfRotarSeed() {
      const nuevoClientSeed = document.getElementById('pf-client-seed').value.trim();
      try {
        const r = await fetch('/api/casino?action=seed_rotar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_seed: nuevoClientSeed || undefined }),
        });
        const data = await r.json();
        if (!r.ok) { mostrarToast(data.error || 'Error.', true); return; }
        mostrarToast('Seed rotado. El anterior ya se puede verificar.', false);
        document.getElementById('pf-server-hash').value = data.nuevo.server_seed_hash;
        document.getElementById('pf-client-seed').value = data.nuevo.client_seed;
        document.getElementById('pf-nonce').textContent = data.nuevo.nonce;
        pfCargarRevelados();
      } catch { mostrarToast('Error de conexión.', true); }
    }
    async function pfCargarRevelados() {
      try {
        const r = await fetch('/api/casino?action=seed_revelados');
        const data = await r.json();
        if (!r.ok || !data.seeds?.length) return;
        const wrap = document.getElementById('pf-revelados-wrap');
        const lista = document.getElementById('pf-revelados-lista');
        wrap.style.display = 'block';
        lista.innerHTML = data.seeds.map(s => `
          <div class="pf-row-value" style="flex-direction:column;align-items:flex-start;gap:3px;">
            <div style="opacity:.5;font-size:9.5px;">Hash: ${s.server_seed_hash.slice(0, 24)}...</div>
            <div>Seed: ${s.server_seed.slice(0, 24)}...</div>
            <div style="opacity:.5;font-size:9.5px;">Client seed: ${s.client_seed} · ${s.nonce_final} apuestas</div>
          </div>
        `).join('');
      } catch {}
    }

    // ══════════════════════════════════════════════════════════════════════
    //  FEED DE APUESTAS EN VIVO
    // ══════════════════════════════════════════════════════════════════════
    let casinoLiveFeedTimer = null;
    async function cargarLiveFeed() {
      const list = document.getElementById('casino-live-feed-list');
      if (!list) return;
      try {
        const r = await fetch('/api/casino?action=feed_global');
        const data = await r.json();
        if (!r.ok || !data.apuestas) return;
        if (data.apuestas.length === 0) {
          list.innerHTML = '<div class="ranking-empty" style="padding:12px 0;">Nadie ha apostado todavía</div>';
          return;
        }
        list.innerHTML = data.apuestas.map(a => `
          <div class="clf-item">
            <span class="clf-juego">${a.juego}</span>
            <span class="clf-user">${a.nombre}</span>
            <span class="clf-monto ${a.gano ? 'gano' : 'perdio'}">${a.gano ? '+' : '-'}${formatCLP(a.gano ? a.premio : a.monto)}</span>
          </div>
        `).join('');
      } catch {}
    }
    function iniciarLiveFeedPolling() {
      cargarLiveFeed();
      if (casinoLiveFeedTimer) clearInterval(casinoLiveFeedTimer);
      casinoLiveFeedTimer = setInterval(cargarLiveFeed, 6000);
    }

    // Inicialización de los nuevos módulos al cargar el casino.
    if (document.getElementById('casino-live-feed-list')) iniciarLiveFeedPolling();
    if (document.getElementById('pf-panel')) { pfCargarEstado(); pfCargarRevelados(); }
    if (document.getElementById('plinko-canvas')) plinkoActualizarTabla();
