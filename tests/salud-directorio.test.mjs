import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const salud = JSON.parse(await readFile(new URL('../src/locales/salud.json', import.meta.url), 'utf8'));
const services = [
  ...salud.atencion.serviciosPrincipales,
  ...salud.atencion.otrosCentros,
];
const records = [...services, ...salud.farmacias.lista, ...salud.urgencias.contactos];
const phoneNumbers = (item) => (item.telefonos || []).map((phone) => phone.numero);

test('Salud muestra el hospital, USAM y CAPS Hornos sin colapsar los contactos primarios', () => {
  const primaryNames = salud.atencion.serviciosPrincipales.map((x) => x.nombre).join(' | ');
  for (const name of ['CAPS Villars', 'CAPS General Hornos', 'Hospital Municipal', 'USAM', 'Farmacia Healy']) {
    assert.ok(primaryNames.includes(name), name + ' debe verse directamente');
  }
  assert.ok(salud.atencion.otrosCentros.some((x) => /Plomer/.test(x.nombre)));
  assert.ok(salud.atencion.otrosCentros.some((x) => /La Choza/.test(x.nombre)));
});

test('los teléfonos de salud tienen enlaces marcables válidos, fuente y no son números falsos', () => {
  for (const item of records) {
    assert.ok(item.nombre, 'no se publica un contacto sin nombre');
    assert.ok(item.fuenteUrl?.startsWith('https://'), 'sin fuente para ' + item.nombre);
    for (const number of phoneNumbers(item)) {
      assert.match(number, /^\+?[0-9][0-9\-\s]+$/, 'formato inválido para ' + item.nombre + ': ' + number);
      assert.ok(number.replace(/\D/g, '').length >= 3, number);
    }
  }
  const hornos = services.find((x) => x.nombre === 'CAPS General Hornos');
  assert.deepEqual(phoneNumbers(hornos), [], 'no asociar automáticamente el número de un CAPS anterior al nuevo');
});

test('SAME, bomberos, policía, hospital y salud mental están publicados', () => {
  const contacts = salud.urgencias.contactos.map((x) => ({ name: x.nombre, numbers: phoneNumbers(x) }));
  assert.ok(contacts.some((x) => x.numbers.includes('107')));
  assert.ok(contacts.some((x) => x.numbers.includes('100')));
  assert.ok(contacts.some((x) => x.numbers.includes('911')));
  assert.ok(contacts.some((x) => x.numbers.includes('0220-476-1000')));
  assert.ok(contacts.some((x) => x.numbers.includes('0220-496-2047')));
  assert.ok(contacts.some((x) => x.numbers.includes('0800-999-0091')));
});

test('farmacias no se rotulan como turnos en vivo y se incluye la farmacia nueva de Villars', async () => {
  assert.equal(salud.farmacias.lista.length, 6);
  assert.ok(salud.farmacias.lista.some((x) => x.nombre === 'Farmacia Healy' && x.localidad === 'Villars'));
  assert.match(salud.farmacias.advertencia, /NO indica quién está de turno/);
  const script = await readFile(new URL('../src/scripts/health.js', import.meta.url), 'utf8');
  const page = await readFile(new URL('../src/pages/salud.astro', import.meta.url), 'utf8');
  assert.match(script, /select\.value !== 'all'/);
  assert.match(page, /<option value="all">Todas las farmacias/);
  assert.match(page, /href="#urgencias"/);
});

test('fuentes tienen fecha de revisión pero conservan advertencia sobre documentación antigua', () => {
  assert.match(salud.verificadoEl, /^20\d\d-\d\d-\d\d$/);
  assert.ok(salud.fuentes.lista.length >= 10);
  assert.match(salud.fuentes.aviso, /abril de 2022/);
  for (const source of salud.fuentes.lista) assert.ok(new URL(source.url).protocol === 'https:');
});
