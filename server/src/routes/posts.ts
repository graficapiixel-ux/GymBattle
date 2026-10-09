import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  BALANCE, REPORT_REASONS, currentStreak, dayKey, postReward, nextStreak,
  type CommentDTO, type FeedPage, type TodayStatus,
} from '@gymbattle/shared';
import { prisma } from '../db.js';
import { isAdmin, requireAuth } from '../lib/auth.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/http.js';
import { deleteImage, isDuplicate, processUpload, saveImage } from '../lib/images.js';
import { postInclude, toPostDTO, visibleSince } from '../lib/posts.js';
import { grantPostReward, reversePostReward } from '../lib/rewards.js';
import { toMe, toPublicUser } from '../lib/serialize.js';
import { notify } from '../lib/notify.js';
import { consumeCaptureToken, issueCaptureToken } from '../lib/capture.js';
import { isOldPhoto } from '../lib/photoAge.js';

export const postsRouter = Router();
postsRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: BALANCE.post.maxUploadMB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

const postLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 12,
  keyGenerator: (req) => req.user!.id,
  message: { error: 'Você postou demais nesta hora. Tente mais tarde.', code: 'RATE_LIMIT' },
});

/** Status de hoje: a recompensa ainda está disponível? */
postsRouter.get('/today', (req, res) => {
  const u = req.user!;
  const today = dayKey();
  const state = { streak: u.streak, lastPostDay: u.lastPostDay, restWeeks: (u.restWeeks as string[] | null) ?? [] };
  const available = u.lastPostDay !== today;
  const next = available ? nextStreak(state, today).streak : u.streak;
  const body: TodayStatus = {
    rewardAvailable: available,
    streak: currentStreak(state, today),
    nextReward: postReward(next),
  };
  res.json(body);
});

/** Feed (mais recentes primeiro, paginação por cursor). */
postsRouter.get('/', async (req, res) => {
  const { cursor, user } = z
    .object({ cursor: z.string().max(40).optional(), user: z.string().max(40).optional() })
    .parse(req.query);
  const take = 10;
  // feed = treinos do MEU grupo (sem grupo: só os meus)
  const me = req.user!;
  const audience = me.groupId ? { user: { groupId: me.groupId } } : { userId: me.id };
  const rows = await prisma.post.findMany({
    where: { createdAt: { gte: visibleSince() }, ...(user ? { userId: user } : audience) },
    include: postInclude(req.user!.id),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const page: FeedPage = {
    posts: rows.slice(0, take).map(toPostDTO),
    nextCursor: rows.length > take ? rows[take - 1].id : null,
  };
  res.json(page);
});

/** Abrir a câmera do app: devolve a "senha" que prova que a foto foi tirada agora. */
postsRouter.post('/capture-token', (req, res) => {
  res.json({ token: issueCaptureToken(req.user!.id) });
});

/** Novo post com foto (só foto tirada na hora, pela câmera do app). */
postsRouter.post('/', postLimiter, upload.single('photo'), async (req, res) => {
  if (!req.file) throw badRequest('Envie uma foto do treino.');
  const { caption, captureToken } = z
    .object({
      caption: z.string().trim().max(280, 'Legenda muito longa (máx. 280).').optional(),
      captureToken: z.string().max(400).optional(),
    })
    .parse(req.body);
  const why = consumeCaptureToken(captureToken, req.user!.id);
  if (why) {
    throw badRequest(
      why === 'expired' ? 'A foto demorou demais para ser enviada. Tire outra na hora.' : 'A foto precisa ser tirada na hora, pela câmera do app.',
      'CAMERA_ONLY',
    );
  }
  const source = 'camera';
  // foto antiga (da galeria): a data gravada pela câmera é de antes de agora
  if (await isOldPhoto(req.file.buffer)) {
    throw badRequest('Essa foto não foi tirada agora. Tire a foto do treino na hora, pela câmera.', 'OLD_PHOTO');
  }

  const img = await processUpload(req.file.buffer);
  if (await isDuplicate(img.hash)) {
    throw conflict('Essa foto já foi postada antes. Tire uma foto nova do seu treino!', 'DUPLICATE_PHOTO');
  }

  const id = randomUUID();
  const imagePath = await saveImage(id, img.data);
  const userId = req.user!.id;
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.post.create({
        data: {
          id, userId, imagePath, width: img.width, height: img.height,
          caption: caption || null, source, day: dayKey(),
        },
      });
      await tx.photoHash.create({ data: { hash: img.hash, userId, postId: id } });
      const reward = await grantPostReward(tx, userId, id);
      const post = await tx.post.findUniqueOrThrow({ where: { id }, include: postInclude(userId) });
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      return { post: toPostDTO(post), reward, user: toMe(user) };
    });
    res.status(201).json(result);
  } catch (e) {
    await deleteImage(imagePath).catch(() => {});
    throw e;
  }
});

/** Apagar o próprio post (a recompensa dele é removida). */
postsRouter.delete('/:id', async (req, res) => {
  const post = await prisma.post.findUnique({ where: { id: String(req.params.id) } });
  if (!post) throw notFound('Post não encontrado.');
  if (post.userId !== req.user!.id) throw forbidden();
  const user = await prisma.$transaction(async (tx) => {
    await reversePostReward(tx, post.userId, post.id, { resetStreak: false });
    await tx.post.delete({ where: { id: post.id } });
    return tx.user.findUniqueOrThrow({ where: { id: post.userId } });
  });
  await deleteImage(post.imagePath).catch(() => {});
  res.json({ ok: true, user: toMe(user) });
});

