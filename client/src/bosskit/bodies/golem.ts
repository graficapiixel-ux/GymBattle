/**
 * GOLENS (feat.kind): 0 = Kragmaw, colosso de basalto (rachaduras em brasa, musgo);
 * 1 = Ferrolho, golem de ferro fundido (rebites, chaminé, fornalha na barriga);
 * 2 = Prismora, sentinela de cristal flutuante (feat.crystals, estilhaços orbitando);
 * 3 = Magmor, coração de lava (placas negras com veios de lava, gotas pingando).
 * Origem no chão, olhando para a esquerda; ~330 de altura em escala 1.
 *
 * ANIMAÇÃO: peso acima de tudo. A passada usa `st.gait` (1 ciclo = 150 unidades locais
 * percorridas, o mesmo STRIDE do motor), então o pé de apoio recua exatamente o que o
 * corpo avança: nada de patinar. Cada pisada afunda o corpo, treme as placas e solta
 * pedrinhas/faíscas/lava; os braços pendulam com atraso; a cabeça estabiliza.
 */
import type { BossSpec } from '@gymbattle/shared';
import type { Anchors, DrawState, V } from '../types';
import {
  attacking, eyeGlow, h01, hurtTint, mixHex, rgrad, vgrad,
  TAU, clamp, sm, smoke, rising, orb, hexA,
} from '../util';

interface Arm { sh: V; el: V; hd: V; ang: number }
interface Rig {
  hip: V; chest: V; head: V; shF: V; shB: V; l1: number; l2: number; fist: number;
}

/** Cores já com o flash de dano. */
interface Pal { body: string; dark: string; accent: string; glow: string; eye: string; light: string }

/** Esqueleto base de cada tipo (antes da pose). */
const RIGS: Rig[] = [
  { hip: { x: 5, y: -105 }, chest: { x: 10, y: -205 }, head: { x: -66, y: -272 }, shF: { x: -92, y: -226 }, shB: { x: 72, y: -258 }, l1: 98, l2: 92, fist: 38 },
  { hip: { x: 0, y: -118 }, chest: { x: -5, y: -210 }, head: { x: -22, y: -318 }, shF: { x: -92, y: -262 }, shB: { x: 78, y: -262 }, l1: 78, l2: 78, fist: 30 },
  { hip: { x: 0, y: -150 }, chest: { x: -5, y: -232 }, head: { x: -12, y: -322 }, shF: { x: -72, y: -268 }, shB: { x: 58, y: -272 }, l1: 76, l2: 84, fist: 22 },
  { hip: { x: 5, y: -95 }, chest: { x: 5, y: -185 }, head: { x: -100, y: -232 }, shF: { x: -98, y: -212 }, shB: { x: 82, y: -232 }, l1: 82, l2: 80, fist: 36 },
];

/** Pernas: coxa, canela, altura do tornozelo, posição de descanso dos pés (frente / trás). */
const LEGS = [
  { th: 56, sh: 56, ank: 26, fF: -50, fB: 48 },
  { th: 62, sh: 62, ank: 18, fF: -46, fB: 44 },
  { th: 0, sh: 0, ank: 0, fF: 0, fB: 0 },
  { th: 50, sh: 50, ank: 24, fF: -52, fB: 50 },
];

/** Braços em repouso (ângulo do ombro, dobra do cotovelo). */
const REST = [
  { aF: 0.2, bF: 0.18, aB: -0.08, bB: 0.3 },
  { aF: 0.18, bF: 0.35, aB: -0.1, bB: 0.32 },
  { aF: 0.3, bF: 0.4, aB: -0.12, bB: 0.36 },
  { aF: 0.22, bF: 0.22, aB: -0.06, bB: 0.3 },
];

const armPts = (sh: V, a: number, b: number, l1: number, l2: number): Arm => {
  const el = { x: sh.x - Math.sin(a) * l1, y: sh.y + Math.cos(a) * l1 };
  const hd = { x: el.x - Math.sin(a + b) * l2, y: el.y + Math.cos(a + b) * l2 };
  return { sh, el, hd, ang: a + b };
};

const frac = (x: number) => x - Math.floor(x);
const L = (a: number, b: number, k: number) => a + (b - a) * k;

// ======================================================================= passada

/** Fração do ciclo em que cada pé fica apoiado (golem: apoio longo, passo pesado). */
const STANCE = 0.62;
/** O pé apoiado percorre isto (local) durante o apoio: 150 por ciclo, igual ao motor. */
const SLEN = 150 * STANCE;

interface Foot {
  /** deslocamento do pé em relação ao descanso (+ = para trás) */
  dx: number;
  lift: number;
  ang: number;
  /** ciclos desde que pisou (−1 = no ar) */
  c: number;
  /** progresso do balanço 0..1 (−1 = apoiado) */
  v: number;
  /** índice da pisada (para sortear as pedrinhas) */
  n: number;
}

interface Gait {
  mv: number;
  on: number;
  fwd: boolean;
  sp: number;
  F: Foot;
  B: Foot;
  /** afundar (+) / subir (−) do corpo */
  bob: number;
  /** tranco curto logo após a pisada (0..1) */
  jolt: number;
  /** balanço dos ombros (−1..1) */
  roll: number;
  /** pêndulo dos braços (com atraso) */
  swF: number;
  swB: number;
}

function foot(ph: number, fwd: boolean, mv: number, on: number): Foot {
  const q = frac(ph);
  const n = Math.floor(ph);
  if (q < STANCE) {
    const u = q / STANCE;
    return { dx: SLEN * (u - 0.5) * on, lift: 0, ang: 0, c: fwd ? q : STANCE - q, v: -1, n };
  }
  const v = (q - STANCE) / (1 - STANCE);
  const e = v * v * (3 - 2 * v);
  // levanta cedo e desce pesado (pico antes da metade)
  const arc = Math.sin(Math.PI * Math.pow(v, 0.8));
  const H = (12 + 34 * mv) * on;
  return { dx: SLEN * (0.5 - e) * on, lift: H * arc, ang: -0.32 * Math.sin(TAU * v) * on, c: -1, v, n };
}

/** Avanço da pata da frente (1 = toda à frente, −1 = toda atrás) num instante da fase. */
const reach = (ph: number) => {
  const q = frac(ph);
  if (q < STANCE) return 1 - 2 * (q / STANCE);
  const v = (q - STANCE) / (1 - STANCE);
  return -1 + 2 * v * v * (3 - 2 * v);
};

function gaitOf(st: DrawState): Gait {
  const mv = clamp(st.move || 0);
  const on = sm(0.02, 0.3, mv);
  const fwd = (st.vx || 0) <= 0;
  // recuando: a fase roda ao contrário (o pé apoiado vai para a frente) e a pisada cai no meio-ciclo do motor
  const g = st.gait || 0;
  const sp = fwd ? g : STANCE - g;
  const F = foot(sp, fwd, mv, on);
  const B = foot(sp + 0.5, fwd, mv, on);
  const dip = (f: Foot) => (f.c >= 0 && f.c < 0.24 ? Math.sin((Math.PI * f.c) / 0.24) : 0);
  const kick = (f: Foot) => (f.c >= 0 && f.c < 0.12 ? 1 - f.c / 0.12 : 0);
  const rise = (f: Foot) => (f.v >= 0 ? Math.sin(Math.PI * f.v) : 0);
  const bob = on * ((6 + 12 * mv) * Math.max(dip(F), dip(B)) - (3 + 7 * mv) * Math.max(rise(F), rise(B)));
  const jolt = on * (0.35 + 0.65 * mv) * Math.max(kick(F), kick(B));
  // braço da frente vai para trás quando a perna da frente vai para a frente (com atraso de pêndulo)
  const amp = on * (0.06 + 0.2 * mv);
  const lag = fwd ? 0.09 : -0.09;
  return {
    mv, on, fwd, sp, F, B, bob, jolt,
    roll: on * reach(sp - lag * 0.5),
    swF: -amp * reach(sp - lag),
    swB: amp * reach(sp - lag),
  };
}

// ======================================================================= pose

interface Pose {
  bx: number; cr: number; lean: number; puff: number;
  aF: number; bF: number; aB: number; bB: number;
  hx: number; hy: number; jaw: number; shake: number;
  /** brilho de magia nas mãos */
  glow: number;
  /** porta da fornalha / boca do cristal aberta */
  door: number;
  /** braços erguendo a rocha (Kragmaw arremessando) */
  lift: number;
  /** tranco do impacto 0..1 */
  imp: number;
}

type PoseKey = 'bx' | 'cr' | 'lean' | 'puff' | 'aF' | 'bF' | 'aB' | 'bB' | 'hx' | 'hy' | 'jaw' | 'glow' | 'door' | 'lift';
type Part = Partial<Record<PoseKey, number>>;

/** Fases do golpe: W = carga (antecipação), H = golpe mantido, I = tranco do impacto. */
function phases(p: number, a0 = 0.4, h0 = 0.42, h1 = 0.55, r0 = 0.66) {
  const ant = sm(0, a0, p);
  const hit = sm(h0, h1, p);
  const back = sm(r0, 1, p);
  const imp = sm(h1 - 0.03, h1 + 0.01, p) * Math.exp(-Math.max(0, p - h1 - 0.01) * 9);
  return { W: ant * (1 - hit), H: hit * (1 - back), I: imp };
}

