/**
 * Eventos de boss: estado, tentativas, salas (times), luta e avisos.
 * A chance de vitória e o catálogo ficam só aqui no servidor.
 */
import { randomInt } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import type { BossEvent, BossRun, BossRunMember, Prisma, User } from '@prisma/client';
import type { BossEventAdmin, BossEventPublic, BossRunDTO } from '@gymbattle/shared';
import { prisma } from '../db.js';
import { BOSSES_BY_ID } from '../bosses/catalog.js';
import { simulateBossFight } from '../bosses/sim.js';
import { fighterSnapshot } from './battles.js';
import { grantGift } from './gifts.js';
import { badRequest, conflict, forbidden, notFound } from './http.js';
import { notify } from './notify.js';

export const MAX_TEAM = 10;
const MYSTERY = '??? Um tesouro esquecido aguarda quem vencer...';

export function statusOf(e: Pick<BossEvent, 'startsAt' | 'endsAt' | 'endedAt'>, now = new Date()): BossEventAdmin['status'] {
  if (e.endedAt || e.endsAt <= now) return 'ENDED';
  if (e.startsAt > now) return 'SCHEDULED';
  return 'ACTIVE';
}

export function activeWhere(now = new Date()): Prisma.BossEventWhereInput {
  return { startsAt: { lte: now }, endsAt: { gt: now }, endedAt: null };
}

export function activeEvents() {
  return prisma.bossEvent.findMany({ where: activeWhere(), orderBy: { endsAt: 'asc' } });
}

/** Tentativas usadas = lutas já feitas (como membro de qualquer time) neste evento. */
export async function attemptsUsed(eventId: string, userIds: string[]) {
  const rows = await prisma.bossRunMember.findMany({
    where: { userId: { in: userIds }, run: { eventId, status: 'FOUGHT' } },
    select: { userId: true },
  });
  const m = new Map<string, number>(userIds.map((id) => [id, 0]));
  for (const r of rows) m.set(r.userId, (m.get(r.userId) ?? 0) + 1);
  return m;
}

type RunFull = BossRun & { members: (BossRunMember & { user: User })[] };
const runInclude = { members: { include: { user: true }, orderBy: { createdAt: 'asc' } } } as const;

async function runDTO(ev: BossEvent, r: RunFull): Promise<BossRunDTO> {
  const used = await attemptsUsed(ev.id, r.members.map((m) => m.userId));
  return {
    id: r.id, leaderId: r.leaderId, status: r.status as BossRunDTO['status'], won: r.won, foughtAt: r.foughtAt?.toISOString() ?? null,
    members: r.members.map((m) => ({
      id: m.userId, username: m.user.username, level: m.user.level, accepted: m.accepted,
      attemptsLeft: Math.max(0, ev.attempts - (used.get(m.userId) ?? 0)),
      avatar: m.user.avatar as never, equipment: m.user.equipment as never,
    })),
  };
}

/** O que o jogador vê de um evento ativo — SEM a chance de vitória. */
export async function toPublic(ev: BossEvent, userId: string): Promise<BossEventPublic> {
  const boss = BOSSES_BY_ID[ev.bossId];
  const [used, mine, invites, history] = await Promise.all([
    attemptsUsed(ev.id, [userId]),
    prisma.bossRun.findFirst({
      where: { eventId: ev.id, status: 'FORMING', members: { some: { userId, accepted: true } } },
      include: runInclude,
    }),
    prisma.bossRun.findMany({
      where: { eventId: ev.id, status: 'FORMING', members: { some: { userId, accepted: false } } },
      include: runInclude,
    }),
    prisma.bossRun.findMany({
      where: { eventId: ev.id, status: 'FOUGHT', members: { some: { userId } } },
      orderBy: { foughtAt: 'desc' },
      take: 10,
    }),
  ]);
  return {
    id: ev.id, startsAt: ev.startsAt.toISOString(), endsAt: (ev.endedAt ?? ev.endsAt).toISOString(),
    teamSize: ev.teamSize, attempts: ev.attempts, attemptsLeft: Math.max(0, ev.attempts - (used.get(userId) ?? 0)),
    lootText: ev.lootText?.trim() || MYSTERY,
    boss,
    run: mine ? await runDTO(ev, mine) : null,
    invites: await Promise.all(invites.map((r) => runDTO(ev, r))),
    history: history.map((h) => ({ runId: h.id, won: !!h.won, foughtAt: (h.foughtAt ?? h.createdAt).toISOString() })),
  };
}

