/**
 * FERAS (feat.kind): 0 = lobo do fim (crina de gelo), 1 = urso rúnico (fica em pé),
 * 2 = quimera (leão + cabeça de bode + cauda de serpente + asinhas), 3 = behemoth blindado com presas.
 * Quadrúpedes, origem no chão, olhando para a esquerda.
 *
 * ESQUELETO: o corpo é um "quadro" (pelve + inclinação) e as 4 pernas são resolvidas por IK de dois ossos
 * até um pé-alvo no CHÃO. Na passada, o pé que apoia fica plantado (anda para trás exatamente à velocidade
 * do corpo) e o pé no ar levanta, avança e pisa. Andar → trote → galope mudam a ordem das patas.
 * Cauda, crina, juba, asas e as cabeças extras usam o mesmo movimento avaliado um pouco ANTES (atraso).
 */
import type { BossSpec } from '@gymbattle/shared';
import type { Anchors, DrawState, V } from '../types';
import { eyeGlow, h01, hurtTint, mixHex, rgrad, vgrad, TAU, clamp, sm, rgba, bez, tube } from '../util';

type Pal = BossSpec['pal'];

interface Look {
  /** Escala interna (o behemoth é largo demais em 1:1). */
  SC: number;
  /** Ombro (pernas da frente) e quadril (pernas de trás) no corpo. */
  sh: V;
  hip: V;
  /** Frente: braço, antebraço; `pas` = pulso → chão. */
  fl: [number, number];
  pas: number;
  /** Trás: coxa, canela; `meta` = jarrete − dedo (pé em pé). */
  hl: [number, number];
  meta: V;
  legW: number;
  /** Altura do passo, peso (afunda na pisada), pode galopar. */
  lift: number;
  heavy: number;
  gallop: number;
  /** Cabeça e base do pescoço no corpo. */
  head: V;
  neck: V;
  neckW: number;
  /** Quanto o corpo desce até a barriga encostar no chão (morte). */
  drop: number;
  /** Quanto empina no slam / roar / cast (radianos). */
  rearSlam: number;
  rearRoar: number;
  rearCast: number;
}

const LOOKS: Look[] = [
  {
    SC: 0.92, sh: { x: -60, y: -168 }, hip: { x: 95, y: -168 }, fl: [80, 76], pas: 22, hl: [74, 72], meta: { x: 24, y: -52 }, legW: 30,
    lift: 34, heavy: 0.25, gallop: 1, head: { x: -150, y: -222 }, neck: { x: -50, y: -196 }, neckW: 70, drop: 104, rearSlam: 0.4, rearRoar: 0.12, rearCast: 0.22,
  },
  {
    SC: 0.9, sh: { x: -55, y: -150 }, hip: { x: 85, y: -145 }, fl: [74, 70], pas: 16, hl: [70, 66], meta: { x: 26, y: -20 }, legW: 42,
    lift: 26, heavy: 1, gallop: 0, head: { x: -150, y: -186 }, neck: { x: -45, y: -180 }, neckW: 96, drop: 84, rearSlam: 0.95, rearRoar: 0.78, rearCast: 0.62,
  },
  {
    SC: 0.9, sh: { x: -60, y: -160 }, hip: { x: 90, y: -160 }, fl: [78, 72], pas: 20, hl: [72, 68], meta: { x: 22, y: -46 }, legW: 30,
    lift: 30, heavy: 0.45, gallop: 1, head: { x: -150, y: -205 }, neck: { x: -50, y: -190 }, neckW: 72, drop: 94, rearSlam: 0.4, rearRoar: 0.14, rearCast: 0.1,
  },
  {
    SC: 0.8, sh: { x: -70, y: -130 }, hip: { x: 100, y: -130 }, fl: [64, 62], pas: 10, hl: [64, 60], meta: { x: 6, y: -14 }, legW: 46,
    lift: 22, heavy: 1, gallop: 0, head: { x: -170, y: -122 }, neck: { x: -60, y: -160 }, neckW: 110, drop: 56, rearSlam: 0.36, rearRoar: 0.1, rearCast: 0.05,
  },
];

// ------------------------------------------------------------------ matemática pequena

const frac = (x: number) => x - Math.floor(x);
const mixN = (a: number, b: number, k: number) => a + (b - a) * k;
const bump = (p: number, a: number, m: number, b: number) => sm(a, m, p) * (1 - sm(m, b, p));
const rot = (v: V, a: number): V => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });
const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y });
const lerpV = (a: V, b: V, k: number): V => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

/** IK de dois ossos: devolve o joelho e o ponto final alcançado. bend = +1 joelho para a frente (esquerda), −1 para trás. */
function ik(a: V, b: V, l1: number, l2: number, bend: number): { k: V; e: V } {
  const dx = b.x - a.x, dy = b.y - a.y;
  let d = Math.hypot(dx, dy) || 0.001;
  const max = (l1 + l2) * 0.998;
  let e = b;
  if (d > max) {
    e = { x: a.x + (dx / d) * max, y: a.y + (dy / d) * max };
    d = max;
  }
  d = Math.max(d, Math.abs(l1 - l2) + 1);
  const ang = Math.atan2(dy, dx);
  const A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)) * bend;
  return { k: { x: a.x + Math.cos(ang + A) * l1, y: a.y + Math.sin(ang + A) * l1 }, e };
}

// ------------------------------------------------------------------ canais de pose

/** Canais da pose (somados): corpo, cabeça, pés, extras. Pés: deslocamento em relação ao pé plantado (y<0 = no ar). */
interface Ch {
  bx: number; by: number; pitch: number; str: number;
  hx: number; hy: number; hr: number; jaw: number;
  fn: V; ff: V; hn: V; hf: V;
  /** 0..1: pata da frente perto vira "mão" (golpe com arco). */
  paw: number; pawA: number;
  tail: number; mane: number; glow: number; shake: number; eye: number;
  /** Cabeças extras da quimera (bode / serpente): 0..1 de bote. */
  goat: number; snake: number; wing: number;
  /** Empinado: patas da frente erguidas (0 = penduradas, 1 = lá no alto, ameaçando). */
  arms: number;
}

const zero = (): Ch => ({
  bx: 0, by: 0, pitch: 0, str: 1, hx: 0, hy: 0, hr: 0, jaw: 0, fn: { x: 0, y: 0 }, ff: { x: 0, y: 0 }, hn: { x: 0, y: 0 }, hf: { x: 0, y: 0 },
  paw: 0, pawA: 0, tail: 0, mane: 0, glow: 0, shake: 0, eye: 1, goat: 0, snake: 0, wing: 0, arms: 0,
});

/**
 * Pose de ataque em função SÓ de (kind, pose, p): assim dá para avaliar com atraso (cauda/juba).
 * Antecipação 0..0,4 → golpe 0,45..0,55 → impacto 0,55 → follow-through e volta até 1.
 */
