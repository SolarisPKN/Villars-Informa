import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createHealthDraft } from '../scripts/create-health.js';

test('los lanzadores CMD apuntan a sus generadores desde la raíz del repositorio', async () => {
  const [postCmd, healthCmd, packageText] = await Promise.all([
    readFile(new URL('../create-post.cmd', import.meta.url), 'utf8'),
    readFile(new URL('../create-salud.cmd', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ]);
  const packageData = JSON.parse(packageText);
  assert.equal(packageData.scripts['create-news'], 'node scripts/create-news.js');
  assert.equal(packageData.scripts['create-health'], 'node scripts/create-health.js');
  assert.match(postCmd, /cd \/d "%~dp0"/i);
  assert.match(postCmd, /call npm run create-news/i);
  assert.match(healthCmd, /cd \/d "%~dp0"/i);
  assert.match(healthCmd, /call npm run create-health/i);
});

test('el generador de Salud crea un MDX válido y rechaza sobrescrituras', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'villars-health-generator-'));
  const input = {
    title: 'Actualización de prueba',
    date: '2026-08-28',
    summary: 'Resumen sanitario verificado.',
    source: 'https://example.org/fuente-oficial',
  };
  try {
    const result = await createHealthDraft(input, directory);
    assert.equal(result.relativePath, 'src/content/actualizaciones/actualizacion-de-prueba/index.mdx');
    const content = await readFile(result.contentPath, 'utf8');
    assert.match(content, /^---\nfecha: 2026-08-28\ntitulo: "Actualización de prueba"\n---/);
    assert.match(content, /Resumen sanitario verificado/);
    assert.match(content, /https:\/\/example\.org\/fuente-oficial/);
    assert.match(content, /verificá fuente, fecha, teléfonos y vigencia/);
    await assert.rejects(() => createHealthDraft(input, directory), /Ya existe la actualización/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
