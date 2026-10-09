/** Efeitos que caem do céu ou cobrem a área: meteoros, raios, julgamento, veneno, vórtice, nova, pétalas. */
import type { FxDraw, V } from '../types';
import { flame, mix, tube, win } from '../util';
import {
  R, TAU, add, bolt, boom, burst, chunks, dark, dust, easeOut, flash, groundRing, haze, hitShake, lin, lite, mark, orb, rgba, rnd, rockPath,
  sm, span, stagger,
} from './common';

/** METEOROS: rochas em chamas caem do céu sobre os alvos. */
export const meteor: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const G = f.ground, S = span(f);
  const nT = f.targets.length;
  const n = Math.min(12, nT + (atk.aoe ? 3 : 1));
  // céu avermelhando
  const sky = sm(0.05, 0.35, p) * (1 - sm(0.8, 1, p));
  if (sky > 0) {
    ctx.save();
    add(ctx);
    const g = ctx.createLinearGradient(0, G - 900, 0, G - 300);
    g.addColorStop(0, rgba(c1, 0.35 * sky));
    g.addColorStop(1, rgba(c1, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-f.W, G - 1600, f.W * 3, 1300);
    ctx.restore();
  }
  let sh = 0;
  for (let i = 0; i < n; i++) {
    const tgt = i < nT ? f.targets[i] : { x: mix(S.minX - 90, S.maxX + 90, rnd(f.seed + 3, i)), y: G };
    const ex = tgt.x, ey = G - 6;
    const ti = i < nT ? stagger(i, nT, 0.5, 0.58) : 0.42 + rnd(f.seed + 4, i) * 0.24;
    const t0 = ti - 0.3;
    mark(ctx, ex, G, i < nT ? 75 : 50, sm(t0 - 0.05, t0 + 0.1, p) * (1 - sm(ti, ti + 0.02, p)), c1, p, i);
    const k = lin(t0, ti, p);
    if (k > 0 && k < 1) {
      const sx = ex + 380, sy = G - 1100;
      const e = k * k;
      const x = mix(sx, ex, e), y = mix(sy, ey, e);
      const r = (i < nT ? 30 : 20) * f.size * 0.8;
      // cauda de fogo
      const dx = sx - ex, dy = sy - ey, L = Math.hypot(dx, dy);
      const tl = Math.min(260, L * e);
      const tx = x + (dx / L) * tl, ty = y + (dy / L) * tl;
      ctx.save();
      add(ctx);
      const g = ctx.createLinearGradient(x, y, tx, ty);
      g.addColorStop(0, rgba(c2, 0.95));
      g.addColorStop(0.4, rgba(c1, 0.6));
      g.addColorStop(1, rgba(c1, 0));
      tube(ctx, [{ x: tx, y: ty }, { x: mix(tx, x, 0.5), y: mix(ty, y, 0.5) }, { x, y }], (u) => r * 2.2 * u + 2, g);
      orb(ctx, x, y, r * 3, c1, 0.9, lite(c2, 0.5));
      ctx.restore();
      // rocha
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p * 8 + i);
      rockPath(ctx, r, f.seed + i);
      ctx.fillStyle = dark(c1, 0.7);
      ctx.fill();
      ctx.strokeStyle = c2;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }
    const kb = lin(ti, ti + 0.25, p);
    if (kb > 0 && kb < 1) {
      const big = i < nT ? 1 : 0.65;
      boom(ctx, ex, ey - 20, 110 * big, kb, c1, c2, f.seed + i, 10);
      groundRing(ctx, ex, G, kb, 220 * big, c2, 12);
      chunks(ctx, ex, G - 8, kb, f.seed + i * 5, dark(c1, 0.6), 8, 0.8 * big, G);
      dust(ctx, ex, G - 10, kb, 80 * big, f.seed + i, '#6a5a4a', 6, 0.5);
      if (kb < 0.15) sh = Math.max(sh, i < nT ? 0.9 : 0.5);
    }
    // chamas no chão depois
    const burn = win(ti + 0.02, ti + 0.08, 0.85, 1, p);
    if (burn > 0) {
      ctx.save();
      add(ctx);
      for (let j = 0; j < 2; j++) flame(ctx, ex + (j - 0.5) * 30, G - 6, 12, p * 30 + i + j, c2, c1, burn * 0.8);
      ctx.restore();
    }
  }
  flash(ctx, f, win(0.5, 0.52, 0.55, 0.65, p), c1, 0.3);
  return Math.max(sh * (1 - sm(0.7, 0.9, p)), 0.06 * sky);
};

