/**
 * Grupos: cada pessoa participa de NO MÁXIMO 1 grupo. Ranking, desafios e
 * temporada valem só entre os membros do mesmo grupo.
 *
 * Cargos no grupo (não têm NADA a ver com o admin do site):
 *  - OWNER  criador: tudo que o ADMIN faz + rebaixar admins, remover admins.
 *  - ADMIN  convida (por nome ou link), remove membros comuns, promove membros a admin, muda o nome do grupo.
 *  - MEMBER participa.
 */
import { randomBytes } from 'node:crypto';
import type { Group, Prisma, User } from '@prisma/client';
import { BALANCE, type GroupDTO, type GroupMemberDTO, type GroupRole } from '@gymbattle/shared';
import { prisma } from '../db.js';
import { conflict, forbidden } from './http.js';
import { lockUsers } from './rewards.js';
import { toPublicUser } from './serialize.js';

type Tx = Prisma.TransactionClient;
const G = BALANCE.groups;

export const isGroupAdmin = (u: Pick<User, 'groupId' | 'groupRole'>) => !!u.groupId && (u.groupRole === 'ADMIN' || u.groupRole === 'OWNER');

export function memberCount(groupId: string, db: Tx | typeof prisma = prisma) {
  return db.user.count({ where: { groupId } });
}

export function toGroupDTO(g: Group, count: number): GroupDTO {
  return {
    id: g.id, name: g.name, memberCount: count, createdAt: g.createdAt.toISOString(),
    tournamentOpen: count >= G.minForTournament, minForTournament: G.minForTournament,
  };
}

export function toMemberDTO(u: User): GroupMemberDTO {
  return { ...toPublicUser(u), groupRole: u.groupRole as GroupRole, rankPoints: u.rankPoints, joinedAt: u.groupJoinedAt?.toISOString() ?? null };
}

const ROLE_ORDER: Record<string, number> = { OWNER: 0, ADMIN: 1, MEMBER: 2 };
export async function membersOf(groupId: string) {
  const rows = await prisma.user.findMany({ where: { groupId }, orderBy: [{ rankPoints: 'desc' }, { createdAt: 'asc' }] });
  return rows.sort((a, b) => (ROLE_ORDER[a.groupRole] ?? 9) - (ROLE_ORDER[b.groupRole] ?? 9)).map(toMemberDTO);
}

/** O grupo tem gente suficiente para o torneio? */
export async function tournamentOpen(groupId: string | null) {
  if (!groupId) return false;
  return (await prisma.user.count({ where: { groupId } })) >= G.minForTournament;
}

export function newInviteCode() {
  // 10 caracteres sem ambiguidade (sem 0/O/1/l)
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(randomBytes(10), (b) => abc[b % abc.length]).join('');
}

/** Desafios pendentes de quem saiu do grupo deixam de valer. */
async function cancelPendingChallenges(tx: Tx, userId: string) {
  await tx.challenge.updateMany({
    where: { status: 'PENDING', OR: [{ challengerId: userId }, { defenderId: userId }] },
    data: { status: 'CANCELLED', resolvedAt: new Date() },
  });
}

/**
 * Tira a pessoa do grupo atual. Se era o dono, o cargo passa para o admin mais
 * antigo (ou o membro mais antigo). Grupo vazio é apagado.
 */
export async function leaveGroupTx(tx: Tx, user: User) {
  if (!user.groupId) return;
  const groupId = user.groupId;
  await tx.user.update({ where: { id: user.id }, data: { groupId: null, groupRole: 'MEMBER', groupJoinedAt: null } });
  await cancelPendingChallenges(tx, user.id);
  const left = await tx.user.count({ where: { groupId } });
  if (left === 0) {
    await tx.group.delete({ where: { id: groupId } });
    return;
  }
  if (user.groupRole === 'OWNER') {
    const heir =
      (await tx.user.findFirst({ where: { groupId, groupRole: 'ADMIN' }, orderBy: [{ groupJoinedAt: 'asc' }, { createdAt: 'asc' }] })) ??
      (await tx.user.findFirst({ where: { groupId }, orderBy: [{ groupJoinedAt: 'asc' }, { createdAt: 'asc' }] }));
    if (heir) await tx.user.update({ where: { id: heir.id }, data: { groupRole: 'OWNER' } });
  }
}

/**
 * Entra no grupo. Se já está em OUTRO grupo, só continua com confirmLeave
 * (o app mostra o aviso "você vai sair do grupo X").
 */
export async function joinGroupTx(tx: Tx, userId: string, groupId: string, confirmLeave: boolean, role: GroupRole = 'MEMBER') {
  const users = await lockUsers(tx, [userId]);
  const me = users.get(userId)!;
  if (me.groupId === groupId) return { joined: false as const, me };
  // trava o grupo também (evita passar do limite com entradas simultâneas)
  await tx.$queryRaw`SELECT id FROM \`Group\` WHERE id = ${groupId} FOR UPDATE`;
  const count = await tx.user.count({ where: { groupId } });
  if (count >= G.maxMembers) throw conflict(`Esse grupo está cheio (máximo de ${G.maxMembers} pessoas).`, 'GROUP_FULL');
  if (me.groupId) {
    if (!confirmLeave) {
      const cur = await tx.group.findUnique({ where: { id: me.groupId }, select: { name: true } });
      throw conflict(`Você está no grupo “${cur?.name ?? ''}”. Para entrar neste, você vai sair do anterior.`, 'ALREADY_IN_GROUP');
    }
    await leaveGroupTx(tx, me);
  }
  await tx.user.update({ where: { id: userId }, data: { groupId, groupRole: role, groupJoinedAt: new Date() } });
  // convites pendentes para este grupo já não servem
  await tx.groupInvite.updateMany({ where: { userId, groupId, status: 'PENDING' }, data: { status: 'ACCEPTED', resolvedAt: new Date() } });
  return { joined: true as const, me };
}

/** Pode `actor` mexer em `target` (remover / mudar cargo)? */
export function assertCanManage(actor: User, target: User, action: 'remove' | 'promote' | 'demote') {
  if (!isGroupAdmin(actor)) throw forbidden('Só os admins do grupo podem fazer isso.');
  if (target.groupId !== actor.groupId) throw forbidden('Essa pessoa não está no seu grupo.');
  if (target.id === actor.id) throw forbidden('Use “Sair do grupo” para sair.');
  if (target.groupRole === 'OWNER') throw forbidden('O criador do grupo não pode ser removido nem rebaixado.');
  if (action === 'demote' && actor.groupRole !== 'OWNER') throw forbidden('Só o criador do grupo pode tirar alguém de admin.');
  if (action === 'remove' && target.groupRole === 'ADMIN' && actor.groupRole !== 'OWNER') {
    throw forbidden('Só o criador do grupo pode remover um admin.');
  }
}
