    // ══════════════════════════════════════════════════════════════════════
    //  CASINO
    // ══════════════════════════════════════════════════════════════════════
    let casinoSaldo = 0;
    let casinoEleccionRuleta = null;
    let casinoEleccionMoneda = null;
    let ruletaGirando = false;
    let monedaGirando = false;
    let ruletaAngle = 0; // current rotation of canvas

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
          document.getElementById('casino-saldo-val').textContent = formatCLP(casinoSaldo);
        }
      } catch {}
      dibujarRuleta(0);
      await cargarRanking();
      await cargarHistorialCasino();
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
        if (m > 0) {
          el.innerHTML = `Rojo/Negro: ganas <b style="color:#F59E0B">${formatCLP(m*2)}</b> &nbsp;|&nbsp; Verde: ganas <b style="color:#4ade80">${formatCLP(m*14)}</b>`;
        } else el.textContent = '';
        actualizarBtnRuleta();
      } else {
        const m = parseInt(document.getElementById('moneda-monto').value) || 0;
        const el = document.getElementById('moneda-ganancia-info');
        if (m > 0) el.innerHTML = `Si aciertas ganas <b style="color:#F59E0B">${formatCLP(m*2)}</b>`;
        else el.textContent = '';
        actualizarBtnMoneda();
      }
    }

    function actualizarBtnRuleta() {
      const m = parseInt(document.getElementById('ruleta-monto').value) || 0;
      document.getElementById('btn-ruleta').disabled = !(m > 0 && casinoEleccionRuleta && !ruletaGirando);
    }
    function actualizarBtnMoneda() {
      const m = parseInt(document.getElementById('moneda-monto').value) || 0;
      document.getElementById('btn-moneda').disabled = !(m > 0 && casinoEleccionMoneda && !monedaGirando);
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
            const emoji = resultadoColor === 'rojo' ? '🔴' : resultadoColor === 'negro' ? '⚫' : '🟢';
            if (serverData.gano) {
              resEl.className = 'casino-resultado gano visible';
              resEl.innerHTML = `${emoji} ¡Cayó <b>${resultadoColor.toUpperCase()}</b>! &nbsp;🎉 ¡GANASTE! <br><span style="font-size:18px;color:#fbbf24;">+${formatCLP(serverData.premio)}</span>`;
            } else {
              resEl.className = 'casino-resultado perdio visible';
              resEl.innerHTML = `${emoji} Cayó <b>${resultadoColor.toUpperCase()}</b>. Elegiste ${casinoEleccionRuleta.toUpperCase()}.<br>Perdiste ${formatCLP(monto)}.`;
            }
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
        const emoji = resultado === 'cara' ? '🦅' : '🌟';
        if (serverData.gano) {
          resEl.className = 'casino-resultado gano visible';
          resEl.innerHTML = `${emoji} ¡Cayó <b>${resultado.toUpperCase()}</b>! &nbsp;🎉 ¡GANASTE! <br><span style="font-size:18px;color:#fbbf24;">+${formatCLP(serverData.premio)}</span>`;
        } else {
          resEl.className = 'casino-resultado perdio visible';
          resEl.innerHTML = `${emoji} Cayó <b>${resultado.toUpperCase()}</b>. Elegiste ${casinoEleccionMoneda.toUpperCase()}.<br>Perdiste ${formatCLP(monto)}.`;
        }
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
        const posEmoji = ['🥇','🥈','🥉','4°','5°'];
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
        const juegoLabel = { ruleta: '🎡 Ruleta', moneda: '🪙 Cara o Cruz', avion: '✈️ Avión' };
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
      if (monto > 0) {
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
      estadoEl.textContent = 'Volando... 🚀';

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
              estadoEl.textContent = '¡Aterrizaje exitoso! ✅';
              resEl.className = 'casino-resultado gano visible';
              resEl.innerHTML = `✈️ ¡El avión llegó a <b>x${targetMult.toFixed(2)}</b>! <br><span style="font-size:18px;color:#fbbf24;">+${formatCLP(serverData.premio - monto)}</span>`;
            } else {
              display.style.background = 'linear-gradient(180deg,rgba(239,68,68,0.12) 0%,rgba(0,0,0,0) 100%)';
              multDisplay.style.color = '#ef4444';
              avionEmoji.textContent = '💥';
              avionEmoji.style.transform = 'none';
              estadoEl.textContent = `Explotó en x${crashMult.toFixed(2)} 💥`;
              resEl.className = 'casino-resultado perdio visible';
              resEl.innerHTML = `💥 El avión explotó en <b>x${crashMult.toFixed(2)}</b>. Querías x${mult.toFixed(2)}.<br>Perdiste ${formatCLP(monto)}.`;
            }

            // Reset para próxima ronda
            setTimeout(() => {
              multDisplay.style.color = '#06B6D4';
              avionEmoji.textContent = '✈️';
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
