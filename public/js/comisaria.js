    // COMISARÍA VIRTUAL
    // ══════════════════════════════════════════════════════════════════════

    let cvEsPolicia = false;
    let cvTabsPoliciaListas = false;

    // Tabs del Panel Policial (solo policías)
    const CV_TABS_POLICIA = [
      { id: 'agregar-multa',  label: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Agregar Multa' },
      { id: 'bd-multas',      label: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg> BD Multas' },
      { id: 'agregar-antec',  label: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Agregar Antecedente' },
      { id: 'bd-antec',       label: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg> BD Antecedentes' },
      { id: 'bd-denuncias',   label: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg> BD Denuncias' },
      { id: 'vehiculos',      label: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13l1.6-4.6A2 2 0 0 1 6.4 7h11.2a2 2 0 0 1 1.9 1.4L21 13"/><rect x="2.5" y="13" width="19" height="5" rx="1.5"/><circle cx="7" cy="18.4" r="1.5"/><circle cx="17" cy="18.4" r="1.5"/></svg> Vehículos' },
      { id: 'logs',           label: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Logs' },
    ];

    // ── Navegación entre vistas principales (hero / trámites / panel) ────
    function cvSetVista(id) {
      document.querySelectorAll('#cv-contenido .cv-vista').forEach(v => v.classList.remove('cv-vista-activa'));
      const vista = document.getElementById(`cv-vista-${id}`);
      if (vista) vista.classList.add('cv-vista-activa');
      window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });

      if (id === 'mis-multas')       cvCargarMisMultas();
      if (id === 'mis-antecedentes') cvCargarMisAntecedentes();
      if (id === 'denuncia')         document.getElementById('den-fecha').value = new Date().toLocaleDateString('es-CL');
      if (id === 'panel')            cvAbrirPanelInterno();
    }

    // Botón "Panel Policial" de la barra superior
    function cvAbrirPanel() {
      if (!cvEsPolicia) return;
      cvSetVista('panel');
    }

    function cvAbrirPanelInterno() {
      if (!cvTabsPoliciaListas) {
        cvConstruirTabsPolicia();
        cvTabsPoliciaListas = true;
      }
    }

    // ── Tabs internos del Panel Policial ─────────────────────────────────
    function cvSetTab(id) {
      document.querySelectorAll('#cv-tabs .admin-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('#cv-vista-panel .admin-seccion').forEach(s => s.classList.remove('visible'));
      const btn = document.querySelector(`#cv-tabs [data-tab="${id}"]`);
      if (btn) btn.classList.add('active');
      const sec = document.getElementById(`cv-tab-${id}`);
      if (sec) sec.classList.add('visible');

      // Auto-cargar al cambiar de tab
      if (id === 'bd-multas')        cvCargarBDMultas();
      if (id === 'bd-antec')         cvCargarBDAntecedentes();
      if (id === 'bd-denuncias')     cvCargarBDDenuncias();
      if (id === 'logs')             cvCargarLogs();
    }

    function cvConstruirTabsPolicia() {
      const container = document.getElementById('cv-tabs');
      container.innerHTML = '';
      CV_TABS_POLICIA.forEach((t, i) => {
        const btn = document.createElement('button');
        btn.className = 'admin-tab' + (i === 0 ? ' active' : '');
        btn.dataset.tab = t.id;
        btn.innerHTML = t.label;
        btn.onclick = () => cvSetTab(t.id);
        container.appendChild(btn);
      });
      cvSetTab(CV_TABS_POLICIA[0].id);
    }

    async function abrirComisaria() {
      abrirSeccion('comisaria-screen');
      // Resetear estado
      document.getElementById('cv-acceso-loading').style.display = 'flex';
      document.getElementById('cv-contenido').style.display = 'none';
      const barra = document.getElementById('cv-barra-progreso');
      barra.style.width = '0%';
      cvTabsPoliciaListas = false;

      // Animación barra progreso
      setTimeout(() => { barra.style.width = '60%'; }, 100);
      setTimeout(() => { barra.style.width = '85%'; }, 600);

      try {
        const r = await fetch('/api/comisaria?action=verificar');
        const data = await r.json();
        cvEsPolicia = data.esPolicia || false;
      } catch {
        cvEsPolicia = false;
      }

      barra.style.width = '100%';
      await new Promise(res => setTimeout(res, 500));

      document.getElementById('cv-acceso-loading').style.display = 'none';
      const contenido = document.getElementById('cv-contenido');
      contenido.style.display = 'flex';

      const btnPanel = document.getElementById('cv-btn-panel');
      if (btnPanel) btnPanel.style.display = cvEsPolicia ? 'flex' : 'none';

      cvSetVista('landing');
    }

    // ── Mis Multas ─────────────────────────────────────────────────────
    async function cvCargarMisMultas() {
      const loading = document.getElementById('cv-mis-multas-loading');
      const lista   = document.getElementById('cv-mis-multas-lista');
      loading.style.display = 'flex';
      lista.innerHTML = '';
      try {
        const r    = await fetch('/api/comisaria?action=misMultas');
        const data = await r.json();
        loading.style.display = 'none';
        if (!data.multas || data.multas.length === 0) {
          lista.innerHTML = '<p style="color:rgba(11,61,36,0.4);font-size:14px;text-align:center;padding:32px 0;">No tienes multas registradas.</p>';
          return;
        }
        data.multas.forEach(m => {
          const card = document.createElement('div');
          card.style.cssText = 'background:#fff;border:1px solid rgba(11,61,36,0.1);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:8px;box-shadow:0 2px 10px rgba(11,61,36,0.05);';
          const estadoColor = m.estado === 'pagada' ? '#15803d' : '#b8860b';
          card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
              <span style="font-weight:700;color:#0b3d24;font-size:15px;">${escHtml(m.motivo)}</span>
              <span style="background:rgba(11,61,36,0.08);border-radius:99px;padding:3px 12px;font-size:12px;font-weight:600;color:${estadoColor};">${m.estado.toUpperCase()}</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;font-size:13px;color:rgba(11,61,36,0.6);">
              <span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 9.5a1.5 1.5 0 011.5-1.5h3M9 14.5a1.5 1.5 0 001.5 1.5h3a1.5 1.5 0 000-3h-3a1.5 1.5 0 010-3M12 6v2M12 16v2"/></svg> Valor: <b style="color:#b8860b;">$${Number(m.valor).toLocaleString('es-CL')}</b></span>
              <span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> Emitida: ${cvFecha(m.created_at)}</span>
              <span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M5 3L2 6M19 3l3 3"/></svg> Vence: ${m.fecha_limite}</span>
              <span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l7 3v6c0 5-3 8.5-7 10-4-1.5-7-5-7-10V5l7-3z"/><path d="M9 12l2 2 4-4"/></svg> ${escHtml(m.funcionario_nombre || m.funcionario_id)}</span>
            </div>
            <div style="font-size:11px;color:rgba(11,61,36,0.35);">ID Funcionario: ${escHtml(m.funcionario_id)}</div>
          `;
          lista.appendChild(card);
        });
      } catch {
        loading.style.display = 'none';
        lista.innerHTML = '<p style="color:#c0392b;font-size:13px;">Error al cargar multas.</p>';
      }
    }

    // ── Mis Antecedentes ───────────────────────────────────────────────
    async function cvCargarMisAntecedentes() {
      const loading = document.getElementById('cv-mis-antec-loading');
      const lista   = document.getElementById('cv-mis-antec-lista');
      loading.style.display = 'flex';
      lista.innerHTML = '';
      try {
        const r    = await fetch('/api/comisaria?action=misAntecedentes');
        const data = await r.json();
        loading.style.display = 'none';
        if (!data.antecedentes || data.antecedentes.length === 0) {
          lista.innerHTML = '<p style="color:rgba(11,61,36,0.4);font-size:14px;text-align:center;padding:32px 0;">No existen antecedentes registrados.</p>';
          return;
        }
        data.antecedentes.forEach(a => {
          const card = document.createElement('div');
          card.style.cssText = 'background:#fff;border:1px solid rgba(11,61,36,0.1);border-radius:12px;padding:16px;display:flex;gap:16px;box-shadow:0 2px 10px rgba(11,61,36,0.05);';
          const fotoHtml = a.foto_url
            ? `<img src="${escHtml(a.foto_url)}" style="width:72px;height:72px;object-fit:cover;border-radius:10px;border:1px solid rgba(11,61,36,0.12);flex-shrink:0;" loading="lazy" onerror="this.style.display='none'">`
            : `<div style="width:72px;height:72px;background:rgba(11,61,36,0.06);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:28px;color:rgba(11,61,36,0.45);"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg></div>`;
          card.innerHTML = `
            ${fotoHtml}
            <div style="display:flex;flex-direction:column;gap:6px;flex:1;">
              <span style="font-weight:700;color:#c0392b;font-size:15px;">${escHtml(a.motivo)}</span>
              <div style="font-size:13px;color:rgba(11,61,36,0.6);display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;">
                <span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> Artículos: ${escHtml(a.articulos || '—')}</span>
                <span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M9 2h6"/></svg> Cárcel: ${escHtml(a.tiempo_carcel || '—')}</span>
                <span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> Fecha: ${cvFecha(a.created_at)}</span>
                <span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l7 3v6c0 5-3 8.5-7 10-4-1.5-7-5-7-10V5l7-3z"/><path d="M9 12l2 2 4-4"/></svg> ${escHtml(a.funcionario_nombre || a.funcionario_id)}</span>
              </div>
              <div style="font-size:11px;color:rgba(11,61,36,0.35);">ID Funcionario: ${escHtml(a.funcionario_id)}</div>
            </div>
          `;
          lista.appendChild(card);
        });
      } catch {
        loading.style.display = 'none';
        lista.innerHTML = '<p style="color:#c0392b;font-size:13px;">Error al cargar antecedentes.</p>';
      }
    }

    // ── Enviar Denuncia ────────────────────────────────────────────────
    async function cvEnviarDenuncia() {
      const motivo      = document.getElementById('den-motivo').value.trim();
      const descripcion = document.getElementById('den-descripcion').value.trim();
      const evidencia   = document.getElementById('den-evidencia').value.trim();
      const errEl       = document.getElementById('den-error');
      const okEl        = document.getElementById('den-ok');
      errEl.style.display = 'none';
      okEl.style.display  = 'none';
      if (!motivo || !descripcion) { errEl.textContent = 'El motivo y la descripción son obligatorios.'; errEl.style.display = 'block'; return; }
      try {
        const r = await fetch('/api/comisaria?action=crearDenuncia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ motivo, descripcion, evidencia_url: evidencia || null })
        });
        const data = await r.json();
        if (!r.ok) { errEl.textContent = data.error || 'Error al enviar denuncia.'; errEl.style.display = 'block'; return; }
        okEl.textContent = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Denuncia enviada correctamente.';
        okEl.style.display = 'block';
        document.getElementById('den-motivo').value = '';
        document.getElementById('den-descripcion').value = '';
        document.getElementById('den-evidencia').value = '';
      } catch {
        errEl.textContent = 'Error de conexión.';
        errEl.style.display = 'block';
      }
    }

    // ── Buscar Ciudadano (formularios policía) ─────────────────────────
    async function cvBuscarCiudadano(ctx) {
      const inputId = ctx === 'multa' ? 'multa-buscar' : 'antec-buscar';
      const resId   = ctx === 'multa' ? 'multa-buscar-resultados' : 'antec-buscar-resultados';
      const q = document.getElementById(inputId).value.trim();
      if (!q) return;
      const resDiv = document.getElementById(resId);
      resDiv.style.display = 'block';
      resDiv.innerHTML = '<p style="padding:10px 14px;color:rgba(255,255,255,0.4);font-size:13px;">Buscando...</p>';
      try {
        const r    = await fetch(`/api/comisaria?action=buscarCiudadano&q=${encodeURIComponent(q)}`);
        const data = await r.json();
        if (!data.ciudadanos || data.ciudadanos.length === 0) {
          resDiv.innerHTML = '<p style="padding:10px 14px;color:rgba(255,255,255,0.3);font-size:13px;">Sin resultados.</p>';
          return;
        }
        resDiv.innerHTML = '';
        data.ciudadanos.forEach(c => {
          const row = document.createElement('div');
          row.style.cssText = 'padding:10px 14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.06);font-size:13px;color:#fff;';
          row.innerHTML = `<b>${escHtml(c.nombre_completo)}</b> <span style="color:rgba(255,255,255,0.4);">DNI: ${escHtml(c.dni || '—')}</span>`;
          row.onmouseenter = () => { row.style.background = 'rgba(255,255,255,0.07)'; };
          row.onmouseleave = () => { row.style.background = ''; };
          row.onclick = () => {
            if (ctx === 'multa') {
              document.getElementById('multa-ciudadano-nombre').value = c.nombre_completo + (c.dni ? ` (${c.dni})` : '');
              document.getElementById('multa-ciudadano-id').value  = c.discord_id;
              document.getElementById('multa-ciudadano-dni').value = c.dni || '';
            } else {
              document.getElementById('antec-ciudadano-nombre').value = c.nombre_completo + (c.dni ? ` (${c.dni})` : '');
              document.getElementById('antec-ciudadano-id').value  = c.discord_id;
              document.getElementById('antec-ciudadano-dni').value = c.dni || '';
            }
            resDiv.style.display = 'none';
          };
          resDiv.appendChild(row);
        });
      } catch {
        resDiv.innerHTML = '<p style="padding:10px 14px;color:#f87171;font-size:13px;">Error al buscar.</p>';
      }
    }

    // ── Agregar Multa ──────────────────────────────────────────────────
    async function cvAgregarMulta() {
      const ciudadano_id     = document.getElementById('multa-ciudadano-id').value.trim();
      const ciudadano_nombre = document.getElementById('multa-ciudadano-nombre').value.trim();
      const ciudadano_dni    = document.getElementById('multa-ciudadano-dni').value.trim();
      const motivo           = document.getElementById('multa-motivo').value.trim();
      const valor            = document.getElementById('multa-valor').value.trim();
      const fecha_limite     = document.getElementById('multa-fecha-limite').value;
      const errEl = document.getElementById('multa-error');
      const okEl  = document.getElementById('multa-ok');
      errEl.style.display = 'none'; okEl.style.display = 'none';
      if (!ciudadano_id) { errEl.textContent = 'Selecciona un ciudadano.'; errEl.style.display = 'block'; return; }
      if (!motivo || !valor || !fecha_limite) { errEl.textContent = 'Completa todos los campos.'; errEl.style.display = 'block'; return; }
      try {
        const r = await fetch('/api/comisaria?action=agregarMulta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ciudadano_id, ciudadano_nombre, ciudadano_dni, motivo, valor: Number(valor), fecha_limite })
        });
        const data = await r.json();
        if (!r.ok) { errEl.textContent = data.error || 'Error.'; errEl.style.display = 'block'; return; }
        const pagada = data.multa?.estado === 'pagada';
        okEl.textContent = pagada ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Multa registrada y cobrada automáticamente.' : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Multa registrada. Estado: Pendiente.';
        okEl.style.display = 'block';
        document.getElementById('multa-ciudadano-id').value = '';
        document.getElementById('multa-ciudadano-nombre').value = '';
        document.getElementById('multa-ciudadano-dni').value = '';
        document.getElementById('multa-motivo').value = '';
        document.getElementById('multa-valor').value = '';
        document.getElementById('multa-fecha-limite').value = '';
      } catch { errEl.textContent = 'Error de conexión.'; errEl.style.display = 'block'; }
    }

    // ── BD Multas ──────────────────────────────────────────────────────
    async function cvCargarBDMultas() {
      const q       = document.getElementById('bd-multas-q').value.trim();
      const loading = document.getElementById('cv-bd-multas-loading');
      const lista   = document.getElementById('cv-bd-multas-lista');
      loading.style.display = 'flex'; lista.innerHTML = '';
      try {
        const r    = await fetch(`/api/comisaria?action=todasMultas${q ? '&q=' + encodeURIComponent(q) : ''}`);
        const data = await r.json();
        loading.style.display = 'none';
        if (!data.multas || data.multas.length === 0) {
          lista.innerHTML = '<p style="color:rgba(255,255,255,0.3);font-size:13px;text-align:center;padding:24px;">Sin multas registradas.</p>';
          return;
        }
        data.multas.forEach(m => {
          const card = document.createElement('div');
          card.style.cssText = 'background:rgba(30,138,76,0.05);border:1px solid rgba(63,182,115,0.16);border-radius:10px;padding:14px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;';
          const estadoColor = m.estado === 'pagada' ? '#4ade80' : '#fbbf24';
          card.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:5px;flex:1;min-width:200px;">
              <b style="color:#fff;">${escHtml(m.ciudadano_nombre || m.ciudadano_id)}</b>
              <span style="font-size:12px;color:rgba(255,255,255,0.4);">DNI: ${escHtml(m.ciudadano_dni || '—')} · ID: ${escHtml(m.ciudadano_id)}</span>
              <span style="font-size:13px;color:rgba(255,255,255,0.7);">${escHtml(m.motivo)}</span>
              <span style="font-size:12px;color:rgba(255,255,255,0.35);"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l7 3v6c0 5-3 8.5-7 10-4-1.5-7-5-7-10V5l7-3z"/><path d="M9 12l2 2 4-4"/></svg> ${escHtml(m.funcionario_nombre || m.funcionario_id)} · <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> ${cvFecha(m.created_at)}</span>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
              <span style="color:${estadoColor};font-weight:700;font-size:13px;">${m.estado.toUpperCase()}</span>
              <span style="color:#fbbf24;font-weight:700;">$${Number(m.valor).toLocaleString('es-CL')}</span>
              <button onclick="cvEliminarMulta(${m.id}, this)" style="background:rgba(220,38,38,0.15);border:1px solid rgba(220,38,38,0.3);border-radius:7px;padding:5px 12px;color:#f87171;font-size:12px;cursor:pointer;">Eliminar</button>
            </div>
          `;
          lista.appendChild(card);
        });
      } catch {
        loading.style.display = 'none';
        lista.innerHTML = '<p style="color:#f87171;font-size:13px;">Error al cargar.</p>';
      }
    }

    async function cvEliminarMulta(id, btn) {
      if (!confirm('¿Eliminar esta multa? Se registrará en el log.')) return;
      btn.disabled = true; btn.textContent = '...';
      try {
        const r = await fetch(`/api/comisaria?action=eliminarMulta&id=${id}`, { method: 'DELETE' });
        const data = await r.json();
        if (!r.ok) { alert(data.error || 'Error.'); btn.disabled = false; btn.textContent = 'Eliminar'; return; }
        cvCargarBDMultas();
      } catch { alert('Error de conexión.'); btn.disabled = false; btn.textContent = 'Eliminar'; }
    }

    // ── Agregar Antecedente ────────────────────────────────────────────
    async function cvAgregarAntecedente() {
      const ciudadano_id     = document.getElementById('antec-ciudadano-id').value.trim();
      const ciudadano_nombre = document.getElementById('antec-ciudadano-nombre').value.trim();
      const ciudadano_dni    = document.getElementById('antec-ciudadano-dni').value.trim();
      const foto_url         = document.getElementById('antec-foto').value.trim();
      const motivo           = document.getElementById('antec-motivo').value.trim();
      const articulos        = document.getElementById('antec-articulos').value.trim();
      const tiempo_carcel    = document.getElementById('antec-tiempo-carcel').value.trim();
      const errEl = document.getElementById('antec-error');
      const okEl  = document.getElementById('antec-ok');
      errEl.style.display = 'none'; okEl.style.display = 'none';
      if (!ciudadano_id) { errEl.textContent = 'Selecciona un ciudadano.'; errEl.style.display = 'block'; return; }
      if (!motivo) { errEl.textContent = 'El motivo es obligatorio.'; errEl.style.display = 'block'; return; }
      try {
        const r = await fetch('/api/comisaria?action=agregarAntecedente', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ciudadano_id, ciudadano_nombre, ciudadano_dni, foto_url: foto_url || null, motivo, articulos: articulos || null, tiempo_carcel: tiempo_carcel || null })
        });
        const data = await r.json();
        if (!r.ok) { errEl.textContent = data.error || 'Error.'; errEl.style.display = 'block'; return; }
        okEl.textContent = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Antecedente registrado correctamente.';
        okEl.style.display = 'block';
        ['antec-ciudadano-id','antec-ciudadano-nombre','antec-ciudadano-dni','antec-foto','antec-motivo','antec-articulos','antec-tiempo-carcel'].forEach(id => { document.getElementById(id).value = ''; });
      } catch { errEl.textContent = 'Error de conexión.'; errEl.style.display = 'block'; }
    }

    // ── BD Antecedentes ────────────────────────────────────────────────
    async function cvCargarBDAntecedentes() {
      const q       = document.getElementById('bd-antec-q').value.trim();
      const loading = document.getElementById('cv-bd-antec-loading');
      const lista   = document.getElementById('cv-bd-antec-lista');
      loading.style.display = 'flex'; lista.innerHTML = '';
      try {
        const r    = await fetch(`/api/comisaria?action=todosAntecedentes${q ? '&q=' + encodeURIComponent(q) : ''}`);
        const data = await r.json();
        loading.style.display = 'none';
        if (!data.antecedentes || data.antecedentes.length === 0) {
          lista.innerHTML = '<p style="color:rgba(255,255,255,0.3);font-size:13px;text-align:center;padding:24px;">Sin antecedentes registrados.</p>';
          return;
        }
        data.antecedentes.forEach(a => {
          const card = document.createElement('div');
          card.style.cssText = 'background:rgba(30,138,76,0.05);border:1px solid rgba(63,182,115,0.16);border-radius:10px;padding:14px;display:flex;gap:14px;flex-wrap:wrap;';
          const fotoHtml = a.foto_url
            ? `<img src="${escHtml(a.foto_url)}" style="width:56px;height:56px;object-fit:cover;border-radius:8px;flex-shrink:0;" loading="lazy" onerror="this.style.display='none'">`
            : '';
          card.innerHTML = `
            ${fotoHtml}
            <div style="flex:1;min-width:180px;display:flex;flex-direction:column;gap:5px;">
              <b style="color:#fff;">${escHtml(a.ciudadano_nombre || a.ciudadano_id)}</b>
              <span style="font-size:12px;color:rgba(255,255,255,0.4);">DNI: ${escHtml(a.ciudadano_dni || '—')} · ID: ${escHtml(a.ciudadano_id)}</span>
              <span style="font-size:13px;color:#f87171;">${escHtml(a.motivo)}</span>
              <span style="font-size:12px;color:rgba(255,255,255,0.4);"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> ${escHtml(a.articulos || '—')} · <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M9 2h6"/></svg> ${escHtml(a.tiempo_carcel || '—')}</span>
              <span style="font-size:12px;color:rgba(255,255,255,0.3);"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l7 3v6c0 5-3 8.5-7 10-4-1.5-7-5-7-10V5l7-3z"/><path d="M9 12l2 2 4-4"/></svg> ${escHtml(a.funcionario_nombre || a.funcionario_id)} · <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> ${cvFecha(a.created_at)}</span>
            </div>
            <div style="display:flex;align-items:flex-start;">
              <button onclick="cvEliminarAntecedente(${a.id}, this)" style="background:rgba(220,38,38,0.15);border:1px solid rgba(220,38,38,0.3);border-radius:7px;padding:5px 12px;color:#f87171;font-size:12px;cursor:pointer;">Eliminar</button>
            </div>
          `;
          lista.appendChild(card);
        });
      } catch {
        loading.style.display = 'none';
        lista.innerHTML = '<p style="color:#f87171;font-size:13px;">Error al cargar.</p>';
      }
    }

    async function cvEliminarAntecedente(id, btn) {
      if (!confirm('¿Eliminar este antecedente? Se registrará en el log.')) return;
      btn.disabled = true; btn.textContent = '...';
      try {
        const r = await fetch(`/api/comisaria?action=eliminarAntecedente&id=${id}`, { method: 'DELETE' });
        const data = await r.json();
        if (!r.ok) { alert(data.error || 'Error.'); btn.disabled = false; btn.textContent = 'Eliminar'; return; }
        cvCargarBDAntecedentes();
      } catch { alert('Error de conexión.'); btn.disabled = false; btn.textContent = 'Eliminar'; }
    }

    // ── BD Denuncias ───────────────────────────────────────────────────
    async function cvCargarBDDenuncias() {
      const q       = document.getElementById('bd-den-q').value.trim();
      const loading = document.getElementById('cv-bd-den-loading');
      const lista   = document.getElementById('cv-bd-den-lista');
      loading.style.display = 'flex'; lista.innerHTML = '';
      try {
        const r    = await fetch(`/api/comisaria?action=todasDenuncias${q ? '&q=' + encodeURIComponent(q) : ''}`);
        const data = await r.json();
        loading.style.display = 'none';
        if (!data.denuncias || data.denuncias.length === 0) {
          lista.innerHTML = '<p style="color:rgba(255,255,255,0.3);font-size:13px;text-align:center;padding:24px;">Sin denuncias registradas.</p>';
          return;
        }
        data.denuncias.forEach(d => {
          const card = document.createElement('div');
          card.style.cssText = 'background:rgba(30,138,76,0.05);border:1px solid rgba(63,182,115,0.16);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:8px;';
          card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
              <div>
                <b style="color:#fff;">${escHtml(d.motivo)}</b>
                <div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:2px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11v2a2 2 0 002 2h1l4 4V5L6 9H5a2 2 0 00-2 2z"/><path d="M15 8a4 4 0 010 8"/><path d="M18 5a8 8 0 010 14"/></svg> ${escHtml(d.denunciante_nombre || d.denunciante_id)} · ID: ${escHtml(d.denunciante_id)} · <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> ${cvFecha(d.created_at)}</div>
              </div>
              <button onclick="cvEliminarDenuncia(${d.id}, this)" style="background:rgba(220,38,38,0.15);border:1px solid rgba(220,38,38,0.3);border-radius:7px;padding:5px 12px;color:#f87171;font-size:12px;cursor:pointer;flex-shrink:0;">Eliminar</button>
            </div>
            <p style="font-size:13px;color:rgba(255,255,255,0.65);line-height:1.5;">${escHtml(d.descripcion)}</p>
            ${d.evidencia_url ? `<a href="${escHtml(d.evidencia_url)}" target="_blank" style="color:#38bdf8;font-size:12px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 007.07 0l1.93-1.93a5 5 0 00-7.07-7.07L10.5 5.5"/><path d="M14 11a5 5 0 00-7.07 0L5 12.93a5 5 0 007.07 7.07L13.5 18.5"/></svg> Ver evidencia</a>` : ''}
          `;
          lista.appendChild(card);
        });
      } catch {
        loading.style.display = 'none';
        lista.innerHTML = '<p style="color:#f87171;font-size:13px;">Error al cargar.</p>';
      }
    }

    async function cvEliminarDenuncia(id, btn) {
      if (!confirm('¿Eliminar esta denuncia? Se registrará en el log.')) return;
      btn.disabled = true; btn.textContent = '...';
      try {
        const r = await fetch(`/api/comisaria?action=eliminarDenuncia&id=${id}`, { method: 'DELETE' });
        const data = await r.json();
        if (!r.ok) { alert(data.error || 'Error.'); btn.disabled = false; btn.textContent = 'Eliminar'; return; }
        cvCargarBDDenuncias();
      } catch { alert('Error de conexión.'); btn.disabled = false; btn.textContent = 'Eliminar'; }
    }

    // ── Logs ───────────────────────────────────────────────────────────
    async function cvCargarLogs() {
      const q       = document.getElementById('cv-logs-q').value.trim();
      const loading = document.getElementById('cv-logs-loading');
      const lista   = document.getElementById('cv-logs-lista');
      loading.style.display = 'flex'; lista.innerHTML = '';
      try {
        const r    = await fetch(`/api/comisaria?action=logs${q ? '&q=' + encodeURIComponent(q) : ''}`);
        const data = await r.json();
        loading.style.display = 'none';
        if (!data.logs || data.logs.length === 0) {
          lista.innerHTML = '<p style="color:rgba(255,255,255,0.3);font-size:13px;text-align:center;padding:24px;">Sin logs registrados.</p>';
          return;
        }
        data.logs.forEach(l => {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);flex-wrap:wrap;';
          const accionColor = l.accion.includes('ELIMINAR') ? '#f87171' : l.accion.includes('REVOCAR') ? '#fbbf24' : '#4ade80';
          row.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:3px;flex:1;min-width:200px;">
              <span style="font-size:13px;font-weight:700;color:${accionColor};">${escHtml(l.accion)}</span>
              <span style="font-size:12px;color:rgba(255,255,255,0.55);">${escHtml(l.detalle || '')}</span>
              <span style="font-size:11px;color:rgba(255,255,255,0.25);"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1"/></svg> ${escHtml(l.usuario_nombre || l.usuario_id)} · ID: ${escHtml(l.usuario_id)}</span>
            </div>
            <span style="font-size:11px;color:rgba(255,255,255,0.3);white-space:nowrap;">${cvFecha(l.created_at)}</span>
          `;
          lista.appendChild(row);
        });
      } catch {
        loading.style.display = 'none';
        lista.innerHTML = '<p style="color:#f87171;font-size:13px;">Error al cargar logs.</p>';
      }
    }

    // Nota: la gestión de Policías Virtuales ya vive de forma estática dentro
    // de #panel-admin-screen (sección "Gestión de Policías Virtuales"), que
    // se carga automáticamente al abrir el Panel Admin vía abrirPanelAdmin()
    // en app.js. Ya no hace falta inyectar ni construir tabs dinámicamente.

    async function gpCargarPolicias() {
      const q       = document.getElementById('gp-buscar-q')?.value?.trim() || '';
      const loading = document.getElementById('gp-loading');
      const lista   = document.getElementById('gp-lista');
      if (!loading || !lista) return;
      loading.style.display = 'flex'; lista.innerHTML = '';
      try {
        const url = q
          ? `/api/comisaria?action=buscarPolicia&q=${encodeURIComponent(q)}`
          : '/api/comisaria?action=listarPolicias';
        const r    = await fetch(url);
        const data = await r.json();
        loading.style.display = 'none';
        const policias = data.policias || [];
        if (policias.length === 0) {
          lista.innerHTML = '<p style="color:rgba(255,255,255,0.3);font-size:13px;padding:16px 0;">Sin policías autorizados.</p>';
          return;
        }
        policias.forEach(p => {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px;background:rgba(14,165,233,0.07);border:1px solid rgba(14,165,233,0.15);border-radius:10px;gap:12px;flex-wrap:wrap;';
          row.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:3px;">
              <b style="color:#38bdf8;">${escHtml(p.nombre || '—')}</b>
              <span style="font-size:12px;color:rgba(255,255,255,0.4);">ID: ${escHtml(p.discord_id)}</span>
              <span style="font-size:11px;color:rgba(255,255,255,0.25);">Autorizado por: ${escHtml(p.autorizado_por_nombre || p.autorizado_por_id)} · ${cvFecha(p.created_at)}</span>
            </div>
            <button onclick="gpRevocar('${escHtml(p.discord_id)}', this)" style="background:rgba(220,38,38,0.15);border:1px solid rgba(220,38,38,0.3);border-radius:7px;padding:6px 14px;color:#f87171;font-size:12px;cursor:pointer;flex-shrink:0;">Revocar</button>
          `;
          lista.appendChild(row);
        });
      } catch {
        loading.style.display = 'none';
        lista.innerHTML = '<p style="color:#f87171;font-size:13px;">Error al cargar.</p>';
      }
    }

    async function gpAutorizar() {
      const targetId = document.getElementById('gp-input-id')?.value?.trim();
      const nombre   = document.getElementById('gp-input-nombre')?.value?.trim();
      const msg      = document.getElementById('gp-msg');
      if (!msg) return;
      if (!targetId) { msg.style.color = '#f87171'; msg.textContent = 'Ingresa un Discord ID.'; return; }
      msg.style.color = '#9ca3af'; msg.textContent = 'Autorizando...';
      try {
        const r = await fetch('/api/comisaria?action=autorizarPolicia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target_id: targetId, nombre: nombre || null })
        });
        const data = await r.json();
        if (!r.ok) { msg.style.color = '#f87171'; msg.textContent = data.error || 'Error.'; return; }
        msg.style.color = '#4ade80'; msg.textContent = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Policía Virtual autorizado.';
        document.getElementById('gp-input-id').value = '';
        document.getElementById('gp-input-nombre').value = '';
        gpCargarPolicias();
      } catch { msg.style.color = '#f87171'; msg.textContent = 'Error de conexión.'; }
    }

    async function gpRevocar(targetId, btn) {
      if (!confirm('¿Revocar los permisos de este Policía Virtual?')) return;
      btn.disabled = true; btn.textContent = '...';
      try {
        const r = await fetch(`/api/comisaria?action=revocarPolicia&target_id=${encodeURIComponent(targetId)}`, { method: 'DELETE' });
        const data = await r.json();
        if (!r.ok) { alert(data.error || 'Error.'); btn.disabled = false; btn.textContent = 'Revocar'; return; }
        gpCargarPolicias();
      } catch { alert('Error de conexión.'); btn.disabled = false; btn.textContent = 'Revocar'; }
    }

    // ── Mismas funciones, pero para la Gestión de Policías dentro del Panel
    // Staff (elementos con prefijo "sgp-" en vez de "gp-", para no chocar
    // con los del Panel Admin, que pueden coexistir en el DOM). Pegan a las
    // mismas rutas de /api/comisaria, que ahora aceptan tanto admins como
    // staff.
    async function sgpCargarPolicias() {
      const q       = document.getElementById('sgp-buscar-q')?.value?.trim() || '';
      const loading = document.getElementById('sgp-loading');
      const lista   = document.getElementById('sgp-lista');
      if (!loading || !lista) return;
      loading.style.display = 'flex'; lista.innerHTML = '';
      try {
        const url = q
          ? `/api/comisaria?action=buscarPolicia&q=${encodeURIComponent(q)}`
          : '/api/comisaria?action=listarPolicias';
        const r    = await fetch(url);
        const data = await r.json();
        loading.style.display = 'none';
        const policias = data.policias || [];
        if (policias.length === 0) {
          lista.innerHTML = '<p style="color:rgba(255,255,255,0.3);font-size:13px;padding:16px 0;">Sin policías autorizados.</p>';
          return;
        }
        policias.forEach(p => {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px;background:rgba(14,165,233,0.07);border:1px solid rgba(14,165,233,0.15);border-radius:10px;gap:12px;flex-wrap:wrap;';
          row.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:3px;">
              <b style="color:#38bdf8;">${escHtml(p.nombre || '—')}</b>
              <span style="font-size:12px;color:rgba(255,255,255,0.4);">ID: ${escHtml(p.discord_id)}</span>
              <span style="font-size:11px;color:rgba(255,255,255,0.25);">Autorizado por: ${escHtml(p.autorizado_por_nombre || p.autorizado_por_id)} · ${cvFecha(p.created_at)}</span>
            </div>
            <button onclick="sgpRevocar('${escHtml(p.discord_id)}', this)" style="background:rgba(220,38,38,0.15);border:1px solid rgba(220,38,38,0.3);border-radius:7px;padding:6px 14px;color:#f87171;font-size:12px;cursor:pointer;flex-shrink:0;">Revocar</button>
          `;
          lista.appendChild(row);
        });
      } catch {
        loading.style.display = 'none';
        lista.innerHTML = '<p style="color:#f87171;font-size:13px;">Error al cargar.</p>';
      }
    }

    async function sgpAutorizar() {
      const targetId = document.getElementById('sgp-input-id')?.value?.trim();
      const nombre   = document.getElementById('sgp-input-nombre')?.value?.trim();
      const msg      = document.getElementById('sgp-msg');
      if (!msg) return;
      if (!targetId) { msg.style.color = '#f87171'; msg.textContent = 'Ingresa un Discord ID.'; return; }
      msg.style.color = '#9ca3af'; msg.textContent = 'Autorizando...';
      try {
        const r = await fetch('/api/comisaria?action=autorizarPolicia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target_id: targetId, nombre: nombre || null })
        });
        const data = await r.json();
        if (!r.ok) { msg.style.color = '#f87171'; msg.textContent = data.error || 'Error.'; return; }
        msg.style.color = '#4ade80'; msg.textContent = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align:-2px;margin-right:1px" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Policía Virtual autorizado.';
        document.getElementById('sgp-input-id').value = '';
        document.getElementById('sgp-input-nombre').value = '';
        sgpCargarPolicias();
      } catch { msg.style.color = '#f87171'; msg.textContent = 'Error de conexión.'; }
    }

    async function sgpRevocar(targetId, btn) {
      if (!confirm('¿Revocar los permisos de este Policía Virtual?')) return;
      btn.disabled = true; btn.textContent = '...';
      try {
        const r = await fetch(`/api/comisaria?action=revocarPolicia&target_id=${encodeURIComponent(targetId)}`, { method: 'DELETE' });
        const data = await r.json();
        if (!r.ok) { alert(data.error || 'Error.'); btn.disabled = false; btn.textContent = 'Revocar'; return; }
        sgpCargarPolicias();
      } catch { alert('Error de conexión.'); btn.disabled = false; btn.textContent = 'Revocar'; }
    }

    // Helpers
    function cvFecha(iso) {
      if (!iso) return '—';
      return new Date(iso).toLocaleDateString('es-CL', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    }

