// src/scripts/home-tech.js
function initHome() {
  // ===== CONTADOR DE CHIPS (canvas) - optimizado =====
  const canvas = document.getElementById('chip-canvas');
  const counterEl = document.getElementById('chip-counter');
  if (!canvas || !counterEl) return;

  // Solo ejecutar cuando el navegador esté inactivo
  const startCanvas = () => {
    const ctx = canvas.getContext('2d');
    let count = 0;
    let isRunning = true;
    let timerId = null;
    const MAX_CHIPS = 20; // reducido para móvil
    const INTERVAL = 2500; // más espaciado

    function drawChips(num) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const chipsToDraw = Math.min(num, MAX_CHIPS);
      for (let i = 0; i < chipsToDraw; i++) {
        ctx.fillStyle = `hsl(${Date.now() / 20 + i * 30}, 100%, 60%)`;
        ctx.beginPath();
        ctx.arc(20 + (i % 20) * 38, 50 + Math.floor(i / 20) * 50, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.font = '10px monospace';
        ctx.fillText(`ESP${i}`, 20 + (i % 20) * 38 - 8, 50 + Math.floor(i / 20) * 50 + 4);
      }
    }

    function updateLoop() {
      if (!isRunning) return;
      if (count < MAX_CHIPS) {
        count = Math.min(MAX_CHIPS, count + Math.floor(Math.random() * 3));
      } else {
        count = MAX_CHIPS;
      }
      counterEl.innerText = count;
      drawChips(count);
      timerId = setTimeout(() => {
        requestAnimationFrame(updateLoop);
      }, INTERVAL);
    }

    // Iniciar con retraso
    const startId = setTimeout(() => {
      drawChips(0);
      updateLoop();
    }, 1000);

    // Pausar en pestañas ocultas
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        isRunning = false;
        if (timerId) {
          clearTimeout(timerId);
          timerId = null;
        }
      } else {
        isRunning = true;
        updateLoop();
      }
    });

    // Limpiar en descarga
    window.addEventListener('beforeunload', () => {
      if (timerId) clearTimeout(timerId);
      if (startId) clearTimeout(startId);
    });
  };

  // Usar requestIdleCallback para no bloquear
  if ('requestIdleCallback' in window) {
    requestIdleCallback(startCanvas, { timeout: 3000 });
  } else {
    setTimeout(startCanvas, 1000);
  }

  // ===== EARLY ACCESS BUTTON (sin cambios) =====
  const earlyBait = document.getElementById('early-bait');
  if (earlyBait) {
    const messages = {
      message: earlyBait.dataset.message || '📧 Dejame tu correo y te aviso cuando lance Early Access:',
      success: earlyBait.dataset.success || '✅ Gracias! Te avisaremos pronto. (demo sin backend)',
      invalid: earlyBait.dataset.invalid || 'Correo inválido'
    };
    const newBait = earlyBait.cloneNode(true);
    earlyBait.parentNode.replaceChild(newBait, earlyBait);
    newBait.addEventListener('click', () => {
      const email = prompt(messages.message);
      if (email && email.includes('@')) {
        alert(messages.success);
        console.log('Email capturado:', email);
      } else if (email) {
        alert(messages.invalid);
      }
    });
  }
}

// Ejecutar en carga inicial y cada navegación
document.addEventListener('astro:page-load', initHome);