import { WEAPONS, buildFor, fighter } from './lib.ts';
import { simulateBattle, F, F_SIZE } from '../../shared/src/index.ts';
// Janelas longas sem acerto nenhum (os dois vivos): mostra onde cada um estava.
const L = Number(process.argv[2] ?? 30);
const N = Number(process.argv[3] ?? 200);
const ws = WEAPONS.filter((w) => buildFor(w, L));
let idle = 0, total = 0;
const samples: string[] = [];
const buckets: Record<string, number> = {};
for (let k = 0; k < N; k++) {
  const a = ws[(k * 7) % ws.length], b = ws[(k * 13 + 5) % ws.length];
  const r = simulateBattle({ seed: k * 7919 + 3, fighters: [fighter('A', a.id, buildFor(a, L)!), fighter('B', b.id, buildFor(b, L)!)] });
  const hits = r.events.filter((e) => e.type === 'hit' || e.type === 'ko' || e.type === 'respawn').map((e) => e.t);
  let hi = 0, run = 0;
  for (const row of r.frames) {
    const t = row[0];
    while (hi < hits.length && hits[hi] <= t) hi++;
    const last = hi > 0 ? hits[hi - 1] : 0;
    total += 2;
    const x0 = row[1 + F.x], y0 = row[1 + F.y], x1 = row[1 + F_SIZE + F.x], y1 = row[1 + F_SIZE + F.y];
    if (t - last > 120) {
      idle += 2; run += 2;
      const key = `${r.map} dy=${Math.round((y1 - y0) / 50) * 50} dx=${Math.round(Math.abs(x1 - x0) / 100) * 100}`;
      buckets[key] = (buckets[key] ?? 0) + 2;
      if (run === 240 && samples.length < 12) samples.push(`${r.map} t=${(t / 30).toFixed(0)}s ${a.id}(${a.category}) @${x0},${y0}  vs ${b.id}(${b.category}) @${x1},${y1}`);
    } else run = 0;
  }
}
console.log(`sem acerto >4s: ${(100 * idle / total).toFixed(1)}% do tempo`);
console.log(Object.entries(buckets).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${k}: ${(v / 30).toFixed(0)}s`).join('\n'));
console.log(samples.join('\n'));
