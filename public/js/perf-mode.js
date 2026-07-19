// ── perf-mode.js ──────────────────────────────────────────────────────────
// Detecta si el navegador está renderizando "en software" (sin aceleración
// de hardware / GPU) y, si es así, agrega la clase .perf-lite al <html>
// ANTES de que el resto de la página cargue, para apagar los efectos caros
// (blur animado, backdrop-filter "vidrio", fondo de partículas).
//
// Cómo detecta: no existe una API directa para preguntar "¿tengo GPU?", así
// que se mide indirectamente: se dibuja un blur real en un canvas oculto y
// se cronometra cuánto tarda. Si tarda mucho, es señal fuerte de que el
// navegador está resolviendo el blur por CPU (que es exactamente lo lento
// cuando Brave tiene la aceleración de hardware desactivada).
(function () {
  try {
    var manual = localStorage.getItem('cc-perf-lite');
    if (manual === '1') { document.documentElement.classList.add('perf-lite'); return; }
    if (manual === '0') { return; } // el usuario forzó modo completo

    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var pocosNucleos = (navigator.hardwareConcurrency || 8) <= 4;

    var c = document.createElement('canvas');
    c.width = 300; c.height = 300;
    var ctx = c.getContext('2d');
    var lento = false;

    if (ctx) {
      var t0 = performance.now();
      for (var i = 0; i < 6; i++) {
        ctx.clearRect(0, 0, 300, 300);
        ctx.filter = 'blur(20px)';
        ctx.fillStyle = 'red';
        ctx.beginPath();
        ctx.arc(150, 150, 100, 0, Math.PI * 2);
        ctx.fill();
      }
      var t1 = performance.now();
      // Con aceleración de hardware esto tarda ~1-3ms en total. Sin ella,
      // fácilmente pasa de 25-40ms. 15ms es un umbral conservador.
      lento = (t1 - t0) > 15;
    }

    if (lento || (reduce && pocosNucleos)) {
      document.documentElement.classList.add('perf-lite');
    }
  } catch (e) {
    // Si algo falla, no arriesgamos: dejamos todo normal.
  }

  document.addEventListener('visibilitychange', function () {
    document.documentElement.classList.toggle('cc-tab-hidden', document.hidden);
  });
})();
