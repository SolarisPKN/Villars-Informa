// src/scripts/scroll-animations.js
function initScrollReveal() {
  const reveals = document.querySelectorAll('[data-reveal]');
  if (!reveals.length) return;

  // Asegurar estado inicial oculto con inline styles para mayor control
  reveals.forEach(el => {
    // Si ya tiene la clase visible, la removemos temporalmente
    el.classList.remove('visible');
    // Aplicamos estilo inicial inline (se sobrescribirá con la clase cuando sea visible)
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
  });

  // Pequeño retraso para que el navegador pinte los elementos y la transición de View Transitions se complete
  setTimeout(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          // Aplicar clase y estilos finales
          entry.target.classList.add('visible');
          // Los estilos inline se sobrescriben con la clase, pero aseguramos el estado final
          entry.target.style.opacity = '';
          entry.target.style.transform = '';
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2, rootMargin: '0px 0px -50px 0px' });

    reveals.forEach(el => observer.observe(el));
  }, 150);
}

document.addEventListener('astro:page-load', initScrollReveal);