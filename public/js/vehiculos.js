    // ══════════════════════════════════════════════════════════════════════════
    // 🚗 SISTEMA DE REGISTRO VEHICULAR
    // ══════════════════════════════════════════════════════════════════════════
    // Este archivo NO agrega endpoints nuevos: reutiliza /api/tienda (registro,
    // consulta y transferencia, ligado a la tabla "inventario" que ya vive ahí)
    // y /api/comisaria (cambio de estado, solo Policía Virtual). El PDF oficial
    // se genera 100% en el navegador con jsPDF, así que no cuenta como una
    // función serverless adicional.

    const VEH_PATENTE_REGEX = /^[A-Za-z0-9]{3}-[A-Za-z0-9]{3}$/;
    let vehItemActual = null;      // { id, nombre } del item de inventario en registro
    let vehTransferActual = null;  // { vehiculoId, modelo, patente } en transferencia
    let vehPropietarioSel = null;  // usuario elegido en el buscador de transferencia

    function vehRenderAcciones(item) {
      if (item.vehiculo) {
        return `
          <div class="veh-acciones">
            <button class="btn-small green" style="width:100%;justify-content:center;display:flex;align-items:center;gap:6px;" onclick="verRegistroVehiculo(${item.vehiculo.id})">
              📄 Ver Registro
            </button>
            <button class="btn-small purple" style="width:100%;justify-content:center;display:flex;align-items:center;gap:6px;margin-top:6px;" onclick="vehAbrirModalTransferencia(${item.vehiculo.id}, '${escJs(item.nombre)}', '${escJs(item.vehiculo.patente)}')">
              🔄 Transferir Vehículo
            </button>
          </div>`;
      }
      return `
        <div class="veh-acciones">
          <button class="btn-small orange" style="width:100%;justify-content:center;display:flex;align-items:center;gap:6px;" onclick="vehAbrirModalRegistro(${item.id}, '${escJs(item.nombre)}')">
            🚗 Registrar Vehículo
          </button>
        </div>`;
    }

    function escJs(str) {
      return String(str == null ? '' : str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    // ── REGISTRAR VEHÍCULO ───────────────────────────────────────────────────
    function vehAbrirModalRegistro(itemId, nombre) {
      vehItemActual = { id: itemId, nombre };
      document.getElementById('veh-reg-modelo').textContent = nombre;
      document.getElementById('veh-reg-patente').value = '';
      document.getElementById('veh-reg-color').value = '';
      document.getElementById('veh-reg-error').classList.remove('visible');
      document.getElementById('modal-veh-registrar').classList.add('visible');
    }

    // Formatea automáticamente lo que se escribe hacia "ABC-123"
    function vehFormatearPatenteInput(el) {
      let v = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (v.length > 6) v = v.slice(0, 6);
      if (v.length > 3) v = v.slice(0, 3) + '-' + v.slice(3);
      el.value = v;
    }

    async function vehConfirmarRegistro() {
      if (!vehItemActual) return;
      const patente = document.getElementById('veh-reg-patente').value.trim().toUpperCase();
      const color   = document.getElementById('veh-reg-color').value.trim();
      const errEl   = document.getElementById('veh-reg-error');
      errEl.classList.remove('visible');

      if (!VEH_PATENTE_REGEX.test(patente)) {
        errEl.textContent = 'La patente debe tener el formato ABC-123 (3 caracteres, guion, 3 caracteres).';
        errEl.classList.add('visible');
        return;
      }
      if (!color) {
        errEl.textContent = 'Debes indicar el color del vehículo.';
        errEl.classList.add('visible');
        return;
      }

      const btn = document.getElementById('veh-reg-btn');
      btn.disabled = true; btn.textContent = 'Registrando...';

      try {
        const res = await fetch('/api/tienda?action=registrarVehiculo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item_id: vehItemActual.id, patente, color }),
        });
        const data = await res.json();
        if (!res.ok) {
          errEl.textContent = data.error || 'Error al registrar el vehículo.';
          errEl.classList.add('visible');
          btn.disabled = false; btn.textContent = 'Confirmar Registro';
          return;
        }
        cerrarModal('modal-veh-registrar');
        mostrarToast('Vehículo registrado correctamente.');
        btn.disabled = false; btn.textContent = 'Confirmar Registro';
        if (typeof cargarInventario === 'function') cargarInventario();
      } catch (e) {
        errEl.textContent = 'Error de conexión.';
        errEl.classList.add('visible');
        btn.disabled = false; btn.textContent = 'Confirmar Registro';
      }
    }

    // ── VER REGISTRO (genera y abre el PDF oficial) ──────────────────────────
    async function verRegistroVehiculo(vehiculoId) {
      try {
        const res = await fetch(`/api/tienda?action=vehiculo&vehiculo_id=${vehiculoId}`);
        const data = await res.json();
        if (!res.ok) {
          mostrarToast(data.error || 'No se pudo cargar el registro.', true);
          return;
        }
        await vehGenerarPDF(data.vehiculo);
      } catch (e) {
        mostrarToast('Error al generar el registro.', true);
      }
    }

    function vehFormatFecha(f) {
      if (!f) return '—';
      const d = new Date(f);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    async function vehGenerarPDF(v) {
      if (!window.jspdf || !window.jspdf.jsPDF) {
        mostrarToast('No se pudo cargar el generador de PDF.', true);
        return;
      }
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const W = doc.internal.pageSize.getWidth();
      const azul = [0, 48, 135];
      const gris = [90, 90, 90];

      // ── Encabezado ──
      doc.setFillColor(azul[0], azul[1], azul[2]);
      doc.rect(0, 0, W, 90, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('REGISTRO CIVIL DE CHILE CITY', 40, 38);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text('Certificado de Inscripción y Anotaciones Vehiculares', 40, 58);
      doc.text(`Patente: ${v.patente}`, 40, 76);

      let y = 130;
      doc.setTextColor(20, 20, 20);

      const campo = (label, valor) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(gris[0], gris[1], gris[2]);
        doc.text(label.toUpperCase(), 40, y);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(13);
        doc.setTextColor(20, 20, 20);
        doc.text(String(valor ?? '—'), 40, y + 17);
        y += 42;
      };

      campo('Modelo del Vehículo', v.modelo);
      campo('Patente', v.patente);
      campo('Año', v.anio);
      campo('Color', v.color);
      campo('Fecha de Inscripción', vehFormatFecha(v.fecha_inscripcion));
      campo('Estado del Vehículo', v.estado);
      campo('Nombre del Propietario Actual', v.propietario_actual_nombre || '—');
      campo('ID del Propietario', v.propietario_actual_id);

      // ── Historial de dueños anteriores ──
      doc.setDrawColor(200, 200, 200);
      doc.line(40, y, W - 40, y);
      y += 24;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(azul[0], azul[1], azul[2]);
      doc.text('DUEÑOS ANTERIORES', 40, y);
      y += 18;

      const historial = Array.isArray(v.duenos_anteriores) ? v.duenos_anteriores : [];
      if (historial.length === 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.setTextColor(120, 120, 120);
        doc.text('Sin propietarios anteriores registrados.', 40, y);
        y += 18;
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.setTextColor(20, 20, 20);
        historial.forEach((h, i) => {
          doc.text(`${i + 1}. ${h.nombre || h.discord_id}  ·  hasta el ${vehFormatFecha(h.fecha_hasta)}`, 40, y);
          y += 18;
        });
      }

      // ── Pie de página ──
      const pageH = doc.internal.pageSize.getHeight();
      doc.setDrawColor(220, 220, 220);
      doc.line(40, pageH - 60, W - 40, pageH - 60);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(140, 140, 140);
      doc.text('Documento generado electrónicamente por el sistema de Chile City. Válido como comprobante de inscripción.', 40, pageH - 42);
      doc.text(`Generado el ${vehFormatFecha(new Date())}`, 40, pageH - 28);

      doc.save(`Registro_Vehicular_${v.patente}.pdf`);
      const blobUrl = doc.output('bloburl');
      window.open(blobUrl, '_blank');
    }

    // ── TRANSFERIR VEHÍCULO ───────────────────────────────────────────────────
    function vehAbrirModalTransferencia(vehiculoId, modelo, patente) {
      vehTransferActual = { vehiculoId, modelo, patente };
      vehPropietarioSel = null;
      document.getElementById('veh-tr-vehiculo').textContent = `${modelo} · ${patente}`;
      document.getElementById('veh-tr-buscar').value = '';
      document.getElementById('veh-tr-resultados').innerHTML = '';
      document.getElementById('veh-tr-resultados').style.display = 'none';
      document.getElementById('veh-tr-seleccionado').style.display = 'none';
      document.getElementById('veh-tr-error').classList.remove('visible');
      document.getElementById('modal-veh-transferir').classList.add('visible');
    }

    let vehTrBuscarTimer = null;
    function vehTrBuscarInput() {
      clearTimeout(vehTrBuscarTimer);
      vehTrBuscarTimer = setTimeout(vehBuscarPropietario, 280);
    }

    async function vehBuscarPropietario() {
      const q = document.getElementById('veh-tr-buscar').value.trim();
      const resDiv = document.getElementById('veh-tr-resultados');
      if (!q) { resDiv.style.display = 'none'; resDiv.innerHTML = ''; return; }
      resDiv.style.display = 'block';
      resDiv.innerHTML = '<p style="padding:10px 14px;color:rgba(255,255,255,0.4);font-size:13px;">Buscando...</p>';
      try {
        const res  = await fetch(`/api/tienda?action=buscarPropietario&q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!data.usuarios || data.usuarios.length === 0) {
          resDiv.innerHTML = '<p style="padding:10px 14px;color:rgba(255,255,255,0.3);font-size:13px;">Sin resultados.</p>';
          return;
        }
        resDiv.innerHTML = '';
        data.usuarios.forEach(u => {
          const row = document.createElement('div');
          row.style.cssText = 'padding:10px 14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.06);font-size:13px;color:#fff;';
          row.innerHTML = `<b>${escHtml(u.nombre_completo)}</b> <span style="color:rgba(255,255,255,0.4);">${u.discord_username ? '@' + escHtml(u.discord_username) : ''} · RUT: ${escHtml(u.rut || '—')}</span>`;
          row.onmouseenter = () => { row.style.background = 'rgba(255,255,255,0.07)'; };
          row.onmouseleave = () => { row.style.background = ''; };
          row.onclick = () => {
            vehPropietarioSel = u;
            document.getElementById('veh-tr-seleccionado').style.display = 'block';
            document.getElementById('veh-tr-seleccionado').textContent =
              `Nuevo propietario: ${u.nombre_completo}${u.discord_username ? ' (@' + u.discord_username + ')' : ''}`;
            resDiv.style.display = 'none';
          };
          resDiv.appendChild(row);
        });
      } catch (e) {
        resDiv.innerHTML = '<p style="padding:10px 14px;color:#f87171;font-size:13px;">Error al buscar.</p>';
      }
    }

    async function vehConfirmarTransferencia() {
      const errEl = document.getElementById('veh-tr-error');
      errEl.classList.remove('visible');
      if (!vehTransferActual) return;
      if (!vehPropietarioSel) {
        errEl.textContent = 'Selecciona un nuevo propietario desde la búsqueda.';
        errEl.classList.add('visible');
        return;
      }
      const btn = document.getElementById('veh-tr-btn');
      btn.disabled = true; btn.textContent = 'Transfiriendo...';
      try {
        const res = await fetch('/api/tienda?action=transferirVehiculo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vehiculo_id: vehTransferActual.vehiculoId,
            nuevo_propietario_id: vehPropietarioSel.discord_id,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          errEl.textContent = data.error || 'Error al transferir el vehículo.';
          errEl.classList.add('visible');
          btn.disabled = false; btn.textContent = 'Confirmar Transferencia';
          return;
        }
        cerrarModal('modal-veh-transferir');
        mostrarToast('Vehículo transferido correctamente.');
        btn.disabled = false; btn.textContent = 'Confirmar Transferencia';
        if (typeof cargarInventario === 'function') cargarInventario();
      } catch (e) {
        errEl.textContent = 'Error de conexión.';
        errEl.classList.add('visible');
        btn.disabled = false; btn.textContent = 'Confirmar Transferencia';
      }
    }

    // Cerrar modales al hacer click fuera
    (function () {
      ['modal-veh-registrar', 'modal-veh-transferir'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', function (e) { if (e.target === this) cerrarModal(id); });
      });
    })();

    // ══════════════════════════════════════════════════════════════════════════
    // PANEL POLICIAL — cambio de estado de vehículos
    // ══════════════════════════════════════════════════════════════════════════
    let cvVehCiudadanoSel = null;
    let cvVehSeleccionado  = null;

    async function cvBuscarCiudadanoVeh() {
      const q = document.getElementById('veh-cv-buscar').value.trim();
      const resDiv = document.getElementById('veh-cv-buscar-resultados');
      if (!q) return;
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
            cvVehCiudadanoSel = c;
            document.getElementById('veh-cv-ciudadano-nombre').value = c.nombre_completo + (c.dni ? ` (${c.dni})` : '');
            resDiv.style.display = 'none';
            cvCargarVehiculosCiudadano(c.discord_id);
          };
          resDiv.appendChild(row);
        });
      } catch {
        resDiv.innerHTML = '<p style="padding:10px 14px;color:#f87171;font-size:13px;">Error al buscar.</p>';
      }
    }

    async function cvCargarVehiculosCiudadano(targetId) {
      const wrap = document.getElementById('veh-cv-lista');
      wrap.innerHTML = '<p style="padding:10px;color:rgba(255,255,255,0.4);font-size:13px;">Cargando vehículos...</p>';
      cvVehSeleccionado = null;
      document.getElementById('veh-cv-estado-wrap').style.display = 'none';
      try {
        const r = await fetch(`/api/comisaria?action=vehiculosUsuario&target_id=${targetId}`);
        const data = await r.json();
        if (!data.vehiculos || data.vehiculos.length === 0) {
          wrap.innerHTML = '<p style="padding:10px;color:rgba(255,255,255,0.3);font-size:13px;">Este ciudadano no tiene vehículos registrados.</p>';
          return;
        }
        wrap.innerHTML = '';
        data.vehiculos.forEach(v => {
          const row = document.createElement('div');
          row.style.cssText = 'background:rgba(30,138,76,0.05);border:1px solid rgba(63,182,115,0.16);border-radius:10px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px;cursor:pointer;margin-bottom:8px;flex-wrap:wrap;';
          row.innerHTML = `
            <div>
              <b style="color:#fff;">${escHtml(v.modelo)}</b>
              <div style="font-size:12px;color:rgba(255,255,255,0.45);">Patente: ${escHtml(v.patente)} · Estado actual: <span style="color:#fbbf24;">${escHtml(v.estado)}</span></div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="color:rgba(255,255,255,0.35)"><polyline points="9 6 15 12 9 18"/></svg>`;
          row.onclick = () => {
            cvVehSeleccionado = v;
            document.getElementById('veh-cv-estado-wrap').style.display = 'flex';
            document.getElementById('veh-cv-estado-label').textContent = `${v.modelo} · ${v.patente}`;
            document.getElementById('veh-cv-estado-select').value = v.estado;
          };
          wrap.appendChild(row);
        });
      } catch {
        wrap.innerHTML = '<p style="padding:10px;color:#f87171;font-size:13px;">Error al cargar vehículos.</p>';
      }
    }

    async function cvActualizarEstadoVehiculo() {
      if (!cvVehSeleccionado) return;
      const estado = document.getElementById('veh-cv-estado-select').value;
      const errEl  = document.getElementById('veh-cv-estado-error');
      const okEl   = document.getElementById('veh-cv-estado-ok');
      errEl.style.display = 'none'; okEl.style.display = 'none';
      try {
        const r = await fetch('/api/comisaria?action=actualizarEstadoVehiculo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vehiculo_id: cvVehSeleccionado.id, estado }),
        });
        const data = await r.json();
        if (!r.ok) { errEl.textContent = data.error || 'Error.'; errEl.style.display = 'block'; return; }
        okEl.textContent = 'Estado actualizado correctamente.';
        okEl.style.display = 'block';
        if (cvVehCiudadanoSel) cvCargarVehiculosCiudadano(cvVehCiudadanoSel.discord_id);
      } catch { errEl.textContent = 'Error de conexión.'; errEl.style.display = 'block'; }
    }
