import type { Prisma, Post, User } from '@prisma/client';
import { BALANCE, type PostDTO } from '@gymbattle/shared';
import { prisma } from '../db.js';
import { deleteImage } from './images.js';
import { toPublicUser } from './serialize.js';

export const postInclude = (viewerId: string | undefined) =>
  ({
    user: true,
    likes: viewerId ? { where: { userId: viewerId }, select: { userId: true } } : false,
    reports: viewerId ? { where: { reporterId: viewerId }, select: { id: true } } : false,
  }) satisfies Prisma.PostInclude;

type PostWith = Post & { user: User; likes?: { userId: string }[]; reports?: { id: string }[] };

export function expiresAt(createdAt: Date) {
  return new Date(createdAt.getTime() + BALANCE.post.photoRetentionDays * 86_400_000);
}

export function toPostDTO(p: PostWith): PostDTO {
  return {
    id: p.id,
    author: toPublicUser(p.user),
    imageUrl: `/uploads/${p.imagePath}`,
    width: p.width,
    height: p.height,
    caption: p.caption,
    rewarded: p.rewarded,
    xpAwarded: p.xpAwarded,
    goldAwarded: p.goldAwarded,
    likeCount: p.likeCount,
    commentCount: p.commentCount,
    likedByMe: !!p.likes?.length,
    reportedByMe: !!p.reports?.length,
    createdAt: p.createdAt.toISOString(),
    expiresAt: expiresAt(p.createdAt).toISOString(),
  };
}

/** Janela de posts ainda visíveis (dentro da retenção). */
export function visibleSince() {
  return new Date(Date.now() - BALANCE.post.photoRetentionDays * 86_400_000);
}

/** Apaga as fotos com mais de N dias (a recompensa e o hash anti-duplicata ficam). */
export async function purgeExpiredPosts(): Promise<number> {
  const old = await prisma.post.findMany({
    where: { createdAt: { lt: visibleSince() } },
    select: { id: true, imagePath: true },
    take: 500,
  });
  for (const p of old) {
    await deleteImage(p.imagePath).catch(() => {});
    await prisma.post.delete({ where: { id: p.id } }).catch(() => {});
  }
  return old.length;
}
