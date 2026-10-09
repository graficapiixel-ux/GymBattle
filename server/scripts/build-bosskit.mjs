/**
 * Compila o kit dos bosses para server/dist/bosskit.js (FORA da pasta pública).
 * O servidor só entrega esse arquivo pela rota protegida /api/events/kit.js.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
await esbuild.build({
  entryPoints: [path.join(root, 'client/src/bosskit/index.ts')],
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2020',
  outfile: path.join(root, 'server/dist/bosskit.js'),
  alias: { '@': path.join(root, 'client/src') },
  logLevel: 'warning',
});
console.log('Kit dos bosses compilado (protegido).');
