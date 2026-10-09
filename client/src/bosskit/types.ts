/**
 * KIT DOS BOSSES — este código NÃO entra no site: o servidor o entrega só para
 * o admin ou quando há evento ativo (rota protegida /api/events/kit.js).
 */
import type { BossAttack, BossPose, BossSpec } from '@gymbattle/shared';

export type V = { x: number; y: number };

export type BossAnim = 'idle' | 'enter' | 'attack' | 'hurt' | 'death';

/** Estado do corpo do boss num instante. */
export interface DrawState {
  /** Tempo global (s): respiração, flutuação, brilho. */
  t: number;
  anim: BossAnim;
  /** Progresso 0..1 da animação atual (ataque: impacto em p≈0,55). */
  p: number;
  /** Pose do ataque (quando anim = 'attack'). */
  pose: BossPose;
  /** 0..1: flash de dano (independente da animação). */
  hurt: number;
  /** Raiva (0..1): cresce quando a vida cai — mais brilho/tremor. */
  rage: number;
  /**
   * LOCOMOÇÃO (o boss anda de verdade pela arena):
   *  - move: 0..1 — quão rápido está andando agora (0 = parado, 1 = velocidade máxima);
   *  - gait: ciclos de passada acumulados (cada 1,0 = um ciclo completo: pé A + pé B).
   *    Use frac(gait) para a fase das pernas; ele só avança quando o boss se desloca.
   *  - vx: velocidade horizontal (mundo/s). NEGATIVO = andando para a frente (esquerda,
   *    na direção dos jogadores); positivo = recuando.
   *  - vy: velocidade vertical (voadores; negativo = subindo).
   */
  move: number;
  gait: number;
  vx: number;
  vy: number;
  /**
   * 0..1: no ar (salto/voo). Quem tem asas bate as asas; quem tem pernas encolhe.
   * As coordenadas continuam LOCAIS: a luta espelha o desenho quando o boss vira para a direita.
   */
  air?: number;
}

/**
 * Pontos de referência devolvidos pelo desenho do corpo, em coordenadas
 * LOCAIS (origem no chão, embaixo do centro do boss; y negativo para cima;
 * o boss olha para a ESQUERDA, onde estão os jogadores). Antes da escala.
 */
export interface Anchors {
  /** Boca / origem de sopros e raios. */
  mouth: V;
  /** Mão / garra / ponto de golpe. */
  hand: V;
  /** Centro do corpo (onde os golpes acertam). */
  core: V;
  /** Altura do topo (negativo). */
  top: number;
  /** Meia largura do corpo. */
  halfW: number;
}

/** Desenha o corpo do boss (já transladado para o chão e escalado). */
export type BodyDraw = (ctx: CanvasRenderingContext2D, spec: BossSpec, st: DrawState) => Anchors;

/** Contexto do efeito de ataque (coordenadas do MUNDO). */
export interface FxCtx {
  atk: BossAttack;
  /** 0..1 da animação; o dano acontece em p≈0,55. */
  p: number;
  t: number;
  from: V;
  hand: V;
  core: V;
  /** Posição dos alvos (centro do corpo de cada jogador atingido). */
  targets: V[];
  ground: number;
  /** Largura do mundo. */
  W: number;
  seed: number;
  size: number;
}

/** Efeito de ataque: desenha e devolve o tremor de tela (0..1). */
export type FxDraw = (ctx: CanvasRenderingContext2D, f: FxCtx) => number;
