/** Efeitos no chão / corpo a corpo: pancada, espinhos, terremoto, onda, cauda, tentáculos, mãos, cristais, investida, garras. */
import type { FxDraw, V } from '../types';
import { crescent, groundCrack, mix, smoke, tube, win } from '../util';
import {
  R, TAU, add, boom, burst, chunks, clamp, dark, dust, easeOut, flash, groundRing, haze, hitShake, lin, lite, mark, orb, rgba, rnd, sm, span,
  stagger,
} from './common';

/** Espinho/estaca triangular saindo do chão. */
function spike(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, w: number, lean: number, c1: string, c2: string) {
  if (h <= 1) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(lean);
  const g = ctx.createLinearGradient(-w, 0, w, 0);
  g.addColorStop(0, dark(c1, 0.55));
  g.addColorStop(0.5, lite(c2, 0.3));
  g.addColorStop(0.56, c1);
  g.addColorStop(1, dark(c1, 0.7));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-w, 0);
  ctx.lineTo(-w * 0.2, -h * 0.85);
  ctx.lineTo(0, -h);
  ctx.lineTo(w * 0.25, -h * 0.8);
  ctx.lineTo(w, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgba('#ffffff', 0.7);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-w * 0.1, -h * 0.15); ctx.lineTo(0, -h * 0.96); ctx.stroke();
  ctx.restore();
}

/** PANCADA: o punho bate no chão e uma onda de choque rola para a esquerda levando pedras. */
export const slam: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const h = f.hand, G = f.ground;
  // carga no punho
  const ch = sm(0.1, 0.48, p) * (1 - sm(0.5, 0.56, p));
  ctx.save();
  add(ctx);
  orb(ctx, h.x, h.y, R(30 + ch * 60), c1, ch * 0.9, lite(c2, 0.5));
  ctx.restore();
  mark(ctx, h.x, G, 120, ch, c1, p);
  // impacto
  const k = lin(0.5, 0.75, p);
  if (k > 0 && k < 1) {
    ctx.save();
    add(ctx);
    orb(ctx, h.x, G - 20, R(120 + 180 * easeOut(k)), c1, (1 - k) * 1.1, '#ffffff');
    ctx.restore();
    groundRing(ctx, h.x, G, k, 420, c2, 16);
    chunks(ctx, h.x, G - 10, k, f.seed, dark(c1, 0.6), 12, 1.1, G);
    burst(ctx, h.x, G - 10, k, 220, f.seed + 3, c2, 14, 1.8);
  }
  // muralha de energia rolando pelo chão
  const front = lin(0.5, 0.8, p);
  if (front > 0 && front < 1) {
    const fx = mix(h.x, -150, easeOut(front));
    const a = 1 - front * 0.6;
    const hgt = 150 * (1 - front * 0.5);
    ctx.save();
    add(ctx);
    const g = ctx.createLinearGradient(fx, 0, fx + 320, 0);
    g.addColorStop(0, rgba('#ffffff', a));
    g.addColorStop(0.15, rgba(c2, a * 0.9));
    g.addColorStop(1, rgba(c1, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(fx - 30, G);
    ctx.quadraticCurveTo(fx - 10, G - hgt, fx + 50, G - hgt * 0.8);
    ctx.quadraticCurveTo(fx + 180, G - hgt * 0.25, fx + 320, G);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // pedras e poeira saindo na frente da onda
    chunks(ctx, fx + 20, G, (front * 5) % 1, f.seed + Math.floor(front * 5), dark(c1, 0.45), 6, 0.6, G);
    dust(ctx, fx + 40, G - 8, (front * 3) % 1, 60, f.seed + Math.floor(front * 3), '#9a8a78', 6, 0.5);
    groundCrack(ctx, h.x, fx, G - 2, 1, 1, f.seed, c1, 4);
  }
  // pedras saltando sob os alvos quando a onda passa
  for (let i = 0; i < f.targets.length; i++) {
    const t = f.targets[i];
    const tp = 0.5 + 0.3 * clamp(Math.log(1 + (h.x - t.x) / (h.x + 150) * 19) / Math.log(20));
    const kk = lin(tp, tp + 0.2, p);
    chunks(ctx, t.x, G, kk, f.seed + i * 9, dark(c1, 0.5), 7, 0.7, G);
    burst(ctx, t.x, G - 20, kk, 110, f.seed + i, c2, 8, 1.5);
  }
  flash(ctx, f, win(0.5, 0.52, 0.55, 0.66, p), c2, 0.35);
  return hitShake(p, 1, 0.08, 0.51);
};

/** ESPINHOS: rachaduras sob os alvos e estacas brotando em sequência. */
export const spikes: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const G = f.ground, n = f.targets.length;
  // fileira de pequenos espinhos correndo pelo chão até os alvos
  const S = span(f);
  const run = lin(0.2, 0.46, p);
  if (run > 0 && p < 0.8) {
    const fx = mix(f.hand.x, S.minX, run);
    for (let j = 0; j < 9; j++) {
      const x = mix(f.hand.x, fx, j / 8);
      const life = 1 - j / 9;
      const hh = 26 * Math.sin(life * Math.PI) * (1 - sm(0.5, 0.8, p));
      spike(ctx, x, G + 2, hh, 9, 0, c1, c2);
    }
    groundCrack(ctx, f.hand.x, fx, G - 2, 1, 1, f.seed, c1, 3);
  }
  let sh = 0;
  for (let i = 0; i < n; i++) {
    const t = f.targets[i];
    const ti = stagger(i, n, 0.48, 0.58);
    mark(ctx, t.x, G, 70, sm(0.12, 0.3, p) * (1 - sm(ti, ti + 0.02, p)), c1, p, i);
    const up = easeOut(lin(ti, ti + 0.05, p)) * (1 - sm(0.78, 0.96, p));
    if (up > 0) {
      for (let j = 0; j < 5; j++) {
        const off = (j - 2) * 22 + (rnd(f.seed, i * 5 + j) - 0.5) * 10;
        const hh = (j === 2 ? 170 : 70 + rnd(f.seed + 1, i * 5 + j) * 60) * up;
        spike(ctx, t.x + off, G + 4, hh, j === 2 ? 22 : 13, off * 0.01, c1, c2);
      }
      ctx.save();
      add(ctx);
      haze(ctx, t.x, G - 20, 90, c2, 0.5 * up * (1 - lin(ti, ti + 0.3, p)));
      ctx.restore();
    }
    const kb = lin(ti, ti + 0.25, p);
    chunks(ctx, t.x, G - 5, kb, f.seed + i, dark(c1, 0.5), 8, 0.7, G);
    burst(ctx, t.x, G - 60, kb, 130, f.seed + i * 3, c2, 9, 1.4);
    if (kb > 0 && kb < 0.2) sh = 0.7;
  }
  return Math.max(sh * (1 - sm(0.6, 0.8, p)), 0.06 * sm(0.2, 0.4, p) * (1 - sm(0.46, 0.5, p)));
};

