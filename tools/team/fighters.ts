/** Jogadores de teste para as lutas em equipe (desenvolvimento e calibração). */
import { WEAPONS, WEAPONS_BY_ID, type FighterInput } from '@gymbattle/shared';

const C = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1', '#34495e', '#ff66aa'];
type A = { str: number; dex: number; vig: number; fort: number; ess: number; int: number; fai: number };

/** Atributo principal de uma arma (o de maior escalonamento). */
function mainAttr(id: string): keyof A {
  const w = WEAPONS_BY_ID[id];
  const order = ['S', 'A', 'B', 'C', 'D'];
  const sc = Object.entries(w.scaling).sort((a, b) => order.indexOf(a[1]!) - order.indexOf(b[1]!));
  return (sc[0]?.[0] as keyof A) ?? 'str';
}

/** Build coerente: cumpre os requisitos da arma, depois sobe o atributo principal e vigor. */
export function testFighter(i: number, level = 12, weapon?: string): FighterInput {
  let pts = level - 1;
  const a: A = { str: 5, dex: 5, vig: 5, fort: 5, ess: 5, int: 5, fai: 5 };
  const w = weapon ? WEAPONS_BY_ID[weapon] : undefined;
  if (w) {
    for (const [k, need] of Object.entries(w.requirements) as [keyof A, number][]) {
      const add = Math.max(0, Math.min(pts, need - a[k]));
      a[k] += add;
      pts -= add;
    }
    const main = mainAttr(w.id);
    const toMain = Math.ceil(pts * 0.55);
    a[main] += toMain;
    pts -= toMain;
  }
  const toVig = Math.ceil(pts * 0.6);
  a.vig += toVig;
  a.fort += pts - toVig;
  return {
    id: 'u' + i, username: 'Jogador' + (i + 1), level, title: null, attributes: a,
    look: { skin: ['#f1c27d', '#8d5524', '#c68642', '#ffdbac'][i % 4], face: i % 5, hair: i % 6, hairColor: '#2a1a10', beard: i % 3, body: i % 3, height: 1, gender: i % 2, eyes: '#333', marks: 0, accessory: 0, top: C[i % C.length], shorts: '#222' },
    equipment: { weapon: weapon ?? null, helm: null, chest: null, gloves: null, legs: null },
  };
}

/** Uma arma que alguém desse nível consegue usar (comum/incomum/rara conforme o nível). */
export function weaponFor(level: number, r: () => number): string {
  const total = level - 1;
  const ok = WEAPONS.filter((w) => Object.values(w.requirements).reduce((s, v) => s + Math.max(0, (v ?? 5) - 5), 0) <= total * 0.8);
  const best = ok.filter((w) => (level < 12 ? w.rarity === 'common' : level < 25 ? w.rarity !== 'common' && w.rarity !== 'legendary' && w.rarity !== 'epic' : w.rarity === 'rare' || w.rarity === 'epic'));
  const list = best.length ? best : ok;
  return list[Math.floor(r() * list.length)].id;
}