/** Mistura descanso → carga → golpe (sem acumular erro). */
function blend(P: Pose, W: number, H: number, w: Part, h: Part) {
  const keys = new Set<PoseKey>([...(Object.keys(w) as PoseKey[]), ...(Object.keys(h) as PoseKey[])]);
  for (const k of keys) {
    const r = P[k];
    const wv = w[k] ?? r;
    const hv = h[k] ?? r;
    P[k] = r + (wv - r) * W + (hv - r) * H;
  }
}

function poseAt(kind: number, st: DrawState, p: number, G: Gait): Pose {
  const t = st.t;
  const r = REST[kind];
  const still = 1 - G.on;
  const breath = Math.sin(t * 1.2);
  // idle: respira, troca o peso de pé devagar, braços balançam com fases diferentes
  const shift = Math.sin(t * 0.55);
  const P: Pose = {
    bx: shift * 3 * still,
    cr: breath * 3.4 + G.bob + (kind === 2 ? Math.sin(t * 1.5) * 8 - 6 : 0),
    lean: (G.fwd ? -0.06 : 0.04) * G.mv * G.on + Math.sin(t * 0.55 + 1) * 0.012 * still + G.jolt * 0.012,
    puff: 1 + breath * 0.014,
    aF: r.aF + Math.sin(t * 1.2) * 0.05 * still + G.swF,
    bF: r.bF + Math.sin(t * 1.2 - 0.6) * 0.06 * still + G.swF * 0.5 - G.jolt * 0.1,
    aB: r.aB - Math.sin(t * 1.1 + 0.8) * 0.05 * still + G.swB,
    bB: r.bB + Math.sin(t * 1.1 + 0.2) * 0.05 * still + G.swB * 0.5 - G.jolt * 0.1,
    hx: shift * -1.5 * still,
    hy: -G.bob * 0.55 + Math.sin(t * 1.2 - 0.5) * 1.2,
    jaw: 0, shake: 0, glow: 0, door: 0, lift: 0, imp: 0,
  };
  if (kind === 2) {
    // cristal flutuante: inclina na direção do voo e balança no ritmo dos "impulsos"
    P.lean += clamp((st.vx || 0) / 300, -0.25, 0.25) * 0.6 - 0.04 * G.mv * (G.fwd ? 1 : -1);
    P.cr += Math.sin(G.sp * TAU * 2) * 5 * G.on;
  }

  if (st.anim === 'attack' || st.anim === 'enter') {
    const pose = st.anim === 'enter' ? 'roar' : st.pose;
    if (pose === 'slam') {
      const { W, H, I } = phases(p);
      blend(P, W, H,
        { aF: 3.2, bF: 0.6, aB: 3.0, bB: 0.65, cr: P.cr - 14, lean: 0.17, puff: 1.05, hx: 10, hy: -8 },
        { aF: 1.0, bF: -0.12, aB: 1.1, bB: -0.1, cr: 46, lean: -0.3, hx: -16, hy: 14, jaw: 0.7 });
      P.cr += I * 16;
      P.imp = I;
      P.shake = W * 1.2;
    } else if (pose === 'swipe') {
      const { W, H, I } = phases(p);
      blend(P, W, H, { aF: -1.0, bF: 0.7, lean: 0.12, cr: 8, aB: 0.4 }, { aF: 1.8, bF: -0.15, lean: -0.16, cr: 14, aB: -0.3, jaw: 0.4 });
      P.imp = I;
    } else if (pose === 'charge') {
      const { W, H, I } = phases(p);
      blend(P, W, H, { bx: 30, lean: 0.1, cr: 12, aF: 0.9, aB: 0.8 }, { bx: -230, lean: -0.26, cr: 6, aF: 1.55, bF: -0.1, aB: 1.2 });
      P.imp = I;
    } else if (pose === 'cast') {
      const { W, H, I } = phases(p);
      if (kind === 3) {
        // gêiseres: ergue os punhos em brasa e enterra as mãos no chão
        blend(P, W, H,
          { aF: 2.7, bF: 0.9, aB: 2.5, bB: 0.9, cr: P.cr - 8, lean: 0.12, hy: -6, glow: 1 },
          { aF: 0.85, bF: -0.1, aB: 0.95, bB: -0.05, cr: 40, lean: -0.26, hy: 12, glow: 1, jaw: 0.6 });
        P.cr += I * 12;
      } else {
        blend(P, W, H,
          { aF: 2.45, bF: 1.15, aB: 2.3, bB: 1.05, cr: P.cr + 4, lean: 0.1, hy: -8, glow: 1 },
          { aF: 1.62, bF: -0.05, aB: 1.5, bB: 0.05, cr: 10, lean: -0.14, hx: -8, jaw: 0.5, glow: 1 });
      }
      P.shake = W * 1.5;
      P.imp = I;
    } else if (pose === 'shoot' || pose === 'breath') {
      if (kind === 0) {
        // arremesso: ergue a rocha (0–0,26), lança (0,26–0,34) e acompanha
        const { W, H, I } = phases(p, 0.24, 0.25, 0.34, 0.6);
        const dig = sm(0, 0.06, p) * (1 - sm(0.08, 0.2, p));
        blend(P, W, H,
          { aF: 3.05, bF: 0.7, aB: 2.85, bB: 0.8, cr: P.cr + 2, lean: 0.2, hx: 8, hy: -10, puff: 1.04, lift: 1 },
          { aF: 1.3, bF: -0.05, aB: 1.15, bB: 0.05, cr: 24, lean: -0.24, hx: -14, hy: 10, jaw: 0.8 });
        P.cr += dig * 22;
        P.imp = I;
        P.shake = W * 1.5;
      } else if (kind === 1) {
        // fornalha: enche o peito (fole), abre a porta e cospe; o corpo recua com o coice
        const { W, H, I } = phases(p);
        blend(P, W, H,
          { aF: 0.85, bF: 0.75, aB: -0.6, bB: 0.5, cr: P.cr + 8, lean: 0.14, puff: 1.06, hx: 10, hy: -4, door: 0.6 },
          { aF: 0.6, bF: 0.35, aB: -0.45, bB: 0.3, cr: 14, lean: -0.12, puff: 0.98, hx: -10, hy: 4, door: 1, jaw: 1 });
        P.bx += I * 16 + sm(0.5, 0.6, p) * (1 - sm(0.7, 1, p)) * 6;
        P.shake = W * 1.6 + H * 1.2;
        P.imp = I;
      } else {
        // raio: abre os braços, carrega o olho e projeta a cabeça
        const { W, H, I } = phases(p);
        blend(P, W, H,
          { aF: 1.95, bF: 1.0, aB: 1.8, bB: 0.9, cr: P.cr - 6, lean: 0.15, hx: 14, hy: -6, glow: 0.7, door: 0.5 },
          { aF: 0.95, bF: 0.15, aB: 0.75, bB: 0.2, cr: P.cr + 4, lean: -0.14, hx: -20, hy: 4, glow: 1, door: 1, jaw: 1 });
        P.bx += I * 12;
        P.shake = W * 1.2;
        P.imp = I;
      }
    } else {
      // rugido (também é a entrada de todos): encolhe, junta os punhos e explode para cima
      const { W, H, I } = phases(p, 0.38, 0.4, 0.5, 0.78);
      blend(P, W, H,
        { aF: 1.25, bF: 1.75, aB: 1.15, bB: 1.6, cr: P.cr + 24, lean: -0.12, hx: -8, hy: 16, puff: 0.98 },
        { aF: 2.55, bF: 0.35, aB: -1.9, bB: -0.4, cr: P.cr - 14, lean: 0.2, hx: 10, hy: -28, jaw: 1, puff: 1.08 });
      P.shake = W * 1.4 + H * 3.2;
      P.imp = I;
    }
  }

  // dano: tranco para trás, cabeça sacode, braços se abrem
  const hu = st.hurt || 0;
  if (hu > 0.01) {
    const k = Math.sin(hu * Math.PI * 0.5);
    P.bx += k * 18;
    P.lean += k * 0.13;
    P.hx += k * 10;
    P.hy -= k * 6;
    P.aF -= k * 0.35;
    P.aB -= k * 0.25;
    P.bF += k * 0.25;
    P.jaw = Math.max(P.jaw, k * 0.6);
    P.shake += k * 2.5;
  }

  // morte: cambaleia, os joelhos cedem, desaba para a frente com os punhos no chão
  if (st.anim === 'death') {
    const d = p;
    const stag = sm(0, 0.25, d);
    const knee = sm(0.22, 0.55, d);
    const fall = sm(0.5, 0.9, d);
    const wob = Math.sin(d * 26) * (1 - sm(0.3, 0.5, d)) * stag;
    if (kind === 2) {
      P.cr += knee * 60 + fall * 70;
      P.lean += wob * 0.1 + fall * -0.5;
      P.bx += wob * 8;
    } else {
      P.bx += stag * 14 * (1 - knee) - fall * 36 + wob * 6;
      P.lean += stag * 0.12 * (1 - knee) + wob * 0.08 - fall * 0.62;
      P.cr += knee * 54 + fall * 34 + sm(0.86, 0.92, d) * (1 - sm(0.92, 1, d)) * 8;
      P.aF = L(P.aF, 0.55, knee) + fall * 0.35;
      P.bF = L(P.bF, -0.1, knee);
      P.aB = L(P.aB, 0.5, knee) + fall * 0.4;
      P.bB = L(P.bB, 0, knee);
      P.hx += fall * -6;
      P.hy += fall * 18;
    }
    P.jaw = Math.max(P.jaw * (1 - knee), 0.35 * stag * (1 - fall));
    P.shake += wob * 2;
    P.imp = Math.max(P.imp, sm(0.84, 0.88, d) * (1 - sm(0.88, 1, d)));
  }
  return P;
}

