/** Projéteis arremessados: estilhaços, teia, ácido, pedregulho, lâminas, lacaios. */
import type { FxDraw, V } from '../types';
import { mix, win } from '../util';
import {
  R, TAU, add, boom, burst, chunks, dark, dust, easeOut, flash, groundRing, haze, hashStr, hitShake, lin, lite, mark, orb, qb, rgba, rnd,
  rockPath, sm, span, stagger,
} from './common';

/** Caco pontudo apontando para +x. */
function shardShape(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, L: number, c1: string, c2: string, a: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.globalAlpha *= a;
  const g = ctx.createLinearGradient(-L, 0, L, 0);
  g.addColorStop(0, rgba(c1, 0.2));
  g.addColorStop(0.6, c1);
  g.addColorStop(1, '#ffffff');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(L, 0); ctx.lineTo(-L * 0.2, -L * 0.18); ctx.lineTo(-L, 0); ctx.lineTo(-L * 0.2, L * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgba(c2, 0.9);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

/** ESTILHAÇOS: cacos se formam no ar acima do boss e disparam em rajada. */
export const shards: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const G = f.ground, nT = f.targets.length;
  const per = Math.max(2, Math.min(6, Math.floor(30 / nT)));
  const n = Math.min(32, per * nT);
  let sh = 0;
  for (let i = 0; i < n; i++) {
    const t = f.targets[i % nT];
    // posição de espera (leque acima do boss)
    const fan = (i / Math.max(1, n - 1)) - 0.5;
    const home: V = { x: f.from.x + 40 + fan * 260, y: f.from.y - 160 - Math.cos(fan * 2.4) * 120 + rnd(f.seed, i) * 30 };
    const end: V = { x: t.x + (rnd(f.seed + 1, i) - 0.5) * 70, y: Math.min(G - 10, t.y + (rnd(f.seed + 2, i) - 0.5) * 80) };
    const t0 = 0.4 + (i / n) * 0.1;
    const t1 = t0 + 0.08;
    const appear = sm(0.05 + (i / n) * 0.2, 0.15 + (i / n) * 0.2, p);
    const fly = lin(t0, t1, p);
    const ang = Math.atan2(end.y - home.y, end.x - home.x);
    if (fly <= 0 && appear > 0) {
      // girando e mirando
      const aim = sm(0.25, 0.38, p);
      const a = mix(ang + Math.PI + p * 12, ang, aim);
      ctx.save();
      add(ctx);
      haze(ctx, home.x, home.y, 30, c1, 0.6 * appear);
      ctx.restore();
      shardShape(ctx, home.x, home.y + Math.sin(p * 20 + i) * 4, a, 26 * appear, c1, c2, appear);
    } else if (fly > 0 && fly < 1) {
      const x = mix(home.x, end.x, fly), y = mix(home.y, end.y, fly);
      ctx.save();
      add(ctx);
      ctx.strokeStyle = rgba(c1, 0.5);
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(mix(home.x, end.x, Math.max(0, fly - 0.3)), mix(home.y, end.y, Math.max(0, fly - 0.3))); ctx.lineTo(x, y); ctx.stroke();
      ctx.restore();
      shardShape(ctx, x, y, ang, 30, c1, c2, 1);
    } else if (fly >= 1) {
      // cravado no chão / alvo e sumindo
      const st = 1 - sm(0.75, 0.95, p);
      if (st > 0) shardShape(ctx, end.x - Math.cos(ang) * 12, end.y - Math.sin(ang) * 12, ang, 24, c1, c2, st);
      const kb = lin(t1, t1 + 0.15, p);
      burst(ctx, end.x, end.y, kb, 70, f.seed + i, c2, 5);
      if (kb > 0 && kb < 0.2) sh = 0.55;
    }
  }
  for (let i = 0; i < nT; i++) mark(ctx, f.targets[i].x, G, 60, sm(0.15, 0.35, p) * (1 - sm(0.45, 0.5, p)), c1, p, i);
  return Math.max(sh * (1 - sm(0.62, 0.8, p)), 0.04 * sm(0.1, 0.35, p));
};

/** TEIA: bola de teia voa até os alvos e abre numa rede presa ao chão. */
export const web: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const G = f.ground, S = span(f);
  const groups: V[] = atk.aoe ? [{ x: S.cx, y: S.cy }] : f.targets;
  const Rw = atk.aoe ? (S.maxX - S.minX) / 2 + 110 : 100;
  let sh = 0;
  for (let gi = 0; gi < groups.length; gi++) {
    const c = groups[gi];
    const k = lin(0.18, 0.48, p);
    // projétil girando em arco
    if (k > 0 && k < 1) {
      const ctl = { x: mix(f.from.x, c.x, 0.5), y: Math.min(f.from.y, c.y) - 260 };
      const q = qb(f.from, ctl, { x: c.x, y: c.y - 30 }, k);
      ctx.save();
      ctx.translate(q.x, q.y);
      ctx.rotate(p * 30);
      ctx.fillStyle = rgba(dark(c1, 0.4), 0.8);
      ctx.beginPath(); ctx.arc(0, 0, 26, 0, TAU); ctx.fill();
      ctx.strokeStyle = lite(c2, 0.5);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let j = 0; j < 6; j++) { const a = (j / 6) * TAU; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 34, Math.sin(a) * 34); }
      ctx.arc(0, 0, 16, 0, TAU);
      ctx.stroke();
      ctx.restore();
      // fio até a boca
      ctx.save();
      ctx.strokeStyle = rgba(lite(c2, 0.5), 0.5);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(f.from.x, f.from.y); ctx.quadraticCurveTo(ctl.x, ctl.y + 80, q.x, q.y); ctx.stroke();
      ctx.restore();
    }
    // rede aberta
    const open = easeOut(lin(0.48, 0.58, p));
    const fade = 1 - sm(0.8, 0.98, p);
    if (open > 0 && fade > 0) {
      const cx = c.x, cy = c.y - 20;
      const spokes = 10;
      const pt = (a: number, r: number): V => {
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.8;
        return { x, y: Math.min(G, y) };
      };
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.strokeStyle = lite(c2, 0.4);
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let j = 0; j < spokes; j++) {
        const a = (j / spokes) * TAU;
        const e = pt(a, Rw * open);
        ctx.moveTo(cx, cy); ctx.lineTo(e.x, e.y);
      }
      for (let ring = 1; ring <= 4; ring++) {
        const r = (Rw * open * ring) / 4;
        for (let j = 0; j <= spokes; j++) {
          const a = (j / spokes) * TAU;
          const m = pt(a - TAU / spokes / 2, r * 0.9);
          const e = pt(a, r);
          if (j === 0) ctx.moveTo(e.x, e.y); else ctx.quadraticCurveTo(m.x, m.y, e.x, e.y);
        }
      }
      ctx.stroke();
      add(ctx);
      ctx.strokeStyle = rgba(c1, 0.6);
      ctx.lineWidth = 7;
      ctx.stroke();
      // gotas brilhando nos nós
      ctx.fillStyle = rgba('#ffffff', 0.9);
      ctx.beginPath();
      for (let j = 0; j < spokes; j += 2) {
        const e = pt((j / spokes) * TAU, Rw * open * 0.75);
        ctx.moveTo(e.x + 4, e.y); ctx.arc(e.x, e.y, 4, 0, TAU);
      }
      ctx.fill();
      ctx.restore();
    }
    const kb = lin(0.48, 0.7, p);
    if (kb > 0 && kb < 0.2) sh = 0.45;
    burst(ctx, c.x, c.y - 20, kb, Rw * 0.9, f.seed + gi, lite(c2, 0.4), 12);
  }
  return Math.max(sh * (1 - sm(0.62, 0.8, p)), 0);
};

