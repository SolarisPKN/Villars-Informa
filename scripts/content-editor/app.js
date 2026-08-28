const byId = (id) => document.getElementById(id);
const statusBox = byId('status');
const imageUrls = new Set();
let previewTimer;

function slugify(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function setStatus(message, kind = '') {
  statusBox.className = `status ${kind}`;
  statusBox.textContent = message;
  if (message) statusBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'La operación falló.');
  return data;
}

function fillList(id, values) {
  byId(id).replaceChildren(...values.map((value) => {
    const option = document.createElement('option');
    option.value = value;
    return option;
  }));
}

function connectSlug(titleId, slugId) {
  const title = byId(titleId);
  const slug = byId(slugId);
  let touched = false;
  title.addEventListener('input', () => {
    if (!touched) slug.value = slugify(title.value);
  });
  slug.addEventListener('input', () => {
    touched = true;
    slug.value = slugify(slug.value);
  });
}

function editSelection(textarea, button) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end) || (button.dataset.block ? 'código' : 'texto');
  let replacement;
  if (button.hasAttribute('data-link')) replacement = `[${selected}](https://ejemplo.com)`;
  else if (button.dataset.block) replacement = `\n\n\`\`\`javascript\n${selected}\n\`\`\`\n`;
  else replacement = `${button.dataset.prefix || ''}${button.dataset.wrap || ''}${selected}${button.dataset.wrap || ''}`;
  textarea.setRangeText(replacement, start, end, 'select');
  textarea.dispatchEvent(new Event('input'));
  textarea.focus();
}

async function refreshNewsPreview() {
  const markdown = byId('news-content').value;
  const data = await api('/api/preview', { method: 'POST', body: JSON.stringify({ markdown }) });
  byId('news-preview').innerHTML = data.html || '<p class="empty">La vista previa aparecerá acá.</p>';
}

function scheduleNewsPreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => refreshNewsPreview().catch((error) => setStatus(error.message, 'error')), 250);
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`No se pudo leer ${file.name}.`));
    reader.onload = () => resolve({
      name: file.name.replace(/\s+/g, '-'),
      mimeType: file.type,
      base64: String(reader.result).split(',')[1],
    });
    reader.readAsDataURL(file);
  });
}

function objectUrl(file) {
  const url = URL.createObjectURL(file);
  imageUrls.add(url);
  return url;
}

function clearPreviewUrls() {
  for (const url of imageUrls) URL.revokeObjectURL(url);
  imageUrls.clear();
}

function refreshNewsImages() {
  clearPreviewUrls();
  const hero = byId('news-hero').files[0];
  const gallery = [...byId('news-gallery').files];
  const files = [hero, ...gallery].filter(Boolean);
  byId('news-image-summary').textContent = files.length
    ? files.map((file) => `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`).join(' | ')
    : 'Todavía no seleccionaste imágenes.';
  byId('news-image-preview').replaceChildren(...files.map((file, index) => {
    const figure = document.createElement('figure');
    const image = document.createElement('img');
    image.src = objectUrl(file);
    image.alt = index === 0 && hero ? 'Vista previa de portada' : `Vista previa de ${file.name}`;
    const caption = document.createElement('figcaption');
    caption.textContent = index === 0 && hero ? `Portada · ${file.name}` : file.name;
    figure.append(image, caption);
    return figure;
  }));
}

