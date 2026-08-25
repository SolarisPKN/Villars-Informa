let controller;
function initLocalFilters() {
  controller?.abort(); controller = new AbortController();
  const search = document.querySelector('#searchInput'); const category = document.querySelector('#categoryFilter'); const clear = document.querySelector('#clearFilters'); const cards = [...document.querySelectorAll('.local-card')];
  if (!(search instanceof HTMLInputElement) || !(category instanceof HTMLSelectElement)) return;
  const filter = () => { const term = search.value.toLocaleLowerCase('es').trim(); for (const card of cards) { if (!(card instanceof HTMLElement)) continue; const name = card.dataset.nombre || ''; const cardCategory = card.dataset.categoria || ''; card.hidden = Boolean((term && !`${name} ${cardCategory}`.includes(term)) || (category.value !== 'all' && cardCategory !== category.value)); } };
  search.addEventListener('input', filter, { signal: controller.signal }); category.addEventListener('change', filter, { signal: controller.signal }); clear?.addEventListener('click', () => { search.value = ''; category.value = 'all'; filter(); search.focus(); }, { signal: controller.signal });
}
document.addEventListener('astro:page-load', initLocalFilters);
document.addEventListener('astro:before-swap', () => controller?.abort());
