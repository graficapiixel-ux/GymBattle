/**
 * MORTO-VIVO 2 — LADY VESPERINE, a Noiva Pálida.
 * Não anda: FLUTUA de um jeito sinistro. Cada ciclo de passada (gait) é uma batida de asas que a
 * empurra para a frente (sobe na batida, desce no recolher); o corpo inclina na direção do voo,
 * a cauda do vestido arrasta no chão atrás, cabelo e véu vêm com atraso e as pontas dos sapatos
 * pendem sob a barra. Parada: paira, respira, pisca e a cabeça tomba de lado devagar.
 */
import type { BossSpec } from '@gymbattle/shared';
import type { Anchors, DrawState, V } from '../types';
import { eyeGlow, hurtTint, mixHex, vgrad, TAU, clamp, sm, tube, orb, hexA, h01 } from '../util';
import { type Arm, type Pal, type Pose, L, armPts, xf, shadow, line, frac } from './undead-kit';

export function vampire(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState, C: Pal, P: Pose): Anchors {
  const { wu, sk, die, b, imp } = P;
  const t = st.t;
  const m = clamp(st.move ?? 0) * (1 - die);
  const fwd = (st.vx ?? 0) > 1 ? -1 : 1;
  const u = frac(st.gait ?? 0);
  const d1 = sm(0, 0.2, die), d2 = sm(0.15, 0.5, die), d3 = sm(0.45, 0.9, die);
  const calm = 1 - P.atk;
  const hurt = st.hurt;

  // ---------------------------------------------------------------- voo
  const beat = Math.sin(u * TAU); // +1 = asas embaixo (fim da batida)
  const hover = (-18 - Math.sin(t * 1.5) * 6 * (1 - m)) * (1 - d2);
  const dy = hover + b * 2 - m * 9 * Math.sin(u * TAU - 0.9)
    + P.cast * (-wu * 24 + sk * 8) + P.roar * (wu * 12 - sk * 22) + P.swipe * (-wu * 10 + sk * 12) + imp * 6 * P.swipe
    + d3 * 10;
  const dx = hurt * 18 + d1 * 14 + P.swipe * (wu * 18 - sk * 46) + P.cast * (wu * 10 - sk * 16) + P.charge * (wu * 35 - sk * 250);
  const lean = -m * 0.13 * fwd + Math.sin(u * TAU - 1.6) * 0.03 * m + Math.sin(t * 0.9) * 0.02 * calm
    + hurt * 0.2 + d1 * 0.25 - d2 * 0.15
    + P.swipe * (wu * 0.16 - sk * 0.26) + P.cast * (wu * 0.12 - sk * 0.12) + P.roar * (-wu * 0.22 + sk * 0.16)
    + P.charge * (wu * 0.12 - sk * 0.3) + P.slam * P.sk * -0.1;
  const pivot = { x: 0, y: -150 };
  const sqx = 1 + d3 * 0.3, sqy = 1 - d3 * 0.62;
  const T = (p: V) => {
    const q = xf(p, pivot, lean, dx, dy);
    return { x: dx + (q.x - dx) * sqx, y: q.y * sqy };
  };
  const glowK = clamp(0.4 + st.rage * 0.4 + P.atk * 0.6) * (1 - die);
  const skin = hurtTint(ctx, st, s.pal.body);
  const gown = hurtTint(ctx, st, mixHex(s.pal.glow, s.pal.dark, 0.35));
  const hairC = hurtTint(ctx, st, '#1a0610');
  const trail = m * fwd; // tudo que é solto vai para trás

  // asas: batem com o voo; fecham na carga do rugido e explodem abertas no grito
  const wingOpen = clamp(0.5 + Math.sin(t * 2.2) * 0.07 * (1 - m) + m * 0.1
    + P.cast * (wu * 0.45 + sk * 0.3) + P.roar * (-wu * 0.5 + sk * 0.7) + P.swipe * (wu * 0.35 - sk * 0.1)
    + hurt * 0.3 - d2 * 0.55 + P.charge * P.hold * -0.4, 0, 1.15);
  const flap = beat * m * 0.9 + Math.sin(t * 2.2) * 0.12 * (1 - m) + P.roar * imp * 0.6 + P.cast * sk * 0.3 - d2 * 0.6;

  // ---------------------------------------------------------------- braços
  const shF = { x: -26, y: -262 }, shB = { x: 20, y: -264 };
  let aF = 0.32 - m * 0.3 + Math.sin(t * 1.6) * 0.05, bF = 0.6 + m * 0.2 + Math.sin(t * 1.3) * 0.08;
  let aB = -0.2 - m * 0.25, bB = 0.5;
  // swipe: ergue a garra para trás e rasga de cima para baixo
  aF = L(aF, L(L(aF, 3.55, wu), 0.85, sk), P.swipe); bF = L(bF, L(L(bF, 0.55, wu), -0.15, sk), P.swipe);
  aB = L(aB, L(L(aB, -0.9, wu), -0.5, sk), P.swipe);
  // cast: ergue as duas mãos e depois empurra a magia para a frente
  aF = L(aF, L(L(aF, 2.8, wu), 1.62, sk), P.cast); bF = L(bF, L(L(bF, 0.35, wu), -0.05, sk), P.cast);
  aB = L(aB, L(L(aB, 2.6, wu), 1.45, sk), P.cast); bB = L(bB, L(L(bB, 0.4, wu), 0.05, sk), P.cast);
  // roar: abraça o próprio corpo e depois abre tudo
  aF = L(aF, L(L(aF, 0.35, wu), 2.25, sk), P.roar); bF = L(bF, L(L(bF, 2.0, wu), 0.3, sk), P.roar);
  aB = L(aB, L(L(aB, 0.6, wu), -2.0, sk), P.roar); bB = L(bB, L(L(bB, 1.6, wu), -0.3, sk), P.roar);
  if (P.slam) { aF = L(L(aF, 2.6, wu), 0.9, sk); bF = L(L(bF, 0.3, wu), 0, sk); aB = L(L(aB, 2.4, wu), 0.7, sk); }
  const shk = P.shoot * P.hold;
  aF = L(aF, L(0.9, 1.6, sk), shk); bF = L(bF, L(1.4, 0, sk), shk);
  const chk = P.charge * P.hold;
  aF = L(aF, 1.6, chk); bF = L(bF, 0, chk); aB = L(aB, -0.8, chk);
  aF += hurt * 0.5 + d1 * 1.6 * (1 - d2); bF += hurt * 0.4;
  aB += hurt * -0.4 + d1 * -1.0 * (1 - d2);
  aF = L(aF, L(0.4, -0.2, d3), d2); aB = L(aB, -0.1, d2);
  const armF = armPts(shF, aF, bF, 50, 48);
  const armB = armPts(shB, aB, bB, 50, 48);

  // cabeça: estabiliza; parada, tomba de lado devagar (sinistro)
  const tilt = Math.sin(t * 0.45) > 0.55 ? sm(0.55, 0.85, Math.sin(t * 0.45)) * 0.22 : 0;
  const head: V = {
    x: -8 + P.cast * sk * -6 + P.swipe * (wu * 6 - sk * 10) + P.roar * (wu * -6 + sk * 6) + hurt * 8 + P.shoot * (wu * 8 - sk * 10),
    y: -300 - P.roar * (sk * 8 - wu * 12) + b * 1.5 + d1 * -4,
  };
  const headRot = -lean * 0.55 + tilt * calm + Math.sin(u * TAU * 2) * 0.03 * m
    + P.roar * (wu * 0.35 - sk * 0.45) + P.swipe * (wu * -0.1 + sk * 0.12) + hurt * -0.35 - d1 * 0.5 + d3 * 0.4;
  const jaw = clamp(P.roar * (sk * 1.3) + P.cast * (wu * 0.2 + sk * 0.6) + P.shoot * sk * 0.5 + P.swipe * sk * 0.5 + hurt * 0.8 + d1);
  const blink = sm(0.94, 0.97, frac(t / 3.7)) * (1 - sm(0.97, 1, frac(t / 3.7)));

  // ---------------------------------------------------------------- desenho
  shadow(ctx, dx, 95 - Math.max(0, -dy) * 0.5, 0.3 - Math.max(0, -dy) * 0.003);
  ctx.save();
  ctx.translate(dx, 0);
  ctx.scale(sqx, sqy);
  ctx.translate(-dx, 0);
  ctx.translate(dx, dy);
  ctx.translate(pivot.x, pivot.y);
  ctx.rotate(lean);
  ctx.translate(-pivot.x, -pivot.y);

  // asas (atrás de tudo)
  if ((s.feat.wings ?? 1) > 0) {
    batWing(ctx, { x: 10, y: -255 }, -1, wingOpen, flap, C, t, 0.82, hexA(s.pal.glow, 0.55), 0.6);
    batWing(ctx, { x: 22, y: -258 }, 1, wingOpen, flap * 1.05, C, t + 0.3, 1, hexA(s.pal.glow, 0.6), 0);
  }
  // cabelo longo (atrás): atraso e onda que corre para as pontas
  const lift = P.cast * wu * 1 + P.roar * sk * 0.8 + d1 * 0.6;
  const hairPts: V[] = [];
  for (let i = 0; i <= 10; i++) {
    const k = i / 10;
    const wave = Math.sin(t * 2 + k * 4 - u * TAU) * (8 + m * 10) * k;
    hairPts.push({
      x: head.x + 10 + k * 40 + wave + trail * k * k * 70 + hurt * k * 30 + P.swipe * sk * k * 40,
      y: head.y - 8 + k * 170 * (1 - lift * 0.45) - trail * k * k * 40 - lift * k * k * 60,
    });
  }
  tube(ctx, hairPts, (k) => 54 * (1 - k * 0.6), hairC);
  ctx.strokeStyle = hexA('#5a2040', 0.5);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) {
    const q = hairPts[i];
    if (i === 0) ctx.moveTo(q.x + 6, q.y);
    else ctx.lineTo(q.x + 6 - i * 0.8, q.y);
  }
  ctx.stroke();

  // braço de trás
  slimArm(ctx, armB, skin, C, true, 0);

  // pontas dos sapatos pendendo sob a barra
  const hemY = -18;
  for (const [x, ph, back] of [[-8, 0, 1], [-30, 1.4, 0]] as const) {
    const a = -0.9 + Math.sin(u * TAU + ph) * 0.25 * m + Math.sin(t * 1.4 + ph) * 0.08 + trail * 0.35;
    ctx.save();
    ctx.translate(x, hemY + 10);
    ctx.rotate(a);
    ctx.fillStyle = back ? hurtTint(ctx, st, '#8a7a98') : hurtTint(ctx, st, '#d8d0e8');
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.quadraticCurveTo(-18, -6, -30, 2);
    ctx.quadraticCurveTo(-16, 6, 0, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // vestido: saia flutuante com cauda que arrasta no chão atrás
  const ground = -dy;
  const sway = Math.sin(t * 1.8) * 5 * calm + trail * 22 + P.swipe * (wu * -10 + sk * 26) + P.cast * wu * -12 + hurt * 14;
  const tailX = 150 + trail * 50 + Math.sin(t * 1.2) * 6;
  const hemPts: V[] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const x = L(-96 + sway * 0.7 - lift * 10, tailX, k);
    // a frente flutua; a cauda (k > 0,55) desce até o chão
    const yBase = L(hemY, ground - 2, sm(0.45, 1, k));
    const w = Math.sin(t * 3 - k * 7 + u * TAU * 2) * (3 + m * 6) * (1 - sm(0.8, 1, k) * 0.7);
    hemPts.push({ x, y: Math.min(yBase + w, ground - 1) });
  }
  ctx.fillStyle = vgrad(ctx, -210, ground, gown, C.dark);
  ctx.beginPath();
  ctx.moveTo(-24, -205);
  ctx.bezierCurveTo(-50, -140, -92 + sway * 0.5, -70, hemPts[0].x, hemPts[0].y);
  for (let i = 1; i <= n; i++) {
    const a = hemPts[i - 1], c = hemPts[i];
    ctx.quadraticCurveTo((a.x + c.x) / 2, (a.y + c.y) / 2 + 9, c.x, c.y);
  }
  ctx.bezierCurveTo(tailX - 40, ground - 40, 70 + sway * 0.3, -130, 26, -205);
  ctx.closePath();
  ctx.fill();
  // babados claros na barra
  ctx.strokeStyle = hexA(skin, 0.5);
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const q = hemPts[i];
    const y = q.y - 12 - Math.sin(i * 1.7 + t * 2) * 2;
    if (i === 0) ctx.moveTo(q.x + 2, y);
    else ctx.lineTo(q.x, y);
  }
  ctx.stroke();
  // pregas (seguem o balanço)
  ctx.strokeStyle = hexA(C.dark, 0.65);
  ctx.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    const q = hemPts[Math.min(n, 1 + i * 3)];
    ctx.beginPath();
    ctx.moveTo(-14 + i * 9, -195);
    ctx.quadraticCurveTo(L(-14 + i * 9, q.x, 0.5) + sway * 0.2, L(-195, q.y, 0.5), q.x, q.y - 8);
    ctx.stroke();
  }
  // brilho rubro nas dobras
  ctx.strokeStyle = hexA(s.pal.glow, 0.25 + glowK * 0.2);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-20, -200);
  ctx.bezierCurveTo(-44, -140, -80 + sway * 0.5, -70, hemPts[0].x + 4, hemPts[0].y - 4);
  ctx.stroke();

  // corpete
  ctx.fillStyle = vgrad(ctx, -270, -195, mixHex(gown, '#ffffff', 0.1), C.dark);
  ctx.beginPath();
  ctx.moveTo(-30, -262);
  ctx.quadraticCurveTo(-34, -230, -24, -200);
  ctx.lineTo(26, -200);
  ctx.quadraticCurveTo(34, -230, 28, -262);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = hexA(s.pal.glow, 0.5);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    ctx.moveTo(-6, -250 + i * 12);
    ctx.lineTo(6, -244 + i * 12);
    ctx.moveTo(6, -250 + i * 12);
    ctx.lineTo(-6, -244 + i * 12);
  }
  ctx.stroke();
  // ombros e colo (pele pálida, respira)
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(-32, -262);
  ctx.quadraticCurveTo(-30, -272 - b, -10, -276);
  ctx.lineTo(-10, -290);
  ctx.lineTo(6, -290);
  ctx.lineTo(6, -276);
  ctx.quadraticCurveTo(28, -272 - b, 30, -262);
  ctx.quadraticCurveTo(0, -248 - b, -32, -262);
  ctx.fill();
  // colar de rubi (pêndulo com atraso)
  const pend = Math.sin(t * 2.4) * 0.15 + trail * 0.4 + hurt * 0.5;
  ctx.strokeStyle = C.accent;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(-2, -275, 13, 0.4, Math.PI - 0.4);
  ctx.stroke();
  ctx.fillStyle = C.accent;
  ctx.beginPath();
  ctx.arc(-2 + Math.sin(pend) * 8, -263 + Math.cos(pend) * 1, 4.5, 0, TAU);
  ctx.fill();

  // cabeça
  ctx.save();
  ctx.translate(head.x, head.y);
  ctx.rotate(headRot);
  // véu translúcido (atraso)
  const vl = trail * 40 + hurt * 20 + lift * 20;
  ctx.fillStyle = 'rgba(240,235,250,0.26)';
  ctx.beginPath();
  ctx.moveTo(-6, -22);
  ctx.bezierCurveTo(40 + vl * 0.4, -20, 60 + vl + Math.sin(t * 1.7 - u * TAU) * 10, 60 - vl * 0.5, 50 + vl * 1.4 + Math.sin(t * 1.4) * 14, 130 - vl);
  ctx.lineTo(10 + vl, 120 - vl * 0.8);
  ctx.bezierCurveTo(30, 60, 14, 0, -6, -22);
  ctx.fill();
  // rosto
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(10, -18);
  ctx.quadraticCurveTo(-4, -28, -18, -16);
  ctx.quadraticCurveTo(-24, -2, -20, 8);
  ctx.quadraticCurveTo(-14, 20 + jaw * 3, -4, 20 + jaw * 2);
  ctx.quadraticCurveTo(10, 16, 12, 2);
  ctx.closePath();
  ctx.fill();
  // olheiras
  ctx.fillStyle = 'rgba(90,20,60,0.35)';
  ctx.beginPath();
  ctx.ellipse(-14, -2, 5, 2.5, 0, 0, TAU);
  ctx.ellipse(-3, -2, 4.5, 2.5, 0, 0, TAU);
  ctx.fill();
  // boca (com presas)
  ctx.fillStyle = '#3a0010';
  ctx.beginPath();
  ctx.ellipse(-13, 10 + jaw * 2, 5 + jaw * 1.5, 1.5 + jaw * 6, 0, 0, TAU);
  ctx.fill();
  if (jaw > 0.15) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-17, 8);
    ctx.lineTo(-16, 13 + jaw * 2);
    ctx.lineTo(-15, 8);
    ctx.moveTo(-11, 8);
    ctx.lineTo(-10, 13 + jaw * 2);
    ctx.lineTo(-9, 8);
    ctx.fill();
  }
  // olhos vermelhos (piscam)
  const open = (1 - die) * (1 - blink * calm);
  eyeGlow(ctx, -14, -5, 3.2 + glowK * 1.2, C.eye, open);
  eyeGlow(ctx, -3, -5, 2.8 + glowK * 1.2, C.eye, open);
  // franja e tiara
  ctx.fillStyle = hairC;
  ctx.beginPath();
  ctx.moveTo(-22, -6);
  ctx.quadraticCurveTo(-26, -30, 0, -32);
  ctx.quadraticCurveTo(22, -30, 22, 0);
  ctx.quadraticCurveTo(14, -18, -2, -18);
  ctx.quadraticCurveTo(-14, -20, -22, -6);
  ctx.fill();
  // mecha solta na frente (atraso)
  ctx.strokeStyle = hairC;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-20, -6);
  ctx.quadraticCurveTo(-26 + trail * 6, 10, -22 + trail * 12 + Math.sin(t * 2.1) * 3, 26);
  ctx.stroke();
  ctx.fillStyle = hurtTint(ctx, st, '#c8c0d8');
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(-14 + i * 7, -28);
    ctx.lineTo(-11 + i * 7, -38 - (i === 2 ? 6 : 0));
    ctx.lineTo(-8 + i * 7, -28);
    ctx.fill();
  }
  ctx.fillStyle = C.accent;
  ctx.beginPath();
  ctx.arc(0, -31, 2.5, 0, TAU);
  ctx.fill();
  ctx.restore();

  // braço da frente
  const ck = P.cast * (wu * 0.6 + sk);
  // rastro de sangue do golpe (smear)
  if (P.swipe && P.p > 0.4 && P.p < 0.66) {
    const a0 = L(3.55, 0.85, clamp(sm(0.38, 0.52, P.p - 0.08)));
    const a1 = aF;
    const r = 104;
    const al = 1 - sm(0.56, 0.66, P.p);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = hexA(s.pal.glow, 0.55 * al);
    ctx.beginPath();
    const st0 = Math.PI / 2 + Math.min(a0, a1), en = Math.PI / 2 + Math.max(a0, a1);
    ctx.arc(shF.x, shF.y, r + 14, st0, en);
    ctx.arc(shF.x - 6, shF.y + 4, r - 16, en, st0, true);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  slimArm(ctx, armF, skin, C, false, P.swipe * sk);
  if (ck > 0.05 || P.roar * sk > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    orb(ctx, armF.hd.x, armF.hd.y + 8, 14 + ck * 26 + imp * 14 * P.cast, s.pal.glow, ck * 0.8);
    orb(ctx, armB.hd.x, armB.hd.y + 8, 10 + ck * 16, s.pal.glow, ck * 0.5);
    orb(ctx, -5, -230, 60 + P.roar * sk * 80, s.pal.glow, P.roar * sk * 0.35);
    ctx.restore();
  }
  ctx.restore();

  // morte: revoada de morcegos saindo do corpo
  if (d2 > 0) {
    ctx.fillStyle = hurtTint(ctx, st, '#14040a');
    for (let i = 0; i < 9; i++) {
      const k = sm(0.2 + h01(i, 2) * 0.3, 0.75 + h01(i, 2) * 0.25, die);
      if (k <= 0 || k >= 1) continue;
      const x = dx + (h01(i, 5) - 0.5) * 60 + (h01(i, 6) - 0.3) * 260 * k;
      const y = -150 - 80 * h01(i, 7) - 260 * k + Math.sin(t * 9 + i) * 8;
      const f = Math.sin(t * 22 + i * 1.3);
      const w = 26 * (1 - k * 0.35);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x - w * 0.6, y - 6 * f - 4, x - w, y - 2 * f);
      ctx.quadraticCurveTo(x - w * 0.5, y + 2, x, y + 3);
      ctx.quadraticCurveTo(x + w * 0.5, y + 2, x + w, y - 2 * f);
      ctx.quadraticCurveTo(x + w * 0.6, y - 6 * f - 4, x, y);
      ctx.fill();
    }
  }

  return {
    mouth: T({ x: head.x - 14 + Math.sin(headRot) * -8, y: head.y + 8 }),
    hand: T(armF.hd),
    core: T({ x: 0, y: -220 }),
    top: T({ x: 0, y: -360 }).y,
    halfW: 110,
  };
}

