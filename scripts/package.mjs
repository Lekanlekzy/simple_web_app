import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Only remove this generated directory, never source files.
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(project, 'deploy');
if (!output.startsWith(project + sep))
  throw new Error('Invalid package output directory.');
rmSync(output, { recursive: true, force: true });
mkdirSync(output);
cpSync(resolve(project, 'dist'), resolve(output, 'dist'), { recursive: true });
cpSync(resolve(project, 'server.mjs'), resolve(output, 'server.mjs'));
writeFileSync(
  resolve(output, 'package.json'),
  JSON.stringify(
    {
      name: 'simple-web-app',
      private: true,
      type: 'module',
      scripts: { start: 'node server.mjs' },
      engines: { node: '>=24 <25' },
    },
    null,
    2,
  ) + '\n',
);
// The central pipeline writes release.json with the actual commit before archiving.
