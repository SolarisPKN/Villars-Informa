let controller;
function initHealthPagination() {
  controller?.abort(); controller = new AbortController();
  const items = [...document.querySelectorAll('[data-update-index]')]; const controls = document.querySelector('#pagination-controls');
  if (!(controls instanceof HTMLElement) || items.length <= 5) return;
  controls.replaceChildren(); const pages = Math.ceil(items.length / 5);
  const showPage = (page) => { items.forEach((item, index) => { if (item instanceof HTMLElement) item.hidden = Math.floor(index / 5) !== page; }); controls.querySelectorAll('button').forEach((button, index) => button.setAttribute('aria-current', index === page ? 'page' : 'false')); };
  for (let page = 0; page < pages; page += 1) { const button = document.createElement('button'); button.type = 'button'; button.textContent = String(page + 1); button.setAttribute('aria-label', `Página ${page + 1}`); button.addEventListener('click', () => showPage(page), { signal: controller.signal }); controls.append(button); }
  showPage(0);
}
document.addEventListener('astro:page-load', initHealthPagination);
document.addEventListener('astro:before-swap', () => controller?.abort());
