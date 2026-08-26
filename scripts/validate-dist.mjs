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
  if (count(html, /<h1\b/gi) < 1) errors.push(`${label}: debe contener al menos un <h1>`);
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
console.log(`HTML validado: ${htmlFiles.length} páginas, enlaces locales, IDs y estructura semántica correctos.`);
