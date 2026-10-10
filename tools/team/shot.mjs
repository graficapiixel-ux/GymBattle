/**
 * Fotos de uma luta em equipe: node tools/team/shot.mjs <args do make-replay entre aspas> <w>x<h> <outdir> <tempos em s|auto>
 * auto = início, cada wave, chefe e fim.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [args, size = '900x500', out = '/tmp/ts', which = 'auto'] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const replay = JSON.parse(execSync(`npx tsx tools/team/make-replay.ts ${args}`, { cwd: root, encoding: 'utf8', maxBuffer: 256 << 20 }));
fs.mkdirSync(out, { recursive: true });
const tmp = fs.mkdtempSync('/tmp/tms-');
await esbuild.build({ entryPoints: [path.join(root, 'client/src/bosskit/dev/team.ts')], bundle: true, format: 'iife', outfile: path.join(tmp, 'f.js'), alias: { '@': path.join(root, 'client/src') }, logLevel: 'error' });
fs.writeFileSync(path.join(tmp, 'i.html'), '<html><body style="margin:0;background:#000"><script src="f.js"></script></body></html>');
const { chromium } = await import('/home/claude/.npm-global/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: w, height: h } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto('file://' + path.join(tmp, 'i.html'));
await p.evaluate(([r, w, h]) => window.setupTeam(r, w, h), [replay, w, h]);
let shots;
if (which === 'auto') {
  shots = [{ T: 20, name: 'start' }];
  for (const e of replay.events.filter((e) => e.type === 'wave')) shots.push({ T: e.t + 20, name: `w${e.n}-a` }, { T: e.t + 200, name: `w${e.n}-b` });
  const end = replay.events.find((e) => e.type === 'end');
  if (end) shots.push({ T: end.t + 60, name: 'end' });
  if (replay.mode === 'pvp') for (const s of [5, 10, 20, 30]) shots.push({ T: s * 30, name: 's' + s });
} else shots = which.split(',').map((s) => ({ T: Number(s) * 30, name: 't' + s }));
for (const s of shots) {
  await p.evaluate((T) => window.teamFrame(T), s.T);
  await p.locator('canvas').screenshot({ path: path.join(out, s.name + '.png') });
}
await b.close();
console.log(`ok ${shots.length} quadros → ${out}; dur=${(replay.duration / 30).toFixed(0)}s winner=${replay.winner} reached=${replay.waves?.reached}`, errs.length ? errs.slice(0, 5) : '');
