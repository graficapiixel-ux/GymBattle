/**
 * ELEMENTAIS (feat.kind): 0 = Ignar, gigante de chamas que anda (feat.flames);
 * 1 = Hailstrom, espírito da nevasca flutuante com núcleo-floco de gelo;
 * 2 = Volturion, silhueta humana de eletricidade (feat.arcs);
 * 3 = Zahrim, gigante de areia com tronco de tornado e pedras orbitando.
 * Origem no chão, olhando para a esquerda; ~340 de altura em escala 1.
 */
import type { BossSpec } from '@gymbattle/shared';
import type { Anchors, DrawState, V } from '../types';
import {
  attacking, breathe, dying, eyeGlow, h01, hurtTint, mixHex, poseK, rgrad, strike, vgrad, windup,
  TAU, clamp, sm, orb, lightning, hexA, bez, tube, sparks,
} from '../util';

interface Rig { pivot: V; chest: V; head: V; shF: V; shB: V; l1: number; l2: number }
interface Arm { sh: V; el: V; hd: V; ang: number }
interface Pal { body: string; dark: string; accent: string; glow: string; eye: string; light: string }

/** Esqueleto base de cada tipo. */
const RIGS: Rig[] = [
  { pivot: { x: 0, y: -120 }, chest: { x: 0, y: -215 }, head: { x: -18, y: -290 }, shF: { x: -74, y: -238 }, shB: { x: 62, y: -244 }, l1: 82, l2: 78 },
  { pivot: { x: 0, y: -160 }, chest: { x: 0, y: -205 }, head: { x: -16, y: -282 }, shF: { x: -78, y: -232 }, shB: { x: 68, y: -238 }, l1: 76, l2: 74 },
  { pivot: { x: 0, y: -130 }, chest: { x: -5, y: -222 }, head: { x: -14, y: -300 }, shF: { x: -62, y: -255 }, shB: { x: 52, y: -258 }, l1: 74, l2: 74 },
  { pivot: { x: 0, y: -90 }, chest: { x: 0, y: -222 }, head: { x: -28, y: -296 }, shF: { x: -108, y: -244 }, shB: { x: 98, y: -250 }, l1: 86, l2: 78 },
];

const L = (a: number, b: number, k: number) => a + (b - a) * k;
const armPts = (sh: V, a: number, b: number, l1: number, l2: number): Arm => {
  const el = { x: sh.x - Math.sin(a) * l1, y: sh.y + Math.cos(a) * l1 };
  const hd = { x: el.x - Math.sin(a + b) * l2, y: el.y + Math.cos(a + b) * l2 };
  return { sh, el, hd, ang: a + b };
};

/** Contexto comum passado aos desenhos de cada tipo. */
interface Ctx {
  s: BossSpec; st: DrawState; C: Pal; R: Rig; F: Arm; B: Arm; head: V; chest: V;
  t: number; die: number; heat: number; mouthK: number; castK: number; wu: number; sk: number; b: number;
  /** Fase da flutuação: corre com o tempo E com o deslocamento (gait). */
  ph: number;
  /** Arrasto das partes soltas: > 0 = ficam para a DIREITA (o boss avança para a esquerda). */
  lag: number;
  /** 0..1: rapidez do deslocamento. */
  mv: number;
  /** Pico curto do impacto do golpe (p≈0,55). */
  imp: number;
  /** Pulso do coração do núcleo (0..1, batida dupla). */
  beat: number;
  /** Semente estável do boss (hash do id). */
  seed: number;
}

const frac = (x: number) => x - Math.floor(x);
const hashId = (id: string) => {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 9973;
  return h;
};

export function drawElemental(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState): Anchors {
  const kind = clamp(Math.round(s.feat.kind ?? 0), 0, 3);
  const R = RIGS[kind];
  const C: Pal = {
    body: hurtTint(ctx, st, s.pal.body),
    dark: hurtTint(ctx, st, s.pal.dark),
    accent: hurtTint(ctx, st, s.pal.accent),
    glow: hurtTint(ctx, st, s.pal.glow),
    eye: s.pal.eye,
    light: hurtTint(ctx, st, mixHex(s.pal.body, '#ffffff', 0.45)),
  };
  const b = breathe(st, 1.3);
  const wu = windup(st);
  const sk = strike(st);
  const die = dying(st);
  const hold = clamp(wu + sk);
  const slam = poseK(st, 'slam');
  const swipe = poseK(st, 'swipe');
  const cast = poseK(st, 'cast');
  const shoot = poseK(st, 'breath', 'shoot');
  const charge = poseK(st, 'charge');
  const roar = poseK(st, 'roar');
  const imp = st.anim === 'attack' ? sm(0.5, 0.56, st.p) * (1 - sm(0.58, 0.82, st.p)) : 0;
  const heat = clamp(0.45 + st.rage * 0.35 + attacking(st) * 0.4 + imp * 0.4) * (1 - die * 0.8);
  const hu = st.hurt;

  // ---------------- locomoção de voador: flutua, inclina com vx, partes soltas ficam para trás
  const mv = clamp(st.move);
  const vxn = clamp(st.vx / 150, -1, 1);
  const vyn = clamp(st.vy / 160, -1, 1);
  const lag = -vxn * (1 - die);
  const ph = st.t * 1.5 + st.gait * TAU;
  const beatT = frac(st.t * (0.9 + st.rage * 0.7 + attacking(st) * 0.5));
  const beat = Math.exp(-Math.pow((beatT - 0.1) / 0.05, 2)) + 0.6 * Math.exp(-Math.pow((beatT - 0.28) / 0.05, 2));
  const hover = (Math.sin(ph) * (7 + mv * 5) + Math.sin(st.t * 0.61 + 1.3) * 4) * (1 - die) * (1 - hold * 0.6);
  // morte: cambaleia (tremor que perde força) e depois desmorona
  const stagger = Math.sin(die * 26) * 0.07 * sm(0, 0.15, die) * (1 - sm(0.3, 0.6, die));

  const jit = kind === 2 ? (h01(Math.floor(st.t * 16), 3) - 0.5) * 4 * (1 - die) : 0;
  const bodyX = charge * (wu * 40 - sk * 90) + slam * (wu * 22 - sk * 46) + swipe * (wu * 26 - sk * 36)
    + shoot * (wu * 18 + sk * 16 - imp * 6) + roar * wu * 12 + jit + hu * 18 + lag * 6;
  const crouch = slam * (wu * -36 + sk * 44) + swipe * sk * 10 - roar * wu * 10 + roar * imp * 6 - cast * hold * 18
    - shoot * wu * 8 + b * 2 + hover + vyn * 4 + hu * 4
    + die * (kind === 1 ? 60 : kind === 2 ? 40 : 10);
  const lean = charge * (wu * 0.14 - sk * 0.26) + slam * (wu * 0.16 - sk * 0.24) + swipe * (wu * 0.16 - sk * 0.18)
    + shoot * (wu * 0.1 - sk * 0.1) + roar * (wu * 0.1 - sk * 0.04) + cast * hold * 0.04
    + vxn * 0.15 + Math.sin(ph + 1.1) * 0.02 + hu * 0.12 + stagger + (kind === 2 ? -die * 0.2 : 0) + (kind === 0 ? die * 0.12 : 0);
  const puff = 1 + roar * (wu * 0.04 + sk * 0.1 + imp * 0.05) + b * 0.01 + beat * 0.006;
  // morte: cada elemento desmorona de um jeito (achatando sobre o chão); squash no impacto
  const sq = (slam + charge * 0.6) * imp;
  const dsx = (kind === 3 ? 1 + die * 0.35 : kind === 0 ? 1 - die * 0.2 : 1) * (1 + sq * 0.07);
  const dsy = (kind === 3 ? 1 - die * 0.6 : kind === 0 ? 1 - die * 0.55 : kind === 2 ? 1 - die * 0.45 : 1) * (1 - sq * 0.08);

  const pv = R.pivot;
  const T = (p: V): V => {
    const dx = (p.x - pv.x) * puff, dy = (p.y - pv.y) * puff;
    const c = Math.cos(lean), sn = Math.sin(lean);
    const x = pv.x + dx * c - dy * sn, y = pv.y + dx * sn + dy * c;
    return { x: x * dsx + bodyX, y: y * dsy + crouch };
  };

  // ---------------- ângulos dos braços (0 = pendurado, +π/2 = para a esquerda, π = para cima)
  // nado lento no ar: ombro conduz, antebraço vem atrasado (sobreposição); ao avançar, ficam para trás
  const swim = (0.09 + mv * 0.1) * (1 - die);
  let aF = 0.32 + Math.sin(ph + 0.4) * swim - lag * 0.3;
  let bF = 0.4 + Math.sin(ph - 0.5) * swim * 0.9 - lag * 0.15;
  let aB = -0.18 + Math.sin(ph + 2.0) * swim - lag * 0.3;
  let bB = 0.35 + Math.sin(ph + 1.1) * swim * 0.9 - lag * 0.15;
  if (slam) {
    aF = L(L(aF, 2.8, wu), 0.62 - imp * 0.15, sk); bF = L(L(bF, -0.85, wu), 0.05, sk);
    aB = L(L(aB, 2.55, wu), 0.4 - imp * 0.12, sk); bB = L(L(bB, -0.75, wu), 0.1, sk);
  }
  if (cast) {
    aF = L(L(aF, 2.35, wu), 2.65, sk); bF = L(L(bF, 0.5, wu), 0.15, sk);
    aB = L(L(aB, -2.25, wu), -2.6, sk); bB = L(L(bB, -0.5, wu), -0.15, sk);
  }
  if (swipe) {
    aF = L(L(aF, -1.05, wu), 1.9 + imp * 0.2, sk); bF = L(L(bF, 0.6, wu), -0.05, sk);
    aB = L(L(aB, 0.55, wu), -0.7, sk);
  }
  if (shoot) {
    aF = L(L(aF, 0.45, wu), 1.5, sk); bF = L(L(bF, 1.0, wu), 0.02, sk);
    aB = L(aB, -0.55, hold);
  }
  if (roar) {
    aF = L(L(aF, 0.9, wu), 2.2, sk); bF = L(L(bF, 1.0, wu), -0.3, sk);
    aB = L(L(aB, -0.9, wu), -2.2, sk); bB = L(L(bB, -1.0, wu), 0.3, sk);
  }
  if (charge) {
    aF = L(L(aF, 0.1, wu), 1.65, sk); bF = L(bF, 0.15, hold);
    aB = L(L(aB, -1.0, wu), -1.2, sk);
  }
  // dano: braços jogados para trás; morte: caem moles
  aF -= hu * 0.4; aB -= hu * 0.3;
  aF = L(aF, 0.05 + Math.sin(die * 9) * 0.1 * (1 - die), sm(0, 0.6, die)); aB = L(aB, -0.05, sm(0, 0.6, die));
  const F = armPts(R.shF, aF, bF, R.l1, R.l2);
  const B = armPts(R.shB, aB, bB, R.l1 * 0.95, R.l2 * 0.95);

  // cabeça: atrasada em relação ao corpo; recua e avança (sopro/tiro), sobe (grito)
  const head: V = {
    x: R.head.x + shoot * (wu * 22 - sk * 32) + roar * (wu * 10 - imp * 6) + slam * (wu * 6 - sk * 10)
      + Math.sin(ph - 0.7) * 2 + lag * 4 + hu * 10 - die * 10,
    y: R.head.y - roar * (wu * 6 + sk * 16) + roar * wu * 10 + shoot * (-wu * 10 + sk * 6) + b * 2
      + Math.sin(ph - 0.7) * 3 + die * 18 + slam * sk * 8,
  };
  const mouthK = clamp(shoot * clamp(wu * 0.6 + sk) + roar * sk);
  const castK = clamp(cast * hold + slam * wu * 0.5);

  // rastro deixado para trás ao se deslocar (desenhado antes do corpo, sem rotação)
  if (mv > 0.05 && die < 0.5) wake(ctx, kind, C, st.t, st.gait, lag * mv, bodyX, crouch);

  ctx.save();
  ctx.translate(bodyX, crouch);
  ctx.scale(dsx, dsy);
  ctx.translate(pv.x, pv.y);
  ctx.rotate(lean);
  ctx.scale(puff, puff);
  ctx.translate(-pv.x, -pv.y);
  const c: Ctx = { s, st, C, R, F, B, head, chest: R.chest, t: st.t, die, heat, mouthK, castK, wu, sk, b, ph, lag, mv, imp, beat, seed: hashId(s.id) };
  if (kind === 0) drawIgnar(ctx, c);
  else if (kind === 1) drawHail(ctx, c);
  else if (kind === 2) drawVolt(ctx, c);
  else drawZahrim(ctx, c);
  // rastro do golpe (smear) acompanhando o arco do punho
  const smK = (swipe + slam) * sm(0.4, 0.48, st.p) * (1 - sm(0.56, 0.7, st.p));
  if (smK > 0.02) smear(ctx, F, swipe ? -1 : 1, smK, kind === 0 ? C.accent : kind === 1 ? '#ffffff' : kind === 2 ? C.accent : C.light, kind !== 3);
  ctx.restore();

  const hT = T(head);
  return {
    mouth: T({ x: head.x - 30, y: head.y + 8 }),
    hand: T(F.hd),
    core: T(R.chest),
    top: Math.min(hT.y - 50, T(F.hd).y - 20),
    halfW: kind === 3 ? 150 : 120,
  };
}

