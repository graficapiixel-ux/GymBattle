import { simulateTeamFight } from '../../server/src/arena/teamsim';
import { simulateBattle, weaponPower, WEAPONS_BY_ID } from '@gymbattle/shared';
import { testFighter } from './fighters';
const arena = { width: 1600, ground: 600, theme: { id: 'x', name: 'x', sky: ['#000', '#111'] as [string, string], ground: '#222', fog: '#333', particle: '#fff' } };
const lv = Number(process.argv[2] ?? 20);
for (let i = 1; i < 10; i++) {
  let a = 0, b = 0; const n = 30;
  for (let s = 1; s <= n; s++) {
    const f1 = testFighter(i, lv), f0 = testFighter(0, lv);
    if (simulateTeamFight({ seed: s * 13, mode: 'pvp', arena, units: [{ kind: 'player', team: 0, fighter: f1 }, { kind: 'player', team: 1, fighter: f0 }], teamNames: ['A', 'B'] }).winner === 0) a++;
    if (simulateBattle({ seed: s * 13, fighters: [f1, f0] }).winner === 0) b++;
  }
  const f = testFighter(i, lv);
  const p = weaponPower(WEAPONS_BY_ID[f.equipment.weapon!], f.attributes);
  console.log(f.equipment.weapon!.padEnd(22), 'team', (a / n).toFixed(2), ' 1v1', (b / n).toFixed(2), ' unmet', p.unmet);
}