/** Transformação do tronco (gira em torno do quadril, desloca e afunda). */
function xform(R: Rig, P: Pose) {
  const c = Math.cos(P.lean), s = Math.sin(P.lean);
  const pv = R.hip;
  return (q: V): V => {
    const dx = q.x - pv.x, dy = q.y - pv.y;
    return { x: pv.x + dx * c - dy * s + P.bx, y: pv.y + dx * s + dy * c + P.cr };
  };
}

// ======================================================================= desenho principal

export function drawGolem(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState): Anchors {
  const kind = clamp(Math.round(s.feat.kind ?? 0), 0, 3);
  const R = RIGS[kind];
  const C: Pal = {
    body: hurtTint(ctx, st, s.pal.body),
    dark: hurtTint(ctx, st, s.pal.dark),
    accent: hurtTint(ctx, st, s.pal.accent),
    glow: s.pal.glow,
    eye: s.pal.eye,
    light: hurtTint(ctx, st, mixHex(s.pal.body, '#ffffff', 0.3)),
  };
  const die = st.anim === 'death' ? st.p : 0;
  const G = gaitOf(st);
  const P = poseAt(kind, st, st.p, G);
  const atkK = attacking(st) + (st.anim === 'enter' ? 0.6 : 0);
  const heat = clamp(0.35 + st.rage * 0.4 + atkK * 0.5 + Math.sin(st.t * 3) * 0.1 + P.imp * 0.4) * (1 - sm(0.3, 0.95, die));
  // tremor (carga, rugido, dano) — determinístico
  const shx = P.shake * Math.sin(st.t * 71) * 1.6;
  const shy = P.shake * Math.cos(st.t * 63) * 1.2;
  P.bx += shx;
  P.cr += shy;
  const T = xform(R, P);
  /** tremidinha das placas/cristais após cada pisada e no impacto */
  const jit = G.jolt + P.imp * 1.4;

  // ---------------- braços (ombros balançam com a passada)
  const roll = G.roll * 5;
  const shF = { x: R.shF.x, y: R.shF.y + roll };
  const shB = { x: R.shB.x, y: R.shB.y - roll };
  // o punho nunca atravessa o chão: se passar, o ombro "sobe" o braço até apoiar
  const floor = -R.fist * (kind === 2 ? 0.2 : 0.95);
  const fit = (sh: V, a: number, b: number) => {
    let arm = armPts(sh, a, b, R.l1, R.l2);
    for (let i = 0; i < 14 && T(arm.hd).y > floor; i++) {
      a += 0.06;
      b = Math.max(-0.2, b - 0.03);
      arm = armPts(sh, a, b, R.l1, R.l2);
    }
    return arm;
  };
  const armF = fit(shF, P.aF, P.bF);
  const armB = fit(shB, P.aB, P.bB);

  // ---------------- cabeça e boca
  const blinkJaw = clamp(P.jaw);
  const head: V = { x: R.head.x + P.hx, y: R.head.y + P.hy };

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // sombra no chão
  const lift = kind === 2 ? clamp((-P.cr + 40) / 160) : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(P.bx - 6, 0, (kind === 2 ? 95 : 132) * (1 - lift * 0.3), 14, 0, 0, TAU);
  ctx.fill();

  // pernas (fora do tronco: pés plantados no chão)
  const LG = LEGS[kind];
  let legF: (() => void) | null = null;
  if (kind !== 2) {
    const hB = T({ x: R.hip.x + 40, y: R.hip.y + 4 });
    const hF = T({ x: R.hip.x - 40, y: R.hip.y + 4 });
    // na morte os pés ficam onde estavam (sem passada)
    const fB = { x: LG.fB + G.B.dx + P.bx * 0.15, y: -G.B.lift };
    const fF = { x: LG.fF + G.F.dx + P.bx * 0.15 - (st.anim === 'death' ? 0 : 0), y: -G.F.lift };
    drawLeg(ctx, kind, hB, fB, G.B.ang, LG, C, true, heat);
    legF = () => drawLeg(ctx, kind, hF, fF, G.F.ang, LG, C, false, heat);
  }

  ctx.save();
  ctx.translate(P.bx, P.cr);
  ctx.translate(R.hip.x, R.hip.y);
  ctx.rotate(P.lean);
  ctx.translate(-R.hip.x, -R.hip.y);

  // estilhaços de trás (cristal)
  if (kind === 2) shards(ctx, st, C, R, -1, die, G);

  // braço de trás
  drawArm(ctx, kind, armB, R, C, true, heat, st, s, jit);

  // tronco
  ctx.save();
  ctx.translate(R.chest.x, R.chest.y);
  ctx.scale(P.puff, 2 - P.puff);
  ctx.scale(1, P.puff * P.puff);
  ctx.translate(-R.chest.x, -R.chest.y);
  if (kind === 0) torsoBasalt(ctx, C, heat, st, s, jit);
  else if (kind === 1) torsoIron(ctx, C, heat, st, P.door, jit);
  else if (kind === 2) torsoCrystal(ctx, C, heat, st, s, die, jit, P);
  else torsoMagma(ctx, C, heat, st, jit, P);
  ctx.restore();

  // perna da frente por cima da barriga (fora da rotação do tronco)
  if (legF) {
    ctx.restore();
    legF();
    ctx.save();
    ctx.translate(P.bx, P.cr);
    ctx.translate(R.hip.x, R.hip.y);
    ctx.rotate(P.lean);
    ctx.translate(-R.hip.x, -R.hip.y);
  }

  // cabeça
  drawHead(ctx, kind, head, blinkJaw, C, heat, st, die, P);

  // braço da frente
  drawArm(ctx, kind, armF, R, C, false, heat, st, s, jit);

  if (kind === 2) shards(ctx, st, C, R, 1, die, G);

  // brilho de magia nas mãos (cast/raio)
  if (P.glow > 0.05 && kind !== 1) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const fl = Math.sin(st.t * 12) * 4;
    orb(ctx, armF.hd.x, armF.hd.y, 26 + P.glow * 40 + fl, s.pal.glow, P.glow * 0.8);
    orb(ctx, armB.hd.x, armB.hd.y, 18 + P.glow * 28, s.pal.glow, P.glow * 0.55);
    ctx.restore();
  }
  // Ferrolho no cast: engrenagens girando nos punhos
  if (P.glow > 0.05 && kind === 1) {
    for (const [a, sc] of [[armF, 1], [armB, 0.75]] as const) gear(ctx, a.hd.x, a.hd.y - 6, 26 * sc * (0.6 + P.glow * 0.4), st.t * 9 * (sc === 1 ? 1 : -1), C, P.glow);
  }
  ctx.restore();

  // rastro (smear) do golpe
  if (st.anim === 'attack' && (st.pose === 'slam' || st.pose === 'swipe' || (st.pose === 'cast' && kind === 3) || (st.pose === 'shoot' && kind === 0))) {
    smear(ctx, kind, st, G, R, s.pal.glow);
  }

  // pisadas: pedrinhas, faíscas ou respingos de lava
  if (kind !== 2 && st.anim !== 'death') {
    for (const [f, hx] of [[G.B, LG.fB], [G.F, LG.fF]] as const) {
      if (f.c >= 0 && f.c < 0.32) stepFx(ctx, kind, hx + f.dx + P.bx * 0.15, f.c / 0.32, f.n * 2 + (f === G.F ? 0 : 1), G.on * (0.35 + 0.65 * G.mv), C);
    }
  }
  // impacto do golpe no chão (pedras saltando perto da mão)
  if (P.imp > 0.02 && st.anim === 'attack' && kind !== 2 && (st.pose === 'slam' || (st.pose === 'cast' && kind === 3))) {
    const hd = T(armF.hd);
    const k = clamp((st.p - 0.53) / 0.3);
    if (k > 0 && k < 1 && hd.y > -90) stepFx(ctx, kind, hd.x, k, 99, 1.6, C);
  }

  // pedaços caindo na morte
  if (die > 0.05) deathChunks(ctx, kind, die, P, C);
  ctx.restore();

  // fumaça da chaminé (fora da rotação para subir reto)
  if (kind === 1 && (s.feat.chimney ?? 1) > 0 && die < 0.8) {
    const top = T({ x: 62, y: -364 });
    const n = 5;
    const puffK = 0.45 + atkK * 0.6 + G.mv * 0.3;
    for (let i = 0; i < n; i++) {
      const k = (st.t * puffK + i / n) % 1;
      // a fumaça fica para trás quando ele anda
      const drift = k * (26 + G.mv * 40 * (G.fwd ? 1 : -0.6));
      smoke(ctx, top.x + drift, top.y - 6 - k * 60, 0.9 + atkK * 0.4 + G.jolt * 0.3, Math.max(0.01, k), i + Math.floor(st.t * puffK + i / n) * 7, 'rgba(70,70,78,', 1);
    }
  }

  // ---------------- âncoras
  let hand = T(armF.hd);
  if (kind === 0 && st.anim === 'attack' && (st.pose === 'shoot' || st.pose === 'breath') && st.p < 0.34) {
    // o efeito de rocha monta o pedregulho 230 (mundo) acima da mão: alinha com os punhos erguidos
    const bk = 0.62 * (s.size || 1);
    const top = T(mid(armF.hd, armB.hd, 0.5, 0));
    const want = { x: top.x - 10, y: top.y - 50 };
    const k = P.lift;
    hand = { x: L(hand.x, want.x - 20 / bk, k), y: L(hand.y, want.y + 230 / bk, k) };
  }
  const mouthLocal: V = kind === 1
    ? { x: -20 + P.door * -10, y: -205 }
    : { x: head.x - (kind === 3 ? 34 : 26), y: head.y + (kind === 2 ? 0 : 12) };
  const shooting = st.anim === 'attack' && (st.pose === 'shoot' || st.pose === 'breath');
  const mouth = kind === 1 && !shooting ? T({ x: head.x - 30, y: head.y }) : T(mouthLocal);
  return {
    mouth,
    hand,
    core: T(R.chest),
    top: T({ x: 0, y: kind === 1 ? -360 : kind === 2 ? -372 : -325 }).y,
    halfW: kind === 2 ? 110 : 140,
  };
}