/** TERREMOTO: chão treme, rachaduras crescem e placas de pedra saltam. */
export const quake: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const G = f.ground;
  const S = span(f);
  const x0 = f.hand.x, x1 = S.minX - 160;
  const rumble = sm(0.08, 0.45, p);
  // pedrinhas pulando durante o tremor
  ctx.save();
  ctx.fillStyle = dark(c1, 0.55);
  ctx.beginPath();
  for (let i = 0; i < 24 && p < 0.9; i++) {
    const x = mix(x1, x0, rnd(f.seed, i));
    const hop = Math.abs(Math.sin(p * 40 + i * 2.1)) * 18 * rumble;
    const r = 3 + rnd(f.seed + 1, i) * 5;
    ctx.moveTo(x + r, G - hop - r);
    ctx.arc(x, G - hop - r, R(r), 0, TAU);
  }
  ctx.fill();
  ctx.restore();
  // rachaduras principais
  const ck = sm(0.15, 0.5, p) * (1 - sm(0.85, 1, p));
  groundCrack(ctx, x0, x1, G - 2, sm(0.15, 0.5, p), 1, f.seed, c1, 4 + 3 * sm(0.48, 0.55, p));
  for (let j = 0; j < 3; j++) groundCrack(ctx, mix(x0, x1, 0.25 + j * 0.25), mix(x0, x1, 0.35 + j * 0.25), G + 14 + j * 10, sm(0.3, 0.55, p), 1, f.seed + j + 3, c1, 2.5);
  // luz saindo das fendas
  if (ck > 0) {
    ctx.save();
    add(ctx);
    const g = ctx.createLinearGradient(0, G - 120, 0, G);
    g.addColorStop(0, rgba(c1, 0));
    g.addColorStop(1, rgba(c2, 0.45 * ck * sm(0.45, 0.55, p)));
    ctx.fillStyle = g;
    ctx.fillRect(Math.min(x0, x1), G - 120, Math.abs(x0 - x1), 122);
    ctx.restore();
  }
  // placas saltando sob os alvos
  let sh = 0;
  for (let i = 0; i < f.targets.length; i++) {
    const t = f.targets[i];
    const ti = stagger(i, f.targets.length, 0.5, 0.56);
    const k = lin(ti, ti + 0.35, p);
    const jolt = Math.sin(clamp(k * 2.2) * Math.PI) * (k < 0.46 ? 1 : 0);
    if (k > 0 && k < 1) {
      for (let j = 0; j < 3; j++) {
        const w = 40 + rnd(f.seed + i, j) * 20;
        const x = t.x + (j - 1) * 46;
        const hh = jolt * (40 + rnd(f.seed + 2, i * 3 + j) * 40);
        ctx.save();
        ctx.translate(x, G);
        ctx.rotate((j - 1) * 0.25 * jolt);
        ctx.fillStyle = dark(c1, 0.6);
        ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(-w / 2 + 6, -hh - 14); ctx.lineTo(w / 2 - 4, -hh - 20); ctx.lineTo(w / 2, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = rgba(lite(c1, 0.3), 0.9);
        ctx.fillRect(-w / 2 + 6, -hh - 20, w - 10, 5);
        ctx.restore();
      }
      ctx.save();
      add(ctx);
      haze(ctx, t.x, G, 110, c2, 0.8 * (1 - k));
      ctx.restore();
      chunks(ctx, t.x, G - 10, k, f.seed + i * 4, dark(c1, 0.4), 9, 0.9, G);
      dust(ctx, t.x, G - 10, k, 70, f.seed + i, '#8a7a68', 6, 0.5);
      if (k < 0.2) sh = 1;
    }
  }
  flash(ctx, f, win(0.5, 0.52, 0.55, 0.65, p), c2, 0.2);
  return Math.max(rumble * (1 - sm(0.8, 1, p)) * (0.3 + 0.1 * Math.sin(p * 120)), sh * (1 - sm(0.62, 0.8, p)));
};

