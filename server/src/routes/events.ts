/**
 * Eventos da Arena (boss, PvP em equipes, waves) — lado do jogador. Nada aqui
 * revela eventos não ativos, a chance de vitória nem o que o admin configurou.
 * Sem evento ativo, tudo responde como se não existisse.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma } from '../db.js';
import { isAdmin, requireAuth } from '../lib/auth.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/http.js';
import { notify } from '../lib/notify.js';
import {
  activeEvents, assertCanWatch, attemptsUsed, eventTitle, fightRun, kindOf, leaveOtherRuns, loadRun, openRun, queueRun, requireActive, statusOf, toPublic,
  unqueueRun,
} from '../lib/bossEvents.js';

export const eventsRouter = Router();
eventsRouter.use(requireAuth);

const limiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: process.env.NODE_ENV === 'test' ? 10_000 : 120,
  keyGenerator: (req) => req.user!.id,
  message: { error: 'Muitas ações seguidas. Espere um pouco.', code: 'RATE_LIMIT' },
});

/** Eventos ATIVOS agora (lista vazia quando não há nenhum). */
eventsRouter.get('/active', async (req, res) => {
  const evs = await activeEvents();
  res.json({ events: await Promise.all(evs.map((e) => toPublic(e, req.user!.id))), serverNow: new Date().toISOString() });
});

// ------------------------------------------------------------------ kit de arte (protegido)

const here = path.dirname(fileURLToPath(import.meta.url));
const KIT_PATHS = [path.join(here, 'bosskit.js'), path.join(here, '..', 'dist', 'bosskit.js'), path.join(here, '..', '..', 'dist', 'bosskit.js')];

/** O kit fica em memória (antes era lido do disco, de forma bloqueante, a cada pedido). */
let kitCache: { file: string; mtime: number; buf: Buffer } | null = null;
function loadKit(): Buffer | null {
  const file = KIT_PATHS.find((p) => fs.existsSync(p));
  if (!file) return null;
  const mtime = fs.statSync(file).mtimeMs;
  if (!kitCache || kitCache.file !== file || kitCache.mtime !== mtime) kitCache = { file, mtime, buf: fs.readFileSync(file) };
  return kitCache.buf;
}

/**
 * O código que desenha e anima os bosses. Só é entregue para o admin, ou
 * quando há evento ativo, ou para quem lutou nos últimos 3 dias (rever a luta).
 * Para os outros, a rota "não existe".
 */
eventsRouter.get('/kit.js', async (req, res) => {
  const u = req.user!;
  let ok = isAdmin(u) || (await activeEvents()).length > 0;
  if (!ok) {
    ok = !!(await prisma.bossRunMember.findFirst({
      where: { userId: u.id, run: { status: 'FOUGHT', foughtAt: { gte: new Date(Date.now() - 3 * 86_400_000) } } },
      select: { runId: true },
    }));
  }
  if (!ok) throw notFound('Rota não encontrada.');
  const kit = loadKit();
  if (!kit) return void res.status(503).json({ error: 'Indisponível.', code: 'KIT_MISSING' });
  res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(kit);
});

// ------------------------------------------------------------------ times

/** Abrir (ou pegar) a minha sala para enfrentar o boss. */
eventsRouter.post('/:id/run', limiter, async (req, res) => {
  const ev = await requireActive(String(req.params.id));
  await leaveOtherRuns(ev.id, req.user!.id);
  await openRun(ev, req.user!.id);
  res.json({ event: await toPublic(ev, req.user!.id) });
});

/** Procurar jogadores para convidar (com as tentativas que sobram). */
eventsRouter.get('/:id/search', async (req, res) => {
  const ev = await requireActive(String(req.params.id));
  const { q } = z.object({ q: z.string().trim().min(1).max(32) }).parse(req.query);
  const users = await prisma.user.findMany({ where: { username: { contains: q }, id: { not: req.user!.id } }, take: 12, orderBy: { username: 'asc' } });
  const used = await attemptsUsed(ev.id, users.map((u) => u.id));
  res.json({
    users: users.map((u) => ({
      id: u.id, username: u.username, level: u.level, avatar: u.avatar, equipment: u.equipment,
      sameGroup: !!u.groupId && u.groupId === req.user!.groupId,
      attemptsLeft: Math.max(0, ev.attempts - (used.get(u.id) ?? 0)),
    })),
  });
});

