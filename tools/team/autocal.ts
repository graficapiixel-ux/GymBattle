/**
 * Calibração automática das waves: para cada tamanho de time, procura (bisseção no
 * log) o multiplicador de dificuldade que dá a taxa de vitória alvo.
 * Uso: npx tsx tools/team/autocal.ts [lutas por ponto=40] [tamanhos=1,2,3] [iterações=7]
 * Imprime uma linha JSON por tamanho: {"n":3,"D":0.21,"win":0.46}
 */
import { mulberry32 } from '@gymbattle/shared';
import { simulateTeamFight } from '../../server/src/arena/teamsim';
import { THEMES, WAVES_TOTAL, arenaFor, buildWaves, TARGET_WIN, TEAM_DIFFICULTY } from '../../server/src/arena/waves';
import { testFighter, weaponFor } from './fighters';

const N = Number(process.argv[2] ?? 40);
const sizes = (process.argv[3] ?? '1,2,3').split(',').map(Number);
const ITER = Number(process.argv[4] ?? 7);

function winRate(n: number, D: number): number {
  // anula o multiplicador já gravado: queremos o valor absoluto
  const base = TEAM_DIFFICULTY[n] ?? 1;
  let wins = 0;
  for (let s = 0; s < N; s++) {
    const r = mulberry32(7000 + s * 97 + n * 13);
    const level = [6, 12, 20, 30][s % 4];
    const team = Array.from({ length: n }, (_, i) => testFighter(i + s, level, weaponFor(level, r)));
    const theme = THEMES[s % THEMES.length];
    const units = buildWaves(theme, team, s + 1, D / base);
    const rep = simulateTeamFight({ seed: s + 1, mode: 'waves', arena: arenaFor(theme, n), units, teamNames: ['Time', theme.name], waveTotal: WAVES_TOTAL, chiefName: theme.chief.name });
    if (rep.winner === 0) wins++;
  }
  return wins / N;
}

for (const n of sizes) {
  const target = TARGET_WIN[n];
  let lo = Math.log(0.01);
  let hi = Math.log(3);
  let best = { D: 0, win: 0, err: 9 };
  for (let it = 0; it < ITER; it++) {
    const mid = (lo + hi) / 2;
    const D = Math.exp(mid);
    const w = winRate(n, D);
    const err = Math.abs(w - target);
    if (err < best.err) best = { D, win: w, err };
    process.stderr.write(`n=${n} it=${it} D=${D.toFixed(4)} win=${w.toFixed(2)} alvo=${target}\n`);
    if (w > target) lo = mid; // fácil demais → mais difícil
    else hi = mid;
  }
  console.log(JSON.stringify({ n, D: Number(best.D.toFixed(4)), win: best.win }));
}
