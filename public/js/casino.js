// ── Lobby del Casino ──────────────────────────────────────────────────────
// Trae el saldo real desde el banco. Los juegos ya son links directos
// definidos en casino.html (ruleta, moneda, mines).

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

document.addEventListener('DOMContentLoaded', () => {
  cargarSaldoCasino();
});
