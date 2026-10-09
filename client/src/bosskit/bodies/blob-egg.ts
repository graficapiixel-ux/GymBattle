/**
 * O OVO CÓSMICO — anda aos pulinhos, como feijão saltador: agacha (achata), salta
 * inclinado para a frente, pousa com baque e balança. Na morte a casca parte ao meio
 * e o vazio estrelado escapa.
 */
import type { BossSpec } from '@gymbattle/shared';
import type { Anchors, DrawState, V } from '../types';
import { h01, mixHex, rgrad, TAU, clamp, sm, rgba, tube, orb } from '../util';
import { frac, STRIDE, wob, type C } from './blob-kit';

const RX = 125;
const RY = 160;

function eggPath(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * TAU;
    const x = RX * Math.cos(a) * (1 + 0.16 * Math.sin(a));
    const y = RY * Math.sin(a);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

/** Rachaduras fixas (geradas uma vez). */
const CRACKS: V[][] = (() => {
  const out: V[][] = [];
  const origins: V[] = [{ x: -60, y: -20 }, { x: -60, y: -20 }, { x: -60, y: -20 }, { x: 40, y: 60 }, { x: 30, y: -100 }];
  const dirs = [-1.9, 0.9, -0.6, 1.4, -1.2];
  origins.forEach((o, i) => {
    const pts: V[] = [o];
    let x = o.x;
    let y = o.y;
    let a = dirs[i];
    for (let k = 0; k < 6; k++) {
      a += (h01(i, k) - 0.5) * 1.1;
      x += Math.cos(a) * 26;
      y += Math.sin(a) * 26;
      pts.push({ x, y });
    }
    out.push(pts);
  });
  return out;
})();

/** Linha da quebra na morte (zigue-zague atravessando o ovo). */
function splitPath(ctx: CanvasRenderingContext2D, upper: boolean) {
  ctx.beginPath();
  ctx.moveTo(-RX * 1.3, -10);
  for (let i = 0; i <= 10; i++) ctx.lineTo(-RX * 1.2 + i * RX * 0.24, -10 + (i % 2 ? -16 : 14) + (i - 5) * 3);
  ctx.lineTo(RX * 1.3, upper ? -RY * 1.4 : RY * 1.4);
  ctx.lineTo(-RX * 1.3, upper ? -RY * 1.4 : RY * 1.4);
  ctx.closePath();
}

export function cosmicEgg(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState, c: C): Anchors {
  const { P, body, dark, t, wu, sk, atk, L } = c;
  const p = c.p;
  const dying = st.anim === 'death';
  const dp = dying ? st.p : 0;

  // ---------------- pulinhos (locomoção): chão em h∈[0,0,35], ar no resto
  const h = L.h;
  const G = 0.35;
  const half = STRIDE / 2;
  const x0 = (half * G) / 2;
  let hx: number;
  let hy = 0;
  if (h < G) hx = L.d * (x0 - half * h);
  else {
    const k = (h - G) / (1 - G);
    hx = L.d * (-x0 + 2 * x0 * k);
    hy = -Math.sin(Math.PI * k) * (26 + 22 * st.move);
  }
  hx *= L.amp;
  hy *= L.amp;
  // agacha antes de saltar, estica no ar, achata ao pousar
  const preJump = sm(0.12, 0.33, h) * (1 - sm(0.33, 0.4, h));
  const air = h > G ? Math.sin(Math.PI * (h - G) / (1 - G)) : 0;
  let sqY = 1 - L.amp * (preJump * 0.14 + L.thud * 0.16) + L.amp * air * 0.08;
  let tilt = L.amp * L.d * (air * 0.16 - L.thud * 0.08 + wob(h, 0, 30, 9) * 0.05);

  // ---------------- idle: balanço e "chute" de dentro da casca
  const kickT = frac(t / 3.3);
  const kick = (dying ? 0 : 1) * Math.exp(-kickT * 14) * sm(0, 0.02, kickT);
  tilt += Math.sin(t * 1.3) * 0.05 * (1 - L.amp) + wob(kickT, 0.02, 34, 7) * 0.05;
  hy += -kick * 10;

  // ---------------- ataques
  const cast = c.cast;
  const levit = cast * sm(0.12, 0.42, p) * (1 - sm(0.78, 0.95, p));
  const castCrouch = cast * sm(0, 0.12, p) * (1 - sm(0.12, 0.2, p)) + cast * sm(0.9, 0.95, p) * (1 - sm(0.95, 1, p));
  hy += -levit * (70 + Math.sin(t * 3) * 8);
  sqY *= 1 - castCrouch * 0.15 + levit * 0.04;
  tilt += levit * Math.sin(t * 2.4) * 0.12 + cast * sk * -0.1;
  const roarK = c.roar;
  sqY *= 1 - roarK * wu * 0.18 + roarK * sk * 0.1;
  const shootK = c.shoot;
  tilt += shootK * (wu * 0.22 - sk * 0.3) + c.fol * 0.12 * (shootK + roarK + cast);
  tilt += c.hit * 0.25;
  sqY *= 1 - c.hit * 0.1;
  const shake = dying ? Math.sin(t * 50) * 0.06 * sm(0, 0.15, dp) * (1 - sm(0.4, 0.55, dp)) : 0;
  tilt += shake;
  // morte: tomba de lado depois de partir
  const split = dying ? sm(0.42, 0.75, dp) : 0;
  tilt += dying ? sm(0.55, 0.95, dp) * 0.5 : 0;

  const open = clamp(0.35 + st.rage * 0.4 + roarK * (wu * 0.3 + sk * 0.8) + shootK * (sm(0.3, 0.5, p) - sm(0.85, 1, p)) * 0.8 + cast * atk * 0.4 + c.hit * 0.3 + sm(0, 0.4, dp) * 0.6 + kick * 0.5);
  const pulse = 1 + roarK * sk * 0.1 + Math.sin(t * 2) * 0.012 + c.fol * 0.03 * roarK;

  // ---------------- sombra (encolhe quando sobe)
  const lift = -hy;
  ctx.fillStyle = `rgba(0,0,0,${Math.max(0.12, 0.42 - lift / 300)})`;
  ctx.beginPath();
  ctx.ellipse(hx, 2, Math.max(30, 110 - lift * 0.5), 14 - Math.min(8, lift / 20), 0, 0, TAU);
  ctx.fill();

  // aura
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  orb(ctx, hx, -RY - 10 + hy, 210 + open * 40, P.glow, 0.22 + open * 0.25 + kick * 0.3, rgba(P.glow, 0.5));
  ctx.restore();

  // ---------------- casca (pivô no fundo do ovo, que encosta no chão)
  ctx.save();
  ctx.translate(hx, hy - 4);
  ctx.rotate(tilt);
  ctx.scale((1 / Math.sqrt(Math.max(0.5, sqY))) * pulse, sqY * pulse);
  ctx.translate(0, -RY);
  let mouthL: V = { x: -74, y: -8 };
  if (split > 0.001) {
    // vazio que escapa entre as metades
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    orb(ctx, 0, -20 - split * 40, 120 + split * 120, P.accent, 0.8 * (1 - sm(0.8, 1, dp)), '#ffffff');
    ctx.restore();
    // metade de baixo fica
    ctx.save();
    splitPath(ctx, false);
    ctx.clip();
    mouthL = shell(ctx, s, st, c, open, body, dark);
    ctx.restore();
    // metade de cima voa e cai para trás
    ctx.save();
    const fall = sm(0.6, 1, dp);
    ctx.translate(split * 90 + fall * 40, -split * 120 + fall * fall * 200);
    ctx.rotate(split * 0.9 + fall * 0.8);
    splitPath(ctx, true);
    ctx.clip();
    shell(ctx, s, st, c, open, body, dark);
    ctx.restore();
  } else {
    mouthL = shell(ctx, s, st, c, open, body, dark);
  }
  const mouth = c.map(mouthL.x, mouthL.y);
  const core = c.map(0, 0);
  const topY = c.map(0, -RY - 10).y;
  ctx.restore();

  // ---------------- cascas em órbita (vêm atrasadas atrás do ovo)
  ctx.save();
  const lagX = -L.d * L.amp * 30;
  for (let i = 0; i < 6; i++) {
    const a = t * (0.5 + cast * atk * 1.5) + (i / 6) * TAU;
    const r = 175 + cast * atk * 40 + roarK * sk * 60 + split * 160;
    const ly = Math.sin(TAU * (h - 0.25 - i * 0.05)) * 10 * L.amp;
    const x = hx + lagX * (0.5 + h01(i, 4)) + Math.cos(a) * r;
    const y = -RY - 20 + hy * 0.7 + Math.sin(a) * 50 + ly + split * 120 * h01(i, 5);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a * 2);
    ctx.fillStyle = Math.sin(a) > 0 ? body : mixHex(body, dark, 0.5);
    ctx.beginPath();
    ctx.moveTo(-12, -6);
    ctx.lineTo(8, -10);
    ctx.lineTo(12, 6);
    ctx.lineTo(-6, 10);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba(P.accent, 0.6);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  return { mouth, hand: { x: mouth.x - 30, y: mouth.y + 40 }, core, top: topY, halfW: 140 };
}

/** Desenha a casca inteira (centro na origem). Devolve o ponto do olho (local). */
function shell(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState, c: C, open: number, body: string, dark: string): V {
  const { P, t } = c;
  eggPath(ctx);
  ctx.fillStyle = rgrad(ctx, -40, -50, 220, mixHex(body, '#4a4a8a', 0.3), dark);
  ctx.fill();
  ctx.save();
  ctx.clip();
  // pintas de casca
  ctx.fillStyle = rgba(P.accent, 0.08);
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    ctx.arc((h01(i, 1) - 0.5) * 220, (h01(i, 2) - 0.5) * 300, 10 + h01(i, 3) * 20, 0, TAU);
    ctx.fill();
  }
  // brilho e sombra de volume
  ctx.fillStyle = 'rgba(255,255,255,0.13)';
  ctx.beginPath();
  ctx.ellipse(-50, -90, 28, 60, 0.3, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(70, 60, 90, 120, 0.3, 0, TAU);
  ctx.fill();
  // rachaduras com céu estrelado dentro
  for (let i = 0; i < CRACKS.length; i++) {
    const cr = CRACKS[i];
    tube(ctx, cr, (q) => (1 - q) * (10 + open * 16) + 2, '#05030f');
    ctx.save();
    ctx.clip();
    const o = cr[0];
    ctx.fillStyle = rgrad(ctx, o.x, o.y, 160, mixHex(P.glow, '#1a0a4a', 0.5), '#05030f');
    ctx.fillRect(-RX * 1.2, -RY * 1.2, RX * 2.4, RY * 2.4);
    ctx.fillStyle = '#ffffff';
    for (let k = 0; k < 24; k++) ctx.fillRect(o.x + (h01(k, i) - 0.5) * 300, o.y + (h01(i, k + 50) - 0.5) * 300, 2, 2);
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(P.accent, 0.3 + open * 0.5 + 0.15 * Math.sin(t * 3 + i));
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  // fenda principal com o olho espiando
  const ex = -60;
  const ey = -20;
  const gap = 18 + open * 26;
  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(-0.2);
  ctx.beginPath();
  ctx.moveTo(-62, 0);
  for (let i = 0; i <= 8; i++) ctx.lineTo(-62 + i * 15.5, -gap * Math.sin((i / 8) * Math.PI) - (i % 2) * 5);
  for (let i = 8; i >= 0; i--) ctx.lineTo(-62 + i * 15.5, gap * Math.sin((i / 8) * Math.PI) * 0.8 + (i % 2) * 5);
  ctx.closePath();
  ctx.fillStyle = '#04020c';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#ffffff';
  for (let k = 0; k < 16; k++) ctx.fillRect((h01(k, 31) - 0.5) * 120, (h01(k, 32) - 0.5) * 60, 1.5, 1.5);
  // olho: espia em volta, mira nos golpes, fecha ao morrer
  const L = c.L;
  const dart = Math.sin(t * 0.9) * 8 + (st.anim === 'attack' ? -10 : 0) + L.d * L.amp * 6;
  const eo = st.anim === 'death' ? Math.max(0, 1 - st.p * 1.4) : Math.min(t % 5.5 < 0.15 ? 0.15 : 1, 1 - c.hit * 0.6);
  const er = 34 * (1 + c.roar * c.sk * 0.2);
  ctx.fillStyle = rgrad(ctx, 0, 0, er, mixHex(P.glow, '#ffffff', 0.3), rgba(P.glow, 0.2));
  ctx.beginPath();
  ctx.ellipse(0, 0, er, Math.max(1, 26 * eo), 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = P.accent;
  ctx.beginPath();
  ctx.arc(dart - 6, Math.sin(t * 1.3) * 3, 15 * eo + 1, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  const pupil = 3 + (c.shoot * c.atk) * 4 - c.roar * c.sk * 1.5;
  ctx.ellipse(dart - 8, Math.sin(t * 1.3) * 3, Math.max(1, pupil), Math.max(1, 12 * eo), 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(dart - 12, -5, 3, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba(P.accent, 0.6 + open * 0.4);
  ctx.lineWidth = 3;
  ctx.shadowColor = P.accent;
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();

  eggPath(ctx);
  ctx.strokeStyle = rgba(P.glow, 0.5 + open * 0.3);
  ctx.lineWidth = 4;
  ctx.stroke();
  void s;
  // ponto do olho no sistema do ovo (rotação -0,2 da fenda)
  return { x: ex - 14 * Math.cos(0.2), y: ey + 14 * Math.sin(0.2) };
}
