// ── interactive-bg.js ─────────────────────────────────────────────────────
// Fondo reactivo con partículas conectadas que reaccionan al cursor (o al
// dedo en táctil). Se dibuja dentro de #bg-fx, detrás de todo el contenido.
// Solo se usa en landing (index.html) y dashboard (dashboard.html).
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (document.documentElement.classList.contains('perf-lite')) return;

  function init() {
    const host = document.getElementById('bg-fx');
    if (!host || host.dataset.ccInteractiveBg) return;
    host.dataset.ccInteractiveBg = '1';

    const canvas = document.createElement('canvas');
    canvas.id = 'cc-interactive-bg';
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:1;';
    host.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let w, h, dpr;
    let particles = [];
    let raf = null;
    let running = true;

    const pointer = { x: null, y: null, active: false, radius: 150 };

    function contarParticulas() {
      const area = w * h;
      const n = Math.round(area / 16000);
      return Math.max(28, Math.min(n, 110));
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth = host.clientWidth;
      h = canvas.clientHeight = host.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      crearParticulas();
    }

    function crearParticulas() {
      const n = contarParticulas();
      particles = [];
      for (let i = 0; i < n; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35,
          r: 1 + Math.random() * 1.8
        });
      }
    }

    function paso() {
      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        if (pointer.active) {
          const dx = p.x - pointer.x;
          const dy = p.y - pointer.y;
          const dist2 = dx * dx + dy * dy;
          const radio2 = pointer.radius * pointer.radius;
          if (dist2 < radio2 && dist2 > 0.01) {
            const dist = Math.sqrt(dist2);
            const fuerza = (1 - dist / pointer.radius) * 0.6;
            p.vx += (dx / dist) * fuerza;
            p.vy += (dy / dist) * fuerza;
          }
        }

        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.97;
        p.vy *= 0.97;

        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        p.x = Math.max(0, Math.min(w, p.x));
        p.y = Math.max(0, Math.min(h, p.y));

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,90,90,0.55)';
        ctx.fill();
      }

      const maxDist = 130;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i], b = particles[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < maxDist) {
            const alpha = (1 - dist / maxDist) * 0.18;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(230,40,40,${alpha})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }

      if (pointer.active) {
        const glow = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, pointer.radius);
        glow.addColorStop(0, 'rgba(255,70,70,0.10)');
        glow.addColorStop(1, 'rgba(255,70,70,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(pointer.x, pointer.y, pointer.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      if (running) raf = requestAnimationFrame(paso);
    }

    function setPointer(x, y) {
      const rect = host.getBoundingClientRect();
      pointer.x = x - rect.left;
      pointer.y = y - rect.top;
      pointer.active = true;
    }

    window.addEventListener('resize', resize);

    window.addEventListener('mousemove', (e) => setPointer(e.clientX, e.clientY), { passive: true });
    window.addEventListener('mouseleave', () => { pointer.active = false; }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches[0]) setPointer(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    window.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches[0]) setPointer(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    window.addEventListener('touchend', () => { pointer.active = false; }, { passive: true });

    document.addEventListener('visibilitychange', () => {
      running = !document.hidden;
      if (running && !raf) raf = requestAnimationFrame(paso);
    });

    resize();
    raf = requestAnimationFrame(paso);
  }

  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('load', init);
})();