// ======================================================================= efeitos do corpo

/** Rastro curvo do punho durante o golpe (avalia a pose alguns instantes antes). */
function smear(ctx: CanvasRenderingContext2D, kind: number, st: DrawState, G: Gait, R: Rig, color: string) {
  const isThrow = kind === 0 && (st.pose === 'shoot' || st.pose === 'breath');
  const a = isThrow ? 0.25 : 0.42, b = isThrow ? 0.4 : 0.6;
  const k = sm(a, a + 0.04, st.p) * (1 - sm(b - 0.06, b, st.p));
  if (k <= 0.02) return;
  const pts: V[] = [];
  for (let i = 0; i <= 6; i++) {
    const pp = st.p - (6 - i) * 0.014;
    const P = poseAt(kind, st, pp, G);
    const arm = armPts(R.shF, P.aF, P.bF, R.l1, R.l2);
    const dir = { x: -Math.sin(arm.ang), y: Math.cos(arm.ang) };
    const q = xform(R, P)({ x: arm.hd.x + dir.x * R.fist * 0.4, y: arm.hd.y + dir.y * R.fist * 0.4 });
    q.y = Math.min(q.y, -R.fist * 0.6);
    pts.push(q);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 1; i < pts.length; i++) {
    const f = i / (pts.length - 1);
    ctx.strokeStyle = hexA(color, 0.32 * k * f);
    ctx.lineWidth = R.fist * (0.5 + 1.3 * f);
    ctx.beginPath();
    ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
    ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
  ctx.strokeStyle = hexA('#ffffff', 0.35 * k);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(pts[1].x, pts[1].y);
  for (let i = 2; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.restore();
}

/** Pisada: pedrinhas (basalto), faíscas (ferro) ou lava (magma), saindo dos lados do pé. */
function stepFx(ctx: CanvasRenderingContext2D, kind: number, x: number, k: number, seed: number, power: number, C: Pal) {
  if (power <= 0.02) return;
  ctx.save();
  // poeira rasteira
  const dust = (1 - k) * 0.35 * Math.min(1, power);
  if (dust > 0.01) {
    ctx.fillStyle = kind === 3 ? hexA('#3a2018', dust) : hexA(mixHex(C.body, '#c8b8a0', 0.5), dust);
    for (const sg of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(x + sg * (40 + k * 46), -6 - k * 8, 16 + k * 22, 7 + k * 8, 0, 0, TAU);
      ctx.fill();
    }
  }
  const n = kind === 1 ? 7 : 6;
  if (kind === 1) ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const sg = i % 2 ? 1 : -1;
    const vx = sg * (30 + h01(seed, i) * 70) * power;
    const vy = (50 + h01(seed, i + 9) * 80) * power;
    const px = x + sg * 34 + vx * k;
    const py = Math.min(-2, -vy * k + 190 * k * k * power - 4);
    const a = 1 - sm(0.6, 1, k);
    if (kind === 1) {
      // faísca: risco curto na direção do movimento
      const dx = vx * 0.12, dy = (-vy + 380 * k * power) * 0.06;
      ctx.strokeStyle = hexA(i % 3 ? C.eye : '#ffffff', a);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - dx, py - dy);
      ctx.stroke();
    } else if (kind === 3) {
      ctx.fillStyle = hexA(i % 2 ? C.eye : C.glow, a);
      ctx.beginPath();
      ctx.arc(px, py, 3 + h01(seed, i + 3) * 4, 0, TAU);
      ctx.fill();
    } else {
      const r = 3 + h01(seed, i + 3) * 5;
      ctx.fillStyle = hexA(i % 3 ? C.dark : mixHex(C.body, '#ffffff', 0.15), a);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(k * 9 * sg);
      ctx.beginPath();
      ctx.moveTo(-r, -r * 0.4);
      ctx.lineTo(0, -r);
      ctx.lineTo(r, r * 0.2);
      ctx.lineTo(-r * 0.2, r * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}

/** Pedaços que se soltam na morte (caem com gravidade e quicam no chão). */
function deathChunks(ctx: CanvasRenderingContext2D, kind: number, die: number, P: Pose, C: Pal) {
  const n = kind === 2 ? 11 : 9;
  for (let i = 0; i < n; i++) {
    const t0 = 0.2 + h01(i, 3) * 0.5;
    const k = clamp((die - t0) / 0.35);
    if (k <= 0) continue;
    const x0 = P.bx - 100 + h01(i, 1) * 200;
    const y0 = -300 + h01(i, 2) * 170 + P.cr * 0.6;
    const vx = (h01(i, 6) - 0.5) * 140;
    let y = y0 + k * k * 420;
    let rot = k * 5 * (h01(i, 4) - 0.5);
    if (y > -8) {
      y = -8;
      rot = 0.5 * (h01(i, 4) - 0.5);
    }
    ctx.save();
    ctx.translate(x0 + vx * Math.min(k, 0.7), y);
    ctx.rotate(rot);
    const r = 9 + h01(i, 5) * 14;
    ctx.fillStyle = kind === 2 ? hexA(i % 2 ? C.accent : C.body, 0.85) : i % 3 ? C.dark : mixHex(C.body, C.dark, 0.3);
    ctx.beginPath();
    ctx.moveTo(-r, -r * 0.5);
    ctx.lineTo(r * 0.2, -r);
    ctx.lineTo(r, r * 0.3);
    ctx.lineTo(-r * 0.3, r * 0.8);
    ctx.closePath();
    ctx.fill();
    if (kind === 0 || kind === 3) {
      ctx.fillStyle = hexA(C.glow, 0.7 * (1 - die));
      ctx.fillRect(-r * 0.6, -1, r * 1.1, 2.5);
    }
    ctx.restore();
  }
}

/** Engrenagem (Ferrolho lançando engrenagens). */
function gear(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a: number, C: Pal, k: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.globalAlpha *= clamp(k);
  ctx.fillStyle = mixHex(C.body, '#ffffff', 0.2);
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const rr = i % 2 ? r : r * 0.78;
    const an = (i / 16) * TAU;
    ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = C.dark;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.32, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// ======================================================================= pernas

/** Joelho por IK de dois ossos (o joelho dobra para a frente = esquerda). */
function knee(hip: V, ank: V, l1: number, l2: number): V {
  const dx = ank.x - hip.x, dy = ank.y - hip.y;
  const d = Math.min(Math.hypot(dx, dy), l1 + l2 - 0.5);
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * Math.max(1, d)), -1, 1));
  const base = Math.atan2(dy, dx);
  const ang = base + a;
  const k = { x: hip.x + Math.cos(ang) * l1, y: hip.y + Math.sin(ang) * l1 };
  if (k.y > -10) k.y = -10;
  return k;
}

function drawLeg(ctx: CanvasRenderingContext2D, kind: number, hip: V, ft: V, fang: number, LG: (typeof LEGS)[number], C: Pal, back: boolean, heat: number) {
  const ank = { x: ft.x + 2, y: ft.y - LG.ank };
  const kn = knee(hip, ank, LG.th, LG.sh);
  const col = back ? mixHex(C.body, C.dark, 0.45) : C.body;
  ctx.save();
  if (kind === 0) {
    chunk(ctx, hip, kn, 64, col, 11 + (back ? 1 : 0), C.dark);
    chunk(ctx, kn, ank, 58, col, 13 + (back ? 1 : 0), C.dark);
    // joelheira de pedra
    stone(ctx, kn.x - 4, kn.y, 26, 22, back ? C.dark : mixHex(C.body, C.dark, 0.2), 15);
    crack(ctx, [{ x: kn.x + 4, y: kn.y + 6 }, mid(kn, ank, 0.5, 6), mid(kn, ank, 0.85, -4)], C, heat * (back ? 0.4 : 0.8));
  } else if (kind === 1) {
    // pistão de ferro
    ctx.strokeStyle = C.dark;
    ctx.lineWidth = 44;
    seg(ctx, hip, kn);
    seg(ctx, kn, ank);
    ctx.strokeStyle = col;
    ctx.lineWidth = 36;
    seg(ctx, hip, kn);
    ctx.lineWidth = 30;
    seg(ctx, kn, ank);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 6;
    seg(ctx, { x: hip.x - 10, y: hip.y }, { x: kn.x - 10, y: kn.y });
    // haste hidráulica brilhante atrás da canela
    ctx.strokeStyle = mixHex(C.light, '#ffffff', 0.3);
    ctx.lineWidth = 7;
    seg(ctx, mid(kn, ank, 0.15, 14), mid(kn, ank, 0.9, 12));
    joint(ctx, kn, 22, C);
  } else {
    // magma: perna grossa de placas sobre lava
    ctx.strokeStyle = hexA(C.glow, 0.95 * Math.max(0.35, heat));
    ctx.lineWidth = 56;
    seg(ctx, hip, kn);
    seg(ctx, kn, ank);
    chunk(ctx, hip, kn, 52, col, 21 + (back ? 1 : 0), C.dark);
    chunk(ctx, kn, ank, 50, col, 23 + (back ? 1 : 0), C.dark);
  }
  // pé (gira no tornozelo ao levantar)
  ctx.translate(ft.x, ft.y);
  ctx.rotate(fang);
  if (kind === 0) {
    ctx.fillStyle = C.dark;
    ctx.beginPath();
    ctx.moveTo(-52, 0);
    ctx.lineTo(-42, -32);
    ctx.lineTo(28, -36);
    ctx.lineTo(40, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = back ? mixHex(C.body, C.dark, 0.6) : mixHex(C.body, C.dark, 0.25);
    ctx.beginPath();
    ctx.moveTo(-48, -3);
    ctx.lineTo(-39, -29);
    ctx.lineTo(25, -32);
    ctx.lineTo(35, -3);
    ctx.closePath();
    ctx.fill();
    // dedos de pedra
    ctx.fillStyle = C.dark;
    for (let i = 0; i < 3; i++) ctx.fillRect(-50 + i * 15, -10, 3, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(-38, -29, 60, 6);
  } else if (kind === 1) {
    ctx.fillStyle = C.dark;
    roundRect(ctx, -54, -30, 88, 30, 8);
    ctx.fill();
    ctx.fillStyle = col;
    roundRect(ctx, -50, -28, 80, 18, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(-46, -27, 70, 3);
    rivets(ctx, -42, -19, 4, 18, C);
  } else {
    ctx.fillStyle = C.dark;
    ctx.beginPath();
    ctx.moveTo(-50, 0);
    ctx.lineTo(-36, -32);
    ctx.lineTo(30, -32);
    ctx.lineTo(38, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(-45, -3);
    ctx.lineTo(-33, -28);
    ctx.lineTo(27, -28);
    ctx.lineTo(33, -3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = hexA(C.glow, 0.85 * Math.max(0.3, heat));
    ctx.fillRect(-42, -5, 72, 4);
  }
  ctx.restore();
}


// ======================================================================= braços

function drawArm(ctx: CanvasRenderingContext2D, kind: number, a: Arm, R: Rig, C: Pal, back: boolean, heat: number, st: DrawState, s: BossSpec, jit: number) {
  void st;
  const col = back ? mixHex(C.body, C.dark, 0.55) : C.body;
  ctx.save();
  if (kind === 0) {
    chunk(ctx, a.sh, a.el, 66, col, back ? 31 : 33, C.dark);
    chunk(ctx, a.el, a.hd, 58, col, back ? 35 : 37, C.dark);
    crack(ctx, [a.sh, mid(a.sh, a.el, 0.5, 8), a.el, mid(a.el, a.hd, 0.6, -6)], C, heat * (back ? 0.5 : 1));
    // musgo no ombro
    if ((s.feat.moss ?? 1) > 0 && back) moss(ctx, a.sh.x, a.sh.y - 22, 34, 41, back);
    fistRock(ctx, a.hd, R.fist, a.ang, col, C, heat);
  } else if (kind === 1) {
    ctx.strokeStyle = C.dark;
    ctx.lineWidth = 36;
    seg(ctx, a.sh, a.el);
    seg(ctx, a.el, a.hd);
    ctx.strokeStyle = col;
    ctx.lineWidth = 28;
    seg(ctx, a.sh, a.el);
    seg(ctx, a.el, a.hd);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 5;
    seg(ctx, { x: a.sh.x - 6, y: a.sh.y - 4 }, { x: a.el.x - 6, y: a.el.y - 4 });
    // braçadeiras
    for (const k of [0.35, 0.7]) {
      const p = mid(a.el, a.hd, k, 0);
      joint(ctx, p, 15, C, false);
    }
    joint(ctx, a.el, 20, C);
    // punho de ferro (bloco)
    ctx.save();
    ctx.translate(a.hd.x, a.hd.y);
    ctx.rotate(a.ang);
    ctx.fillStyle = C.dark;
    roundRect(ctx, -34, -14, 68, 56, 10);
    ctx.fill();
    ctx.fillStyle = col;
    roundRect(ctx, -30, -10, 60, 48, 8);
    ctx.fill();
    ctx.strokeStyle = C.dark;
    ctx.lineWidth = 3;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-30 + i * 15, 20);
      ctx.lineTo(-30 + i * 15, 38);
      ctx.stroke();
    }
    rivets(ctx, -20, 2, 3, 20, C);
    ctx.restore();
    // ombreira
    ctx.fillStyle = C.dark;
    ctx.beginPath();
    ctx.arc(a.sh.x, a.sh.y, 36, Math.PI, TAU);
    ctx.fill();
    ctx.fillStyle = back ? col : C.light;
    ctx.beginPath();
    ctx.arc(a.sh.x, a.sh.y + 2, 31, Math.PI, TAU);
    ctx.fill();
    rivets(ctx, a.sh.x - 22, a.sh.y - 8, 3, 22, C);
  } else if (kind === 2) {
    // cristal: braço fino em lascas, mão é uma lâmina
    const dir = { x: -Math.sin(a.ang), y: Math.cos(a.ang) };
    crystal(ctx, a.sh, a.el, 34, col, C, back ? 0.7 : 0.88);
    const tip = { x: a.hd.x + dir.x * R.fist * 1.6, y: a.hd.y + dir.y * R.fist * 1.6 };
    crystal(ctx, a.el, tip, 30, col, C, back ? 0.7 : 0.9);
    // lascas do ombro
    crystal(ctx, { x: a.sh.x + 6, y: a.sh.y + 8 }, { x: a.sh.x - 10, y: a.sh.y - 46 }, 22, C.accent, C, 0.85);
    // tip vira a mão
    a.hd.x = tip.x;
    a.hd.y = tip.y;
  } else {
    // magma: lava por baixo, placas por cima
    ctx.strokeStyle = hexA(C.glow, 0.95 * Math.max(0.3, heat));
    ctx.lineWidth = 62;
    seg(ctx, a.sh, a.el);
    seg(ctx, a.el, a.hd);
    chunk(ctx, a.sh, mid(a.sh, a.el, 0.55, 0), 58, col, back ? 51 : 53, C.dark);
    chunk(ctx, mid(a.sh, a.el, 0.5, 0), a.el, 54, col, back ? 55 : 57, C.dark);
    chunk(ctx, a.el, a.hd, 50, col, back ? 59 : 61, C.dark);
    fistRock(ctx, a.hd, R.fist, a.ang, col, C, heat);
    // punho incandescente
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    orb(ctx, a.hd.x, a.hd.y, R.fist * 1.4, s.pal.glow, heat * (back ? 0.3 : 0.55));
    ctx.restore();
  }
  ctx.restore();
}

// ======================================================================= troncos

function torsoBasalt(ctx: CanvasRenderingContext2D, C: Pal, heat: number, st: DrawState, s: BossSpec, jit: number) {
  const J = (i: number) => jit * Math.sin(st.t * 53 + i * 2.1) * 2.5;
  // pedregulhos nas costas
  stone(ctx, 70 + J(1), -292 + J(2), 50, 40, C.dark, 71);
  stone(ctx, 20 + J(3), -305 + J(4), 44, 34, mixHex(C.body, C.dark, 0.4), 72);
  // massa principal corcunda
  const pts: V[] = [
    { x: -118, y: -160 }, { x: -128, y: -218 }, { x: -100, y: -262 }, { x: -40, y: -292 }, { x: 30, y: -310 },
    { x: 100, y: -296 }, { x: 130, y: -248 }, { x: 122, y: -176 }, { x: 84, y: -116 }, { x: 10, y: -98 }, { x: -70, y: -108 },
  ];
  ctx.fillStyle = vgrad(ctx, -310, -100, C.body, C.dark);
  polyPath(ctx, pts);
  ctx.fill();
  // faces de pedra
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.beginPath();
  ctx.moveTo(-100, -262);
  ctx.lineTo(-40, -292);
  ctx.lineTo(30, -310);
  ctx.lineTo(10, -240);
  ctx.lineTo(-60, -220);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.moveTo(10, -240);
  ctx.lineTo(130, -248);
  ctx.lineTo(122, -176);
  ctx.lineTo(40, -150);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath();
  ctx.moveTo(-118, -160);
  ctx.lineTo(-60, -200);
  ctx.lineTo(40, -150);
  ctx.lineTo(10, -98);
  ctx.lineTo(-70, -108);
  ctx.closePath();
  ctx.fill();
  // rachaduras em brasa
  if ((s.feat.cracks ?? 1) > 0) {
    crack(ctx, [{ x: -60, y: -280 }, { x: -40, y: -245 }, { x: -55, y: -210 }, { x: -30, y: -170 }, { x: -40, y: -125 }], C, heat);
    crack(ctx, [{ x: -40, y: -245 }, { x: 0, y: -230 }, { x: 30, y: -200 }], C, heat * 0.8);
    crack(ctx, [{ x: 60, y: -280 }, { x: 80, y: -230 }, { x: 70, y: -190 }, { x: 95, y: -150 }], C, heat * 0.9);
    crack(ctx, [{ x: -30, y: -170 }, { x: 20, y: -150 }, { x: 40, y: -115 }], C, heat * 0.7);
  }
  // musgo no topo
  if ((s.feat.moss ?? 1) > 0) {
    moss(ctx, -30 + J(5), -292 + J(6) * 0.5, 60, 81, false);
    moss(ctx, 60 + J(7), -306 + J(8) * 0.5, 46, 82, false);
    moss(ctx, 100 + J(9), -294, 30, 83, false);
  }
  void st;
}

function torsoIron(ctx: CanvasRenderingContext2D, C: Pal, heat: number, st: DrawState, door: number, jit: number) {
  const blast = door;
  const J = (i: number) => jit * Math.sin(st.t * 53 + i * 2.1) * 2.5;
  // chaminé (atrás)
  ctx.save();
  ctx.translate(J(1), J(2) * 0.6);
  ctx.fillStyle = C.dark;
  ctx.fillRect(44, -350, 36, 70);
  ctx.fillStyle = C.body;
  ctx.fillRect(48, -346, 28, 66);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(52, -346, 5, 66);
  ctx.fillStyle = C.dark;
  roundRect(ctx, 38, -362, 48, 16, 4);
  ctx.fill();
  ctx.fillStyle = hexA(C.glow, 0.6 * heat);
  ctx.fillRect(48, -360, 28, 4);
  ctx.restore();
  // caldeira (tronco)
  const g = ctx.createLinearGradient(-110, 0, 100, 0);
  g.addColorStop(0, C.dark);
  g.addColorStop(0.3, C.body);
  g.addColorStop(0.45, C.light);
  g.addColorStop(0.75, C.body);
  g.addColorStop(1, C.dark);
  ctx.fillStyle = C.dark;
  roundRect(ctx, -116, -306, 220, 196, 34);
  ctx.fill();
  ctx.fillStyle = g;
  roundRect(ctx, -110, -300, 208, 184, 30);
  ctx.fill();
  // cintas de ferro com rebites
  for (const y of [-276, -140]) {
    ctx.fillStyle = C.dark;
    ctx.fillRect(-110, y - 9, 208, 18);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(-110, y - 9, 208, 3);
    rivets(ctx, -96, y, 9, 23, C);
  }
  // fornalha na barriga
  const fx = -20, fy = -205, fr = 46;
  ctx.fillStyle = C.dark;
  ctx.beginPath();
  ctx.arc(fx, fy, fr + 10, 0, TAU);
  ctx.fill();
  const fire = clamp(heat + blast * 0.6);
  const fg = ctx.createRadialGradient(fx, fy + 10, 2, fx, fy, fr);
  fg.addColorStop(0, '#fff6c0');
  fg.addColorStop(0.35, C.eye);
  fg.addColorStop(0.75, C.glow);
  fg.addColorStop(1, '#3a0a00');
  ctx.fillStyle = fg;
  ctx.globalAlpha = 0.4 + fire * 0.6;
  ctx.beginPath();
  ctx.arc(fx, fy, fr, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  // labaredas lá dentro
  for (let i = 0; i < 5; i++) {
    const x = fx - 30 + i * 15;
    const h = 18 + Math.sin(st.t * 9 + i * 2) * 8 + fire * 14;
    ctx.fillStyle = hexA(C.eye, 0.7);
    ctx.beginPath();
    ctx.moveTo(x - 7, fy + 30);
    ctx.quadraticCurveTo(x, fy + 30 - h * 2, x + 7, fy + 30);
    ctx.fill();
  }
  // grade
  ctx.save();
  ctx.beginPath();
  ctx.arc(fx, fy, fr, 0, TAU);
  ctx.clip();
  ctx.fillStyle = C.dark;
  // a grade se recolhe (abre) quando ele vai cuspir escória/vapor
  const bw = 6 * (1 - door * 0.85);
  for (let i = -3; i <= 3; i++) ctx.fillRect(fx + i * 13 * (1 + door * 0.5) - bw / 2, fy - fr, bw, fr * 2);
  ctx.restore();
  if (door > 0.3) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    orb(ctx, fx - fr * 0.6, fy, fr * (0.8 + door * 0.9) + Math.sin(st.t * 30) * 4, C.eye, (door - 0.3) * 1.2, '#fff6c0');
    ctx.restore();
  }
  ctx.strokeStyle = C.light;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(fx, fy, fr + 6, 0, TAU);
  ctx.stroke();
  rivetsCircle(ctx, fx, fy, fr + 6, 10, C);
  // brilho da fornalha
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  orb(ctx, fx, fy, fr * 1.8, C.glow, fire * 0.45);
  ctx.restore();
}

function torsoCrystal(ctx: CanvasRenderingContext2D, C: Pal, heat: number, st: DrawState, s: BossSpec, die: number, jit: number, P: Pose) {
  // cristais das costas (feat.crystals)
  const n = Math.max(3, Math.round(s.feat.crystals ?? 7));
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const base = { x: -40 + k * 110, y: -268 + Math.abs(k - 0.45) * 30 };
    const ang = -0.9 + k * 1.6 + Math.sin(st.t * 1.3 + i) * 0.03 + jit * Math.sin(st.t * 47 + i * 1.7) * 0.06 + P.imp * 0;
    const len = (60 + Math.sin(k * Math.PI) * 50 + h01(i, 9) * 15) * (1 - die * 0.5);
    const tip = { x: base.x + Math.sin(ang) * len, y: base.y - Math.cos(ang) * len };
    crystal(ctx, base, tip, 20 + Math.sin(k * Math.PI) * 10, i % 2 ? C.body : C.accent, C, 0.85);
  }
  // espinho de baixo (não tem pernas: flutua)
  crystal(ctx, { x: -5, y: -200 }, { x: 5, y: -70 }, 70, C.body, C, 0.85);
  crystal(ctx, { x: -40, y: -170 }, { x: -50, y: -110 }, 26, C.accent, C, 0.8);
  crystal(ctx, { x: 35, y: -170 }, { x: 48, y: -112 }, 24, C.body, C, 0.8);
  // tronco: gema facetada
  const c = { x: -5, y: -232 };
  const pts: V[] = [
    { x: -10, y: -300 }, { x: -86, y: -268 }, { x: -60, y: -184 }, { x: -5, y: -150 }, { x: 55, y: -184 }, { x: 74, y: -268 },
  ];
  ctx.save();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], bb = pts[(i + 1) % pts.length];
    const lit = [0.55, 0.25, 0.05, -0.15, -0.3, 0.35][i];
    ctx.fillStyle = lit > 0 ? mixHex(C.body, '#ffffff', lit) : mixHex(C.body, C.dark, -lit);
    ctx.globalAlpha = 0.86;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(a.x, a.y);
    ctx.lineTo(bb.x, bb.y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = hexA('#ffffff', 0.55);
  ctx.lineWidth = 2;
  polyPath(ctx, pts);
  ctx.stroke();
  ctx.restore();
  // núcleo pulsando
  const pulse = 0.5 + Math.sin(st.t * 3) * 0.15 + heat * 0.4;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  orb(ctx, c.x, c.y, 26 + pulse * 16, s.pal.accent, 0.55 * pulse * (1 - die));
  orb(ctx, c.x, c.y, 10 + pulse * 5, s.pal.glow, 0.9 * (1 - die));
  ctx.restore();
}

function torsoMagma(ctx: CanvasRenderingContext2D, C: Pal, heat: number, st: DrawState, jit: number, P: Pose) {
  const J = (i: number) => jit * Math.sin(st.t * 53 + i * 2.1) * 2.5;
  const cx = 5, cy = -190, rx = 128, ry = 104;
  // chaminés vulcânicas nas costas
  for (let i = 0; i < 3; i++) {
    const x = 0 + i * 42 + J(i), y = -262 - (i === 1 ? 18 : 0) + J(i + 4) * 0.6;
    ctx.fillStyle = C.dark;
    ctx.beginPath();
    ctx.moveTo(x - 26, y + 30);
    ctx.lineTo(x - 8, y - 46 + i * 8);
    ctx.lineTo(x + 10, y - 46 + i * 8);
    ctx.lineTo(x + 26, y + 30);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = hexA(C.glow, 0.5 + heat * 0.5);
    ctx.fillRect(x - 8, y - 48 + i * 8, 18, 6);
    rising(ctx, x, y - 50 + i * 8, 20, 70, st.t * 0.25 + i * 0.3, 90 + i, 5, C.eye, 1, 0.9 * heat, 3);
  }
  // lava (base)
  // na morte a lava esfria e escurece
  const cool = st.anim === 'death' ? sm(0.25, 1, st.p) : 0;
  ctx.fillStyle = rgrad(ctx, -18, -190, rx * 1.1, mixHex(mixHex(C.eye, C.glow, 0.4), '#2a0e06', cool), mixHex(mixHex(C.glow, '#5a0a00', 0.35), '#140604', cool));
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, -0.1, 0, TAU);
  ctx.fill();
  // placas negras por cima (deixam frestas de lava)
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, -0.1, 0, TAU);
  ctx.clip();
  const gap = 2.5 + heat * 2.5;
  let i = 0;
  for (let row = 0; row < 5; row++) {
    const y0 = cy - ry + row * 44;
    const off = row % 2 ? 22 : 0;
    for (let col = 0; col < 6; col++) {
      const x0 = cx - rx - 30 + col * 50 + off;
      const j = (k: number) => (h01(i, k) - 0.5) * 12;
      // a placa do coração fica aberta
      const isHeart = row === 2 && col === 2;
      i++;
      if (isHeart) continue;
      ctx.fillStyle = vgrad(ctx, y0, y0 + 44, mixHex(C.body, '#ffffff', 0.08), C.dark);
      ctx.beginPath();
      ctx.moveTo(x0 + gap + j(1), y0 + gap + j(2));
      ctx.lineTo(x0 + 50 - gap + j(3), y0 + gap + j(4));
      ctx.lineTo(x0 + 50 - gap + j(5), y0 + 44 - gap + j(6));
      ctx.lineTo(x0 + gap + j(7), y0 + 44 - gap + j(8));
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
  // coração de lava
  const hx = -18, hy = -190;
  const pulse = 0.6 + Math.sin(st.t * 4) * 0.2 + Math.max(0, Math.sin(st.t * 8)) * 0.1;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  orb(ctx, hx, hy, 34 + pulse * 14 + heat * 12, C.glow, (0.4 + heat * 0.4) * (1 - cool), C.eye);
  ctx.restore();
  ctx.fillStyle = mixHex(C.eye, '#3a1408', cool);
  ctx.beginPath();
  ctx.arc(hx, hy, 12 + pulse * 6, 0, TAU);
  ctx.fill();
  // gotas de lava pingando da barriga
  for (let k = 0; k < 5; k++) {
    const ph = (st.t * 0.6 + h01(k, 7)) % 1;
    const x = cx - 90 + k * 42;
    const y0 = cy + ry * 0.75 + Math.abs(k - 2) * -10;
    ctx.fillStyle = hexA(C.eye, (1 - ph) * heat + 0.1);
    ctx.beginPath();
    ctx.ellipse(x, y0 + ph * ph * 80, Math.max(0.5, 5 - ph * 2), Math.max(0.5, 7 + ph * 4), 0, 0, TAU);
    ctx.fill();
  }
}

// ======================================================================= cabeças

function drawHead(ctx: CanvasRenderingContext2D, kind: number, h: V, jaw: number, C: Pal, heat: number, st: DrawState, die: number, P: Pose) {
  const blink = (st.t % 5.1) < 0.12 ? 0.1 : 1;
  const open = die > 0 ? 1 - die : blink;
  ctx.save();
  ctx.translate(h.x, h.y);
  if (kind === 0) {
    // bloco de pedra afundado entre os ombros
    ctx.fillStyle = mixHex(C.body, C.dark, 0.5);
    ctx.save();
    ctx.translate(0, 12 + jaw * 14);
    ctx.beginPath();
    ctx.moveTo(-40, -6);
    ctx.lineTo(28, -8);
    ctx.lineTo(30, 18);
    ctx.lineTo(-34, 20);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (jaw > 0.05) {
      ctx.fillStyle = hexA(C.glow, 0.9);
      ctx.fillRect(-36, 6, 60, 6 + jaw * 14);
    }
    ctx.fillStyle = vgrad(ctx, -40, 10, C.body, C.dark);
    ctx.beginPath();
    ctx.moveTo(-44, -26);
    ctx.lineTo(-20, -42);
    ctx.lineTo(26, -40);
    ctx.lineTo(40, -10);
    ctx.lineTo(32, 10);
    ctx.lineTo(-40, 10);
    ctx.closePath();
    ctx.fill();
    // sobrancelha pesada
    ctx.fillStyle = C.dark;
    ctx.beginPath();
    ctx.moveTo(-48, -22);
    ctx.lineTo(10, -28 + st.rage * 4);
    ctx.lineTo(8, -18);
    ctx.lineTo(-44, -14);
    ctx.closePath();
    ctx.fill();
    eyeGlow(ctx, -30, -10, 6 + st.rage * 2, C.eye, open);
    eyeGlow(ctx, -6, -10, 5 + st.rage * 2, C.eye, open);
    crack(ctx, [{ x: 10, y: -40 }, { x: 18, y: -20 }, { x: 12, y: 4 }], C, heat * 0.7);
  } else if (kind === 1) {
    // elmo de ferro com viseira
    ctx.fillStyle = C.dark;
    roundRect(ctx, -44, -38, 82, 62, 14);
    ctx.fill();
    ctx.fillStyle = vgrad(ctx, -38, 20, C.light, C.body);
    ctx.beginPath();
    ctx.moveTo(-40, 18);
    ctx.lineTo(-40, -6);
    ctx.arc(-2, -6, 38, Math.PI, TAU);
    ctx.lineTo(36, 18);
    ctx.closePath();
    ctx.fill();
    // viseira (abre um pouco ao soltar vapor)
    ctx.fillStyle = '#0a0806';
    roundRect(ctx, -40, -10, 56, 12 + jaw * 6, 4);
    ctx.fill();
    ctx.save();
    ctx.shadowColor = C.eye;
    ctx.shadowBlur = 12;
    ctx.fillStyle = C.eye;
    ctx.globalAlpha = Math.max(0.15, open);
    ctx.fillRect(-36, -6, 46, 4 + jaw * 4);
    ctx.restore();
    // grade da boca
    ctx.strokeStyle = C.dark;
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-30 + i * 10, 8);
      ctx.lineTo(-30 + i * 10, 18);
      ctx.stroke();
    }
    rivets(ctx, -30, -28, 4, 18, C);
  } else if (kind === 2) {
    // cabeça de diamante com coroa de lascas
    crystal(ctx, { x: -18, y: -14 }, { x: -30, y: -58 }, 14, C.accent, C, 0.85);
    crystal(ctx, { x: 0, y: -18 }, { x: 4, y: -70 }, 16, C.body, C, 0.85);
    crystal(ctx, { x: 16, y: -12 }, { x: 34, y: -50 }, 12, C.accent, C, 0.85);
    const pts: V[] = [{ x: -4, y: -34 }, { x: -36, y: -4 }, { x: -6, y: 30 }, { x: 26, y: 0 }];
    ctx.fillStyle = mixHex(C.body, '#ffffff', 0.3);
    ctx.globalAlpha = 0.9;
    polyPath(ctx, pts);
    ctx.fill();
    ctx.fillStyle = hexA(C.dark, 0.35);
    ctx.beginPath();
    ctx.moveTo(-4, -34);
    ctx.lineTo(26, 0);
    ctx.lineTo(-6, 30);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    // olho único (fenda de luz)
    ctx.save();
    ctx.shadowColor = C.accent;
    ctx.shadowBlur = 14;
    ctx.fillStyle = C.eye;
    ctx.beginPath();
    ctx.ellipse(-12, 0, 13 + jaw * 4, Math.max(0.5, 4 * open + jaw * 4), -0.1, 0, TAU);
    ctx.fill();
    ctx.restore();
  } else {
    // crânio de rocha com chifres e boca de magma
    ctx.fillStyle = C.dark;
    for (const sgn of [1, -1]) {
      ctx.beginPath();
      ctx.moveTo(6 * sgn + 6, -22);
      ctx.quadraticCurveTo(40 + sgn * 6, -50, 30 + sgn * 14, -78);
      ctx.quadraticCurveTo(30, -46, -4 + sgn * 6, -14);
      ctx.closePath();
      ctx.fill();
    }
    // mandíbula
    ctx.save();
    ctx.translate(6, 8);
    ctx.rotate(-jaw * 0.45);
    ctx.fillStyle = hexA(C.glow, 0.95);
    ctx.fillRect(-46, -8, 50, 14);
    ctx.fillStyle = C.body;
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(-48, 4);
    ctx.lineTo(-44, 20);
    ctx.lineTo(6, 24);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = vgrad(ctx, -34, 10, mixHex(C.body, '#ffffff', 0.1), C.dark);
    ctx.beginPath();
    ctx.moveTo(-50, -4);
    ctx.lineTo(-36, -30);
    ctx.lineTo(18, -34);
    ctx.lineTo(34, -6);
    ctx.lineTo(24, 12);
    ctx.lineTo(-46, 10);
    ctx.closePath();
    ctx.fill();
    // veio de lava na testa
    crack(ctx, [{ x: -10, y: -32 }, { x: -2, y: -18 }, { x: -12, y: -6 }], C, heat);
    eyeGlow(ctx, -30, -12, 6 + st.rage * 2, C.eye, open);
    eyeGlow(ctx, -6, -14, 5 + st.rage * 2, C.eye, open);
    if (jaw > 0.1) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      orb(ctx, -30, 14, 40 * jaw, C.glow, jaw);
      ctx.restore();
    }
  }
  ctx.restore();
}

