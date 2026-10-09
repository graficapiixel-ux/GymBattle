import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../lib/auth.js';
import { notifText, notifUrl, vapidPublicKey, type NotifType } from '../lib/notify.js';
import { toPublicUser } from '../lib/serialize.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get('/unread', async (req, res) => {
  const count = await prisma.notification.count({ where: { userId: req.user!.id, readAt: null } });
  res.json({ count });
});

notificationsRouter.get('/', async (req, res) => {
  const { cursor } = z.object({ cursor: z.string().max(40).optional() }).parse(req.query);
  const take = 30;
  const rows = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    include: { actor: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const postIds = rows.map((r) => r.postId).filter(Boolean) as string[];
  const posts = await prisma.post.findMany({ where: { id: { in: postIds } }, select: { id: true, imagePath: true } });
  const thumb = new Map(posts.map((p) => [p.id, `/uploads/${p.imagePath}`]));
  res.json({
    notifications: rows.slice(0, take).map((n) => ({
      id: n.id,
      type: n.type,
      actor: n.actor ? toPublicUser(n.actor) : null,
      text: notifText(n.type as NotifType, n.actor?.username ?? null, n.text),
      url: notifUrl(n),
      thumb: n.postId ? thumb.get(n.postId) ?? null : null,
      read: !!n.readAt,
      createdAt: n.createdAt.toISOString(),
    })),
    nextCursor: rows.length > take ? rows[take - 1].id : null,
  });
});

notificationsRouter.post('/read-all', async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user!.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ ok: true });
});

// ------------------------------------------------------------------ push no celular
notificationsRouter.get('/push/key', async (_req, res) => {
  res.json({ publicKey: await vapidPublicKey() });
});

/** Só servidores de push de verdade (Google, Mozilla, Apple, Microsoft): evita usar o servidor para chamar URLs quaisquer. */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /\.notify\.windows\.com$/, /^android\.googleapis\.com$/];
const MAX_SUBS = 5;

notificationsRouter.post('/push/subscribe', async (req, res) => {
  const sub = z
    .object({
      endpoint: z
        .string()
        .url()
        .max(500)
        .refine((u) => {
          const x = new URL(u);
          return x.protocol === 'https:' && !x.port && PUSH_HOSTS.some((r) => r.test(x.hostname));
        }, 'Endereço de notificação inválido.'),
      keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
    })
    .parse(req.body);
  const me = req.user!.id;
  const existing = await prisma.pushSubscription.findUnique({ where: { endpoint: sub.endpoint } });
  if (existing && existing.userId !== me) {
    // o mesmo aparelho trocou de conta: a inscrição antiga sai
    await prisma.pushSubscription.delete({ where: { id: existing.id } });
  }
  // no máximo 5 aparelhos por conta (remove os mais antigos)
  const mine = await prisma.pushSubscription.findMany({ where: { userId: me, endpoint: { not: sub.endpoint } }, orderBy: { createdAt: 'desc' }, select: { id: true } });
  if (mine.length >= MAX_SUBS) await prisma.pushSubscription.deleteMany({ where: { id: { in: mine.slice(MAX_SUBS - 1).map((m) => m.id) } } });
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { userId: me, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    update: { userId: me, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
  res.status(201).json({ ok: true });
});

notificationsRouter.post('/push/unsubscribe', async (req, res) => {
  const { endpoint } = z.object({ endpoint: z.string().max(500) }).parse(req.body);
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.user!.id } });
  res.json({ ok: true });
});