function healthDateLabel(value) {
  if (!value) return 'Hoy';
  return new Date(`${value}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function refreshHealthPreview() {
  const message = byId('health-message').value;
  const remaining = 500 - message.length;
  const counter = byId('health-counter');
  counter.textContent = `${message.length} / 500`;
  counter.dataset.state = remaining < 30 ? 'limit' : remaining < 100 ? 'near' : 'ok';
  byId('health-preview-title').textContent = byId('health-title').value.trim() || 'Actualización de Salud';
  byId('health-preview-date').textContent = healthDateLabel(byId('health-date').value);
  const previewMessage = byId('health-preview-message');
  previewMessage.textContent = message.trim() || 'El mensaje aparecerá acá.';
  previewMessage.classList.toggle('empty', !message.trim());
  const source = byId('health-source').value.trim();
  const sourceUrl = byId('health-source-url').value.trim();
  const footer = byId('health-preview-source');
  footer.hidden = !(source || sourceUrl);
  footer.textContent = source ? `Fuente: ${source}` : 'Fuente enlazada';
}

function refreshHealthImage() {
  clearPreviewUrls();
  const image = byId('health-preview-image');
  const file = byId('health-image').files[0];
  if (!file) {
    image.hidden = true;
    image.removeAttribute('src');
    return;
  }
  image.src = objectUrl(file);
  image.hidden = false;
}

function setBusy(button, busy) {
  button.disabled = busy;
  button.setAttribute('aria-busy', String(busy));
}

byId('news-content').addEventListener('input', scheduleNewsPreview);
document.querySelectorAll('.toolbar button').forEach((button) => button.addEventListener('click', () => {
  editSelection(byId(button.closest('.toolbar').dataset.target), button);
}));
byId('news-hero').addEventListener('change', refreshNewsImages);
byId('news-gallery').addEventListener('change', refreshNewsImages);
for (const id of ['health-title', 'health-date', 'health-message', 'health-source', 'health-source-url']) {
  byId(id).addEventListener('input', refreshHealthPreview);
}
byId('health-image').addEventListener('change', refreshHealthImage);
connectSlug('news-title', 'news-slug');
connectSlug('health-title', 'health-slug');

byId('news-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = byId('news-submit');
  setBusy(button, true);
  setStatus('Validando y creando la noticia…', 'working');
  try {
    const heroFile = byId('news-hero').files[0];
    const galleryFiles = [...byId('news-gallery').files];
    const payload = {
      title: byId('news-title').value,
      slug: byId('news-slug').value,
      date: byId('news-date').value,
      category: byId('news-category').value,
      author: byId('news-author').value,
      tags: byId('news-tags').value,
      description: byId('news-description').value,
      content: byId('news-content').value,
      hero: heroFile ? await readFile(heroFile) : null,
      gallery: await Promise.all(galleryFiles.map(readFile)),
    };
    const result = await api('/api/content', { method: 'POST', body: JSON.stringify(payload) });
    setStatus(`Noticia creada.\nRuta pública: ${result.url}\nArchivos:\n${result.files.join('\n')}\n\nRevisá los cambios y ejecutá npm run validate antes de publicar.`, 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    setBusy(button, false);
  }
});

byId('health-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = byId('health-submit');
  setBusy(button, true);
  setStatus('Validando y creando la actualización…', 'working');
  try {
    const imageFile = byId('health-image').files[0];
    const payload = {
      title: byId('health-title').value,
      slug: byId('health-slug').value,
      date: byId('health-date').value,
      message: byId('health-message').value,
      source: byId('health-source').value,
      sourceUrl: byId('health-source-url').value,
      image: imageFile ? await readFile(imageFile) : null,
    };
    const result = await api('/api/content', { method: 'POST', body: JSON.stringify(payload) });
    setStatus(`Actualización creada.\nCanal público: ${result.url}\nArchivos:\n${result.files.join('\n')}\n\nVerificá fuente, fecha y vigencia antes de publicar.`, 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    setBusy(button, false);
  }
});

byId('shutdown').addEventListener('click', async () => {
  try { await api('/api/shutdown', { method: 'POST', body: '{}' }); } catch {}
  document.body.innerHTML = '<main class="closed"><div><p class="eyebrow">Villars Informa</p><h1>Editor cerrado</h1><p>Los archivos creados quedan en el repositorio. Ya podés cerrar esta pestaña.</p></div></main>';
});

window.addEventListener('pagehide', clearPreviewUrls);

const bootstrap = await api('/api/bootstrap');
document.body.dataset.channel = bootstrap.channel;
if (bootstrap.channel === 'news') {
  byId('editor-title').textContent = 'Editor de Noticias';
  byId('editor-description').textContent = 'Artículos monolingües con Markdown, vista previa e imágenes. Todo queda en esta PC.';
  byId('news-form').hidden = false;
  byId('news-date').value = bootstrap.date;
  byId('news-category').value = 'General';
  fillList('news-categories', bootstrap.categories);
  fillList('news-tags-list', bootstrap.tags);
  refreshNewsPreview();
} else {
  byId('editor-title').textContent = 'Canal de Salud';
  byId('editor-description').textContent = 'Micropublicaciones de hasta 500 caracteres, con fuente e imagen opcional.';
  byId('health-form').hidden = false;
  byId('health-date').value = bootstrap.date;
  refreshHealthPreview();
}
