/**
 * SENHOR BOTÕES — boneco de pano remendado. Anda de verdade, mas como marionete
 * mal costurada: pés plantados, joelhos de pano dobrando, quadril que afunda a cada
 * pisada, tronco que gira, cabeça pesada que balança atrasada e braços soltos.
 */
import type { BossSpec } from '@gymbattle/shared';
import type { Anchors, DrawState, V } from '../types';
import { eyeGlow, hurtTint, mixHex, vgrad, TAU, clamp, sm, rgba, bez, tube, smoothPath } from '../util';
import { frac, STRIDE, wob, type C } from './blob-kit';

const HIP_Y = -110;
const LEG = 62;

/** Joelho por IK de dois segmentos (dobra para a frente = esquerda). */
function knee(h: V, f: V, l: number): V {
  const dx = f.x - h.x;
  const dy = f.y - h.y;
  const D = Math.min(Math.hypot(dx, dy), l * 2 - 0.01);
  const m = { x: h.x + dx / 2, y: h.y + dy / 2 };
  const off = Math.sqrt(Math.max(0, l * l - (D / 2) * (D / 2)));
  const len = Math.hypot(dx, dy) || 1;
  // perpendicular apontando para a frente (−x)
  let px = -dy / len;
  let py = dx / len;
  if (px > 0) {
    px = -px;
    py = -py;
  }
  return { x: m.x + px * off, y: m.y + py * off };
}

