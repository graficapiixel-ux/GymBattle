/** Golpes 1–10 do duelista. Dano em p ≈ 0,55. */
import type { DuelMove } from './types';
import { P, TAU, debris, glow, lightBlade, lightning, magicCircle, noGlow, orb, pillar, rgba, shockwave, sparks, tube, bez } from '../../game/arena/legend/kit';
import {
  CHEST, arc, behind, blink, centroid, cutLine, cx, darken, faceTo, flash, ghostOf, hash, impact, lerp, pulse, seg, self, sideOf, slash, talisman, tpBurst, win,
} from './helpers';
import { sm } from '../util';

// ------------------------------------------------------------------ m01 Corte Relâmpago
// agacha carregando raios, atravessa o alvo num risco de luz e para do outro lado
const m01: DuelMove = {
  frame: (c) => {
    const tg = c.targets[0];
    const sd = sideOf(c, tg);
    const near = cx(tg.x + sd * 150);
    const far = behind(c, tg, 120);
    const p = c.p;
    if (p < 0.2) {
      const k = sm(0, 0.2, p);
      return { x: lerp(c.start.x, near, k), y: lerp(c.start.y, c.ground, k), facing: faceTo(c.start.x, tg.x), alpha: 1, pose: P.lunge(1.4), ghosts: 2 };
    }
    if (p < 0.47) return { x: near + Math.sin(c.t * 80) * 1.5, y: c.ground, facing: (-sd) as 1 | -1, alpha: 1, pose: P.crouch(2.6), aura: 1 };
    if (p < 0.53) {
      const k = seg(p, 0.47, 0.53);
      return { x: lerp(near, far, k), y: c.ground, facing: (-sd) as 1 | -1, alpha: 0.6, pose: P.lunge(1.6), ghosts: 5, aura: 1 };
    }
    return { x: far, y: c.ground, facing: (-sd) as 1 | -1, alpha: 1, pose: p < 0.85 ? P.after(1.8) : P.guard(), aura: 0.6 };
  },
  back: (ctx, c) => {
    const tg = c.targets[0];
    const sd = sideOf(c, tg);
    const near = cx(tg.x + sd * 150);
    const a = win(0.2, 0.25, 0.45, 0.5, c.p);
    if (a > 0) for (let i = 0; i < 3; i++) lightning(ctx, { x: near, y: c.ground - 20 }, { x: near + (hash(c.seed + Math.floor(c.t * 18), i) - 0.5) * 120, y: c.ground - 40 - hash(c.seed, i) * 100 }, c.seed + i + Math.floor(c.t * 20), 1.5, c.color2, a * 0.8, 1);
  },
  front: (ctx, c) => {
    const tg = c.targets[0];
    const sd = sideOf(c, tg);
    const near = cx(tg.x + sd * 150);
    const far = behind(c, tg, 120);
    const k = seg(c.p, 0.48, 0.85);
    cutLine(ctx, { x: near, y: c.ground - 62 }, { x: far, y: c.ground - 62 }, k, c.color2, 9);
    lightning(ctx, { x: near, y: c.ground - 62 }, { x: far, y: c.ground - 62 }, c.seed, 2, c.color2, (1 - k) * (k > 0 ? 1 : 0), 4);
    slash(ctx, tg.x, tg.y - CHEST, sd > 0 ? Math.PI : 0, 70, seg(c.p, 0.53, 0.8), c.color, c.color2, 18, 2.4);
    impact(ctx, tg.x, tg.y - CHEST, seg(c.p, 0.54, 0.8), c.color2, c.seed);
    flash(ctx, c, pulse(c.p, 0.51, 0.04) * 0.35, c.color2);
    return pulse(c.p, 0.55, 0.08) * 0.8;
  },
};

