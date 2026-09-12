import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(scriptDirectory, '..');

const IMAGE_LIMIT = 10 * 1024 * 1024;
const HEALTH_IMAGE_LIMIT = 8 * 1024 * 1024;
const TOTAL_NEWS_IMAGE_LIMIT = 30 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Map([
  ['image/jpeg', new Set(['.jpg', '.jpeg'])],
  ['image/png', new Set(['.png'])],
  ['image/webp', new Set(['.webp'])],
  ['image/gif', new Set(['.gif'])],
  ['image/avif', new Set(['.avif'])],
]);

export function slugify(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function requireText(value, label, max) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} es obligatorio.`);
  if (text.length > max) throw new Error(`${label} supera el máximo de ${max} caracteres.`);
  return text;
}

function optionalText(value, label, max) {
  const text = String(value ?? '').trim();
  if (text.length > max) throw new Error(`${label} supera el máximo de ${max} caracteres.`);
  return text;
}

function validateDate(value) {
  const date = String(value ?? '');
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)
    || Number.isNaN(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('La fecha debe ser válida y tener formato AAAA-MM-DD.');
  }
  return date;
}

function validateOptionalUrl(value, label) {
  const text = optionalText(value, label, 500);
  if (!text) return '';
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error(`${label} debe ser una URL completa.`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${label} debe usar http o https.`);
  }
  return parsed.toString();
}

function normalizeTags(value) {
  const values = Array.isArray(value) ? value : String(value ?? '').split(',');
  const tags = [...new Set(values.map((tag) => String(tag).trim()).filter(Boolean))];
  if (tags.length > 20) throw new Error('Las etiquetas no pueden superar las 20 entradas.');
  if (tags.some((tag) => tag.length > 40)) throw new Error('Cada etiqueta puede tener hasta 40 caracteres.');
  return tags;
}

function safeFilename(value) {
  const original = String(value ?? '').trim();
  const basename = path.basename(original).replace(/\s+/g, '-');
  if (!basename || basename !== original.replace(/\s+/g, '-') || !/^[a-zA-Z0-9._-]+$/.test(basename)) {
    throw new Error(`Nombre de imagen no válido: ${original || '(vacío)'}.`);
  }
  return basename;
}

function detectedMimeType(data) {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (data.length >= 6 && ['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (data.length >= 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (data.length >= 12 && data.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = data.subarray(8, 12).toString('ascii');
    if (['avif', 'avis'].includes(brand)) return 'image/avif';
  }
  return '';
}

function decodeImage(image, { maxBytes = IMAGE_LIMIT } = {}) {
  if (!image) return null;
  const name = safeFilename(image.name);
  const mimeType = String(image.mimeType ?? '').toLowerCase();
  const extensions = ALLOWED_IMAGE_TYPES.get(mimeType);
  if (!extensions) throw new Error(`Formato no permitido para ${name}.`);
  if (!extensions.has(path.extname(name).toLowerCase())) {
    throw new Error(`La extensión de ${name} no coincide con su formato.`);
  }
  const base64 = String(image.base64 ?? '').replace(/^data:[^;]+;base64,/, '');
  if (!/^[a-zA-Z0-9+/]*={0,2}$/.test(base64)) throw new Error(`Datos inválidos para ${name}.`);
  const data = Buffer.from(base64, 'base64');
  if (!data.length || data.length > maxBytes) {
    throw new Error(`${name} debe pesar entre 1 byte y ${Math.floor(maxBytes / 1024 / 1024)} MB.`);
  }
  if (detectedMimeType(data) !== mimeType) {
    throw new Error(`El contenido real de ${name} no coincide con ${mimeType}.`);
  }
  return { name, mimeType, data };
}

function inside(rootDirectory, ...parts) {
  const root = path.resolve(rootDirectory);
  const target = path.resolve(root, ...parts);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error('La ruta resultante sale del proyecto.');
  }
  return target;
}

async function atomicWrite(filePath, content) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    await fsp.writeFile(temporaryPath, content);
    await fsp.rename(temporaryPath, filePath);
  } finally {
    await fsp.rm(temporaryPath, { force: true });
  }
}

