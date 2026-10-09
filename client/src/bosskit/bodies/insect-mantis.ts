/**
 * INSETO 0 — LOUVA-A-DEUS RAINHA (Thessa).
 * Anda nas 4 pernas em pares diagonais (marcha de inseto), balança como folha ao vento
 * parada e reza com as foices. Coordenadas internas (antes da escala 1,12 do arquétipo).
 */
import type { BossSpec } from '@gymbattle/shared';
import type { Anchors, DrawState, V } from '../types';
import { TAU, clamp, eyeGlow, hexA, magicCircle, mixHex, orb, sm, vgrad } from '../util';
import {
  add, beatAt, bloom, colors, fidget, footShadows, gaitBob, gaitOf, idHash, leg, lerp, limb, poseW, rot, smear, stepFoot,
  type Beat, type PW,
} from './insect-rig';

const KS = 1.12;
const WAIST: V = { x: 8, y: -122 };

/** Ângulos das foices (fêmur a1, tíbia a2) no progresso pp — avaliado também atrasado. */
function armAngles(st: DrawState, w: PW, pp: number, lag: number, back = false) {
  const b = st.anim === 'attack' ? beatAt(pp) : { ant: 0, hit: 0, imp: 0, ov: 0 };
  const G = clamp(st.move);
  // repouso "rezando": fêmur erguido para a frente e a tíbia (foice) dobrada para baixo, colada nele
  const air = clamp(st.air ?? 0);
  let a1 = -2.42 + Math.sin(st.t * 1.4 + lag) * 0.05 + Math.sin(st.gait * TAU + 0.8 + lag) * 0.08 * G - air * 0.25;
  let a2 = 1.22 + Math.sin(st.t * 2.1 + 0.5 + lag * 2) * 0.05 + Math.sin(st.gait * TAU + 1.6 + lag) * 0.06 * G - air * 0.2;
  const P = (kk: number, w1: number, w2: number, s1: number, s2: number, o1: number, o2: number) => {
    if (kk <= 0) return;
    const r1 = lerp(lerp(a1, w1, b.ant), s1, b.hit) + o1 * b.ov;
    const r2 = lerp(lerp(a2, w2, b.ant), s2, b.hit) + o2 * b.ov;
    a1 = lerp(a1, r1, kk);
    a2 = lerp(a2, r2, kk);
  };
  P(w.swipe, -2.05, -0.95, -3.3, -3.62, -0.22, -0.18);
  P(w.charge, -2.35, 0.6, -3.05, -3.1, -0.08, -0.1);
  P(w.cast, -1.5, -1.3, -2.95, -2.6, -0.15, -0.25);
  P(w.shoot, -2.2, 0.6, -3.35, 0.35, 0, 0);
  P(w.roar, -2.45, -1.55, -2.6, -1.75, 0, 0);
  P(w.slam, -1.55, -1.2, -3.6, -4.25, -0.2, -0.2);
  // braço de trás abre para o outro lado (ameaça: foices escancaradas)
  if (back) {
    a1 += w.roar * (b.ant + b.hit) * 0.75 + w.cast * b.ant * 0.35;
    a2 += w.roar * (b.ant + b.hit) * 0.5 + w.cast * b.ant * 0.3;
  }
  // tremor da reza no rugido
  a1 += w.roar * (b.ant + b.hit) * Math.sin(st.t * 47 + lag) * 0.035;
  a1 += st.hurt * 0.45;
  a2 += st.hurt * 0.35;
  if (st.anim === 'death') {
    const d = st.p;
    a1 += sm(0, 0.25, d) * 0.6 * (1 - sm(0.3, 0.6, d)) + sm(0.35, 0.8, d) * 0.75;
    a2 += sm(0.35, 0.85, d) * 1.1 + Math.sin(st.t * 28 + lag) * 0.12 * sm(0.7, 0.8, d) * (1 - sm(0.88, 1, d));
  }
  return { a1, a2 };
}

/** Geometria de uma foice no referencial do tronco. */
function armGeo(S: V, a1: number, a2: number) {
  const cx = { x: S.x - 16, y: S.y + 34 };
  const E = { x: cx.x + Math.cos(a1) * 88, y: cx.y + Math.sin(a1) * 88 };
  const T = { x: E.x + Math.cos(a2) * 94, y: E.y + Math.sin(a2) * 94 };
  const M = { x: E.x + Math.cos(a2) * 55, y: E.y + Math.sin(a2) * 55 };
  return { cx, E, T, M };
}

