/**
 * Lutas em EQUIPE (eventos de PvP em equipes e de Waves) — SÓ TIPOS.
 * A simulação roda no servidor; o kit protegido desenha o replay.
 */
import type { AvatarLook } from './types.js';
import type { Equipment } from './items/equipment.js';
import type { AttackDef, Element, StatusEffect, VfxKey } from './items/types.js';
import type { BossPose, BossSpec } from './boss.js';

export type TeamUnitKind = 'player' | 'monster' | 'chief';

/** Um golpe de monstro/chefe: a ficha do ataque + a pose do corpo (monstros). */
export interface TeamMove extends AttackDef {
  /** Pose do corpo do monstro (o desenho vem dos corpos do kit). */
  pose?: BossPose;
  /** Recarga (ms) antes de poder repetir este golpe. */
  cooldown?: number;
}

export interface TeamUnitMeta {
  u: number;
  kind: TeamUnitKind;
  team: 0 | 1;
  name: string;
  maxHp: number;
  maxSt: number;
  maxMp: number;
  hitbox: { w: number; h: number };
  moves: TeamMove[];
  /** Jogador e chefe: desenhados como avatar. */
  userId?: string;
  level?: number;
  look?: AvatarLook;
  equipment?: Equipment;
  /** Monstro: corpo do kit (arquétipo + cores) e escala do desenho. */
  body?: Pick<BossSpec, 'id' | 'arch' | 'size' | 'pal' | 'feat'>;
  scale?: number;
  /** Chefe: cor da aura e título. */
  aura?: string;
  title?: string;
  /** Waves: em que wave entra (0 = já começa em campo). */
  wave?: number;
}

export type TeamEv =
  | { t: number; type: 'attack'; u: number; m: number; windup: number; active: number; recovery: number; facing: 1 | -1 }
  | { t: number; type: 'hit'; u: number; from: number; dmg: number; x: number; y: number; el: Element; big: boolean; m: number }
  | { t: number; type: 'proj'; id: number; u: number; m: number; x: number; y: number; vfx: VfxKey; el: Element }
  | { t: number; type: 'projEnd'; id: number; x: number; y: number; hit: boolean }
  | { t: number; type: 'area'; u: number; m: number; x: number; y: number; r: number; vfx: VfxKey; el: Element }
  | { t: number; type: 'status'; u: number; status: StatusEffect; dur: number }
  | { t: number; type: 'heal'; u: number; from: number; amount: number }
  | { t: number; type: 'dodge'; u: number }
  | { t: number; type: 'miss'; u: number; x: number; y: number }
  | { t: number; type: 'jump'; u: number; double: boolean }
  | { t: number; type: 'land'; u: number; x: number; y: number; hard: boolean }
  | { t: number; type: 'ko'; u: number; x: number; y: number }
  /** Monstro/chefe entrando na arena. */
  | { t: number; type: 'spawn'; u: number; x: number; y: number }
  /** Nova wave (n = 1..total; boss = a do mini-chefe). */
  | { t: number; type: 'wave'; n: number; total: number; boss: boolean }
  | { t: number; type: 'end'; winner: 0 | 1 | null };

/** Índices de cada unidade dentro de um quadro. */
export const TF = { u: 0, x: 1, y: 2, facing: 3, anim: 4, animT: 5, hp: 6, flags: 7 } as const;
export const TF_SIZE = 8;

export interface TeamArenaDef {
  width: number;
  ground: number;
  /** Cores do cenário. */
  theme: { id: string; name: string; sky: [string, string]; ground: string; fog: string; particle: string };
}

export interface TeamReplay {
  v: 1;
  mode: 'pvp' | 'waves';
  seed: number;
  arena: TeamArenaDef;
  tickRate: number;
  frameEvery: number;
  duration: number;
  winner: 0 | 1 | null;
  units: TeamUnitMeta[];
  /** [tick, nUnidades, ...(TF_SIZE)×n, nProj, ...(id, x, y)×nProj] — só quem está em campo. */
  frames: number[][];
  events: TeamEv[];
  /** Nomes dos times (PvP) ou do tema (waves). */
  teamNames: [string, string];
  waves?: { reached: number; total: number; chief: string };
}
