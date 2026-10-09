import { simulateBattle, DEFAULT_AVATAR, WEAPONS, type FighterInput } from '../../shared/src/index.ts';
export const KEYS = ['str', 'dex', 'vig', 'fort', 'ess', 'int', 'fai'] as const;
type K = (typeof KEYS)[number];
const CASTER = new Set(['staff', 'seal']);
/** Build sensata para usar a arma W no nível L. null se não dá para cumprir requisitos. */
export function buildFor(w: any, level: number): Record<K, number> | null {
  const a: Record<K, number> = { str: 5, dex: 5, vig: 5, fort: 5, ess: 5, int: 5, fai: 5 };
  let pts = level - 1;
  for (const [k, need] of Object.entries(w.requirements) as [K, number][]) {
    const d = Math.max(0, need - a[k]);
    a[k] += d; pts -= d;
  }
  if (pts < 0) return w.starter ? { str: 5, dex: 5, vig: 5, fort: 5, ess: 5, int: 5, fai: 5 } : null;
  const scal = Object.entries(w.scaling).sort((x: any, y: any) => 'SABCD'.indexOf(x[1]) - 'SABCD'.indexOf(y[1])).map(([k]) => k as K);
  const main = scal[0];
  const second = CASTER.has(w.category) || w.a1.mana > 0 || w.a2.mana > 8 ? 'ess' : 'fort';
  // ciclo de prioridades: principal ×2, vigor, secundário
  const cycle: K[] = [main, 'vig', main, second, 'vig', ...(scal[1] ? [scal[1]] : [main])];
  let i = 0;
  while (pts > 0) {
    const k = cycle[i++ % cycle.length];
    if (a[k] >= 60) { if (i > 1000) break; continue; }
    a[k]++; pts--;
  }
  return a;
}
export function fighter(name: string, weapon: string, attrs: Record<K, number>): FighterInput {
  return {
    id: name, username: name, level: 1, title: null, attributes: attrs as any,
    look: { ...DEFAULT_AVATAR }, equipment: { weapon, helm: null, chest: null, gloves: null, legs: null },
  };
}
/** Luta N vezes (alternando lados). Retorna win rate de A, suicídios etc. */
export function duel(A: FighterInput, B: FighterInput, N: number, seed0 = 1) {
  let wa = 0, wb = 0, draw = 0, selfKo = 0, ko = 0, ringKo = 0, dur = 0;
  for (let s = 0; s < N; s++) {
    const swap = s % 2 === 1;
    const r = simulateBattle({ seed: (seed0 + s) * 7919 + 13, fighters: swap ? [B, A] : [A, B] });
    const aIdx = swap ? 1 : 0;
    if (r.winner === null) draw++; else if (r.winner === aIdx) wa++; else wb++;
    dur += r.duration / 30;
    const lastHit: number[] = [-999, -999];
    for (const e of r.events) {
      if (e.type === 'hit') lastHit[e.p] = e.t;
      if (e.type === 'ko') {
        ko++;
        if (e.reason === 'ring') { ringKo++; if (e.t - lastHit[e.p] > 75) selfKo++; }
      }
    }
  }
  return { wa, wb, draw, rate: (wa + draw / 2) / N, selfKo, ko, ringKo, dur: dur / N };
}
export { WEAPONS };
