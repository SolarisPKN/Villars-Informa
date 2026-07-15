export function initHomeCarousel() {
  const track = document.getElementById('carrusel-track');
  const container = document.getElementById('carrusel-container');
  const imagenPrincipal = document.getElementById('imagen-principal');
  if (!track || !container || !imagenPrincipal) return;

  // Obtener todas las miniaturas
  const items = Array.from(track.children);
  if (items.length === 0) return;

  // Duplicar para efecto infinito
  items.forEach(item => {
    const clone = item.cloneNode(true);
    track.appendChild(clone);
  });

  // Variable de control
  let currentTranslateX = 0;
  let speed = 0.5; // velocidad de desplazamiento
  let isPaused = false;
  let isDragging = false;
  let startX = 0;
  let prevTranslateX = 0;
  let animationId = null;

  // Función para actualizar la imagen grande al hacer clic en miniatura
  function setImagenPrincipal(src) {
    imagenPrincipal.src = src;
    // Añadir un pequeño efecto de fade (opcional)
    imagenPrincipal.style.opacity = '0.5';
    setTimeout(() => { imagenPrincipal.style.opacity = '1'; }, 50);
  }

  // Asignar evento click a cada miniatura (original y clon)
  function addClickEvents() {
    const allItems = track.querySelectorAll('.miniatura-item');
    allItems.forEach(item => {
      item.addEventListener('click', () => {
        const src = item.dataset.src;
        if (src) setImagenPrincipal(src);
      });
    });
  }
  addClickEvents();

  // Función de animación
  function animate() {
    if (isPaused || isDragging) {
      animationId = requestAnimationFrame(animate);
      return;
    }
    currentTranslateX -= speed;
    const maxTranslate = -(track.scrollWidth / 2);
    if (currentTranslateX <= maxTranslate) {
      currentTranslateX = 0;
    }
    track.style.transform = `translateX(${currentTranslateX}px)`;
    animationId = requestAnimationFrame(animate);
  }

  // Pausar al hacer hover sobre el carrusel
  container.addEventListener('mouseenter', () => { isPaused = true; });
  container.addEventListener('mouseleave', () => { isPaused = false; });

  // Arrastre con mouse
  container.addEventListener('mousedown', (e) => {
    isDragging = true;
    isPaused = true;
    startX = e.clientX;
    prevTranslateX = currentTranslateX;
    track.style.transition = 'none';
    if (animationId) cancelAnimationFrame(animationId);
  });
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const diff = e.clientX - startX;
    let newX = prevTranslateX + diff;
    const maxX = 0;
    const minX = -(track.scrollWidth / 2);
    if (newX > maxX) newX = maxX;
    if (newX < minX) newX = minX;
    currentTranslateX = newX;
    track.style.transform = `translateX(${newX}px)`;
  });
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      // Reanudar después de un breve tiempo
      setTimeout(() => {
        isPaused = false;
        if (!animationId) animate();
      }, 1000);
    }
  });

  // Arrastre táctil
  container.addEventListener('touchstart', (e) => {
    isDragging = true;
    isPaused = true;
    startX = e.touches[0].clientX;
    prevTranslateX = currentTranslateX;
    track.style.transition = 'none';
    if (animationId) cancelAnimationFrame(animationId);
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const diff = e.touches[0].clientX - startX;
    let newX = prevTranslateX + diff;
    const maxX = 0;
    const minX = -(track.scrollWidth / 2);
    if (newX > maxX) newX = maxX;
    if (newX < minX) newX = minX;
    currentTranslateX = newX;
    track.style.transform = `translateX(${newX}px)`;
  }, { passive: true });
  document.addEventListener('touchend', () => {
    if (isDragging) {
      isDragging = false;
      setTimeout(() => {
        isPaused = false;
        if (!animationId) animate();
      }, 1000);
    }
  }, { passive: true });

  // Iniciar animación
  animate();

  // Limpiar al cerrar
  window.addEventListener('beforeunload', () => {
    if (animationId) cancelAnimationFrame(animationId);
  });
}