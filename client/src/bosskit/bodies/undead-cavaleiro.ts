/**
 * MORTO-VIVO 3 — O CAVALEIRO SEM CABEÇA de Grimhollow.
 * O cavalo anda de verdade: passo de 4 tempos (trás-esq., frente-esq., trás-dir., frente-dir.),
 * cascos plantados, joelho da frente dobrando para a frente e jarrete de trás para trás; o corpo
 * sobe e desce, o pescoço acena a cada pisada da frente. Na investida vira galope (as patas
 * acompanham o avanço local da lança). Cavaleiro sacoleja com atraso; capa, crina e cauda de fogo
 * atrasam. Morte: empina de dor, dobra os joelhos e desaba; o fogo do pescoço se apaga.
 */
import type { BossSpec } from '@gymbattle/shared';
import type { Anchors, DrawState, V } from '../types';
import { eyeGlow, hurtTint, mixHex, vgrad, TAU, clamp, sm, tube, orb, flame, hexA, bez } from '../util';
import { type Pal, type Pose, L, LV, armPts, xf, ixf, ik, loco, stepFoot, stepBob, shadow, line } from './undead-kit';

interface Leg { top: V; hoof: V; bend: number; f: { plant: number; k: number; lift: number } }

export function rider(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState, C: Pal, P: Pose): Anchors {
  const { wu, sk, hold, die, imp } = P;
  const t = st.t;
  const G = loco(st);
  const d1 = sm(0, 0.22, die), d2 = sm(0.18, 0.55, die), d3 = sm(0.45, 0.9, die);
  const calm = 1 - P.atk;
  const hurt = st.hurt;
  const gallop = P.charge * clamp(wu * 0.6 + sk * 1.5);
  const m = Math.max(G.m, gallop) * (1 - die);

  // investida: avanço local (as patas acompanham esse deslocamento)
  const lunge = P.charge * (wu * 26 - sk * 160);
  const uL = G.u - lunge / 150;
  // empinar: carga do charge, roar; dano; morte (empina de dor e depois desaba para a frente)
  const rear = P.charge * wu * 0.26 + P.roar * (wu * 0.32 + sk * 0.2) * (1 - sm(0.7, 1, P.p)) + P.slam * (wu * 0.3 - sk * 0.05)
    + hurt * 0.06 + d1 * 0.22 * (1 - d2) - d2 * 0.12 + d3 * 0.1
    + Math.sin(uL * TAU) * 0.035 * gallop;
  const dx = lunge + hurt * 14 + d1 * 10 + P.swipe * (wu * 10 - sk * 18);
  const dy = d3 * 12;
  const pivot = { x: 95, y: 0 }; // cascos de trás
  const T = (p: V) => xf(p, pivot, rear, dx, dy);
  const IT = (p: V) => ixf(p, pivot, rear, dx, dy);
  const glowK = clamp(0.5 + st.rage * 0.4 + P.atk * 0.5) * (1 - die);
  const horse = C.body;
  const horseD = C.dark;

  const bob = stepBob(uL * 1, 0.1) * 3.5 * m + gallop * Math.sin(uL * TAU - 0.6) * 7;
  const bodyY = -150 + bob + Math.sin(t * 2.1) * 1.5 * calm + d2 * 46 + d3 * 30;

  // ---------------------------------------------------------------- patas
  // fases: passo (4 tempos) → galope
  const off = [L(0, 0, gallop), L(0.5, 0.12, gallop), L(0.25, 0.55, gallop), L(0.75, 0.66, gallop)]; // LH, RH, LF, RF
  const duty = L(0.64, 0.42, gallop);
  const S = 75 * duty * G.sK + gallop * 10;
  const H = 18 * m + gallop * 24;
  const fold = clamp(rear * 3.4 - d2 * 2) * (1 - d2);
  const paw = Math.sin(t * 9) * fold;
  const kneel = d2; // joelhos dobrados sob o corpo
  const mk = (top: V, baseX: number, ph: number, bend: number, front: boolean): Leg => {
    const f = stepFoot(uL + ph, S, H, duty);
    let hoof = IT({ x: dx + baseX + f.x, y: -6 - f.lift });
    if (front) {
      // empinando: as patas da frente sobem dobradas e "pedalam" no ar
      const up = { x: top.x - 8 + paw * 12, y: top.y + 50 - paw * 6 };
      hoof = LV(hoof, up, fold);
    }
    const under = { x: top.x + (front ? -28 : 34), y: top.y + 38 };
    hoof = LV(hoof, under, kneel * (front ? 1 : 0.8));
    return { top, hoof, bend, f };
  };
  const legs = {
    farH: mk({ x: 85, y: bodyY + 25 }, 85, off[0], -1, false),
    nearH: mk({ x: 105, y: bodyY + 28 }, 108, off[1], -1, false),
    farF: mk({ x: -40, y: bodyY + 28 }, -40, off[2], 1, true),
    nearF: mk({ x: -55, y: bodyY + 30 }, -58, off[3], 1, true),
  };

  shadow(ctx, dx + 20, 140);
  ctx.save();
  ctx.translate(dx, dy);
  ctx.translate(pivot.x, pivot.y);
  ctx.rotate(rear);
  ctx.translate(-pivot.x, -pivot.y);

  horseLeg(ctx, legs.farH, horseD, true);
  horseLeg(ctx, legs.farF, horseD, true);

  // cauda de fogo-fumaça (atrasa e chicoteia)
  const trail = m * G.fwd + gallop;
  for (let i = 0; i < 5; i++) {
    const k = i / 4;
    const wv = Math.sin(t * 3 + i * 0.8 - uL * TAU) * (4 + m * 6) * k;
    flame(ctx, 128 + k * (26 + trail * 16), bodyY - 10 + k * (26 - trail * 14) + wv, 13 - k * 3, t * 6 + i, s.pal.glow, s.pal.accent, (0.85 - k * 0.25) * (1 - die));
  }
  // capa do cavaleiro (atrás; tremula com atraso)
  const rb = stepBob(uL, 0.2) * 2.5 * m + gallop * Math.sin(uL * TAU - 1.2) * 5; // cavaleiro sacoleja atrasado
  const capeWave = (k: number) => Math.sin(t * 3 + k * 5 - uL * TAU) * (6 + m * 6) * k + trail * k * 40;
  const cy = bodyY + 150 + rb;
  ctx.fillStyle = vgrad(ctx, -280 + cy, -150 + cy, mixHex(horseD, C.accent, 0.18), horseD);
  ctx.beginPath();
  ctx.moveTo(-6, -278 + cy);
  ctx.bezierCurveTo(50, -270 + cy, 90 + capeWave(0.5), -230 + cy, 120 + capeWave(1), -170 + cy - trail * 30);
  for (let i = 0; i < 4; i++) ctx.lineTo(110 + capeWave(1) - i * 14, -160 + cy - (i % 2) * 14 - trail * 30 + Math.sin(t * 5 + i) * 3);
  ctx.bezierCurveTo(50, -170 + cy, 20, -220 + cy, 16, -245 + cy);
  ctx.closePath();
  ctx.fill();

  // corpo do cavalo (respira: barriga expande)
  const br = Math.sin(t * 1.6) * 1.5 * calm;
  ctx.fillStyle = vgrad(ctx, bodyY - 50, bodyY + 50, mixHex(horse, '#ffffff', 0.14), horseD);
  ctx.beginPath();
  ctx.ellipse(25, bodyY, 100, 46 + br, -0.03, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-50, bodyY - 6, 46, 0, TAU);
  ctx.arc(98, bodyY - 4, 46, 0, TAU);
  ctx.fill();
  // costelas aparentes (cavalo morto-vivo)
  ctx.strokeStyle = hexA('#000000', 0.25);
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const x = 0 + i * 18;
    ctx.moveTo(x, bodyY - 10);
    ctx.quadraticCurveTo(x - 8, bodyY + 14, x - 2, bodyY + 34 + br);
  }
  ctx.stroke();
  // armadura do cavalo (barding) com detalhes laranja
  ctx.fillStyle = hexA(horseD, 0.92);
  ctx.beginPath();
  ctx.moveTo(-90, bodyY - 20);
  ctx.quadraticCurveTo(-60, bodyY + 40, -20, bodyY + 38);
  ctx.lineTo(-10, bodyY - 30);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = hexA(C.accent, 0.7);
  ctx.lineWidth = 2;
  ctx.stroke();
  // sela
  ctx.fillStyle = hurtTint(ctx, st, '#3a1a10');
  ctx.beginPath();
  ctx.ellipse(18, bodyY - 42, 38, 12, 0, 0, TAU);
  ctx.fill();

  // pescoço e cabeça do cavalo (aceno a cada pisada da frente)
  const nod = Math.sin(uL * TAU * 2 - 0.4) * 0.07 * m * (1 - gallop) + Math.sin(uL * TAU - 0.4) * 0.16 * gallop;
  const neckAng = -0.35 - P.roar * hold * 0.35 - P.slam * wu * 0.3 + gallop * 0.2 + Math.sin(t * 1.6) * 0.04 * calm + nod
    + hurt * -0.3 - d1 * 0.4 * (1 - d2) + d2 * 0.7 + d3 * 0.3;
  const neckBase = { x: -60, y: bodyY - 20 };
  const headP = {
    x: neckBase.x - Math.cos(neckAng) * 70 - gallop * 10,
    y: neckBase.y - 75 + Math.sin(neckAng + 0.35) * 40 - P.roar * hold * 15,
  };
  const neck = bez(neckBase, { x: neckBase.x - 10, y: neckBase.y - 40 }, { x: headP.x + 20, y: headP.y + 10 }, headP, 10);
  tube(ctx, neck, (k) => 64 - k * 26, horse);
  // crina de fogo (vai para trás com o movimento)
  for (let i = 0; i < 6; i++) {
    const q = neck[Math.min(neck.length - 1, 1 + i * 2)];
    flame(ctx, q.x + 14 + trail * 8, q.y - 10, 12, t * 7 + i * 1.3, s.pal.eye, s.pal.glow, 0.9 * (1 - die));
  }
  ctx.save();
  ctx.translate(headP.x, headP.y);
  ctx.rotate(-0.5 + neckAng * 0.6 - P.roar * hold * 0.3);
  const mouthOpen = clamp(P.roar * hold + gallop * 0.4 + hurt * 0.6 + d1 * 0.8);
  ctx.fillStyle = horseD;
  ctx.beginPath();
  ctx.moveTo(-10, 8);
  ctx.lineTo(-62, 16 + mouthOpen * 8);
  ctx.lineTo(-60, 26 + mouthOpen * 10);
  ctx.lineTo(0, 22);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = vgrad(ctx, -20, 20, mixHex(horse, '#ffffff', 0.15), horseD);
  ctx.beginPath();
  ctx.moveTo(18, -16);
  ctx.quadraticCurveTo(-10, -24, -40, -8);
  ctx.quadraticCurveTo(-68, 4, -66, 16);
  ctx.lineTo(-10, 18);
  ctx.quadraticCurveTo(22, 14, 18, -16);
  ctx.fill();
  // orelhas (mexem)
  const ear = Math.sin(t * 0.7) > 0.8 ? 0.3 : 0;
  ctx.save();
  ctx.translate(14, -14);
  ctx.rotate(ear - P.roar * hold * 0.4 + hurt * 0.5);
  ctx.beginPath();
  ctx.moveTo(-6, -2);
  ctx.lineTo(2, -24);
  ctx.lineTo(6, 2);
  ctx.fill();
  ctx.restore();
  // chanfro (máscara de ferro)
  ctx.strokeStyle = hurtTint(ctx, st, '#5a5a66');
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(6, -18);
  ctx.quadraticCurveTo(-20, -18, -50, -2);
  ctx.stroke();
  eyeGlow(ctx, -14, -6, 4 + glowK * 2, s.pal.eye, 1 - die);
  // fumaça de fogo pelas narinas (bufa a cada passo)
  const snort = glowK * (0.5 + 0.5 * Math.max(0, Math.sin(uL * TAU * 2))) + mouthOpen * 0.5;
  if (snort > 0.3) flame(ctx, -66, 12, 5 + mouthOpen * 4, t * 9, s.pal.eye, s.pal.glow, Math.min(1, snort) * 0.8 * (1 - die));
  ctx.restore();

  // ---------------- cavaleiro
  const seat = { x: 18, y: bodyY - 48 + rb };
  const riderLean = -gallop * 0.28 + P.swipe * (wu * 0.18 - sk * 0.3) - rear * 0.6 + Math.sin(uL * TAU * 2 - 1) * 0.03 * m
    + hurt * 0.2 + d1 * 0.3 * (1 - d2) - d2 * 0.5 - d3 * 0.3 + P.cast * (wu * 0.1 - sk * 0.08) + P.roar * sk * 0.12;
  ctx.save();
  ctx.translate(seat.x, seat.y);
  ctx.rotate(riderLean);
  // perna (bota no estribo)
  ctx.strokeStyle = C.dark;
  ctx.lineWidth = 18;
  line(ctx, { x: 0, y: 0 }, { x: -24, y: 30 });
  line(ctx, { x: -24, y: 30 }, { x: -16, y: 66 });
  ctx.strokeStyle = horse;
  ctx.lineWidth = 12;
  line(ctx, { x: 0, y: 0 }, { x: -24, y: 30 });
  line(ctx, { x: -24, y: 30 }, { x: -16, y: 64 });
  // braço de trás (rédeas / magia)
  const ck = P.cast;
  let aB = 0.9 + Math.sin(t * 1.3) * 0.05, bB = 0.9;
  aB = L(aB, L(L(aB, 2.7, wu), 1.7, sk), ck); bB = L(bB, L(L(bB, 0.4, wu), 0, sk), ck);
  aB = L(aB, 2.4, P.roar * hold); bB = L(bB, 0.2, P.roar * hold);
  aB = L(aB, 0.2, d2);
  const armB = armPts({ x: 14, y: -76 }, aB, bB, 34, 32);
  ctx.strokeStyle = mixHex(horse, C.dark, 0.5);
  ctx.lineWidth = 14;
  line(ctx, armB.sh, armB.el);
  line(ctx, armB.el, armB.hd);
  // torso de armadura
  ctx.fillStyle = vgrad(ctx, -90, 0, mixHex(horse, '#ffffff', 0.25), C.dark);
  ctx.beginPath();
  ctx.moveTo(-22, 0);
  ctx.lineTo(-30, -60);
  ctx.quadraticCurveTo(-30, -88, -6, -92);
  ctx.lineTo(18, -92);
  ctx.quadraticCurveTo(34, -86, 30, -58);
  ctx.lineTo(24, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = hexA(C.accent, 0.6);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-26, -40);
  ctx.lineTo(28, -40);
  ctx.moveTo(0, -90);
  ctx.lineTo(0, -4);
  ctx.stroke();
  // gola e pescoço cortado
  ctx.fillStyle = C.dark;
  ctx.beginPath();
  ctx.ellipse(4, -94, 20, 8, 0, 0, TAU);
  ctx.fill();
  // fogo no lugar da cabeça (inclina com o movimento; se apaga na morte)
  const fire = (1 + glowK * 0.5 + P.roar * sk * 0.7 + P.cast * hold * 0.3 + imp * 0.3) * (1 - sm(0.3, 0.8, die));
  const neckFire = { x: 4, y: -100 };
  const fl = trail * 10;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  orb(ctx, neckFire.x + fl * 0.5, neckFire.y - 20, 34 * fire, s.pal.glow, 0.45);
  ctx.restore();
  flame(ctx, neckFire.x + fl * 0.3, neckFire.y, 20 * fire, t * 8, s.pal.eye, s.pal.glow, 1);
  flame(ctx, neckFire.x - 8 + fl * 0.6, neckFire.y - 2, 12 * fire, t * 10 + 2, '#ffffff', s.pal.accent, 0.9);
  if (die > 0.3) {
    // fumaça subindo do pescoço apagado
    ctx.fillStyle = 'rgba(60,60,70,0.35)';
    for (let i = 0; i < 4; i++) {
      const k = ((t * 0.6 + i * 0.25) % 1);
      ctx.beginPath();
      ctx.arc(neckFire.x + Math.sin(t + i) * 6, neckFire.y - k * 60, 5 + k * 10, 0, TAU);
      ctx.fill();
    }
  }
  // ombreira
  ctx.fillStyle = mixHex(horse, '#ffffff', 0.2);
  ctx.beginPath();
  ctx.ellipse(-16, -82, 22, 14, -0.3, Math.PI, TAU);
  ctx.fill();

  // braço da frente com a lança
  let la = 0.32 + Math.sin(t * 1.4) * 0.03 * calm + Math.sin(uL * TAU * 2 - 1.2) * 0.04 * m; // ângulo da lança (+ = ponta para cima)
  let aF = 0.9, bF = 0.9;
  la = L(la, 0.02, gallop);
  aF = L(aF, 1.3, gallop); bF = L(bF, 0.2, gallop);
  if (P.swipe) {
    // ceifa: ergue a lança alto atrás e varre de cima para baixo
    la = L(L(la, 1.55, wu), -0.6, sk);
    aF = L(L(aF, 2.6, wu), 1.25, sk); bF = L(L(bF, 0.2, wu), 0.15, sk);
  }
  if (P.roar) { la = L(la, L(0.9, 1.3, sk), hold); aF = L(aF, 2.4, hold); bF = L(bF, 0.3, hold); }
  if (P.shoot) { la = L(la, 0.05, hold); aF = L(L(aF, 0.7, wu), 1.6, sk); bF = L(L(bF, 1.6, wu), 0, sk); }
  if (P.slam) { la = L(L(la, 0.9, wu), -0.25, sk); }
  la += hurt * 0.3;
  la = L(la, -0.18, d2);
  aF = L(aF, 0.3, d2);
  const armF = armPts({ x: -16, y: -78 }, aF, bF, 34, 32);
  const dir = { x: -Math.cos(la), y: -Math.sin(la) };
  const tip = { x: armF.hd.x + dir.x * 190, y: armF.hd.y + dir.y * 190 };
  const butt = { x: armF.hd.x - dir.x * 55, y: armF.hd.y - dir.y * 55 };
  // rastro da ceifa
  if (P.swipe && P.p > 0.4 && P.p < 0.68) {
    const la0 = L(1.55, -0.6, clamp(sm(0.38, 0.52, P.p - 0.08)));
    const al = 1 - sm(0.58, 0.68, P.p);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = hexA('#ffd08a', 0.6 * al);
    ctx.beginPath();
    const a0 = Math.PI + la0, a1 = Math.PI + la;
    ctx.arc(armF.hd.x, armF.hd.y, 200, Math.min(a0, a1), Math.max(a0, a1));
    ctx.arc(armF.hd.x, armF.hd.y, 120, Math.max(a0, a1), Math.min(a0, a1), true);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.strokeStyle = hurtTint(ctx, st, '#2a1a12');
  ctx.lineWidth = 8;
  line(ctx, butt, armF.hd);
  const nx = -dir.y, ny = dir.x;
  ctx.fillStyle = vgrad(ctx, -120, 0, hurtTint(ctx, st, '#8a8a96'), hurtTint(ctx, st, '#3a3a44'));
  ctx.beginPath();
  ctx.moveTo(armF.hd.x + dir.x * 14 + nx * 11, armF.hd.y + dir.y * 14 + ny * 11);
  ctx.lineTo(tip.x, tip.y);
  ctx.lineTo(armF.hd.x + dir.x * 14 - nx * 11, armF.hd.y + dir.y * 14 - ny * 11);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = hexA(C.accent, 0.8);
  ctx.lineWidth = 2;
  for (let i = 1; i < 6; i++) {
    const k = i / 6;
    const w = 11 * (1 - k);
    const cxp = armF.hd.x + dir.x * (14 + k * 176), cyp = armF.hd.y + dir.y * (14 + k * 176);
    ctx.beginPath();
    ctx.moveTo(cxp + nx * w, cyp + ny * w);
    ctx.lineTo(cxp - nx * w + dir.x * 10, cyp - ny * w + dir.y * 10);
    ctx.stroke();
  }
  // brilho na ponta durante a investida
  if (gallop > 0.1) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    orb(ctx, tip.x, tip.y, 20 + gallop * 18, s.pal.glow, gallop * 0.7);
    ctx.restore();
  }
  ctx.fillStyle = hurtTint(ctx, st, '#5a5a66');
  ctx.beginPath();
  ctx.moveTo(armF.hd.x + nx * 20 - dir.x * 4, armF.hd.y + ny * 20 - dir.y * 4);
  ctx.lineTo(armF.hd.x + dir.x * 18, armF.hd.y + dir.y * 18);
  ctx.lineTo(armF.hd.x - nx * 20 - dir.x * 4, armF.hd.y - ny * 20 - dir.y * 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = mixHex(horse, '#ffffff', 0.2);
  ctx.lineWidth = 15;
  line(ctx, armF.sh, armF.el);
  line(ctx, armF.el, armF.hd);
  ctx.fillStyle = C.dark;
  ctx.beginPath();
  ctx.arc(armF.hd.x, armF.hd.y, 9, 0, TAU);
  ctx.fill();
  // fogo-fátuo na mão de trás (cast)
  const cf = ck * (wu * 0.7 + sk);
  if (cf > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    orb(ctx, armB.hd.x, armB.hd.y, 18 + cf * 26 + imp * 16, s.pal.glow, cf * 0.6);
    ctx.restore();
    flame(ctx, armB.hd.x, armB.hd.y, 10 + cf * 14, t * 9, s.pal.eye, s.pal.glow, cf);
  }
  ctx.restore();

  // patas do lado de cá (por cima do corpo)
  horseLeg(ctx, legs.nearH, horse, false);
  horseLeg(ctx, legs.nearF, horse, false);
  ctx.restore();

  const RT = (p: V) => {
    const q = p; // já em coordenadas do cavaleiro (origem na sela)
    const c = Math.cos(riderLean), sn = Math.sin(riderLean);
    return T({ x: seat.x + q.x * c - q.y * sn, y: seat.y + q.x * sn + q.y * c });
  };
  return {
    mouth: RT({ x: neckFire.x, y: neckFire.y - 20 }),
    hand: RT(P.cast > 0 ? armB.hd : tip),
    core: T({ x: 10, y: bodyY - 20 }),
    top: RT({ x: 0, y: -170 }).y - 10,
    halfW: 140,
  };
}

