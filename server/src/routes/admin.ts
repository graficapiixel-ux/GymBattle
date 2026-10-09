import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { isAdmin, requireAdmin } from '../lib/auth.js';
import { badRequest, notFound } from '../lib/http.js';
import { toAdminRow, toPublicUser } from '../lib/serialize.js';
import { leaveGroupTx, membersOf, toGroupDTO } from '../lib/groups.js';
import { clearAllShields, isShieldsEnabled, isSignupEnabled, setSetting } from '../lib/settings.js';
import { createUser } from '../lib/users.js';
import { registerSchema, cpfSchema } from '../lib/validation.js';
import { ARMOR_SLOT_LABEL, WEAPONS_BY_ID, applyXp, parseArmorPieceId, xpToNext, type AdminReportDTO, type AdminUserDetail } from '@gymbattle/shared';
import { equipmentOf } from '../lib/serialize.js';
import { lockUser } from '../lib/rewards.js';
import { deleteImage } from '../lib/images.js';
import { postInclude, toPostDTO, visibleSince } from '../lib/posts.js';
import { reversePostReward } from '../lib/rewards.js';
import { currentSeason, finalizeSeason } from '../lib/ranking.js';
import { notify } from '../lib/notify.js';
import { grantGift, toGiftDTO } from '../lib/gifts.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

async function log(actorId: string, action: string, targetId: string | null, details?: object) {
  await prisma.moderationLog.create({
    data: { actorId, action, targetId, details: (details ?? undefined) as Prisma.InputJsonValue | undefined },
  });
}

adminRouter.get('/settings', async (_req, res) => {
  res.json({ signupEnabled: await isSignupEnabled(), shieldsEnabled: await isShieldsEnabled() });
});

adminRouter.put('/settings', async (req, res) => {
  const body = z.object({ signupEnabled: z.boolean().optional(), shieldsEnabled: z.boolean().optional() }).parse(req.body);
  if (body.signupEnabled !== undefined) {
    await setSetting('signupEnabled', String(body.signupEnabled));
    await log(req.user!.id, 'TOGGLE_SIGNUP', null, { signupEnabled: body.signupEnabled });
  }
  if (body.shieldsEnabled !== undefined) {
    await setSetting('shieldsEnabled', String(body.shieldsEnabled));
    // desligar tira o escudo de todo mundo na hora
    const cleared = body.shieldsEnabled ? 0 : await clearAllShields();
    await log(req.user!.id, 'TOGGLE_SHIELDS', null, { shieldsEnabled: body.shieldsEnabled, cleared });
  }
  res.json({ signupEnabled: await isSignupEnabled(), shieldsEnabled: await isShieldsEnabled() });
});

adminRouter.get('/users', async (req, res) => {
  const { q, page } = z
    .object({ q: z.string().trim().max(100).optional(), page: z.coerce.number().int().min(1).default(1) })
    .parse(req.query);
  const pageSize = 25;
  const where: Prisma.UserWhereInput = q
    ? { OR: [{ email: { contains: q } }, { username: { contains: q } }] }
    : {};
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  res.json({ total, page, pageSize, users: users.map(toAdminRow) });
});

adminRouter.post('/users', async (req, res) => {
  // pelo admin do site o CPF é opcional
  const data = registerSchema.extend({ cpf: cpfSchema.optional() }).parse(req.body);
  const user = await createUser(data);
  await log(req.user!.id, 'CREATE_USER', user.id, { email: user.email, username: user.username });
  res.status(201).json({ user: toAdminRow(user) });
});

// ------------------------------------------------------------ gerenciar um jogador

function itemName(itemId: string): { name: string; kind: 'weapon' | 'armor' } | null {
  const w = WEAPONS_BY_ID[itemId];
  if (w) return { name: w.name, kind: 'weapon' };
  const a = parseArmorPieceId(itemId);
  if (a) return { name: `${a.set.name} · ${ARMOR_SLOT_LABEL[a.slot]}`, kind: 'armor' };
  return null;
}