/** Um post (para abrir a partir de uma notificação). */
postsRouter.get('/:id', async (req, res) => {
  const post = await prisma.post.findUnique({ where: { id: String(req.params.id) }, include: postInclude(req.user!.id) });
  if (!post || post.createdAt < visibleSince()) throw notFound('Esse post não existe mais (fotos somem depois de 7 dias).');
  res.json({ post: toPostDTO(post) });
});

// ------------------------------------------------------------------ curtidas

async function visiblePost(id: string) {
  const post = await prisma.post.findUnique({ where: { id } });
  if (!post || post.createdAt < visibleSince()) throw notFound('Post não encontrado.');
  return post;
}

postsRouter.post('/:id/like', async (req, res) => {
  const post = await visiblePost(String(req.params.id));
  const userId = req.user!.id;
  const likeCount = await prisma.$transaction(async (tx) => {
    const created = await tx.like
      .create({ data: { userId, postId: post.id } })
      .then(() => true)
      .catch(() => false); // já curtido
    const p = created
      ? await tx.post.update({ where: { id: post.id }, data: { likeCount: { increment: 1 } } })
      : await tx.post.findUniqueOrThrow({ where: { id: post.id } });
    return p.likeCount;
  });
  void notify({ userId: post.userId, actorId: userId, type: 'LIKE', postId: post.id });
  res.json({ liked: true, likeCount });
});

postsRouter.delete('/:id/like', async (req, res) => {
  const post = await visiblePost(String(req.params.id));
  const userId = req.user!.id;
  const likeCount = await prisma.$transaction(async (tx) => {
    const { count } = await tx.like.deleteMany({ where: { userId, postId: post.id } });
    const p = count
      ? await tx.post.update({ where: { id: post.id }, data: { likeCount: { decrement: count } } })
      : await tx.post.findUniqueOrThrow({ where: { id: post.id } });
    return p.likeCount;
  });
  res.json({ liked: false, likeCount });
});

// ------------------------------------------------------------------ comentários

postsRouter.get('/:id/comments', async (req, res) => {
  const post = await visiblePost(String(req.params.id));
  const rows = await prisma.comment.findMany({
    where: { postId: post.id },
    include: { user: true },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  const comments: CommentDTO[] = rows.map((c) => ({
    id: c.id, author: toPublicUser(c.user), text: c.text, createdAt: c.createdAt.toISOString(), mine: c.userId === req.user!.id,
  }));
  res.json({ comments });
});

const commentLimiter = rateLimit({
  windowMs: 60_000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 10,
  keyGenerator: (req) => req.user!.id,
  message: { error: 'Calma! Espere um pouco antes de comentar de novo.', code: 'RATE_LIMIT' },
});

postsRouter.post('/:id/comments', commentLimiter, async (req, res) => {
  const post = await visiblePost(String(req.params.id));
  const { text } = z
    .object({ text: z.string().trim().min(1, 'Escreva algo.').max(500, 'Comentário muito longo (máx. 500).') })
    .parse(req.body);
  const [c] = await prisma.$transaction([
    prisma.comment.create({ data: { postId: post.id, userId: req.user!.id, text }, include: { user: true } }),
    prisma.post.update({ where: { id: post.id }, data: { commentCount: { increment: 1 } } }),
  ]);
  const dto: CommentDTO = { id: c.id, author: toPublicUser(c.user), text: c.text, createdAt: c.createdAt.toISOString(), mine: true };
  void notify({ userId: post.userId, actorId: req.user!.id, type: 'COMMENT', postId: post.id, text });
  res.status(201).json({ comment: dto });
});

postsRouter.delete('/:postId/comments/:id', async (req, res) => {
  const c = await prisma.comment.findUnique({ where: { id: String(req.params.id) } });
  if (!c || c.postId !== req.params.postId) throw notFound('Comentário não encontrado.');
  if (c.userId !== req.user!.id && !isAdmin(req.user!)) throw forbidden();
  await prisma.$transaction([
    prisma.comment.delete({ where: { id: c.id } }),
    prisma.post.update({ where: { id: c.postId }, data: { commentCount: { decrement: 1 } } }),
  ]);
  res.json({ ok: true });
});

// ------------------------------------------------------------------ denúncia

postsRouter.post('/:id/report', async (req, res) => {
  const post = await visiblePost(String(req.params.id));
  if (post.userId === req.user!.id) throw badRequest('Você não pode denunciar seu próprio post.');
  const reasons = REPORT_REASONS.map((r) => r.id) as [string, ...string[]];
  const { reason, details } = z
    .object({ reason: z.enum(reasons), details: z.string().trim().max(300).optional() })
    .parse(req.body);
  await prisma.report.upsert({
    where: { postId_reporterId: { postId: post.id, reporterId: req.user!.id } },
    create: { postId: post.id, reporterId: req.user!.id, reason, details: details || null },
    // denúncia já analisada (descartada) não reabre só porque a mesma pessoa denunciou de novo
    update: { reason, details: details || null },
  });
  res.status(201).json({ ok: true });
});
