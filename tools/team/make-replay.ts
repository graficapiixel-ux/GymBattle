/** Gera um replay de equipe para testes visuais: npx tsx tools/team/make-replay.ts waves <tema> <n> <seed> [D] | pvp <n> <seed> */
import { mulberry32 } from '@gymbattle/shared';
import { THEMES_BY_ID } from '../../server/src/arena/waves';
import { runPvp } from '../../server/src/arena/teamEvents';
import { simulateTeamFight } from '../../server/src/arena/teamsim';
import { WAVES_TOTAL, arenaFor, buildWaves } from '../../server/src/arena/waves';
import { testFighter, weaponFor } from './fighters';

const [mode, a, b, c, d] = process.argv.slice(2);
if (mode === 'waves') {
  const theme = THEMES_BY_ID[a];
  const n = Number(b);
  const seed = Number(c);
  const r = mulberry32(seed);
  const team = Array.from({ length: n }, (_, i) => testFighter(i, 20, weaponFor(20, r)));
  const units = buildWaves(theme, team, seed, Number(d ?? 1));
  const rep = simulateTeamFight({ seed, mode: 'waves', arena: arenaFor(theme, n), units, teamNames: ['Time', theme.name], waveTotal: WAVES_TOTAL, chiefName: `${theme.chief.name} ${theme.chief.title}` });
  process.stdout.write(JSON.stringify(rep));
} else {
  const n = Number(a);
  const seed = Number(b);
  const r = mulberry32(seed);
  const A = Array.from({ length: n }, (_, i) => testFighter(i, 20, weaponFor(20, r)));
  const B = Array.from({ length: n }, (_, i) => testFighter(i + n, 20, weaponFor(20, r)));
  process.stdout.write(JSON.stringify(runPvp({ name: 'Time Azul', fighters: A }, { name: 'Time Vermelho', fighters: B }, seed)));
}
