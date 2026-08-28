import http from 'node:http';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';
import { createContent, getNewsTaxonomy, projectRoot, today } from '../content-service.js';

const host = '127.0.0.1';
const editorDirectory = path.dirname(fileURLToPath(import.meta.url));
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
]);

function send(response, status, body, contentType = 'application/json; charset=utf-8') {
  response.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'self'; style-src 'self'; img-src 'self' data: blob:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    'referrer-policy': 'no-referrer',
  });
  response.end(contentType.startsWith('application/json') ? JSON.stringify(body) : body);
}

export function validLocalRequest(request, port, checkOrigin = false) {
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const requestHost = request.headers.host;
  if (!allowedHosts.has(requestHost)) return false;
  if (!checkOrigin) return true;
  const origin = request.headers.origin;
  return !origin || origin === `http://${requestHost}`;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 45 * 1024 * 1024) throw new Error('La solicitud supera el máximo de 45 MB.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new Error('La solicitud no contiene JSON válido.');
  }
}

function openBrowser(url) {
  const options = { detached: true, stdio: 'ignore', windowsHide: true };
  const child = process.platform === 'win32'
    ? spawn('cmd.exe', ['/d', '/s', '/c', 'start', '', url], options)
    : process.platform === 'darwin'
      ? spawn('open', [url], options)
      : spawn('xdg-open', [url], options);
  child.unref();
}

export function createEditorServer({ channel, rootDirectory = projectRoot } = {}) {
  if (!['news', 'health'].includes(channel)) throw new Error('El editor requiere el canal news o health.');

  const server = http.createServer(async (request, response) => {
    const port = server.address().port;
    if (!validLocalRequest(request, port, request.method !== 'GET')) {
      send(response, 403, { error: 'Solicitud local no válida.' });
      return;
    }

    try {
      const url = new URL(request.url, `http://${host}:${port}`);
      if (request.method === 'GET' && assets.has(url.pathname)) {
        const [filename, contentType] = assets.get(url.pathname);
        send(response, 200, await fsp.readFile(path.join(editorDirectory, filename)), contentType);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/bootstrap') {
        const taxonomy = channel === 'news' ? await getNewsTaxonomy({ rootDirectory }) : { categories: [], tags: [] };
        send(response, 200, { channel, date: today(), ...taxonomy });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/preview') {
        const payload = await readJson(request);
        const html = DOMPurify.sanitize(await marked.parse(String(payload.markdown ?? '')));
        send(response, 200, { html });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/content') {
        const result = await createContent(channel, await readJson(request), { rootDirectory });
        send(response, 201, result);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/shutdown') {
        send(response, 200, { ok: true });
        setImmediate(() => server.close());
        return;
      }

      send(response, 404, { error: 'Ruta inexistente.' });
    } catch (error) {
      const status = error.code === 'CONTENT_EXISTS' ? 409 : 400;
      send(response, status, { error: error.message || 'Error inesperado.' });
    }
  });
  return server;
}

export async function startEditor({ channel, rootDirectory = projectRoot, open = true } = {}) {
  const server = createEditorServer({ channel, rootDirectory });
  const requestedPort = Number.parseInt(process.env.CONTENT_EDITOR_PORT || '0', 10);
  const port = Number.isInteger(requestedPort) && requestedPort >= 0 ? requestedPort : 0;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const url = `http://${host}:${address.port}`;
  const label = channel === 'news' ? 'Noticias' : 'Salud';
  console.log(`Editor local de ${label}: ${url}`);
  console.log('Cerrá esta ventana o usá el botón "Cerrar editor" para detenerlo.');
  if (open && process.env.CONTENT_EDITOR_NO_OPEN !== '1') openBrowser(url);
  return { server, url };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const channel = process.argv[2];
  startEditor({ channel }).catch((error) => {
    console.error(`No se pudo abrir el editor: ${error.message}`);
    process.exitCode = 1;
  });
}
