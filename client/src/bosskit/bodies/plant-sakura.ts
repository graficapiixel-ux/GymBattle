/**
 * PLANTA 3 — cerejeira que sangra (Sakuraya): tronco torcido em S sobre duas pernas-raiz que
 * arrancam e replantam; galhos e nuvens de flor balançam com atraso, pétalas caem (mais ao andar)
 * e a seiva vermelha escorre do rosto e pinga dos galhos.
 */
import type { BossSpec } from '@gymbattle/shared';
import type { Anchors, DrawState, V } from '../types';
import { eyeGlow, hurtTint, mixHex, rgrad, vgrad, easeIn, lin, rgba, bez, tube, TAU, clamp, sm, h01 } from '../util';
import { type C, STRIDE, bobAt, blink, clods, clump, falling, foot, ik, kf, leanF, limb, mound, rootToes, smear } from './plant-kit';

const SC = 0.9;
//            lean  hipY  mão x, y     ergue galhos
const REST = [0, 0, -150, -200, 0];
const POSES: Record<string, number[][]> = {
  cast: [
    [0, ...REST],
    [0.35, -0.06, -14, -110, -335, 1],
    [0.55, -0.08, -18, -122, -350, 1.2],
    [0.8, -0.07, -14, -115, -338, 1.1],
    [1, ...REST],
  ],
  slam: [
    [0, ...REST],
    [0.36, -0.14, -14, -150, -360, 0.8],
    [0.44, -0.15, -16, -140, -372, 0.9],
    [0.5, 0.06, 0, -260, -235, 0.3],
    [0.55, 0.24, 14, -222, -6, -0.4],
    [0.7, 0.2, 10, -215, -12, -0.3],
    [1, ...REST],
  ],
  roar: [
    [0, ...REST],
    [0.38, -0.14, -6, -110, -270, 0.6],
    [0.5, 0.12, 4, -220, -300, 1.3],
    [0.85, 0.1, 4, -212, -292, 1.2],
    [1, ...REST],
  ],
  swipe: [
    [0, ...REST],
    [0.38, -0.1, -6, -20, -330, 0.4],
    [0.45, -0.11, -6, -25, -340, 0.4],
    [0.5, 0.08, 2, -220, -285, 0.1],
    [0.54, 0.16, 6, -258, -150, 0],
    [0.62, 0.14, 6, -205, -60, 0],
    [0.78, 0.06, 2, -168, -110, 0],
    [1, ...REST],
  ],
  charge: [
    [0, ...REST],
    [0.38, -0.12, -6, -120, -220, 0.2],
    [0.52, 0.25, 8, -248, -160, -0.2],
    [0.75, 0.2, 6, -236, -160, -0.1],
    [1, ...REST],
  ],
  breath: [
    [0, ...REST],
    [0.38, -0.1, -6, -130, -230, 0.3],
    [0.5, 0.12, 0, -198, -170, 0.5],
    [0.85, 0.12, 0, -192, -172, 0.5],
    [1, ...REST],
  ],
};
POSES.shoot = POSES.breath;

const poseAt = (pose: string, p: number) => (POSES[pose] ? kf(p, POSES[pose]) : REST.slice());

