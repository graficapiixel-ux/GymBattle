import { WEAPONS, buildFor, fighter, duel } from './lib.ts';
const L = Number(process.argv[2] ?? 30);
const ws = WEAPONS.filter((w) => buildFor(w, L));
let self = 0, ko = 0, ring = 0, n = 0;
const byW: Record<string, number> = {};
for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j += 3) {
  const A = fighter('A', ws[i].id, buildFor(ws[i], L)!), B = fighter('B', ws[j].id, buildFor(ws[j], L)!);
  const r = duel(A, B, 4, i * 100 + j);
  self += r.selfKo; ko += r.ko; ring += r.ringKo; n += 4;
}
console.log(`nível ${L}: lutas ${n}, KOs ${ko}, ring ${ring}, suicídios ${self} (${(100 * self / ko).toFixed(1)}% dos KOs, ${(self / n).toFixed(2)}/luta)`);
