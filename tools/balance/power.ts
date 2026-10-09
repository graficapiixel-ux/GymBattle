import { WEAPONS, buildFor, fighter } from './lib.ts';
import { simulateBattle, combatStrength } from '../../shared/src/index.ts';
// Calibra a escala do poder: quanto a diferença de força (log10) prevê quem vence.
const PAIRS = Number(process.argv[2] ?? 600);
const REP = Number(process.argv[3] ?? 4);
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const pts: { d: number; w: number; n: number }[] = [];
for (let k = 0; k < PAIRS; k++) {
  const mk = () => {
    for (;;) {
      const L = 1 + Math.floor(rnd() * 99);
      const w = WEAPONS[Math.floor(rnd() * WEAPONS.length)];
      const b = buildFor(w, L);
      if (b) return { w, b, L };
    }
  };
  const A = mk(), B = mk();
  // metade dos pares com níveis parecidos (é o caso mais comum no ranking)
  if (k % 2 === 0) { const b = buildFor(B.w, Math.max(1, Math.min(99, A.L + Math.round((rnd() - 0.5) * 16)))); if (b) { B.b = b; } }
  const sa = combatStrength(A.b as any, A.w.id), sb = combatStrength(B.b as any, B.w.id);
  let wa = 0;
  for (let r = 0; r < REP; r++) {
    const swap = r % 2 === 1;
    const fa = fighter('A', A.w.id, A.b), fb = fighter('B', B.w.id, B.b);
    const res = simulateBattle({ seed: k * 977 + r * 31 + 1, fighters: swap ? [fb, fa] : [fa, fb] });
    const aIdx = swap ? 1 : 0;
    wa += res.winner === null ? 0.5 : res.winner === aIdx ? 1 : 0;
  }
  pts.push({ d: Math.log10(sa) - Math.log10(sb), w: wa, n: REP });
}
// ajuste da escala c (máxima verossimilhança)
let best = { c: 0, ll: -Infinity };
for (let c = 50; c <= 1500; c += 10) {
  let ll = 0;
  for (const p of pts) {
    const e = 1 / (1 + Math.pow(10, -(c * p.d) / 400));
    const q = Math.min(1 - 1e-6, Math.max(1e-6, e));
    ll += p.w * Math.log(q) + (p.n - p.w) * Math.log(1 - q);
  }
  if (ll > best.ll) best = { c, ll };
}
console.log('escala ideal:', best.c);
// calibração por faixas
const buckets: Record<string, { w: number; n: number; e: number }> = {};
for (const p of pts) {
  const e = 1 / (1 + Math.pow(10, -(best.c * p.d) / 400));
  const fav = e >= 0.5 ? e : 1 - e;
  const favWins = e >= 0.5 ? p.w : p.n - p.w;
  const key = fav < 0.6 ? '50-60%' : fav < 0.7 ? '60-70%' : fav < 0.8 ? '70-80%' : fav < 0.9 ? '80-90%' : '90-100%';
  const bk = (buckets[key] ??= { w: 0, n: 0, e: 0 });
  bk.w += favWins; bk.n += p.n; bk.e += fav * p.n;
}
for (const k of ['50-60%', '60-70%', '70-80%', '80-90%', '90-100%']) {
  const b = buckets[k];
  if (b) console.log(`previsto ${k}: favorito venceu ${(100 * b.w / b.n).toFixed(0)}% (esperado ${(100 * b.e / b.n).toFixed(0)}%), ${b.n} lutas`);
}
