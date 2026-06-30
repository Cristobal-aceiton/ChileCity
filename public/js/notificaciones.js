    // NOTIFICACIONES (campanita)
    // ══════════════════════════════════════════════════════════════════════════
    // Junta multas nuevas, resultados de apuestas y transferencias recibidas
    // en un solo panel. Se mantiene visible sobre cualquier sección porque su
    // markup vive fuera de los .screen (ver index.html), y se sondea cada
    // cierto tiempo mientras haya sesión activa.

    let notifItems = [];
    let notifPollTimer = null;
    let notifPrimeraCarga = true;

    function notifIniciar() {
      const wrap = document.getElementById('notif-bell-wrap');
      if (wrap) wrap.classList.add('nb-activo');
      notifPrimeraCarga = true;
      notifCargar();
      clearInterval(notifPollTimer);
      notifPollTimer = setInterval(notifCargar, 45000); // sondeo cada 45s
    }

    function notifDetener() {
      const wrap = document.getElementById('notif-bell-wrap');
      if (wrap) { wrap.classList.remove('nb-activo', 'nb-open'); }
      clearInterval(notifPollTimer);
      notifPollTimer = null;
      notifItems = [];
    }

    async function notifCargar() {
      if (!currentUser?.id) return;
      try {
        const r = await fetch('/api/notificaciones', { credentials: 'same-origin' });
        if (!r.ok) return;
        const data = await r.json();
        const previas = notifItems.length;
        const noLeidasPrevias = notifItems.filter(i => i.nuevo).length;
        notifItems = data.items || [];
        notifRenderBadge(data.noLeidas || 0);
        notifRenderLista();

        // Si hay notificaciones nuevas desde el último sondeo (y no es la
        // primera carga de la sesión), agita la campanita para llamar la
        // atención sin ser invasivo con sonido.
        if (!notifPrimeraCarga && (data.noLeidas || 0) > noLeidasPrevias) {
          notifAgitarCampana();
        }
        notifPrimeraCarga = false;
      } catch { /* fallo silencioso: no rompe la navegación por esto */ }
    }

    function notifRenderBadge(n) {
      const badge = document.getElementById('notif-badge');
      if (!badge) return;
      if (n > 0) {
        badge.textContent = n > 9 ? '9+' : String(n);
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }

    function notifAgitarCampana() {
      const btn = document.getElementById('notif-bell-btn');
      if (!btn) return;
      btn.classList.remove('nb-ring');
      void btn.offsetWidth; // reflow para poder repetir la animación
      btn.classList.add('nb-ring');
    }

    function notifTiempoRelativo(fechaStr) {
      const fecha = new Date(fechaStr);
      const seg = Math.floor((Date.now() - fecha.getTime()) / 1000);
      if (seg < 60) return 'Hace un momento';
      const min = Math.floor(seg / 60);
      if (min < 60) return `Hace ${min} min`;
      const hrs = Math.floor(min / 60);
      if (hrs < 24) return `Hace ${hrs} h`;
      const dias = Math.floor(hrs / 24);
      if (dias < 7) return `Hace ${dias} d`;
      return fecha.toLocaleDateString('es-CL');
    }

    function notifRenderLista() {
      const lista = document.getElementById('notif-list');
      if (!lista) return;
      if (!notifItems.length) {
        lista.innerHTML = '<div class="notif-empty">No tienes notificaciones por ahora.</div>';
        return;
      }
      lista.innerHTML = notifItems.map((it, idx) => `
        <div class="notif-item ${it.nuevo ? 'nv-nuevo' : ''}" onclick="notifClickItem(${idx})">
          <div class="notif-item-icono">${it.icono}</div>
          <div class="notif-item-info">
            <div class="notif-item-titulo">${escHtml(it.titulo)}${it.nuevo ? '<span class="notif-item-dot"></span>' : ''}</div>
            <div class="notif-item-detalle">${escHtml(it.detalle)}</div>
            <div class="notif-item-tiempo">${notifTiempoRelativo(it.fecha)}</div>
          </div>
        </div>`).join('');
    }

    // Lleva al usuario a la sección relevante según el tipo de notificación.
    function notifClickItem(idx) {
      const it = notifItems[idx];
      if (!it) return;
      notifCerrar();
      if (it.tipo === 'multa') {
        abrirSeccion('comisaria-screen');
        // abrirComisaria ya se encarga de cargar el contenido y dejar el tab
        // "Mis Multas" activo por defecto.
        if (typeof abrirComisaria === 'function') abrirComisaria();
      } else if (it.tipo === 'transferencia') {
        abrirSeccion('banco-screen');
        if (typeof cargarBanco === 'function') cargarBanco();
      } else if (it.tipo === 'apuesta') {
        abrirSeccion('apuestas-screen');
        if (typeof apCargarHistorialPersonal === 'function') apCargarHistorialPersonal();
      } else if (it.tipo === 'antecedente') {
        abrirSeccion('comisaria-screen');
        if (typeof abrirComisaria === 'function') abrirComisaria();
      } else if (it.tipo === 'admin') {
        // Aviso de administración: no tiene una sección propia a la cual ir,
        // solo se marca como leído al abrir el panel.
      }
    }

    function notifAbrir() {
      document.getElementById('notif-bell-wrap')?.classList.add('nb-open');
      notifMarcarLeidas();
    }
    function notifCerrar() {
      document.getElementById('notif-bell-wrap')?.classList.remove('nb-open');
    }
    function notifToggle() {
      const wrap = document.getElementById('notif-bell-wrap');
      if (!wrap) return;
      wrap.classList.contains('nb-open') ? notifCerrar() : notifAbrir();
    }

    async function notifMarcarLeidas() {
      if (!notifItems.some(i => i.nuevo)) return;
      notifItems = notifItems.map(i => ({ ...i, nuevo: false }));
      notifRenderBadge(0);
      notifRenderLista();
      try {
        await fetch('/api/notificaciones', { method: 'POST', credentials: 'same-origin' });
      } catch { /* si falla, el próximo sondeo lo vuelve a intentar */ }
    }

    document.addEventListener('DOMContentLoaded', () => {
      const btn = document.getElementById('notif-bell-btn');
      if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); notifToggle(); });
      document.getElementById('notif-marcar-leidas')?.addEventListener('click', (e) => {
        e.stopPropagation();
        notifMarcarLeidas();
      });
      document.addEventListener('click', (e) => {
        const wrap = document.getElementById('notif-bell-wrap');
        if (wrap && wrap.classList.contains('nb-open') && !wrap.contains(e.target)) notifCerrar();
      });
    });
