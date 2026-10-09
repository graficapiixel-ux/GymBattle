/** Efeitos à distância: sopro, raio, olhar, grito, rugido, metralhadora, mísseis, orbes, drenar. */
import type { FxDraw, V } from '../types';
import { flame, mix, smoke, speedLines, tube, win } from '../util';
import {
  R, TAU, add, boom, burst, clamp, dark, dust, easeOut, flash, glowLine, haze, hitShake, lin, lite, mark, orb, qb,
  rgba, rnd, sm, span, stagger,
} from './common';

/** SOPRO: cone de fogo/gelo/vazio saindo da boca e varrendo os alvos. */
export const breath: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const S = span(f);
  const on = sm(0.18, 0.3, p) * (1 - sm(0.78, 0.92, p));
  // carga na boca
  const charge = sm(0, 0.25, p) * (1 - sm(0.3, 0.45, p));
  ctx.save();
  add(ctx);
  orb(ctx, f.from.x, f.from.y, R(20 + charge * 40), c1, charge + on * 0.6, lite(c2, 0.6));
  // varredura: da direita para a esquerda dos alvos
  const sw = sm(0.25, 0.75, p);
  const ax = atk.aoe ? mix(S.maxX + 70, S.minX - 70, sw) : S.cx + Math.sin(p * 18) * 25;
  const aim: V = { x: ax, y: f.ground - 40 };
  const dx = aim.x - f.from.x, dy = aim.y - f.from.y, L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const reach = L * 1.1 * sm(0.18, 0.42, p);
  const wide = atk.aoe ? 0.5 : 0.32;
  if (on > 0 && reach > 1) {
    // corpo do cone (gradiente ao longo do sopro)
    const g = ctx.createLinearGradient(f.from.x, f.from.y, f.from.x + ux * reach, f.from.y + uy * reach);
    g.addColorStop(0, rgba('#ffffff', 0.8 * on));
    g.addColorStop(0.2, rgba(c2, 0.7 * on));
    g.addColorStop(0.7, rgba(c1, 0.5 * on));
    g.addColorStop(1, rgba(c1, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(f.from.x + nx * 10, f.from.y + ny * 10);
    ctx.quadraticCurveTo(f.from.x + ux * reach * 0.6 + nx * reach * wide * 0.7, f.from.y + uy * reach * 0.6 + ny * reach * wide * 0.7, f.from.x + ux * reach + nx * reach * wide * 0.55, f.from.y + uy * reach + ny * reach * wide * 0.55);
    ctx.lineTo(f.from.x + ux * reach - nx * reach * wide * 0.55, f.from.y + uy * reach - ny * reach * wide * 0.55);
    ctx.quadraticCurveTo(f.from.x + ux * reach * 0.6 - nx * reach * wide * 0.7, f.from.y + uy * reach * 0.6 - ny * reach * wide * 0.7, f.from.x - nx * 10, f.from.y - ny * 10);
    ctx.fill();
    // labaredas correndo dentro do cone
    for (let i = 0; i < 46; i++) {
      const u = (rnd(f.seed, i) + p * 3.2 * (0.8 + rnd(f.seed + 1, i) * 0.5)) % 1;
      const d = u * reach;
      const off = (rnd(f.seed + 2, i) - 0.5) * d * wide * 1.1 + Math.sin(p * 30 + i) * 6;
      const px = f.from.x + ux * d + nx * off, py = f.from.y + uy * d + ny * off;
      const r = 8 + u * 34;
      orb(ctx, px, py, r, i % 3 ? c1 : c2, on * (1 - u * 0.7) * 0.7, u < 0.35 ? '#ffffff' : lite(c2, 0.3));
    }
    // onde o sopro toca o chão
    orb(ctx, aim.x, f.ground - 10, 90, c1, on * 0.6, c2);
  }
  ctx.restore();
  // chamas/geada que ficam nos alvos
  for (let i = 0; i < f.targets.length; i++) {
    const t = f.targets[i];
    const hit = atk.aoe ? sm(0.25, 0.75, p) > (S.maxX + 70 - t.x) / (S.maxX - S.minX + 140) : p > 0.45;
    const k = hit ? win(0.4, 0.5, 0.82, 1, p) : 0;
    if (k > 0) {
      ctx.save();
      add(ctx);
      for (let j = 0; j < 3; j++) flame(ctx, t.x + (j - 1) * 18, f.ground - 6, R(12 + 6 * rnd(f.seed + 9, i * 3 + j)) * k, p * 30 + j, c2, c1, k * 0.85);
      ctx.restore();
    }
  }
  flash(ctx, f, win(0.5, 0.55, 0.58, 0.68, p), c1, 0.25);
  return Math.max(on * 0.22, hitShake(p, 0.6));
};

/** RAIO: orbe carregando e laser grosso até os alvos. */
export const beam: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const o = f.from;
  const charge = sm(0.02, 0.45, p);
  const fire = sm(0.46, 0.5, p) * (1 - sm(0.74, 0.9, p));
  ctx.save();
  add(ctx);
  // partículas convergindo para a orbe
  if (p < 0.5) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(lite(c2, 0.3), 0.8 * charge);
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 18; i++) {
      const a = rnd(f.seed, i) * TAU;
      const q = (rnd(f.seed + 1, i) + p * 3) % 1;
      const d = (1 - q) * 170 + 20;
      ctx.moveTo(o.x + Math.cos(a) * d, o.y + Math.sin(a) * d);
      ctx.lineTo(o.x + Math.cos(a) * (d + 26), o.y + Math.sin(a) * (d + 26));
    }
    ctx.stroke();
  }
  const pulse = 1 + Math.sin(p * 90) * 0.12;
  orb(ctx, o.x, o.y, R((24 + charge * 60) * pulse * (1 - 0.4 * sm(0.85, 1, p))), c1, Math.max(charge * (1 - sm(0.8, 0.95, p)), fire), '#ffffff');
  ctx.restore();
  // feixes
  if (fire > 0) {
    const w = (atk.aoe ? 20 : 34) * fire * pulse;
    for (let i = 0; i < f.targets.length; i++) {
      const t = f.targets[i];
      const len = sm(0.46, 0.52, p);
      const end = { x: mix(o.x, t.x, len), y: mix(o.y, t.y, len) };
      glowLine(ctx, [o, end], w, c1, fire);
      // filete ondulado em volta
      const pts: V[] = [];
      for (let j = 0; j <= 12; j++) {
        const u = j / 12;
        pts.push({ x: mix(o.x, end.x, u), y: mix(o.y, end.y, u) + Math.sin(u * 14 - p * 60 + i) * w * 0.7 });
      }
      glowLine(ctx, pts, 3, c2, fire * 0.8);
      ctx.save();
      add(ctx);
      orb(ctx, end.x, end.y, R(w * 3.2), c2, fire, '#ffffff');
      ctx.restore();
      burst(ctx, end.x, end.y, (p * 6 + i * 0.3) % 1, 90, f.seed + i * 7 + Math.floor(p * 6), c2, 8);
    }
  }
  for (let i = 0; i < f.targets.length; i++) boom(ctx, f.targets[i].x, f.targets[i].y, 70, lin(0.5, 0.72, p), c1, c2, f.seed + i);
  flash(ctx, f, win(0.46, 0.5, 0.52, 0.64, p), c2, 0.35);
  return Math.max(fire * 0.3, hitShake(p, 0.75, 0.08));
};