/** RAIOS: nuvens escurecem, a estática junta sob os alvos e os raios caem do céu. */
export const lightning: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const G = f.ground;
  const sky = sm(0.02, 0.3, p) * (1 - sm(0.82, 1, p));
  // céu escurece
  if (sky > 0) {
    ctx.save();
    const g = ctx.createLinearGradient(0, G - 1000, 0, G - 200);
    g.addColorStop(0, rgba(dark(c1, 0.85), 0.6 * sky));
    g.addColorStop(1, rgba(dark(c1, 0.85), 0));
    ctx.fillStyle = g;
    ctx.fillRect(-f.W, G - 2000, f.W * 3, 1800);
    // nuvens com clarões internos
    add(ctx);
    for (let i = 0; i < 6; i++) {
      const cx = f.W * (0.05 + i * 0.18), cy = G - 760 + rnd(f.seed, i) * 60;
      haze(ctx, cx, cy, 200, c1, sky * (0.12 + 0.25 * Math.max(0, Math.sin(p * 50 + i * 2))));
    }
    ctx.restore();
  }
  let sh = 0;
  for (let i = 0; i < f.targets.length; i++) {
    const t = f.targets[i];
    const ti = stagger(i, f.targets.length, 0.5, 0.57);
    // estática juntando
    const st = sm(0.15, 0.4, p) * (1 - sm(ti, ti + 0.02, p));
    mark(ctx, t.x, G, 70, st, c1, p, i);
    if (st > 0) {
      for (let j = 0; j < 2; j++) {
        const fr = Math.floor(p * 30) + j;
        const a: V = { x: t.x + (rnd(f.seed + fr, j) - 0.5) * 100, y: G - 2 };
        bolt(ctx, a, { x: a.x + (rnd(f.seed + fr, j + 7) - 0.5) * 60, y: G - 40 - rnd(f.seed + fr, j + 9) * 50 }, f.seed + fr * 3 + j, 2, c2, st * 0.8, 0);
      }
    }
    // relâmpago principal (pisca e repete)
    const k = lin(ti, ti + 0.18, p);
    if (k > 0 && k < 1) {
      const flick = k < 0.15 ? 1 : (Math.floor(p * 60 + i) % 3 === 0 ? 0.9 : 0.25) * (1 - k);
      const top: V = { x: t.x + 60 + (rnd(f.seed, i) - 0.5) * 120, y: G - 1100 };
      const fr = Math.floor(p * 20);
      bolt(ctx, top, { x: t.x, y: G - 4 }, f.seed + i * 13 + fr, 9 * (1 - k * 0.5), c1, flick, 3);
      ctx.save();
      add(ctx);
      orb(ctx, t.x, G - 20, 140 * (1 - k * 0.5), c1, flick, '#ffffff');
      ctx.restore();
      groundRing(ctx, t.x, G, k, 200, c2, 10);
      burst(ctx, t.x, G - 10, k, 160, f.seed + i, c2, 10, 1.8);
      if (k < 0.15) sh = 0.9;
    }
  }
  flash(ctx, f, win(0.5, 0.51, 0.53, 0.6, p) + win(0.58, 0.59, 0.6, 0.64, p) * 0.6, lite(c1, 0.5), 0.5);
  return Math.max(sh * (1 - sm(0.66, 0.8, p)), 0.05 * sky);
};

