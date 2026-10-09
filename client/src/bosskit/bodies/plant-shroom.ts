/**
 * PLANTA 2 — rei cogumelo (Myconid): anda em passinhos saltitantes (sobe e desce bastante,
 * achata ao pisar e estica ao subir), balança de um lado para o outro; o chapéu vem atrasado
 * e "gelatina" depois de cada pisada. Os cogumelinhos brotam em volta quando ele fica parado.
 */
import type { BossSpec } from '@gymbattle/shared';
import type { Anchors, DrawState, V } from '../types';
import { eyeGlow, hurtTint, mixHex, rgrad, vgrad, lin, rgba, rising, TAU, clamp, sm, h01 } from '../util';
import { type C, STRIDE, bobAt, blink, foot, kf, limb, smear } from './plant-kit';

//            y, achata, inclina, mão frente x,y, mão trás x,y, chapéu sobe, chapéu gira
const REST = [0, 0, 0, -100, -100, 92, -110, 0, 0];
const POSES: Record<string, number[][]> = {
  slam: [
    [0, ...REST],
    [0.3, 0, 0.28, -0.05, -80, -62, 80, -70, -8, 0.06],
    [0.44, -105, -0.18, 0.05, -95, -215, 95, -220, 12, -0.06],
    [0.55, 0, 0.3, 0.08, -135, -40, 105, -50, -16, -0.1],
    [0.7, 0, 0.1, 0.03, -112, -82, 96, -92, 0, 0],
    [1, ...REST],
  ],
  roar: [
    [0, ...REST],
    [0.38, -8, -0.16, -0.1, -90, -165, 100, -172, 20, 0.15],
    [0.5, 0, 0.2, 0.12, -155, -140, 140, -150, -4, -0.12],
    [0.85, 0, 0.14, 0.1, -148, -140, 135, -150, -2, -0.1],
    [1, ...REST],
  ],
  cast: [
    [0, ...REST],
    [0.35, -20, -0.08, 0, -120, -232, 112, -232, 12, 0],
    [0.55, -34, -0.1, 0, -132, -252, 122, -252, 16, 0],
    [0.8, -28, -0.08, 0, -126, -242, 116, -242, 14, 0],
    [1, ...REST],
  ],
  swipe: [
    [0, ...REST],
    [0.38, 0, 0.06, -0.12, -10, -175, 100, -120, 0, 0.22],
    [0.45, 0, 0.08, -0.13, -5, -185, 100, -120, 0, 0.24],
    [0.53, 0, 0.12, 0.16, -185, -85, 80, -132, -4, -0.32],
    [0.7, 0, 0.05, 0.1, -152, -70, 86, -122, 0, -0.2],
    [1, ...REST],
  ],
  charge: [
    [0, ...REST],
    [0.38, 0, 0.22, -0.12, -80, -92, 100, -92, 0, 0.2],
    [0.52, -22, -0.1, 0.3, -125, -122, 60, -122, 0, -0.4],
    [0.72, 0, 0.06, 0.25, -120, -112, 66, -116, 0, -0.32],
    [1, ...REST],
  ],
};
POSES.breath = POSES.roar;
POSES.shoot = POSES.roar;

const poseAt = (pose: string, p: number) => (POSES[pose] ? kf(p, POSES[pose]) : REST.slice());

