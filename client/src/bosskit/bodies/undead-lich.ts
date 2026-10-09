/**
 * MORTO-VIVO 0 — MORGRATH, o Rei Lich.
 * Anda arrastado e solene, apoiado no cajado (o cajado pousa junto com o pé de trás);
 * pés de osso aparecem sob o manto; manto e trapos vêm com atraso; o crânio tomba a cada pisada.
 */
import type { BossSpec } from '@gymbattle/shared';
import type { Anchors, DrawState, V } from '../types';
import { eyeGlow, hurtTint, mixHex, rgrad, vgrad, TAU, clamp, sm, tube, orb, hexA, bez } from '../util';
import {
  type Arm, type Pal, type Pose, L, LV, armPts, xf, ixf, ik, loco, stepFoot, stepBob, stepJolt, shadow,
  boneHand, skull, boneSeg,
} from './undead-kit';

const HEM = -34; // barra do manto (local), deixa os pés à mostra

export function lich(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState, C: Pal, P: Pose): Anchors {
  const { wu, sk, die, b, imp } = P;
  const t = st.t;
  const G = loco(st);
  // morte: recua (d1), verga (d2) e desmorona dentro do manto (d3)
  const d1 = sm(0, 0.22, die), d2 = sm(0.15, 0.55, die), d3 = sm(0.4, 0.85, die);
  const m = G.m * (1 - die);
  const calm = 1 - P.atk; // partes do andar que somem durante o golpe
  const hurt = st.hurt;

  // ---------------------------------------------------------------- passada
  const duty = 0.6;
  const S = 45 * G.sK;
  const fN = stepFoot(G.u, S, 13 * m, duty);
  const fF = stepFoot(G.u + 0.5, S, 13 * m, duty);
  const bob = stepBob(G.u) * 4.5 * m;
  const jolt = stepJolt(G.u) * m;
  const shift = Math.sin(t * 0.8) * (1 - m) * (1 - P.atk); // troca de peso parado

  // ---------------------------------------------------------------- corpo
  const dx = shift * 4 + hurt * 18 + d1 * 16 - d2 * 8 + P.slam * (wu * 10 - sk * 26) + P.cast * (wu * 8 - sk * 12) - imp * 6 * (P.slam + P.cast);
  const dy = bob + b * 2.8
    + P.slam * (-wu * 16 + sk * 24) + P.cast * (-wu * 14 + sk * 2) + P.roar * (wu * 12 - sk * 16)
    + imp * 8 * P.slam + d2 * 26;
  const lean = -m * 0.06 * G.fwd + Math.sin(G.u * TAU) * 0.025 * m + shift * 0.035
    + hurt * 0.15 + d1 * 0.22 - d2 * 0.36
    + P.cast * (wu * 0.12 - sk * 0.16) + P.slam * (wu * 0.1 - sk * 0.2) + P.roar * (-wu * 0.14 + sk * 0.12)
    + P.charge * (wu * 0.08 - sk * 0.2) + P.swipe * (wu * 0.08 - sk * 0.1);
  const pivot = { x: 0, y: -130 };
  const T = (p: V) => xf(p, pivot, lean, dx, dy);
  const IT = (p: V) => ixf(p, pivot, lean, dx, dy);
  // desmoronar: achata o corpo em volta do chão
  const sqx = 1 + d3 * 0.35, sqy = 1 - d3 * 0.72;
  const SQ = (p: V): V => ({ x: dx + (p.x - dx) * sqx, y: p.y * sqy });
  const glowK = clamp(0.4 + st.rage * 0.4 + P.atk * 0.6) * (1 - die);
  const flick = 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.07;

  // ---------------------------------------------------------------- braços (poses por ângulo)
  const shF = { x: -46, y: -238 }, shB = { x: 44, y: -240 };
  const swing = -Math.cos(G.u * TAU) * 0.22 * m * calm;
  let aF = 0.42 + Math.sin(t * 1.4) * 0.05 + swing, bF = 0.75 + Math.sin(t * 1.1) * 0.06, aB = -0.25, bB = 0.45;
  let sa = 0.06;
  const ck = P.cast;
  // cast: ergue os dois braços (carga) e projeta a mão da frente no golpe
  aF = L(aF, L(L(aF, 2.75, wu), 1.62, sk), ck); bF = L(bF, L(L(bF, 0.5, wu), -0.05, sk), ck);
  aB = L(aB, L(L(aB, 2.3, wu), 1.15, sk), ck); bB = L(bB, L(L(bB, 0.3, wu), 0.35, sk), ck);
  sa = L(sa, L(L(sa, -0.12, wu), 0.75, sk), ck);
  if (P.swipe) { aF = L(L(aF, -0.9, wu), 1.8, sk); bF = L(L(bF, 1.2, wu), -0.1, sk); }
  // roar: encolhe (braços cruzados) e depois escancara tudo
  const rr = P.roar;
  aF = L(aF, L(L(aF, 0.15, wu), 2.35, sk), rr); bF = L(bF, L(L(bF, 1.6, wu), 0.35, sk), rr);
  aB = L(aB, L(L(aB, 0.3, wu), -2.0, sk), rr); bB = L(bB, L(L(bB, 1.2, wu), -0.3, sk), rr);
  sa = L(sa, L(L(sa, 0.25, wu), -0.45, sk), rr);
  const shk = P.shoot * P.hold;
  aF = L(aF, L(0.8, 1.6, sk), shk); bF = L(bF, L(1.5, 0, sk), shk);
  const chk = P.charge * P.hold;
  aF = L(aF, 1.6, chk); bF = L(bF, 0.1, chk); sa = L(sa, 0.6, chk);
  // morte: braços desabam
  aF = L(aF, 0.05, d2); bF = L(bF, 0.2, d2); aB = L(aB, L(-0.6, 0.1, d2), d1); bB = L(bB, 0.2, d1);
  // dano: braços jogados para trás
  aF += hurt * -0.4; aB += hurt * -0.3;
  let armF = armPts(shF, aF, bF, 58, 56);
  let armB = armPts(shB, aB, bB, 58, 56);

  // ---------------------------------------------------------------- cajado
  let up = { x: -Math.sin(sa), y: -Math.cos(sa) };
  const gLoc = IT({ x: dx, y: 0 }).y; // chão em coordenadas locais (aprox.)
  // andar: o cajado pousa no chão junto do pé de trás e serve de apoio
  const wk = (1 - P.atk) * (1 - d1);
  if (wk > 0.001) {
    const gW = IT({ x: dx + 30 + fF.x * 0.9, y: -fF.lift * 1.3 });
    const hand = { x: 52 + fF.x * 0.4, y: -136 + shift * 2 - fF.lift * 0.3 };
    const el = ik(shB, hand, 58, 56, -1);
    const wArm: Arm = { sh: shB, el, hd: hand, ang: Math.atan2(-(hand.x - el.x), hand.y - el.y) };
    armB = blendArm(armB, wArm, wk);
    let ux = armB.hd.x - gW.x, uy = armB.hd.y - gW.y;
    const ul = Math.hypot(ux, uy) || 1;
    ux /= ul; uy /= ul;
    up = { x: L(up.x, ux, wk), y: L(up.y, uy, wk) };
  }
  // slam: as duas mãos no cajado, ergue bem alto e crava a ponta no chão à frente
  if (P.slam > 0) {
    const ground = gLoc;
    const bot = LV(LV({ x: 36, y: ground }, { x: -6, y: -150 }, wu), { x: -72, y: ground + 4 }, sk);
    const ang = L(L(0.04, -0.18, wu), 0.1, sk); // levemente inclinado
    const u2 = { x: -Math.sin(ang), y: -Math.cos(ang) };
    const hB = { x: bot.x + u2.x * L(125, 150, sk), y: bot.y + u2.y * L(125, 150, sk) };
    const hF = { x: bot.x + u2.x * L(95, 108, sk), y: bot.y + u2.y * L(95, 108, sk) };
    const mk = (sh: V, h: V): Arm => {
      const e = ik(sh, h, 58, 56, -1);
      return { sh, el: e, hd: h, ang: Math.atan2(-(h.x - e.x), h.y - e.y) };
    };
    armB = blendArm(armB, mk(shB, hB), P.slam);
    armF = blendArm(armF, mk(shF, hF), P.slam);
    up = { x: L(up.x, u2.x, P.slam), y: L(up.y, u2.y, P.slam) };
  }
  {
    const ul = Math.hypot(up.x, up.y) || 1;
    up = { x: up.x / ul, y: up.y / ul };
  }
  const staffTop = { x: armB.hd.x + up.x * 150, y: armB.hd.y + up.y * 150 };
  const dn = clamp((gLoc - armB.hd.y) / Math.max(0.3, -up.y), 30, 150);
  const staffBot = { x: armB.hd.x - up.x * dn, y: armB.hd.y - up.y * dn };
  const orbP = { x: staffTop.x + up.x * 14, y: staffTop.y + up.y * 14 };

  // ---------------------------------------------------------------- pernas (mundo)
  const hipN = SQ(T({ x: -14, y: -128 })), hipF = SQ(T({ x: 16, y: -130 }));
  const spread = 12 * (1 - G.sK);
  const footN = { x: dx - 16 - spread + fN.x, y: -9 - fN.lift }, footF = { x: dx + 18 + spread + fF.x, y: -9 - fF.lift };
  const legSc = 1 - d3 * 0.6;
  shadow(ctx, dx, 110 + d3 * 20);
  // névoa verde rasteira
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  orb(ctx, dx - 40 + Math.sin(t * 0.7) * 20, -10, 60, s.pal.glow, 0.12 * (1 - die * 0.6));
  orb(ctx, dx + 50 + Math.sin(t * 0.9 + 2) * 20, -8, 50, s.pal.glow, 0.1 * (1 - die * 0.6));
  ctx.restore();
  // morte: o cajado escapa da mão e tomba para trás, quica no chão
  if (die > 0) {
    const k = sm(0.05, 0.5, die), k2 = sm(0.5, 0.7, die);
    const ang = -0.06 + k * k * 1.62 - Math.sin(k2 * Math.PI) * 0.12;
    const base = { x: dx + 40 + d1 * 10, y: -2 };
    const u3 = { x: Math.sin(ang), y: -Math.cos(ang) };
    const top3 = { x: base.x + u3.x * 250, y: base.y + u3.y * 250 };
    staff(ctx, base, top3, { x: top3.x + u3.x * 14, y: top3.y + u3.y * 14 }, C, s, st, glowK);
  }
  boneLeg(ctx, hipF, footF, fF, C, true, legSc);
  boneLeg(ctx, hipN, footN, fN, C, false, legSc);

  ctx.save();
  // achatamento da morte
  ctx.translate(dx, 0);
  ctx.scale(sqx, sqy);
  ctx.translate(-dx, 0);
  ctx.translate(dx, dy);
  ctx.translate(pivot.x, pivot.y);
  ctx.rotate(lean);
  ctx.translate(-pivot.x, -pivot.y);

  // gola alta (atrás da cabeça)
  ctx.fillStyle = C.dark;
  ctx.beginPath();
  ctx.moveTo(-62, -238);
  for (let i = 0; i <= 6; i++) {
    const x = -62 + i * 20;
    const fl = Math.sin(t * 2.2 + i * 0.9) * 2 + jolt * 3;
    ctx.lineTo(x - 6, -300 - Math.sin((i / 6) * Math.PI) * 30 - (i % 2) * 10 + fl);
    ctx.lineTo(x + 4, -268);
  }
  ctx.lineTo(62, -238);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = hexA(C.accent, 0.5);
  ctx.lineWidth = 2;
  ctx.stroke();

  // cajado (atrás do manto)
  if (die <= 0) staff(ctx, staffBot, staffTop, orbP, C, s, st, glowK + ck * (wu + sk) * 0.6);

  // braço de trás
  sleeve(ctx, armB, C, true, t);
  boneHand(ctx, armB.hd, armB.ang, C, 14, true, 0.75 * (1 - P.roar * sk));

  const trail = m * G.fwd;
  // manto
  const lagX = -fN.x * 0.25 - fF.x * 0.1; // a barra atrasa em relação às pernas
  const flare = 1 + P.cast * (wu * 0.12 + sk * 0.06) + P.roar * sk * 0.2 + P.slam * wu * 0.08;
  const hemL = (-104 + lagX * 0.6 - trail * 8) * flare;
  const hemR = (108 + lagX + trail * 26) * flare;
  ctx.fillStyle = vgrad(ctx, -250, HEM, mixHex(C.body, '#ffffff', 0.1), C.dark);
  ctx.beginPath();
  ctx.moveTo(-52, -248);
  ctx.bezierCurveTo(-64, -190, hemL + 20, -110, hemL, HEM);
  const n = 11;
  const kneeN = IT(ik(hipN, footN, 64, 64, 1));
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    const x = hemL + k * (hemR - hemL);
    const wv = Math.sin(t * 3 + i * 1.3 - G.u * TAU * 2) * (3 + m * 4);
    // o joelho da frente empurra a barra
    const kick = Math.max(0, 1 - Math.abs(x - kneeN.x) / 40) * fN.lift * 0.9;
    ctx.lineTo(x - 10, HEM - 16 - (i % 2) * 12 + wv - kick);
    ctx.lineTo(x, HEM + wv * 0.4 + (i % 3 === 0 ? 10 : 0) - kick);
  }
  ctx.bezierCurveTo(hemR - 20, -110, 86, -190, 54, -248);
  ctx.closePath();
  ctx.fill();
  // dobras do manto (seguem as pernas)
  ctx.strokeStyle = hexA('#000000', 0.3);
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (const [x0, k] of [[-40, 0.5], [34, 0.8], [60, 0.4]] as const) {
    ctx.moveTo(x0 * 0.6, -220);
    ctx.quadraticCurveTo(x0 + lagX * k, -120, x0 * 1.4 + lagX * k * 1.5, HEM - 10);
  }
  ctx.stroke();
  // faixa central com runas
  ctx.fillStyle = hexA(C.dark, 0.9);
  ctx.beginPath();
  ctx.moveTo(-22, -240);
  ctx.lineTo(10, -240);
  ctx.lineTo(24 + lagX * 0.5, HEM);
  ctx.lineTo(-30 + lagX * 0.5, HEM);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = C.accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-22, -240);
  ctx.lineTo(-30 + lagX * 0.5, HEM);
  ctx.moveTo(10, -240);
  ctx.lineTo(24 + lagX * 0.5, HEM);
  ctx.stroke();
  ctx.save();
  ctx.globalAlpha = (0.35 + glowK * 0.6) * flick;
  ctx.fillStyle = C.accent;
  for (let i = 0; i < 5; i++) {
    const y = -200 + i * 34;
    const x = -6 + i * 1.5 + lagX * 0.1 * i;
    ctx.fillRect(x - 5, y, 10, 3);
    ctx.fillRect(x - 1.5, y - 7, 3, 16);
  }
  ctx.restore();
  // trapos soltos nas costas (atraso)
    for (let i = 0; i < 3; i++) {
    const root = { x: 58 + i * 18 + lagX * 0.3 * i, y: -232 + i * 58 };
    const pts: V[] = [];
    for (let j = 0; j <= 6; j++) {
      const k = j / 6;
      const a = 0.25 + trail * 0.7 + P.cast * wu * 0.5 + Math.sin(t * 2.6 + i * 1.7 - k * 2.4 - G.u * TAU) * (0.1 + m * 0.12) * k;
      const len = 95 - i * 15;
      pts.push({ x: root.x + Math.sin(a) * len * k, y: root.y + Math.cos(a) * len * k });
    }
    tube(ctx, pts, (k) => 20 * (1 - k * 0.7), mixHex(C.dark, C.body, 0.2 - i * 0.05));
  }

  // filactéria no peito (pulsa como um coração)
  const beat = Math.pow(Math.max(0, Math.sin(t * 3.2)), 8);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  orb(ctx, -8, -215, 22 + glowK * 12 + beat * 8, s.pal.glow, 0.45 + glowK * 0.5);
  ctx.restore();
  ctx.fillStyle = mixHex(C.accent, '#ffffff', beat * 0.5);
  ctx.beginPath();
  ctx.moveTo(-8, -228);
  ctx.lineTo(0, -215);
  ctx.lineTo(-8, -202);
  ctx.lineTo(-16, -215);
  ctx.closePath();
  ctx.fill();
  // ombreiras com espinhos (chacoalham na pisada)
  for (const [x, sc, ph] of [[44, 0.9, 1], [-46, 1, 0]] as const) {
    const rat = jolt * 3 * Math.sin(t * 40 + ph);
    ctx.fillStyle = vgrad(ctx, -262, -236, mixHex(C.body, '#ffffff', 0.15), mixHex(C.body, C.dark, 0.5));
    ctx.beginPath();
    ctx.ellipse(x, -240, 30 * sc, 18 * sc, 0, Math.PI, TAU);
    ctx.fill();
    ctx.fillStyle = C.bone;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(x - 18 + i * 14, -248);
      ctx.lineTo(x - 22 + i * 14 + 4 + rat, -272 - (i === 1 ? 8 : 0));
      ctx.lineTo(x - 10 + i * 14, -248);
      ctx.fill();
    }
  }

  // crânio (estabiliza contra a inclinação; tomba a cada pisada; balança devagar parado)
  const head: V = {
    x: -12 + P.shoot * (wu * 10 - sk * 14) + P.cast * sk * -8 + P.roar * (wu * -6 + sk * 6) + hurt * 6,
    y: -282 - P.roar * (sk * 12 - wu * 10) + b * 1.5 + jolt * 3 + d2 * 14,
  };
  const headRot = -lean * 0.5 + Math.sin(t * 0.55) * 0.1 * calm - jolt * 0.1 + Math.sin(G.u * TAU * 2 - 1) * 0.03 * m
    + P.roar * (-wu * 0.25 + sk * 0.4) + P.cast * (wu * 0.15 - sk * 0.1) + hurt * 0.3 + d1 * 0.3 - d2 * 0.5;
  const chatter = sm(0.6, 1, Math.sin(t * 0.9 + 1)) * (0.5 + 0.5 * Math.sin(t * 24)) * 0.25 * calm;
  const jaw = clamp(P.roar * (sk * 1.2 + wu * 0.1) + P.cast * (wu * 0.25 + sk * 0.5) + chatter + jolt * 0.3 + hurt * 0.6 + d1 * 0.6);
  const crownLag = Math.sin(t * 2.3) * 0.03 + jolt * 0.1 + hurt * -0.2;
  const headDetached = d3 > 0.001;
  const drawHead = () => {
    skull(ctx, 0, 0, 30, jaw, C, C.eye, glowK * flick, die);
    // coroa (com folga: chacoalha e atrasa)
    ctx.save();
    ctx.translate(10, -20);
    ctx.rotate(crownLag);
    ctx.translate(-10, 20);
    ctx.fillStyle = vgrad(ctx, -56, -18, hurtTint(ctx, st, '#f0d070'), hurtTint(ctx, st, '#8a6a20'));
    ctx.beginPath();
    ctx.moveTo(-28, -18);
    for (let i = 0; i <= 5; i++) {
      const x = -28 + i * 11.6;
      ctx.lineTo(x, -40 - (i % 2 ? 6 : 16));
      ctx.lineTo(x + 5.8, -26);
    }
    ctx.lineTo(30, -18);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = hurtTint(ctx, st, '#8a6a20');
    ctx.fillRect(-28, -24, 58, 6);
    eyeGlow(ctx, -14, -22, 3.5, C.eye, 1 - die);
    eyeGlow(ctx, 6, -22, 3, C.eye, 1 - die);
    ctx.restore();
  };
  if (!headDetached) {
    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.rotate(headRot);
    drawHead();
    ctx.restore();
  }

  // braço da frente
  sleeve(ctx, armF, C, false, t);
  const fCurl = clamp(0.5 - P.cast * sk * 0.6 - P.roar * sk * 0.5 + P.slam * 0.4 + Math.sin(t * 1.7) * 0.15);
  boneHand(ctx, armF.hd, armF.ang, C, 15, false, fCurl);
  const handGlow = P.cast * (wu * 0.6 + sk) + shk;
  if (handGlow > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    orb(ctx, armF.hd.x, armF.hd.y + 6, 14 + handGlow * 22 + imp * 16, s.pal.glow, clamp(0.4 + handGlow * 0.5));
    // fagulhas sendo sugadas para a mão na carga
    if (P.cast && wu > 0.05) {
      ctx.fillStyle = s.pal.glow;
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9 + t * 3;
        const r = 70 * (1 - ((t * 1.3 + i * 0.37) % 1));
        ctx.globalAlpha = wu * 0.8;
        ctx.fillRect(armF.hd.x + Math.cos(a) * r - 2, armF.hd.y + Math.sin(a) * r - 2, 4, 4);
      }
    }
    ctx.restore();
  }
  ctx.restore();

  // crânio caindo e rolando (morte)
  const hW = SQ(T(head));
  let headW = hW;
  if (headDetached) {
    const k = sm(0.4, 0.75, die), k2 = sm(0.72, 1, die);
    const start = T(head);
    const land = { x: dx - 125, y: -26 };
    headW = { x: L(start.x, land.x, k) - k2 * 34, y: L(start.y, land.y, k * k) - Math.sin(k2 * Math.PI) * 16 };
    ctx.save();
    ctx.translate(headW.x, headW.y);
    ctx.rotate(headRot - k * 1.4 - k2 * 1.5);
    drawHead();
    ctx.restore();
  }

  return {
    mouth: SQ(T(orbP)),
    hand: SQ(T(armF.hd)),
    core: SQ(T({ x: -5, y: -190 })),
    top: Math.min(SQ(T({ x: 0, y: -330 })).y, headW.y - 40),
    halfW: 105,
  };
}

