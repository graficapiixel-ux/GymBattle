import type { Prisma, User } from '@prisma/client';
import { applyXp, dayKey, nextStreak, postReward } from '@gymbattle/shared';

type Tx = Prisma.TransactionClient;

/** Trava a linha do usuário até o fim da transação (evita recompensa dupla). */
export async function lockUser(tx: Tx, userId: string): Promise<User> {
  await tx.$queryRaw`SELECT id FROM \`User\` WHERE id = ${userId} FOR UPDATE`;
  return tx.user.findUniqueOrThrow({ where: { id: userId } });
}

/** Trava vários usuários em ordem fixa (evita deadlock) antes de qualquer leitura. */
export async function lockUsers(tx: Tx, ids: string[]): Promise<Map<string, User>> {
  const sorted = [...new Set(ids)].sort();
  for (const id of sorted) await tx.$queryRaw`SELECT id FROM \`User\` WHERE id = ${id} FOR UPDATE`;
  const rows = await tx.user.findMany({ where: { id: { in: sorted } } });
  return new Map(rows.map((u) => [u.id, u]));
}

export interface PostRewardResult {
  xp: number;
  gold: number;
  bonus: number;
  streak: number;
  levelsGained: number;
}

/**
 * Dá a recompensa do post, se for o primeiro post recompensado do dia (Brasília).
 * Retorna null se o jogador já recebeu a recompensa hoje.
 */
export async function grantPostReward(tx: Tx, userId: string, postId: string): Promise<PostRewardResult | null> {
  const user = await lockUser(tx, userId);
  const today = dayKey();
  if (user.lastPostDay === today) return null;

  const s = nextStreak(
    { streak: user.streak, lastPostDay: user.lastPostDay, restWeeks: (user.restWeeks as string[] | null) ?? [] },
    today,
  );
  const reward = postReward(s.streak);
  const lvl = applyXp({ level: user.level, xp: user.xp, attrPoints: user.attrPoints }, reward.xp);

  await tx.user.update({
    where: { id: userId },
    data: {
      streak: s.streak,
      lastPostDay: s.lastPostDay,
      restWeeks: s.restWeeks,
      level: lvl.level,
      xp: lvl.xp,
      attrPoints: lvl.attrPoints,
      gold: { increment: reward.gold },
    },
  });
  await tx.post.update({ where: { id: postId }, data: { rewarded: true, xpAwarded: reward.xp, goldAwarded: reward.gold } });
  await tx.rewardLedger.create({
    data: {
      userId, source: 'POST', refId: postId, xp: reward.xp, gold: reward.gold,
      // estado anterior da streak, para desfazer se o post do dia for apagado
      meta: { prevStreak: user.streak, prevLastPostDay: user.lastPostDay, prevRestWeeks: (user.restWeeks as string[] | null) ?? [] },
    },
  });
  return { xp: reward.xp, gold: reward.gold, bonus: reward.bonus, streak: s.streak, levelsGained: lvl.levelsGained };
}

/**
 * Remove o XP e o ouro que um post gerou (o saldo pode ficar negativo; o nível não cai).
 * Com resetStreak (foto fake), a streak também é zerada.
 */
export async function reversePostReward(tx: Tx, userId: string, postId: string, opts: { resetStreak: boolean }) {
  const user = await lockUser(tx, userId);
  const entries = await tx.rewardLedger.findMany({ where: { userId, refId: postId } });
  const xp = entries.reduce((s, e) => s + e.xp, 0);
  const gold = entries.reduce((s, e) => s + e.gold, 0);

  const data: Prisma.UserUpdateInput = {};
  if (xp !== 0 || gold !== 0) {
    const lvl = applyXp({ level: user.level, xp: user.xp, attrPoints: user.attrPoints }, -xp);
    data.xp = lvl.xp;
    data.gold = { decrement: gold };
    await tx.rewardLedger.create({ data: { userId, source: 'POST_REVERSAL', refId: postId, xp: -xp, gold: -gold } });
  }
  if (opts.resetStreak) {
    data.streak = 0;
    data.restWeeks = [];
  } else {
    // apagou o post que contou para o dia de hoje → a streak volta ao que era
    const today = dayKey();
    const grant = entries.find((e) => e.source === 'POST' && e.meta && dayKey(e.createdAt) === today);
    const prev = grant?.meta as { prevStreak: number; prevLastPostDay: string | null; prevRestWeeks: string[] } | undefined;
    if (prev && user.lastPostDay === today) {
      data.streak = prev.prevStreak;
      data.lastPostDay = prev.prevLastPostDay;
      data.restWeeks = prev.prevRestWeeks;
    }
  }
  if (Object.keys(data).length) await tx.user.update({ where: { id: userId }, data });
  return { xp, gold };
}
