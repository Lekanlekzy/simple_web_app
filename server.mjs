import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = dirname(fileURLToPath(import.meta.url));
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

export function createApp(directory = appDirectory) {
  const dist = resolve(directory, 'dist');
  const manifest = resolve(directory, 'release.json');
  const revision = existsSync(manifest)
    ? JSON.parse(readFileSync(manifest, 'utf8')).revision
    : 'local';

  return createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(
        new URL(request.url, 'http://localhost').pathname,
      );
    } catch {
      response.writeHead(400).end();
      return;
    }
    if (pathname === '/healthz') {
      const index = resolve(dist, 'index.html');
      const html = existsSync(index) ? readFileSync(index, 'utf8') : '';
      const assets = [
        ...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g),
      ];
      const healthy =
        Boolean(html) &&
        assets.every((asset) => existsSync(resolve(dist, `.${asset[1]}`)));
      response.writeHead(healthy ? 200 : 503, {
        'Content-Type': contentTypes['.json'],
      });
      response.end(
        request.method === 'HEAD'
          ? undefined
          : JSON.stringify({ status: healthy ? 'ok' : 'unhealthy', revision }),
      );
      return;
    }
    const filename = resolve(
      dist,
      `.${pathname === '/' ? '/index.html' : pathname}`,
    );
    if (!filename.startsWith(dist + sep)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = readFileSync(filename);
      response.writeHead(200, {
        'Content-Type':
          contentTypes[extname(filename)] || 'application/octet-stream',
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      response.writeHead(404).end();
    }
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.PORT || 8080);
  createApp().listen(port, '0.0.0.0', () =>
    console.log(`Listening on port ${port}`),
  );
}
