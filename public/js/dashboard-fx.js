// ── dashboard-fx.js ──────────────────────────────────────────────────────
// Mejora visual/interactiva de las tarjetas del dashboard (.nav-card):
//  1) Spotlight que sigue al cursor (variables CSS --mx / --my).
//  2) Ripple táctil al hacer click, como feedback físico del botón.
// No modifica ninguna lógica existente de app.js: solo agrega efectos.
(function () {
  function initNavCardFX() {
    document.querySelectorAll('.nav-card').forEach(function (card) {
      if (card.dataset.fxBound) return;
      card.dataset.fxBound = '1';

      card.addEventListener('mousemove', function (e) {
        const rect = card.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        card.style.setProperty('--mx', x + '%');
        card.style.setProperty('--my', y + '%');
      });

      card.addEventListener('mouseleave', function () {
        card.style.setProperty('--mx', '50%');
        card.style.setProperty('--my', '30%');
      });

      card.addEventListener('click', function (e) {
        const rect = card.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height) * 1.2;
        const ripple = document.createElement('span');
        ripple.className = 'cc-ripple';
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
        ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
        card.appendChild(ripple);
        ripple.addEventListener('animationend', function () {
          ripple.remove();
        });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', initNavCardFX);
  window.addEventListener('load', initNavCardFX);
})();