// ======================================================================= estilhaços (cristal)

function shards(ctx: CanvasRenderingContext2D, st: DrawState, C: Pal, R: Rig, side: number, die: number, G: Gait) {
  for (let i = 0; i < 6; i++) {
    const a = st.t * 0.8 + (i * TAU) / 6;
    const z = Math.sin(a);
    if ((z >= 0 ? 1 : -1) !== side) continue;
    // ao voar, os estilhaços ficam para trás e ondulam (atraso)
    const trail = G.mv * (G.fwd ? 1 : -1) * (18 + h01(i, 2) * 26);
    const x = R.chest.x + Math.cos(a) * 150 + trail + Math.sin(G.sp * TAU * 2 - i) * 6 * G.on;
    const y = R.chest.y - 20 + z * 40 + Math.sin(st.t * 2 + i) * 6 + die * die * 200;
    const sz = 10 + (z + 1) * 4;
    ctx.save();
    ctx.translate(x, Math.min(-6, y));
    ctx.rotate(st.t * 1.5 + i);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = i % 2 ? C.accent : mixHex(C.body, '#ffffff', 0.35);
    ctx.beginPath();
    ctx.moveTo(0, -sz * 1.6);
    ctx.lineTo(sz * 0.6, 0);
    ctx.lineTo(0, sz * 1.6);
    ctx.lineTo(-sz * 0.6, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// ======================================================================= utilitários de forma

function seg(ctx: CanvasRenderingContext2D, a: V, b: V) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function mid(a: V, b: V, k: number, n: number): V {
  const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
  return { x: a.x + dx * k - (dy / l) * n, y: a.y + dy * k + (dx / l) * n };
}

function polyPath(ctx: CanvasRenderingContext2D, pts: V[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Bloco de pedra irregular entre dois pontos. */
function chunk(ctx: CanvasRenderingContext2D, a: V, b: V, w: number, fill: string, seed: number, edge: string) {
  const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(Math.atan2(dy, dx));
  const hw = w / 2;
  const j = (k: number) => (h01(seed, k) - 0.5) * w * 0.25;
  ctx.fillStyle = edge;
  ctx.beginPath();
  ctx.moveTo(-hw * 0.6 + j(1), -hw + j(2));
  ctx.lineTo(l * 0.5 + j(3), -hw * 1.1 + j(4));
  ctx.lineTo(l + hw * 0.5 + j(5), -hw * 0.7);
  ctx.lineTo(l + hw * 0.6, hw * 0.6 + j(6));
  ctx.lineTo(l * 0.5 + j(7), hw * 1.05);
  ctx.lineTo(-hw * 0.6, hw * 0.8 + j(8));
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(-hw * 0.5 + j(1), -hw * 0.88 + j(2));
  ctx.lineTo(l * 0.5 + j(3), -hw * 0.98 + j(4));
  ctx.lineTo(l + hw * 0.4 + j(5), -hw * 0.6);
  ctx.lineTo(l + hw * 0.45, hw * 0.45 + j(6));
  ctx.lineTo(l * 0.5 + j(7), hw * 0.8);
  ctx.lineTo(-hw * 0.5, hw * 0.6 + j(8));
  ctx.closePath();
  ctx.fill();
  // faceta clara
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.moveTo(-hw * 0.5 + j(1), -hw * 0.88 + j(2));
  ctx.lineTo(l * 0.5 + j(3), -hw * 0.98 + j(4));
  ctx.lineTo(l * 0.6, -hw * 0.1);
  ctx.lineTo(0, -hw * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Pedra arredondada (pedregulho). */
function stone(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, seed: number) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const r = 0.85 + h01(seed, i) * 0.25;
    const px = x + Math.cos(a) * rx * r, py = y + Math.sin(a) * ry * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

/** Punho de pedra. */
function fistRock(ctx: CanvasRenderingContext2D, p: V, r: number, ang: number, fill: string, C: Pal, heat: number) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(ang);
  stone(ctx, 0, r * 0.3, r * 1.08, r * 1.0, C.dark, 7);
  stone(ctx, 0, r * 0.25, r * 0.95, r * 0.86, fill, 7);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 3;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(i * r * 0.35, r * 0.4);
    ctx.lineTo(i * r * 0.32, r * 1.05);
    ctx.stroke();
  }
  ctx.fillStyle = hexA(C.glow, 0.5 * heat);
  ctx.fillRect(-r * 0.7, r * 0.95, r * 1.4, 4);
  ctx.restore();
}

/** Rachadura brilhante (lava/brasa). */
function crack(ctx: CanvasRenderingContext2D, pts: V[], C: Pal, k: number) {
  if (k <= 0.02) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = hexA(C.glow, clamp(k * 0.55));
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.strokeStyle = hexA(C.eye, clamp(k));
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();
}

/** Tufo de musgo. */
function moss(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, seed: number, back: boolean) {
  const n = Math.max(3, Math.round(w / 9));
  for (let i = 0; i < n; i++) {
    const px = x - w / 2 + (i / (n - 1)) * w;
    const r = 7 + h01(seed, i) * 7;
    ctx.fillStyle = back ? '#2e4a22' : i % 2 ? '#4f7a2e' : '#679a3a';
    ctx.beginPath();
    ctx.arc(px, y + 4 + h01(seed + 1, i) * 6, r, 0, TAU);
    ctx.fill();
  }
  // fiapos pendurados
  ctx.strokeStyle = back ? '#2e4a22' : '#4f7a2e';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const px = x - w / 3 + i * (w / 3);
    ctx.beginPath();
    ctx.moveTo(px, y + 8);
    ctx.lineTo(px + 2, y + 18 + h01(seed + 2, i) * 12);
    ctx.stroke();
  }
}

/** Fileira de rebites. */
function rivets(ctx: CanvasRenderingContext2D, x: number, y: number, n: number, gap: number, C: Pal) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = C.dark;
    ctx.beginPath();
    ctx.arc(x + i * gap, y + 1, 4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.light;
    ctx.beginPath();
    ctx.arc(x + i * gap - 1, y, 2.6, 0, TAU);
    ctx.fill();
  }
}

function rivetsCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, n: number, C: Pal) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    ctx.fillStyle = C.light;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, 3, 0, TAU);
    ctx.fill();
  }
}

