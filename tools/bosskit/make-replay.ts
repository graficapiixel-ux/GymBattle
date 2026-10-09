/** Gera um replay de teste: npx tsx tools/bosskit/make-replay.ts <bossId> <n> <won 0|1> <seed> */
import { BOSSES_BY_ID } from '../../server/src/bosses/catalog';
import { simulateBossFight } from '../../server/src/bosses/sim';
const [id = 'takamori', nArg = '4', wonArg = '1', seedArg = '7'] = process.argv.slice(2);
const W = ['uchigatana', 'arco-curto-cacador', 'cajado-de-brasas', 'machado-de-guerra', 'lanca-de-milicia', 'facas-gemeas', 'besta-pesada', 'selo-do-novico', 'montante-de-ferro', 'maca-cravejada'];
const C = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1', '#34495e', '#ff66aa'];
const fighters = Array.from({ length: Number(nArg) }, (_, i) => ({
  id: 'u' + i, username: 'Jogador' + (i + 1), level: 5 + i * 3, title: null,
  attributes: { str: 10 + i, dex: 10, vig: 12, fort: 10, ess: 10, int: 10, fai: 10 },
  look: { skin: ['#f1c27d', '#8d5524', '#c68642', '#ffdbac'][i % 4], face: i % 5, hair: i % 6, hairColor: '#2a1a10', beard: i % 3, body: i % 3, height: 1, gender: i % 2, eyes: '#333', marks: 0, accessory: 0, top: C[i], shorts: '#222' },
  equipment: { weapon: W[i % W.length], helm: null, chest: null, gloves: null, legs: null },
}));
const boss = BOSSES_BY_ID[id];
process.stdout.write(JSON.stringify(simulateBossFight({ boss, fighters, won: wonArg === '1', seed: Number(seedArg) })));
