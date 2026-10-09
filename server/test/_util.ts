/** CPF válido aleatório (para os testes). */
export function cpf(): string {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (n.every((d) => d === n[0])) n[0] = (n[0] + 1) % 10;
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += n[i] * (len + 1 - i);
    n.push(((sum * 10) % 11) % 10);
  }
  return n.join('');
}

import { prisma } from '../src/db.js';

/**
 * Põe os jogadores num grupo novo (o 1º vira o dono) e completa com "figurantes"
 * até o mínimo do torneio (5), para os desafios funcionarem.
 */
export async function groupUp(ids: string[], opts: { fill?: boolean; name?: string } = {}) {
  const g = await prisma.group.create({ data: { name: opts.name ?? `Teste ${Math.random().toString(36).slice(2, 7)}` } });
  const now = new Date();
  for (let i = 0; i < ids.length; i++) {
    await prisma.user.update({ where: { id: ids[i] }, data: { groupId: g.id, groupRole: i === 0 ? 'OWNER' : 'MEMBER', groupJoinedAt: now } });
  }
  const fillers: string[] = [];
  if (opts.fill !== false) {
    for (let i = ids.length; i < 5; i++) {
      const t = Math.random().toString(36).slice(2, 9);
      const u = await prisma.user.create({
        data: { email: `fill_${t}@test.dev`, username: `fill_${t}`, passwordHash: 'x', groupId: g.id, groupJoinedAt: now, rankPoints: 0 },
      });
      fillers.push(u.id);
    }
  }
  return { groupId: g.id, fillers };
}
