let healthController;

function initHealthPage() {
  healthController?.abort();
  healthController = new AbortController();
  const { signal } = healthController;

  const select = document.querySelector('#pharmacy-select');
  const pharmacyCards = [...document.querySelectorAll('[data-pharmacy-card]')];
  if (select instanceof HTMLSelectElement) {
    const showPharmacy = () => {
      pharmacyCards.forEach((card) => {
        if (card instanceof HTMLElement) card.hidden = card.dataset.pharmacyCard !== select.value;
      });
    };
    select.addEventListener('change', showPharmacy, { signal });
    showPharmacy();
  }

  const dialog = document.querySelector('#health-image-dialog');
  const dialogImage = dialog?.querySelector('img');
  if (dialog instanceof HTMLDialogElement && dialogImage instanceof HTMLImageElement) {
    document.querySelectorAll('[data-health-image]').forEach((button) => {
      button.addEventListener('click', () => {
        dialogImage.src = button.dataset.healthImage || '';
        dialogImage.alt = button.dataset.healthAlt || 'Imagen ampliada';
        dialog.showModal();
      }, { signal });
    });
    dialog.querySelector('[data-dialog-close]')?.addEventListener('click', () => dialog.close(), { signal });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    }, { signal });
    dialog.addEventListener('close', () => {
      dialogImage.removeAttribute('src');
      dialogImage.alt = '';
    }, { signal });
  }
}

document.addEventListener('astro:page-load', initHealthPage);
document.addEventListener('astro:before-swap', () => healthController?.abort());
