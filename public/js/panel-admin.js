    // ── PANEL ADMIN: funciones ────────────────────────────────────────────────
    async function paCargarAdmins() {
      if (!currentUser || currentUser.id !== SUPER_ADMIN_ID) return;
      const loading = document.getElementById('pa-loading');
      const lista   = document.getElementById('pa-lista');
      const contador = document.getElementById('pa-contador');
      const formWrap = document.getElementById('pa-form-wrap');

      loading.style.display = 'flex';
      lista.innerHTML = '';

      try {
        const r = await fetch(`/api/admin?action=listar&discord_id=${currentUser.id}`);
        const data = await r.json();
        loading.style.display = 'none';

        if (!r.ok) { lista.innerHTML = `<p style="color:#f87171;">${data.error}</p>`; return; }

        const admins = data.admins;
        const extras = admins.filter(a => a.discord_id !== SUPER_ADMIN_ID).length;
        contador.textContent = `${extras + 1}/5`;

        // Deshabilitar formulario si se llegó al límite
        formWrap.style.opacity = extras >= 4 ? '0.5' : '1';
        formWrap.style.pointerEvents = extras >= 4 ? 'none' : 'auto';

        admins.forEach(admin => {
          const esSuperAdmin = admin.discord_id === SUPER_ADMIN_ID;
          const div = document.createElement('div');
          div.style.cssText = 'display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:14px 16px;';
          div.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:3px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:14px;color:#fff;font-weight:500;">${escHtml(admin.nombre || 'Sin nombre')}</span>
                ${esSuperAdmin ? '<span style="font-size:10px;background:rgba(220,38,38,0.3);color:#fca5a5;padding:2px 8px;border-radius:20px;font-weight:600;">SUPER ADMIN</span>' : '<span style="font-size:10px;background:rgba(168,85,247,0.25);color:#d8b4fe;padding:2px 8px;border-radius:20px;">ADMIN</span>'}
              </div>
              <span style="font-size:11px;color:#6b7280;font-family:monospace;">${escHtml(admin.discord_id)}</span>
            </div>
            ${esSuperAdmin ? '' : `<button onclick="paEliminarAdmin('${escHtml(admin.discord_id)}')" style="background:rgba(220,38,38,0.15);border:1px solid rgba(220,38,38,0.3);border-radius:8px;padding:7px 14px;color:#f87171;font-size:12px;cursor:pointer;">Eliminar</button>`}
          `;
          lista.appendChild(div);
        });

        if (admins.length === 0) {
          lista.innerHTML = '<p style="color:#6b7280;font-size:13px;">No hay admins registrados.</p>';
        }
      } catch {
        loading.style.display = 'none';
        lista.innerHTML = '<p style="color:#f87171;">Error al cargar admins.</p>';
      }
    }

    async function paAgregarAdmin() {
      if (!currentUser || currentUser.id !== SUPER_ADMIN_ID) return;
      const targetId = document.getElementById('pa-input-id').value.trim();
      const nombre   = document.getElementById('pa-input-nombre').value.trim();
      const msg      = document.getElementById('pa-msg');

      if (!targetId) { msg.style.color = '#f87171'; msg.textContent = 'Ingresa un Discord ID.'; return; }

      msg.style.color = '#9ca3af'; msg.textContent = 'Agregando...';

      try {
        const r = await fetch('/api/admin?action=agregar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ discord_id: currentUser.id, target_id: targetId, nombre: nombre || null })
        });
        const data = await r.json();
        if (!r.ok) {
          msg.style.color = '#f87171'; msg.textContent = data.error;
          return;
        }
        msg.style.color = '#4ade80'; msg.textContent = '✓ Admin agregado correctamente.';
        document.getElementById('pa-input-id').value = '';
        document.getElementById('pa-input-nombre').value = '';
        paCargarAdmins();
      } catch {
        msg.style.color = '#f87171'; msg.textContent = 'Error de conexión.';
      }
    }

    async function paEliminarAdmin(targetId) {
      if (!currentUser || currentUser.id !== SUPER_ADMIN_ID) return;
      if (!confirm('¿Eliminar este admin?')) return;

      try {
        const r = await fetch(`/api/admin?action=eliminar&discord_id=${currentUser.id}&target_id=${targetId}`, {
          method: 'DELETE'
        });
        const data = await r.json();
        if (!r.ok) { toast.err(data.error || 'Error desconocido'); return; }
        paCargarAdmins();
      } catch {
        toast.err('Error al eliminar admin.');
      }
    }


    // ── PANEL ADMIN: enviar notificaciones ─────────────────────────────────────
    let pnModo = 'todos';

    function pnSetModo(modo) {
      pnModo = modo;
      const btnTodos = document.getElementById('pn-btn-todos');
      const btnEspecificos = document.getElementById('pn-btn-especificos');
      const inputIds = document.getElementById('pn-input-ids');
      if (!btnTodos || !btnEspecificos || !inputIds) return;

      if (modo === 'todos') {
        btnTodos.style.background = 'rgba(99,102,241,0.25)';
        btnTodos.style.borderColor = 'rgba(99,102,241,0.5)';
        btnTodos.style.color = '#fff';
        btnEspecificos.style.background = 'rgba(255,255,255,0.05)';
        btnEspecificos.style.borderColor = 'rgba(255,255,255,0.12)';
        btnEspecificos.style.color = '#9ca3af';
        inputIds.style.display = 'none';
      } else {
        btnEspecificos.style.background = 'rgba(99,102,241,0.25)';
        btnEspecificos.style.borderColor = 'rgba(99,102,241,0.5)';
        btnEspecificos.style.color = '#fff';
        btnTodos.style.background = 'rgba(255,255,255,0.05)';
        btnTodos.style.borderColor = 'rgba(255,255,255,0.12)';
        btnTodos.style.color = '#9ca3af';
        inputIds.style.display = 'block';
      }
    }

    async function pnEnviarNotificacion() {
      const titulo  = document.getElementById('pn-input-titulo').value.trim();
      const detalle = document.getElementById('pn-input-detalle').value.trim();
      const msg     = document.getElementById('pn-msg');

      if (!titulo) { msg.style.color = '#f87171'; msg.textContent = 'Ingresa un título.'; return; }

      let destinatarios = 'todos';
      if (pnModo === 'especificos') {
        const raw = document.getElementById('pn-input-ids').value.trim();
        const ids = raw.split(',').map(s => s.trim()).filter(Boolean);
        if (ids.length === 0) { msg.style.color = '#f87171'; msg.textContent = 'Ingresa al menos un Discord ID.'; return; }
        destinatarios = ids;
      }

      msg.style.color = '#9ca3af'; msg.textContent = 'Enviando...';

      try {
        const r = await fetch('/api/notificaciones?action=enviar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ titulo, detalle, destinatarios })
        });
        const data = await r.json();
        if (!r.ok) {
          msg.style.color = '#f87171'; msg.textContent = data.error || 'Error desconocido.';
          return;
        }
        msg.style.color = '#4ade80';
        msg.textContent = destinatarios === 'todos'
          ? '✓ Notificación enviada a todos los usuarios.'
          : `✓ Notificación enviada a ${data.enviadoA} usuario(s).`;
        document.getElementById('pn-input-titulo').value = '';
        document.getElementById('pn-input-detalle').value = '';
        document.getElementById('pn-input-ids').value = '';
      } catch {
        msg.style.color = '#f87171'; msg.textContent = 'Error de conexión.';
      }
    }


    // ══════════════════════════════════════════════════════════════════════

    // ── Gestión de Staff ─────────────────────────────────────────────────────
    // Mismo patrón que la Gestión de Policías Virtuales (comisaria.js), pero
    // para el rol "staff": solo da acceso al Panel Staff, nunca al Panel
    // Admin. Disponible para cualquier admin (no solo el super admin).
    async function psCargarStaff() {
      const q       = document.getElementById('ps-buscar-q')?.value?.trim() || '';
      const loading = document.getElementById('ps-loading');
      const lista   = document.getElementById('ps-lista');
      if (!loading || !lista) return;
      loading.style.display = 'flex'; lista.innerHTML = '';
      try {
        const url = `/api/admin?action=staff_admin_listar${q ? `&q=${encodeURIComponent(q)}` : ''}`;
        const r    = await fetch(url);
        const data = await r.json();
        loading.style.display = 'none';
        if (!r.ok) { lista.innerHTML = `<p style="color:#f87171;font-size:13px;">${escHtml(data.error || 'Error al cargar.')}</p>`; return; }
        const staff = data.staff || [];
        if (staff.length === 0) {
          lista.innerHTML = '<p style="color:rgba(255,255,255,0.3);font-size:13px;padding:16px 0;">Sin staff autorizado.</p>';
          return;
        }
        staff.forEach(s => {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px;background:rgba(167,139,250,0.07);border:1px solid rgba(167,139,250,0.15);border-radius:10px;gap:12px;flex-wrap:wrap;';
          row.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:3px;">
              <b style="color:#a78bfa;">${escHtml(s.nombre || '—')}</b>
              <span style="font-size:12px;color:rgba(255,255,255,0.4);">ID: ${escHtml(s.discord_id)}</span>
              <span style="font-size:11px;color:rgba(255,255,255,0.25);">Autorizado por: ${escHtml(s.agregado_por_nombre || s.agregado_por_id)} · ${new Date(s.created_at).toLocaleDateString('es-CL', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
            </div>
            <button onclick="psRevocar('${escHtml(s.discord_id)}', this)" style="background:rgba(220,38,38,0.15);border:1px solid rgba(220,38,38,0.3);border-radius:7px;padding:6px 14px;color:#f87171;font-size:12px;cursor:pointer;flex-shrink:0;">Revocar</button>
          `;
          lista.appendChild(row);
        });
      } catch {
        loading.style.display = 'none';
        lista.innerHTML = '<p style="color:#f87171;font-size:13px;">Error al cargar.</p>';
      }
    }

    async function psAgregar() {
      const targetId = document.getElementById('ps-input-id')?.value?.trim();
      const nombre   = document.getElementById('ps-input-nombre')?.value?.trim();
      const msg      = document.getElementById('ps-msg');
      if (!msg) return;
      if (!targetId) { msg.style.color = '#f87171'; msg.textContent = 'Ingresa un Discord ID.'; return; }
      msg.style.color = '#9ca3af'; msg.textContent = 'Autorizando...';
      try {
        const r = await fetch('/api/admin?action=staff_admin_agregar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target_id: targetId, nombre: nombre || null })
        });
        const data = await r.json();
        if (!r.ok) { msg.style.color = '#f87171'; msg.textContent = data.error || 'Error.'; return; }
        msg.style.color = '#4ade80'; msg.textContent = '✓ Staff autorizado.';
        document.getElementById('ps-input-id').value = '';
        document.getElementById('ps-input-nombre').value = '';
        psCargarStaff();
      } catch { msg.style.color = '#f87171'; msg.textContent = 'Error de conexión.'; }
    }

    async function psRevocar(targetId, btn) {
      if (!confirm('¿Revocar el acceso de este miembro del Staff?')) return;
      btn.disabled = true; btn.textContent = '...';
      try {
        const r = await fetch(`/api/admin?action=staff_admin_eliminar&target_id=${encodeURIComponent(targetId)}`, { method: 'DELETE' });
        const data = await r.json();
        if (!r.ok) { alert(data.error || 'Error.'); btn.disabled = false; btn.textContent = 'Revocar'; return; }
        psCargarStaff();
      } catch { alert('Error de conexión.'); btn.disabled = false; btn.textContent = 'Revocar'; }
    }
