/**
 * Kit de desenho dos EVENTOS LENDÁRIOS.
 * Tudo depende só do progresso `p` (0 → 1) e de sementes fixas: é determinístico,
 * então todo mundo que assiste vê exatamente a mesma cena.
 */
import type { AvatarLook, Equipment } from '@gymbattle/shared';
import { drawAvatar, RENDER_OPTS, type Pose } from '../../rig';
import { rnd } from '../vfx';

export { rnd };
export type V = { x: number; y: number };
export const TAU = Math.PI * 2;
export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
/** Suave de a até b (0 → 1). */
export const sm = (a: number, b: number, p: number) => {
  const t = clamp((p - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Linear de a até b (0 → 1). */
export const lin = (a: number, b: number, p: number) => clamp((p - a) / (b - a));
/** Janela: sobe em [a,b], fica, desce em [c,e]. */
export const win = (a: number, b: number, c: number, e: number, p: number) => sm(a, b, p) * (1 - sm(c, e, p));
export const easeIn = (t: number) => t * t * t;
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Momento (0–1) em que o adversário cai. */
export const KO = 0.8;

export interface Actor {
  x: number;
  y: number;
  facing: 1 | -1;
  look: AvatarLook;
  equipment: Equipment;
  /** Escala (1 = tamanho normal da arena). */
  s: number;
}

export function hexA(hex: string, a: number) {
  const n = Math.round(clamp(a) * 255).toString(16).padStart(2, '0');
  return hex.slice(0, 7) + n;
}
export function rgba(hex: string, a: number) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${clamp(a)})`;
}
export function glow(ctx: CanvasRenderingContext2D, color: string, blur: number) {
  // brilho (sombra) é caro: no modo de gráficos baixos fica bem menor
  ctx.shadowColor = color;
  ctx.shadowBlur = RENDER_OPTS.lowFx ? Math.min(blur * 0.3, 6) : blur;
}
export function noGlow(ctx: CanvasRenderingContext2D) {
  ctx.shadowBlur = 0;
}

// ------------------------------------------------------------------ poses

export const P = {
  guard: (w = 0.8): Pose => ({ bob: 1.5, lean: 0.1, head: -0.02, armB: [0.5, 1.4], armF: [0.9, 0.9], legB: [-0.3, 0.14], legF: [0.36, -0.2], weapon: w }),
  raise: (w = 0): Pose => ({ bob: 0, lean: -0.08, head: -0.25, armB: [2.7, 0.3], armF: [2.9, 0.2], legB: [-0.25, 0.08], legF: [0.3, -0.1], weapon: w, twoHanded: true }),
  point: (w = 0.3): Pose => ({ bob: 0.5, lean: -0.05, head: -0.3, armB: [0.3, 0.9], armF: [2.4, 0.1], legB: [-0.3, 0.14], legF: [0.36, -0.2], weapon: w }),
  strike: (w = 2.2): Pose => ({ bob: 6, lean: 0.5, head: 0.1, armB: [0.9, 0.4], armF: [1.2, 0.3], legB: [-0.7, 0.4], legF: [0.8, -0.9], weapon: w, twoHanded: true }),
  lunge: (w = 1.55): Pose => ({ bob: 7, lean: 0.4, head: 0.05, armB: [-0.6, 0.5], armF: [1.5, 0.05], legB: [-0.85, 0.3], legF: [0.9, -1.0], weapon: w }),
  crouch: (w = 2.4): Pose => ({ bob: 9, lean: 0.55, head: 0.05, armB: [0.2, 1.6], armF: [-0.2, 1.2], legB: [-0.6, 0.9], legF: [0.75, -1.1], weapon: w }),
  after: (w = 1.6): Pose => ({ bob: 5, lean: 0.35, head: 0.0, armB: [-0.4, 0.4], armF: [1.55, 0.05], legB: [-0.55, 0.5], legF: [0.7, -0.7], weapon: w }),
  palms: (): Pose => ({ bob: 0, lean: 0.02, head: -0.05, armB: [1.35, 1.35], armF: [1.2, 1.5], legB: [-0.22, 0.1], legF: [0.26, -0.12], weapon: 0.05 }),
  pray: (): Pose => ({ bob: 0, lean: -0.02, head: -0.35, armB: [0.9, 2.1], armF: [0.8, 2.2], legB: [-0.18, 0.06], legF: [0.2, -0.08], weapon: 0.1 }),
  cast: (w = 0.2): Pose => ({ bob: 0.5, lean: -0.05, head: -0.2, armB: [2.5, 0.4], armF: [1.7, 0.3], legB: [-0.3, 0.14], legF: [0.36, -0.2], weapon: w }),
  throwBack: (w = -0.9): Pose => ({ bob: 3, lean: -0.25, head: -0.1, armB: [1.2, 0.4], armF: [-1.6, 0.6], legB: [-0.6, 0.3], legF: [0.55, -0.4], weapon: w }),
  throwFwd: (w = 1.7): Pose => ({ bob: 5, lean: 0.45, head: 0.05, armB: [-0.8, 0.5], armF: [1.9, 0.1], legB: [-0.8, 0.3], legF: [0.8, -0.8], weapon: w }),
  kneelAim: (): Pose => ({ bob: 16, lean: -0.15, head: -0.55, armB: [2.0, 0.15], armF: [2.25, 0.05], legB: [-1.3, 1.6], legF: [0.9, -1.4], weapon: -0.55 }),
  aim: (): Pose => ({ bob: 1.5, lean: 0.02, head: 0, armB: [1.3, 1.6], armF: [1.55, 0.05], legB: [-0.3, 0.14], legF: [0.36, -0.2], weapon: 0.05 }),
  spin: (a: number, w = 1.5): Pose => ({ bob: 2, lean: 0.2 * Math.sin(a), head: 0, armB: [1.6, 0.2], armF: [1.6, 0.1], legB: [-0.35, 0.3], legF: [0.4, -0.3], weapon: w, twoHanded: true }),
  fly: (): Pose => ({ bob: 0, lean: 0.25, head: -0.1, armB: [-0.5, 0.6], armF: [1.4, 0.2], legB: [-0.5, 0.6], legF: [-0.1, 0.5], weapon: 1.4 }),
  dive: (w = 3.0): Pose => ({ bob: 0, lean: 0.9, head: 0.2, armB: [2.8, 0.2], armF: [2.9, 0.1], legB: [-0.4, 0.8], legF: [-0.1, 0.9], weapon: w, twoHanded: true }),
  hurt: (k: number): Pose => ({ bob: 2 + k * 4, lean: -0.35 * k, head: -0.3 * k, armB: [-0.6 * k, 0.4], armF: [-0.3 - 0.8 * k, 0.6], legB: [-0.3, 0.3], legF: [0.2, -0.2], weapon: -0.8 }),
};

export function avatar(ctx: CanvasRenderingContext2D, a: Actor, pose: Pose, o: { scale?: number; dx?: number; dy?: number; facing?: 1 | -1; t?: number; rot?: number; alpha?: number } = {}) {
  ctx.save();
  if (o.alpha !== undefined) ctx.globalAlpha *= clamp(o.alpha);
  ctx.translate(a.x + (o.dx ?? 0), a.y + (o.dy ?? 0));
  if (o.rot) {
    ctx.translate(0, -45 * a.s);
    ctx.rotate(o.rot);
    ctx.translate(0, 45 * a.s);
  }
  drawAvatar(ctx, { look: a.look, equipment: a.equipment, pose, facing: o.facing ?? a.facing, scale: a.s * (o.scale ?? 1), time: o.t ?? 0 });
  ctx.restore();
}

/** Silhueta colorida do lutador (auras, clones, sombras). */
let silCanvas: HTMLCanvasElement | null = null;
export function silhouette(ctx: CanvasRenderingContext2D, a: Actor, pose: Pose, color: string, alpha: number, o: { scale?: number; dx?: number; dy?: number; facing?: 1 | -1; blur?: number } = {}) {
  if (alpha <= 0.002) return;
  const S = a.s * (o.scale ?? 1);
  const W = Math.ceil(280 * S), H = Math.ceil(280 * S);
  if (!silCanvas) silCanvas = document.createElement('canvas');
  const c = silCanvas;
  if (c.width < W || c.height < H) { c.width = Math.max(c.width, W); c.height = Math.max(c.height, H); }
  const g = c.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, c.width, c.height);
  g.translate(W / 2, H * 0.8);
  drawAvatar(g, { look: a.look, equipment: a.equipment, pose, facing: o.facing ?? a.facing, scale: S });
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  if (o.blur) glow(ctx, color, o.blur);
  ctx.drawImage(c, 0, 0, W, H, a.x + (o.dx ?? 0) - W / 2, a.y + (o.dy ?? 0) - H * 0.8, W, H);
  ctx.restore();
}

/** Aura em camadas (fogo/energia) em volta do lutador. */
export function aura(ctx: CanvasRenderingContext2D, a: Actor, pose: Pose, colors: string[], amount: number, t: number, o: { scale?: number; dx?: number; dy?: number; facing?: 1 | -1 } = {}) {
  if (amount <= 0) return;
  colors.forEach((col, k) => {
    const flick = 1.07 + k * 0.045 + Math.sin(t * 40 + k * 2) * 0.012;
    silhouette(ctx, a, pose, col, amount * (0.6 - k * 0.14), { ...o, scale: (o.scale ?? 1) * flick, dy: (o.dy ?? 0) + 2 * a.s, blur: 14 * a.s });
  });
}

// ------------------------------------------------------------------ vítima

export type VictimStyle = 'fall' | 'split' | 'dissolve' | 'burn' | 'launch' | 'crush' | 'poison' | 'shock';

/** O adversário: treme durante a cena, cai no KO e a alma sobe. */
export function victim(ctx: CanvasRenderingContext2D, B: Actor, p: number, style: VictimStyle = 'fall', ko = KO) {
  const fall = sm(ko, ko + 0.1, p);
  const fade = 1 - sm(0.93, 1, p);
  const scared = p > 0.12 && p < ko;
  const shake = scared ? Math.sin(p * 500) * 0.9 * B.s : 0;
  const hurt = Math.max(sm(ko - 0.04, ko, p), scared ? 0.25 : 0);
  ctx.save();
  ctx.globalAlpha *= fade;
  let dx = shake, dy = 0, rot = -B.facing * fall * 1.45;
  if (style === 'launch' && p > ko) {
    const k = lin(ko, ko + 0.16, p);
    dx = -B.facing * k * 90 * B.s;
    dy = -Math.sin(k * Math.PI) * 120 * B.s;
    rot = -B.facing * k * 5;
  }
  if (style === 'crush' && p > ko) {
    rot = 0;
    ctx.translate(B.x, B.y);
    ctx.scale(1 + fall * 0.25, 1 - fall * 0.7);
    ctx.translate(-B.x, -B.y);
  }
  if (style === 'split' && p >= ko) {
    const H = 52 * B.s, off = sm(ko, ko + 0.14, p) * 12 * B.s;
    for (const top of [true, false]) {
      ctx.save();
      ctx.beginPath();
      if (top) ctx.rect(B.x - 300, B.y - 500, 600, 500 - H);
      else ctx.rect(B.x - 300, B.y - H, 600, 500);
      ctx.clip();
      avatar(ctx, B, P.hurt(0.5), { dx: top ? -B.facing * off : 0, dy: top ? -off * 0.2 : 0 });
      ctx.restore();
    }
    ctx.strokeStyle = '#fff';
    glow(ctx, '#ff2a3a', 14 * B.s);
    ctx.lineWidth = 2.2 * B.s;
    ctx.beginPath();
    ctx.moveTo(B.x - 34 * B.s, B.y - H);
    ctx.lineTo(B.x + 34 * B.s, B.y - H);
    ctx.stroke();
    ctx.restore();
    soul(ctx, B, p, ko);
    return;
  }
  if (style === 'dissolve' && p >= ko) {
    const k = lin(ko, 1, p);
    silhouette(ctx, B, P.hurt(1), '#e6f7ff', 1 - k * 1.6, { blur: 12 * B.s });
    for (let i = 0; i < 90; i++) {
      const x = B.x + (rnd(111, i) - 0.5) * 30 * B.s + (rnd(112, i) - 0.3) * k * 200 * B.s;
      const y = B.y - rnd(113, i) * 85 * B.s - k * rnd(114, i) * 140 * B.s;
      ctx.globalAlpha = (1 - k) * fade;
      ctx.fillStyle = i % 2 ? '#e6f7ff' : '#b9a8ff';
      ctx.fillRect(x, y, 2.2 * B.s, 2.2 * B.s);
    }
    ctx.restore();
    return;
  }
  ctx.translate(B.x + dx, B.y + dy);
  ctx.rotate(rot);
  ctx.translate(-B.x, -B.y);
  avatar(ctx, B, P.hurt(hurt));
  // tingimento do golpe (queimado, envenenado, eletrocutado)
  const tint = style === 'burn' ? '#ff5a10' : style === 'poison' ? '#3cff6a' : style === 'shock' ? '#9fe8ff' : null;
  if (tint && p > ko - 0.04) {
    const k = sm(ko - 0.04, ko + 0.04, p);
    silhouette(ctx, B, P.hurt(hurt), tint, k * 0.55 * (style === 'shock' ? 0.5 + 0.5 * Math.sin(p * 900) : 1), { blur: 10 * B.s });
  }
  ctx.restore();
  soul(ctx, B, p, ko);
}

function soul(ctx: CanvasRenderingContext2D, B: Actor, p: number, ko: number) {
  if (p <= ko + 0.05) return;
  const k = lin(ko + 0.05, 1, p);
  ctx.save();
  for (let i = 0; i < 16; i++) {
    const r = rnd(77, i);
    const y = B.y - 20 * B.s - k * (60 + r * 110) * B.s;
    const x = B.x + (rnd(78, i) - 0.5) * 50 * B.s + Math.sin(k * 8 + i) * 6 * B.s;
    ctx.globalAlpha = (1 - k) * 0.8;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, (1 + r * 2) * B.s, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// ------------------------------------------------------------------ formas

/** Pontos de uma curva de Bézier cúbica. */
export function bez(a: V, b: V, c: V, d: V, n = 24): V[] {
  const out: V[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push({
      x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
      y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
    });
  }
  return out;
}

/** Fita/tubo afinando ao longo de uma linha (caudas, serpentes, rastros). */
export function tube(ctx: CanvasRenderingContext2D, pts: V[], width: (t: number) => number, fill: string | CanvasGradient, o: { wobble?: number; seed?: number; time?: number } = {}) {
  if (pts.length < 2) return;
  const L: V[] = [], R: V[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let nx = -(b.y - a.y), ny = b.x - a.x;
    const l = Math.hypot(nx, ny) || 1;
    nx /= l; ny /= l;
    const t = i / (pts.length - 1);
    let w = width(t) / 2;
    if (o.wobble) w *= 1 + Math.sin((o.time ?? 0) * 30 + i * 1.7 + (o.seed ?? 0)) * o.wobble;
    L.push({ x: pts[i].x + nx * w, y: pts[i].y + ny * w });
    R.push({ x: pts[i].x - nx * w, y: pts[i].y - ny * w });
  }
  ctx.fillStyle = fill;
  ctx.beginPath();
  smoothPath(ctx, L, true);
  smoothPath(ctx, R.reverse(), false);
  ctx.closePath();
  ctx.fill();
}

export function smoothPath(ctx: CanvasRenderingContext2D, pts: V[], first: boolean) {
  if (first) ctx.moveTo(pts[0].x, pts[0].y);
  else ctx.lineTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
}

/** Lâmina espiritual (espada de luz) apontando para `ang` (0 = para cima). */
export function lightBlade(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, width: number, core: string, edge: string, alpha = 1, guard = true) {
  if (len <= 0 || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(ang);
  glow(ctx, edge, width * 2.2);
  const g = ctx.createLinearGradient(-width, 0, width, 0);
  g.addColorStop(0, rgba(edge, 0.55));
  g.addColorStop(0.35, rgba(core, 0.95));
  g.addColorStop(0.5, '#ffffff');
  g.addColorStop(0.65, rgba(core, 0.95));
  g.addColorStop(1, rgba(edge, 0.55));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-width * 0.8, 0);
  ctx.lineTo(-width, -len * 0.82);
  ctx.lineTo(0, -len);
  ctx.lineTo(width, -len * 0.82);
  ctx.lineTo(width * 0.8, 0);
  ctx.closePath();
  ctx.fill();
  // sulco central
  noGlow(ctx);
  ctx.strokeStyle = rgba(edge, 0.5);
  ctx.lineWidth = Math.max(1, width * 0.12);
  ctx.beginPath();
  ctx.moveTo(0, -width);
  ctx.lineTo(0, -len * 0.85);
  ctx.stroke();
  if (guard) {
    glow(ctx, edge, width);
    ctx.fillStyle = edge;
    ctx.beginPath();
    ctx.moveTo(-width * 2.2, 0);
    ctx.quadraticCurveTo(0, -width * 0.9, width * 2.2, 0);
    ctx.quadraticCurveTo(0, width * 0.6, -width * 2.2, 0);
    ctx.fill();
    ctx.fillStyle = core;
    ctx.fillRect(-width * 0.35, 0, width * 0.7, width * 2.2);
    ctx.beginPath();
    ctx.arc(0, 0, width * 0.45, 0, TAU);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  ctx.restore();
}

/** Círculo mágico com runas (tilt < 1 achata em perspectiva). */
export function magicCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number, rot: number, tilt = 1, seed = 1) {
  if (r <= 0 || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  ctx.translate(x, y);
  ctx.scale(1, tilt);
  glow(ctx, color, r * 0.12);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  const lw = Math.max(1, r * 0.018);
  ctx.lineWidth = lw * 2;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
  ctx.lineWidth = lw;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, TAU); ctx.stroke();
  // anel de runas girando
  ctx.save();
  ctx.rotate(rot);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    ctx.save();
    ctx.translate(Math.cos(a) * r * 0.76, Math.sin(a) * r * 0.76);
    ctx.rotate(a + Math.PI / 2);
    glyph(ctx, r * 0.055, Math.floor(rnd(seed, i) * 8));
    ctx.restore();
  }
  ctx.restore();
  // estrelas internas (duas, girando em sentidos opostos)
  for (const [k, n, sc] of [[-1.3, 6, 0.62], [0.8, 5, 0.9]] as const) {
    ctx.save();
    ctx.rotate(rot * k);
    ctx.beginPath();
    const step = n === 6 ? 2 : 2;
    for (let i = 0; i <= n; i++) {
      const a = ((i * step) / n) * TAU - Math.PI / 2;
      const px = Math.cos(a) * r * sc, py = Math.sin(a) * r * sc;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }
  // brilho do centro
  noGlow(ctx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, rgba(color, 0.35));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.restore();
}

export function glyph(ctx: CanvasRenderingContext2D, r: number, k: number) {
  ctx.beginPath();
  switch (k) {
    case 0: ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.moveTo(-r * 0.7, -r * 0.3); ctx.lineTo(r * 0.7, -r * 0.3); break;
    case 1: ctx.moveTo(-r * 0.8, r * 0.6); ctx.lineTo(0, -r); ctx.lineTo(r * 0.8, r * 0.6); break;
    case 2: ctx.moveTo(-r * 0.7, -r * 0.7); ctx.lineTo(r * 0.7, r * 0.7); ctx.moveTo(r * 0.7, -r * 0.7); ctx.lineTo(-r * 0.7, r * 0.7); break;
    case 3: ctx.arc(0, 0, r * 0.6, 0, TAU); ctx.moveTo(0, -r); ctx.lineTo(0, r); break;
    case 4: ctx.moveTo(-r * 0.6, -r); ctx.lineTo(r * 0.6, -r * 0.2); ctx.lineTo(-r * 0.6, r * 0.4); ctx.lineTo(r * 0.6, r); break;
    case 5: ctx.moveTo(-r * 0.8, 0); ctx.lineTo(r * 0.8, 0); ctx.moveTo(0, -r); ctx.lineTo(-r * 0.5, r); ctx.moveTo(0, -r); ctx.lineTo(r * 0.5, r); break;
    case 6: ctx.moveTo(-r * 0.7, -r); ctx.lineTo(-r * 0.7, r); ctx.lineTo(r * 0.7, r); ctx.moveTo(-r * 0.7, 0); ctx.lineTo(r * 0.5, 0); break;
    default: ctx.moveTo(0, -r); ctx.lineTo(r * 0.8, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.8, 0); ctx.closePath(); break;
  }
  ctx.stroke();
}

/** Raio (relâmpago) com ramificações. */
export function lightning(ctx: CanvasRenderingContext2D, a: V, b: V, seed: number, width: number, color: string, alpha = 1, branches = 3) {
  if (alpha <= 0) return;
  const pts = boltPts(a, b, seed, 14);
  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  glow(ctx, color, width * 8);
  ctx.strokeStyle = color;
  ctx.lineWidth = width * 2.4;
  stroke(ctx, pts);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = width;
  stroke(ctx, pts);
  for (let k = 0; k < branches; k++) {
    const i = 2 + Math.floor(rnd(seed + 5, k) * (pts.length - 4));
    const o = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y) * (0.15 + rnd(seed + 6, k) * 0.2);
    const ang = Math.atan2(b.y - a.y, b.x - a.x) + (rnd(seed + 7, k) - 0.5) * 1.8;
    const bp = boltPts(o, { x: o.x + Math.cos(ang) * len, y: o.y + Math.sin(ang) * len }, seed + 11 * k, 6);
    ctx.strokeStyle = color;
    ctx.lineWidth = width * 1.1;
    stroke(ctx, bp);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = width * 0.45;
    stroke(ctx, bp);
  }
  ctx.restore();
}
function boltPts(a: V, b: V, seed: number, n: number): V[] {
  const out: V[] = [a];
  const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l, ny = dx / l;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const j = (rnd(seed, i) - 0.5) * l * 0.16;
    out.push({ x: a.x + dx * t + nx * j, y: a.y + dy * t + ny * j });
  }
  out.push(b);
  return out;
}
function stroke(ctx: CanvasRenderingContext2D, pts: V[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

/** Lua crescente / meia-lua de energia. `ang` = direção para onde a barriga aponta. */
export function crescent(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, thick: number, ang: number, core: string, edge: string, alpha = 1, span = 2.4) {
  if (r <= 0 || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  ctx.translate(x, y);
  ctx.rotate(ang);
  glow(ctx, edge, thick * 1.6);
  const g = ctx.createRadialGradient(0, 0, Math.max(0, r - thick), 0, 0, r);
  g.addColorStop(0, rgba(edge, 0));
  g.addColorStop(0.55, rgba(core, 0.9));
  g.addColorStop(0.85, '#ffffff');
  g.addColorStop(1, rgba(edge, 0.8));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, -span / 2, span / 2);
  ctx.quadraticCurveTo(r - thick * 1.4, 0, Math.cos(-span / 2) * r, Math.sin(-span / 2) * r);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Raios de luz saindo de um ponto. */
export function godRays(ctx: CanvasRenderingContext2D, x: number, y: number, n: number, len: number, width: number, color: string, alpha: number, rot = 0, spread = TAU) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  ctx.translate(x, y);
  ctx.rotate(rot);
  for (let i = 0; i < n; i++) {
    const a = -spread / 2 + (spread * (i + 0.5)) / n + (rnd(301, i) - 0.5) * 0.1;
    const l = len * (0.6 + rnd(302, i) * 0.4);
    const w = width * (0.5 + rnd(303, i));
    const g = ctx.createLinearGradient(0, 0, Math.cos(a) * l, Math.sin(a) * l);
    g.addColorStop(0, rgba(color, 0.9));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a - w) * l, Math.sin(a - w) * l);
    ctx.lineTo(Math.cos(a + w) * l, Math.sin(a + w) * l);
    ctx.fill();
  }
  ctx.restore();
}

/** Onda de choque achatada no chão. */
export function shockwave(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, s: number, color: string, size = 1) {
  if (k <= 0 || k >= 1) return;
  ctx.save();
  glow(ctx, color, 20 * s);
  ctx.strokeStyle = rgba(color, 1 - k);
  ctx.lineWidth = 9 * s * (1 - k);
  ctx.beginPath();
  ctx.ellipse(x, y, (30 + k * 280) * s * size, (8 + k * 46) * s * size, 0, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = 3 * s * (1 - k);
  ctx.strokeStyle = rgba('#ffffff', 1 - k);
  ctx.beginPath();
  ctx.ellipse(x, y - 30 * s * k, (20 + k * 180) * s * size, (40 + k * 140) * s * size, 0, Math.PI, TAU);
  ctx.stroke();
  ctx.restore();
}

/** Pedaços de pedra voando. */
export function debris(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, s: number, seed: number, colors = ['#5a4030', '#7a5a40', '#ff9a40'], n = 26, power = 1) {
  if (k <= 0 || k >= 1) return;
  ctx.save();
  for (let i = 0; i < n; i++) {
    const vx = (rnd(seed, i) - 0.5) * 420 * s * power;
    const vy = -(140 + rnd(seed + 1, i) * 320) * s * power;
    const t = k * 0.95;
    const px = x + vx * t, py = Math.min(y + vy * t + 620 * s * t * t, y);
    ctx.fillStyle = colors[i % colors.length];
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(k * 12 + i);
    const r = (2.5 + rnd(seed + 2, i) * 6) * s;
    ctx.beginPath();
    ctx.moveTo(-r, -r * 0.4); ctx.lineTo(-r * 0.2, -r); ctx.lineTo(r, -r * 0.3); ctx.lineTo(r * 0.6, r * 0.8); ctx.lineTo(-r * 0.7, r * 0.6);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** Faíscas brilhantes (explosão radial). */
export function sparks(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, s: number, seed: number, color: string, n = 30, reach = 160) {
  if (k <= 0 || k >= 1) return;
  ctx.save();
  glow(ctx, color, 8 * s);
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = rnd(seed, i) * TAU;
    const sp = (0.4 + rnd(seed + 1, i) * 0.6) * reach * s;
    const d0 = easeOut(k) * sp, d1 = Math.max(0, d0 - 18 * s * (1 - k));
    ctx.strokeStyle = i % 3 ? color : '#ffffff';
    ctx.globalAlpha = 1 - k;
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * d1, y + Math.sin(a) * d1);
    ctx.lineTo(x + Math.cos(a) * d0, y + Math.sin(a) * d0);
    ctx.stroke();
  }
  ctx.restore();
}

/** Brilho redondo (explosão, núcleo de energia). */
export function orb(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 1, core = '#ffffff') {
  if (r <= 0 || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, core);
  g.addColorStop(0.25, rgba(color, 0.95));
  g.addColorStop(0.6, rgba(color, 0.35));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Coluna de luz vertical. */
export function pillar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, alpha: number) {
  if (alpha <= 0 || w <= 0) return;
  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
  g.addColorStop(0, rgba(color, 0));
  g.addColorStop(0.3, rgba(color, 0.7));
  g.addColorStop(0.5, 'rgba(255,255,255,0.97)');
  g.addColorStop(0.7, rgba(color, 0.7));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - w, y - h, w * 2, h);
  orb(ctx, x, y, w * 2.4, color, 0.8);
  ctx.restore();
}

/** Partículas subindo (brasas, poeira de luz). */
export function rising(ctx: CanvasRenderingContext2D, x: number, y: number, wdt: number, hgt: number, p: number, seed: number, n: number, color: string, s: number, alpha = 1, size = 2) {
  if (alpha <= 0) return;
  ctx.save();
  glow(ctx, color, 6 * s);
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const sp = 0.6 + rnd(seed, i) * 0.8;
    const k = (rnd(seed + 1, i) + p * 3 * sp) % 1;
    const px = x + (rnd(seed + 2, i) - 0.5) * wdt + Math.sin(p * 12 + i) * 6 * s;
    const py = y - k * hgt;
    ctx.globalAlpha = alpha * Math.sin(k * Math.PI);
    const r = size * s * (0.6 + rnd(seed + 3, i));
    ctx.fillRect(px - r / 2, py - r / 2, r, r);
  }
  ctx.restore();
}

/** Linhas de velocidade convergindo para um ponto (tela). */
export function speedLines(ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number, alpha: number, seed: number, color = '#ffffff') {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = clamp(alpha);
  ctx.fillStyle = color;
  const R = Math.hypot(w, h);
  for (let i = 0; i < 70; i++) {
    const a = rnd(seed, i) * TAU;
    const r0 = R * (0.35 + rnd(seed + 1, i) * 0.25);
    const wd = 0.004 + rnd(seed + 2, i) * 0.01;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a - wd) * R, cy + Math.sin(a - wd) * R);
    ctx.lineTo(cx + Math.cos(a + wd) * R, cy + Math.sin(a + wd) * R);
    ctx.fill();
  }
  ctx.restore();
}

export function stars(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, color: string, a: number, seed = 29) {
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = a * (0.3 + rnd(seed + 2, i) * 0.7);
    const sz = 0.8 + rnd(seed + 4, i) * 1.6;
    ctx.fillRect(rnd(seed, i) * w, rnd(seed + 1, i) * h * 0.85, sz, sz);
  }
  ctx.restore();
}

/** Nuvens pesadas de tempestade (tela). */
export function stormClouds(ctx: CanvasRenderingContext2D, w: number, h: number, p: number, color: string, alpha: number, seed = 5) {
  ctx.save();
  ctx.globalAlpha = clamp(alpha);
  for (let i = 0; i < 16; i++) {
    const x = ((rnd(seed, i) * (w + 300) + p * 60 * (i % 2 ? 1 : -1)) % (w + 300)) - 150;
    const y = h * (0.02 + rnd(seed + 1, i) * 0.25);
    const r = h * (0.12 + rnd(seed + 2, i) * 0.14);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** Lua grande (com corona opcional para eclipse). */
export function moon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number, halo = 2) {
  ctx.save();
  ctx.globalAlpha = clamp(alpha);
  const g = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * halo);
  g.addColorStop(0, rgba(color, 0.4));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r * halo, 0, TAU); ctx.fill();
  const b = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  b.addColorStop(0, '#ffffff');
  b.addColorStop(1, color);
  ctx.fillStyle = b;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.arc(x + (rnd(3, i) - 0.5) * r * 1.2, y + (rnd(4, i) - 0.5) * r * 1.2, r * (0.05 + rnd(5, i) * 0.13), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** Rachadura brilhante no chão (de x0 até x1). */
export function groundCrack(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, k: number, s: number, seed: number, color: string, width = 3) {
  if (k <= 0) return;
  ctx.save();
  glow(ctx, color, 16 * s);
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  const n = 18;
  const pts: V[] = [];
  for (let i = 0; i <= n * k; i++) pts.push({ x: x0 + ((x1 - x0) * i) / n, y: y + (rnd(seed, i) - 0.3) * 5 * s });
  if (pts.length < 2) { ctx.restore(); return; }
  ctx.lineWidth = width * s;
  stroke(ctx, pts);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = width * 0.35 * s;
  stroke(ctx, pts);
  // galhos
  ctx.strokeStyle = color;
  ctx.lineWidth = width * 0.5 * s;
  for (let i = 2; i < pts.length; i += 3) {
    ctx.beginPath();
    ctx.moveTo(pts[i].x, pts[i].y);
    ctx.lineTo(pts[i].x + (rnd(seed + 1, i) - 0.5) * 30 * s, pts[i].y + (4 + rnd(seed + 2, i) * 8) * s);
    ctx.stroke();
  }
  ctx.restore();
}

/** Fumaça (nuvem que se expande e some). */
export function smoke(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, k: number, seed: number, color = 'rgba(60,30,90,', size = 1) {
  if (k <= 0 || k >= 1) return;
  ctx.save();
  for (let i = 0; i < 8; i++) {
    const a = rnd(seed, i) * TAU;
    ctx.fillStyle = `${color}${(1 - k) * 0.6})`;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * k * 30 * s * size, y + Math.sin(a) * k * 22 * s * size, (8 + k * 14) * s * size, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** Chama em forma de gota (fogo-fátuo, labareda). */
export function flame(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, inner: string, outer: string, alpha = 1) {
  if (alpha <= 0 || r <= 0) return;
  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  const g = ctx.createRadialGradient(x, y, 0, x, y - r, r * 2.4);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, inner);
  g.addColorStop(1, rgba(outer, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - r, y);
  ctx.quadraticCurveTo(x - r, y + r, x, y + r);
  ctx.quadraticCurveTo(x + r, y + r, x + r, y);
  ctx.quadraticCurveTo(x + r * 0.4, y - r * 1.2, x + Math.sin(t) * r * 0.5, y - r * 2.8);
  ctx.quadraticCurveTo(x - r * 0.4, y - r * 1.2, x - r, y);
  ctx.fill();
  ctx.restore();
}
