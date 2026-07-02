    // ══════════════════════════════════════════════════════════════════════════
    // LOGROS
    // ══════════════════════════════════════════════════════════════════════════

    // ── Íconos (SVG, sin emojis) — uno por cada logro del catálogo ──────────
    const LOGRO_ICONS = {
      bienvenido:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="12" r="2.2"/><path d="M13 10h6M13 14h4"/></svg>',
      comienzo:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 10l9-6 9 6"/><path d="M5 10v9h14v-9"/><path d="M10 19v-6h4v6"/></svg>',
      primer_sueldo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/></svg>',
      progresando:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
      primer_auto:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 13l1.6-4.6A2 2 0 0 1 6.4 7h11.2a2 2 0 0 1 1.9 1.4L21 13"/><rect x="2.5" y="13" width="19" height="5" rx="1.5"/><circle cx="7" cy="18.4" r="1.5"/><circle cx="17" cy="18.4" r="1.5"/></svg>',
      empresario:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="9" width="18" height="12" rx="1.5"/><path d="M8 9V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3"/></svg>',
      adinerada:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 6.5v11"/><path d="M15.3 9.3c-.5-1-1.7-1.6-3-1.6-1.8 0-3.1 1-3.1 2.2 0 2.9 6.2 1.3 6.2 4.2 0 1.3-1.4 2.3-3.2 2.3-1.4 0-2.5-.6-3.1-1.5"/></svg>',
      suertudo:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 2.5l1.7 6.3 6.3 1.7-6.3 1.7L12 18.5l-1.7-6.3-6.3-1.7 6.3-1.7z"/></svg>',
      exitosa:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M12 3l2.6 5.9 6.4.6-4.8 4.3 1.4 6.2L12 16.9 6.4 20l1.4-6.2L3 9.5l6.4-.6z"/></svg>',
      millonario:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M6.5 3h11l3 5.5-9.5 12-9.5-12z"/><path d="M2.5 8.5h19M9 3l-2.5 5.5L12 20.5l5.5-12L15 3"/></svg>',
      billonario:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M3 8l4 3 5-6 5 6 4-3-2 9.5H5z"/><path d="M5 20.5h14"/></svg>',
    };
    function logroIconSvg(codigo, size) {
      const svg = LOGRO_ICONS[codigo] || LOGRO_ICONS.bienvenido;
      return size ? svg.replace('<svg ', `<svg width="${size}" height="${size}" `) : svg;
    }

    // ── Vista del usuario: sus propios logros ───────────────────────────────
    async function cargarLogros() {
      const loading = document.getElementById('logros-loading');
      const grid    = document.getElementById('logros-grid');
      const resumen = document.getElementById('logros-resumen');
      loading.style.display = 'flex';
      grid.innerHTML = '';
      resumen.textContent = '';

      try {
        const res = await fetch('/api/banco?action=logros');
        const data = await res.json();
        loading.style.display = 'none';
        if (!res.ok) {
          grid.innerHTML = `<div class="tienda-empty">${escHtml(data.error || 'Error al cargar tus logros.')}</div>`;
          return;
        }
        const logros = data.logros || [];
        const total = logros.length;
        const obtenidos = logros.filter(l => l.obtenido).length;
        resumen.textContent = `Has desbloqueado ${obtenidos} de ${total} logros.`;
        renderLogrosGrid(grid, logros);
      } catch (e) {
        loading.style.display = 'none';
        grid.innerHTML = '<div class="tienda-empty">Error de conexión.</div>';
      }
    }

    function renderLogrosGrid(container, logros) {
      container.innerHTML = logros.map(l => `
        <div class="logro-card ${l.obtenido ? 'desbloqueado' : 'bloqueado'}" style="--logro-color:${l.color}">
          <div class="logro-icono">${logroIconSvg(l.codigo, 24)}</div>
          <div class="logro-info">
            <div class="logro-nombre">${escHtml(l.nombre)}</div>
            <div class="logro-desc">${escHtml(l.descripcion)}</div>
            ${l.obtenido
              ? `<div class="logro-fecha">Desbloqueado el ${new Date(l.fecha).toLocaleDateString('es-CL', {day:'2-digit',month:'2-digit',year:'numeric'})}</div>`
              : `<div class="logro-fecha logro-bloqueada-txt">Bloqueado</div>`}
          </div>
        </div>`).join('');
    }

    // ── Panel admin: gestionar logros de un usuario por su Discord ID ───────
    let alUltimaBusqueda = null;

    async function alBuscarUsuario() {
      const idInput = document.getElementById('al-buscar-id');
      const errEl   = document.getElementById('al-buscar-error');
      const loading = document.getElementById('al-loading');
      const lista   = document.getElementById('al-lista');
      errEl.classList.remove('visible');

      const targetId = idInput.value.trim();
      if (!targetId || !/^\d{15,25}$/.test(targetId)) {
        errEl.textContent = 'Ingresa un Discord ID válido.';
        errEl.classList.add('visible');
        return;
      }

      alUltimaBusqueda = targetId;
      loading.style.display = 'flex';
      lista.innerHTML = '';

      try {
        const res = await fetch(`/api/admin?action=logros_admin_usuario&target_id=${targetId}`);
        const data = await res.json();
        loading.style.display = 'none';
        if (!res.ok) {
          errEl.textContent = data.error || 'Error al buscar.';
          errEl.classList.add('visible');
          return;
        }
        renderAdminLogros(targetId, data.logros || []);
      } catch (e) {
        loading.style.display = 'none';
        errEl.textContent = 'Error de conexión.';
        errEl.classList.add('visible');
      }
    }

    function renderAdminLogros(targetId, logros) {
      const lista = document.getElementById('al-lista');
      lista.innerHTML = `
        <div style="font-size:12px;color:rgba(255,255,255,0.4);margin-bottom:10px;font-family:monospace;">Usuario: ${escHtml(targetId)}</div>
        <div class="logros-admin-lista">
          ${logros.map(l => `
            <div class="usuario-row" id="al-row-${l.codigo}">
              <div style="flex-shrink:0;color:rgba(255,255,255,.7);">${logroIconSvg(l.codigo, 22)}</div>
              <div class="ur-info">
                <div class="ur-nombre">${escHtml(l.nombre)}</div>
                <div class="ur-rut">${escHtml(l.descripcion)}</div>
              </div>
              <div class="ur-acciones">
                ${l.obtenido
                  ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#4ade80;font-weight:700;margin-right:4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M4 12.5l5 5L20 6"/></svg>Obtenido</span>
                     <button class="btn-small red" onclick="alQuitarLogro('${l.codigo}')">Quitar</button>`
                  : `<button class="btn-small green" onclick="alOtorgarLogro('${l.codigo}')">Otorgar</button>`}
              </div>
            </div>`).join('')}
        </div>`;
    }

    async function alOtorgarLogro(codigo) {
      if (!alUltimaBusqueda) return;
      try {
        const res = await fetch('/api/admin?action=logros_admin_otorgar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target_id: alUltimaBusqueda, codigo }),
        });
        const data = await res.json();
        if (!res.ok) { mostrarToast(data.error || 'Error al otorgar el logro.', true); return; }
        mostrarToast('Logro otorgado.');
        alBuscarUsuario();
      } catch (e) {
        mostrarToast('Error de conexión.', true);
      }
    }

    async function alQuitarLogro(codigo) {
      if (!alUltimaBusqueda) return;
      if (!confirm('¿Quitar este logro al usuario?')) return;
      try {
        const res = await fetch(`/api/admin?action=logros_admin_quitar&target_id=${alUltimaBusqueda}&codigo=${codigo}`, {
          method: 'DELETE',
        });
        if (!res.ok) { mostrarToast('Error al quitar el logro.', true); return; }
        mostrarToast('Logro quitado.');
        alBuscarUsuario();
      } catch (e) {
        mostrarToast('Error de conexión.', true);
      }
    }

    // ── Mismas funciones, pero para Gestión de Logros dentro del Panel
    // Staff (elementos con prefijo "sal-" en vez de "al-", para no chocar
    // con los del Panel Admin). Pegan a las mismas rutas de /api/admin, que
    // ahora aceptan tanto admins como staff.
    let salUltimaBusqueda = null;

    async function salBuscarUsuario() {
      const idInput = document.getElementById('sal-buscar-id');
      const errEl   = document.getElementById('sal-buscar-error');
      const loading = document.getElementById('sal-loading');
      const lista   = document.getElementById('sal-lista');
      errEl.classList.remove('visible');

      const targetId = idInput.value.trim();
      if (!targetId || !/^\d{15,25}$/.test(targetId)) {
        errEl.textContent = 'Ingresa un Discord ID válido.';
        errEl.classList.add('visible');
        return;
      }

      salUltimaBusqueda = targetId;
      loading.style.display = 'flex';
      lista.innerHTML = '';

      try {
        const res = await fetch(`/api/admin?action=logros_admin_usuario&target_id=${targetId}`);
        const data = await res.json();
        loading.style.display = 'none';
        if (!res.ok) {
          errEl.textContent = data.error || 'Error al buscar.';
          errEl.classList.add('visible');
          return;
        }
        renderStaffLogros(targetId, data.logros || []);
      } catch (e) {
        loading.style.display = 'none';
        errEl.textContent = 'Error de conexión.';
        errEl.classList.add('visible');
      }
    }

    function renderStaffLogros(targetId, logros) {
      const lista = document.getElementById('sal-lista');
      lista.innerHTML = `
        <div style="font-size:12px;color:rgba(255,255,255,0.4);margin-bottom:10px;font-family:monospace;">Usuario: ${escHtml(targetId)}</div>
        <div class="logros-admin-lista">
          ${logros.map(l => `
            <div class="usuario-row" id="sal-row-${l.codigo}">
              <div style="flex-shrink:0;color:rgba(255,255,255,.7);">${logroIconSvg(l.codigo, 22)}</div>
              <div class="ur-info">
                <div class="ur-nombre">${escHtml(l.nombre)}</div>
                <div class="ur-rut">${escHtml(l.descripcion)}</div>
              </div>
              <div class="ur-acciones">
                ${l.obtenido
                  ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#4ade80;font-weight:700;margin-right:4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M4 12.5l5 5L20 6"/></svg>Obtenido</span>
                     <button class="btn-small red" onclick="salQuitarLogro('${l.codigo}')">Quitar</button>`
                  : `<button class="btn-small green" onclick="salOtorgarLogro('${l.codigo}')">Otorgar</button>`}
              </div>
            </div>`).join('')}
        </div>`;
    }

    async function salOtorgarLogro(codigo) {
      if (!salUltimaBusqueda) return;
      try {
        const res = await fetch('/api/admin?action=logros_admin_otorgar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target_id: salUltimaBusqueda, codigo }),
        });
        const data = await res.json();
        if (!res.ok) { mostrarToast(data.error || 'Error al otorgar el logro.', true); return; }
        mostrarToast('Logro otorgado.');
        salBuscarUsuario();
      } catch (e) {
        mostrarToast('Error de conexión.', true);
      }
    }

    async function salQuitarLogro(codigo) {
      if (!salUltimaBusqueda) return;
      if (!confirm('¿Quitar este logro al usuario?')) return;
      try {
        const res = await fetch(`/api/admin?action=logros_admin_quitar&target_id=${salUltimaBusqueda}&codigo=${codigo}`, {
          method: 'DELETE',
        });
        if (!res.ok) { mostrarToast('Error al quitar el logro.', true); return; }
        mostrarToast('Logro quitado.');
        salBuscarUsuario();
      } catch (e) {
        mostrarToast('Error de conexión.', true);
      }
    }
