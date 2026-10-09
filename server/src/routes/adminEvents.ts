/** Eventos de boss — painel do admin (catálogo, criar, editar, encerrar, histórico, prévia). */
import { randomInt } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAdmin } from '../lib/auth.js';
import { badRequest, notFound } from '../lib/http.js';
import { itemInfo, toGiftDTO } from '../lib/gifts.js';
import { MAX_TEAM, statusOf, toAdmin } from '../lib/bossEvents.js';
import { fighterSnapshot } from '../lib/battles.js';
import { BOSSES, BOSSES_BY_ID } from '../bosses/catalog.js';
import { simulateBossFight } from '../bosses/sim.js';

export const adminEventsRouter = Router();
adminEventsRouter.use(requireAdmin);

/** Catálogo completo (só o admin vê). */
adminEventsRouter.get('/bosses', (_req, res) => {
  res.json({ bosses: BOSSES });
});

const body = z.object({
  bossId: z.string().refine((id) => !!BOSSES_BY_ID[id], 'Escolha um boss.'),
  startsAt: z.coerce.date(),
  hours: z.number().min(0.25, 'Mínimo de 15 minutos.').max(24 * 30, 'Máximo de 30 dias.'),
  attempts: z.number().int().min(1).max(50),
  teamSize: z.number().int().min(1).max(MAX_TEAM),
  lootItemId: z.string().max(96).nullable().optional().refine((v) => !v || !!itemInfo(v), 'Item não encontrado.'),
  lootGold: z.number().int().min(0).max(1_000_000).default(0),
  lootXp: z.number().int().min(0).max(1_000_000).default(0),
  lootText: z.string().trim().max(300).nullable().optional(),
  winChance: z.number().int().min(0).max(100).default(40),
});

function data(b: z.infer<typeof body>) {
  return {
    bossId: b.bossId,
    startsAt: b.startsAt,
    endsAt: new Date(b.startsAt.getTime() + b.hours * 3_600_000),
    attempts: b.attempts,
    teamSize: b.teamSize,
    lootItemId: b.lootItemId || null,
    lootGold: b.lootGold,
    lootXp: b.lootXp,
    lootText: b.lootText?.trim() || null,
    winChance: b.winChance,
  };
}

adminEventsRouter.get('/', async (_req, res) => {
  const evs = await prisma.bossEvent.findMany({ orderBy: { startsAt: 'desc' }, take: 100 });
  res.json({ events: await Promise.all(evs.map(toAdmin)), serverNow: new Date().toISOString() });
});

adminEventsRouter.post('/', async (req, res) => {
  const b = body.parse(req.body);
  const ev = await prisma.bossEvent.create({ data: data(b) });
  await prisma.moderationLog.create({ data: { actorId: req.user!.id, action: 'EVENT_CREATE', details: { eventId: ev.id, bossId: ev.bossId } } });
  res.status(201).json({ event: await toAdmin(ev) });
});

adminEventsRouter.put('/:id', async (req, res) => {
  const b = body.parse(req.body);
  const old = await prisma.bossEvent.findUnique({ where: { id: String(req.params.id) } });
  if (!old) throw notFound('Evento não encontrado.');
  if (statusOf(old) === 'ENDED') throw badRequest('Esse evento já acabou.');
  // se ainda não começou e mudou a data, o aviso de início vai na hora certa
  const ev = await prisma.bossEvent.update({
    where: { id: old.id },
    data: { ...data(b), ...(statusOf(old) === 'SCHEDULED' ? { announcedAt: null, lastReminderAt: null } : {}) },
  });
  await prisma.moderationLog.create({ data: { actorId: req.user!.id, action: 'EVENT_EDIT', details: { eventId: ev.id } } });
  res.json({ event: await toAdmin(ev) });
});

/** Encerrar antes da hora. */
adminEventsRouter.post('/:id/end', async (req, res) => {
  const ev = await prisma.bossEvent.update({ where: { id: String(req.params.id) }, data: { endedAt: new Date() } }).catch(() => null);
  if (!ev) throw notFound('Evento não encontrado.');
  await prisma.bossRun.updateMany({ where: { eventId: ev.id, status: 'FORMING' }, data: { status: 'CANCELLED' } });
  await prisma.moderationLog.create({ data: { actorId: req.user!.id, action: 'EVENT_END', details: { eventId: ev.id } } });
  res.json({ event: await toAdmin(ev) });
});

adminEventsRouter.delete('/:id', async (req, res) => {
  const ev = await prisma.bossEvent.findUnique({ where: { id: String(req.params.id) } });
  if (!ev) throw notFound('Evento não encontrado.');
  if (statusOf(ev) !== 'SCHEDULED') throw badRequest('Só dá para apagar evento que ainda não começou. Use “Encerrar”.');
  await prisma.bossEvent.delete({ where: { id: ev.id } });
  res.json({ ok: true });
});

/** Histórico: cada tentativa, quem lutou, resultado e o que ganhou. */
adminEventsRouter.get('/:id/history', async (req, res) => {
  const ev = await prisma.bossEvent.findUnique({ where: { id: String(req.params.id) } });
  if (!ev) throw notFound('Evento não encontrado.');
  const runs = await prisma.bossRun.findMany({
    where: { eventId: ev.id, status: 'FOUGHT' },
    include: { members: { include: { user: { select: { id: true, username: true } } } } },
    orderBy: { foughtAt: 'desc' },
  });
  const gifts = await prisma.gift.findMany({ where: { eventId: ev.id }, include: { user: { select: { username: true } } }, orderBy: { createdAt: 'desc' } });
  res.json({
    event: await toAdmin(ev),
    runs: runs.map((r) => ({
      id: r.id, won: !!r.won, foughtAt: r.foughtAt?.toISOString() ?? null,
      leader: r.members.find((m) => m.userId === r.leaderId)?.user.username ?? null,
      members: r.members.map((m) => m.user.username),
    })),
    loot: gifts.map((g) => ({ ...toGiftDTO(g), username: g.user.username })),
  });
});

/** Prévia de uma luta (não grava nada): para o admin ver o boss em ação. */
adminEventsRouter.post('/preview', async (req, res) => {
  const { bossId, won, team } = z.object({ bossId: z.string(), won: z.boolean(), team: z.number().int().min(1).max(MAX_TEAM).default(3) }).parse(req.body);
  const boss = BOSSES_BY_ID[bossId];
  if (!boss) throw notFound('Boss não encontrado.');
  const others = await prisma.user.findMany({ where: { id: { not: req.user!.id }, starterWeapon: { not: null } }, take: team - 1, orderBy: { level: 'desc' } });
  const fighters = [req.user!, ...others].slice(0, team).map(fighterSnapshot);
  res.json({ replay: simulateBossFight({ boss, fighters, won, seed: randomInt(1, 2_000_000_000) }) });
});