export async function toAdmin(ev: BossEvent): Promise<BossEventAdmin> {
  const [fights, wins, players] = await Promise.all([
    prisma.bossRun.count({ where: { eventId: ev.id, status: 'FOUGHT' } }),
    prisma.bossRun.count({ where: { eventId: ev.id, status: 'FOUGHT', won: true } }),
    prisma.bossRunMember.findMany({ where: { run: { eventId: ev.id, status: 'FOUGHT' } }, distinct: ['userId'], select: { userId: true } }),
  ]);
  return {
    id: ev.id, bossId: ev.bossId, bossName: BOSSES_BY_ID[ev.bossId]?.name ?? ev.bossId,
    startsAt: ev.startsAt.toISOString(), endsAt: ev.endsAt.toISOString(), endedAt: ev.endedAt?.toISOString() ?? null,
    status: statusOf(ev), attempts: ev.attempts, teamSize: ev.teamSize,
    lootItemId: ev.lootItemId, lootGold: ev.lootGold, lootXp: ev.lootXp, lootText: ev.lootText, winChance: ev.winChance,
    stats: { fights, wins, players: players.length },
  };
}

export async function requireActive(eventId: string) {
  const ev = await prisma.bossEvent.findUnique({ where: { id: eventId } });
  if (!ev || statusOf(ev) !== 'ACTIVE') throw notFound('Esse evento não está acontecendo.');
  return ev;
}

export async function loadRun(runId: string) {
  const r = await prisma.bossRun.findUnique({ where: { id: runId }, include: { ...runInclude, event: true } });
  if (!r) throw notFound('Time não encontrado.');
  return r;
}

/** Sala do líder (cria se não existir). */
export async function openRun(ev: BossEvent, userId: string) {
  const left = ev.attempts - ((await attemptsUsed(ev.id, [userId])).get(userId) ?? 0);
  if (left <= 0) throw badRequest('Você já usou todas as suas tentativas neste evento.', 'NO_ATTEMPTS');
  const existing = await prisma.bossRun.findFirst({
    where: { eventId: ev.id, status: 'FORMING', members: { some: { userId, accepted: true } } },
    include: runInclude,
  });
  if (existing) return existing;
  return prisma.bossRun.create({
    data: { eventId: ev.id, leaderId: userId, members: { create: { userId, accepted: true } } },
    include: runInclude,
  });
}

/** Sai de qualquer outra sala aberta deste evento (cada um em um time por vez). */
export async function leaveOtherRuns(eventId: string, userId: string, exceptRunId?: string) {
  const runs = await prisma.bossRun.findMany({
    where: { eventId, status: 'FORMING', id: exceptRunId ? { not: exceptRunId } : undefined, members: { some: { userId, accepted: true } } },
  });
  for (const r of runs) {
    if (r.leaderId === userId) await prisma.bossRun.update({ where: { id: r.id }, data: { status: 'CANCELLED' } });
    else await prisma.bossRunMember.deleteMany({ where: { runId: r.id, userId } });
  }
}

/**
 * A LUTA: sorteia o resultado no servidor (chance definida pelo admin, igual
 * para qualquer tamanho de time), monta a luta e entrega o espólio.
 */