/** ÁCIDO: bolhas em arco que espirram e corroem o chão. */
export const acid: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const G = f.ground, nT = f.targets.length;
  const n = Math.min(12, Math.max(4, nT * 2));
  let sh = 0;
  for (let i = 0; i < n; i++) {
    const t = f.targets[i % nT];
    const ex = t.x + (i < nT ? 0 : (rnd(f.seed, i) - 0.5) * 120);
    const t0 = 0.15 + (i / n) * 0.15;
    const t1 = i < nT ? stagger(i, nT, 0.5, 0.57) : 0.48 + rnd(f.seed + 1, i) * 0.12;
    const k = lin(t0, t1, p);
    mark(ctx, ex, G, 55, sm(t0, t0 + 0.1, p) * (1 - sm(t1, t1 + 0.02, p)), c1, p, i);
    if (k > 0 && k < 1) {
      const start = { x: f.from.x, y: f.from.y };
      const h = 360 + rnd(f.seed + 2, i) * 160;
      const x = mix(start.x, ex, k);
      const y = mix(start.y, G - 20, k) - Math.sin(k * Math.PI) * h;
      const r = 18 + (i < nT ? 8 : 0);
      ctx.save();
      add(ctx);
      // gotas pingando atrás
      ctx.fillStyle = rgba(c1, 0.7);
      ctx.beginPath();
      for (let j = 1; j <= 4; j++) {
        const u = Math.max(0, k - j * 0.04);
        const dx = mix(start.x, ex, u), dy = mix(start.y, G - 20, u) - Math.sin(u * Math.PI) * h + j * j * 4;
        const rr = r * (0.5 - j * 0.08);
        ctx.moveTo(dx + rr, dy); ctx.arc(dx, dy, R(rr), 0, TAU);
      }
      ctx.fill();
      orb(ctx, x, y, r * 2.2, c1, 0.7, lite(c2, 0.4));
      ctx.restore();
      ctx.fillStyle = c1;
      ctx.beginPath(); ctx.ellipse(x, y, R(r * (1 + Math.sin(p * 40 + i) * 0.12)), R(r * (1 - Math.sin(p * 40 + i) * 0.12)), 0, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba('#ffffff', 0.8);
      ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, R(r * 0.3), 0, TAU); ctx.fill();
    }
    // espirro e poça fervendo
    const kb = lin(t1, t1 + 0.2, p);
    if (kb > 0 && kb < 1) {
      ctx.save();
      ctx.fillStyle = c1;
      ctx.beginPath();
      for (let j = 0; j < 9; j++) {
        const a = -Math.PI * (0.1 + rnd(f.seed + 3, i * 9 + j) * 0.8);
        const v = 180 + rnd(f.seed + 4, i * 9 + j) * 220;
        const px = ex + Math.cos(a) * v * kb, py = Math.min(G, G - 10 + Math.sin(a) * v * kb + 600 * kb * kb);
        const rr = 5 * (1 - kb) + 2;
        ctx.moveTo(px + rr, py); ctx.arc(px, py, R(rr), 0, TAU);
      }
      ctx.fill();
      ctx.restore();
      ctx.save();
      add(ctx);
      orb(ctx, ex, G - 20, 80 * (1 - kb * 0.5), c1, 1 - kb, lite(c2, 0.5));
      ctx.restore();
      if (kb < 0.15) sh = Math.max(sh, i < nT ? 0.55 : 0.3);
    }
    const pool = win(t1, t1 + 0.04, 0.85, 1, p);
    if (pool > 0) {
      ctx.save();
      ctx.fillStyle = rgba(c1, 0.75 * pool);
      ctx.beginPath(); ctx.ellipse(ex, G + 2, R(55 * pool), R(11 * pool), 0, 0, TAU); ctx.fill();
      add(ctx);
      haze(ctx, ex, G - 10, 60, c2, 0.4 * pool);
      // vapor e bolhas chiando
      ctx.strokeStyle = rgba(lite(c2, 0.4), pool);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let j = 0; j < 5; j++) {
        const q = (rnd(f.seed + 5, i * 5 + j) + p * 3) % 1;
        const bx = ex + (rnd(f.seed + 6, i * 5 + j) - 0.5) * 80;
        ctx.moveTo(bx + 5, G - q * 70);
        ctx.arc(bx, G - q * 70, R(3 + q * 5), 0, TAU);
      }
      ctx.stroke();
      ctx.restore();
    }
  }
  return Math.max(sh * (1 - sm(0.62, 0.8, p)), 0);
};

