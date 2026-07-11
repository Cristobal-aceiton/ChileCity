    // ══════════════════════════════════════════════════════════════════════════
    // 🚘 TUS AUTOS — el garage del usuario (separado del Inventario genérico)
    // ══════════════════════════════════════════════════════════════════════════
    // Reutiliza el mismo endpoint /api/tienda?action=inventario que ya usan
    // tienda.js e inventario; simplemente se queda solo con los ítems
    // categoria:'vehiculos' y los presenta como tarjetas tipo "patente" en vez
    // de mezclarlos con objetos chicos. No hay endpoints nuevos.

    let misAutosLista = [];

    // Mapa best-effort de nombres de color en español -> hex, para el punto
    // de color de la tarjeta. Si no calza con nada, cae a un gris neutro.
    const AUTO_COLOR_MAP = {
      rojo: '#dc2626', azul: '#2563eb', negro: '#18181b', blanco: '#f4f4f5',
      gris: '#71717a', plata: '#c0c0c0', plomo: '#71717a', verde: '#16a34a',
      amarillo: '#eab308', naranjo: '#f97316', naranja: '#f97316',
      celeste: '#38bdf8', morado: '#7c3aed', purpura: '#7c3aed', violeta: '#7c3aed',
      cafe: '#78350f', marron: '#78350f', dorado: '#d4af37', beige: '#e7dcc8',
      rosado: '#f472b6', rosa: '#f472b6',
    };
    function autoColorHex(colorTexto) {
      if (!colorTexto) return '#71717a';
      const clave = colorTexto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().split(/\s+/)[0];
      return AUTO_COLOR_MAP[clave] || '#71717a';
    }

    async function cargarMisAutos() {
      if (!currentUser?.id) return;
      document.getElementById('mis-autos-loading').style.display = 'flex';
      document.getElementById('mis-autos-wrap').style.display = 'none';

      try {
        const res  = await fetch(`/api/tienda?action=inventario&discord_id=${currentUser.id}`);
        const data = await res.json();
        document.getElementById('mis-autos-loading').style.display = 'none';
        document.getElementById('mis-autos-wrap').style.display = 'block';

        misAutosLista = (data.items || []).filter(item => item.categoria === 'vehiculos');
        renderMisAutos();
      } catch (e) {
        document.getElementById('mis-autos-loading').style.display = 'none';
        document.getElementById('mis-autos-wrap').style.display = 'block';
        document.getElementById('mis-autos-lista').innerHTML = '<div class="tienda-empty">Error al cargar tus autos.</div>';
      }
    }

    function renderMisAutos() {
      const wrap = document.getElementById('mis-autos-lista');
      if (!misAutosLista.length) {
        wrap.innerHTML = `<div class="tienda-empty">Aún no tienes vehículos.<br>Visita el Concesionario para comprar uno.</div>`;
        return;
      }

      wrap.innerHTML = misAutosLista.map(item => {
        const registrado = !!item.vehiculo;
        const patente = registrado ? item.vehiculo.patente : 'SIN·PAT';
        const color   = registrado ? item.vehiculo.color : null;
        const dotColor = autoColorHex(color);

        const acciones = registrado ? `
          <div class="auto-acciones">
            <button class="btn-small green" onclick="event.stopPropagation(); verRegistroVehiculo(${item.vehiculo.id})">
              📄 Ver Registro
            </button>
            <button class="btn-small purple" onclick="event.stopPropagation(); vehAbrirModalTransferencia(${item.vehiculo.id}, '${escJs(item.nombre)}', '${escJs(item.vehiculo.patente)}')">
              🔄 Transferir
            </button>
          </div>` : `
          <div class="auto-acciones">
            <button class="btn-small orange" style="width:100%;justify-content:center;" onclick="event.stopPropagation(); vehAbrirModalRegistro(${item.id}, '${escJs(item.nombre)}')">
              🚗 Registrar Vehículo
            </button>
          </div>`;

        return `
          <div class="auto-card" id="autocard-${item.id}">
            <div class="auto-card-header" onclick="toggleAutoCard(${item.id})">
              <div class="auto-placa">
                <span class="auto-placa-pais">CHILE</span>
                <span class="auto-placa-num">${escHtml(patente)}</span>
              </div>
              <div class="auto-card-info">
                <div class="auto-nombre">${escHtml(item.nombre)}</div>
                <div class="auto-meta">
                  ${color ? `<span class="auto-color-dot" style="background:${dotColor}"></span>${escHtml(color)}` : 'Color sin definir'}
                </div>
              </div>
              <span class="auto-badge ${registrado ? 'auto-badge-ok' : 'auto-badge-pend'}">
                ${registrado ? '🟢 Registrado' : '🟠 Sin Registrar'}
              </span>
              <svg class="auto-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div class="auto-card-body">
              ${acciones}
            </div>
          </div>`;
      }).join('');
    }

    function toggleAutoCard(itemId) {
      const card = document.getElementById(`autocard-${itemId}`);
      if (card) card.classList.toggle('open');
    }
