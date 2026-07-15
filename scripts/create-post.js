// scripts/create-post.js
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`📁 Creada: ${path.relative(rootDir, dirPath)}`);
  }
}

function writeFileUtf8(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`✅ Creado: ${path.relative(rootDir, filePath)}`);
}

async function createPost() {
  console.log('\n🚀 ¡Bienvenido al creador de posts de SolarisPKN Labs!\n');

  // 1. ID del post (slug)
  let slug = await question('🔑 ID del post (deja vacío para auto-generar desde el título): ');
  const title = await question('📝 Título del post: ');
  if (!slug) {
    slug = slugify(title);
    console.log(`   → Slug auto-generado: ${slug}`);
  } else {
    const validSlug = slugify(slug);
    if (slug !== validSlug) {
      console.log(`⚠️ El ID contiene caracteres no válidos. Se usará: ${validSlug}`);
      slug = validSlug;
    }
  }

  // 2. Datos en español
  const descEs = await question('📄 Descripción corta (ES) - para el listado: ');
  const tags = await question('🏷️ Etiquetas (separadas por comas, ej: ESP32, IoT): ');
  const category = await question('📂 Categoría (ej: Firmware, Tutorial): ');

  // 3. Versión en inglés
  const addEnglish = await question('🌍 ¿Añadir versión en inglés? (y/n): ');
  let titleEn = '', descEn = '';
  if (addEnglish.toLowerCase() === 'y') {
    titleEn = await question('📝 Título en inglés: ');
    descEn = await question('📄 Descripción corta (EN) - para el listado: ');
  }

  // 4. Imágenes
  const heroImageName = await question('🖼️ Nombre de la imagen de portada (ej. portada.webp - déjalo vacío si no): ');
  const extraImagesNames = await question('📸 Imágenes adicionales (nombres separados por comas, ej. img1.jpg, img2.png): ');

  // 5. Verificar existencia
  const contentDir = path.join(rootDir, 'src', 'content', 'blog', slug);
  if (fs.existsSync(contentDir)) {
    console.log(`⚠️ Ya existe un post con el ID "${slug}".`);
    const overwrite = await question('¿Sobrescribir? (y/n): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('❌ Operación cancelada.');
      rl.close();
      return;
    }
  }

  // 6. Crear carpetas
  const imagesDir = path.join(rootDir, 'public', 'images', 'posts', slug);
  const localeEsDir = path.join(rootDir, 'src', 'locales', 'es', 'posts');
  const localeEnDir = path.join(rootDir, 'src', 'locales', 'en', 'posts');

  ensureDirectoryExists(contentDir);
  ensureDirectoryExists(imagesDir);
  ensureDirectoryExists(localeEsDir);
  ensureDirectoryExists(localeEnDir);

  // 7. Fecha actual
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];

  // 8. Metadatos (post.json)
  const metaPath = path.join(contentDir, 'post.json');
  const metaData = {
    id: slug,
    date: dateStr,
    tags: tags.split(',').map(t => t.trim()).filter(Boolean),
    category: category.trim() || 'General',
    heroImage: heroImageName ? `/images/posts/${slug}/${heroImageName}` : '',
    images: extraImagesNames
      ? extraImagesNames.split(',').map(n => `/images/posts/${slug}/${n.trim()}`).filter(Boolean)
      : [],
  };
  writeFileUtf8(metaPath, JSON.stringify(metaData, null, 2));

  // 9. Contenido en español (index-es.mdx)
  const contentEsPath = path.join(contentDir, 'index-es.mdx');
  const contentEsTemplate = `# ${title}

${descEs ? `> ${descEs}\n` : ''}

Escribe aquí tu contenido en español. Puedes usar **negritas**, *cursivas*, [links](#), listas y bloques de código.

## Subtítulo

\`\`\`javascript
console.log('¡Hola, mundo!');
\`\`\`

![Texto alternativo](/images/posts/${slug}/${heroImageName || 'portada.webp'})
`;
  writeFileUtf8(contentEsPath, contentEsTemplate);

  // 10. Contenido en inglés (index-en.mdx) - si se solicita
  if (addEnglish.toLowerCase() === 'y') {
    const contentEnPath = path.join(contentDir, 'index-en.mdx');
    const contentEnTemplate = `# ${titleEn || title}

${descEn ? `> ${descEn}\n` : ''}

Write your content in English here. You can use **bold**, *italic*, [links](#), lists and code blocks.

## Subtitle

\`\`\`javascript
console.log('Hello, world!');
\`\`\`

![Alt text](/images/posts/${slug}/${heroImageName || 'portada.webp'})
`;
    writeFileUtf8(contentEnPath, contentEnTemplate);
  }

  // 11. Traducción español (locales)
  const esPath = path.join(localeEsDir, `${slug}.json`);
  writeFileUtf8(esPath, JSON.stringify({ title, description: descEs }, null, 2));

  // 12. Traducción inglés (locales)
  if (addEnglish.toLowerCase() === 'y') {
    const enPath = path.join(localeEnDir, `${slug}.json`);
    writeFileUtf8(enPath, JSON.stringify({ title: titleEn || title, description: descEn || descEs }, null, 2));
  }

  // 13. Copiar imágenes (si existen en el directorio actual)
  const currentDir = process.cwd();
  const copyImage = (filename) => {
    if (!filename) return;
    const src = path.join(currentDir, filename);
    const dest = path.join(imagesDir, filename);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`✅ Imagen copiada: ${filename} → ${path.relative(rootDir, dest)}`);
    } else {
      console.log(`⚠️ No se encontró "${filename}" en el directorio actual. Ignorado.`);
    }
  };

  if (heroImageName) copyImage(heroImageName);
  if (extraImagesNames) {
    extraImagesNames.split(',').map(n => n.trim()).filter(Boolean).forEach(copyImage);
  }

  // 14. Resumen final
  console.log('\n🎉 ¡Post creado exitosamente!');
  console.log(`🔗 URL: /es/blog/${slug}`);
  console.log(`📝 Edita el contenido ES: ${path.relative(rootDir, contentEsPath)}`);
  if (addEnglish.toLowerCase() === 'y') {
    console.log(`📝 Edita el contenido EN: ${path.relative(rootDir, path.join(contentDir, 'index-en.mdx'))}`);
  }
  console.log(`📁 Imágenes: ${path.relative(rootDir, imagesDir)}/`);

  rl.close();
}

createPost().catch((err) => {
  console.error('❌ Error inesperado:', err);
  rl.close();
});