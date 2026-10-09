/**
 * Fotos de uma luta: node tools/bosskit/fight-shot.mjs <bossId> <n> <won> <seed> <w>x<h> <outdir> [tempos|moves]
 *  "moves" = um quadro em cada golpe do boss, nos instantes p=0.3/0.5/0.56/0.7
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [id, n, won, seed, size = '900x500', out = '/tmp/fs', which = 'moves'] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const replay = JSON.parse(execSync(`npx tsx tools/bosskit/make-replay.ts ${id} ${n} ${won} ${seed}`, { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 }));
fs.mkdirSync(out, { recursive: true });
const tmp = fs.mkdtempSync('/tmp/bkf-');
await esbuild.build({ entryPoints: [path.join(root, 'client/src/bosskit/dev/fight.ts')], bundle: true, format: 'iife', outfile: path.join(tmp, 'f.js'), alias: { '@': path.join(root, 'client/src') }, logLevel: 'error' });
fs.writeFileSync(path.join(tmp, 'i.html'), '<html><body style="margin:0;background:#000"><script src="f.js"></script></body></html>');
const { chromium } = await import('/home/claude/.npm-global/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: w, height: h } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto('file://' + path.join(tmp, 'i.html'));
await p.evaluate(([r, w, h]) => window.setupFight(r, w, h), [replay, w, h]);
let shots = [];
if (which === 'moves') {
  for (const ev of replay.events.filter((e) => e.type === 'bAtk')) {
    const atk = replay.boss.attacks[ev.a];
    for (const q of [0.3, 0.5, 0.56, 0.7]) shots.push({ T: ev.t + ev.dur * q, name: `${atk.move ?? atk.id}-${atk.name}-${q}` });
  }
  // só a primeira vez de cada golpe
  const seen = new Set();
  shots = shots.filter((s) => { const k = s.name; if (seen.has(k)) return false; seen.add(k); return true; });
} else {
  shots = which.split(',').map((t) => ({ T: Number(t), name: 't' + t }));
}
for (const s of shots) {
  await p.evaluate((T) => window.frameAt(T), s.T);
  await p.locator('canvas').screenshot({ path: path.join(out, s.name.replace(/[^\w.-]+/g, '_') + '.png') });
}
await b.close();
console.log(`ok ${shots.length} quadros → ${out}; dur=${replay.duration}`, errs.length ? errs.slice(0, 5) : '');