/** Círculo rúnico leve (sem sombra), achatado. */
function runeCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, tilt: number, rot: number, color: string, a: number) {
  if (a <= 0 || r <= 1) return;
  ctx.save();
  add(ctx);
  ctx.translate(x, y);
  ctx.scale(1, tilt);
  ctx.globalAlpha = Math.min(1, a);
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(0, 0, R(r), 0, TAU); ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, R(r * 0.8), 0, TAU); ctx.stroke();
  ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) {
    const ax = Math.cos((i / 6) * TAU) * r * 0.8, ay = Math.sin((i / 6) * TAU) * r * 0.8;
    if (i === 0) ctx.moveTo(ax, ay); else ctx.lineTo(ax, ay);
  }
  for (let i = 0; i < 3; i++) {
    const a0 = (i / 3) * TAU, a1 = a0 + TAU / 3 * 1.5;
    ctx.moveTo(Math.cos(a0) * r * 0.8, Math.sin(a0) * r * 0.8);
    ctx.lineTo(Math.cos(a1) * r * 0.8, Math.sin(a1) * r * 0.8);
  }
  // marcas de runa
  for (let i = 0; i < 12; i++) {
    const an = (i / 12) * TAU;
    ctx.moveTo(Math.cos(an) * r * 0.84, Math.sin(an) * r * 0.84);
    ctx.lineTo(Math.cos(an) * r * 0.96, Math.sin(an) * r * 0.96);
  }
  ctx.stroke();
  haze(ctx, 0, 0, r, color, 0.35);
  ctx.restore();
}

/** JULGAMENTO: círculos sagrados sobre os alvos e pilares de luz descendo. */
export const judgement: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const G = f.ground;
  let sh = 0;
  for (let i = 0; i < f.targets.length; i++) {
    const t = f.targets[i];
    const ti = stagger(i, f.targets.length, 0.5, 0.56);
    const circ = sm(0.08, 0.35, p) * (1 - sm(0.8, 0.98, p));
    const top = G - 380;
    runeCircle(ctx, t.x, top, 90 * circ, 0.28, p * 4 + i, c1, circ);
    runeCircle(ctx, t.x, G, 80 * circ, 0.28, -p * 5 - i, c2, circ * (1 - sm(ti, ti + 0.25, p) * 0.5));
    // fio de luz fino antes da queda
    const pre = sm(0.25, 0.45, p) * (1 - sm(ti, ti + 0.01, p));
    if (pre > 0) {
      ctx.save();
      add(ctx);
      ctx.fillStyle = rgba(c2, 0.5 * pre * (0.6 + 0.4 * Math.sin(p * 80 + i)));
      ctx.fillRect(t.x - 3, top, 6, G - top);
      ctx.restore();
    }
    // pilar
    const k = lin(ti - 0.02, ti + 0.3, p);
    if (k > 0 && k < 1) {
      const drop = easeOut(lin(ti - 0.02, ti, p));
      const w = 55 * (1 - k * 0.7) * (0.6 + drop * 0.4);
      const yTop = G - 1400;
      const yBot = mix(top, G, drop);
      ctx.save();
      add(ctx);
      const g = ctx.createLinearGradient(t.x - w, 0, t.x + w, 0);
      g.addColorStop(0, rgba(c1, 0));
      g.addColorStop(0.3, rgba(c1, 0.75 * (1 - k)));
      g.addColorStop(0.5, rgba('#ffffff', 1 - k * 0.8));
      g.addColorStop(0.7, rgba(c1, 0.75 * (1 - k)));
      g.addColorStop(1, rgba(c1, 0));
      ctx.fillStyle = g;
      ctx.fillRect(t.x - w, yTop, w * 2, yBot - yTop);
      orb(ctx, t.x, yBot - 10, w * 3, c2, 1 - k, '#ffffff');
      ctx.restore();
      if (drop >= 1) {
        groundRing(ctx, t.x, G, lin(ti, ti + 0.3, p), 240, c2, 12);
        burst(ctx, t.x, G - 20, lin(ti, ti + 0.3, p), 170, f.seed + i, c2, 12, 1.4);
      }
      if (k > 0.06 && k < 0.2) sh = 0.85;
    }
    // partículas subindo da luz
    if (p > ti && p < 0.95) {
      ctx.save();
      add(ctx);
      ctx.fillStyle = rgba(lite(c2, 0.5), 0.9 * (1 - sm(0.75, 0.95, p)));
      for (let j = 0; j < 8; j++) {
        const q = (rnd(f.seed + i, j) + p * 1.6) % 1;
        ctx.fillRect(t.x + (rnd(f.seed + 1 + i, j) - 0.5) * 80, G - q * 260, 4, 8);
      }
      ctx.restore();
    }
  }
  flash(ctx, f, win(0.5, 0.52, 0.55, 0.66, p), lite(c1, 0.6), 0.45);
  return Math.max(sh * (1 - sm(0.66, 0.82, p)), 0.04 * sm(0.1, 0.4, p));
};