export function ragdoll(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState, c: C): Anchors {
  const { P, body, dark, t, wu, sk, atk, L } = c;
  const p = c.p;
  const thread = hurtTint(ctx, st, '#2a1a14');
  const red = hurtTint(ctx, st, P.accent);
  const dying = st.anim === 'death';
  const dp = dying ? st.p : 0;
  // poses (as que ele não usa caem nas parecidas)
  const swipe = c.swipe + c.slam + c.charge;
  const cast = c.cast + c.breath + c.shoot;
  const roar = c.roar;

  // ---------------- passada
  const ph = L.ph;
  const half = STRIDE / 2;
  const stance = 0.56;
  const amp = L.amp;
  const feet: V[] = [];
  const hips = [-30, 30];
  for (let i = 0; i < 2; i++) {
    const q = frac(ph + i * 0.5);
    let x: number;
    let lift = 0;
    if (q < stance) x = L.d * (half * stance - 2 * half * q) / 1;
    else {
      const k = (q - stance) / (1 - stance);
      const e = k * k * (3 - 2 * k);
      x = L.d * (-half * stance + 2 * half * stance * e);
      lift = Math.sin(Math.PI * k) * (24 + 18 * st.move) * (i ? 1 : 0.8);
    }
    feet.push({ x: hips[i] - 8 + x * amp, y: -lift * amp });
  }
  // quadril afunda na pisada (q=0 de cada pé) e sobe no meio do apoio
  const bob = amp * (7 * Math.cos(TAU * 2 * ph) + 3) ;
  const sway = amp * Math.sin(TAU * ph) * 0.06;
  const walkLean = amp * L.d * (0.05 + 0.04 * st.move);

  // ---------------- ataques e estados
  const crouch = swipe * wu * 14 + roar * wu * 10 + cast * sm(0.05, 0.3, p) * (1 - sm(0.35, 0.45, p)) * 18;
  const rise = cast * sm(0.38, 0.5, p) * (1 - sm(0.75, 0.95, p)) * -10;
  const laugh = roar * sm(0.4, 0.5, p) * (1 - sm(0.85, 1, p));
  const shakeL = laugh * Math.sin(t * 34) * 4;
  const twist = swipe * (wu * 0.12 - sk * 0.2) + c.fol * 0.06 * swipe;
  // morte: cambaleia, joelhos cedem, senta e tomba de costas
  const stagger = dying ? Math.sin(dp * 18) * 0.08 * (1 - sm(0.25, 0.4, dp)) : 0;
  const sit = dying ? sm(0.25, 0.55, dp) : 0;
  const topple = dying ? sm(0.55, 0.9, dp) : 0;
  const thud2 = dying ? wob(dp, 0.9, 40, 12) * 0.05 : 0;

  const hipY = HIP_Y + bob + crouch + rise + sit * 72 + c.hit * 8;
  const bx = -c.hit * 14 + sit * 10;
  const rot = sway + walkLean + Math.sin(t * 0.8) * 0.035 * (1 - amp) - twist + roar * (wu * 0.1 - laugh * 0.18) + c.hit * 0.18 + stagger + topple * 1.15 + thud2 + cast * (wu * 0.06 - sk * 0.1);

  // pés na morte: deslizam para a frente (sentado de pernas esticadas)
  if (sit > 0) {
    feet[0] = { x: feet[0].x * (1 - sit) + (-60 + hips[0]) * sit, y: feet[0].y * (1 - sit) - topple * 30 };
    feet[1] = { x: feet[1].x * (1 - sit) + (-70 + hips[1]) * sit, y: feet[1].y * (1 - sit) - topple * 16 };
  }
  // sombra
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(bx + topple * 60, 2, 120 + topple * 60, 12, 0, 0, TAU);
  ctx.fill();

  // transformação do tronco: pivô no quadril
  const T = (x: number, y: number): V => {
    const dx = x;
    const dy = y - HIP_Y;
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    return { x: bx + dx * cs - dy * sn, y: hipY + dx * sn + dy * cs };
  };

  // ---------------- pernas de pano
  const legCol = hurtTint(ctx, st, mixHex(P.body, '#6a5a7a', 0.45));
  const legDark = mixHex(legCol, '#000000', 0.25);
  for (const i of [1, 0]) {
    const hip = T(hips[i], HIP_Y + 6);
    const f = feet[i];
    const kn = knee(hip, f, LEG);
    const pts = bez(hip, { x: kn.x, y: kn.y - 12 }, { x: kn.x, y: kn.y + 12 }, { x: f.x, y: f.y - 8 }, 12);
    tube(ctx, pts, (q) => 40 - q * 6, i ? legDark : legCol);
    // listras ao longo da perna
    ctx.strokeStyle = rgba(P.dark, 0.4);
    ctx.lineWidth = 6;
    for (let k = 2; k < 11; k += 3) {
      const a = pts[k];
      const b = pts[k + 1];
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / l;
      const ny = (b.x - a.x) / l;
      ctx.beginPath();
      ctx.moveTo(a.x - nx * 18, a.y - ny * 18);
      ctx.lineTo(a.x + nx * 18, a.y + ny * 18);
      ctx.stroke();
    }
    // sapato de pano (achata ao pisar, inclina ao levantar)
    const footRot = f.y < -2 ? -0.25 * L.d * (f.y / -40) : 0;
    ctx.save();
    ctx.translate(f.x - 8, f.y - 4);
    ctx.rotate(footRot - topple * 0.3);
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(0, 0, 32, 14, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.ellipse(-8, -6, 16, 4, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(bx, hipY);
  ctx.rotate(rot);
  ctx.translate(0, -HIP_Y);

  // ---------------- braço de trás (com agulha) — balança oposto à passada, atrasado
  const armSw = amp * Math.sin(TAU * (ph - 0.1)) * 24;
  const handB = {
    x: 90 + armSw * 0.8 + roar * (wu * 20 + laugh * 30) - cast * atk * 10,
    y: -150 - cast * (sm(0.05, 0.4, p) * 150 - sm(0.45, 0.55, p) * 90) * (1 - sm(0.8, 1, p)) - laugh * 70 + Math.sin(t * 1.3) * 6 + sit * 30 + Math.abs(armSw) * -0.3 + shakeL,
  };
  tube(ctx, bez({ x: 60, y: -220 }, { x: 90, y: -210 }, { x: handB.x, y: handB.y - 30 }, handB, 10), (q) => 30 - q * 8, mixHex(body, dark, 0.3));
  ctx.strokeStyle = hurtTint(ctx, st, '#c8c8d0');
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(handB.x - 6, handB.y + 30);
  ctx.lineTo(handB.x + 10, handB.y - 50);
  ctx.stroke();

  // ---------------- tronco (saco de pano) — respira e encolhe na pisada
  const br = c.b * 3 + laugh * Math.sin(t * 34) * 3;
  ctx.fillStyle = vgrad(ctx, -250, -80, body, mixHex(body, dark, 0.35));
  ctx.beginPath();
  ctx.moveTo(-60 - br, -230);
  ctx.quadraticCurveTo(0, -252 - br, 64 + br, -230);
  ctx.quadraticCurveTo(98 + br, -160, 72, -90);
  ctx.quadraticCurveTo(0, -70, -70, -90);
  ctx.quadraticCurveTo(-94 - br, -160, -60 - br, -230);
  ctx.fill();
  // sombra lateral (volume)
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  ctx.beginPath();
  ctx.moveTo(40, -232);
  ctx.quadraticCurveTo(98 + br, -160, 72, -90);
  ctx.quadraticCurveTo(50, -84, 40, -86);
  ctx.quadraticCurveTo(70, -160, 40, -232);
  ctx.fill();
  patch(ctx, -36, -190, 46, 38, 0.15, hurtTint(ctx, st, mixHex(P.body, '#7a8a5a', 0.6)), thread);
  patch(ctx, 34, -130, 40, 46, -0.2, hurtTint(ctx, st, mixHex(P.body, '#7a5a8a', 0.55)), thread);
  patch(ctx, -30, -110, 30, 24, 0.4, hurtTint(ctx, st, mixHex(P.body, P.accent, 0.4)), thread);
  stitchLine(ctx, [{ x: 4, y: -236 }, { x: 0, y: -170 }, { x: 8, y: -84 }], thread, 9);
  // enchimento saindo do rasgo (mais na morte)
  ctx.fillStyle = hurtTint(ctx, st, '#f0ece0');
  const fluff = 3 + Math.round(topple * 4);
  for (let i = 0; i < fluff; i++) {
    ctx.beginPath();
    ctx.arc(62 + i * 6 + topple * i * 4, -190 + i * 8 + Math.sin(t * 2 + i) * 2 - topple * i * 6, 8 + topple * 3, 0, TAU);
    ctx.fill();
  }

  // ---------------- cabeça grande: balança atrasada (pesada), joga para trás na risada
  const headLag = amp * Math.sin(TAU * (2 * ph - 0.3)) * 0.07 + amp * L.d * -0.06;
  const hx = -14 + cast * (wu * 10 - sk * 16) - swipe * sk * 10 + amp * L.d * 6;
  const hy = -296 + Math.sin(t * 1.6) * 3 + amp * Math.cos(TAU * (2 * ph - 0.2)) * 4 + roar * wu * 8 - laugh * 6 + shakeL;
  const hRot = Math.sin(t * 0.7) * 0.14 + 0.12 + headLag + roar * (wu * 0.25 - laugh * 0.45) + c.hit * 0.3 - swipe * (wu * 0.1 - sk * 0.15) + c.fol * 0.1 - (dying ? sm(0.1, 0.5, dp) * 0.5 + topple * 0.3 : 0);
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(hRot);
  // cabelo de lã (atraso maior que a cabeça)
  ctx.strokeStyle = hurtTint(ctx, st, mixHex(P.dark, P.accent, 0.3));
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  const hairLag = amp * Math.sin(TAU * (2 * ph - 0.45)) * 10 + L.d * amp * 8 + c.hit * 12;
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * 0.15 - (i / 8) * Math.PI * 0.7;
    const x0 = Math.cos(a) * 62;
    const y0 = Math.sin(a) * 56;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(x0 * 1.3 + Math.sin(t * 2 + i) * 6 + hairLag * 0.5, y0 * 1.3 - 10, x0 * 1.15 + 14 + hairLag, y0 * 1.1 + 18);
    ctx.stroke();
  }
  ctx.fillStyle = vgrad(ctx, -60, 60, mixHex(body, '#ffffff', 0.15), mixHex(body, dark, 0.25));
  ctx.beginPath();
  ctx.ellipse(0, 0, 70, 62, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath();
  ctx.ellipse(22, 14, 46, 44, 0.4, 0, TAU);
  ctx.fill();
  stitchLine(ctx, [{ x: 10, y: -60 }, { x: 22, y: -20 }, { x: 14, y: 20 }, { x: 22, y: 58 }], thread, 8);
  // olhos de botão (giram soltos no balanço)
  const loose = amp * Math.sin(TAU * (2 * ph - 0.4)) * 0.6 + c.hit * 2;
  button(ctx, -38, -12, 17, hurtTint(ctx, st, P.eye), thread, t + loose);
  button(ctx, 4, -16 + (dying ? topple * 10 : 0), 12, red, thread, t + 1 - loose);
  if (st.rage > 0.2 || atk > 0.3) {
    eyeGlow(ctx, -38, -12, 2.5, P.glow, 1);
    eyeGlow(ctx, 4, -16, 2, P.glow, 1);
  }
  // boca costurada: abre rasgando na risada
  const jaw = clamp(c.jaw * 0.6 + laugh * (0.7 + 0.3 * Math.sin(t * 30)) + cast * atk * 0.15 + c.hit * 0.4 + sit * 0.3);
  ctx.fillStyle = '#1a0806';
  ctx.beginPath();
  ctx.moveTo(-52, 18);
  ctx.quadraticCurveTo(-14, 40 + jaw * 28, 30, 16);
  ctx.quadraticCurveTo(-14, 30 - jaw * 6, -52, 18);
  ctx.fill();
  ctx.strokeStyle = thread;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-54, 18);
  ctx.quadraticCurveTo(-14, 34 + jaw * 14, 32, 14);
  ctx.stroke();
  for (let i = 0; i < 7; i++) {
    const k = i / 6;
    const x = -48 + k * 74;
    const y = 18 + Math.sin(k * Math.PI) * (14 + jaw * 12);
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 7 - jaw * 7);
    ctx.lineTo(x + 4, y + 7 + jaw * 7);
    ctx.moveTo(x + 4, y - 7 - jaw * 7);
    ctx.lineTo(x - 4, y + 7 + jaw * 7);
    ctx.stroke();
  }
  const mouthPt = c.map(-14, 26);
  ctx.restore();

  // ---------------- braço da frente com a tesoura gigante
  const sh = { x: -56, y: -214 };
  const swA = swipe * (sm(0.05, 0.38, p) * (1 - sm(0.44, 0.54, p)));
  const swB = swipe * sm(0.44, 0.54, p) * (1 - sm(0.75, 1, p));
  const handF = {
    x: -110 - armSw * 0.9 + Math.sin(t * 1.1) * 4 + swA * 150 - swB * 90 + cast * atk * 20 - laugh * 30 + c.fol * swipe * 10,
    y: -150 + Math.abs(armSw) * -0.2 - swA * 140 + swB * 30 - cast * (sm(0.05, 0.4, p) * 140 - sm(0.45, 0.55, p) * 100) * (1 - sm(0.8, 1, p)) - laugh * 40 + sit * 50 + shakeL,
  };
  // rastro (smear) do corte
  if (swipe > 0 && p > 0.42 && p < 0.62) {
    const k = sm(0.42, 0.5, p) * (1 - sm(0.54, 0.62, p));
    ctx.save();
    ctx.globalAlpha = 0.5 * k;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 26;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(sh.x, sh.y, 150, -Math.PI * 0.55, Math.PI * 0.85, true);
    ctx.stroke();
    ctx.globalAlpha = 0.25 * k;
    ctx.lineWidth = 50;
    ctx.stroke();
    ctx.restore();
  }
  tube(ctx, bez(sh, { x: sh.x - 30, y: sh.y + 10 }, { x: handF.x + 20, y: handF.y - 20 }, handF, 10), (q) => 32 - q * 6, body);
  stitchLine(ctx, [sh, { x: (sh.x + handF.x) / 2 - 10, y: (sh.y + handF.y) / 2 }, handF], thread, 6);
  const scA = Math.atan2(handF.y - sh.y, handF.x - sh.x) + 0.3 + swA * 0.6 - swB * 0.9 + amp * Math.sin(TAU * (ph - 0.2)) * 0.15;
  const snip = clamp(0.3 + Math.sin(t * 2.5) * 0.12 + swA * 0.7 - swB * 0.4 * (p < 0.6 ? 1 : 0) + cast * atk * 0.2 + laugh * Math.max(0, Math.sin(t * 17)) * 0.5);
  ctx.save();
  ctx.translate(handF.x, handF.y);
  ctx.rotate(scA);
  ctx.strokeStyle = red;
  ctx.lineWidth = 7;
  for (const sg of [-1, 1]) {
    ctx.save();
    ctx.rotate(sg * snip * 0.4);
    ctx.beginPath();
    ctx.ellipse(-4, sg * 14, 14, 9, 0, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = hurtTint(ctx, st, sg > 0 ? '#d8dce4' : '#aab0bc');
    ctx.beginPath();
    ctx.moveTo(10, sg * 6);
    ctx.lineTo(130, sg * -3);
    ctx.lineTo(16, sg * -8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#4a4a50';
  ctx.beginPath();
  ctx.arc(14, 0, 5, 0, TAU);
  ctx.fill();
  const tip = c.map(110, 0);
  ctx.restore();

  // fios de marionete (cast) — puxados de cima
  const strings = cast * atk + (dying ? 0 : 0);
  if (strings > 0.05) {
    ctx.strokeStyle = rgba('#e8d0c0', strings * 0.8);
    ctx.lineWidth = 1.5;
    for (const h of [handF, handB]) {
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(h.x, h.y);
        ctx.quadraticCurveTo(h.x - 30 + i * 30 + Math.sin(t * 3 + i) * 10, h.y - 90, h.x - 40 + i * 40, h.y - 220);
        ctx.stroke();
      }
    }
  }
  const core = c.map(0, -160);
  const topY = c.map(hx, hy - 80).y;
  ctx.restore();
  void s;
  return { mouth: mouthPt, hand: tip, core, top: topY, halfW: 130 };
}

/** Remendo retangular com pontos de costura. */
function patch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ang: number, fill: string, thread: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = fill;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.strokeStyle = thread;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6);
  ctx.setLineDash([]);
  ctx.restore();
}

/** Costura em X ao longo de uma linha. */
function stitchLine(ctx: CanvasRenderingContext2D, pts: V[], thread: string, gap: number) {
  ctx.save();
  ctx.strokeStyle = thread;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  smoothPath(ctx, pts, true);
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.floor(l / (gap * 1.6)));
    const nx = -(b.y - a.y) / (l || 1);
    const ny = (b.x - a.x) / (l || 1);
    for (let k = 0; k < n; k++) {
      const q = (k + 0.5) / n;
      const x = a.x + (b.x - a.x) * q;
      const y = a.y + (b.y - a.y) * q;
      ctx.moveTo(x - nx * 6, y - ny * 6);
      ctx.lineTo(x + nx * 6, y + ny * 6);
    }
  }
  ctx.stroke();
  ctx.restore();
}

/** Olho de botão com 4 furos e linha em X. */
function button(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, thread: string, t: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(t * 0.5) * 0.2);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.75, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  const d = r * 0.3;
  for (const [hx, hy] of [[-d, -d], [d, -d], [-d, d], [d, d]]) {
    ctx.beginPath();
    ctx.arc(hx, hy, Math.max(1, r * 0.12), 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = mixHex(thread, '#c8a080', 0.5);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-d, -d);
  ctx.lineTo(d, d);
  ctx.moveTo(d, -d);
  ctx.lineTo(-d, d);
  ctx.stroke();
  ctx.restore();
}