function jsonFrontmatter(entries) {
  return ['---', ...entries.map(([key, value]) => `${key}: ${JSON.stringify(value)}`), '---', ''].join('\n');
}

function validateOptionalDate(value, label) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  try {
    return validateDate(text);
  } catch {
    throw new Error(`${label} debe ser válida y tener formato AAAA-MM-DD.`);
  }
}

function validateOptionalTime(value) {
  const text = String(value ?? '').trim();
  if (text && !/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) {
    throw new Error('La hora del evento debe tener formato HH:MM.');
  }
  return text;
}

function validateOptionalCoordinate(value, label, minimum, maximum) {
  if (value === '' || value === null || value === undefined) return null;
  const number = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`${label} debe ser un número entre ${minimum} y ${maximum}.`);
  }
  return Number(number.toFixed(7));
}

function eventFrontmatter(news) {
  if (!news.event) return [['evento', false]];
  const entries = [
    ['evento', true],
    ['fechaEvento', news.eventDate],
  ];
  if (news.eventEndDate) entries.push(['fechaFinEvento', news.eventEndDate]);
  if (news.eventTime) entries.push(['horaEvento', news.eventTime]);
  if (news.eventPlace) entries.push(['lugarEvento', news.eventPlace]);
  if (news.eventLat !== null && news.eventLon !== null) {
    entries.push(['latEvento', news.eventLat], ['lonEvento', news.eventLon]);
  }
  if (news.showEventMap) entries.push(['mostrarMapaEvento', true]);
  return entries;
}

function revisionFor(source) {
  return createHash('sha256').update(source).digest('hex');
}

function validSlug(value) {
  const slug = String(value || '');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Slug editorial no válido.');
  return slug;
}

function parseJsonFrontmatter(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  if (!match) throw new Error('La publicación no tiene frontmatter reconocible.');
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const entry = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (!entry) continue;
    try {
      data[entry[1]] = JSON.parse(entry[2]);
    } catch {
      throw new Error(`El campo ${entry[1]} no usa el formato seguro del editor.`);
    }
  }
  return { data, body: source.slice(match[0].length).trim() };
}

function channelPaths(channel, slug, rootDirectory) {
  const safeSlug = validSlug(slug);
  if (channel === 'news') {
    return {
      contentDirectory: inside(rootDirectory, 'src', 'content', 'noticias', safeSlug),
      contentPath: inside(rootDirectory, 'src', 'content', 'noticias', safeSlug, 'index.mdx'),
      imagesDirectory: inside(rootDirectory, 'public', 'images', 'noticias', safeSlug),
      url: `/noticias/${safeSlug}/`,
    };
  }
  if (channel === 'health') {
    return {
      contentDirectory: inside(rootDirectory, 'src', 'content', 'actualizaciones', safeSlug),
      contentPath: inside(rootDirectory, 'src', 'content', 'actualizaciones', safeSlug, 'index.mdx'),
      imagesDirectory: inside(rootDirectory, 'public', 'images', 'salud', safeSlug),
      url: '/salud/',
    };
  }
  throw new Error('Canal editorial no válido.');
}

function publicPost(channel, slug, source) {
  const { data, body } = parseJsonFrontmatter(source);
  if (channel === 'news') {
    return {
      channel,
      slug,
      revision: revisionFor(source),
      title: String(data.titulo || ''),
      date: String(data.fecha || ''),
      description: String(data.descripcion || ''),
      author: String(data.autor || ''),
      category: String(data.categoria || 'General'),
      tags: Array.isArray(data.tags) ? data.tags : [],
      content: body,
      heroUrl: String(data.portada || ''),
      galleryUrls: Array.isArray(data.imagenes) ? data.imagenes : [],
      event: data.evento === true,
      eventDate: String(data.fechaEvento || ''),
      eventEndDate: String(data.fechaFinEvento || ''),
      eventTime: String(data.horaEvento || ''),
      eventPlace: String(data.lugarEvento || ''),
      eventLat: typeof data.latEvento === 'number' ? data.latEvento : null,
      eventLon: typeof data.lonEvento === 'number' ? data.lonEvento : null,
      showEventMap: data.mostrarMapaEvento === true,
      url: `/noticias/${slug}/`,
    };
  }
  return {
    channel,
    slug,
    revision: revisionFor(source),
    title: String(data.titulo || ''),
    date: String(data.fecha || ''),
    message: String(data.mensaje || ''),
    source: String(data.fuente || ''),
    sourceUrl: String(data.fuenteUrl || ''),
    imageUrl: String(data.imagen || ''),
    url: '/salud/',
  };
}

