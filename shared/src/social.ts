import type { PublicUser } from './types.js';

export interface PostDTO {
  id: string;
  author: PublicUser;
  imageUrl: string;
  width: number;
  height: number;
  caption: string | null;
  rewarded: boolean;
  xpAwarded: number;
  goldAwarded: number;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  reportedByMe: boolean;
  createdAt: string;
  expiresAt: string;
}

export interface CommentDTO {
  id: string;
  author: PublicUser;
  text: string;
  createdAt: string;
  mine: boolean;
}

export interface FeedPage {
  posts: PostDTO[];
  nextCursor: string | null;
}

export interface PostRewardDTO {
  xp: number;
  gold: number;
  bonus: number;
  streak: number;
  levelsGained: number;
}

export interface TodayStatus {
  rewardAvailable: boolean;
  streak: number;
  nextReward: { xp: number; gold: number; bonus: number };
}

export interface ProfileDTO {
  user: PublicUser & {
    attributes: Record<string, number>;
    streak: number;
    rankPoints: number;
    rankPosition: number;
    createdAt: string;
  };
  posts: PostDTO[];
}

export const REPORT_REASONS = [
  { id: 'not_workout', label: 'Não é foto de treino' },
  { id: 'fake', label: 'Foto falsa / da internet' },
  { id: 'repeated', label: 'Foto repetida' },
  { id: 'inappropriate', label: 'Conteúdo impróprio' },
  { id: 'other', label: 'Outro motivo' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['id'];

export interface AdminReportDTO {
  post: PostDTO;
  count: number;
  reasons: { reason: string; details: string | null; reporter: string; createdAt: string }[];
}
