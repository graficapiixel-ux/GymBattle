/**
 * MORTO-VIVO 1 — OSSUÁRIO, o Gigante de Mil Ossos.
 * Anda pesado e MANCANDO: a perna de trás é a ruim (passo curto, arrasta a ponta do pé, o corpo
 * afunda e tomba para o lado dela). Braços compridos balançam quase arrastando os nós dos dedos;
 * crânios fundidos chacoalham a cada pisada; o crânio principal tomba com o peso.
 * Na morte, desmonta: os crânios despencam e rolam, o corpo desaba numa pilha de ossos.
 */
import type { BossSpec } from '@gymbattle/shared';
import type { Anchors, DrawState, V } from '../types';
import { h01, mixHex, TAU, clamp, sm, orb } from '../util';
import {
  type Arm, type Pal, type Pose, L, armPts, xf, ik, loco, stepFoot, stepBob, stepJolt, shadow, line,
  boneHand, skull,
} from './undead-kit';

export function boneGiant(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState, C: Pal, P: Pose): Anchors {
  const { wu, sk, die, b, imp } = P;
  const t = st.t;
  const G = loco(st);
  const d1 = sm(0, 0.2, die), d2 = sm(0.15, 0.5, die), d3 = sm(0.45, 0.9, die);
  const m = G.m * (1 - die);
  const calm = 1 - P.atk;
  const hurt = st.hurt;

  // ---------------------------------------------------------------- passada mancando
  const duty = 0.62;
  const S = 46 * G.sK;
  const fN = stepFoot(G.u, S, 24 * m, duty); // perna boa
  const fF = stepFoot(G.u + 0.5, S, 8 * m, duty); // perna ruim: mal levanta
  const bad = fF.plant ? Math.sin(Math.PI * fF.roll) : 0; // peso na perna ruim
  const bob = stepBob(G.u) * 5 * m + bad * 10 * m;
  const jolt = stepJolt(G.u) * m;
  const shift = Math.sin(t * 0.7) * (1 - m) * calm;
  const rattle = (i: number) => (jolt * 1.4 + hurt) * Math.sin(t * 47 + i * 2.1);

  const dx = shift * 5 + hurt * 20 + d1 * 16 - d2 * 6
    + P.slam * (wu * 16 - sk * 30) + P.shoot * (wu * 14 - sk * 22) + P.charge * (wu * 30 - sk * 250);
  const crouch = bob + b * 2.5 + P.slam * (-wu * 16 + sk * 40) + imp * 12 * P.slam + P.roar * (wu * 20 - sk * 12)
    + P.shoot * (wu * 10 - sk * 4) + d2 * 62 + d3 * 46;
  const lean = -m * 0.08 * G.fwd + bad * m * 0.06 + shift * 0.03 + hurt * 0.16 + d1 * 0.2 - d2 * 0.42 - d3 * 0.4
    + P.slam * (wu * 0.16 - sk * 0.3) + P.shoot * (wu * 0.16 - sk * 0.2) + P.roar * (-wu * 0.2 + sk * 0.16)
    + P.charge * (wu * 0.1 - sk * 0.22) + P.swipe * (wu * 0.1 - sk * 0.1);
  const pivot = { x: 0, y: -120 };
  const T = (p: V) => xf(p, pivot, lean, dx, crouch);
  const glowK = clamp(0.45 + st.rage * 0.4 + P.atk * 0.5) * (1 - die);
  const pulse = Math.pow(Math.max(0, Math.sin(t * 2.6)), 6);

  // ---------------------------------------------------------------- braços
  const shF = { x: -78, y: -250 }, shB = { x: 58, y: -262 };
  const sw = Math.cos(G.u * TAU - 0.5) * 0.32 * m * calm; // balanço com atraso
  let aF = 0.22 + Math.sin(t * 1.2) * 0.05 - sw, bF = 0.32 + Math.sin(t * 0.9) * 0.05, aB = -0.08 + sw * 0.8, bB = 0.38;
  // slam: ergue os dois punhos e esmaga o chão
  aF = L(aF, L(L(aF, 2.85, wu), 0.62, sk), P.slam); bF = L(bF, L(L(bF, 0.55, wu), -0.15, sk), P.slam);
  aB = L(aB, L(L(aB, 2.7, wu), 0.75, sk), P.slam); bB = L(bB, L(L(bB, 0.6, wu), -0.1, sk), P.slam);
  // shoot: puxa para trás e arremessa por cima
  aF = L(aF, L(L(aF, 3.85, wu), 1.62, sk), P.shoot); bF = L(bF, L(L(bF, 0.9, wu), -0.05, sk), P.shoot);
  aB = L(aB, L(L(aB, 0.9, wu), -0.5, sk), P.shoot);
  // roar: encolhe e depois escancara
  aF = L(aF, L(L(aF, 0.1, wu), 2.2, sk), P.roar); bF = L(bF, L(L(bF, 1.7, wu), 0.4, sk), P.roar);
  aB = L(aB, L(L(aB, 0.3, wu), -1.7, sk), P.roar); bB = L(bB, L(L(bB, 1.5, wu), -0.4, sk), P.roar);
  if (P.swipe) { aF = L(L(aF, -1.0, wu), 1.75, sk); bF = L(L(bF, 0.8, wu), -0.15, sk); }
  const ck = P.cast * clamp(P.atk * 1.3);
  aF = L(aF, 1.85, ck); bF = L(bF, 0.6, ck); aB = L(aB, 1.7, ck); bB = L(bB, 0.7, ck);
  const chk = P.charge * P.hold;
  aF = L(aF, 1.5, chk); bF = L(bF, -0.1, chk); aB = L(aB, 1.0, chk);
  aF += hurt * -0.5; aB += hurt * -0.4;
  // morte: braços largados (e esparramam no chão)
  aF = L(aF, L(0.6, 1.25, d3), d2); bF = L(bF, L(0.1, 0.5, d3), d2);
  aB = L(aB, L(0.3, 1.3, d3), d2); bB = L(bB, 0.2, d2);
  const armF = armPts(shF, aF, bF, 92, 88);
  const armB = armPts(shB, aB, bB, 92, 88);

  // ---------------------------------------------------------------- pernas (mundo)
  const spread = 14 * (1 - G.sK);
  const hipN = T({ x: -32, y: -120 }), hipF = T({ x: 34, y: -120 });
  const footN = { x: dx - 44 - spread + fN.x, y: -10 - fN.lift };
  const footF = { x: dx + 46 + spread + fF.x, y: -10 - fF.lift };

  shadow(ctx, dx, 128, 0.32);
  bigLeg(ctx, hipF, footF, fF, C, true, d3);

  const enter = () => {
    ctx.save();
    ctx.translate(dx, crouch);
    ctx.translate(pivot.x, pivot.y);
    ctx.rotate(lean);
    ctx.translate(-pivot.x, -pivot.y);
  };
  enter();
  // braço de trás
  boneArm(ctx, armB, C, true, 0.5 + P.slam * wu * 0.5);
  // espinhos nas costas (vértebras)
  ctx.fillStyle = C.boneD;
  for (let i = 0; i < 6; i++) {
    const k = i / 5;
    const x = 70 - k * 40 + Math.sin(k * 3) * 10, y = -130 - k * 150;
    const r = rattle(i) * 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y - 10);
    ctx.lineTo(x + 30 - k * 6 + r, y - 18 - k * 10 + r);
    ctx.lineTo(x, y + 8);
    ctx.fill();
  }
  // pelve
  ctx.fillStyle = C.boneD;
  ctx.beginPath();
  ctx.moveTo(-52, -126);
  ctx.quadraticCurveTo(-32, -166, 0, -156);
  ctx.quadraticCurveTo(42, -166, 56, -126);
  ctx.quadraticCurveTo(22, -96, 0, -108);
  ctx.quadraticCurveTo(-26, -96, -52, -126);
  ctx.fill();
  ctx.fillStyle = C.bone;
  ctx.beginPath();
  ctx.moveTo(-48, -128);
  ctx.quadraticCurveTo(-30, -160, 0, -150);
  ctx.quadraticCurveTo(40, -160, 52, -128);
  ctx.quadraticCurveTo(20, -102, 0, -114);
  ctx.quadraticCurveTo(-25, -102, -48, -128);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(-20, -132, 9, 7, 0, 0, TAU);
  ctx.ellipse(22, -132, 9, 7, 0, 0, TAU);
  ctx.fill();
  // coluna (ondula com o passo)
  for (let i = 0; i < 9; i++) {
    const k = i / 8;
    const x = 40 - Math.sin(k * Math.PI) * 18 - k * 40 + Math.sin(G.u * TAU * 2 - k * 2) * 3 * m;
    const y = -140 - k * 130;
    ctx.fillStyle = C.boneD;
    ctx.beginPath();
    ctx.ellipse(x, y, 14, 10, 0.3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.bone;
    ctx.beginPath();
    ctx.ellipse(x - 2, y - 2, 10, 6, 0.3, 0, TAU);
    ctx.fill();
  }
  // brilho vermelho dentro das costelas (coração de brasa que pulsa)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  orb(ctx, -10, -210, 70 + glowK * 25 + pulse * 12 + P.roar * sk * 30, s.pal.glow, 0.32 + glowK * 0.4);
  ctx.restore();
  ctx.fillStyle = mixHex(C.accent, '#ffffff', pulse * 0.4);
  ctx.beginPath();
  ctx.arc(-10, -210, (9 + pulse * 4) * (1 - d3), 0, TAU);
  ctx.fill();
  // costelas (vibram com a pisada)
  const ribs = (s.feat.ribs ?? 1) > 0 ? 6 : 4;
  for (let i = 0; i < ribs; i++) {
    const y = -275 + i * 22;
    const w = 80 - Math.abs(i - 2) * 9;
    const r = rattle(i + 3) * 1.5;
    ctx.strokeStyle = mixHex(C.boneD, '#000000', 0.25);
    ctx.lineWidth = 13;
    ctx.beginPath();
    ctx.moveTo(30 - i * 2, y);
    ctx.bezierCurveTo(10, y - 22, -w - 10, y - 16 + r, -w + 10, y + 26 + r);
    ctx.stroke();
    ctx.strokeStyle = C.bone;
    ctx.lineWidth = 8;
    ctx.stroke();
  }
  // esterno
  ctx.strokeStyle = C.bone;
  ctx.lineWidth = 12;
  line(ctx, { x: -62, y: -268 }, { x: -56, y: -170 });

  // crânios fundidos (ombros e costas): chacoalham; no rugido abrem a boca juntos; na morte despencam
  const ns = Math.max(0, Math.round(s.feat.skulls ?? 5));
  const spots: [number, number, number][] = [[50, -292, 22], [86, -258, 19], [12, -308, 18], [95, -215, 17], [-30, -300, 16], [70, -320, 15], [100, -175, 15]];
  const nsk = Math.min(ns, spots.length);
  const skJaw = (i: number) => clamp(0.15 + Math.max(0, Math.sin(t * 2 + i * 1.7)) * 0.3 + jolt * 0.4 * h01(i, 7) + P.roar * sk * 0.9 + hurt * 0.5);
  if (d3 <= 0) {
    for (let i = 0; i < nsk; i++) {
      const [x, y, r] = spots[i];
      ctx.save();
      ctx.translate(x + rattle(i) * 1.5, y + rattle(i + 5) * 1.5);
      ctx.rotate((h01(i, 3) - 0.5) * 0.8 + rattle(i) * 0.08 + Math.sin(t * 1.3 + i) * 0.04);
      skull(ctx, 0, 0, r, skJaw(i), C, C.eye, glowK * 0.6, die);
      ctx.restore();
    }
  }
  // crânio principal (tomba com o peso)
  const head: V = {
    x: -95 + P.shoot * (wu * 25 - sk * 20) + P.slam * (sk * -10) + P.charge * sk * -12 + hurt * 10,
    y: -275 - P.roar * (sk * 10 - wu * 22) + b * 2 + jolt * 4 + d2 * 10,
  };
  const headRot = -lean * 0.4 + Math.sin(t * 0.6) * 0.08 * calm - jolt * 0.14 + bad * m * 0.08
    + P.roar * (-wu * 0.3 + sk * 0.5) + P.slam * (wu * 0.15 - sk * 0.15) + hurt * 0.35 + d1 * 0.3 - d2 * 0.4;
  const jaw = clamp(P.roar * (sk * 1.3 + wu * 0.1) + P.shoot * sk * 0.6 + P.slam * imp * 0.6 + jolt * 0.35 + hurt * 0.7 + d1 * 0.6);
  const drawHead = () => {
    // chifres de osso
    ctx.fillStyle = C.boneD;
    ctx.beginPath();
    ctx.moveTo(10, -30);
    ctx.quadraticCurveTo(50, -50, 40, -90);
    ctx.quadraticCurveTo(36, -55, 0, -40);
    ctx.fill();
    skull(ctx, 0, 0, 44, jaw, C, C.eye, glowK, die);
  };
  if (d3 <= 0) {
    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.rotate(headRot);
    drawHead();
    ctx.restore();
  }
  ctx.restore();

  // perna da frente (boa)
  bigLeg(ctx, hipN, footN, fN, C, false, d3);

  // braço da frente
  enter();
  boneArm(ctx, armF, C, false, 0.5 + P.slam * 0.5 - P.roar * sk * 0.5);
  ctx.restore();

  // morte: crânios despencam e rolam
  let headW = T(head);
  if (d3 > 0) {
    for (let i = 0; i < nsk; i++) {
      const [x, y, r] = spots[i];
      const p0 = T({ x, y });
      const k = sm(0.02 + h01(i, 9) * 0.25, 0.4 + h01(i, 9) * 0.25, d3);
      const kk = k * k;
      const land = { x: p0.x + (h01(i, 11) - 0.3) * 160, y: -r * 0.8 };
      const bounce = Math.sin(sm(0.6, 1, d3) * Math.PI) * 14 * h01(i, 4);
      ctx.save();
      ctx.translate(L(p0.x, land.x, k), L(p0.y, land.y, kk) - bounce);
      ctx.rotate((h01(i, 3) - 0.5) * 0.8 + k * (h01(i, 5) - 0.5) * 6);
      skull(ctx, 0, 0, r, 0.4, C, C.eye, 0, die);
      ctx.restore();
    }
    const k = sm(0, 0.5, d3), k2 = sm(0.5, 1, d3);
    const p0 = T(head);
    headW = { x: L(p0.x, dx - 150, k) - k2 * 40, y: L(p0.y, -34, k * k) - Math.sin(k2 * Math.PI) * 22 };
    ctx.save();
    ctx.translate(headW.x, headW.y);
    ctx.rotate(headRot - k * 0.8 - k2 * 1.6);
    drawHead();
    ctx.restore();
  }

  return {
    mouth: { x: headW.x - 36, y: headW.y + 22 },
    hand: T(armF.hd),
    core: T({ x: -10, y: -210 }),
    top: T({ x: 0, y: -330 }).y,
    halfW: 135,
  };
}