/** ONDA: uma grande onda (tsunami) varre o chão da direita para a esquerda. */
export const wave: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const G = f.ground, S = span(f);
  // a crista passa pelo meio dos alvos em p=0,55
  const xs = f.core.x + 60, xm = S.cx;
  const v = (xs - xm) / 0.17;
  const fx = p < 0.38 ? xs : xs - (p - 0.38) * v;
  const swell = sm(0.1, 0.38, p);
  const H = (atk.aoe ? 260 : 210) * swell * (1 - sm(0.7, 0.95, p) * 0.7);
  const fade = 1 - sm(0.75, 0.98, p);
  if (H > 2 && fade > 0) {
    const back = Math.max(fx + 200, f.W + 200);
    ctx.save();
    ctx.globalAlpha = fade;
    // corpo da onda
    const g = ctx.createLinearGradient(0, G - H, 0, G);
    g.addColorStop(0, rgba(lite(c2, 0.3), 0.95));
    g.addColorStop(0.35, rgba(c1, 0.9));
    g.addColorStop(1, rgba(dark(c1, 0.5), 0.9));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(fx - H * 0.15, G);
    ctx.bezierCurveTo(fx - H * 0.3, G - H * 0.5, fx - H * 0.4, G - H * 1.05, fx + H * 0.15, G - H);
    ctx.bezierCurveTo(fx + H * 0.6, G - H * 0.95, fx + H * 0.9, G - H * 0.55, fx + H * 1.6, G - H * 0.45);
    for (let x = fx + H * 1.6; x <= back; x += 60) ctx.lineTo(x, G - H * 0.45 + Math.sin(x * 0.02 + p * 20) * 10);
    ctx.lineTo(back, G);
    ctx.closePath();
    ctx.fill();
    // crista curvada e espuma
    add(ctx);
    ctx.strokeStyle = rgba('#ffffff', 0.85);
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(fx + H * 0.9, G - H * 0.6);
    ctx.bezierCurveTo(fx + H * 0.5, G - H * 1.0, fx - H * 0.3, G - H * 1.1, fx - H * 0.3, G - H * 0.6);
    ctx.stroke();
    ctx.fillStyle = rgba(lite(c2, 0.6), 0.9);
    ctx.beginPath();
    for (let i = 0; i < 26; i++) {
      const u = rnd(f.seed, i);
      const a = -Math.PI * (0.2 + u * 0.9);
      const d = H * (0.45 + rnd(f.seed + 1, i) * 0.25) + ((p * 300 + i * 13) % 40);
      const px = fx + H * 0.1 + Math.cos(a) * d, py = G - H * 0.55 + Math.sin(a) * d;
      const r = 3 + rnd(f.seed + 2, i) * 7;
      ctx.moveTo(px + r, py); ctx.arc(px, py, R(r), 0, TAU);
    }
    ctx.fill();
    haze(ctx, fx, G - H * 0.5, H, c2, 0.35);
    ctx.restore();
  }
  // respingos nos alvos quando a crista passa
  let sh = 0;
  for (let i = 0; i < f.targets.length; i++) {
    const t = f.targets[i];
    const tp = 0.38 + (xs - t.x) / v;
    const k = lin(tp, tp + 0.25, p);
    burst(ctx, t.x, t.y, k, 150, f.seed + i, lite(c2, 0.4), 12, 2.2);
    if (k > 0 && k < 0.2) sh = 0.75;
  }
  return Math.max(sh * (1 - sm(0.6, 0.85, p)), 0.15 * swell * (1 - sm(0.6, 0.9, p)));
};

