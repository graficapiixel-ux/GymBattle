/**
 * PLANTA 1 — flor carnívora gigante (Rafflesia): um bulbo de raízes que se arrasta com quatro
 * raízes-tentáculo (cada uma estica, se crava e puxa), caule com mola e a cabeça-flor que vem atrasada.
 */
import type { BossSpec } from '@gymbattle/shared';
import type { Anchors, DrawState, V } from '../types';
import { hurtTint, mixHex, rgrad, vgrad, lin, rgba, bez, tube, rising, TAU, clamp, sm, h01 } from '../util';
import { type C, STRIDE, bobAt, blink, clods, foot, kf, mound, rootToes, smear } from './plant-kit';

//           cabeça x, y, giro, abre, chicote x, y, achata
const REST = [-70, -250, -0.15, 1, -165, -175, 0];
const POSES: Record<string, number[][]> = {
  charge: [
    [0, ...REST],
    [0.38, 0, -222, 0.28, 0.88, -60, -100, 0.1],
    [0.45, 10, -215, 0.32, 0.86, -60, -100, 0.14],
    [0.53, -235, -170, -0.5, 1.22, -170, -80, -0.1],
    [0.72, -220, -176, -0.45, 1.15, -165, -85, -0.08],
    [1, ...REST],
  ],
  roar: [
    [0, ...REST],
    [0.38, 0, -265, 0.42, 0.88, -80, -140, 0.08],
    [0.5, -115, -300, -0.35, 1.32, -150, -170, -0.06],
    [0.85, -108, -296, -0.3, 1.28, -150, -165, -0.05],
    [1, ...REST],
  ],
  cast: [
    [0, ...REST],
    [0.35, -40, -300, 0.05, 1.05, -140, -200, 0],
    [0.55, -60, -322, -0.1, 1.25, -150, -232, 0],
    [0.8, -55, -310, -0.08, 1.2, -145, -220, 0],
    [1, ...REST],
  ],
  swipe: [
    [0, ...REST],
    [0.38, -30, -240, 0.15, 1, 90, -262, 0.05],
    [0.45, -30, -240, 0.16, 1, 100, -272, 0.06],
    [0.48, -60, -246, 0, 1.03, -40, -345, 0.03],
    [0.51, -95, -250, -0.2, 1.05, -230, -270, 0],
    [0.55, -112, -240, -0.25, 1.08, -265, -120, -0.05],
    [0.65, -100, -245, -0.2, 1.05, -210, -40, 0],
    [0.85, -80, -250, -0.15, 1, -150, -90, 0],
    [1, ...REST],
  ],
  slam: [
    [0, ...REST],
    [0.4, -30, -330, 0.35, 0.9, -60, -220, 0.08],
    [0.55, -190, -85, -0.9, 1.2, -200, -30, -0.12],
    [0.72, -180, -95, -0.85, 1.15, -195, -35, -0.1],
    [1, ...REST],
  ],
  breath: [
    [0, ...REST],
    [0.38, -20, -262, 0.22, 0.92, -100, -120, 0.06],
    [0.5, -125, -240, -0.3, 1.16, -140, -130, -0.04],
    [0.85, -120, -242, -0.28, 1.14, -138, -128, -0.04],
    [1, ...REST],
  ],
};
POSES.shoot = POSES.breath;

const poseAt = (pose: string, p: number) => (POSES[pose] ? kf(p, POSES[pose]) : REST.slice());

