/**
 * Galeria dos bosses (desenvolvimento).
 * Uso: node tools/bosskit/shot.mjs <body|fx> <arch ou id,id,...> <saida.png> [cell=220]
 * Ex.: node tools/bosskit/shot.mjs body dragon /tmp/x.png
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [mode = 'body', filter = 'dragon', out = '/tmp/gallery.png', cellArg = '220'] = process.argv.slice(2);
const json = execSync('npx tsx tools/bosskit/export-catalog.ts', { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
const all = JSON.parse(json);
const keys = filter.split(',');
const specs = all.filter((b) => keys.includes(b.arch) || keys.includes(b.id) || filter === 'all');
const tmp = fs.mkdtempSync('/tmp/bkg-');
await esbuild.build({
  entryPoints: [path.join(root, 'client/src/bosskit/dev/gallery.ts')],
  bundle: true, format: 'iife', outfile: path.join(tmp, 'g.js'), alias: { '@': path.join(root, 'client/src') }, logLevel: 'error',
});
fs.writeFileSync(path.join(tmp, 'i.html'), '<html><body style="margin:0;background:#000"><script src="g.js"></script></body></html>');
const { chromium } = await import('/home/claude/.npm-global/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto('file://' + path.join(tmp, 'i.html'));
await p.evaluate(([s, c, m]) => window.renderGallery(s, { cell: c, mode: m }), [specs, Number(cellArg), mode]);
await p.locator('canvas').screenshot({ path: out });
await b.close();
console.log(`ok ${specs.length} boss(es) → ${out}`, errs.length ? errs.slice(0, 5) : '');