function poseCh(kind: number, L: Look, pose: string, p: number): Ch {
  const c = zero();
  if (p <= 0 || p >= 1) return c;
  const ant = sm(0.02, 0.4, p) * (1 - sm(0.4, 0.5, p));
  const hit = sm(0.4, 0.53, p) * (1 - sm(0.66, 1, p));
  const imp = bump(p, 0.52, 0.56, 0.74);
  const all = sm(0, 0.12, p) * (1 - sm(0.82, 1, p));
  if (pose === 'roar') {
    const rr = L.rearRoar;
    const hold = sm(0.42, 0.5, p) * (1 - sm(0.8, 0.96, p));
    c.bx = ant * 16 - hit * 14;
    c.by = ant * 12 - hit * 4 + imp * 6;
    c.pitch = -ant * 0.05 + hold * rr + imp * 0.02;
    c.hx = ant * 26 - hit * 22;
    c.hy = ant * 30 - hit * (kind === 0 ? 34 : 16);
    c.hr = -ant * 0.3 + hit * (kind === 0 ? 0.62 : kind === 1 ? 0.12 : 0.32);
    c.jaw = ant * 0.15 + hold * 1;
    c.mane = all * 0.4 + hold * 0.8;
    c.shake = hold;
    c.tail = ant * -0.4 + hold * 0.9;
    c.eye = 1 + hold * 0.6;
    c.goat = hold;
    // a serpente se ergue e sibila um pouco depois do leão (cabeças em fases diferentes)
    c.snake = -sm(0.3, 0.6, p) * (1 - sm(0.84, 1, p));
    c.wing = ant * -0.4 + hold;
    c.glow = hold;
    c.arms = hold * 0.55 + ant * 0.1;
    // pés da frente firmes (o leão crava as garras)
    c.fn = { x: -hit * 10, y: 0 };
  } else if (pose === 'charge') {
    const scrape = ant * sm(0.05, 0.15, p) * (1 - sm(0.32, 0.4, p));
    c.bx = ant * 30 - hit * 42 - imp * 8;
    c.by = ant * 24 + hit * 4 + imp * 12;
    c.pitch = -ant * 0.1 - hit * 0.04 - imp * 0.04;
    c.str = 1 + hit * 0.08 - ant * 0.04;
    c.hx = ant * 16 - hit * 26;
    c.hy = ant * 40 + hit * (kind === 3 ? 30 : 6);
    c.hr = -ant * 0.3 - hit * (kind === 3 ? 0.4 : 0.12) + imp * 0.12;
    c.jaw = kind === 3 ? hit * 0.3 : hit * 0.9 * (1 - sm(0.56, 0.62, p) * 0.7);
    // pata raspando o chão antes do bote (touro)
    const sc = Math.sin(p * 46);
    c.fn = { x: scrape * sc * 22 - hit * 46, y: -scrape * Math.max(0, -sc) * 18 - hit * 20 * (1 - sm(0.5, 0.56, p)) };
    c.ff = { x: -hit * 30, y: -hit * 12 * (1 - sm(0.5, 0.56, p)) };
    c.tail = ant * 0.6 + hit * -0.7;
    c.mane = hit;
    c.shake = imp * 1.2;
    c.goat = ant * -0.5 + hit;
    c.snake = ant * 0.3 - hit * 0.3;
    c.wing = hit * 0.6;
  } else if (pose === 'swipe') {
    if (kind === 2) {
      // quimera: quem ataca é a cauda de serpente; o leão se agacha e abre espaço
      c.bx = ant * 10 - hit * 18;
      c.by = ant * 10 + imp * 6;
      c.pitch = -ant * 0.04 + hit * 0.02;
      c.hx = ant * 10 - hit * 6;
      c.hy = ant * 14;
      c.hr = -ant * 0.15;
      c.jaw = ant * 0.4 + hit * 0.3;
      c.snake = ant * -0.35 + hit * 1;
      c.tail = ant;
      c.wing = ant * -0.4 + hit * 0.7;
      c.shake = imp * 0.6;
    } else {
      const lift = sm(0.04, 0.38, p) * (1 - sm(0.46, 0.55, p));
      c.paw = sm(0.04, 0.2, p) * (1 - sm(0.66, 0.92, p));
      // ângulo da pata em volta do ombro: atrás/alto (−) → frente/baixo (+) no golpe
      // quanto a pata está erguida: 1 = lá no alto (antecipação), 0 = impacto à frente/baixo, <0 = passou do ponto
      c.pawA = lift - bump(p, 0.5, 0.6, 0.85) * 0.18;
      c.bx = ant * 18 - hit * 30;
      c.by = ant * 8 + imp * 10;
      c.pitch = lift * (kind === 1 ? 0.3 : 0.14) - hit * 0.06 - imp * 0.03;
      c.hx = ant * 18 - hit * 22;
      c.hy = ant * 6 + hit * 14;
      c.hr = -ant * 0.12 - hit * 0.1;
      c.jaw = ant * 0.35 + hit * 0.7;
      c.ff = { x: -hit * 12, y: 0 };
      c.tail = ant * 0.5 - hit * 0.5;
      c.mane = hit;
      c.shake = imp * 0.8;
    }
  } else if (pose === 'slam') {
    const up = sm(0.04, 0.38, p) * (1 - sm(0.42, 0.53, p));
    c.bx = up * 26 - hit * 34;
    c.by = -up * 4 + imp * 16 + hit * 6;
    c.pitch = up * L.rearSlam - imp * 0.07;
    c.hx = up * 10 - hit * 18;
    c.hy = -up * 10 + hit * 22;
    c.hr = up * 0.25 - hit * 0.2;
    c.jaw = up * 0.6 + imp * 0.5;
    // pés da frente: sobem (empinado) e descem com força BEM à frente
    c.fn = { x: -hit * 52, y: 0 };
    c.ff = { x: -hit * 40, y: 0 };
    c.tail = up * 0.8 - imp * 0.6;
    c.mane = up + imp;
    c.shake = imp * 1.4;
    c.glow = up + imp;
    c.arms = sm(0.1, 0.36, p) * (1 - sm(0.42, 0.5, p));
    c.goat = up;
    c.wing = up;
  } else if (pose === 'cast') {
    const up = sm(0.05, 0.4, p) * (1 - sm(0.7, 0.95, p));
    const pulse = bump(p, 0.48, 0.56, 0.72);
    c.bx = up * 18;
    c.by = up * 10;
    c.pitch = up * L.rearCast;
    c.hx = up * 6;
    c.hy = -up * 18;
    c.hr = up * (kind === 0 ? 0.75 : 0.3) - pulse * 0.1;
    c.jaw = up * (kind === 0 ? 0.7 : 0.45) + pulse * 0.4;
    c.mane = up + pulse;
    c.glow = up * 0.8 + pulse;
    c.shake = pulse * 0.6;
    c.tail = up * 0.5;
    c.eye = 1 + up;
    c.arms = up * 0.75 + pulse * 0.2;
    c.goat = up;
    c.wing = up;
  } else {
    // breath / shoot: inspira (cabeça para trás, peito enche) e sopra empurrando o corpo para trás
    const inh = sm(0.02, 0.4, p) * (1 - sm(0.4, 0.5, p));
    const blow = sm(0.4, 0.5, p) * (1 - sm(0.82, 0.98, p));
    c.bx = inh * 14 + blow * 18;
    c.by = inh * 6 + blow * 8;
    c.pitch = inh * 0.08 - blow * 0.04;
    c.str = 1 + inh * 0.04;
    c.hx = inh * 30 - blow * 30;
    c.hy = -inh * 22 + blow * 16;
    c.hr = inh * 0.3 - blow * 0.14;
    c.jaw = inh * 0.15 + blow;
    c.shake = blow * 0.5;
    c.mane = blow;
    c.tail = inh * 0.6 - blow * 0.3;
    c.eye = 1 + blow * 0.5;
    c.goat = blow * 0.5;
    c.wing = inh * 0.8 - blow * 0.3;
  }
  return c;
}

/** Morte: cambaleia, a frente cede, a traseira desaba, a cabeça bate no chão e assenta. */
function deathCh(kind: number, L: Look, p: number): Ch {
  const c = zero();
  const span = L.hip.x - L.sh.x;
  const stag = 1 - sm(0.3, 0.45, p);
  const sway = Math.sin(p * 17) * stag * sm(0, 0.08, p);
  const front = sm(0.22, 0.52, p) * L.drop - bump(p, 0.5, 0.56, 0.66) * 8;
  const back = sm(0.34, 0.62, p) * L.drop - bump(p, 0.6, 0.65, 0.76) * 6;
  c.bx = sway * 12 + sm(0, 0.3, p) * 18 - sm(0.3, 0.6, p) * 10;
  c.by = back;
  c.pitch = -(front - back) / span + sway * 0.05;
  c.hx = sm(0.15, 0.6, p) * -20;
  c.hy = sm(0.1, 0.62, p) * (L.drop * 0.55 + 30) + bump(p, 0.6, 0.66, 0.74) * -10;
  c.hr = -sm(0.1, 0.6, p) * 0.35 + sway * 0.1;
  c.jaw = bump(p, 0.05, 0.2, 0.5) * 0.7 + sm(0.6, 0.8, p) * 0.25;
  // pernas: a da frente perto cede primeiro, depois todas se dobram (frente esticada, como esfinge)
  c.fn = { x: -sm(0.2, 0.55, p) * 56 + sway * 6, y: 0 };
  c.ff = { x: -sm(0.3, 0.6, p) * 36, y: 0 };
  c.hn = { x: -sm(0.4, 0.66, p) * 20, y: 0 };
  c.hf = { x: -sm(0.45, 0.7, p) * 10, y: 0 };
  c.tail = -sm(0.3, 0.8, p) * 0.9;
  c.eye = 1 - sm(0.55, 0.9, p);
  c.goat = -sm(0.2, 0.7, p);
  c.snake = -sm(0.3, 0.8, p);
  c.wing = -sm(0.2, 0.7, p);
  c.shake = bump(p, 0.48, 0.52, 0.6) + bump(p, 0.6, 0.64, 0.72) * 0.6;
  return c;
}

function stateCh(kind: number, L: Look, st: DrawState, dp = 0): Ch {
  if (st.anim === 'death') return deathCh(kind, L, clamp(st.p - dp));
  if (st.anim === 'attack') return poseCh(kind, L, st.pose, st.p - dp);
  if (st.anim === 'enter') return poseCh(kind, L, 'roar', st.p - dp);
  return zero();
}

// ------------------------------------------------------------------ passada

/** Ordem das patas: [trás-longe, frente-longe, trás-perto, frente-perto]. */
const OFF_WALK = [0.5, 0.75, 0, 0.25];
const OFF_TROT = [0.5, 1.0, 0, 0.5];
const OFF_GAL = [0.1, 1.45, 0, 0.55];

interface Gait {
  ph: number; k: number; beta: number; A: number; H: number; off: number[]; trot: number; gal: number;
}

/** Pé na passada: x do pé (−A = à frente), y (<0 = no ar), dobra do pulso no ar. */
function footAt(g: Gait, i: number, ph: number) {
  const q = frac(ph - g.off[i]);
  if (q < g.beta) return { x: (-g.A + (2 * g.A * q) / g.beta) * g.k, y: 0, curl: 0, q };
  const v = (q - g.beta) / (1 - g.beta);
  const e = v * v * (3 - 2 * v);
  return { x: (g.A - 2 * g.A * e) * g.k, y: -g.H * Math.sin(Math.PI * Math.pow(v, 0.75)) * g.k, curl: Math.sin(Math.PI * Math.pow(v, 0.8)) * g.k, q };
}

/** Peso da pisada (0..1): sobe logo depois do pé tocar o chão. */
function stepLoad(g: Gait, i: number, ph: number) {
  const q = frac(ph - g.off[i]);
  const w = g.beta * 0.45;
  return q < w ? Math.sin((Math.PI * q) / w) ** 2 : 0;
}

/** Balanço do corpo na passada (avaliável em fases anteriores, para as partes com atraso). */
function bobAt(g: Gait, L: Look, ph: number) {
  const D = (3 + L.heavy * 7) * g.k * (1 + g.trot * 0.4);
  const dipH = (stepLoad(g, 0, ph) + stepLoad(g, 2, ph)) * D;
  const dipF = (stepLoad(g, 1, ph) + stepLoad(g, 3, ph)) * D * (1 + L.heavy * 0.3);
  // trote: quica 2x por ciclo; galope: corpo arqueia/estica e balança de frente para trás
  const tb = -Math.abs(Math.sin(TAU * ph)) * 6 * g.trot * g.k;
  const gp = Math.sin(TAU * (ph - 0.28)) * g.gal * g.k;
  return { hy: dipH + tb - Math.max(0, gp) * 10 * g.gal, cy: dipF + tb, pitch: gp * 0.12, str: 1 + Math.sin(TAU * (ph - 0.05)) * 0.06 * g.gal * g.k };
}