export function sakura(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState, c: C): Anchors {
  const { P, body, dark, t, L } = c;
  const blossom = hurtTint(ctx, st, P.accent);
  const blossomDk = hurtTint(ctx, st, mixHex(P.accent, P.glow, 0.55));
  const blossomHi = hurtTint(ctx, st, mixHex(P.accent, '#ffffff', 0.45));
  const barkLt = mixHex(body, '#b07070', 0.5);
  const barkMid = mixHex(body, '#7a4646', 0.4);
  const sap = hurtTint(ctx, st, '#b0081c');
  const dirt = mixHex(P.dark, '#2a1012', 0.4);
  const dP = st.anim === 'death' ? st.p : 0;
  const atk = st.anim === 'attack';
  const idle = 1 - L.w;

  const [lean0, hipY0, fx, fy, raise] = poseAt(c.pose, c.p);
  const [leanPrev] = poseAt(c.pose, c.p - 0.08);
  const swing = (lean0 - leanPrev) * 260;
  const bobY = (1 - L.bob) * (7 + L.mv * 6) * L.w;
  const shift = Math.sin(TAU * L.g) * 5 * L.w + Math.sin(t * 0.5) * 3 * idle;
  const rock = Math.sin(TAU * L.g) * 0.02 * L.w;
  const stagger = dP > 0 ? sm(0, 0.1, dP) * (1 - sm(0.25, 0.35, dP)) * Math.sin(t * 36) * 0.03 : 0;
  const lean = lean0 + 0.05 * L.s * L.w * (0.6 + L.mv * 0.6) - st.hurt * 0.1 + stagger + Math.sin(t * 0.7) * 0.015 * idle;
  // morte: os joelhos cedem, depois o tronco tomba para a frente
  const kneel = sm(0.08, 0.4, dP);
  const hipY = -112 + hipY0 + bobY + c.b * 1.5 + kneel * 46;
  const fall = easeIn(lin(0.35, 0.78, dP));
  const rot = -(fall * 1.2 - 0.07 * Math.sin(Math.PI * lin(0.78, 0.92, dP)));

  // poça de seiva (só quando parado)
  if (idle > 0.05) {
    ctx.fillStyle = rgba('#6a0010', 0.6 * idle);
    ctx.beginPath();
    ctx.ellipse(-20, 0, 110 * (0.5 + idle * 0.5), 9, 0, 0, TAU);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(st.hurt * 16, 0);
  ctx.scale(SC, SC);
  if (rot) {
    ctx.translate(-60, 0);
    ctx.rotate(rot);
    ctx.translate(60, 0);
  }

  // ---------------- pernas-raiz
  const stride = (STRIDE * 0.55) / SC;
  let fF = foot(L, 0, -40, stride, 36);
  let fB = foot(L, 0.5, 44, stride, 36);
  if (c.pose === 'slam') {
    const k = sm(0.4, 0.55, c.p) * (1 - sm(0.8, 1, c.p));
    fF = { ...fF, x: fF.x - k * 16 };
    fB = { ...fB, x: fB.x + k * 12 };
  }
  if (kneel > 0) {
    fF = { ...fF, x: fF.x - kneel * 20 };
    fB = { ...fB, x: fB.x + kneel * 20 };
  }
  const hipF: V = { x: -24 + shift, y: hipY };
  const hipB: V = { x: 30 + shift, y: hipY };
  const leg = (hip: V, f: typeof fF, col: string | CanvasGradient, tcol: string, seed: number) => {
    const knee = ik(hip, f, 62, 60, 1);
    const pts = bez(hip, { x: knee.x - 4, y: knee.y }, { x: knee.x - 4, y: knee.y }, { x: f.x, y: f.y - 4 }, 14);
    tube(ctx, pts, (q) => 24 - q * 10 + Math.sin(q * 11 + seed) * 2, col);
    // estrias torcidas na perna
    ctx.strokeStyle = rgba(P.dark, 0.6);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 1; i < pts.length - 1; i++) {
      const o = Math.sin(i * 0.9 + seed) * 6;
      if (i === 1) ctx.moveTo(pts[i].x + o, pts[i].y);
      else ctx.lineTo(pts[i].x + o, pts[i].y);
    }
    ctx.stroke();
    rootToes(ctx, { x: f.x, y: f.y - 2 }, clamp(1 - f.air * 3), 4, 42, 8, tcol, t, seed);
    // ponta da raiz sangra um pouco quando arranca
    if (!f.stance && f.u < 0.5 && f.air > 0.1) {
      ctx.fillStyle = sap;
      ctx.globalAlpha = 1 - f.u * 2;
      ctx.beginPath();
      ctx.ellipse(f.x, f.y + 14 + f.u * 30, 3, 5, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  };
  const legBack = mixHex(body, '#5a3030', 0.3);
  mound(ctx, fB.x, clamp(1 - fB.air * 4), 36, dirt);
  leg(hipB, fB, legBack, legBack, 3);
  clods(ctx, fB, dirt, 11);
  mound(ctx, fF.x, clamp(1 - fF.air * 4), 36, dirt);
  leg(hipF, fF, vgrad(ctx, hipY, 0, barkLt, barkMid), barkMid, 7);
  clods(ctx, fF, dirt, 5);
  // raízes finas que se arrastam atrás
  for (let i = 0; i < 2; i++) {
    const lag = Math.sin(TAU * (L.g - 0.2 - i * 0.15)) * 10 * L.w + Math.sin(t * 1.2 + i) * 4;
    const r0 = { x: 40 + i * 8 + shift, y: hipY + 16 };
    const tip = { x: 120 + i * 46 + L.s * L.w * 22 + lag, y: 2 };
    tube(ctx, bez(r0, { x: r0.x + 10, y: r0.y + 40 }, { x: tip.x - 50, y: -2 + lag * 0.2 }, tip, 12), (q) => 10 * (1 - q) + 1.5, mixHex(body, dark, 0.55));
  }

  // ---------------- tronco e copa (acima do quadril)
  ctx.save();
  ctx.translate(shift, hipY + 112);
  ctx.translate(0, -112);
  ctx.rotate(rock);
  ctx.translate(0, 112);
  leanF(ctx, lean + kneel * 0.1, -112);

  // tronco retorcido em S (respira e torce devagar)
  const twist = Math.sin(t * 0.8) * 4 + Math.sin(TAU * (L.g - 0.1)) * 4 * L.w;
  const trunk = bez({ x: 2, y: -96 }, { x: 56, y: -150 }, { x: -64 + twist, y: -185 }, { x: 10 + twist * 0.5, y: -250 }, 20);
  // base do tronco (pélvis de raízes)
  ctx.fillStyle = barkMid;
  ctx.beginPath();
  ctx.moveTo(-50, -100);
  ctx.quadraticCurveTo(-30, -140, 0, -150);
  ctx.quadraticCurveTo(46, -140, 58, -98);
  ctx.quadraticCurveTo(30, -112, 2, -98);
  ctx.quadraticCurveTo(-24, -112, -50, -100);
  ctx.fill();
  tube(ctx, trunk, (q) => 72 - q * 32, vgrad(ctx, -250, -96, barkLt, barkMid));
  ctx.strokeStyle = rgba(P.dark, 0.8);
  ctx.lineWidth = 3;
  for (let j = -1; j <= 1; j++) {
    ctx.beginPath();
    trunk.forEach((p, i) => {
      const off = j * (22 - i * 0.8) + Math.sin(i * 0.6 + j) * 6;
      if (i) ctx.lineTo(p.x + off, p.y);
      else ctx.moveTo(p.x + off, p.y);
    });
    ctx.stroke();
  }
  // brilho lateral
  ctx.strokeStyle = rgba('#ffd0d8', 0.12);
  ctx.lineWidth = 5;
  ctx.beginPath();
  trunk.forEach((p, i) => (i ? ctx.lineTo(p.x - 26 + i * 0.8, p.y) : ctx.moveTo(p.x - 26, p.y)));
  ctx.stroke();

  // galhos: cada um com atraso próprio (overlapping action)
  const lagOf = (i: number, x: number, y: number) => {
    const d = 0.06 + (Math.abs(x) / 150) * 0.08 + (-y - 280) / 900;
    const bobLag = (bobAt(L.g - d, L.w) - L.bob) * 9;
    const walkLag = L.s * L.w * (6 + L.mv * 6) + Math.sin(TAU * (L.g - d)) * 3 * L.w;
    const wind = Math.sin(t * 0.8 + i * 0.9) * 3.5 * (0.4 + idle);
    const shake = c.roar * sm(0.45, 0.5, c.p) * (1 - sm(0.8, 1, c.p)) * Math.sin(t * 40 + i) * 5 + st.hurt * Math.sin(t * 50 + i) * 4;
    return { x: walkLag + wind - swing * (0.6 + i * 0.05) + shake, y: bobLag + Math.cos(t * 1.1 + i) * 2 + sm(0.3, 0.7, dP) * 20 };
  };
  const tip0 = trunk[20];
  const branches: { a: V; tip: V; w: number }[] = [
    { a: { x: tip0.x, y: tip0.y + 12 }, tip: { x: 135, y: -290 - raise * 30 }, w: 24 },
    { a: { x: tip0.x, y: tip0.y }, tip: { x: 24, y: -330 - raise * 12 }, w: 22 },
    { a: { x: tip0.x, y: tip0.y + 12 }, tip: { x: -112, y: -300 - raise * 30 }, w: 22 },
  ];
  branches.forEach((br, i) => {
    const o = lagOf(i, br.tip.x, br.tip.y);
    br.tip = { x: br.tip.x + o.x, y: br.tip.y + o.y };
    limb(ctx, br.a, br.tip, 20, br.w, 6, barkMid);
  });

  // braço de galho da frente (chicote) — atrás das flores da frente
  const sway = Math.sin(TAU * L.g + 0.6) * 14 * L.w;
  const hf = { x: fx - sway + Math.sin(t * 1.1) * 6 * idle + sm(0.1, 0.6, dP) * 90, y: fy + Math.sin(t * 1.4 + 1) * 4 - sm(0.1, 0.6, dP) * 30 };
  const handAt = (pp: number) => {
    const q = poseAt(c.pose, pp);
    return { x: q[2], y: q[3] };
  };
  if (atk && (c.pose === 'swipe' || c.pose === 'slam')) {
    const a = sm(0.45, 0.5, c.p) * (1 - sm(0.56, 0.66, c.p));
    if (a > 0.03) {
      const tr: V[] = [];
      for (let k = 6; k >= 0; k--) tr.push(handAt(c.p - k * 0.015));
      smear(ctx, tr, 22, mixHex(P.accent, '#ffffff', 0.4), a * 0.5);
    }
  }
  const armPts = limb(ctx, { x: trunk[9].x - 10, y: trunk[9].y }, hf, 30, 24, 5, mixHex(barkLt, barkMid, 0.4));

  // nuvens de flor
  const pulse = 1 + c.roar * sm(0.42, 0.52, c.p) * (1 - sm(0.8, 1, c.p)) * 0.15 + c.cast * c.atk * 0.08 + Math.sin(t * 1.2) * 0.015;
  const clouds: [number, number, number][] = [[-120, -300, 46], [-50, -335, 48], [30, -340, 50], [110, -300, 48], [150, -252, 34], [-150, -252, 32], [-10, -282, 44], [70, -287, 38]];
  clouds.forEach(([x, y, r], i) => {
    const o = lagOf(i + 3, x, y);
    clump(ctx, x + o.x, y + o.y - raise * (y < -310 ? 14 : 22), r * pulse * (1 - sm(0.5, 0.9, dP) * 0.3), blossom, blossomDk, t, i + 7, i % 2 ? blossomHi : undefined);
  });
  clump(ctx, hf.x + 10, hf.y - 10, 26, blossom, blossomDk, t, 3, blossomHi);
  clump(ctx, armPts[6].x, armPts[6].y - 14, 20, blossom, blossomDk, t, 9);
  const glowK = clamp(c.cast * c.atk + c.roar * c.atk * 0.6 + st.rage * 0.3);
  if (glowK > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgrad(ctx, 0, -300, 180, rgba(P.glow, glowK * 0.35), rgba(P.glow, 0));
    ctx.beginPath();
    ctx.arc(0, -300, 180, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // rosto no tronco com lágrimas de seiva
  const fxp = trunk[11].x;
  const fyp = trunk[11].y;
  const eo = (dP ? 1 - sm(0.3, 0.75, dP) : blink(t, 41)) * (1 - st.hurt * 0.5);
  const wide = (c.roar + c.breath + c.shoot) * sm(0.42, 0.5, c.p) * (1 - sm(0.85, 1, c.p));
  ctx.fillStyle = '#0a0204';
  ctx.beginPath();
  ctx.ellipse(fxp - 22, fyp - 10, 10 + wide * 2, 7 + wide * 3, 0.2, 0, TAU);
  ctx.ellipse(fxp + 10, fyp - 12, 9 + wide * 2, 6 + wide * 3, -0.2, 0, TAU);
  ctx.fill();
  eyeGlow(ctx, fxp - 22, fyp - 10, 4 + st.rage * 2, P.eye, eo);
  eyeGlow(ctx, fxp + 10, fyp - 12, 3.5 + st.rage * 2, P.eye, eo);
  ctx.strokeStyle = sap;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  for (const [x, y, ph] of [[fxp - 22, fyp - 4, 0], [fxp + 10, fyp - 6, 1.3]]) {
    const len = 30 + Math.sin(t * 1.2 + ph) * 8 + st.hurt * 10;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x - 4, y + len * 0.5, x - 2, y + len);
    ctx.stroke();
    // gota se formando na ponta
    const k = (t * 0.7 + ph) % 1;
    ctx.fillStyle = sap;
    ctx.beginPath();
    ctx.ellipse(x - 2, y + len + k * k * 30, 2.5 + k * 1.5, 3 + k * 2, 0, 0, TAU);
    ctx.fill();
  }
  const jaw = clamp(c.jaw + 0.1 + st.hurt * 0.3 + wide * 0.3);
  ctx.fillStyle = '#0a0204';
  ctx.beginPath();
  ctx.ellipse(fxp - 8, fyp + 26, 16, Math.max(2, 3 + jaw * 14), 0.1, 0, TAU);
  ctx.fill();
  if (jaw > 0.3) {
    ctx.fillStyle = rgrad(ctx, fxp - 8, fyp + 26, 26, rgba(P.glow, jaw * 0.5), rgba(P.glow, 0));
    ctx.beginPath();
    ctx.arc(fxp - 8, fyp + 26, 26, 0, TAU);
    ctx.fill();
  }
  const mouth = c.map(fxp - 12, fyp + 26);
  // gotas de seiva caindo dos galhos (até o chão do corpo)
  ctx.fillStyle = sap;
  for (let i = 0; i < 5; i++) {
    const k = (t * 0.5 + h01(i, 3)) % 1;
    const sx = -120 + i * 60 + h01(i, 4) * 20;
    const sy = -260 + h01(i, 5) * 40;
    const y = sy + k * k * (-110 - sy);
    ctx.globalAlpha = 1 - k * 0.6;
    ctx.beginPath();
    ctx.ellipse(sx, y, 3, 5, 0, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const dir = Math.atan2(hf.y - armPts[9].y, hf.x - armPts[9].x);
  const hand = c.map(hf.x + Math.cos(dir) * 20, hf.y + Math.sin(dir) * 20);
  const core = c.map(fxp, fyp + 40);
  const topY = c.map(0, -395).y;
  const crownW = c.map(0, -310);
  ctx.restore();
  ctx.restore();

  // pétalas caindo (vento para trás quando anda; tempestade na morte)
  falling(ctx, 0, 380, 360, t, 14 + Math.round(glowK * 10 + L.w * 8), P.accent, 0.9 * (1 - sm(0.85, 1, dP)), 8, L.s * L.w * 80);
  if (dP > 0.6) {
    const k = lin(0.6, 1, dP);
    ctx.fillStyle = blossom;
    ctx.globalAlpha = 1 - k;
    for (let i = 0; i < 18; i++) {
      const a = -Math.PI * (0.1 + h01(i, 5) * 0.8);
      const d = k * (60 + h01(i, 6) * 160);
      ctx.beginPath();
      ctx.ellipse(crownW.x + Math.cos(a) * d, Math.min(0, crownW.y + Math.sin(a) * d + k * k * 110), 6, 3, i + k * 6, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  return { mouth, hand, core, top: topY, halfW: 170 };
}