/** OLHAR: o olho acende e um laser fino varre o chão, deixando um rastro queimado. */
export const gaze: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const S = span(f);
  const eye = sm(0, 0.35, p) * (1 - sm(0.82, 1, p));
  const x0 = S.maxX + 120, x1 = S.minX - 120;
  const sweep = lin(0.42, 0.72, p);
  const fire = sm(0.4, 0.44, p) * (1 - sm(0.72, 0.8, p));
  const gx = mix(x0, x1, sweep);
  ctx.save();
  add(ctx);
  // olho brilhando (íris e pupila de luz)
  ctx.save();
  ctx.translate(f.from.x, f.from.y);
  const er = 34 + eye * 22;
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R(er * 2.4));
  g.addColorStop(0, rgba('#ffffff', eye));
  g.addColorStop(0.25, rgba(c1, eye * 0.9));
  g.addColorStop(1, rgba(c1, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, R(er * 2.4), R(er * 1.3), 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = rgba(c2, eye);
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.ellipse(0, 0, R(er * 1.25), R(er * 0.6 * (0.3 + eye * 0.7)), 0, 0, TAU); ctx.stroke();
  // raios de mira
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + p * 4;
    ctx.strokeStyle = rgba(c2, eye * 0.5);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * er * 1.6, Math.sin(a) * er * 0.9); ctx.lineTo(Math.cos(a) * er * 2.6, Math.sin(a) * er * 1.4); ctx.stroke();
  }
  ctx.restore();
  // aviso: linha no chão por onde vai passar
  const warn = sm(0.12, 0.3, p) * (1 - sm(0.4, 0.46, p));
  if (warn > 0) {
    ctx.strokeStyle = rgba(c1, warn * (0.6 + 0.4 * Math.sin(p * 80)));
    ctx.lineWidth = 6;
    ctx.setLineDash([22, 14]);
    ctx.beginPath(); ctx.moveTo(x0, f.ground - 2); ctx.lineTo(x1, f.ground - 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  // rastro queimado
  const tr = sm(0.42, 0.46, p) * (1 - sm(0.7, 1, p));
  if (tr > 0 && sweep > 0) {
    const gr = ctx.createLinearGradient(x0, 0, gx, 0);
    gr.addColorStop(0, rgba(c1, 0.1 * tr));
    gr.addColorStop(1, rgba(c2, 0.9 * tr));
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.ellipse((x0 + gx) / 2, f.ground - 2, R(Math.abs(x0 - gx) / 2), 9, 0, 0, TAU); ctx.fill();
    for (let i = 0; i < 10; i++) {
      const u = i / 10;
      const px = mix(x0, gx, u);
      haze(ctx, px, f.ground - 10 - rnd(f.seed, i) * 20, 22, c1, tr * 0.5 * (0.5 + 0.5 * Math.sin(p * 50 + i)));
    }
  }
  ctx.restore();
  if (fire > 0) {
    const hit = { x: gx, y: f.ground - 6 };
    glowLine(ctx, [f.from, hit], 16 * fire, c1, fire);
    ctx.save();
    add(ctx);
    orb(ctx, hit.x, hit.y, 70, c1, fire, '#ffffff');
    ctx.restore();
    burst(ctx, hit.x, hit.y, (p * 9) % 1, 120, f.seed + Math.floor(p * 9), c2, 10, 1.6);
  }
  // explosões quando o laser passa por cada alvo
  let sh = fire * 0.25;
  for (let i = 0; i < f.targets.length; i++) {
    const t = f.targets[i];
    const tp = 0.42 + 0.3 * clamp((x0 - t.x) / (x0 - x1));
    const k = lin(tp, tp + 0.2, p);
    boom(ctx, t.x, t.y + 10, 75, k, c1, c2, f.seed + i * 5);
    if (k > 0 && k < 0.25) sh = Math.max(sh, 0.6);
  }
  return Math.max(sh, hitShake(p, 0.4));
};

/** GRITO: cone de ondas sônicas em arco saindo da boca. */
export const scream: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const S = span(f);
  const o = f.from;
  const aim = { x: S.cx, y: S.cy };
  const ang = Math.atan2(aim.y - o.y, aim.x - o.x);
  const L = Math.hypot(aim.x - o.x, aim.y - o.y) * 1.25;
  const spread = atk.aoe ? 0.55 : 0.32;
  const on = sm(0.22, 0.35, p) * (1 - sm(0.78, 0.95, p));
  ctx.save();
  add(ctx);
  orb(ctx, o.x, o.y, R(30 + 30 * sm(0, 0.3, p)), c1, sm(0, 0.25, p) * (1 - sm(0.85, 1, p)) * 0.8);
  ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const q = (p * 2.6 + i / 9) % 1;
    const born = 0.2 + (i / 9) * 0.1;
    if (p < born) continue;
    const d = 40 + q * L;
    const a = on * (1 - q * 0.6);
    const sp = spread * (0.6 + q * 0.6);
    ctx.strokeStyle = rgba(i % 2 ? c1 : c2, a * 0.85);
    ctx.lineWidth = 18 * (1 - q * 0.6);
    ctx.beginPath(); ctx.arc(o.x, o.y, R(d), ang - sp, ang + sp); ctx.stroke();
    ctx.strokeStyle = rgba('#ffffff', a * 0.7);
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  // cone de ar
  const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, R(L));
  g.addColorStop(0, rgba(c2, 0.35 * on));
  g.addColorStop(1, rgba(c1, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.arc(o.x, o.y, R(L), ang - spread, ang + spread); ctx.closePath(); ctx.fill();
  ctx.restore();
  // alvos vibrando: anéis curtos em volta
  for (let i = 0; i < f.targets.length; i++) {
    const t = f.targets[i];
    const k = win(0.45, 0.52, 0.75, 0.9, p);
    if (k <= 0) continue;
    ctx.save();
    add(ctx);
    for (let j = 0; j < 2; j++) {
      const q = (p * 7 + j / 2 + i * 0.2) % 1;
      ctx.strokeStyle = rgba(c2, k * (1 - q));
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.ellipse(t.x, t.y, R(30 + q * 50), R(50 + q * 50), 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
    burst(ctx, t.x, t.y, lin(0.52, 0.7, p), 100, f.seed + i, c1, 8);
  }
  flash(ctx, f, win(0.5, 0.54, 0.56, 0.66, p), c1, 0.18);
  return Math.max(on * 0.3, hitShake(p, 0.55));
};

/** RUGIDO: anéis sonoros saindo do boss, linhas distorcendo a tela e poeira. */
export const roar: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const o = f.from;
  const on = sm(0.25, 0.35, p) * (1 - sm(0.8, 0.98, p));
  ctx.save();
  add(ctx);
  // inspiração: ar sendo puxado
  const inh = sm(0, 0.2, p) * (1 - sm(0.25, 0.32, p));
  if (inh > 0) {
    ctx.strokeStyle = rgba(c2, inh * 0.7);
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 14; i++) {
      const a = rnd(f.seed, i) * TAU;
      const d = 60 + (1 - ((p * 5 + rnd(f.seed + 1, i)) % 1)) * 200;
      ctx.moveTo(o.x + Math.cos(a) * d, o.y + Math.sin(a) * d);
      ctx.lineTo(o.x + Math.cos(a) * (d + 30), o.y + Math.sin(a) * (d + 30));
    }
    ctx.stroke();
  }
  // anéis de som
  for (let i = 0; i < 6; i++) {
    const st = 0.28 + i * 0.07;
    const q = lin(st, st + 0.35, p);
    if (q <= 0 || q >= 1) continue;
    const r = 30 + easeOut(q) * f.W * 0.9;
    ctx.strokeStyle = rgba(i % 2 ? c1 : c2, (1 - q) * 0.9);
    ctx.lineWidth = 26 * (1 - q) + 2;
    ctx.beginPath(); ctx.arc(o.x, o.y, R(r), 0, TAU); ctx.stroke();
    ctx.strokeStyle = rgba('#ffffff', (1 - q) * 0.6);
    ctx.lineWidth = 4 * (1 - q) + 1;
    ctx.stroke();
  }
  orb(ctx, o.x, o.y, R(60 + on * 50), c1, on * 0.8, '#ffffff');
  ctx.restore();
  // linhas de distorção pela tela toda
  if (on > 0) {
    ctx.save();
    add(ctx);
    ctx.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      const y = f.ground - 40 - rnd(f.seed + 3, i) * f.ground * 0.9;
      ctx.strokeStyle = rgba(i % 2 ? c2 : '#ffffff', on * 0.22);
      ctx.beginPath();
      for (let x = -40; x <= f.W + 40; x += 40) {
        const yy = y + Math.sin(x * 0.03 + p * 70 + i) * 10 * on;
        if (x === -40) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
    speedLines(ctx, f.W, f.ground, o.x, o.y, on * 0.18, f.seed + Math.floor(p * 20), lite(c2, 0.5));
  }
  // poeira voando para a esquerda
  for (let i = 0; i < 8; i++) {
    const k = lin(0.3 + i * 0.03, 0.8 + i * 0.02, p);
    const x = mix(o.x - 60, -60, easeOut(k)) - i * 30;
    dust(ctx, x, f.ground - 8, k, 46, f.seed + i, '#a89a88', 5, 0.4);
  }
  for (let i = 0; i < f.targets.length; i++) burst(ctx, f.targets[i].x, f.ground - 4, lin(0.5, 0.75, p), 90, f.seed + i, c2, 7, 1.4);
  flash(ctx, f, win(0.3, 0.34, 0.4, 0.6, p), c1, 0.2);
  return Math.max(on * (0.35 + 0.15 * Math.sin(p * 80)), hitShake(p, 0.75, 0.05, 0.4));
};

/** METRALHADORA: rajadas de traçantes com clarão na boca do canhão. */
export const gatling: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const o = f.from;
  const n = 46;
  const fireOn = p > 0.18 && p < 0.78;
  ctx.save();
  add(ctx);
  // aquecimento: cano esquentando
  orb(ctx, o.x, o.y, R(18 + sm(0, 0.18, p) * 20), c1, sm(0, 0.18, p) * (1 - sm(0.8, 0.95, p)) * 0.8);
  // clarão da boca (pisca)
  if (fireOn) {
    const fl = 0.5 + 0.5 * Math.abs(Math.sin(p * 210));
    ctx.fillStyle = rgba(lite(c2, 0.4), fl);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI + (i - 2.5) * 0.35 + Math.sin(p * 300 + i) * 0.1;
      const l = (i % 2 ? 40 : 70) * fl;
      ctx.moveTo(o.x, o.y);
      ctx.lineTo(o.x + Math.cos(a - 0.12) * l * 0.4, o.y + Math.sin(a - 0.12) * l * 0.4);
      ctx.lineTo(o.x + Math.cos(a) * l, o.y + Math.sin(a) * l);
      ctx.lineTo(o.x + Math.cos(a + 0.12) * l * 0.4, o.y + Math.sin(a + 0.12) * l * 0.4);
    }
    ctx.fill();
    orb(ctx, o.x, o.y, 50 * fl, c1, 0.9, '#ffffff');
  }
  // traçantes
  ctx.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass ? '#ffffff' : rgba(c1, 0.9);
    ctx.lineWidth = pass ? 3 : 9;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const t0 = 0.18 + (i / n) * 0.56;
      const q = (p - t0) / 0.06;
      if (q <= 0 || q >= 1) continue;
      const t = f.targets[i % f.targets.length];
      const tx = t.x + (rnd(f.seed, i) - 0.5) * 70, ty = t.y + (rnd(f.seed + 1, i) - 0.5) * 80;
      const hx = mix(o.x, tx, q), hy = mix(o.y, ty, q);
      const bx = mix(o.x, tx, Math.max(0, q - 0.22)), by = mix(o.y, ty, Math.max(0, q - 0.22));
      ctx.moveTo(bx, by); ctx.lineTo(hx, hy);
    }
    ctx.stroke();
  }
  ctx.restore();
  // impactos (faíscas e poeira)
  for (let i = 0; i < n; i++) {
    const t0 = 0.24 + (i / n) * 0.56;
    const k = (p - t0) / 0.08;
    if (k <= 0 || k >= 1) continue;
    const t = f.targets[i % f.targets.length];
    const tx = t.x + (rnd(f.seed, i) - 0.5) * 70, ty = t.y + (rnd(f.seed + 1, i) - 0.5) * 80;
    ctx.save();
    add(ctx);
    orb(ctx, tx, ty, 26 * (1 - k), c2, 1 - k);
    ctx.restore();
    if (i % 3 === 0) burst(ctx, tx, ty, k, 60, f.seed + i, c2, 5);
    if (i % 4 === 0) dust(ctx, tx, f.ground - 4, k, 26, f.seed + i, '#8a8070', 4, 0.4);
  }
  return fireOn ? Math.max(0.22 + 0.1 * Math.sin(p * 200), hitShake(p, 0.5)) : 0;
};