// ------------------------------------------------------------------ desenho principal

export function drawBeast(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState): Anchors {
  const kind = Math.max(0, Math.min(3, s.feat.kind ?? 0));
  const L = LOOKS[kind];
  const P = s.pal;
  const seed = h01(s.id.length * 7.3 + s.id.charCodeAt(0), 3) * 10;
  const base = ctx.getTransform().inverse();
  const map = (x: number, y: number): V => {
    const p = base.multiply(ctx.getTransform()).transformPoint({ x, y });
    return { x: p.x, y: p.y };
  };
  const body = hurtTint(ctx, st, P.body);
  const dark = hurtTint(ctx, st, P.dark);
  const t = st.t;
  const die = st.anim === 'death' ? st.p : 0;
  const live = 1 - sm(0.3, 0.7, die);
  const atk = st.anim === 'attack' ? sm(0, 0.12, st.p) * (1 - sm(0.85, 1, st.p)) : 0;

  // ---------- passada
  const vmax = 95 / Math.sqrt(s.size || 1);
  const sp = Math.abs(st.vx) / vmax;
  const back = st.vx > 1;
  const trot = sm(1.25, 1.7, sp) * (1 - L.heavy * 0.35);
  const gal = sm(1.8, 2.3, sp) * L.gallop;
  const off = OFF_WALK.map((w, i) => mixN(mixN(w, OFF_TROT[i], trot), OFF_GAL[i], gal));
  const beta = mixN(mixN(0.66, 0.5, trot), 0.38, gal);
  // 1 ciclo de gait = 150 unidades locais do motor = 150/SC aqui dentro → o pé apoiado não patina
  const A = (75 * beta) / L.SC;
  const g: Gait = {
    ph: frac(back ? -st.gait : st.gait), k: sm(0.02, 0.22, st.move) * live, beta, A,
    H: L.lift * (1 + trot * 0.4 + gal * 0.6) * (back ? 0.7 : 1), off, trot, gal,
  };
  const bob = bobAt(g, L, g.ph);

  // ---------- pose
  const ch = stateCh(kind, L, st);
  const chLag = stateCh(kind, L, st, 0.07);
  const chLag2 = stateCh(kind, L, st, 0.14);
  const hu = st.hurt;
  const shake = (ch.shake + hu * 0.8) * Math.sin(t * 61) * (2.5 + L.heavy * 1.5) + st.rage * Math.sin(t * 43) * 0.6;
  // idle vivo: respiração, peso trocando de lado, olhar
  const idleK = (1 - g.k) * (1 - atk) * live;
  const br = Math.sin(t * (1.5 + st.rage * 1.2) + seed);
  const ws = Math.sin(t * 0.47 + seed) * idleK;
  const span = L.hip.x - L.sh.x;
  const cyTot = bob.cy;
  const hyTot = bob.hy + br * 1.6 * idleK;
  const pitch = ch.pitch + bob.pitch - (cyTot - hyTot) / span + hu * 0.07 + ws * 0.012;
  const str = ch.str * bob.str;
  const hipW: V = { x: L.hip.x + ch.bx + ws * 5 + hu * 18 + shake * 0.5, y: L.hip.y + ch.by + hyTot };
  // quadro do corpo: local do corpo → chão
  const cs = Math.cos(pitch), sn = Math.sin(pitch), sy = 1 / Math.sqrt(str);
  const bf = (p: V): V => {
    const x = (p.x - L.hip.x) * str, y = (p.y - L.hip.y) * sy;
    return { x: hipW.x + x * cs - y * sn, y: hipW.y + x * sn + y * cs };
  };
  const shW = bf(L.sh);

  ctx.save();
  ctx.scale(L.SC, L.SC);

  // ---------- pés
  const NEU = [L.hip.x + 16, L.sh.x + 24, L.hip.x - 8, L.sh.x - 6];
  const poseOff = [ch.hf, ch.ff, ch.hn, ch.fn];
  const hang = clamp((pitch - 0.14) / 0.3);
  // pata que descansa no idle (troca de apoio a cada ~6 s)
  const rest = frac(t / 6.3 + seed * 0.1);
  const restLift = bump(rest, 0.02, 0.06, 0.12) * idleK;
  const legs = [0, 1, 2, 3].map((i) => {
    const front = i % 2 === 1;
    const f = footAt(g, i, g.ph);
    let toe: V = { x: NEU[i] + f.x + poseOff[i].x, y: Math.min(0, f.y + poseOff[i].y) };
    let curl = f.curl + clamp(-poseOff[i].y / 30) * 0.7;
    if (i === 2) {
      toe.y -= restLift * 12;
      toe.x += restLift * 8;
      curl += restLift * 0.5;
    }
    const j = front ? (i === 1 ? bf({ x: L.sh.x + 24, y: L.sh.y + 4 }) : shW) : i === 0 ? bf({ x: L.hip.x + 16, y: L.hip.y + 4 }) : hipW;
    if (front && hang > 0) {
      // empinado: as patas da frente saem do chão e ficam penduradas/dobradas
      const ln = L.fl[0] + L.fl[1];
      const up = ch.arms * (i === 3 ? 1 : 0.85);
      const hp = { x: j.x - 30 - (i === 3 ? 18 : 0) + ch.fn.x * 0.3 - up * (ln * 0.35), y: j.y + ln * 0.62 - up * ln * (i === 3 ? 1.15 : 1.0) };
      toe = lerpV(toe, hp, hang);
      curl = mixN(curl, 0.9 - up * 1.2, hang);
    }
    return { i, front, toe, curl, j };
  });
  // pata que golpeia (swipe): arco em volta do ombro
  if (ch.paw > 0) {
    const R = (L.fl[0] + L.fl[1]) * 0.92;
    const a = pawAng(ch.pawA); // ângulo a partir do ombro (π/2 = para baixo, π = para a frente)
    const pt = { x: shW.x + Math.cos(a) * R - 10, y: Math.min(0, shW.y + Math.sin(a) * R) };
    legs[3].toe = lerpV(legs[3].toe, pt, ch.paw);
    legs[3].curl = mixN(legs[3].curl, 0.2 + ch.pawA * 0.5, ch.paw);
  }

  // ---------- sombra de contato (sob as patas)
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  for (const lg of legs) {
    const a = clamp(1 + lg.toe.y / 60);
    if (a <= 0.05) continue;
    ctx.beginPath();
    ctx.ellipse(lg.toe.x - 4, 2, L.legW * 1.1 * a, 6 * a, 0, 0, TAU);
    ctx.fill();
  }

  // ---------- cauda (atrás de tudo)
  const lagPh = (d: number) => bobAt(g, L, g.ph - d);
  let snakeHead: V | null = null;
  if (kind !== 2) drawTail(ctx, kind, bf, L, body, dark, P, t, ch, chLag, chLag2, g, lagPh, sp, seed, die);

  // ---------- pernas do lado de lá (mais escuras)
  const farCol = mixHex(body, dark, 0.5);
  drawLeg(ctx, kind, L, legs[0], farCol, dark, P, st);
  drawLeg(ctx, kind, L, legs[1], farCol, dark, P, st);

  // asa de lá da quimera
  const wingFlap = Math.sin(t * 2.6 + seed) * 0.12 * (1 - g.k) + Math.sin(TAU * (g.ph - 0.15) * 2) * 0.12 * g.k + chLag.wing * 0.5 - die * 0.4;
  if (kind === 2 && (s.feat.wings ?? 1) > 0) chimeraWing(ctx, bf({ x: 50, y: -212 }), -0.25 + wingFlap * 0.8 - pitch, mixHex(body, dark, 0.55), P, 0.85);

  // ---------- tronco (gira com o quadro do corpo)
  ctx.save();
  ctx.translate(hipW.x, hipW.y);
  ctx.rotate(pitch);
  ctx.scale(str, sy);
  ctx.translate(-L.hip.x, -L.hip.y);
  drawTorso(ctx, kind, body, dark, P, br * (1 + ch.str - 1), t, st, atk, ch, legs[3].toe.x - shW.x, g);
  ctx.restore();

  // cauda de serpente: por cima das costas (ela dá o bote passando sobre o corpo)
  if (kind === 2 && (s.feat.snake ?? 1) > 0) snakeHead = snakeTail(ctx, P, st, bf({ x: 150, y: -182 }), t, ch, chLag, chLag2, g, die, map, seed);

  // ---------- perna de trás de cá (a coxa cobre o tronco)
  drawLeg(ctx, kind, L, legs[2], mixHex(body, dark, 0.12), dark, P, st);

  // asa de cá
  if (kind === 2 && (s.feat.wings ?? 1) > 0) chimeraWing(ctx, bf({ x: 30, y: -210 }), -0.05 + wingFlap - pitch * 0.5, mixHex(body, dark, 0.25), P, 1);

  // cabeça de bode nas costas da quimera (fase própria, atrasada em relação ao leão)
  let goatMouth: V | null = null;
  if (kind === 2 && (s.feat.goat ?? 1) > 0) {
    const gl = chLag.goat;
    const gb = lagPh(0.12);
    const root = bf({ x: 40, y: -206 });
    const gh = {
      x: root.x - 30 + Math.sin(t * 0.9 + seed + 2) * 6 * idleK - Math.max(0, gl) * 110 + Math.max(0, -gl) * 30,
      y: root.y - 86 + Math.sin(t * 1.3 + seed + 1) * 4 + gb.cy * 0.6 + Math.max(0, -gl) * 30 + Math.max(0, gl) * 40 + die * 40,
    };
    tube(ctx, bez(root, { x: root.x + 10, y: root.y - 40 }, { x: gh.x + 30, y: gh.y + 30 }, gh, 10), (q) => 46 - q * 22, mixHex(body, '#d8d0c0', 0.25));
    goatMouth = goatHead(ctx, gh, -0.2 - Math.max(0, gl) * 0.7 + Math.max(0, -gl) * 0.3 + Math.sin(t * 1.1 + seed) * 0.08 * idleK, clamp(chLag.goat * 0.9 + 0.05) * live, P, st, blinkAt(t, seed + 3, ch.eye), map);
  }

  // ---------- pescoço, crina e cabeça
  const blink = blinkAt(t, seed, ch.eye);
  const look = (Math.sin(t * 0.37 + seed) * 0.06 + Math.sin(t * 0.91 + seed * 2) * 0.03) * idleK;
  const neckB = bf(L.neck);
  const H0 = bf(L.head);
  // a cabeça estabiliza: compensa parte do sobe-e-desce do corpo
  const head: V = {
    x: H0.x + ch.hx + hu * 16 + shake + Math.sin(t * 1.1 + seed) * 3 * idleK,
    y: H0.y + ch.hy - cyTot * 0.55 - hu * 12 + br * 2 * idleK + (kind === 3 ? 0 : Math.sin(TAU * g.ph * 2) * 2 * g.k),
  };
  // a cabeça nunca afunda no chão (morte / bote baixo)
  head.y = Math.min(head.y, [-26, -40, -28, -36][kind]);
  const hRot = ch.hr + look + hu * 0.22 + pitch * 0.4 + shake * 0.006;
  const jaw = clamp(ch.jaw + hu * 0.5 + st.rage * 0.08 * idleK + bump(frac(t / 4.1 + seed), 0.0, 0.1, 0.25) * 0.25 * idleK);
  tube(ctx, bez(neckB, { x: neckB.x - 30, y: neckB.y - 6 }, { x: head.x + 44, y: head.y + 12 }, { x: head.x + 18, y: head.y + 2 }, 10), (q) => L.neckW * (1 - q * 0.25), kind === 0 ? body : mixHex(body, dark, 0.08));
  if (kind === 0 && (s.feat.mane ?? 1) > 0) maneIce(ctx, neckB, head, P, st, t, chLag, g, lagPh, seed);
  if (kind === 2) lionMane(ctx, head, dark, P, t, hRot, chLag, lagPh(0.1), seed);

  // ---------- perna da frente de cá
  const pawTip = drawLeg(ctx, kind, L, legs[3], body, dark, P, st, map);

  ctx.save();
  ctx.translate(head.x, head.y);
  ctx.rotate(hRot);
  let mouthL: V;
  const hfx: HeadFx = { eye: blink, ear: earAt(t, seed, ch, hu), rage: st.rage };
  if (kind === 0) mouthL = wolfHead(ctx, jaw, body, dark, P, st, hfx);
  else if (kind === 1) mouthL = bearHead(ctx, jaw, body, dark, P, st, hfx);
  else if (kind === 2) mouthL = lionHead(ctx, jaw, body, dark, P, st, hfx);
  else mouthL = boarHead(ctx, jaw, body, dark, P, st, s, hfx);
  const mouth = map(mouthL.x, mouthL.y);
  const headTop = map(0, -60).y;
  ctx.restore();

  // rastro da garra (smear) no golpe rápido
  if (ch.paw > 0.3 && st.anim === 'attack') clawSmear(ctx, kind, L, shW, st.p, P);

  const coreL = bf({ x: 10, y: -170 });
  const core = map(coreL.x, coreL.y);
  const topB = bf({ x: -30, y: kind === 1 ? -240 : -230 });
  const topBody = map(topB.x, topB.y).y;

  // bafo / brilho na boca
  if (jaw > 0.25 && (st.pose === 'breath' || st.pose === 'roar' || st.pose === 'shoot') && st.anim === 'attack') {
    const ml = mouthL;
    void ml;
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgrad(ctx, mouth.x, mouth.y, 46, rgba(P.glow, 0.55 * jaw), rgba(P.glow, 0));
    ctx.beginPath();
    ctx.arc(mouth.x, mouth.y, 46, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // partículas da fera (poucas, sem brilho caro)
  if (kind === 0) motes(ctx, 0, -40, 300, 240, t * 0.1, 11, 9, P.accent, 0.55 * live);
  if (kind === 3) motes(ctx, 0, -10, 320, 110, t * 0.12, 5, 7, P.accent, (0.35 + st.rage * 0.5) * live);

  let hand = pawTip;
  if (kind === 2) hand = st.pose === 'charge' && goatMouth ? goatMouth : snakeHead ?? pawTip;
  return { mouth, hand, core, top: Math.min(headTop, topBody, snakeHead ? snakeHead.y - 20 : 0), halfW: kind === 3 ? 170 : 150 };
}

// ------------------------------------------------------------------ partes

interface HeadFx {
  /** Abertura dos olhos (0 = fechado; >1 = arregalado). */
  eye: number;
  /** Orelhas: 0 = normais, + = em pé / − = para trás. */
  ear: number;
  rage: number;
}

/** Piscar: rápido e de vez em quando (determinístico). */
function blinkAt(t: number, seed: number, eye: number) {
  const q = frac(t / 3.3 + seed * 0.37);
  const q2 = frac(t / 5.9 + seed);
  const b = Math.max(bump(q, 0, 0.025, 0.06), bump(q2, 0, 0.02, 0.05));
  return clamp(eye * (1 - b), 0, 1.6);
}

function earAt(t: number, seed: number, ch: Ch, hu: number) {
  const tw = bump(frac(t / 2.7 + seed * 0.2), 0, 0.03, 0.09);
  return tw * 0.6 - ch.jaw * 0.5 - hu * 0.6 + ch.mane * 0.2;
}

interface LegSt { i: number; front: boolean; toe: V; curl: number; j: V }

/** Perna completa com IK: junta → joelho/cotovelo → pulso/jarrete → pata. Devolve a ponta das garras (no mapa). */
function drawLeg(ctx: CanvasRenderingContext2D, kind: number, L: Look, lg: LegSt, colS: string, dark: string, P: Pal, st: DrawState, map?: (x: number, y: number) => V): V {
  const front = lg.front;
  const far = lg.i < 2;
  const w = L.legW * (far ? 0.88 : 1);
  const [l1, l2] = front ? L.fl : L.hl;
  // pulso/jarrete a partir do dedo; no ar a pata dobra para trás
  const m0: V = front ? { x: 4, y: -L.pas } : L.meta;
  const m = rot(m0, front ? -lg.curl * (kind === 1 || kind === 3 ? 0.6 : 1.15) : -lg.curl * 0.55);
  const ankT = add(lg.toe, m);
  // joelhos: frente dobra para trás (cotovelo), trás dobra para a frente (joelho)
  const s = ik(lg.j, ankT, l1, l2, front ? -1 : 1);
  const ank = s.e;
  const toe = { x: ank.x - m.x, y: ank.y - m.y };
  const outline = mixHex(dark, '#000000', 0.35);
  // sombreado: claro em cima (junto do tronco), escurece até a pata
  const col = vgrad(ctx, lg.j.y - 40, 0, mixHex(colS, '#ffffff', far ? 0 : 0.06), mixHex(colS, dark, 0.45));
  // coxa/ombro grossos que afinam até a pata (um ponto extra no meio da coxa dá a curva do músculo)
  const mid = { x: (lg.j.x + s.k.x) / 2 + (front ? 4 : 8), y: (lg.j.y + s.k.y) / 2 };
  const pts = [{ x: lg.j.x, y: lg.j.y - 14 }, mid, s.k, ank, toe];
  const top = kind === 3 ? 0.62 : kind === 1 ? 0.8 : 1;
  const wf = (q: number) => w * (front ? (q < 0.25 ? 1.4 + (0.5 - q * 2) * top : 1.4 - q * 0.85) : q < 0.25 ? 1.6 + (0.7 - q * 2.8) * top : 1.6 - q * 1.15);
  // contorno escuro (separa as pernas que se cruzam) + preenchimento
  // contorno só da coxa para baixo: no alto a perna se funde com o tronco
  tube(ctx, far ? pts : pts.slice(1), far ? (q) => wf(q) + 5 : (q) => wf(0.25 + q * 0.75) + 5, outline);
  tube(ctx, pts, wf, col);
  // pata / casco, alinhado com o chão quando apoiado
  const pa = Math.atan2(toe.y - ank.y, toe.x - ank.x) - Math.atan2(-m0.y, -m0.x);
  ctx.save();
  ctx.translate(toe.x, toe.y);
  ctx.rotate(pa * 0.8);
  if (kind === 3) {
    ctx.fillStyle = outline;
    ctx.beginPath();
    ctx.moveTo(-w * 0.75, -16);
    ctx.lineTo(w * 0.62, -16);
    ctx.lineTo(w * 0.7, 2);
    ctx.lineTo(-w * 0.85, 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = mixHex(dark, '#6a6a70', 0.3);
    ctx.fillRect(-w * 0.7, -13, w * 1.3, 4);
    // unhas
    ctx.fillStyle = hurtTint(ctx, st, '#c8bca8');
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(-w * 0.62 + i * w * 0.36, -2, w * 0.15, 5, 0, Math.PI, TAU);
      ctx.fill();
    }
  } else {
    const pw = w * (kind === 1 ? 1.0 : 0.8);
    ctx.fillStyle = outline;
    ctx.beginPath();
    ctx.ellipse(-pw * 0.35, -pw * 0.3, pw + 2.5, pw * 0.48 + 2.5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = mixHex(colS, dark, 0.35);
    ctx.beginPath();
    ctx.ellipse(-pw * 0.35, -pw * 0.3, pw, pw * 0.48, 0, 0, TAU);
    ctx.fill();
    // dedos
    ctx.strokeStyle = rgba('#000000', 0.35);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 1; i < 3; i++) {
      const x = -pw * 1.05 + i * pw * 0.42;
      ctx.moveTo(x, -pw * 0.1);
      ctx.lineTo(x + 2, -pw * 0.55);
    }
    ctx.stroke();
    // garras
    ctx.fillStyle = kind === 1 ? '#e8e0d0' : kind === 0 ? hurtTint(ctx, st, P.accent) : '#f0e0c0';
    for (let i = 0; i < 3; i++) {
      const x = -pw * 1.2 + i * pw * 0.36;
      ctx.beginPath();
      ctx.moveTo(x + 2, -pw * 0.2);
      ctx.quadraticCurveTo(x - pw * 0.45, -pw * 0.1, x - pw * 0.4, 2);
      ctx.lineTo(x + pw * 0.14, -2);
      ctx.fill();
    }
  }
  ctx.restore();
  const tip = { x: toe.x - w, y: toe.y };
  return map ? map(tip.x, tip.y) : tip;
}

/** Ângulo da pata do golpe em volta do ombro: erguida (1) = lá no alto, 0 = à frente e embaixo. */
const pawAng = (raise: number) => 2.05 + raise * 1.95;

/** Rastro curvo das garras no golpe rápido (0,4–0,62). */
function clawSmear(ctx: CanvasRenderingContext2D, kind: number, L: Look, sh: V, p: number, P: Pal) {
  const k = bump(p, 0.42, 0.52, 0.64);
  if (k <= 0.02) return;
  const R = (L.fl[0] + L.fl[1]) * 0.92;
  const a1 = pawAng(1 - sm(0.42, 0.53, p));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const r = R * (0.86 + i * 0.08);
    ctx.strokeStyle = rgba(i === 1 ? '#ffffff' : P.accent, k * (0.55 - i * 0.1));
    ctx.lineWidth = (kind === 1 ? 9 : 7) - i * 1.5;
    ctx.beginPath();
    ctx.arc(sh.x - 10, sh.y, r, a1 + 0.05, a1 + 1.3);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTorso(ctx: CanvasRenderingContext2D, kind: number, body: string, dark: string, P: Pal, b: number, t: number, st: DrawState, atk: number, ch: Ch, pawDx: number, g: Gait) {
  // escápula de cá: sobe quando a pata de cá empurra (balanço dos ombros, forte no urso)
  const scap = clamp(pawDx / 60, -1, 1) * (kind === 1 ? 9 : 4) * g.k;
  const outline = mixHex(dark, '#000000', 0.35);
  if (kind === 0) {
    // lobo: tronco esguio, peito largo, barriga recolhida
    ctx.fillStyle = outline;
    ctx.beginPath();
    ctx.ellipse(30, -174 + b * 1.5, 114, 50, -0.04, 0, TAU);
    ctx.ellipse(-60, -176, 66, 66 + b * 2, 0.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = vgrad(ctx, -232, -110, mixHex(body, '#ffffff', 0.08), dark);
    ctx.beginPath();
    ctx.ellipse(30, -174 + b * 1.5, 110, 46, -0.04, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-60, -176 + scap * 0.3, 62, 62 + b * 2, 0.2, 0, TAU);
    ctx.fill();
    // pelo eriçado nas costas (balança com atraso)
    ctx.fillStyle = body;
    for (let i = 0; i < 10; i++) {
      const x = -40 + i * 19;
      const y = -214 + Math.abs(i - 4) * 2.6;
      const wv = Math.sin(t * 3 - i * 0.6) * 2 + ch.mane * 6 + g.k * Math.sin(TAU * g.ph * 2 - i * 0.5) * 3;
      ctx.beginPath();
      ctx.moveTo(x - 12, y + 10);
      ctx.lineTo(x + 8 + wv, y - 14 - h01(i, 1) * 8 - ch.mane * 6);
      ctx.lineTo(x + 12, y + 10);
      ctx.fill();
    }
    // brilho de borda (luz da lua)
    ctx.strokeStyle = rgba(P.accent, 0.28);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(30, -174 + b * 1.5, 106, 42, -0.04, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    // barriga mais clara
    ctx.fillStyle = rgba(P.accent, 0.18);
    ctx.beginPath();
    ctx.ellipse(10, -140, 70, 11, 0, 0, TAU);
    ctx.fill();
  } else if (kind === 1) {
    // urso: massa enorme com corcova (que rola com os ombros)
    ctx.fillStyle = outline;
    ctx.beginPath();
    ctx.ellipse(20, -160 + b * 2, 129, 76 + b * 3, 0, 0, TAU);
    ctx.ellipse(-40, -200 - scap, 82, 66, 0.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = vgrad(ctx, -265, -80, mixHex(body, '#ffffff', 0.1), dark);
    ctx.beginPath();
    ctx.ellipse(20, -160 + b * 2, 125, 72 + b * 3, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-40, -200 - scap, 78, 62, 0.2, 0, TAU);
    ctx.fill();
    // tufos de pelo (balançam)
    ctx.strokeStyle = rgba(P.dark, 0.55);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 14; i++) {
      const x = -100 + (i % 7) * 34 + h01(i, 2) * 10;
      const y = -215 + Math.floor(i / 7) * 52 + h01(i, 3) * 10 - (i % 7 < 2 ? scap : 0);
      const sw = Math.sin(t * 2 + i) * 1.5 + g.k * Math.sin(TAU * g.ph * 2 - i * 0.4) * 3;
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 6 + sw, y + 8, x + 2 + sw * 1.5, y + 16);
    }
    ctx.stroke();
    ctx.strokeStyle = rgba('#ffffff', 0.12);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(-40, -200 - scap, 72, 56, 0.2, Math.PI * 1.1, Math.PI * 1.7);
    ctx.stroke();
    // runas brilhantes (traço largo transparente + traço fino: brilho sem shadowBlur)
    const glowK = clamp(0.45 + atk * 0.35 + ch.glow * 0.6 + st.rage * 0.3 + Math.sin(t * 2.4) * 0.15);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const [lw, a] of [[12, 0.18], [4, 1]] as const) {
      ctx.strokeStyle = rgba(P.accent, glowK * a);
      ctx.lineWidth = lw;
      rune(ctx, -40, -205 - scap, 26, 0);
      rune(ctx, 70, -170, 22, 1);
      rune(ctx, 10, -130, 16, 2);
    }
    ctx.restore();
  } else if (kind === 2) {
    // leão
    ctx.fillStyle = outline;
    ctx.beginPath();
    ctx.ellipse(30, -165 + b * 1.5, 116, 58, -0.03, 0, TAU);
    ctx.ellipse(-55, -170, 64, 68, 0.1, 0, TAU);
    ctx.fill();
    ctx.fillStyle = vgrad(ctx, -230, -100, mixHex(body, '#ffffff', 0.14), mixHex(body, dark, 0.45));
    ctx.beginPath();
    ctx.ellipse(30, -165 + b * 1.5, 112, 54, -0.03, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-55, -170 - scap * 0.4, 60, 64, 0.1, 0, TAU);
    ctx.fill();
    // costelas/músculo
    ctx.strokeStyle = rgba(P.dark, 0.25);
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      ctx.moveTo(-10 + i * 22, -190);
      ctx.quadraticCurveTo(-2 + i * 22, -165, -12 + i * 22, -140);
    }
    ctx.stroke();
    ctx.fillStyle = rgba('#ffffff', 0.12);
    ctx.beginPath();
    ctx.ellipse(10, -126, 80, 13, 0, 0, TAU);
    ctx.fill();
  } else {
    // behemoth: corpo maciço + placas de armadura (as placas balançam com atraso)
    ctx.fillStyle = outline;
    ctx.beginPath();
    ctx.ellipse(30, -150 + b * 2, 154, 86 + b * 2, 0, 0, TAU);
    ctx.ellipse(-60, -180 - scap, 84, 74, 0.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = vgrad(ctx, -260, -60, mixHex(body, '#ffffff', 0.06), dark);
    ctx.beginPath();
    ctx.ellipse(30, -150 + b * 2, 150, 82 + b * 2, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-60, -180 - scap, 80, 70, 0.2, 0, TAU);
    ctx.fill();
    // pele enrugada
    ctx.strokeStyle = rgba(P.dark, 0.4);
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      ctx.moveTo(-120 + i * 50, -110);
      ctx.quadraticCurveTo(-110 + i * 50, -96, -122 + i * 50, -84);
    }
    ctx.stroke();
    const plate = mixHex(dark, '#4a4a50', 0.4);
    const heat = clamp(0.35 + atk * 0.4 + ch.glow * 0.4 + st.rage * 0.4);
    // brilho de lava entre as placas (um gradiente só)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = vgrad(ctx, -250, -150, rgba(P.glow, 0), rgba(P.glow, heat * 0.45));
    ctx.beginPath();
    ctx.ellipse(20, -190, 130, 44, 0, Math.PI, TAU);
    ctx.fill();
    ctx.restore();
    for (let i = 0; i < 5; i++) {
      const x = 120 - i * 46;
      const jig = Math.sin(TAU * g.ph * 2 - i * 0.7) * 3 * g.k + ch.shake * Math.sin(t * 50 + i) * 2;
      const y = -200 - Math.sin((i / 4) * Math.PI) * 30 + (i === 4 ? 10 : 0) + jig;
      ctx.fillStyle = vgrad(ctx, y - 50, y + 50, mixHex(plate, '#8a8a90', 0.3), plate);
      ctx.beginPath();
      ctx.ellipse(x, y + 18, 52, 56, 0, Math.PI * 1.05, Math.PI * 1.95);
      ctx.lineTo(x + 34, y + 54);
      ctx.lineTo(x - 34, y + 54);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = rgba(P.accent, heat * 0.75);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(x, y + 18, 52, 56, 0, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      // espinho
      ctx.fillStyle = '#d8d0c0';
      ctx.beginPath();
      ctx.moveTo(x - 10, y - 32);
      ctx.lineTo(x + 4 + jig, y - 62);
      ctx.lineTo(x + 10, y - 32);
      ctx.fill();
    }
  }
}

/** Runa simples (traços). */
function rune(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, k: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.moveTo(x, y - r * 0.7);
  ctx.lineTo(x, y + r * 0.7);
  if (k === 0) {
    ctx.moveTo(x, y - r * 0.2);
    ctx.lineTo(x - r * 0.5, y - r * 0.6);
    ctx.moveTo(x, y);
    ctx.lineTo(x + r * 0.5, y + r * 0.4);
  } else if (k === 1) {
    ctx.moveTo(x - r * 0.5, y - r * 0.5);
    ctx.lineTo(x + r * 0.5, y);
    ctx.lineTo(x - r * 0.5, y + r * 0.5);
  } else {
    ctx.moveTo(x - r * 0.5, y);
    ctx.lineTo(x + r * 0.5, y);
  }
  ctx.stroke();
}

/** Cauda em corrente de segmentos: cada segmento repete o movimento do anterior com atraso (onda). */
function drawTail(
  ctx: CanvasRenderingContext2D, kind: number, bf: (p: V) => V, L: Look, body: string, dark: string, P: Pal, t: number,
  ch: Ch, chLag: Ch, chLag2: Ch, g: Gait, lagPh: (d: number) => { hy: number; cy: number; pitch: number }, sp: number, seed: number, die: number,
) {
  const root = bf({ x: L.hip.x + 30, y: L.hip.y - (kind === 3 ? 10 : 26) });
  if (kind === 1) {
    // urso: cotoco que treme
    const r2 = bf({ x: L.hip.x + 34, y: L.hip.y - 6 });
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(r2.x, r2.y + Math.sin(t * 3) * 1.5, 18, 14, 0, 0, TAU);
    ctx.fill();
    return;
  }
  const n = kind === 0 ? 9 : 6;
  const seg = kind === 0 ? 17 : 13;
  const pts: V[] = [root];
  // pose (com atraso crescente ao longo da cauda) e corrida (cauda estende para trás)
  const run = clamp(sp / 2.4) * g.k;
  let a = kind === 0 ? 0.55 - run * 0.6 : 1.0 - run * 0.4;
  for (let i = 0; i < n; i++) {
    const q = i / (n - 1);
    const pose = mixN(ch.tail, mixN(chLag.tail, chLag2.tail, q), Math.min(1, q * 1.6));
    const bb = lagPh(0.04 + q * 0.16);
    const wave = Math.sin(t * 1.6 + seed - q * 2.2) * 0.07 + Math.sin(t * 0.7 + seed) * 0.04;
    a += (kind === 0 ? 0.11 : 0.18) * (1 - run * 0.7) + wave - pose * 0.16 + (bb.hy - bb.cy) * 0.004 + bb.hy * 0.012 * q + die * 0.08;
    const last = pts[pts.length - 1];
    pts.push({ x: last.x + Math.cos(a) * seg, y: Math.min(-6, last.y + Math.sin(a) * seg) });
  }
  if (kind === 0) {
    // cauda felpuda do lobo com ponta de gelo
    tube(ctx, pts, (q) => 6 + Math.sin(Math.min(1, q * 1.15) * Math.PI) * 40 + (1 - q) * 14, mixHex(dark, '#000000', 0.3));
    tube(ctx, pts, (q) => 2 + Math.sin(Math.min(1, q * 1.15) * Math.PI) * 36 + (1 - q) * 12, body);
    tube(ctx, pts.slice(6), (q) => 26 * (1 - q) + 3, rgba(P.accent, 0.85));
    // mechas
    ctx.strokeStyle = rgba(P.dark, 0.5);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 2; i < n - 1; i++) {
      const p0 = pts[i], p1 = pts[i + 1];
      ctx.moveTo(p0.x, p0.y + 6);
      ctx.lineTo(p1.x + 4, p1.y + 12);
    }
    ctx.stroke();
  } else {
    // behemoth: cauda grossa com tufo na ponta
    tube(ctx, pts, (q) => 22 - q * 14, dark);
    const tip = pts[pts.length - 1];
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(tip.x + 2, tip.y + 8, 9, 17, 0.2 + Math.sin(t * 2.2 + seed) * 0.2, 0, TAU);
    ctx.fill();
  }
}

/** Crina de gelo do lobo (cristais em volta do pescoço) — eriça no golpe, balança com atraso na passada. */
function maneIce(ctx: CanvasRenderingContext2D, c: V, head: V, P: Pal, st: DrawState, t: number, ch: Ch, g: Gait, lagPh: (d: number) => { cy: number }, seed: number) {
  // centro da crina: no pescoço, puxado um pouco na direção da cabeça
  const cx = c.x * 0.8 + head.x * 0.2 - 6, cy = c.y * 0.8 + head.y * 0.2 + 4;
  // brilho suave atrás (1 gradiente)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgrad(ctx, cx + 20, cy - 10, 90, rgba(P.glow, 0.08 + ch.mane * 0.18), rgba(P.glow, 0));
  ctx.beginPath();
  ctx.arc(cx + 20, cy - 10, 90, 0, TAU);
  ctx.fill();
  ctx.restore();
  const lift = ch.mane;
  const cA = hurtTint(ctx, st, P.accent);
  const cB = hurtTint(ctx, st, mixHex(P.accent, P.glow, 0.5));
  for (let i = 0; i < 12; i++) {
    const q = i / 11;
    const lagB = lagPh(0.05 + q * 0.1).cy;
    const a = -2.75 + q * 2.55 - lift * 0.3 * (q - 0.5) + Math.sin(t * 2.2 - q * 3 + seed) * 0.05 + lagB * 0.012 * (1 - q);
    const len = (40 + h01(i, 4) * 26) * (1 - q * 0.25) + lift * 18 + Math.sin(t * 2 + i) * 2;
    const x = cx + 14 + Math.cos(a) * 32;
    const y = cy + Math.sin(a) * 40;
    const w = 0.22;
    ctx.fillStyle = i % 2 ? cA : cB;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a - w) * 10, y + Math.sin(a - w) * 10);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.lineTo(x + Math.cos(a + w) * 10, y + Math.sin(a + w) * 10);
    ctx.closePath();
    ctx.fill();
    // filete claro (faceta do cristal)
    ctx.fillStyle = rgba('#ffffff', 0.35);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a - w) * 8, y + Math.sin(a - w) * 8);
    ctx.lineTo(x + Math.cos(a) * len * 0.9, y + Math.sin(a) * len * 0.9);
    ctx.lineTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10);
    ctx.fill();
  }
}