/** PEDREGULHO: o boss ergue uma rocha enorme e arremessa em arco; ela estilhaça. */
export const boulder: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const G = f.ground, S = span(f);
  const tgt: V = atk.aoe ? { x: S.cx, y: G - 70 } : { x: f.targets[0].x, y: G - 60 };
  const r = (atk.aoe ? 90 : 70) * Math.min(1.3, f.size * 0.8);
  const hold: V = { x: f.hand.x + 20, y: f.hand.y - 230 };
  const form = sm(0.02, 0.3, p);
  const fly = lin(0.3, 0.53, p);
  let pos = hold;
  if (fly > 0) {
    const ctl: V = { x: mix(hold.x, tgt.x, 0.5), y: Math.min(hold.y, tgt.y) - 380 };
    pos = qb(hold, ctl, tgt, fly);
  }
  // sombra no chão crescendo (aviso)
  const warn = sm(0.15, 0.35, p) * (1 - sm(0.52, 0.55, p));
  mark(ctx, tgt.x, G, r * 1.8 * (0.6 + 0.4 * fly), warn, c1, p);
  if (warn > 0) {
    ctx.save();
    ctx.fillStyle = rgba('#000000', 0.35 * warn * (0.3 + 0.7 * fly));
    ctx.beginPath(); ctx.ellipse(pos.x, G + 2, R(r * (0.5 + fly)), R(r * 0.2 * (0.5 + fly)), 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // pedras se juntando na mão
  if (form < 1 && p < 0.3) {
    for (let i = 0; i < 10; i++) {
      const a = rnd(f.seed, i) * TAU;
      const d = (1 - form) * 200;
      ctx.save();
      ctx.translate(hold.x + Math.cos(a) * d, hold.y + Math.sin(a) * d);
      rockPath(ctx, 10, f.seed + i, 5);
      ctx.fillStyle = dark(c1, 0.5);
      ctx.fill();
      ctx.restore();
    }
  }
  if (p < 0.535 && form > 0) {
    ctx.save();
    add(ctx);
    haze(ctx, pos.x, pos.y, r * 2, c1, 0.5 * form);
    ctx.restore();
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(-p * 14);
    const sc = 0.4 + 0.6 * form;
    ctx.scale(sc, sc);
    rockPath(ctx, r, f.seed + 77, 9);
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, R(r));
    g.addColorStop(0, lite(dark(c1, 0.3), 0.2));
    g.addColorStop(1, dark(c1, 0.75));
    ctx.fillStyle = g;
    ctx.fill();
    // rachaduras brilhando
    add(ctx);
    ctx.strokeStyle = rgba(c2, 0.95);
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let j = 0; j < 4; j++) {
      const a = (j / 4) * TAU + 0.4;
      ctx.moveTo(Math.cos(a) * r * 0.1, Math.sin(a) * r * 0.1);
      ctx.lineTo(Math.cos(a + 0.3) * r * 0.5, Math.sin(a + 0.3) * r * 0.5);
      ctx.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85);
    }
    ctx.stroke();
    ctx.restore();
    if (fly > 0) for (let j = 0; j < 3; j++) dust(ctx, pos.x + 40 + j * 30, pos.y - 20 * j + 20, (p * 6 + j * 0.3) % 1, 30, f.seed + j, '#9a8a78', 3, 0.35);
  }
  // estilhaça
  const kb = lin(0.53, 0.85, p);
  if (kb > 0 && kb < 1) {
    boom(ctx, tgt.x, tgt.y, r * 1.6, kb, c1, c2, f.seed, 14);
    groundRing(ctx, tgt.x, G, kb, 420, c2, 18);
    chunks(ctx, tgt.x, tgt.y, kb, f.seed + 3, dark(c1, 0.55), 14, 1.3, G);
    chunks(ctx, tgt.x, tgt.y, kb, f.seed + 4, dark(c1, 0.3), 8, 0.9, G);
    dust(ctx, tgt.x, G - 20, kb, 160, f.seed, '#8a7a68', 8, 0.6);
    for (let i = 0; i < f.targets.length; i++) burst(ctx, f.targets[i].x, f.targets[i].y, kb, 90, f.seed + i, c2, 6);
  }
  flash(ctx, f, win(0.52, 0.54, 0.56, 0.66, p), c2, 0.3);
  return hitShake(p, 0.95, 0.04, 0.535);
};