// ------------------------------------------------------------------ m02 Passo Fantasma
// some, reaparece nas costas do alvo e corta de baixo para cima; some de novo
const m02: DuelMove = {
  frame: (c) => {
    const tg = c.targets[0];
    const sd = sideOf(c, tg);
    const bx = behind(c, tg, 70);
    const p = c.p;
    const a = blink(p, 0.22, 0.4) * blink(p, 0.82, 0.92);
    if (p < 0.31) return { x: c.start.x, y: c.start.y, facing: faceTo(c.start.x, tg.x), alpha: a, pose: p < 0.15 ? P.guard() : P.pray() };
    if (p < 0.86) {
      const pose = p < 0.48 ? P.crouch(-0.6) : p < 0.6 ? P.raise(0.3) : P.after(0.6);
      return { x: bx, y: tg.y, facing: faceTo(bx, tg.x), alpha: a, pose, rot: p > 0.48 && p < 0.6 ? -0.15 * sd : 0, aura: 0.9 };
    }
    return { x: c.start.x, y: c.start.y, facing: faceTo(c.start.x, tg.x), alpha: a, pose: P.guard() };
  },
  back: (ctx, c, f) => {
    const tg = c.targets[0];
    // imagem que fica para trás quando ele some
    ghostOf(ctx, c, c.start.x, c.start.y, P.pray(), faceTo(c.start.x, tg.x), c.color, (1 - seg(c.p, 0.22, 0.5)) * (c.p > 0.2 ? 0.6 : 0));
    void f;
  },
  front: (ctx, c) => {
    const tg = c.targets[0];
    const sd = sideOf(c, tg);
    const bx = behind(c, tg, 70);
    tpBurst(ctx, c.start.x, c.start.y, seg(c.p, 0.2, 0.42), c.color, c.color2, c.seed);
    tpBurst(ctx, bx, tg.y, seg(c.p, 0.37, 0.6), c.color, c.color2, c.seed + 1);
    tpBurst(ctx, bx, tg.y, seg(c.p, 0.8, 1), c.color, c.color2, c.seed + 2);
    // corte vertical subindo
    slash(ctx, tg.x - sd * 10, tg.y - CHEST, -Math.PI / 2 + sd * 0.4, 80, seg(c.p, 0.5, 0.82), c.color2, c.color, 20, 2.8);
    impact(ctx, tg.x, tg.y - CHEST, seg(c.p, 0.54, 0.82), c.color, c.seed);
    return pulse(c.p, 0.55, 0.07) * 0.6;
  },
};

// ------------------------------------------------------------------ m03 Mil Cortes
// avança e vira um borrão em volta do alvo: dezenas de cortes em todas as direções
const m03: DuelMove = {
  frame: (c) => {
    const tg = c.targets[0];
    const sd = sideOf(c, tg);
    const p = c.p;
    const near = cx(tg.x + sd * 75);
    if (p < 0.22) {
      const k = sm(0.05, 0.22, p);
      return { x: lerp(c.start.x, near, k), y: lerp(c.start.y, tg.y, k), facing: faceTo(c.start.x, tg.x), alpha: 1, pose: P.lunge(1.5), ghosts: 4 };
    }
    if (p < 0.72) {
      const i = Math.floor(c.t * 22);
      const ang = hash(c.seed, i) * TAU;
      const x = tg.x + Math.cos(ang) * 75;
      const y = tg.y - Math.max(0, Math.sin(ang)) * 50;
      return { x, y, facing: faceTo(x, tg.x), alpha: 0.55 + 0.45 * hash(c.seed + 3, i), pose: i % 2 ? P.strike() : P.after(), ghosts: 5, aura: 1 };
    }
    const k = sm(0.72, 0.95, p);
    const land = cx(tg.x + sd * 190);
    const q = arc({ x: near, y: tg.y }, { x: land, y: c.ground }, k, 90);
    return { x: q.x, y: q.y, facing: (-sd) as 1 | -1, alpha: 1, pose: k < 0.9 ? P.fly() : P.guard(), rot: k < 0.9 ? sd * k * TAU : 0 };
  },
  front: (ctx, c) => {
    const tg = c.targets[0];
    const cy = tg.y - CHEST;
    const n = 26;
    for (let i = 0; i < n; i++) {
      const t0 = 0.24 + (i / n) * 0.46;
      const k = seg(c.p, t0, t0 + 0.12);
      if (k <= 0 || k >= 1) continue;
      const ang = hash(c.seed + 9, i) * TAU;
      const r = 40 + hash(c.seed + 10, i) * 40;
      const a = { x: tg.x + Math.cos(ang) * r, y: cy + Math.sin(ang) * r };
      const b = { x: tg.x - Math.cos(ang) * r, y: cy - Math.sin(ang) * r };
      cutLine(ctx, a, b, k, i % 3 ? c.color : c.color2, 4);
    }
    // cortes finais em X
    const kx = seg(c.p, 0.53, 0.8);
    cutLine(ctx, { x: tg.x - 80, y: cy - 80 }, { x: tg.x + 80, y: cy + 80 }, kx, c.color2, 10);
    cutLine(ctx, { x: tg.x + 80, y: cy - 80 }, { x: tg.x - 80, y: cy + 80 }, seg(c.p, 0.55, 0.82), c.color2, 10);
    impact(ctx, tg.x, cy, seg(c.p, 0.55, 0.8), c.color, c.seed, 1.2);
    sparks(ctx, tg.x, cy, (c.p * 6) % 1, 0.8, c.seed + Math.floor(c.p * 6), c.color2, 10, 80);
    return win(0.25, 0.3, 0.68, 0.72, c.p) * 0.25 + pulse(c.p, 0.56, 0.08) * 0.6;
  },
};

