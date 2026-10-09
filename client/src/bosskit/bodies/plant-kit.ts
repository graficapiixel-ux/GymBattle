/**
 * PLANTAS — peças compartilhadas: locomoção (raízes que arrancam e replantam), IK de duas juntas,
 * quadros-chave, tufos de folhas, galhos, pétalas caindo, rastro de golpe e torrões de terra.
 */
import type { BossSpec } from '@gymbattle/shared';
import type { DrawState, V } from '../types';
import { attacking, breathe, dying, h01, hurtTint, poseK, strike, windup, TAU, clamp, sm, rgba, bez, tube } from '../util';

/** Distância (unidades locais do corpo) que o boss anda a cada ciclo de passada (igual ao motor). */
export const STRIDE = 150;

export const frac = (x: number) => x - Math.floor(x);

/** Locomoção do quadro. */
export interface Loco {
  /** 0..1: peso da passada (0 parado, 1 andando). */
  w: number;
  /** 1 = avançando (para a esquerda), -1 = recuando. */
  s: number;
  g: number;
  mv: number;
  /** 0..1 subida do corpo (0 = afundado na pisada). */
  bob: number;
}

export function loco(st: DrawState): Loco {
  const w = clamp(st.move * 2.4);
  const s = st.vx > 1 ? -1 : 1;
  return { w, s, g: st.gait, mv: st.move, bob: bobAt(st.gait, w) };
}

/** Subida do corpo numa fase da passada (bípede: duas pisadas por ciclo; afunda logo após a pisada). */
export function bobAt(g: number, w: number) {
  return (0.5 - 0.5 * Math.cos(TAU * 2 * (g - 0.08))) * w;
}

export interface Foot {
  x: number;
  y: number;
  /** 0..1 altura do pé no ar. */
  air: number;
  stance: boolean;
  /** progresso dentro da fase (apoio ou balanço). */
  u: number;
}

/**
 * Pé que pisa sem patinar: no apoio ele vai para trás exatamente o que o corpo anda.
 * `stride` já em unidades do desenho (divida pela escala interna).
 */
export function foot(L: Loco, off: number, x0: number, stride: number, H: number, duty = 0.55): Foot {
  const ph = frac(L.g + off);
  let dx: number;
  let air = 0;
  let stance: boolean;
  let u: number;
  if (ph < duty) {
    u = ph / duty;
    dx = stride * (u - 0.5);
    stance = true;
  } else {
    u = (ph - duty) / (1 - duty);
    const e = u * u * (3 - 2 * u);
    dx = stride * (0.5 - e);
    // sobe rápido (arranca), desce mais firme (pisa)
    air = Math.sin(Math.PI * Math.pow(u, 0.8));
    stance = false;
  }
  return { x: x0 + dx * L.s * L.w, y: -air * H * L.w, air: air * L.w, stance: stance || L.w < 0.05, u };
}

/** Joelho de uma perna de dois segmentos (bend = +1 joelho para a esquerda/frente). */
export function ik(a: V, b: V, l1: number, l2: number, bend: number): V {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.min(Math.hypot(dx, dy), l1 + l2 - 0.01) || 0.01;
  const ang = Math.atan2(dy, dx);
  const A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const k = ang + bend * A;
  return { x: a.x + Math.cos(k) * l1, y: a.y + Math.sin(k) * l1 };
}

/** Quadros-chave suaves: keys = [[p, v0, v1, ...], ...] em ordem crescente de p. */
export function kf(p: number, keys: number[][]): number[] {
  if (p <= keys[0][0]) return keys[0].slice(1);
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i];
    if (p <= b[0]) {
      const a = keys[i - 1];
      const k = sm(a[0], b[0], p);
      const out: number[] = [];
      for (let j = 1; j < a.length; j++) out.push(a[j] + (b[j] - a[j]) * k);
      return out;
    }
  }
  return keys[keys.length - 1].slice(1);
}

/** Inclinação a partir do chão: k positivo = topo vai para a esquerda (para a frente). */
export function leanF(ctx: CanvasRenderingContext2D, k: number, y0 = 0) {
  ctx.translate(0, y0);
  ctx.transform(1, 0, -k, 1, 0, 0);
  ctx.translate(0, -y0);
}