/** MÍSSEIS: sobem do boss, fazem curva com rastro de fumaça e explodem nos alvos. */
export const missiles: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const nT = f.targets.length;
  const n = Math.min(10, Math.max(5, nT + 2));
  let sh = 0;
  for (let i = 0; i < n; i++) {
    const t = f.targets[i % nT];
    const t0 = 0.08 + (i / n) * 0.16;
    const t1 = stagger(i, n, 0.5, 0.58);
    const k = lin(t0, t1, p);
    const a: V = { x: f.core.x + (rnd(f.seed, i) - 0.5) * 120, y: f.core.y - 60 };
    const end: V = { x: t.x + (rnd(f.seed + 1, i) - 0.5) * (nT > 1 ? 40 : 90), y: t.y + 10 };
    const c: V = { x: mix(a.x, end.x, 0.3) + (rnd(f.seed + 2, i) - 0.5) * 300, y: a.y - 380 - rnd(f.seed + 3, i) * 200 };
    // mira no chão
    mark(ctx, end.x, f.ground, 50, sm(t0, t0 + 0.1, p) * (1 - sm(t1, t1 + 0.03, p)), c1, p, i);
    if (k > 0 && k < 1) {
      // fumaça (bolinhas ao longo da curva já percorrida)
      ctx.save();
      for (let j = 0; j < 9; j++) {
        const u = k - j * 0.045;
        if (u <= 0) break;
        const s = qb(a, c, end, u);
        ctx.fillStyle = rgba('#c8c0c0', 0.32 * (1 - j / 9));
        ctx.beginPath(); ctx.arc(s.x, s.y, R(6 + j * 3), 0, TAU); ctx.fill();
      }
      ctx.restore();
      const h = qb(a, c, end, k), h2 = qb(a, c, end, Math.min(1, k + 0.02));
      const ang = Math.atan2(h2.y - h.y, h2.x - h.x);
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.rotate(ang);
      // corpo do míssil
      ctx.fillStyle = dark(c1, 0.55);
      ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(6, -6); ctx.lineTo(-16, -6); ctx.lineTo(-22, -11); ctx.lineTo(-20, 0); ctx.lineTo(-22, 11); ctx.lineTo(-16, 6); ctx.lineTo(6, 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c2;
      ctx.fillRect(2, -6, 4, 12);
      add(ctx);
      flameJet(ctx, -22, 0, 30 + Math.sin(p * 200 + i) * 8, c1, c2);
      ctx.restore();
    }
    const kb = lin(t1, t1 + 0.22, p);
    boom(ctx, end.x, end.y, 80, kb, c1, c2, f.seed + i * 3, 9);
    if (kb > 0 && kb < 0.3) {
      dust(ctx, end.x, f.ground - 6, kb * 3, 60, f.seed + i, '#7a6a5a', 5, 0.5);
      sh = 0.9;
    }
  }
  flash(ctx, f, win(0.5, 0.53, 0.56, 0.66, p), c1, 0.25);
  return Math.max(sh * (1 - sm(0.6, 0.85, p)), 0.05 * sm(0.05, 0.2, p) * (1 - sm(0.5, 0.55, p)));
};
function flameJet(ctx: CanvasRenderingContext2D, x: number, y: number, l: number, c1: string, c2: string) {
  const g = ctx.createLinearGradient(x, y, x - l, y);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, c2);
  g.addColorStop(1, rgba(c1, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.quadraticCurveTo(x - l * 0.5, y - 8, x - l, y); ctx.quadraticCurveTo(x - l * 0.5, y + 8, x, y + 6); ctx.fill();
}

/** ORBES: giram em volta do boss e depois perseguem os alvos. */
export const orbs: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const nT = f.targets.length;
  const n = Math.min(10, Math.max(5, nT + 2));
  const o = f.core;
  const grow = sm(0.03, 0.25, p);
  let sh = 0;
  for (let i = 0; i < n; i++) {
    const t = f.targets[i % nT];
    const t0 = 0.38 + (i / n) * 0.06;
    const t1 = stagger(i, n, 0.5, 0.57);
    const home = lin(t0, t1, p);
    // posição na órbita
    const a = (i / n) * TAU + p * 9;
    const rx = 150 * f.size * grow, ry = 60 * f.size * grow;
    const orbP: V = { x: o.x + Math.cos(a) * rx, y: o.y - 40 + Math.sin(a) * ry };
    const end: V = { x: t.x, y: t.y };
    const ctl: V = { x: mix(orbP.x, end.x, 0.4), y: Math.min(orbP.y, end.y) - 260 - rnd(f.seed, i) * 120 };
    const e = home * home;
    const pos = home > 0 ? qb(orbP, ctl, end, e) : orbP;
    const alive = p < t1 && grow > 0;
    if (alive) {
      ctx.save();
      add(ctx);
      // rastro
      if (home > 0) {
        const pts: V[] = [];
        for (let j = 0; j < 8; j++) pts.push(qb(orbP, ctl, end, Math.max(0, e - j * 0.04)));
        tube(ctx, pts, (u) => 22 * (1 - u), rgba(c1, 0.5));
      } else {
        // arco de órbita
        ctx.strokeStyle = rgba(c1, 0.35);
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.ellipse(o.x, o.y - 40, R(rx), R(ry), 0, a - 0.7, a); ctx.stroke();
      }
      orb(ctx, pos.x, pos.y, R(26 + Math.sin(p * 40 + i) * 4), i % 2 ? c1 : c2, 1, '#ffffff');
      ctx.restore();
    }
    // aviso sobre o alvo
    mark(ctx, end.x, f.ground, 46, sm(0.2, 0.4, p) * (1 - sm(t1, t1 + 0.03, p)), c1, p, i);
    const kb = lin(t1, t1 + 0.22, p);
    boom(ctx, end.x, end.y, 70, kb, i % 2 ? c1 : c2, c2, f.seed + i * 3, 8);
    if (kb > 0 && kb < 0.25) sh = 0.7;
  }
  return Math.max(sh * (1 - sm(0.6, 0.85, p)), 0.05 * grow * (1 - sm(0.5, 0.55, p)));
};