/** CAUDA: varrida em arco rente ao chão, da direita para a esquerda. */
export const tail: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const G = f.ground, S = span(f);
  const x0 = f.hand.x + 40, x1 = S.minX - 160;
  // aviso: faixa baixa piscando
  const warn = sm(0.12, 0.3, p) * (1 - sm(0.42, 0.48, p));
  if (warn > 0) {
    ctx.save();
    add(ctx);
    const g = ctx.createLinearGradient(0, G - 70, 0, G);
    g.addColorStop(0, rgba(c1, 0));
    g.addColorStop(1, rgba(c1, 0.45 * warn * (0.6 + 0.4 * Math.sin(p * 70))));
    ctx.fillStyle = g;
    ctx.fillRect(x1, G - 70, x0 - x1, 70);
    ctx.restore();
  }
  // varrida: a ponta percorre um arco elíptico achatado
  const sw = lin(0.44, 0.64, p);
  const ptAt = (u: number): V => ({ x: mix(x0, x1, u), y: G - 28 - Math.sin(u * Math.PI) * 50 });
  const fade = 1 - sm(0.64, 0.88, p);
  if (sw > 0 && fade > 0) {
    const pts: V[] = [];
    const tailLen = 0.45;
    for (let j = 0; j <= 18; j++) pts.push(ptAt(Math.max(0, sw - tailLen * (1 - j / 18))));
    ctx.save();
    add(ctx);
    // rastro em meia-lua
    tube(ctx, pts, (u) => 8 + u * 70, rgba(c1, 0.55 * fade));
    tube(ctx, pts, (u) => 2 + u * 28, rgba(lite(c2, 0.5), 0.85 * fade));
    const tip = pts[pts.length - 1];
    orb(ctx, tip.x, tip.y, 70, c2, fade, '#ffffff');
    ctx.restore();
    // poeira levantada pela ponta
    dust(ctx, tip.x + 30, G - 8, (sw * 4) % 1, 50, f.seed + Math.floor(sw * 4), '#9a8a78', 6, 0.5);
  }
  let sh = 0;
  for (let i = 0; i < f.targets.length; i++) {
    const t = f.targets[i];
    const tp = 0.44 + 0.2 * clamp((x0 - t.x) / (x0 - x1));
    const k = lin(tp, tp + 0.2, p);
    boom(ctx, t.x, t.y + 15, 60, k, c1, c2, f.seed + i, 8);
    if (k > 0 && k < 0.2) sh = 0.7;
  }
  return Math.max(sh * (1 - sm(0.62, 0.8, p)), 0.04 * warn);
};

