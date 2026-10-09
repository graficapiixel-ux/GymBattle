/**
 * MIL-BOCAS — amontoado de carne cheio de bocas. Anda sobre dezenas de pezinhos
 * de carne (como uma lagarta): cada um pisa, empurra e levanta na sua vez; a massa
 * estica e encolhe por cima, e os dois pescoços-boca balançam com atraso, mordendo
 * o ar no ritmo da passada.
 */
import type { BossSpec } from '@gymbattle/shared';
import type { Anchors, DrawState, V } from '../types';
import { h01, hurtTint, mixHex, vgrad, TAU, clamp, sm, rgba, bez, tube } from '../util';
import { frac, jelly, mouth, STRIDE, type C } from './blob-kit';

const W = 200;
const H = 260;

const LUMPS: [number, number, number][] = [
  [0, -128, 124], [-110, -100, 76], [110, -100, 86], [-60, -196, 78], [60, -192, 82], [0, -244, 58], [-150, -62, 44], [160, -62, 44],
];
const SPOTS: [number, number, number][] = [
  [-100, -110, 34], [10, -118, 30], [100, -128, 24], [-50, -188, 22], [70, -206, 22], [-150, -62, 18], [140, -70, 18],
];

export function mouths(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState, c: C): Anchors {
  const { P, body, dark, t, wu, sk, atk, L } = c;
  const p = c.p;
  const dying = st.anim === 'death';
  const dieF = dying ? sm(0.25, 0.9, st.p) : 0;
  const shiver = dying ? Math.sin(t * 30) * (1 - sm(0.1, 0.35, st.p)) * sm(0, 0.05, st.p) : 0;

  // ---------------- pose do corpo
  const crouch = c.charge * sm(0.05, 0.4, p) * (1 - sm(0.42, 0.5, p));
  const dash = c.charge * sm(0.42, 0.52, p) * (1 - sm(0.72, 0.98, p));
  const sing = c.roar * sm(0.4, 0.52, p) * (1 - sm(0.8, 1, p));
  const inhale = c.roar * sm(0.05, 0.38, p) * (1 - sm(0.4, 0.5, p));
  const lunge = -dash * 60 + crouch * 14;
  let sy = 1 + c.b * 0.03 - crouch * 0.16 + dash * 0.04 - inhale * 0.08 + sing * 0.05 + c.fol * 0.06 - c.hit * 0.1;
  let sx = 1 - c.b * 0.02 + crouch * 0.08 + dash * 0.12 + inhale * 0.03 + sing * 0.08 - c.fol * 0.03 + c.hit * 0.05;
  let lean = Math.sin(t * 1.1) * 5 + crouch * 30 - dash * 50 + c.swipe * (wu * 20 - sk * 28) + (c.shoot) * (wu * 16 - sk * 20) + c.fol * 14 + c.hit * 36 + shiver * 14;
  sy *= 1 - dieF * 0.6;
  sx *= 1 + dieF * 0.3;
  lean += dieF * -30;
  const jit = sing * Math.sin(t * 42) * 3;
  ctx.translate(lunge + jit, 0);
  const def = jelly(c, W, H, { sx, sy, lean });

  // sombra
  const lx = def(-W * L.d, 0).x;
  const fx = def(W * L.d, 0).x;
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse((lx + fx) / 2, 2, Math.abs(fx - lx) / 2 + 20, 16, 0, 0, TAU);
  ctx.fill();

  const flesh = vgrad(ctx, -300 * sy, 0, mixHex(body, '#ffffff', 0.15), mixHex(body, dark, 0.45));
  const fleshDark = mixHex(body, dark, 0.5);

  // ---------------- pezinhos de carne (plantados no chão enquanto apoiam)
  const nF = 9;
  const half = STRIDE / 2;
  for (let i = 0; i < nF; i++) {
    const hip = -170 + i * (340 / (nF - 1));
    const q = frac(st.gait * 2 + h01(i, 21) * 0.5 + i * 0.37);
    const stance = 0.6;
    let x: number;
    let lift = 0;
    if (q < stance) x = L.d * (half * stance / 2 - half * q);
    else {
      const k = (q - stance) / (1 - stance);
      const e = k * k * (3 - 2 * k);
      x = L.d * (-half * stance / 2 + half * stance * e);
      lift = Math.sin(Math.PI * k) * 16;
    }
    const top = def(hip, -44);
    const foot = { x: top.x + x * L.amp, y: -lift * L.amp - (dying ? 0 : 0) };
    ctx.fillStyle = fleshDark;
    ctx.beginPath();
    ctx.moveTo(top.x - 14, top.y);
    ctx.quadraticCurveTo(foot.x - 16, (top.y + foot.y) / 2, foot.x - 12, foot.y);
    ctx.lineTo(foot.x + 12, foot.y);
    ctx.quadraticCurveTo(foot.x + 16, (top.y + foot.y) / 2, top.x + 14, top.y);
    ctx.fill();
    // dedinhos
    ctx.fillStyle = mixHex(fleshDark, '#000000', 0.25);
    ctx.beginPath();
    ctx.ellipse(foot.x - 3, foot.y - 3, 15, 5, 0, 0, TAU);
    ctx.fill();
  }

  // ---------------- pescoços com bocas (atrás das bolotas)
  const necks: { base: V; head: V; r: number; open: number }[] = [];
  for (let j = 0; j < 2; j++) {
    const ph = t * 1.4 + j * 2;
    const bite = c.swipe * (wu * (j ? 50 : 40) - sk * (j ? 130 : 160)) + c.shoot * (wu * 40 - sk * 80) - dash * (j ? 60 : 90) + crouch * 30;
    const raise = c.swipe * (-wu * 40 + sk * 70) + c.shoot * (-wu * 50 + sk * 30) - sing * (j ? 70 : 50) + inhale * 20 + crouch * 30 + dash * 30;
    const base = def(j ? 40 : -40, -200);
    // a cabeça vem atrasada em relação ao corpo (sobreposição)
    const lagged = jelly(c, W, H, { sx, sy, lean: lean * 1.4, extraLag: 1.2 + j * 0.4 })(j ? -10 : -110, j ? -310 : -270);
    const bob = L.amp * Math.sin(TAU * (L.h - 0.3 - j * 0.2)) * 10;
    const flop = dieF * (j ? 1 : 1.2);
    const head = {
      x: lagged.x + bite + Math.sin(ph) * 10 - flop * 60 + c.fol * 12,
      y: lagged.y + Math.cos(ph) * 8 + raise + bob + flop * (j ? 230 : 210) * (1 - sy * 0.3) + c.hit * -10,
    };
    head.y = Math.min(head.y, -(j ? 34 : 40) - 4);
    const chomp = L.amp * Math.max(0, Math.sin(TAU * (L.ph * 2 + j * 0.5 - 0.2))) * 0.45;
    const biteOpen = c.swipe * (sm(0.08, 0.4, p) * (1 - sm(0.5, 0.56, p)) + sm(0.62, 0.75, p) * (1 - sm(0.8, 1, p)) * 0.4);
    const open = clamp(
      0.22 + Math.sin(t * 3 + j) * 0.12 + chomp + biteOpen * 1.1 + c.shoot * c.jaw + sing * 1 + inhale * 0.3 + dash * 1 + c.hit * 0.4 - dieF * 0.1,
    );
    necks.push({ base, head, r: (j ? 34 : 40) * (1 + sing * 0.15), open });
    tube(ctx, bez(base, { x: base.x, y: base.y - 60 * sy }, { x: head.x + 50, y: head.y + 40 }, head, 14), (q) => 60 - q * 26, j ? fleshDark : flesh);
  }

  // ---------------- corpo: amontoado de bolotas (cada uma com seu atraso)
  ctx.fillStyle = flesh;
  for (let i = 0; i < LUMPS.length; i++) {
    const [x, y, r] = LUMPS[i];
    const lagK = clamp(-y / H) * 0.6 + h01(i, 3) * 0.3;
    const q = jelly(c, W, H, { sx, sy, lean: lean * (1 + lagK * 0.4), extraLag: lagK })(x, y);
    const pulse = Math.sin(t * 2.2 + i * 1.3) * 4 + sing * 12 - inhale * 4 + Math.sin(TAU * (L.h - lagK * 0.3)) * 4 * L.amp;
    ctx.beginPath();
    ctx.ellipse(q.x, q.y, (r + pulse) * sx, Math.max(4, (r + pulse) * 0.85 * sy), 0, 0, TAU);
    ctx.fill();
  }
  // dobras de sombra entre as bolotas
  ctx.strokeStyle = rgba(P.dark, 0.35);
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (const [x0, y0, x1, y1] of [[-120, -130, -60, -120], [60, -125, 130, -140], [-30, -205, 30, -200], [-190, -70, -150, -80]]) {
    const a = def(x0, y0);
    const b = def(x1, y1);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + 10, b.x, b.y);
    ctx.stroke();
  }
  // veias que pulsam
  ctx.strokeStyle = rgba(P.dark, 0.45 + sing * 0.3);
  ctx.lineWidth = 3;
  for (let i = 0; i < 7; i++) {
    let x = -120 + i * 40;
    let y = -30;
    ctx.beginPath();
    let q = def(x, y);
    ctx.moveTo(q.x, q.y);
    for (let k = 0; k < 4; k++) {
      x += (h01(i, k) - 0.5) * 50;
      y -= 30 + h01(k, i) * 20;
      q = def(x, y);
      ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();
  }
  // brilho úmido
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  for (const [x, y, rx, ry, a] of [[-60, -205, 30, 11, -0.5], [40, -150, 40, 12, -0.3], [-140, -100, 18, 7, -0.8]]) {
    const q = def(x, y);
    ctx.beginPath();
    ctx.ellipse(q.x, q.y, rx * sx, ry * sy, a, 0, TAU);
    ctx.fill();
  }

  // ---------------- bocas no corpo (cantam em sequência, como um coral)
  const nM = Math.max(3, Math.round(s.feat.mouths ?? 9));
  for (let i = 0; i < Math.min(SPOTS.length, nM - 2); i++) {
    const [x, y, r] = SPOTS[i];
    const q = def(x, y);
    const wave = c.roar * sm(0.35 + i * 0.02, 0.5 + i * 0.02, p) * (1 - sm(0.8, 1, p));
    const walkChomp = L.amp * Math.max(0, Math.sin(TAU * (L.h - i * 0.13))) * 0.35;
    const open = clamp(
      0.12 + Math.max(0, Math.sin(t * 2.3 + i * 1.7)) * 0.4 + wave * 1.1 + inhale * -0.1 + c.shoot * c.jaw * 0.4 + dash * 0.8 + walkChomp + c.hit * 0.5 - dieF * 0.5,
    );
    mouth(ctx, q.x, q.y, r * (1 + wave * 0.2), open, P, st, (i === 0 ? 0.1 : (h01(i, 2) - 0.5) * 0.6) + lean * 0.002);
  }
  // cabeças-boca dos pescoços
  necks.forEach((n, j) => {
    ctx.fillStyle = j ? fleshDark : flesh;
    ctx.beginPath();
    ctx.ellipse(n.head.x + 6, n.head.y, n.r + 6, n.r, -0.2, 0, TAU);
    ctx.fill();
    // olhinho vesgo em cima da cabeça
    ctx.fillStyle = '#f4f0e0';
    ctx.beginPath();
    ctx.arc(n.head.x + 14, n.head.y - n.r * 0.8, 7, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(n.head.x + 11, n.head.y - n.r * 0.8 + 1, 3, 0, TAU);
    ctx.fill();
    mouth(ctx, n.head.x - 4, n.head.y + 2, n.r * 0.85, n.open, P, st, -0.2 - (c.swipe * sk * 0.3));
    // saliva pingando
    const dr = (t * 0.7 + j * 0.5) % 1;
    ctx.fillStyle = rgba(hurtTint(ctx, st, '#ffe14d'), 0.7 * (1 - dr));
    ctx.beginPath();
    ctx.ellipse(n.head.x - 10, n.head.y + n.r * 0.6 + dr * 30, 3, 5 + dr * 5, 0, 0, TAU);
    ctx.fill();
  });

  const front = necks[0];
  const mouthPt = c.map(front.head.x - front.r * 0.6, front.head.y);
  const hand = c.map(front.head.x - front.r * 0.8, front.head.y + 10);
  const coreP = def(0, -120);
  const core = c.map(coreP.x, coreP.y);
  const topY = Math.min(c.map(0, def(0, -290).y).y, ...necks.map((n) => c.map(n.head.x, n.head.y - n.r - 10).y));
  return { mouth: mouthPt, hand, core, top: topY, halfW: 200 * sx };
}
