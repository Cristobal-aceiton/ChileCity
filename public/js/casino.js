// ── Lobby del Casino ──────────────────────────────────────────────────────
// Trae el saldo real desde el banco y conecta el juego 1 (Ruleta).
// Los demás juegos (2 a 6) todavía no existen: al hacer click muestran un
// aviso de "Próximamente" en vez de navegar a ningún lado.

function formatCLP(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');
}

async function cargarSaldoCasino() {
  const el = document.getElementById('saldo');
  if (!el) return;
  try {
    const r = await fetch('/api/banco?action=cuenta', { credentials: 'same-origin' });
    if (r.status === 401) {
      window.location.href = '/';
      return;
    }
    if (!r.ok) throw new Error('No se pudo cargar la cuenta');
    const data = await r.json();
    el.textContent = formatCLP(data.saldo);
  } catch (e) {
    el.textContent = '—';
    console.error('Error cargando saldo del casino:', e);
  }
}

function avisoProximamente(e) {
  e.preventDefault();
  let aviso = document.getElementById('cc-toast-proximamente');
  if (!aviso) {
    aviso = document.createElement('div');
    aviso.id = 'cc-toast-proximamente';
    aviso.textContent = 'Este juego está en construcción 🚧';
    aviso.style.cssText = `
      position:fixed; left:50%; bottom:30px; transform:translateX(-50%);
      background:#1f2937; color:#fff; padding:10px 18px; border-radius:8px;
      font-family:Arial, Helvetica, sans-serif; font-size:14px; z-index:9999;
      box-shadow:0 4px 14px rgba(0,0,0,.35); opacity:0; transition:opacity .2s;
    `;
    document.body.appendChild(aviso);
  }
  aviso.style.opacity = '1';
  clearTimeout(avisoProximamente._t);
  avisoProximamente._t = setTimeout(() => { aviso.style.opacity = '0'; }, 1800);
}

function conectarJuegosCasino() {
  const links = document.querySelectorAll('.juegos-c a');
  links.forEach((a, i) => {
    if (i === 0) {
      // Juego 1: Ruleta — ya está listo.
      a.href = '/ruleta.html';
    } else {
      // Resto de juegos: todavía no existen.
      a.href = '#';
      a.addEventListener('click', avisoProximamente);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  cargarSaldoCasino();
  conectarJuegosCasino();
});
