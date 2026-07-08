    // Parallax sutil del fondo en el landing (mejora visual v9, no afecta lógica de la app)
    (function () {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const bg = document.getElementById('video-bg');
      const overlay = document.querySelector('.overlay');
      if (!bg || !overlay) return;
      let raf = null;
      document.addEventListener('mousemove', (e) => {
        const landing = document.getElementById('landing');
        if (!landing || !landing.classList.contains('active')) return;
        if (raf) return;
        raf = requestAnimationFrame(() => {
          const x = (e.clientX / window.innerWidth - 0.5) * 10;
          const y = (e.clientY / window.innerHeight - 0.5) * 10;
          bg.style.transform = `translate(${x}px, ${y}px) scale(1.03)`;
          overlay.style.transform = `translate(${x * 0.5}px, ${y * 0.5}px)`;
          raf = null;
        });
      });
    })();