export function mantis(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState): Anchors {
  const c = colors(s, st);
  const w = poseW(st);
  const p = st.p;
  const bt: Beat = st.anim === 'attack' ? beatAt(p) : { ant: 0, hit: 0, imp: 0, ov: 0 };
  const { ant: a, hit: h, imp: im } = bt;
  const die = st.anim === 'death' ? p : 0;
  const seed = idHash(s.id);
  const G = gaitOf(st, KS, 24);
  const br = Math.sin(st.t * 1.5);

  // ---------------------------------------------------------------- corpo: posição e inclinação
  let ox = 0, oy = 0, lean = 0;
  // locomoção: afunda a cada pisada, inclina para onde anda, gingado lateral
  oy += gaitBob(G, 6);
  ox += -G.dir * G.mv * 6;
  lean += -0.06 * G.mv * G.dir + Math.sin(G.g * TAU) * 0.025 * G.mv;
  // parada: balança como folha ao vento (comportamento de louva-a-deus)
  const idle = (1 - G.mv) * (1 - w.on * 0.7) * (1 - die) * (1 - clamp(st.air ?? 0));
  ox += Math.sin(st.t * 1.1) * 6 * idle;
  lean += Math.sin(st.t * 1.1 - 0.7) * 0.03 * idle + br * 0.012;
  oy += br * 1.5;
  // golpes
  ox += w.swipe * (a * 14 - h * 30) + w.charge * (a * 26 - h * 50) + w.shoot * (a * 8 + im * 14) + w.slam * (a * 10 - h * 24);
  oy += w.swipe * (a * 12 - h * 4 + im * 6) + w.charge * (a * 22) + w.cast * (-a * 8 + h * 4) + w.roar * (-a * 8) + w.slam * (-a * 6 + h * 12);
  lean += w.swipe * (a * 0.17 - h * 0.34) + w.charge * (a * 0.06 - h * 0.26) + w.cast * (a * 0.24 - h * 0.08)
    + w.shoot * (a * 0.08 - h * 0.16 + im * 0.06) + w.roar * (a * 0.3 + h * 0.18) + w.slam * (a * 0.22 - h * 0.42);
  // salto predador: decola em 0,42 e aterrissa no impacto
  const jump = w.charge * Math.sin(Math.PI * sm(0.4, 0.555, p)) * (1 - sm(0.555, 0.56, p));
  oy -= jump * 46;
  oy += w.charge * im * 16;
  // tremor do rugido e tranco do impacto
  ox += w.roar * (a + h) * Math.sin(st.t * 61) * 2.2 + im * Math.sin(p * 140) * 3;
  // dano: tranco para trás
  ox += st.hurt * 18;
  oy -= st.hurt * 5;
  lean += st.hurt * 0.16;
  // morte: cambaleia, empina, desmorona para a frente e quica
  let drop = 0;
  if (die > 0) {
    ox += sm(0, 0.22, die) * 20 - sm(0.3, 0.7, die) * 26 + Math.sin(die * 26) * 7 * sm(0, 0.08, die) * (1 - sm(0.25, 0.4, die));
    drop = 90 * Math.pow(sm(0.24, 0.68, die), 2) - 9 * Math.sin(Math.PI * sm(0.68, 0.84, die));
    lean += 0.32 * sm(0, 0.22, die) * (1 - sm(0.28, 0.55, die)) - 0.78 * sm(0.34, 0.7, die) + 0.07 * Math.sin(Math.PI * sm(0.68, 0.84, die));
    oy += drop;
  }
  const B = (q: V): V => ({ x: q.x + ox, y: q.y + oy }); // tórax
  const U = (q: V): V => B(rot(q, WAIST, lean)); // tronco que inclina

  // ---------------------------------------------------------------- pernas (pés no chão)
  const feetK = 1 - sm(0.68, 0.9, die);
  const spread = 1 + sm(0.24, 0.7, die) * 0.3;
  const curl = sm(0.7, 1, die);
  const legs = [
    // [quadril, base do pé, fase, perto?, l1, l2]
    { hip: { x: 0, y: -120 }, base: -52, ph: 0.54, near: false, l1: 72, l2: 86 },
    { hip: { x: 32, y: -112 }, base: 128, ph: 0.04, near: false, l1: 84, l2: 94 },
    { hip: { x: -8, y: -116 }, base: -84, ph: 0, near: true, l1: 74, l2: 88 },
    { hip: { x: 26, y: -108 }, base: 98, ph: 0.5, near: true, l1: 84, l2: 94 },
  ];
  const feet: V[] = [];
  const legPos = legs.map((L, i) => {
    const hip = B(L.hip);
    let f: V = stepFoot(G, L.base * spread, L.ph);
    // troca de peso no idle / pernas firmes no salto
    f = add(f, 0, -fidget(st, i, 4, Math.floor(seed * 97), idle) * 16);
    f.y -= jump * (L.base < 0 ? 34 : 18);
    // no ar (salto/voo): pernas encolhidas sob o corpo
    const air0 = clamp(st.air ?? 0);
    if (air0 > 0) f = { x: lerp(f.x, hip.x + (L.base < 0 ? -26 : 34), air0 * 0.8), y: lerp(f.y, hip.y + 58, air0 * 0.8) };
    // no salto, as pernas de trás empurram (esticam para trás)
    f.x += w.charge * (L.base > 0 ? a * 10 + h * 22 : -a * 6 - h * 16) * (1 - sm(0.54, 0.74, p));
    if (curl > 0) {
      // patas encolhem para cima, tremendo (inseto morrendo)
      const out = L.base < 0 ? -1 : 1;
      const tw = Math.sin(st.t * 30 + i * 1.7) * 6 * sm(0.72, 0.8, die) * (1 - sm(0.9, 1, die));
      f = { x: lerp(f.x, hip.x + out * 46, curl), y: lerp(f.y, Math.min(-4, hip.y - 4) + tw, curl * (1 - feetK * 0.3)) };
    }
    feet.push(f);
    return { hip, f };
  });
  footShadows(ctx, feet, 12);

  const farLeg = { w: 9, fill: c.mid, line: c.line, joint: c.dark, spikes: 2, tars: 14 };
  const nearLeg = { w: 11, fill: c.body, line: c.line, hi: hexA(mixHex(c.light, '#ffffff', 0.3), 0.6), joint: c.accent, spikes: 2, tars: 15 };
  for (let i = 0; i < 2; i++) leg(ctx, legPos[i].hip, legPos[i].f, legs[i].l1, legs[i].l2, farLeg);

  // ---------------------------------------------------------------- asas abertas (atrás de tudo)
  const air = clamp(st.air ?? 0);
  const wingOpen = clamp(w.roar * (a + h) + w.cast * 0.7 * (a + h) + w.charge * (a * 0.3 + h) * 0.9 + st.rage * 0.12
    + sm(0, 0.2, die) * (1 - sm(0.3, 0.6, die)) * 0.8 + air * 1.2);
  // no ar as asas batem rápido de verdade (borrão de inseto); no chão só vibram
  const buzz = Math.sin(st.t * 38) * 0.06 * wingOpen + Math.sin(st.t * 72) * 0.42 * air;
  // no ar: imagens fantasma das asas em outras fases da batida (borrão de movimento)
  const ghosts = air > 0.2 ? [-0.75, -0.4, 0] : [0];
  if (wingOpen > 0.04) for (const gph of ghosts) {
    const gb = gph ? Math.sin(st.t * 72 + gph * 2.4) * 0.42 * air + Math.sin(st.t * 38) * 0.06 * wingOpen : buzz;
    ctx.save();
    ctx.translate(10 + ox, -140 + oy);
    for (const [i, col] of [[1, c.dark], [0, c.body]] as const) {
      ctx.save();
      ctx.rotate(0.22 - wingOpen * (0.95 + i * 0.5) + gb * (i ? -1 : 1));
      ctx.globalAlpha = (0.6 - air * 0.2) * clamp(wingOpen * 3) * (gph ? 0.3 : 1);
      ctx.fillStyle = vgrad(ctx, -50, 30, mixHex(col, s.pal.glow, 0.45), hexA(col, 0.6));
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(90, -48 - i * 6, 196, -8);
      ctx.quadraticCurveTo(116, 24, 0, 10);
      ctx.fill();
      ctx.strokeStyle = hexA(mixHex(s.pal.glow, '#ffffff', 0.3), 0.55);
      ctx.lineWidth = 1.3;
      for (let v = 0; v < 5; v++) {
        ctx.beginPath();
        ctx.moveTo(4, 2);
        ctx.quadraticCurveTo(80 + v * 10, -30 + v * 8, 180 - v * 20, -8 + v * 6);
        ctx.stroke();
      }
      // ocelo da asa (mancha de olho falso que assusta)
      ctx.fillStyle = hexA(s.pal.accent, 0.7);
      ctx.beginPath();
      ctx.arc(120, -16, 9, 0, TAU);
      ctx.fill();
      ctx.fillStyle = hexA(c.line, 0.8);
      ctx.beginPath();
      ctx.arc(120, -16, 4, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- abdômen (atrasa, pulsa)
  const abA = 0.2 + Math.sin(st.t * 1.5 + 0.8) * 0.025 + Math.sin(G.g * 4 * Math.PI - 1.3) * 0.04 * G.mv
    - w.roar * (a + h) * 0.32 - w.cast * a * 0.12 + w.swipe * (a * -0.08 + h * 0.1) + st.hurt * 0.08 + lean * 0.35
    - sm(0.34, 0.7, die) * 0.15;
  const pulse = 1 + Math.sin(st.t * 2.3) * 0.035 + w.on * (a + h) * 0.03;
  ctx.save();
  ctx.translate(ox, -116 + oy);
  ctx.rotate(abA);
  ctx.scale(1, pulse);
  ctx.fillStyle = vgrad(ctx, -42, 42, c.light, c.dark);
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.quadraticCurveTo(96, -48, 182, -8);
  ctx.quadraticCurveTo(198, 4, 182, 14);
  ctx.quadraticCurveTo(96, 46, 0, 18);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = c.line;
  ctx.lineWidth = 2;
  ctx.stroke();
  // segmentos que respiram (cada anel com fase própria)
  ctx.strokeStyle = hexA(c.dark, 0.65);
  for (let i = 0; i < 6; i++) {
    const x = 30 + i * 25 + Math.sin(st.t * 2.3 - i * 0.6) * 1.5;
    const hgt = 31 - Math.abs(i - 2) * 3 - (i > 3 ? (i - 3) * 6 : 0);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, -hgt);
    ctx.quadraticCurveTo(x + 7, 0, x, hgt);
    ctx.stroke();
  }
  ctx.fillStyle = hexA('#ffffff', 0.13);
  ctx.beginPath();
  ctx.ellipse(90, -20, 70, 8, -0.05, 0, TAU);
  ctx.fill();
  // asas dobradas por cima (acompanham o abdômen)
  if (wingOpen < 0.5) {
    ctx.globalAlpha = 0.85 * (1 - wingOpen * 2);
    ctx.rotate(-0.05 + Math.sin(st.t * 31) * 0.004 * (G.mv + w.on));
    ctx.fillStyle = vgrad(ctx, -40, 10, mixHex(c.body, '#ffffff', 0.28), mixHex(c.body, c.dark, 0.2));
    ctx.beginPath();
    ctx.moveTo(-6, -30);
    ctx.quadraticCurveTo(100, -46, 202, -6);
    ctx.quadraticCurveTo(110, -12, -6, -8);
    ctx.fill();
    ctx.strokeStyle = hexA(c.line, 0.6);
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.strokeStyle = hexA(c.dark, 0.6);
    ctx.beginPath();
    ctx.moveTo(4, -20);
    ctx.quadraticCurveTo(100, -30, 196, -6);
    ctx.stroke();
  }
  ctx.restore();

  // ---------------------------------------------------------------- pernas da frente (perto)
  for (let i = 2; i < 4; i++) leg(ctx, legPos[i].hip, legPos[i].f, legs[i].l1, legs[i].l2, nearLeg);

  // cintura (mesotórax)
  ctx.fillStyle = vgrad(ctx, -146 + oy, -100 + oy, c.body, c.dark);
  ctx.beginPath();
  ctx.ellipse(8 + ox, -122 + oy, 36, 20, -0.2 + lean * 0.3, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = c.line;
  ctx.lineWidth = 2;
  ctx.stroke();

  // ---------------------------------------------------------------- tronco que inclina
  ctx.save();
  ctx.translate(ox, oy);
  ctx.translate(WAIST.x, WAIST.y);
  ctx.rotate(lean);
  ctx.translate(-WAIST.x, -WAIST.y);
  const shoulder: V = { x: -44, y: -206 + br * 2 };

  const drawArm = (dx: number, lag: number, col: string, edge: string) => {
    const S = { x: shoulder.x + dx, y: shoulder.y + dx * 0.3 };
    const { a1, a2 } = armAngles(st, w, p - lag, lag * 30, dx > 0);
    const g = armGeo(S, a1, a2);
    // coxa
    limb(ctx, S, g.cx, 18, 15, col, c.line);
    // fêmur grosso com espinhos
    ctx.save();
    ctx.translate(g.cx.x, g.cx.y);
    ctx.rotate(a1);
    ctx.fillStyle = vgrad(ctx, -14, 12, mixHex(col, '#ffffff', 0.18), col);
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.quadraticCurveTo(44, -18, 90, -6);
    ctx.lineTo(90, 6);
    ctx.quadraticCurveTo(44, 15, 0, 9);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = c.line;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // espinhos do fêmur do lado de DENTRO (onde a foice fecha), como num louva-a-deus de verdade
    ctx.fillStyle = edge;
    for (let i = 0; i < 5; i++) {
      const x = 22 + i * 14;
      ctx.beginPath();
      ctx.moveTo(x, -6);
      ctx.lineTo(x + 3, -18);
      ctx.lineTo(x + 7, -6);
      ctx.fill();
    }
    ctx.restore();
    // tíbia = foice
    ctx.save();
    ctx.translate(g.E.x, g.E.y);
    ctx.rotate(a2);
    // a foice: costas grossas por fora, fio afiado e dentes por dentro, gancho na ponta
    ctx.fillStyle = vgrad(ctx, -12, 14, col, mixHex(col, '#ffffff', 0.25));
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.quadraticCurveTo(50, 15, 92, -2);
    ctx.quadraticCurveTo(104, -8, 100, -20);
    ctx.quadraticCurveTo(95, -10, 86, -7);
    ctx.quadraticCurveTo(48, -3, 0, -7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = c.line;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = edge;
    for (let i = 0; i < 6; i++) {
      const x = 14 + i * 12;
      ctx.beginPath();
      ctx.moveTo(x, -4.5);
      ctx.lineTo(x + 2, -11);
      ctx.lineTo(x + 5, -5);
      ctx.fill();
    }
    ctx.strokeStyle = hexA(s.pal.glow, 0.5 + 0.5 * clamp(w.on * (a + h) + st.rage * 0.4));
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(6, -6);
    ctx.quadraticCurveTo(50, -4, 88, -7);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = edge;
    ctx.beginPath();
    ctx.arc(g.E.x, g.E.y, 6.5, 0, TAU);
    ctx.fill();
    return { g, S };
  };

  // braço de trás (atrasado: sobreposição)
  drawArm(14, 0.03, c.mid, mixHex(c.accent, c.dark, 0.4));

  // protórax comprido
  ctx.fillStyle = vgrad(ctx, -250, -120, c.light, c.dark);
  ctx.beginPath();
  ctx.moveTo(-6, -134);
  ctx.quadraticCurveTo(-20, -190, -58, -238 + br);
  ctx.lineTo(-36, -246 + br);
  ctx.quadraticCurveTo(-2, -196, 24, -128);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = c.line;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = hexA(c.light, 0.6);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-2, -140);
  ctx.quadraticCurveTo(-14, -192, -48, -236);
  ctx.stroke();

  // ---- cabeça triangular (estabiliza: compensa parte da inclinação)
  const hb = w.shoot * (a * 20 - h * 46) - w.charge * h * 14 + w.swipe * (a * 16 - h * 8);
  const H: V = { x: -60 + hb, y: -262 + br * 3 - w.roar * a * 6 + w.shoot * (a * 4 + h * 12) };
  const hr = -0.25 - lean * 0.55 - w.roar * a * 0.3 + w.shoot * (a * 0.2 - h * 0.25) + Math.sin(st.t * 0.7 + 1) * 0.06 * idle
    + sm(0.34, 0.8, die) * 0.5;
  const jaw = clamp(w.shoot * (a * 0.5 + h) + w.roar * (a * 0.4 + h * 1.2) + st.hurt * 0.6 + w.charge * h * 0.6 + die * 0.4)
    + Math.sin(st.t * 19) * 0.06;
  ctx.save();
  ctx.translate(H.x, H.y);
  ctx.rotate(hr);
  // antenas (tremem e atrasam o corpo)
  ctx.strokeStyle = c.dark;
  ctx.lineWidth = 2.5;
  for (const sd of [-1, 1]) {
    const lagx = G.dir * G.mv * 10 + st.hurt * 10;
    const tw = Math.sin(st.t * 13 + sd * 2) * 2 + Math.sin(st.t * 2.2 + sd) * 7 + lagx;
    ctx.beginPath();
    ctx.moveTo(sd * 8 - 4, -14);
    ctx.quadraticCurveTo(sd * 30 - 20 + tw * 0.4, -70, sd * 40 - 40 + tw, -96 + Math.abs(tw) * 0.3);
    ctx.stroke();
  }
  ctx.fillStyle = vgrad(ctx, -24, 32, c.light, c.body);
  ctx.beginPath();
  ctx.moveTo(-38, -14);
  ctx.quadraticCurveTo(0, -28, 34, -14);
  ctx.quadraticCurveTo(14, 12, 2, 32);
  ctx.quadraticCurveTo(-18, 12, -38, -14);
  ctx.fill();
  ctx.strokeStyle = c.line;
  ctx.lineWidth = 2;
  ctx.stroke();
  // mandíbulas (tremem sempre um pouquinho)
  ctx.fillStyle = c.dark;
  for (const sd of [-1, 1]) {
    ctx.save();
    ctx.translate(2 + sd * 4, 28);
    ctx.rotate(sd * (0.25 + jaw * 0.65));
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.quadraticCurveTo(sd * 3, 17, sd * -7, 19);
    ctx.lineTo(4, 0);
    ctx.fill();
    ctx.restore();
  }
  if (jaw > 0.12) bloom(ctx, 2, 36, 32 * jaw, s.pal.glow, 0.8 * jaw);
  // olhos compostos gigantes (piscam a película)
  const blink = (st.t + seed * 5) % 4.3 < 0.12 ? 0.25 : 1;
  const eo = (st.anim === 'death' ? 1 - die : 1) * blink;
  for (const [x, y] of [[-30, -12], [26, -12]]) {
    ctx.fillStyle = c.T(mixHex(s.pal.eye, '#000000', 0.45));
    ctx.beginPath();
    ctx.ellipse(x, y, 13, 16, 0.3, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = hexA(c.line, 0.8);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    eyeGlow(ctx, x - 2, y - 2, 6 + st.rage * 2, s.pal.eye, eo);
  }
  ctx.restore();
  const mouthLocal = add(H, Math.cos(hr + Math.PI / 2) * 36 + 2, Math.sin(hr + Math.PI / 2) * 36);

  // braço da frente + rastro do golpe
  const front = drawArm(0, 0, c.body, c.accent);
  if (w.swipe + w.slam + w.cast > 0 && p > 0.4 && p < 0.66) {
    const outer: V[] = [], inner: V[] = [];
    for (let i = 0; i < 8; i++) {
      const { a1, a2 } = armAngles(st, w, p - i * 0.009, 0);
      const g = armGeo(front.S, a1, a2);
      outer.push(g.T);
      inner.push(g.M);
    }
    smear(ctx, outer, inner, s.pal.glow, 0.8 * (1 - sm(0.56, 0.64, p)));
  }
  const tip = front.g.T;
  // magia entre as foices
  const castG = w.cast * clamp(a + h) + w.roar * h * 0.35;
  if (castG > 0.05) {
    const mc = { x: lerp(-120, tip.x, h), y: lerp(-330, tip.y, h) };
    magicCircle(ctx, mc.x, mc.y, 50 * castG, s.pal.glow, castG * 0.8, st.t * 2, 0.4);
    orb(ctx, mc.x, mc.y + 10, 40 * castG, s.pal.glow, castG);
  }
  ctx.restore();

  const out = (q: V): V => ({ x: q.x * KS, y: q.y * KS });
  const headTop = U({ x: H.x, y: H.y - 96 });
  return {
    mouth: out(U(mouthLocal)),
    hand: out(U(tip)),
    core: out(B({ x: -6, y: -150 })),
    top: Math.min(-330, headTop.y) * KS,
    halfW: 150 * KS,
  };
}