async function userDetail(id: string): Promise<AdminUserDetail> {
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u) throw notFound('Conta não encontrada.');
  const inv = await prisma.inventoryItem.findMany({ where: { userId: id }, orderBy: { acquiredAt: 'desc' } });
  const eq = equipmentOf(u);
  const equipped = new Set(Object.values(eq).filter(Boolean) as string[]);
  const items: AdminUserDetail['items'] = inv
    .map((i) => ({ itemId: i.itemId, ...itemName(i.itemId)!, equipped: equipped.has(i.itemId) }))
    .filter((i) => i.name);
  if (u.starterWeapon && !items.some((i) => i.itemId === u.starterWeapon) && WEAPONS_BY_ID[u.starterWeapon]) {
    items.push({ itemId: u.starterWeapon, name: WEAPONS_BY_ID[u.starterWeapon].name, kind: 'weapon', equipped: equipped.has(u.starterWeapon), starter: true });
  }
  return {
    id: u.id, username: u.username, email: u.email, level: u.level, xp: u.xp, xpToNext: xpToNext(u.level),
    gold: u.gold, attrPoints: u.attrPoints, legendNext: u.legendNext, items,
    photoUrl: u.photoPath ? `/uploads/${u.photoPath}` : null, hasCpf: !!u.cpfHash,
  };
}

adminRouter.get('/users/:id', async (req, res) => {
  res.json({ user: await userDetail(String(req.params.id)) });
});

const reasonSchema = z.string().trim().max(200, 'Motivo muito longo (máx. 200).').optional().nullable();
const amountSchema = z.object({
  amount: z.number().int().min(-10_000_000).max(10_000_000).refine((n) => n !== 0, 'Informe um valor.'),
  /** com motivo, o jogador vê o aviso grande na tela */
  reason: reasonSchema,
});

/** Dar (positivo) ou tirar (negativo) XP. O nível nunca diminui: tirar XP pode deixar o XP negativo. */
adminRouter.post('/users/:id/xp', async (req, res) => {
  const id = String(req.params.id);
  const { amount, reason } = amountSchema.parse(req.body);
  const gift = await prisma.$transaction((tx) => grantGift(tx, { userId: id, kind: 'XP', amount, reason, byId: req.user!.id }));
  await log(req.user!.id, 'ADMIN_XP', id, { amount, reason: gift.reason });
  res.json({ user: await userDetail(id) });
});

/** Dar ou tirar ouro (tirar não deixa abaixo de zero). */
adminRouter.post('/users/:id/gold', async (req, res) => {
  const id = String(req.params.id);
  const { amount, reason } = amountSchema.parse(req.body);
  const gift = await prisma.$transaction((tx) => grantGift(tx, { userId: id, kind: 'GOLD', amount, reason, byId: req.user!.id }));
  await log(req.user!.id, 'ADMIN_GOLD', id, { amount, reason: gift.reason });
  res.json({ user: await userDetail(id) });
});

/** Dar um item (arma ou peça de armadura). */
adminRouter.post('/users/:id/items', async (req, res) => {
  const id = String(req.params.id);
  const { itemId, reason } = z.object({ itemId: z.string().max(96), reason: reasonSchema }).parse(req.body);
  const info = itemName(itemId);
  if (!info) throw notFound('Item não encontrado.');
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u) throw notFound('Conta não encontrada.');
  const gift = await prisma.$transaction((tx) => grantGift(tx, { userId: id, kind: 'ITEM', itemId, reason, byId: req.user!.id }));
  await log(req.user!.id, 'ADMIN_GIVE_ITEM', id, { itemId, name: info.name, reason: gift.reason });
  res.json({ user: await userDetail(id) });
});

/** Remover a foto de perfil de alguém (foto imprópria). */
adminRouter.delete('/users/:id/photo', async (req, res) => {
  const id = String(req.params.id);
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u) throw notFound('Conta não encontrada.');
  if (u.photoPath) {
    await prisma.user.update({ where: { id }, data: { photoPath: null } });
    await deleteImage(u.photoPath).catch(() => {});
    await log(req.user!.id, 'REMOVE_PHOTO', id, { username: u.username });
  }
  res.json({ user: await userDetail(id) });
});

