import type { Prisma, Season, User } from '@prisma/client';
import { BALANCE, applyXp, dayKey, declineStakes, powerRating, seasonReward, softResetPr, type RankContext } from '@gymbattle/shared';
import { prisma } from '../db.js';
import { notify } from './notify.js';
import { lockUsers } from './rewards.js';

type Tx = Prisma.TransactionClient;

/** Início do dia de hoje no fuso de Brasília (UTC−3, sem horário de verão). */
export function startOfTodayBR(): Date {
  const [y, m, d] = dayKey().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
}

/** Posição no ranking (1 = primeiro). Empate de PR: quem entrou antes fica na frente. */
/** Posição no ranking DO GRUPO (0 = sem grupo). */
export async function rankPosition(u: Pick<User, 'rankPoints' | 'createdAt' | 'groupId'>, db: Tx | typeof prisma = prisma) {
  if (!u.groupId) return 0;
  const above = await db.user.count({
    where: { groupId: u.groupId, OR: [{ rankPoints: { gt: u.rankPoints } }, { rankPoints: u.rankPoints, createdAt: { lt: u.createdAt } }] },
  });
  return above + 1;
}

export async function fightRewardsToday(userId: string, db: Tx | typeof prisma = prisma) {
  return db.rewardLedger.count({ where: { userId, source: 'FIGHT', createdAt: { gte: startOfTodayBR() } } });
}

/** Recompensa de luta (limite diário). Retorna o que foi dado. */
export async function grantFightReward(tx: Tx, user: User, won: boolean, battleId: string) {
  const used = await fightRewardsToday(user.id, tx);
  if (used >= BALANCE.fights.rewardedPerDay) return { xp: 0, gold: 0 };
  const xp = won ? BALANCE.fights.winXp : BALANCE.fights.lossXp;
  const gold = won ? BALANCE.fights.winGold : BALANCE.fights.lossGold;
  const fresh = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
  const lvl = applyXp({ level: fresh.level, xp: fresh.xp, attrPoints: fresh.attrPoints }, xp);
  await tx.user.update({
    where: { id: user.id },
    data: { level: lvl.level, xp: lvl.xp, attrPoints: lvl.attrPoints, gold: { increment: gold } },
  });
  await tx.rewardLedger.create({ data: { userId: user.id, source: 'FIGHT', refId: battleId, xp, gold } });
  return { xp, gold };
}


// ------------------------------------------------------------------ desafios

const R = BALANCE.ranking;

/** Data até quando o jogador está protegido contra desafios (ou null). */
export function protectedIso(u: { protectedUntil: Date | null }) {
  return u.protectedUntil && u.protectedUntil > new Date() ? u.protectedUntil.toISOString() : null;
}

export const protectionEnd = () => new Date(Date.now() + R.protectionHours * 3_600_000);

/** Desafios enviados hoje (Brasília). */
export async function challengesSentToday(userId: string) {
  return prisma.challenge.count({ where: { challengerId: userId, createdAt: { gte: startOfTodayBR() } } });
}

/** Poder de combate atual de uma conta (nível, atributos e arma equipada). */
export function powerOf(u: User): number {
  const eq = (u.equipment as { weapon?: string | null } | null) ?? {};
  return powerRating({ str: u.str, dex: u.dex, vig: u.vig, fort: u.fort, ess: u.ess, int: u.int, fai: u.fai }, eq.weapon ?? u.starterWeapon);
}

/** Contexto de PR com os valores ATUAIS dos dois jogadores. */
export function rankCtx(challenger: User, defender: User): RankContext {
  return { challengerPr: challenger.rankPoints, defenderPr: defender.rankPoints, challengerPower: powerOf(challenger), defenderPower: powerOf(defender) };
}

/**
 * Recusa (ou expiração): o desafiado perde metade do que perderia se lutasse e
 * perdesse (3 a 15 PR); o desafiante ganha metade disso. Recusar NÃO dá
 * proteção. Retorna o PR perdido ou null se o desafio já tinha sido resolvido.
 */