// ------------------------------------------------------------------ m04 Lua Crescente
// salto girando e uma lua gigante de energia rasgando o chão da arena
const m04: DuelMove = {
  frame: (c) => {
    const p = c.p;
    const cen = centroid(c.everyone);
    const dir = faceTo(c.start.x, cen.x);
    const top = { x: c.start.x - dir * 20, y: c.start.y - 170 };
    if (p < 0.15) return { x: c.start.x, y: c.start.y, facing: dir, alpha: 1, pose: P.crouch(-1.2) };
    if (p < 0.42) {
      const k = seg(p, 0.15, 0.42);
      const q = arc(c.start, top, Math.min(1, k * 1.2), 40);
      return { x: q.x, y: q.y, facing: dir, alpha: 1, pose: P.fly(), rot: -dir * k * TAU, ghosts: 3, aura: k };
    }
    if (p < 0.6) return { x: top.x, y: top.y + seg(p, 0.42, 0.6) * 10, facing: dir, alpha: 1, pose: p < 0.47 ? P.raise(-0.4) : P.strike(2.6), aura: 1 };
    const k = sm(0.6, 0.85, p);
    return { x: top.x, y: lerp(top.y + 10, c.start.y, k * k), facing: dir, alpha: 1, pose: k < 1 ? P.fly() : P.guard(), aura: 0.6 };
  },
  front: (ctx, c) => {
    const cen = centroid(c.everyone);
    const dir = faceTo(c.start.x, cen.x);
    const k = seg(c.p, 0.47, 0.72);
    if (k > 0 && k < 1) {
      const x0 = c.start.x + dir * 60;
      const x1 = dir < 0 ? -80 : c.W + 80;
      const x = lerp(x0, x1, sm(0, 1, k));
      const fade = 1 - sm(0.75, 1, k);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // lua de pé, barriga para a frente
      for (let g = 0; g < 4; g++) {
        const gx = x - dir * g * 28;
        ctx.globalAlpha = fade * (1 - g * 0.22);
        slash(ctx, gx, c.ground - 85, dir > 0 ? 0 : Math.PI, 105, 0.3, c.color, c.color2, 30, 2.6);
      }
      ctx.restore();
      // chão rachando atrás
      ctx.save();
      glow(ctx, c.color, 14);
      ctx.strokeStyle = rgba(c.color2, fade);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x0, c.ground + 2);
      ctx.lineTo(x, c.ground + 2);
      ctx.stroke();
      ctx.restore();
      debris(ctx, x, c.ground, (k * 4) % 1, 0.6, c.seed + Math.floor(k * 4), ['#2a2240', c.color, '#ffffff'], 10);
    }
    for (const e of c.everyone) impact(ctx, e.x, e.y - CHEST, seg(c.p, 0.54, 0.8), c.color, c.seed + Math.round(e.x), 0.8);
    return pulse(c.p, 0.56, 0.1) * 0.7;
  },
};

