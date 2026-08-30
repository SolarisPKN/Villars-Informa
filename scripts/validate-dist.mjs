import { access, readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const dist = resolve('dist');
const htmlFiles = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (extname(entry.name) === '.html') htmlFiles.push(path);
  }
}
const count = (input, pattern) => [...input.matchAll(pattern)].length;
const firstMatch = (input, pattern) => input.match(pattern)?.[1]?.trim() || '';
const collectIds = (value, ids = new Set(), references = new Set()) => {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectIds(entry, ids, references));
    return { ids, references };
  }
  if (!value || typeof value !== 'object') return { ids, references };
  for (const [key, entry] of Object.entries(value)) {
    if (key === '@id' && typeof entry === 'string') {
      if (Object.keys(value).length === 1) references.add(entry);
      else ids.add(entry);
    } else collectIds(entry, ids, references);
  }
  return { ids, references };
};
const resolveLocal = (url) => {
  const pathname = decodeURIComponent(url.split(/[?#]/, 1)[0]);
  if (!pathname || pathname === '/') return join(dist, 'index.html');
  const relative = pathname.replace(/^\//, '');
  return extname(relative) ? join(dist, relative) : join(dist, relative, 'index.html');
};

await walk(dist);
const errors = [];
for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  const label = file.slice(dist.length + 1);
  if (count(html, /<main\b/gi) !== 1) errors.push(`${label}: debe contener exactamente un <main>`);
  if (count(html, /<h1\b/gi) !== 1) errors.push(`${label}: debe contener exactamente un <h1>`);
  if (!/<html\b[^>]*\blang=["']es-AR["']/i.test(html)) errors.push(`${label}: falta lang=es-AR`);
  if (count(html, /<title\b/gi) !== 1) errors.push(`${label}: debe contener exactamente un <title>`);
  if (count(html, /<meta\b[^>]*\bname=["']description["']/gi) !== 1) errors.push(`${label}: debe contener una meta description`);
  if (count(html, /<link\b[^>]*\brel=["']canonical["']/gi) !== 1) errors.push(`${label}: debe contener un canonical`);
  if (count(html, /<meta\b[^>]*\bname=["']robots["']/gi) !== 1) errors.push(`${label}: debe contener una directiva robots`);
  const description = firstMatch(html, /<meta\b[^>]*\bname=["']description["'][^>]*\bcontent=["']([^"']*)["']/i);
  if (!description) errors.push(`${label}: meta description vacía`);
  const canonical = firstMatch(html, /<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["']([^"']+)["']/i);
  if (canonical && !canonical.startsWith('https://villars.solarispkn.com.ar/')) errors.push(`${label}: canonical fuera del dominio oficial`);
  const shouldNoindex = label === '404.html' || label.replace(/\\/g, '/') === 'under-construction/index.html';
  const robots = firstMatch(html, /<meta\b[^>]*\bname=["']robots["'][^>]*\bcontent=["']([^"']+)["']/i);
  if (shouldNoindex !== robots.includes('noindex')) errors.push(`${label}: directiva noindex incoherente con la ruta`);
  const ids = [...html.matchAll(/\sid=["']([^"']+)["']/gi)].map((match) => match[1]);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicates.length) errors.push(`${label}: IDs duplicados: ${duplicates.join(', ')}`);
  for (const match of html.matchAll(/\s(?:href|src)=(["'])(\/.*?)\1/gi)) {
    const url = match[2];
    if (url.startsWith('//') || url.startsWith('/#')) continue;
    try { await access(resolveLocal(url)); } catch { errors.push(`${label}: recurso o enlace local inexistente ${url}`); }
  }
  for (const match of html.matchAll(/<a\b[^>]*target=["']_blank["'][^>]*>/gi)) {
    if (!/\brel=["'][^"']*\bnoopener\b[^"']*["']/i.test(match[0])) errors.push(`${label}: enlace target=_blank sin rel=noopener`);
  }
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\balt=["'][^"']*["']/i.test(match[0])) errors.push(`${label}: imagen sin atributo alt`);
  }
  const jsonLdBlocks = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  if (jsonLdBlocks.length !== 1) errors.push(`${label}: debe contener exactamente un bloque JSON-LD`);
  for (const block of jsonLdBlocks) {
    try {
      const data = JSON.parse(block[1]);
      if (data['@context'] !== 'https://schema.org' || !Array.isArray(data['@graph'])) {
        errors.push(`${label}: JSON-LD sin contexto o grafo Schema.org`);
        continue;
      }
      const types = new Set(data['@graph'].map((entry) => entry?.['@type']).flat());
      for (const required of ['Organization', 'WebSite']) {
        if (!types.has(required)) errors.push(`${label}: JSON-LD sin ${required}`);
      }
      if (![...types].some((type) => ['WebPage', 'CollectionPage', 'MedicalWebPage'].includes(type))) {
        errors.push(`${label}: JSON-LD sin nodo de página`);
      }
      const { ids, references } = collectIds(data);
      for (const reference of references) {
        if (!ids.has(reference)) errors.push(`${label}: referencia JSON-LD sin nodo ${reference}`);
      }
    } catch {
      errors.push(`${label}: bloque JSON-LD inválido`);
    }
  }
  for (const forbidden of ['/directorio', '/search?q=', 'fonts.googleapis.com', 'favicon.ico', 'Calle Salud 123']) {
    if (html.includes(forbidden)) errors.push(`${label}: referencia heredada o ficticia: ${forbidden}`);
  }
}
if (!htmlFiles.length) errors.push('dist no contiene HTML');
try {
  const map = await stat(join(dist, 'maps', 'villars-region.pmtiles'));
  if (map.size < 1_000_000) errors.push('el PMTiles regional parece vacío o incompleto');
} catch {
  errors.push('falta dist/maps/villars-region.pmtiles');
}
if (errors.length) throw new Error(`Validación de dist falló:\n- ${errors.join('\n- ')}`);
console.log(`HTML validado: ${htmlFiles.length} páginas, enlaces, SEO, JSON-LD, IDs y estructura semántica correctos.`);
