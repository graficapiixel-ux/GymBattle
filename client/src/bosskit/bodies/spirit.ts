/**
 * ESPÍRITOS (feat.kind): 0 = banshee do pântano, 1 = errante de cinzas (foice),
 * 2 = raposa de nove caudas, 3 = guardião das almas (barqueiro com lanterna).
 * Origem no chão, olhando para a esquerda; flutuam e são translúcidos.
 *
 * Animação: espíritos NÃO andam. Flutuam com ondulação contínua; a locomoção
 * (st.move / st.vx / st.vy / st.gait) vira inclinação, "vento" que arrasta as
 * partes soltas (cabelo, caudas, farrapos, correntes) e rastro de fumaça.
 * As poses dos ataques são escritas como TRILHAS de quadros-chave (K), com
 * antecipação até ~0,4, golpe rápido 0,45–0,55, impacto em 0,55 e retorno até 1.
 */
import type { BossSpec } from '@gymbattle/shared';
import type { Anchors, DrawState, V } from '../types';
import {
  attacking, breathe, dying, eyeGlow, h01, hurtTint, mixHex, poseK, rgrad, strike, vgrad, windup,
  TAU, clamp, sm, rgba, bez, tube, flame, rising, orb,
} from '../util';

/** Valores da pose compartilhados por todos os sub-tipos. */
interface C {
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
  lunge: number;
  /** Progresso da animação atual (0..1). */
  p: number;
  /** Pulso do impacto (pico em p≈0,56). */
  imp: number;
  /** Avanço: +1 indo para a esquerda (frente), −1 recuando. */
  adv: number;
  /** 0..1: quão rápido se desloca. */
  mv: number;
  /** Fase da "braçada" de flutuação (frac do gait). */
  g: number;
  /** Sentido da fase: +1 avançando, −1 recuando. */
  gd: number;
  /** Dano (0..1). */
  hurt: number;
  /** Balanço vertical vindo de vy. */
  bobY: number;
  /** Tranco horizontal do dano (+x = para trás). */
  knock: number;
  /** Desenho de "fantasma" (rastro do avanço): pula névoa e partículas. */
  ghost: boolean;
  /** Converte um ponto do sistema atual para o sistema local do boss. */
  map: (x: number, y: number) => V;
}

export function drawSpirit(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState): Anchors {
  const kind = s.feat.kind ?? 0;
  const base = ctx.getTransform().inverse();
  const wu = windup(st);
  const sk = strike(st);
  const atk = st.anim === 'attack';
  const vx = st.vx ?? 0;
  const mv = clamp(st.move ?? 0);
  const c: C = {
    P: s.pal,
    body: hurtTint(ctx, st, s.pal.body),
    dark: hurtTint(ctx, st, s.pal.dark),
    t: st.t,
    b: breathe(st, 1.3),
    wu,
    sk,
    atk: attacking(st),
    die: dying(st),
    breath: poseK(st, 'breath', 'shoot'),
    slam: poseK(st, 'slam'),
    cast: poseK(st, 'cast'),
    swipe: poseK(st, 'swipe'),
    charge: poseK(st, 'charge'),
    roar: poseK(st, 'roar'),
    lunge: poseK(st, 'charge') * (wu * 30 - sk * 110),
    p: st.p,
    imp: atk ? Math.exp(-(((st.p - 0.56) / 0.05) ** 2)) : 0,
    adv: clamp(-vx / 90, -1.2, 1.2) * (0.35 + 0.65 * mv),
    mv,
    g: frac(st.gait ?? 0),
    gd: vx > 1 ? -1 : 1,
    hurt: st.hurt,
    bobY: clamp((st.vy ?? 0) * 0.05, -12, 12),
    knock: st.hurt * 20 + Math.sin(st.t * 55) * st.hurt * 3,
    ghost: false,
    map: (x, y) => {
      const p = base.multiply(ctx.getTransform()).transformPoint({ x, y });
      return { x: p.x, y: p.y };
    },
  };
  const draw = (cc: C) => {
    if (kind === 1) return ashWanderer(ctx, s, st, cc);
    if (kind === 2) return kitsune(ctx, s, st, cc);
    if (kind === 3) return guardian(ctx, s, st, cc);
    return banshee(ctx, s, st, cc);
  };
  // imagens-fantasma ficando para trás no avanço rápido (investida)
  const dash = c.charge * sk;
  if (dash > 0.15) {
    ctx.save();
    ctx.translate(70 * dash, 0);
    ctx.globalAlpha *= 0.25;
    draw({ ...c, ghost: true, lunge: c.lunge * 0.8 });
    ctx.restore();
  }
  ctx.save();
  const a = draw(c);
  ctx.restore();
  return a;
}

// ------------------------------------------------------------------ utilidades

const frac = (x: number) => x - Math.floor(x);

