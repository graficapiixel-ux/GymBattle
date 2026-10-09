import { Router } from 'express';
import { z } from 'zod';
import { gunzipSync } from 'node:zlib';
import type { Battle } from '@prisma/client';
import { MAPS_BY_ID } from '@gymbattle/shared';
import { prisma } from '../db.js';
import { requireAuth } from '../lib/auth.js';
import { notFound } from '../lib/http.js';
import { toPublicUser } from '../lib/serialize.js';
import { protectedIso } from '../lib/ranking.js';

export const battlesRouter = Router();
battlesRouter.use(requireAuth);

/** Nas listas, enquanto a luta passa ao vivo, não revela vencedor, PR nem duração. */
export function listSummary(b: Battle) {
  const s = battleSummary(b);
  if (liveEndsAt(b) > new Date()) return { ...s, winner: null, result: null, durationSec: 0, live: true };
  return { ...s, live: false };
}

export function battleSummary(b: Battle) {
  return {
    id: b.id, mode: b.mode, map: b.map, mapName: MAPS_BY_ID[b.map]?.name ?? b.map,
    a: { id: b.aId, username: b.aName }, b: { id: b.bId, username: b.bName },
    winner: b.winner, durationSec: Math.round(b.duration / 30), result: b.result, createdAt: b.createdAt.toISOString(),
  };
}

/** Jogadores para desafiar (com a proteção de cada um). */
battlesRouter.get('/opponents', async (req, res) => {
  const { q } = z.object({ q: z.string().trim().max(32).optional() }).parse(req.query);
  // só gente do MEU grupo
  if (!req.user!.groupId) return void res.json({ users: [] });
  const users = await prisma.user.findMany({
    where: { id: { not: req.user!.id }, groupId: req.user!.groupId, ...(q ? { username: { contains: q } } : {}) },
    orderBy: [{ rankPoints: 'desc' }, { level: 'desc' }],
    take: 40,
  });
  res.json({ users: users.map((u) => ({ ...toPublicUser(u), rankPoints: u.rankPoints, protectedUntil: protectedIso(u) })) });
});

/** Momento em que a luta termina de passar ao vivo (a gravação tem ~2,5 s após o KO). */
export const liveEndsAt = (b: Pick<Battle, 'createdAt' | 'duration'>) => new Date(b.createdAt.getTime() + (b.duration / 30) * 1000);

/**
 * Minha luta que está passando AO VIVO agora (os dois lutadores são levados
 * para ela e ficam na tela até acabar). Nenhuma = null.
 */
battlesRouter.get('/live', async (req, res) => {
  const me = req.user!.id;
  const since = new Date(Date.now() - 12 * 60_000); // sem limite de tempo; a morte súbita termina bem antes
  const rows = await prisma.battle.findMany({
    where: { createdAt: { gte: since }, OR: [{ aId: me }, { bId: me }] },
    orderBy: { createdAt: 'desc' },
    take: 3,
    omit: { replay: true },
  });
  const now = new Date();
  const live = rows.find((b) => liveEndsAt(b as Battle) > now);
  res.json({
    battle: live ? { ...battleSummary(live as Battle), endsAt: liveEndsAt(live as Battle).toISOString() } : null,
    serverNow: now.toISOString(),
  });
});

/** Histórico (meu ou de um jogador). */
battlesRouter.get('/', async (req, res) => {
  const { user } = z.object({ user: z.string().max(40).optional() }).parse(req.query);
  const id = user ?? req.user!.id;
  const rows = await prisma.battle.findMany({
    where: { OR: [{ aId: id }, { bId: id }] },
    orderBy: { createdAt: 'desc' },
    take: 30,
    omit: { replay: true },
  });
  res.json({ battles: rows.map((b) => listSummary(b as Battle)) });
});

/** Lutas recentes de todo mundo (para assistir). */
battlesRouter.get('/recent', async (req, res) => {
  const g = req.user!.groupId;
  if (!g) return void res.json({ battles: [] });
  // lutas do meu grupo
  const rows = await prisma.battle.findMany({
    where: { a: { groupId: g }, b: { groupId: g } },
    orderBy: { createdAt: 'desc' }, take: 20, omit: { replay: true },
  });
  res.json({ battles: rows.map((b) => listSummary(b as Battle)) });
});

battlesRouter.get('/:id', async (req, res) => {
  const b = await prisma.battle.findUnique({ where: { id: String(req.params.id) }, omit: { replay: true } });
  if (!b) throw notFound('Luta não encontrada.');
  res.json({ battle: { ...battleSummary(b as Battle), endsAt: liveEndsAt(b as Battle).toISOString() }, serverNow: new Date().toISOString() });
});

/**
 * Replay: o MESMO arquivo para todos (lutadores e espectadores).
 * Enviado já comprimido (gzip) do banco.
 */
battlesRouter.get('/:id/replay', async (req, res) => {
  const b = await prisma.battle.findUnique({ where: { id: String(req.params.id) }, select: { replay: true } });
  if (!b) throw notFound('Luta não encontrada.');
  const buf = Buffer.from(b.replay);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
  if (/\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))) {
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
    res.end(buf);
  } else {
    res.end(gunzipSync(buf));
  }
});