eventsRouter.post('/runs/:runId/invite', limiter, async (req, res) => {
  const { username } = z.object({ username: z.string().trim().min(1).max(32) }).parse(req.body);
  const run = await loadRun(String(req.params.runId));
  if (run.leaderId !== req.user!.id) throw forbidden('Só quem montou o time pode convidar.');
  if (run.status !== 'FORMING' || statusOf(run.event) !== 'ACTIVE') throw conflict('Esse time não está mais aberto.');
  const target = await prisma.user.findUnique({ where: { username } });
  if (!target) throw notFound('Jogador não encontrado.');
  if (run.members.some((m) => m.userId === target.id)) throw conflict(`${target.username} já está no time.`);
  if (run.members.length >= run.event.teamSize) throw badRequest(`O time já está completo (${run.event.teamSize}).`, 'TEAM_FULL');
  const left = run.event.attempts - ((await attemptsUsed(run.eventId, [target.id])).get(target.id) ?? 0);
  if (left <= 0) throw badRequest(`${target.username} não tem mais tentativas neste evento.`, 'NO_ATTEMPTS');
  await prisma.bossRunMember.create({ data: { runId: run.id, userId: target.id, accepted: false } });
  const k = kindOf(run.event);
  void notify({ userId: target.id, actorId: req.user!.id, type: k === 'PVP' ? 'PVP_INVITE' : k === 'WAVES' ? 'WAVES_INVITE' : 'BOSS_INVITE', text: eventTitle(run.event) });
  res.json({ event: await toPublic(run.event, req.user!.id) });
});

eventsRouter.post('/runs/:runId/accept', limiter, async (req, res) => {
  const run = await loadRun(String(req.params.runId));
  const me = run.members.find((m) => m.userId === req.user!.id);
  if (!me) throw notFound('Convite não encontrado.');
  if (run.status !== 'FORMING' || statusOf(run.event) !== 'ACTIVE') throw conflict('Esse time não está mais aberto.');
  const left = run.event.attempts - ((await attemptsUsed(run.eventId, [me.userId])).get(me.userId) ?? 0);
  if (left <= 0) throw badRequest('Você já usou todas as suas tentativas neste evento.', 'NO_ATTEMPTS');
  if (run.members.filter((m) => m.accepted).length >= run.event.teamSize) throw badRequest('O time já está completo.', 'TEAM_FULL');
  await leaveOtherRuns(run.eventId, me.userId, run.id);
  await prisma.bossRunMember.update({ where: { runId_userId: { runId: run.id, userId: me.userId } }, data: { accepted: true } });
  res.json({ event: await toPublic(run.event, req.user!.id) });
});

/** Recusar convite / sair do time / (líder) remover alguém ou desfazer a sala. */
eventsRouter.post('/runs/:runId/leave', async (req, res) => {
  const { userId } = z.object({ userId: z.string().max(40).optional() }).parse(req.body ?? {});
  const run = await loadRun(String(req.params.runId));
  if (run.status !== 'FORMING' && run.status !== 'QUEUED') throw conflict('Esse time não está mais aberto.');
  const target = userId ?? req.user!.id;
  const isLeader = run.leaderId === req.user!.id;
  if (target !== req.user!.id && !isLeader) throw forbidden();
  if (target === run.leaderId) await prisma.bossRun.update({ where: { id: run.id }, data: { status: 'CANCELLED' } });
  else await prisma.bossRunMember.deleteMany({ where: { runId: run.id, userId: target } });
  res.json({ event: await toPublic(run.event, req.user!.id) });
});

/** LUTAR! (só o líder) — boss e waves. */
eventsRouter.post('/runs/:runId/fight', limiter, async (req, res) => {
  const r = await fightRun(String(req.params.runId), req.user!.id);
  res.json(r);
});

/** PvP em equipes: procurar adversário (entra na fila; se já houver alguém, a luta sai na hora). */
eventsRouter.post('/runs/:runId/queue', limiter, async (req, res) => {
  const r = await queueRun(String(req.params.runId), req.user!.id);
  const run = await loadRun(r.runId);
  res.json({ matched: r.matched, runId: r.runId, event: await toPublic(run.event, req.user!.id) });
});

/** PvP em equipes: parar de procurar. */
eventsRouter.post('/runs/:runId/unqueue', limiter, async (req, res) => {
  await unqueueRun(String(req.params.runId), req.user!.id);
  const run = await loadRun(String(req.params.runId));
  res.json({ event: await toPublic(run.event, req.user!.id) });
});

/** A luta gravada (para assistir). */
eventsRouter.get('/runs/:runId/replay', async (req, res) => {
  const run = await loadRun(String(req.params.runId));
  await assertCanWatch(run, req.user!, isAdmin(req.user!));
  if (run.status !== 'FOUGHT' || !run.replay) throw notFound('Essa luta ainda não aconteceu.');
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({
    kind: kindOf(run.event),
    replay: JSON.parse(gunzipSync(run.replay).toString()),
    foughtAt: run.foughtAt?.toISOString(),
    serverNow: new Date().toISOString(),
  });
});