function wolfHead(ctx: CanvasRenderingContext2D, jaw: number, body: string, dark: string, P: Pal, st: DrawState, fx: HeadFx): V {
  // orelhas (mexem)
  ctx.fillStyle = dark;
  for (const [x, a] of [[22, 0.35], [6, 0.05]] as const) {
    ctx.save();
    ctx.translate(x, -24);
    ctx.rotate(a - fx.ear * 0.5);
    ctx.beginPath();
    ctx.moveTo(-12, 4);
    ctx.lineTo(4, -42);
    ctx.lineTo(14, 4);
    ctx.fill();
    ctx.fillStyle = rgba(P.accent, 0.3);
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(4, -28);
    ctx.lineTo(8, 0);
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.restore();
  }
  // mandíbula
  ctx.save();
  ctx.translate(14, 10);
  ctx.rotate(jaw * 0.62);
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(-70, 4);
  ctx.lineTo(-62, 16);
  ctx.lineTo(10, 22);
  ctx.fill();
  ctx.fillStyle = '#f4f0e8';
  for (let i = 0; i < 5; i++) teeth(ctx, -62 + i * 11, 4, -8);
  teeth(ctx, -64, 4, -14);
  ctx.restore();
  if (jaw > 0.1) {
    ctx.fillStyle = '#3a0a10';
    ctx.beginPath();
    ctx.moveTo(-62, 12);
    ctx.lineTo(16, 10);
    ctx.lineTo(-52, 12 + jaw * 38);
    ctx.fill();
    ctx.fillStyle = '#a03040';
    ctx.beginPath();
    ctx.ellipse(-30, 14 + jaw * 14, 18, 5, 0.3 + jaw * 0.4, 0, TAU);
    ctx.fill();
  }
  // crânio + focinho longo
  ctx.fillStyle = mixHex(dark, '#000000', 0.35);
  ctx.beginPath();
  ctx.moveTo(38, -12);
  ctx.quadraticCurveTo(26, -41, -10, -33);
  ctx.quadraticCurveTo(-30, -27, -79, 0);
  ctx.quadraticCurveTo(-84, 9, -74, 15);
  ctx.lineTo(10, 17);
  ctx.quadraticCurveTo(43, 16, 38, -12);
  ctx.fill();
  ctx.fillStyle = vgrad(ctx, -34, 16, mixHex(body, '#ffffff', 0.18), body);
  ctx.beginPath();
  ctx.moveTo(36, -12);
  ctx.quadraticCurveTo(24, -38, -10, -30);
  ctx.quadraticCurveTo(-30, -24, -76, 0);
  ctx.quadraticCurveTo(-80, 8, -72, 12);
  ctx.lineTo(10, 14);
  ctx.quadraticCurveTo(40, 14, 36, -12);
  ctx.fill();
  // rosnado: ruga no focinho
  ctx.strokeStyle = rgba(P.dark, 0.5 * clamp(jaw * 2));
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-58, -6);
  ctx.quadraticCurveTo(-50, -12, -42, -8);
  ctx.moveTo(-50, -2);
  ctx.quadraticCurveTo(-42, -8, -34, -4);
  ctx.stroke();
  ctx.fillStyle = '#0a0a10';
  ctx.beginPath();
  ctx.ellipse(-74, 4, 6, 5, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#f4f0e8';
  for (let i = 0; i < 5; i++) teeth(ctx, -66 + i * 11, 11, 9);
  teeth(ctx, -64, 11, 18);
  eyeGlow(ctx, -18, -14, 6 + fx.rage * 2, P.eye, fx.eye);
  ctx.strokeStyle = dark;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-32, -24 + jaw * 3);
  ctx.lineTo(-4, -18);
  ctx.stroke();
  return { x: -74, y: 14 + jaw * 10 };
}

