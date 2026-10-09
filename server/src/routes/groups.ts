import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import type { GroupInviteDTO } from '@gymbattle/shared';
import { BALANCE } from '@gymbattle/shared';
import { prisma } from '../db.js';
import { requireAuth } from '../lib/auth.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/http.js';
import { notify } from '../lib/notify.js';
import { lockUsers } from '../lib/rewards.js';
import { toMe, toPublicUser } from '../lib/serialize.js';
import {
  assertCanManage, isGroupAdmin, joinGroupTx, leaveGroupTx, membersOf, memberCount, newInviteCode, toGroupDTO,
} from '../lib/groups.js';

export const groupsRouter = Router();
const G = BALANCE.groups;

const nameSchema = z
  .string({ error: 'Dê um nome ao grupo.' })
  .trim()
  .min(G.nameMin, `O nome precisa ter pelo menos ${G.nameMin} letras.`)
  .max(G.nameMax, `O nome pode ter no máximo ${G.nameMax} letras.`);
const confirmSchema = z.object({ confirmLeave: z.boolean().optional().default(false) });

const groupLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: process.env.NODE_ENV === 'test' ? 10_000 : 60,
  keyGenerator: (req) => req.user!.id, // só em rotas com login
  message: { error: 'Muitas ações de grupo nesta hora. Tente mais tarde.', code: 'RATE_LIMIT' },
});

/** Prévia de um link de convite (funciona mesmo sem login, para mostrar o nome do grupo). */
groupsRouter.get('/invite/:code', async (req, res) => {
  const g = await prisma.group.findUnique({ where: { inviteCode: String(req.params.code) } });
  if (!g) throw notFound('Esse convite não vale mais. Peça um link novo para um admin do grupo.');
  res.json({ group: toGroupDTO(g, await memberCount(g.id)), myGroupId: req.user?.groupId ?? null });
});

groupsRouter.use(requireAuth);