/** TENTÁCULOS: brotam do chão em volta dos alvos, se enrolam e chicoteiam. */
export const tentacles: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const G = f.ground;
  let sh = 0;
  for (let i = 0; i < f.targets.length; i++) {
    const t = f.targets[i];
    const ti = stagger(i, f.targets.length, 0.42, 0.5);
    // poça escura borbulhando
    const pool = sm(0.1, 0.35, p) * (1 - sm(0.85, 1, p));
    if (pool > 0) {
      ctx.save();
      ctx.fillStyle = rgba(dark(c1, 0.7), 0.85 * pool);
      ctx.beginPath(); ctx.ellipse(t.x, G + 2, R(80 * pool), R(16 * pool), 0, 0, TAU); ctx.fill();
      add(ctx);
      ctx.strokeStyle = rgba(c2, 0.7 * pool);
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }
    const up = easeOut(lin(ti, ti + 0.08, p)) * (1 - sm(0.8, 0.97, p));
    if (up <= 0) continue;
    const grab = sm(ti + 0.06, ti + 0.12, p);
    for (let s = -1; s <= 1; s += 2) {
      const bx = t.x + s * 48;
      const hgt = 170 * up;
      const pts: V[] = [];
      for (let j = 0; j <= 14; j++) {
        const u = j / 14;
        // sobe e curva por cima do alvo; ponta enrola ao agarrar
        const sway = Math.sin(p * 14 + i + s + u * 3) * 10 * (1 - grab);
        const curl = grab * u * u * 1.4;
        const ang = -Math.PI / 2 - s * (u * 1.1 + curl);
        const r = hgt * u;
        pts.push({ x: bx + Math.cos(ang) * r * 0.55 + sway, y: G + Math.sin(ang) * r });
      }
      const g = ctx.createLinearGradient(bx, G, bx, G - hgt);
      g.addColorStop(0, dark(c1, 0.55));
      g.addColorStop(0.6, c1);
      g.addColorStop(1, lite(c2, 0.2));
      tube(ctx, pts, (u) => 30 * (1 - u * 0.85), g);
      // ventosas brilhando
      ctx.save();
      add(ctx);
      ctx.fillStyle = rgba(c2, 0.9 * up);
      ctx.beginPath();
      for (let j = 2; j < 13; j += 2) {
        const q = pts[j], r = 4.5 * (1 - j / 16);
        ctx.moveTo(q.x + r, q.y); ctx.arc(q.x, q.y, R(r), 0, TAU);
      }
      ctx.fill();
      ctx.restore();
    }
    const kb = lin(ti + 0.08, ti + 0.3, p);
    burst(ctx, t.x, t.y, kb, 110, f.seed + i, c2, 10);
    if (kb > 0 && kb < 0.2) sh = 0.6;
    if (up > 0) chunks(ctx, t.x, G, lin(ti, ti + 0.2, p), f.seed + i * 7, dark(c1, 0.6), 6, 0.6, G);
  }
  return Math.max(sh * (1 - sm(0.62, 0.8, p)), 0.08 * sm(0.1, 0.35, p) * (1 - sm(0.42, 0.46, p)));
};

/** Mão das sombras (dedos dobram com `close`). Origem no pulso, para cima. */
function hand(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, close: number, flip: number, body: string, edge: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s * flip, s);
  ctx.fillStyle = body;
  ctx.strokeStyle = edge;
  ctx.lineWidth = 3 / s;
  ctx.lineJoin = 'round';
  // braço e palma
  ctx.beginPath();
  ctx.moveTo(-14, 60); ctx.lineTo(-18, -10); ctx.lineTo(-22, -40); ctx.lineTo(20, -44); ctx.lineTo(18, -10); ctx.lineTo(14, 60);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // dedos (garras)
  for (let i = 0; i < 4; i++) {
    const bx = -18 + i * 12.5;
    const len = [34, 42, 40, 32][i];
    const bend = close * (0.9 + i * 0.1);
    ctx.save();
    ctx.translate(bx, -42);
    ctx.rotate(-0.15 + i * 0.1 + bend * 0.5);
    ctx.beginPath();
    ctx.moveTo(-4.5, 0);
    ctx.quadraticCurveTo(-5, -len * 0.6, bend * 14, -len * (1 - bend * 0.35));
    ctx.quadraticCurveTo(5, -len * 0.5, 4.5, 0);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  // polegar
  ctx.save();
  ctx.translate(20, -18);
  ctx.rotate(0.8 - close * 1.1);
  ctx.beginPath(); ctx.moveTo(-4, 0); ctx.quadraticCurveTo(10, -10, 24, -22); ctx.quadraticCurveTo(10, -2, 4, 6); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.restore();
}

