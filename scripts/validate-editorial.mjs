import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const articlesDir = path.join(root, 'src', 'content', 'noticias');
const firstEnforcedDate = '2026-10-17';
const failures = [];
const warnings = [];
let checked = 0;
let legacy = 0;

function parse(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(source);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const item = /^([a-zA-Z][\w-]*):\s*(.*)$/.exec(line);
    if (item) fields[item[1]] = item[2].trim();
  }
  return { fields, body: source.slice(match[0].length) };
}

function scalar(input = '') {
  const value = String(input).trim();
  if (value[0] === '"') {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value.replace(/^['"]|['"]$/g, '');
}

function countWords(body) {
  const text = body.replace(/https?:\/\/[^\s)]+/g, ' ')
    .replace(/[#>*_\[\]()|]/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? text.split(' ').filter(Boolean).length : 0;
}

async function checkHero(fields, slug, fail, warn) {
  const url = scalar(fields.portada);
  if (!url) { fail('falta portada'); return; }
  if (!/^\/images\/noticias\/[a-z0-9-]+\/[\w.-]+$/i.test(url) ||
      !url.startsWith('/images/noticias/' + slug + '/')) {
    fail('ruta de portada inválida o asociada a otra noticia'); return;
  }
  const file = path.join(root, 'public', url.slice(1));
  let bytes;
  try { bytes = (await stat(file)).size; }
  catch { fail('portada inexistente: ' + url); return; }
  const ext = path.extname(file).toLowerCase();
  if (ext === '.svg') {
    fail('una placa SVG de texto no es suficiente como portada; usar foto real o gráfica rasterizada');
    return;
  }
  if (!['.webp', '.jpg', '.jpeg', '.png', '.avif'].includes(ext)) {
    fail('formato de portada no permitido'); return;
  }
  try {
    const { width = 0, height = 0 } = await sharp(file).metadata();
    if (width < 1200 || height < 650) warn('portada de ' + width + 'x' + height + ': preferir 1200x650 o mayor');
    if (width < 500 || height < 500) fail('portada demasiado pequeña: ' + width + 'x' + height);
    if (bytes < 18000) warn('archivo de portada sospechosamente liviano; revisar calidad visual');
  } catch (error) { fail('portada no decodificable: ' + error.message); }
}

async function main() {
  const dirs = await readdir(articlesDir, { withFileTypes: true });
  for (const entry of dirs.filter(item => item.isDirectory())) {
    const slug = entry.name;
    let source;
    try { source = await readFile(path.join(articlesDir, slug, 'index.mdx'), 'utf8'); }
    catch { continue; }
    const parsed = parse(source);
    if (!parsed) { failures.push(slug + ': falta frontmatter'); continue; }
    const { fields, body } = parsed;
    const published = scalar(fields.fecha);
    const modified = scalar(fields.modificada);
    if (published < firstEnforcedDate && modified < firstEnforcedDate) {
      legacy++;
      continue;
    }
    checked++;
    const fail = reason => failures.push(slug + ': ' + reason);
    const warn = reason => warnings.push(slug + ': ' + reason);
    const isEvent = scalar(fields.evento) === 'true';
    const isBrief = /^(Breve|Breves)$/i.test(scalar(fields.categoria));
    const minimum = isBrief ? 150 : (isEvent ? 250 : 400);
    const total = countWords(body);
    if (total < minimum) fail('solo ' + total + ' palabras; se requieren ' + minimum +
      ' para esta clase de noticia. No inventar contenido: usar Breves cuando corresponda.');
    if (!isBrief && (body.match(/^##\s+/gm) || []).length < 2)
      fail('faltan secciones de contexto, información práctica o fuentes');
    if (!/https?:\/\/\S+/i.test(body)) fail('falta fuente enlazada');
    if (scalar(fields.descripcion).length < 45) fail('descripción insuficiente');
    await checkHero(fields, slug, fail, warn);
  }
  console.log('Control editorial: ' + checked + ' artículos nuevos/actualizados; ' + legacy + ' anteriores exentos.');
  warnings.forEach(line => console.warn('AVISO: ' + line));
  failures.forEach(line => console.error('ERROR: ' + line));
  if (failures.length) {
    console.error('Control editorial rechazado: ' + failures.length + ' problemas.');
    process.exitCode = 1;
  } else {
    console.log('Control editorial OK. La verificación factual, ética y visual sigue siendo obligatoria.');
  }
}

await main();