/** Perna grossa de ossos (fêmur + tíbia/fíbula), joelho em IK e pé de falanges. */
function bigLeg(ctx: CanvasRenderingContext2D, hip: V, foot: V, f: { plant: number; roll: number; k: number }, C: Pal, back: boolean, d3: number) {
  const knee = ik(hip, foot, 70, 70, 1);
  const col = back ? C.boneD : C.bone;
  const out = back ? mixHex(C.boneD, '#000000', 0.45) : mixHex(C.boneD, '#000000', 0.2);
  ctx.strokeStyle = out;
  ctx.lineWidth = 24;
  line(ctx, hip, knee);
  ctx.lineWidth = 20;
  line(ctx, knee, foot);
  ctx.strokeStyle = col;
  ctx.lineWidth = 16;
  line(ctx, hip, knee);
  // tíbia + fíbula
  const dx = foot.x - knee.x, dy = foot.y - knee.y, l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l * 4.5, ny = dx / l * 4.5;
  ctx.lineWidth = 8;
  line(ctx, { x: knee.x + nx, y: knee.y + ny }, { x: foot.x + nx, y: foot.y + ny });
  line(ctx, { x: knee.x - nx, y: knee.y - ny }, { x: foot.x - nx, y: foot.y - ny });
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(knee.x, knee.y, 14, 0, TAU);
  ctx.arc(hip.x, hip.y, 16, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.arc(knee.x + 4, knee.y + 4, 8, 0, TAU);
  ctx.fill();
  // pé: rola para a ponta no fim do apoio; a perna ruim arrasta a ponta
  const ang = f.plant ? -sm(0.6, 1, f.roll) * 0.45 : (back ? -0.5 : -0.35 * (1 - f.k) + 0.15 * f.k);
  ctx.save();
  ctx.translate(foot.x, foot.y);
  ctx.rotate(ang * (1 - d3));
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.ellipse(2, 0, 12, 9, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = out;
  ctx.lineWidth = 10;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 2 + i * 2);
    ctx.lineTo(-24 + i * 4, 4 + i * 2);
    ctx.lineTo(-38 + i * 5, 8 + i * 1.5);
    ctx.stroke();
  }
  ctx.strokeStyle = col;
  ctx.lineWidth = 6.5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 2 + i * 2);
    ctx.lineTo(-24 + i * 4, 4 + i * 2);
    ctx.lineTo(-38 + i * 5, 8 + i * 1.5);
    ctx.stroke();
  }
  // calcanhar
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(10, 4, 7, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function boneArm(ctx: CanvasRenderingContext2D, a: Arm, C: Pal, back: boolean, curl: number) {
  const col = back ? C.boneD : C.bone;
  ctx.strokeStyle = back ? mixHex(C.boneD, '#000000', 0.35) : mixHex(C.boneD, '#000000', 0.15);
  ctx.lineWidth = 22;
  line(ctx, a.sh, a.el);
  ctx.strokeStyle = col;
  ctx.lineWidth = 15;
  line(ctx, a.sh, a.el);
  // dois ossos no antebraço
  const dx = a.hd.x - a.el.x, dy = a.hd.y - a.el.y, l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l * 6, ny = dx / l * 6;
  ctx.lineWidth = 9;
  line(ctx, { x: a.el.x + nx, y: a.el.y + ny }, { x: a.hd.x + nx, y: a.hd.y + ny });
  line(ctx, { x: a.el.x - nx, y: a.el.y - ny }, { x: a.hd.x - nx, y: a.hd.y - ny });
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(a.el.x, a.el.y, 13, 0, TAU);
  ctx.arc(a.sh.x, a.sh.y, 20, 0, TAU);
  ctx.fill();
  boneHand(ctx, a.hd, a.ang, C, 30, back, clamp(curl));
}