/** Log de presentes (quem recebeu, o quê, motivo, data). */
adminRouter.get('/gifts', async (_req, res) => {
  const rows = await prisma.gift.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { user: { select: { username: true } } } });
  res.json({
    gifts: rows.map((g) => ({ ...toGiftDTO(g), username: g.user.username, popup: g.popup, seenAt: g.seenAt?.toISOString() ?? null })),
  });
});

/** Tirar um item. Se estava equipado, é desequipado (a arma volta para a inicial). */
adminRouter.delete('/users/:id/items/:itemId', async (req, res) => {
  const id = String(req.params.id);
  const itemId = String(req.params.itemId);
  const info = itemName(itemId);
  await prisma.$transaction(async (tx) => {
    const u = await lockUser(tx, id);
    await tx.inventoryItem.deleteMany({ where: { userId: id, itemId } });
    const eq = equipmentOf(u);
    let starter = u.starterWeapon;
    if (starter === itemId) starter = null;
    let changed = false;
    for (const slot of ['weapon', 'helm', 'chest', 'gloves', 'legs'] as const) {
      if (eq[slot] === itemId) {
        eq[slot] = null;
        changed = true;
      }
    }
    if (changed && !eq.weapon) {
      // precisa de uma arma: a inicial, ou qualquer outra que tenha
      const other = await tx.inventoryItem.findFirst({ where: { userId: id, itemId: { in: Object.keys(WEAPONS_BY_ID) } }, orderBy: { acquiredAt: 'desc' } });
      eq.weapon = starter ?? other?.itemId ?? null;
    }
    await tx.user.update({ where: { id }, data: { starterWeapon: starter, ...(changed ? { equipment: eq as unknown as Prisma.InputJsonValue } : {}) } });
  });
  await log(req.user!.id, 'ADMIN_TAKE_ITEM', id, { itemId, name: info?.name ?? itemId });
  res.json({ user: await userDetail(id) });
});

/** Evento lendário na próxima luta desse jogador (uma vez só; desliga sozinho). */
adminRouter.put('/users/:id/legend', async (req, res) => {
  const id = String(req.params.id);
  const { on } = z.object({ on: z.boolean() }).parse(req.body);
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u) throw notFound('Conta não encontrada.');
  await prisma.user.update({ where: { id }, data: { legendNext: on } });
  await log(req.user!.id, on ? 'ADMIN_LEGEND_ON' : 'ADMIN_LEGEND_OFF', id);
  res.json({ user: await userDetail(id) });
});

adminRouter.delete('/users/:id', async (req, res) => {
  const id = String(req.params.id);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw notFound('Conta não encontrada.');
  if (isAdmin(user) || user.id === req.user!.id) throw badRequest('A conta de administrador não pode ser excluída.');
  await log(req.user!.id, 'DELETE_USER', null, { email: user.email, username: user.username, userId: user.id });
  await prisma.$transaction(async (tx) => {
    // sai do grupo antes (passa o cargo de criador adiante / apaga grupo vazio)
    await leaveGroupTx(tx, user);
    await tx.user.delete({ where: { id } });
  });
  res.json({ ok: true });
});

adminRouter.get('/logs', async (_req, res) => {
  const logs = await prisma.moderationLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { actor: { select: { username: true } }, target: { select: { username: true } } },
  });
  res.json({
    logs: logs.map((l) => ({
      id: l.id, action: l.action, details: l.details, createdAt: l.createdAt.toISOString(),
      actor: l.actor?.username ?? null, target: l.target?.username ?? null,
    })),
  });
});

// ------------------------------------------------------------------ denúncias e fotos fake