/** Arco de rastro (smear) atrás do punho durante o golpe. dir = +1: o punho veio de cima (slam); −1: veio de trás/baixo (swipe). */
function smear(ctx: CanvasRenderingContext2D, A: Arm, dir: number, k: number, color: string, add: boolean) {
  const R = Math.hypot(A.hd.x - A.sh.x, A.hd.y - A.sh.y);
  const ph = Math.atan2(A.hd.y - A.sh.y, A.hd.x - A.sh.x);
  ctx.save();
  if (add) ctx.globalCompositeOperation = 'lighter';
  for (const [span, w, al] of [[1.3, 34, 0.25], [0.7, 22, 0.45]] as const) {
    const a0 = dir > 0 ? ph : ph - span, a1 = dir > 0 ? ph + span : ph;
    ctx.fillStyle = hexA(color, al * k);
    ctx.beginPath();
    ctx.arc(A.sh.x, A.sh.y, R + w * 0.6, a0, a1);
    ctx.arc(A.sh.x, A.sh.y, Math.max(4, R - w), a1, a0, true);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Rastro de matéria deixado para trás (fogo, neve, faíscas, areia). Barato: só traços e elipses. */
function wake(ctx: CanvasRenderingContext2D, kind: number, C: Pal, t: number, gait: number, lag: number, x0: number, y0: number) {
  const n = 10;
  const al = Math.min(1, Math.abs(lag) * 2.2);
  const col = kind === 0 ? C.accent : kind === 1 ? '#ffffff' : kind === 2 ? C.accent : C.body;
  const soft = kind === 0 ? C.glow : kind === 1 ? C.glow : kind === 2 ? C.body : mixHex(C.body, C.dark, 0.3);
  ctx.save();
  if (kind !== 3) ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const q = frac(h01(i, 41) + t * 0.8 + gait * 0.5);
    const y = y0 - 50 - h01(i, 42) * 220 - (kind === 0 ? q * 40 : kind === 1 ? -q * 16 : 0) + (kind === 2 ? Math.sin(i * 5 + t * 30) * 4 : 0);
    const x = x0 + (40 + q * 200) * lag + (h01(i, 43) - 0.5) * 70;
    const r = (kind === 3 ? 28 : 20) * (1 - q * 0.4) * (0.7 + h01(i, 44) * 0.6);
    // nuvem do rastro
    ctx.fillStyle = hexA(soft, (kind === 3 ? 0.28 : kind === 2 ? 0.3 : 0.18) * (1 - q) * al);
    ctx.beginPath();
    ctx.ellipse(x, y, r * (1 + q * 1.4), r * 0.5, 0, 0, TAU);
    ctx.fill();
    // risco de velocidade
    if (i % 2 === 0) {
      ctx.strokeStyle = hexA(col, 0.55 * (1 - q) * al);
      ctx.lineWidth = kind === 3 ? 2 : 2.5;
      ctx.beginPath();
      ctx.moveTo(x - 20 * lag, y);
      ctx.lineTo(x + (30 + 50 * (1 - q)) * lag, y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Fragmento orbitando com atraso: devolve posição e profundidade (d < 0 = atrás do corpo). */
function orbiter(c: Ctx, i: number, n: number, cx: number, cy: number, rx: number, ry: number, speed: number) {
  const a = c.t * speed + i / n * TAU + h01(c.seed, i) * 0.6;
  const delay = 0.35 + (i % 3) * 0.25; // os de fora atrasam mais
  const spread = 1 + c.die * 1.4;
  return {
    x: cx + Math.cos(a) * rx * spread + c.lag * 70 * delay + Math.sin(c.ph - delay * 2) * 6,
    y: cy + Math.sin(a) * ry * spread - (i % 3) * 16 + Math.sin(c.ph - delay * 3) * 8 * (1 - c.die) + c.die * c.die * 120,
    d: Math.sin(a), a, i,
  };
}

/** Labareda com inclinação (lean > 0 = ponta para a direita, arrastada pelo movimento); w afina a base. */
function tongue(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, sway: number, lean: number, inner: string, outer: string, alpha = 1, w = 0.75) {
  if (alpha <= 0 || r <= 0.5) return;
  const g = ctx.createRadialGradient(x, y, 0, x + lean * r * 0.6, y - r, r * 2.4);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, inner);
  g.addColorStop(1, hexA(outer, 0));
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * clamp(alpha);
  ctx.fillStyle = g;
  const rw = r * w;
  const tx = x + Math.sin(sway) * r * 0.5 + lean * r * 1.9, ty = y - r * (2.9 - Math.abs(lean) * 0.6);
  ctx.beginPath();
  ctx.moveTo(x - rw, y);
  ctx.quadraticCurveTo(x - rw, y + rw * 0.9, x, y + rw * 0.9);
  ctx.quadraticCurveTo(x + rw, y + rw * 0.9, x + rw, y);
  ctx.quadraticCurveTo(x + rw * 0.5 + lean * r * 0.8 + Math.sin(sway) * r * 0.2, y - r * 1.4, tx, ty);
  ctx.quadraticCurveTo(x - rw * 0.5 + lean * r * 0.8 - Math.sin(sway) * r * 0.2, y - r * 1.2, x - rw, y);
  ctx.fill();
  ctx.globalAlpha = ga;
}

// ====================================================================== utilidades
function jag(a: V, b: V, seed: number, n: number, amp: number): V[] {
  const out: V[] = [a];
  const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
  for (let i = 1; i < n; i++) {
    const k = i / n;
    const j = (h01(seed, i) - 0.5) * amp * 2;
    out.push({ x: a.x + dx * k + nx * j, y: a.y + dy * k + ny * j });
  }
  out.push(b);
  return out;
}
function line(ctx: CanvasRenderingContext2D, pts: V[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}
const lerpV = (a: V, b: V, k: number): V => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
const armCurve = (A: Arm, n = 10) => bez(A.sh, lerpV(A.sh, A.el, 0.7), lerpV(A.el, A.hd, 0.3), A.hd, n);

/** Brilho de magia acima das mãos (cast). */
function castGlow(ctx: CanvasRenderingContext2D, c: Ctx, color: string) {
  if (c.castK < 0.05) return;
  const x = (c.F.hd.x + c.B.hd.x) / 2, y = Math.min(c.F.hd.y, c.B.hd.y) - 10;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  orb(ctx, x, y, 30 + c.castK * 50 + Math.sin(c.t * 9) * 4, color, 0.8 * c.castK);
  ctx.restore();
}
/** Brilho na boca (sopro/tiro/grito). */
function mouthGlow(ctx: CanvasRenderingContext2D, c: Ctx, color: string) {
  if (c.mouthK < 0.05) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  orb(ctx, c.head.x - 26, c.head.y + 8, 20 + c.mouthK * 34, color, 0.9 * c.mouthK);
  ctx.restore();
}

// ====================================================================== 0: IGNAR (fogo)
/**
 * Gigante de fogo flutuante: o tronco de magma termina numa cauda de labaredas que
 * ondula e fica para trás quando ele avança. Pedras derretidas orbitam com atraso.
 */
function drawIgnar(ctx: CanvasRenderingContext2D, c: Ctx) {
  const { C, F, B, head, chest, t, die, heat, st, lag, ph, mv, imp, beat } = c;
  const fs = 1 - die * 0.7; // chamas encolhem ao morrer
  const nFl = Math.max(5, Math.round(c.s.feat.flames ?? 9));
  const inner = C.accent, outer = C.glow;
  const fl = lag * 0.9; // inclinação das chamas (arrastadas pelo movimento)
  const flare = 1 + imp * 0.35 + c.mouthK * 0.15;

  // pedras derretidas orbitando (as de trás)
  const rocks = [0, 1, 2, 3].map((i) => orbiter(c, i, 4, chest.x, chest.y + 10, 128, 40, 1.1));
  for (const r of rocks) if (r.d < 0) ember(ctx, r.x, r.y, 9 + (r.i % 2) * 4, r.a, C, heat, 0.75);

  // labaredas grandes atrás (contorno de fogo), ondulando em sequência
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < nFl; i++) {
    const k = i / (nFl - 1);
    const x = -52 + k * 100 + Math.sin(ph * 0.7 + i) * 5 + lag * 10;
    const y = -212 - Math.sin(k * Math.PI) * 45;
    const r = (28 + h01(i, 1) * 14 + heat * 8) * (0.85 + 0.15 * Math.sin(t * 7 + i * 1.7)) * fs * flare;
    tongue(ctx, x, y, r, t * 5 + i * 2, fl + Math.sin(t * 3 + i) * 0.12, inner, outer, 0.55);
  }
  ctx.restore();

  // braço de trás
  fireArm(ctx, B, c, 0.8);

  // cauda de fogo (no lugar das pernas): sai da cintura, afunila e ondula com atraso
  const tail: V[] = [];
  const tn = 9;
  const tailLen = 116 * (1 - die * 0.6);
  for (let i = 0; i <= tn; i++) {
    const k = i / tn;
    tail.push({
      x: Math.sin(ph * 1.1 - k * 2.4) * (3 + k * 16) + lag * k * k * 80 + Math.sin(t * 2.3 - k * 3) * k * 6 + 4,
      y: -122 + k * tailLen - Math.abs(lag) * k * k * 26,
    });
  }
  tube(ctx, tail, (q) => (72 - q * 60) * (1 - die * 0.3), vgrad(ctx, -130, -6, C.body, hexA(C.glow, 0.1)));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // miolo incandescente da cauda
  tube(ctx, tail, (q) => (34 - q * 30) * fs, vgrad(ctx, -130, -10, hexA(C.accent, 0.7), hexA(C.glow, 0)));
  for (let i = 1; i <= tn; i += 2) {
    const p = tail[i], k = i / tn;
    const r = (24 - k * 12) * (0.8 + 0.2 * Math.sin(t * 9 + i * 1.3)) * fs * flare;
    tongue(ctx, p.x + Math.sin(i * 2.1) * (12 - k * 8), p.y, r, t * 7 + i, fl * 1.3 + 0.25 * Math.sin(ph - k * 2), inner, outer, 0.5, 0.6);
  }
  // fiapos de fogo soltando da ponta da cauda e ficando para trás
  const tip = tail[tn];
  for (let i = 0; i < 4; i++) {
    const q = frac(t * 1.6 + i / 4 + c.st.gait * 0.5);
    tongue(ctx, tip.x + q * (20 + 60 * lag) + Math.sin(i * 3 + t * 4) * 6, tip.y - q * 30, (9 - q * 7) * fs, t * 8 + i, fl * 1.4, inner, outer, (1 - q) * 0.8);
  }
  ctx.restore();

  // tronco: massa de magma afunilando para a cintura (respira com o núcleo)
  const bw = 1 + c.b * 0.015 + beat * 0.01;
  ctx.fillStyle = vgrad(ctx, -275, -110, C.body, C.dark);
  ctx.beginPath();
  ctx.moveTo(-38 * bw, -118);
  ctx.quadraticCurveTo(-62 * bw, -170, -88 * bw, -232);
  ctx.quadraticCurveTo(-70, -268, -32, -262);
  ctx.quadraticCurveTo(0, -276, 34, -264);
  ctx.quadraticCurveTo(76, -270, 78 * bw, -238);
  ctx.quadraticCurveTo(58 * bw, -170, 38 * bw, -118);
  ctx.quadraticCurveTo(0, -104, -38 * bw, -118);
  ctx.fill();
  // crosta escura (placas de rocha resfriada) com rachaduras incandescentes
  ctx.fillStyle = hexA(C.dark, 0.55);
  for (let i = 0; i < 5; i++) {
    const px = -50 + i * 26 + (i % 2) * 6, py = -244 + (i % 3) * 30 + h01(i, 12) * 14;
    ctx.beginPath();
    ctx.moveTo(px - 14, py);
    ctx.lineTo(px - 4, py - 12);
    ctx.lineTo(px + 14, py - 6);
    ctx.lineTo(px + 10, py + 10);
    ctx.lineTo(px - 8, py + 12);
    ctx.closePath();
    ctx.fill();
  }
  // veios de lava (pulsam com o coração)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = hexA(C.accent, clamp(0.3 + heat * 0.35 + beat * 0.3));
  ctx.lineWidth = 3 + beat * 1.5;
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU + 0.3;
    line(ctx, jag(chest, { x: chest.x + Math.cos(a) * 62, y: chest.y + 6 + Math.sin(a) * 50 }, 40 + i, 4, 6));
  }
  ctx.restore();

  // labaredas da pele (subindo do corpo, arrastadas pelo movimento)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) {
    const y = -150 - h01(i, 5) * 100;
    const wy = 36 + (-140 - y) * 0.4; // largura do tronco nessa altura
    const x = (h01(i, 4) - 0.5) * 2 * wy;
    const r = (9 + h01(i, 6) * 8) * (0.8 + 0.2 * Math.sin(t * 8 + i)) * fs * flare;
    tongue(ctx, x, y, r, t * 6 + i, fl + Math.sin(t * 4 + i * 2) * 0.15, inner, outer, 0.4, 0.55);
  }
  ctx.restore();

  // núcleo derretido: batida dupla de coração
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const pulse = beat * 10 + Math.sin(t * 4) * 2;
  orb(ctx, chest.x - 4, chest.y + 12, (48 + pulse + heat * 14 + imp * 20) * (1 - die * 0.5), C.glow, 0.85);
  orb(ctx, chest.x - 4, chest.y + 12, (22 + pulse * 0.6) * (1 - die * 0.5), C.accent, 1);
  ctx.restore();

  // cabeça: brasa com coroa de fogo (a coroa fica para trás ao avançar)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const k = i / 4;
    const r = (20 + Math.sin(k * Math.PI) * 10 + heat * 4) * (0.85 + 0.15 * Math.sin(t * 9 + i * 2)) * fs * flare;
    tongue(ctx, head.x - 22 + k * 44, head.y - 12 - Math.sin(k * Math.PI) * 8, r, t * 7 + i * 1.3, fl * 1.1 + (k - 0.5) * 0.3, inner, outer, 0.85);
  }
  ctx.restore();
  ctx.fillStyle = vgrad(ctx, head.y - 30, head.y + 30, C.body, C.dark);
  ctx.beginPath();
  ctx.moveTo(head.x + 26, head.y - 18);
  ctx.quadraticCurveTo(head.x, head.y - 38, head.x - 26, head.y - 16);
  ctx.quadraticCurveTo(head.x - 38, head.y + 6, head.x - 22, head.y + 26 + c.mouthK * 6);
  ctx.quadraticCurveTo(head.x + 4, head.y + 34 + c.mouthK * 6, head.x + 26, head.y + 16);
  ctx.closePath();
  ctx.fill();
  // sobrancelha de rocha (cara de bravo)
  ctx.fillStyle = C.dark;
  ctx.beginPath();
  ctx.moveTo(head.x - 32, head.y - 12);
  ctx.lineTo(head.x + 8, head.y - 14 + st.rage * 2);
  ctx.lineTo(head.x + 6, head.y - 8);
  ctx.lineTo(head.x - 30, head.y - 5);
  ctx.closePath();
  ctx.fill();
  mouthGlow(ctx, c, C.accent);
  // boca de fogo
  ctx.fillStyle = hexA(C.accent, 0.6 + c.mouthK * 0.4);
  ctx.beginPath();
  ctx.ellipse(head.x - 14, head.y + 14 + c.mouthK * 3, 9 + c.mouthK * 3, 2 + c.mouthK * 9, 0.1, 0, TAU);
  ctx.fill();
  const open = st.anim === 'death' ? 1 - st.p : blink(t, 4.3);
  eyeGlow(ctx, head.x - 18, head.y - 2, 5 + st.rage * 2, C.accent, open);
  eyeGlow(ctx, head.x + 2, head.y - 4, 4.5 + st.rage * 2, C.accent, open);

  // braço da frente
  fireArm(ctx, F, c, 1);
  castGlow(ctx, c, C.accent);

  // pedras da frente
  for (const r of rocks) if (r.d >= 0) ember(ctx, r.x, r.y, 10 + (r.i % 2) * 4, r.a, C, heat, 1);

  // brasas: sobem e, ao se mover, ficam para trás
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = C.accent;
  const nE = 18 + Math.round(st.rage * 10 + die * 16);
  for (let i = 0; i < nE; i++) {
    const q = frac(h01(i, 21) + t * (0.35 + h01(i, 22) * 0.3) + st.gait * 0.4);
    const x = (h01(i, 23) - 0.5) * 200 + q * lag * 150 + Math.sin(t * 2 + i) * 8;
    const y = -60 - h01(i, 24) * 200 - q * (110 + die * 120);
    ctx.globalAlpha = Math.sin(q * Math.PI) * 0.9;
    const z = 2 + h01(i, 25) * 2.5;
    ctx.fillRect(x - z / 2, y - z / 2, z, z);
  }
  ctx.restore();
  // morte: fumaça escura subindo do que sobrou
  if (die > 0.3) {
    ctx.save();
    for (let i = 0; i < 6; i++) {
      const q = frac(h01(i, 31) + t * 0.25);
      ctx.fillStyle = hexA('#1a0a06', 0.35 * (1 - q) * sm(0.3, 0.6, die));
      ctx.beginPath();
      ctx.arc((h01(i, 32) - 0.5) * 120 + q * 20, -120 - q * 160, 20 + q * 30, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** Piscar (0 = fechado). */
function blink(t: number, every: number) {
  const q = t % every;
  return q < 0.14 ? Math.abs(q - 0.07) / 0.07 : 1;
}

/** Pedra de magma orbitando (crosta escura com miolo incandescente). */
function ember(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, C: Pal, heat: number, a: number) {
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.globalCompositeOperation = 'lighter';
  orb(ctx, x, y, r * 2.4, C.glow, 0.35 + heat * 0.3);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha *= a;
  rock(ctx, x, y, r, rot * 2, { ...C, body: C.glow, dark: C.dark }, 1);
  ctx.strokeStyle = hexA(C.accent, 0.8);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.5, y - r * 0.2);
  ctx.lineTo(x + r * 0.1, y + r * 0.1);
  ctx.lineTo(x + r * 0.5, y - r * 0.3);
  ctx.stroke();
  ctx.restore();
}

function fireArm(ctx: CanvasRenderingContext2D, A: Arm, c: Ctx, k: number) {
  const { C, t, die } = c;
  const pts = armCurve(A);
  tube(ctx, pts, (q) => (44 - q * 14) * k, vgrad(ctx, A.sh.y - 40, A.hd.y + 40, k < 1 ? mixHex(C.body, C.dark, 0.4) : C.body, C.dark));
  // punho em brasa; as chamas do braço deitam para trás com o movimento e com o golpe
  const swingLean = c.st.anim === 'attack' ? clamp((c.sk - c.wu) * 0.5 + c.imp * 0.4, -0.6, 0.8) : 0;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  orb(ctx, A.hd.x, A.hd.y, 26 * k + c.heat * 10 + c.imp * 16, C.glow, 0.8);
  for (let i = 0; i < 6; i++) {
    const p = pts[3 + i] ?? A.hd;
    const r = (14 + i * 1.3) * k * (0.75 + 0.25 * Math.sin(t * 9 + i * 1.9 + k)) * (1 - die * 0.6);
    tongue(ctx, p.x + (h01(i, 9) - 0.5) * 10, p.y + 4, r, t * 6 + i * 2 + k, c.lag * 0.9 + swingLean, C.accent, C.glow, 0.55);
  }
  ctx.restore();
}

// ====================================================================== 1: HAILSTROM (nevasca)
/**
 * Espírito da nevasca: manto de vento que afunila numa cauda de neve (fica para trás ao se mover),
 * couraça de gelo no peito, coração-floco pulsando e estilhaços orbitando com atraso.
 */
function drawHail(ctx: CanvasRenderingContext2D, c: Ctx) {
  const { C, F, B, head, chest, t, die, heat, st, lag, ph, beat, imp } = c;
  const fade = 1 - die * 0.55;
  const core: V = { x: chest.x, y: chest.y + 6 };
  const nSh = 8;
  const ice = mixHex(C.body, C.dark, 0.35);

  // estilhaços de gelo orbitando (atrasados em relação ao corpo)
  const shards = Array.from({ length: nSh }, (_, i) => orbiter(c, i, nSh, core.x, core.y + 10, 150 + (i % 2) * 22, 46, 0.9));
  ctx.save();
  ctx.globalAlpha = fade;
  for (const sh of shards) if (sh.d < 0) iceShard(ctx, sh.x, sh.y, 15 + (sh.i % 3) * 5, sh.a * 0.6 + sh.i + c.lag, C, 0.65);

  // névoa gelada de fundo (contida, para não lavar o desenho)
  ctx.globalCompositeOperation = 'lighter';
  orb(ctx, core.x + lag * 20, core.y - 10, 150, C.glow, 0.16 + heat * 0.1 + beat * 0.05);
  ctx.globalCompositeOperation = 'source-over';

  // braço de trás
  windArm(ctx, B, c, 0.8);

  // manto de vento e neve: afunila numa cauda que ondula e fica para trás
  const w1 = Math.sin(ph * 1.2), w2 = Math.sin(ph * 1.2 - 1.2), w3 = Math.sin(ph * 1.2 - 2.4);
  const tx = 30 + w3 * 26 + lag * 90, ty = -24 + Math.sin(ph * 2) * 6 - Math.abs(lag) * 24;
  const mx = -48 + w1 * 6 + lag * 18, nx = 62 + w2 * 8 + lag * 30;
  const mantle = () => {
    ctx.beginPath();
    ctx.moveTo(-92, -232);
    ctx.bezierCurveTo(-112, -180, -64 + lag * 6, -150, mx, -110);
    ctx.bezierCurveTo(-30 + lag * 30, -60, tx - 44, ty - 8, tx, ty);
    ctx.bezierCurveTo(tx - 4 + lag * 10, ty - 44, nx + 14, -88, nx, -140);
    ctx.bezierCurveTo(96, -180, 96, -230, 76, -248);
    ctx.quadraticCurveTo(0, -292, -92, -232);
  };
  ctx.fillStyle = vgrad(ctx, -280, -20, hexA(C.light, 0.97 * (1 - die * 0.6)), hexA(C.body, 0.08));
  mantle();
  ctx.fill();
  // sombra do lado de trás do manto (volume)
  const sg = ctx.createLinearGradient(-90, 0, 100, 0);
  sg.addColorStop(0, hexA(ice, 0));
  sg.addColorStop(0.55, hexA(ice, 0.05));
  sg.addColorStop(1, hexA(ice, 0.55 * (1 - die * 0.6)));
  ctx.fillStyle = sg;
  ctx.fill();
  // dobras do vento descendo pela cauda
  ctx.strokeStyle = hexA(C.dark, 0.25);
  ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    const o = -30 + i * 30;
    ctx.beginPath();
    ctx.moveTo(o, -200);
    ctx.quadraticCurveTo(o + 10 + Math.sin(ph - i) * 10, -120, tx - 20 + i * 8 + lag * 10, ty - 10);
    ctx.stroke();
  }
  // bordas desfiadas (rajadas que se soltam do manto)
  ctx.strokeStyle = hexA(C.light, 0.55);
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const p2 = ph * 1.3 + i * 1.3;
    ctx.lineWidth = 6 - i;
    ctx.beginPath();
    ctx.moveTo(-90 + i * 8, -220 + i * 26);
    ctx.quadraticCurveTo(-128 - Math.sin(p2) * 14 + lag * 20, -170 + i * 30, -70 + i * 14 + Math.sin(p2) * 10 + lag * 26, -120 + i * 22);
    ctx.stroke();
  }
  // fiapos de neve soltando da ponta da cauda
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 6; i++) {
    const q = frac(t * 0.9 + i / 6 + st.gait * 0.5);
    ctx.globalAlpha = fade * (1 - q) * 0.7;
    ctx.beginPath();
    ctx.arc(tx + q * (24 + lag * 90) + Math.sin(i * 2.3 + t * 3) * 8, ty + q * 10 - i * 3, 6 * (1 - q * 0.5), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = fade;

  // fitas de vento girando em espiral (a base do funil acompanha a cauda)
  for (let i = 0; i < 7; i++) {
    const k = i / 6;
    const y = -60 - k * 200;
    const rx = 26 + k * 110;
    const pr = (t * (2.4 - k) + i * 0.9 + st.gait * 2) % TAU;
    ctx.strokeStyle = hexA(i % 2 ? '#ffffff' : C.glow, 0.5 * (0.6 + k * 0.4));
    ctx.lineWidth = 2.5 + k * 3;
    ctx.beginPath();
    ctx.ellipse(Math.sin(ph * 1.2 - (1 - k) * 2.4) * 10 + (1 - k) * (24 + lag * 60), y, rx, rx * 0.26, -0.18 + lag * 0.1, pr, pr + 2.2);
    ctx.stroke();
  }

  // couraça de gelo no peito e nos ombros (facetas com luz e sombra)
  let pi = 0;
  const plate = (pts: number[], light: number) => {
    // morte: as placas se soltam e caem girando
    const d = die * die, j = pi++;
    const ox = (j - 2.5) * d * 26, oy = d * (90 + h01(j, 61) * 120), rot = d * (h01(j, 62) - 0.5) * 2;
    const cx = pts[0], cy = pts[1];
    const P = (i: number) => {
      const x = pts[i] - cx, y = pts[i + 1] - cy;
      return [cx + ox + x * Math.cos(rot) - y * Math.sin(rot), cy + oy + x * Math.sin(rot) + y * Math.cos(rot)];
    };
    ctx.beginPath();
    ctx.moveTo(...(P(0) as [number, number]));
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(...(P(i) as [number, number]));
    ctx.closePath();
    ctx.fillStyle = mixHex(ice, '#ffffff', light);
    ctx.fill();
    ctx.stroke();
  };
  ctx.strokeStyle = hexA(C.dark, 0.7);
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  plate([-70, -250, -40, -262, -30, -236, -58, -224], 0.55);
  plate([-40, -262, 0, -268, 8, -240, -30, -236], 0.7);
  plate([0, -268, 44, -262, 40, -236, 8, -240], 0.4);
  plate([44, -262, 74, -248, 64, -226, 40, -236], 0.2);
  plate([-58, -224, -30, -236, -26, -196, -44, -176], 0.45);
  plate([40, -236, 64, -226, 48, -178, 30, -196], 0.15);

  // núcleo: floco de neve brilhante (bate como um coração)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  orb(ctx, core.x, core.y, (46 + beat * 12 + heat * 12 + imp * 16) * (1 - die * 0.5), C.eye, 0.85);
  ctx.restore();
  flake(ctx, core.x, core.y, (30 + beat * 4) * (1 - die * 0.4), t * 0.6 + die * 3, C);
  // morte: o coração estoura num clarão
  if (die > 0.05 && die < 0.6) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    orb(ctx, core.x, core.y, 60 + die * 260, '#ffffff', Math.sin(die / 0.6 * Math.PI) * 0.6);
    ctx.restore();
  }

  // cabeça: capuz de névoa com coroa de gelo (as pontas balançam atrasadas)
  for (let i = 0; i < 5; i++) {
    const k = i / 4;
    const x = head.x - 26 + k * 52;
    const hgt = (26 + Math.sin(k * Math.PI) * 26 + (i % 2) * 6) * (1 - die * 0.5);
    const tipX = x + (k - 0.5) * 12 + lag * 8 + Math.sin(ph - 1 - k) * 2;
    ctx.fillStyle = vgrad(ctx, head.y - 26 - hgt, head.y - 18, '#ffffff', C.glow);
    ctx.beginPath();
    ctx.moveTo(x - 8, head.y - 18);
    ctx.lineTo(tipX, head.y - 22 - hgt);
    ctx.lineTo(x + 8, head.y - 18);
    ctx.fill();
    ctx.strokeStyle = hexA(C.dark, 0.5);
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.fillStyle = rgrad(ctx, head.x - 6, head.y - 8, 46, C.light, hexA(ice, 0.85));
  ctx.beginPath();
  ctx.ellipse(head.x, head.y, 36, 38, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = hexA(C.dark, 0.5);
  ctx.lineWidth = 2;
  ctx.stroke();
  // rosto oco
  ctx.fillStyle = hexA(C.dark, 0.9);
  ctx.beginPath();
  ctx.ellipse(head.x - 10, head.y + 4 + c.mouthK * 2, 22, 24 + c.mouthK * 4, 0.1, 0, TAU);
  ctx.fill();
  mouthGlow(ctx, c, C.glow);
  const open = st.anim === 'death' ? 1 - st.p : blink(t, 5.1);
  eyeGlow(ctx, head.x - 20, head.y - 2, 5 + st.rage * 2, C.eye, open);
  eyeGlow(ctx, head.x + 0, head.y - 4, 4.5 + st.rage * 2, C.eye, open);
  // sopro gelado saindo da boca
  if (c.mouthK > 0.05) {
    ctx.fillStyle = hexA('#ffffff', 0.5 * c.mouthK);
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(head.x - 34 - i * 12 * c.mouthK, head.y + 10 + Math.sin(t * 8 + i) * 4, 6 + i * 3 * c.mouthK, 0, TAU);
      ctx.fill();
    }
  }

  // braço da frente
  windArm(ctx, F, c, 1);
  castGlow(ctx, c, C.eye);

  // estilhaços da frente
  for (const sh of shards) if (sh.d >= 0) iceShard(ctx, sh.x, sh.y, 17 + (sh.i % 3) * 5, sh.a * 0.6 + sh.i + c.lag, C, 1);

  // flocos de neve girando ao redor (arrastados pelo movimento)
  ctx.fillStyle = '#ffffff';
  const spread = 1 + die * 1.6;
  for (let i = 0; i < 30; i++) {
    const a = t * (1 + h01(i, 7)) + i * 2.1;
    const r = (60 + h01(i, 8) * 150) * spread;
    const y = -30 - h01(i, 9) * 290 + Math.sin(a) * 18 + die * die * 140 * h01(i, 12);
    ctx.globalAlpha = fade * (0.4 + 0.6 * h01(i, 10)) * (0.5 + 0.5 * Math.cos(a));
    const sz = 1.5 + h01(i, 11) * 2.5;
    ctx.fillRect(Math.sin(a) * r + lag * 40 * h01(i, 13) - sz / 2, y - sz / 2, sz, sz);
  }
  ctx.restore();
}

function iceShard(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, ang: number, C: Pal, a: number) {
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = vgrad(ctx, -len, len, '#ffffff', C.glow);
  ctx.beginPath();
  ctx.moveTo(0, -len);
  ctx.lineTo(len * 0.32, 0);
  ctx.lineTo(0, len * 0.6);
  ctx.lineTo(-len * 0.32, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = hexA(C.dark, 0.6);
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

function flake(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, C: Pal) {
  if (r <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.lineCap = 'round';
  ctx.shadowColor = C.eye;
  ctx.shadowBlur = 10;
  ctx.strokeStyle = '#ffffff';
  for (let i = 0; i < 6; i++) {
    ctx.rotate(TAU / 6);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -r);
    ctx.stroke();
    ctx.lineWidth = 2.5;
    for (const k of [0.45, 0.72]) {
      const w = r * (0.9 - k) * 0.9;
      ctx.beginPath();
      ctx.moveTo(-w, -r * k - w);
      ctx.lineTo(0, -r * k);
      ctx.lineTo(w, -r * k - w);
      ctx.stroke();
    }
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.22, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function windArm(ctx: CanvasRenderingContext2D, A: Arm, c: Ctx, k: number) {
  const { C, t } = c;
  const pts = armCurve(A);
  tube(ctx, pts, (q) => (38 - q * 22) * k, vgrad(ctx, A.sh.y - 40, A.hd.y + 40, hexA(C.light, 0.9), hexA(C.body, 0.55)), { wobble: 0.06, time: t * 0.2, seed: k * 5 });
  // rajada enrolada no braço
  ctx.strokeStyle = hexA('#ffffff', 0.6);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const o = Math.sin(i * 1.4 - t * 6) * (14 - i) * k;
    if (i === 0) ctx.moveTo(p.x + o, p.y);
    else ctx.lineTo(p.x + o, p.y - o * 0.4);
  }
  ctx.stroke();
  // garras de gelo
  for (let i = -1; i <= 1; i++) {
    const a = A.ang + Math.PI + i * 0.35;
    iceShard(ctx, A.hd.x - Math.sin(a) * -14, A.hd.y + Math.cos(a) * -14, 20 * k, a + Math.PI, C, 1);
  }
}

// ====================================================================== 2: VOLTURION (trovão)
/**
 * Silhueta humana de eletricidade voando: pernas dobradas que ficam para trás ao avançar
 * (pose de super-herói), pés que se desfazem em raios, imagens-fantasma ao se deslocar.
 */
function drawVolt(ctx: CanvasRenderingContext2D, c: Ctx) {
  const { C, F, B, head, chest, t, die, heat, st, lag, ph, beat, wu, sk, imp, mv } = c;
  const fl = Math.floor(t * 14); // semente que muda (pisca)
  const on = (i: number) => h01(fl, i) > die * 0.9; // ao morrer, os raios vão apagando
  const hipC: V = { x: 0, y: -140 };
  const slam = poseK(st, 'slam'), charge = poseK(st, 'charge'), roar = poseK(st, 'roar');
  // pernas voando: coxa e canela com fases diferentes (a canela atrasa) e arrastadas pelo movimento
  const legs: [V, V, V][] = [22, -22].map((hx, i) => {
    const hip = { x: hx, y: -138 };
    let a1 = 0.16 + (i ? -0.22 : 0.12) + lag * (lag > 0 ? 0.75 : 0.35) + Math.sin(ph * 1.2 + i * 1.7) * (0.12 + mv * 0.08);
    let b1 = 0.5 + (i ? 0.2 : 0) + Math.abs(lag) * 0.35 + Math.sin(ph * 1.2 + i * 1.7 - 1.0) * (0.22 + mv * 0.1);
    a1 += -slam * wu * 0.7 + slam * sk * 0.3 + charge * (sk * 0.9 - wu * 0.4) - roar * wu * 0.3 + roar * sk * 0.15 + st.hurt * 0.3;
    b1 += slam * wu * 1.0 + charge * (sk * 0.3 + wu * 0.6) + roar * wu * 0.6;
    a1 = L(a1, 0.05 * (i ? -1 : 1), die);
    b1 = L(b1, 0.1, die);
    const knee = { x: hip.x + Math.sin(a1) * 72, y: hip.y + Math.cos(a1) * 72 };
    const foot = { x: knee.x + Math.sin(a1 + b1) * 68, y: knee.y + Math.cos(a1 + b1) * 68 };
    return [hip, knee, foot];
  });
  const neck: V = { x: head.x + 4, y: head.y + 28 };
  const bones: [V, V][] = [
    [B.sh, B.el], [B.el, B.hd],
    [legs[0][0], legs[0][1]], [legs[0][1], legs[0][2]],
    [legs[1][0], legs[1][1]], [legs[1][1], legs[1][2]],
    [F.sh, B.sh], [neck, chest], [chest, hipC], [F.sh, hipC], [B.sh, hipC], [legs[0][0], legs[1][0]],
    [F.sh, F.el], [F.el, F.hd],
  ];

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // imagens-fantasma deixadas para trás (velocidade do raio)
  const ghost = Math.max(mv * Math.min(1, Math.abs(lag) * 2), charge * sk);
  if (ghost > 0.05) {
    ctx.globalCompositeOperation = 'lighter';
    const dir = charge * sk > mv ? 1 : Math.sign(lag) || 1;
    for (let g = 1; g <= 2; g++) {
      const ox = dir * g * (34 + charge * sk * 50);
      ctx.strokeStyle = hexA(C.body, 0.32 * ghost / g);
      ctx.lineWidth = 7;
      ctx.beginPath();
      for (const [a, b] of bones) {
        ctx.moveTo(a.x + ox, a.y);
        ctx.lineTo(b.x + ox, b.y);
      }
      ctx.stroke();
      ctx.fillStyle = hexA(C.body, 0.25 * ghost / g);
      ctx.beginPath();
      ctx.arc(head.x + ox, head.y, 24, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // aura escura da silhueta
  ctx.strokeStyle = hexA(C.dark, 0.6);
  ctx.lineWidth = 34;
  ctx.beginPath();
  for (const [a, b] of bones) {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.fillStyle = hexA(C.dark, 0.6);
  ctx.beginPath();
  ctx.moveTo(F.sh.x - 6, F.sh.y - 8);
  ctx.lineTo(B.sh.x + 6, B.sh.y - 8);
  ctx.lineTo(hipC.x + 24, hipC.y);
  ctx.lineTo(hipC.x - 24, hipC.y);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(head.x, head.y, 34, 0, TAU);
  ctx.fill();

  ctx.globalCompositeOperation = 'lighter';
  orb(ctx, chest.x, chest.y - 20, 170, C.body, 0.16 + heat * 0.12 + beat * 0.06 + Math.sin(t * 20) * 0.03);
  // volume de plasma: tronco em V e membros como tubos de luz (dá corpo à silhueta)
  const tg = rgrad(ctx, chest.x, chest.y, 90, hexA(C.glow, 0.55), hexA(C.body, 0.05));
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.moveTo(F.sh.x - 8, F.sh.y - 6);
  ctx.quadraticCurveTo(chest.x, chest.y - 50, B.sh.x + 8, B.sh.y - 6);
  ctx.quadraticCurveTo(B.sh.x - 6, chest.y + 30, hipC.x + 22, hipC.y + 4);
  ctx.lineTo(hipC.x - 22, hipC.y + 4);
  ctx.quadraticCurveTo(F.sh.x + 6, chest.y + 30, F.sh.x - 8, F.sh.y - 6);
  ctx.fill();
  // corpo de eletricidade: cada osso é um raio trêmulo (duas fitas)
  bones.forEach(([a, b], i) => {
    if (!on(i)) return;
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    for (let s = 0; s < 2; s++) {
      const pts = jag(a, b, fl * 7 + i * 13 + s * 31, 6, 4 + l * 0.06 + imp * 4);
      ctx.strokeStyle = hexA(C.body, 0.35);
      ctx.lineWidth = 9;
      line(ctx, pts);
      ctx.strokeStyle = s ? C.glow : C.accent;
      ctx.lineWidth = 3;
      line(ctx, pts);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.3;
      line(ctx, pts);
    }
  });
  // juntas brilhando
  for (const p of [F.el, B.el, legs[0][1], legs[1][1], F.sh, B.sh]) orb(ctx, p.x, p.y, 14, C.glow, 0.7);
  // pés se desfazendo em raios que pingam e ficam para trás
  legs.forEach(([, , f], i) => {
    if (!on(40 + i)) return;
    for (let k = 0; k < 2; k++) {
      const end = { x: f.x + lag * 30 + (h01(fl, 60 + i * 2 + k) - 0.5) * 30, y: f.y + 24 + h01(fl, 64 + i + k) * 22 };
      const pts = jag(f, end, fl * 3 + i * 7 + k, 4, 6);
      ctx.strokeStyle = k ? C.accent : C.glow;
      ctx.lineWidth = 2;
      line(ctx, pts);
    }
    orb(ctx, f.x, f.y, 12, C.glow, 0.8);
  });
  ctx.restore();

  // arcos pulando entre os membros (feat.arcs)
  const nodes: V[] = [F.hd, B.hd, F.el, B.el, legs[0][1], legs[1][1], legs[0][2], legs[1][2], head, chest];
  const nArcs = Math.max(2, Math.round(c.s.feat.arcs ?? 6));
  const af = Math.floor(t * 9);
  for (let i = 0; i < nArcs; i++) {
    if (h01(af, i + 50) < 0.35 + die * 0.5 - imp * 0.3) continue;
    const a = nodes[Math.floor(h01(af + i, 1) * nodes.length)];
    const b = nodes[Math.floor(h01(af + i, 2) * nodes.length)];
    if (a === b) continue;
    lightning(ctx, a, b, af * 3 + i, 1.6, i % 2 ? C.body : C.accent, 0.85, 1);
  }

  // núcleo brilhante (batida dupla) e mãos com bolas de energia
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const pul = beat * 9 + (h01(fl, 9) - 0.5) * 6;
  orb(ctx, chest.x, chest.y, (50 + pul + heat * 16 + imp * 24) * (1 - die * 0.6), C.glow, 0.95);
  orb(ctx, chest.x, chest.y, (22 + pul * 0.5) * (1 - die * 0.6), C.accent, 1);
  orb(ctx, F.hd.x, F.hd.y, 22 + heat * 10 + c.castK * 16 + imp * 10, C.glow, 0.9);
  orb(ctx, B.hd.x, B.hd.y, 18 + heat * 8 + c.castK * 12, C.glow, 0.7);

  // cabeça: esfera de plasma com coroa de faíscas (a coroa é arrastada pelo movimento)
  orb(ctx, head.x, head.y, 40, C.body, 0.85);
  ctx.restore();
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    if (!on(i + 20)) continue;
    const a = -Math.PI / 2 + (i - 2) * 0.42 + lag * 0.5 + Math.sin(ph - i * 0.5) * 0.06;
    const r0 = 22, r1 = 44 + h01(fl, i + 30) * 18 + (i === 2 ? 10 : 0) + roar * sk * 16;
    const pts = jag({ x: head.x + Math.cos(a) * r0, y: head.y + Math.sin(a) * r0 }, { x: head.x + Math.cos(a) * r1, y: head.y + Math.sin(a) * r1 }, fl + i * 5, 3, 4);
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 3;
    line(ctx, pts);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    line(ctx, pts);
  }
  ctx.fillStyle = hexA(C.dark, 0.8);
  ctx.beginPath();
  ctx.ellipse(head.x - 10, head.y + 2, 18, 13 + c.mouthK * 4, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  mouthGlow(ctx, c, C.accent);
  const open = st.anim === 'death' ? 1 - st.p : blink(t, 3.7);
  eyeGlow(ctx, head.x - 19, head.y, 5 + st.rage * 2, C.accent, open);
  eyeGlow(ctx, head.x - 2, head.y - 2, 4.5 + st.rage * 2, C.accent, open);
  castGlow(ctx, c, C.accent);
  // faíscas soltas
  sparks(ctx, chest.x, chest.y, (t * 1.7) % 1, 1, Math.floor(t * 1.7), C.accent, 10, 150);
  // raios descendo ao chão ao morrer
  if (die > 0.05 && h01(fl, 77) > 0.4) lightning(ctx, chest, { x: chest.x + (h01(fl, 78) - 0.5) * 120, y: 0 }, fl, 2, C.body, 1 - die, 2);
}

// ====================================================================== 3: ZAHRIM (areia)
/**
 * Gigante de areia: tronco de tornado cuja ponta chicoteia e fica para trás ao se mover,
 * pedras orbitando com atraso, véu esvoaçando, punhos de rocha. Ao morrer, desaba num monte de areia.
 */
function drawZahrim(ctx: CanvasRenderingContext2D, c: Ctx) {
  const { C, F, B, head, chest, t, die, heat, st, lag, ph, beat, imp } = c;
  const N = 16;
  const topY = chest.y + 10;
  const ink = mixHex(C.dark, '#000000', 0.35);
  const spin = t * 3.2 + st.gait * 2.5; // o giro acelera quando ele se desloca
  // funil do tornado: a ponta (k=0) chicoteia com atraso e é arrastada pelo movimento
  const ring: { x: number; y: number; r: number; k: number }[] = [];
  for (let i = 0; i <= N; i++) {
    const k = i / N, u = 1 - k;
    ring.push({
      x: Math.sin(ph * 1.2 - u * 2.6) * 18 * u + Math.sin(t * 3.1 + k * 6) * 3 + lag * Math.pow(u, 1.6) * 80,
      y: topY * k - Math.abs(lag) * u * u * 18,
      r: (22 + 92 * Math.pow(k, 1.3)) * (1 + die * 0.3 * u),
      k,
    });
  }

  // pedras orbitando (as de trás)
  const rocks = Array.from({ length: 8 }, (_, i) => orbiter(c, i, 8, 0, -160, 170, 34, 0.8));
  for (const r of rocks) if (r.d < 0) rock(ctx, r.x, Math.min(r.y, -8), 9 + (r.i % 3) * 5, r.a * 2 + r.i, C, 0.85);

  // poeira girando em volta da ponta
  ctx.save();
  for (let i = 0; i < 10; i++) {
    const a = spin * 0.7 + i * 0.63;
    ctx.fillStyle = hexA(C.body, 0.2);
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * 46 + ring[0].x + lag * 20 * h01(i, 3), -8 - h01(i, 1) * 26, 24 + h01(i, 2) * 20, 9, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // braço de trás
  sandArm(ctx, B, c, 0.85);

  // corpo do tornado
  const funnel = () => {
    ctx.beginPath();
    ring.forEach((p, i) => (i ? ctx.lineTo(p.x - p.r, p.y) : ctx.moveTo(p.x - p.r, p.y)));
    for (let i = N; i >= 0; i--) ctx.lineTo(ring[i].x + ring[i].r, ring[i].y);
    ctx.closePath();
  };
  ctx.fillStyle = (() => {
    const g = ctx.createLinearGradient(-120, 0, 120, 0);
    g.addColorStop(0, mixHex(C.dark, C.body, 0.4));
    g.addColorStop(0.3, mixHex(C.body, C.accent, 0.35));
    g.addColorStop(0.55, C.body);
    g.addColorStop(1, ink);
    return g;
  })();
  funnel();
  ctx.fill();
  ctx.strokeStyle = hexA(ink, 0.7);
  ctx.lineWidth = 3;
  ctx.stroke();
  // faixas de areia girando (frente do funil)
  ctx.lineCap = 'round';
  for (let i = 1; i <= N; i++) {
    const p = ring[i];
    const a0 = (spin + i * 1.3) % Math.PI;
    ctx.strokeStyle = i % 2 ? hexA(C.accent, 0.55) : hexA(ink, 0.45);
    ctx.lineWidth = 2 + p.k * 3;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, Math.max(1, p.r * 0.95), Math.max(1, p.r * 0.2), 0, a0, Math.min(Math.PI, a0 + 1.6));
    ctx.stroke();
  }

  // tórax: massa de areia larga (estufa com a batida do núcleo)
  const cw = 1 + beat * 0.012 + c.b * 0.01;
  const chestPath = () => {
    ctx.beginPath();
    ctx.moveTo(-118 * cw, -222);
    ctx.quadraticCurveTo(-126 * cw, -272, -60, -282);
    ctx.quadraticCurveTo(0, -294, 60, -284);
    ctx.quadraticCurveTo(126 * cw, -276, 116 * cw, -222);
    ctx.quadraticCurveTo(80, -186, 0, -188);
    ctx.quadraticCurveTo(-80, -186, -118 * cw, -222);
  };
  ctx.fillStyle = vgrad(ctx, -290, -180, mixHex(C.body, C.accent, 0.35), mixHex(C.dark, C.body, 0.3));
  chestPath();
  ctx.fill();
  ctx.strokeStyle = hexA(ink, 0.7);
  ctx.lineWidth = 3;
  ctx.stroke();
  // sombra embaixo do peito, sobre o funil
  ctx.fillStyle = hexA(ink, 0.3);
  ctx.beginPath();
  ctx.ellipse(0, -186, 86, 12, 0, 0, Math.PI);
  ctx.fill();
  // riscos de vento no tórax (correm mais rápido ao se mover)
  ctx.strokeStyle = hexA(C.accent, 0.6);
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 4; i++) {
    const y = -270 + i * 18;
    const off = ((t * 90 + st.gait * 120 + i * 40) % 160) - 80;
    ctx.beginPath();
    ctx.moveTo(off - 30, y);
    ctx.quadraticCurveTo(off, y + 6, off + 40, y);
    ctx.stroke();
  }
  // núcleo brilhante (sol do deserto) no peito
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  orb(ctx, chest.x - 6, chest.y + 4, (34 + beat * 10 + heat * 14 + imp * 18) * (1 - die * 0.6), C.eye, 0.6);
  orb(ctx, chest.x - 6, chest.y + 4, (14 + beat * 5) * (1 - die * 0.6), C.accent, 0.8);
  ctx.restore();

  // véu de areia esvoaçando atrás do capuz (ondula atrasado e alonga ao se mover)
  const vl = 1 + Math.max(0, lag) * 0.8;
  ctx.fillStyle = hexA(mixHex(C.body, C.dark, 0.2), 0.75);
  ctx.beginPath();
  ctx.moveTo(head.x + 30, head.y - 30);
  ctx.quadraticCurveTo(head.x + 80 * vl, head.y - 34 + Math.sin(ph * 1.3 - 0.8) * 9, head.x + 112 * vl, head.y - 8 + Math.sin(ph * 1.3 - 1.6) * 14);
  ctx.quadraticCurveTo(head.x + 70 * vl, head.y - 6 + Math.sin(ph * 1.3 - 1.2) * 6, head.x + 38, head.y + 6);
  ctx.fill();
  // cabeça: capuz de areia com olhos em brasa
  ctx.fillStyle = vgrad(ctx, head.y - 46, head.y + 30, mixHex(C.body, C.accent, 0.3), mixHex(C.dark, C.body, 0.3));
  ctx.beginPath();
  ctx.moveTo(head.x + 40, head.y + 22);
  ctx.quadraticCurveTo(head.x + 46, head.y - 30, head.x + 4, head.y - 44);
  ctx.quadraticCurveTo(head.x - 40, head.y - 40, head.x - 46, head.y + 6);
  ctx.quadraticCurveTo(head.x - 40, head.y + 28, head.x, head.y + 30);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = hexA(ink, 0.7);
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = hexA('#000000', 0.6);
  ctx.beginPath();
  ctx.ellipse(head.x - 16, head.y + 2 + c.mouthK * 2, 24, 18 + c.mouthK * 4, 0.1, 0, TAU);
  ctx.fill();
  mouthGlow(ctx, c, C.glow);
  const open = st.anim === 'death' ? 1 - st.p : blink(t, 4.6);
  eyeGlow(ctx, head.x - 26, head.y - 2, 5.5 + st.rage * 2, C.eye, open);
  eyeGlow(ctx, head.x - 6, head.y - 4, 5 + st.rage * 2, C.eye, open);

  // braço da frente
  sandArm(ctx, F, c, 1);
  castGlow(ctx, c, C.glow);

  // pedras da frente
  for (const r of rocks) if (r.d >= 0) rock(ctx, r.x, Math.min(r.y, -8), 10 + (r.i % 3) * 5, r.a * 2 + r.i, C, 1);

  // grãos voando (arrastados pelo movimento)
  ctx.fillStyle = C.accent;
  for (let i = 0; i < 30; i++) {
    const a = spin * 0.5 * (1 + h01(i, 5) * 0.6) + i * 1.7;
    const y = -20 - h01(i, 6) * 260;
    const r = 30 + (Math.abs(y) / 260) * 140 * (0.7 + h01(i, 7) * 0.6);
    ctx.globalAlpha = 0.35 + 0.5 * Math.max(0, Math.sin(a));
    ctx.fillRect(Math.cos(a) * r + lag * 50 * h01(i, 8), y + Math.sin(a) * 10, 3 + Math.abs(lag) * 4, 2);
  }
  ctx.globalAlpha = 1;

  // morte: areia escorrendo e um monte se formando no chão
  if (die > 0.05) {
    ctx.fillStyle = hexA(C.accent, 0.3 * (1 - sm(0.6, 1, die)));
    for (let i = 0; i < 6; i++) {
      const x = -90 + i * 36 + (h01(i, 71) - 0.5) * 20 + Math.sin(t * 6 + i) * 2;
      ctx.fillRect(x - 1.5, -200 + i * 6, 3, 200 * sm(0, 0.5, die));
    }
    const m = sm(0.1, 0.8, die);
    ctx.fillStyle = vgrad(ctx, -70 * m, 0, mixHex(C.body, C.accent, 0.3), mixHex(C.dark, C.body, 0.3));
    ctx.beginPath();
    ctx.moveTo(-170 * m, 0);
    ctx.quadraticCurveTo(-60 * m, -80 * m, 0, -86 * m);
    ctx.quadraticCurveTo(60 * m, -80 * m, 170 * m, 0);
    ctx.closePath();
    ctx.fill();
  }
}

function rock(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, C: Pal, a: number) {
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = vgrad(ctx, -r, r, mixHex(C.dark, C.body, 0.4), mixHex(C.dark, '#000000', 0.3));
  ctx.beginPath();
  ctx.moveTo(-r, -r * 0.3);
  ctx.lineTo(-r * 0.3, -r);
  ctx.lineTo(r * 0.8, -r * 0.6);
  ctx.lineTo(r, r * 0.4);
  ctx.lineTo(r * 0.1, r);
  ctx.lineTo(-r * 0.8, r * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function sandArm(ctx: CanvasRenderingContext2D, A: Arm, c: Ctx, k: number) {
  const { C, t } = c;
  const pts = armCurve(A, 12);
  const g = vgrad(ctx, Math.min(A.sh.y, A.hd.y) - 40, Math.max(A.sh.y, A.hd.y) + 40, k < 1 ? mixHex(C.body, C.dark, 0.4) : C.body, C.dark);
  // ombro maciço
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(A.sh.x, A.sh.y, 40 * k, 0, TAU);
  ctx.fill();
  tube(ctx, pts, (q) => (64 - q * 14) * k, g, { wobble: 0.04, time: t * 0.25, seed: k * 3 });
  // areia escorrendo ao longo do braço
  ctx.strokeStyle = hexA(C.accent, 0.55);
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 14]);
  ctx.lineDashOffset = -t * 60;
  for (const o of [-14, 0, 14]) {
    ctx.beginPath();
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const nx = -(b.y - a.y), ny = b.x - a.x, l = Math.hypot(nx, ny) || 1;
      const x = p.x + (nx / l) * o * k, y = p.y + (ny / l) * o * k;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // punho: rocha envolta em areia girando
  rock(ctx, A.hd.x, A.hd.y, 36 * k, t * 0.3, C, 1);
  ctx.strokeStyle = hexA(C.accent, 0.6);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(A.hd.x, A.hd.y, 46 * k, 16 * k, A.ang, (t * 5) % TAU, (t * 5) % TAU + 3.6);
  ctx.stroke();
}