/** MÃOS DA SOMBRA: mãos escuras sobem do chão e agarram os alvos. */
export const shadowHands: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const G = f.ground;
  let sh = 0;
  for (let i = 0; i < f.targets.length; i++) {
    const t = f.targets[i];
    const pool = sm(0.08, 0.35, p) * (1 - sm(0.85, 1, p));
    if (pool > 0) {
      ctx.save();
      ctx.fillStyle = rgba(dark(c1, 0.8), 0.9 * pool);
      ctx.beginPath(); ctx.ellipse(t.x, G + 2, R(90 * pool), R(18 * pool), 0, 0, TAU); ctx.fill();
      add(ctx);
      haze(ctx, t.x, G, 90 * pool, c1, 0.5 * pool);
      ctx.restore();
    }
    const ti = stagger(i, f.targets.length, 0.38, 0.44);
    const rise = easeOut(lin(ti, ti + 0.12, p));
    const sink = sm(0.74, 0.95, p);
    const close = sm(0.5, 0.56, p);
    if (rise > 0 && sink < 1) {
      ctx.save();
      // recorte: a mão só aparece acima do chão
      ctx.beginPath(); ctx.rect(t.x - 200, G - 400, 400, 402); ctx.clip();
      const lift = (rise - sink) * 150;
      for (let s = -1; s <= 1; s += 2) {
        const sc = 1.25 + 0.15 * s;
        hand(ctx, t.x + s * 38 * (1 - close * 0.4), G + 70 - lift, sc, close, -s, dark(c1, 0.75), c2);
      }
      ctx.restore();
      ctx.save();
      add(ctx);
      haze(ctx, t.x, t.y - 20, 70, c2, 0.4 * rise * (1 - sink));
      ctx.restore();
    }
    const kb = lin(0.55, 0.75, p);
    burst(ctx, t.x, t.y - 10, kb, 90, f.seed + i, c2, 8);
    if (kb > 0 && kb < 0.2) sh = 0.55;
    if (sink > 0) smoke(ctx, t.x, t.y, 1.6, sink, f.seed + i, 'rgba(20,10,30,', 1.4);
  }
  return Math.max(sh * (1 - sm(0.62, 0.8, p)), 0.06 * sm(0.2, 0.4, p) * (1 - sm(0.5, 0.55, p)));
};

/** Cristal hexagonal pontudo. */
function crystal(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, w: number, lean: number, c1: string, c2: string, a: number) {
  if (h <= 1 || a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.translate(x, y);
  ctx.rotate(lean);
  const g = ctx.createLinearGradient(-w, 0, w, 0);
  g.addColorStop(0, rgba(c1, 0.75));
  g.addColorStop(0.45, rgba('#ffffff', 0.9));
  g.addColorStop(0.55, rgba(c2, 0.85));
  g.addColorStop(1, rgba(dark(c1, 0.3), 0.8));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-w, 0); ctx.lineTo(-w, -h * 0.75); ctx.lineTo(0, -h); ctx.lineTo(w, -h * 0.75); ctx.lineTo(w, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgba('#ffffff', 0.8);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, 0); ctx.stroke();
  ctx.restore();
}

