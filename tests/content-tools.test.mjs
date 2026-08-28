import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  createHealthUpdate,
  createNews,
  validateHealthInput,
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
test('la página Salud limita el feed y conserva avisos de vigencia', async () => {
  const [page, data] = await Promise.all([
    readFile(new URL('../src/pages/salud.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/data/health-services.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  assert.match(page, /actualizaciones\.slice\(0, 5\)/);
  assert.match(page, /Mostrar otros centros de salud/);
  assert.match(page, /id="pharmacy-select"/);
  assert.match(page, /Confirmá por teléfono qué farmacia está de turno/);
  assert.equal(data.primaryServices[1].name, 'CAPS Villars');
  assert.equal(data.pharmacies.length, 5);
});
