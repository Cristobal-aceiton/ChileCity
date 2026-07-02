    // ══════════════════════════════════════════════════════════════════════════
    // LOGROS
    // ══════════════════════════════════════════════════════════════════════════

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
          <div class="logro-icono">${l.icono}</div>
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
              <div style="font-size:22px;flex-shrink:0;">${l.icono}</div>
              <div class="ur-info">
                <div class="ur-nombre">${escHtml(l.nombre)}</div>
                <div class="ur-rut">${escHtml(l.descripcion)}</div>
              </div>
              <div class="ur-acciones">
                ${l.obtenido
                  ? `<span style="font-size:11px;color:#4ade80;font-weight:700;margin-right:4px;">✓ Obtenido</span>
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
              <div style="font-size:22px;flex-shrink:0;">${l.icono}</div>
              <div class="ur-info">
                <div class="ur-nombre">${escHtml(l.nombre)}</div>
                <div class="ur-rut">${escHtml(l.descripcion)}</div>
              </div>
              <div class="ur-acciones">
                ${l.obtenido
                  ? `<span style="font-size:11px;color:#4ade80;font-weight:700;margin-right:4px;">✓ Obtenido</span>
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
