import { WEAPONS, buildFor, fighter } from './lib.ts';
import { simulateBattle, F, F_SIZE } from '../../shared/src/index.ts';
// Mede "impasse": tempo em que os dois estão em alturas diferentes e ninguém acerta ninguém.
const L = Number(process.argv[2] ?? 30);
const N = Number(process.argv[3] ?? 200);
const ws = WEAPONS.filter((w) => buildFor(w, L));
let stall = 0, total = 0, longest = 0, fights = 0, dur = 0, selfKo = 0;
const perMap: Record<string, number> = {};
for (let k = 0; k < N; k++) {
  const a = ws[(k * 7) % ws.length], b = ws[(k * 13 + 5) % ws.length];
  const r = simulateBattle({ seed: k * 7919 + 3, fighters: [fighter('A', a.id, buildFor(a, L)!), fighter('B', b.id, buildFor(b, L)!)] });
  fights++; dur += r.duration / 30;
  const hits = r.events.filter((e) => e.type === 'hit').map((e) => e.t);
  let hi = 0, run = 0;
  for (const row of r.frames) {
    const t = row[0];
    while (hi < hits.length && hits[hi] <= t) hi++;
    const lastHit = hi > 0 ? hits[hi - 1] : 0;
    const y0 = row[1 + F.y], y1 = row[1 + F_SIZE + F.y];
    const dead = row[1 + F.anim] === 9 || row[1 + F_SIZE + F.anim] === 9;
    total += 2;
    if (!dead && Math.abs(y0 - y1) > 60 && t - lastHit > 90) { stall += 2; run += 2; perMap[r.map] = (perMap[r.map] ?? 0) + 2; longest = Math.max(longest, run); }
    else run = 0;
  }
  const lastHit: number[] = [-999, -999];
  for (const e of r.events) { if (e.type === 'hit') lastHit[e.p] = e.t; if (e.type === 'ko' && e.reason === 'ring' && e.t - lastHit[e.p] > 75) selfKo++; }
}
console.log(`nível ${L}: ${fights} lutas, duração média ${(dur / fights).toFixed(1)}s, impasse ${(100 * stall / total).toFixed(1)}% do tempo, maior impasse ${(longest / 30).toFixed(1)}s, suicídios ${selfKo}`);
console.log(Object.fromEntries(Object.entries(perMap).map(([k, v]) => [k, (v / 30 / fights).toFixed(1) + 's/luta'])));
