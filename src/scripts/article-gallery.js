let articleGalleryController;

function initArticleGallery() {
  articleGalleryController?.abort();
  articleGalleryController = new AbortController();
  const { signal } = articleGalleryController;
  const dialog = document.querySelector('#article-image-dialog');
  const image = dialog?.querySelector('img');
  if (!(dialog instanceof HTMLDialogElement) || !(image instanceof HTMLImageElement)) return;

  document.querySelectorAll('[data-article-image]').forEach((button) => {
    button.addEventListener('click', () => {
      image.src = button.dataset.articleImage || '';
      image.alt = button.dataset.articleAlt || 'Imagen ampliada';
      dialog.showModal();
    }, { signal });
  });

  dialog.querySelector('[data-dialog-close]')?.addEventListener('click', () => dialog.close(), { signal });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  }, { signal });
  dialog.addEventListener('close', () => {
    image.removeAttribute('src');
    image.alt = '';
  }, { signal });
}

document.addEventListener('astro:page-load', initArticleGallery);
document.addEventListener('astro:before-swap', () => articleGalleryController?.abort());
