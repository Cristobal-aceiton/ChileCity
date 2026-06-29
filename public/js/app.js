    // ── Super Admin ID (solo para resaltar visualmente su fila en el Panel
    // Admin; la autorización real ya se valida en el servidor con la sesión) ──
    const SUPER_ADMIN_ID = "1192236737565577287";

    // ── Estado global de sesión ───────────────────────────────────────────────
    // Todas las variables de sesión viven aquí. Para resetear la sesión completa
    // usa resetEstado() — no las borres una por una en distintos archivos.
    let currentUser     = null;  // objeto Discord del usuario logueado
    let currentDNI      = null;  // datos del carnet (dni, nombre, etc.)
    let currentCuenta   = null;  // datos de la cuenta bancaria
    let adminTargetUser = null;  // usuario objetivo en panel admin banco
    let countdownInterval = null; // intervalo del countdown de sueldo

    function resetEstado() {
      currentUser = null;
      currentDNI  = null;
      currentCuenta = null;
      adminTargetUser = null;
      if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    }

    // ── Pantallas ─────────────────────────────────────────────────────────────
    const screens = ['landing','dashboard','registro-civil','banco-screen','admin-screen','tienda-screen','inventario-screen','admin-tienda-screen','perfil-publico-screen','panel-admin-screen','comisaria-screen','casino-screen','apuestas-screen','admin-casino-screen','error-403','error-404'];

    // ── Indicador de sección activa ──────────────────────────────────────────
    let _sectionIndicatorTimer = null;
    function mostrarIndicadorSeccion(id) {
      const labels = {
        'landing': null,
        'dashboard': null,
        'registro-civil': 'Registro Civil',
        'banco-screen': 'Banco',
        'admin-screen': 'Admin Banco',
        'tienda-screen': 'Tienda',
        'inventario-screen': 'Inventario',
        'admin-tienda-screen': 'Admin Tienda',
        'perfil-publico-screen': 'Perfil Público',
        'panel-admin-screen': 'Panel Admin',
        'comisaria-screen': 'Comisaría Virtual',
        'casino-screen': 'Casino',
        'apuestas-screen': 'Apuestas',
        'admin-casino-screen': 'Admin Casino',
      };
      const label = labels[id];
      let indicator = document.getElementById('section-indicator');
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'section-indicator';
        document.body.appendChild(indicator);
      }
      if (!label) { indicator.classList.remove('si-visible'); return; }
      indicator.textContent = label;
      indicator.classList.add('si-visible');
      clearTimeout(_sectionIndicatorTimer);
      _sectionIndicatorTimer = setTimeout(() => indicator.classList.remove('si-visible'), 1800);
    }

    function mostrarPantalla(id) {
      const prev = screens.find(s => {
        const el = document.getElementById(s);
        return el && el.classList.contains('active');
      });
      const isDashToSection = prev === 'dashboard' && id !== 'dashboard' && id !== 'landing';
      const isSectionToDash = id === 'dashboard' && prev !== 'landing';

      screens.forEach(s => {
        const el = document.getElementById(s);
        if (!el) return;
        if (s === id) {
          el.classList.add('active');
          if (isDashToSection) {
            el.classList.add('screen-enter');
            requestAnimationFrame(() => {
              requestAnimationFrame(() => el.classList.remove('screen-enter'));
            });
          } else if (isSectionToDash) {
            el.classList.add('screen-return');
            requestAnimationFrame(() => {
              requestAnimationFrame(() => el.classList.remove('screen-return'));
            });
          }
        } else {
          el.classList.remove('active');
        }
      });
      mostrarIndicadorSeccion(id);
    }

    function volverDashboard() { mostrarPantalla('dashboard'); _navegandoProgramaticamente = true; window.history.pushState({ screen: 'dashboard' }, '', '/'); setTimeout(() => { _navegandoProgramaticamente = false; }, 50); }

    
    async function goToDashboard(user) {
      currentUser = user;
      document.getElementById('discord-name').textContent = user.name;
      document.getElementById('discord-tag').textContent  = user.tag || '';
      document.getElementById('discord-avatar').src       = user.avatar;
      document.getElementById('welcome-msg').textContent  = `Hola, ${user.name}`;

      // Verificar mi propio estado de admin contra la BD (action=verificar es
      // accesible para cualquier sesión válida). Antes se usaba action=listar,
      // que el backend reserva solo al super admin y devuelve 403 para el
      // resto — por eso a los admins agregados nunca les aparecían sus
      // paneles, y por eso a ti tampoco te aparecía el de Casino (que depende
      // de user.esAdmin, valor que nunca llegaba a asignarse).
      try {
        const r = await fetch('/api/admin?action=verificar');
        if (r.ok) {
          const data = await r.json();
          user.esAdmin = data.esAdmin;
          user.esSuperAdmin = data.esSuperAdmin;
        }
      } catch {}

      // Mostrar card admin banco si corresponde
      const adminCard = document.getElementById('admin-card');
      if (user.esAdmin) {
        adminCard.style.display = 'flex';
        adminCard.onclick = () => { abrirSeccion('admin-screen'); cargarAdminUsuarios(); };
      } else {
        adminCard.style.display = 'none';
      }

      // Mostrar card admin tienda si corresponde
      const adminTiendaCard = document.getElementById('admin-tienda-card');
      if (user.esAdmin) {
        adminTiendaCard.style.display = 'flex';
        adminTiendaCard.onclick = () => { abrirSeccion('admin-tienda-screen'); cargarAdminProductos(); };
      } else {
        adminTiendaCard.style.display = 'none';
      }

      // Mostrar card Panel Admin solo al super admin (verificado por el servidor)
      const panelAdminCard = document.getElementById('panel-admin-card');
      if (user.esSuperAdmin) {
        panelAdminCard.style.display = 'flex';
        panelAdminCard.onclick = () => { abrirSeccion('panel-admin-screen'); paCargarAdmins(); gpCargarPolicias(); };
      } else {
        panelAdminCard.style.display = 'none';
      }

      // Mostrar card Admin Casino a todos los admins
      const adminCasinoCard = document.getElementById('admin-casino-card');
      if (user.esAdmin) {
        adminCasinoCard.style.display = 'flex';
      } else {
        adminCasinoCard.style.display = 'none';
      }

      mostrarPantalla('dashboard');
    }

    function goToLanding() {
      resetEstado();
      // La sesión ahora vive en una cookie httpOnly del servidor; se cierra
      // pidiéndole al servidor que la borre (antes solo se borraba un dato
      // en localStorage, que ni siquiera era la fuente real de verdad).
      fetch('/api/logout', { method: 'POST' }).catch(() => {});
      mostrarPantalla('landing');
    }

    let _navegandoProgramaticamente = false;

    function abrirSeccion(id) {
      mostrarPantalla(id);
      _navegandoProgramaticamente = true;
      window.history.pushState({ screen: id }, '', '/');
      setTimeout(() => { _navegandoProgramaticamente = false; }, 50);
    }

    // Interceptar botón atrás del navegador/celular
    window.addEventListener('popstate', () => {
      if (_navegandoProgramaticamente) return;
      if (currentUser) {
        mostrarPantalla('dashboard');
        _navegandoProgramaticamente = true;
        window.history.pushState({ screen: 'dashboard' }, '', '/');
        setTimeout(() => { _navegandoProgramaticamente = false; }, 50);
      }
    });

    // ── Login desde URL params o sesión guardada ──────────────────────────────
    document.getElementById('f-fecha').max = new Date().toISOString().split('T')[0];

    // La identidad ya no se lee de la URL ni de localStorage (cualquiera podía
    // editar esos valores y hacerse pasar por otro usuario). Ahora se le
    // pregunta al servidor quién está autenticado según la cookie de sesión
    // firmada que dejó /api/callback al iniciar sesión con Discord.
    (async function initSesion() {
      try {
        const r = await fetch('/api/me');
        if (r.ok) {
          const data = await r.json();
          if (data.autenticado) {
            const user = {
              id: data.id,
              name: data.name,
              tag: data.tag,
              avatar: data.avatar,
              esSuperAdmin: data.esSuperAdmin,
            };
            window.history.replaceState({ screen: 'dashboard' }, '', '/');
            goToDashboard(user);
          }
        }
      } catch {}
    })();

    // ── User pill ─────────────────────────────────────────────────────────────
    document.getElementById('user-pill').addEventListener('click', (e) => {
      if (e.target.closest('#logout-btn')) return;
      document.getElementById('user-pill').classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (!document.getElementById('user-pill').contains(e.target))
        document.getElementById('user-pill').classList.remove('open');
    });
    document.getElementById('logout-btn').addEventListener('click', () => {
      document.getElementById('user-pill').classList.remove('open');
      goToLanding();
    });


    // ── Utilidades globales ──────────────────────────────────────────────────
    // Función única de escape HTML (antes: escHtml en tienda/admin-tienda,
    // cvEsc en comisaria — ahora una sola definición global)
    function escHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    // Función única de formato de pesos CLP (antes: formatearSaldo, apFmt, casinoFmt)
    function formatCLP(n) {
      return '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');
    }

    // ── Cerrar modales con Escape ────────────────────────────────────────────
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      // Modales de banco/admin (clase admin-modal-overlay con toggle 'visible')
      ['modal-saldo', 'modal-reset', 'modal-editar-prod'].forEach(id => {
        const el = document.getElementById(id);
        if (el && el.classList.contains('visible')) el.classList.remove('visible');
      });
      // Modal de apuesta deportiva
      const apModal = document.getElementById('ap-modal-overlay');
      if (apModal && apModal.classList.contains('open')) {
        apModal.classList.remove('open');
        if (typeof apPartidoActivo !== 'undefined') { apPartidoActivo = null; apTipoActivo = null; apEleccion = null; }
      }
      // Modal editar partido (admin casino)
      const admModal = document.getElementById('adm-edit-overlay');
      if (admModal && admModal.classList.contains('open')) admModal.classList.remove('open');
    });
