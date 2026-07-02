    // PERFIL PÚBLICO v2 — layout maestro-detalle estilo "expediente"
    // ══════════════════════════════════════════════════════════════════════════
    // Antes: acordeón de cards que se estiraban dentro del mismo scroller (causa
    // raíz del bug de scroll trabado en iOS que se parcheaba con ppDespertarScroll).
    // Ahora: lista compacta (maestro) + panel de detalle fijo aparte (detalle).
    // En desktop el detalle vive en una columna sticky al lado de la lista; en
    // mobile se convierte en una pantalla completa que se desliza encima (por
    // eso ya no hay contenido que "crece" dentro del scroller de la lista, y el
    // bug de iOS queda resuelto de raíz en vez de parchado).
    let ppRegistros     = [];
    let ppSearchTimer   = null;
    let ppPaginaActual  = 1;
    let ppQueryActual   = '';
    let ppCargandoMas   = false;
    let ppHasMore       = false;
    let ppSeleccionadoId = null;

    // ── Íconos (solo SVG, sin emojis) ──────────────────────────────────────
    const PP_ICON_PERSONA = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>';
    const PP_ICON_CHECK    = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.6 2.6L16.5 9"/></svg>';
    const PP_ICON_ALERTA   = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12.5"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    const PP_ICON_ESCUDO    = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 21s7.5-3.7 7.5-9.3V5.6L12 3 4.5 5.6v6.1C4.5 17.3 12 21 12 21z"/></svg>';
    const PP_ICON_CAJA      = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>';
    const PP_ICON_TROFEO    = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M7 4h10v4a5 5 0 0 1-10 0V4z"/><path d="M7 5H4a3 3 0 0 0 3 5M17 5h3a3 3 0 0 1-3 5"/><path d="M8 21h8M12 17v4"/></svg>';
    const PP_ICON_RELOJ     = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5l3.2 1.8"/></svg>';
    const PP_ICON_CARPETA   = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.2h9A1.5 1.5 0 0 1 21 8.7V17a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17z"/></svg>';

    function ppEstadoInfo(r) {
      const multas = r.multas.length, ants = r.antecedentes.length;
      if (ants > 0)  return { color: '#ef4444', label: 'Con antecedentes', icon: PP_ICON_ESCUDO };
      if (multas > 0) return { color: '#f59e0b', label: 'Con multas',      icon: PP_ICON_ALERTA };
      return { color: '#10b981', label: 'Sin registros', icon: PP_ICON_CHECK };
    }

    function ppCatIcon(cat) {
      const icons = {
        vehiculos: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 13l1.6-4.6A2 2 0 0 1 6.4 7h11.2a2 2 0 0 1 1.9 1.4L21 13"/><rect x="2.5" y="13" width="19" height="5" rx="1.5"/><circle cx="7" cy="18.4" r="1.5"/><circle cx="17" cy="18.4" r="1.5"/></svg>',
        armas:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 13.5h9.5l1.8-2.7h5.2a2 2 0 0 1 2 2v.9a2 2 0 0 1-2 2h-1.2v3h-3v-3H8.2l-1.9 3.8H3z"/><path d="M6.3 13.5V9.2"/></svg>',
        licencias: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 2h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M15 2v5h5"/><path d="M8 12.5h8M8 16h5"/></svg>',
        otros:     PP_ICON_CAJA.replace('width="13" height="13"', 'width="18" height="18"'),
      };
      return icons[cat] || icons.otros;
    }
    function ppImgFallback(el, cat) { if (el && el.parentElement) el.parentElement.innerHTML = ppCatIcon(cat); }

    function ppLogroIcon(codigo) {
      const icons = {
        bienvenido:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="12" r="2.2"/><path d="M13 10h6M13 14h4"/></svg>',
        comienzo:      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 10l9-6 9 6"/><path d="M5 10v9h14v-9"/><path d="M10 19v-6h4v6"/></svg>',
        primer_sueldo: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/></svg>',
        progresando:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
        primer_auto:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 13l1.6-4.6A2 2 0 0 1 6.4 7h11.2a2 2 0 0 1 1.9 1.4L21 13"/><rect x="2.5" y="13" width="19" height="5" rx="1.5"/><circle cx="7" cy="18.4" r="1.5"/><circle cx="17" cy="18.4" r="1.5"/></svg>',
        empresario:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="9" width="18" height="12" rx="1.5"/><path d="M8 9V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3"/></svg>',
        adinerada:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 6.5v11"/><path d="M15.3 9.3c-.5-1-1.7-1.6-3-1.6-1.8 0-3.1 1-3.1 2.2 0 2.9 6.2 1.3 6.2 4.2 0 1.3-1.4 2.3-3.2 2.3-1.4 0-2.5-.6-3.1-1.5"/></svg>',
        suertudo:      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 2.5l1.7 6.3 6.3 1.7-6.3 1.7L12 18.5l-1.7-6.3-6.3-1.7 6.3-1.7z"/></svg>',
        exitosa:       '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M12 3l2.6 5.9 6.4.6-4.8 4.3 1.4 6.2L12 16.9 6.4 20l1.4-6.2L3 9.5l6.4-.6z"/></svg>',
        millonario:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M6.5 3h11l3 5.5-9.5 12-9.5-12z"/><path d="M2.5 8.5h19M9 3l-2.5 5.5L12 20.5l5.5-12L15 3"/></svg>',
        billonario:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M3 8l4 3 5-6 5 6 4-3-2 9.5H5z"/><path d="M5 20.5h14"/></svg>',
      };
      return icons[codigo] || icons.bienvenido;
    }

    function ppEmptySlot(texto, icono) {
      return `<div class="pp2-empty-slot">${icono}<span>${texto}</span></div>`;
    }

    // Debounce en búsqueda con validación en tiempo real
    (function() {
      const inp = document.getElementById('pp-search');
      if (!inp) return;
      inp.addEventListener('input', () => {
        clearTimeout(ppSearchTimer);
        const q = inp.value.trim();
        // Feedback visual inmediato
        const clearBtn = document.getElementById('pp-clear');
        if (clearBtn) clearBtn.style.opacity = q ? '1' : '0';
        ppSearchTimer = setTimeout(() => cargarPerfilPublico(q), 280);
      });
      inp.addEventListener('keydown', e => {
        if (e.key === 'Escape') { inp.value = ''; limpiarBusquedaPP(); }
      });
    })();

    function limpiarBusquedaPP() {
      const inp = document.getElementById('pp-search');
      const clearBtn = document.getElementById('pp-clear');
      if (inp) inp.value = '';
      if (clearBtn) clearBtn.style.opacity = '0';
      cargarPerfilPublico('');
    }

    // q: término de búsqueda. Siempre reinicia a la página 1 (nueva búsqueda).
    async function cargarPerfilPublico(q = '') {
      if (!currentUser?.id) return;
      ppQueryActual   = q;
      ppPaginaActual  = 1;
      ppSeleccionadoId = null;
      document.getElementById('pp-loading').style.display = 'flex';
      document.getElementById('pp-wrap').classList.add('pp2-hidden');
      document.getElementById('pp-lista').innerHTML = '';
      document.getElementById('pp-stats').style.display = 'none';
      ppCerrarDetalleVacio();
      ppCerrarDetalleMobile();

      try {
        const data = await ppFetchPagina(q, 1);
        document.getElementById('pp-loading').style.display = 'none';
        document.getElementById('pp-wrap').classList.remove('pp2-hidden');
        ppRegistros = data.registros || [];
        ppHasMore   = !!data.hasMore;
        renderPerfilPublico(ppRegistros, data.total ?? ppRegistros.length);
        actualizarBotonCargarMasPP();
      } catch(e) {
        document.getElementById('pp-loading').style.display = 'none';
        document.getElementById('pp-wrap').classList.remove('pp2-hidden');
        if (e && e.sesionInvalida) {
          document.getElementById('pp-lista').innerHTML =
            '<div class="pp2-lista-vacia">Sesión no válida. Cierra sesión y vuelve a entrar.</div>';
          return;
        }
        document.getElementById('pp-lista').innerHTML =
          '<div class="pp2-lista-vacia">Error al cargar el perfil público.</div>';
      }
    }

    // Trae la siguiente página y la agrega al final de la lista ya cargada
    // (en vez de pedir todos los ciudadanos de una sola vez, que se vuelve
    // pesado si la ciudad llega a tener miles de DNIs registrados).
    async function ppCargarMas() {
      if (ppCargandoMas || !ppHasMore) return;
      ppCargandoMas = true;
      const btn = document.getElementById('pp-cargar-mas');
      if (btn) { btn.disabled = true; btn.textContent = 'Cargando…'; }

      try {
        const data = await ppFetchPagina(ppQueryActual, ppPaginaActual + 1);
        ppPaginaActual += 1;
        ppHasMore = !!data.hasMore;
        ppRegistros = ppRegistros.concat(data.registros || []);
        renderPerfilPublico(ppRegistros, data.total ?? ppRegistros.length);
      } catch {
        mostrarToast && mostrarToast('Error al cargar más ciudadanos.', true);
      } finally {
        ppCargandoMas = false;
        actualizarBotonCargarMasPP();
      }
    }

    async function ppFetchPagina(q, page) {
      const params = new URLSearchParams({ page: String(page) });
      if (q) params.set('q', q);
      const res = await fetch(`/api/perfil-publico?${params.toString()}`, { credentials: 'same-origin' });
      if (res.status === 401) { const err = new Error('401'); err.sesionInvalida = true; throw err; }
      if (!res.ok) throw new Error('Error ' + res.status);
      return res.json();
    }

    function actualizarBotonCargarMasPP() {
      let btn = document.getElementById('pp-cargar-mas');
      const lista = document.getElementById('pp-lista');
      if (!ppHasMore) { ocultarBotonCargarMasPP(); return; }
      if (!btn) {
        btn = document.createElement('button');
        btn.id = 'pp-cargar-mas';
        btn.className = 'pp2-cargar-mas-btn';
        btn.onclick = ppCargarMas;
        lista.appendChild(btn);
      }
      btn.disabled = false;
      btn.textContent = 'Cargar más ciudadanos';
    }

    function ocultarBotonCargarMasPP() {
      const btn = document.getElementById('pp-cargar-mas');
      if (btn) btn.remove();
    }

    // ── Lista (maestro) ──────────────────────────────────────────────────────
    function renderPerfilPublico(lista, totalServer) {
      const el      = document.getElementById('pp-lista');
      const statsEl = document.getElementById('pp-stats');

      if (!lista.length) {
        el.innerHTML = '<div class="pp2-lista-vacia">No se encontraron ciudadanos.</div>';
        statsEl.style.display = 'none';
        ppCerrarDetalleVacio();
        return;
      }

      // El stat muestra el total real en la BD (o que calza con la búsqueda),
      // no solo lo que se ha cargado hasta ahora en pantalla.
      document.getElementById('pp-total-registros').textContent = totalServer ?? lista.length;
      statsEl.style.display = 'flex';

      el.innerHTML = lista.map(r => {
        const nombreCompleto = [r.nombre1, r.nombre2, r.apellido1, r.apellido2].filter(Boolean).join(' ');
        const estado    = ppEstadoInfo(r);
        const multCount = r.multas.length;
        const antCount  = r.antecedentes.length;
        const multaBadge = multCount > 0
          ? `<span class="pp2-badge pp2-badge-multa">${PP_ICON_ALERTA}${multCount}</span>` : '';
        const antBadge = antCount > 0
          ? `<span class="pp2-badge pp2-badge-ant">${PP_ICON_ESCUDO}${antCount}</span>` : '';

        return `
          <div class="pp2-row" id="ppr-${r.discord_id}" style="--pp-status:${estado.color}" onclick="ppSeleccionar('${r.discord_id}')">
            <div class="pp2-row-avatar">${PP_ICON_PERSONA}</div>
            <div class="pp2-row-info">
              <div class="pp2-row-nombre">${escHtml(nombreCompleto)}</div>
              <div class="pp2-row-rut">${escHtml(r.rut || '—')}${r.discord_username ? ' · @' + escHtml(r.discord_username) : ''}</div>
            </div>
            <div class="pp2-row-badges">${multaBadge}${antBadge}</div>
            <svg class="pp2-row-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="9 6 15 12 9 18"/></svg>
          </div>`;
      }).join('');

      // Si había un ciudadano seleccionado y sigue en la lista (p.ej. tras
      // "cargar más"), se re-marca visualmente su fila.
      if (ppSeleccionadoId) {
        const row = document.getElementById(`ppr-${ppSeleccionadoId}`);
        if (row) row.classList.add('selected');
      }
    }

    // ── Detalle (expediente) ─────────────────────────────────────────────────
    function ppSeleccionar(id) {
      const r = ppRegistros.find(x => x.discord_id === id);
      if (!r) return;
      ppSeleccionadoId = id;

      document.querySelectorAll('.pp2-row.selected').forEach(el => el.classList.remove('selected'));
      const row = document.getElementById(`ppr-${id}`);
      if (row) row.classList.add('selected');

      renderPPDetalle(r);
      document.getElementById('pp-detail-empty').style.display = 'none';
      document.getElementById('pp-detail-content').style.display = 'block';
      document.getElementById('pp-detail').classList.add('pp2-detail-open');
    }

    // Cierra el panel de detalle en mobile (overlay); en desktop es un no-op
    // visual porque ahí el panel siempre está visible (sticky en la columna).
    function ppCerrarDetalleMobile() {
      document.getElementById('pp-detail')?.classList.remove('pp2-detail-open');
    }

    function ppCerrarDetalleVacio() {
      ppSeleccionadoId = null;
      const content = document.getElementById('pp-detail-content');
      const empty   = document.getElementById('pp-detail-empty');
      if (content) content.style.display = 'none';
      if (empty)   empty.style.display   = 'flex';
      ppCerrarDetalleMobile();
    }

    function renderPPDetalle(r) {
      const nombreCompleto = [r.nombre1, r.nombre2, r.apellido1, r.apellido2].filter(Boolean).join(' ');
      const apellidos      = [r.apellido1, r.apellido2].filter(Boolean).join(' ');
      const nombres        = [r.nombre1, r.nombre2].filter(Boolean).join(' ');
      const fnac           = r.fecha_nac
        ? (() => { const p = r.fecha_nac.split('-'); return p.length===3 ? `${p[2]}/${p[1]}/${p[0]}` : r.fecha_nac; })()
        : '—';

      const estado    = ppEstadoInfo(r);
      const invCount  = r.inventario.length;
      const multCount = r.multas.length;
      const antCount  = r.antecedentes.length;
      const logrosLista = r.logros || [];
      const logCount  = logrosLista.filter(l => l.obtenido).length;

      // Inventario
      const invHtml = invCount === 0
        ? ppEmptySlot('Sin items en inventario', PP_ICON_CAJA.replace('width="13" height="13"', 'width="22" height="22"'))
        : r.inventario.map(item => `
            <div class="pp2-inv-item">
              <div class="pp2-inv-img">
                ${item.imagen_url
                  ? `<img src="${escHtml(item.imagen_url)}" alt="${escHtml(item.nombre)}" loading="lazy" onerror="ppImgFallback(this,'${item.categoria}')">`
                  : ppCatIcon(item.categoria)}
              </div>
              <div class="pp2-inv-nombre">${escHtml(item.nombre)}</div>
              <div class="pp2-inv-precio">${formatCLP(item.precio_pagado)}</div>
            </div>`).join('');

      // Multas
      const multasHtml = multCount === 0
        ? ppEmptySlot('Sin multas registradas', PP_ICON_ALERTA.replace('width="13" height="13"', 'width="22" height="22"'))
        : r.multas.map(m => {
            const fecha = m.created_at ? new Date(m.created_at).toLocaleDateString('es-CL') : '—';
            const estadoM = m.estado === 'pagada'
              ? `<span class="pp2-estado pp2-estado-ok">${PP_ICON_CHECK}Pagada</span>`
              : `<span class="pp2-estado pp2-estado-pend">${PP_ICON_RELOJ}Pendiente</span>`;
            return `
            <div class="pp2-record-row">
              <div class="pp2-record-main">
                <div class="pp2-record-titulo">${escHtml(m.motivo)}</div>
                <div class="pp2-record-meta">${fecha} · ${escHtml(m.funcionario_nombre || 'Sin datos')}</div>
              </div>
              <div class="pp2-record-right">
                <div class="pp2-record-valor">${formatCLP(m.valor)}</div>
                ${estadoM}
              </div>
            </div>`;
          }).join('');

      // Antecedentes
      const antsHtml = antCount === 0
        ? ppEmptySlot('Sin antecedentes registrados', PP_ICON_ESCUDO.replace('width="13" height="13"', 'width="22" height="22"'))
        : r.antecedentes.map(a => {
            const fecha = a.created_at ? new Date(a.created_at).toLocaleDateString('es-CL') : '—';
            return `
            <div class="pp2-record-row">
              <div class="pp2-record-main">
                <div class="pp2-record-titulo">${escHtml(a.motivo)}</div>
                ${a.articulos ? `<div class="pp2-record-arts">${escHtml(a.articulos)}</div>` : ''}
                <div class="pp2-record-meta">${fecha} · ${escHtml(a.funcionario_nombre || 'Sin datos')}</div>
              </div>
              ${a.tiempo_carcel ? `<div class="pp2-record-right"><span class="pp2-carcel-badge">${PP_ICON_RELOJ}${escHtml(a.tiempo_carcel)}</span></div>` : ''}
            </div>`;
          }).join('');

      // Logros (mismos datos que la sección "Logros" personal, pero con
      // íconos SVG propios de este panel en vez de emojis)
      const logrosHtml = logrosLista.length === 0
        ? ppEmptySlot('Sin logros', PP_ICON_TROFEO.replace('width="13" height="13"', 'width="22" height="22"'))
        : `<div class="pp2-logros-grid">${logrosLista.map(l => `
            <div class="pp2-logro-card ${l.obtenido ? 'desbloqueado' : 'bloqueado'}" style="--logro-color:${l.color}">
              <div class="pp2-logro-icono">${ppLogroIcon(l.codigo)}</div>
              <div class="pp2-logro-info">
                <div class="pp2-logro-nombre">${escHtml(l.nombre)}</div>
                <div class="pp2-logro-desc">${escHtml(l.descripcion)}</div>
                ${l.obtenido
                  ? `<div class="pp2-logro-fecha">Desbloqueado el ${new Date(l.fecha).toLocaleDateString('es-CL')}</div>`
                  : `<div class="pp2-logro-fecha" style="text-transform:uppercase;letter-spacing:.5px;">Bloqueado</div>`}
              </div>
            </div>`).join('')}</div>`;

      document.getElementById('pp-detail-content').innerHTML = `
        <div class="pp2-detail-back" onclick="ppCerrarDetalleMobile()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          Volver a la lista
        </div>

        <div class="pp2-dossier-header" style="--pp-status:${estado.color}">
          <div class="pp2-dossier-avatar">${PP_ICON_PERSONA.replace('width="18" height="18"', 'width="26" height="26"')}</div>
          <div class="pp2-dossier-titulos">
            <div class="pp2-dossier-nombre">${escHtml(nombreCompleto)}</div>
            <div class="pp2-dossier-rut">${escHtml(r.rut || '—')}${r.discord_username ? ' · @' + escHtml(r.discord_username) : ''}</div>
          </div>
          <div class="pp2-dossier-estado">${estado.icon}${estado.label}</div>
        </div>

        <div class="pp2-detail-body">
          <!-- Carnet mini -->
          <div class="pp2-mini-carnet">
            <div class="pp2-mini-foto">${PP_ICON_PERSONA.replace('width="18" height="18"', 'width="24" height="24"')}</div>
            <div class="pp2-mini-datos">
              <div class="pp2-mini-campo"><div class="pp2-mini-label">Apellidos</div><div class="pp2-mini-valor">${escHtml(apellidos)}</div></div>
              <div class="pp2-mini-campo"><div class="pp2-mini-label">Nombres</div><div class="pp2-mini-valor">${escHtml(nombres)}</div></div>
              <div class="pp2-mini-campo"><div class="pp2-mini-label">Fecha de Nacimiento</div><div class="pp2-mini-valor">${fnac}</div></div>
              <div class="pp2-mini-campo"><div class="pp2-mini-label">R.U.N.</div><div class="pp2-mini-valor pp2-mini-rut">${escHtml(r.rut || '—')}</div></div>
              <div class="pp2-mini-campo"><div class="pp2-mini-label">Nacionalidad</div><div class="pp2-mini-valor">${escHtml(r.nacionalidad || 'Chilena')}</div></div>
              <div class="pp2-mini-campo"><div class="pp2-mini-label">Usuario Discord</div><div class="pp2-mini-valor">${r.discord_username ? '@' + escHtml(r.discord_username) : 'Sin vincular'}</div></div>
            </div>
          </div>

          <!-- Pestañas tipo carpeta -->
          <div class="pp2-folder-tabs" id="pp-folder-tabs">
            <button class="pp2-folder-tab active" data-tab="inv" onclick="ppSwitchTab('inv',this)">
              ${PP_ICON_CAJA} Inventario <span class="pp2-folder-count">${invCount}</span>
            </button>
            <button class="pp2-folder-tab" data-tab="multas" onclick="ppSwitchTab('multas',this)">
              ${PP_ICON_ALERTA} Multas <span class="pp2-folder-count ${multCount>0?'alert':''}">${multCount}</span>
            </button>
            <button class="pp2-folder-tab" data-tab="ants" onclick="ppSwitchTab('ants',this)">
              ${PP_ICON_ESCUDO} Antecedentes <span class="pp2-folder-count ${antCount>0?'alert':''}">${antCount}</span>
            </button>
            <button class="pp2-folder-tab" data-tab="logros" onclick="ppSwitchTab('logros',this)">
              ${PP_ICON_TROFEO} Logros <span class="pp2-folder-count">${logCount}</span>
            </button>
          </div>
          <div class="pp2-folder-content">
            <div class="pp2-panel active" data-panel="inv"><div class="pp2-inv-grid">${invHtml}</div></div>
            <div class="pp2-panel" data-panel="multas"><div class="pp2-records-list">${multasHtml}</div></div>
            <div class="pp2-panel" data-panel="ants"><div class="pp2-records-list">${antsHtml}</div></div>
            <div class="pp2-panel" data-panel="logros">${logrosHtml}</div>
          </div>
        </div>`;
    }

    function ppSwitchTab(tabName, btn) {
      const tabsWrap = document.getElementById('pp-folder-tabs');
      if (!tabsWrap) return;
      tabsWrap.querySelectorAll('.pp2-folder-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('#pp-detail-content .pp2-panel').forEach(p => p.classList.remove('active'));
      const panel = document.querySelector(`#pp-detail-content .pp2-panel[data-panel="${tabName}"]`);
      if (panel) panel.classList.add('active');

      const body = document.querySelector('#pp-detail .pp2-detail-body');
      if (body) body.scrollTop = 0;
    }
