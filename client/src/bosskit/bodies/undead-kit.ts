/**
 * MORTOS-VIVOS — peças e utilitários comuns (locomoção, IK, crânio, mão de osso).
 * Origem no chão, olhando para a esquerda; y negativo para cima.
 */
import type { DrawState, V } from '../types';
import { eyeGlow, vgrad, TAU, clamp, sm } from '../util';

export interface Pal { body: string; dark: string; accent: string; glow: string; eye: string; bone: string; boneD: string }
export interface Arm { sh: V; el: V; hd: V; ang: number }
export interface Pose {
  wu: number; sk: number; hold: number; atk: number; die: number; b: number;
  slam: number; swipe: number; cast: number; shoot: number; charge: number; roar: number;
  /** Tranco do impacto (pico em p≈0,56). */
  imp: number;
  /** Progresso do ataque (0 fora do ataque). */
  p: number;
}

export const L = (a: number, b: number, k: number) => a + (b - a) * k;
export const LV = (a: V, b: V, k: number): V => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
export const frac = (x: number) => x - Math.floor(x);

export const armPts = (sh: V, a: number, b: number, l1: number, l2: number): Arm => {
  const el = { x: sh.x - Math.sin(a) * l1, y: sh.y + Math.cos(a) * l1 };
  const hd = { x: el.x - Math.sin(a + b) * l2, y: el.y + Math.cos(a + b) * l2 };
  return { sh, el, hd, ang: a + b };
};

/** Transformação de um ponto (para as âncoras): gira em volta do pivô e desloca. */
export function xf(p: V, pivot: V, rot: number, dx: number, dy: number, sc = 1): V {
  const x = (p.x - pivot.x) * sc, y = (p.y - pivot.y) * sc;
  const c = Math.cos(rot), s = Math.sin(rot);
  return { x: pivot.x + x * c - y * s + dx, y: pivot.y + x * s + y * c + dy };
}
/** Inversa de xf (mundo → local do corpo). */
export function ixf(p: V, pivot: V, rot: number, dx: number, dy: number): V {
  const x = p.x - dx - pivot.x, y = p.y - dy - pivot.y;
  const c = Math.cos(-rot), s = Math.sin(-rot);
  return { x: pivot.x + x * c - y * s, y: pivot.y + x * s + y * c };
}

/**
 * IK de dois ossos: devolve a junta do meio (joelho/cotovelo).
 * bend = +1 dobra para a esquerda (frente) quando o membro aponta para baixo.
 */
export function ik(a: V, b: V, l1: number, l2: number, bend: number): V {
  let dx = b.x - a.x, dy = b.y - a.y;
  let d = Math.hypot(dx, dy) || 0.001;
  const dm = Math.min(d, l1 + l2 - 0.5);
  dx /= d; dy /= d;
  d = Math.max(Math.abs(l1 - l2) + 0.5, dm);
  const p = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - p * p));
  // normal (−dy, dx): com o membro para baixo aponta para a esquerda (frente)
  return { x: a.x + dx * p - dy * h * bend, y: a.y + dy * p + dx * h * bend };
}

/** Locomoção: m (0..1), u = fase 0..1 (tocada ao contrário quando recua), fwd = +1 avançando / −1 recuando. */
export function loco(st: DrawState) {
  const m = clamp(st.move ?? 0);
  const rev = (st.vx ?? 0) > 1;
  const g = frac(st.gait ?? 0);
  return { m, u: rev ? 1 - g : g, fwd: rev ? -1 : 1, sK: sm(0, 0.3, m) };
}

/**
 * Pé no ciclo da passada. u 0..1 (0 = pousa na frente); duty = fração apoiada.
 * x vai de −S (frente) a +S (trás) no apoio e volta no balanço; lift = altura do pé.
 * Para não patinar: S = 150·duty/2 (um ciclo = 150 de deslocamento local).
 */
export function stepFoot(u: number, S: number, H: number, duty = 0.55) {
  u = frac(u);
  if (u < duty) {
    const k = u / duty;
    return { x: -S + 2 * S * k, lift: 0, k: 0, plant: 1, roll: k };
  }
  const k = (u - duty) / (1 - duty);
  const e = k * k * (3 - 2 * k);
  return { x: S - 2 * S * e, lift: H * Math.sin(Math.PI * Math.min(1, k * 1.08)), k, plant: 0, roll: 0 };
}

/** Sobe-e-desce do corpo: afunda logo depois de cada pisada (u≈0,06 e 0,56), sobe no meio do apoio. */
export const stepBob = (u: number, lag = 0.06) => Math.cos(4 * Math.PI * (u - lag));
/** Tranco logo após cada pisada (1 → 0). */
export const stepJolt = (u: number) => Math.exp(-frac(u * 2) * 9);

/** Janela de impacto do ataque (pico em p≈0,56). */
export const impact = (st: DrawState) => (st.anim === 'attack' ? Math.exp(-(((st.p - 0.56) / 0.06) ** 2)) : 0);

