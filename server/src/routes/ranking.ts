import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import type { Prisma, User } from '@prisma/client';
import { BALANCE, challengerChance, declineStakes, prDelta } from '@gymbattle/shared';
import { prisma } from '../db.js';
import { requireAuth } from '../lib/auth.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/http.js';
import { runBattle } from '../lib/battles.js';
import { lockUsers } from '../lib/rewards.js';
import {
  challengesSentToday, currentSeason, expireChallenges, fightRewardsToday, finalizeSeason, forfeitChallenge, grantFightReward,
  protectedIso, protectionEnd, rankCtx, rankPosition, startOfTodayBR,
} from '../lib/ranking.js';
import { toMe, toPublicUser } from '../lib/serialize.js';
import { toGroupDTO } from '../lib/groups.js';
import { battleSummary } from './battles.js';
import { notify } from '../lib/notify.js';
import { isShieldsEnabled } from '../lib/settings.js';

export const rankingRouter = Router();
rankingRouter.use(requireAuth);

rankingRouter.get('/', async (req, res) => {
  // se o servidor ficou parado na virada, fecha a temporada vencida agora
  const s0 = await currentSeason();
  if (s0.endsAt <= new Date()) await finalizeSeason(s0.id);
  const { page } = z.object({ page: z.coerce.number().int().min(1).max(200).default(1) }).parse(req.query);
  const pageSize = 50;
  // o ranking é só do MEU grupo
  const groupId = req.user!.groupId;
  const [season, users, total, myPos, used, group] = await Promise.all([
    currentSeason(),
    groupId
      ? prisma.user.findMany({ where: { groupId }, orderBy: [{ rankPoints: 'desc' }, { createdAt: 'asc' }], skip: (page - 1) * pageSize, take: pageSize })
      : Promise.resolve([]),
    groupId ? prisma.user.count({ where: { groupId } }) : Promise.resolve(0),
    rankPosition(req.user!),
    fightRewardsToday(req.user!.id),
    groupId ? prisma.group.findUnique({ where: { id: groupId } }) : Promise.resolve(null),
  ]);
  res.json({
    group: group ? toGroupDTO(group, total) : null,
    /** quantas posições do grupo ganham prêmio no fim da temporada */
    prizedPositions: total >= BALANCE.groups.minForTournament ? Math.min(10, Math.ceil(total / 2)) : 0,
    season: { id: season.id, number: season.number, name: season.name, endsAt: season.endsAt.toISOString() },
    prizes: BALANCE.ranking.seasonRewards,
    page,
    total,
    leaderboard: users.map((u, i) => ({
      pos: (page - 1) * pageSize + i + 1, user: toPublicUser(u), rankPoints: u.rankPoints, protectedUntil: protectedIso(u),
    })),
    me: { pos: myPos, rankPoints: req.user!.rankPoints, protectedUntil: protectedIso(req.user!) },
    fightRewardsLeft: Math.max(0, BALANCE.fights.rewardedPerDay - used),
  });
});

rankingRouter.get('/seasons', async (req, res) => {
  const seasons = await prisma.season.findMany({ where: { status: 'ENDED' }, orderBy: { number: 'desc' }, take: 12 });
  const g = req.user!.groupId;
  // resultados do meu grupo (temporadas antigas, de antes dos grupos, não têm grupo e aparecem para todos)
  const mine = (r: unknown) => {
    const list = (r as { groupId?: string }[] | null) ?? [];
    return list.filter((x) => !x.groupId || x.groupId === g);
  };
  res.json({ seasons: seasons.map((s) => ({ id: s.id, number: s.number, name: s.name, endsAt: s.endsAt.toISOString(), results: mine(s.results) })) });
});

/** Os dois estão no mesmo grupo, e o grupo já liberou o torneio? */
async function assertSameGroup(a: Pick<User, 'groupId'>, b: Pick<User, 'groupId' | 'username'>) {
  if (!a.groupId) throw badRequest('Entre em um grupo para disputar o ranking.', 'NO_GROUP');
  if (a.groupId !== b.groupId) throw badRequest(`${b.username} não está no seu grupo.`, 'OTHER_GROUP');
  const n = await prisma.user.count({ where: { groupId: a.groupId } });
  const min = BALANCE.groups.minForTournament;
  if (n < min) {
    throw badRequest(`O torneio só começa quando o grupo tiver ${min} pessoas (faltam ${min - n}). Convide mais gente!`, 'TOURNAMENT_LOCKED');
  }
}

