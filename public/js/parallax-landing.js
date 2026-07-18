    // Parallax sutil del fondo en el landing (mejora visual v9, no afecta lógica de la app)
    (function () {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const bg = document.getElementById('bg-fx');
      const overlay = document.querySelector('.overlay');
      if (!bg || !overlay) return;

      const tieneMouse = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

      if (tieneMouse) {
        // Escritorio: parallax que sigue al cursor.
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
      } else {
        // Mobile/táctil: no hay cursor que seguir, así que se anima solo con
        // un vaivén lento (seno) para que el fondo se sienta vivo igual.
        let t = 0;
        function loop() {
          const landing = document.getElementById('landing');
          if (landing && landing.classList.contains('active')) {
            t += 0.002;
            const x = Math.sin(t) * 7;
            const y = Math.cos(t * 0.8) * 5;
            bg.style.transform = `translate(${x}px, ${y}px) scale(1.03)`;
            overlay.style.transform = `translate(${x * 0.5}px, ${y * 0.5}px)`;
          }
          requestAnimationFrame(loop);
        }
        requestAnimationFrame(loop);
      }
    })();
