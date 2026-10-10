/**
 * Eventos da Arena — painel do admin: boss, PvP em equipes e waves (catálogo,
 * criar, editar, encerrar, histórico, prévia). Nada daqui chega aos jogadores.
 */
import { randomInt } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAdmin } from '../lib/auth.js';
import { badRequest, notFound } from '../lib/http.js';
import { itemInfo, toGiftDTO } from '../lib/gifts.js';
import { MAX_TEAM, kindOf, statusOf, toAdmin } from '../lib/bossEvents.js';
import { fighterSnapshot } from '../lib/battles.js';
import { BOSSES, BOSSES_BY_ID } from '../bosses/catalog.js';
import { simulateBossFight } from '../bosses/sim.js';
import { TARGET_WIN, THEMES, THEMES_BY_ID, themeAdmin } from '../arena/waves.js';
import { runPvp, runWaves } from '../arena/teamEvents.js';

export const adminEventsRouter = Router();
adminEventsRouter.use(requireAdmin);

/** Catálogo completo (só o admin vê). */
adminEventsRouter.get('/bosses', (_req, res) => {
  res.json({ bosses: BOSSES });
});

/** Temas das waves + a chance média de vitória (modo automático) por tamanho do time. */
adminEventsRouter.get('/themes', (_req, res) => {
  res.json({ themes: THEMES.map(themeAdmin), autoChance: TARGET_WIN });
});

const body = z.object({
  kind: z.enum(['BOSS', 'PVP', 'WAVES']).default('BOSS'),
  bossId: z.string().max(40).default('pvp'),
  startsAt: z.coerce.date(),
  hours: z.number().min(0.25, 'Mínimo de 15 minutos.').max(24 * 30, 'Máximo de 30 dias.'),
  attempts: z.number().int().min(1).max(50),
  teamSize: z.number().int().min(1).max(MAX_TEAM),
  lootItemId: z.string().max(96).nullable().optional().refine((v) => !v || !!itemInfo(v), 'Item não encontrado.'),
  lootGold: z.number().int().min(0).max(1_000_000).default(0),
  lootXp: z.number().int().min(0).max(1_000_000).default(0),
  lootText: z.string().trim().max(300).nullable().optional(),
  winChance: z.number().int().min(0).max(100).default(40),
  chanceAuto: z.boolean().default(true),
}).superRefine((b, ctx) => {
  if (b.kind === 'BOSS' && !BOSSES_BY_ID[b.bossId]) ctx.addIssue({ code: 'custom', path: ['bossId'], message: 'Escolha um boss.' });
  if (b.kind === 'WAVES' && !THEMES_BY_ID[b.bossId]) ctx.addIssue({ code: 'custom', path: ['bossId'], message: 'Escolha um tema.' });
});

function data(b: z.infer<typeof body>) {
  return {
    kind: b.kind,
    bossId: b.kind === 'PVP' ? 'pvp' : b.bossId,
    chanceAuto: b.kind === 'WAVES' ? b.chanceAuto : true,
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
  const evs = await prisma.bossEvent.findMany({ orderBy: { startsAt: 'desc' }, take: 150 });
  res.json({ events: await Promise.all(evs.map(toAdmin)), serverNow: new Date().toISOString() });
});

adminEventsRouter.post('/', async (req, res) => {
  const b = body.parse(req.body);
  const ev = await prisma.bossEvent.create({ data: data(b) });
  await prisma.moderationLog.create({ data: { actorId: req.user!.id, action: 'EVENT_CREATE', details: { eventId: ev.id, kind: ev.kind, bossId: ev.bossId } } });
  res.status(201).json({ event: await toAdmin(ev) });
});

adminEventsRouter.put('/:id', async (req, res) => {
  const b = body.parse(req.body);
  const old = await prisma.bossEvent.findUnique({ where: { id: String(req.params.id) } });
  if (!old) throw notFound('Evento não encontrado.');
  if (statusOf(old) === 'ENDED') throw badRequest('Esse evento já acabou.');
  // se ainda não começou e mudou a data, o aviso de início vai na hora certa
  if (b.kind !== kindOf(old)) throw badRequest('Não dá para mudar o tipo do evento. Crie outro.');
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
  await prisma.bossRun.updateMany({ where: { eventId: ev.id, status: { in: ['FORMING', 'QUEUED'] } }, data: { status: 'CANCELLED' } });
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
    kind: kindOf(ev),
    runs: runs
      // PvP: cada luta aparece uma vez (o time da casa e o adversário)
      .filter((r) => !r.vsRunId || !runs.some((o) => o.id === r.vsRunId && o.id < r.id))
      .map((r) => {
        const vs = r.vsRunId ? runs.find((o) => o.id === r.vsRunId) : undefined;
        return {
          id: r.id, won: r.won, foughtAt: r.foughtAt?.toISOString() ?? null,
          leader: r.members.find((m) => m.userId === r.leaderId)?.user.username ?? null,
          members: r.members.map((m) => m.user.username),
          vs: vs ? vs.members.map((m) => m.user.username) : undefined,
          reached: r.reached,
        };
      }),
    loot: gifts.map((g) => ({ ...toGiftDTO(g), username: g.user.username })),
  });
});

/** Jogadores de verdade para as prévias (o admin + os de nível mais alto que já têm arma). */
async function previewTeam(adminId: string, n: number, skip = 0) {
  const me = await prisma.user.findUnique({ where: { id: adminId } });
  const others = await prisma.user.findMany({ where: { id: { not: adminId }, starterWeapon: { not: null } }, take: n + skip, orderBy: { level: 'desc' } });
  return [me!, ...others].slice(skip, skip + n).map(fighterSnapshot);
}

/** Prévia das waves ou do PvP em equipes (não grava nada, ninguém é avisado). */
adminEventsRouter.post('/preview-team', async (req, res) => {
  const b = z.object({
    kind: z.enum(['PVP', 'WAVES']),
    themeId: z.string().optional(),
    team: z.number().int().min(1).max(MAX_TEAM).default(3),
    chanceAuto: z.boolean().default(true),
    winChance: z.number().int().min(0).max(100).default(40),
  }).parse(req.body);
  if (b.kind === 'WAVES') {
    const theme = THEMES_BY_ID[b.themeId ?? ''];
    if (!theme) throw notFound('Tema não encontrado.');
    const fighters = await previewTeam(req.user!.id, b.team);
    const r = runWaves(theme, fighters, b.chanceAuto ? { auto: true } : { auto: false, percent: b.winChance });
    return void res.json({ replay: r.replay });
  }
  const all = await previewTeam(req.user!.id, b.team * 2);
  const half = Math.ceil(all.length / 2);
  const A = all.filter((_, i) => i % 2 === 0).slice(0, half);
  const B = all.filter((_, i) => i % 2 === 1);
  if (!B.length) throw badRequest('Precisa de pelo menos 2 jogadores com arma para a prévia.');
  const name = (f: typeof A) => (f.length === 1 ? f[0].username : `Time de ${f[0].username}`);
  res.json({ replay: runPvp({ name: name(A), fighters: A }, { name: name(B), fighters: B }, randomInt(1, 2_000_000_000)) });
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
