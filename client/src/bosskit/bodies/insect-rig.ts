/**
 * INSETOS — esqueleto comum: marcha em tripé/tetrápode (pés plantados de verdade),
 * cinemática inversa das pernas, tempos dos golpes e peças de desenho com volume.
 */
import type { BossSpec } from '@gymbattle/shared';
import type { DrawState, V } from '../types';
import { TAU, clamp, hexA, hurtTint, mixHex, rgrad, sm } from '../util';

export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const frac = (x: number) => x - Math.floor(x);

/** Gira um ponto em volta de um pivô. */
export const rot = (p: V, c: V, a: number): V => {
  const cs = Math.cos(a), sn = Math.sin(a);
  return { x: c.x + (p.x - c.x) * cs - (p.y - c.y) * sn, y: c.y + (p.x - c.x) * sn + (p.y - c.y) * cs };
};
export const add = (p: V, x: number, y: number): V => ({ x: p.x + x, y: p.y + y });

// hurtTint não usa o contexto: um "nulo" evita passar ctx por todo lado
export const ctxNull = null as unknown as CanvasRenderingContext2D;

/** Cores já com o flash de dano. */
export function colors(s: BossSpec, st: DrawState) {
  const P = s.pal;
  const T = (h: string) => hurtTint(ctxNull, st, h);
  return {
    body: T(P.body), dark: T(P.dark), accent: T(P.accent), glow: P.glow, eye: P.eye,
    light: T(mixHex(P.body, '#ffffff', 0.3)), line: T(mixHex(P.dark, '#000000', 0.45)),
    mid: T(mixHex(P.body, P.dark, 0.5)), T,
  };
}
export type C = ReturnType<typeof colors>;

// ------------------------------------------------------------------ tempos do golpe

/**
 * Curvas do golpe em função de p (podem ser avaliadas em p atrasado para
 * sobreposição/rastro): ant = antecipação (0..0,4), hit = golpe rápido (0,44..0,55,
 * segura e volta suave até 1), imp = tranco do impacto (0,55), ov = passar do ponto.
 */
export function beatAt(p: number) {
  return {
    ant: sm(0.03, 0.38, p) * (1 - sm(0.42, 0.53, p)),
    hit: sm(0.42, 0.545, p) * (1 - sm(0.66, 0.98, p)),
    imp: sm(0.5, 0.556, p) * (1 - sm(0.56, 0.8, p)),
    ov: sm(0.53, 0.6, p) * (1 - sm(0.6, 0.84, p)),
  };
}
export type Beat = ReturnType<typeof beatAt>;
export const NOBEAT: Beat = { ant: 0, hit: 0, imp: 0, ov: 0 };

/** Pesos de cada pose (1 na pose atual do ataque). */
export function poseW(st: DrawState) {
  const on = st.anim === 'attack';
  const is = (...ps: string[]) => (on && ps.includes(st.pose) ? 1 : 0);
  return {
    on: on ? 1 : 0, swipe: is('swipe'), charge: is('charge'), cast: is('cast'), shoot: is('shoot', 'breath'),
    roar: is('roar'), slam: is('slam'),
  };
}
export type PW = ReturnType<typeof poseW>;

// ------------------------------------------------------------------ marcha

export interface Gait {
  g: number;
  /** +1 avançando (esquerda), −1 recuando, 0 parado. */
  dir: number;
  mv: number;
  /** Deslocamento do corpo (unid. locais) por ciclo. */
  S: number;
  lift: number;
  /** Fração do ciclo com o pé apoiado. */
  D: number;
}

export function gaitOf(st: DrawState, ks: number, lift: number, D = 0.56): Gait {
  const mv = clamp(st.move);
  return {
    g: st.gait, dir: clamp(-st.vx / 6, -1, 1), mv, S: 150 / ks, D,
    // andar rápido = passos mais altos e decididos; parando, a perna no ar desce
    lift: lift * (0.45 + 0.55 * mv) * clamp(mv * 4),
  };
}

/**
 * Posição do pé de uma perna. base = ponto neutro no chão; ph = fase da perna.
 * Apoiado: o pé fica PARADO no mundo (escorrega para trás no corpo à mesma velocidade
 * do deslocamento). No ar: levanta, avança rápido e pisa.
 */