export async function readContent(channel, slug, { rootDirectory = projectRoot } = {}) {
  const paths = channelPaths(channel, slug, rootDirectory);
  try {
    const source = await fsp.readFile(paths.contentPath, 'utf8');
    return publicPost(channel, validSlug(slug), source);
  } catch (error) {
    if (error.code === 'ENOENT') {
      const missing = new Error('La publicación ya no existe.');
      missing.code = 'CONTENT_NOT_FOUND';
      throw missing;
    }
    throw error;
  }
}

export async function listContent(channel, { rootDirectory = projectRoot } = {}) {
  const base = channel === 'news'
    ? inside(rootDirectory, 'src', 'content', 'noticias')
    : channel === 'health'
      ? inside(rootDirectory, 'src', 'content', 'actualizaciones')
      : null;
  if (!base) throw new Error('Canal editorial no válido.');
  let entries = [];
  try {
    entries = await fsp.readdir(base, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const posts = await Promise.all(entries
    .filter((entry) => entry.isDirectory() && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name))
    .map(async (entry) => {
      try {
        const post = await readContent(channel, entry.name, { rootDirectory });
        if (channel === 'news') {
          const { content: _content, heroUrl: _heroUrl, galleryUrls: _galleryUrls, ...summary } = post;
          return summary;
        }
        return post;
      } catch {
        return null;
      }
    }));
  return posts.filter(Boolean).sort((left, right) => (
    right.date.localeCompare(left.date) || left.title.localeCompare(right.title, 'es')
  ));
}

async function assertCurrentRevision(contentPath, expectedRevision) {
  const source = await fsp.readFile(contentPath, 'utf8');
  if (!expectedRevision || revisionFor(source) !== expectedRevision) {
    const conflict = new Error('La publicación cambió desde que la abriste. Recargala antes de guardar o eliminar.');
    conflict.code = 'CONTENT_CONFLICT';
    throw conflict;
  }
  return { source, parsed: parseJsonFrontmatter(source) };
}

function normalizedRemovalList(input, currentUrls) {
  const requested = [...new Set((Array.isArray(input?.removeImages) ? input.removeImages : []).map(String))];
  const allowed = new Set(currentUrls.filter(Boolean));
  for (const url of requested) if (!allowed.has(url)) throw new Error(`La imagen ${url} no pertenece a esta publicación.`);
  return new Set(requested);
}

async function contentFiles(directory) {
  const result = [];
  let entries = [];
  try { entries = await fsp.readdir(directory, { withFileTypes: true }); } catch { return result; }
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await contentFiles(target));
    else if (entry.isFile() && /\.(?:mdx|md)$/i.test(entry.name)) result.push(target);
  }
  return result;
}

export async function imageIsReferenced(rootDirectory, publicUrl) {
  for (const filePath of await contentFiles(inside(rootDirectory, 'src', 'content'))) {
    if ((await fsp.readFile(filePath, 'utf8')).includes(publicUrl)) return true;
  }
  return false;
}

function publicImagePath(rootDirectory, publicUrl) {
  if (!String(publicUrl).startsWith('/images/')) throw new Error('Ruta pública de imagen no válida.');
  return inside(rootDirectory, 'public', ...String(publicUrl).slice(1).split('/'));
}

function versionedImage(image) {
  if (!image) return null;
  const digest = createHash('sha256').update(image.data).digest('hex').slice(0, 12);
  return { ...image, name: `${digest}-${image.name}` };
}