/** VENENO: nuvem tóxica sai do boss, cobre os alvos e borbulha. */
export const poison: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const G = f.ground, S = span(f);
  const o = f.from;
  // jorro de nuvem saindo da boca
  const spew = sm(0.08, 0.2, p) * (1 - sm(0.42, 0.52, p));
  ctx.save();
  for (let i = 0; i < 12 && spew > 0; i++) {
    const q = (rnd(f.seed, i) + p * 2.6) % 1;
    const x = mix(o.x, S.cx, q), y = mix(o.y, S.cy - 30, q) - Math.sin(q * Math.PI) * 60 + (rnd(f.seed + 1, i) - 0.5) * 40 * q;
    const r = 20 + q * 50;
    const g = ctx.createRadialGradient(x, y, 0, x, y, R(r));
    g.addColorStop(0, rgba(c2, 0.55 * spew));
    g.addColorStop(1, rgba(c1, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, R(r), 0, TAU); ctx.fill();
  }
  ctx.restore();
  // nuvem grande sobre a área
  const cloud = sm(0.3, 0.55, p) * (1 - sm(0.82, 1, p));
  const w = (S.maxX - S.minX) / 2 + (atk.aoe ? 130 : 100);
  if (cloud > 0) {
    ctx.save();
    for (let i = 0; i < 16; i++) {
      const u = rnd(f.seed + 2, i);
      const x = S.cx + (u - 0.5) * 2 * w + Math.sin(p * 6 + i) * 18;
      const y = G - 30 - rnd(f.seed + 3, i) * 160 - Math.cos(p * 5 + i) * 10;
      const r = (60 + rnd(f.seed + 4, i) * 50) * (0.6 + 0.4 * cloud) * (1 + sm(0.5, 0.58, p) * 0.25);
      const g = ctx.createRadialGradient(x, y, 0, x, y, R(r));
      g.addColorStop(0, rgba(i % 3 ? c1 : c2, 0.5 * cloud));
      g.addColorStop(0.6, rgba(dark(c1, 0.3), 0.3 * cloud));
      g.addColorStop(1, rgba(c1, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, R(r), 0, TAU); ctx.fill();
    }
    // bolhas subindo e estourando
    add(ctx);
    ctx.lineWidth = 3;
    for (let i = 0; i < 22; i++) {
      const q = (rnd(f.seed + 5, i) + p * 1.8) % 1;
      const x = S.cx + (rnd(f.seed + 6, i) - 0.5) * 2 * w;
      const y = G - 5 - q * 200;
      const r = 4 + rnd(f.seed + 7, i) * 9;
      ctx.strokeStyle = rgba(lite(c2, 0.3), cloud * (1 - q));
      ctx.beginPath(); ctx.arc(x, y, R(q > 0.85 ? r * (1 + (q - 0.85) * 10) : r), 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
  // pulso tóxico no dano
  for (let i = 0; i < f.targets.length; i++) {
    const t = f.targets[i];
    const k = lin(0.52, 0.75, p);
    ctx.save();
    add(ctx);
    if (k > 0 && k < 1) orb(ctx, t.x, t.y, 70 * (1 + k), c2, (1 - k) * 0.8);
    ctx.restore();
    burst(ctx, t.x, t.y, k, 90, f.seed + i, c2, 7);
  }
  flash(ctx, f, win(0.5, 0.53, 0.56, 0.68, p), c1, 0.2);
  return Math.max(hitShake(p, 0.4), 0.05 * cloud);
};

/** VÓRTICE: redemoinho puxando partículas para dentro e implodindo. */
export const vortex: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const S = span(f);
  const cx = S.cx, cy = S.cy - 20;
  const Rr = atk.aoe ? (S.maxX - S.minX) / 2 + 140 : 150;
  const grow = sm(0.05, 0.35, p);
  const collapse = sm(0.45, 0.53, p);
  const live = grow * (1 - collapse);
  const rot = p * 14;
  ctx.save();
  add(ctx);
  if (live > 0.01) {
    // disco escuro no centro com halo
    haze(ctx, cx, cy, Rr * live, c1, 0.35 * live);
    // braços espirais
    for (let a = 0; a < 4; a++) {
      const pts: V[] = [];
      for (let j = 0; j <= 18; j++) {
        const u = j / 18;
        const ang = rot + (a / 4) * TAU + u * 4;
        const r = Rr * live * (1 - u * 0.92);
        pts.push({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r * 0.5 });
      }
      tube(ctx, pts, (u) => 4 + u * 18 * live, rgba(a % 2 ? c1 : c2, 0.75 * live));
    }
    // partículas sendo sugadas
    ctx.fillStyle = rgba(lite(c2, 0.4), live);
    ctx.beginPath();
    for (let i = 0; i < 40; i++) {
      const q = (rnd(f.seed, i) + p * 2.4) % 1;
      const r = Rr * 1.5 * (1 - q) + 10;
      const ang = rnd(f.seed + 1, i) * TAU + q * 6 + rot * 0.5;
      const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r * 0.5;
      const s = 3 + 4 * q;
      ctx.moveTo(x + s, y); ctx.arc(x, y, R(s), 0, TAU);
    }
    ctx.fill();
    orb(ctx, cx, cy, 40 * live, dark(c1, 0.5), live, c2);
  }
  // implosão: colapsa num ponto e explode
  const pt = sm(0.45, 0.53, p) * (1 - sm(0.53, 0.56, p));
  orb(ctx, cx, cy, 60 + 40 * pt, '#ffffff', pt, '#ffffff');
  ctx.restore();
  const kb = lin(0.54, 0.85, p);
  boom(ctx, cx, cy, Rr * 0.8, kb, c1, c2, f.seed, 16);
  groundRing(ctx, cx, f.ground, kb, Rr * 2, c2, 14);
  for (let i = 0; i < f.targets.length; i++) burst(ctx, f.targets[i].x, f.targets[i].y, lin(0.55, 0.75, p), 90, f.seed + i, c2, 6);
  flash(ctx, f, win(0.53, 0.55, 0.57, 0.68, p), c2, 0.4);
  return Math.max(hitShake(p, 0.85, 0.05, 0.54), 0.12 * live);
};

/** NOVA: energia se acumula no corpo e explode num anel enorme pela arena. */
export const nova: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const o = f.core, G = f.ground;
  const ch = sm(0.03, 0.48, p) * (1 - sm(0.5, 0.53, p));
  ctx.save();
  add(ctx);
  // partículas convergindo
  if (ch > 0) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(lite(c2, 0.3), ch);
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let i = 0; i < 26; i++) {
      const a = rnd(f.seed, i) * TAU;
      const q = (rnd(f.seed + 1, i) + p * 3.4) % 1;
      const d = 40 + (1 - q) * 360;
      ctx.moveTo(o.x + Math.cos(a) * d, o.y + Math.sin(a) * d);
      ctx.lineTo(o.x + Math.cos(a) * (d + 40), o.y + Math.sin(a) * (d + 40));
    }
    ctx.stroke();
    const pulse = 1 + 0.1 * Math.sin(p * 80);
    orb(ctx, o.x, o.y, (60 + ch * 120) * pulse, c1, ch, '#ffffff');
    ctx.strokeStyle = rgba(c2, ch * 0.8);
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(o.x, o.y, R((100 + 80 * ch) * pulse), 0, TAU); ctx.stroke();
  }
  ctx.restore();
  // aviso no chão de toda a arena
  const warn = sm(0.2, 0.4, p) * (1 - sm(0.48, 0.52, p));
  if (warn > 0) {
    ctx.save();
    add(ctx);
    const g = ctx.createLinearGradient(0, G - 60, 0, G);
    g.addColorStop(0, rgba(c1, 0));
    g.addColorStop(1, rgba(c1, 0.4 * warn * (0.6 + 0.4 * Math.sin(p * 70))));
    ctx.fillStyle = g;
    ctx.fillRect(-f.W, G - 60, f.W * 3, 60);
    ctx.restore();
  }
  // explosão: esfera e anel no chão
  const k = lin(0.5, 0.82, p);
  if (k > 0 && k < 1) {
    const e = easeOut(k);
    const r = 80 + e * f.W * 1.1;
    ctx.save();
    add(ctx);
    const g = ctx.createRadialGradient(o.x, o.y, R(r * 0.7), o.x, o.y, R(r));
    g.addColorStop(0, rgba(c1, 0));
    g.addColorStop(0.8, rgba(c1, 0.55 * (1 - k)));
    g.addColorStop(0.95, rgba('#ffffff', 0.85 * (1 - k)));
    g.addColorStop(1, rgba(c2, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(o.x, o.y, R(r), 0, TAU); ctx.fill();
    orb(ctx, o.x, o.y, 260 * (1 - k) + 40, c2, 1 - k, '#ffffff');
    ctx.restore();
    groundRing(ctx, o.x, G, k, f.W * 1.2, c2, 20);
    burst(ctx, o.x, o.y, k, 600, f.seed, c2, 20);
    for (let i = 0; i < f.targets.length; i++) chunks(ctx, f.targets[i].x, G - 6, lin(0.55, 0.8, p), f.seed + i, dark(c1, 0.5), 5, 0.6, G);
  }
  flash(ctx, f, win(0.5, 0.51, 0.55, 0.7, p), lite(c1, 0.5), 0.6);
  return Math.max(hitShake(p, 1, 0.12, 0.51), 0.15 * ch);
};

/** PÉTALAS: tempestade de pétalas/penas/folhas girando e cortando. */
export const petals: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const S = span(f);
  const on = sm(0.08, 0.25, p) * (1 - sm(0.8, 0.97, p));
  // o redemoinho anda do boss até os alvos e fica girando sobre eles
  const mv = easeOut(lin(0.1, 0.5, p));
  const cx = mix(f.from.x, S.cx, mv), cy = mix(f.from.y, S.cy - 20, mv);
  const w = (atk.aoe ? (S.maxX - S.minX) / 2 + 110 : 110) * (0.5 + 0.5 * mv);
  const n = 64;
  ctx.save();
  for (let i = 0; i < n && on > 0; i++) {
    const r0 = rnd(f.seed, i);
    const ang = r0 * TAU + p * (6 + rnd(f.seed + 1, i) * 6);
    const rad = w * (0.3 + rnd(f.seed + 2, i) * 0.8);
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad * 0.45 + (rnd(f.seed + 3, i) - 0.5) * 120;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang * 2 + i);
    ctx.scale(1, 0.35 + 0.65 * Math.abs(Math.sin(p * 20 + i)));
    ctx.fillStyle = rgba(i % 3 ? c1 : c2, on * 0.95);
    ctx.beginPath();
    ctx.moveTo(-12, 0); ctx.quadraticCurveTo(0, -9, 12, 0); ctx.quadraticCurveTo(0, 9, -12, 0);
    ctx.fill();
    ctx.restore();
  }
  // vento: arcos claros
  add(ctx);
  ctx.lineCap = 'round';
  for (let j = 0; j < 5 && on > 0; j++) {
    const a0 = p * 9 + j * 1.3;
    ctx.strokeStyle = rgba(lite(c2, 0.5), on * 0.4);
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(cx, cy, R(w * (0.6 + j * 0.15)), R(w * 0.3 * (0.6 + j * 0.15)), 0, a0, a0 + 1.5); ctx.stroke();
  }
  ctx.restore();
  // cortes rápidos sobre cada alvo
  let sh = 0;
  for (let i = 0; i < f.targets.length; i++) {
    const t = f.targets[i];
    for (let j = 0; j < 3; j++) {
      const t0 = 0.48 + j * 0.035 + i * 0.008;
      const k = lin(t0, t0 + 0.08, p);
      if (k <= 0 || k >= 1) continue;
      const a = rnd(f.seed + i, j) * Math.PI;
      const L = 90;
      const dx = Math.cos(a) * L, dy = Math.sin(a) * L;
      ctx.save();
      add(ctx);
      ctx.lineCap = 'round';
      const u0 = Math.max(0, k * 1.6 - 0.6), u1 = Math.min(1, k * 1.6);
      ctx.strokeStyle = rgba(c2, 1 - k);
      ctx.lineWidth = 10 * (1 - k);
      ctx.beginPath(); ctx.moveTo(t.x - dx + 2 * dx * u0, t.y - dy + 2 * dy * u0); ctx.lineTo(t.x - dx + 2 * dx * u1, t.y - dy + 2 * dy * u1); ctx.stroke();
      ctx.strokeStyle = rgba('#ffffff', 1 - k);
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
      if (j === 0 && k < 0.3) sh = 0.45;
    }
  }
  return Math.max(sh, on * 0.08);
};
