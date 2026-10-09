import { gzipSync } from 'node:zlib';
import { randomInt } from 'node:crypto';
import type { User } from '@prisma/client';
import { MAPS, simulateBattle, simulateBattleWithLegend, type FighterInput, type Replay } from '@gymbattle/shared';
import { prisma } from '../db.js';
import { avatarOf, equipmentOf } from './serialize.js';

export function fighterSnapshot(u: User): FighterInput {
  return {
    id: u.id,
    username: u.username,
    level: u.level,
    title: u.title,
    attributes: { str: u.str, dex: u.dex, vig: u.vig, fort: u.fort, ess: u.ess, int: u.int, fai: u.fai },
    look: avatarOf(u),
    equipment: equipmentOf(u),
  };
}

/** Simula a luta, grava o replay comprimido e devolve o registro. */
export async function runBattle(a: User, b: User, mode: 'friendly' | 'ranked', mapId?: string) {
  const seed = randomInt(1, 2 ** 31 - 1);
  const map = mapId ?? MAPS[randomInt(0, MAPS.length)].id;
  const opts = { seed, mapId: map, fighters: [fighterSnapshot(a), fighterSnapshot(b)] as [FighterInput, FighterInput] };
  // evento lendário ativado pelo admin: vale para UMA luta e desliga sozinho
  let legendP: 0 | 1 | null = null;
  const order: (0 | 1)[] = randomInt(0, 2) ? [0, 1] : [1, 0];
  for (const i of order) {
    const u = i === 0 ? a : b;
    if (!u.legendNext) continue;
    const claim = await prisma.user.updateMany({ where: { id: u.id, legendNext: true }, data: { legendNext: false } });
    if (claim.count === 1) {
      legendP = i;
      break;
    }
  }
  let replay: Replay;
  try {
    replay = legendP === null ? simulateBattle(opts) : simulateBattleWithLegend(opts, legendP);
  } catch (e) {
    if (legendP !== null) await prisma.user.update({ where: { id: (legendP === 0 ? a : b).id }, data: { legendNext: true } });
    throw e;
  }
  const battle = await prisma.battle.create({
    data: {
      mode, seed, map,
      aId: a.id, bId: b.id, aName: a.username, bName: b.username,
      winner: replay.winner, duration: replay.duration,
      replay: gzipSync(JSON.stringify(replay), { level: 6 }),
    },
  });
  return { battle, replay };
}