function blendArm(a: Arm, b: Arm, k: number): Arm {
  if (k <= 0) return a;
  if (k >= 1) return b;
  const el = LV(a.el, b.el, k), hd = LV(a.hd, b.hd, k);
  return { sh: a.sh, el, hd, ang: Math.atan2(-(hd.x - el.x), hd.y - el.y) };
}

/** Perna de osso sob o manto: canela, joelho e pé que rola do calcanhar à ponta. */
function boneLeg(ctx: CanvasRenderingContext2D, hip: V, foot: V, f: { plant: number; roll: number; k: number }, C: Pal, back: boolean, sc: number) {
  const knee = ik(hip, foot, 64 * sc, 64 * sc, 1);
  const col = back ? C.boneD : C.bone;
  const out = back ? '#0a0610' : mixHex(C.boneD, '#000000', 0.5);
  boneSeg(ctx, hip, knee, 11, col, out);
  boneSeg(ctx, knee, foot, 10, col, out);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(knee.x, knee.y, 7, 0, TAU);
  ctx.fill();
  // pé: no apoio rola para a ponta; no balanço a ponta cai
  const ang = f.plant ? -sm(0.65, 1, f.roll) * 0.5 : -0.45 * (1 - f.k) + 0.1 * f.k;
  ctx.save();
  ctx.translate(foot.x, foot.y);
  ctx.rotate(ang);
  ctx.fillStyle = out;
  ctx.beginPath();
  ctx.ellipse(-6, 4, 12, 6, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.ellipse(-4, 3, 9, 4.5, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = col;
  ctx.lineWidth = 3.2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-10, 2 + i * 2.4);
    ctx.lineTo(-24, 5 + i * 2.6);
    ctx.stroke();
  }
  ctx.restore();
}

