/**
 * Kit compartilhado dos BIZARROS (blob): estado de animação, locomoção de gosma
 * (estica-e-encolhe com a base plantada no chão), deformação de gelatina com
 * atraso e peças reaproveitadas (olho, boca).
 */
import type { BossSpec } from '@gymbattle/shared';
import type { DrawState, V } from '../types';
import { attacking, breathe, dying, hurtTint, mixHex, poseK, strike, windup, TAU, clamp, sm } from '../util';

/** Avanço no chão (unidades locais) a cada ciclo de `gait` — igual ao STRIDE do motor. */
export const STRIDE = 150;

export const frac = (v: number) => v - Math.floor(v);

/** Balanço amortecido depois de um instante `p0` (follow-through de gelatina). */
export function wob(p: number, p0: number, freq = 26, damp = 6) {
  if (p < p0) return 0;
  const d = p - p0;
  return Math.sin(d * freq) * Math.exp(-d * damp);
}

export interface Loco {
  /** Sentido do deslocamento no x local (−1 = avançando para a esquerda, +1 = recuando). */
  d: number;
  /** 0..1: intensidade da passada (some quando o boss para). */
  amp: number;
  /** Fase do MEIO ciclo (0 = a borda da frente acabou de pousar = pisada do motor). */
  h: number;
  /** Fase do ciclo inteiro (0..1). */
  ph: number;
  /** Deslocamento x (local) da borda que vai na frente / da que vai atrás (já com o sentido). */
  lead: number;
  trail: number;
  /** Quanto a borda da frente / de trás está levantada do chão (0..1). */
  liftLead: number;
  liftTrail: number;
  /** Fator de altura do corpo (conserva volume ao esticar) + baque da pisada. */
  sy: number;
  /** Baque da pisada (0..1, decai depois de pousar). */
  thud: number;
  /** Inclinação do topo no sentido do movimento + onda atrasada (x local no topo). */
  lean: number;
  /** Tremedeira de arrancar/frear (−1..1). */
  jig: number;
  /** Deslocamento do chão desde o início (para marcas que ficam paradas no chão). */
  ground: number;
}

/** Locomoção de lagarta-gosma: a frente estica e pousa, a traseira vem atrás e encolhe. */
export function loco(st: DrawState): Loco {
  const d = st.vx > 0.5 ? 1 : -1;
  const amp = sm(0, 0.3, st.move);
  const h = frac(st.gait * 2);
  const half = STRIDE / 2;
  // A pisada é em h=0: na 1ª metade a frente está plantada e a traseira desliza;
  // na 2ª metade a traseira está plantada e a frente se estica para o próximo passo.
  const lead = (half / 4 + half * (sm(0.5, 1, h) - h)) * d * amp;
  const trail = (-half / 4 + half * (sm(0, 0.5, h) - h)) * d * amp;
  const liftLead = Math.sin(Math.PI * clamp((h - 0.5) * 2)) * amp;
  const liftTrail = Math.sin(Math.PI * clamp(h * 2)) * amp;
  const stretch = (lead - trail) * d; // −37,5..+37,5
  const thud = Math.exp(-h * 9) * amp;
  const sy = 1 - stretch * 0.0028 - thud * 0.07;
  const lean = d * amp * (8 + 12 * st.move + 10 * Math.sin(TAU * (h - 0.3)));
  const jig = 4 * st.move * (1 - st.move) * Math.sin(st.t * 12);
  return { d, amp, h, ph: frac(st.gait), lead, trail, liftLead, liftTrail, sy, thud, lean, jig, ground: st.gait * STRIDE * d };
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
  /** Progresso do ataque (0 fora dele). */
  p: number;
  breath: number;
  slam: number;
  cast: number;
  swipe: number;
  charge: number;
  roar: number;
  shoot: number;
  /** Balanço amortecido após o impacto (−1..1). */
  fol: number;
  /** Abertura de boca padrão (sopro/grito/investida). */
  jaw: number;
  /** Tranco de dano (0..1) com balanço. */
  hit: number;
  L: Loco;
  map: (x: number, y: number) => V;
}

export function makeC(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState): C {
  const base = ctx.getTransform().inverse();
  const wu = windup(st);
  const sk = strike(st);
  const breath = poseK(st, 'breath');
  const shoot = poseK(st, 'shoot');
  const roar = poseK(st, 'roar');
  const charge = poseK(st, 'charge');
  const atkP = st.anim === 'attack' ? st.p : 0;
  return {
    P: s.pal,
    body: hurtTint(ctx, st, s.pal.body),
    dark: hurtTint(ctx, st, s.pal.dark),
    t: st.t,
    b: breathe(st, 1.8),
    wu,
    sk,
    atk: attacking(st),
    die: dying(st),
    p: atkP,
    breath,
    slam: poseK(st, 'slam'),
    cast: poseK(st, 'cast'),
    swipe: poseK(st, 'swipe'),
    charge,
    roar,
    shoot,
    fol: st.anim === 'attack' ? wob(st.p, 0.52) * (1 - sm(0.9, 1, st.p)) : 0,
    jaw: clamp(
      (breath + shoot) * (sm(0.3, 0.45, st.p) * (1 - sm(0.85, 1, st.p))) + roar * (wu * 0.3 + sk * 1.1) + charge * sk + dying(st) * 0.3,
    ),
    hit: st.hurt * (0.7 + 0.3 * Math.sin(st.t * 40)),
    L: loco(st),
    map: (x, y) => {
      const p = base.multiply(ctx.getTransform()).transformPoint({ x, y });
      return { x: p.x, y: p.y };
    },
  };
}

