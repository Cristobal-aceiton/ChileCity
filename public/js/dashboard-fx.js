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

      // OJO: antes esto llamaba getBoundingClientRect() en CADA mousemove,
      // lo que fuerza un recálculo de layout del navegador cientos de veces
      // por segundo (layout thrashing) — carísimo en PCs de bajos recursos.
      // Ahora: el rect se mide una sola vez al entrar el mouse (mouseenter) y
      // se reutiliza mientras el mouse se mueve encima; además el update de
      // las variables CSS se agrupa con requestAnimationFrame para no pintar
      // más rápido de lo que la pantalla puede mostrar.
      let cardRect = null;
      let pendingX = 50, pendingY = 30, rafId = null;

      function flush() {
        rafId = null;
        card.style.setProperty('--mx', pendingX + '%');
        card.style.setProperty('--my', pendingY + '%');
      }

      card.addEventListener('mouseenter', function () {
        cardRect = card.getBoundingClientRect();
      });

      card.addEventListener('mousemove', function (e) {
        if (!cardRect) cardRect = card.getBoundingClientRect();
        pendingX = ((e.clientX - cardRect.left) / cardRect.width) * 100;
        pendingY = ((e.clientY - cardRect.top) / cardRect.height) * 100;
        if (rafId === null) rafId = requestAnimationFrame(flush);
      });

      card.addEventListener('mouseleave', function () {
        cardRect = null;
        pendingX = 50; pendingY = 30;
        if (rafId === null) rafId = requestAnimationFrame(flush);
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
