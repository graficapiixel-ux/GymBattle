/**
 * EVENTOS LENDÁRIOS — 1% das lutas (somando todos). Em algum momento da luta, um
 * lutador ativa o poder máximo do tipo da sua arma: a cena toma a tela por
 * LEGEND_SEC segundos, toca uma trilha épica só durante ela, e o adversário cai.
 */
import { BALANCE, type WeaponCategory } from '@gymbattle/shared';
import { KO, clamp, glow, noGlow, rgba, sm, type Actor } from './kit';
import type { Scene } from './types';
import { SWORD } from './scenes/sword';
import { GREATSWORD } from './scenes/greatsword';
import { KATANA } from './scenes/katana';
import { DAGGER } from './scenes/dagger';
import { AXE } from './scenes/axe';
import { HAMMER } from './scenes/hammer';
import { SPEAR } from './scenes/spear';
import { SCYTHE } from './scenes/scythe';
import { BOW } from './scenes/bow';
import { STAFF } from './scenes/staff';
import { SEAL } from './scenes/seal';
import { HYBRID } from './scenes/hybrid';

export type { Scene } from './types';
export type { Actor } from './kit';
export { KO as LEGEND_KO } from './kit';

/** Duração da cena, em segundos. */
export const LEGEND_SEC = BALANCE.combat.legendSec;
if (Math.abs(BALANCE.combat.legendKoFrac - KO) > 1e-9) console.warn('legendKoFrac difere do KO das cenas');

export const SCENES: Scene[] = [...SWORD, ...GREATSWORD, ...KATANA, ...DAGGER, ...AXE, ...HAMMER, ...SPEAR, ...SCYTHE, ...BOW, ...STAFF, ...SEAL, ...HYBRID];
export const SCENES_BY_ID: Record<string, Scene> = Object.assign(Object.create(null), Object.fromEntries(SCENES.map((s) => [s.id, s])));

/** Eventos possíveis para um tipo de arma (socos usam os da espada). */
export function scenesFor(cat: WeaponCategory | 'fist'): Scene[] {
  const list = SCENES.filter((s) => s.cat === cat);
  return list.length ? list : SCENES.filter((s) => s.cat === 'sword');
}

type View = { w: number; h: number };
type Pt = { x: number; y: number };

/** Tremida de câmera (em pixels de tela) no golpe final. */
export function legendShake(p: number): Pt {
  const k = sm(KO - 0.02, KO, p) * (1 - sm(KO, KO + 0.08, p));
  if (k <= 0) return { x: 0, y: 0 };
  return { x: Math.sin(p * 1300) * 9 * k, y: Math.cos(p * 1700) * 7 * k };
}

/** Por cima do cenário: o céu escurece e a cena monta o seu mundo. */
export function drawLegendBackdrop(ctx: CanvasRenderingContext2D, sc: Scene, p: number, view: View, a: Pt, b: Pt) {
  const dark = sm(0.01, 0.12, p) * (1 - sm(0.95, 1, p));
  if (dark <= 0) return;
  const { w, h } = view;
  ctx.save();
  try {
  ctx.globalAlpha = dark * 0.92;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, sc.sky[0]);
  g.addColorStop(1, sc.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = dark;
  sc.backdrop?.(ctx, p, view, a, b);
  } catch (e) { console.warn('legend backdrop', e); }
  ctx.restore();
}

export function drawLegendWorld(ctx: CanvasRenderingContext2D, sc: Scene, p: number, A: Actor, B: Actor) {
  ctx.save();
  try { sc.world(ctx, p, A, B); } catch (e) { console.warn('legend world', e); }
  ctx.restore();
}

/** Por cima de tudo: vinheta, faixas de cinema, título e clarão. */
export function drawLegendOverlay(ctx: CanvasRenderingContext2D, sc: Scene, p: number, view: View, a: Pt, b: Pt) {
  const { w, h } = view;
  const on = sm(0, 0.08, p) * (1 - sm(0.94, 1, p));
  ctx.save();
  if (on > 0) sc.overlay?.(ctx, p, view, a, b);
  // vinheta
  if (on > 0) {
    const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, `rgba(0,0,0,${0.55 * on})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }
  // faixas de cinema
  if (on > 0) {
    ctx.fillStyle = '#000';
    const bh = h * 0.09 * on;
    ctx.fillRect(0, 0, w, bh);
    ctx.fillRect(0, h - bh, w, bh);
  }
  // título (entra deslizando, com um traço de luz)
  const t = sm(0.04, 0.1, p) * (1 - sm(0.3, 0.37, p));
  if (t > 0) {
    const size = clamp(w * 0.055, 18, 54);
    const y = h * 0.25;
    ctx.globalAlpha = t;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // faixa escura atrás do nome
    const bg = ctx.createLinearGradient(0, 0, w, 0);
    bg.addColorStop(0, 'rgba(0,0,0,0)');
    bg.addColorStop(0.5, 'rgba(0,0,0,0.55)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, y - size * 1.25, w, size * 2.3);
    // traço de luz
    const lw = w * 0.7 * sm(0.04, 0.12, p);
    ctx.fillStyle = rgba(sc.glow, 0.9);
    glow(ctx, sc.glow, 12);
    ctx.fillRect(w / 2 - lw / 2, y + size * 0.52, lw, 2);
    ctx.fillRect(w / 2 - lw / 2, y - size * 0.62, lw, 1);
    const slide = (1 - sm(0.04, 0.1, p)) * 40;
    ctx.font = `900 italic ${size}px system-ui, "Segoe UI", sans-serif`;
    glow(ctx, sc.glow, 26);
    ctx.fillStyle = sc.color;
    ctx.fillText(sc.name, w / 2 + slide, y);
    noGlow(ctx);
    ctx.font = `700 ${size * 0.32}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillText(sc.sub.toUpperCase(), w / 2 - slide, y + size * 0.85);
    ctx.font = `800 ${size * 0.24}px system-ui, sans-serif`;
    ctx.fillStyle = sc.glow;
    ctx.fillText('✦  EVENTO LENDÁRIO  ✦', w / 2, y - size * 0.95);
  }
  // clarão do golpe final
  const f = sm(KO - 0.012, KO, p) * (1 - sm(KO, KO + 0.03, p));
  if (f > 0) {
    ctx.globalAlpha = f * 0.75;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}
