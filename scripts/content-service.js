import fs from 'node:fs';
import fsp from 'node:fs/promises';
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
  return {
    slug,
    title,
    date: validateDate(input?.date),
    description: requireText(input?.description, 'La descripción', 320),
    author: optionalText(input?.author, 'El autor', 120),
    category: optionalText(input?.category, 'La categoría', 100) || 'General',
    tags: normalizeTags(input?.tags),
    content: requireText(input?.content, 'El contenido', 500000),
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