export function stepFoot(G: Gait, baseX: number, ph: number, liftK = 1): V & { sw: number } {
  const q = frac(G.g + ph);
  const half = G.S * G.D * 0.5 * G.dir;
  if (q < G.D) {
    const u = q / G.D;
    return { x: baseX - half + 2 * half * u, y: 0, sw: 0 };
  }
  const u = (q - G.D) / (1 - G.D);
  const e = u * u * (3 - 2 * u);
  // sobe rápido, desce firme (pisada precisa)
  const up = Math.sin(Math.PI * Math.pow(u, 0.75));
  return { x: baseX + half - 2 * half * e, y: -G.lift * liftK * up, sw: up * clamp(G.mv * 4) };
}

/** Afundar do corpo no apoio: máximo logo depois de cada pisada (2 por ciclo). */
export const gaitBob = (G: Gait, amp: number) => amp * G.mv * (0.5 + 0.5 * Math.cos(4 * Math.PI * (G.g - 0.06)));

/** Ajeitar uma perna de vez em quando no idle (troca de peso). */
export function fidget(st: DrawState, i: number, n: number, seed: number, idle: number) {
  if (idle <= 0.02) return 0;
  const per = 2.6 + (seed % 7) * 0.13;
  const k = st.t / per + seed * 0.37;
  const which = Math.floor(k) % n;
  if (which !== i) return 0;
  const f = frac(k);
  return f < 0.16 ? Math.sin((f / 0.16) * Math.PI) * idle : 0;
}

// ------------------------------------------------------------------ cinemática inversa

/** Joelho de uma perna de 2 segmentos (fica do lado de CIMA, como pernas de inseto). */
export function ik(h: V, f: V, l1: number, l2: number, down = false): V {
  const dx = f.x - h.x, dy = f.y - h.y;
  const d = Math.hypot(dx, dy) || 1;
  const dd = clamp(d, Math.abs(l1 - l2) + 1, l1 + l2 - 0.5);
  const a = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd);
  const hh = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / d, uy = dy / d;
  const bx = h.x + ux * a, by = h.y + uy * a;
  const k1 = { x: bx - uy * hh, y: by + ux * hh }, k2 = { x: bx + uy * hh, y: by - ux * hh };
  return (k1.y < k2.y) !== down ? k1 : k2;
}

// ------------------------------------------------------------------ peças de desenho

/** Segmento com volume: tubo afunilado + contorno + filete de luz no lado de cima. */
export function limb(ctx: CanvasRenderingContext2D, a: V, b: V, wa: number, wb: number, fill: string, line: string, hi?: string) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const nx = Math.cos(ang + Math.PI / 2), ny = Math.sin(ang + Math.PI / 2);
  const ra = wa / 2, rb = wb / 2;
  ctx.beginPath();
  ctx.moveTo(a.x + nx * ra, a.y + ny * ra);
  ctx.lineTo(b.x + nx * rb, b.y + ny * rb);
  ctx.arc(b.x, b.y, rb, ang + Math.PI / 2, ang - Math.PI / 2, true);
  ctx.lineTo(a.x - nx * ra, a.y - ny * ra);
  ctx.arc(a.x, a.y, ra, ang - Math.PI / 2, ang - Math.PI * 1.5, true);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = line;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  if (hi) {
    const sd = ny < 0 ? 1 : -1;
    ctx.strokeStyle = hi;
    ctx.lineWidth = Math.max(1, Math.min(wa, wb) * 0.22);
    ctx.beginPath();
    ctx.moveTo(a.x + sd * nx * ra * 0.45, a.y + sd * ny * ra * 0.45);
    ctx.lineTo(b.x + sd * nx * rb * 0.45, b.y + sd * ny * rb * 0.45);
    ctx.stroke();
  }
}

export interface LegLook {
  w: number;
  fill: string;
  line: string;
  hi?: string;
  joint: string;
  spikes?: number;
  /** Comprimento do tarso (pezinho com garra). */
  tars?: number;
}

/**
 * Perna articulada inteira: coxa → fêmur → tíbia (IK) → tarso com garra apoiado no chão.
 * Devolve o joelho.
 */
