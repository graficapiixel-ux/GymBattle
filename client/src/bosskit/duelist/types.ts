/**
 * DUELISTA — boss do tamanho de um jogador, desenhado com o mesmo boneco
 * (drawAvatar) e lutando como no PvP. Cada golpe (m01…m20) define:
 *  - frame(): onde o boss está, para onde olha e a pose a cada instante;
 *  - back()/front(): efeitos atrás/na frente dos lutadores (devolve tremor).
 */
import type { AvatarLook, Equipment } from '@gymbattle/shared';
import type { Pose } from '../../game/rig';
import type { V } from '../types';

export interface DuelMoveCtx {
  /** Progresso 0..1 do golpe. O DANO acontece em p ≈ 0,55. */
  p: number;
  /** Segundos desde o início do golpe. */
  t: number;
  /** Duração total (s). */
  dur: number;
  /** Pés do boss no início do golpe (coordenadas do mundo). */
  start: V;
  /** Pés dos alvos (já parados esperando o golpe). Nunca vazio. */
  targets: V[];
  /** Pés de TODOS os jogadores vivos (para golpes que varrem a arena). */
  everyone: V[];
  /** Chão (y) e largura do mundo. */
  ground: number;
  W: number;
  seed: number;
  /** Cores do golpe. */
  color: string;
  color2: string;
  /** Aparência do boss (para clones/sombras) e escala do boneco. */
  me: { look: AvatarLook; equipment: Equipment };
  s: number;
  /** Cores do boss (aura). */
  glow: string;
  accent: string;
}

export interface DuelFrame {
  /** Pés do boss (mundo). */
  x: number;
  y: number;
  facing: 1 | -1;
  /** 0..1 (0 = sumiu, ex.: no meio de um teletransporte). */
  alpha: number;
  pose: Pose;
  /** Rotação do corpo (rad), ex.: mortal, mergulho. */
  rot?: number;
  /** Quantas imagens residuais desenhar (0–5), para movimentos rápidos. */
  ghosts?: number;
  /** Brilho extra da aura (0..1). */
  aura?: number;
}

export interface DuelMove {
  frame(c: DuelMoveCtx): DuelFrame;
  /** Efeitos atrás dos lutadores. */
  back?(ctx: CanvasRenderingContext2D, c: DuelMoveCtx, f: DuelFrame): void;
  /** Efeitos na frente. Devolve o tremor de tela (0..1). */
  front(ctx: CanvasRenderingContext2D, c: DuelMoveCtx, f: DuelFrame): number;
}