adminRouter.get('/reports', async (req, res) => {
  const open = await prisma.report.findMany({
    where: { status: 'OPEN' },
    include: { reporter: { select: { username: true } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  const byPost = new Map<string, typeof open>();
  for (const r of open) byPost.set(r.postId, [...(byPost.get(r.postId) ?? []), r]);
  const posts = await prisma.post.findMany({
    where: { id: { in: [...byPost.keys()] } },
    include: postInclude(req.user!.id),
  });
  const reports: AdminReportDTO[] = posts
    .map((p) => {
      const rs = byPost.get(p.id)!;
      return {
        post: toPostDTO(p),
        count: rs.length,
        reasons: rs.map((r) => ({
          reason: r.reason, details: r.details, reporter: r.reporter.username, createdAt: r.createdAt.toISOString(),
        })),
      };
    })
    .sort((a, b) => b.count - a.count);
  res.json({ reports });
});

/** Descartar denúncias de um post (a foto é legítima). */
adminRouter.post('/reports/:postId/dismiss', async (req, res) => {
  const postId = String(req.params.postId);
  const { count } = await prisma.report.updateMany({ where: { postId, status: 'OPEN' }, data: { status: 'DISMISSED' } });
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { userId: true } });
  await log(req.user!.id, 'DISMISS_REPORTS', post?.userId ?? null, { postId, count });
  res.json({ ok: true, count });
});

/**
 * Marcar foto como FAKE: apaga a foto, remove o XP e o ouro que ela gerou
 * (saldo pode ficar negativo), zera a streak e registra no log.
 */
adminRouter.post('/posts/:id/fake', async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().max(200).optional() }).parse(req.body ?? {});
  const post = await prisma.post.findUnique({ where: { id: String(req.params.id) }, include: { user: true } });
  if (!post) throw notFound('Post não encontrado.');
  const removed = await prisma.$transaction(async (tx) => {
    const r = await reversePostReward(tx, post.userId, post.id, { resetStreak: true });
    await tx.post.delete({ where: { id: post.id } });
    return r;
  });
  await deleteImage(post.imagePath).catch(() => {});
  void notify({
    userId: post.userId, type: 'FAKE',
    text: `Nossa verificação automática identificou uma foto sua como inválida (repetida, editada ou fora do treino) e ela foi removida: −${removed.xp} XP, −${removed.gold} de ouro e streak zerada.`,
  });
  // avisa TODO o grupo (menos a própria pessoa, que já recebeu o aviso dela)
  if (post.user.groupId) {
    // valores REAIS que a pessoa perdeu (tudo que aquele post rendeu)
    const lost = [removed.gold ? `−${removed.gold} de ouro` : '', removed.xp ? `−${removed.xp} XP` : '', 'a streak'].filter(Boolean);
    const text = `teve uma foto falsa apagada pelo sistema e perdeu ${lost.length > 1 ? `${lost.slice(0, -1).join(', ')} e ${lost.at(-1)}` : lost[0]}.`;
    const members = await prisma.user.findMany({ where: { groupId: post.user.groupId, id: { not: post.userId } }, select: { id: true } });
    void (async () => {
      for (const m of members) await notify({ userId: m.id, actorId: post.userId, type: 'FAKE_GROUP', text });
    })();
  }
  await log(req.user!.id, 'MARK_FAKE', post.userId, {
    postId: post.id, username: post.user.username, xpRemoved: removed.xp, goldRemoved: removed.gold, reason: reason ?? null,
  });
  res.json({ ok: true, xpRemoved: removed.xp, goldRemoved: removed.gold });
});

// ------------------------------------------------------------------ temporadas

adminRouter.get('/seasons', async (_req, res) => {
  const current = await currentSeason();
  const past = await prisma.season.findMany({ where: { status: 'ENDED' }, orderBy: { number: 'desc' }, take: 24 });
  const fmt = (s: typeof current) => ({ id: s.id, number: s.number, name: s.name, startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString(), status: s.status, results: s.results });
  res.json({ current: fmt(current), past: past.map(fmt) });
});

