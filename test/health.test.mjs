import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { createApp } from '../server.mjs';

let server;
let base;
before(async () => {
  server = createApp();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

test('health endpoint and built page are available', async () => {
  const health = await fetch(`${base}/healthz`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok', revision: 'local' });
  const response = await fetch(base);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Simple Web App/);
  for (const [, asset] of html.matchAll(
    /(?:src|href)=["'](\/assets\/[^"']+)["']/g,
  )) {
    assert.equal((await fetch(base + asset)).status, 200);
  }
});
test('missing files and invalid requests do not expose server files', async () => {
  assert.equal((await fetch(`${base}/missing`)).status, 404);
  assert.equal((await fetch(`${base}/%zz`)).status, 400);
  assert.equal((await fetch(`${base}/%2f..%2fpackage.json`)).status, 403);
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
  const head = await fetch(base, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal(
    (await fetch(`${base}/healthz`, { method: 'HEAD' })).status,
    200,
  );
});
test('health reports the release revision and missing assets', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'simple-web-health-'));
  const revision = 'a'.repeat(40);
  writeFileSync(join(directory, 'release.json'), JSON.stringify({ revision }));
  mkdirSync(join(directory, 'dist'));
  const app = createApp(directory);
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  const url = `http://127.0.0.1:${app.address().port}/healthz`;
  try {
    assert.equal((await fetch(url)).status, 503);
    writeFileSync(
      join(directory, 'dist/index.html'),
      '<script src="/assets/missing.js"></script>',
    );
    const unhealthy = await fetch(url);
    assert.equal(unhealthy.status, 503);
    assert.deepEqual(await unhealthy.json(), { status: 'unhealthy', revision });
    mkdirSync(join(directory, 'dist/assets'));
    writeFileSync(
      join(directory, 'dist/assets/missing.js'),
      'console.log("ok");',
    );
    const healthy = await fetch(url);
    assert.equal(healthy.status, 200);
    assert.deepEqual(await healthy.json(), { status: 'ok', revision });
  } finally {
    await new Promise((resolve) => app.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  }
});
