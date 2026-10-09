import { Router } from 'express';
import type { ProfileDTO } from '@gymbattle/shared';
import { prisma } from '../db.js';
import { requireAuth } from '../lib/auth.js';
import { notFound } from '../lib/http.js';
import { postInclude, toPostDTO, visibleSince } from '../lib/posts.js';
import { streakOf, toPublicUser } from '../lib/serialize.js';
import { rankPosition } from '../lib/ranking.js';

export const usersRouter = Router();
usersRouter.use(requireAuth);

/** Perfil público de um jogador. */
usersRouter.get('/:username', async (req, res) => {
  const u = await prisma.user.findUnique({ where: { username: String(req.params.username) } });
  if (!u) throw notFound('Jogador não encontrado.');
  const [above, posts] = await Promise.all([
    rankPosition(u),
    prisma.post.findMany({
      where: { userId: u.id, createdAt: { gte: visibleSince() } },
      include: postInclude(req.user!.id),
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
  ]);
  const body: ProfileDTO = {
    user: {
      ...toPublicUser(u),
      attributes: { str: u.str, dex: u.dex, vig: u.vig, fort: u.fort, ess: u.ess, int: u.int, fai: u.fai },
      streak: streakOf(u),
      rankPoints: u.rankPoints,
      // posição no ranking do grupo DELA (0 = sem grupo)
      rankPosition: above,
      createdAt: u.createdAt.toISOString(),
    },
    posts: posts.map(toPostDTO),
  };
  res.json(body);
});
