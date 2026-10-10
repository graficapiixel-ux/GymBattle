/**
 * Eventos da Arena: BOSS, PvP EM EQUIPES e WAVES. Estado, tentativas, salas
 * (times), fila do PvP, lutas, espólio e avisos.
 * A chance de vitória, o catálogo e a dificuldade ficam SÓ aqui no servidor:
 * nada disso vai para o jogador (nem o que o admin configura).
 */
import { randomInt } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import type { BossEvent, BossRun, BossRunMember, Prisma, User } from '@prisma/client';
import type { BossEventAdmin, BossEventPublic, BossRunDTO, EventKind, TeamReplay } from '@gymbattle/shared';
import { prisma } from '../db.js';
import { BOSSES_BY_ID } from '../bosses/catalog.js';
import { simulateBossFight } from '../bosses/sim.js';
import { bossWinChance } from '../bosses/chance.js';
import { THEMES_BY_ID, themePublic } from '../arena/waves.js';
import { runPvp, runWaves } from '../arena/teamEvents.js';
import { fighterSnapshot } from './battles.js';
import { grantGift } from './gifts.js';
import { badRequest, conflict, forbidden, notFound } from './http.js';
import { notify, type NotifType } from './notify.js';

export const MAX_TEAM = 10;
const MYSTERY = '??? Um tesouro esquecido aguarda quem vencer...';
/** PvP: depois desse tempo na fila, aceita adversário de qualquer tamanho. */
const QUEUE_ANY_SIZE_MS = 3 * 60_000;
/** Salas que podem lutar/esperar (ainda não lutaram). */
const OPEN = ['FORMING', 'QUEUED'];

export const kindOf = (e: Pick<BossEvent, 'kind'>): EventKind => (e.kind === 'PVP' || e.kind === 'WAVES' ? e.kind : 'BOSS');

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

/** Nome do que se enfrenta (para avisos e histórico). */
export function eventTitle(ev: BossEvent): string {
  const k = kindOf(ev);
  if (k === 'PVP') return 'PvP em equipes';
  if (k === 'WAVES') return THEMES_BY_ID[ev.bossId]?.name ?? 'Waves';
  return BOSSES_BY_ID[ev.bossId]?.name ?? ev.bossId;
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
    queuedAt: r.queuedAt?.toISOString() ?? null,
    members: r.members.map((m) => ({
      id: m.userId, username: m.user.username, level: m.user.level, accepted: m.accepted,
      attemptsLeft: Math.max(0, ev.attempts - (used.get(m.userId) ?? 0)),
      avatar: m.user.avatar as never, equipment: m.user.equipment as never,
    })),
  };
}

/** Nome do time (PvP): "Time de <líder>" ou o nome do jogador sozinho. */
function teamName(members: { user: { username: string } }[], leaderName?: string) {
  if (members.length === 1) return members[0].user.username;
  return `Time de ${leaderName ?? members[0].user.username}`;
}

