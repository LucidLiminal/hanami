import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import handler from './api/index.mjs';

const root = join(process.cwd(), 'public');
const port = Number(process.env.PORT || 4173);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

function decorate(req, res, url) {
  req.query = Object.fromEntries(url.searchParams);
  req.query.path = url.pathname.replace(/^\/api\/?/, '');
  res.status = code => { res.statusCode = code; return res; };
  res.json = value => { res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(value)); };
  res.send = value => res.end(value);
}

async function collect(req) {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error('Cuerpo demasiado grande');
  }
  req.body = raw;
}

async function serve(url, res) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/' || !extname(pathname)) pathname = '/index.html';
  const file = normalize(join(root, pathname));
  if (!file.startsWith(root)) throw new Error('Ruta no permitida');
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('No es un archivo');
    const data = await readFile(file);
    res.statusCode = 200;
    res.setHeader('content-type', types[extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  try {
    if (url.pathname.startsWith('/api/')) {
      decorate(req, res, url);
      await collect(req);
      return await handler(req, res);
    }
    return await serve(url, res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: error.message }));
    } else res.end();
  }
});

server.listen(port, '127.0.0.1', () => console.log(`Hanami local: http://127.0.0.1:${port}`));