export function leg(ctx: CanvasRenderingContext2D, hip: V, foot: V, l1: number, l2: number, L: LegLook, down = false, kneeFn?: (ankle: V, ikKnee: V) => V): V {
  const out = foot.x < hip.x ? -1 : 1;
  const t = L.tars ?? L.w * 1.4;
  // tornozelo um pouco acima e para dentro: o tarso deita no chão até a garra
  const lifted = clamp(-foot.y / 20);
  const ankle = { x: foot.x - out * t * (0.75 - lifted * 0.35), y: foot.y - t * (0.45 + lifted * 0.4) };
  let knee = ik(hip, ankle, l1, l2, down);
  if (kneeFn) knee = kneeFn(ankle, knee);
  limb(ctx, hip, knee, L.w, L.w * 0.78, L.fill, L.line, L.hi);
  limb(ctx, knee, ankle, L.w * 0.62, L.w * 0.36, L.fill, L.line, L.hi);
  limb(ctx, ankle, foot, L.w * 0.34, L.w * 0.16, L.fill, L.line);
  if (L.spikes) {
    ctx.fillStyle = L.line;
    const ang = Math.atan2(ankle.y - knee.y, ankle.x - knee.x);
    const nx = Math.cos(ang + Math.PI / 2), ny = Math.sin(ang + Math.PI / 2);
    const sd = ny > 0 ? 1 : -1; // espinhos no lado de baixo/de trás
    for (let i = 1; i <= L.spikes; i++) {
      const q = i / (L.spikes + 1);
      const x = knee.x + (ankle.x - knee.x) * q, y = knee.y + (ankle.y - knee.y) * q;
      const r = L.w * 0.3 * (1 - q * 0.4);
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(ang) * r, y - Math.sin(ang) * r);
      ctx.lineTo(x + sd * nx * L.w * 0.75 + Math.cos(ang) * r * 1.4, y + sd * ny * L.w * 0.75 + Math.sin(ang) * r * 1.4);
      ctx.lineTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r);
      ctx.fill();
    }
  }
  ctx.fillStyle = L.joint;
  ctx.beginPath();
  ctx.arc(knee.x, knee.y, L.w * 0.42, 0, TAU);
  ctx.arc(ankle.x, ankle.y, L.w * 0.24, 0, TAU);
  ctx.fill();
  return knee;
}

/** Sombrinha de contato dos pés apoiados. */
export function footShadows(ctx: CanvasRenderingContext2D, feet: V[], r: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  for (const f of feet) {
    const k = clamp(1 + f.y / 24);
    if (k <= 0.05) continue;
    ctx.moveTo(f.x + r * k, 1);
    ctx.ellipse(f.x, 1, r * k, r * 0.28 * k, 0, 0, TAU);
  }
  ctx.fill();
}

/** Brilho somado (luz) num ponto. */
export function bloom(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number) {
  if (a <= 0.02 || r <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgrad(ctx, x, y, r, hexA(color, clamp(a)), hexA(color, 0));
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Rastro (smear) de um golpe: fita entre duas trilhas de pontos (ponta e meio da lâmina). */
export function smear(ctx: CanvasRenderingContext2D, outer: V[], inner: V[], color: string, a: number) {
  if (a <= 0.02 || outer.length < 2) return;
  let len = 0;
  for (let i = 1; i < outer.length; i++) len += Math.hypot(outer[i].x - outer[i - 1].x, outer[i].y - outer[i - 1].y);
  const k = clamp((len - 20) / 120) * a;
  if (k <= 0.02) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = hexA(color, 0.26 * k);
  ctx.beginPath();
  ctx.moveTo(outer[0].x, outer[0].y);
  for (let i = 1; i < outer.length; i++) ctx.lineTo(outer[i].x, outer[i].y);
  for (let i = inner.length - 1; i >= 0; i--) ctx.lineTo(inner[i].x, inner[i].y);
  ctx.closePath();
  ctx.fill();
  // fios de movimento (borrão) entre as duas trilhas
  ctx.strokeStyle = hexA(color, 0.3 * k);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 1; i < outer.length; i += 2) {
    ctx.moveTo(inner[i].x, inner[i].y);
    ctx.lineTo(outer[i].x, outer[i].y);
  }
  ctx.stroke();
  ctx.strokeStyle = hexA('#ffffff', 0.7 * k);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(outer[0].x, outer[0].y);
  for (let i = 1; i < outer.length; i++) ctx.lineTo(outer[i].x, outer[i].y);
  ctx.stroke();
  ctx.restore();
}

/** Hash estável do id (0..1). */
export function idHash(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}