// ------------------------------------------------------------------ desafios
//
// Regras:
// - Cada jogador envia no máximo 5 desafios por dia.
// - O desafiado tem 24 h para aceitar. Recusar ou deixar expirar custa um pouco
//   de PR, que vai para o desafiante.
// - Quem PERDE PR (perdendo a luta, recusando ou deixando expirar) fica 36 h
//   protegido: ninguém pode desafiá-lo. Enviar um desafio cancela a proteção.

const R = BALANCE.ranking;

/** O que está em jogo agora (poder e PR atuais dos dois). */
function stakesOf(challenger: User, defender: User) {
  const ctx = rankCtx(challenger, defender);
  const d = declineStakes(ctx);
  return {
    challengerWins: prDelta(ctx, 'challenger'),
    defenderWins: prDelta(ctx, 'defender'),
    /** PR que o desafiado perde se recusar/deixar expirar, e o que o desafiante ganha. */
    decline: -d.defender,
    declineGain: d.challenger,
    /** Chance (%) de o desafiante vencer. */
    challengerChance: Math.round(challengerChance(ctx) * 100),
  };
}

function challengeDTO(c: Prisma.ChallengeGetPayload<{ include: { challenger: true; defender: true } }>) {
  return {
    id: c.id, status: c.status,
    challenger: toPublicUser(c.challenger), defender: toPublicUser(c.defender),
    challengerPos: c.challengerPos, defenderPos: c.defenderPos, challengerPr: c.challengerPr, defenderPr: c.defenderPr,
    battleId: c.battleId, prTransfer: c.prTransfer, createdAt: c.createdAt.toISOString(), expiresAt: c.expiresAt.toISOString(),
    // o que está em jogo
    stakes: stakesOf(c.challenger, c.defender),
  };
}

rankingRouter.get('/challenges', async (req, res) => {
  await expireChallenges();
  const me = req.user!.id;
  const include = { challenger: true, defender: true } as const;
  const [received, sent, history, sentToday] = await Promise.all([
    prisma.challenge.findMany({ where: { defenderId: me, status: 'PENDING' }, include, orderBy: { createdAt: 'desc' } }),
    prisma.challenge.findMany({ where: { challengerId: me, status: 'PENDING' }, include, orderBy: { createdAt: 'desc' } }),
    prisma.challenge.findMany({
      where: { OR: [{ challengerId: me }, { defenderId: me }], status: { not: 'PENDING' } },
      include, orderBy: { createdAt: 'desc' }, take: 20,
    }),
    challengesSentToday(me),
  ]);
  res.json({
    received: received.map(challengeDTO), sent: sent.map(challengeDTO), history: history.map(challengeDTO),
    limits: { sentToday, maxPerDay: R.maxChallengesPerDay, protectedUntil: protectedIso(req.user!) },
  });
});

/** Um desafio (só para quem desafiou ou foi desafiado). */
rankingRouter.get('/challenges/:id', async (req, res) => {
  await expireChallenges();
  const c = await prisma.challenge.findUnique({ where: { id: String(req.params.id) }, include: { challenger: true, defender: true } });
  if (!c || (c.challengerId !== req.user!.id && c.defenderId !== req.user!.id)) throw notFound('Desafio não encontrado.');
  res.json({ challenge: challengeDTO(c) });
});

