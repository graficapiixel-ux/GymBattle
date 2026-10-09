/**
 * PLANTA 0 — carvalho ancião (Thornwood): anda sobre duas pernas-raiz que arrancam do chão
 * (com torrões de terra) e se cravam de novo a cada passo; a copa vem atrasada e balança.
 */
import type { BossSpec } from '@gymbattle/shared';
import type { Anchors, DrawState, V } from '../types';
import { eyeGlow, hurtTint, mixHex, rgrad, vgrad, easeIn, lin, rgba, bez, tube, TAU, clamp, sm, h01 } from '../util';
import { type C, STRIDE, bobAt, blink, clods, clump, falling, foot, ik, kf, leanF, limb, mound, rootToes, smear } from './plant-kit';

const SC = 0.88;
//            p     lean   hipY  frente x,y     trás x,y
const REST = [0, 0, -150, -175, 135, -200];
const POSES: Record<string, number[][]> = {
  slam: [
    [0, ...REST],
    [0.36, -0.14, -16, -175, -350, 110, -340],
    [0.44, -0.16, -18, -165, -365, 105, -350],
    [0.5, 0.08, 0, -260, -230, 60, -250],
    [0.55, 0.26, 16, -225, -8, 30, -140],
    [0.7, 0.22, 12, -218, -12, 35, -145],
    [1, ...REST],
  ],
  swipe: [
    [0, ...REST],
    [0.38, -0.1, -6, -10, -330, 165, -170],
    [0.45, -0.11, -6, -20, -340, 170, -165],
    [0.5, 0.08, 2, -215, -285, 140, -200],
    [0.54, 0.16, 6, -255, -150, 120, -235],
    [0.62, 0.14, 6, -200, -60, 120, -225],
    [0.78, 0.06, 2, -165, -110, 130, -210],
    [1, ...REST],
  ],
  cast: [
    [0, ...REST],
    [0.35, -0.08, -14, -150, -370, 160, -380],
    [0.55, -0.1, -20, -175, -395, 175, -400],
    [0.8, -0.08, -14, -160, -370, 160, -380],
    [1, ...REST],
  ],
  roar: [
    [0, ...REST],
    [0.38, -0.14, -6, -110, -260, 150, -270],
    [0.5, 0.12, 4, -220, -300, 195, -300],
    [0.85, 0.1, 4, -210, -290, 185, -290],
    [1, ...REST],
  ],
  charge: [
    [0, ...REST],
    [0.38, -0.12, -6, -120, -215, 160, -190],
    [0.52, 0.25, 8, -245, -150, 60, -160],
    [0.75, 0.2, 6, -235, -150, 70, -160],
    [1, ...REST],
  ],
  breath: [
    [0, ...REST],
    [0.38, -0.1, -6, -130, -225, 150, -225],
    [0.5, 0.12, 0, -195, -160, 140, -210],
    [0.85, 0.12, 0, -190, -165, 140, -210],
    [1, ...REST],
  ],
};
POSES.shoot = POSES.breath;

function poseAt(pose: string, p: number) {
  const k = POSES[pose];
  return k ? kf(p, k.map((r) => [r[0], ...r.slice(1)])) : REST.slice();
}

