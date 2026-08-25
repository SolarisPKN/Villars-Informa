let controller;
function initBlogFilters() {
  controller?.abort(); controller = new AbortController();
  const buttons = [...document.querySelectorAll('.tag-filter')];
  const cards = [...document.querySelectorAll('.post-card')];
  for (const button of buttons) button.addEventListener('click', () => {
    const tag = button.dataset.tag || 'all';
    for (const candidate of buttons) { const selected = candidate === button; candidate.classList.toggle('active', selected); candidate.setAttribute('aria-pressed', String(selected)); }
    for (const card of cards) { const tags = (card.dataset.tags || '').split(',').filter(Boolean); const link = card.closest('a'); if (link instanceof HTMLElement) link.hidden = tag !== 'all' && !tags.includes(tag); }
  }, { signal: controller.signal });
}
document.addEventListener('astro:page-load', initBlogFilters);
document.addEventListener('astro:before-swap', () => controller?.abort());
