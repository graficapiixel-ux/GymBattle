// Só para testes locais: cria uma luta com evento lendário forçado entre dois usuários.
// uso: node --env-file=.env --import tsx tools/dev/legend-battle.ts <userA> <userB> <p 0|1> <variant 0|1> [mapa] [tick]
import { gzipSync } from 'node:zlib';
import { PrismaClient } from '@prisma/client';
import { simulateBattle } from '../../shared/src/index.ts';
import { fighterSnapshot } from '../../server/src/lib/battles.ts';
const prisma = new PrismaClient();
const [an, bn, p, v, map = 'academia', at = '240'] = process.argv.slice(2);
const a = await prisma.user.findUniqueOrThrow({ where: { username: an } });
const b = await prisma.user.findUniqueOrThrow({ where: { username: bn } });
const seed = 777;
const replay = simulateBattle({ seed, mapId: map, fighters: [fighterSnapshot(a), fighterSnapshot(b)], legend: { at: Number(at), p: Number(p) as 0 | 1, variant: Number(v) as 0 | 1 } });
const battle = await prisma.battle.create({
  data: { mode: 'ranked', seed, map, aId: a.id, bId: b.id, aName: a.username, bName: b.username, winner: replay.winner, duration: replay.duration, replay: gzipSync(JSON.stringify(replay)) },
});
const ev = replay.events.find((e) => e.type === 'legend');
console.log(JSON.stringify({ id: battle.id, legend: ev, duration: replay.duration, winner: replay.winner }));
await prisma.$disconnect();
