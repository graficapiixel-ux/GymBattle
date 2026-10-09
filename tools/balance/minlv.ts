import { WEAPONS, buildFor } from './lib.ts';
const G = 'SABCD';
const pathOf = (w: any) => (Object.entries(w.scaling) as [string, string][]).sort((a, b) => G.indexOf(a[1]) - G.indexOf(b[1]))[0][0];
const minLevel = (w: any) => { let L = 2; while (!buildFor(w, L)) L++; return L; };
const R = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
for (const p of ['str', 'dex', 'int', 'fai']) {
  const line = R.map((r) => {
    const ls = WEAPONS.filter((w) => pathOf(w) === p && w.rarity === r && !w.starter).map(minLevel).sort((a, b) => a - b);
    return `${r.slice(0, 4)}: ${ls.join(',')}`;
  });
  console.log(p.padEnd(4), line.join(' | '));
}
