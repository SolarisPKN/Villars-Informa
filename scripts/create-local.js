import { mkdir, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const rl = createInterface({ input, output });
const exists = async (path) => stat(path).then(() => true, () => false);
const slugify = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

try {
  console.log('\n🏪 Creador de comercios de Villars Informa\n');
  const name = (await rl.question('Nombre: ')).trim();
  if (!name) throw new Error('El nombre es obligatorio.');
  const slug = slugify(name);
  const directory = resolve('src/content/locales', slug);
  const jsonPath = resolve(directory, 'post.json');
  if (await exists(jsonPath)) throw new Error(`Ya existe el comercio "${slug}".`);
  const data = {
    nombre: name,
    direccion: (await rl.question('Dirección: ')).trim(),
    horarios: (await rl.question('Horarios: ')).trim(),
    telefono: (await rl.question('Teléfono (opcional): ')).trim(),
    categoria: (await rl.question('Categoría: ')).trim(),
    descripcion_corta: (await rl.question('Descripción corta: ')).trim(),
    paga: (await rl.question('¿Tiene ficha ampliada? (s/n): ')).trim().toLowerCase() === 's',
    menu: [], fotos: [], portada: '',
  };
  await mkdir(directory, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  if (data.paga) {
    const premiumDirectory = resolve('src/content/premium', slug);
    await mkdir(premiumDirectory, { recursive: true });
    await writeFile(resolve(premiumDirectory, 'index.mdx'), `---\ntitulo: ${JSON.stringify(name)}\n---\n\nEscribí acá la descripción ampliada del comercio.\n`, 'utf8');
  }
  console.log(`✅ Creado: src/content/locales/${slug}/post.json`);
  console.log(`🔗 Listado: /locales/${data.paga ? `\n🔗 Ficha: /locales/${slug}/` : ''}`);
} finally { rl.close(); }
