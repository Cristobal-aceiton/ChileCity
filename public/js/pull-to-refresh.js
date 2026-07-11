    // PULL-TO-REFRESH
    // ══════════════════════════════════════════════════════════════════════════
    // Gesto táctil genérico para refrescar datos en vivo (saldo, notificaciones,
    // partidos) en pantallas que ya scrollean por sí mismas (.screen.seccion-screen
    // o el panel de notificaciones). No depende de ningún framework: solo touch
    // events sobre el propio elemento con overflow-y:auto.
    //
    // El indicador se inserta UNA SOLA VEZ y vive fuera del contenido que cada
    // pantalla reemplaza con innerHTML (por eso en notif-list se cuelga como
    // hermano antes de la lista, no como hijo de ella — si no, notifRenderLista()
    // lo borraría en cada sondeo).

    const PTR_THRESHOLD = 64; // px de arrastre necesarios para soltar y refrescar
    const PTR_MAX        = 90; // tope visual del arrastre (con resistencia)
    const PTR_RESISTENCIA = 0.45;

    function ptrCrearIndicador() {
      const ind = document.createElement('div');
      ind.className = 'ptr-indicator';
      ind.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/></svg>`;
      return ind;
    }

    function attachPullToRefresh(scrollEl, onRefresh, opts = {}) {
      if (!scrollEl || scrollEl._ptrAttached) return;
      scrollEl._ptrAttached = true;

      const indicador = ptrCrearIndicador();
      const host   = opts.indicatorParent || scrollEl;
      const before = opts.insertBefore !== undefined ? opts.insertBefore : host.firstChild;
      host.insertBefore(indicador, before || null);
      const svg = indicador.querySelector('svg');

      const getScrollTop = typeof opts.getScrollTop === 'function'
        ? opts.getScrollTop
        : () => scrollEl.scrollTop;

      let startY = 0, dragging = false, pulled = 0, ready = false, loading = false;

      function colapsar(transicion) {
        indicador.style.transition = transicion ? '' : 'none';
        indicador.style.height = '0px';
        if (svg) svg.style.transform = '';
        pulled = 0; ready = false;
        indicador.classList.remove('ptr-ready');
      }

      scrollEl.addEventListener('touchstart', (e) => {
        if (loading) return;
        if (getScrollTop() > 0) { dragging = false; return; }
        startY = e.touches[0].clientY;
        dragging = true;
        indicador.style.transition = 'none';
      }, { passive: true });

      scrollEl.addEventListener('touchmove', (e) => {
        if (!dragging || loading) return;
        const dy = e.touches[0].clientY - startY;
        if (dy <= 0 || getScrollTop() > 0) {
          if (pulled > 0) colapsar(false);
          return;
        }
        e.preventDefault();
        pulled = Math.min(PTR_MAX, dy * PTR_RESISTENCIA);
        indicador.style.height = pulled + 'px';
        const wasReady = ready;
        ready = pulled >= PTR_THRESHOLD;
        if (svg) svg.style.transform = `rotate(${Math.min(180, (pulled / PTR_THRESHOLD) * 180)}deg)`;
        indicador.classList.toggle('ptr-ready', ready);
        if (ready && !wasReady && navigator.vibrate) {
          try { navigator.vibrate(12); } catch {}
        }
      }, { passive: false });

      function soltar() {
        if (!dragging) return;
        dragging = false;
        indicador.style.transition = '';
        if (ready) {
          loading = true;
          indicador.classList.add('ptr-loading');
          indicador.classList.remove('ptr-ready');
          indicador.style.height = '50px';
          if (svg) svg.style.transform = '';
          Promise.resolve().then(onRefresh).catch(() => {}).finally(() => {
            // deja ver el spinner un instante aunque la respuesta sea instantánea,
            // para que el gesto se sienta intencional y no un parpadeo
            setTimeout(() => {
              loading = false;
              indicador.classList.remove('ptr-loading');
              colapsar(true);
            }, 280);
          });
        } else {
          colapsar(true);
        }
      }

      scrollEl.addEventListener('touchend', soltar);
      scrollEl.addEventListener('touchcancel', soltar);
    }

    // ── Registro de pantallas con datos en vivo ──────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
      const bancoScreen = document.getElementById('banco-screen');
      if (bancoScreen) {
        attachPullToRefresh(bancoScreen, () => typeof cargarBanco === 'function' ? cargarBanco() : null);
      }

      const apuestasScreen = document.getElementById('apuestas-screen');
      if (apuestasScreen) {
        attachPullToRefresh(apuestasScreen, () => {
          if (typeof apRefrescarActivo === 'function') return apRefrescarActivo();
          if (typeof apCargarPartidos === 'function') return apCargarPartidos();
        });
      }

      const notifList  = document.getElementById('notif-list');
      const notifPanel = document.querySelector('.notif-panel');
      if (notifList && notifPanel) {
        attachPullToRefresh(notifList, () => typeof notifCargar === 'function' ? notifCargar() : null, {
          indicatorParent: notifPanel,
          insertBefore: notifList,
        });
      }
    });