/** Disco serrilhado girando. */
function sawDisc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, c1: string, c2: string, tilt: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, tilt);
  ctx.rotate(rot);
  const teeth = 10;
  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * TAU;
    ctx.lineTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8);
    ctx.lineTo(Math.cos(a + 0.18) * r * 1.15, Math.sin(a + 0.18) * r * 1.15);
    ctx.lineTo(Math.cos(a + TAU / teeth) * r * 0.8, Math.sin(a + TAU / teeth) * r * 0.8);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R(r * 1.15));
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, c2);
  g.addColorStop(1, c1);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillStyle = dark(c1, 0.6);
  ctx.beginPath(); ctx.arc(0, 0, R(r * 0.25), 0, TAU); ctx.fill();
  ctx.restore();
}

/** LÂMINAS: discos giratórios aparecem em leque e voam cortando os alvos. */
export const blades: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const nT = f.targets.length;
  const n = Math.min(8, Math.max(3, nT + 1));
  let sh = 0;
  for (let i = 0; i < n; i++) {
    const t = f.targets[i % nT];
    const fan = n > 1 ? i / (n - 1) - 0.5 : 0;
    const home: V = { x: f.core.x - 60 + Math.sin(fan * 2.6) * 60, y: f.core.y - 120 + fan * 260 };
    const t0 = 0.36 + i * 0.015;
    const tHit = stagger(i, n, 0.5, 0.57);
    const appear = sm(0.05 + i * 0.02, 0.2 + i * 0.02, p);
    // continua voando para além do alvo
    const pass: V = { x: t.x - 500, y: t.y + (rnd(f.seed, i) - 0.5) * 200 };
    const ctl: V = { x: mix(home.x, t.x, 0.5), y: home.y + (fan - 0.2) * 320 };
    let pos = home;
    const u = (p - t0) / (tHit - t0);
    if (u > 0) pos = u <= 1 ? qb(home, ctl, t, u) : { x: mix(t.x, pass.x, (u - 1) * 0.6), y: mix(t.y, pass.y, (u - 1) * 0.6) };
    const vis = appear * (1 - sm(0.75, 0.9, p));
    if (vis > 0) {
      ctx.save();
      add(ctx);
      // rastro curvo
      if (u > 0) {
        ctx.strokeStyle = rgba(c1, 0.55 * vis);
        ctx.lineWidth = 14;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let j = 0; j <= 8; j++) {
          const v = u - j * 0.04;
          const q = v <= 0 ? home : v <= 1 ? qb(home, ctl, t, v) : { x: mix(t.x, pass.x, (v - 1) * 0.6), y: mix(t.y, pass.y, (v - 1) * 0.6) };
          if (j === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
        }
        ctx.stroke();
      }
      haze(ctx, pos.x, pos.y, 50, c1, 0.5 * vis);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = vis;
      sawDisc(ctx, pos.x, pos.y + (u <= 0 ? Math.sin(p * 20 + i) * 6 : 0), 26, p * 60 + i, c1, c2, 0.75);
      ctx.restore();
    }
    const kb = lin(tHit, tHit + 0.18, p);
    burst(ctx, t.x, t.y, kb, 110, f.seed + i, c2, 10);
    if (kb > 0 && kb < 0.2) sh = 0.6;
  }
  return Math.max(sh * (1 - sm(0.62, 0.8, p)), 0.03 * sm(0.05, 0.3, p));
};

