/**
 * GLUTTONOX — massa de gosma faminta (7 olhos). Anda como lagarta de gelatina:
 * a frente se estica e gruda no chão, a traseira escorre atrás; o conteúdo
 * engolido (ossos, espada) balança com atraso lá dentro.
 */
import type { BossSpec } from '@gymbattle/shared';
import type { Anchors, DrawState, V } from '../types';
import { h01, hurtTint, mixHex, rgrad, TAU, clamp, sm, rgba, bez, tube, smoothPath } from '../util';
import { blink, eyeball, jelly, wob, type C } from './blob-kit';

const W = 190;
const H = 250;

/** Contorno de cúpula gelatinosa em repouso (origem no chão). */
function domePts(t: number, amp: number, n = 30): V[] {
  const pts: V[] = [];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI - (i / n) * Math.PI;
    const wob = Math.sin(a * 5 + t * 3) * amp + Math.sin(a * 3 - t * 2.2) * amp;
    const top = Math.pow(Math.sin(a), 0.8);
    pts.push({ x: Math.cos(a) * W * (1 + wob) * (1 + 0.08 * Math.sin(a)), y: -top * H * (1 + wob) - 6 * Math.sin(a * 2) });
  }
  return pts;
}

export function slime(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState, c: C): Anchors {
  const { P, body, dark, t, wu, sk, atk, die, L } = c;
  const p = c.p;

  // ---------------- pose do corpo (esticar/achatar/inclinar)
  const dieF = sm(0.2, 0.95, st.p) * (st.anim === 'death' ? 1 : 0);
  const convulse = st.anim === 'death' ? Math.sin(t * 26) * (1 - sm(0.15, 0.45, st.p)) * sm(0, 0.06, st.p) : 0;
  const inhale = c.roar * (sm(0.05, 0.4, p) * (1 - sm(0.45, 0.55, p)));
  const gulp = c.roar * sm(0.45, 0.55, p) * (1 - sm(0.75, 1, p));
  const spit = c.shoot * sm(0.48, 0.56, p) * (1 - sm(0.7, 0.95, p));
  const rear = c.shoot * sm(0.05, 0.4, p) * (1 - sm(0.45, 0.55, p));
  let sy = 1 + c.b * 0.03 + c.slam * (wu * 0.24 - sk * 0.3) + inhale * 0.14 - gulp * 0.06 + rear * 0.1 - spit * 0.05 + c.fol * 0.07;
  let sx = 1 - c.b * 0.02 + c.slam * (-wu * 0.1 + sk * 0.22) + inhale * 0.06 + gulp * 0.12 - rear * 0.04 + spit * 0.06 - c.fol * 0.04;
  let lean = Math.sin(t * 0.9) * 6 + c.slam * (wu * 22 - sk * 30) + inhale * 26 - gulp * 46 + rear * 34 - spit * 40 + c.fol * 18;
  // dano: empurrado para trás e amassado
  lean += c.hit * 38;
  sy *= 1 - c.hit * 0.1;
  sx *= 1 + c.hit * 0.05;
  // morte: convulsiona e derrete numa poça
  sy *= 1 - dieF * 0.82;
  sx *= 1 + dieF * 0.65;
  lean += convulse * 18;
  const def = jelly(c, W, H, { sx, sy, lean });
  const defLag = jelly(c, W, H, { sx, sy, lean: lean * 1.3, extraLag: 0.9 });

  // ---------------- chão: rastro de gosma + poça
  const lx = def(-W * L.d, 0).x;
  const fx = def(W * L.d, 0).x;
  ctx.fillStyle = rgba(P.dark, 0.55);
  ctx.beginPath();
  ctx.ellipse((lx + fx) / 2, 2, Math.abs(fx - lx) / 2 + 30 + dieF * 70, 16 + dieF * 6, 0, 0, TAU);
  ctx.fill();
  if (L.amp > 0.05) {
    // rastro molhado que fica parado no chão (atrás do sentido do movimento)
    ctx.fillStyle = rgba(P.body, 0.35 * L.amp);
    for (let i = 0; i < 5; i++) {
      const span = 260;
      const gx = ((i * 52 - L.ground) % span + span) % span;
      const x = -L.d * (W - 40 + gx);
      const fade = 1 - gx / span;
      ctx.beginPath();
      ctx.ellipse(x, 1, 18 + h01(i, 3) * 16, 4 * fade + 1, 0, 0, TAU);
      ctx.fill();
    }
  }

  // ---------------- pseudópode (slam): sobe na preparação e esmaga o chão na frente
  const podK = c.slam * sm(0.04, 0.28, p) * (1 - sm(0.78, 0.98, p));
  const down = sm(0.42, 0.53, p);
  const podBase = def(-110, -170);
  const podTipRest = { x: -150 + Math.sin(t * 3) * 8, y: -370 };
  const podHit = { x: -250, y: -12 };
  let podTip: V = {
    x: podTipRest.x + (podHit.x - podTipRest.x) * down - c.fol * 10,
    y: podTipRest.y + (podHit.y - podTipRest.y) * down + c.fol * 6,
  };
  podTip = { x: podBase.x + (podTip.x - podBase.x) * podK, y: podBase.y + (podTip.y - podBase.y) * podK };

  // ---------------- corpo
  const pts = domePts(t, 0.018 + atk * 0.015 + st.rage * 0.012 + c.hit * 0.02).map((q) => def(q.x, q.y));
  const outline = () => {
    ctx.beginPath();
    smoothPath(ctx, pts, true);
    ctx.closePath();
  };
  const top = def(0, -H);
  outline();
  ctx.fillStyle = rgrad(ctx, top.x * 0.4 - 20, -H * sy * 0.55, 230, mixHex(body, dark, 0.25), dark);
  ctx.fill();
  ctx.save();
  ctx.clip();
  // conteúdo engolido: atrasa mais que a gelatina (sloshing)
  const slosh = defLag(0, -130);
  const bodyMid = def(0, -130);
  ctx.save();
  ctx.translate(slosh.x - bodyMid.x * 0.2, 0);
  ctx.scale(1, sy);
  ctx.translate(0, (1 - sy) * 0 + dieF * 40);
  bones(ctx, t, hurtTint(ctx, st, '#e8e0c4'), (slosh.x - bodyMid.x) * 0.01);
  ctx.restore();
  // bolhas subindo
  ctx.strokeStyle = rgba(P.glow, 0.7);
  ctx.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    const k = (t * (0.12 + h01(i, 1) * 0.1 + atk * 0.2) + h01(i, 2)) % 1;
    const q = def((h01(i, 3) - 0.5) * 300 + Math.sin(t * 2 + i) * 6, -20 - k * 230);
    ctx.globalAlpha = Math.sin(k * Math.PI);
    ctx.beginPath();
    ctx.arc(q.x, q.y, 4 + h01(i, 4) * 8, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // bola de ácido subindo pela garganta (Jato Ácido)
  if (c.shoot > 0) {
    const rise = sm(0.08, 0.5, p);
    const gone = sm(0.5, 0.58, p);
    if (gone < 1) {
      const q = def(-40 - rise * 55, -30 - rise * 75);
      ctx.fillStyle = rgrad(ctx, q.x, q.y, 40 + rise * 10, rgba(P.accent, 0.95 * (1 - gone)), rgba(P.glow, 0));
      ctx.beginPath();
      ctx.arc(q.x, q.y, 40 + rise * 10, 0, TAU);
      ctx.fill();
    }
  }
  // base que "rola": calombos presos ao chão passando por baixo
  ctx.fillStyle = rgba(P.dark, 0.5);
  for (let i = 0; i < 9; i++) {
    const span = 420;
    const gx = ((i * (span / 9) - L.ground) % span + span) % span - span / 2;
    const q = def(gx, -6);
    const r = 18 + h01(i, 9) * 8;
    ctx.beginPath();
    ctx.ellipse(q.x, q.y + 6, r * 1.3, r * (0.55 + L.thud * 0.2), 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // gelatina translúcida por cima
  outline();
  ctx.fillStyle = rgrad(ctx, top.x * 0.3 - 40, -H * sy * 0.7, 250, rgba(mixHex(body, '#ffffff', 0.3), 0.6), rgba(body, 0.3));
  ctx.fill();
  ctx.strokeStyle = rgba(P.glow, 0.6 + st.rage * 0.3);
  ctx.lineWidth = 4;
  ctx.stroke();
  // reflexo interno da borda (volume)
  ctx.save();
  outline();
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 16;
  ctx.beginPath();
  smoothPath(ctx, pts.slice(3, 16), true);
  ctx.stroke();
  ctx.restore();
  // brilho especular (acompanha a deformação)
  const sp = def(-70, -200);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.ellipse(sp.x, sp.y, 34 * sx, 12 * sy, -0.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.arc(sp.x + 34 * sx, sp.y + 10, 5, 0, TAU);
  ctx.fill();

  // gotas escorrendo pela borda de baixo
  ctx.fillStyle = rgba(body, 0.85);
  for (let i = 0; i < 5; i++) {
    const k = (t * (0.35 + h01(i, 5) * 0.2) + h01(i, 6)) % 1;
    const q = def(-160 + i * 80, -36);
    ctx.beginPath();
    ctx.ellipse(q.x, q.y + k * 28, 6, 9 + k * 7, 0, 0, TAU);
    ctx.fill();
  }

  // pseudópode por cima do corpo
  if (podK > 0.02) {
    const mid = { x: (podBase.x + podTip.x) / 2, y: (podBase.y + podTip.y) / 2 };
    const pts2 = bez(podBase, { x: podBase.x - 30, y: podBase.y - 60 * podK }, { x: mid.x + 30 * (1 - down), y: mid.y - 30 }, podTip, 16);
    tube(ctx, pts2, (q) => (78 - q * 40) * Math.min(1, podK * 1.4) * (1 + down * c.fol * 0.2), rgba(mixHex(body, dark, 0.15), 0.92));
    ctx.fillStyle = rgba(mixHex(body, '#ffffff', 0.3), 0.5);
    const tipR = 36 * podK * (1 + sk * 0.5);
    ctx.beginPath();
    ctx.ellipse(podTip.x, podTip.y, tipR * (1 + down * 0.6), tipR * (1 - down * 0.4), 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba(P.glow, 0.6);
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // ---------------- boca enorme na frente (mastiga no ritmo da passada, com atraso)
  const chew = L.amp * Math.max(0, Math.sin(TAU * (L.h - 0.25))) * 0.18 + Math.max(0, Math.sin(t * 1.4)) * 0.06;
  const jaw = clamp(c.jaw + inhale * 0.5 + gulp * 0.6 + rear * -0.1 + spit * 0.8 + chew + c.hit * 0.3 + 0.1 - dieF * 0.3);
  const m0 = defLag(-95, -95);
  const mw = (60 + jaw * 22 + gulp * 20) * sx;
  const mh = Math.max(3, 8 + jaw * 52);
  ctx.save();
  ctx.translate(m0.x, m0.y);
  ctx.rotate(-0.05 - lean * 0.003);
  ctx.fillStyle = '#0c1a04';
  ctx.beginPath();
  ctx.ellipse(0, 0, mw, mh, 0, 0, TAU);
  ctx.fill();
  if (jaw > 0.2) {
    ctx.fillStyle = rgrad(ctx, 0, 0, 52, rgba(c.shoot ? P.accent : P.glow, 0.55 * jaw), rgba(P.glow, 0));
    ctx.beginPath();
    ctx.arc(0, 0, 52, 0, TAU);
    ctx.fill();
  }
  // língua
  if (jaw > 0.3) {
    ctx.fillStyle = hurtTint(ctx, st, '#c83a7a');
    ctx.beginPath();
    ctx.ellipse(8, mh * 0.55, mw * 0.5, mh * 0.3, 0, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = hurtTint(ctx, st, '#e8e8c0');
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const k = (i + 0.5) / 8;
    const x = -mw + k * mw * 2;
    const e = Math.sin(k * Math.PI) * 0.9;
    const tl = 10 + jaw * 6;
    ctx.moveTo(x - 6, -mh * e);
    ctx.lineTo(x, -mh * e + tl);
    ctx.lineTo(x + 6, -mh * e);
    ctx.moveTo(x - 6, mh * e);
    ctx.lineTo(x, mh * e - tl);
    ctx.lineTo(x + 6, mh * e);
  }
  ctx.fill();
  // baba pendurada
  const drool = (t * 0.6) % 1;
  ctx.fillStyle = rgba(P.glow, 0.8);
  ctx.beginPath();
  ctx.ellipse(-mw * 0.5, mh + 4 + drool * 22, 4, 6 + drool * 8, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  const mouthPt = c.map(m0.x - mw * 0.4, m0.y);

  // ---------------- sete olhos espalhados (balançam atrasados, cada um no seu tempo)
  const nE = Math.round(s.feat.eyes ?? 7);
  const glance = L.amp * (L.d > 0 ? 0.6 : 0) * (Math.sin(t * 0.8) > 0.3 ? 1 : 0);
  for (let i = 0; i < nE; i++) {
    const a = Math.PI * (0.2 + (i / Math.max(1, nE - 1)) * 0.6);
    const rr = 0.55 + h01(i, 7) * 0.3;
    const ex = Math.cos(a) * W * rr * 0.95 - 10;
    const ey = -Math.sin(a) * H * rr - 28;
    const lagK = 0.4 + h01(i, 11) * 0.8;
    const q0 = jelly(c, W, H, { sx, sy, lean: lean * (1 + lagK * 0.3), extraLag: lagK })(ex, ey);
    const bob = L.amp * Math.sin(TAU * (L.h - 0.2 - i * 0.06)) * 5 + Math.sin(t * 2 + i) * 2.5 + c.fol * 6 * (i % 2 ? 1 : -1);
    const r = (10 + h01(i, 8) * 12 + (i === 2 ? 8 : 0)) * (1 + inhale * 0.12);
    const ld = (h01(i, 12) - 0.5) * 0.3;
    const look = {
      x: -0.8 + glance * 1.6 + Math.sin(t * 0.7 + i) * 0.2 + ld,
      y: 0.1 + Math.sin(t * 1.1 + i * 0.5) * 0.2 + c.slam * (-wu * 0.6 + sk * 0.8),
    };
    const open = st.anim === 'death' ? Math.max(0, 1 - st.p * 1.6 + h01(i, 13) * 0.3) : Math.min(blink(t, h01(i, 9)), 1 - c.hit * 0.7 - gulp * 0.4);
    eyeball(ctx, q0.x, q0.y + bob + dieF * 10, r, P.eye, look, clamp(open), mixHex(body, dark, 0.35), 1 - L.thud * 0.12 + c.fol * 0.08);
  }

  const hand = c.map(podK > 0.02 ? podTip.x : m0.x - 40, podK > 0.02 ? podTip.y : -40);
  const core = c.map(def(0, -120).x, def(0, -120).y);
  const topY = c.map(0, Math.min(top.y, podTip.y) - 10).y;
  return { mouth: mouthPt, hand, core, top: topY, halfW: 190 * sx };
}

/** Ossos meio digeridos dentro da gosma. */
function bones(ctx: CanvasRenderingContext2D, t: number, col: string, tilt: number) {
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = col;
  ctx.strokeStyle = col;
  ctx.lineCap = 'round';
  // crânio
  ctx.save();
  ctx.translate(40 + Math.sin(t * 0.6) * 8, -130 + Math.cos(t * 0.5) * 6);
  ctx.rotate(0.4 + Math.sin(t * 0.4) * 0.2 + tilt);
  ctx.beginPath();
  ctx.arc(0, 0, 24, 0, TAU);
  ctx.fill();
  ctx.fillRect(-12, 14, 24, 14);
  ctx.fillStyle = '#1a2a10';
  ctx.beginPath();
  ctx.arc(-9, 0, 6, 0, TAU);
  ctx.arc(9, 0, 6, 0, TAU);
  ctx.fill();
  ctx.restore();
  // costelas
  ctx.lineWidth = 5;
  ctx.save();
  ctx.translate(-30, -60 + Math.sin(t * 0.7) * 5);
  ctx.rotate(-0.3 + tilt * 0.6);
  ctx.beginPath();
  ctx.moveTo(-40, 0);
  ctx.lineTo(40, 0);
  ctx.stroke();
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(-30 + i * 15, 0, 18, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }
  ctx.restore();
  // fêmur
  ctx.save();
  ctx.translate(100, -60);
  ctx.rotate(0.9 + Math.sin(t * 0.5) * 0.15 + tilt);
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(-34, 0);
  ctx.lineTo(34, 0);
  ctx.stroke();
  for (const x of [-34, 34]) {
    ctx.beginPath();
    ctx.arc(x, -5, 7, 0, TAU);
    ctx.arc(x, 5, 7, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  // espada engolida
  ctx.save();
  ctx.translate(-80, -170);
  ctx.rotate(0.7 + tilt * 1.5);
  ctx.fillStyle = '#9aa0a8';
  ctx.fillRect(-4, -40, 8, 70);
  ctx.fillStyle = '#6a4a2a';
  ctx.fillRect(-14, 30, 28, 6);
  ctx.restore();
  ctx.restore();
}


