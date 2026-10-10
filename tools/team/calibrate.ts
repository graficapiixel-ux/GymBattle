/**
 * Calibração das waves: roda muitas lutas por tamanho de time e mostra a taxa de
 * vitória. Uso: npx tsx tools/team/calibrate.ts [lutas por ponto=40] [tamanhos=1,2,3,4,5]
 */
import { mulberry32 } from '@gymbattle/shared';
import { simulateTeamFight } from '../../server/src/arena/teamsim';
import { THEMES, WAVES_TOTAL, arenaFor, buildWaves, TARGET_WIN } from '../../server/src/arena/waves';
import { testFighter, weaponFor } from './fighters';

const N = Number(process.argv[2] ?? 40);
const sizes = (process.argv[3] ?? '1,2,3,4,5').split(',').map(Number);
const D = Number(process.argv[4] ?? 1);

for (const n of sizes) {
  let wins = 0;
  let reached = 0;
  let secs = 0;
  const t0 = Date.now();
  for (let s = 0; s < N; s++) {
    const r = mulberry32(1000 + s * 31 + n);
    const level = [6, 12, 20, 30][s % 4];
    const team = Array.from({ length: n }, (_, i) => testFighter(i, level, weaponFor(level, r)));
    const theme = THEMES[s % THEMES.length];
    const units = buildWaves(theme, team, s + 1, D);
    const rep = simulateTeamFight({ seed: s + 1, mode: 'waves', arena: arenaFor(theme, n), units, teamNames: ['Time', theme.name], waveTotal: WAVES_TOTAL, chiefName: theme.chief.name });
    if (rep.winner === 0) wins++;
    reached += rep.waves!.reached;
    secs += rep.duration / 30;
  }
  console.log(`time ${n}: vitória ${((wins / N) * 100).toFixed(0)}% (alvo ${(TARGET_WIN[n] * 100).toFixed(0)}%) · wave média ${(reached / N).toFixed(1)} · duração média ${(secs / N).toFixed(0)} s · ${((Date.now() - t0) / N).toFixed(0)} ms/luta`);
}
