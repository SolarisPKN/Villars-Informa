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
  console.log('\n📰 ¡Bienvenido al creador de noticias de Villars Informa!\n');

  // 1. ID del post (slug)
  let slug = await question('🔑 ID de la noticia (deja vacío para auto-generar desde el título): ');
  const title = await question('📝 Título de la noticia: ');
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

  // 2. Datos
  const description = await question('📄 Descripción corta (para el listado): ');
  const tags = await question('🏷️ Etiquetas (separadas por comas, ej: eventos, cultura): ');
  const autor = await question('✍️ Autor (opcional, deja vacío si no): ');

  // 3. Imágenes
  const heroImageName = await question('🖼️ Nombre de la imagen de portada (ej. portada.webp - déjalo vacío si no): ');
  const extraImagesNames = await question('📸 Imágenes adicionales (nombres separados por comas, ej. img1.jpg, img2.png): ');

  // 4. Verificar existencia
  const contentDir = path.join(rootDir, 'src', 'content', 'noticias', slug);
  if (fs.existsSync(contentDir)) {
    console.log(`⚠️ Ya existe una noticia con el ID "${slug}".`);
    const overwrite = await question('¿Sobrescribir? (y/n): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('❌ Operación cancelada.');
      rl.close();
      return;
    }
  }

  // 5. Crear carpetas
  const imagesDir = path.join(rootDir, 'public', 'images', 'noticias', slug);
  ensureDirectoryExists(contentDir);
  ensureDirectoryExists(imagesDir);

  // 6. Fecha actual
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];

  // 7. Metadatos (post.json)
  const metaPath = path.join(contentDir, 'post.json');
  const metaData = {
    titulo: title,
    descripcion: description || '',
    fecha: dateStr,
    autor: autor || '',
    tags: tags.split(',').map(t => t.trim()).filter(Boolean),
    portada: heroImageName ? `/images/noticias/${slug}/${heroImageName}` : '',
  };
  writeFileUtf8(metaPath, JSON.stringify(metaData, null, 2));

  // 8. Contenido (index.mdx)
  const contentPath = path.join(contentDir, 'index.mdx');
  const contentTemplate = `---
# Este frontmatter está vacío porque usamos post.json
---

${description ? `> ${description}\n` : ''}

Escribe aquí el contenido de la noticia. Puedes usar **negritas**, *cursivas*, [enlaces](#), listas y bloques de código.

## Subtítulo

\`\`\`javascript
console.log('¡Hola, Villars!');
\`\`\`

![Texto alternativo](/images/noticias/${slug}/${heroImageName || 'portada.webp'})
`;
  writeFileUtf8(contentPath, contentTemplate);

  // 9. Copiar imágenes (si existen en el directorio actual)
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

  // 10. Resumen final
  console.log('\n🎉 ¡Noticia creada exitosamente!');
  console.log(`🔗 URL: /noticias/${slug}`);
  console.log(`📝 Edita el contenido: ${path.relative(rootDir, contentPath)}`);
  console.log(`📁 Imágenes: ${path.relative(rootDir, imagesDir)}/`);

  rl.close();
}

createPost().catch((err) => {
  console.error('❌ Error inesperado:', err);
  rl.close();
});