/** Mistura de cor com flash de dano (atalho). */
export const tint = (ctx: CanvasRenderingContext2D, st: DrawState, c: string) => hurtTint(ctx, st, c);
export { mixHex };

/**
 * Deformação de gelatina: leva um ponto do corpo em repouso (x, y≤0) para a pose atual.
 * A base acompanha as bordas plantadas; o topo vem com atraso; `extraLag` aumenta o atraso
 * de peças soltas (olhos, conteúdo boiando).
 */
export function jelly(c: C, W: number, H: number, o: { sx?: number; sy?: number; lean?: number; extraLag?: number } = {}) {
  const L = c.L;
  const sy = L.sy * (o.sy ?? 1);
  const sx = o.sx ?? 1;
  const leanX = o.lean ?? 0;
  const lag = o.extraLag ?? 0;
  return (x: number, y: number): V => {
    const u = clamp((x * L.d / W + 1) / 2); // 0 = borda de trás (no sentido do movimento), 1 = da frente
    const k = clamp(-y / H, 0, 1.4);
    let nx = x * sx + L.trail + (L.lead - L.trail) * u;
    // topo atrasado + inclinação + tremedeira (mais forte quanto mais alto)
    nx += (L.lean * (1 + lag) + leanX + L.jig * 10 * (1 + lag)) * k * k;
    let ny = y * sy * (1 + L.jig * 0.02);
    // lábio que desgruda do chão enquanto desliza
    const edge = Math.max(0, 1 - k * 4);
    ny -= edge * (L.liftLead * Math.pow(u, 6) + L.liftTrail * Math.pow(1 - u, 6)) * 12;
    return { x: nx, y: ny };
  };
}

/** Olho comum (esclera, íris, pupila e pálpebra). */
export function eyeball(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, iris: string, look: V, open: number, lid: string, squish = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1 / Math.sqrt(squish), squish);
  ctx.fillStyle = '#f4f0e0';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.clip();
  // sombra interna da esclera
  ctx.fillStyle = 'rgba(80,60,40,0.22)';
  ctx.beginPath();
  ctx.arc(r * 0.25, r * 0.3, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = iris;
  ctx.beginPath();
  ctx.arc(look.x * r * 0.4, look.y * r * 0.4, r * 0.55, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(look.x * r * 0.5, look.y * r * 0.5, r * 0.25, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffffffcc';
  ctx.beginPath();
  ctx.arc(-r * 0.35, -r * 0.4, r * 0.18, 0, TAU);
  ctx.fill();
  // pálpebra (de cima para baixo, com borda curva)
  if (open < 0.98) {
    ctx.fillStyle = lid;
    ctx.beginPath();
    ctx.moveTo(-r, -r);
    ctx.lineTo(r, -r);
    ctx.lineTo(r, -r + r * 2 * (1 - open));
    ctx.quadraticCurveTo(0, -r + r * 2 * (1 - open) + r * 0.5 * (1 - open), -r, -r + r * 2 * (1 - open));
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = lid;
  ctx.lineWidth = Math.max(1.5, r * 0.18);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/** Piscar (0..1 aberto) com período e semente próprios. */
export function blink(t: number, seed: number, period = 4.5) {
  const k = (t + seed * 7.3) % period;
  return k < 0.16 ? Math.abs(k - 0.08) / 0.08 : 1;
}

/** Boca com lábios e dentes (abre de 0 a 1). */
export function mouth(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, open: number, P: BossSpec['pal'], st: DrawState, ang: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  const h = Math.max(1.5, r * (0.12 + open * 0.75));
  // lábios
  ctx.fillStyle = hurtTint(ctx, st, mixHex(P.dark, P.glow, 0.35));
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.12, h + r * 0.22, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.2, -h - r * 0.08, r * 0.6, r * 0.08, 0, 0, TAU);
  ctx.fill();
  // interior
  ctx.fillStyle = '#2a0610';
  ctx.beginPath();
  ctx.ellipse(0, 0, r, h, 0, 0, TAU);
  ctx.fill();
  if (open > 0.4) {
    ctx.fillStyle = hurtTint(ctx, st, '#c83a5a');
    ctx.beginPath();
    ctx.ellipse(r * 0.1, h * 0.55, r * 0.5, h * 0.35, 0, 0, TAU);
    ctx.fill();
  }
  // dentes
  ctx.fillStyle = hurtTint(ctx, st, P.accent);
  const n = Math.max(4, Math.round(r / 6));
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n;
    const tx = -r + k * r * 2;
    const edge = Math.sin(k * Math.PI);
    const ty = h * edge;
    const tl = Math.min(r * 0.35, 4 + h * 0.4) * edge;
    ctx.moveTo(tx - r / n, -ty);
    ctx.lineTo(tx, -ty + tl);
    ctx.lineTo(tx + r / n, -ty);
    ctx.moveTo(tx - r / n, ty);
    ctx.lineTo(tx, ty - tl);
    ctx.lineTo(tx + r / n, ty);
  }
  ctx.fill();
  ctx.restore();
}

/** Sombra de contato no chão (elipse escura). */
export function groundShadow(ctx: CanvasRenderingContext2D, x: number, w: number, a = 0.3, h = 16) {
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  ctx.beginPath();
  ctx.ellipse(x, 2, Math.max(4, w), h, 0, 0, TAU);
  ctx.fill();
}
