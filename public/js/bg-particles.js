// ── bg-particles.js ──────────────────────────────────────────────────────
// Genera pequeñas "brasas" rojas flotantes dentro de #bg-particles, dentro
// del fondo global (#bg-fx). Puramente decorativo, no toca lógica de la app.
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  function initBgParticles() {
    const wrap = document.getElementById('bg-particles');
    if (!wrap || wrap.dataset.fxBound) return;
    wrap.dataset.fxBound = '1';

    const COUNT = 28;
    for (let i = 0; i < COUNT; i++) {
      const p = document.createElement('span');
      p.className = 'bg-particle';

      const size = 2 + Math.random() * 4; // 2px - 6px
      const left = Math.random() * 100; // %
      const duration = 6 + Math.random() * 6; // 6s - 12s (rápido)
      const delay = Math.random() * -12; // arranca ya en curso
      const drift = (Math.random() * 80 - 40) + 'px';

      p.style.width = size + 'px';
      p.style.height = size + 'px';
      p.style.left = left + '%';
      p.style.setProperty('--drift', drift);
      p.style.animationDuration = duration + 's';
      p.style.animationDelay = delay + 's';
      p.style.opacity = (0.5 + Math.random() * 0.5).toFixed(2);

      wrap.appendChild(p);
    }
  }

  document.addEventListener('DOMContentLoaded', initBgParticles);
  window.addEventListener('load', initBgParticles);
})();
