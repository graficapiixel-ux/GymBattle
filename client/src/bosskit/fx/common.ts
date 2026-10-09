/** Peças comuns dos efeitos de ataque dos bosses (tudo determinístico em p). */
import type { FxCtx, V } from '../types';
import { TAU, clamp, easeOut, lin, mixHex, orb, rgba, rnd, sm } from '../util';

export { TAU, clamp, easeOut, lin, orb, rgba, rnd, sm };
export type F = FxCtx;

/** Momento do dano. */
export const IMP = 0.55;
/** Raio nunca negativo. */
export const R = (r: number) => Math.max(0.01, r);
/** Clareia / escurece uma cor. */
export const lite = (c: string, k = 0.55) => mixHex(c, '#ffffff', k);
export const dark = (c: string, k = 0.6) => mixHex(c, '#000000', k);
/** Mistura aditiva (brilho). */
export const add = (ctx: CanvasRenderingContext2D) => { ctx.globalCompositeOperation = 'lighter'; };

/** Tremor padrão: pico no impacto + leve durante a carga. */
export function hitShake(p: number, peak = 0.8, pre = 0.06, at = 0.52) {
  const k = sm(at - 0.03, at + 0.02, p) * (1 - sm(at + 0.05, at + 0.3, p));
  return Math.max(k * peak, pre * sm(0.1, 0.4, p) * (1 - sm(at, at + 0.05, p)));
}

/** Faixa ocupada pelos alvos. */
export function span(f: F) {
  let a = Infinity, b = -Infinity, y = 0;
  for (const t of f.targets) { a = Math.min(a, t.x); b = Math.max(b, t.x); y += t.y; }
  return { minX: a, maxX: b, cx: (a + b) / 2, cy: y / f.targets.length };
}

/** Início escalonado do alvo i de n (de a até b). */
export const stagger = (i: number, n: number, a: number, b: number) => (n <= 1 ? (a + b) / 2 : a + ((b - a) * i) / (n - 1));

/** Clarão de tela inteira (aditivo). */
export function flash(ctx: CanvasRenderingContext2D, f: F, k: number, color: string, a = 0.45) {
  if (k <= 0.01) return;
  ctx.save();
  add(ctx);
  ctx.fillStyle = rgba(color, a * clamp(k));
  ctx.fillRect(-f.W, -f.W * 2, f.W * 3, f.W * 5);
  ctx.restore();
}