function slimArm(ctx: CanvasRenderingContext2D, a: Arm, skin: string, C: Pal, back: boolean, spread: number) {
  const col = back ? mixHex(skin, C.dark, 0.35) : skin;
  ctx.strokeStyle = mixHex(col, '#000000', 0.35);
  ctx.lineWidth = 12;
  line(ctx, a.sh, a.el);
  ctx.lineWidth = 10;
  line(ctx, a.el, a.hd);
  ctx.strokeStyle = col;
  ctx.lineWidth = 9;
  line(ctx, a.sh, a.el);
  ctx.lineWidth = 7.5;
  line(ctx, a.el, a.hd);
  // manga de renda (sino que balança no cotovelo)
  ctx.strokeStyle = hexA(C.dark, 0.95);
  ctx.lineWidth = 15;
  line(ctx, a.sh, { x: (a.sh.x * 2 + a.el.x) / 3, y: (a.sh.y * 2 + a.el.y) / 3 });
  // garras longas
  ctx.save();
  ctx.translate(a.hd.x, a.hd.y);
  ctx.rotate(a.ang);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.ellipse(0, 4, 6, 8, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = back ? C.dark : C.accent;
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const sp = (i - 1.5) * spread * 0.25;
    ctx.beginPath();
    ctx.moveTo(-4 + i * 2.6, 10);
    ctx.quadraticCurveTo(-6 + i * 3 + sp * 10, 20, -10 + i * 3 + sp * 22, 27);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Asa de morcego. dir = −1 abre para a esquerda, +1 para a direita.
 * flap: −1 (erguida) … +1 (batida para baixo); a ponta vem com atraso (lag).
 */
function batWing(ctx: CanvasRenderingContext2D, root: V, dir: number, open: number, flap: number, C: Pal, t: number, sc: number, vein: string, ph: number) {
  ctx.save();
  ctx.translate(root.x, root.y);
  ctx.scale(dir * sc, sc);
  ctx.rotate(-0.25 - open * 0.35 + flap * 0.5 + Math.sin(t * 2.2 + ph) * 0.04);
  const span = 110 + open * 100;
  // a ponta atrasa em relação ao braço da asa
  const lag = flap * 0.25;
  const rot = (p: V, a: number): V => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });
  const elbow = { x: span * 0.35, y: -span * 0.35 };
  const tips: V[] = [
    { x: span * 0.55, y: -span * 0.75 },
    { x: span * 0.95, y: -span * 0.45 },
    { x: span * 1.05, y: -span * 0.05 },
    { x: span * 0.85, y: span * 0.35 },
  ].map((p, i) => {
    const q = rot({ x: p.x - elbow.x, y: p.y - elbow.y }, -lag * (0.5 + i * 0.25));
    return { x: q.x + elbow.x, y: q.y + elbow.y };
  });
  ctx.fillStyle = vgrad(ctx, -span * 0.7, span * 0.4, mixHex(C.dark, '#ffffff', 0.06), C.dark);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(elbow.x, elbow.y);
  ctx.lineTo(tips[0].x, tips[0].y);
  for (let i = 1; i < tips.length; i++) {
    const a = tips[i - 1], c = tips[i];
    ctx.quadraticCurveTo((a.x + c.x) / 2 - 22 - flap * 6, (a.y + c.y) / 2 + 6, c.x, c.y);
  }
  ctx.quadraticCurveTo(span * 0.4, span * 0.35, 0, span * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = vein;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(elbow.x, elbow.y);
  for (const bn of tips) {
    ctx.moveTo(elbow.x, elbow.y);
    ctx.lineTo(bn.x, bn.y);
  }
  ctx.stroke();
  ctx.fillStyle = C.bone;
  ctx.beginPath();
  ctx.moveTo(elbow.x - 4, elbow.y);
  ctx.lineTo(elbow.x + 2, elbow.y - 14);
  ctx.lineTo(elbow.x + 5, elbow.y);
  ctx.fill();
  ctx.restore();
}