/** Lacaio: 0 gosma, 1 morcego, 2 caveira. */
function minion(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, kind: number, ph: number, c1: string, c2: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = c1;
  ctx.strokeStyle = dark(c1, 0.6);
  ctx.lineWidth = 2.5;
  if (kind === 0) {
    const sq = 1 + Math.sin(ph) * 0.18;
    ctx.beginPath();
    ctx.moveTo(-20 * sq, 0);
    ctx.quadraticCurveTo(-20 * sq, -30 / sq, 0, -30 / sq);
    ctx.quadraticCurveTo(20 * sq, -30 / sq, 20 * sq, 0);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  } else if (kind === 1) {
    const fl = Math.sin(ph * 2) * 14;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(-30, -18 - fl); ctx.lineTo(-22, -6 - fl * 0.3); ctx.lineTo(-14, -10);
    ctx.lineTo(0, 0);
    ctx.lineTo(14, -10); ctx.lineTo(22, -6 - fl * 0.3); ctx.lineTo(30, -18 - fl);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -10, 9, 0, TAU); ctx.fill(); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(0, -18, 15, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillRect(-8, -6, 16, 8);
    ctx.fillStyle = dark(c1, 0.7);
    ctx.fillRect(-4, -4, 2, 5); ctx.fillRect(2, -4, 2, 5);
  }
  // olhos brilhando
  add(ctx);
  ctx.fillStyle = c2;
  const ey = kind === 0 ? -16 : kind === 1 ? -11 : -19;
  ctx.beginPath(); ctx.arc(-6, ey, 3.5, 0, TAU); ctx.arc(6, ey, 3.5, 0, TAU); ctx.fill();
  ctx.restore();
}