export async function fightRun(runId: string, leaderId: string) {
  // trava a sala: duas lutas ao mesmo tempo não acontecem
  const claim = await prisma.bossRun.updateMany({ where: { id: runId, leaderId, status: 'FORMING' }, data: { status: 'FIGHTING' } });
  if (!claim.count) throw conflict('Esse time já lutou ou não é seu.', 'RUN_GONE');
  try {
    const run = await loadRun(runId);
    const ev = run.event;
    if (statusOf(ev) !== 'ACTIVE') throw badRequest('O evento já acabou.', 'EVENT_ENDED');
    const team = run.members.filter((m) => m.accepted);
    if (team.length > ev.teamSize) throw badRequest(`O time pode ter no máximo ${ev.teamSize}.`);
    const used = await attemptsUsed(ev.id, team.map((m) => m.userId));
    const tired = team.filter((m) => (used.get(m.userId) ?? 0) >= ev.attempts);
    if (tired.length) throw badRequest(`${tired.map((m) => m.user.username).join(', ')} não tem mais tentativas.`, 'NO_ATTEMPTS');
    const boss = BOSSES_BY_ID[ev.bossId];
    if (!boss) throw notFound('Boss não encontrado.');

    const won = randomInt(0, 10_000) < ev.winChance * 100;
    const seed = randomInt(1, 2_000_000_000);
    const replay = simulateBossFight({ boss, fighters: team.map((m) => fighterSnapshot(m.user)), won, seed });

    await prisma.$transaction(async (tx) => {
      await tx.bossRun.update({
        where: { id: run.id },
        data: {
          status: 'FOUGHT', won, seed, foughtAt: new Date(), duration: Math.round(replay.duration * 30),
          replay: gzipSync(JSON.stringify(replay), { level: 6 }),
        },
      });
      // quem só foi convidado e não aceitou sai do time
      await tx.bossRunMember.deleteMany({ where: { runId: run.id, accepted: false } });
      if (won) {
        // CADA um do time ganha o espólio inteiro
        const reason = `Vitória contra ${boss.name}`;
        // o aviso grande só aparece depois que a luta termina de passar (sem spoiler)
        const showAt = new Date(Date.now() + Math.max(0, replay.duration - 8) * 1000);
        for (const m of team) {
          if (ev.lootItemId) await grantGift(tx, { userId: m.userId, kind: 'ITEM', itemId: ev.lootItemId, reason, source: 'EVENT', eventId: ev.id, showAt });
          if (ev.lootGold > 0) await grantGift(tx, { userId: m.userId, kind: 'GOLD', amount: ev.lootGold, reason, source: 'EVENT', eventId: ev.id, showAt });
          if (ev.lootXp > 0) await grantGift(tx, { userId: m.userId, kind: 'XP', amount: ev.lootXp, reason, source: 'EVENT', eventId: ev.id, showAt });
        }
      }
    });
    for (const m of team) {
      void notify({ userId: m.userId, actorId: leaderId, type: 'BOSS_FIGHT', battleId: run.id, text: boss.name });
    }
    return { runId: run.id };
  } catch (e) {
    await prisma.bossRun.updateMany({ where: { id: runId, status: 'FIGHTING' }, data: { status: 'FORMING' } });
    throw e;
  }
}

/** Para a tela da luta: só quem lutou (ou o admin). */
export async function assertCanWatch(run: RunFull, user: User, admin: boolean) {
  if (admin) return;
  if (!run.members.some((m) => m.userId === user.id)) throw forbidden('Essa luta não é sua.');
}

// ------------------------------------------------------------------ avisos (tarefa periódica)

/** Começou → avisa todo mundo. Depois, a cada 12 h enquanto durar. Acabou → fecha as salas. */
export async function bossHousekeeping() {
  const now = new Date();
  const started = await prisma.bossEvent.findMany({ where: { ...activeWhere(now), announcedAt: null } });
  for (const ev of started) {
    const ok = await prisma.bossEvent.updateMany({ where: { id: ev.id, announcedAt: null }, data: { announcedAt: now, lastReminderAt: now } });
    if (ok.count) await broadcast(ev, 'start');
  }
  const due = await prisma.bossEvent.findMany({
    where: { ...activeWhere(now), announcedAt: { not: null }, lastReminderAt: { lte: new Date(now.getTime() - 12 * 3_600_000) } },
  });
  for (const ev of due) {
    const ok = await prisma.bossEvent.updateMany({ where: { id: ev.id, lastReminderAt: ev.lastReminderAt }, data: { lastReminderAt: now } });
    if (ok.count) await broadcast(ev, 'reminder');
  }
  await prisma.bossRun.updateMany({
    where: { status: { in: ['FORMING', 'FIGHTING'] }, event: { OR: [{ endsAt: { lte: now } }, { endedAt: { not: null } }] } },
    data: { status: 'CANCELLED' },
  });
}

async function broadcast(ev: BossEvent, kind: 'start' | 'reminder') {
  const boss = BOSSES_BY_ID[ev.bossId];
  const left = Math.max(1, Math.round((ev.endsAt.getTime() - Date.now()) / 3_600_000));
  const text =
    kind === 'start'
      ? `${boss?.name ?? 'Um boss'} apareceu na Arena! Monte seu time e enfrente — o evento dura ${left} h.`
      : `O evento contra ${boss?.name ?? 'o boss'} continua! Faltam ~${left} h. Ainda dá tempo de lutar.`;
  const users = await prisma.user.findMany({ select: { id: true } });
  for (const u of users) await notify({ userId: u.id, type: 'BOSS_EVENT', text });
}
