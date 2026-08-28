import { mkdir, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const exists = async (path) => stat(path).then(() => true, () => false);
export const slugify = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
export const validDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

export async function createHealthDraft({ title, requestedSlug = '', date = today(), summary = '', source = '' }, rootDirectory = process.cwd()) {
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new Error('El título es obligatorio.');
  const slug = slugify(requestedSlug || cleanTitle);
  if (!slug) throw new Error('No se pudo generar un slug válido.');
  if (!validDate(date)) throw new Error('La fecha debe existir y usar el formato AAAA-MM-DD.');

  const contentDirectory = resolve(rootDirectory, 'src/content/actualizaciones', slug);
  const contentPath = resolve(contentDirectory, 'index.mdx');
  if (await exists(contentPath)) throw new Error(`Ya existe la actualización "${slug}".`);
  await mkdir(contentDirectory, { recursive: true });

  const body = [
    '---',
    `fecha: ${date}`,
    `titulo: ${JSON.stringify(cleanTitle)}`,
    '---',
    '',
    summary.trim() ? `> ${summary.trim()}` : '',
    '',
    source.trim() ? `**Fuente informada:** ${source.trim()}` : '',
    '',
    '{/* Antes de publicar, verificá fuente, fecha, teléfonos y vigencia de la información. */}',
    '',
    'Escribí acá el contenido de la actualización sanitaria.',
    '',
  ].filter((line, index, lines) => line || lines[index - 1] !== '').join('\n');
  await writeFile(contentPath, body, 'utf8');
  return { slug, contentPath, relativePath: `src/content/actualizaciones/${slug}/index.mdx` };
}

async function runInteractive() {
  const rl = createInterface({ input, output });
  try {
    console.log('\n🩺 Creador de actualizaciones de Salud de Villars Informa\n');
    const title = (await rl.question('Título: ')).trim();
    const requestedSlug = (await rl.question('Slug (Enter para generarlo): ')).trim();
    const requestedDate = (await rl.question(`Fecha AAAA-MM-DD (Enter para ${today()}): `)).trim();
    const summary = (await rl.question('Resumen corto (opcional): ')).trim();
    const source = (await rl.question('Fuente oficial o institución responsable (recomendada): ')).trim();
    const result = await createHealthDraft({ title, requestedSlug, date: requestedDate || today(), summary, source });
    console.log(`✅ Creada: ${result.relativePath}`);
    console.log('🔗 Canal: /salud/');
    console.log('⚠️ Revisá el contenido y ejecutá npm run validate antes de publicarlo.');
  } finally {
    rl.close();
  }
}

const invokedUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedUrl) {
  runInteractive().catch((error) => {
    console.error(`❌ ${error.message}`);
    process.exitCode = 1;
  });
}