export async function forfeitChallenge(challengeId: string, status: 'DECLINED' | 'EXPIRED') {
  const res = await prisma.$transaction(async (tx) => {
    const c = await tx.challenge.findUnique({ where: { id: challengeId } });
    if (!c) return null;
    const users = await lockUsers(tx, [c.challengerId, c.defenderId]);
    const claim = await tx.challenge.updateMany({ where: { id: c.id, status: 'PENDING' }, data: { status, resolvedAt: new Date() } });
    if (claim.count === 0) return null;
    const challenger = users.get(c.challengerId)!;
    const defender = users.get(c.defenderId)!;
    const st = declineStakes(rankCtx(challenger, defender));
    const amount = Math.max(0, Math.min(-st.defender, defender.rankPoints));
    const gain = amount > 0 ? Math.min(st.challenger, amount) : 0;
    if (amount) await tx.user.update({ where: { id: c.defenderId }, data: { rankPoints: { decrement: amount } } });
    if (gain) await tx.user.update({ where: { id: c.challengerId }, data: { rankPoints: { increment: gain } } });
    await tx.challenge.update({ where: { id: c.id }, data: { prTransfer: amount, prGain: gain } });
    return { c, amount, gain };
  });
  if (!res) return null;
  const { c, amount, gain } = res;
  if (status === 'DECLINED') {
    void notify({ userId: c.challengerId, actorId: c.defenderId, type: 'CHALLENGE_DECLINED', text: gain ? `recusou seu desafio. Você ganhou +${gain} PR.` : 'recusou seu desafio.' });
  } else {
    void notify({ userId: c.challengerId, actorId: c.defenderId, type: 'CHALLENGE_EXPIRED', text: gain ? `não respondeu ao seu desafio a tempo. Você ganhou +${gain} PR.` : 'não respondeu ao seu desafio a tempo.' });
    void notify({ userId: c.defenderId, actorId: c.challengerId, type: 'CHALLENGE_EXPIRED', text: amount ? `Você não respondeu ao desafio a tempo e perdeu ${amount} PR.` : 'Você não respondeu ao desafio a tempo.' });
  }
  return amount;
}

/** Resolve desafios vencidos (sem resposta em 24 h) e avisa quem está perto de perder o prazo. */
export async function expireChallenges() {
  const now = Date.now();
  const due = await prisma.challenge.findMany({ where: { status: 'PENDING', expiresAt: { lt: new Date(now) } }, select: { id: true }, take: 200 });
  for (const d of due) await forfeitChallenge(d.id, 'EXPIRED').catch((e) => console.error('Erro ao expirar desafio', e));
  const soon = await prisma.challenge.findMany({
    where: { status: 'PENDING', warnedAt: null, expiresAt: { gte: new Date(now), lt: new Date(now + R.expiryWarnHours * 3_600_000) } },
    include: { challenger: true, defender: true },
    take: 200,
  });
  for (const c of soon) {
    const claim = await prisma.challenge.updateMany({ where: { id: c.id, warnedAt: null }, data: { warnedAt: new Date() } });
    if (claim.count === 0) continue;
    const loss = -declineStakes(rankCtx(c.challenger, c.defender)).defender;
    const h = Math.max(1, Math.round((c.expiresAt.getTime() - now) / 3_600_000));
    void notify({ userId: c.defenderId, actorId: c.challengerId, type: 'CHALLENGE', challengeId: c.id, text: `te desafiou e o prazo acaba em ${h} h. Responda ou perde ${loss} PR.` });
  }
}

// ------------------------------------------------------------------ temporadas

/** Fim do mês atual (Brasília): 1º dia do mês seguinte às 00:00 BRT = 03:00 UTC. */
function endOfMonthBR(from = new Date()): Date {
  const [y, m] = dayKey(from).split('-').map(Number);
  return new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1, 3, 0, 0));
}

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** Fim da temporada: fim do mês, ou do mês seguinte se faltar pouco. */
function seasonEnd(start: Date): Date {
  const end = endOfMonthBR(start);
  if (end.getTime() - start.getTime() < BALANCE.ranking.minSeasonDays * 86_400_000) return endOfMonthBR(new Date(end.getTime() + 86_400_000));
  return end;
}

/** Nome pelo mês em que a temporada termina. */
function seasonName(number: number, end: Date) {
  const [y, m] = dayKey(new Date(end.getTime() - 86_400_000)).split('-').map(Number);
  return `Temporada ${number} · ${MONTHS[m - 1]} ${y}`;
}