function bearHead(ctx: CanvasRenderingContext2D, jaw: number, body: string, dark: string, P: Pal, st: DrawState, fx: HeadFx): V {
  ctx.fillStyle = mixHex(dark, '#000000', 0.3);
  for (const x of [20, -6]) {
    ctx.beginPath();
    ctx.arc(x + fx.ear * 4, -40 + Math.abs(fx.ear) * 3, 17, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = body;
  for (const x of [20, -6]) {
    ctx.beginPath();
    ctx.arc(x + fx.ear * 4, -40 + Math.abs(fx.ear) * 3, 15, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(20 + fx.ear * 4, -40, 7, 0, TAU);
  ctx.arc(-6 + fx.ear * 4, -40, 7, 0, TAU);
  ctx.fill();
  // mandíbula
  ctx.save();
  ctx.translate(0, 16);
  ctx.rotate(jaw * 0.58);
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(14, -4);
  ctx.lineTo(-58, 0);
  ctx.quadraticCurveTo(-56, 18, -40, 20);
  ctx.lineTo(14, 18);
  ctx.fill();
  ctx.fillStyle = '#f0e8d8';
  teeth(ctx, -50, 0, -10);
  teeth(ctx, -30, 0, -7);
  ctx.restore();
  if (jaw > 0.1) {
    ctx.fillStyle = '#3a0a10';
    ctx.beginPath();
    ctx.moveTo(-56, 16);
    ctx.lineTo(10, 14);
    ctx.lineTo(-46, 16 + jaw * 34);
    ctx.fill();
  }
  // cabeça redonda + focinho
  ctx.fillStyle = mixHex(dark, '#000000', 0.3);
  ctx.beginPath();
  ctx.arc(6, -6, 45, 0, TAU);
  ctx.fill();
  ctx.fillStyle = vgrad(ctx, -50, 30, mixHex(body, '#ffffff', 0.12), body);
  ctx.beginPath();
  ctx.arc(6, -6, 42, 0, TAU);
  ctx.fill();
  ctx.fillStyle = hurtTint(ctx, st, mixHex(P.body, '#c8a070', 0.35));
  ctx.beginPath();
  ctx.ellipse(-38, 6, 28, 18, 0.1, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#0a0806';
  ctx.beginPath();
  ctx.ellipse(-62, 0, 9, 7, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#f0e8d8';
  teeth(ctx, -54, 14, 12);
  teeth(ctx, -34, 14, 8);
  // runa na testa
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba(P.accent, 0.8);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(4, -40);
  ctx.lineTo(4, -20);
  ctx.moveTo(-6, -34);
  ctx.lineTo(14, -26);
  ctx.stroke();
  ctx.restore();
  eyeGlow(ctx, -16, -14, 5 + fx.rage * 2, P.eye, fx.eye);
  ctx.strokeStyle = dark;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-28, -22 + jaw * 3);
  ctx.lineTo(-6, -20);
  ctx.stroke();
  return { x: -60, y: 18 + jaw * 8 };
}

/** Juba do leão: atrás da cabeça, as mechas balançam com atraso. */
function lionMane(ctx: CanvasRenderingContext2D, h: V, dark: string, P: Pal, t: number, rot0: number, ch: Ch, lag: { cy: number }, seed: number) {
  ctx.save();
  ctx.translate(h.x + 16, h.y + lag.cy * 0.3);
  ctx.rotate(rot0 * 0.7);
  const puff = 1 + ch.mane * 0.12;
  for (const [col, r0, r1, n] of [[mixHex(dark, P.glow, 0.2), 54, 80, 22], [mixHex(dark, '#000000', 0.15), 46, 64, 18]] as const) {
    ctx.fillStyle = col;
    ctx.beginPath();
    for (let i = 0; i <= n * 2; i++) {
      const a = (i / (n * 2)) * TAU;
      const sway = Math.sin(t * 2.2 + seed + a * 2) * 4 + lag.cy * Math.max(0, Math.cos(a)) * 0.6;
      const r = (i % 2 ? r0 : r1 + sway + h01(i, 9) * 8) * puff;
      ctx.lineTo(Math.cos(a) * r * 1.05 + Math.max(0, Math.cos(a)) * 8, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function lionHead(ctx: CanvasRenderingContext2D, jaw: number, body: string, dark: string, P: Pal, st: DrawState, fx: HeadFx): V {
  // orelhinhas
  ctx.fillStyle = mixHex(body, dark, 0.3);
  ctx.beginPath();
  ctx.arc(10 + fx.ear * 3, -36, 11, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.translate(-8, 16);
  ctx.rotate(jaw * 0.62);
  ctx.fillStyle = mixHex(body, dark, 0.2);
  ctx.beginPath();
  ctx.moveTo(14, -2);
  ctx.lineTo(-48, 2);
  ctx.quadraticCurveTo(-46, 18, -30, 20);
  ctx.lineTo(14, 18);
  ctx.fill();
  ctx.fillStyle = '#f4f0e8';
  teeth(ctx, -40, 2, -10);
  teeth(ctx, -22, 2, -6);
  ctx.restore();
  if (jaw > 0.1) {
    ctx.fillStyle = '#3a0a10';
    ctx.beginPath();
    ctx.moveTo(-52, 16);
    ctx.lineTo(6, 16);
    ctx.lineTo(-40, 18 + jaw * 34);
    ctx.fill();
  }
  ctx.fillStyle = mixHex(dark, '#000000', 0.3);
  ctx.beginPath();
  ctx.moveTo(33, -10);
  ctx.quadraticCurveTo(24, -43, -10, -39);
  ctx.quadraticCurveTo(-49, -33, -55, 0);
  ctx.quadraticCurveTo(-59, 19, -40, 21);
  ctx.lineTo(16, 23);
  ctx.quadraticCurveTo(39, 12, 33, -10);
  ctx.fill();
  ctx.fillStyle = vgrad(ctx, -40, 30, mixHex(body, '#ffffff', 0.16), body);
  ctx.beginPath();
  ctx.moveTo(30, -10);
  ctx.quadraticCurveTo(22, -40, -10, -36);
  ctx.quadraticCurveTo(-46, -30, -52, 0);
  ctx.quadraticCurveTo(-56, 16, -40, 18);
  ctx.lineTo(16, 20);
  ctx.quadraticCurveTo(36, 10, 30, -10);
  ctx.fill();
  // focinho claro + bigode
  ctx.fillStyle = rgba('#ffffff', 0.18);
  ctx.beginPath();
  ctx.ellipse(-38, 8, 16, 10, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#2a1a10';
  ctx.beginPath();
  ctx.moveTo(-56, -2);
  ctx.lineTo(-44, -4);
  ctx.lineTo(-48, 8);
  ctx.fill();
  ctx.fillStyle = '#f4f0e8';
  teeth(ctx, -44, 16, 12);
  teeth(ctx, -22, 16, 8);
  eyeGlow(ctx, -18, -14, 5 + fx.rage * 2, P.eye, fx.eye);
  ctx.strokeStyle = dark;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-30, -24 + jaw * 3);
  ctx.lineTo(-4, -20);
  ctx.stroke();
  return { x: -52, y: 14 + jaw * 10 };
}

function goatHead(ctx: CanvasRenderingContext2D, h: V, rot0: number, jaw: number, P: Pal, st: DrawState, eye: number, map: (x: number, y: number) => V): V {
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(rot0);
  const fur = hurtTint(ctx, st, '#d8d0c0');
  // chifres curvos
  ctx.lineCap = 'round';
  for (const [dx, col, lw] of [[10, '#3a2a1a', 13], [10, '#5a4a3a', 9], [-4, '#3a2a1a', 13], [-4, '#6a5a4a', 9]] as const) {
    ctx.strokeStyle = hurtTint(ctx, st, col);
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(dx, -14);
    ctx.bezierCurveTo(dx + 10, -50, dx + 50, -50, dx + 40, -14);
    ctx.quadraticCurveTo(dx + 34, 0, dx + 24, -6);
    ctx.stroke();
  }
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.moveTo(18, -12);
  ctx.quadraticCurveTo(0, -26, -20, -14);
  ctx.lineTo(-40, 6);
  ctx.quadraticCurveTo(-40, 16, -30, 16);
  ctx.lineTo(10, 14);
  ctx.quadraticCurveTo(26, 6, 18, -12);
  ctx.fill();
  // barbicha (balança)
  ctx.beginPath();
  ctx.moveTo(-30, 14);
  ctx.lineTo(-24 + Math.sin(st.t * 3) * 3, 34 + jaw * 6);
  ctx.lineTo(-16, 14);
  ctx.fill();
  if (jaw > 0.2) {
    ctx.fillStyle = '#3a0a10';
    ctx.beginPath();
    ctx.ellipse(-30, 12, 8, 3 + jaw * 5, 0, 0, TAU);
    ctx.fill();
  }
  if (eye > 0.1) {
    ctx.fillStyle = '#f0d040';
    ctx.beginPath();
    ctx.ellipse(-10, -6, 5, 4 * Math.min(1, eye), 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.fillRect(-14, -7, 8, 2);
  } else {
    ctx.strokeStyle = '#5a4a3a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-15, -6);
    ctx.lineTo(-5, -6);
    ctx.stroke();
  }
  const tip = map(-14, -40);
  ctx.restore();
  return tip;
}

function boarHead(ctx: CanvasRenderingContext2D, jaw: number, body: string, dark: string, P: Pal, st: DrawState, s: BossSpec, fx: HeadFx): V {
  // chifres de touro
  ctx.lineCap = 'round';
  for (const [dx, w, col] of [[40, 16, '#5a4a3a'], [40, 12, '#e0d4bc'], [22, 20, '#5a4a3a'], [22, 16, '#e0d4bc']] as const) {
    ctx.strokeStyle = hurtTint(ctx, st, col);
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(dx, -40);
    ctx.quadraticCurveTo(dx - 10, -90, dx - 60, -96);
    ctx.stroke();
  }
  // orelha
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(44, -30, 22, 10, 0.5 - fx.ear * 0.5, 0, TAU);
  ctx.fill();
  // mandíbula
  ctx.save();
  ctx.translate(0, 20);
  ctx.rotate(jaw * 0.42);
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(30, -4);
  ctx.lineTo(-70, 0);
  ctx.quadraticCurveTo(-66, 22, -46, 24);
  ctx.lineTo(30, 22);
  ctx.fill();
  ctx.restore();
  if (jaw > 0.1) {
    ctx.fillStyle = '#3a0a06';
    ctx.beginPath();
    ctx.moveTo(-70, 20);
    ctx.lineTo(20, 22);
    ctx.lineTo(-60, 22 + jaw * 34);
    ctx.fill();
  }
  // cabeçorra
  ctx.fillStyle = mixHex(dark, '#000000', 0.35);
  ctx.beginPath();
  ctx.moveTo(53, -30);
  ctx.quadraticCurveTo(32, -68, -20, -57);
  ctx.quadraticCurveTo(-73, -43, -87, -4);
  ctx.quadraticCurveTo(-93, 18, -74, 27);
  ctx.lineTo(20, 33);
  ctx.quadraticCurveTo(63, 22, 53, -30);
  ctx.fill();
  ctx.fillStyle = vgrad(ctx, -60, 40, mixHex(body, '#ffffff', 0.1), body);
  ctx.beginPath();
  ctx.moveTo(50, -30);
  ctx.quadraticCurveTo(30, -64, -20, -54);
  ctx.quadraticCurveTo(-70, -40, -84, -4);
  ctx.quadraticCurveTo(-90, 16, -74, 24);
  ctx.lineTo(20, 30);
  ctx.quadraticCurveTo(60, 20, 50, -30);
  ctx.fill();
  // placa de armadura na testa
  ctx.fillStyle = mixHex(dark, '#5a5a60', 0.4);
  ctx.beginPath();
  ctx.moveTo(30, -50);
  ctx.quadraticCurveTo(-10, -62, -40, -36);
  ctx.lineTo(-24, -24);
  ctx.quadraticCurveTo(0, -40, 34, -32);
  ctx.fill();
  ctx.strokeStyle = rgba(P.accent, 0.5);
  ctx.lineWidth = 2;
  ctx.stroke();
  // focinho de javali
  ctx.fillStyle = hurtTint(ctx, st, mixHex(P.body, '#c88a7a', 0.4));
  ctx.beginPath();
  ctx.ellipse(-86, 6, 12, 18, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#1a0a06';
  ctx.beginPath();
  ctx.ellipse(-90, 0, 3, 5, 0, 0, TAU);
  ctx.ellipse(-88, 14, 3, 5, 0, 0, TAU);
  ctx.fill();
  // presas
  if ((s.feat.tusks ?? 1) > 0) {
    ctx.fillStyle = hurtTint(ctx, st, '#f4ecd8');
    for (const [x, sc] of [[-60, 1], [-40, 0.8]] as const) {
      ctx.beginPath();
      ctx.moveTo(x, 22);
      ctx.quadraticCurveTo(x - 30 * sc, 16, x - 34 * sc, -26 * sc);
      ctx.quadraticCurveTo(x - 18 * sc, 6, x + 10, 30);
      ctx.fill();
    }
  }
  eyeGlow(ctx, -34, -20, 6 + fx.rage * 2, P.eye, fx.eye);
  ctx.strokeStyle = dark;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-48, -30);
  ctx.lineTo(-22, -26);
  ctx.stroke();
  // vapor das narinas (bufa no ritmo da respiração)
  for (let i = 0; i < 3; i++) {
    const ph = (st.t * 0.9 + i / 3) % 1;
    ctx.fillStyle = `rgba(230,230,230,${(1 - ph) * 0.35})`;
    ctx.beginPath();
    ctx.arc(-96 - ph * 26, 4 + ph * 10, 3 + ph * 8, 0, TAU);
    ctx.fill();
  }
  return { x: -90, y: 8 + jaw * 8 };
}

function teeth(ctx: CanvasRenderingContext2D, x: number, y: number, len: number) {
  ctx.beginPath();
  ctx.moveTo(x - 3.5, y);
  ctx.lineTo(x, y + len);
  ctx.lineTo(x + 3.5, y);
  ctx.fill();
}

/** Asinha da quimera (morcego). */
function chimeraWing(ctx: CanvasRenderingContext2D, at: V, ang: number, col: string, P: Pal, sc: number) {
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(ang);
  ctx.scale(sc, sc);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(30, -90);
  ctx.quadraticCurveTo(70, -70, 110, -60);
  ctx.quadraticCurveTo(84, -40, 92, -18);
  ctx.quadraticCurveTo(60, -30, 56, -6);
  ctx.quadraticCurveTo(30, -20, 0, 10);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = P.dark;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(30, -90);
  ctx.lineTo(110, -60);
  ctx.moveTo(30, -90);
  ctx.lineTo(92, -18);
  ctx.moveTo(30, -90);
  ctx.lineTo(56, -6);
  ctx.stroke();
  ctx.restore();
}

/** Cauda de serpente: ondula com fase própria e dá o bote por cima das costas no swipe. Devolve a cabeça (mapa). */
function snakeTail(
  ctx: CanvasRenderingContext2D, P: Pal, st: DrawState, root: V, t: number, ch: Ch, chLag: Ch, chLag2: Ch, g: Gait, die: number,
  map: (x: number, y: number) => V, seed: number,
): V {
  const scale = hurtTint(ctx, st, mixHex(P.accent, P.dark, 0.45));
  const k = ch.snake;
  const strikeK = Math.max(0, k);
  const coil = Math.max(0, -k);
  const sway = (1 - strikeK) * (1 - die);
  const head = {
    x: root.x + 26 + Math.sin(t * 1.3 + seed + 4) * 12 * sway + coil * 30 - strikeK * 420 + Math.sin(TAU * g.ph) * 6 * g.k,
    y: root.y - 118 + Math.cos(t * 1.7 + seed) * 9 * sway - coil * 40 + strikeK * 120 + die * 150 + Math.abs(Math.sin(TAU * g.ph)) * 6 * g.k,
  };
  // pontos de controle atrasados: o corpo segue a cabeça
  const lk = Math.max(0, chLag.snake), lk2 = Math.max(0, chLag2.snake);
  // no bote o corpo da cobra faz um arco ALTO por cima das costas (e a parte de trás chega atrasada)
  const arc = Math.max(strikeK, lk);
  const c1 = { x: root.x + 90 - arc * 80 + Math.sin(t * 1.3 + seed + 3) * 10, y: root.y - 10 - arc * 190 + lk2 * 40 };
  const c2 = { x: head.x + 60 + arc * 150 + Math.sin(t * 1.3 + seed + 3.6) * 12, y: head.y + 70 - arc * 230 };
  const pts = bez(root, c1, c2, head, 24);
  tube(ctx, pts, (q) => 30 - q * 14, mixHex(P.dark, '#000000', 0.3));
  tube(ctx, pts, (q) => 26 - q * 12, scale);
  // escamas / faixas
  ctx.fillStyle = rgba(P.accent, 0.4);
  for (let i = 2; i < pts.length - 1; i += 2) {
    ctx.beginPath();
    ctx.arc(pts[i].x, pts[i].y, 4.5 - i * 0.1, 0, TAU);
    ctx.fill();
  }
  // cabeça da cobra: olha na direção do movimento
  const dir = Math.atan2(head.y - pts[20].y, head.x - pts[20].x);
  const open = clamp(strikeK * 1.2 + coil * 0.6 + 0.1 + bump(frac(t / 3.1 + seed), 0, 0.05, 0.12) * 0.4);
  ctx.save();
  ctx.translate(head.x, head.y);
  ctx.rotate(dir + Math.PI);
  ctx.fillStyle = scale;
  ctx.beginPath();
  ctx.moveTo(14, -10);
  ctx.quadraticCurveTo(-10, -20, -34, -6 - open * 6);
  ctx.lineTo(-10, -2);
  ctx.lineTo(-34, 6 + open * 10);
  ctx.quadraticCurveTo(-10, 18, 14, 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  teeth(ctx, -28, -4 - open * 4, 8 * open + 2);
  // língua
  if (open > 0.3) {
    ctx.strokeStyle = '#ff3a5a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-30, 0);
    ctx.lineTo(-46, 2 + Math.sin(t * 30) * 3);
    ctx.lineTo(-52, -2);
    ctx.moveTo(-46, 2 + Math.sin(t * 30) * 3);
    ctx.lineTo(-52, 6);
    ctx.stroke();
  }
  ctx.fillStyle = '#ffe14d';
  ctx.beginPath();
  ctx.ellipse(-10, -10, 4, 3, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.fillRect(-11, -12, 2, 4);
  const tip = map(-34, 0);
  ctx.restore();
  return tip;
}

/** Partículas subindo (sem shadowBlur: barato no celular). */
function motes(ctx: CanvasRenderingContext2D, x: number, y: number, wdt: number, hgt: number, p: number, seed: number, n: number, color: string, alpha: number) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const sp = 0.6 + h01(seed, i) * 0.8;
    const k = (h01(seed + 1, i) + p * 3 * sp) % 1;
    const px = x + (h01(seed + 2, i) - 0.5) * wdt + Math.sin(p * 12 + i) * 6;
    const py = y - k * hgt;
    ctx.globalAlpha = alpha * Math.sin(k * Math.PI);
    const r = 2.5 * (0.6 + h01(seed + 3, i));
    ctx.fillRect(px - r / 2, py - r / 2, r, r);
  }
  ctx.restore();
}
