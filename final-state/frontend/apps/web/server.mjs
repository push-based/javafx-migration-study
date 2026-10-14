/**
 * Serves the production build and the Spring API from one origin, so the
 * browser never makes a cross-origin call and the unchanged Spring servers need
 * no CORS configuration. Any reverse proxy that routes the API paths the same
 * way (nginx, a cloud load balancer) does the same job in production.
 *
 * Usage: node server.mjs [BUILD_DIR]. Environment: PORT (default 4200),
 * API_URL (default http://localhost:8080).
 *
 * ponytail: stdlib server with no compression or cache headers; put a real
 * reverse proxy in front of it for production traffic.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream';

const root = resolve(process.argv[2] ?? 'dist/frontend/apps/web/browser');
const port = Number(process.env.PORT ?? 4200);
const api = new URL(process.env.API_URL ?? 'http://localhost:8080');

// The API paths, as in proxy.conf.json. Everything else belongs to the app.
const apiPaths = ['/musiccategories', '/weather/forecast'];

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain',
};

function proxy(req, res) {
  const upstream = request(
    {
      host: api.hostname,
      port: api.port,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: api.host },
    },
    (reply) => {
      res.writeHead(reply.statusCode ?? 502, reply.headers);
      // pipeline, not pipe: if the API server drops mid-stream, the browser's
      // connection must close too, or an EventSource never sees the error.
      // pipeline destroys both streams on failure, so the callback has no work.
      pipeline(reply, res, () => undefined);
    },
  );
  upstream.on('error', () =>
    res.headersSent ? res.destroy() : res.writeHead(502).end(),
  );
  // Close the upstream SSE stream when the browser closes its EventSource.
  res.on('close', () => upstream.destroy());
  req.pipe(upstream);
}

async function serveFile(pathname, res) {
  // Resolve inside the build directory only; anything else gets the app shell.
  let file = join(root, normalize(pathname));
  if (!file.startsWith(root + sep)) file = join(root, 'index.html');
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) file = join(root, 'index.html'); // App routes, such as /weather/latest.
  res.writeHead(200, {
    'content-type': types[extname(file)] ?? 'application/octet-stream',
  });
  createReadStream(file)
    .on('error', () => res.end())
    .pipe(res);
}

createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(
      new URL(req.url, 'http://localhost').pathname,
    );
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (apiPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    proxy(req, res);
  } else {
    serveFile(pathname, res);
  }
}).listen(port, () => {
  console.log(
    `Serving ${root} on http://localhost:${port}, API at ${api.origin}`,
  );
});