export async function updateContent(channel, slug, input, { rootDirectory = projectRoot } = {}) {
  const paths = channelPaths(channel, slug, rootDirectory);
  let current;
  try {
    current = await assertCurrentRevision(paths.contentPath, input?.revision);
  } catch (error) {
    if (error.code === 'ENOENT') {
      error.code = 'CONTENT_NOT_FOUND';
      error.message = 'La publicación ya no existe.';
    }
    throw error;
  }
  let source;
  if (channel === 'news') {
    const news = validateNewsInput({ ...input, slug });
    const currentHero = String(current.parsed.data.portada || '');
    const currentGallery = Array.isArray(current.parsed.data.imagenes) ? current.parsed.data.imagenes.map(String) : [];
    const removals = normalizedRemovalList(input, [currentHero, ...currentGallery]);
    const hero = versionedImage(news.hero);
    const gallery = news.gallery.map(versionedImage);
    const prefix = `/images/noticias/${slug}/`;
    const heroUrl = hero ? `${prefix}${hero.name}` : removals.has(currentHero) ? '' : currentHero;
    const galleryUrls = [...currentGallery.filter((url) => !removals.has(url)), ...gallery.map((image) => `${prefix}${image.name}`)];
    if (hero && currentHero) removals.add(currentHero);
    const frontmatter = jsonFrontmatter([
      ['titulo', news.title],
      ['descripcion', news.description],
      ['fecha', news.date],
      ['modificada', today()],
      ['autor', news.author],
      ['categoria', news.category],
      ['tags', news.tags],
      ['portada', heroUrl],
      ['imagenes', galleryUrls],
      ...eventFrontmatter(news),
    ]);
    source = `${frontmatter}\n${news.content.trim()}\n`;
    await fsp.mkdir(paths.imagesDirectory, { recursive: true });
    const written = [];
    try {
      for (const image of [hero, ...gallery].filter(Boolean)) {
        const filePath = inside(paths.imagesDirectory, image.name);
        if (fs.existsSync(filePath)) throw new Error(`Ya existe una imagen llamada ${image.name}.`);
        await atomicWrite(filePath, image.data);
        written.push(filePath);
      }
      await assertCurrentRevision(paths.contentPath, input?.revision);
      await atomicWrite(paths.contentPath, source);
    } catch (error) {
      for (const filePath of written) await fsp.rm(filePath, { force: true });
      throw error;
    }
    const deleted = [];
    for (const url of removals) {
      if (!url || await imageIsReferenced(rootDirectory, url)) continue;
      await fsp.rm(publicImagePath(rootDirectory, url), { force: true });
      deleted.push(url);
    }
    const result = await readContent(channel, slug, { rootDirectory });
    return { ...result, deletedImages: deleted, files: [path.relative(rootDirectory, paths.contentPath).replaceAll(path.sep, '/'), ...written.map((filePath) => path.relative(rootDirectory, filePath).replaceAll(path.sep, '/'))] };
  } else {
    const update = validateHealthInput({ ...input, slug, image: null });
    const frontmatter = jsonFrontmatter([
      ['fecha', update.date],
      ['titulo', update.title],
      ['mensaje', update.message],
      ['fuente', update.source],
      ['fuenteUrl', update.sourceUrl],
      ['imagen', String(current.parsed.data.imagen || '')],
    ]);
    source = `${frontmatter}\n`;
  }
  await assertCurrentRevision(paths.contentPath, input?.revision);
  await atomicWrite(paths.contentPath, source);
  return { ...(await readContent(channel, slug, { rootDirectory })), files: [path.relative(rootDirectory, paths.contentPath).replaceAll(path.sep, '/')] };
}

export async function archiveContent(channel, slug, input, { rootDirectory = projectRoot } = {}) {
  const paths = channelPaths(channel, slug, rootDirectory);
  await assertCurrentRevision(paths.contentPath, input?.revision);
  const archiveDirectory = inside(rootDirectory, '.content-trash', channel, `${Date.now()}-${validSlug(slug)}`);
  const archivedContent = inside(archiveDirectory, 'content');
  const archivedImages = inside(archiveDirectory, 'images');
  await fsp.mkdir(archiveDirectory, { recursive: true });
  try {
    await fsp.rename(paths.contentDirectory, archivedContent);
    if (fs.existsSync(paths.imagesDirectory)) await fsp.rename(paths.imagesDirectory, archivedImages);
  } catch (error) {
    if (fs.existsSync(archivedContent) && !fs.existsSync(paths.contentDirectory)) {
      await fsp.rename(archivedContent, paths.contentDirectory);
    }
    throw error;
  }
  return {
    archived: true,
    slug,
    recoveryPath: path.relative(rootDirectory, archiveDirectory).replaceAll(path.sep, '/'),
  };
}