function sleeve(ctx: CanvasRenderingContext2D, a: Arm, C: Pal, back: boolean, t: number) {
  const col = back ? mixHex(C.body, C.dark, 0.5) : C.body;
  const pts = bez(a.sh, { x: (a.sh.x + a.el.x) / 2, y: (a.sh.y + a.el.y) / 2 }, a.el, { x: a.el.x + (a.hd.x - a.el.x) * 0.75, y: a.el.y + (a.hd.y - a.el.y) * 0.75 }, 10);
  tube(ctx, pts, (k) => 26 + k * 22, C.dark);
  tube(ctx, pts, (k) => 22 + k * 20, col);
  // boca da manga pendente (atrasa e balança)
  const e = pts[pts.length - 1];
  const sw = Math.sin(t * 2.4 + (back ? 1 : 0)) * 4;
  ctx.fillStyle = mixHex(col, C.dark, 0.3);
  ctx.beginPath();
  ctx.moveTo(e.x - 14, e.y - 4);
  ctx.quadraticCurveTo(e.x - 10 + sw, e.y + 26, e.x + 6 + sw, e.y + 30);
  ctx.lineTo(e.x + 16, e.y + 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = C.accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(e.x, e.y, 15, 0, TAU);
  ctx.stroke();
}

function staff(ctx: CanvasRenderingContext2D, bot: V, top: V, orbP: V, C: Pal, s: BossSpec, st: DrawState, k: number) {
  ctx.strokeStyle = '#1a120c';
  ctx.lineWidth = 11;
  ctx.beginPath();
  ctx.moveTo(bot.x, bot.y);
  ctx.lineTo(top.x, top.y);
  ctx.stroke();
  ctx.strokeStyle = hurtTint(ctx, st, '#5a4430');
  ctx.lineWidth = 6;
  ctx.stroke();
  // anéis de osso
  ctx.strokeStyle = C.bone;
  ctx.lineWidth = 4;
  for (const q of [0.35, 0.7]) {
    const x = bot.x + (top.x - bot.x) * q, y = bot.y + (top.y - bot.y) * q;
    const ang = Math.atan2(top.y - bot.y, top.x - bot.x) + Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(ang) * 7, y - Math.sin(ang) * 7);
    ctx.lineTo(x + Math.cos(ang) * 7, y + Math.sin(ang) * 7);
    ctx.stroke();
  }
  // garras segurando o orbe
  const ang = Math.atan2(top.y - bot.y, top.x - bot.x);
  ctx.lineWidth = 4;
  for (const sg of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.quadraticCurveTo(
      top.x + Math.cos(ang + sg * 1.2) * 22, top.y + Math.sin(ang + sg * 1.2) * 22,
      orbP.x + Math.cos(ang + sg * 0.6) * 18, orbP.y + Math.sin(ang + sg * 0.6) * 18,
    );
    ctx.stroke();
  }
  const pulse = 0.8 + Math.sin(st.t * 4) * 0.15;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  orb(ctx, orbP.x, orbP.y, 26 + k * 30 * pulse, s.pal.glow, clamp(0.5 + k * 0.5));
  ctx.restore();
  ctx.fillStyle = rgrad(ctx, orbP.x - 4, orbP.y - 4, 16, '#ffffff', C.accent);
  ctx.beginPath();
  ctx.arc(orbP.x, orbP.y, 13, 0, TAU);
  ctx.fill();
}