async function myInvites(userId: string): Promise<GroupInviteDTO[]> {
  const rows = await prisma.groupInvite.findMany({
    where: { userId, status: 'PENDING' },
    include: { group: true, invitedBy: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  const counts = await Promise.all(rows.map((r) => memberCount(r.groupId)));
  return rows.map((r, i) => ({
    id: r.id,
    group: { id: r.group.id, name: r.group.name, memberCount: counts[i] },
    invitedBy: r.invitedBy ? toPublicUser(r.invitedBy) : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Meu grupo (membros, cargo, convites recebidos). */
groupsRouter.get('/mine', async (req, res) => {
  const me = req.user!;
  const invites = await myInvites(me.id);
  if (!me.groupId) return void res.json({ group: null, members: [], myRole: null, invites, inviteCode: null, pendingInvites: [] });
  const g = await prisma.group.findUnique({ where: { id: me.groupId } });
  if (!g) return void res.json({ group: null, members: [], myRole: null, invites, inviteCode: null, pendingInvites: [] });
  const members = await membersOf(g.id);
  const admin = isGroupAdmin(me);
  const pending = admin
    ? await prisma.groupInvite.findMany({ where: { groupId: g.id, status: 'PENDING' }, include: { user: true }, orderBy: { createdAt: 'desc' }, take: 50 })
    : [];
  res.json({
    group: toGroupDTO(g, members.length),
    members,
    myRole: me.groupRole,
    invites,
    inviteCode: admin ? g.inviteCode : null,
    pendingInvites: pending.map((p) => ({ id: p.id, user: toPublicUser(p.user), createdAt: p.createdAt.toISOString() })),
  });
});

/** Criar grupo (quem cria vira o dono). */
groupsRouter.post('/', groupLimiter, async (req, res) => {
  const { name, confirmLeave } = confirmSchema.extend({ name: nameSchema }).parse(req.body);
  const group = await prisma.$transaction(async (tx) => {
    const g = await tx.group.create({ data: { name, inviteCode: newInviteCode() } });
    await joinGroupTx(tx, req.user!.id, g.id, confirmLeave, 'OWNER');
    return g;
  });
  const me = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  res.status(201).json({ group: toGroupDTO(group, 1), user: toMe(me) });
});

/** Renomear (criador e admins do grupo). */
groupsRouter.patch('/mine', async (req, res) => {
  const me = req.user!;
  if (!isGroupAdmin(me)) throw forbidden('Só os admins do grupo podem mudar o nome.');
  const { name } = z.object({ name: nameSchema }).parse(req.body);
  const g = await prisma.group.update({ where: { id: me.groupId! }, data: { name } });
  res.json({ group: toGroupDTO(g, await memberCount(g.id)) });
});

/** Sair do grupo. */
groupsRouter.post('/mine/leave', async (req, res) => {
  await prisma.$transaction(async (tx) => {
    const me = (await lockUsers(tx, [req.user!.id])).get(req.user!.id)!;
    if (!me.groupId) throw badRequest('Você não está em nenhum grupo.');
    await leaveGroupTx(tx, me);
  });
  const me = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  res.json({ ok: true, user: toMe(me) });
});

// ------------------------------------------------------------------ convites

/** Procurar gente para convidar (admins do grupo). */
groupsRouter.get('/mine/search', async (req, res) => {
  const me = req.user!;
  if (!isGroupAdmin(me)) throw forbidden('Só os admins do grupo podem convidar.');
  const { q } = z.object({ q: z.string().trim().min(1).max(32) }).parse(req.query);
  const users = await prisma.user.findMany({
    where: { username: { contains: q }, OR: [{ groupId: null }, { groupId: { not: me.groupId! } }] },
    orderBy: { username: 'asc' },
    take: 15,
  });
  res.json({ users: users.map((u) => ({ ...toPublicUser(u), hasGroup: !!u.groupId })) });
});

/** Convidar alguém pelo nome de usuário. */
groupsRouter.post('/mine/invites', groupLimiter, async (req, res) => {
  const me = req.user!;
  if (!isGroupAdmin(me)) throw forbidden('Só os admins do grupo podem convidar.');
  const { username } = z.object({ username: z.string().trim().min(1).max(32) }).parse(req.body);
  const target = await prisma.user.findUnique({ where: { username } });
  if (!target) throw notFound('Jogador não encontrado.');
  if (target.groupId === me.groupId) throw conflict(`${target.username} já está no grupo.`, 'ALREADY_MEMBER');
  const dup = await prisma.groupInvite.findFirst({ where: { groupId: me.groupId!, userId: target.id, status: 'PENDING' } });
  if (dup) throw conflict(`${target.username} já tem um convite pendente.`, 'ALREADY_INVITED');
  const group = await prisma.group.findUniqueOrThrow({ where: { id: me.groupId! } });
  const inv = await prisma.groupInvite.create({ data: { groupId: group.id, userId: target.id, invitedById: me.id } });
  void notify({ userId: target.id, actorId: me.id, type: 'GROUP_INVITE', groupId: group.id, text: group.name });
  res.status(201).json({ invite: { id: inv.id, user: toPublicUser(target), createdAt: inv.createdAt.toISOString() } });
});

/** Cancelar um convite enviado (admins). */
groupsRouter.delete('/mine/invites/:id', async (req, res) => {
  const me = req.user!;
  if (!isGroupAdmin(me)) throw forbidden('Só os admins do grupo podem fazer isso.');
  const r = await prisma.groupInvite.updateMany({
    where: { id: String(req.params.id), groupId: me.groupId!, status: 'PENDING' },
    data: { status: 'CANCELLED', resolvedAt: new Date() },
  });
  if (!r.count) throw notFound('Convite não encontrado.');
  res.json({ ok: true });
});

/** Link de convite: pega o atual (cria se não existir). */
groupsRouter.post('/mine/invite-link', async (req, res) => {
  const me = req.user!;
  if (!isGroupAdmin(me)) throw forbidden('Só os admins do grupo podem criar convites.');
  const { reset } = z.object({ reset: z.boolean().optional() }).parse(req.body ?? {});
  let g = await prisma.group.findUniqueOrThrow({ where: { id: me.groupId! } });
  if (!g.inviteCode || reset) g = await prisma.group.update({ where: { id: g.id }, data: { inviteCode: newInviteCode() } });
  res.json({ code: g.inviteCode });
});

/** Aceitar um convite recebido. */
groupsRouter.post('/invites/:id/accept', groupLimiter, async (req, res) => {
  const { confirmLeave } = confirmSchema.parse(req.body ?? {});
  const inv = await prisma.groupInvite.findUnique({ where: { id: String(req.params.id) } });
  if (!inv || inv.userId !== req.user!.id) throw notFound('Convite não encontrado.');
  if (inv.status !== 'PENDING') throw conflict('Esse convite não vale mais.', 'INVITE_GONE');
  await prisma.$transaction(async (tx) => {
    await joinGroupTx(tx, req.user!.id, inv.groupId, confirmLeave);
    await tx.groupInvite.update({ where: { id: inv.id }, data: { status: 'ACCEPTED', resolvedAt: new Date() } });
  });
  if (inv.invitedById) {
    void notify({ userId: inv.invitedById, actorId: req.user!.id, type: 'GROUP', groupId: inv.groupId, text: `${req.user!.username} entrou no grupo pelo seu convite` });
  }
  const me = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  res.json({ ok: true, user: toMe(me) });
});

groupsRouter.post('/invites/:id/decline', async (req, res) => {
  const r = await prisma.groupInvite.updateMany({
    where: { id: String(req.params.id), userId: req.user!.id, status: 'PENDING' },
    data: { status: 'DECLINED', resolvedAt: new Date() },
  });
  if (!r.count) throw notFound('Convite não encontrado.');
  res.json({ ok: true });
});

/** Entrar pelo link de convite. */
groupsRouter.post('/join', groupLimiter, async (req, res) => {
  const { code, confirmLeave } = confirmSchema.extend({ code: z.string().trim().min(4).max(16) }).parse(req.body);
  const g = await prisma.group.findUnique({ where: { inviteCode: code } });
  if (!g) throw notFound('Esse convite não vale mais. Peça um link novo para um admin do grupo.');
  const r = await prisma.$transaction((tx) => joinGroupTx(tx, req.user!.id, g.id, confirmLeave));
  const me = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  res.json({ ok: true, alreadyMember: !r.joined, group: toGroupDTO(g, await memberCount(g.id)), user: toMe(me) });
});

// ------------------------------------------------------------------ membros

async function targetInMyGroup(actorId: string, targetId: string) {
  const users = await prisma.user.findMany({ where: { id: { in: [actorId, targetId] } } });
  const actor = users.find((u) => u.id === actorId);
  const target = users.find((u) => u.id === targetId);
  if (!actor || !target) throw notFound('Jogador não encontrado.');
  return { actor, target };
}

/** Mudar cargo: ADMIN (admins do grupo promovem) ou MEMBER (só o criador rebaixa). */
groupsRouter.post('/mine/members/:userId/role', async (req, res) => {
  const { role } = z.object({ role: z.enum(['ADMIN', 'MEMBER']) }).parse(req.body);
  const { actor, target } = await targetInMyGroup(req.user!.id, String(req.params.userId));
  assertCanManage(actor, target, role === 'ADMIN' ? 'promote' : 'demote');
  await prisma.user.updateMany({ where: { id: target.id, groupId: actor.groupId }, data: { groupRole: role } });
  if (role === 'ADMIN') {
    void notify({ userId: target.id, actorId: actor.id, type: 'GROUP', groupId: actor.groupId, text: `${actor.username} te colocou como admin do grupo` });
  }
  res.json({ ok: true, members: await membersOf(actor.groupId!) });
});

/** Remover alguém do grupo. */
groupsRouter.delete('/mine/members/:userId', async (req, res) => {
  const { actor, target } = await targetInMyGroup(req.user!.id, String(req.params.userId));
  assertCanManage(actor, target, 'remove');
  const group = await prisma.group.findUniqueOrThrow({ where: { id: actor.groupId! } });
  await prisma.$transaction(async (tx) => {
    const t = (await lockUsers(tx, [target.id])).get(target.id)!;
    if (t.groupId !== actor.groupId) return;
    await leaveGroupTx(tx, t);
  });
  void notify({ userId: target.id, actorId: actor.id, type: 'GROUP', text: `Você foi removido do grupo “${group.name}”` });
  res.json({ ok: true, members: await membersOf(group.id) });
});
