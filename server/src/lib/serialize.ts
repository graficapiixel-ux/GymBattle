import type { User } from '@prisma/client';
import {
  DEFAULT_AVATAR, EMPTY_EQUIPMENT, currentStreak, dayKey, xpToNext,
  type Equipment,
  type AvatarLook, type MeUser, type PublicUser, type AdminUserRow, type GroupRole,
} from '@gymbattle/shared';
import { isAdmin } from './auth.js';

export function avatarOf(u: User): AvatarLook {
  return { ...DEFAULT_AVATAR, ...((u.avatar as Partial<AvatarLook> | null) ?? {}) };
}

export function equipmentOf(u: User): Equipment {
  return { ...EMPTY_EQUIPMENT, ...((u.equipment as Partial<Equipment> | null) ?? {}) };
}

export function streakOf(u: User): number {
  return currentStreak(
    { streak: u.streak, lastPostDay: u.lastPostDay, restWeeks: (u.restWeeks as string[] | null) ?? [] },
    dayKey(),
  );
}

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id, username: u.username, level: u.level, title: u.title, avatar: avatarOf(u), equipment: equipmentOf(u),
    photoUrl: u.photoPath ? `/uploads/${u.photoPath}` : null,
  };
}

export function toMe(u: User): MeUser {
  return {
    ...toPublicUser(u),
    email: u.email,
    role: u.role,
    xp: u.xp,
    xpToNext: xpToNext(u.level),
    gold: u.gold,
    attrPoints: u.attrPoints,
    attributes: { str: u.str, dex: u.dex, vig: u.vig, fort: u.fort, ess: u.ess, int: u.int, fai: u.fai },
    streak: streakOf(u),
    rankPoints: u.rankPoints,
    isAdmin: isAdmin(u),
    starterWeapon: u.starterWeapon,
    protectedUntil: u.protectedUntil && u.protectedUntil > new Date() ? u.protectedUntil.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
    hasCpf: !!u.cpfHash,
    cpfLast2: u.cpfLast2,
    groupId: u.groupId,
    groupRole: u.groupId ? (u.groupRole as GroupRole) : null,
  };
}

export function toAdminRow(u: User): AdminUserRow {
  return {
    id: u.id, email: u.email, username: u.username, role: u.role,
    level: u.level, gold: u.gold, createdAt: u.createdAt.toISOString(),
  };
}
