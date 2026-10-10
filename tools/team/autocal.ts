/**
 * Acha, para cada tamanho de time, o multiplicador de dificuldade que dá a taxa de
 * vitória alvo (busca binária em escala log). Uso: npx tsx tools/team/autocal.ts [lutas=60] [tamanhos]
 * Copie o resultado para TEAM_DIFFICULTY em server/src/arena/waves.ts.
 */
import { mulberry32 } from '@gymbattle/shared';
import { simulateTeamFight } from '../../server/src/arena/teamsim';
import { THEMES, WAVES_TOTAL, arenaFor, buildWaves, TARGET_WIN, TEAM_DIFFICULTY } from '../../server/src/arena/waves';
import { testFighter, weaponFor } from './fighters';

const N = Number(process.argv[2] ?? 60);
const sizes = (process.argv[3] ?? '1,2,3,4,5,6,7,8,9,10').split(',').map(Number);

export function winRate(n: number, D: number, count = N, base = 1000) {
  let wins = 0;
  for (let s = 0; s < count; s++) {
    const r = mulberry32(base + s * 31 + n);
    const level = [6, 12, 20, 30][s % 4];
    const team = Array.from({ length: n }, (_, i) => testFighter(i, level, weaponFor(level, r)));
    const theme = THEMES[s % THEMES.length];
    // buildWaves já aplica TEAM_DIFFICULTY[n]; aqui medimos o multiplicador "bruto"
    const units = buildWaves(theme, team, s + 1, D / (TEAM_DIFFICULTY[n] ?? 1));
    const rep = simulateTeamFight({ seed: s + 1, mode: 'waves', arena: arenaFor(theme, n), units, teamNames: ['Time', theme.name], waveTotal: WAVES_TOTAL, chiefName: theme.chief.name });
    if (rep.winner === 0) wins++;
  }
  return wins / count;
}

const out: Record<number, number> = {};
for (const n of sizes) {
  let lo = Math.log(0.01);
  let hi = Math.log(1.5);
  for (let it = 0; it < 9; it++) {
    const mid = (lo + hi) / 2;
    const w = winRate(n, Math.exp(mid));
    if (w > TARGET_WIN[n]) lo = mid; // fácil demais → mais difícil
    else hi = mid;
  }
  out[n] = +Math.exp((lo + hi) / 2).toFixed(4);
  console.log(`time ${n}: D=${out[n]} (vitória ${(winRate(n, out[n], N, 5000) * 100).toFixed(0)}% em sementes novas, alvo ${(TARGET_WIN[n] * 100).toFixed(0)}%)`);
}
console.log(JSON.stringify(out));
