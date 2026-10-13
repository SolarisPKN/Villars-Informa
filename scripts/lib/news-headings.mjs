/**
 * The news layout renders one canonical H1 from frontmatter. Headlines in
 * article bodies are redundant; section headings should start at H2.
 * Preserve literal hash comments within Markdown code fences.
 */
export function normalizeNewsBody(content) {
  const lines = String(content).replace(/\r\n/g, '\n').split('\n');
  const firstContent = lines.findIndex((line) => line.trim().length > 0);
  if (firstContent !== -1 && /^#(?:\s|$)/.test(lines[firstContent])) {
    lines.splice(firstContent, 1);
  }
  let fence = null;
  return lines.map((line) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker[0];
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      return line;
    }
    return !fence && /^#\s+/.test(line) ? line.replace(/^#\s+/, '## ') : line;
  }).join('\n').trim();
}
