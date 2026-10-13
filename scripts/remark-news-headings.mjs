/**
 * The article template already renders the canonical <h1> from frontmatter.
 * Older MDX articles also start with a duplicate Markdown "# title".
 * Remove only that leading heading, and demote subsequent level-1 headings.
 * Do not touch MDX outside the news collection.
 */
export default function normalizeNewsHeadings() {
  return (tree, file) => {
    const path = String(file?.path || file?.history?.[0] || '').replace(/\\/g, '/');
    if (!/\/src\/content\/noticias\/.*\.mdx?$/i.test(path)) return;
    const firstBodyNode = tree.children.findIndex((node) =>
      !['yaml', 'toml', 'definition'].includes(node.type)
      && !(node.type === 'html' && !node.value?.trim()));
    tree.children = tree.children.filter((node, index) => {
      if (node.type !== 'heading' || node.depth !== 1) return true;
      if (index === firstBodyNode) return false;
      node.depth = 2;
      return true;
    });
  };
}
