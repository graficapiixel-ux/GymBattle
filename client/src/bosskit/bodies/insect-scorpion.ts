/**
 * INSETO 1 — ESCORPIÃO REI (Azhrak).
 * 8 pernas em marcha tetrápode (4 apoiadas, 4 no ar, com onda de trás para a frente),
 * cauda segmentada que chicoteia com atraso (cada gomo segue o anterior) e pinças vivas.
 */
import type { BossSpec } from '@gymbattle/shared';
import type { Anchors, DrawState, V } from '../types';
import { TAU, clamp, eyeGlow, hexA, magicCircle, mixHex, sm, vgrad } from '../util';
import {
  add, beatAt, bloom, colors, fidget, footShadows, gaitBob, gaitOf, idHash, leg, lerp, limb, poseW, rot, smear, stepFoot,
  NOBEAT, type PW,
} from './insect-rig';

const PIV: V = { x: 40, y: -60 };
const LY = -66; // altura da linha do corpo
const SEG = [52, 48, 45, 42, 38, 34];

/** Forma da cauda (ângulo da base e curvatura) num progresso pp — avaliada com atraso por gomo. */
function tailAt(st: DrawState, w: PW, pp: number, i: number) {
  const b = st.anim === 'attack' ? beatAt(pp) : NOBEAT;
  const t = st.t - i * 0.09;
  const mv = clamp(st.move);
  let base = -0.78 + Math.sin(t * 1.6) * 0.05 + Math.sin(st.gait * 4 * Math.PI - i * 0.7) * 0.05 * mv;
  let curl = 0.36 + Math.sin(t * 1.1 + 1) * 0.02;
  const P = (kk: number, wb: number, wc: number, sb: number, sc: number) => {
    if (kk <= 0) return;
    base = lerp(base, lerp(lerp(base, wb, b.ant), sb, b.hit), kk);
    curl = lerp(curl, lerp(lerp(curl, wc, b.ant), sc, b.hit), kk);
  };
  // varrida: arma para trás e chicoteia por cima da cabeça
  P(w.swipe, -0.55, 0.3, -1.4, 0.44);
  P(w.charge, -0.5, 0.3, -1.1, 0.46);
  // veneno: ergue alto, ferrão apontado para a frente
  P(w.cast + w.shoot, -1.3, 0.23, -1.2, 0.38);
  P(w.slam, -0.95, 0.3, -0.7, 0.42);
  P(w.roar, -1.0, 0.33, -1.05, 0.36);
  base += w.roar * (b.ant + b.hit) * Math.sin(st.t * 55 - i) * 0.04; // chocalho de ameaça
  curl += b.ov * (w.swipe + w.charge) * 0.06;
  base += -st.hurt * 0.25;
  if (st.anim === 'death') {
    const d = st.p;
    base += sm(0, 0.2, d) * -0.3 * (1 - sm(0.3, 0.5, d)) + sm(0.35, 0.9, d - i * 0.02) * 0.75;
    curl += -sm(0.4, 0.95, d - i * 0.03) * 0.3;
  }
  return { base, curl };
}

/** Ângulos de uma pinça (braço ua, antebraço fa, abertura) no progresso pp. */
function pincerAt(st: DrawState, w: PW, pp: number, ph: number) {
  const b = st.anim === 'attack' ? beatAt(pp) : NOBEAT;
  const mv = clamp(st.move);
  let ua = 3.75 + Math.sin(st.t * 1.3 + ph) * 0.05 + Math.sin(st.gait * TAU + ph) * 0.06 * mv;
  let fa = 2.95 + Math.sin(st.t * 1.7 + ph) * 0.04;
  // abre e fecha devagar (testando o ar), e às vezes dá um estalo
  let open = 0.25 + Math.sin(st.t * 2 + ph) * 0.12 + Math.max(0, Math.sin(st.t * 0.9 + ph * 3)) ** 8 * 0.4;
  const P = (kk: number, w1: number, w2: number, wo: number, s1: number, s2: number, so: number) => {
    if (kk <= 0) return;
    ua = lerp(ua, lerp(lerp(ua, w1, b.ant), s1, b.hit), kk);
    fa = lerp(fa, lerp(lerp(fa, w2, b.ant), s2, b.hit), kk);
    open = lerp(open, lerp(lerp(open, wo, b.ant), so, b.hit), kk);
  };
  P(w.swipe, 4.35, 4.1, 0.85, 3.05, 2.8, -0.1);
  P(w.charge, 3.45, 3.25, 0.8, 3.1, 3.05, 0);
  P(w.slam, 4.5, 4.65, 0.95, 3.2, 3.0, -0.05);
  P(w.cast + w.shoot, 4.05, 3.75, 0.7, 3.95, 3.55, 0.9);
  P(w.roar, 4.35, 4.7, 1, 4.45, 4.9, 1.1);
  ua += b.ov * (w.swipe + w.slam) * -0.1;
  open += w.roar * (b.ant + b.hit) * Math.sin(st.t * 40 + ph) * 0.15;
  ua -= st.hurt * 0.3;
  open += st.hurt * 0.4;
  if (st.anim === 'death') {
    const d = st.p;
    ua += -sm(0, 0.2, d) * 0.5 * (1 - sm(0.3, 0.55, d)) + sm(0.4, 0.8, d) * 0.15;
    fa += sm(0.4, 0.8, d) * 0.12;
    open = lerp(open, 0.6, sm(0.5, 0.9, d));
  }
  return { ua, fa, open };
}