// ------------------------------------------------------------------ m05 Chuva de Lâminas
// teletransporta para o céu, abre um círculo e chove lâminas de luz em todo mundo
const m05: DuelMove = {
  frame: (c) => {
    const cen = centroid(c.everyone);
    const sky = { x: cx(cen.x + 60), y: c.ground - 300 };
    const p = c.p;
    const a = blink(p, 0.12, 0.2) * blink(p, 0.84, 0.92);
    if (p < 0.16) return { x: c.start.x, y: c.start.y, facing: faceTo(c.start.x, cen.x), alpha: a, pose: P.pray() };
    if (p < 0.88) {
      const bob = Math.sin(c.t * 4) * 5;
      return { x: sky.x, y: sky.y + bob, facing: -1, alpha: a, pose: p < 0.45 ? P.raise(0.1) : P.point(0.3), aura: 1 };
    }
    return { x: c.start.x, y: c.start.y, facing: faceTo(c.start.x, cen.x), alpha: a, pose: P.guard() };
  },
  back: (ctx, c) => {
    const cen = centroid(c.everyone);
    const sky = { x: cx(cen.x + 60), y: c.ground - 300 };
    const a = win(0.18, 0.28, 0.7, 0.85, c.p);
    magicCircle(ctx, sky.x, sky.y - 70, 120 + 30 * a, c.color2, a * 0.9, c.t * 1.5, 0.35, 5);
  },
  front: (ctx, c) => {
    const cen = centroid(c.everyone);
    const sky = { x: cx(cen.x + 60), y: c.ground - 300 };
    tpBurst(ctx, c.start.x, c.start.y, seg(c.p, 0.1, 0.3), c.color2, c.color, c.seed);
    tpBurst(ctx, sky.x, sky.y, seg(c.p, 0.17, 0.37), c.color2, c.color, c.seed + 1);
    tpBurst(ctx, c.start.x, c.start.y, seg(c.p, 0.86, 1), c.color2, c.color, c.seed + 2);
    const N = 30;
    for (let i = 0; i < N; i++) {
      const tg = c.everyone[i % c.everyone.length];
      const ox = (hash(c.seed, i) - 0.5) * 110;
      const home = { x: sky.x + Math.cos((i / N) * TAU) * 150, y: sky.y - 70 + Math.sin((i / N) * TAU) * 40 };
      const appear = sm(0.2 + (i / N) * 0.2, 0.26 + (i / N) * 0.2, c.p);
      const t0 = 0.44 + hash(c.seed + 1, i) * 0.08;
      const fall = seg(c.p, t0, t0 + 0.06);
      const end = { x: tg.x + ox, y: tg.y - 10 };
      const x = lerp(home.x, end.x, fall * fall);
      const y = lerp(home.y, end.y, fall * fall);
      const ang = fall > 0 ? Math.atan2(end.x - home.x, -(end.y - home.y)) : Math.PI;
      const stuck = 1 - sm(0.62, 0.8, c.p);
      lightBlade(ctx, x, y, fall > 0 ? ang : Math.PI, 46, 6, '#ffffff', i % 2 ? c.color : c.color2, appear * stuck, false);
      if (fall >= 1) sparks(ctx, end.x, end.y, seg(c.p, t0 + 0.06, t0 + 0.2), 0.6, c.seed + i, c.color2, 8, 60);
    }
    for (const e of c.everyone) impact(ctx, e.x, e.y - CHEST, seg(c.p, 0.55, 0.78), c.color2, c.seed + Math.round(e.x), 0.9);
    return win(0.44, 0.5, 0.58, 0.64, c.p) * 0.6;
  },
};