export interface C {
  P: BossSpec['pal'];
  body: string;
  dark: string;
  t: number;
  b: number;
  wu: number;
  sk: number;
  atk: number;
  die: number;
  breath: number;
  slam: number;
  cast: number;
  swipe: number;
  charge: number;
  roar: number;
  shoot: number;
  jaw: number;
  L: Loco;
  /** pose do ataque atual ('' fora de ataque). */
  pose: string;
  p: number;
  map: (x: number, y: number) => V;
}

export function makeC(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState): C {
  const base = ctx.getTransform().inverse();
  const wu = windup(st);
  const sk = strike(st);
  const breath = poseK(st, 'breath');
  const roar = poseK(st, 'roar');
  const charge = poseK(st, 'charge');
  return {
    P: s.pal,
    body: hurtTint(ctx, st, s.pal.body),
    dark: hurtTint(ctx, st, s.pal.dark),
    t: st.t,
    b: breathe(st, 1.2),
    wu,
    sk,
    atk: attacking(st),
    die: dying(st),
    breath,
    slam: poseK(st, 'slam'),
    cast: poseK(st, 'cast'),
    swipe: poseK(st, 'swipe'),
    charge,
    roar,
    shoot: poseK(st, 'shoot'),
    jaw: clamp((breath + poseK(st, 'shoot')) * (sm(0.3, 0.45, st.p) * (1 - sm(0.85, 1, st.p))) + roar * (wu * 0.3 + sk * 1.1) + charge * sk * 0.8 + dying(st) * 0.3),
    L: loco(st),
    pose: st.anim === 'attack' ? st.pose : '',
    p: st.p,
    map: (x, y) => {
      const q = base.multiply(ctx.getTransform()).transformPoint({ x, y });
      return { x: q.x, y: q.y };
    },
  };
}

/** Piscada: 0..1 de abertura (pisca a cada ~3-5 s, com fase por boss). */
export function blink(t: number, seed: number) {
  const per = 3.4 + h01(seed, 9) * 1.6;
  const k = frac(t / per + h01(seed, 3));
  return k < 0.035 ? Math.abs(k / 0.0175 - 1) : 1;
}

/** Tufo de folhas (círculos sobrepostos, com sombra embaixo e luz em cima). */
export function clump(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, light: string, dark: string, t: number, seed: number, hi?: string) {
  ctx.fillStyle = dark;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + seed;
    const rr = r * (0.55 + h01(i, seed) * 0.25);
    const px = x + Math.cos(a) * r * 0.55 + Math.sin(t * 1.5 + i + seed) * 2;
    const py = y + Math.sin(a) * r * 0.45 + 4;
    ctx.moveTo(px + rr, py);
    ctx.arc(px, py, rr, 0, TAU);
  }
  ctx.fill();
  ctx.fillStyle = light;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + seed * 2;
    const rr = r * (0.45 + h01(i, seed + 3) * 0.2);
    const px = x + Math.cos(a) * r * 0.4 + Math.sin(t * 1.3 + i) * 2;
    const py = y + Math.sin(a) * r * 0.32 - 6;
    ctx.moveTo(px + rr, py);
    ctx.arc(px, py, rr, 0, TAU);
  }
  ctx.fill();
  if (hi) {
    ctx.fillStyle = hi;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const px = x - r * 0.3 + i * r * 0.22 + Math.sin(t * 1.7 + i + seed) * 1.5;
      const py = y - r * 0.45 + h01(i, seed + 5) * r * 0.2;
      const rr = r * (0.16 + h01(i, seed + 6) * 0.1);
      ctx.moveTo(px + rr, py);
      ctx.arc(px, py, rr, 0, TAU);
    }
    ctx.fill();
  }
}

