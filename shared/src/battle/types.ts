import type { AvatarLook } from '../types.js';
import type { Equipment } from '../items/equipment.js';
import type { Attributes } from '../progression.js';
import type { Element, StatusEffect, VfxKey } from '../items/types.js';

/** Snapshot de um lutador no momento em que a luta começa. */
export interface FighterInput {
  id: string;
  username: string;
  level: number;
  title: string | null;
  attributes: Attributes;
  look: AvatarLook;
  equipment: Equipment;
}

/** Códigos de animação gravados em cada quadro. */
export const ANIM = {
  idle: 0,
  run: 1,
  jump: 2,
  fall: 3,
  dash: 4,
  attack1: 5,
  attack2: 6,
  hitstun: 7,
  tumble: 8,
  dead: 9,
  respawn: 10,
  victory: 11,
  land: 12,
  frozen: 13,
} as const;
export type AnimCode = (typeof ANIM)[keyof typeof ANIM];

/** Bits de status em cada quadro. */
export const FLAG = { iframes: 1, freeze: 2, poison: 4, burn: 8, bleed: 16, shock: 32 } as const;

/** Índices do quadro de cada lutador. */
export const F = { x: 0, y: 1, facing: 2, anim: 3, animT: 4, hp: 5, st: 6, mp: 7, lives: 8, flags: 9 } as const;
export const F_SIZE = 10;

export type BattleEvent =
  | { t: number; type: 'attack'; p: number; slot: 1 | 2; windup: number; active: number; recovery: number; facing: 1 | -1 }
  | { t: number; type: 'hit'; p: number; from: number; dmg: number; x: number; y: number; el: Element; big: boolean; slot: 1 | 2 }
  | { t: number; type: 'proj'; id: number; p: number; slot: 1 | 2; x: number; y: number; vfx: VfxKey; el: Element }
  | { t: number; type: 'projEnd'; id: number; x: number; y: number; hit: boolean }
  | { t: number; type: 'area'; p: number; slot: 1 | 2; x: number; y: number; r: number; vfx: VfxKey; el: Element }
  | { t: number; type: 'status'; p: number; status: StatusEffect; dur: number }
  | { t: number; type: 'heal'; p: number; amount: number }
  | { t: number; type: 'dodge'; p: number }
  /** O golpe passou pelo lutador p, mas ele estava invulnerável (esquivou). */
  | { t: number; type: 'miss'; p: number; x: number; y: number }
  | { t: number; type: 'jump'; p: number; double: boolean }
  | { t: number; type: 'land'; p: number; x: number; y: number; hard: boolean }
  | { t: number; type: 'ko'; p: number; reason: 'hp' | 'ring' | 'legend'; x: number; y: number }
  /**
   * Evento lendário: o lutador p ativa a cena `variant` do tipo da sua arma.
   * Os dois são posicionados em (ax, y) e (bx, y); a cena dura `dur` ticks e o
   * adversário cai no tick `ko`.
   */
  | { t: number; type: 'legend'; p: number; variant: 0 | 1; dur: number; ko: number; ax: number; bx: number; y: number }
  | { t: number; type: 'respawn'; p: number }
  | { t: number; type: 'end'; winner: number | null; reason: 'ko' | 'time' | 'legend' };

export interface FighterMeta extends FighterInput {
  maxHp: number;
  maxSt: number;
  maxMp: number;
  hitbox: { w: number; h: number };
}

export interface Replay {
  v: 1;
  seed: number;
  map: string;
  tickRate: number;
  /** Um quadro é gravado a cada N ticks (o cliente interpola). */
  frameEvery: number;
  /** Duração total em ticks. */
  duration: number;
  winner: number | null;
  fighters: [FighterMeta, FighterMeta];
  /** [tick, ...lutador0 (F_SIZE), ...lutador1 (F_SIZE), nProj, ...(id, x, y)×nProj] */
  frames: number[][];
  events: BattleEvent[];
  stats: { damage: [number, number]; hits: [number, number]; kos: [number, number] };
}
