/** Os 20 golpes do duelista (m01…m20). Golpe desconhecido cai no m01. */
import type { DuelMove } from './types';
import { MOVES_A } from './moves-a';
import { MOVES_B } from './moves-b';

const ALL: Record<string, DuelMove> = { ...MOVES_A, ...MOVES_B };

export const MOVES: Record<string, DuelMove> = new Proxy(ALL, { get: (o, k: string) => o[k] ?? o.m01 });