function pincerGeo(S: V, ua: number, fa: number, dy: number) {
  const E = { x: S.x + Math.cos(ua) * 54, y: S.y + Math.sin(ua) * 54 + dy };
  const W = { x: E.x + Math.cos(fa) * 46, y: E.y + Math.sin(fa) * 46 };
  const tip = { x: W.x + Math.cos(fa) * 98, y: W.y + Math.sin(fa) * 98 };
  const mid = { x: W.x + Math.cos(fa) * 40, y: W.y + Math.sin(fa) * 40 };
  return { E, W, tip, mid };
}

export function scorpion(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState): Anchors {
  const c = colors(s, st);
  const w = poseW(st);
  const p = st.p;
  const bt = st.anim === 'attack' ? beatAt(p) : NOBEAT;
  const { ant: a, hit: h, imp: im } = bt;
  const die = st.anim === 'death' ? p : 0;
  const seed = idHash(s.id);
  const G = gaitOf(st, 1, 18);
  const br = Math.sin(st.t * 1.5);
  const glowA = clamp(0.5 + st.rage * 0.4 + w.on * (a + h) * 0.5) * (1 - die);

  // ---------------------------------------------------------------- corpo
  let ox = 24, oy = 0, pitch = 0;
  oy += gaitBob(G, 4) + br * 1.2;
  pitch += Math.sin(G.g * TAU) * 0.015 * G.mv - 0.02 * G.mv * G.dir;
  ox += -G.dir * G.mv * 4;
  const idle = (1 - G.mv) * (1 - w.on * 0.7) * (1 - die);
  ox += Math.sin(st.t * 0.8) * 3 * idle;
  // golpes
  ox += w.swipe * (a * 18 - h * 34) + w.charge * (a * 22 - h * 40) + w.slam * (a * 10 - h * 18) + (w.cast + w.shoot) * (a * 8 - h * 6);
  oy += w.swipe * (a * 6 + im * 6) + w.slam * (-a * 4 + h * 8 + im * 10) + w.charge * a * 8 + w.roar * -a * 6;
  pitch += w.slam * (a * 0.24 - h * 0.13) + w.roar * (a * 0.18 + h * 0.1) + (w.cast + w.shoot) * a * 0.08
    + w.swipe * (a * 0.05 - h * 0.08) - w.charge * h * 0.06;
  ox += w.roar * (a + h) * Math.sin(st.t * 63) * 2 + im * Math.sin(p * 150) * 3;
  // dano
  ox += st.hurt * 16;
  pitch += st.hurt * 0.06;
  // morte: cambaleia, as pernas cedem e o corpo cai chapado
  if (die > 0) {
    ox += sm(0, 0.2, die) * 14 + Math.sin(die * 30) * 5 * (1 - sm(0.2, 0.4, die));
    oy += 46 * Math.pow(sm(0.22, 0.62, die), 2) - 5 * Math.sin(Math.PI * sm(0.62, 0.78, die));
    pitch += 0.12 * sm(0, 0.2, die) * (1 - sm(0.25, 0.5, die)) - 0.06 * sm(0.4, 0.7, die);
  }
  const Bf = (q: V): V => add(rot(q, PIV, pitch), ox, oy);

  // ---------------------------------------------------------------- pernas
  const spread = 1 + sm(0.22, 0.62, die) * 0.25;
  const curl = sm(0.66, 1, die);
  const nearX = [-64, -40, -14, 12], farX = [-50, -26, 0, 26];
  const nearF = [-152, -86, -22, 54], farF = [-116, -52, 12, 88];
  const legOf = (i: number, near: boolean) => {
    const hip = Bf({ x: (near ? nearX : farX)[i], y: LY + (near ? 6 : -4) });
    const ph = ((i + (near ? 0 : 1)) % 2) * 0.5 - i * 0.05;
    let f: V = stepFoot(G, (near ? nearF : farF)[i] * spread + 24, ph);
    f = add(f, 0, -fidget(st, i + (near ? 0 : 4), 8, Math.floor(seed * 89), idle) * 12);
    // patas da frente se firmam no bote; de trás empurram
    f.x += (w.swipe + w.charge) * (i < 2 ? -a * 6 - h * 14 : a * 4 + h * 8) * (1 - sm(0.6, 0.85, p));
    if (curl > 0) {
      const out = f.x < hip.x ? -1 : 1;
      const tw = Math.sin(st.t * 32 + i * 2.1) * 5 * sm(0.68, 0.76, die) * (1 - sm(0.88, 1, die));
      // pernas abrem chapadas para os lados (o corpo desaba no chão)
      f = { x: lerp(f.x, hip.x + out * 138, curl), y: lerp(f.y, -4 + tw, curl) };
    }
    return { hip, f };
  };
  const near = [0, 1, 2, 3].map((i) => legOf(i, true));
  const far = [0, 1, 2, 3].map((i) => legOf(i, false));
  footShadows(ctx, [...near, ...far].map((l) => l.f), 10);
  const farLook = { w: 10, fill: c.mid, line: c.line, joint: mixHex(c.accent, c.dark, 0.6), spikes: 1, tars: 13 };
  const nearLook = { w: 13, fill: c.body, line: c.line, hi: hexA(c.accent, 0.45), joint: c.accent, spikes: 2, tars: 14 };
  for (let i = 3; i >= 0; i--) leg(ctx, far[i].hip, far[i].f, 64, 72, farLook);

  // ---------------------------------------------------------------- cauda (chicote com atraso por gomo)
  const tail: V[] = [Bf({ x: 108, y: -84 })];
  let ang = 0;
  for (let i = 0; i < SEG.length; i++) {
    const tp = tailAt(st, w, p - i * 0.014, i);
    if (i === 0) ang = tp.base + pitch;
    ang -= tp.curl;
    const q = tail[i];
    tail.push({ x: q.x + Math.cos(ang) * SEG[i], y: q.y + Math.sin(ang) * SEG[i] });
  }
  // não deixa a cauda atravessar o chão (morte)
  for (const q of tail) q.y = Math.min(q.y, -14);
  for (let i = 0; i < SEG.length; i++) {
    const A = tail[i], Z = tail[i + 1];
    const wd = 34 - i * 3.2;
    const sa = Math.atan2(Z.y - A.y, Z.x - A.x);
    const mx = (A.x + Z.x) / 2, my = (A.y + Z.y) / 2;
    ctx.fillStyle = c.line;
    ctx.beginPath();
    ctx.ellipse(mx, my, SEG[i] * 0.58, wd * 0.56, sa, 0, TAU);
    ctx.fill();
    ctx.fillStyle = vgrad(ctx, my - wd, my + wd, c.light, c.body);
    ctx.beginPath();
    ctx.ellipse(mx, my, SEG[i] * 0.52, wd * 0.5, sa, 0, TAU);
    ctx.fill();
    // quilha e brilho do gomo
    ctx.strokeStyle = hexA(c.accent, 0.55);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(mx, my, SEG[i] * 0.4, wd * 0.32, sa, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  }
  // ferrão
  const end = tail[tail.length - 1];
  const tAng = ang - 0.2;
  ctx.save();
  ctx.translate(end.x, end.y);
  ctx.rotate(tAng);
  ctx.fillStyle = c.line;
  ctx.beginPath();
  ctx.ellipse(16, 0, 25, 20, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = vgrad(ctx, -18, 18, mixHex(c.accent, c.body, 0.3), c.dark);
  ctx.beginPath();
  ctx.ellipse(16, 0, 22, 17, 0, 0, TAU);
  ctx.fill();
  // veias de veneno pulsando
  ctx.strokeStyle = hexA('#9aff4a', glowA * (0.4 + 0.3 * Math.sin(st.t * 4)));
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(2, -4);
  ctx.quadraticCurveTo(16, -12, 32, -4);
  ctx.moveTo(4, 5);
  ctx.quadraticCurveTo(18, 10, 32, 4);
  ctx.stroke();
  ctx.fillStyle = c.T(mixHex(s.pal.glow, '#ffffff', 0.2));
  ctx.beginPath();
  ctx.moveTo(30, 10);
  ctx.quadraticCurveTo(54, 6, 62, -22);
  ctx.quadraticCurveTo(46, -6, 30, -10);
  ctx.fill();
  ctx.restore();
  const stinger = add(end, Math.cos(tAng) * 58 + Math.sin(tAng) * 18, Math.sin(tAng) * 58 - Math.cos(tAng) * 18);
  const venom = (w.cast + w.shoot) * (a + h);
  bloom(ctx, stinger.x, stinger.y, 34 + venom * 40, s.pal.glow, glowA * 0.8);
  if (venom > 0.05) magicCircle(ctx, stinger.x, stinger.y, 40 * clamp(venom), '#9aff4a', clamp(venom) * 0.6, st.t * 3, 0.5);
  const dp = (st.t * (0.7 + venom)) % 1;
  ctx.fillStyle = hexA('#9aff4a', (1 - dp) * glowA);
  ctx.beginPath();
  ctx.arc(stinger.x, stinger.y + dp * 40, 3.5 + venom * 2, 0, TAU);
  ctx.fill();

  // ---------------------------------------------------------------- pinça de trás (atrás do corpo)
  const drawPincer = (sh: V, dy: number, col: string, ph: number, lag: number) => {
    const S = Bf(sh);
    const pa = pincerAt(st, w, p - lag, ph);
    const g = pincerGeo(S, pa.ua + pitch, pa.fa + pitch, dy);
    limb(ctx, S, g.E, 22, 18, col, c.line, hexA(c.light, 0.5));
    limb(ctx, g.E, g.W, 18, 16, col, c.line, hexA(c.light, 0.5));
    ctx.fillStyle = c.accent;
    ctx.beginPath();
    ctx.arc(g.E.x, g.E.y, 6, 0, TAU);
    ctx.fill();
    // mão (quela) inchada + dedos
    ctx.save();
    ctx.translate(g.W.x, g.W.y);
    ctx.rotate(pa.fa + pitch);
    ctx.fillStyle = c.line;
    ctx.beginPath();
    ctx.ellipse(20, 0, 39, 28, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = vgrad(ctx, -26, 26, mixHex(col, '#ffffff', 0.28), mixHex(col, '#000000', 0.4));
    ctx.beginPath();
    ctx.ellipse(20, 0, 36, 25, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = hexA(c.accent, 0.75);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(20, 0, 30, 19, 0, -2.4, -0.4);
    ctx.stroke();
    ctx.fillStyle = hexA('#ffffff', 0.15);
    ctx.beginPath();
    ctx.ellipse(14, -10, 18, 6, -0.2, 0, TAU);
    ctx.fill();
    const o = clamp(pa.open, -0.15, 1.15);
    for (const sd of [-1, 1]) {
      ctx.save();
      ctx.translate(48, sd * 8);
      ctx.rotate(sd * o * 0.55);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, -sd * 10);
      ctx.quadraticCurveTo(30, -sd * 11, 52, sd * 4);
      ctx.quadraticCurveTo(26, sd * 6, 0, sd * 8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = c.line;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // dentes internos
      ctx.fillStyle = c.accent;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.moveTo(12 + k * 11, sd * 4);
        ctx.lineTo(16 + k * 11, sd * -1);
        ctx.lineTo(20 + k * 11, sd * 4);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
    return { S, pa, g };
  };
  drawPincer({ x: -90, y: LY - 14 }, -10, mixHex(mixHex(c.body, c.accent, 0.22), c.dark, 0.35), 1.3, 0.025);

  // ---------------------------------------------------------------- corpo (placas + cefalotórax)
  ctx.save();
  ctx.translate(ox, oy);
  ctx.translate(PIV.x, PIV.y);
  ctx.rotate(pitch);
  ctx.translate(-PIV.x, -PIV.y);
  for (let i = 4; i >= 0; i--) {
    const x = 6 + i * 24, wd = 30 - i * 1.5, hg = 40 - i * 2;
    const pb = Math.sin(st.t * 2.2 - i * 0.7) * 1.2; // respiração em onda pelas placas
    ctx.fillStyle = c.line;
    ctx.beginPath();
    ctx.ellipse(x, LY - 10, wd + 2.5, hg + 2.5 + pb, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = vgrad(ctx, LY - 54, LY + 30, c.light, c.dark);
    ctx.beginPath();
    ctx.ellipse(x, LY - 10, wd, hg + pb, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = hexA(c.accent, 0.6);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, LY - 10, hg, -2.2, -0.9);
    ctx.stroke();
  }
  // cefalotórax
  const ceph = () => {
    ctx.beginPath();
    ctx.moveTo(-122, LY - 4);
    ctx.quadraticCurveTo(-110, LY - 48, -40, LY - 50);
    ctx.quadraticCurveTo(10, LY - 46, 20, LY - 10);
    ctx.quadraticCurveTo(0, LY + 26, -60, LY + 22);
    ctx.quadraticCurveTo(-112, LY + 18, -122, LY - 4);
  };
  ctx.fillStyle = vgrad(ctx, LY - 50, LY + 30, c.light, c.dark);
  ceph();
  ctx.fill();
  ctx.strokeStyle = c.line;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = hexA('#ffffff', 0.12);
  ctx.beginPath();
  ctx.ellipse(-56, LY - 36, 40, 8, -0.05, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = hexA(c.accent, 0.65);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-100, LY - 30);
  ctx.quadraticCurveTo(-50, LY - 54, 0, LY - 36);
  ctx.stroke();
  const eo = st.anim === 'death' ? 1 - die : (st.t + seed * 3) % 3.9 < 0.1 ? 0.2 : 1;
  eyeGlow(ctx, -86, LY - 34, 6 + st.rage * 2, s.pal.eye, eo);
  eyeGlow(ctx, -70, LY - 40, 5 + st.rage * 2, s.pal.eye, eo);
  for (let i = 0; i < 3; i++) eyeGlow(ctx, -112 + i * 6, LY - 16 - i * 4, 2.5, s.pal.eye, eo);
  // quelíceras (mastigam o tempo todo)
  const chew = Math.sin(st.t * 9) * 0.5 + 0.5;
  const jaw = clamp(w.roar * (a + h) + st.hurt + w.swipe * h * 0.6) + chew * 0.25;
  ctx.fillStyle = c.dark;
  for (const [dx, k] of [[0, 1], [6, -1]] as const) {
    ctx.save();
    ctx.translate(-118 + dx, LY - 4);
    ctx.rotate(0.2 + k * jaw * 0.3);
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-22, 6);
    ctx.lineTo(-4, 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // ---------------------------------------------------------------- pernas da frente
  for (let i = 3; i >= 0; i--) leg(ctx, near[i].hip, near[i].f, 68, 76, nearLook);

  // ---------------------------------------------------------------- pinça da frente + rastro
  const fr = drawPincer({ x: -104, y: LY + 2 }, 4, mixHex(c.body, c.accent, 0.3), 0, 0);
  if ((w.swipe + w.slam + w.charge) > 0 && p > 0.42 && p < 0.64) {
    const outer: V[] = [], inner: V[] = [];
    for (let i = 0; i < 8; i++) {
      const pa = pincerAt(st, w, p - i * 0.01, 0);
      const g = pincerGeo(fr.S, pa.ua + pitch, pa.fa + pitch, 4);
      outer.push(g.tip);
      inner.push(g.mid);
    }
    smear(ctx, outer, inner, s.pal.glow, 0.8 * (1 - sm(0.57, 0.64, p)));
  }

  return {
    mouth: stinger,
    hand: fr.g.tip,
    core: Bf({ x: -20, y: LY - 10 }),
    top: Math.min(-260, stinger.y - 40, tail[4].y - 30),
    halfW: 160,
  };
}

