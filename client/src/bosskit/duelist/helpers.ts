/** Utilidades dos golpes do duelista. */
import type { V } from '../types';
import type { DuelMoveCtx } from './types';
import { avatar, crescent, glow, noGlow, orb, rgba, shockwave, sparks, silhouette, TAU, clamp, sm } from '../../game/arena/legend/kit';
import type { Pose } from '../../game/rig';

export const CHEST = 60;
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpV = (a: V, b: V, t: number): V => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
export const faceTo = (x: number, tx: number): 1 | -1 => (tx < x ? -1 : 1);
export const cx = (x: number) => clamp(x, 40, 960);
export const centroid = (pts: V[]): V => ({ x: pts.reduce((s, q) => s + q.x, 0) / pts.length, y: pts.reduce((s, q) => s + q.y, 0) / pts.length });
/** Lado em que o boss está em relação ao alvo (+1 = à direita). */
export const sideOf = (c: DuelMoveCtx, tg: V) => (c.start.x >= tg.x ? 1 : -1);
/** X "nas costas" do alvo (se não couber na arena, vai pela frente). */
export function behind(c: DuelMoveCtx, tg: V, d: number) {
  const sd = sideOf(c, tg);
  const x = tg.x - sd * d;
  return x < 55 || x > 945 ? tg.x + sd * d : x;
}
/** Janela 0..1..0 entre a–b (sobe) e c–e (desce). */
export const win = (a: number, b: number, c: number, e: number, p: number) => sm(a, b, p) * (1 - sm(c, e, p));
/** Pulso curto 0..1..0 centrado em `at` com meia largura `w`. */
export const pulse = (p: number, at: number, w: number) => clamp(1 - Math.abs(p - at) / w);
/** Progresso local 0..1 dentro de [a,b]. */
export const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
/** Arco de pulo entre dois pontos (altura h). */
export function arc(a: V, b: V, t: number, h: number): V {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) - Math.sin(Math.PI * clamp(t)) * h };
}
/** Opacidade de um teletransporte: some em `out`, volta em `back`. */
export function blink(p: number, out: number, back: number, w = 0.035) {
  if (p < out - w) return 1;
  if (p < out) return (out - p) / w;
  if (p < back) return 0;
  if (p < back + w) return (p - back) / w;
  return 1;
}
export function hash(seed: number, i: number) {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Desenha o boss em outro lugar (clones, reflexos). */
export function self(ctx: CanvasRenderingContext2D, c: DuelMoveCtx, x: number, y: number, pose: Pose, facing: 1 | -1, alpha: number, rot = 0) {
  if (alpha <= 0.01) return;
  avatar(ctx, { x, y, facing, look: c.me.look, equipment: c.me.equipment, s: c.s }, pose, { alpha, rot, t: c.t });
}
/** Silhueta colorida do boss (sombras, clones de energia). */
export function ghostOf(ctx: CanvasRenderingContext2D, c: DuelMoveCtx, x: number, y: number, pose: Pose, facing: 1 | -1, color: string, alpha: number, blur = 12) {
  silhouette(ctx, { x, y, facing, look: c.me.look, equipment: c.me.equipment, s: c.s }, pose, color, alpha, { blur });
}

/** Explosão de teletransporte (anel + faíscas). k = 0..1. */
export function tpBurst(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, c1: string, c2: string, seed = 1) {
  if (k <= 0 || k >= 1) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, c1, 18);
  ctx.strokeStyle = rgba(c1, 1 - k);
  ctx.lineWidth = 4 * (1 - k) + 1;
  ctx.beginPath();
  ctx.ellipse(x, y - 60, 16 + k * 70, 75 + k * 25, 0, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = rgba('#ffffff', (1 - k) * 0.8);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 160 * (1 - k * 0.5));
  ctx.lineTo(x, y + 6);
  ctx.stroke();
  noGlow(ctx);
  orb(ctx, x, y - 60, 70 * (1 - k * 0.4), c2, (1 - k) * 0.7);
  ctx.restore();
  sparks(ctx, x, y - 60, k, 1, seed, c1, 18, 110);
  ctx.save();
  ctx.globalAlpha = 1 - k;
  ctx.fillStyle = rgba(c2, 0.5);
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 30 + k * 50, 6 + k * 4, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Corte (meia-lua) que aparece e some. k = 0..1. */
export function slash(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, r: number, k: number, c1: string, c2: string, thick = 16, span = 2.6) {
  if (k <= 0 || k >= 1) return;
  const grow = sm(0, 0.25, k);
  const fade = 1 - sm(0.45, 1, k);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  crescent(ctx, x, y, r * (0.75 + grow * 0.35), thick * (0.4 + 0.6 * fade), ang, c1, c2, fade, span * (0.5 + grow * 0.5));
  ctx.restore();
}

/** Linha de corte reta (golpe rápido) com brilho. */
export function cutLine(ctx: CanvasRenderingContext2D, a: V, b: V, k: number, color: string, width = 6) {
  if (k <= 0 || k >= 1) return;
  const grow = sm(0, 0.3, k);
  const fade = 1 - sm(0.3, 1, k);
  const e = lerpV(a, b, grow);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  glow(ctx, color, width * 4);
  ctx.strokeStyle = rgba(color, fade);
  ctx.lineWidth = width * (0.3 + fade);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(e.x, e.y);
  ctx.stroke();
  ctx.strokeStyle = rgba('#ffffff', fade);
  ctx.lineWidth = Math.max(1, width * 0.35 * fade);
  ctx.stroke();
  ctx.restore();
}

/** Impacto no alvo (faíscas + clarão + onda). k = 0..1. */
export function impact(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, color: string, seed: number, size = 1) {
  if (k <= 0 || k >= 1) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  orb(ctx, x, y, 60 * size * (0.6 + k), color, (1 - k) * 0.9);
  ctx.restore();
  sparks(ctx, x, y, k, size, seed, color, 22, 140);
  if (size > 0.8) shockwave(ctx, x, y + CHEST, k, 0.6 * size, color, 0.8);
}

/** Selo de papel brilhante (talismã). */
export function talisman(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, color: string, alpha: number, size = 1) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(size, size);
  glow(ctx, color, 12);
  ctx.fillStyle = '#f4ead0';
  ctx.fillRect(-7, -15, 14, 30);
  noGlow(ctx);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.strokeRect(-5.5, -13.5, 11, 27);
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(0, 10);
  ctx.moveTo(-4, -5);
  ctx.lineTo(4, -2);
  ctx.moveTo(-4, 2);
  ctx.lineTo(4, 5);
  ctx.arc(0, 8, 2.4, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/** Escurece a arena inteira (golpes "de domínio"). */
export function darken(ctx: CanvasRenderingContext2D, c: DuelMoveCtx, a: number, color = '#05030c') {
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = clamp(a);
  ctx.fillStyle = color;
  ctx.fillRect(-600, -900, c.W + 1200, 2200);
  ctx.restore();
}

/** Clarão de tela inteira. */
export function flash(ctx: CanvasRenderingContext2D, c: DuelMoveCtx, a: number, color = '#ffffff') {
  if (a <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = clamp(a);
  ctx.fillStyle = color;
  ctx.fillRect(-600, -900, c.W + 1200, 2200);
  ctx.restore();
}
