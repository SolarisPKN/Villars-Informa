const byId = (id) => document.getElementById(id);
const statusBox = byId('status');
const imageUrls = new Set();
let previewTimer;
let bootstrapData;
let editingPost = null;
let libraryPosts = [];

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

function normalizedTags(value) {
  return [...new Set(String(value || '').split(',').map((tag) => tag.trim().replace(/^#+/, '')).filter(Boolean))];
}

function markdownToPlain(value) {
  return String(value || '')
    .replace(/^import\s+[^\n]+;?$/gm, '')
    .replace(/<SocialEmbed\s+[^>]*\/?\s*>/gi, '[Publicación social incrustada]')
    .replace(/```[^\n]*\n([\s\S]*?)```/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 — $2')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '“')
    .replace(/^[-*+]\s+/gm, '• ')
    .replace(/[*_~\x60]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function clipped(value, limit) {
  const text = String(value || '').trim();
  return text.length <= limit ? text : text.slice(0, Math.max(0, limit - 1)).trimEnd() + '…';
}

function setSocialCopy(id, value) {
  const field = byId(id);
  field.value = value;
  const counter = document.querySelector('[data-count-for="' + id + '"]');
  if (counter) counter.textContent = value.length + ' caracteres';
}

function refreshSocialCopies() {
  if (!bootstrapData) return;
  if (bootstrapData.channel === 'news') {
    const title = byId('news-title').value.trim();
    const description = byId('news-description').value.trim();
    const body = markdownToPlain(byId('news-content').value);
    const slug = slugify(byId('news-slug').value || title);
    const url = slug ? 'https://villars.solarispkn.com.ar/noticias/' + slug + '/' : 'https://villars.solarispkn.com.ar/noticias/';
    const tags = normalizedTags(byId('news-tags').value);
    const hashtags = tags.slice(0, 8).map((tag) => '#' + tag.replace(/\s+/g, '')).join(' ');
    const eventLine = byId('news-event').checked
      ? ['📅 ' + healthDateLabel(byId('news-event-date').value), byId('news-event-time').value, byId('news-event-place').value.trim()].filter(Boolean).join(' · ')
      : '';
    setSocialCopy('news-copy-whatsapp', [
      title ? '*' + title + '*' : '*Nueva noticia en Villars Informa*',
      eventLine,
      description,
      clipped(body, 2600),
      '🔗 Nota completa: ' + url,
      hashtags,
    ].filter(Boolean).join('\n\n'));
    setSocialCopy('news-copy-facebook', [
      title || 'Nueva noticia en Villars Informa',
      eventLine,
      description,
      clipped(body, 3000),
      'Leé la nota completa: ' + url,
      hashtags,
    ].filter(Boolean).join('\n\n'));
    setSocialCopy('news-copy-instagram', [
      title || 'Nueva noticia en Villars Informa',
      eventLine,
      description,
      clipped(body, 1500),
      '📍 Información local para Villars y la zona.',
      'Nota completa: ' + url,
      hashtags || '#Villars #VillarsInforma',
    ].filter(Boolean).join('\n\n'));
    return;
  }
  const title = byId('health-title').value.trim() || 'Actualización de Salud';
  const message = byId('health-message').value.trim();
  const source = byId('health-source').value.trim();
  const sourceUrl = byId('health-source-url').value.trim();
  const sourceLine = source ? 'Fuente: ' + source + (sourceUrl ? ' — ' + sourceUrl : '') : sourceUrl;
  const pageUrl = 'https://villars.solarispkn.com.ar/salud/';
  setSocialCopy('health-copy-whatsapp', ['*❤ ' + title + '*', message, sourceLine, 'Más información: ' + pageUrl].filter(Boolean).join('\n\n'));
  setSocialCopy('health-copy-facebook', ['❤ ' + title, message, sourceLine, 'Información de salud local: ' + pageUrl, '#Villars #Salud'].filter(Boolean).join('\n\n'));
  setSocialCopy('health-copy-instagram', ['❤ ' + title, message, sourceLine, 'Consultá siempre la vigencia antes de acercarte.', '#Villars #Salud #VillarsInforma'].filter(Boolean).join('\n\n'));
}

function toggleEventFields({ initializeMap = true } = {}) {
  const enabled = byId('news-event').checked;
  byId('news-event-fields').hidden = !enabled;
  byId('news-event-date').required = enabled;
  if (!enabled) byId('news-event-show-map').checked = false;
  refreshSocialCopies();
  if (initializeMap) {
    document.dispatchEvent(new CustomEvent('event-editor-toggle', { detail: { enabled } }));
  }
}

async function copyField(id, button) {
  const field = byId(id);
  try {
    await navigator.clipboard.writeText(field.value);
  } catch {
    field.focus();
    field.select();
    setStatus('El navegador no permitió copiar automáticamente; el texto quedó seleccionado.', 'working');
    return;
  }
  const previous = button.textContent;
  button.textContent = 'Copiado';
  setTimeout(() => { button.textContent = previous; }, 1200);
}

function socialEmbedUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
    if (!['facebook.com', 'fb.watch', 'instagram.com', 'youtube.com', 'youtu.be', 'tiktok.com', 'x.com', 'twitter.com'].includes(host)) return '';
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function insertSocialEmbed() {
  const input = byId('news-social-url');
  const url = socialEmbedUrl(input.value);
  if (!url) {
    setStatus('Pegá una URL válida de Facebook, Instagram, YouTube, TikTok o X.', 'error');
    return;
  }
  const textarea = byId('news-content');
  const component = '<SocialEmbed url=' + JSON.stringify(url) + ' />';
  const insertion = '\n\n' + component + '\n';
  textarea.setRangeText(insertion, textarea.selectionStart, textarea.selectionEnd, 'end');
  textarea.dispatchEvent(new Event('input'));
  input.value = '';
  setStatus('Widget insertado. En la web pedirá permiso antes de cargar la red social.', 'success');
}

function showWorkspace(name) {
  const compose = name === 'compose';
  byId('library').hidden = compose;
  byId('news-form').hidden = !compose || bootstrapData?.channel !== 'news';
  byId('health-form').hidden = !compose || bootstrapData?.channel !== 'health';
  for (const button of document.querySelectorAll('[data-workspace]')) {
    const active = button.dataset.workspace === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  if (!compose) loadLibrary().catch((error) => setStatus(error.message, 'error'));
}

function renderLibrary() {
  const query = byId('library-search').value.trim().toLocaleLowerCase('es');
  const matches = libraryPosts.filter((post) => [
    post.title, post.date, post.category, post.description, post.message,
  ].filter(Boolean).join(' ').toLocaleLowerCase('es').includes(query));
  const list = byId('library-list');
  list.replaceChildren();
  if (!matches.length) {
    const empty = document.createElement('p');
    empty.className = 'empty library-empty';
    empty.textContent = query ? 'No hay coincidencias.' : 'Todavía no hay publicaciones en este canal.';
    list.append(empty);
    return;
  }
  for (const post of matches) {
    const article = document.createElement('article');
    const details = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = post.title || post.slug;
    const meta = document.createElement('small');
    meta.textContent = [post.date, post.category, post.slug].filter(Boolean).join(' · ');
    const excerpt = document.createElement('p');
    excerpt.textContent = clipped(post.description || post.message || '', 180);
    details.append(title, meta, excerpt);
    const actions = document.createElement('div');
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'button ghost';
    edit.textContent = 'Editar';
    edit.addEventListener('click', () => beginEdit(post.slug));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'button danger';
    remove.textContent = 'Enviar a papelera';
    remove.addEventListener('click', () => archivePost(post));
    actions.append(edit, remove);
    article.append(details, actions);
    list.append(article);
  }
}

async function loadLibrary() {
  const data = await api('/api/posts');
  libraryPosts = data.posts || [];
  byId('post-count').textContent = libraryPosts.length ? '(' + libraryPosts.length + ')' : '';
  renderLibrary();
}

function setEditMode(post) {
  editingPost = post;
  if (post.channel === 'news') {
    byId('news-title').value = post.title;
    byId('news-slug').value = post.slug;
    byId('news-slug').readOnly = true;
    byId('news-date').value = post.date;
    byId('news-category').value = post.category;
    byId('news-author').value = post.author;
    byId('news-tags').value = post.tags.join(', ');
    byId('news-description').value = post.description;
    byId('news-content').value = post.content;
    byId('news-event').checked = post.event === true;
    byId('news-event-date').value = post.eventDate || '';
    byId('news-event-end-date').value = post.eventEndDate || '';
    byId('news-event-time').value = post.eventTime || '';
    byId('news-event-place').value = post.eventPlace || '';
    byId('news-event-lat').value = post.eventLat ?? '';
    byId('news-event-lon').value = post.eventLon ?? '';
    byId('news-event-show-map').checked = post.showEventMap === true;
    toggleEventFields();
    window.eventMapPicker?.syncInputs();
    byId('news-hero').disabled = true;
    byId('news-gallery').disabled = true;
    byId('news-action-title').textContent = 'Guardar cambios';
    byId('news-action-help').textContent = 'El slug y las imágenes se conservan; si el archivo cambió afuera, el guardado se bloquea.';
    byId('news-submit').textContent = 'Guardar noticia';
    byId('news-cancel-edit').hidden = false;
    refreshNewsPreview();
  } else {
    byId('health-title').value = post.title;
    byId('health-slug').value = post.slug;
    byId('health-slug').readOnly = true;
    byId('health-date').value = post.date;
    byId('health-message').value = post.message;
    byId('health-source').value = post.source;
    byId('health-source-url').value = post.sourceUrl;
    byId('health-image').disabled = true;
    byId('health-action-title').textContent = 'Guardar cambios';
    byId('health-action-help').textContent = 'El slug y la imagen se conservan; los cambios externos nunca se pisan.';
    byId('health-submit').textContent = 'Guardar actualización';
    byId('health-cancel-edit').hidden = false;
    refreshHealthPreview();
  }
  refreshSocialCopies();
}

async function beginEdit(slug) {
  const post = await api('/api/posts/' + slug);
  setEditMode(post);
  showWorkspace('compose');
  setStatus('Editando “' + post.title + '”.', 'working');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelEdit() {
  editingPost = null;
  const channel = bootstrapData.channel;
  const form = byId(channel === 'news' ? 'news-form' : 'health-form');
  form.reset();
  if (channel === 'news') {
    byId('news-slug').readOnly = false;
    byId('news-hero').disabled = false;
    byId('news-gallery').disabled = false;
    byId('news-date').value = bootstrapData.date;
    byId('news-category').value = 'General';
    byId('news-action-title').textContent = 'Crear noticia';
    byId('news-action-help').textContent = 'Se validan rutas, imágenes y metadatos. Nunca se sobrescribe una publicación existente.';
    byId('news-submit').textContent = 'Crear noticia';
    byId('news-cancel-edit').hidden = true;
    toggleEventFields({ initializeMap: false });
    window.eventMapPicker?.clearLocation();
    refreshNewsImages();
    refreshNewsPreview();
  } else {
    byId('health-slug').readOnly = false;
    byId('health-image').disabled = false;
    byId('health-date').value = bootstrapData.date;
    byId('health-action-title').textContent = 'Crear actualización';
    byId('health-action-help').textContent = 'El límite de 500 caracteres se valida otra vez en el servidor y el slug nunca se sobrescribe.';
    byId('health-submit').textContent = 'Crear actualización';
    byId('health-cancel-edit').hidden = true;
    refreshHealthImage();
    refreshHealthPreview();
  }
  refreshSocialCopies();
  setStatus('Edición cancelada. Podés crear una publicación nueva.', '');
}

async function archivePost(post) {
  if (!confirm('¿Enviar “' + post.title + '” a la papelera recuperable? No se borrará definitivamente.')) return;
  try {
    const result = await api('/api/posts/' + post.slug, {
      method: 'DELETE',
      body: JSON.stringify({ revision: post.revision }),
    });
    setStatus('Publicación movida a ' + result.recoveryPath + '. Se puede recuperar manualmente.', 'success');
    await loadLibrary();
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

byId('news-content').addEventListener('input', scheduleNewsPreview);
for (const id of ['news-title', 'news-slug', 'news-description', 'news-tags', 'news-content']) {
  byId(id).addEventListener('input', refreshSocialCopies);
}
document.querySelectorAll('.toolbar button').forEach((button) => button.addEventListener('click', () => {
  editSelection(byId(button.closest('.toolbar').dataset.target), button);
}));
byId('news-insert-social').addEventListener('click', insertSocialEmbed);
byId('news-hero').addEventListener('change', refreshNewsImages);
byId('news-gallery').addEventListener('change', refreshNewsImages);
byId('news-event').addEventListener('change', toggleEventFields);
for (const id of ['news-event-date', 'news-event-end-date', 'news-event-time', 'news-event-place']) {
  byId(id).addEventListener('input', refreshSocialCopies);
}
for (const id of ['health-title', 'health-date', 'health-message', 'health-source', 'health-source-url']) {
  byId(id).addEventListener('input', refreshHealthPreview);
  byId(id).addEventListener('input', refreshSocialCopies);
}
byId('health-image').addEventListener('change', refreshHealthImage);
byId('news-cancel-edit').addEventListener('click', cancelEdit);
byId('health-cancel-edit').addEventListener('click', cancelEdit);
for (const button of document.querySelectorAll('[data-copy-target]')) {
  button.addEventListener('click', () => copyField(button.dataset.copyTarget, button));
}
for (const button of document.querySelectorAll('[data-workspace]')) {
  button.addEventListener('click', () => showWorkspace(button.dataset.workspace));
}
byId('library-search').addEventListener('input', renderLibrary);
byId('library-refresh').addEventListener('click', () => loadLibrary().catch((error) => setStatus(error.message, 'error')));
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
      event: byId('news-event').checked,
      eventDate: byId('news-event-date').value,
      eventEndDate: byId('news-event-end-date').value,
      eventTime: byId('news-event-time').value,
      eventPlace: byId('news-event-place').value,
      eventLat: byId('news-event-lat').value,
      eventLon: byId('news-event-lon').value,
      showEventMap: byId('news-event-show-map').checked,
      revision: editingPost?.revision,
      hero: heroFile ? await readFile(heroFile) : null,
      gallery: await Promise.all(galleryFiles.map(readFile)),
    };
    const result = editingPost
      ? await api('/api/posts/' + editingPost.slug, { method: 'PUT', body: JSON.stringify(payload) })
      : await api('/api/content', { method: 'POST', body: JSON.stringify(payload) });
    if (editingPost) {
      editingPost = result;
      setStatus('Noticia guardada sin cambiar el slug ni las imágenes. Revisión: ' + result.revision.slice(0, 12) + '…', 'success');
      await loadLibrary();
      return;
    }
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
      revision: editingPost?.revision,
      image: imageFile ? await readFile(imageFile) : null,
    };
    const result = editingPost
      ? await api('/api/posts/' + editingPost.slug, { method: 'PUT', body: JSON.stringify(payload) })
      : await api('/api/content', { method: 'POST', body: JSON.stringify(payload) });
    if (editingPost) {
      editingPost = result;
      setStatus('Actualización guardada sin cambiar el slug ni la imagen. Revisión: ' + result.revision.slice(0, 12) + '…', 'success');
      await loadLibrary();
      return;
    }
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

bootstrapData = await api('/api/bootstrap');
const bootstrap = bootstrapData;
document.body.dataset.channel = bootstrap.channel;
if (bootstrap.channel === 'news') {
  byId('editor-title').textContent = 'Editor de Noticias';
  byId('editor-description').textContent = 'Artículos monolingües con Markdown, vista previa e imágenes. Todo queda en esta PC.';
  byId('news-form').hidden = false;
  byId('news-date').value = bootstrap.date;
  byId('news-category').value = 'General';
  toggleEventFields({ initializeMap: false });
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
refreshSocialCopies();
await loadLibrary();