export function treant(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState, c: C): Anchors {
  const { P, body, dark, t, L } = c;
  const leaf = hurtTint(ctx, st, P.accent);
  const leafDk = hurtTint(ctx, st, mixHex(P.accent, P.dark, 0.55));
  const leafHi = hurtTint(ctx, st, mixHex(P.accent, P.glow, 0.5));
  const barkLt = mixHex(body, '#8a6a4a', 0.2);
  const dirt = mixHex(P.dark, '#3a2a18', 0.5);
  const dP = st.anim === 'death' ? st.p : 0;
  const atk = st.anim === 'attack';

  // ---------------- pose do quadro
  const [lean0, hipY0, fx, fy, bx, by] = poseAt(c.pose, c.p);
  const [leanPrev] = poseAt(c.pose, c.p - 0.08);
  const swing = (lean0 - leanPrev) * 260; // velocidade da inclinação → atraso da copa
  const idle = 1 - L.w;
  // andar: inclina para onde vai, afunda na pisada, quadril balança
  const bobY = (1 - L.bob) * (8 + L.mv * 6) * L.w;
  const shift = Math.sin(TAU * L.g) * 5 * L.w + Math.sin(t * 0.55) * 3 * idle; // peso trocando de pé
  const rock = Math.sin(TAU * L.g) * 0.025 * L.w;
  const stagger = dP > 0 ? sm(0, 0.12, dP) * (1 - sm(0.2, 0.3, dP)) * Math.sin(t * 40) * 0.03 : 0;
  const lean = lean0 + 0.05 * L.w * L.s * (0.6 + L.mv * 0.6) - st.hurt * 0.1 + stagger - sm(0.05, 0.22, dP) * 0.06 + sm(0.22, 0.5, dP) * 0.08;
  const hipY = -118 + hipY0 + bobY + c.b * 1.5 + sm(0, 0.25, dP) * 16;

  // queda (morte): tomba para a frente girando no pé da frente, quica e assenta
  const fall = easeIn(lin(0.22, 0.7, dP));
  const rot = -(fall * 1.36 - 0.08 * Math.sin(Math.PI * lin(0.7, 0.86, dP)));
  ctx.save();
  ctx.translate(st.hurt * 16, 0);
  ctx.scale(SC, SC);
  if (rot) {
    ctx.translate(-70, 0);
    ctx.rotate(rot);
    ctx.translate(70, 0);
  }

  // ---------------- pernas-raiz
  const stride = (STRIDE * 0.55) / SC;
  let fF = foot(L, 0, -44, stride, 38);
  let fB = foot(L, 0.5, 46, stride, 38);
  // pés cravados durante golpes pesados (slam afasta as pernas)
  if (c.pose === 'slam') {
    const k = sm(0.4, 0.55, c.p) * (1 - sm(0.8, 1, c.p));
    fF = { ...fF, x: fF.x - k * 16 };
    fB = { ...fB, x: fB.x + k * 12 };
  }
  const hipF: V = { x: -30 + shift, y: hipY };
  const hipB: V = { x: 32 + shift, y: hipY };
  const legCol = vgrad(ctx, hipY, 0, barkLt, dark);
  const legBack = mixHex(body, dark, 0.45);
  const leg = (hip: V, f: typeof fF, col: string | CanvasGradient, seed: number) => {
    const knee = ik(hip, f, 68, 64, 1);
    const k2 = { x: knee.x - 6, y: knee.y };
    const pts = bez(hip, k2, k2, { x: f.x, y: f.y - 4 }, 14);
    tube(ctx, pts, (q) => 30 - q * 12 + Math.sin(q * 9 + seed) * 2, col);
    // nó do joelho
    ctx.fillStyle = rgba(P.dark, 0.6);
    ctx.beginPath();
    ctx.ellipse(pts[7].x, pts[7].y, 9, 6, 0.4, 0, TAU);
    ctx.fill();
    const dig = clamp(1 - f.air * 3);
    rootToes(ctx, { x: f.x, y: f.y - 2 }, dig, 4, 44, 9, typeof col === 'string' ? col : dark, t, seed);
    return pts;
  };
  mound(ctx, fB.x, clamp(1 - fB.air * 4), 40, dirt);
  leg(hipB, fB, legBack, 3);
  clods(ctx, fB, dirt, 11);

  // perna da frente (atrás da saia do tronco, mais clara)
  mound(ctx, fF.x, clamp(1 - fF.air * 4), 40, dirt);
  leg(hipF, fF, legCol, 7);
  clods(ctx, fF, dirt, 5);

  // raízes de trás que se arrastam (com atraso)
  for (let i = 0; i < 2; i++) {
    const lag = Math.sin(TAU * (L.g - 0.2 - i * 0.15)) * 10 * L.w + Math.sin(t * 1.3 + i) * 4;
    const r0 = { x: 50 + i * 10 + shift, y: hipY + 20 };
    const tip = { x: 120 + i * 40 + L.s * L.w * 20 + lag, y: 2 };
    tube(ctx, bez(r0, { x: r0.x + 10, y: r0.y + 40 }, { x: tip.x - 50, y: -2 + lag * 0.2 }, tip, 12), (q) => 13 * (1 - q) + 1.5, mixHex(body, dark, 0.55));
  }

  // ---------------- corpo (tronco) acima do quadril
  ctx.save();
  ctx.translate(shift, hipY + 118);
  ctx.translate(0, -118);
  ctx.rotate(rock);
  ctx.translate(0, 118);
  leanF(ctx, lean, -118);

  // braço de trás
  const sway = Math.sin(TAU * L.g + 0.6) * 14 * L.w; // braços balançam opostos às pernas
  const shB = { x: 50, y: -232 };
  const handB = { x: bx + sway + Math.sin(t * 1.1) * 4 * idle, y: by + Math.sin(t * 1.4) * 5 + sm(0.1, 0.5, dP) * 60 };
  limb(ctx, shB, handB, -22, 34, 12, mixHex(body, dark, 0.35));
  clump(ctx, handB.x + 10, handB.y - 10, 32, leaf, leafDk, t, 2);

  // tronco
  ctx.fillStyle = vgrad(ctx, -290, -60, barkLt, dark);
  ctx.beginPath();
  ctx.moveTo(-76, -64);
  ctx.quadraticCurveTo(-58, -110, -64, -160);
  ctx.quadraticCurveTo(-70, -240, -54, -282);
  ctx.lineTo(56, -286);
  ctx.quadraticCurveTo(70, -200, 64, -150);
  ctx.quadraticCurveTo(62, -100, 80, -62);
  ctx.quadraticCurveTo(40, -74, 0, -104);
  ctx.quadraticCurveTo(-40, -74, -76, -64);
  ctx.closePath();
  ctx.fill();
  // sombra lateral (volume)
  ctx.fillStyle = rgba(P.dark, 0.35);
  ctx.beginPath();
  ctx.moveTo(30, -284);
  ctx.quadraticCurveTo(48, -180, 40, -100);
  ctx.lineTo(80, -62);
  ctx.quadraticCurveTo(62, -100, 64, -150);
  ctx.quadraticCurveTo(70, -200, 56, -286);
  ctx.closePath();
  ctx.fill();
  // sulcos da casca
  ctx.strokeStyle = rgba(P.dark, 0.7);
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const x = -48 + i * 16;
    ctx.beginPath();
    ctx.moveTo(x + h01(i, 1) * 6, -270);
    ctx.bezierCurveTo(x + 10, -210, x - 10, -150, x + h01(i, 2) * 10, -86 + Math.abs(x) * 0.3);
    ctx.stroke();
  }
  // luz na borda esquerda
  ctx.strokeStyle = rgba('#e8c890', 0.18);
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-58, -276);
  ctx.quadraticCurveTo(-66, -210, -60, -150);
  ctx.stroke();
  // musgo
  ctx.fillStyle = rgba(P.accent, 0.35);
  ctx.beginPath();
  ctx.ellipse(-52, -98, 16, 24, 0.2, 0, TAU);
  ctx.ellipse(40, -252, 26, 12, 0, 0, TAU);
  ctx.fill();

  // rosto
  const fear = clamp(st.hurt * 1.5);
  const eo = (dP ? 1 - sm(0.3, 0.8, dP) : 1) * blink(t, 11) * (1 - fear * 0.5);
  const squint = c.pose === 'slam' ? sm(0.1, 0.4, c.p) * (1 - sm(0.6, 0.9, c.p)) : 0;
  const wide = c.roar * sm(0.4, 0.5, c.p) * (1 - sm(0.85, 1, c.p));
  ctx.fillStyle = '#120a04';
  for (const ex of [-34, 8]) {
    ctx.beginPath();
    ctx.ellipse(ex, -196, 15 + wide * 3, 11 + wide * 4 - squint * 4, 0, 0, TAU);
    ctx.fill();
  }
  const er = 6 + st.rage * 2 + wide * 2;
  eyeGlow(ctx, -34, -195, er, P.eye, eo * (1 - squint * 0.6));
  eyeGlow(ctx, 8, -195, er, P.eye, eo * (1 - squint * 0.6));
  // sobrancelha de casca (franze no ataque/raiva)
  const frown = clamp(st.rage * 0.5 + squint + wide * 0.6 + c.atk * 0.3);
  ctx.fillStyle = mixHex(body, dark, 0.2);
  ctx.beginPath();
  ctx.moveTo(-58, -216 + frown * 2);
  ctx.quadraticCurveTo(-14, -226 + frown * 10, 30, -214 + frown * 2);
  ctx.lineTo(28, -206);
  ctx.quadraticCurveTo(-14, -212 + frown * 8, -56, -206);
  ctx.fill();
  // boca oca
  const jaw = clamp(c.jaw + 0.1 + fear * 0.3 + wide * 0.3);
  ctx.fillStyle = '#0a0602';
  ctx.beginPath();
  ctx.moveTo(-44, -150);
  for (let i = 0; i <= 6; i++) ctx.lineTo(-44 + i * 10, -150 - (i % 2) * 6);
  for (let i = 6; i >= 0; i--) ctx.lineTo(-44 + i * 10, -146 + jaw * 32 + (i % 2) * 6);
  ctx.closePath();
  ctx.fill();
  if (jaw > 0.3) {
    ctx.fillStyle = rgrad(ctx, -14, -140, 30, rgba(P.glow, 0.6 * jaw), rgba(P.glow, 0));
    ctx.beginPath();
    ctx.arc(-14, -140, 30, 0, TAU);
    ctx.fill();
  }
  const mouth = c.map(-30, -138 + jaw * 12);

  // copa: cada tufo com seu próprio atraso (overlapping action)
  const shake = c.roar * sm(0.45, 0.5, c.p) * (1 - sm(0.8, 1, c.p)) * Math.sin(t * 42) * 5 + st.hurt * Math.sin(t * 50) * 4;
  const glowK = clamp(c.cast * c.atk + st.rage * 0.3);
  const crown: [number, number, number][] = [[-110, -300, 54], [-40, -332, 62], [40, -336, 60], [110, -300, 52], [0, -292, 60], [-72, -272, 40], [82, -272, 40]];
  const lagOf = (i: number) => {
    const d = 0.06 + (Math.abs(crown[i][0]) / 110) * 0.08 + (-crown[i][1] - 270) / 900;
    const bobLag = (bobAt(L.g - d, L.w) - L.bob) * 9;
    const walkLag = L.s * L.w * (6 + L.mv * 6) + Math.sin(TAU * (L.g - d)) * 3 * L.w;
    const wind = Math.sin(t * 0.9 + i * 0.7) * 3 * (0.4 + idle);
    return { x: walkLag + wind - swing * (0.6 + i * 0.05) + shake, y: bobLag + Math.cos(t * 1.1 + i) * 2 };
  };
  const brl = lagOf(1);
  limb(ctx, { x: -20, y: -270 }, { x: -90 + brl.x, y: -330 + brl.y }, 10, 18, 5, dark);
  limb(ctx, { x: 20, y: -270 }, { x: 100 + brl.x, y: -320 + brl.y }, -10, 18, 5, dark);
  for (let i = 0; i < crown.length; i++) {
    const [x, y, r] = crown[i];
    const o = lagOf(i);
    clump(ctx, x + o.x, y + o.y + sm(0.1, 0.4, dP) * 10, r * (1 + c.cast * c.atk * 0.06), leaf, leafDk, t, i, i % 2 ? leafHi : undefined);
  }
  if (glowK > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgrad(ctx, 0, -310, 170, rgba(P.glow, glowK * 0.4), rgba(P.glow, 0));
    ctx.beginPath();
    ctx.arc(0, -310, 170, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // braço da frente (galho-chicote)
  const shF = { x: -50, y: -232 };
  const handAt = (pp: number) => {
    const q = poseAt(c.pose, pp);
    return { x: q[2], y: q[3] };
  };
  const hf = { x: fx - sway + Math.sin(t * 1.2) * 5 * idle, y: fy + Math.sin(t * 1.5 + 1) * 4 + sm(0.1, 0.5, dP) * 70 };
  // rastro do golpe
  if (atk && (c.pose === 'swipe' || c.pose === 'slam')) {
    const a = sm(0.45, 0.5, c.p) * (1 - sm(0.56, 0.66, c.p));
    if (a > 0.03) {
      const tr: V[] = [];
      for (let k = 6; k >= 0; k--) tr.push(handAt(c.p - k * 0.015));
      smear(ctx, tr, 22, mixHex(P.glow, '#ffffff', 0.3), a * 0.45);
    }
  }
  const pts = limb(ctx, shF, hf, 26, 40, 12, mixHex(body, '#8a6a4a', 0.15));
  // dedos de galho (abrem no golpe)
  ctx.strokeStyle = body;
  ctx.lineCap = 'round';
  ctx.lineWidth = 6;
  const dir = Math.atan2(hf.y - pts[8].y, hf.x - pts[8].x);
  const open = 0.45 + c.atk * 0.25;
  for (let i = -1; i <= 1; i++) {
    const a2 = dir + i * open + Math.sin(t * 2 + i) * 0.05;
    ctx.beginPath();
    ctx.moveTo(hf.x, hf.y);
    ctx.quadraticCurveTo(hf.x + Math.cos(a2) * 22, hf.y + Math.sin(a2) * 22, hf.x + Math.cos(a2 + i * 0.3) * 36, hf.y + Math.sin(a2 + i * 0.3) * 36);
    ctx.stroke();
  }
  clump(ctx, pts[6].x, pts[6].y - 16, 22, leaf, leafDk, t, 5);
  const hand = c.map(hf.x + Math.cos(dir) * 30, hf.y + Math.sin(dir) * 30);
  const core = c.map(0, -170);
  const topY = c.map(0, -390).y;
  const canopyW = c.map(0, -320);
  ctx.restore();

  ctx.restore();

  // folhas caindo (mais quando anda/sacode) e explosão de folhas na queda
  falling(ctx, 0, 300, 340, t, 8 + Math.round(L.w * 6 + st.hurt * 6), leaf, 0.8 * (1 - c.die), 4, L.s * L.w * 60);
  if (dP > 0.62) {
    const k = lin(0.62, 1, dP);
    ctx.fillStyle = leaf;
    ctx.globalAlpha = 1 - k;
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI * (0.15 + h01(i, 5) * 0.75);
      const d = k * (60 + h01(i, 6) * 140);
      ctx.beginPath();
      ctx.ellipse(canopyW.x + Math.cos(a) * d, Math.min(0, canopyW.y + Math.sin(a) * d + k * k * 120), 6, 3, i + k * 6, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  return { mouth, hand, core, top: topY, halfW: 160 };
}
