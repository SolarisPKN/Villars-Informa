import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const rl = createInterface({ input, output });
const exists = async (path) => stat(path).then(() => true, () => false);
const slugify = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

try {
  console.log('\n📰 Creador de noticias de Villars Informa\n');
  const title = (await rl.question('Título: ')).trim();
  if (!title) throw new Error('El título es obligatorio.');
  const requestedSlug = (await rl.question('Slug (Enter para generarlo): ')).trim();
  const slug = slugify(requestedSlug || title);
  const description = (await rl.question('Descripción corta: ')).trim();
  const author = (await rl.question('Autor (opcional): ')).trim();
  const tags = (await rl.question('Etiquetas separadas por comas: ')).split(',').map((tag) => tag.trim()).filter(Boolean);
  const imageName = (await rl.question('Archivo de portada en la carpeta actual (opcional): ')).trim();
  const contentDirectory = resolve('src/content/noticias', slug);
  const contentPath = resolve(contentDirectory, 'index.mdx');
  if (await exists(contentPath)) throw new Error(`Ya existe la noticia "${slug}".`);
  await mkdir(contentDirectory, { recursive: true });
  let cover = '';
  if (imageName) {
    const imageDirectory = resolve('public/images/noticias', slug);
    await mkdir(imageDirectory, { recursive: true });
    await copyFile(resolve(imageName), resolve(imageDirectory, imageName));
    cover = `/images/noticias/${slug}/${imageName.replaceAll('\\', '/')}`;
  }
  const frontmatter = [
    '---', `titulo: ${JSON.stringify(title)}`, `descripcion: ${JSON.stringify(description)}`,
    `fecha: ${new Date().toISOString().slice(0, 10)}`, `autor: ${JSON.stringify(author)}`,
    `tags: ${JSON.stringify(tags)}`, `portada: ${JSON.stringify(cover)}`, '---', '',
    description ? `> ${description}` : '', '', 'Escribí acá el contenido de la noticia.', '',
  ].join('\n');
  await writeFile(contentPath, frontmatter, 'utf8');
  console.log(`✅ Creada: src/content/noticias/${slug}/index.mdx`);
  console.log(`🔗 URL: /noticias/${slug}/`);
} finally { rl.close(); }