async function createEntry({ rootDirectory, contentDirectory, imagesDirectory, writes }) {
  const conflicts = [contentDirectory, imagesDirectory].filter((candidate) => candidate && fs.existsSync(candidate));
  if (conflicts.length) {
    const error = new Error('Ya existe contenido o una carpeta de imágenes para ese slug. No se sobrescribió nada.');
    error.code = 'CONTENT_EXISTS';
    throw error;
  }
  const createdDirectories = [];
  try {
    await fsp.mkdir(contentDirectory, { recursive: true });
    createdDirectories.push(contentDirectory);
    if (imagesDirectory) {
      await fsp.mkdir(imagesDirectory, { recursive: true });
      createdDirectories.push(imagesDirectory);
    }
    for (const [filePath, contents] of writes) await atomicWrite(filePath, contents);
  } catch (error) {
    for (const directory of createdDirectories.reverse()) {
      await fsp.rm(directory, { recursive: true, force: true });
    }
    throw error;
  }
  return writes.map(([filePath]) => path.relative(rootDirectory, filePath).replaceAll(path.sep, '/'));
}

export function validateNewsInput(input) {
  const title = requireText(input?.title, 'El título', 180);
  const slug = slugify(input?.slug || title);
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('No se pudo generar un slug válido.');
  const hero = decodeImage(input?.hero);
  const gallery = Array.isArray(input?.gallery) ? input.gallery.map((image) => decodeImage(image)).filter(Boolean) : [];
  const images = [hero, ...gallery].filter(Boolean);
  const names = new Set();
  let totalBytes = 0;
  for (const image of images) {
    const key = image.name.toLowerCase();
    if (names.has(key)) throw new Error(`La imagen ${image.name} está repetida.`);
    names.add(key);
    totalBytes += image.data.length;
  }
  if (totalBytes > TOTAL_NEWS_IMAGE_LIMIT) throw new Error('Las imágenes superan el máximo total de 30 MB.');
  const event = input?.event === true;
  const eventDate = event ? validateOptionalDate(input?.eventDate, 'La fecha del evento') : '';
  const eventEndDate = event ? validateOptionalDate(input?.eventEndDate, 'La fecha final del evento') : '';
  const eventTime = event ? validateOptionalTime(input?.eventTime) : '';
  const eventPlace = event ? optionalText(input?.eventPlace, 'El lugar del evento', 180) : '';
  const eventLat = event ? validateOptionalCoordinate(input?.eventLat, 'La latitud', -90, 90) : null;
  const eventLon = event ? validateOptionalCoordinate(input?.eventLon, 'La longitud', -180, 180) : null;
  const showEventMap = event && input?.showEventMap === true;
  if (event && !eventDate) throw new Error('La fecha del evento es obligatoria.');
  if (eventEndDate && eventEndDate < eventDate) throw new Error('La fecha final no puede ser anterior a la fecha del evento.');
  if ((eventLat === null) !== (eventLon === null)) throw new Error('La ubicación del evento requiere latitud y longitud.');
  if (showEventMap && (eventLat === null || eventLon === null)) throw new Error('Para mostrar el mapa primero elegí una ubicación.');
  return {
    slug,
    title,
    date: validateDate(input?.date),
    description: requireText(input?.description, 'La descripción', 320),
    author: optionalText(input?.author, 'El autor', 120),
    category: optionalText(input?.category, 'La categoría', 100) || 'General',
    tags: normalizeTags(input?.tags),
    content: requireText(input?.content, 'El contenido', 500000),
    event,
    eventDate,
    eventEndDate,
    eventTime,
    eventPlace,
    eventLat,
    eventLon,
    showEventMap,
    hero,
    gallery,
  };
}

