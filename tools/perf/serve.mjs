/* Serves one installed, patched extension as two panels: /v/pristine/ is the
   bundle as published (the .pristine copies apply.ps1 keeps beside each file -
   lib/Pristine.ps1), /v/patched/ is what the patches made of it. Same origin,
   same assets, same conversation; only the three bundles differ.

   /__host/ is the page's fake host (host/*.js) and its data (fixture.js). */
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { panelHtml } from './page.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
const BUNDLES = ['extension.js', 'webview/index.js', 'webview/index.css'];

/* The file a variant serves for a path inside the extension. */
function variantFile(ext, variant, rel) {
  const plain = join(ext, rel);
  if (variant === 'pristine' && BUNDLES.includes(rel.split('\\').join('/'))) {
    const kept = `${plain}.pristine`;
    if (!existsSync(kept)) throw new Error(`no ${rel}.pristine - was this extension patched by apply.ps1?`);
    return kept;
  }
  return plain;
}

export function fixtureJs(data) {
  return `window.__perf = ${JSON.stringify(data)};`;
}

export function startServer({ ext, data }) {
  const fixture = fixtureJs(data);
  const pages = {};
  const page = (variant) => (pages[variant] ||= panelHtml(ext, {
    css: 'webview/index.css', js: 'webview/index.js', session: data.session.sessionId, auth: data.init.authStatus,
    host: ['/__host/fixture.js', '/__host/fake-host.js', '/__host/turn.js'],
  }, variant === 'pristine' ? 'extension.js.pristine' : 'extension.js'));

  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      let body, type;
      if (url.pathname === '/__host/fixture.js') [body, type] = [fixture, TYPES['.js']];
      else if (url.pathname.startsWith('/__host/')) {
        const rel = normalize(url.pathname.slice(8)).replace(/^(\.\.[\\/])+/, '');
        body = readFileSync(join(HERE, 'host', rel));
        type = TYPES[extname(rel)];
      } else {
        const m = /^\/v\/(pristine|patched)\/(.*)$/.exec(url.pathname);
        if (!m) throw Object.assign(new Error('not found'), { code: 404 });
        if (m[2] === 'panel.html') [body, type] = [page(m[1]), TYPES['.html']];
        else {
          const rel = normalize(decodeURIComponent(m[2])).replace(/^(\.\.[\\/])+/, '');
          body = readFileSync(variantFile(ext, m[1], rel));
          type = TYPES[extname(rel)] || 'application/octet-stream';
        }
      }
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
      res.end(body);
    } catch (e) {
      res.writeHead(e.code === 404 || e.code === 'ENOENT' ? 404 : 500, { 'content-type': 'text/plain' });
      res.end(String(e.message || e));
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((r) => server.close(r)),
  })));
}