/** CRISTAIS: prisão de cristais cresce em volta dos alvos e estilhaça. */
export const crystals: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const G = f.ground;
  let sh = 0;
  for (let i = 0; i < f.targets.length; i++) {
    const t = f.targets[i];
    mark(ctx, t.x, G, 80, sm(0.05, 0.2, p) * (1 - sm(0.3, 0.4, p)), c1, p, i);
    const grow = easeOut(lin(0.18 + i * 0.01, 0.5, p));
    const alive = 1 - sm(0.54, 0.56, p);
    if (grow > 0 && alive > 0) {
      for (let j = 0; j < 7; j++) {
        const u = j / 6;
        const off = (u - 0.5) * 120;
        const hh = (110 - Math.abs(off) * 0.6 + rnd(f.seed, i * 7 + j) * 30) * lin(u * 0.4, u * 0.4 + 0.6, grow);
        crystal(ctx, t.x + off, G + 4, hh, 12 + rnd(f.seed + 1, j) * 6, -off * 0.004, c1, c2, alive);
      }
      ctx.save();
      add(ctx);
      haze(ctx, t.x, t.y, 90, c2, 0.4 * grow * alive * (0.7 + 0.3 * Math.sin(p * 40)));
      ctx.restore();
    }
    // estilhaço
    const kb = lin(0.55, 0.85, p);
    if (kb > 0 && kb < 1) {
      chunks(ctx, t.x, t.y, kb, f.seed + i, lite(c1, 0.3), 12, 1, G);
      ctx.save();
      add(ctx);
      chunks(ctx, t.x, t.y + 20, kb, f.seed + i + 50, rgba(c2, 0.8), 8, 0.8, G);
      ctx.restore();
      boom(ctx, t.x, t.y, 90, kb, c1, c2, f.seed + i, 12);
      if (kb < 0.15) sh = 0.75;
    }
  }
  flash(ctx, f, win(0.54, 0.56, 0.58, 0.68, p), c2, 0.35);
  return Math.max(sh, 0.05 * sm(0.2, 0.5, p) * (1 - sm(0.54, 0.56, p)));
};