/** Pata do cavalo: IK de dois ossos (dianteira dobra o joelho para a frente; traseira, o jarrete para trás). */
function horseLeg(ctx: CanvasRenderingContext2D, L0: Leg, col: string, back: boolean) {
  const { top, hoof, bend, f } = L0;
  const knee = ik(top, hoof, 64, 62, bend);
  const out = back ? mixHex(col, '#000000', 0.3) : col;
  ctx.strokeStyle = out;
  ctx.lineWidth = 24;
  line(ctx, top, knee);
  ctx.lineWidth = 14;
  line(ctx, knee, hoof);
  if (!back) {
    ctx.strokeStyle = hexA('#ffffff', 0.08);
    ctx.lineWidth = 6;
    line(ctx, { x: top.x - 6, y: top.y }, { x: knee.x - 5, y: knee.y });
  }
  ctx.fillStyle = out;
  ctx.beginPath();
  ctx.arc(knee.x, knee.y, 9, 0, TAU);
  ctx.fill();
  // casco (no balanço vira para trás)
  const a = Math.atan2(hoof.y - knee.y, hoof.x - knee.x) - Math.PI / 2;
  ctx.save();
  ctx.translate(hoof.x, hoof.y);
  ctx.rotate(f.plant ? 0 : a * 0.6 + Math.sin(f.k * Math.PI) * 0.6);
  ctx.fillStyle = '#0a0806';
  ctx.beginPath();
  ctx.moveTo(-11, 7);
  ctx.lineTo(-8, -4);
  ctx.lineTo(8, -4);
  ctx.lineTo(10, 7);
  ctx.closePath();
  ctx.fill();
  // tufo de fogo no boleto
  ctx.fillStyle = back ? 'rgba(255,120,30,0.15)' : 'rgba(255,140,40,0.35)';
  ctx.fillRect(-12, -9, 22, 4);
  ctx.restore();
}