/** Aviso no chão: disco brilhante + anéis que se fecham (o golpe vai cair aqui). */
export function mark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, k: number, color: string, p: number, seed = 0) {
  if (k <= 0.01 || r <= 0) return;
  ctx.save();
  add(ctx);
  ctx.translate(x, y);
  ctx.scale(1, 0.3);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R(r));
  g.addColorStop(0, rgba(color, 0.12 * k));
  g.addColorStop(0.8, rgba(color, 0.45 * k));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, R(r), 0, TAU); ctx.fill();
  const pulse = 0.7 + 0.3 * Math.sin(p * 70 + seed);
  ctx.strokeStyle = rgba(lite(color, 0.4), k * pulse);
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(0, 0, R(r * 0.85), 0, TAU); ctx.stroke();
  for (let j = 0; j < 2; j++) {
    const q = (p * 4 + j / 2 + seed * 0.13) % 1;
    ctx.strokeStyle = rgba(color, k * q * 0.9);
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, R(r * (1.8 - q)), 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

/** Faíscas radiais sem sombra (dois traçados só). */
export function burst(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, reach: number, seed: number, color: string, n = 12, up = 0) {
  if (k <= 0 || k >= 1) return;
  ctx.save();
  add(ctx);
  ctx.lineCap = 'round';
  ctx.globalAlpha = 1 - k;
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass ? '#ffffff' : color;
    ctx.lineWidth = pass ? 2 : 5;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = up ? -Math.PI / 2 + (rnd(seed, i) - 0.5) * up : rnd(seed, i) * TAU;
      const sp = (0.4 + rnd(seed + 1, i) * 0.6) * reach;
      const d0 = easeOut(k) * sp, d1 = Math.max(0, d0 - 26 * (1 - k));
      const gy = 260 * k * k * (up ? 1 : 0.4);
      ctx.moveTo(x + Math.cos(a) * d1, y + Math.sin(a) * d1 + gy * 0.8);
      ctx.lineTo(x + Math.cos(a) * d0, y + Math.sin(a) * d0 + gy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Explosão: clarão, anel e faíscas. k = 0..1 desde o estouro. */
export function boom(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, k: number, c1: string, c2: string, seed: number, n = 10) {
  if (k <= 0 || k >= 1) return;
  const e = easeOut(k);
  ctx.save();
  add(ctx);
  orb(ctx, x, y, R(r * (0.6 + 0.9 * e)), c1, Math.pow(1 - k, 1.4));
  orb(ctx, x, y, R(r * 0.5 * (1 - k)), '#ffffff', 1 - k);
  ctx.strokeStyle = rgba(c2, (1 - k) * 0.9);
  ctx.lineWidth = Math.max(1, r * 0.16 * (1 - k));
  ctx.beginPath(); ctx.arc(x, y, R(r * (0.3 + 1.4 * e)), 0, TAU); ctx.stroke();
  ctx.restore();
  burst(ctx, x, y, k, r * 2.2, seed, c2, n);
}

/** Onda de choque achatada no chão. */
export function groundRing(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, rx: number, color: string, w = 10) {
  if (k <= 0 || k >= 1) return;
  const e = easeOut(k);
  ctx.save();
  add(ctx);
  ctx.strokeStyle = rgba(color, 1 - k);
  ctx.lineWidth = Math.max(0.5, w * (1 - k));
  ctx.beginPath(); ctx.ellipse(x, y, R(rx * (0.15 + e)), R(rx * 0.2 * (0.15 + e)), 0, 0, TAU); ctx.stroke();
  ctx.strokeStyle = rgba('#ffffff', (1 - k) * 0.8);
  ctx.lineWidth = Math.max(0.5, w * 0.35 * (1 - k));
  ctx.stroke();
  ctx.restore();
}

/** Poeira / fumaça (normal, não aditiva). */
export function dust(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, size: number, seed: number, color = '#9a8a78', n = 6, a = 0.45) {
  if (k <= 0 || k >= 1) return;
  ctx.save();
  ctx.fillStyle = rgba(color, a * (1 - k));
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const ang = Math.PI + (rnd(seed, i) - 0.5) * Math.PI * 1.1 + Math.PI / 2 * (i % 2 ? 1 : -1) * 0.6;
    const d = easeOut(k) * size * (0.6 + rnd(seed + 1, i));
    const px = x + Math.cos(ang) * d * 1.4, py = y - Math.abs(Math.sin(ang)) * d * 0.5 - k * size * 0.3;
    const r = R(size * (0.25 + 0.35 * k) * (0.6 + rnd(seed + 2, i) * 0.6));
    ctx.moveTo(px + r, py);
    ctx.arc(px, py, r, 0, TAU);
  }
  ctx.fill();
  ctx.restore();
}

/** Pontos de um raio (zigue-zague). */
export function boltPts(a: V, b: V, seed: number, n = 10, jit = 0.18): V[] {
  const out: V[] = [a];
  const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l, ny = dx / l;
  for (let i = 1; i < n; i++) {
    const j = (rnd(seed, i) - 0.5) * l * jit * Math.sin((i / n) * Math.PI);
    out.push({ x: a.x + (dx * i) / n + nx * j, y: a.y + (dy * i) / n + ny * j });
  }
  out.push(b);
  return out;
}

export function poly(ctx: CanvasRenderingContext2D, pts: V[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
}

/** Linha brilhante em 3 camadas (halo, cor, núcleo branco). */
export function glowLine(ctx: CanvasRenderingContext2D, pts: V[], w: number, color: string, a = 1) {
  if (a <= 0 || pts.length < 2) return;
  ctx.save();
  add(ctx);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  poly(ctx, pts);
  ctx.strokeStyle = rgba(color, 0.3 * a); ctx.lineWidth = w * 3.2; ctx.stroke();
  ctx.strokeStyle = rgba(color, 0.95 * a); ctx.lineWidth = w * 1.4; ctx.stroke();
  ctx.strokeStyle = rgba('#ffffff', a); ctx.lineWidth = w * 0.55; ctx.stroke();
  ctx.restore();
}

/** Raio com galhos. */
export function bolt(ctx: CanvasRenderingContext2D, a: V, b: V, seed: number, w: number, color: string, alpha = 1, branches = 2) {
  if (alpha <= 0) return;
  const pts = boltPts(a, b, seed, 12, 0.22);
  glowLine(ctx, pts, w, color, alpha);
  for (let k = 0; k < branches; k++) {
    const o = pts[3 + Math.floor(rnd(seed + 5, k) * (pts.length - 5))];
    const len = Math.hypot(b.x - a.x, b.y - a.y) * (0.15 + rnd(seed + 6, k) * 0.2);
    const ang = Math.atan2(b.y - a.y, b.x - a.x) + (rnd(seed + 7, k) - 0.5) * 2;
    glowLine(ctx, boltPts(o, { x: o.x + Math.cos(ang) * len, y: o.y + Math.sin(ang) * len }, seed + 11 * k, 5, 0.3), w * 0.5, color, alpha * 0.8);
  }
}

/** Brilho radial sem núcleo branco. */
export function haze(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number) {
  if (a <= 0 || r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, R(r));
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, R(r), 0, TAU); ctx.fill();
}

/** Ponto de bezier quadrática. */
export function qb(a: V, c: V, b: V, t: number): V {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

/** Pedra irregular (polígono) centrada na origem atual. */
export function rockPath(ctx: CanvasRenderingContext2D, r: number, seed: number, n = 8) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const rr = r * (0.72 + rnd(seed, i) * 0.38);
    if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
}

/** Cacos voando (pedra/cristal) sem sombra; cor única por chamada. */
export function chunks(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, seed: number, color: string, n = 10, power = 1, ground = Infinity) {
  if (k <= 0 || k >= 1) return;
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = Math.min(1, (1 - k) * 2.5);
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const vx = (rnd(seed, i) - 0.5) * 520 * power;
    const vy = -(160 + rnd(seed + 1, i) * 380) * power;
    const px = x + vx * k, py = Math.min(y + vy * k + 900 * k * k, ground);
    const r = 4 + rnd(seed + 2, i) * 9 * power;
    const a = k * 10 + i;
    const c = Math.cos(a), s = Math.sin(a);
    ctx.moveTo(px + c * r, py + s * r);
    ctx.lineTo(px - s * r * 0.7, py + c * r * 0.7);
    ctx.lineTo(px - c * r * 0.8, py - s * r * 0.8);
    ctx.lineTo(px + s * r * 0.5, py - c * r * 0.5);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}

/** Varia um número inteiro estável a partir do texto (escolhe variações por boss). */
export function hashStr(s: string) {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