/** DRENAR: fios de vida saem dos alvos e voltam para o corpo do boss. */
export const drain: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const o = f.core;
  const reach = sm(0.08, 0.42, p);
  const flow = sm(0.4, 0.5, p) * (1 - sm(0.85, 0.98, p));
  const fade = 1 - sm(0.85, 1, p);
  ctx.save();
  add(ctx);
  for (let i = 0; i < f.targets.length; i++) {
    const t = f.targets[i];
    const ctl: V = { x: mix(o.x, t.x, 0.5), y: Math.min(o.y, t.y) - 160 - 40 * Math.sin(i * 1.7) };
    // tentáculo de energia saindo do boss até o alvo
    const pts: V[] = [];
    for (let j = 0; j <= 16; j++) {
      const u = (j / 16) * reach;
      const q = qb(o, ctl, t, u);
      pts.push({ x: q.x, y: q.y + Math.sin(u * 12 - p * 30 + i) * 8 });
    }
    glowLine(ctx, pts, 5 * fade, c1, 0.7 * fade);
    // alvo brilhando (vida saindo)
    orb(ctx, t.x, t.y, R(50 + 20 * Math.sin(p * 30 + i)), c2, flow * 0.6);
    // partículas indo do alvo para o boss
    if (flow > 0) {
      for (let j = 0; j < 9; j++) {
        const u = (rnd(f.seed + i, j) + p * 2.2) % 1;
        const q = qb(t, ctl, o, u);
        const off = Math.sin(u * 9 + j) * 14;
        orb(ctx, q.x + off, q.y - off * 0.5, R(10 + 6 * Math.sin(u * Math.PI)), j % 2 ? c2 : c1, flow, '#ffffff');
      }
    }
  }
  // o boss incha de energia
  const gain = sm(0.45, 0.8, p) * fade;
  orb(ctx, o.x, o.y, R(70 + gain * 90), c2, gain * 0.7, '#ffffff');
  for (let i = 0; i < 2; i++) {
    const q = (p * 3 + i / 2) % 1;
    ctx.strokeStyle = rgba(c2, (1 - q) * gain);
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(o.x, o.y, R(180 * (1 - q)), 0, TAU); ctx.stroke();
  }
  ctx.restore();
  for (let i = 0; i < f.targets.length; i++) burst(ctx, f.targets[i].x, f.targets[i].y, lin(0.5, 0.7, p), 90, f.seed + i, c2, 8);
  smoke(ctx, o.x, o.y, 1, lin(0.85, 1, p), f.seed, 'rgba(255,255,255,', 2);
  flash(ctx, f, win(0.5, 0.54, 0.56, 0.68, p), c1, 0.2);
  return Math.max(flow * 0.15, hitShake(p, 0.4));
};