/** Temporada ativa (cria a primeira se não existir). */
export async function currentSeason(): Promise<Season> {
  const active = await prisma.season.findFirst({ where: { status: 'ACTIVE' }, orderBy: { number: 'desc' } });
  if (active) return active;
  const last = await prisma.season.findFirst({ orderBy: { number: 'desc' } });
  const number = (last?.number ?? 0) + 1;
  const startsAt = new Date();
  const endsAt = seasonEnd(startsAt);
  return prisma.season.create({ data: { number, name: seasonName(number, endsAt), startsAt, endsAt } });
}

/**
 * Encerra a temporada: prêmios do top 10, título exclusivo do 1º lugar,
 * reset do PR de todos e abertura da próxima temporada.
 */
export async function finalizeSeason(seasonId: string) {
  return prisma.$transaction(
    async (tx) => {
      const season = await tx.season.findUniqueOrThrow({ where: { id: seasonId } });
      if (season.status !== 'ACTIVE') return season;
      // cada grupo tem seu pódio; só grupos com o torneio liberado (5+ pessoas) ganham prêmios,
      // e no máximo metade do grupo é premiada (evita grupinho só para farmar prêmio)
      const results: { pos: number; userId: string; username: string; pr: number; gold: number; xp: number; title: string | null; groupId: string; groupName: string }[] = [];
      const groups = await tx.group.findMany({ select: { id: true, name: true, _count: { select: { members: true } } } });
      for (const g of groups) {
        const n = g._count.members;
        if (n < BALANCE.groups.minForTournament) continue;
        const prized = Math.min(10, Math.ceil(n / 2));
        const top = await tx.user.findMany({ where: { groupId: g.id }, orderBy: [{ rankPoints: 'desc' }, { createdAt: 'asc' }], take: prized });
        for (let i = 0; i < top.length; i++) {
          const u = top[i];
          const pos = i + 1;
          const r = seasonReward(pos);
          if (!r) continue;
          const lvl = applyXp({ level: u.level, xp: u.xp, attrPoints: u.attrPoints }, r.xp);
          const title = r.exclusiveTitle ? `Campeão da Temporada ${season.number}` : null;
          await tx.user.update({
            where: { id: u.id },
            data: { level: lvl.level, xp: lvl.xp, attrPoints: lvl.attrPoints, gold: { increment: r.gold }, ...(title ? { title } : {}) },
          });
          await tx.rewardLedger.create({ data: { userId: u.id, source: 'SEASON', refId: season.id, xp: r.xp, gold: r.gold } });
          results.push({ pos, userId: u.id, username: u.username, pr: u.rankPoints, gold: r.gold, xp: r.xp, title, groupId: g.id, groupName: g.name });
        }
      }
      // reset do PR de todo mundo (BALANCE.ranking.seasonSoftResetFactor = 0 → todos voltam para 1000)
      const all = await tx.user.findMany({ select: { id: true, rankPoints: true } });
      for (const u of all) {
        const next = softResetPr(u.rankPoints);
        if (next !== u.rankPoints) await tx.user.update({ where: { id: u.id }, data: { rankPoints: next } });
      }
      await tx.challenge.updateMany({ where: { status: 'PENDING' }, data: { status: 'EXPIRED', resolvedAt: new Date() } });
      await tx.user.updateMany({ where: { protectedUntil: { not: null } }, data: { protectedUntil: null } });
      const ended = await tx.season.update({
        where: { id: season.id },
        data: { status: 'ENDED', endsAt: new Date(Math.min(Date.now(), season.endsAt.getTime())), results: results as unknown as Prisma.InputJsonValue },
      });
      const number = season.number + 1;
      const startsAt = new Date();
      const endsAt = seasonEnd(startsAt);
      await tx.season.create({ data: { number, name: seasonName(number, endsAt), startsAt, endsAt } });
      return ended;
    },
    { timeout: 60_000 },
  ).then(async (ended) => {
    const results = (ended.results as { pos: number; userId: string; gold: number; xp: number; title: string | null }[] | null) ?? [];
    for (const r of results) {
      void notify({
        userId: r.userId, type: 'SEASON',
        text: `${ended.name} terminou: você ficou em ${r.pos}º no seu grupo e ganhou ${r.gold} de ouro e ${r.xp} XP${r.title ? ` + o título “${r.title}”` : ''}!`,
      });
    }
    return ended;
  });
}

/** Job periódico: expira desafios e fecha a temporada vencida. */
export async function rankingHousekeeping() {
  await expireChallenges();
  const s = await currentSeason();
  if (s.endsAt <= new Date()) await finalizeSeason(s.id);
}
