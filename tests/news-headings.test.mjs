import test from 'node:test';
import assert from 'node:assert/strict';
import normalizeNewsHeadings from '../scripts/remark-news-headings.mjs';

test('news MDX does not produce two H1 headings', () => {
  const tree = { children: [
    { type: 'yaml', value: 'titulo: Ejemplo' },
    { type: 'heading', depth: 1, children: [{ type: 'text', value: 'Ejemplo' }] },
    { type: 'paragraph', children: [{ type: 'text', value: 'Cuerpo' }] },
    { type: 'heading', depth: 1, children: [{ type: 'text', value: 'Sección' }] },
  ] };
  normalizeNewsHeadings()(tree, { path: '/repo/src/content/noticias/ejemplo/index.mdx' });
  assert.equal(tree.children.length, 3);
  assert.equal(tree.children[1].type, 'paragraph');
  assert.equal(tree.children[2].depth, 2);
});

test('other MDX content is untouched', () => {
  const tree = { children: [{ type: 'heading', depth: 1 }] };
  normalizeNewsHeadings()(tree, { path: '/repo/src/locales/home-descripcion.mdx' });
  assert.equal(tree.children[0].depth, 1);
});
