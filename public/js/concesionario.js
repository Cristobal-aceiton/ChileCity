    // ══════════════════════════════════════════════════════════════════════════
    // 🏁 CONCESIONARIO — showroom de vehículos (separado de la Tienda)
    // ══════════════════════════════════════════════════════════════════════════
    // Reutiliza exactamente los mismos productos de /api/tienda?action=productos
    // (categoria:'vehiculos') y el mismo flujo de compra que la Tienda
    // (comprarProducto, definida en tienda.js). Solo cambia la presentación:
    // en vez de una grilla de productos genérica, cada auto se muestra como
    // una ficha grande de concesionario.

    let concesionarioVehiculos = [];
    let concesionarioMisIds    = new Set();

    async function cargarConcesionario() {
      if (!currentUser?.id) return;
      document.getElementById('concesionario-loading').style.display = 'flex';
      document.getElementById('concesionario-wrap').style.display = 'none';

      try {
        const [resP, resI] = await Promise.all([
          fetch('/api/tienda?action=productos'),
          fetch(`/api/tienda?action=inventario&discord_id=${currentUser.id}`),
        ]);
        const dataP = await resP.json();
        const dataI = await resI.json();

        concesionarioVehiculos = (dataP.productos || []).filter(p => p.categoria === 'vehiculos');
        concesionarioMisIds    = new Set((dataI.items || []).map(i => i.producto_id));

        document.getElementById('concesionario-loading').style.display = 'none';
        document.getElementById('concesionario-wrap').style.display = 'block';
        renderConcesionario();
      } catch (e) {
        document.getElementById('concesionario-loading').style.display = 'none';
        document.getElementById('concesionario-wrap').style.display = 'block';
        document.getElementById('concesionario-grid').innerHTML = '<div class="tienda-empty">Error al cargar el concesionario.</div>';
      }
    }

    // Se llama después de cualquier compra (ver tienda.js: comprarProducto)
    // para que un auto recién comprado pase a mostrarse como "Ya es tuyo".
    function aplicarFiltrosConcesionario() {
      if (typeof misProductosIds !== 'undefined') {
        misProductosIds.forEach(id => concesionarioMisIds.add(id));
      }
      renderConcesionario();
    }

    // Deriva una "marca" cosmética a partir del nombre del producto (primera
    // palabra), ya que el backend no guarda marca y nombre por separado.
    function concMarca(nombre) {
      const partes = (nombre || '').trim().split(/\s+/);
      return partes.length > 1 ? partes[0] : '';
    }

    function renderConcesionario() {
      const grid = document.getElementById('concesionario-grid');
      if (!concesionarioVehiculos.length) {
        grid.innerHTML = '<div class="tienda-empty">No hay vehículos disponibles en el concesionario por ahora.</div>';
        return;
      }

      grid.innerHTML = concesionarioVehiculos.map(p => {
        const yaComprado = concesionarioMisIds.has(p.id);
        const marca = concMarca(p.nombre);
        return `
        <div class="conc-card">
          <div class="conc-img">
            ${p.imagen_url
              ? `<img src="${escHtml(p.imagen_url)}" alt="${escHtml(p.nombre)}" loading="lazy" onerror="this.parentElement.innerHTML='🚗';">`
              : '🚗'}
            <div class="conc-sticker">
              <span class="conc-sticker-label">Precio</span>
              <span class="conc-sticker-valor">${formatCLP(p.precio)}</span>
            </div>
          </div>
          <div class="conc-info">
            ${marca ? `<div class="conc-marca">${escHtml(marca)}</div>` : ''}
            <div class="conc-nombre">${escHtml(p.nombre)}</div>
            <button class="btn-comprar-showroom${yaComprado ? ' btn-ya-tienes' : ''}"
              ${yaComprado ? 'disabled title="Ya tienes este vehículo"' : `onclick="comprarProducto(${p.id}, this)"`}>
              ${yaComprado ? '✓ Ya es tuyo' : 'Comprar este vehículo'}
            </button>
          </div>
        </div>`;
      }).join('');
    }
