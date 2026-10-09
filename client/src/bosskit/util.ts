/** Utilitários de desenho dos bosses (reaproveita o kit das cenas lendárias). */
export {
  TAU, clamp, sm, lin, win, easeIn, easeOut, mix, hexA, rgba, glow, noGlow, bez, tube, smoothPath, lightBlade, magicCircle,
  lightning, crescent, godRays, shockwave, debris, sparks, orb, pillar, rising, speedLines, stars, groundCrack, smoke, flame, rnd,
} from '../game/arena/legend/kit';
export { shade } from '../game/rig';
import type { DrawState } from './types';
import { sm } from '../game/arena/legend/kit';

/** Preparação do ataque (0→1 até p=0,35). */
export const windup = (st: DrawState) => (st.anim === 'attack' ? sm(0, 0.35, st.p) * (1 - sm(0.42, 0.55, st.p)) : 0);
/** Golpe (sobe rápido em 0,35–0,5 e volta em 0,75–1). */
export const strike = (st: DrawState) => (st.anim === 'attack' ? sm(0.38, 0.52, st.p) * (1 - sm(0.72, 1, st.p)) : 0);
/** Intensidade geral do ataque (0..1 durante quase toda a animação). */
export const attacking = (st: DrawState) => (st.anim === 'attack' ? sm(0, 0.15, st.p) * (1 - sm(0.85, 1, st.p)) : 0);
/** Respiração (−1..1). */
export const breathe = (st: DrawState, speed = 1.6) => Math.sin(st.t * speed);
/** Queda na morte (0..1). */
export const dying = (st: DrawState) => (st.anim === 'death' ? st.p : 0);
/** Pose atual é esta? (com intensidade do ataque) */
export const poseK = (st: DrawState, ...poses: string[]) => (st.anim === 'attack' && poses.includes(st.pose) ? 1 : 0);

/** Pinta de branco por cima (flash de dano): chame depois de desenhar uma forma. */
export function hurtTint(ctx: CanvasRenderingContext2D, st: DrawState, base: string) {
  return st.hurt > 0.02 ? mixHex(base, '#ffffff', st.hurt * 0.75) : base;
}

export function mixHex(a: string, b: string, k: number) {
  const pa = parseInt(a.slice(1, 7), 16);
  const pb = parseInt(b.slice(1, 7), 16);
  const ch = (s: number) => [(pa >> s) & 255, (pb >> s) & 255];
  const m = (s: number) => {
    const [x, y] = ch(s);
    return Math.round(x + (y - x) * Math.max(0, Math.min(1, k)));
  };
  return '#' + ((m(16) << 16) | (m(8) << 8) | m(0)).toString(16).padStart(6, '0');
}

/** Gradiente vertical rápido. */
export function vgrad(ctx: CanvasRenderingContext2D, y0: number, y1: number, c0: string, c1: string) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  return g;
}

/** Gradiente radial rápido. */
export function rgrad(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c0: string, c1: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(0.01, r));
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  return g;
}

/** Olho brilhante. */
export function eyeGlow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, open = 1) {
  if (open <= 0.02 || r <= 0) return;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = r * 3;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, r, Math.max(0.3, r * 0.6 * open), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.2, y, r * 0.35, Math.max(0.2, r * 0.25 * open), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Número pseudoaleatório estável (0..1). */
export function h01(i: number, k = 0) {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
}