// ------------------------------------------------------------------ m06 Selos Explosivos
// faz os selos com as mãos, arremessa talismãs que grudam em cada um e explodem
const m06: DuelMove = {
  frame: (c) => {
    const cen = centroid(c.everyone);
    const dir = faceTo(c.start.x, cen.x);
    const p = c.p;
    const back = { x: cx(c.start.x - dir * 50), y: c.start.y };
    const x = lerp(c.start.x, back.x, sm(0, 0.12, p));
    let pose = P.guard();
    if (p < 0.28) pose = Math.floor(c.t * 9) % 2 ? P.pray() : P.palms();
    else if (p < 0.36) pose = P.throwBack();
    else if (p < 0.5) pose = P.throwFwd();
    else if (p < 0.62) pose = P.palms();
    return { x, y: c.start.y, facing: dir, alpha: 1, pose, aura: p < 0.3 ? 0.9 : 0.5 };
  },
  front: (ctx, c, f) => {
    const hand = { x: f.x + f.facing * 28, y: f.y - 75 };
    // selos girando em volta das mãos durante os sinais
    const sA = win(0.04, 0.12, 0.3, 0.36, c.p);
    for (let i = 0; i < 5; i++) {
      const a = c.t * 5 + (i / 5) * TAU;
      talisman(ctx, hand.x + Math.cos(a) * 40, hand.y + Math.sin(a) * 18, a, c.color, sA);
    }
    c.everyone.forEach((e, i) => {
      const t0 = 0.36 + i * 0.015;
      const k = seg(c.p, t0, t0 + 0.12);
      const end = { x: e.x, y: e.y - CHEST };
      if (k > 0 && c.p < 0.555) {
        const q = arc(hand, end, k, 90);
        talisman(ctx, q.x, q.y, k * 12 + i, c.color, 1, 1.1);
        // pisca antes de explodir
        if (k >= 1) orb(ctx, end.x, end.y, 18 + Math.sin(c.t * 60) * 6, c.color2, 0.8);
      }
      const ex = seg(c.p, 0.55, 0.85);
      if (ex > 0 && ex < 1) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        orb(ctx, end.x, end.y, 50 + ex * 90, c.color, (1 - ex) * 0.95, '#fff6d0');
        orb(ctx, end.x, end.y, 30 + ex * 50, c.color2, (1 - ex) * 0.8);
        ctx.restore();
        shockwave(ctx, e.x, e.y, ex, 0.8, c.color, 1);
        debris(ctx, e.x, e.y, ex, 0.7, c.seed + i, ['#2a1a10', c.color, c.color2], 12);
        sparks(ctx, end.x, end.y, ex, 1, c.seed + i * 3, c.color, 20, 160);
      }
    });
    return pulse(c.p, 0.57, 0.1) * 0.9;
  },
};