/** Prévia do que está em jogo antes de desafiar. */
rankingRouter.get('/preview/:userId', async (req, res) => {
  const opp = await prisma.user.findUnique({ where: { id: String(req.params.userId) } });
  if (!opp || opp.groupId !== req.user!.groupId || !opp.groupId) throw notFound('Jogador não encontrado no seu grupo.');
  const st = stakesOf(req.user!, opp);
  const since = startOfTodayBR();
  const recent = await prisma.challenge.findFirst({ where: { challengerId: req.user!.id, defenderId: opp.id, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
  const pending = await prisma.challenge.findFirst({
    where: { status: 'PENDING', OR: [{ challengerId: req.user!.id, defenderId: opp.id }, { challengerId: opp.id, defenderId: req.user!.id }] },
    select: { id: true },
  });
  res.json({
    challengerPos: await rankPosition(req.user!), defenderPos: await rankPosition(opp),
    challengerPr: req.user!.rankPoints, defenderPr: opp.rankPoints,
    winChance: st.challengerChance,
    ifYouWin: st.challengerWins.challenger,
    ifYouLose: st.defenderWins.challenger,
    ifTheyDecline: opp.rankPoints > 0 ? st.declineGain : 0,
    theyLoseOnDecline: Math.min(st.decline, opp.rankPoints),
    // já desafiou essa pessoa hoje: libera de novo à meia-noite (Brasília)
    againAt: recent ? new Date(since.getTime() + 24 * 3_600_000).toISOString() : null,
    sentToday: await challengesSentToday(req.user!.id),
    maxPerDay: R.maxChallengesPerDay,
    opponentProtectedUntil: protectedIso(opp),
    myProtectedUntil: protectedIso(req.user!),
    pending: !!pending,
  });
});

const challengeLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 30,
  keyGenerator: (req) => req.user!.id,
  message: { error: 'Muitos desafios nesta hora. Tente mais tarde.', code: 'RATE_LIMIT' },
});

rankingRouter.post('/challenges', challengeLimiter, async (req, res) => {
  await expireChallenges();
  const { defenderId } = z.object({ defenderId: z.string().max(40) }).parse(req.body);
  const me = req.user!;
  if (defenderId === me.id) throw badRequest('Você não pode desafiar a si mesmo.');
  const shieldsOn = await isShieldsEnabled();
  const c = await prisma.$transaction(async (tx) => {
    // trava os dois: evita passar do limite com cliques simultâneos
    const users = await lockUsers(tx, [me.id, defenderId]);
    const self = users.get(me.id)!;
    const opp = users.get(defenderId);
    if (!opp) throw notFound('Jogador não encontrado.');
    await assertSameGroup(self, opp);
    if (shieldsOn && opp.protectedUntil && opp.protectedUntil > new Date()) {
      const h = Math.ceil((opp.protectedUntil.getTime() - Date.now()) / 3_600_000);
      throw badRequest(`${opp.username} está protegido contra desafios por mais ${h} h.`, 'PROTECTED');
    }
    const pending = await tx.challenge.findFirst({
      where: { status: 'PENDING', OR: [{ challengerId: me.id, defenderId }, { challengerId: defenderId, defenderId: me.id }] },
    });
    if (pending) throw conflict('Já existe um desafio pendente entre vocês.', 'PENDING');
    const recent = await tx.challenge.findFirst({
      where: { challengerId: me.id, defenderId, createdAt: { gte: startOfTodayBR() } },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      throw badRequest(`Você já desafiou ${opp.username} hoje. Poderá desafiar de novo depois da meia-noite.`, 'SAME_TARGET');
    }
    const sent = await tx.challenge.count({ where: { challengerId: me.id, createdAt: { gte: startOfTodayBR() } } });
    if (sent >= R.maxChallengesPerDay) {
      throw badRequest(`Você já enviou ${R.maxChallengesPerDay} desafios hoje. Volte amanhã!`, 'DAILY_LIMIT');
    }
    // desafiar cancela a própria proteção
    if (self.protectedUntil) await tx.user.update({ where: { id: me.id }, data: { protectedUntil: null } });
    return tx.challenge.create({
      data: {
        challengerId: me.id, defenderId,
        challengerPos: await rankPosition(self, tx), defenderPos: await rankPosition(opp, tx),
        challengerPr: self.rankPoints, defenderPr: opp.rankPoints,
        expiresAt: new Date(Date.now() + R.challengeExpiresHours * 3_600_000),
      },
      include: { challenger: true, defender: true },
    });
  });
  void notify({ userId: defenderId, actorId: me.id, type: 'CHALLENGE', challengeId: c.id });
  res.status(201).json({ challenge: challengeDTO(c) });
});

async function pendingFor(id: string) {
  await expireChallenges();
  const c = await prisma.challenge.findUnique({ where: { id }, include: { challenger: true, defender: true } });
  if (!c) throw notFound('Desafio não encontrado.');
  if (c.status !== 'PENDING') throw conflict(c.status === 'EXPIRED' ? 'Esse desafio expirou.' : 'Esse desafio já foi resolvido.', c.status);
  return c;
}

/** Recusar: perde metade do que perderia lutando (3 a 15 PR); o desafiante ganha metade disso. Não dá proteção. */
rankingRouter.post('/challenges/:id/decline', async (req, res) => {
  const c = await pendingFor(String(req.params.id));
  if (c.defenderId !== req.user!.id) throw forbidden();
  const amount = await forfeitChallenge(c.id, 'DECLINED');
  if (amount === null) throw conflict('Esse desafio já foi resolvido.');
  const me = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  res.json({ ok: true, prLost: amount, user: toMe(me) });
});

rankingRouter.post('/challenges/:id/cancel', async (req, res) => {
  const c = await pendingFor(String(req.params.id));
  if (c.challengerId !== req.user!.id) throw forbidden();
  await prisma.challenge.updateMany({ where: { id: c.id, status: 'PENDING' }, data: { status: 'CANCELLED', resolvedAt: new Date() } });
  res.json({ ok: true });
});

/** Aceitar: a luta ranqueada é simulada na hora; PR e recompensas são aplicados. */
rankingRouter.post('/challenges/:id/accept', async (req, res) => {
  const c = await pendingFor(String(req.params.id));
  if (c.defenderId !== req.user!.id) throw forbidden();
  await assertSameGroup(c.defender, c.challenger);
  // trava o desafio (evita aceitar duas vezes)
  const claim = await prisma.challenge.updateMany({ where: { id: c.id, status: 'PENDING' }, data: { status: 'ACCEPTED', resolvedAt: new Date() } });
  if (claim.count === 0) throw conflict('Esse desafio já foi resolvido.');

  let fought: Awaited<ReturnType<typeof runBattle>>;
  try {
    const [challenger, defender] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: c.challengerId } }),
      prisma.user.findUniqueOrThrow({ where: { id: c.defenderId } }),
    ]);
    fought = await runBattle(challenger, defender, 'ranked');
  } catch (e) {
    // devolve o desafio se a luta não pôde ser criada
    await prisma.challenge.updateMany({ where: { id: c.id, status: 'ACCEPTED', battleId: null }, data: { status: 'PENDING', resolvedAt: null } });
    throw e;
  }
  const { battle, replay } = fought;
  const outcome = replay.winner === null ? 'draw' : replay.winner === 0 ? 'challenger' : 'defender';

  const shieldsOn = await isShieldsEnabled();
  const result = await prisma.$transaction(async (tx) => {
    const users = await lockUsers(tx, [c.challengerId, c.defenderId]);
    const a = users.get(c.challengerId)!;
    const b = users.get(c.defenderId)!;
    // pontos pela chance que cada um tinha AGORA (poder de combate + PR)
    const delta = prDelta(rankCtx(a, b), outcome);
    const prA = Math.max(0, a.rankPoints + delta.challenger) - a.rankPoints;
    const prB = Math.max(0, b.rankPoints + delta.defender) - b.rankPoints;
    // só quem PERDEU pontos ganha a proteção de 36 h
    // escudo de 36 h para quem perdeu PR — só se o admin deixou os escudos ligados
    const shield = shieldsOn ? protectionEnd() : null;
    await tx.user.update({ where: { id: a.id }, data: { rankPoints: { increment: prA }, ...(prA < 0 && shield ? { protectedUntil: shield } : {}) } });
    await tx.user.update({ where: { id: b.id }, data: { rankPoints: { increment: prB }, ...(prB < 0 && shield ? { protectedUntil: shield } : {}) } });
    const rA = await grantFightReward(tx, a, outcome === 'challenger', battle.id);
    const rB = await grantFightReward(tx, b, outcome === 'defender', battle.id);
    const r = { pr: [prA, prB], rewards: [{ p: 0, ...rA }, { p: 1, ...rB }] };
    await tx.battle.update({ where: { id: battle.id }, data: { result: r as unknown as Prisma.InputJsonValue } });
    await tx.challenge.update({ where: { id: c.id }, data: { battleId: battle.id } });
    return r;
  });
  // sem spoiler: a notificação não diz quem venceu
  void notify({ userId: c.challengerId, actorId: c.defenderId, type: 'CHALLENGE_ACCEPTED', battleId: battle.id });
  const me = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  res.json({ battle: { ...battleSummary({ ...battle, result: result as unknown as Prisma.JsonValue }) }, user: toMe(me) });
});
