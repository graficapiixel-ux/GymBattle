/**
 * DRAGÕES — ferramentas de esqueleto e desenho (IK de duas peças, passada,
 * tubos afinados, cápsulas). Usado por dragon.ts e dragon-wyrm.ts.
 */
import type { V } from '../types';

export const frac = (x: number) => x - Math.floor(x);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const lerpV = (a: V, b: V, k: number): V => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
export const dirV = (a: number, l = 1): V => ({ x: Math.cos(a) * l, y: Math.sin(a) * l });
export const addV = (a: V, b: V, k = 1): V => ({ x: a.x + b.x * k, y: a.y + b.y * k });
/** Sino gaussiano centrado em c com largura w (pico 1). */
export const bump = (x: number, c: number, w: number) => Math.exp(-(((x - c) / w) ** 2));
/** Liso de 0 a 1 entre a e b. */
export const ss = (a: number, b: number, x: number) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** Hash estável de um texto (0..1). */
export function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * IK de duas peças: devolve a junta (joelho/cotovelo) entre a raiz A e a ponta B.
 * bend = +1 dobra para um lado, −1 para o outro.
 */
export function ik(a: V, b: V, l1: number, l2: number, bend: number): V {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.max(Math.abs(l1 - l2) + 0.5, Math.min(l1 + l2 - 0.5, Math.hypot(dx, dy)));
  const base = Math.atan2(dy, dx);
  const c = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const ang = base + bend * Math.acos(Math.max(-1, Math.min(1, c)));
  return { x: a.x + Math.cos(ang) * l1, y: a.y + Math.sin(ang) * l1 };
}

/**
 * Passada de uma pata. ph = fase 0..1 (0 = pisa), D = fração de apoio, A = amplitude
 * (avanço relativo ao corpo, em unidades locais). Devolve u (para a FRENTE positivo),
 * lift (altura do pé), sw (progresso do balanço, −1 se apoiado) e dip (peso logo após pisar).
 */
export function stepFoot(ph: number, D: number, A: number, liftH: number) {
  if (ph < D) {
    const s = ph / D;
    const dip = ph < 0.36 ? Math.sin((Math.PI * ph) / 0.36) : 0;
    return { u: A / 2 - A * s, lift: 0, sw: -1, dip, roll: s };
  }
  const s = (ph - D) / (1 - D);
  const e = s * s * (3 - 2 * s);
  // levanta cedo (pé sai rápido do chão) e pousa firme
  const lift = liftH * Math.sin(Math.PI * Math.pow(s, 0.75));
  return { u: -A / 2 + A * e, lift, sw: s, dip: 0, roll: 1 };
}

/** Caminho de uma cápsula afinada (de A com raio ra até B com raio rb). */
export function capsule(ctx: CanvasRenderingContext2D, a: V, b: V, ra: number, rb: number) {
  const th = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.beginPath();
  ctx.moveTo(a.x + Math.cos(th + Math.PI / 2) * ra, a.y + Math.sin(th + Math.PI / 2) * ra);
  ctx.lineTo(b.x + Math.cos(th + Math.PI / 2) * rb, b.y + Math.sin(th + Math.PI / 2) * rb);
  ctx.arc(b.x, b.y, rb, th + Math.PI / 2, th - Math.PI / 2, true);
  ctx.lineTo(a.x + Math.cos(th - Math.PI / 2) * ra, a.y + Math.sin(th - Math.PI / 2) * ra);
  ctx.arc(a.x, a.y, ra, th - Math.PI / 2, th - Math.PI * 1.5, true);
  ctx.closePath();
}

/** Normais (lado esquerdo do sentido do traço) de uma polilinha. */
export function normals(pts: V[]): V[] {
  const n = pts.length;
  const out: V[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    out.push({ x: dy / l, y: -dx / l });
  }
  return out;
}

/**
 * Caminho de um tubo afinado (pescoço, cauda, corpo de wyrm) com bordas suaves e
 * pontas arredondadas. nr = normais (de normals()); o lado "+" é o lado esquerdo.
 */
export function tubePath(ctx: CanvasRenderingContext2D, pts: V[], rad: number[], nr: V[]) {
  const n = pts.length;
  const L: V[] = [];
  const R: V[] = [];
  for (let i = 0; i < n; i++) {
    L.push({ x: pts[i].x + nr[i].x * rad[i], y: pts[i].y + nr[i].y * rad[i] });
    R.push({ x: pts[i].x - nr[i].x * rad[i], y: pts[i].y - nr[i].y * rad[i] });
  }
  ctx.beginPath();
  ctx.moveTo(L[0].x, L[0].y);
  for (let i = 1; i < n - 1; i++) ctx.quadraticCurveTo(L[i].x, L[i].y, (L[i].x + L[i + 1].x) / 2, (L[i].y + L[i + 1].y) / 2);
  ctx.lineTo(L[n - 1].x, L[n - 1].y);
  const ae = Math.atan2(nr[n - 1].y, nr[n - 1].x);
  ctx.arc(pts[n - 1].x, pts[n - 1].y, Math.max(0.5, rad[n - 1]), ae, ae - Math.PI, false);
  for (let i = n - 2; i > 0; i--) ctx.quadraticCurveTo(R[i].x, R[i].y, (R[i].x + R[i - 1].x) / 2, (R[i].y + R[i - 1].y) / 2);
  ctx.lineTo(R[0].x, R[0].y);
  const a0 = Math.atan2(-nr[0].y, -nr[0].x);
  ctx.arc(pts[0].x, pts[0].y, Math.max(0.5, rad[0]), a0, a0 - Math.PI, false);
  ctx.closePath();
}

/** Ponto e tangente de uma curva cúbica. */
export function cubic(p0: V, p1: V, p2: V, p3: V, k: number): V {
  const u = 1 - k;
  return {
    x: u * u * u * p0.x + 3 * u * u * k * p1.x + 3 * u * k * k * p2.x + k * k * k * p3.x,
    y: u * u * u * p0.y + 3 * u * u * k * p1.y + 3 * u * k * k * p2.y + k * k * k * p3.y,
  };
}

/** Garra em gancho (de base para a direção ang). */
export function claw(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, w: number) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  ctx.beginPath();
  ctx.moveTo(x - s * w, y + c * w);
  ctx.quadraticCurveTo(x + c * len * 0.7 - s * w * 0.6, y + s * len * 0.7 + c * w * 0.6, x + c * len + s * len * 0.25, y + s * len - c * len * 0.25 + len * 0.3);
  ctx.quadraticCurveTo(x + c * len * 0.5, y + s * len * 0.5, x + s * w, y - c * w);
  ctx.closePath();
  ctx.fill();
}