adminRouter.put('/seasons/current', async (req, res) => {
  const { name, endsAt } = z
    .object({ name: z.string().trim().min(3).max(64).optional(), endsAt: z.coerce.date().optional() })
    .parse(req.body);
  const s = await currentSeason();
  if (endsAt && endsAt.getTime() < Date.now() - 60_000) throw badRequest('A data de término precisa ser no futuro.');
  const updated = await prisma.season.update({ where: { id: s.id }, data: { ...(name ? { name } : {}), ...(endsAt ? { endsAt } : {}) } });
  await log(req.user!.id, 'UPDATE_SEASON', null, { season: updated.number, name: updated.name, endsAt: updated.endsAt.toISOString() });
  res.json({ ok: true });
});

adminRouter.post('/seasons/current/end', async (req, res) => {
  const s = await currentSeason();
  const ended = await finalizeSeason(s.id);
  await log(req.user!.id, 'END_SEASON', null, { season: ended.number });
  res.json({ ok: true, results: ended.results });
});

// ------------------------------------------------------------ grupos (só o admin do site)

/** Todos os grupos criados. */
adminRouter.get('/groups', async (req, res) => {
  const { q } = z.object({ q: z.string().trim().max(40).optional() }).parse(req.query);
  const groups = await prisma.group.findMany({
    where: q ? { name: { contains: q } } : {},
    include: { _count: { select: { members: true } }, members: { where: { groupRole: 'OWNER' }, take: 1 } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const noGroup = await prisma.user.count({ where: { groupId: null } });
  res.json({
    noGroup,
    groups: groups.map((g) => ({
      ...toGroupDTO(g, g._count.members),
      owner: g.members[0] ? toPublicUser(g.members[0]) : null,
    })),
  });
});

/** Espiar um grupo: membros, convites, treinos e lutas recentes. */
adminRouter.get('/groups/:id', async (req, res) => {
  const g = await prisma.group.findUnique({ where: { id: String(req.params.id) } });
  if (!g) throw notFound('Grupo não encontrado.');
  const [members, invites, posts, battles] = await Promise.all([
    membersOf(g.id),
    prisma.groupInvite.findMany({ where: { groupId: g.id, status: 'PENDING' }, include: { user: true, invitedBy: true }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.post.findMany({
      where: { user: { groupId: g.id }, createdAt: { gte: visibleSince() } },
      include: postInclude(req.user!.id), orderBy: { createdAt: 'desc' }, take: 30,
    }),
    prisma.battle.findMany({
      where: { a: { groupId: g.id }, b: { groupId: g.id } },
      orderBy: { createdAt: 'desc' }, take: 20, omit: { replay: true },
    }),
  ]);
  res.json({
    group: { ...toGroupDTO(g, members.length), inviteCode: g.inviteCode },
    members,
    invites: invites.map((i) => ({ id: i.id, user: toPublicUser(i.user), invitedBy: i.invitedBy ? toPublicUser(i.invitedBy) : null, createdAt: i.createdAt.toISOString() })),
    posts: posts.map(toPostDTO),
    battles: battles.map((b) => ({
      id: b.id, aName: b.aName, bName: b.bName, winner: b.winner, createdAt: b.createdAt.toISOString(),
    })),
  });
});

/** Admin do site muda o cargo de alguém num grupo (ex.: corrigir quem é admin do grupo). */
adminRouter.post('/groups/:id/members/:userId/role', async (req, res) => {
  const { role } = z.object({ role: z.enum(['ADMIN', 'MEMBER']) }).parse(req.body);
  const r = await prisma.user.updateMany({
    where: { id: String(req.params.userId), groupId: String(req.params.id), groupRole: { not: 'OWNER' } },
    data: { groupRole: role },
  });
  if (!r.count) throw badRequest('Não foi possível mudar o cargo (a pessoa não está no grupo ou é a criadora).');
  await log(req.user!.id, 'GROUP_ROLE', String(req.params.userId), { groupId: req.params.id, role });
  res.json({ ok: true, members: await membersOf(String(req.params.id)) });
});
