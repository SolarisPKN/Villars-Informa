import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  archiveContent,
  createHealthUpdate,
  createNews,
  listContent,
  readContent,
  updateContent,
  validateHealthInput,
  validateNewsInput,
} from '../scripts/content-service.js';
import { createEditorServer, validLocalRequest } from '../scripts/content-editor/server.js';

const tinyGif = {
  name: 'foto.gif',
  mimeType: 'image/gif',
  base64: Buffer.from('GIF89a', 'ascii').toString('base64'),
};

test('los CMD abren los editores visuales desde la raíz del repositorio', async () => {
  const [postCmd, healthCmd, packageText] = await Promise.all([
    readFile(new URL('../create-post.cmd', import.meta.url), 'utf8'),
    readFile(new URL('../create-salud.cmd', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ]);
  const packageData = JSON.parse(packageText);
  assert.equal(packageData.scripts['create-news'], 'node scripts/content-editor/server.js news');
  assert.equal(packageData.scripts['create-health'], 'node scripts/content-editor/server.js health');
  assert.match(postCmd, /cd \/d "%~dp0"/i);
  assert.match(postCmd, /node scripts\\content-editor\\server\.js news/i);
  assert.match(healthCmd, /node scripts\\content-editor\\server\.js health/i);
});

test('Noticias crea MDX, portada y galería sin sobrescribir', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'villars-news-editor-'));
  const input = {
    title: 'Nueva plaza para Villars',
    date: '2026-08-28',
    description: 'Una descripción breve y comprobable.',
    author: 'Villars Informa',
    category: 'Comunidad',
    tags: 'Villars, obras, Villars',
    content: '## Qué pasó\n\nContenido completo.',
    hero: tinyGif,
    gallery: [{ ...tinyGif, name: 'galeria.gif' }],
  };
  try {
    const result = await createNews(input, { rootDirectory: directory });
    assert.equal(result.url, '/noticias/nueva-plaza-para-villars/');
    const content = await readFile(join(directory, 'src/content/noticias/nueva-plaza-para-villars/index.mdx'), 'utf8');
    assert.match(content, /categoria: "Comunidad"/);
    assert.match(content, /tags: \["Villars","obras"\]/);
    assert.match(content, /portada: "\/images\/noticias\/nueva-plaza-para-villars\/foto.gif"/);
    assert.match(content, /imagenes: \["\/images\/noticias\/nueva-plaza-para-villars\/galeria.gif"\]/);
    await assert.rejects(() => createNews(input, { rootDirectory: directory }), /No se sobrescribió nada/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Noticias valida y conserva eventos geolocalizados sin mezclar fechas', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'villars-event-editor-'));
  const input = {
    title: 'Feria comunitaria',
    date: '2026-09-10',
    description: 'Una feria para toda la comunidad.',
    category: 'Comunidad',
    tags: ['Villars', 'agenda'],
    content: 'Información completa del evento.',
    event: true,
    eventDate: '2026-09-15',
    eventEndDate: '2026-09-16',
    eventTime: '18:30',
    eventPlace: 'Plaza de Villars',
    eventLat: '-34.8312345',
    eventLon: '-58.9456789',
    showEventMap: true,
  };
  try {
    const created = await createNews(input, { rootDirectory: directory });
    const source = await readFile(join(directory, 'src/content/noticias/feria-comunitaria/index.mdx'), 'utf8');
    assert.match(source, /fecha: "2026-09-10"/);
    assert.match(source, /evento: true/);
    assert.match(source, /fechaEvento: "2026-09-15"/);
    assert.match(source, /fechaFinEvento: "2026-09-16"/);
    assert.match(source, /latEvento: -34\.8312345/);
    const post = await readContent('news', created.slug, { rootDirectory: directory });
    assert.equal(post.event, true);
    assert.equal(post.eventPlace, 'Plaza de Villars');
    assert.equal(post.showEventMap, true);
    assert.throws(() => validateNewsInput({ ...input, eventDate: '' }), /fecha del evento es obligatoria/);
    assert.throws(() => validateNewsInput({ ...input, eventEndDate: '2026-09-01' }), /fecha final no puede ser anterior/);
    assert.throws(() => validateNewsInput({ ...input, eventLon: '', showEventMap: true }), /requiere latitud y longitud/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Salud crea una micropublicación válida con imagen y límite de 500 caracteres', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'villars-health-editor-'));
  const input = {
    title: 'Vacunación en el CAPS',
    date: '2026-08-28',
    message: 'El jueves habrá vacunación. Confirmá el horario antes de acercarte.',
    source: 'Ministerio de Salud',
    sourceUrl: 'https://www.ms.gba.gov.ar/',
    image: tinyGif,
  };
  try {
    const result = await createHealthUpdate(input, { rootDirectory: directory });
    assert.equal(result.url, '/salud/');
    const content = await readFile(join(directory, 'src/content/actualizaciones/vacunacion-en-el-caps/index.mdx'), 'utf8');
    assert.match(content, /mensaje: "El jueves habrá vacunación/);
    assert.match(content, /imagen: "\/images\/salud\/vacunacion-en-el-caps\/foto.gif"/);
    assert.throws(() => validateHealthInput({ ...input, message: 'a'.repeat(501) }), /máximo de 500/);
    assert.throws(() => validateHealthInput({ ...input, sourceUrl: 'javascript:alert(1)' }), /http o https/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('el servidor editorial solo acepta Host y Origin de loopback', () => {
  const port = 43123;
  assert.equal(validLocalRequest({ headers: { host: '127.0.0.1:43123' } }, port), true);
  assert.equal(validLocalRequest({ headers: { host: 'localhost:43123', origin: 'http://localhost:43123' } }, port, true), true);
  assert.equal(validLocalRequest({ headers: { host: 'evil.example' } }, port), false);
  assert.equal(validLocalRequest({ headers: { host: '127.0.0.1:43123', origin: 'https://evil.example' } }, port, true), false);
});

test('el editor responde por HTTP y sanitiza la vista previa Markdown', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'villars-editor-http-'));
  const server = createEditorServer({ channel: 'news', rootDirectory: directory });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const baseUrl = 'http://127.0.0.1:' + address.port;
  try {
    const bootstrap = await fetch(baseUrl + '/api/bootstrap').then((response) => response.json());
    assert.equal(bootstrap.channel, 'news');
    const previewResponse = await fetch(baseUrl + '/api/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ markdown: '# Título\n\n<script>alert(1)</script>Texto seguro' }),
    });
    assert.equal(previewResponse.status, 200);
    const preview = await previewResponse.json();
    assert.match(preview.html, /<h1>Título<\/h1>/);
    assert.doesNotMatch(preview.html, /<script>/);
    assert.match(preview.html, /Texto seguro/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test('el navegador editorial edita con revisión y archiva de forma recuperable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'villars-editor-library-'));
  try {
    const created = await createNews({
      title: 'Noticia editable',
      date: '2026-09-10',
      description: 'Versión inicial.',
      category: 'Comunidad',
      tags: ['Villars'],
      content: 'Contenido inicial.',
      hero: tinyGif,
    }, { rootDirectory: directory });
    const listed = await listContent('news', { rootDirectory: directory });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].slug, created.slug);
    const original = await readContent('news', created.slug, { rootDirectory: directory });
    const updated = await updateContent('news', created.slug, {
      ...original,
      revision: original.revision,
      title: 'Noticia corregida',
      description: 'Versión revisada.',
      content: 'Contenido actualizado.',
    }, { rootDirectory: directory });
    assert.notEqual(updated.revision, original.revision);
    assert.equal(updated.heroUrl.endsWith('/foto.gif'), true);
    await assert.rejects(() => updateContent('news', created.slug, {
      ...original,
      revision: original.revision,
    }, { rootDirectory: directory }), /cambió desde que la abriste/);
    const archived = await archiveContent('news', created.slug, {
      revision: updated.revision,
    }, { rootDirectory: directory });
    await assert.rejects(() => readContent('news', created.slug, { rootDirectory: directory }), /ya no existe/);
    await access(join(directory, archived.recoveryPath, 'content', 'index.mdx'));
    await access(join(directory, archived.recoveryPath, 'images', 'foto.gif'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test('Salud usa un único JSON editable y admite varios teléfonos inicialmente vacíos', async () => {
  const [page, data] = await Promise.all([
    readFile(new URL('../src/pages/salud.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/locales/salud.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  const entries = [
    ...data.atencion.serviciosPrincipales,
    ...data.atencion.otrosCentros,
    ...data.farmacias.lista,
    ...data.urgencias.contactos,
  ];
  assert.ok(page.includes('actualizaciones.slice(0, 5)'));
  assert.ok(page.includes("import salud from '../locales/salud.json'"));
  assert.match(page, /validPhones/);
  assert.match(page, /phoneHref/);
  assert.match(page, /id="pharmacy-select"/);
  assert.equal(data.atencion.serviciosPrincipales[1].nombre, 'CAPS Villars');
  assert.equal(data.farmacias.lista.length, 5);
  assert.ok(entries.every((entry) => Array.isArray(entry.telefonos)));
  assert.ok(entries.some((entry) => entry.telefonos.length > 1));
  assert.ok(entries.flatMap((entry) => entry.telefonos).every((phone) => phone.numero === ''));
});