export function shadow(ctx: CanvasRenderingContext2D, x: number, w: number, a = 0.3) {
  ctx.fillStyle = `rgba(0,0,0,${a.toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(x, 0, Math.max(10, w), 13, 0, 0, TAU);
  ctx.fill();
}

export function line(ctx: CanvasRenderingContext2D, a: V, b: V) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

/** Osso com contorno (duas passadas de traço). */
export function boneSeg(ctx: CanvasRenderingContext2D, a: V, b: V, w: number, col: string, out: string) {
  ctx.strokeStyle = out;
  ctx.lineWidth = w + 6;
  line(ctx, a, b);
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  line(ctx, a, b);
}

export function boneHand(ctx: CanvasRenderingContext2D, p: V, ang: number, C: Pal, size: number, back: boolean, curl = 0) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(ang);
  ctx.strokeStyle = back ? C.boneD : C.bone;
  ctx.fillStyle = back ? C.boneD : C.bone;
  ctx.beginPath();
  ctx.ellipse(0, size * 0.2, size * 0.5, size * 0.45, 0, 0, TAU);
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, size * 0.17);
  for (let i = 0; i < 4; i++) {
    const x = -size * 0.4 + i * size * 0.27;
    const c = curl * (0.8 + i * 0.1);
    ctx.beginPath();
    ctx.moveTo(x, size * 0.4);
    ctx.lineTo(x - size * 0.08 + c * size * 0.3, size * (1.0 - c * 0.15));
    ctx.lineTo(x - size * 0.22 + c * size * 0.75, size * (1.45 - c * 0.55));
    ctx.stroke();
  }
  // polegar
  ctx.beginPath();
  ctx.moveTo(-size * 0.45, size * 0.1);
  ctx.lineTo(-size * (0.9 - curl * 0.3), size * (0.6 + curl * 0.1));
  ctx.stroke();
  ctx.restore();
}

/** Crânio (olhando para a esquerda). */
export function skull(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, jaw: number, C: Pal, eye: string, glowK: number, die: number) {
  ctx.save();
  ctx.translate(x, y);
  // mandíbula
  ctx.save();
  ctx.translate(r * 0.2, r * 0.45);
  ctx.rotate(-jaw * 0.35);
  ctx.translate(0, jaw * r * 0.15);
  ctx.fillStyle = C.boneD;
  ctx.beginPath();
  ctx.moveTo(r * 0.3, -r * 0.1);
  ctx.lineTo(-r * 0.85, -r * 0.05);
  ctx.quadraticCurveTo(-r * 0.92, r * 0.28, -r * 0.7, r * 0.38);
  ctx.lineTo(r * 0.2, r * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = C.bone;
  for (let i = 0; i < 5; i++) ctx.fillRect(-r * 0.78 + i * r * 0.2, -r * 0.12, r * 0.13, r * 0.18);
  ctx.restore();
  // calota
  ctx.fillStyle = vgrad(ctx, -r, r * 0.6, C.bone, C.boneD);
  ctx.beginPath();
  ctx.moveTo(-r * 0.95, r * 0.45);
  ctx.quadraticCurveTo(-r * 1.15, -r * 0.2, -r * 0.6, -r * 0.8);
  ctx.quadraticCurveTo(0, -r * 1.2, r * 0.75, -r * 0.6);
  ctx.quadraticCurveTo(r * 1.05, 0, r * 0.6, r * 0.45);
  ctx.closePath();
  ctx.fill();
  // maçã do rosto (sombra) e rachadura
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(r * 0.35, r * 0.1, r * 0.4, r * 0.32, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.beginPath();
  ctx.moveTo(r * 0.1, -r * 0.95);
  ctx.lineTo(r * 0.2, -r * 0.6);
  ctx.lineTo(r * 0.05, -r * 0.45);
  ctx.stroke();
  // dentes de cima
  ctx.fillStyle = C.bone;
  for (let i = 0; i < 5; i++) ctx.fillRect(-r * 0.85 + i * r * 0.2, r * 0.42, r * 0.13, r * 0.18);
  // órbitas
  ctx.fillStyle = '#050505';
  ctx.beginPath();
  ctx.ellipse(-r * 0.55, -r * 0.05, r * 0.28, r * 0.24, 0.2, 0, TAU);
  ctx.ellipse(-r * 0.0, -r * 0.08, r * 0.24, r * 0.22, -0.1, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-r * 0.32, r * 0.12);
  ctx.lineTo(-r * 0.4, r * 0.32);
  ctx.lineTo(-r * 0.22, r * 0.32);
  ctx.closePath();
  ctx.fill();
  const open = 1 - die;
  eyeGlow(ctx, -r * 0.55, -r * 0.05, r * 0.13 + glowK * r * 0.05, eye, open);
  eyeGlow(ctx, 0, -r * 0.08, r * 0.11 + glowK * r * 0.05, eye, open);
  ctx.restore();
}