export async function createNews(input, { rootDirectory = projectRoot } = {}) {
  const news = validateNewsInput(input);
  const contentDirectory = inside(rootDirectory, 'src', 'content', 'noticias', news.slug);
  const imagesDirectory = news.hero || news.gallery.length
    ? inside(rootDirectory, 'public', 'images', 'noticias', news.slug)
    : null;
  const prefix = `/images/noticias/${news.slug}/`;
  const frontmatter = jsonFrontmatter([
    ['titulo', news.title],
    ['descripcion', news.description],
    ['fecha', news.date],
    ['autor', news.author],
    ['categoria', news.category],
    ['tags', news.tags],
    ['portada', news.hero ? `${prefix}${news.hero.name}` : ''],
    ['imagenes', news.gallery.map((image) => `${prefix}${image.name}`)],
    ...eventFrontmatter(news),
  ]);
  const contentPath = inside(contentDirectory, 'index.mdx');
  const writes = [[contentPath, `${frontmatter}\n${news.content.trim()}\n`]];
  for (const image of [news.hero, ...news.gallery].filter(Boolean)) {
    writes.push([inside(imagesDirectory, image.name), image.data]);
  }
  const files = await createEntry({ rootDirectory, contentDirectory, imagesDirectory, writes });
  return { slug: news.slug, url: `/noticias/${news.slug}/`, files };
}

export function validateHealthInput(input) {
  const title = requireText(input?.title, 'El título', 100);
  const slug = slugify(input?.slug || title);
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('No se pudo generar un slug válido.');
  return {
    slug,
    title,
    date: validateDate(input?.date),
    message: requireText(input?.message, 'El mensaje', 500),
    source: optionalText(input?.source, 'La fuente', 180),
    sourceUrl: validateOptionalUrl(input?.sourceUrl, 'El enlace de la fuente'),
    image: decodeImage(input?.image, { maxBytes: HEALTH_IMAGE_LIMIT }),
  };
}

export async function createHealthUpdate(input, { rootDirectory = projectRoot } = {}) {
  const update = validateHealthInput(input);
  const contentDirectory = inside(rootDirectory, 'src', 'content', 'actualizaciones', update.slug);
  const imagesDirectory = update.image
    ? inside(rootDirectory, 'public', 'images', 'salud', update.slug)
    : null;
  const imageUrl = update.image ? `/images/salud/${update.slug}/${update.image.name}` : '';
  const frontmatter = jsonFrontmatter([
    ['fecha', update.date],
    ['titulo', update.title],
    ['mensaje', update.message],
    ['fuente', update.source],
    ['fuenteUrl', update.sourceUrl],
    ['imagen', imageUrl],
  ]);
  const contentPath = inside(contentDirectory, 'index.mdx');
  const writes = [[contentPath, `${frontmatter}\n`]];
  if (update.image) writes.push([inside(imagesDirectory, update.image.name), update.image.data]);
  const files = await createEntry({ rootDirectory, contentDirectory, imagesDirectory, writes });
  return { slug: update.slug, url: '/salud/', files };
}

export async function createContent(channel, input, options) {
  if (channel === 'news') return createNews(input, options);
  if (channel === 'health') return createHealthUpdate(input, options);
  throw new Error('Canal editorial no válido.');
}

export async function getNewsTaxonomy({ rootDirectory = projectRoot } = {}) {
  const directory = inside(rootDirectory, 'src', 'content', 'noticias');
  const categories = new Set();
  const tags = new Set();
  try {
    const entries = await fsp.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const source = await fsp.readFile(path.join(directory, entry.name, 'index.mdx'), 'utf8');
        const categoryMatch = /^categoria:\s*(.+)$/m.exec(source);
        const tagsMatch = /^tags:\s*(\[[^\n]*\])$/m.exec(source);
        if (categoryMatch) categories.add(JSON.parse(categoryMatch[1]));
        if (tagsMatch) for (const tag of JSON.parse(tagsMatch[1])) tags.add(tag);
      } catch {
        // Una entrada incompleta no debe impedir abrir el editor.
      }
    }
  } catch {
    // Una colección vacía es válida.
  }
  return {
    categories: [...categories].filter(Boolean).sort((a, b) => a.localeCompare(b, 'es')),
    tags: [...tags].filter(Boolean).sort((a, b) => a.localeCompare(b, 'es')),
  };
}