/** Junta redonda de metal. */
function joint(ctx: CanvasRenderingContext2D, p: V, r: number, C: Pal, rivet = true) {
  ctx.fillStyle = C.dark;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = C.body;
  ctx.beginPath();
  ctx.arc(p.x - 1, p.y - 1, r * 0.75, 0, TAU);
  ctx.fill();
  if (rivet) {
    ctx.fillStyle = C.light;
    ctx.beginPath();
    ctx.arc(p.x - 2, p.y - 2, r * 0.25, 0, TAU);
    ctx.fill();
  }
}

/** Cristal facetado (losango alongado de a até b), translúcido. */
function crystal(ctx: CanvasRenderingContext2D, a: V, b: V, w: number, fill: string, C: Pal, alpha: number) {
  const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l, ny = dx / l;
  const m = { x: a.x + dx * 0.3, y: a.y + dy * 0.3 };
  const L = { x: m.x + nx * w / 2, y: m.y + ny * w / 2 };
  const Rr = { x: m.x - nx * w / 2, y: m.y - ny * w / 2 };
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = mixHex(fill, '#ffffff', 0.35);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(L.x, L.y);
  ctx.lineTo(b.x, b.y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = mixHex(fill, C.dark, 0.35);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(Rr.x, Rr.y);
  ctx.lineTo(b.x, b.y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}