/** O que o jogador vê de um evento ativo — SEM chance de vitória, sem dificuldade. */
export async function toPublic(ev: BossEvent, userId: string): Promise<BossEventPublic> {
  const kind = kindOf(ev);
  const [used, mine, invites, history] = await Promise.all([
    attemptsUsed(ev.id, [userId]),
    prisma.bossRun.findFirst({
      where: { eventId: ev.id, status: { in: OPEN }, members: { some: { userId, accepted: true } } },
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
  // PvP: nomes dos adversários de cada luta
  const vsIds = history.map((h) => h.vsRunId).filter((x): x is string => !!x);
  const vsRuns = vsIds.length
    ? await prisma.bossRun.findMany({ where: { id: { in: vsIds } }, include: { leader: { select: { username: true } }, members: { include: { user: { select: { username: true } } } } } })
    : [];
  const vsName = new Map(vsRuns.map((r) => [r.id, teamName(r.members, r.leader.username)]));
  const theme = kind === 'WAVES' ? THEMES_BY_ID[ev.bossId] : undefined;
  return {
    id: ev.id, kind, startsAt: ev.startsAt.toISOString(), endsAt: (ev.endedAt ?? ev.endsAt).toISOString(),
    teamSize: ev.teamSize, attempts: ev.attempts, attemptsLeft: Math.max(0, ev.attempts - (used.get(userId) ?? 0)),
    lootText: ev.lootText?.trim() || MYSTERY,
    boss: kind === 'BOSS' ? (BOSSES_BY_ID[ev.bossId] ?? null) : null,
    theme: theme ? themePublic(theme) : null,
    run: mine ? await runDTO(ev, mine) : null,
    invites: await Promise.all(invites.map((r) => runDTO(ev, r))),
    history: history.map((h) => ({
      runId: h.id,
      won: kind === 'PVP' ? h.won : !!h.won,
      foughtAt: (h.foughtAt ?? h.createdAt).toISOString(),
      ...(h.vsRunId ? { vs: vsName.get(h.vsRunId) } : {}),
      ...(h.reached != null ? { reached: h.reached } : {}),
    })),
  };
}

export async function toAdmin(ev: BossEvent): Promise<BossEventAdmin> {
  const [fights, wins, players] = await Promise.all([
    prisma.bossRun.count({ where: { eventId: ev.id, status: 'FOUGHT' } }),
    prisma.bossRun.count({ where: { eventId: ev.id, status: 'FOUGHT', won: true } }),
    prisma.bossRunMember.findMany({ where: { run: { eventId: ev.id, status: 'FOUGHT' } }, distinct: ['userId'], select: { userId: true } }),
  ]);
  const kind = kindOf(ev);
  return {
    id: ev.id, kind, bossId: ev.bossId, bossName: eventTitle(ev),
    startsAt: ev.startsAt.toISOString(), endsAt: ev.endsAt.toISOString(), endedAt: ev.endedAt?.toISOString() ?? null,
    status: statusOf(ev), attempts: ev.attempts, teamSize: ev.teamSize,
    lootItemId: ev.lootItemId, lootGold: ev.lootGold, lootXp: ev.lootXp, lootText: ev.lootText, winChance: ev.winChance,
    chanceAuto: ev.chanceAuto,
    // PvP: cada luta tem 2 times (as "lutas" contam por time)
    stats: { fights: kind === 'PVP' ? Math.round(fights / 2) : fights, wins, players: players.length },
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
    where: { eventId: ev.id, status: { in: OPEN }, members: { some: { userId, accepted: true } } },
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
    where: { eventId, status: { in: OPEN }, id: exceptRunId ? { not: exceptRunId } : undefined, members: { some: { userId, accepted: true } } },
  });
  for (const r of runs) {
    if (r.leaderId === userId) await prisma.bossRun.update({ where: { id: r.id }, data: { status: 'CANCELLED' } });
    else await prisma.bossRunMember.deleteMany({ where: { runId: r.id, userId } });
  }
}

/** Confere o time antes de lutar/entrar na fila: tamanho e tentativas de cada um. */
async function checkTeam(ev: BossEvent, team: (BossRunMember & { user: User })[]) {
  if (!team.length) throw badRequest('O time está vazio.');
  if (team.length > ev.teamSize) throw badRequest(`O time pode ter no máximo ${ev.teamSize}.`);
  const used = await attemptsUsed(ev.id, team.map((m) => m.userId));
  const tired = team.filter((m) => (used.get(m.userId) ?? 0) >= ev.attempts);
  if (tired.length) throw badRequest(`${tired.map((m) => m.user.username).join(', ')} não tem mais tentativas.`, 'NO_ATTEMPTS');
}

const gz = (x: unknown) => gzipSync(JSON.stringify(x), { level: 6 });

/** Espólio para cada um do time (o aviso grande só aparece depois da luta passar). */
async function giveLoot(tx: Prisma.TransactionClient, ev: BossEvent, userIds: string[], reason: string, showAt: Date) {
  for (const userId of userIds) {
    if (ev.lootItemId) await grantGift(tx, { userId, kind: 'ITEM', itemId: ev.lootItemId, reason, source: 'EVENT', eventId: ev.id, showAt });
    if (ev.lootGold > 0) await grantGift(tx, { userId, kind: 'GOLD', amount: ev.lootGold, reason, source: 'EVENT', eventId: ev.id, showAt });
    if (ev.lootXp > 0) await grantGift(tx, { userId, kind: 'XP', amount: ev.lootXp, reason, source: 'EVENT', eventId: ev.id, showAt });
  }
}

/**
 * LUTAR (boss e waves; o PvP entra na fila). Boss: sorteia o resultado no
 * servidor (chance do admin + 1% por membro extra). Waves: a luta decide (ou a
 * chance fixa do admin, se ele escolheu).
 */
export async function fightRun(runId: string, leaderId: string) {
  // trava a sala: duas lutas ao mesmo tempo não acontecem
  const claim = await prisma.bossRun.updateMany({ where: { id: runId, leaderId, status: 'FORMING' }, data: { status: 'FIGHTING' } });
  if (!claim.count) throw conflict('Esse time já lutou ou não é seu.', 'RUN_GONE');
  try {
    const run = await loadRun(runId);
    const ev = run.event;
    if (statusOf(ev) !== 'ACTIVE') throw badRequest('O evento já acabou.', 'EVENT_ENDED');
    const kind = kindOf(ev);
    if (kind === 'PVP') throw badRequest('No PvP em equipes, procure um adversário.', 'USE_QUEUE');
    const team = run.members.filter((m) => m.accepted);
    await checkTeam(ev, team);
    const fighters = team.map((m) => fighterSnapshot(m.user));

    let won: boolean;
    let seed: number;
    let replay: unknown;
    let seconds: number;
    let reached: number | null = null;
    let title: string;
    if (kind === 'WAVES') {
      const theme = THEMES_BY_ID[ev.bossId];
      if (!theme) throw notFound('Tema não encontrado.');
      const r = runWaves(theme, fighters, ev.chanceAuto ? { auto: true } : { auto: false, percent: ev.winChance });
      won = r.replay.winner === 0;
      seed = r.seed;
      replay = r.replay;
      seconds = r.replay.duration / r.replay.tickRate;
      reached = r.replay.waves?.reached ?? null;
      title = theme.name;
    } else {
      const boss = BOSSES_BY_ID[ev.bossId];
      if (!boss) throw notFound('Boss não encontrado.');
      // +1% por membro extra do time (escondido: nada disso aparece para o jogador)
      won = randomInt(0, 10_000) < bossWinChance(ev.winChance, team.length) * 100;
      seed = randomInt(1, 2_000_000_000);
      const r = simulateBossFight({ boss, fighters, won, seed });
      replay = r;
      seconds = r.duration;
      title = boss.name;
    }

    await prisma.$transaction(async (tx) => {
      await tx.bossRun.update({
        where: { id: run.id },
        data: { status: 'FOUGHT', won, seed, foughtAt: new Date(), duration: Math.round(seconds * 30), reached, replay: gz(replay) },
      });
      // quem só foi convidado e não aceitou sai do time
      await tx.bossRunMember.deleteMany({ where: { runId: run.id, accepted: false } });
      if (won) {
        const reason = kind === 'WAVES' ? `Vitória nas waves: ${title}` : `Vitória contra ${title}`;
        await giveLoot(tx, ev, team.map((m) => m.userId), reason, new Date(Date.now() + Math.max(0, seconds - 8) * 1000));
      }
    });
    const type: NotifType = kind === 'WAVES' ? 'WAVES_FIGHT' : 'BOSS_FIGHT';
    for (const m of team) void notify({ userId: m.userId, actorId: leaderId, type, battleId: run.id, text: title });
    return { runId: run.id, kind };
  } catch (e) {
    await prisma.bossRun.updateMany({ where: { id: runId, status: 'FIGHTING' }, data: { status: 'FORMING' } });
    throw e;
  }
}

// ------------------------------------------------------------------ PvP em equipes: fila

/** O líder põe o time na fila ("Procurar adversário"). Se já houver alguém esperando, a luta sai na hora. */
export async function queueRun(runId: string, leaderId: string) {
  const run = await loadRun(runId);
  if (run.leaderId !== leaderId) throw forbidden('Só quem montou o time pode procurar adversário.');
  if (run.status !== 'FORMING') throw conflict('Esse time já está na fila ou já lutou.', 'RUN_GONE');
  const ev = run.event;
  if (statusOf(ev) !== 'ACTIVE') throw badRequest('O evento já acabou.', 'EVENT_ENDED');
  if (kindOf(ev) !== 'PVP') throw badRequest('Esse evento não é de PvP.');
  const team = run.members.filter((m) => m.accepted);
  await checkTeam(ev, team);
  // convidados que não aceitaram ficam de fora
  await prisma.bossRunMember.deleteMany({ where: { runId: run.id, accepted: false } });
  const ok = await prisma.bossRun.updateMany({ where: { id: run.id, status: 'FORMING' }, data: { status: 'QUEUED', queuedAt: new Date() } });
  if (!ok.count) throw conflict('Esse time já está na fila ou já lutou.', 'RUN_GONE');
  const fought = await matchmake(ev.id);
  return { matched: fought.includes(run.id), runId: run.id };
}

/** Sai da fila (volta a montar o time). */
export async function unqueueRun(runId: string, userId: string) {
  const run = await loadRun(runId);
  if (run.leaderId !== userId) throw forbidden('Só quem montou o time pode cancelar a busca.');
  const ok = await prisma.bossRun.updateMany({ where: { id: runId, status: 'QUEUED' }, data: { status: 'FORMING', queuedAt: null } });
  if (!ok.count) throw conflict('A luta já começou!', 'RUN_GONE');
}

/** Força de um time (para juntar times parecidos). */
function power(members: { user: User }[]) {
  return members.reduce((s, m) => s + m.user.level + (m.user.str + m.user.dex + m.user.vig + m.user.fort + m.user.ess + m.user.int + m.user.fai) * 0.2, 0);
}

/**
 * Junta os times da fila: tamanho igual (ou com 1 de diferença) e força parecida.
 * Quem espera há mais de 3 min aceita qualquer tamanho. Devolve os ids que lutaram.
 */
export async function matchmake(eventId: string): Promise<string[]> {
  const fought: string[] = [];
  for (let guard = 0; guard < 20; guard++) {
    const queue = await prisma.bossRun.findMany({ where: { eventId, status: 'QUEUED' }, include: { ...runInclude, event: true }, orderBy: { queuedAt: 'asc' } });
    if (queue.length < 2) break;
    let pair: [RunFull & { event: BossEvent }, RunFull & { event: BossEvent }] | null = null;
    for (const a of queue) {
      const sa = a.members.length;
      const anySize = Date.now() - (a.queuedAt?.getTime() ?? Date.now()) > QUEUE_ANY_SIZE_MS;
      const pa = power(a.members);
      const options = queue
        .filter((b) => b.id !== a.id && !b.members.some((m) => a.members.some((x) => x.userId === m.userId)))
        .filter((b) => anySize || Math.abs(b.members.length - sa) <= 1 || Date.now() - (b.queuedAt?.getTime() ?? Date.now()) > QUEUE_ANY_SIZE_MS)
        .sort((x, y) => Math.abs(x.members.length - sa) - Math.abs(y.members.length - sa) || Math.abs(power(x.members) - pa) - Math.abs(power(y.members) - pa));
      if (options.length) {
        pair = [a, options[0]];
        break;
      }
    }
    if (!pair) break;
    const ids = await fightPvp(pair[0], pair[1]);
    fought.push(...ids);
  }
  return fought;
}

async function fightPvp(a: RunFull & { event: BossEvent }, b: RunFull & { event: BossEvent }): Promise<string[]> {
  // trava os dois times (se outro processo pegou um deles, desiste sem lutar)
  const ca = await prisma.bossRun.updateMany({ where: { id: a.id, status: 'QUEUED' }, data: { status: 'FIGHTING' } });
  if (!ca.count) return [];
  const cb = await prisma.bossRun.updateMany({ where: { id: b.id, status: 'QUEUED' }, data: { status: 'FIGHTING' } });
  if (!cb.count) {
    await prisma.bossRun.updateMany({ where: { id: a.id, status: 'FIGHTING' }, data: { status: 'QUEUED' } });
    return [];
  }
  const ev = a.event;
  try {
    const leaderName = (r: RunFull) => r.members.find((m) => m.userId === r.leaderId)?.user.username;
    const nameA = teamName(a.members, leaderName(a));
    const nameB = teamName(b.members, leaderName(b));
    const seed = randomInt(1, 2_000_000_000);
    const replay: TeamReplay = runPvp(
      { name: nameA, fighters: a.members.map((m) => fighterSnapshot(m.user)) },
      { name: nameB, fighters: b.members.map((m) => fighterSnapshot(m.user)) },
      seed,
    );
    const seconds = replay.duration / replay.tickRate;
    const blob = gz(replay);
    const now = new Date();
    const wonA = replay.winner === null ? null : replay.winner === 0;
    const wonB = replay.winner === null ? null : replay.winner === 1;
    await prisma.$transaction(async (tx) => {
      await tx.bossRun.update({ where: { id: a.id }, data: { status: 'FOUGHT', won: wonA, seed, foughtAt: now, duration: replay.duration, vsRunId: b.id, replay: blob } });
      await tx.bossRun.update({ where: { id: b.id }, data: { status: 'FOUGHT', won: wonB, seed, foughtAt: now, duration: replay.duration, vsRunId: a.id, replay: blob } });
      const showAt = new Date(Date.now() + Math.max(0, seconds - 8) * 1000);
      if (wonA) await giveLoot(tx, ev, a.members.map((m) => m.userId), `Vitória no PvP em equipes contra ${nameB}`, showAt);
      if (wonB) await giveLoot(tx, ev, b.members.map((m) => m.userId), `Vitória no PvP em equipes contra ${nameA}`, showAt);
    });
    for (const m of a.members) void notify({ userId: m.userId, type: 'PVP_FIGHT', battleId: a.id, text: nameB });
    for (const m of b.members) void notify({ userId: m.userId, type: 'PVP_FIGHT', battleId: b.id, text: nameA });
    return [a.id, b.id];
  } catch (e) {
    console.error('PvP em equipes falhou', e);
    await prisma.bossRun.updateMany({ where: { id: { in: [a.id, b.id] }, status: 'FIGHTING' }, data: { status: 'QUEUED' } });
    return [];
  }
}

/** Para a tela da luta: só quem lutou (inclusive o time adversário no PvP) ou o admin. */
export async function assertCanWatch(run: RunFull, user: User, admin: boolean) {
  if (admin) return;
  if (run.members.some((m) => m.userId === user.id)) return;
  if (run.vsRunId && (await prisma.bossRunMember.findFirst({ where: { runId: run.vsRunId, userId: user.id } }))) return;
  throw forbidden('Essa luta não é sua.');
}

// ------------------------------------------------------------------ avisos (tarefa periódica)

/** Começou → avisa todo mundo. Depois, a cada 12 h enquanto durar. Acabou → fecha as salas e a fila. */
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
  // PvP: quem está esperando há um tempo aceita adversário de outro tamanho
  const pvp = await prisma.bossEvent.findMany({ where: { ...activeWhere(now), kind: 'PVP' }, select: { id: true } });
  for (const ev of pvp) await matchmake(ev.id).catch((e) => console.error('fila do PvP', e));
  // acabou: ninguém fica preso numa sala ou na fila (tentativa não é gasta)
  const ended = await prisma.bossRun.findMany({
    where: { status: { in: ['FORMING', 'QUEUED', 'FIGHTING'] }, event: { OR: [{ endsAt: { lte: now } }, { endedAt: { not: null } }] } },
    include: { members: true, event: true },
  });
  for (const r of ended) {
    const ok = await prisma.bossRun.updateMany({ where: { id: r.id, status: r.status }, data: { status: 'CANCELLED' } });
    if (ok.count && r.status === 'QUEUED') {
      for (const m of r.members) void notify({ userId: m.userId, type: 'PVP_EVENT', text: 'O PvP em equipes acabou antes de aparecer um adversário para o seu time. Sua tentativa não foi gasta.' });
    }
  }
}

async function broadcast(ev: BossEvent, kind: 'start' | 'reminder') {
  const left = Math.max(1, Math.round((ev.endsAt.getTime() - Date.now()) / 3_600_000));
  const k = kindOf(ev);
  let type: NotifType = 'BOSS_EVENT';
  let text: string;
  if (k === 'PVP') {
    type = 'PVP_EVENT';
    const size = ev.teamSize === 1 ? 'Lute sozinho' : `Monte um time de até ${ev.teamSize}`;
    text =
      kind === 'start'
        ? `PvP em equipes na Arena! ${size} e procure adversários — o evento dura ${left} h.`
        : `O PvP em equipes continua! Faltam ~${left} h. Ainda dá tempo de lutar.`;
  } else if (k === 'WAVES') {
    type = 'WAVES_EVENT';
    const th = THEMES_BY_ID[ev.bossId];
    text =
      kind === 'start'
        ? `${th?.name ?? 'Hordas de monstros'}: ondas de monstros invadiram a Arena! Sobreviva às 10 waves e enfrente quem comanda as hordas — dura ${left} h.`
        : `As hordas de ${th?.name ?? 'monstros'} continuam na Arena! Faltam ~${left} h.`;
  } else {
    const boss = BOSSES_BY_ID[ev.bossId];
    text =
      kind === 'start'
        ? `${boss?.name ?? 'Um boss'} apareceu na Arena! Monte seu time e enfrente — o evento dura ${left} h.`
        : `O evento contra ${boss?.name ?? 'o boss'} continua! Faltam ~${left} h. Ainda dá tempo de lutar.`;
  }
  const users = await prisma.user.findMany({ select: { id: true } });
  for (const u of users) await notify({ userId: u.id, type, text });
}
