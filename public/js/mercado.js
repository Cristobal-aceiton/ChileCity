    // ══════════════════════════════════════════════════════════════════════════
    // MERCADO — compraventa de ítems del inventario entre ciudadanos
    // ══════════════════════════════════════════════════════════════════════════
    let mercadoTodasPublicaciones = [];
    let mercadoCategoriaActual = 'todos';
    let mercadoTabActual = 'explorar';
    let mercadoItemSeleccionado = null; // { id, nombre, categoria, imagen_url }
    let mercadoInventarioCache = [];
    let mercadoMisIdsActivos = new Set(); // inventario_id de mis publicaciones activas

    async function cargarMercado() {
      if (!currentUser?.id) return;
      // Vuelve siempre al tab "Explorar" al entrar a la sección.
      document.querySelectorAll('#mercado-screen .ta-tab').forEach((b, i) => b.classList.toggle('active', i === 0));
      document.querySelectorAll('#mercado-screen .admin-ta-seccion').forEach(s => s.classList.remove('visible'));
      document.getElementById('mercado-tab-explorar').classList.add('visible');
      mercadoTabActual = 'explorar';
      await mercadoCargarExplorar();
    }

    function mercadoSetTab(id, btn) {
      mercadoTabActual = id;
      document.querySelectorAll('#mercado-screen .ta-tab').forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');
      document.querySelectorAll('#mercado-screen .admin-ta-seccion').forEach(s => s.classList.remove('visible'));
      const sec = document.getElementById('mercado-tab-' + id);
      if (sec) sec.classList.add('visible');

      if (id === 'explorar') mercadoCargarExplorar();
      if (id === 'mis-publicaciones') mercadoCargarMisPublicaciones();
    }

    // ── EXPLORAR ───────────────────────────────────────────────────────────
    async function mercadoCargarExplorar() {
      document.getElementById('mercado-loading').style.display = 'flex';
      document.getElementById('mercado-grid-wrap').style.display = 'none';
      try {
        const res = await fetch('/api/tienda?action=mercado_listado');
        const data = await res.json();
        mercadoTodasPublicaciones = data.publicaciones || [];

        document.getElementById('mercado-loading').style.display = 'none';
        document.getElementById('mercado-grid-wrap').style.display = 'block';
        const sq = document.getElementById('mercado-search');
        if (sq) sq.value = '';
        mercadoCategoriaActual = 'todos';
        document.querySelectorAll('#mercado-tab-explorar .filtro-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
        mercadoRenderGrid(mercadoTodasPublicaciones);
      } catch (e) {
        document.getElementById('mercado-loading').style.display = 'none';
        document.getElementById('mercado-grid-wrap').style.display = 'block';
        document.getElementById('mercado-grid').innerHTML = '<div class="tienda-empty">Error al cargar el mercado.</div>';
      }
    }

    function mercadoFiltrarCategoria(cat, btn) {
      mercadoCategoriaActual = cat;
      document.querySelectorAll('#mercado-tab-explorar .filtro-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      mercadoAplicarFiltros();
    }

    function mercadoAplicarFiltros() {
      const q = (document.getElementById('mercado-search')?.value || '').trim().toLowerCase();
      let lista = mercadoCategoriaActual === 'todos'
        ? mercadoTodasPublicaciones
        : mercadoTodasPublicaciones.filter(p => p.categoria === mercadoCategoriaActual);
      if (q) lista = lista.filter(p => p.nombre.toLowerCase().includes(q) || (p.descripcion || '').toLowerCase().includes(q));
      mercadoRenderGrid(lista);
    }

    (function () {
      const s = document.getElementById('mercado-search');
      if (s) s.addEventListener('input', mercadoAplicarFiltros);
    })();

    function mercadoRenderGrid(lista) {
      const grid = document.getElementById('mercado-grid');
      if (!lista.length) {
        grid.innerHTML = '<div class="tienda-empty">No hay publicaciones disponibles en esta categoría.</div>';
        return;
      }
      grid.innerHTML = lista.map(p => {
        const esMia = p.vendedor_id === currentUser.id;
        return `
        <div class="producto-card mercado-card">
          <div class="producto-img">
            ${p.imagen_url
              ? `<img src="${escHtml(p.imagen_url)}" alt="${escHtml(p.nombre)}" loading="lazy" onerror="this.parentElement.innerHTML='${catEmoji(p.categoria)}';">`
              : catEmoji(p.categoria)}
          </div>
          <div class="producto-info">
            <div class="producto-nombre">${escHtml(p.nombre)}</div>
            <span class="producto-cat cat-${p.categoria}">${catLabel(p.categoria)}</span>
            <div class="mercado-desc">${escHtml(p.descripcion)}</div>
            <div class="mercado-vendedor">Vendedor: ${escHtml(p.vendedor_nombre || 'Ciudadano')}</div>
            <div class="producto-precio">${formatCLP(p.precio)}</div>
            <button class="btn-comprar${esMia ? ' btn-ya-tienes' : ''}"
              ${esMia ? 'disabled title="Es tu propia publicación"' : `onclick="mercadoComprar(${p.id}, this)"`}>
              ${esMia ? 'Tu publicación' : 'Comprar'}
            </button>
          </div>
        </div>`;
      }).join('');
    }

    async function mercadoComprar(publicacionId, btn) {
      if (!currentUser?.id) { mostrarToast('Debes iniciar sesión.', true); return; }
      btn.disabled = true;
      const textoOriginal = btn.textContent;
      btn.textContent = 'Comprando...';

      try {
        const res = await fetch('/api/tienda?action=mercado_comprar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ publicacion_id: publicacionId }),
        });
        const data = await res.json();
        if (!res.ok) {
          const msg = data.faltante
            ? `Fondos insuficientes. Te faltan ${formatCLP(data.faltante)}.`
            : (data.error || 'Error al comprar.');
          mostrarToast(msg, true);
          btn.disabled = false;
          btn.textContent = textoOriginal;
        } else {
          if (currentCuenta) {
            currentCuenta.saldo = data.nuevoSaldo;
            const saldoEl = document.getElementById('bank-saldo');
            if (saldoEl) saldoEl.textContent = formatCLP(data.nuevoSaldo);
          }
          mostrarToast('¡Compra realizada con éxito!');
          mercadoTodasPublicaciones = mercadoTodasPublicaciones.filter(p => p.id !== publicacionId);
          mercadoAplicarFiltros();
        }
      } catch (e) {
        mostrarToast('Error de conexión.', true);
        btn.disabled = false;
        btn.textContent = textoOriginal;
      }
    }

    // ── MIS PUBLICACIONES ──────────────────────────────────────────────────
    async function mercadoCargarMisPublicaciones() {
      document.getElementById('mercado-mias-loading').style.display = 'flex';
      document.getElementById('mercado-mias-wrap').style.display = 'none';
      try {
        const res = await fetch('/api/tienda?action=mercado_mis_publicaciones');
        const data = await res.json();
        const pubs = data.publicaciones || [];
        mercadoMisIdsActivos = new Set(pubs.filter(p => p.activa).map(p => p.inventario_id));

        document.getElementById('mercado-mias-loading').style.display = 'none';
        document.getElementById('mercado-mias-wrap').style.display = 'block';

        const lista = document.getElementById('mercado-mias-lista');
        if (!pubs.length) {
          lista.innerHTML = '<div class="tienda-empty">Aún no has publicado nada en el mercado.</div>';
          return;
        }
        lista.innerHTML = pubs.map(p => {
          const fecha = new Date(p.created_at).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' });
          let estadoHtml;
          if (p.activa) {
            estadoHtml = `<span class="pp-estado pp-estado-ok">En venta</span>`;
          } else if (p.comprador_id) {
            estadoHtml = `<span class="pp-estado pp-estado-pend" style="background:rgba(99,102,241,.15);color:#a5b4fc;">Vendido</span>`;
          } else {
            estadoHtml = `<span class="pp-estado" style="background:rgba(107,114,128,.15);color:#9ca3af;">Dado de baja</span>`;
          }
          return `
          <div class="mercado-mia-card">
            <div class="apr-img">
              ${p.imagen_url
                ? `<img src="${escHtml(p.imagen_url)}" alt="${escHtml(p.nombre)}" loading="lazy" onerror="this.parentElement.innerHTML='${catEmoji(p.categoria)}';">`
                : catEmoji(p.categoria)}
            </div>
            <div class="apr-info">
              <div class="apr-nombre">${escHtml(p.nombre)}</div>
              <div class="apr-meta">${catLabel(p.categoria)} · Publicado el ${fecha}</div>
              <div class="mercado-desc" style="margin-top:4px;">${escHtml(p.descripcion)}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
              <div class="apr-precio">${formatCLP(p.precio)}</div>
              ${estadoHtml}
              ${p.activa ? `<button class="btn-small red" onclick="mercadoDespublicar(${p.id}, this)">Bajar publicación</button>` : ''}
            </div>
          </div>`;
        }).join('');
      } catch (e) {
        document.getElementById('mercado-mias-loading').style.display = 'none';
        document.getElementById('mercado-mias-wrap').style.display = 'block';
        document.getElementById('mercado-mias-lista').innerHTML = '<div class="tienda-empty">Error al cargar tus publicaciones.</div>';
      }
    }

    async function mercadoDespublicar(publicacionId, btn) {
      btn.disabled = true;
      btn.textContent = 'Bajando...';
      try {
        const res = await fetch('/api/tienda?action=mercado_despublicar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ publicacion_id: publicacionId }),
        });
        const data = await res.json();
        if (!res.ok) {
          mostrarToast(data.error || 'Error al bajar la publicación.', true);
          btn.disabled = false;
          btn.textContent = 'Bajar publicación';
          return;
        }
        mostrarToast('Publicación dada de baja.');
        mercadoCargarMisPublicaciones();
      } catch (e) {
        mostrarToast('Error de conexión.', true);
        btn.disabled = false;
        btn.textContent = 'Bajar publicación';
      }
    }

    // ── MODAL: PUBLICAR ─────────────────────────────────────────────────────
    async function mercadoAbrirModalPublicar() {
      if (!currentUser?.id) { mostrarToast('Debes iniciar sesión.', true); return; }
      document.getElementById('modal-mercado-publicar').classList.add('visible');
      mercadoItemSeleccionado = null;
      document.getElementById('mercado-pub-form').style.display = 'none';
      document.getElementById('mercado-pub-btn').disabled = true;
      document.getElementById('mercado-pub-error').classList.remove('visible');
      document.getElementById('mercado-pub-descripcion').value = '';
      document.getElementById('mercado-pub-precio').value = '';

      const loadingEl = document.getElementById('mercado-pub-items-loading');
      const listaEl = document.getElementById('mercado-pub-items-lista');
      const emptyEl = document.getElementById('mercado-pub-items-empty');
      loadingEl.style.display = 'block';
      listaEl.style.display = 'none';
      emptyEl.style.display = 'none';

      try {
        const [resInv, resPub] = await Promise.all([
          fetch(`/api/tienda?action=inventario`),
          fetch(`/api/tienda?action=mercado_mis_publicaciones`),
        ]);
        const dataInv = await resInv.json();
        const dataPub = await resPub.json();
        mercadoInventarioCache = dataInv.items || [];
        mercadoMisIdsActivos = new Set((dataPub.publicaciones || []).filter(p => p.activa).map(p => p.inventario_id));

        const disponibles = mercadoInventarioCache.filter(it => !mercadoMisIdsActivos.has(it.id));
        loadingEl.style.display = 'none';

        if (!disponibles.length) {
          emptyEl.style.display = 'block';
          return;
        }
        listaEl.style.display = 'flex';
        listaEl.innerHTML = disponibles.map(it => `
          <div class="mercado-pub-item-row" data-item-id="${it.id}" onclick="mercadoSeleccionarItem(${it.id})">
            <div class="iai-img">
              ${it.imagen_url
                ? `<img src="${escHtml(it.imagen_url)}" alt="${escHtml(it.nombre)}" loading="lazy" onerror="this.parentElement.innerHTML='${catEmoji(it.categoria)}';">`
                : catEmoji(it.categoria)}
            </div>
            <div class="iai-info">
              <div class="iai-nombre">${escHtml(it.nombre)}</div>
              <div class="iai-meta">${catLabel(it.categoria)}</div>
            </div>
          </div>`).join('');
      } catch (e) {
        loadingEl.style.display = 'none';
        emptyEl.textContent = 'Error al cargar tu inventario.';
        emptyEl.style.display = 'block';
      }
    }

    function mercadoSeleccionarItem(itemId) {
      const item = mercadoInventarioCache.find(it => it.id === itemId);
      if (!item) return;
      mercadoItemSeleccionado = item;

      document.querySelectorAll('#mercado-pub-items-lista .mercado-pub-item-row').forEach(row => {
        row.classList.toggle('selected', Number(row.dataset.itemId) === itemId);
      });
      document.getElementById('mercado-pub-nombre').textContent = `${item.nombre} (${catLabel(item.categoria)})`;
      document.getElementById('mercado-pub-form').style.display = 'flex';
      document.getElementById('mercado-pub-btn').disabled = false;
    }

    async function mercadoConfirmarPublicar() {
      const errEl = document.getElementById('mercado-pub-error');
      errEl.classList.remove('visible');

      if (!mercadoItemSeleccionado) {
        errEl.textContent = 'Selecciona un ítem de tu inventario.';
        errEl.classList.add('visible');
        return;
      }
      const descripcion = document.getElementById('mercado-pub-descripcion').value.trim();
      const precio = document.getElementById('mercado-pub-precio').value;

      if (!descripcion) {
        errEl.textContent = 'Debes escribir una descripción.';
        errEl.classList.add('visible');
        return;
      }
      if (!precio || Number(precio) <= 0 || !Number.isInteger(Number(precio))) {
        errEl.textContent = 'Ingresa un precio válido.';
        errEl.classList.add('visible');
        return;
      }

      const btn = document.getElementById('mercado-pub-btn');
      btn.disabled = true;
      btn.textContent = 'Publicando...';

      try {
        const res = await fetch('/api/tienda?action=mercado_publicar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item_id: mercadoItemSeleccionado.id, descripcion, precio: Number(precio) }),
        });
        const data = await res.json();
        if (!res.ok) {
          errEl.textContent = data.error || 'Error al publicar.';
          errEl.classList.add('visible');
          btn.disabled = false;
          btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Publicar`;
          return;
        }
        cerrarModal('modal-mercado-publicar');
        mostrarToast('¡Publicado en el mercado!');
        btn.disabled = false;
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Publicar`;
        mercadoCargarMisPublicaciones();
        mercadoCargarExplorar();
      } catch (e) {
        errEl.textContent = 'Error de conexión.';
        errEl.classList.add('visible');
        btn.disabled = false;
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Publicar`;
      }
    }

    // Cerrar modal al hacer click fuera
    document.getElementById('modal-mercado-publicar')?.addEventListener('click', function (e) {
      if (e.target === this) cerrarModal('modal-mercado-publicar');
    });
