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

async function createLocal() {
  console.log('\n🏪 ¡Bienvenido al creador de locales de Villars Informa!\n');

  // 1. ID del local (slug)
  const nombre = await question('📝 Nombre del local: ');
  const slug = slugify(nombre);
  console.log(`   → Slug: ${slug}`);

  // 2. Datos básicos
  const direccion = await question('📍 Dirección: ');
  const horarios = await question('🕐 Horarios: ');
  const telefono = await question('📞 Teléfono (opcional): ');
  const categoria = await question('📂 Categoría (ej: Gastronomía, Alimentación, Servicios): ');
  const descripcion_corta = await question('📄 Descripción corta (para la tarjeta): ');
  
  // 3. ¿Paga?
  const paga = await question('💳 ¿Paga por ficha completa? (s/n): ');
  const pagaBool = paga.toLowerCase() === 's';

  // 4. Menú (solo si paga)
  let menu = [];
  if (pagaBool) {
    const menuInput = await question('🍽️ Menú (separado por comas, ej: Paella, Tapas, Sangría): ');
    menu = menuInput.split(',').map(item => item.trim()).filter(Boolean);
  }

  // 5. Fotos (solo si paga)
  let fotos = [];
  if (pagaBool) {
    const fotosInput = await question('📸 Fotos (nombres de archivos separados por comas, ej: foto1.webp, foto2.webp): ');
    fotos = fotosInput.split(',').map(f => `/images/locales/${slug}/${f.trim()}`).filter(Boolean);
  }

  // 6. ¿Descripción extendida en MDX? (solo si paga)
  let tieneMdx = false;
  if (pagaBool) {
    const mdxAnswer = await question('📝 ¿Quieres añadir una descripción extendida en MDX? (s/n): ');
    tieneMdx = mdxAnswer.toLowerCase() === 's';
  }

  // 7. Crear carpetas
  const contentDir = path.join(rootDir, 'src', 'content', 'locales', slug);
  const imagesDir = path.join(rootDir, 'public', 'images', 'locales', slug);
  ensureDirectoryExists(contentDir);
  ensureDirectoryExists(imagesDir);

  // 8. Guardar JSON
  const localData = {
    nombre,
    direccion,
    horarios,
    telefono: telefono || '',
    categoria,
    descripcion_corta: descripcion_corta || '',
    paga: pagaBool,
    menu: pagaBool ? menu : [],
    fotos: pagaBool ? fotos : [],
  };
  const jsonPath = path.join(contentDir, 'local.json');
  writeFileUtf8(jsonPath, JSON.stringify(localData, null, 2));

  // 9. MDX opcional
  if (tieneMdx) {
    const mdxPath = path.join(contentDir, 'index.mdx');
    const mdxTemplate = `# Descripción extendida

Escribe aquí la historia del local, sus servicios, trayectoria, etc.

## Más detalles

Puedes usar **negritas**, *cursivas*, listas y bloques de código.

### Horarios especiales

- Fines de semana: horario especial
- Feriados: consultar

---
*Visítanos y conoce más sobre nuestro trabajo.*
`;
    writeFileUtf8(mdxPath, mdxTemplate);
  }

  // 10. Resumen
  console.log('\n🎉 ¡Local creado exitosamente!');
  console.log(`🔗 URL del listado: /directorio`);
  if (pagaBool) {
    console.log(`🔗 Ficha completa: /local/${slug}`);
  }
  console.log(`📁 Imágenes: ${path.relative(rootDir, imagesDir)}/`);
  if (tieneMdx) {
    console.log(`📝 Edita el MDX: ${path.relative(rootDir, path.join(contentDir, 'index.mdx'))}`);
  }

  rl.close();
}

createLocal().catch((err) => {
  console.error('❌ Error inesperado:', err);
  rl.close();
});