// ------------------------------------------------------------------ m07 Dragão de Tinta
// pinta no ar um dragão de tinta que serpenteia pela arena atravessando todos
function dragonPath(c: Parameters<DuelMove['front']>[1]) {
  const cen = centroid(c.everyone);
  const dir = faceTo(c.start.x, cen.x);
  const minX = Math.min(...c.everyone.map((e) => e.x)) - 120;
  const maxX = Math.max(...c.everyone.map((e) => e.x)) + 120;
  const x0 = c.start.x + dir * 40;
  const x1 = dir < 0 ? minX : maxX;
  return bez({ x: x0, y: c.start.y - 90 }, { x: lerp(x0, x1, 0.3), y: c.ground - 260 }, { x: lerp(x0, x1, 0.65), y: c.ground + 40 }, { x: x1 - dir * 60, y: c.ground - 220 }, 60);
}
const m07: DuelMove = {
  frame: (c) => {
    const cen = centroid(c.everyone);
    const dir = faceTo(c.start.x, cen.x);
    const p = c.p;
    const sweep = Math.sin(c.t * 7) * 0.8;
    const pose = p < 0.2 ? P.cast(0.3) : p < 0.6 ? { ...P.point(0.6 + sweep), armF: [2.0 + sweep * 0.5, 0.15] as [number, number] } : P.guard();
    return { x: c.start.x, y: c.start.y, facing: dir, alpha: 1, pose, aura: p < 0.6 ? 1 : 0.5 };
  },
  back: (ctx, c) => {
    // salpicos de tinta no chão
    const k = seg(c.p, 0.15, 0.95);
    if (k <= 0) return;
    ctx.save();
    ctx.globalAlpha = 0.6 * (1 - sm(0.8, 1, k));
    ctx.fillStyle = '#0a0612';
    for (let i = 0; i < 12; i++) {
      const x = c.start.x + (hash(c.seed, i) - 0.5) * 260;
      ctx.beginPath();
      ctx.ellipse(x, c.ground + 3, 8 + hash(c.seed + 1, i) * 20 * k, 3, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },
  front: (ctx, c) => {
    const path = dragonPath(c);
    const head = seg(c.p, 0.18, 0.7);
    const tail = seg(c.p, 0.3, 0.92);
    if (head > 0 && tail < 1) {
      const i1 = Math.max(2, Math.floor(head * (path.length - 1)));
      const i0 = Math.floor(tail * (path.length - 1));
      const pts = path.slice(i0, i1 + 1);
      if (pts.length >= 3) {
        // corpo: tinta preta com borda roxa brilhando
        ctx.save();
        glow(ctx, c.color2, 22);
        tube(ctx, pts, (t) => 8 + Math.sin(t * Math.PI) * 30 + t * 14, rgba(c.color2, 0.9), { wobble: 0.15, time: c.t, seed: c.seed });
        noGlow(ctx);
        tube(ctx, pts, (t) => 5 + Math.sin(t * Math.PI) * 24 + t * 10, '#0a0612', { wobble: 0.1, time: c.t, seed: c.seed + 2 });
        // escamas/espinhos
        ctx.fillStyle = c.color2;
        for (let i = 2; i < pts.length - 2; i += 3) {
          const a = pts[i], b = pts[i + 1];
          const ang = Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2;
          ctx.beginPath();
          ctx.moveTo(a.x + Math.cos(ang) * 14, a.y + Math.sin(ang) * 14);
          ctx.lineTo(a.x + Math.cos(ang) * 30, a.y + Math.sin(ang) * 30);
          ctx.lineTo(b.x + Math.cos(ang) * 14, b.y + Math.sin(ang) * 14);
          ctx.fill();
        }
        // cabeça
        const h = pts[pts.length - 1];
        const hb = pts[pts.length - 3];
        const ang = Math.atan2(h.y - hb.y, h.x - hb.x);
        ctx.translate(h.x, h.y);
        ctx.rotate(ang);
        const jaw = 0.3 + Math.sin(c.t * 12) * 0.2;
        glow(ctx, c.color2, 18);
        ctx.fillStyle = '#0a0612';
        ctx.beginPath();
        ctx.moveTo(-20, -24);
        ctx.lineTo(48, -10 - jaw * 20);
        ctx.lineTo(30, 0);
        ctx.lineTo(48, 10 + jaw * 20);
        ctx.lineTo(-20, 24);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = c.color2;
        ctx.lineWidth = 3;
        ctx.stroke();
        // chifres
        ctx.beginPath();
        ctx.moveTo(-6, -20);
        ctx.quadraticCurveTo(-30, -50, -46, -46);
        ctx.moveTo(-6, 20);
        ctx.quadraticCurveTo(-30, 50, -46, 46);
        ctx.stroke();
        orb(ctx, 20, -10, 9, '#ff3a6a', 1);
        ctx.restore();
      }
    }
    for (const e of c.everyone) {
      const k = seg(c.p, 0.54, 0.82);
      impact(ctx, e.x, e.y - CHEST, k, c.color2, c.seed + Math.round(e.x), 0.9);
      // tinta espirrando
      if (k > 0 && k < 1) debris(ctx, e.x, e.y - 30, k, 0.8, c.seed + Math.round(e.x), ['#0a0612', '#1a1426', c.color2], 14, 0.8);
    }
    return win(0.4, 0.5, 0.62, 0.7, c.p) * 0.6;
  },
};

// ------------------------------------------------------------------ m08 Prisão de Selos
// círculo sob o alvo, grades de luz sobem e se fecham, explosão de selos
const m08: DuelMove = {
  frame: (c) => {
    const tg = c.targets[0];
    const dir = faceTo(c.start.x, tg.x);
    const p = c.p;
    const pose = p < 0.15 ? P.guard() : p < 0.5 ? P.point(0.2) : p < 0.62 ? { ...P.point(0.2), armF: [1.4, 1.6] as [number, number] } : P.guard();
    return { x: c.start.x, y: c.start.y, facing: dir, alpha: 1, pose, aura: win(0.1, 0.2, 0.6, 0.7, p) };
  },
  back: (ctx, c) => {
    const tg = c.targets[0];
    const a = win(0.1, 0.2, 0.7, 0.85, c.p);
    magicCircle(ctx, tg.x, tg.y + 2, 90, c.color, a, c.t * 2, 0.22, 8);
  },
  front: (ctx, c) => {
    const tg = c.targets[0];
    const rise = sm(0.22, 0.42, c.p);
    const close = sm(0.42, 0.55, c.p);
    const gone = 1 - sm(0.6, 0.72, c.p);
    const bars = 10;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < bars; i++) {
      const a = (i / bars) * TAU + c.t * 1.2;
      const r = lerp(85, 35, close);
      const x = tg.x + Math.cos(a) * r;
      const front = Math.sin(a) > 0;
      if (rise <= 0) continue;
      pillar(ctx, x, tg.y - 150 * rise, 6, 150 * rise, front ? c.color : c.color2, gone * (front ? 0.9 : 0.5));
    }
    // anéis de selo apertando
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = rgba(c.color2, gone * rise);
      ctx.lineWidth = 3;
      glow(ctx, c.color2, 10);
      ctx.beginPath();
      ctx.ellipse(tg.x, tg.y - 30 - k * 45, lerp(90, 34, close), 12, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    for (let i = 0; i < 6; i++) {
      const a = c.t * 3 + (i / 6) * TAU;
      const r = lerp(110, 40, close);
      talisman(ctx, tg.x + Math.cos(a) * r, tg.y - 70 + Math.sin(a) * 14, a, c.color, rise * gone);
    }
    const ex = seg(c.p, 0.55, 0.85);
    if (ex > 0 && ex < 1) {
      pillar(ctx, tg.x, tg.y - 600, 50 * (1 - ex) + 10, 610, c.color, 1 - ex);
      impact(ctx, tg.x, tg.y - CHEST, ex, c.color2, c.seed, 1.3);
    }
    return pulse(c.p, 0.56, 0.08) * 0.8;
  },
};

// ------------------------------------------------------------------ m09 Três Reflexos
// vira três: um no chão de cada lado e um no alto; os três cortam juntos
function reflexSpots(c: Parameters<DuelMove['front']>[1]) {
  const minX = Math.min(...c.everyone.map((e) => e.x));
  const maxX = Math.max(...c.everyone.map((e) => e.x));
  const cen = centroid(c.everyone);
  return [
    { x: cx(maxX + 140), y: c.ground, f: -1 as const },
    { x: cx(minX - 140), y: c.ground, f: 1 as const },
    { x: cx(cen.x), y: c.ground - 240, f: (cen.x < c.start.x ? -1 : 1) as 1 | -1 },
  ];
}
const m09: DuelMove = {
  frame: (c) => {
    const sp = reflexSpots(c)[0];
    const p = c.p;
    const a = blink(p, 0.16, 0.26) * blink(p, 0.82, 0.9);
    if (p < 0.21) return { x: c.start.x, y: c.start.y, facing: faceTo(c.start.x, sp.x - 200), alpha: a, pose: P.pray(), aura: 1 };
    if (p < 0.86) {
      const pose = p < 0.45 ? P.guard() : p < 0.52 ? P.raise(-0.3) : p < 0.7 ? P.strike() : P.guard();
      return { x: sp.x, y: sp.y, facing: sp.f, alpha: a, pose, aura: 0.9 };
    }
    return { x: c.start.x, y: c.start.y, facing: -1, alpha: a, pose: P.guard() };
  },
  back: (ctx, c, f) => {
    const spots = reflexSpots(c).slice(1);
    const a = win(0.22, 0.3, 0.75, 0.84, c.p);
    for (const sp of spots) {
      ghostOf(ctx, c, sp.x, sp.y, f.pose, sp.f, c.color, a * 0.5, 18);
      self(ctx, c, sp.x, sp.y, f.pose, sp.f, a * 0.8);
    }
  },
  front: (ctx, c) => {
    const spots = reflexSpots(c);
    const cen = centroid(c.everyone);
    tpBurst(ctx, c.start.x, c.start.y, seg(c.p, 0.14, 0.32), c.color, c.color2, c.seed);
    spots.forEach((sp, i) => {
      tpBurst(ctx, sp.x, sp.y, seg(c.p, 0.2 + i * 0.02, 0.4 + i * 0.02), c.color, c.color2, c.seed + i);
      tpBurst(ctx, sp.x, sp.y, seg(c.p, 0.78, 0.95), c.color, c.color2, c.seed + 5 + i);
      // onda de corte saindo de cada reflexo para o meio
      const k = seg(c.p, 0.47, 0.58);
      if (k > 0 && k < 1) {
        const end = { x: cen.x, y: c.ground - CHEST };
        const st = { x: sp.x, y: sp.y - 60 };
        const x = lerp(st.x, end.x, k);
        const y = lerp(st.y, end.y, k);
        const ang = Math.atan2(end.y - st.y, end.x - st.x);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        slash(ctx, x, y, ang, 70, 0.3, c.color, c.color2, 20, 2.2);
        ctx.restore();
      }
    });
    const k = seg(c.p, 0.56, 0.85);
    if (k > 0 && k < 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      orb(ctx, cen.x, c.ground - CHEST, 90 + k * 160, c.color, (1 - k) * 0.9);
      ctx.restore();
      shockwave(ctx, cen.x, c.ground, k, 1.2, c.color2, 1.3);
    }
    for (const e of c.everyone) impact(ctx, e.x, e.y - CHEST, seg(c.p, 0.56, 0.8), c.color2, c.seed + Math.round(e.x), 0.8);
    return pulse(c.p, 0.57, 0.09) * 0.9;
  },
};

// ------------------------------------------------------------------ m10 Salto Celeste
// pula até sumir no céu e cai como um cometa no meio do time
const m10: DuelMove = {
  frame: (c) => {
    const cen = centroid(c.everyone);
    const land = { x: cx(cen.x), y: c.ground };
    const p = c.p;
    const dir = faceTo(c.start.x, cen.x);
    if (p < 0.12) return { x: c.start.x, y: c.start.y, facing: dir, alpha: 1, pose: P.crouch(-1), aura: 1 };
    if (p < 0.32) {
      const k = seg(p, 0.12, 0.32);
      return { x: lerp(c.start.x, land.x + dir * 120, k), y: c.start.y - 760 * Math.sqrt(k), facing: dir, alpha: 1, pose: P.fly(), rot: -dir * k * 3, ghosts: 4 };
    }
    if (p < 0.44) return { x: land.x, y: c.ground - 900, facing: dir, alpha: 0, pose: P.dive() };
    if (p < 0.54) {
      const k = seg(p, 0.44, 0.54);
      return { x: lerp(land.x + dir * 60, land.x, k), y: lerp(c.ground - 900, c.ground, k * k), facing: dir, alpha: 1, pose: P.dive(), rot: dir * 0.5, ghosts: 5, aura: 1 };
    }
    if (p < 0.72) return { x: land.x, y: c.ground, facing: dir, alpha: 1, pose: P.crouch(2.8), aura: 1 };
    const k = sm(0.72, 0.95, p);
    const back = { x: cx(land.x - dir * 220), y: c.ground };
    const q = arc(land, back, k, 120);
    return { x: q.x, y: q.y, facing: dir, alpha: 1, pose: k < 0.95 ? P.fly() : P.guard(), rot: k < 0.95 ? dir * k * TAU : 0 };
  },
  back: (ctx, c) => {
    const cen = centroid(c.everyone);
    // sombra/alvo crescendo no chão antes da queda
    const a = win(0.3, 0.4, 0.52, 0.56, c.p);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    magicCircle(ctx, cx(cen.x), c.ground + 2, 60 + 90 * sm(0.3, 0.54, c.p), c.color2, a, -c.t * 3, 0.2, 3);
    ctx.restore();
  },
  front: (ctx, c) => {
    const cen = centroid(c.everyone);
    const lx = cx(cen.x);
    // rastro de cometa
    const fall = seg(c.p, 0.44, 0.54);
    if (fall > 0 && fall < 1) {
      const y = lerp(c.ground - 900, c.ground, fall * fall);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      pillar(ctx, lx, y - 400, 26, 400, c.color, 0.8);
      orb(ctx, lx, y - 60, 60, c.color2, 0.9);
      ctx.restore();
    }
    const k = seg(c.p, 0.54, 0.9);
    if (k > 0 && k < 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      pillar(ctx, lx, c.ground - 700, 90 * (1 - k), 700, c.color, 1 - k);
      orb(ctx, lx, c.ground - 30, 120 + 200 * k, c.color2, (1 - k) * 0.9);
      ctx.restore();
      shockwave(ctx, lx, c.ground, k, 1.6, c.color2, 1.6);
      shockwave(ctx, lx, c.ground, Math.max(0.01, k - 0.12), 1.2, c.color, 1.2);
      debris(ctx, lx, c.ground, k, 1.2, c.seed, ['#2a2240', '#5a4a70', c.color2], 34, 1.3);
    }
    for (const e of c.everyone) impact(ctx, e.x, e.y - CHEST, seg(c.p, 0.55, 0.8), c.color2, c.seed + Math.round(e.x), 0.7);
    flash(ctx, c, pulse(c.p, 0.545, 0.03) * 0.6);
    return pulse(c.p, 0.56, 0.12) * 1;
  },
};

export const MOVES_A: Record<string, DuelMove> = { m01, m02, m03, m04, m05, m06, m07, m08, m09, m10 };