export function rafflesia(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState, c: C): Anchors {
  const { P, t, L } = c;
  const dP = st.anim === 'death' ? st.p : 0;
  const wilt = sm(0.25, 0.8, dP);
  const dead = (col: string) => mixHex(col, '#4a3a22', wilt * 0.55);
  const body = dead(c.body);
  const dark = dead(c.dark);
  const green = hurtTint(ctx, st, dead('#3a6a2a'));
  const greenLt = hurtTint(ctx, st, dead('#6a9a3a'));
  const greenDk = hurtTint(ctx, st, dead('#1e3a14'));
  const thorn = hurtTint(ctx, st, '#c8d080');
  const dirt = mixHex(P.dark, '#3a2a18', 0.6);
  const idle = 1 - L.w;
  const atk = st.anim === 'attack';

  let [hx, hy, hr, flare, wx, wy, squash] = poseAt(c.pose, c.p);
  // movimento do quadro anterior (para atraso das pétalas e rastro)
  const prev = poseAt(c.pose, c.p - 0.06);
  const hv = { x: hx - prev[0], y: hy - prev[1] };

  // ---------------- arrasto: corpo dá trancos a cada puxada das raízes
  const pull = Math.sin(TAU * 2 * L.g) * L.w;
  const bulbX = -pull * 7 * L.s + Math.sin(t * 0.7) * 2 * idle;
  const bob = bobAt(L.g, L.w);
  const shudder = dP > 0 ? sm(0, 0.08, dP) * (1 - sm(0.25, 0.35, dP)) * Math.sin(t * 45) : 0;

  // cabeça: idle em "oito", atraso no andar, tranco do dano, murcha na morte
  hx += Math.sin(t * 0.9) * 8 * idle + L.s * L.w * (14 + L.mv * 8) + Math.sin(TAU * 2 * (L.g - 0.18)) * 5 * L.w + st.hurt * 30 + shudder * 6;
  hy += Math.sin(t * 1.8) * 4 * idle + c.b * 3 + (bobAt(L.g - 0.15, L.w) - 0.5) * 10 * L.w + st.hurt * 8;
  hr += Math.sin(t * 0.9 + 1) * 0.05 * idle + st.hurt * 0.3 - L.s * L.w * 0.06;
  hx = hx + (-170 - hx) * wilt;
  hy = hy + (-45 - hy) * wilt;
  hr = hr + (-1.5 - hr) * wilt;
  flare *= 1 - wilt * 0.3;
  wx += Math.sin(t * 1.6) * 12 + bulbX;
  wy += Math.cos(t * 1.3) * 10 + wilt * 110;

  ctx.save();
  ctx.translate(bulbX, 0);

  // ---------------- raízes-tentáculo (as de trás primeiro)
  const stride = STRIDE * 0.62;
  const roots: { at: V; f: ReturnType<typeof foot>; front: boolean }[] = [
    { at: { x: 40, y: -38 }, f: foot(L, 0.25, 105, stride, 34, 0.62), front: false },
    { at: { x: 10, y: -30 }, f: foot(L, 0.75, 45, stride, 34, 0.62), front: false },
    { at: { x: -30, y: -34 }, f: foot(L, 0.5, -60, stride, 40, 0.62), front: true },
    { at: { x: -60, y: -44 }, f: foot(L, 0, -125, stride, 44, 0.62), front: true },
  ];
  const drawRoot = (r: (typeof roots)[number], i: number) => {
    const f = { x: r.f.x - bulbX, y: r.f.y };
    const curl = wilt * 30;
    const arch = 30 + r.f.air * 55 + curl;
    const tip = { x: f.x, y: f.y - 6 + curl * 0.3 };
    const pts = bez({ x: r.at.x, y: r.at.y - squash * 30 }, { x: (r.at.x + f.x) / 2 + 10, y: r.at.y - arch }, { x: f.x + 14, y: f.y - arch * 0.6 }, tip, 14);
    const col = r.front ? green : greenDk;
    mound(ctx, f.x, clamp(1 - r.f.air * 4) * (1 - wilt), 26, dirt);
    tube(ctx, pts, (q) => 24 - q * 17 + Math.sin(q * 12 + i) * 1.5, col);
    // espinhos na raiz
    ctx.fillStyle = thorn;
    for (let k = 3; k < 12; k += 4) {
      const a = pts[k];
      ctx.beginPath();
      ctx.moveTo(a.x - 3, a.y - 3);
      ctx.lineTo(a.x + 2, a.y - 13);
      ctx.lineTo(a.x + 4, a.y - 2);
      ctx.fill();
    }
    rootToes(ctx, tip, clamp(1 - r.f.air * 3) * (1 - wilt), 3, 26, 5, col, t, i * 3);
    clods(ctx, { ...r.f, x: f.x }, dirt, i * 7);
  };
  drawRoot(roots[0], 0);
  drawRoot(roots[1], 1);

  // cipó de trás com espinhos (balança com atraso)
  const vine = (root: V, tip: V, w: number, col: string) => {
    const pts = bez(root, { x: root.x + 20, y: root.y - 80 }, { x: (root.x + tip.x) / 2 + 50, y: tip.y + 50 }, tip, 18);
    tube(ctx, pts, (q) => w * (1 - q) + 3, col);
    ctx.fillStyle = thorn;
    for (let i = 3; i < pts.length - 1; i += 3) {
      ctx.beginPath();
      ctx.moveTo(pts[i].x - 4, pts[i].y);
      ctx.lineTo(pts[i].x, pts[i].y - 10);
      ctx.lineTo(pts[i].x + 4, pts[i].y);
      ctx.fill();
    }
    return pts;
  };
  const backTip = { x: 165 + Math.sin(t * 1.4) * 14 + L.s * L.w * 26 + Math.sin(TAU * (L.g - 0.3)) * 10 * L.w, y: -225 + Math.cos(t * 1.1) * 14 + wilt * 200 };
  vine({ x: 50, y: -60 }, backTip, 16, greenDk);

  // folhas grandes de trás (abanam no ritmo das puxadas)
  const leafAt = (x: number, a: number, Lh: number, col: string, ph: number) => {
    ctx.save();
    ctx.translate(x, -30 + squash * 10);
    ctx.rotate(a + Math.sin(t * 1.2 + ph) * 0.04 + Math.sin(TAU * 2 * (L.g - ph * 0.05)) * 0.1 * L.w + wilt * 0.5 * Math.sign(Math.cos(a)));
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(Lh * 0.5, -Lh * 0.3, Lh, 0);
    ctx.quadraticCurveTo(Lh * 0.5, Lh * 0.26, 0, 0);
    ctx.fill();
    ctx.strokeStyle = greenDk;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(Lh * 0.5, -Lh * 0.05, Lh * 0.92, 0);
    for (let k = 1; k < 4; k++) {
      ctx.moveTo(Lh * k * 0.22, -Lh * 0.02);
      ctx.lineTo(Lh * k * 0.22 + 14, -Lh * 0.12);
      ctx.moveTo(Lh * k * 0.22, Lh * 0.0);
      ctx.lineTo(Lh * k * 0.22 + 14, Lh * 0.1);
    }
    ctx.stroke();
    ctx.restore();
  };
  leafAt(60, -0.35, 130, greenDk, 1);
  leafAt(-40, Math.PI + 0.45, 120, green, 2);

  // ---------------- bulbo de raízes
  const sq = 1 - squash * 0.6 + pull * 0.04 - wilt * 0.35;
  const bw = 96 * (1 + squash * 0.4 - pull * 0.03 + wilt * 0.1);
  const bh = 58 * sq + c.b * 1.5;
  ctx.fillStyle = vgrad(ctx, -bh * 1.6, 0, mixHex(greenLt, body, 0.25), greenDk);
  ctx.beginPath();
  ctx.moveTo(-bw, -6);
  ctx.bezierCurveTo(-bw * 1.05, -bh * 1.3, -bw * 0.3, -bh * 1.75, 0, -bh * 1.7);
  ctx.bezierCurveTo(bw * 0.4, -bh * 1.75, bw * 1.05, -bh * 1.2, bw, -6);
  ctx.quadraticCurveTo(0, 6, -bw, -6);
  ctx.fill();
  // veias avermelhadas
  ctx.strokeStyle = rgba(P.body, 0.45);
  ctx.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    const x = -bw * 0.7 + i * bw * 0.35;
    ctx.beginPath();
    ctx.moveTo(x, -8);
    ctx.quadraticCurveTo(x * 0.6 + Math.sin(i * 2) * 10, -bh * 0.9, x * 0.25, -bh * 1.6);
    ctx.stroke();
  }
  // brilho do bulbo
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.ellipse(-bw * 0.35, -bh * 1.2, bw * 0.3, bh * 0.25, -0.4, 0, TAU);
  ctx.fill();

  // raízes da frente
  drawRoot(roots[2], 2);
  drawRoot(roots[3], 3);

  // ---------------- caule com mola até a cabeça
  const base = { x: 10, y: -bh * 1.55 };
  const head = { x: hx - bulbX, y: hy };
  const lagX = -hv.x * 0.8 + L.s * L.w * 10;
  const stemPts = bez(base, { x: base.x + 40 + lagX * 0.3, y: Math.min(base.y - 90, head.y - 70) + wilt * 60 }, { x: head.x + 80 + lagX, y: head.y + 50 - 85 * clamp((head.y + 230) / 70) - wilt * 40 }, { x: head.x + 30, y: head.y + 10 }, 20);
  tube(ctx, stemPts, (q) => 46 - q * 16, vgrad(ctx, hy, 0, mixHex(green, '#9aca5a', 0.3), greenDk));
  // listra de luz no caule
  ctx.strokeStyle = rgba('#d8ff9a', 0.18 * (1 - wilt));
  ctx.lineWidth = 4;
  ctx.beginPath();
  stemPts.forEach((p, i) => (i ? ctx.lineTo(p.x - 10, p.y) : ctx.moveTo(p.x - 10, p.y)));
  ctx.stroke();
  // folhinhas no caule (atrasadas)
  for (const i of [7, 13]) {
    const p = stemPts[i];
    ctx.fillStyle = i === 7 ? green : greenLt;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((i === 7 ? 0.6 : -2.6) + Math.sin(t * 2 + i) * 0.12 + Math.sin(TAU * 2 * (L.g - 0.3)) * 0.2 * L.w - hv.y * 0.01 + wilt * 0.8);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(30, -18, 62, 0);
    ctx.quadraticCurveTo(30, 18, 0, 0);
    ctx.fill();
    ctx.restore();
  }

  // cipó que chicoteia (swipe) — por trás da cabeça
  const whipAt = (pp: number) => {
    const q = poseAt(c.pose, pp);
    return { x: q[4] + Math.sin(t * 1.6) * 12, y: q[5] + Math.cos(t * 1.3) * 10 };
  };
  if (atk && c.pose === 'swipe') {
    const a = sm(0.46, 0.5, c.p) * (1 - sm(0.58, 0.68, c.p));
    if (a > 0.03) {
      const tr: V[] = [];
      for (let k = 6; k >= 0; k--) tr.push(whipAt(c.p - k * 0.014));
      smear(ctx, tr, 20, mixHex(P.glow, '#ffffff', 0.4), a * 0.45);
    }
  }
  const whipPts = vine({ x: -40, y: -bh }, { x: wx - bulbX, y: wy }, 18, green);
  const whipTip = whipPts[whipPts.length - 1];

  // ---------------- cabeça-flor (3/4, virada para a esquerda)
  const nP = Math.max(5, Math.round(s.feat.petals ?? 6));
  const jaw = clamp(c.jaw + c.cast * c.atk * 0.4 + 0.15 + st.rage * 0.1 + st.hurt * 0.4 - wilt * 0.2);
  const fl = flare * (1 + jaw * 0.08);
  ctx.save();
  ctx.translate(head.x, head.y);
  ctx.rotate(hr);
  ctx.scale(0.72, 1);
  const spin = c.cast * c.atk * c.p * 2;
  // pétalas: cada uma treme com seu próprio atraso
  const petal = (i: number, L0: number, inner: boolean) => {
    const a = (i / nP) * TAU + spin + 0.3 + (inner ? Math.PI / nP : 0);
    const flut = Math.sin(t * 2.2 + i * 1.3) * 0.04 + Math.sin(TAU * 2 * (L.g - 0.25 - i * 0.04)) * 0.07 * L.w + (hv.x * Math.cos(a) + hv.y * Math.sin(a)) * 0.004 + st.hurt * Math.sin(t * 40 + i) * 0.08;
    // murcha: pétalas pendem para baixo (no espaço da cabeça)
    const droop = wilt * 0.9 * Math.sin(a + Math.PI / 2 - hr);
    const Lp = L0 * fl * (1 - wilt * 0.25 * h01(i, 4));
    ctx.save();
    ctx.rotate(a + flut + droop);
    ctx.fillStyle = vgrad(ctx, -18, -Lp, inner ? mixHex(body, dark, 0.3) : body, mixHex(body, dark, inner ? 0.6 : 0.45));
    ctx.beginPath();
    ctx.moveTo(-24, -18);
    ctx.quadraticCurveTo(-48, -Lp * 0.8, -6, -Lp);
    ctx.quadraticCurveTo(0, -Lp * 1.04, 6, -Lp);
    ctx.quadraticCurveTo(48, -Lp * 0.8, 24, -18);
    ctx.closePath();
    ctx.fill();
    // borda clara + manchas
    if (!inner) {
      ctx.strokeStyle = rgba('#ffd0d8', 0.25);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-40, -Lp * 0.6);
      ctx.quadraticCurveTo(-36, -Lp * 0.95, -4, -Lp);
      ctx.stroke();
      ctx.fillStyle = rgba('#ffe8d8', 0.75);
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const r = 4 + h01(k, i) * 3;
        const x = (h01(i, k) - 0.5) * 34;
        const y = -36 - k * 11;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, TAU);
      }
      ctx.fill();
    }
    ctx.restore();
  };
  for (let i = 0; i < nP; i++) petal(i, 86, false);
  for (let i = 0; i < nP; i++) petal(i, 56, true);
  // boca no centro com anel de dentes
  const mr = 30 + jaw * 16;
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(0, 0, mr + 10, 0, TAU);
  ctx.fill();
  const hole = mr * (0.3 + jaw * 0.7);
  ctx.fillStyle = rgrad(ctx, 0, 0, hole, '#000000', '#3a0410');
  ctx.beginPath();
  ctx.arc(0, 0, hole, 0, TAU);
  ctx.fill();
  ctx.fillStyle = hurtTint(ctx, st, '#f4ecd8');
  ctx.beginPath();
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + Math.sin(t * 3) * 0.02;
    const r0 = mr + 6;
    const r1 = Math.max(4, hole - 2);
    ctx.moveTo(Math.cos(a - 0.15) * r0, Math.sin(a - 0.15) * r0);
    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.lineTo(Math.cos(a + 0.15) * r0, Math.sin(a + 0.15) * r0);
  }
  ctx.fill();
  // estames que se mexem dentro da boca (olhos falsos que piscam)
  const eo = blink(t, 21) * (1 - wilt);
  ctx.strokeStyle = greenLt;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i - 1) * 0.7 + Math.sin(t * 2.6 + i * 2) * 0.25;
    const len = (14 + jaw * 22) * (0.8 + h01(i, 8) * 0.4);
    const ex = Math.cos(a) * len;
    const ey = Math.sin(a) * len;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(ex * 0.5 + Math.sin(t * 3 + i) * 4, ey * 0.5, ex, ey);
    ctx.stroke();
    ctx.fillStyle = P.eye;
    ctx.beginPath();
    ctx.ellipse(ex, ey, 4 + st.rage * 1.5, Math.max(0.5, (4 + st.rage * 1.5) * eo), 0, 0, TAU);
    ctx.fill();
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgrad(ctx, 0, 0, mr, rgba(P.glow, (0.3 + jaw * 0.4) * (1 - wilt)), rgba(P.glow, 0));
  ctx.beginPath();
  ctx.arc(0, 0, mr, 0, TAU);
  ctx.fill();
  ctx.restore();
  const mouth = c.map(-10, 0);
  const headTop = c.map(0, -90).y;
  ctx.restore();

  const core = c.map((head.x + base.x) / 2, (head.y + base.y) / 2);
  const hand = c.swipe > 0 ? c.map(whipTip.x, whipTip.y) : mouth;
  ctx.restore();

  // pólen/esporos (e uma nuvem quando morre)
  rising(ctx, hx, hy + 20, 160, 140, t * 0.12, 21, 8 + Math.round((c.roar * c.atk + st.rage) * 10), P.accent, 1, 0.7 * (1 - c.die), 3);
  if (dP > 0.5) {
    const k = lin(0.5, 1, dP);
    ctx.fillStyle = rgba(P.accent, 0.5 * (1 - k));
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.arc(hx + (h01(i, 2) - 0.5) * 140 * k, hy - 20 - k * 60 * h01(i, 3), 10 + k * 26, 0, TAU);
      ctx.fill();
    }
  }
  return { mouth, hand, core, top: Math.min(headTop, -260), halfW: 150 };
}