/** Galho/braço: tubo da base até a ponta com um cotovelo. */
export function limb(ctx: CanvasRenderingContext2D, a: V, tip: V, bend: number, w0: number, w1: number, col: string | CanvasGradient) {
  const mx = (a.x + tip.x) / 2;
  const my = (a.y + tip.y) / 2;
  const dx = tip.x - a.x;
  const dy = tip.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  const el = { x: mx - (dy / l) * bend, y: my + (dx / l) * bend };
  const pts = bez(a, el, el, tip, 12);
  tube(ctx, pts, (q) => w0 + (w1 - w0) * q, col);
  return pts;
}

/** Pétalas/folhas caindo devagar (n pequeno). `wind` empurra para a direita (rastro quando anda). */
export function falling(ctx: CanvasRenderingContext2D, x: number, w: number, h: number, t: number, n: number, col: string, alpha: number, seed: number, wind = 0) {
  if (alpha <= 0.02) return;
  ctx.save();
  ctx.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const k = (t * (0.06 + h01(i, seed) * 0.05) + h01(i, seed + 1)) % 1;
    const px = x + (h01(i, seed + 2) - 0.5) * w + Math.sin(t * 1.5 + i) * 20 - k * 30 + k * wind;
    const py = -h + k * h;
    ctx.globalAlpha = alpha * Math.min(1, (1 - k) * 4, k * 8);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(t * 2 + i);
    ctx.scale(1, 0.4 + 0.6 * Math.abs(Math.sin(t * 3 + i)));
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 2.8, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** Rastro (smear) de um golpe: arco afinando entre pontos antigos e o atual. */
export function smear(ctx: CanvasRenderingContext2D, pts: V[], w: number, col: string, a: number) {
  if (a <= 0.03 || pts.length < 2) return;
  ctx.save();
  ctx.globalAlpha = a;
  tube(ctx, pts, (q) => 1 + w * q * q, col);
  ctx.restore();
}

/** Torrões de terra caindo de um pé que acabou de arrancar do chão. */
export function clods(ctx: CanvasRenderingContext2D, f: Foot, col: string, seed: number) {
  if (f.stance || f.u > 0.6 || f.air < 0.05) return;
  const k = f.u / 0.6;
  ctx.fillStyle = col;
  ctx.globalAlpha = 1 - k;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const px = f.x + (h01(i, seed) - 0.5) * 34 + (h01(i, seed + 1) - 0.5) * 20 * k;
    const py = f.y + 6 + k * k * 70 * (0.6 + h01(i, seed + 2) * 0.6) - (1 - k) * 4;
    const r = 2.5 + h01(i, seed + 3) * 3.5;
    ctx.moveTo(px + r, Math.min(py, 2));
    ctx.arc(px, Math.min(py, 2), r, 0, TAU);
  }
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** Montinho de terra onde a raiz está cravada. */
export function mound(ctx: CanvasRenderingContext2D, x: number, k: number, w: number, col: string) {
  if (k <= 0.02) return;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.ellipse(x, 2, w * (0.6 + 0.4 * k), 7 * k, 0, Math.PI, TAU);
  ctx.fill();
}

/**
 * Pé-raiz: dedos de raiz que se cravam no chão no apoio (dig=1) e ficam pendurados/encolhidos no ar.
 * dir: sentido para onde os dedos apontam mais (−1 para a frente/esquerda).
 */
export function rootToes(ctx: CanvasRenderingContext2D, f: V, dig: number, n: number, len: number, w: number, col: string, t: number, seed: number) {
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0 : i / (n - 1) - 0.5;
    const spread = k * 2;
    // cravado: espalha rente ao chão; no ar: pende para baixo, balançando
    const sway = Math.sin(t * 6 + i * 1.7 + seed) * (1 - dig) * 6;
    const tx = f.x + spread * len * (0.3 + 0.7 * dig) + sway;
    const ty2 = Math.min(6, f.y + len * 0.5 * (1 - dig) - Math.abs(spread) * 8 * (1 - dig) + (4 + h01(i, seed) * 3 - f.y) * dig);
    const mid = { x: (f.x + tx) / 2 + spread * 6, y: (f.y + ty2) / 2 - 7 * dig };
    tube(ctx, bez(f, mid, mid, { x: tx, y: ty2 }, 6), (q) => w * (1 - q) + 1.5, col);
  }
}

export { rgba, h01, TAU, clamp, sm };
