// ===== BLOG INDEX - FILTROS DE TAGS =====
document.addEventListener('astro:page-load', () => {
  const buttons = document.querySelectorAll('.tag-filter');
  const cards = document.querySelectorAll('.post-card');

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;

      // Actualizar estilos de botones
      buttons.forEach((b) => {
        b.classList.remove('active');
        b.style.background = 'transparent';
        b.style.color = 'var(--text-light)';
        b.style.borderColor = 'rgba(255,255,255,0.2)';
      });
      btn.classList.add('active');
      btn.style.background = 'var(--border-cyan)';
      btn.style.color = '#0a0a0a';
      btn.style.borderColor = 'var(--border-cyan)';

      // Filtrar cards
      cards.forEach((card) => {
        const tags = card.dataset.tags?.split(',') || [];
        if (tag === 'all' || tags.includes(tag)) {
          card.style.display = '';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });
});