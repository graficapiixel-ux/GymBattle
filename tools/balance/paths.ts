import { WEAPONS, buildFor, fighter, duel } from './lib.ts';
const G = 'SABCD';
export const pathOf = (w: any) => (Object.entries(w.scaling) as [string, string][]).sort((a, b) => G.indexOf(a[1]) - G.indexOf(b[1]))[0][0];
const PATHS = ['str', 'dex', 'int', 'fai'];
const levels = (process.argv[2] ?? '10,25,45,70,99').split(',').map(Number);
const N = Number(process.argv[3] ?? 6);
const TOP = Number(process.argv[4] ?? 4);
const R = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 } as Record<string, number>;
for (const L of levels) {
  // melhores armas de cada caminho no nível (maior raridade que dá para usar)
  const pick: Record<string, any[]> = {};
  for (const p of PATHS) {
    const ws = WEAPONS.filter((w) => pathOf(w) === p && buildFor(w, L));
    ws.sort((a, b) => R[b.rarity] - R[a.rarity] || b.baseDamage - a.baseDamage);
    pick[p] = ws.slice(0, TOP);
  }
  const score: Record<string, [number, number]> = Object.fromEntries(PATHS.map((p) => [p, [0, 0]]));
  const mat: string[] = [];
  for (let i = 0; i < PATHS.length; i++) for (let j = i + 1; j < PATHS.length; j++) {
    const a = PATHS[i], b = PATHS[j];
    let w = 0, n = 0;
    for (const wa of pick[a]) for (const wb of pick[b]) {
      const r = duel(fighter('A', wa.id, buildFor(wa, L)!), fighter('B', wb.id, buildFor(wb, L)!), N, L * 1000 + n);
      w += r.rate * N; n += N;
    }
    score[a][0] += w; score[a][1] += n; score[b][0] += n - w; score[b][1] += n;
    mat.push(`${a}×${b} ${(100 * w / n).toFixed(0)}%`);
  }
  console.log(`L${L}: ` + PATHS.map((p) => `${p} ${(100 * score[p][0] / Math.max(1, score[p][1])).toFixed(0)}% (${pick[p].map((w) => w.id.slice(0, 12)).join(',')})`).join(' | '));
  console.log('      ' + mat.join('  '));
}
