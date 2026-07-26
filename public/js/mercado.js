    // ══════════════════════════════════════════════════════════════════════════
    // MERCADO — compraventa de ítems del inventario entre ciudadanos
    // ══════════════════════════════════════════════════════════════════════════
    let mercadoTodasPublicaciones = [];
    let mercadoCategoriaActual = 'todos';
    let mercadoTabActual = 'explorar';
    let mercadoInventarioCache = [];
    let mercadoMisIdsActivos = new Set(); // inventario_id de mis publicaciones activas
    let mercadoMisPublicacionesCache = [];

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
      const orden = document.getElementById('mercado-orden')?.value || 'reciente';
      const precioMinRaw = document.getElementById('mercado-precio-min')?.value;
      const precioMaxRaw = document.getElementById('mercado-precio-max')?.value;
      const precioMin = precioMinRaw !== '' && precioMinRaw != null ? Number(precioMinRaw) : null;
      const precioMax = precioMaxRaw !== '' && precioMaxRaw != null ? Number(precioMaxRaw) : null;

      let lista = mercadoCategoriaActual === 'todos'
        ? mercadoTodasPublicaciones
        : mercadoTodasPublicaciones.filter(p => p.categoria === mercadoCategoriaActual);
      if (q) lista = lista.filter(p => p.nombre.toLowerCase().includes(q) || (p.descripcion || '').toLowerCase().includes(q));
      if (precioMin !== null && !Number.isNaN(precioMin)) lista = lista.filter(p => p.precio >= precioMin);
      if (precioMax !== null && !Number.isNaN(precioMax)) lista = lista.filter(p => p.precio <= precioMax);

      lista = [...lista];
      if (orden === 'precio_asc') lista.sort((a, b) => a.precio - b.precio);
      else if (orden === 'precio_desc') lista.sort((a, b) => b.precio - a.precio);
      else if (orden === 'antiguo') lista.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      else lista.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); // reciente (default)

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
        const fecha = p.created_at
          ? new Date(p.created_at).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' })
          : '';
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
            ${fecha ? `<div class="mercado-fecha">Publicado el ${fecha}</div>` : ''}
            <div class="producto-precio">${formatCLP(p.precio)}</div>
            <button class="btn-comprar${esMia ? ' btn-ya-tienes' : ''}"
              ${esMia ? 'disabled title="Es tu propia publicación"' : `onclick="mercadoAbrirConfirmarCompra(${p.id})"`}>
              ${esMia ? 'Tu publicación' : 'Comprar'}
            </button>
          </div>
        </div>`;
      }).join('');
    }

    let mercadoPublicacionAComprar = null;

    function mercadoAbrirConfirmarCompra(publicacionId) {
      if (!currentUser?.id) { mostrarToast('Debes iniciar sesión.', true); return; }
      const pub = mercadoTodasPublicaciones.find(p => p.id === publicacionId);
      if (!pub) { mostrarToast('Esa publicación ya no está disponible.', true); return; }
      mercadoPublicacionAComprar = pub;

      document.getElementById('mercado-confirmar-resumen').innerHTML = `
        Vas a comprar <b>${escHtml(pub.nombre)}</b> a <b>${escHtml(pub.vendedor_nombre || 'Ciudadano')}</b>
        por <b>${formatCLP(pub.precio)}</b>. El monto se descontará de tu cuenta bancaria de inmediato.
      `;
      document.getElementById('mercado-confirmar-error').classList.remove('visible');
      const btn = document.getElementById('mercado-confirmar-btn');
      btn.disabled = false;
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Confirmar compra`;
      document.getElementById('modal-mercado-confirmar-compra').classList.add('visible');
    }

    async function mercadoConfirmarCompra() {
      if (!mercadoPublicacionAComprar) return;
      const publicacionId = mercadoPublicacionAComprar.id;
      const errEl = document.getElementById('mercado-confirmar-error');
      errEl.classList.remove('visible');
      const btn = document.getElementById('mercado-confirmar-btn');
      btn.disabled = true;
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
          errEl.textContent = msg;
          errEl.classList.add('visible');
          btn.disabled = false;
          btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Confirmar compra`;
          // Si ya no está disponible, la sacamos de la grilla para que no la vuelvan a intentar comprar.
          if (res.status === 409) {
            mercadoTodasPublicaciones = mercadoTodasPublicaciones.filter(p => p.id !== publicacionId);
            mercadoAplicarFiltros();
          }
          return;
        }
        if (currentCuenta) {
          currentCuenta.saldo = data.nuevoSaldo;
          const saldoEl = document.getElementById('bank-saldo');
          if (saldoEl) saldoEl.textContent = formatCLP(data.nuevoSaldo);
        }
        cerrarModal('modal-mercado-confirmar-compra');
        mostrarToast('¡Compra realizada con éxito!');
        mercadoTodasPublicaciones = mercadoTodasPublicaciones.filter(p => p.id !== publicacionId);
        mercadoAplicarFiltros();
        mercadoPublicacionAComprar = null;
      } catch (e) {
        errEl.textContent = 'Error de conexión.';
        errEl.classList.add('visible');
        btn.disabled = false;
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Confirmar compra`;
      }
    }

    document.getElementById('modal-mercado-confirmar-compra')?.addEventListener('click', function (e) {
      if (e.target === this) cerrarModal('modal-mercado-confirmar-compra');
    });

    // ── MIS PUBLICACIONES ──────────────────────────────────────────────────
    async function mercadoCargarMisPublicaciones() {
      document.getElementById('mercado-mias-loading').style.display = 'flex';
      document.getElementById('mercado-mias-wrap').style.display = 'none';
      try {
        const res = await fetch('/api/tienda?action=mercado_mis_publicaciones');
        const data = await res.json();
        const pubs = data.publicaciones || [];
        mercadoMisPublicacionesCache = pubs;
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
              ${p.activa ? `
                <button class="btn-small purple" onclick="mercadoAbrirEditar(${p.id})">Editar</button>
                <button class="btn-small red" onclick="mercadoDespublicar(${p.id}, this)">Bajar publicación</button>
              ` : ''}
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

    // ── MODAL: PUBLICAR (selección múltiple) ──────────────────────────────────
    const MERCADO_MAX_ITEMS = 10;
    let mercadoIdsSeleccionados = []; // orden de selección, item ids

    async function mercadoAbrirModalPublicar() {
      if (!currentUser?.id) { mostrarToast('Debes iniciar sesión.', true); return; }
      document.getElementById('modal-mercado-publicar').classList.add('visible');
      mercadoIdsSeleccionados = [];
      document.getElementById('mercado-pub-form').innerHTML = '';
      document.getElementById('mercado-pub-btn').disabled = true;
      document.getElementById('mercado-pub-error').classList.remove('visible');

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
          <div class="mercado-pub-item-row" data-item-id="${it.id}" onclick="mercadoToggleItem(${it.id}, event)">
            <input type="checkbox" onclick="event.stopPropagation(); mercadoToggleItem(${it.id})">
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

    function mercadoToggleItem(itemId) {
      const idx = mercadoIdsSeleccionados.indexOf(itemId);
      if (idx === -1) {
        if (mercadoIdsSeleccionados.length >= MERCADO_MAX_ITEMS) {
          mostrarToast(`Puedes publicar hasta ${MERCADO_MAX_ITEMS} ítems a la vez.`, true);
          return;
        }
        mercadoIdsSeleccionados.push(itemId);
      } else {
        mercadoIdsSeleccionados.splice(idx, 1);
      }
      mercadoRenderFormsPublicar();
    }

    function mercadoRenderFormsPublicar() {
      // Sincroniza el estado visual (checkbox + resaltado) de la lista de ítems.
      document.querySelectorAll('#mercado-pub-items-lista .mercado-pub-item-row').forEach(row => {
        const id = Number(row.dataset.itemId);
        const seleccionado = mercadoIdsSeleccionados.includes(id);
        row.classList.toggle('selected', seleccionado);
        const cb = row.querySelector('input[type=checkbox]');
        if (cb) cb.checked = seleccionado;
      });

      const formWrap = document.getElementById('mercado-pub-form');
      const btn = document.getElementById('mercado-pub-btn');

      if (!mercadoIdsSeleccionados.length) {
        formWrap.innerHTML = '';
        btn.disabled = true;
        return;
      }
      btn.disabled = false;
      formWrap.innerHTML = mercadoIdsSeleccionados.map(id => {
        const item = mercadoInventarioCache.find(it => it.id === id);
        if (!item) return '';
        return `
          <div class="mercado-pub-item-form" data-form-item-id="${id}">
            <div class="mpif-nombre">${escHtml(item.nombre)} <span style="color:rgba(255,255,255,.4);font-weight:400;">(${catLabel(item.categoria)})</span></div>
            <textarea maxlength="300" rows="2" placeholder="Describe el estado, detalles o condiciones de la venta..." data-role="descripcion"></textarea>
            <input type="number" placeholder="Precio ($)" min="1" data-role="precio">
          </div>`;
      }).join('');
    }

    async function mercadoConfirmarPublicar() {
      const errEl = document.getElementById('mercado-pub-error');
      errEl.classList.remove('visible');

      if (!mercadoIdsSeleccionados.length) {
        errEl.textContent = 'Selecciona al menos un ítem de tu inventario.';
        errEl.classList.add('visible');
        return;
      }

      const items = [];
      for (const id of mercadoIdsSeleccionados) {
        const form = document.querySelector(`.mercado-pub-item-form[data-form-item-id="${id}"]`);
        if (!form) continue;
        const descripcion = form.querySelector('[data-role="descripcion"]').value.trim();
        const precio = form.querySelector('[data-role="precio"]').value;
        const item = mercadoInventarioCache.find(it => it.id === id);
        if (!descripcion) {
          errEl.textContent = `Falta la descripción de "${item?.nombre || 'un ítem'}".`;
          errEl.classList.add('visible');
          return;
        }
        if (!precio || Number(precio) <= 0 || !Number.isInteger(Number(precio))) {
          errEl.textContent = `Ingresa un precio válido para "${item?.nombre || 'un ítem'}".`;
          errEl.classList.add('visible');
          return;
        }
        items.push({ item_id: id, descripcion, precio: Number(precio) });
      }

      const btn = document.getElementById('mercado-pub-btn');
      btn.disabled = true;
      btn.textContent = 'Publicando...';

      try {
        const res = await fetch('/api/tienda?action=mercado_publicar_multiple', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items }),
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
        mostrarToast(items.length > 1 ? `¡${items.length} ítems publicados en el mercado!` : '¡Publicado en el mercado!');
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

    // ── MODAL: EDITAR PUBLICACIÓN ────────────────────────────────────────────
    let mercadoPublicacionAEditar = null;

    function mercadoAbrirEditar(publicacionId) {
      const pub = mercadoMisPublicacionesCache.find(p => p.id === publicacionId);
      if (!pub) { mostrarToast('No se encontró esa publicación.', true); return; }
      mercadoPublicacionAEditar = pub;
      document.getElementById('mercado-editar-nombre').textContent = pub.nombre;
      document.getElementById('mercado-editar-descripcion').value = pub.descripcion || '';
      document.getElementById('mercado-editar-precio').value = pub.precio;
      document.getElementById('mercado-editar-error').classList.remove('visible');
      document.getElementById('modal-mercado-editar').classList.add('visible');
    }

    async function mercadoGuardarEdicion() {
      if (!mercadoPublicacionAEditar) return;
      const errEl = document.getElementById('mercado-editar-error');
      errEl.classList.remove('visible');

      const descripcion = document.getElementById('mercado-editar-descripcion').value.trim();
      const precio = document.getElementById('mercado-editar-precio').value;
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

      const btn = document.getElementById('mercado-editar-btn');
      btn.disabled = true;
      btn.textContent = 'Guardando...';

      try {
        const res = await fetch('/api/tienda?action=mercado_editar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            publicacion_id: mercadoPublicacionAEditar.id,
            descripcion,
            precio: Number(precio),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          errEl.textContent = data.error || 'Error al guardar los cambios.';
          errEl.classList.add('visible');
          btn.disabled = false;
          btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Guardar cambios`;
          return;
        }
        cerrarModal('modal-mercado-editar');
        mostrarToast('Publicación actualizada.');
        btn.disabled = false;
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Guardar cambios`;
        mercadoPublicacionAEditar = null;
        mercadoCargarMisPublicaciones();
        if (mercadoTabActual === 'explorar') mercadoCargarExplorar();
      } catch (e) {
        errEl.textContent = 'Error de conexión.';
        errEl.classList.add('visible');
        btn.disabled = false;
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Guardar cambios`;
      }
    }

    document.getElementById('modal-mercado-editar')?.addEventListener('click', function (e) {
      if (e.target === this) cerrarModal('modal-mercado-editar');
    });