/** LACAIOS: criaturinhas saem do boss, correm até os alvos e explodem. */
export const minions: FxDraw = (ctx, f) => {
  const { p, atk } = f;
  const c1 = atk.color, c2 = atk.color2;
  const G = f.ground, nT = f.targets.length;
  const kind = hashStr(atk.name) % 3;
  const n = Math.min(12, Math.max(4, nT * 2));
  let sh = 0;
  // portal no boss
  const portal = sm(0.02, 0.15, p) * (1 - sm(0.35, 0.5, p));
  if (portal > 0) {
    ctx.save();
    add(ctx);
    ctx.translate(f.core.x - 80, G - 10);
    ctx.scale(1, 0.3);
    haze(ctx, 0, 0, 120 * portal, c1, 0.7);
    ctx.strokeStyle = rgba(c2, portal);
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(0, 0, R(110 * portal), 0, TAU); ctx.stroke();
    ctx.restore();
  }
  for (let i = 0; i < n; i++) {
    const t = f.targets[i % nT];
    const t0 = 0.08 + (i / n) * 0.18;
    const t1 = stagger(i, n, 0.5, 0.57);
    const k = lin(t0, t1, p);
    const end: V = { x: t.x + (rnd(f.seed, i) - 0.5) * 50, y: kind === 1 ? t.y - 10 : G };
    const start: V = { x: f.core.x - 80 + (rnd(f.seed + 1, i) - 0.5) * 80, y: kind === 1 ? f.core.y - 60 : G };
    if (k > 0 && k < 1) {
      const e = k;
      let x = mix(start.x, end.x, e), y = mix(start.y, end.y, e);
      const ph = p * 60 + i * 2;
      if (kind === 1) y -= Math.sin(e * Math.PI) * 120 + Math.sin(ph) * 10;
      else y -= Math.abs(Math.sin(e * Math.PI * (5 + (i % 3)))) * 40;
      x += Math.sin(ph * 0.3) * 4;
      const s = (0.9 + rnd(f.seed + 2, i) * 0.4) * Math.min(1, k * 6);
      // rastro de energia
      ctx.save();
      add(ctx);
      haze(ctx, x + 20, y - 15, 40, c1, 0.4);
      ctx.restore();
      minion(ctx, x, y, s, kind, ph, c1, c2);
      if (kind !== 1 && i % 2 === 0) dust(ctx, x + 30, G - 4, (k * 6) % 1, 22, f.seed + i, '#8a7a68', 3, 0.35);
    }
    const kb = lin(t1, t1 + 0.2, p);
    boom(ctx, end.x, end.y - (kind === 1 ? 0 : 30), 65, kb, c1, c2, f.seed + i, 8);
    if (kb > 0 && kb < 0.2) sh = 0.6;
  }
  return Math.max(sh * (1 - sm(0.62, 0.8, p)), 0.03 * portal);
};