/** Diferença de ângulos em −π..π. */
const angD = (a: number, b: number) => {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

type Key = readonly [number, number];

/** Trilha de quadros-chave com suavização entre as chaves. */
function K(p: number, ks: readonly Key[]): number {
  if (p <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) {
    const [p1, v1] = ks[i];
    if (p <= p1) {
      const [p0, v0] = ks[i - 1];
      const u = clamp((p - p0) / (p1 - p0 || 1));
      return v0 + (v1 - v0) * u * u * (3 - 2 * u);
    }
  }
  return ks[ks.length - 1][1];
}

/**
 * Corrente cinemática (cabelo, caudas, farrapos): cada segmento herda o
 * ângulo do anterior + curvatura + onda que viaja da raiz à ponta, e é puxado
 * na direção do "vento" (tgt) com força `pull`.
 */
function fk(x: number, y: number, a0: number, n: number, seg: number, bend: number, wave: number, ph: number, tgt: number, pull: number): V[] {
  const out: V[] = [{ x, y }];
  let a = a0;
  for (let j = 0; j < n; j++) {
    a += bend + Math.sin(ph - j * 0.6) * wave * (0.4 + j / n);
    a += angD(tgt, a) * pull;
    x += Math.cos(a) * seg;
    y += Math.sin(a) * seg;
    out.push({ x, y });
  }
  return out;
}

/** Arredonda uma polilinha (Chaikin), mantendo as pontas. */
function soft(pts: V[], it = 1): V[] {
  let a = pts;
  for (let r = 0; r < it; r++) {
    const b: V[] = [a[0]];
    for (let i = 0; i < a.length - 1; i++) {
      const p = a[i];
      const q = a[i + 1];
      b.push({ x: p.x * 0.75 + q.x * 0.25, y: p.y * 0.75 + q.y * 0.25 }, { x: p.x * 0.25 + q.x * 0.75, y: p.y * 0.25 + q.y * 0.75 });
    }
    b.push(a[a.length - 1]);
    a = b;
  }
  return a;
}

/** Vento que age nas partes soltas: ângulo e força (gravidade + arrasto). */
function wind(wx: number, wy: number) {
  return { a: Math.atan2(wy, wx), f: Math.min(0.42, 0.06 + Math.hypot(wx, wy) * 0.09) };
}

/** Névoa no pé do espírito (manchas translúcidas). */
function mist(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, color: string, t: number, alpha: number, drift = 0) {
  if (alpha <= 0.02) return;
  ctx.save();
  for (let i = 0; i < 7; i++) {
    const k = i / 6;
    const px = x + (k - 0.5) * w + Math.sin(t * 0.7 + i * 2.1) * 14 + drift * k * 40;
    const py = y + Math.sin(t * 0.9 + i) * 5;
    const r = 40 + h01(i, 3) * 30;
    ctx.fillStyle = rgrad(ctx, px, py, r, rgba(color, alpha * 0.45), rgba(color, 0));
    ctx.beginPath();
    ctx.ellipse(px, py, r, Math.max(1, r * 0.45), 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Rastro esfumaçado deixado para trás: bolhas que nascem no corpo e ficam
 * para trás (+x quando avança) à medida que o gait avança.
 */
function wake(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, len: number, h: number, color: string, alpha: number, ph: number, n = 7) {
  if (alpha <= 0.02) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const k = frac(ph + i / n);
    const px = x + dir * k * len;
    const py = y + Math.sin(i * 2.3 + ph * 6) * h * 0.25 * k - k * 10;
    const r = h * (0.3 + k * 0.4);
    const a = alpha * (1 - k) * Math.min(1, k * 6);
    ctx.fillStyle = rgrad(ctx, px, py, r, rgba(color, a * 0.5), rgba(color, 0));
    ctx.beginPath();
    ctx.ellipse(px, py, r * 1.4, r * 0.7, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** Braço fino (tubo ombro → cotovelo → mão). */
function arm(ctx: CanvasRenderingContext2D, sh: V, hand: V, bend: number, w0: number, w1: number, color: string | CanvasGradient) {
  const mx = (sh.x + hand.x) / 2;
  const my = (sh.y + hand.y) / 2;
  const dx = hand.x - sh.x;
  const dy = hand.y - sh.y;
  const l = Math.hypot(dx, dy) || 1;
  const elbow = { x: mx - (dy / l) * bend, y: my + (dx / l) * bend };
  tube(ctx, bez(sh, elbow, elbow, hand, 10), (k) => w0 + (w1 - w0) * k, color);
  return elbow;
}

/** Barra de dedos compridos apontando na direção `ang` (abertura `open`). */
function fingers(ctx: CanvasRenderingContext2D, h: V, ang: number, len: number, color: string, w = 3, open = 1) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const a = ang + (i - 1.5) * 0.28 * open;
    const curl = 0.3 + (1 - open) * 0.9;
    ctx.beginPath();
    ctx.moveTo(h.x, h.y);
    ctx.quadraticCurveTo(h.x + Math.cos(a) * len * 0.6, h.y + Math.sin(a) * len * 0.6, h.x + Math.cos(a + curl) * len, h.y + Math.sin(a + curl) * len);
    ctx.stroke();
  }
  ctx.restore();
}

/** Bainha esfarrapada: devolve pontos da barra (da esquerda para a direita). */
function hem(x0: number, x1: number, y: number, n: number, t: number, depth: number, seed: number): V[] {
  const out: V[] = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const deep = i % 2 ? depth * (0.5 + h01(i, seed) * 0.8) : 0;
    out.push({ x: x0 + (x1 - x0) * k + Math.sin(t * 2 + i) * 6, y: y + deep + Math.sin(t * 1.7 + i * 1.3) * 8 - k * 20 });
  }
  return out;
}

/** Anéis do grito saindo da boca para a esquerda. */
function screamRings(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, ph: number, color: string) {
  if (k <= 0.05) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const q = frac(ph + i / 3);
    ctx.strokeStyle = rgba(color, (1 - q) * 0.7 * k);
    ctx.lineWidth = 2 + (1 - q) * 4;
    ctx.beginPath();
    ctx.arc(x + 10, y, 14 + q * 110, Math.PI - 0.8, Math.PI + 0.8);
    ctx.stroke();
  }
  ctx.restore();
}

// ------------------------------------------------------------------ 0: banshee

function banshee(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState, c: C): Anchors {
  const { P, body, dark, t, die, p } = c;
  const on = (k: number, ks: readonly Key[]) => (k ? K(p, ks) : 0);
  // --- trilhas das poses
  // roar: encolhe (1) → arqueia e grita (−1) → volta
  const hunch = on(c.roar, [[0, 0], [0.36, 1], [0.47, -1], [0.8, -0.85], [1, 0]]) + on(c.breath, [[0, 0], [0.38, 0.6], [0.5, -0.5], [0.85, -0.3], [1, 0]]);
  const scream = on(c.roar, [[0, 0], [0.38, 0.1], [0.47, 1], [0.82, 0.9], [1, 0]]) + on(c.breath, [[0, 0], [0.4, 0.2], [0.5, 1], [0.85, 0.8], [1, 0]]);
  const flung = on(c.roar, [[0, 0], [0.36, -1], [0.48, 1], [0.6, 1.1], [0.82, 0.85], [1, 0]]);
  // cast: junta névoa embaixo (gather) → empurra para a frente (thrust)
  const gather = on(c.cast + c.slam, [[0, 0], [0.38, 1], [0.5, 0], [1, 0]]);
  const thrust = on(c.cast, [[0, 0], [0.4, -0.25], [0.52, 1], [0.6, 1.08], [0.8, 0.8], [1, 0]])
    + on(c.swipe + c.charge, [[0, 0], [0.38, -0.6], [0.52, 1], [0.8, 0.6], [1, 0]]);
  const slamD = on(c.slam, [[0, 0], [0.4, -0.3], [0.53, 1], [0.8, 0.7], [1, 0]]);
  // overshoot amortecido após o impacto (cabelo e vestido)
  const after = c.atk > 0 && p > 0.5 ? Math.exp(-(p - 0.5) * 7) * Math.sin((p - 0.5) * 26) : 0;
  // morte: grito final (0–0,3) e desmancha em névoa (0,3–1)
  const d1 = sm(0, 0.22, die) * (1 - sm(0.3, 0.55, die));
  const d2 = sm(0.28, 1, die);

  // --- corpo inteiro
  const surge = Math.sin(c.g * TAU) * c.mv;
  const float = Math.sin(t * 1.3) * 9 + Math.sin(t * 0.53 + 1) * 4;
  const fy = -34 - float + c.bobY + hunch * 12 - gather * 24 + slamD * 18 - surge * 5 + d2 * 70 - d1 * 20;
  const fx = c.lunge + c.knock + surge * 5 - thrust * 14 + Math.max(0, -hunch) * 10;
  const lean = -c.adv * 0.13 - hunch * 0.1 - thrust * 0.08 + c.hurt * 0.14 + Math.sin(t * 0.9) * 0.035 + d1 * 0.12 + d2 * 0.25 - slamD * 0.08;
  // vento nas partes soltas (+x = para trás)
  const wx = 0.6 + Math.max(c.adv, -0.45) * 1.7 + Math.max(0, -hunch) * 2.4 * c.roar + thrust * 0.8 - c.hurt * 1.8 + after * 0.8 + d2 * 0.6;
  const wy = 0.7 - gather * 1.6 - d1 * 0.8 - d2 * 1.6;
  const W = wind(wx, wy);

  if (!c.ghost) mist(ctx, fx * 0.6, -18, 260, P.glow, t, 1 - die * 0.6, c.adv);
  if (!c.ghost) wake(ctx, fx + 20, -120 + fy * 0.3, c.gd, 210, 70, P.glow, c.mv * 0.8, (st.gait ?? 0) * 0.9, 5);

  ctx.save();
  ctx.translate(fx, fy);
  // gira em volta do peito (≈ y −190)
  ctx.translate(0, -150);
  ctx.rotate(lean);
  ctx.translate(0, 150);
  const sc = 1.12 * (1 + c.roar * Math.max(0, -hunch) * 0.06 + c.imp * 0.03);
  ctx.translate(0, -60);
  ctx.scale(sc * (1 + d2 * 0.1), sc * (1 - d2 * 0.18));
  ctx.translate(0, 60);
  const ghostA = (0.84 + Math.sin(t * 2.1) * 0.08 + Math.sin(t * 3.7) * 0.04) * (1 - d2 * 0.55);
  ctx.globalAlpha *= ghostA;

  // cabeça
  const hx = -14 - Math.abs(hunch) * 14 - thrust * 12 + c.hurt * 10 + surge * -2;
  const hy = -282 + hunch * 18 + Math.sin(t * 1.3 + 0.6) * 2.5 - thrust * 4 + slamD * 8;
  const hRot = -hunch * 0.32 + Math.sin(t * 0.7) * 0.07 + c.hurt * 0.35 + d1 * 0.6 - d2 * 0.5 + after * 0.08;
  const hairCol = hurtTint(ctx, st, mixHex(P.body, P.dark, 0.35));
  const hairCol2 = mixHex(hairCol, P.glow, 0.3);

  // cabelo de trás: 7 mechas cinemáticas, cada uma com sua fase
  for (let i = 0; i < 7; i++) {
    const k = i / 6;
    const root = { x: hx + 4 + k * 16, y: hy - 22 + k * 10 };
    const pts = fk(root.x, root.y, -0.6 + k * 0.5, 13, 15 + k * 3, 0.07, 0.07 * (1 + c.mv), t * 2.3 + i * 0.9, W.a + (k - 0.5) * 0.3, W.f);
    tube(ctx, soft(pts), (q) => 15 * (1 - q) + 2, i % 2 ? hairCol : hairCol2);
  }

  // braços: alvo de cada mão como soma das poses
  const swayF = Math.sin(t * 1.2) * 6;
  const swayB = Math.sin(t * 1.4 + 1.3) * 6;
  const trail = Math.max(0, c.adv) * 28;
  const curl = Math.max(0, -flung);
  const open = Math.max(0, flung);
  const handB = {
    x: 44 + swayB * 0.5 + trail + curl * -34 + open * 74 + gather * 20 + thrust * -120 + slamD * -80 + c.hurt * -20 + d1 * 30,
    y: -168 + swayB + curl * -46 + open * -126 + gather * 44 + thrust * -86 + slamD * 40 + after * 10 * c.roar - d1 * 150,
  };
  const handF = {
    x: -66 + swayF * 0.6 + trail * 0.8 + curl * 40 + open * -54 + gather * 24 + thrust * -82 + slamD * -70 + c.hurt * -26 - d1 * 20,
    y: -170 + swayF + curl * -40 + open * -136 + gather * 46 + thrust * -78 + slamD * 54 - after * 10 * c.roar - d1 * 160,
  };
  const shB = { x: 20, y: -232 + hunch * 6 };
  const shF = { x: -22, y: -232 + hunch * 6 };
  const armB = mixHex(body, dark, 0.3);
  arm(ctx, shB, handB, -14, 10, 5, armB);
  fingers(ctx, handB, Math.atan2(handB.y - shB.y, handB.x - shB.x), 22, armB, 3, 1 - curl * 0.7);

  // vestido + cauda esfumaçada (os lados ondulam e são arrastados pelo vento)
  const flowX = (k: number, ph: number) => (Math.cos(W.a) * 70 * W.f * 2.4) * k * k + Math.sin(t * 2.4 - k * 3.5 + ph) * 7 * k * (1 + c.mv);
  const L: V[] = [];
  const Rr: V[] = [];
  const flare = 1 + gather * 0.25 + open * c.roar * 0.2 + d2 * 0.4;
  for (let i = 0; i <= 6; i++) {
    const k = i / 6;
    const y = -198 + k * 128;
    const wL = (22 + Math.sin(k * 2.4) * 46) * flare;
    const wR = (20 + Math.sin(k * 2.4) * 58) * flare;
    L.push({ x: -4 - wL + flowX(k, 0), y });
    Rr.push({ x: 2 + wR + flowX(k, 1.4), y: y - k * 12 });
  }
  // farrapos (cauda) que saem da barra: nascem DENTRO do vestido (largura 0)
  const tails: V[][] = [];
  const nT = 8;
  for (let i = 0; i < nT; i++) {
    const k = i / (nT - 1);
    const rx = L[4].x + (Rr[4].x - L[4].x) * k;
    const ry = L[4].y + (Rr[4].y - L[4].y) * k;
    const len = 9 + Math.round(h01(i, 7) * 5) - Math.round(Math.abs(k - 0.55) * 4);
    const tw = wind(wx * 1.3 + k * 0.5, wy + 0.4);
    tails.push(soft(fk(rx, ry, Math.PI / 2 - 0.35 + k * 0.7, len, 12 + k * 3, 0.05, 0.17, t * 2.6 + i * 1.7 + c.g * TAU * c.gd * 1.5, tw.a, tw.f * 0.75), 2));
  }
  // grande véu de fumaça atrás de tudo (rastro principal)
  if (!c.ghost) {
    const tw = wind(wx * 1.5 + 0.4, wy + 0.2);
    const pts = soft(fk(10, -150, Math.PI / 2 - 0.2, 11, 20 + c.mv * 6, 0.04, 0.1, t * 1.8 + c.g * TAU * c.gd, tw.a, tw.f * 0.6), 2);
    const e = pts[pts.length - 1];
    const g = ctx.createLinearGradient(pts[0].x, pts[0].y, e.x, e.y);
    g.addColorStop(0, rgba(body, 0.4));
    g.addColorStop(1, rgba(P.glow, 0));
    tube(ctx, pts, (q) => 150 * Math.sin(Math.min(1, q * 2.5) * Math.PI / 2) * (1 - q * 0.8) + 4, g);
  }
  const drawTails = (front: boolean) => {
    for (let i = front ? 1 : 0; i < nT; i += 2) {
      const pts = tails[i];
      const e = pts[pts.length - 1];
      const g = ctx.createLinearGradient(pts[0].x, pts[0].y, e.x, e.y);
      g.addColorStop(0, rgba(mixHex(body, P.glow, 0.2), 0.7));
      g.addColorStop(0.45, rgba(body, 0.45));
      g.addColorStop(1, rgba(P.glow, 0));
      const w = 15 + h01(i, 2) * 10;
      tube(ctx, pts, (q) => w * Math.sin(Math.min(1, q * 2.2) * Math.PI / 2) * (1 - q * 0.9) + 1, g);
    }
  };
  drawTails(false);
  ctx.fillStyle = vgrad(ctx, -230, -60, body, rgba(mixHex(body, P.glow, 0.3), 0.6));
  ctx.beginPath();
  ctx.moveTo(-26, -238);
  for (const q of L) ctx.lineTo(q.x, q.y);
  // barra esfarrapada (pontas sobem e descem em fases diferentes)
  for (let i = 1; i < 10; i++) {
    const k = i / 10;
    const deep = (i % 2 ? 14 : -2) * (0.6 + h01(i, 4) * 0.7) + Math.sin(t * 3 + i * 1.9) * 6;
    ctx.lineTo(L[6].x + (Rr[6].x - L[6].x) * k + (i % 2 ? Math.cos(W.a) * 10 : 0), L[6].y + (Rr[6].y - L[6].y) * k + deep);
  }
  for (let i = 6; i >= 0; i--) ctx.lineTo(Rr[i].x, Rr[i].y);
  ctx.lineTo(26, -238);
  ctx.closePath();
  ctx.fill();
  // dobras do vestido (acompanham o fluxo)
  ctx.strokeStyle = rgba(P.dark, 0.32);
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const k = (i + 0.5) / 5;
    const x0 = -10 + i * 6;
    const x1 = L[6].x + (Rr[6].x - L[6].x) * k;
    ctx.beginPath();
    ctx.moveTo(x0, -200);
    ctx.quadraticCurveTo(x0 + (x1 - x0) * 0.4 + Math.sin(t * 1.6 + i) * 6, -130, x1, -78 - k * 10);
    ctx.stroke();
  }
  drawTails(true);
  // luz da alma no peito
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const soul = 0.35 + Math.sin(t * 2.1) * 0.12 + scream * 0.4 + gather * 0.3 + st.rage * 0.2;
  ctx.fillStyle = rgrad(ctx, -2, -205, 60, rgba(P.glow, soul * 0.5), rgba(P.glow, 0));
  ctx.beginPath();
  ctx.arc(-2, -205, 60, 0, TAU);
  ctx.fill();
  ctx.restore();
  // tronco (respira)
  const br = c.b * 2;
  ctx.fillStyle = vgrad(ctx, -250, -190, mixHex(body, '#ffffff', 0.25), body);
  ctx.beginPath();
  ctx.moveTo(-28 - br * 0.5, -240);
  ctx.quadraticCurveTo(-4, -250 - br, 28 + br * 0.5, -240);
  ctx.quadraticCurveTo(24, -210, 16, -192);
  ctx.lineTo(-20, -192);
  ctx.quadraticCurveTo(-30 - br * 0.3, -214, -28 - br * 0.5, -240);
  ctx.fill();
  // costelas fantasmas
  ctx.strokeStyle = rgba(P.dark, 0.25);
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-18 + i * 2, -228 + i * 10);
    ctx.quadraticCurveTo(-2, -222 + i * 10 + br * 0.3, 14 - i * 2, -228 + i * 10);
    ctx.stroke();
  }

  // pescoço + cabeça
  ctx.strokeStyle = body;
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-2, -240);
  ctx.quadraticCurveTo(-4, -252, hx + 4, hy + 20);
  ctx.stroke();
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(hRot);
  ctx.fillStyle = vgrad(ctx, -30, 30, mixHex(body, '#ffffff', 0.35), body);
  ctx.beginPath();
  ctx.ellipse(0, 0, 23, 30, -0.1, 0, TAU);
  ctx.fill();
  // bochechas fundas
  ctx.fillStyle = rgba(P.dark, 0.18);
  ctx.beginPath();
  ctx.ellipse(-8, 10, 14, 8, 0.2, 0, TAU);
  ctx.fill();
  // olhos ocos (arregalam no grito)
  const eyeH = 9 + scream * 4;
  ctx.fillStyle = '#04100e';
  for (const ex of [-12, 6]) {
    ctx.beginPath();
    ctx.ellipse(ex, -4, 6 + scream, eyeH, 0, 0, TAU);
    ctx.fill();
  }
  const blink = frac(t / 4.3) < 0.035 ? 0.15 : 1;
  const eo = (st.anim === 'death' ? 1 - die : 1) * blink;
  eyeGlow(ctx, -12, -2, 2.6 + st.rage * 1.5 + scream * 1.5, P.glow, eo);
  eyeGlow(ctx, 6, -2, 2.6 + st.rage * 1.5 + scream * 1.5, P.glow, eo);
  // boca do grito (estica para baixo)
  const jaw = clamp(0.18 + Math.sin(t * 1.1) * 0.05 + scream * 1.1 + c.cast * c.atk * 0.25 + d1 + c.hurt * 0.4);
  ctx.fillStyle = '#02100c';
  ctx.beginPath();
  ctx.ellipse(-4, 16 + jaw * 4, 5 + jaw * 4, Math.max(1, 3 + jaw * 15), 0, 0, TAU);
  ctx.fill();
  if (jaw > 0.4) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgrad(ctx, -4, 18, 36, rgba(P.glow, 0.55 * jaw), rgba(P.glow, 0));
    ctx.beginPath();
    ctx.arc(-4, 18, 36, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  const mouth = c.map(-6, 20);
  if (!c.ghost) screamRings(ctx, -12, 18, Math.max(scream * c.roar, d1), t * 2.2, P.glow);
  // mechas da frente sobre o rosto (com atraso)
  for (let i = 0; i < 3; i++) {
    const pts = fk(-6 + i * 8, -26, Math.PI * 0.62 - i * 0.08, 7, 11, -0.02, 0.06, t * 2 + i * 1.3, W.a - hRot + Math.PI * 0.05, W.f * 0.7);
    tube(ctx, pts, (q) => 7 * (1 - q) + 1.5, hairCol);
  }
  ctx.restore();

  // braço da frente
  const armG = vgrad(ctx, -240, -120, mixHex(body, '#ffffff', 0.15), body);
  arm(ctx, shF, handF, 14, 11, 5, armG);
  fingers(ctx, handF, Math.atan2(handF.y - shF.y, handF.x - shF.x), 26, body, 3, 1 - curl * 0.7);
  const hand = c.map(handF.x, handF.y);

  // brilho de lamento nas mãos ao conjurar
  const gl = clamp(gather * 0.8 + Math.max(0, thrust) * c.cast + st.rage * 0.25 + d1 * 0.5);
  if (gl > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    orb(ctx, handF.x, handF.y, 28 + gl * 26 + c.imp * 20, P.glow, gl);
    orb(ctx, handB.x, handB.y, 22 + gl * 18, P.glow, gl * 0.8);
    // névoa sendo sugada para as mãos durante a carga
    if (gather > 0.1) {
      ctx.fillStyle = rgba(P.glow, 0.5 * gather);
      for (let i = 0; i < 8; i++) {
        const q = frac(t * 1.4 + i / 8);
        const a = i * 2.4;
        const r = (1 - q) * 90;
        ctx.beginPath();
        ctx.arc(handF.x + Math.cos(a) * r, handF.y + Math.sin(a) * r * 0.6, 2 + q * 2, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  const core = c.map(0, -195);
  const topY = c.map(hx, hy - 34).y;
  ctx.restore();
  // lágrimas de luz subindo (no fim da morte, a alma se desfaz em muitas)
  if (!c.ghost) {
    rising(ctx, fx, -40, 200, 260, t * 0.12, 7, 10, P.glow, 1, 0.6 * (1 - die), 3);
    if (die > 0.2) rising(ctx, fx, fy - 20, 220, 320, die * 0.6 + t * 0.05, 11, 26, P.glow, 1, sm(0.2, 0.5, die) * (1 - sm(0.85, 1, die)), 4);
  }
  return { mouth, hand, core, top: topY, halfW: 120 };
}

// ------------------------------------------------------------------ 1: errante de cinzas

function ashWanderer(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState, c: C): Anchors {
  const { P, body, dark, t, die, p } = c;
  const ember = P.accent;
  const on = (k: number, ks: readonly Key[]) => (k ? K(p, ks) : 0);
  // --- trilhas das poses
  // foice (swipe): ângulo da haste (0 = em pé; negativo = topo para a esquerda)
  const swA = (q: number) => K(q, [[0, 0], [0.36, 1.45], [0.44, 1.55], [0.54, -1.9], [0.62, -2.25], [0.8, -1.3], [1, 0]]);
  const sw = c.swipe ? swA(p) : 0;
  const swBody = on(c.swipe, [[0, 0], [0.38, 1], [0.46, 0.6], [0.55, -1], [0.66, -1.05], [1, 0]]);
  // investida: encolhe (−) e dispara (+)
  const dash = on(c.charge, [[0, 0], [0.38, -1], [0.46, 0.6], [0.52, 1], [0.64, 1], [0.82, 0.25], [1, 0]]);
  // roar / morte: encolhe (1) → abre o manto (−1)
  const hunch = on(c.roar, [[0, 0], [0.36, 1], [0.47, -1], [0.8, -0.85], [1, 0]]) + on(c.breath, [[0, 0], [0.38, 0.6], [0.5, -0.6], [1, 0]]);
  // cast: ergue a chama (raise) → arremessa para a frente (throw)
  const raise = on(c.cast + c.slam, [[0, 0], [0.38, 1], [0.48, 0.2], [0.56, 0], [1, 0]]);
  const throwK = on(c.cast + c.slam, [[0, 0], [0.4, -0.2], [0.53, 1], [0.62, 1.1], [0.82, 0.6], [1, 0]]);
  const after = c.atk > 0 && p > 0.52 ? Math.exp(-(p - 0.52) * 7) * Math.sin((p - 0.52) * 24) : 0;
  const d1 = sm(0, 0.25, die) * (1 - sm(0.3, 0.6, die));
  const d2 = sm(0.25, 0.95, die);

  const surge = Math.sin(c.g * TAU) * c.mv;
  const fy = -16 - Math.sin(t * 1.1) * 9 + c.bobY + hunch * 14 + Math.max(0, -dash) * 18 - raise * 14 - surge * 9 - Math.max(0, -hunch) * 16;
  const fx = c.lunge + c.knock - surge * 8 * c.gd + swBody * 22 + Math.max(0, -dash) * 26;
  const lean = -c.adv * 0.14 - hunch * 0.08 + swBody * 0.12 - Math.max(0, swBody * -1) * 0.12 - dash * 0.22 + c.hurt * 0.16
    - throwK * 0.08 + Math.sin(t * 0.8) * 0.03 - surge * 0.05 * c.gd + d1 * 0.15 - d2 * 0.18;
  // vento nas partes soltas (manto, farrapos, brasas): +x = para trás
  const wx = 0.5 + Math.max(c.adv, -0.5) * 1.8 + Math.max(0, dash) * 3.2 - Math.max(0, -dash) * 0.6 + Math.max(0, -swBody) * 1.2 - c.hurt * 1.6 + after * 0.9 + Math.max(0, -hunch) * 0.8;
  const wy = 0.6 - Math.max(0, -hunch) * 1.4 - raise * 0.4 + d2 * 0.4;
  const W = wind(wx, wy);

  if (!c.ghost) {
    mist(ctx, fx * 0.6, -16, 240, '#5a4a44', t, 0.9 - die * 0.6, c.adv);
    // brasas subindo (atrás)
    rising(ctx, fx, -30, 260, 340, t * 0.15, 3, 18 + Math.round(st.rage * 14), ember, 1, 0.9 * (1 - die), 3);
    wake(ctx, fx + 30, -150 + fy * 0.3, c.gd, 240, 80, ember, c.mv * 0.55 + Math.max(0, dash) * 0.9, (st.gait ?? 0) * 0.9 + p * 2 * c.charge, 5);
  }

  ctx.save();
  ctx.translate(fx, fy);
  // desmorona sobre o chão na morte
  ctx.scale(1 + d2 * 0.2, 1 - d2 * 0.55);
  ctx.translate(0, -170);
  ctx.rotate(lean);
  ctx.translate(0, 170);
  const ghostA = 0.92 + Math.sin(t * 2.3) * 0.05;
  ctx.globalAlpha *= ghostA;

  // ângulo da foice + mão da frente
  const idleA = -0.25 + Math.sin(t * 1.2) * 0.05 + c.adv * 0.15;
  const scA = idleA + sw + Math.max(0, dash) * -1.25 + Math.max(0, -dash) * 0.5 + throwK * 0.15 - hunch * 0.25 + c.hurt * 0.3 + d1 * 0.6 + d2 * 1.4;
  const handF = {
    x: -78 + K(p, [[0, 0], [0.36, 46], [0.46, 40], [0.55, -56], [0.66, -60], [1, 0]]) * c.swipe + dash * -30 + Math.max(0, -dash) * 30
      + Math.max(0, -hunch) * -26 + hunch * 20 + c.hurt * 14 + Math.sin(t * 1.3) * 3,
    y: -170 + K(p, [[0, 0], [0.36, -96], [0.46, -90], [0.55, 26], [0.66, 34], [1, 0]]) * c.swipe + dash * 40 + Math.max(0, -hunch) * -40 + hunch * 10
      + Math.sin(t * 1.4) * 4 + d1 * -40 + d2 * 60,
  };

  // farrapos do manto (cauda de fumaça) — atrás do corpo
  const rag = (front: boolean) => {
    for (let i = front ? 1 : 0; i < 9; i += 2) {
      const k = i / 8;
      const rx = -96 + k * 200;
      const ry = -70 - k * 18;
      const tw = wind(wx * 1.25 + k * 0.5, wy + 0.3);
      const len = 7 + Math.round(h01(i, 12) * 5);
      const pts = soft(fk(rx, ry, Math.PI / 2 - 0.2 + k * 0.5, len, 12 + k * 4, 0.04, 0.2, t * 2.8 + i * 1.9 + c.g * TAU * c.gd * 1.5, tw.a, tw.f * 0.8), 2);
      const e = pts[pts.length - 1];
      const g = ctx.createLinearGradient(pts[0].x, pts[0].y, e.x, e.y);
      g.addColorStop(0, mixHex(body, dark, 0.25));
      g.addColorStop(0.6, rgba(mixHex(dark, ember, 0.25), 0.7));
      g.addColorStop(1, rgba(ember, 0));
      const w = 22 + h01(i, 5) * 14;
      tube(ctx, pts, (q) => w * Math.sin(Math.min(1, q * 2) * Math.PI / 2) * (1 - q * 0.92) + 1, g);
    }
  };
  // véu de fumaça grosso (o rastro principal)
  if (!c.ghost) {
    const tw = wind(wx * 1.5 + 0.5, wy + 0.1);
    const pts = soft(fk(20, -170, Math.PI / 2 - 0.4, 11, 22 + c.mv * 6 + Math.max(0, dash) * 10, 0.03, 0.12, t * 1.9 + c.g * TAU * c.gd, tw.a, tw.f * 0.6), 2);
    const e = pts[pts.length - 1];
    const g = ctx.createLinearGradient(pts[0].x, pts[0].y, e.x, e.y);
    g.addColorStop(0, rgba(mixHex(body, dark, 0.4), 0.55));
    g.addColorStop(0.7, rgba(mixHex(dark, ember, 0.3), 0.25));
    g.addColorStop(1, rgba(ember, 0));
    tube(ctx, pts, (q) => 170 * Math.sin(Math.min(1, q * 2.5) * Math.PI / 2) * (1 - q * 0.85) + 4, g);
  }
  rag(false);

  // manto (lados ondulam; abre no roar)
  const flowX = (k: number, ph: number) => Math.cos(W.a) * 60 * W.f * 2.2 * k * k + Math.sin(t * 2.2 - k * 3.2 + ph) * 6 * k * (1 + c.mv);
  const flare = 1 + Math.max(0, -hunch) * 0.35 - hunch * 0.06 + d2 * 0.3;
  const Lp: V[] = [];
  const Rp: V[] = [];
  for (let i = 0; i <= 6; i++) {
    const k = i / 6;
    const y = -300 + k * 236;
    Lp.push({ x: -38 - (12 + Math.sin(k * 2.0) * 52) * flare + flowX(k, 0), y: y + k * 6 });
    Rp.push({ x: 20 + (16 + Math.sin(k * 2.0) * 64) * flare + flowX(k, 1.2), y: y - k * 16 });
  }
  ctx.fillStyle = vgrad(ctx, -330, -40, mixHex(body, '#6a5a54', 0.15), mixHex(dark, ember, 0.12));
  ctx.beginPath();
  ctx.moveTo(-20, -326);
  ctx.quadraticCurveTo(-70, -320, Lp[0].x, Lp[0].y);
  for (const q of Lp) ctx.lineTo(q.x, q.y);
  for (let i = 1; i < 12; i++) {
    const k = i / 12;
    const deep = (i % 2 ? 18 : -2) * (0.6 + h01(i, 8) * 0.7) + Math.sin(t * 3.2 + i * 1.7) * 6;
    ctx.lineTo(Lp[6].x + (Rp[6].x - Lp[6].x) * k, Lp[6].y + (Rp[6].y - Lp[6].y) * k + deep);
  }
  for (let i = 6; i >= 0; i--) ctx.lineTo(Rp[i].x, Rp[i].y);
  ctx.quadraticCurveTo(50, -330, -20, -326);
  ctx.closePath();
  ctx.fill();
  // sombra lateral (volume do manto)
  ctx.fillStyle = vgrad(ctx, -300, -60, rgba(dark, 0.0), rgba(dark, 0.45));
  ctx.beginPath();
  ctx.moveTo(10, -290);
  for (let i = 1; i <= 6; i++) ctx.lineTo(Rp[i].x - 30 + i * 2, Rp[i].y + 6);
  for (let i = 6; i >= 1; i--) ctx.lineTo(Rp[i].x, Rp[i].y);
  ctx.closePath();
  ctx.fill();
  // dobras + rachaduras de fogo no manto (pulsam)
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(dark, 0.45);
  ctx.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    const k = (i + 0.5) / 5;
    const x1 = Lp[6].x + (Rp[6].x - Lp[6].x) * k;
    ctx.beginPath();
    ctx.moveTo(-30 + i * 12, -250);
    ctx.quadraticCurveTo(-40 + i * 20 + Math.sin(t * 1.4 + i) * 8, -150, x1, -76 - k * 14);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'lighter';
  const heatC = clamp(0.3 + c.atk * 0.4 + st.rage * 0.3 + Math.sin(t * 3.1) * 0.12 + c.imp * 0.4 - die * 0.3);
  ctx.strokeStyle = rgba(ember, heatC);
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    let x = -60 + i * 40;
    let y = -200 + h01(i, 4) * 50;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 4; j++) {
      x += (h01(i, j) - 0.5) * 30 + flowX((y + 300) / 236, 0) * 0.08;
      y += 26 + h01(j, i) * 18;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
  rag(true);

  // braço de trás (mão esquelética com chama): no cast ergue e arremessa
  const shB = { x: 30, y: -240 + hunch * 8 };
  const handB = {
    x: 60 + raise * 10 + throwK * -170 + Math.max(0, -hunch) * 70 + hunch * -40 + dash * 20 + c.hurt * -10 + d1 * 30,
    y: -170 - raise * 160 + throwK * -50 + Math.max(0, -hunch) * -90 + hunch * -30 + Math.sin(t * 1.3) * 5 + after * 8 - d1 * 120,
  };
  arm(ctx, shB, handB, -10, 26, 14, mixHex(body, dark, 0.3));
  fingers(ctx, handB, Math.atan2(handB.y - shB.y, handB.x - shB.x), 18, '#8a7a70', 3, 1 - hunch * 0.5);
  const fl = clamp(raise + Math.max(0, throwK) * 0.9 + st.rage * 0.3 + Math.max(0, -hunch) * 0.6);
  if (fl > 0.08 && !c.ghost) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    orb(ctx, handB.x, handB.y - 6, 26 + fl * 30 + c.imp * 20, ember, fl * 0.7);
    flame(ctx, handB.x, handB.y - 10, 9 + fl * 12, t * 7, P.eye, ember, fl);
    ctx.restore();
  }

  // capuz (a cabeça estabiliza: gira menos que o corpo)
  const hx = -36 - hunch * 14 - throwK * 10 - dash * 10 + c.hurt * 10 + Math.max(0, -hunch) * 6;
  const hy = -282 + hunch * 16 - Math.max(0, -hunch) * 10 + Math.sin(t * 1.1 + 0.5) * 2;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(-lean * 0.4 - hunch * 0.25 + Math.max(0, -hunch) * 0.1 + c.hurt * 0.25 + Math.sin(t * 0.7) * 0.05 + d1 * 0.4);
  ctx.fillStyle = vgrad(ctx, -60, 40, mixHex(body, '#7a6a64', 0.3), body);
  ctx.beginPath();
  ctx.moveTo(44, -10);
  ctx.quadraticCurveTo(30, -64, -6, -60);
  ctx.quadraticCurveTo(-46, -54, -54, 0);
  ctx.quadraticCurveTo(-56, 30, -38, 48);
  ctx.lineTo(40, 40);
  ctx.closePath();
  ctx.fill();
  // ponta do capuz caindo para trás (com atraso)
  {
    const pts = soft(fk(30, -40, 0.3, 5, 12, 0.18, 0.12, t * 2.4, W.a, W.f * 0.7));
    tube(ctx, pts, (q) => 26 * (1 - q) + 2, body);
  }
  // borda gasta do capuz
  ctx.strokeStyle = rgba(ember, 0.25 + heatC * 0.3);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-6, -58);
  ctx.quadraticCurveTo(-46, -52, -52, 0);
  ctx.stroke();
  // abertura escura do capuz
  ctx.fillStyle = '#050303';
  ctx.beginPath();
  ctx.ellipse(-22, 6, 22, 32, 0.15, 0, TAU);
  ctx.fill();
  const heat = clamp(0.4 + Math.max(0, -hunch) * 0.8 + raise * 0.4 + Math.max(0, dash) * 0.4 + st.rage * 0.3 + Math.sin(t * 4.3) * 0.08 - die);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgrad(ctx, -22, 8, 32, rgba(ember, heat * 0.45), rgba(ember, 0));
  ctx.beginPath();
  ctx.arc(-22, 8, 32, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  const blink = frac(t / 3.7) < 0.04 ? 0.15 : 1;
  const eo = (st.anim === 'death' ? 1 - die : 1) * blink;
  const er = 4 + st.rage * 2 + heat * 1.5;
  eyeGlow(ctx, -32, 0, er, P.eye, eo);
  eyeGlow(ctx, -14, 2, er, P.eye, eo);
  const mouth = c.map(-24, 16);
  ctx.restore();

  // foice: haste presa na mão da frente (com arco de rastro no golpe)
  const bladeR = 150;
  if (c.swipe && !c.ghost) {
    const a0 = swA(Math.max(0, p - 0.08)) + idleA - Math.PI / 2;
    const a1 = sw + idleA - Math.PI / 2;
    const k = clamp(Math.abs(a1 - a0) / 1.2) * c.atk;
    if (k > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = rgrad(ctx, handF.x, handF.y, bladeR + 22, rgba(ember, 0), rgba(P.eye, 0.55 * k));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(handF.x, handF.y, bladeR + 22, Math.min(a0, a1), Math.max(a0, a1));
      ctx.arc(handF.x, handF.y, bladeR - 14, Math.max(a0, a1), Math.min(a0, a1), true);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.save();
  ctx.translate(handF.x, handF.y + d2 * 40);
  ctx.rotate(scA);
  ctx.strokeStyle = hurtTint(ctx, st, '#6a5040');
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 110);
  ctx.lineTo(0, -160);
  ctx.stroke();
  ctx.strokeStyle = hurtTint(ctx, st, '#3a2820');
  ctx.lineWidth = 3;
  for (const y of [-60, 20, 80]) {
    ctx.beginPath();
    ctx.moveTo(-5, y);
    ctx.lineTo(5, y + 6);
    ctx.stroke();
  }
  // lâmina espectral (curva para a esquerda)
  ctx.globalAlpha *= 0.92;
  ctx.fillStyle = vgrad(ctx, -175, -110, rgba(P.eye, 0.95), rgba(ember, 0.55));
  ctx.beginPath();
  ctx.moveTo(6, -168);
  ctx.quadraticCurveTo(-50, -212, -134, -128);
  ctx.quadraticCurveTo(-60, -166, 0, -136);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba('#ffffff', 0.5 + c.imp * 0.5);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(4, -166);
  ctx.quadraticCurveTo(-50, -208, -132, -129);
  ctx.stroke();
  ctx.fillStyle = rgrad(ctx, -60, -160, 70, rgba(ember, 0.25 + c.atk * 0.25), rgba(ember, 0));
  ctx.beginPath();
  ctx.arc(-60, -160, 70, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  const blade = c.map(-110, -150);
  ctx.restore();

  // manga e mão da frente
  arm(ctx, { x: -40, y: -246 + hunch * 8 }, handF, 12, 30, 16, body);
  const handPt = c.map(handF.x, handF.y);
  ctx.fillStyle = '#8a7a70';
  ctx.beginPath();
  ctx.arc(handF.x, handF.y, 8, 0, TAU);
  ctx.fill();

  const core = c.map(-10, -190);
  const topY = c.map(hx - 6, hy - 62).y;
  const flamePt = c.map(handB.x, handB.y - 10);
  ctx.restore();
  // explosão de brasas na morte
  if (!c.ghost && die > 0.15) rising(ctx, fx, -60, 300, 300, die * 0.7, 5, 30, ember, 1, sm(0.15, 0.4, die) * (1 - sm(0.85, 1, die)), 4);
  const hand = c.swipe + c.charge > 0 ? blade : c.cast + c.slam + c.roar > 0 ? flamePt : handPt;
  return { mouth, hand, core, top: Math.min(topY, blade.y), halfW: 120 };
}

// ------------------------------------------------------------------ 2: raposa de nove caudas

function kitsune(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState, c: C): Anchors {
  const { P, body, dark, t, die, p } = c;
  const nT = Math.max(1, Math.round(s.feat.tails ?? 9));
  const fire = '#4af0ff';
  const on = (k: number, ks: readonly Key[]) => (k ? K(p, ks) : 0);
  // --- trilhas das poses
  // roar: abaixa (1) → empina e uiva (−1)
  const howl = on(c.roar, [[0, 0], [0.36, 1], [0.47, -1], [0.8, -0.9], [1, 0]]) + on(c.breath, [[0, 0], [0.38, 0.7], [0.5, -0.4], [1, 0]]);
  // cast: ergue patas e caudas (raise) → projeta para a frente (thrust)
  const raise = on(c.cast + c.slam, [[0, 0], [0.38, 1], [0.5, 0.3], [0.62, 0], [1, 0]]);
  const thrust = on(c.cast + c.slam + c.breath, [[0, 0], [0.4, -0.25], [0.52, 1], [0.62, 1.05], [0.82, 0.5], [1, 0]]);
  // swipe: caudas enrolam para trás/baixo (−) e chicoteiam por cima para a frente (+)
  const whip = on(c.swipe, [[0, 0], [0.36, -1], [0.44, -1.05], [0.53, 1], [0.62, 1.1], [0.82, 0.4], [1, 0]]);
  const dash = on(c.charge, [[0, 0], [0.38, -1], [0.5, 1], [0.64, 1], [0.84, 0.2], [1, 0]]);
  const after = c.atk > 0 && p > 0.52 ? Math.exp(-(p - 0.52) * 7) * Math.sin((p - 0.52) * 24) : 0;
  const d1 = sm(0, 0.22, die) * (1 - sm(0.28, 0.5, die));
  const d2 = sm(0.22, 0.85, die);

  // --- galope no ar (as pernas "correm" mesmo flutuando)
  const run = clamp(c.mv + Math.max(0, dash) * 0.8);
  const ph = c.g * TAU * c.gd + (c.charge ? p * 14 : 0);
  const gal = Math.sin(ph);
  const gal2 = Math.cos(ph);
  const fy = -40 - Math.sin(t * 1.5) * 8 + c.bobY - gal2 * 8 * run + howl * 10 + Math.max(0, -dash) * 14 - raise * 16 + d2 * 105 - d1 * 20;
  const fx = c.lunge + c.knock + Math.max(0, -dash) * 22 + Math.max(0, -whip) * 14 - Math.max(0, whip) * 30 - thrust * 10;
  // inclinação do corpo: + = frente sobe (empinar)
  const pitch = gal * 0.07 * run + c.adv * 0.06 + raise * 0.12 + Math.max(0, -howl) * 0.32 - Math.max(0, howl) * 0.12
    - Math.max(0, whip) * 0.22 + Math.max(0, -whip) * 0.1 - Math.max(0, dash) * 0.08 + c.hurt * 0.12 + Math.sin(t * 0.9) * 0.025 + d1 * 0.25 - d2 * 0.12;
  // vento nas caudas (+x = para trás)
  const wx = 0.15 + Math.max(c.adv, -0.5) * 1.6 + Math.max(0, dash) * 2.5 - c.hurt * 1.3 + after * 0.8;
  const wy = -0.2 + d2 * 2.5;

  if (!c.ghost) wake(ctx, fx + 60, -180 + fy * 0.3, c.gd, 230, 60, P.glow, c.mv * 0.55 + Math.max(0, dash) * 0.8, (st.gait ?? 0) * 0.9, 5);

  // fogo de raposa orbitando (atrás / na frente)
  const orbit = 1 + raise * 0.4 + Math.max(0, thrust) * 0.2;
  const wisp = (front: boolean) => {
    if (c.ghost) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const a = t * (0.9 + raise * 1.5) + (i / 5) * TAU + raise * 2;
      const z = Math.sin(a);
      if (front !== z > 0) continue;
      const r = 150 * orbit;
      const x = fx + Math.cos(a) * r + c.adv * 30 * (1 - z);
      const y = -180 + fy + z * 30 - raise * 50;
      flame(ctx, x, y, 8 + z * 2 + raise * 6 + c.imp * 6 * c.cast, t * 5 + i, i % 2 ? fire : P.eye, i % 2 ? fire : P.glow, 0.85 * (1 - die));
    }
    ctx.restore();
  };
  wisp(false);

  ctx.save();
  ctx.translate(fx, fy);
  // gira em volta do quadril
  ctx.translate(60, -150);
  ctx.rotate(pitch);
  ctx.translate(-60, 150);
  ctx.globalAlpha *= 0.96 + Math.sin(t * 2.2) * 0.04;

  // aura espectral (um gradiente só)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgrad(ctx, 10, -170, 190, rgba(P.glow, 0.16 + st.rage * 0.08 + Math.sin(t * 2) * 0.04), rgba(P.glow, 0));
  ctx.beginPath();
  ctx.arc(10, -170, 190, 0, TAU);
  ctx.fill();
  ctx.restore();
  // caudas: cada uma é uma corrente cinemática com sua fase
  const root = { x: 78, y: -152 };
  const tips: V[] = [];
  const spread = 1.2 + raise * 0.3 + Math.max(0, -howl) * 0.2 - c.mv * 0.25 - d2 * 0.3;
  // direção do vento das caudas (em coordenadas do corpo inclinado)
  let tA = Math.atan2(wy, Math.max(0.05, wx)) + pitch;
  let tF = Math.min(0.2, Math.hypot(wx, wy) * 0.06);
  if (whip < 0) {
    tA = tA + (0.7 - tA) * -whip;
    tF += -whip * 0.3;
  } else if (whip > 0) {
    tA = tA + (-2.7 - tA) * whip;
    tF += whip * 0.38;
  }
  const tailCol = (i: number, k: number) => {
    const back = i % 2 === 0;
    const base = back ? mixHex(body, dark, 0.18) : body;
    const g = ctx.createLinearGradient(root.x, root.y, root.x + 30, root.y - 150);
    g.addColorStop(0, base);
    g.addColorStop(0.6, mixHex(base, P.glow, 0.15 + k * 0.1));
    g.addColorStop(1, mixHex(body, P.glow, 0.6));
    return g;
  };
  // ordem: as pares (de trás, mais escuras) antes das ímpares
  const order: number[] = [];
  for (let i = 0; i < nT; i += 2) order.push(i);
  for (let i = 1; i < nT; i += 2) order.push(i);
  for (const i of order) {
    const k = nT > 1 ? i / (nT - 1) : 0.5;
    const a0 = -Math.PI / 2 + (-0.25 + k * 1.5) * spread;
    const len = 11 - Math.round(Math.abs(k - 0.45) * 4);
    const pts = soft(fk(root.x, root.y, a0, len, 13 + h01(i, 3) * 2, 0.05 - k * 0.03, 0.09 + c.mv * 0.05, t * 2.1 + i * 0.83 + c.g * TAU * c.gd, tA + (k - 0.5) * 0.5 * (1 - Math.abs(whip)), tF));
    const tip = pts[pts.length - 1];
    tube(ctx, pts, (q) => 7 + Math.sin(Math.min(1, q * 1.15) * Math.PI) * 30 * (1 - q * 0.3), tailCol(i, k));
    ctx.strokeStyle = rgba(P.dark, 0.3);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // mecha clara no meio
    tube(ctx, pts.slice(Math.floor(pts.length * 0.3)), (q) => 10 * Math.sin(q * Math.PI), rgba('#ffffff', 0.18));
    tips.push(tip);
  }
  // pontas em chama (arco de fogo no chicote)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const flameK = 1 - d2 * 0.9;
  tips.forEach((q, i) => flame(ctx, q.x, q.y + 4, 9 + st.rage * 4 + Math.abs(whip) * 6 + Math.sin(t * 7 + i) * 1.5, t * 6 + i, P.eye, P.glow, 0.95 * flameK));
  if (whip > 0.2 && c.swipe) {
    for (const q of tips) {
      ctx.fillStyle = rgrad(ctx, q.x, q.y, 40, rgba(P.glow, 0.4 * whip * c.atk), rgba(P.glow, 0));
      ctx.beginPath();
      ctx.arc(q.x, q.y, 40, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();

  // pernas (galope rotativo: dianteiras e traseiras em fases opostas)
  const legCol = hurtTint(ctx, st, mixHex(P.body, P.dark, 0.25));
  const idleSw = Math.sin(t * 1.5);
  const limp = d2;
  const leg = (front: boolean, far: boolean) => {
    const off = far ? 0.55 : 0;
    const q = ph + (front ? 0 : Math.PI * 0.85) + off;
    const s1 = Math.sin(q);
    const c1 = Math.cos(q);
    let a1: number;
    let a2: number;
    if (front) {
      a1 = 0.25 + s1 * 0.85 * run + (idleSw * 0.12 + 0.3) * (1 - run) + raise * (far ? 0.4 : 1.3) + Math.max(0, thrust) * (far ? 0.2 : 0.9)
        + Math.max(0, howl) * 0.5 - Math.max(0, -howl) * 0.3 + Math.max(0, dash) * 1.0 + whip * 0.3;
      a2 = -(0.25 + 0.7 * (1 - run) + Math.max(0, c1) * 1.3 * run + raise * 1.1 + Math.max(0, howl) * 0.9) * (1 - limp);
    } else {
      a1 = -0.35 + s1 * 0.75 * run + (idleSw * 0.1 - 0.35) * (1 - run) - Math.max(0, -howl) * 0.5 - Math.max(0, dash) * 0.9 + Math.max(0, howl) * 0.3;
      a2 = (0.45 + 0.6 * (1 - run) + Math.max(0, -c1) * 1.0 * run + Math.max(0, howl) * 0.8) * (1 - limp);
    }
    a1 = a1 * (1 - limp) + limp * (front ? 1.25 + (far ? 0.2 : 0) : -1.3 - (far ? 0.2 : 0));
    const x = front ? (far ? -38 : -54) : far ? 66 : 50;
    const y = front ? -150 : -152;
    return foxLeg(ctx, x, y, a1, a2, front ? 58 : 54, front ? 54 : 58, front ? 17 : 22, far ? legCol : body, mixHex(dark, '#000000', far ? 0.3 : 0));
  };
  leg(false, true);
  leg(true, true);

  // corpo (tronco esticado, encolhe/estica no galope)
  const stretch = 1 + gal * 0.05 * run + Math.max(0, dash) * 0.08;
  ctx.save();
  ctx.translate(10, -160 + c.b * 2);
  ctx.scale(stretch, 1 / stretch);
  ctx.fillStyle = vgrad(ctx, -40, 40, mixHex(body, '#ffffff', 0.25), mixHex(body, dark, 0.22));
  ctx.beginPath();
  ctx.moveTo(-80, -10);
  ctx.quadraticCurveTo(-40, -44, 30, -36);
  ctx.quadraticCurveTo(96, -32, 100, 4);
  ctx.quadraticCurveTo(98, 34, 60, 34);
  ctx.quadraticCurveTo(0, 26, -50, 40);
  ctx.quadraticCurveTo(-96, 30, -80, -10);
  ctx.fill();
  // barriga clara
  ctx.fillStyle = rgba('#ffffff', 0.35);
  ctx.beginPath();
  ctx.ellipse(-10, 24, 50, 10, 0.05, 0, TAU);
  ctx.fill();
  // marcas vermelhas
  ctx.strokeStyle = hurtTint(ctx, st, P.accent);
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 20, -32);
    ctx.quadraticCurveTo(8 + i * 20, -16, -2 + i * 20, -4);
    ctx.stroke();
  }
  ctx.restore();
  // coxa traseira e ombro (volume)
  ctx.fillStyle = vgrad(ctx, -190, -120, mixHex(body, '#ffffff', 0.15), mixHex(body, dark, 0.25));
  ctx.beginPath();
  ctx.ellipse(56, -150, 36, 30, -0.4 + gal * 0.15 * run, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-56, -156, 26, 30, 0.3 - gal * 0.12 * run, 0, TAU);
  ctx.fill();
  // peito felpudo (tufos)
  ctx.fillStyle = mixHex(body, '#ffffff', 0.5);
  ctx.beginPath();
  ctx.moveTo(-90, -190);
  ctx.quadraticCurveTo(-104, -160, -90, -132);
  for (let i = 0; i < 4; i++) ctx.lineTo(-78 + i * 9, -122 + (i % 2) * 10 + Math.sin(t * 3 + i) * 2);
  ctx.quadraticCurveTo(-30, -150, -50, -190);
  ctx.closePath();
  ctx.fill();

  leg(false, false);
  const paw = leg(true, false);

  // pescoço + cabeça (a cabeça estabiliza no galope)
  const hx = -116 - Math.max(0, thrust) * 24 + Math.max(0, howl) * 6 - Math.max(0, -howl) * 4 - Math.max(0, dash) * 18 + c.hurt * 12 - Math.max(0, whip) * 10 - d2 * 10;
  const hy = -226 + Math.max(0, howl) * 30 - Math.max(0, -howl) * 22 - raise * 14 + c.b * 3 + gal * 6 * run + d2 * 46;
  const hRot = -pitch * 0.55 - gal * 0.08 * run + Math.max(0, -howl) * 0.75 - Math.max(0, howl) * 0.3 - Math.max(0, thrust) * 0.08
    + c.hurt * 0.3 + Math.sin(t * 0.8) * 0.05 + d1 * 0.7 - d2 * 0.55 + Math.max(0, -howl) * 0.3;
  {
    const n0 = { x: -62, y: -168 };
    const n1 = { x: hx + 18, y: hy + 2 };
    const m = { x: (n0.x + n1.x) / 2 - 6, y: (n0.y + n1.y) / 2 - 4 };
    tube(ctx, bez(n0, m, m, n1, 8), (q) => 62 - q * 26, vgrad(ctx, hy - 20, -140, mixHex(body, '#ffffff', 0.4), body));
    // juba do pescoço (tufos que balançam)
    ctx.fillStyle = mixHex(body, '#ffffff', 0.5);
    ctx.beginPath();
    ctx.moveTo(n1.x + 8, n1.y + 10);
    for (let i = 0; i < 5; i++) {
      const k = (i + 0.5) / 5;
      const x = n1.x + (n0.x - n1.x) * k;
      const y = n1.y + (n0.y - n1.y) * k;
      ctx.lineTo(x - 22 + Math.sin(t * 3 + i) * 2 - c.adv * 4, y + 18 + (i % 2) * 6);
      ctx.lineTo(x - 6, y + 6);
    }
    ctx.lineTo(n0.x + 20, n0.y + 10);
    ctx.closePath();
    ctx.fill();
  }
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(hRot);
  const jaw = clamp(Math.max(0, -howl) * c.roar * 1.1 + Math.max(0, thrust) * c.breath + Math.max(0, dash) * 0.7 + d1 + c.hurt * 0.5 + Math.max(0, whip) * 0.3);
  // orelhas (tremem; deitam no dano/uivo)
  const earBack = clamp(c.hurt + Math.max(0, howl) * 0.8 + Math.max(0, dash) + d2);
  const twitch = frac(t / 3.1) < 0.06 ? Math.sin(t * 60) * 0.15 : 0;
  for (const [ex, ang, far] of [[18, 0.25, 1], [2, -0.1, 0]] as const) {
    ctx.save();
    ctx.translate(ex, -18);
    ctx.rotate(ang + earBack * 0.9 + (far ? 0 : twitch) + Math.sin(t * 1.3 + ex) * 0.04);
    ctx.fillStyle = far ? mixHex(body, dark, 0.15) : body;
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.quadraticCurveTo(-8, -26, 0, -46);
    ctx.quadraticCurveTo(8, -26, 12, 0);
    ctx.fill();
    ctx.fillStyle = hurtTint(ctx, st, P.accent);
    ctx.beginPath();
    ctx.moveTo(-6, -2);
    ctx.lineTo(0, -32);
    ctx.lineTo(6, -2);
    ctx.fill();
    ctx.restore();
  }
  // mandíbula
  ctx.save();
  ctx.translate(-10, 8);
  ctx.rotate(jaw * 0.55);
  ctx.fillStyle = mixHex(body, dark, 0.15);
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(-46, 2);
  ctx.lineTo(-40, 10);
  ctx.lineTo(10, 14);
  ctx.fill();
  ctx.restore();
  if (jaw > 0.1) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgrad(ctx, -34, 10, 34, rgba(P.glow, 0.8), rgba(P.glow, 0));
    ctx.beginPath();
    ctx.arc(-34, 10, 34 * jaw, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  // crânio + focinho comprido
  ctx.fillStyle = vgrad(ctx, -24, 14, mixHex(body, '#ffffff', 0.3), body);
  ctx.beginPath();
  ctx.moveTo(30, -6);
  ctx.quadraticCurveTo(20, -28, -6, -24);
  ctx.quadraticCurveTo(-30, -18, -60, 2);
  ctx.quadraticCurveTo(-62, 8, -54, 9);
  ctx.lineTo(-10, 10);
  ctx.quadraticCurveTo(20, 22, 34, 12);
  ctx.closePath();
  ctx.fill();
  // tufos da bochecha (balançam)
  const tuft = Math.sin(t * 2.4) * 2 + c.adv * 4;
  ctx.fillStyle = mixHex(body, '#ffffff', 0.5);
  ctx.beginPath();
  ctx.moveTo(14, 2);
  ctx.lineTo(32 + tuft, 24);
  ctx.lineTo(18, 16);
  ctx.lineTo(18 + tuft, 32);
  ctx.lineTo(4, 12);
  ctx.fill();
  // nariz
  ctx.fillStyle = '#1a0a0a';
  ctx.beginPath();
  ctx.arc(-58, 3, 3.5, 0, TAU);
  ctx.fill();
  // marcas e olho
  ctx.strokeStyle = hurtTint(ctx, st, P.accent);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-26, -8);
  ctx.quadraticCurveTo(-10, -18, 8, -12);
  ctx.moveTo(-2, -26);
  ctx.lineTo(-6, -14);
  ctx.stroke();
  const blink = frac(t / 4.1) < 0.035 || c.hurt > 0.5 ? 0.12 : 1;
  eyeGlow(ctx, -14, -8, 5 + st.rage * 1.5 + raise * 1.5, P.eye, st.anim === 'death' ? 1 - die : blink);
  const mouth = c.map(-48, 8);
  const muzzle = c.map(-90, 0);
  ctx.restore();

  const core = c.map(0, -160);
  const pawPt = c.map(paw.x, paw.y);
  let tipC = { x: 0, y: 0 };
  for (const q of tips) tipC = { x: tipC.x + q.x / tips.length, y: tipC.y + q.y / tips.length };
  const tipPt = c.map(tipC.x, tipC.y);
  const topY = Math.min(c.map(hx, hy - 60).y, ...tips.map((q) => c.map(q.x, q.y - 30).y));
  ctx.restore();
  wisp(true);
  // fogo de raposa juntando na frente do focinho no cast
  if (!c.ghost && c.cast + c.slam > 0) {
    const k = clamp(raise + Math.max(0, thrust));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    orb(ctx, muzzle.x, muzzle.y, 20 + k * 26 + c.imp * 24, fire, k);
    ctx.restore();
  }
  const hand = c.swipe ? tipPt : c.cast + c.slam ? muzzle : pawPt;
  return { mouth, hand, core, top: topY, halfW: 130 };
}

/** Perna de raposa em dois segmentos; devolve a posição da pata (coordenadas atuais). */
function foxLeg(ctx: CanvasRenderingContext2D, x: number, y: number, a1: number, a2: number, l1: number, l2: number, w: number, col: string, paw: string): V {
  const kx = x - Math.sin(a1) * l1;
  const ky = y + Math.cos(a1) * l1;
  const a = a1 + a2;
  const px = kx - Math.sin(a) * l2;
  const py = ky + Math.cos(a) * l2;
  ctx.save();
  ctx.strokeStyle = col;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(kx, ky);
  ctx.stroke();
  ctx.lineWidth = w * 0.7;
  ctx.beginPath();
  ctx.moveTo(kx, ky);
  ctx.lineTo(px, py);
  ctx.stroke();
  // pata escura (meia) + almofada
  ctx.strokeStyle = paw;
  ctx.lineWidth = w * 0.72;
  ctx.beginPath();
  ctx.moveTo(kx + (px - kx) * 0.6, ky + (py - ky) * 0.6);
  ctx.lineTo(px, py);
  ctx.stroke();
  ctx.fillStyle = paw;
  ctx.beginPath();
  ctx.ellipse(px - 4, py + 2, w * 0.6, w * 0.32, a * 0.6, 0, TAU);
  ctx.fill();
  ctx.restore();
  return { x: px, y: py };
}

// ------------------------------------------------------------------ 3: guardião das almas

function guardian(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState, c: C): Anchors {
  const { P, body, dark, t, die, p } = c;
  const light = P.glow;
  const on = (k: number, ks: readonly Key[]) => (k ? K(p, ks) : 0);
  // --- trilhas das poses
  // shoot (luz da lanterna): puxa a lanterna para o peito (−) → estende o braço (+) com recuo do corpo
  const aim = on(c.breath, [[0, 0], [0.38, -1], [0.46, -0.9], [0.53, 1], [0.8, 0.9], [1, 0]]);
  const recoil = on(c.breath, [[0, 0], [0.5, 0], [0.56, 1], [0.7, 0.5], [1, 0]]);
  // cast: ergue a lanterna acima da cabeça (raise) → oferece para a frente (offer)
  const raise = on(c.cast + c.swipe, [[0, 0], [0.38, 1], [0.48, 0.9], [0.56, 0.3], [0.8, 0.15], [1, 0]]);
  const offer = on(c.cast + c.swipe, [[0, 0], [0.42, 0], [0.54, 1], [0.8, 0.7], [1, 0]]);
  // slam: remo sobe atrás da cabeça e desce na frente (ângulo do remo)
  const oarK = (q: number) => K(q, [[0, 0], [0.36, -2.75], [0.44, -2.85], [0.54, 1.0], [0.62, 1.1], [0.82, 0.6], [1, 0]]);
  const oar = c.slam ? oarK(p) : 0;
  const lift = on(c.slam, [[0, 0], [0.38, 1], [0.46, 1], [0.54, -0.6], [0.66, -0.6], [1, 0]]);
  const hunch = on(c.roar + c.charge, [[0, 0], [0.36, 1], [0.47, -1], [0.8, -0.8], [1, 0]]);
  const after = c.atk > 0 && p > 0.52 ? Math.exp(-(p - 0.52) * 7) * Math.sin((p - 0.52) * 24) : 0;
  const d1 = sm(0, 0.25, die) * (1 - sm(0.3, 0.6, die));
  const d2 = sm(0.25, 0.95, die);

  const surge = Math.sin(c.g * TAU) * c.mv;
  const fy = -12 - Math.sin(t * 0.9) * 7 + c.bobY - lift * 30 + Math.max(0, -lift) * -10 + hunch * 12 - Math.max(0, -hunch) * 14 - raise * 12 - surge * 7;
  const fx = c.lunge + c.knock + recoil * 26 + Math.max(0, -aim) * 8 - offer * 10 + lift * 16 - Math.max(0, -lift) * 30 - surge * 6 * c.gd;
  const lean = -c.adv * 0.11 + recoil * 0.1 - Math.max(0, aim) * 0.06 + lift * 0.1 - Math.max(0, -lift) * 0.3 - hunch * 0.08 + Math.max(0, -hunch) * 0.06
    + c.hurt * 0.12 + Math.sin(t * 0.7) * 0.025 - surge * 0.04 * c.gd + d1 * 0.12 - d2 * 0.15 - offer * 0.06;
  const wx = 0.4 + Math.max(c.adv, -0.5) * 1.6 + recoil * 1.2 - c.hurt * 1.4 + Math.max(0, -lift) * 1.4 + after * 0.8 + Math.max(0, -hunch) * 0.6;
  const wy = 0.7 - Math.max(0, -hunch) * 1.2 + d2 * 0.3;
  const W = wind(wx, wy);

  if (!c.ghost) {
    mist(ctx, fx * 0.6, -14, 300, '#9a9aff', t, 0.8 - die * 0.5, c.adv);
    wake(ctx, fx + 40, -160 + fy * 0.3, c.gd, 260, 90, '#9a9aff', c.mv * 0.5, (st.gait ?? 0) * 0.8, 5);
  }

  ctx.save();
  ctx.translate(fx, fy);
  ctx.scale(1 + d2 * 0.15, 1 - d2 * 0.55);
  ctx.translate(0, -180);
  ctx.rotate(lean);
  ctx.translate(0, 180);
  ctx.globalAlpha *= 0.93 + Math.sin(t * 1.9) * 0.05;

  // remo na mão de trás (no slam passa por cima da cabeça e bate na frente)
  const handB = {
    x: 70 + Math.max(0, -hunch) * 40 - raise * 10 + K(p, [[0, 0], [0.36, -40], [0.46, -46], [0.54, -110], [0.66, -112], [1, 0]]) * c.slam + c.hurt * -8,
    y: -200 + Math.sin(t * 1.1) * 4 - raise * 40 - Math.max(0, -hunch) * 50 + K(p, [[0, 0], [0.36, -120], [0.46, -126], [0.54, 30], [0.66, 34], [1, 0]]) * c.slam + d1 * -40,
  };
  const oA = 0.12 + Math.sin(t * 0.9 + 1) * 0.04 + oar + c.adv * -0.1 + d1 * 0.3 + d2 * 0.9;
  // remo (função: atrás do manto no repouso, na frente durante o slam)
  let blade = c.map(0, 0);
  const drawOar = () => {
    // rastro do remo no golpe
    if (c.slam && !c.ghost) {
      const a0 = oarK(Math.max(0, p - 0.08)) + 0.12 + Math.PI / 2;
      const a1 = oar + 0.12 + Math.PI / 2;
      const k = clamp(Math.abs(a1 - a0) / 1.4) * c.atk;
      if (k > 0.05) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = rgrad(ctx, handB.x, handB.y, 205, rgba(light, 0), rgba('#ffffff', 0.45 * k));
        ctx.beginPath();
        ctx.arc(handB.x, handB.y, 205, Math.min(a0, a1), Math.max(a0, a1));
        ctx.arc(handB.x, handB.y, 172, Math.max(a0, a1), Math.min(a0, a1), true);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.save();
    ctx.translate(handB.x, handB.y);
    ctx.rotate(oA);
    ctx.strokeStyle = hurtTint(ctx, st, '#3a2a1a');
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 190);
    ctx.lineTo(0, -150);
    ctx.stroke();
    ctx.fillStyle = hurtTint(ctx, st, '#3a2a1a');
    ctx.beginPath();
    ctx.ellipse(0, 170, 14, 34, 0, 0, TAU);
    ctx.fill();
    // runas que brilham no remo durante o slam
    if (c.slam) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(light, 0.5 + c.imp * 0.5);
      for (let i = 0; i < 3; i++) ctx.fillRect(-2, 150 + i * 14, 4, 8);
      ctx.restore();
    }
    blade = c.map(0, 190);
    ctx.restore();

  };
  if (!c.slam) drawOar();
  // farrapos do manto (atrás) + véu de fumaça
  const rag = (front: boolean) => {
    for (let i = front ? 1 : 0; i < 11; i += 2) {
      const k = i / 10;
      const rx = -120 + k * 250;
      const ry = -60 - k * 18;
      const tw = wind(wx * 1.25 + k * 0.5, wy + 0.3);
      const len = 6 + Math.round(h01(i, 21) * 5);
      const pts = soft(fk(rx, ry, Math.PI / 2 - 0.2 + k * 0.5, len, 12 + k * 4, 0.04, 0.18, t * 2.2 + i * 1.6 + c.g * TAU * c.gd * 1.5, tw.a, tw.f * 0.8), 2);
      const e = pts[pts.length - 1];
      const g = ctx.createLinearGradient(pts[0].x, pts[0].y, e.x, e.y);
      g.addColorStop(0, mixHex(body, dark, 0.3));
      g.addColorStop(1, rgba('#9a9aff', 0));
      const w = 24 + h01(i, 6) * 14;
      tube(ctx, pts, (q) => w * Math.sin(Math.min(1, q * 2) * Math.PI / 2) * (1 - q * 0.92) + 1, g);
    }
  };
  if (!c.ghost) {
    const tw = wind(wx * 1.5 + 0.5, wy + 0.1);
    const pts = soft(fk(20, -180, Math.PI / 2 - 0.4, 11, 22 + c.mv * 6, 0.03, 0.1, t * 1.6 + c.g * TAU * c.gd, tw.a, tw.f * 0.6), 2);
    const e = pts[pts.length - 1];
    const g = ctx.createLinearGradient(pts[0].x, pts[0].y, e.x, e.y);
    g.addColorStop(0, rgba(body, 0.5));
    g.addColorStop(1, rgba('#9a9aff', 0));
    tube(ctx, pts, (q) => 190 * Math.sin(Math.min(1, q * 2.5) * Math.PI / 2) * (1 - q * 0.85) + 4, g);
  }
  rag(false);

  // manto imenso, curvado para frente
  const flowX = (k: number, ph: number) => Math.cos(W.a) * 60 * W.f * 2.2 * k * k + Math.sin(t * 1.8 - k * 3 + ph) * 6 * k * (1 + c.mv);
  const flare = 1 + Math.max(0, -hunch) * 0.3 + lift * 0.05 + d2 * 0.3;
  const Lp: V[] = [];
  const Rp: V[] = [];
  for (let i = 0; i <= 6; i++) {
    const k = i / 6;
    const y = -320 + k * 266;
    Lp.push({ x: -60 - (20 + Math.sin(k * 2.1) * 60) * flare + flowX(k, 0), y: y + k * 6 });
    Rp.push({ x: 40 + (30 + Math.sin(k * 2.1) * 70) * flare + flowX(k, 1.1), y: y - k * 14 });
  }
  ctx.fillStyle = vgrad(ctx, -350, -40, mixHex(body, '#5a5a7a', 0.25), mixHex(dark, '#9a9aff', 0.08));
  ctx.beginPath();
  ctx.moveTo(-40, -340);
  ctx.quadraticCurveTo(-96, -336, Lp[0].x, Lp[0].y);
  for (const q of Lp) ctx.lineTo(q.x, q.y);
  for (let i = 1; i < 12; i++) {
    const k = i / 12;
    const deep = (i % 2 ? 16 : -2) * (0.6 + h01(i, 9) * 0.7) + Math.sin(t * 2.6 + i * 1.7) * 5;
    ctx.lineTo(Lp[6].x + (Rp[6].x - Lp[6].x) * k, Lp[6].y + (Rp[6].y - Lp[6].y) * k + deep);
  }
  for (let i = 6; i >= 0; i--) ctx.lineTo(Rp[i].x, Rp[i].y);
  ctx.quadraticCurveTo(80, -350, -40, -340);
  ctx.closePath();
  ctx.fill();
  // sombra lateral + dobras
  ctx.fillStyle = vgrad(ctx, -320, -60, rgba(dark, 0), rgba(dark, 0.5));
  ctx.beginPath();
  ctx.moveTo(30, -310);
  for (let i = 1; i <= 6; i++) ctx.lineTo(Rp[i].x - 36 + i * 2, Rp[i].y + 6);
  for (let i = 6; i >= 1; i--) ctx.lineTo(Rp[i].x, Rp[i].y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    const k = (i + 0.5) / 6;
    const x1 = Lp[6].x + (Rp[6].x - Lp[6].x) * k;
    ctx.beginPath();
    ctx.moveTo(-70 + i * 26, -250);
    ctx.quadraticCurveTo(-80 + i * 32 + Math.sin(t + i) * 6, -150, x1, -64 - k * 12);
    ctx.stroke();
  }
  rag(true);
  // correntes cruzando o manto (balançam com atraso)
  const sw = Math.sin(t * 1.3) * 4 + c.adv * 10 + after * 14;
  chain(ctx, { x: -90, y: -250 }, { x: 110 + sw, y: -110 }, 40 + c.imp * 16, hurtTint(ctx, st, '#7a7a8a'), t);
  chain(ctx, { x: 90, y: -260 }, { x: -100 + sw, y: -100 }, 34 + c.imp * 16, hurtTint(ctx, st, '#6a6a7a'), t + 1);

  // capuz enorme (a cabeça estabiliza)
  const hx = -56 - Math.max(0, aim) * 14 - hunch * 14 + c.hurt * 12 - Math.max(0, -lift) * 18 + lift * 6;
  const hy = -290 + hunch * 16 - Math.max(0, -hunch) * 10 + Math.sin(t * 0.9 + 0.6) * 2 + Math.max(0, -lift) * 14;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(-lean * 0.4 - hunch * 0.25 + Math.max(0, -hunch) * 0.12 + c.hurt * 0.25 + lift * 0.1 - Math.max(0, -lift) * 0.15 + Math.sin(t * 0.6) * 0.04 + d1 * 0.3 - d2 * 0.3);
  ctx.fillStyle = vgrad(ctx, -60, 50, mixHex(body, '#6a6a8a', 0.3), body);
  ctx.beginPath();
  ctx.moveTo(60, -20);
  ctx.quadraticCurveTo(40, -70, -4, -66);
  ctx.quadraticCurveTo(-58, -60, -64, 4);
  ctx.quadraticCurveTo(-62, 44, -40, 60);
  ctx.lineTo(56, 50);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgba('#9a9aff', 0.2);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-4, -64);
  ctx.quadraticCurveTo(-56, -58, -62, 4);
  ctx.stroke();
  ctx.fillStyle = '#020206';
  ctx.beginPath();
  ctx.ellipse(-28, 10, 26, 38, 0.15, 0, TAU);
  ctx.fill();
  // a luz da lanterna ilumina o fundo do capuz
  const lamp = clamp(0.55 + Math.max(0, aim) * 0.5 + raise * 0.4 + st.rage * 0.3 - Math.max(0, -aim) * 0.25 - die * 0.8);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgrad(ctx, -34, 30, 34, rgba(light, 0.18 * lamp), rgba(light, 0));
  ctx.beginPath();
  ctx.arc(-34, 30, 34, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  const blink = frac(t / 5.3) < 0.03 ? 0.15 : 1;
  const eo = (st.anim === 'death' ? 1 - die : 1) * blink;
  eyeGlow(ctx, -38, 2, 3.5 + st.rage * 2 + Math.max(0, aim) * 1.5, P.eye, eo);
  eyeGlow(ctx, -18, 4, 3.5 + st.rage * 2 + Math.max(0, aim) * 1.5, P.eye, eo);
  ctx.restore();

  if (c.slam) {
    drawOar();
    // manga de trás segurando o remo
    arm(ctx, { x: 40, y: -262 }, handB, -14, 34, 20, mixHex(body, '#4a4a6a', 0.1));
    ctx.fillStyle = hurtTint(ctx, st, '#b8b0a0');
    ctx.beginPath();
    ctx.arc(handB.x, handB.y, 10, 0, TAU);
    ctx.fill();
  }
  // braço da frente segurando a lanterna
  const handF = {
    x: -120 + Math.max(0, -aim) * 60 + Math.max(0, aim) * -80 + raise * 30 + offer * -40 + lift * 20 - Math.max(0, -lift) * 30 + Math.max(0, -hunch) * -30 + hunch * 30
      + Math.max(0, c.adv) * 18 + c.hurt * 20 + d1 * 20,
    y: -200 + Math.sin(t * 1.2) * 5 + Math.max(0, -aim) * -10 + Math.max(0, aim) * -50 - raise * 150 + offer * 40 + lift * -20 + Math.max(0, -lift) * 40
      + Math.max(0, -hunch) * -50 + hunch * 20 + d1 * -40 + d2 * 80,
  };
  arm(ctx, { x: -60, y: -250 + hunch * 8 }, handF, 16, 40, 22, mixHex(body, '#4a4a6a', 0.2));
  ctx.fillStyle = hurtTint(ctx, st, '#b8b0a0');
  ctx.beginPath();
  ctx.arc(handF.x, handF.y, 10, 0, TAU);
  ctx.fill();
  // corrente pendurada no pulso (atraso)
  chain(ctx, handF, { x: handF.x + 30 + c.adv * 24 + recoil * 20, y: handF.y + 90 + Math.sin(t * 1.5) * 6 }, 30, hurtTint(ctx, st, '#7a7a8a'), t);

  // lanterna: pêndulo que atrasa em relação ao movimento da mão
  const swing = Math.sin(t * 1.6) * 0.12 + c.adv * 0.35 + recoil * 0.5 - Math.max(0, aim) * 0.2 + after * 0.3 - c.hurt * 0.4 + Math.max(0, -lift) * 0.4 - offer * 0.3 + d1 * 0.8;
  const lanternGone = sm(0.35, 0.6, die);
  ctx.save();
  ctx.translate(handF.x, handF.y);
  // na morte a lanterna cai da mão
  ctx.translate(-lanternGone * 20, lanternGone * 120);
  ctx.rotate(swing + lanternGone * 1.2);
  ctx.strokeStyle = '#8a8a9a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 22);
  ctx.stroke();
  const L = { x: 0, y: 58 };
  const bright = clamp(lamp + c.imp * 0.5 * (c.breath + c.cast));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const halo = 110 + bright * 60 + Math.sin(t * 5) * 6;
  ctx.fillStyle = rgrad(ctx, L.x, L.y, halo, rgba(light, 0.35 * bright), rgba(light, 0));
  ctx.beginPath();
  ctx.arc(L.x, L.y, halo, 0, TAU);
  ctx.fill();
  ctx.restore();
  // vidro brilhante (tremeluz)
  const flick = 0.85 + Math.sin(t * 9) * 0.08 + Math.sin(t * 13.7) * 0.07;
  ctx.fillStyle = rgrad(ctx, L.x, L.y, 30, mixHex(light, '#ffffff', 0.6 * bright * flick), rgba(P.accent, 0.4 + bright * 0.4));
  ctx.beginPath();
  ctx.moveTo(-18, 28);
  ctx.lineTo(18, 28);
  ctx.lineTo(24, 60);
  ctx.lineTo(16, 88);
  ctx.lineTo(-16, 88);
  ctx.lineTo(-24, 60);
  ctx.closePath();
  ctx.fill();
  // almas girando dentro (aceleram no cast)
  const spin = t * (2.2 + raise * 4 + Math.max(0, aim) * 3);
  for (let i = 0; i < 4; i++) {
    const a = spin + (i / 4) * TAU;
    const x = Math.cos(a) * 11;
    const y = L.y + Math.sin(a * 1.3) * 16;
    ctx.fillStyle = rgba('#9a9aff', 0.85);
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1a1a3a';
    ctx.fillRect(x - 2.5, y - 1.5, 1.6, 1.6);
    ctx.fillRect(x + 0.9, y - 1.5, 1.6, 1.6);
  }
  // armação de ferro
  ctx.strokeStyle = hurtTint(ctx, st, '#2a2a30');
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-18, 28);
  ctx.lineTo(18, 28);
  ctx.lineTo(24, 60);
  ctx.lineTo(16, 88);
  ctx.lineTo(-16, 88);
  ctx.lineTo(-24, 60);
  ctx.closePath();
  ctx.moveTo(0, 28);
  ctx.lineTo(0, 88);
  ctx.moveTo(-24, 60);
  ctx.lineTo(24, 60);
  ctx.stroke();
  ctx.fillStyle = hurtTint(ctx, st, '#2a2a30');
  ctx.beginPath();
  ctx.moveTo(-22, 28);
  ctx.lineTo(0, 14);
  ctx.lineTo(22, 28);
  ctx.fill();
  ctx.fillRect(-18, 88, 36, 6);
  const lantern = c.map(L.x, L.y);
  ctx.restore();

  const core = c.map(0, -190);
  const topY = c.map(hx, hy - 68).y;
  ctx.restore();
  // almas perdidas flutuando em volta (na morte, fogem para cima)
  if (!c.ghost) {
    const n = die > 0.3 ? 9 : 5;
    for (let i = 0; i < n; i++) {
      const k = (t * (0.08 + die * 0.3) + h01(i, 9)) % 1;
      const x = fx - 160 + h01(i, 2) * 330 + Math.sin(t + i) * 12 + c.adv * k * 60;
      const y = -40 - k * 300;
      ghostWisp(ctx, x, y, 8 + h01(i, 5) * 5, '#9a9aff', Math.sin(k * Math.PI) * (0.6 * (1 - die) + sm(0.3, 0.5, die) * (1 - sm(0.9, 1, die))), t + i);
    }
  }
  return { mouth: lantern, hand: c.slam ? blade : { x: lantern.x, y: lantern.y + 20 }, core, top: topY, halfW: 135 };
}

/** Corrente de elos (catenária). */
function chain(ctx: CanvasRenderingContext2D, a: V, b: V, sag: number, color: string, t: number) {
  const n = Math.max(4, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 12));
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n;
    const x = a.x + (b.x - a.x) * k;
    const y = a.y + (b.y - a.y) * k + Math.sin(k * Math.PI) * (sag + Math.sin(t * 1.3) * 4);
    const ang = Math.atan2(b.y - a.y + Math.cos(k * Math.PI) * sag * 3, b.x - a.x);
    ctx.beginPath();
    ctx.ellipse(x, y, 7, i % 2 ? 2 : 4, ang, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

/** Alminha (fantasminha com cauda). */
function ghostWisp(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number, t: number) {
  if (alpha <= 0.02) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgrad(ctx, x, y, r * 2.2, rgba(color, 0.8), rgba(color, 0));
  ctx.beginPath();
  ctx.moveTo(x - r, y);
  ctx.arc(x, y, r, Math.PI, 0);
  ctx.quadraticCurveTo(x + r, y + r * 2, x + Math.sin(t * 3) * r, y + r * 3);
  ctx.quadraticCurveTo(x - r, y + r * 2, x - r, y);
  ctx.fill();
  ctx.restore();
}
