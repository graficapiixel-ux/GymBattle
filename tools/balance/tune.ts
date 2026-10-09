import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { WEAPONS, buildFor, fighter, duel } from './lib.ts';
const PRIME: Record<string, number> = { common: 16, uncommon: 26, rare: 38, epic: 55, legendary: 80 };
const ITERS = Number(process.argv[2] ?? 10);
const OPP = Number(process.argv[3] ?? 14);
const FIGHTS = Number(process.argv[4] ?? 4);
const OUT = process.argv[5] ?? 'tools/balance/out/tuning2.out';
const ONLY = (process.argv[6] ?? 'common,uncommon,rare,epic,legendary').split(',');
const raw = new Map(WEAPONS.map((w) => [w.id, w.baseDamage]));
const mult = new Map(WEAPONS.map((w) => [w.id, 1]));
if (existsSync(OUT + '.state')) for (const [id, m] of Object.entries(JSON.parse(readFileSync(OUT + '.state', 'utf8')))) mult.set(id, m as number);
const apply = () => { for (const w of WEAPONS) w.baseDamage = Math.round(raw.get(w.id)! * mult.get(w.id)!); };
const minLevel = (w: any) => { let L = 2; while (!buildFor(w, L)) L++; return L; };
const levels = (w: any) => { const e = minLevel(w) + 3; return [...new Set([e, Math.max(PRIME[w.rarity], e)])]; };
let rng = 987;
const rand = () => ((rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648);
for (let it = 0; it < ITERS; it++) {
  apply();
  const rates = new Map<string, number>();
  for (const r of Object.keys(PRIME).filter((x) => ONLY.includes(x))) {
    const pool = WEAPONS.filter((w) => w.rarity === r && !w.starter);
    for (const w of pool) {
      let tot = 0, n = 0;
      for (const L of levels(w)) {
        const opps = pool.filter((o) => o.id !== w.id && buildFor(o, L)).sort(() => rand() - 0.5).slice(0, OPP);
        for (const o of opps) {
          const res = duel(fighter('A', w.id, buildFor(w, L)!), fighter('B', o.id, buildFor(o, L)!), FIGHTS, it * 7777 + n + L);
          tot += res.rate * FIGHTS; n += FIGHTS;
        }
      }
      if (n) rates.set(w.id, tot / n);
    }
  }
  let dev = 0;
  for (const [id, rate] of rates) {
    const adj = Math.pow(0.5 / Math.min(0.95, Math.max(0.05, rate)), Number(process.env.EXP ?? (it < 3 ? 0.6 : 0.4)));
    mult.set(id, Math.min(2.2, Math.max(0.4, mult.get(id)! * adj)));
    dev += Math.abs(rate - 0.5);
  }
  writeFileSync(OUT + '.state', JSON.stringify(Object.fromEntries(mult)));
  console.log(`iter ${it}: desvio ${(100 * dev / rates.size).toFixed(1)}; piores: ` + [...rates].sort((a, b) => Math.abs(b[1] - 0.5) - Math.abs(a[1] - 0.5)).slice(0, 5).map(([id, r]) => `${id} ${(r * 100).toFixed(0)}% (x${mult.get(id)!.toFixed(2)})`).join(', '));
}
const lines = [...mult].filter(([id, m]) => Math.abs(m - 1) > 0.005 && ONLY.includes(WEAPONS.find((w) => w.id === id)!.rarity)).sort((a, b) => a[0].localeCompare(b[0])).map(([id, m]) => `  '${id}': ${m.toFixed(3)},`);
writeFileSync(OUT, lines.join('\n'));
console.log('ajustes:', lines.length);