export function myconid(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState, c: C): Anchors {
  const { P, body, dark, t, L } = c;
  const glowC = P.accent;
  const dP = st.anim === 'death' ? st.p : 0;
  const stem = hurtTint(ctx, st, mixHex('#e8dcd0', P.body, 0.2));
  const stemDk = hurtTint(ctx, st, mixHex('#a89aa8', P.dark, 0.3));
  const fall = sm(0.3, 0.72, dP);
  const shine = clamp(0.55 + Math.sin(t * 2) * 0.15 + c.cast * c.atk * 0.6 + st.rage * 0.3 - fall * 0.7);
  const idle = 1 - L.w;
  const atk = st.anim === 'attack';

  // cogumelinhos: brotam quando ele fica parado e afundam quando anda (o slam faz crescer)
  const sprout = clamp(idle * (1 - fall) + c.slam * sm(0.55, 0.7, c.p) * 0.6);
  const small: [number, number][] = [[-190, 0.6], [-140, 0.45], [150, 0.55], [200, 0.4], [-80, 0.35], [100, 0.3]];
  small.forEach(([x, sc], i) => {
    const g = sm(i * 0.08, 0.5 + i * 0.08, sprout);
    if (g > 0.02) miniShroom(ctx, x, sc * g * (1 + c.slam * sm(0.55, 0.62, c.p) * 0.4), mixHex(body, glowC, 0.2), stem, glowC, shine, t + i);
  });

  let [by, sq, lean, fx, fy, bx, bY, capLift, capTilt] = poseAt(c.pose, c.p);
  // pulinhos ao andar: sobe bastante, achata na pisada, estica no alto
  const bob = L.bob;
  const hopH = (10 + L.mv * 10) * L.w;
  by += -bob * hopH + Math.sin(t * 1.6) * 1.5 * idle;
  sq += (0.5 - bob) * 0.1 * L.w - c.b * 0.02 * idle + st.hurt * 0.12;
  const rock = Math.sin(TAU * L.g) * 0.07 * L.w + Math.sin(t * 0.8) * 0.02 * idle;
  lean += 0.05 * L.s * L.w - st.hurt * 0.12;
  // chapéu atrasado: pisada chega nele depois (e treme após o salto)
  const bobLag = bobAt(L.g - 0.1, L.w);
  let capSq = (0.5 - bobLag) * 0.09 * L.w;
  let capY = (bobLag - bob) * hopH * 0.8;
  if (c.pose === 'slam' && c.p > 0.55) {
    const k = c.p - 0.55;
    capSq += Math.sin(k * 42) * Math.exp(-k * 9) * 0.18;
  }
  if (c.pose === 'slam' && c.p > 0.36 && c.p < 0.55) capY += sm(0.36, 0.44, c.p) * 14 * (1 - sm(0.5, 0.55, c.p)); // chapéu fica para trás na subida
  capTilt += -rock * 0.8 + Math.sin(TAU * (L.g - 0.15)) * 0.05 * L.w + Math.sin(t * 0.9) * 0.04 * idle - L.s * L.w * 0.06;
  // morte: cambaleia, o caule cede, o chapéu tomba para a frente e a coroa cai
  const wob = dP > 0 ? Math.sin(t * 9) * 0.12 * sm(0, 0.1, dP) * (1 - fall) : 0;
  sq += fall * 0.5;
  capTilt += -fall * 0.7 + wob;
  lean += wob + fall * 0.25;

  ctx.save();
  ctx.translate(st.hurt * 14, 0);

  // ---------------- pezinhos (por baixo do corpo)
  const stride = STRIDE * 0.5;
  const fF = foot(L, 0, -36, stride, 26, 0.5);
  const fB = foot(L, 0.5, 38, stride, 26, 0.5);
  const hipY = Math.min(-8, by - 30 * (1 - sq));
  const air = Math.min(0, by); // no pulo os pés sobem junto
  const leg = (f: typeof fF, hx: number, col: string) => {
    const fy2 = f.y - 12 + air * 0.9;
    limb(ctx, { x: hx, y: hipY }, { x: f.x, y: fy2 }, 0, 20, 16, col);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(f.x - 6, fy2 + 2, 30, 14 - f.air * 3, -f.air * 0.25 * L.s, 0, TAU);
    ctx.fill();
    // poeirinha ao pisar
    if (f.stance && f.u < 0.18 && L.w > 0.3) {
      ctx.fillStyle = rgba(glowC, 0.25 * (1 - f.u / 0.18));
      ctx.beginPath();
      ctx.ellipse(f.x, -2, 30 + f.u * 140, 6, 0, 0, TAU);
      ctx.fill();
    }
  };
  leg(fB, 26, mixHex(stemDk, P.dark, 0.25));
  leg(fF, -24, stemDk);

  // ---------------- corpo (com achatamento a partir da base)
  ctx.save();
  ctx.translate(0, by);
  ctx.translate(0, -26);
  ctx.rotate(rock);
  ctx.scale(1 + sq * 0.55, 1 - sq);
  ctx.transform(1, 0, -lean, 1, 0, 0);
  ctx.translate(0, 26);

  // braço de trás
  const swing = Math.sin(TAU * L.g + 0.5) * 16 * L.w;
  const handB = { x: bx + swing + Math.sin(t * 1.3) * 3 * idle, y: bY + Math.sin(t * 1.5) * 5 * idle + fall * 60 };
  limb(ctx, { x: 50, y: -140 }, handB, -10, 26, 18, stemDk);
  ctx.fillStyle = stemDk;
  ctx.beginPath();
  ctx.arc(handB.x, handB.y, 15, 0, TAU);
  ctx.fill();

  // corpo-caule gordinho com volume
  ctx.fillStyle = vgrad(ctx, -200, -20, stem, stemDk);
  ctx.beginPath();
  ctx.moveTo(-72, -26);
  ctx.quadraticCurveTo(-92, -110, -60, -190);
  ctx.lineTo(60, -190);
  ctx.quadraticCurveTo(92, -110, 72, -26);
  ctx.quadraticCurveTo(0, -10, -72, -26);
  ctx.fill();
  ctx.fillStyle = rgba(P.dark, 0.22);
  ctx.beginPath();
  ctx.moveTo(30, -190);
  ctx.quadraticCurveTo(64, -110, 44, -20);
  ctx.quadraticCurveTo(70, -24, 72, -26);
  ctx.quadraticCurveTo(92, -110, 60, -190);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.ellipse(-56, -120, 8, 40, 0.1, 0, TAU);
  ctx.fill();
  // anel (saia do cogumelo) que balança
  const skirt = Math.sin(TAU * 2 * (L.g - 0.2)) * 3 * L.w + Math.sin(t * 1.4) * 1;
  ctx.fillStyle = mixHex(stem, '#ffffff', 0.2);
  ctx.beginPath();
  ctx.ellipse(0, -150, 68, 14, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) {
    const x = -68 + i * 13.6;
    const yy = -146 + 4 * Math.sqrt(Math.max(0, 1 - (x / 68) ** 2)) + 8 + Math.sin(i * 1.7 + t * 2) * 1.5 + skirt * (x / 68);
    if (i) ctx.lineTo(x, yy);
    else ctx.moveTo(x, -150);
  }
  ctx.lineTo(68, -150);
  ctx.fill();
  ctx.strokeStyle = rgba(P.dark, 0.3);
  ctx.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    ctx.moveTo(-60 + i * 15, -146);
    ctx.lineTo(-62 + i * 15 + skirt * 0.4, -137);
    ctx.stroke();
  }
  // rosto: olhos grandes, piscam; bochechas brilham
  const eo = (dP ? 1 - sm(0.3, 0.7, dP) : blink(t, 31)) * (1 - st.hurt * 0.6);
  const wide = (c.roar + c.breath + c.shoot) * sm(0.42, 0.5, c.p) * (1 - sm(0.85, 1, c.p));
  ctx.fillStyle = '#1a0a2a';
  ctx.beginPath();
  ctx.ellipse(-34, -110, 12 + wide * 2, 14 + wide * 3, 0, 0, TAU);
  ctx.ellipse(6, -110, 12 + wide * 2, 14 + wide * 3, 0, 0, TAU);
  ctx.fill();
  eyeGlow(ctx, -36, -110, 6 + st.rage * 2, P.eye, eo);
  eyeGlow(ctx, 4, -110, 6 + st.rage * 2, P.eye, eo);
  ctx.fillStyle = rgba(glowC, 0.25 + shine * 0.2);
  ctx.beginPath();
  ctx.ellipse(-52, -88, 9, 5, 0, 0, TAU);
  ctx.ellipse(20, -88, 9, 5, 0, 0, TAU);
  ctx.fill();
  const jaw = clamp(c.jaw + c.cast * c.atk * 0.2 + st.hurt * 0.4 + wide * 0.3);
  ctx.fillStyle = '#1a0a2a';
  ctx.beginPath();
  ctx.ellipse(-16, -72, 15 + jaw * 3, Math.max(2, 3 + jaw * 15), 0, 0, TAU);
  ctx.fill();
  if (jaw > 0.3) {
    ctx.fillStyle = rgrad(ctx, -16, -70, 22, rgba(glowC, jaw * 0.6), rgba(glowC, 0));
    ctx.beginPath();
    ctx.arc(-16, -70, 22, 0, TAU);
    ctx.fill();
  }
  const mouth = c.map(-20, -72);

  // ---------------- chapéu (atrasado, gelatinoso)
  ctx.save();
  ctx.translate(0, -190 - capLift + capY + fall * 20);
  ctx.rotate(capTilt);
  ctx.translate(fall * -60, 0);
  ctx.scale(1 + capSq * 0.6, 1 - capSq);
  // lamelas por baixo
  ctx.fillStyle = mixHex(dark, '#d8b8e8', 0.25);
  ctx.beginPath();
  ctx.ellipse(0, 0, 160, 24, 0, 0, Math.PI);
  ctx.fill();
  ctx.strokeStyle = rgba(P.dark, 0.6);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 18; i++) {
    const x = -150 + i * 17.6;
    ctx.moveTo(x * 0.3, 4);
    ctx.lineTo(x, 18 * Math.sqrt(Math.max(0, 1 - (x / 160) ** 2)));
  }
  ctx.stroke();
  // cúpula
  ctx.fillStyle = vgrad(ctx, -150, 10, mixHex(body, '#ffffff', 0.15), mixHex(body, dark, 0.35));
  ctx.beginPath();
  ctx.moveTo(-168, 6);
  ctx.bezierCurveTo(-170, -110, -80, -150, 0, -150);
  ctx.bezierCurveTo(80, -150, 170, -110, 168, 6);
  ctx.quadraticCurveTo(0, -14, -168, 6);
  ctx.fill();
  // sombra do lado direito e borda clara
  ctx.fillStyle = rgba(P.dark, 0.25);
  ctx.beginPath();
  ctx.moveTo(60, -146);
  ctx.bezierCurveTo(150, -120, 172, -60, 168, 6);
  ctx.quadraticCurveTo(140, 0, 120, -2);
  ctx.bezierCurveTo(130, -60, 110, -120, 60, -146);
  ctx.fill();
  // pintas brilhantes (pulsam em sequência)
  const spots: [number, number, number][] = [[-100, -60, 18], [-40, -110, 22], [40, -100, 16], [110, -50, 20], [0, -50, 14], [-130, -14, 10], [80, -14, 12], [60, -132, 10]];
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  spots.forEach(([x, y, r], i) => {
    const sh = shine * (0.75 + 0.25 * Math.sin(t * 3 - i * 0.9));
    ctx.fillStyle = rgrad(ctx, x, y, r * 2.2, rgba(glowC, sh * 0.5), rgba(glowC, 0));
    ctx.beginPath();
    ctx.arc(x, y, r * 2.2, 0, TAU);
    ctx.fill();
  });
  ctx.restore();
  ctx.fillStyle = mixHex(glowC, '#ffffff', shine * 0.4);
  ctx.beginPath();
  for (const [x, y, r] of spots) {
    ctx.moveTo(x + r, y);
    ctx.ellipse(x, y, r, r * 0.75, 0, 0, TAU);
  }
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.ellipse(-60, -110, 40, 14, -0.4, 0, TAU);
  ctx.fill();
  // coroa (pula um pouco atrasada e cai na morte)
  const crownFall = sm(0.45, 0.8, dP);
  ctx.save();
  ctx.translate(0, -150 + (bob - bobLag) * 6 - (c.slam * sm(0.55, 0.6, c.p) * (1 - sm(0.6, 0.75, c.p))) * 12);
  ctx.translate(crownFall * -120, crownFall * 120);
  ctx.rotate(Math.sin(t * 1.1) * 0.04 + crownFall * -2.2);
  ctx.fillStyle = hurtTint(ctx, st, '#ffcc33');
  ctx.beginPath();
  ctx.moveTo(-30, 4);
  ctx.lineTo(-34, -36);
  ctx.lineTo(-16, -16);
  ctx.lineTo(0, -44);
  ctx.lineTo(16, -16);
  ctx.lineTo(34, -36);
  ctx.lineTo(30, 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(-28, -6, 56, 4);
  ctx.fillStyle = P.accent;
  ctx.beginPath();
  ctx.arc(0, -10, 5, 0, TAU);
  ctx.fill();
  ctx.restore();
  const capTop = c.map(0, -196).y;
  ctx.restore();

  // braço da frente (gordinho)
  const handAt = (pp: number): V => {
    const q = poseAt(c.pose, pp);
    return { x: q[3], y: q[4] };
  };
  const hf = { x: fx - swing + Math.sin(t * 1.2) * 3 * idle, y: fy + Math.sin(t * 1.4) * 5 * idle + fall * 70 };
  if (atk && c.pose === 'swipe') {
    const a = sm(0.46, 0.5, c.p) * (1 - sm(0.58, 0.68, c.p));
    if (a > 0.03) {
      const tr: V[] = [];
      for (let k = 6; k >= 0; k--) tr.push(handAt(c.p - k * 0.014));
      smear(ctx, tr, 20, mixHex(glowC, '#ffffff', 0.4), a * 0.5);
    }
  }
  limb(ctx, { x: -55, y: -140 }, hf, 12, 28, 20, stem);
  ctx.fillStyle = stem;
  ctx.beginPath();
  ctx.arc(hf.x, hf.y, 17, 0, TAU);
  ctx.fill();
  if (c.cast * c.atk > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgrad(ctx, hf.x, hf.y, 44, rgba(glowC, c.cast * c.atk * 0.8), rgba(glowC, 0));
    ctx.beginPath();
    ctx.arc(hf.x, hf.y, 44, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  const hand = c.map(hf.x - 14, hf.y);
  const core = c.map(0, -130);
  ctx.restore();
  ctx.restore();

  // esporos flutuando (nuvem forte no rugido e na morte)
  rising(ctx, 0, -150, 340, 220, t * 0.08, 13, 12 + Math.round((c.roar * c.atk + c.cast * c.atk + fall) * 14), glowC, 1, 0.8 * (1 - sm(0.8, 1, dP)), 3);
  if (dP > 0.35) {
    const k = lin(0.35, 1, dP);
    ctx.fillStyle = rgba(P.accent, 0.35 * (1 - k));
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.arc((h01(i, 2) - 0.5) * 260 * (0.4 + k), -60 - k * 80 * h01(i, 3), 16 + k * 30, 0, TAU);
      ctx.fill();
    }
  }
  return { mouth, hand, core, top: capTop, halfW: 175 };
}

function miniShroom(ctx: CanvasRenderingContext2D, x: number, sc: number, cap: string, stem: string, glowC: string, shine: number, t: number) {
  ctx.save();
  ctx.translate(x, 0);
  ctx.scale(sc, sc);
  ctx.rotate(Math.sin(t * 1.3) * 0.05);
  ctx.fillStyle = stem;
  ctx.fillRect(-9, -50, 18, 50);
  ctx.fillStyle = cap;
  ctx.beginPath();
  ctx.ellipse(0, -50, 34, 26, 0, Math.PI, TAU);
  ctx.fill();
  ctx.fillStyle = rgba(glowC, 0.5 + shine * 0.5);
  ctx.beginPath();
  ctx.arc(-12, -60, 5, 0, TAU);
  ctx.arc(10, -66, 4, 0, TAU);
  ctx.fill();
  ctx.restore();
}