/** INVESTIDA: aviso no chão, linhas de velocidade, rastro e clarão de impacto. */
export const charge: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const G = f.ground, S = span(f);
  const y = f.core.y;
  const x0 = f.core.x, x1 = S.maxX + 40;
  // aviso: seta de perigo no chão
  const warn = sm(0.05, 0.2, p) * (1 - sm(0.38, 0.45, p));
  if (warn > 0) {
    ctx.save();
    add(ctx);
    ctx.fillStyle = rgba(c1, 0.35 * warn * (0.6 + 0.4 * Math.sin(p * 60)));
    ctx.fillRect(S.minX - 60, G - 6, x0 - S.minX + 60, 12);
    for (let j = 0; j < 4; j++) {
      const ax = mix(x0 - 80, S.minX, ((j / 4) + p * 2) % 1);
      ctx.beginPath(); ctx.moveTo(ax, G - 4); ctx.lineTo(ax + 40, G - 30); ctx.lineTo(ax + 40, G + 22); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  // o boss avança de 0,4 a 0,55: rastro entre a origem e a frente
  const run = easeOut(lin(0.4, 0.55, p));
  const fade = 1 - sm(0.6, 0.85, p);
  if (run > 0 && fade > 0) {
    const front = mix(x0, x1, run);
    ctx.save();
    add(ctx);
    // listras de velocidade
    ctx.lineCap = 'round';
    for (let j = 0; j < 16; j++) {
      const yy = y + (rnd(f.seed, j) - 0.5) * 260;
      const len = 120 + rnd(f.seed + 1, j) * 260;
      const sx = front + 40 + rnd(f.seed + 2, j) * 200 + ((p * 900 + j * 40) % 120);
      ctx.strokeStyle = rgba(j % 3 ? c1 : '#ffffff', 0.7 * fade);
      ctx.lineWidth = 3 + rnd(f.seed + 3, j) * 6;
      ctx.beginPath(); ctx.moveTo(sx, yy); ctx.lineTo(sx + len, yy); ctx.stroke();
    }
    // vulto/imagem fantasma
    for (let j = 0; j < 3; j++) {
      const gx = mix(x0, front, 1 - j * 0.3);
      ctx.fillStyle = rgba(c1, 0.2 * fade * (1 - j * 0.25));
      ctx.beginPath(); ctx.ellipse(gx + 60, y, R(130 * f.size * 0.8), R(140 * f.size * 0.8), 0, 0, TAU); ctx.fill();
    }
    // frente brilhante
    const g = ctx.createLinearGradient(front - 30, 0, front + 160, 0);
    g.addColorStop(0, rgba('#ffffff', 0.8 * fade));
    g.addColorStop(0.3, rgba(c2, 0.6 * fade));
    g.addColorStop(1, rgba(c1, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(front + 60, y, R(110), R(160), 0, 0, TAU); ctx.fill();
    ctx.restore();
    for (let j = 0; j < 4; j++) dust(ctx, mix(x0, front, j / 4) + 40, G - 6, ((p - 0.4) * 4 + j * 0.2) % 1, 60, f.seed + j, '#9a8a78', 5, 0.5);
  }
  // impacto nos alvos
  const kb = lin(0.54, 0.8, p);
  if (kb > 0 && kb < 1) {
    boom(ctx, x1 - 20, y + 20, 160, kb, c1, c2, f.seed, 16);
    groundRing(ctx, x1, G, kb, 380, c2, 14);
    for (let i = 0; i < f.targets.length; i++) burst(ctx, f.targets[i].x, f.targets[i].y, kb, 120, f.seed + i, c2, 8);
    chunks(ctx, x1, G - 10, kb, f.seed + 4, '#6a5a4a', 10, 1, G);
  }
  flash(ctx, f, win(0.53, 0.55, 0.57, 0.68, p), c2, 0.4);
  return Math.max(hitShake(p, 1, 0.05, 0.54), 0.25 * run * (1 - sm(0.55, 0.6, p)));
};

/** GARRAS: três rasgos gigantes cruzando os alvos. */
export const claws: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const S = span(f);
  const groups: V[] = atk.aoe ? [{ x: S.cx, y: S.cy }] : f.targets;
  const sc = atk.aoe ? Math.max(1, (S.maxX - S.minX) / 220) : 1;
  let sh = 0;
  // brilho das garras se preparando (no ponto de golpe)
  const glint = sm(0.15, 0.4, p) * (1 - sm(0.44, 0.5, p));
  if (glint > 0) {
    ctx.save();
    add(ctx);
    for (let j = 0; j < 3; j++) orb(ctx, f.hand.x - 10 + j * 14, f.hand.y - 30 + j * 16, R(22 * glint), c2, glint, '#ffffff');
    ctx.restore();
  }
  for (let gi = 0; gi < groups.length; gi++) {
    const c = groups[gi];
    for (let j = 0; j < 3; j++) {
      const t0 = 0.46 + j * 0.03 + gi * 0.01;
      const draw = easeOut(lin(t0, t0 + 0.07, p));
      const fade = 1 - lin(t0 + 0.12, 0.95, p);
      if (draw <= 0 || fade <= 0) continue;
      const off = (j - 1) * 46 * sc;
      // rasgo diagonal: do alto à direita para baixo à esquerda
      const a: V = { x: c.x + 110 * sc + off, y: c.y - 150 * sc };
      const b: V = { x: c.x - 110 * sc + off, y: c.y + 110 * sc };
      const ctl: V = { x: c.x + off - 40 * sc, y: c.y - 40 * sc };
      const pts: V[] = [];
      for (let k = 0; k <= 16; k++) {
        const u = (k / 16) * draw;
        const v = 1 - u;
        pts.push({ x: v * v * a.x + 2 * v * u * ctl.x + u * u * b.x, y: v * v * a.y + 2 * v * u * ctl.y + u * u * b.y });
      }
      ctx.save();
      add(ctx);
      const wid = (u: number) => Math.sin(Math.max(0.05, u) * Math.PI) * 34 * sc * (0.5 + 0.5 * fade);
      tube(ctx, pts, wid, rgba(c1, 0.75 * fade));
      tube(ctx, pts, (u) => wid(u) * 0.35, rgba('#ffffff', fade));
      ctx.restore();
    }
    const kb = lin(0.5, 0.72, p);
    boom(ctx, c.x, c.y, 60 * sc, kb, c1, c2, f.seed + gi, 12);
    if (kb > 0 && kb < 0.2) sh = 0.75;
  }
  if (atk.aoe) crescent(ctx, S.cx + 40, S.cy - 20, 200 * sc, 30, Math.PI * 0.8, c1, c2, win(0.48, 0.52, 0.6, 0.75, p) * 0.7);
  flash(ctx, f, win(0.48, 0.5, 0.53, 0.62, p), '#ffffff', 0.18);
  return Math.max(sh * (1 - sm(0.6, 0.78, p)), 0.04 * glint);
};
