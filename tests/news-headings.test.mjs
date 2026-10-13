import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { normalizeNewsBody } from '../scripts/lib/news-headings.mjs';

test('editor strips duplicate leading title and demotes later H1', () => {
  const normalized = normalizeNewsBody('# Noticia titular\n\nCuerpo.\n\n# Subsección\n');
  assert.equal(normalized, 'Cuerpo.\n\n## Subsección');
});
test('editor does not rewrite code fences', () => {
  assert.equal(normalizeNewsBody('Texto\n\n```sh\n# comentario\n```'), 'Texto\n\n```sh\n# comentario\n```');
});
test('every article uses the layout as its only H1', async () => {
  const folder = resolve('src/content/noticias');
  for (const item of await readdir(folder, { withFileTypes: true })) {
    if (!item.isDirectory()) continue;
    const mdx = await readFile(join(folder, item.name, 'index.mdx'), 'utf8');
    const body = mdx.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
    assert.doesNotMatch(body, /^#\s+/m, item.name);
  }
});
