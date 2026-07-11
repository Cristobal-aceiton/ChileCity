    // BANCO
    // ══════════════════════════════════════════════════════════════════════════
    async function cargarBanco() {
      if (!currentUser?.id) return;
      document.getElementById('banco-loading').style.display = 'flex';
      document.getElementById('banco-crear-form').style.display = 'none';
      document.getElementById('banco-cuenta-wrap').style.display = 'none';
      const _bdcCardView = document.getElementById('bdc-card-view');
      const _bdcHomeView = document.getElementById('bdc-home-view');
      if (_bdcCardView) _bdcCardView.style.display = 'none';
      if (_bdcHomeView) _bdcHomeView.style.display = 'flex';

      try {
        const res = await fetch(`/api/banco?action=cuenta&discord_id=${currentUser.id}`);
        document.getElementById('banco-loading').style.display = 'none';

        if (res.status === 404) {
          // Verificar si tiene DNI
          const dniRes = await fetch(`/api/dni?discord_id=${currentUser.id}`);
          const dniData = await dniRes.json();
          if (!dniData.existe) {
            const err = document.getElementById('banco-crear-error');
            err.textContent = 'Debes crear tu cédula de identidad (DNI) antes de abrir una cuenta bancaria.';
            err.classList.add('visible');
            document.getElementById('btn-abrir-cuenta').disabled = true;
          }
          document.getElementById('banco-crear-form').style.display = 'flex';
          return;
        }

        const data = await res.json();
        currentCuenta = data.cuenta;
        _prestamoActivo = data.prestamoActivo || null;

        // Buscar DNI para nombre completo
        let dniData = { existe: false };
        try {
          const dr = await fetch(`/api/dni?discord_id=${currentUser.id}`);
          dniData = await dr.json();
          if (dniData.existe) currentDNI = dniData.dni;
        } catch(e){}

        mostrarTarjeta(data.cuenta, dniData.dni);
        ccAnimateNumber(document.getElementById('bank-saldo'), data.cuenta.saldo, formatCLP);
        renderAhorroCard(data.cuenta);
        document.getElementById('banco-cuenta-wrap').style.display = 'flex';

        // Próximo sueldo
        if (data.proximoSueldo) {
          iniciarCountdown(data.proximoSueldo);
        } else {
          document.getElementById('proximo-sueldo-box').style.display = 'none';
        }

      } catch (err) {
        document.getElementById('banco-loading').style.display = 'none';
        document.getElementById('banco-crear-form').style.display = 'flex';
      }
    }

    // Enmascara un número de cuenta dejando solo los últimos 4 dígitos visibles,
    // igual que hace una tarjeta real (•••• •••• •••• 1234).
    function maskNumeroCuenta(numero) {
      const limpio = String(numero || '').replace(/[^0-9]/g, '');
      if (limpio.length <= 4) return numero;
      const ultimos4 = limpio.slice(-4);
      const grupos = Math.max(0, Math.ceil(limpio.length / 4) - 1);
      return `${'•••• '.repeat(grupos).trim()} ${ultimos4}`.trim();
    }

    function mostrarTarjeta(cuenta, dni) {
      const numeroEl = document.getElementById('bank-numero');
      numeroEl.dataset.full = cuenta.numero_cuenta;
      numeroEl.dataset.revealed = '0';
      numeroEl.classList.add('bn-masked');
      numeroEl.textContent = maskNumeroCuenta(cuenta.numero_cuenta);
      // Pseudo-código de operaciones del reverso: no es un CVV real, solo un
      // identificador decorativo derivado de la propia cuenta.
      const opEl = document.getElementById('bank-card-back-op');
      if (opEl) {
        const digits = String(cuenta.numero_cuenta || '').replace(/[^0-9]/g, '');
        opEl.textContent = `OP-${digits.slice(-6).padStart(6, '0')}`;
      }
      if (dni) {
        const nombreCompleto = `${dni.nombre1} ${dni.apellido1}`;
        document.getElementById('bank-titular').textContent = nombreCompleto;
        document.getElementById('bank-rut').textContent = dni.rut;
        const firmaEl = document.getElementById('bank-firma-nombre');
        if (firmaEl) firmaEl.textContent = nombreCompleto;
      }
    }

    // Muestra/oculta el número completo de la tarjeta (ojo de revelar).
    function bdcToggleReveal(ev) {
      if (ev) ev.stopPropagation();
      const numeroEl = document.getElementById('bank-numero');
      const eyeIcon = document.getElementById('bn-eye-icon');
      if (!numeroEl) return;
      const revelado = numeroEl.dataset.revealed === '1';
      if (revelado) {
        numeroEl.textContent = maskNumeroCuenta(numeroEl.dataset.full);
        numeroEl.dataset.revealed = '0';
        numeroEl.classList.add('bn-masked');
        if (eyeIcon) eyeIcon.innerHTML = '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>';
      } else {
        numeroEl.textContent = numeroEl.dataset.full || numeroEl.textContent;
        numeroEl.dataset.revealed = '1';
        numeroEl.classList.remove('bn-masked');
        if (eyeIcon) eyeIcon.innerHTML = '<path d="M17 2 2 17"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a13.16 13.16 0 0 1-3.16 4.05M6.61 6.61C4.13 8.2 2.5 10.35 1 12c0 0 4 7 11 7 1.5 0 2.8-.31 3.94-.83"/><path d="M12.53 15.53a3 3 0 1 1-4.06-4.06"/>';
      }
    }

    // Voltea la tarjeta en 3D para mostrar el reverso (banda magnética, firma).
    function bdcToggleFlip(ev) {
      if (ev && ev.target.closest && ev.target.closest('.bn-eye-btn')) return;
      const el = document.getElementById('bank-card-flip');
      if (el) el.classList.toggle('flipped');
    }


    function iniciarCountdown(ps) {
      const box = document.getElementById('proximo-sueldo-box');
      box.style.display = 'flex';
      document.getElementById('ps-nombre').textContent = ps.nombre;
      if (countdownInterval) clearInterval(countdownInterval);

      function actualizar() {
        const ms = ps.msRestantes - (Date.now() - iniciadoEn);
        if (ms <= 0) {
          document.getElementById('ps-tiempo').textContent = 'Disponible ahora';
          clearInterval(countdownInterval);
          return;
        }
        const d = Math.floor(ms / 86400000);
        const h = Math.floor((ms % 86400000) / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        let txt = '';
        if (d > 0) txt += `${d}d `;
        if (h > 0) txt += `${h}h `;
        if (m > 0) txt += `${m}m `;
        txt += `${s}s`;
        document.getElementById('ps-tiempo').textContent = txt;
      }

      const iniciadoEn = Date.now();
      actualizar();
      countdownInterval = setInterval(actualizar, 1000);
    }

    async function crearCuenta() {
      const btn = document.getElementById('btn-abrir-cuenta');
      btn.disabled = true;
      btn.textContent = 'Creando...';

      try {
        const res = await fetch('/api/banco?action=crear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ discord_id: currentUser.id }),
        });
        const data = await res.json();
        if (!res.ok) {
          const err = document.getElementById('banco-crear-error');
          err.textContent = data.error || 'Error al crear la cuenta.';
          err.classList.add('visible');
          btn.disabled = false;
          btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg> Crear Cuenta Bancaria`;
          return;
        }
        currentCuenta = data.cuenta;
        document.getElementById('banco-crear-form').style.display = 'none';
        document.getElementById('banco-loading').style.display = 'none';
        document.getElementById('bank-saldo').textContent = formatCLP(data.cuenta.saldo);
        if (currentDNI) mostrarTarjeta(data.cuenta, currentDNI);
        renderAhorroCard(data.cuenta);
        document.getElementById('banco-cuenta-wrap').style.display = 'flex';
        document.getElementById('proximo-sueldo-box').style.display = 'none';
      } catch (err) {
        btn.disabled = false;
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // NAVEGACIÓN DE SUB-VISTAS (Fase 4)
    // ══════════════════════════════════════════════════════════════════════════
    // Mapea el id lógico de cada botón de "Mis productos"/acciones a su
    // elemento .subvista real dentro de #banco-cuenta-wrap.
    const BANCO_SUBVISTAS = {
      transfer: 'transfer-form',
      historial: 'historial-wrap',
      contactos: 'contactos-wrap',
      prestamo: 'prestamo-wrap',
      ahorro: 'ahorro-wrap',
    };

    function navegarBanco(id) {
      const home = document.getElementById('bdc-home-view');
      const card = document.getElementById('bdc-card-view');
      if (home) home.style.display = 'none';
      if (card) { card.style.display = 'none'; card.classList.remove('activa'); }
      Object.values(BANCO_SUBVISTAS).forEach(elId => {
        const el = document.getElementById(elId);
        if (el) el.classList.remove('activa');
      });

      if (id === 'home') {
        if (home) home.style.display = 'flex';
        return;
      }
      const targetId = BANCO_SUBVISTAS[id];
      const target = targetId && document.getElementById(targetId);
      if (target) target.classList.add('activa');
    }

    function volverBancoHome() {
      navegarBanco('home');
    }

    // Transferencia
    function mostrarTransferir() {
      navegarBanco('transfer');
      const ahorroOpt = document.getElementById('transfer-origen-ahorro-opt');
      if (ahorroOpt) ahorroOpt.style.display = (currentCuenta && currentCuenta.ahorro_activa) ? '' : 'none';
      const origenSel = document.getElementById('transfer-origen');
      if (origenSel) origenSel.value = 'corriente';
      actualizarOrigenTransferencia();
    }
    function ocultarTransferir() {
      navegarBanco('home');
    }

    // Alterna entre "transferir a un tercero desde Corriente" y "mover desde
    // Ahorro de vuelta a tu propia Corriente" (nunca a terceros).
    function actualizarOrigenTransferencia() {
      const origen = document.getElementById('transfer-origen')?.value || 'corriente';
      const rutGroup = document.getElementById('transfer-rut-group');
      const fijoGroup = document.getElementById('transfer-destino-fijo-group');
      const esAhorro = origen === 'ahorro';
      if (rutGroup) rutGroup.style.display = esAhorro ? 'none' : 'flex';
      if (fijoGroup) fijoGroup.style.display = esAhorro ? 'flex' : 'none';
    }

    // Caché liviana de contactos guardados, para mostrar el nombre del
    // destinatario en el recibo cuando esté disponible (no hace ningún
    // request extra: solo aprovecha lo que ya cargó la pestaña Contactos).
    let _contactosCache = {};

    // Recibo post-transferencia: reemplaza el "toast que desaparece" por un
    // modal que el usuario cierra a propósito, con el detalle completo
    // (monto, destinatario, fecha, nuevo saldo) — pensado sobre todo para
    // transferencias grandes donde el usuario quiere confirmar que sí salió.
    // Folio correlativo del comprobante, persistido en localStorage para que
    // se vea como un correlativo real de operaciones (no vuelve a 1 cada vez).
    function siguienteFolioVoucher() {
      const KEY = 'cc_banco_folio';
      let n = parseInt(localStorage.getItem(KEY) || '481', 10);
      n += 1;
      try { localStorage.setItem(KEY, String(n)); } catch (e) {}
      return n;
    }

    // Convierte un monto CLP a su expresión en palabras, como en los
    // documentos bancarios chilenos ("Ciento cincuenta mil pesos").
    function montoEnPalabras(monto) {
      const UNIDADES = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
      const DIECIS = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
      // 'veintiún' (no 'veintiuno') porque siempre precede a un sustantivo
      // (pesos/mil/millones) en este contexto.
      const VEINTIS = ['veinte', 'veintiún', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
      const DECENAS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
      const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

      function trescientos(n) {
        if (n === 0) return '';
        if (n === 100) return 'cien';
        let out = '';
        const c = Math.floor(n / 100), resto = n % 100;
        if (c > 0) out += CENTENAS[c] + ' ';
        if (resto >= 10 && resto < 20) {
          out += DIECIS[resto - 10];
        } else if (resto >= 20 && resto < 30) {
          out += VEINTIS[resto - 20];
        } else {
          const d = Math.floor(resto / 10), u = resto % 10;
          if (d >= 3) {
            out += DECENAS[d];
            if (u > 0) out += ' y ' + UNIDADES[u];
          } else if (resto > 0) {
            out += UNIDADES[resto];
          }
        }
        return out.trim();
      }

      let n = Math.floor(Math.abs(monto));
      if (n === 0) return 'cero pesos';
      if (n === 1) return 'un peso';

      const millones = Math.floor(n / 1000000);
      const miles = Math.floor((n % 1000000) / 1000);
      const resto = n % 1000;

      // "de" solo va pegado a millón/millones cuando no hay miles ni resto
      // entre medio (p.ej. "un millón de pesos" pero "un millón doscientos mil pesos").
      const millonSoloAntesDePesos = miles === 0 && resto === 0;
      let partes = [];
      if (millones > 0) partes.push((millones === 1 ? 'un millón' : `${trescientos(millones)} millones`) + (millonSoloAntesDePesos ? ' de' : ''));
      if (miles > 0) partes.push(miles === 1 ? 'mil' : `${trescientos(miles)} mil`);
      if (resto > 0) partes.push(trescientos(resto));

      return `${partes.join(' ')} pesos`.replace(/\s+/g, ' ').trim();
    }

    function mostrarReciboTransferencia(monto, rutDestino, nuevoSaldo) {
      const nombre = _contactosCache[rutDestino];
      const folio = siguienteFolioVoucher();
      document.getElementById('recibo-tx-folio').textContent = String(folio).padStart(6, '0');
      document.getElementById('recibo-tx-monto').textContent = formatCLP(monto);
      document.getElementById('recibo-tx-palabras').textContent = montoEnPalabras(monto);
      document.getElementById('recibo-tx-destino').textContent = nombre ? `${nombre} (${rutDestino})` : rutDestino;
      document.getElementById('recibo-tx-fecha').textContent = new Date().toLocaleString('es-CL', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      document.getElementById('recibo-tx-saldo').textContent = formatCLP(nuevoSaldo);
      const barcodeTxt = `CC-${String(folio).padStart(6, '0')}-${Date.now().toString().slice(-6)}`;
      document.getElementById('recibo-tx-barcode-txt').textContent = barcodeTxt;
      document.getElementById('modal-recibo-transferencia').classList.add('visible');
    }

    // Genera una imagen PNG del voucher usando canvas y la descarga — 100%
    // client-side, sin backend.
    function descargarVoucher() {
      const folio = document.getElementById('recibo-tx-folio').textContent;
      const monto = document.getElementById('recibo-tx-monto').textContent;
      const palabras = document.getElementById('recibo-tx-palabras').textContent;
      const destino = document.getElementById('recibo-tx-destino').textContent;
      const fecha = document.getElementById('recibo-tx-fecha').textContent;
      const saldo = document.getElementById('recibo-tx-saldo').textContent;
      const barcodeTxt = document.getElementById('recibo-tx-barcode-txt').textContent;

      const W = 560, H = 720;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');

      // Fondo tipo papel
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#fbfaf6');
      grad.addColorStop(1, '#f3f1ea');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = '#1a1a1a';
      ctx.textAlign = 'center';

      // Folio
      ctx.font = '700 13px monospace';
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fillText(`COMPROBANTE N° ${folio}`, W / 2, 50);

      // Ícono check
      ctx.beginPath();
      ctx.arc(W / 2, 100, 30, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(16,185,129,.15)';
      ctx.fill();
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 12, 100); ctx.lineTo(W / 2 - 3, 110); ctx.lineTo(W / 2 + 14, 90);
      ctx.stroke();

      ctx.font = '600 24px Georgia, serif';
      ctx.fillStyle = '#1a1a1a';
      ctx.fillText('Transferencia exitosa', W / 2, 160);

      ctx.font = '800 40px Arial';
      ctx.fillStyle = '#0d8f5f';
      ctx.fillText(monto, W / 2, 210);

      ctx.font = 'italic 15px Arial';
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.fillText(palabras, W / 2, 235);

      // Detalle
      const filas = [['Destinatario', destino], ['Fecha', fecha], ['Tu nuevo saldo', saldo]];
      let y = 290;
      ctx.textAlign = 'left';
      ctx.strokeStyle = 'rgba(0,0,0,.1)';
      filas.forEach(([label, val]) => {
        ctx.font = '13px Arial';
        ctx.fillStyle = 'rgba(0,0,0,.45)';
        ctx.fillText(label, 60, y);
        ctx.textAlign = 'right';
        ctx.font = '700 13px Arial';
        ctx.fillStyle = '#111';
        ctx.fillText(val, W - 60, y);
        ctx.textAlign = 'left';
        ctx.beginPath(); ctx.moveTo(60, y + 16); ctx.lineTo(W - 60, y + 16); ctx.stroke();
        y += 48;
      });

      // Código de barras decorativo
      let bx = 60;
      const byTop = y + 20, byH = 50;
      ctx.fillStyle = '#1a1a1a';
      while (bx < W - 60) {
        const w = [2, 3, 4][Math.floor(Math.random() * 3)];
        if (Math.random() > 0.4) ctx.fillRect(bx, byTop, w, byH);
        bx += w + 2;
      }
      ctx.textAlign = 'center';
      ctx.font = '11px monospace';
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      ctx.fillText(barcodeTxt, W / 2, byTop + byH + 20);

      ctx.font = '10px Arial';
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.fillText('ChileCity Bank · comprobante generado digitalmente', W / 2, H - 24);

      const link = document.createElement('a');
      link.download = `comprobante-${folio}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }

    async function hacerTransferencia() {
      const origen = document.getElementById('transfer-origen')?.value || 'corriente';
      if (origen === 'ahorro') return hacerRetiroAhorro();

      const rut   = document.getElementById('transfer-rut').value.trim();
      const monto = document.getElementById('transfer-monto').value.trim();
      const errEl = document.getElementById('transfer-error');
      const okEl  = document.getElementById('transfer-success');
      errEl.classList.remove('visible'); okEl.classList.remove('visible');

      if (!rut || !monto) {
        errEl.textContent = 'Completa el RUT y el monto.';
        errEl.classList.add('visible'); return;
      }

      const btn = document.getElementById('btn-transferir');
      btn.disabled = true; btn.textContent = 'Transfiriendo...';

      try {
        const res = await fetch('/api/banco?action=transferir', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ discord_id: currentUser.id, rut_destino: rut, monto }),
        });
        const data = await res.json();
        if (!res.ok) {
          errEl.textContent = data.error || 'Error.';
          errEl.classList.add('visible');
        } else {
          currentCuenta.saldo = data.nuevoSaldo;
          document.getElementById('bank-saldo').textContent = formatCLP(data.nuevoSaldo);
          okEl.textContent = `Transferencia exitosa. Nuevo saldo: ${formatCLP(data.nuevoSaldo)}`;
          okEl.classList.add('visible');
          if (typeof sonidoConfirmacion === 'function') sonidoConfirmacion();
          mostrarReciboTransferencia(monto, rut, data.nuevoSaldo);
          document.getElementById('transfer-rut').value = '';
          document.getElementById('transfer-monto').value = '';
        }
      } catch(e) {
        errEl.textContent = 'Error de conexión.'; errEl.classList.add('visible');
      }
      btn.disabled = false;
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Transferir`;
    }

    // ── Retiro Ahorro → Corriente (vía formulario de Transferencias) ────────
    // Reutiliza el mismo formulario/UI que hacerTransferencia(), pero pega
    // contra ahorro_mover porque nunca puede ir a un tercero.
    async function hacerRetiroAhorro() {
      const monto = document.getElementById('transfer-monto').value.trim();
      const errEl = document.getElementById('transfer-error');
      const okEl  = document.getElementById('transfer-success');
      errEl.classList.remove('visible'); okEl.classList.remove('visible');

      if (!monto) {
        errEl.textContent = 'Ingresa el monto.';
        errEl.classList.add('visible'); return;
      }

      const btn = document.getElementById('btn-transferir');
      btn.disabled = true; btn.textContent = 'Transfiriendo...';

      try {
        const res = await fetch('/api/banco?action=ahorro_mover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ direccion: 'retiro', monto }),
        });
        const data = await res.json();
        if (!res.ok) {
          errEl.textContent = data.error || 'Error.';
          errEl.classList.add('visible');
        } else {
          currentCuenta.saldo = data.nuevoSaldo;
          currentCuenta.ahorro_saldo = data.nuevoAhorroSaldo;
          document.getElementById('bank-saldo').textContent = formatCLP(data.nuevoSaldo);
          renderAhorroCard(currentCuenta);
          okEl.textContent = `Retiro exitoso. Nuevo saldo en Corriente: ${formatCLP(data.nuevoSaldo)}`;
          okEl.classList.add('visible');
          if (typeof sonidoConfirmacion === 'function') sonidoConfirmacion();
          document.getElementById('transfer-monto').value = '';
        }
      } catch (e) {
        errEl.textContent = 'Error de conexión.'; errEl.classList.add('visible');
      }
      btn.disabled = false;
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Transferir`;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CUENTA DE AHORRO (Fase 4)
    // ══════════════════════════════════════════════════════════════════════════
    // Sincroniza la tarjeta de saldo de Ahorro en la vista principal y el
    // detalle dentro de la propia sub-vista Ahorro con currentCuenta.
    function renderAhorroCard(cuenta) {
      cuenta = cuenta || {};
      const activa = !!cuenta.ahorro_activa;

      const saldoEl = document.getElementById('bdc-ahorro-saldo');
      const inactivaEl = document.getElementById('bdc-ahorro-inactiva');
      const labelEl = document.getElementById('bdc-ahorro-label');
      if (saldoEl) saldoEl.style.display = activa ? '' : 'none';
      if (inactivaEl) inactivaEl.style.display = activa ? 'none' : 'flex';
      if (labelEl) labelEl.textContent = activa ? 'Saldo en Ahorro' : 'Cuenta de Ahorro';
      if (activa && saldoEl) ccAnimateNumber(saldoEl, cuenta.ahorro_saldo || 0, formatCLP);

      const crearForm = document.getElementById('ahorro-crear-form');
      const activaWrap = document.getElementById('ahorro-activa-wrap');
      if (crearForm) crearForm.style.display = activa ? 'none' : 'flex';
      if (activaWrap) activaWrap.style.display = activa ? 'block' : 'none';
      const detalle = document.getElementById('ahorro-saldo-detalle');
      if (activa && detalle) detalle.textContent = formatCLP(cuenta.ahorro_saldo || 0);
    }

    async function abrirAhorro() {
      try {
        const res = await fetch('/api/banco?action=ahorro_abrir', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) {
          if (typeof mostrarToast === 'function') mostrarToast(data.error || 'No se pudo abrir la Cuenta de Ahorro.', true);
          return;
        }
        currentCuenta = { ...currentCuenta, ...data.cuenta };
        renderAhorroCard(currentCuenta);
        if (typeof mostrarToast === 'function') mostrarToast('Cuenta de Ahorro activada.', false);
      } catch (e) {
        if (typeof mostrarToast === 'function') mostrarToast('Error de conexión.', true);
      }
    }

    function mostrarAhorro() {
      navegarBanco('ahorro');
      document.getElementById('ahorro-error')?.classList.remove('visible');
      document.getElementById('ahorro-success')?.classList.remove('visible');
      renderAhorroCard(currentCuenta);
    }

    async function depositarAhorro() {
      const monto = document.getElementById('ahorro-deposito-monto').value.trim();
      const errEl = document.getElementById('ahorro-error');
      const okEl  = document.getElementById('ahorro-success');
      errEl.classList.remove('visible'); okEl.classList.remove('visible');

      if (!monto) {
        errEl.textContent = 'Ingresa el monto a depositar.';
        errEl.classList.add('visible'); return;
      }

      const btn = document.getElementById('btn-ahorro-depositar');
      btn.disabled = true; btn.textContent = 'Depositando...';

      try {
        const res = await fetch('/api/banco?action=ahorro_mover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ direccion: 'deposito', monto }),
        });
        const data = await res.json();
        if (!res.ok) {
          errEl.textContent = data.error || 'Error.';
          errEl.classList.add('visible');
        } else {
          currentCuenta.saldo = data.nuevoSaldo;
          currentCuenta.ahorro_saldo = data.nuevoAhorroSaldo;
          document.getElementById('bank-saldo').textContent = formatCLP(data.nuevoSaldo);
          renderAhorroCard(currentCuenta);
          okEl.textContent = `Depósito exitoso. Saldo en Ahorro: ${formatCLP(data.nuevoAhorroSaldo)}`;
          okEl.classList.add('visible');
          if (typeof sonidoConfirmacion === 'function') sonidoConfirmacion();
          document.getElementById('ahorro-deposito-monto').value = '';
        }
      } catch (e) {
        errEl.textContent = 'Error de conexión.'; errEl.classList.add('visible');
      }
      btn.disabled = false;
      btn.textContent = 'Depositar';
    }

    // Atajo desde la sub-vista Ahorro: abre Transferencias con el origen ya
    // fijado en "ahorro" (mismo formulario, misma validación).
    function irARetirarAhorro() {
      mostrarTransferir();
      const origenSel = document.getElementById('transfer-origen');
      if (origenSel) origenSel.value = 'ahorro';
      actualizarOrigenTransferencia();
    }

    // Historial
    function etiquetaDia(fecha) {
      const hoy = new Date();
      const ayer = new Date(); ayer.setDate(hoy.getDate() - 1);
      const mismoDia = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
      if (mismoDia(fecha, hoy)) return 'Hoy';
      if (mismoDia(fecha, ayer)) return 'Ayer';
      return fecha.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });
    }

    // Mini gráfico de dona (ingresos vs egresos), 100% client-side sobre los
    // datos ya cargados del historial — no consulta ninguna API adicional.
    function renderDonutIngresosEgresos(transacciones) {
      const card = document.getElementById('hist-donut-card');
      if (!card) return;
      let ingresos = 0, egresos = 0;
      transacciones.forEach(t => {
        if (t.tipo === 'egreso') egresos += Number(t.monto) || 0;
        else ingresos += Number(t.monto) || 0;
      });
      const total = ingresos + egresos;
      if (total <= 0) { card.style.display = 'none'; return; }

      const R = 34, C = 2 * Math.PI * R;
      const pctIn = ingresos / total;
      const dashIn = pctIn * C;

      card.style.display = 'flex';
      card.innerHTML = `
        <svg class="hist-donut-svg" width="88" height="88" viewBox="0 0 88 88">
          <circle cx="44" cy="44" r="${R}" fill="none" stroke="rgba(255,107,107,.85)" stroke-width="12"/>
          <circle cx="44" cy="44" r="${R}" fill="none" stroke="var(--green)" stroke-width="12"
            stroke-dasharray="${dashIn} ${C - dashIn}" stroke-dashoffset="${C * 0.25}" stroke-linecap="round"/>
        </svg>
        <div class="hist-donut-legend">
          <div class="hist-donut-item"><span class="hist-donut-dot in"></span>Ingresos<span class="hist-donut-val">${formatCLP(ingresos)}</span></div>
          <div class="hist-donut-item"><span class="hist-donut-dot out"></span>Egresos<span class="hist-donut-val">${formatCLP(egresos)}</span></div>
        </div>`;
    }

    async function mostrarHistorial() {
      const lista = document.getElementById('historial-lista');
      const donutCard = document.getElementById('hist-donut-card');
      navegarBanco('historial');
      if (donutCard) donutCard.style.display = 'none';
      lista.innerHTML = '<div class="historial-vacio">Cargando...</div>';

      try {
        const res = await fetch(`/api/banco?action=historial&discord_id=${currentUser.id}`);
        const data = await res.json();
        if (!data.transacciones.length) {
          lista.innerHTML = '<div class="historial-vacio">Sin movimientos aún</div>';
          return;
        }

        renderDonutIngresosEgresos(data.transacciones);

        // Agrupa por día ("Hoy", "Ayer", fecha) preservando el orden que ya
        // trae la API (más reciente primero).
        let html = '';
        let grupoActual = null;
        data.transacciones.forEach(t => {
          const fechaObj = new Date(t.created_at);
          const etiqueta = etiquetaDia(fechaObj);
          if (etiqueta !== grupoActual) {
            html += `<div class="hist-day-header">${etiqueta}</div>`;
            grupoActual = etiqueta;
          }
          const signo = t.tipo === 'egreso' ? '-' : '+';
          const hora = fechaObj.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
          const icono = t.tipo === 'sueldo'
            ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
            : t.tipo === 'ingreso'
            ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`
            : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`;
          html += `<div class="historial-item">
            <div class="hi-icono ${t.tipo}">${icono}</div>
            <div class="hi-desc">
              <div class="hi-desc-titulo">${escHtml(t.descripcion || t.tipo)}</div>
              <div class="hi-desc-fecha">${hora}</div>
            </div>
            <div class="hi-monto ${t.tipo}">${signo}${formatCLP(t.monto)}</div>
          </div>`;
        });
        lista.innerHTML = html;
      } catch(e) {
        lista.innerHTML = '<div class="historial-vacio">Error al cargar historial</div>';
      }
    }

    // ── Préstamos ─────────────────────────────────────────────────────────────
    // currentCuenta.prestamoActivo se guarda desde cargarBanco() (viene en la
    // respuesta de /api/banco?action=cuenta) para no tener que pedirlo aparte.
    let _prestamoActivo = null;

    function actualizarPreviewCuota() {
      const monto  = parseInt(document.getElementById('prestamo-monto').value, 10);
      const cuotas = parseInt(document.getElementById('prestamo-cuotas').value, 10);
      const preview = document.getElementById('prestamo-preview');
      if (!monto || monto <= 0 || !cuotas || cuotas <= 0) {
        preview.style.display = 'none';
        return;
      }
      const cuotaMonto = Math.ceil(monto / cuotas);
      preview.style.display = 'block';
      preview.innerHTML = `Pagarías <strong style="color:#fbbf24;">${formatCLP(cuotaMonto)}</strong> cada 2 días, durante ${cuotas} cuota${cuotas === 1 ? '' : 's'} (~${cuotas * 2} días en total).`;
    }

    async function mostrarPrestamo() {
      navegarBanco('prestamo');
      renderEstadoPrestamo();
      await cargarHistorialPrestamos();
    }

    function renderEstadoPrestamo() {
      const form = document.getElementById('prestamo-form');
      const card = document.getElementById('prestamo-estado-card');

      if (!_prestamoActivo) {
        form.style.display = 'flex';
        card.style.display = 'none';
        document.getElementById('prestamo-monto').value = '';
        document.getElementById('prestamo-razon').value = '';
        document.getElementById('prestamo-cuotas').value = '';
        document.getElementById('prestamo-acepta').checked = false;
        document.getElementById('prestamo-preview').style.display = 'none';
        document.getElementById('prestamo-error').classList.remove('visible');
        document.getElementById('prestamo-success').classList.remove('visible');
        return;
      }

      form.style.display = 'none';
      card.style.display = 'block';
      const p = _prestamoActivo;

      if (p.estado === 'pendiente') {
        card.innerHTML = `
          <div class="rc-form" style="gap:14px;">
            <h2 style="font-size:18px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Solicitud en revisión
            </h2>
            <p>Tu solicitud de <strong style="color:#fff;">${formatCLP(p.monto)}</strong> (${p.cuotas_totales} cuotas) está esperando la aprobación de un administrador.</p>
            <p style="margin-top:-8px; font-style:italic;">"${escHtml(p.razon)}"</p>
            <div class="rc-error" id="prestamo-cancel-error"></div>
            <button class="sec-back" onclick="cancelarSolicitudPrestamo(${p.id})">Cancelar solicitud</button>
          </div>`;
      } else if (p.estado === 'aprobado') {
        const pagado = p.monto - p.saldo_pendiente;
        const pct = p.monto > 0 ? Math.round((pagado / p.monto) * 100) : 0;
        let tiempoTxt = 'Calculando…';
        if (p.proximoCobroMs != null) {
          const ms = p.proximoCobroMs;
          if (ms <= 0) tiempoTxt = 'Se cobrará en tu próxima visita';
          else {
            const d = Math.floor(ms / 86400000);
            const h = Math.floor((ms % 86400000) / 3600000);
            tiempoTxt = d > 0 ? `${d}d ${h}h` : `${h}h`;
          }
        }
        card.innerHTML = `
          <div class="rc-form" style="gap:14px;">
            <h2 style="font-size:18px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Préstamo activo
            </h2>
            <p style="margin-top:-8px; font-style:italic;">"${escHtml(p.razon)}"</p>
            <div style="display:flex; justify-content:space-between; font-size:13px; color:rgba(255,255,255,.55);">
              <span>Pagado</span><span>${formatCLP(pagado)} / ${formatCLP(p.monto)}</span>
            </div>
            <div style="width:100%; height:8px; border-radius:99px; background:rgba(255,255,255,.08); overflow:hidden;">
              <div style="width:${pct}%; height:100%; background:linear-gradient(90deg,#10B981,#34d399); transition:width .4s ease;"></div>
            </div>
            <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px; font-size:12.5px; color:rgba(255,255,255,.45);">
              <span>Cuota: ${formatCLP(p.cuota_monto)} cada 2 días</span>
              <span>Próximo cobro: ${tiempoTxt}</span>
            </div>
            ${p.deuda_ciclo > 0 ? `<div class="rc-error visible">Quedó un saldo pendiente de ${formatCLP(p.deuda_ciclo)} de la última cuota por falta de saldo. Se volverá a intentar cobrar en el próximo ciclo.</div>` : ''}
          </div>`;
      }
    }

    async function solicitarPrestamo() {
      const monto  = document.getElementById('prestamo-monto').value.trim();
      const razon  = document.getElementById('prestamo-razon').value.trim();
      const cuotas = document.getElementById('prestamo-cuotas').value.trim();
      const acepta = document.getElementById('prestamo-acepta').checked;
      const errEl  = document.getElementById('prestamo-error');
      const okEl   = document.getElementById('prestamo-success');
      errEl.classList.remove('visible'); okEl.classList.remove('visible');

      if (!monto || !razon || !cuotas) {
        errEl.textContent = 'Completa el monto, la razón y las cuotas.';
        errEl.classList.add('visible'); return;
      }
      if (!acepta) {
        errEl.textContent = 'Debes aceptar el cobro automático de las cuotas para continuar.';
        errEl.classList.add('visible'); return;
      }

      const btn = document.getElementById('btn-solicitar-prestamo');
      btn.disabled = true; btn.textContent = 'Enviando...';

      try {
        const res = await fetch('/api/banco?action=prestamo_solicitar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ monto, razon, cuotas, acepta_cobro_auto: acepta }),
        });
        const data = await res.json();
        if (!res.ok) {
          errEl.textContent = data.error || 'Error al enviar la solicitud.';
          errEl.classList.add('visible');
        } else {
          _prestamoActivo = { ...data.prestamo, proximoCobroMs: null };
          renderEstadoPrestamo();
          await cargarHistorialPrestamos();
        }
      } catch (e) {
        errEl.textContent = 'Error de conexión.'; errEl.classList.add('visible');
      }
      btn.disabled = false;
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Solicitar Préstamo`;
    }

    async function cancelarSolicitudPrestamo(id) {
      try {
        const res = await fetch('/api/banco?action=prestamo_cancelar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prestamo_id: id }),
        });
        const data = await res.json();
        if (!res.ok) {
          const errEl = document.getElementById('prestamo-cancel-error');
          if (errEl) { errEl.textContent = data.error || 'Error.'; errEl.classList.add('visible'); }
          return;
        }
        _prestamoActivo = null;
        renderEstadoPrestamo();
        await cargarHistorialPrestamos();
      } catch (e) {}
    }

    async function cargarHistorialPrestamos() {
      const lista = document.getElementById('prestamo-historial-lista');
      lista.innerHTML = '<div class="historial-vacio">Cargando...</div>';
      try {
        const res = await fetch('/api/banco?action=prestamos_mios');
        const data = await res.json();
        const prestamos = (data.prestamos || []).filter(p => p.estado !== 'pendiente' && (!_prestamoActivo || p.id !== _prestamoActivo.id));
        if (!prestamos.length) {
          lista.innerHTML = '<div class="historial-vacio">Sin préstamos anteriores</div>';
          return;
        }
        const estadoTxt = { aprobado: 'En curso', pagado: 'Pagado', rechazado: 'Rechazado' };
        const estadoColor = { aprobado: '#fbbf24', pagado: '#34d399', rechazado: '#ff8080' };
        lista.innerHTML = prestamos.map(p => `
          <div class="historial-item" style="cursor:default;">
            <div class="hi-icono" style="background:rgba(245,158,11,.12); color:${estadoColor[p.estado] || '#fff'};">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <div class="hi-desc">
              <div class="hi-desc-titulo">${escHtml(p.razon)}</div>
              <div class="hi-desc-fecha">${estadoTxt[p.estado] || p.estado}${p.estado === 'rechazado' && p.motivo_rechazo ? ' · ' + escHtml(p.motivo_rechazo) : ''}</div>
            </div>
            <div class="hi-monto" style="color:${estadoColor[p.estado] || '#fff'};">${formatCLP(p.monto)}</div>
          </div>
        `).join('');
      } catch (e) {
        lista.innerHTML = '<div class="historial-vacio">Error al cargar historial</div>';
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ADMIN
    // ══════════════════════════════════════════════════════════════════════════
    function adminTab(tab) {
      document.querySelectorAll('.admin-tab').forEach((t,i) => {
        const ids = ['usuarios','sueldos','prestamos'];
        t.classList.toggle('active', ids[i] === tab);
        document.getElementById(`admin-tab-${ids[i]}`).classList.toggle('visible', ids[i] === tab);
      });
      if (tab === 'prestamos') cargarAdminPrestamos();
    }

    async function cargarAdminUsuarios() {
      const loading = document.getElementById('admin-loading-users');
      const lista   = document.getElementById('admin-usuarios-lista');
      loading.style.display = 'flex'; lista.innerHTML = '';

      try {
        const res = await fetch(`/api/banco?action=admin_usuarios&discord_id=${currentUser.id}`);
        const data = await res.json();
        loading.style.display = 'none';

        if (!data.usuarios?.length) {
          lista.innerHTML = '<div class="historial-vacio">No hay usuarios con cuenta bancaria.</div>';
          return;
        }

        lista.innerHTML = data.usuarios.map(u => `
          <div class="usuario-row">
            <div class="ur-info">
              <div class="ur-nombre">${escHtml(u.nombre1 || '?')} ${escHtml(u.apellido1 || '')}</div>
              <div class="ur-rut">${escHtml(u.rut || u.discord_id)}</div>
            </div>
            <div class="ur-saldo">${formatCLP(u.saldo)}</div>
            <div class="ur-acciones">
              <button class="btn-small purple" onclick="abrirModalSaldo('${escHtml(u.discord_id)}','${escHtml(u.nombre1 + ' ' + u.apellido1)}')">
                Ajustar
              </button>
              <button class="btn-small" style="background:rgba(245,158,11,0.15);color:var(--gold);border:1px solid rgba(245,158,11,0.25);"
                onclick="seleccionarParaSueldo('${escHtml(u.discord_id)}','${escHtml(u.nombre1 + ' ' + u.apellido1)}')">
                Sueldos
              </button>
              <button class="btn-small orange" onclick="abrirModalReset('${escHtml(u.discord_id)}','${escHtml(u.nombre1 + ' ' + u.apellido1)}')">
                Resetear
              </button>
            </div>
          </div>
        `).join('');
      } catch(e) {
        loading.style.display = 'none';
        lista.innerHTML = '<div class="historial-vacio">Error al cargar.</div>';
      }
    }

    function abrirModalSaldo(discordId, nombre) {
      adminTargetUser = { discordId, nombre };
      document.getElementById('modal-saldo-label').textContent = `Usuario: ${nombre}`;
      document.getElementById('modal-saldo-monto').value = '';
      document.getElementById('modal-saldo-desc').value  = '';
      document.getElementById('modal-saldo-error').classList.remove('visible');
      document.getElementById('modal-saldo').classList.add('visible');
    }

    async function adminConfirmarSaldo() {
      const monto = document.getElementById('modal-saldo-monto').value.trim();
      const desc  = document.getElementById('modal-saldo-desc').value.trim();
      const errEl = document.getElementById('modal-saldo-error');
      errEl.classList.remove('visible');

      if (!monto || isNaN(parseInt(monto))) {
        errEl.textContent = 'Ingresa un monto válido.';
        errEl.classList.add('visible'); return;
      }

      try {
        const res = await fetch('/api/banco?action=admin_saldo', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ admin_id: currentUser.id, discord_id_target: adminTargetUser.discordId, monto, descripcion: desc }),
        });
        const data = await res.json();
        if (!res.ok) {
          errEl.textContent = data.error || 'Error.';
          errEl.classList.add('visible'); return;
        }
        cerrarModal('modal-saldo');
        cargarAdminUsuarios();
      } catch(e) {
        errEl.textContent = 'Error de conexión.'; errEl.classList.add('visible');
      }
    }

    function abrirModalReset(discordId, nombre) {
      adminTargetUser = { discordId, nombre };
      document.getElementById('modal-reset-label').textContent = `Usuario: ${nombre}`;
      document.getElementById('modal-reset-error').classList.remove('visible');
      document.getElementById('modal-reset').classList.add('visible');
    }

    async function adminConfirmarReset() {
      const errEl = document.getElementById('modal-reset-error');
      errEl.classList.remove('visible');

      try {
        const res = await fetch('/api/banco?action=admin_reset_cuenta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ admin_id: currentUser.id, discord_id_target: adminTargetUser.discordId }),
        });
        const data = await res.json();
        if (!res.ok) {
          errEl.textContent = data.error || 'Error.';
          errEl.classList.add('visible');
          return;
        }
        cerrarModal('modal-reset');
        cargarAdminUsuarios();
      } catch (e) {
        errEl.textContent = 'Error de conexión.';
        errEl.classList.add('visible');
      }
    }

    function seleccionarParaSueldo(discordId, nombre) {
      adminTargetUser = { discordId, nombre };
      adminTab('sueldos');
      document.getElementById('admin-sueldo-target-label').textContent = `Gestionando sueldos de: ${nombre}`;
      document.getElementById('admin-sueldo-form-wrap').style.display = 'flex';
      document.getElementById('admin-sueldo-info').style.display = 'none';
      cargarSueldosTarget(discordId);
    }

    async function cargarSueldosTarget(discordId) {
      const lista = document.getElementById('admin-sueldos-lista-target');
      lista.innerHTML = '<div style="color:rgba(255,255,255,0.3);font-size:12px;">Cargando sueldos...</div>';

      try {
        const res = await fetch(`/api/banco?action=cuenta&discord_id=${discordId}`);
        const data = await res.json();
        const sueldos = data.sueldos || [];

        if (!sueldos.length) {
          lista.innerHTML = '<div class="historial-vacio">Sin sueldos activos.</div>';
          return;
        }

        lista.innerHTML = sueldos.map(s => `
          <div class="sueldo-item">
            <div class="si-info">
              <div class="si-nombre">${escHtml(s.nombre)}</div>
              <div class="si-detalle">${formatCLP(s.monto)} cada ${s.dias} día(s)</div>
            </div>
            <button class="btn-small red" onclick="adminEliminarSueldo(${s.id})">Quitar</button>
          </div>
        `).join('');
      } catch(e) {
        lista.innerHTML = '<div class="historial-vacio">Error al cargar.</div>';
      }
    }

    async function adminCrearSueldo() {
      if (!adminTargetUser) return;
      const nombre = document.getElementById('admin-sueldo-nombre').value.trim();
      const monto  = document.getElementById('admin-sueldo-monto').value.trim();
      const dias   = document.getElementById('admin-sueldo-dias').value.trim();
      const errEl  = document.getElementById('admin-sueldo-error');
      errEl.classList.remove('visible');

      if (!nombre || !monto || !dias) {
        errEl.textContent = 'Completa todos los campos.'; errEl.classList.add('visible'); return;
      }

      try {
        const res = await fetch('/api/banco?action=admin_sueldo_crear', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ admin_id: currentUser.id, discord_id_target: adminTargetUser.discordId, nombre, monto, dias }),
        });
        const data = await res.json();
        if (!res.ok) {
          errEl.textContent = data.error || 'Error.'; errEl.classList.add('visible'); return;
        }
        document.getElementById('admin-sueldo-nombre').value = '';
        document.getElementById('admin-sueldo-monto').value  = '';
        document.getElementById('admin-sueldo-dias').value   = '';
        cargarSueldosTarget(adminTargetUser.discordId);
      } catch(e) {
        errEl.textContent = 'Error de conexión.'; errEl.classList.add('visible');
      }
    }

    async function adminEliminarSueldo(sueldoId) {
      try {
        await fetch(`/api/banco?action=admin_sueldo_borrar&admin_id=${currentUser.id}&sueldo_id=${sueldoId}`, {
          method: 'DELETE',
        });
        cargarSueldosTarget(adminTargetUser.discordId);
      } catch(e) {}
    }

    // ── ADMIN: Préstamos ─────────────────────────────────────────────────────
    let _adminPrestamoFiltroActual = 'pendiente';
    let _adminPrestamoRechazoTarget = null;

    function adminPrestamoFiltro(estado, btnEl) {
      _adminPrestamoFiltroActual = estado;
      document.querySelectorAll('#admin-tab-prestamos .ta-tab').forEach(b => b.classList.remove('active'));
      if (btnEl) btnEl.classList.add('active');
      cargarAdminPrestamos();
    }

    async function actualizarBadgePrestamos() {
      const badge = document.getElementById('admin-prestamos-badge');
      if (!badge) return;
      try {
        const res = await fetch('/api/banco?action=admin_prestamos&estado=pendiente');
        const data = await res.json();
        const n = (data.prestamos || []).length;
        if (n > 0) {
          badge.textContent = ` (${n})`;
          badge.style.display = 'inline';
          badge.style.color = '#fbbf24';
        } else {
          badge.style.display = 'none';
        }
      } catch (e) {}
    }

    async function cargarAdminPrestamos() {
      const loading = document.getElementById('admin-loading-prestamos');
      const lista = document.getElementById('admin-prestamos-lista');
      loading.style.display = 'flex'; lista.innerHTML = '';

      try {
        const res = await fetch(`/api/banco?action=admin_prestamos&estado=${_adminPrestamoFiltroActual}`);
        const data = await res.json();
        loading.style.display = 'none';

        const prestamos = data.prestamos || [];
        if (!prestamos.length) {
          lista.innerHTML = '<div class="historial-vacio">No hay préstamos en este estado.</div>';
          return;
        }

        lista.innerHTML = prestamos.map(p => {
          const nombre = p.nombre1 ? `${escHtml(p.nombre1)} ${escHtml(p.apellido1 || '')}` : escHtml(p.discord_id);
          const pagado = p.monto - p.saldo_pendiente;
          let extra = '';
          if (p.estado === 'aprobado' || p.estado === 'pagado') {
            extra = `<div class="ur-rut" style="margin-top:2px;">Pagado ${formatCLP(pagado)} / ${formatCLP(p.monto)} · cuota ${formatCLP(p.cuota_monto)} c/2 días</div>`;
          } else if (p.estado === 'rechazado' && p.motivo_rechazo) {
            extra = `<div class="ur-rut" style="margin-top:2px;">Motivo: ${escHtml(p.motivo_rechazo)}</div>`;
          }
          const acciones = p.estado === 'pendiente'
            ? `<button class="btn-small green" onclick="adminAprobarPrestamo(${p.id})">Aprobar</button>
               <button class="btn-small red" onclick="abrirModalRechazoPrestamo(${p.id}, '${escHtml(nombre)}')">Rechazar</button>`
            : '';
          return `
            <div class="usuario-row">
              <div class="ur-info">
                <div class="ur-nombre">${nombre} <span style="color:rgba(255,255,255,.35); font-weight:500;">· ${p.cuotas_totales} cuotas</span></div>
                <div class="ur-rut">"${escHtml(p.razon)}"</div>
                ${extra}
              </div>
              <div class="ur-saldo">${formatCLP(p.monto)}</div>
              <div class="ur-acciones">${acciones}</div>
            </div>`;
        }).join('');
      } catch (e) {
        loading.style.display = 'none';
        lista.innerHTML = '<div class="historial-vacio">Error al cargar préstamos.</div>';
      }
    }

    async function adminAprobarPrestamo(id) {
      try {
        const res = await fetch('/api/banco?action=admin_prestamo_aprobar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prestamo_id: id }),
        });
        const data = await res.json();
        if (!res.ok) { alert(data.error || 'Error al aprobar el préstamo.'); return; }
        cargarAdminPrestamos();
        actualizarBadgePrestamos();
      } catch (e) {}
    }

    function abrirModalRechazoPrestamo(id, nombre) {
      _adminPrestamoRechazoTarget = id;
      document.getElementById('modal-prestamo-rechazar-label').textContent = `Préstamo de: ${nombre}`;
      document.getElementById('modal-prestamo-rechazar-motivo').value = '';
      document.getElementById('modal-prestamo-rechazar-error').classList.remove('visible');
      document.getElementById('modal-prestamo-rechazar').classList.add('visible');
    }

    async function adminConfirmarRechazoPrestamo() {
      const motivo = document.getElementById('modal-prestamo-rechazar-motivo').value.trim();
      const errEl = document.getElementById('modal-prestamo-rechazar-error');
      errEl.classList.remove('visible');

      try {
        const res = await fetch('/api/banco?action=admin_prestamo_rechazar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prestamo_id: _adminPrestamoRechazoTarget, motivo }),
        });
        const data = await res.json();
        if (!res.ok) {
          errEl.textContent = data.error || 'Error.'; errEl.classList.add('visible'); return;
        }
        cerrarModal('modal-prestamo-rechazar');
        cargarAdminPrestamos();
        actualizarBadgePrestamos();
      } catch (e) {
        errEl.textContent = 'Error de conexión.'; errEl.classList.add('visible');
      }
    }

    function cerrarModal(id) {
      document.getElementById(id).classList.remove('visible');
    }

    // Cerrar modal al hacer click fuera
    document.getElementById('modal-editar-prod').addEventListener('click', function(e) {
      if (e.target === this) cerrarModal('modal-editar-prod');
    });
    document.getElementById('modal-top-ricos').addEventListener('click', function(e) {
      if (e.target === this) cerrarModal('modal-top-ricos');
    });

    // ══════════════════════════════════════════════════════════════════════════

    // ── Contactos ─────────────────────────────────────────────────────────────
    async function mostrarContactos() {
      navegarBanco('contactos');
      await cargarContactos();
    }

    async function cargarContactos() {
      const lista = document.getElementById('contactos-lista');
      lista.innerHTML = '<div class="historial-vacio">Cargando...</div>';
      try {
        const res = await fetch('/api/banco?action=contactos');
        const data = await res.json();
        const contactos = data.contactos || [];
        _contactosCache = {};
        contactos.forEach(c => { _contactosCache[c.rut] = c.nombre; });
        if (!contactos.length) {
          lista.innerHTML = '<div class="historial-vacio">No tienes contactos guardados aún</div>';
          return;
        }
        lista.innerHTML = contactos.map(c => `
          <div class="historial-item" style="cursor:default;">
            <div class="hi-icono ingreso" style="background:rgba(139,92,246,0.15); color:#8B5CF6;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <div class="hi-desc" style="flex:1;">
              <div class="hi-desc-titulo">${escHtml(c.nombre)}</div>
              <div class="hi-desc-fecha">${escHtml(c.rut)}</div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;">
              <button class="btn-small" style="background:rgba(16,185,129,0.12);color:#10B981;border:1px solid rgba(16,185,129,0.25);font-size:11px;padding:4px 10px;"
                onclick="transferirAContacto('${escHtml(c.rut)}')">Transferir</button>
              <button class="btn-small red" style="font-size:11px;padding:4px 10px;"
                onclick="eliminarContacto(${Number(c.id)})">✕</button>
            </div>
          </div>
        `).join('');
      } catch(e) {
        lista.innerHTML = '<div class="historial-vacio">Error al cargar contactos</div>';
      }
    }

    function mostrarFormAgregarContacto() {
      const form = document.getElementById('contactos-agregar-form');
      form.style.display = 'flex';
      document.getElementById('btn-mostrar-agregar-contacto').style.display = 'none';
      document.getElementById('nuevo-contacto-nombre').value = '';
      document.getElementById('nuevo-contacto-rut').value = '';
      document.getElementById('contacto-error').classList.remove('visible');
    }

    function ocultarFormAgregarContacto() {
      document.getElementById('contactos-agregar-form').style.display = 'none';
      document.getElementById('btn-mostrar-agregar-contacto').style.display = '';
    }

    async function agregarContacto() {
      const nombre = document.getElementById('nuevo-contacto-nombre').value.trim();
      const rut    = document.getElementById('nuevo-contacto-rut').value.trim();
      const errEl  = document.getElementById('contacto-error');
      errEl.classList.remove('visible');

      if (!nombre || !rut) {
        errEl.textContent = 'Completa el nombre y el RUT.';
        errEl.classList.add('visible'); return;
      }

      try {
        const res = await fetch('/api/banco?action=contacto_agregar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre, rut }),
        });
        const data = await res.json();
        if (!res.ok) {
          errEl.textContent = data.error || 'Error al guardar.';
          errEl.classList.add('visible'); return;
        }
        ocultarFormAgregarContacto();
        await cargarContactos();
      } catch(e) {
        errEl.textContent = 'Error de conexión.';
        errEl.classList.add('visible');
      }
    }

    async function eliminarContacto(id) {
      try {
        await fetch(`/api/banco?action=contacto_borrar&id=${id}`, { method: 'DELETE' });
        await cargarContactos();
      } catch(e) {}
    }

    function transferirAContacto(rut) {
      mostrarTransferir();
      document.getElementById('transfer-rut').value = rut;
      document.getElementById('transfer-monto').focus();
    }

    // ── Top 10 Más Ricos ──────────────────────────────────────────────────────
    function claseRango(pos) {
      if (pos === 1) return 'gold';
      if (pos === 2) return 'silver';
      if (pos === 3) return 'bronze';
      return 'other';
    }

    function iniciales(nombre) {
      if (!nombre) return '?';
      return nombre.trim().charAt(0).toUpperCase();
    }

    async function abrirModalTopRicos() {
      document.getElementById('modal-top-ricos').classList.add('visible');
      document.getElementById('tr-mi-posicion').style.display = 'none';
      const lista = document.getElementById('tr-lista');
      lista.innerHTML = `
        <div class="skeleton-wrap">
          <div class="skeleton-line" style="height:44px;border-radius:12px;"></div>
          <div class="skeleton-line" style="height:44px;border-radius:12px;"></div>
          <div class="skeleton-line" style="height:44px;border-radius:12px;"></div>
          <div class="skeleton-line" style="height:44px;border-radius:12px;"></div>
        </div>`;

      try {
        const res = await fetch(`/api/banco?action=top10&discord_id=${currentUser.id}`);
        const data = await res.json();
        const ranking = data.ranking || [];

        if (ranking.length === 0) {
          lista.innerHTML = '<div class="tr-empty">Todavía no hay cuentas bancarias registradas.</div>';
          return;
        }

        lista.innerHTML = ranking.map((r, i) => {
          const esYo = r.discord_id === currentUser.id;
          const nombre = r.discord_username ? `@${escHtml(r.discord_username)}` : `Ciudadano ${r.discord_id.slice(-4)}`;
          return `
            <div class="tr-row ${esYo ? 'tr-yo' : ''} tr-top${r.posicion <= 3 ? r.posicion : ''}" style="animation-delay:${i * 40}ms;">
              <div class="tr-pos ${claseRango(r.posicion)}">${r.posicion}</div>
              <div class="tr-avatar">${iniciales(r.discord_username || 'C')}</div>
              <div class="tr-info">
                <div class="tr-nombre">${nombre}</div>
              </div>
              <div class="tr-saldo" id="tr-monto-${i}">$0</div>
            </div>`;
        }).join('');

        ranking.forEach((r, i) => {
          const el = document.getElementById(`tr-monto-${i}`);
          ccAnimateNumber(el, r.saldo, formatCLP, 700 + i * 60);
        });

        const mp = document.getElementById('tr-mi-posicion');
        if (data.miPosicion) {
          mp.style.display = 'flex';
          mp.innerHTML = `
            <span class="tr-mp-label">Tu posición</span>
            <span class="tr-mp-valor">#${data.miPosicion.posicion} · ${formatCLP(data.miPosicion.saldo)}</span>`;
        } else {
          mp.style.display = 'none';
        }
      } catch (e) {
        lista.innerHTML = '<div class="tr-empty">Error al cargar el ranking.</div>';
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // BANCO DE CHILE — vista de tarjeta con efecto 3D al pasar el cursor
    // ══════════════════════════════════════════════════════════════════════════
    let _bdcTiltRaf = null;
    const _bdcReduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function mostrarVistaTarjeta() {
      const home = document.getElementById('bdc-home-view');
      const card = document.getElementById('bdc-card-view');
      if (!home || !card) return;
      home.style.display = 'none';
      card.style.display = 'flex';
      const flipEl = document.getElementById('bank-card-flip');
      if (flipEl) flipEl.classList.remove('flipped');
      bdcInitTilt();
    }

    function ocultarVistaTarjeta() {
      const home = document.getElementById('bdc-home-view');
      const card = document.getElementById('bdc-card-view');
      if (!home || !card) return;
      card.style.display = 'none';
      home.style.display = 'flex';
    }

    function bdcInitTilt() {
      const el = document.getElementById('bank-card');
      if (!el || el.dataset.tiltInit === '1' || _bdcReduceMotion) return;
      el.dataset.tiltInit = '1';

      function posFromEvent(e) {
        const rect = el.getBoundingClientRect();
        const point = e.touches ? e.touches[0] : e;
        return {
          x: (point.clientX - rect.left) / rect.width,
          y: (point.clientY - rect.top) / rect.height,
        };
      }

      function onMove(e) {
        const { x, y } = posFromEvent(e);
        const rotateY = (x - 0.5) * 16;   // izquierda/derecha
        const rotateX = (0.5 - y) * 12;   // arriba/abajo
        if (_bdcTiltRaf) cancelAnimationFrame(_bdcTiltRaf);
        _bdcTiltRaf = requestAnimationFrame(() => {
          el.style.transform = `perspective(1100px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02,1.02,1.02)`;
          // El brillo/holograma se mueve en dirección opuesta al cursor (1 - x,
          // 1 - y), como el reflejo de luz de una tarjeta real al inclinarla.
          el.style.setProperty('--glare-x', `${(1 - x) * 100}%`);
          el.style.setProperty('--glare-y', `${(1 - y) * 100}%`);
          el.classList.add('bdc-tilting');
        });
      }

      function onLeave() {
        if (_bdcTiltRaf) cancelAnimationFrame(_bdcTiltRaf);
        el.style.transform = 'perspective(1100px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)';
        el.classList.remove('bdc-tilting');
      }

      el.addEventListener('mousemove', onMove);
      el.addEventListener('mouseleave', onLeave);
      el.addEventListener('touchmove', onMove, { passive: true });
      el.addEventListener('touchend', onLeave);
    }

    async function copiarNumeroTarjeta() {
      const numero = document.getElementById('bank-numero')?.textContent?.trim();
      if (!numero) return;
      try {
        await navigator.clipboard.writeText(numero.replace(/\s+/g, ''));
        if (typeof mostrarToast === 'function') mostrarToast('Número de cuenta copiado.', false);
      } catch (e) {
        if (typeof mostrarToast === 'function') mostrarToast('No se pudo copiar.', true);
      }
    }

    // Mantiene sincronizadas las vistas mini (Mis Productos) con los datos
    // reales que ya llenan #bank-saldo y #bank-numero (cargarBanco / mostrarTarjeta).
    (function bdcSetupMiniSync() {
      function syncSaldo() {
        const src = document.getElementById('bank-saldo');
        const dst = document.getElementById('bdc-disponible-mini');
        if (src && dst) dst.textContent = src.textContent;
      }
      function syncNumero() {
        const src = document.getElementById('bank-numero');
        if (!src) return;
        const num = src.textContent.trim();
        const dstFull = document.getElementById('bdc-cuenta-num-mini');
        const dstCorta = document.getElementById('bdc-cuenta-corta');
        if (dstFull) dstFull.textContent = num;
        if (dstCorta) {
          const digits = num.replace(/\D/g, '');
          dstCorta.textContent = digits ? digits.slice(-4) : '0000';
        }
      }
      const saldoEl = document.getElementById('bank-saldo');
      const numeroEl = document.getElementById('bank-numero');
      if (saldoEl) new MutationObserver(syncSaldo).observe(saldoEl, { childList: true, characterData: true, subtree: true });
      if (numeroEl) new MutationObserver(syncNumero).observe(numeroEl, { childList: true, characterData: true, subtree: true });
      syncSaldo();
      syncNumero();
    })();
