/** Golpes 11–20 do duelista. Dano em p ≈ 0,55. */
import type { DuelMove, DuelMoveCtx } from './types';
import { P, TAU, debris, glow, lightBlade, magicCircle, noGlow, orb, pillar, rgba, shockwave, sparks, lightning } from '../../game/arena/legend/kit';
import {
  CHEST, arc, behind, blink, centroid, cutLine, cx, darken, faceTo, flash, ghostOf, hash, impact, lerp, pulse, seg, self, sideOf, slash, talisman, tpBurst, win,
} from './helpers';
import { sm } from '../util';

const xs = (c: DuelMoveCtx) => c.everyone.map((e) => e.x);

// ------------------------------------------------------------------ m11 Tornado Cortante
// gira como um pião de lâminas e atravessa a arena de ponta a ponta
function tornadoX(c: DuelMoveCtx, p: number) {
  const dir = faceTo(c.start.x, centroid(c.everyone).x);
  const end = dir < 0 ? cx(Math.min(...xs(c)) - 130) : cx(Math.max(...xs(c)) + 130);
  return lerp(c.start.x, end, sm(0.22, 0.75, p));
}
const m11: DuelMove = {
  frame: (c) => {
    const dir = faceTo(c.start.x, centroid(c.everyone).x);
    const p = c.p;
    const x = tornadoX(c, p);
    if (p < 0.2) return { x, y: c.start.y, facing: dir, alpha: 1, pose: P.spin(c.t * 4), aura: p * 4 };
    if (p < 0.82) {
      const f = (Math.floor(c.t * 16) % 2 ? 1 : -1) as 1 | -1;
      return { x, y: c.ground - 8 - Math.abs(Math.sin(c.t * 9)) * 10, facing: f, alpha: 1, pose: P.spin(c.t * 20), ghosts: 3, aura: 1 };
    }
    // freia e se vira para o time
    return { x, y: c.ground, facing: (-dir) as 1 | -1, alpha: 1, pose: p < 0.9 ? P.after(1.4) : P.guard() };
  },
  front: (ctx, c, f) => {
    const a = win(0.12, 0.25, 0.75, 0.88, c.p);
    if (a > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // funil de vento
      for (let i = 0; i < 7; i++) {
        const h = i / 6;
        const y = f.y - 10 - h * 170;
        const r = 30 + h * 70;
        ctx.strokeStyle = rgba(i % 2 ? c.color : c.color2, a * (0.6 - h * 0.3));
        ctx.lineWidth = 3;
        glow(ctx, c.color, 10);
        ctx.beginPath();
        ctx.ellipse(f.x, y, r, r * 0.22, 0, c.t * 14 + i, c.t * 14 + i + 4.2);
        ctx.stroke();
      }
      noGlow(ctx);
      ctx.restore();
      // lâminas girando no funil
      for (let i = 0; i < 6; i++) {
        const ang = c.t * 16 + (i / 6) * TAU;
        const h = (i % 3) / 2;
        const r = 40 + h * 60;
        const x = f.x + Math.cos(ang) * r;
        const y = f.y - 30 - h * 120 + Math.sin(ang) * r * 0.22;
        lightBlade(ctx, x, y, ang + Math.PI / 2, 40, 5, '#ffffff', c.color, a * (Math.sin(ang) > 0 ? 1 : 0.5), false);
      }
      debris(ctx, f.x, c.ground, (c.t * 3) % 1, 0.5, c.seed + Math.floor(c.t * 3), ['#3a3050', '#5a4a70', c.color], 10, 0.6);
    }
    // cada um é cortado quando o tornado passa (mas o dano aparece junto, em 0,55)
    for (const e of c.everyone) {
      const k = seg(c.p, 0.55, 0.78);
      impact(ctx, e.x, e.y - CHEST, k, c.color, c.seed + Math.round(e.x), 0.8);
      slash(ctx, e.x, e.y - CHEST, -0.6 + hash(c.seed, Math.round(e.x)) * 1.2, 50, k, c.color2, c.color, 10);
    }
    return a * 0.25 + pulse(c.p, 0.56, 0.08) * 0.5;
  },
};

// ------------------------------------------------------------------ m12 Lança Escarlate
// recua, cria uma lança vermelha gigante e arremessa direto no alvo
const m12: DuelMove = {
  frame: (c) => {
    const tg = c.targets[0];
    const sd = sideOf(c, tg);
    const p = c.p;
    const back = { x: cx(c.start.x + sd * 90), y: c.ground };
    if (p < 0.18) {
      const q = arc(c.start, back, sm(0, 0.18, p), 70);
      return { x: q.x, y: q.y, facing: (-sd) as 1 | -1, alpha: 1, pose: P.fly(), rot: sd * sm(0, 0.18, p) * TAU };
    }
    const pose = p < 0.42 ? P.throwBack(-1.2) : p < 0.62 ? P.throwFwd() : P.guard();
    return { x: back.x, y: back.y, facing: (-sd) as 1 | -1, alpha: 1, pose, aura: win(0.2, 0.3, 0.5, 0.6, p) };
  },
  front: (ctx, c, f) => {
    const tg = c.targets[0];
    const hand = { x: f.x - f.facing * 18, y: f.y - 95 };
    const end = { x: tg.x, y: tg.y - CHEST };
    const ang = Math.atan2(end.x - hand.x, -(end.y - hand.y));
    // forma-se
    const form = sm(0.2, 0.42, c.p);
    if (c.p < 0.48 && form > 0) {
      lightBlade(ctx, hand.x, hand.y + 10, f.facing > 0 ? 1.45 : -1.45, 150 * form, 9, '#ffffff', c.color, form, true);
      sparks(ctx, hand.x, hand.y, (c.t * 4) % 1, 0.6, c.seed + Math.floor(c.t * 4), c.color, 10, 70);
    }
    // voa
    const k = seg(c.p, 0.48, 0.55);
    if (k > 0 && k < 1) {
      const x = lerp(hand.x, end.x, k);
      const y = lerp(hand.y, end.y, k);
      cutLine(ctx, hand, { x, y }, 0.35, c.color, 12);
      lightBlade(ctx, x - Math.sin(ang) * 75, y + Math.cos(ang) * 75, ang, 150, 9, '#ffffff', c.color, 1, true);
    }
    const ex = seg(c.p, 0.55, 0.85);
    if (ex > 0 && ex < 1) {
      // lança cravada e explosão vermelha
      lightBlade(ctx, end.x + Math.sin(ang) * 30, end.y - Math.cos(ang) * 30, ang, 150, 9, '#ffffff', c.color, 1 - ex, true);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      orb(ctx, end.x, end.y, 60 + ex * 110, c.color, (1 - ex) * 0.95);
      ctx.restore();
      impact(ctx, end.x, end.y, ex, c.color, c.seed, 1.3);
    }
    return pulse(c.p, 0.56, 0.08) * 0.8;
  },
};

// ------------------------------------------------------------------ m13 Esfera Gravitacional
// flutua, cria uma esfera escura que puxa todo mundo e implode
function well(c: DuelMoveCtx) {
  const cen = centroid(c.everyone);
  return { x: cx(cen.x), y: c.ground - 120 };
}
const m13: DuelMove = {
  frame: (c) => {
    const w = well(c);
    const p = c.p;
    const dir = faceTo(c.start.x, w.x);
    const up = sm(0, 0.2, p) * (1 - sm(0.8, 0.96, p));
    const pose = p < 0.4 ? P.raise(0.2) : p < 0.5 ? P.throwFwd() : P.palms();
    return { x: c.start.x, y: c.start.y - 110 * up + Math.sin(c.t * 3) * 4 * up, facing: dir, alpha: 1, pose, aura: 0.6 + up * 0.4 };
  },
  back: (ctx, c) => {
    const w = well(c);
    const a = win(0.45, 0.52, 0.75, 0.85, c.p);
    if (a <= 0) return;
    // distorção: anéis girando
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const r = ((1 - ((c.t * 1.4 + i / 5) % 1)) * 220) + 20;
      ctx.strokeStyle = rgba(i % 2 ? c.color : c.color2, a * 0.6 * (r / 240));
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(w.x, w.y, r, r * 0.55, c.t * 2 + i, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  },
  front: (ctx, c, f) => {
    const w = well(c);
    const hand = { x: f.x, y: f.y - 150 };
    const grow = sm(0.08, 0.4, c.p);
    const fly = seg(c.p, 0.4, 0.5);
    const pos = c.p < 0.4 ? hand : { x: lerp(hand.x, w.x, fly), y: lerp(hand.y, w.y, fly) };
    const imp = seg(c.p, 0.74, 0.95);
    const r = c.p < 0.74 ? 18 + grow * 26 + win(0.5, 0.55, 0.7, 0.74, c.p) * 20 : 44 * (1 - imp);
    if (imp < 1) {
      ctx.save();
      orb(ctx, pos.x, pos.y, r * 2.4, c.color, 0.7);
      ctx.fillStyle = '#05010c';
      glow(ctx, c.color2, 20);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, TAU);
      ctx.fill();
      noGlow(ctx);
      ctx.strokeStyle = rgba(c.color2, 0.9);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r + 3, c.t * 6, c.t * 6 + 4);
      ctx.stroke();
      ctx.restore();
    }
    // partículas sendo sugadas
    const pull = win(0.48, 0.52, 0.72, 0.76, c.p);
    if (pull > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 40; i++) {
        const ph = (c.t * 1.6 + hash(c.seed, i)) % 1;
        const a = hash(c.seed + 1, i) * TAU + ph * 2;
        const d = (1 - ph) * 260;
        ctx.globalAlpha = pull * ph;
        ctx.fillStyle = i % 2 ? c.color2 : '#ffffff';
        ctx.beginPath();
        ctx.arc(w.x + Math.cos(a) * d, w.y + Math.sin(a) * d * 0.6, 2.5, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      for (const e of c.everyone) {
        ctx.save();
        ctx.strokeStyle = rgba(c.color, pull * 0.5);
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 8]);
        ctx.lineDashOffset = -c.t * 80;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y - CHEST);
        ctx.lineTo(w.x, w.y);
        ctx.stroke();
        ctx.restore();
      }
    }
    for (const e of c.everyone) impact(ctx, e.x, e.y - CHEST, seg(c.p, 0.54, 0.76), c.color2, c.seed + Math.round(e.x), 0.8);
    // implosão final
    if (imp > 0 && imp < 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      orb(ctx, w.x, w.y, 40 + imp * 300, c.color2, (1 - imp) * 0.9);
      ctx.restore();
      shockwave(ctx, w.x, c.ground, imp, 1.5, c.color, 1.4);
    }
    return win(0.5, 0.55, 0.7, 0.74, c.p) * 0.4 + pulse(c.p, 0.76, 0.06) * 0.7;
  },
};

// ------------------------------------------------------------------ m14 Corrente de Selos
// lança uma corrente dourada, prende o alvo e se puxa até ele com uma joelhada
const m14: DuelMove = {
  frame: (c) => {
    const tg = c.targets[0];
    const sd = sideOf(c, tg);
    const p = c.p;
    const hitX = cx(tg.x + sd * 55);
    if (p < 0.42) return { x: c.start.x, y: c.start.y, facing: faceTo(c.start.x, tg.x), alpha: 1, pose: p < 0.15 ? P.throwBack() : p < 0.3 ? P.throwFwd() : P.throwBack(0.4) };
    if (p < 0.55) {
      const k = seg(p, 0.42, 0.55);
      const q = arc(c.start, { x: hitX, y: tg.y - 20 }, k * k, 40);
      return { x: q.x, y: q.y, facing: faceTo(c.start.x, tg.x), alpha: 1, pose: P.lunge(1.6), ghosts: 5, aura: 1 };
    }
    const k = sm(0.6, 0.9, p);
    const land = cx(tg.x + sd * 170);
    const q = arc({ x: hitX, y: tg.y - 20 }, { x: land, y: c.ground }, k, 100);
    return { x: q.x, y: q.y, facing: (-sd) as 1 | -1, alpha: 1, pose: k > 0 && k < 0.95 ? P.fly() : P.after(1.5), rot: k > 0 && k < 0.95 ? sd * k * TAU : 0 };
  },
  front: (ctx, c, f) => {
    const tg = c.targets[0];
    const end = { x: tg.x, y: tg.y - CHEST };
    const hand = { x: f.x + f.facing * 26, y: f.y - 70 };
    const out = seg(c.p, 0.18, 0.32);
    const show = 1 - sm(0.56, 0.62, c.p);
    if (out > 0 && show > 0) {
      const tip = { x: lerp(hand.x, end.x, out), y: lerp(hand.y, end.y, out) - Math.sin(out * Math.PI) * 30 };
      const n = 16;
      ctx.save();
      glow(ctx, c.color, 10);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = lerp(hand.x, tip.x, t);
        const y = lerp(hand.y, tip.y, t) + Math.sin(t * Math.PI) * (c.p < 0.42 ? 10 : 0);
        ctx.strokeStyle = rgba(i % 2 ? c.color : '#fff3b0', show);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(x, y, 7, 4, Math.atan2(tip.y - hand.y, tip.x - hand.x) + (i % 2 ? 0 : Math.PI / 2), 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
      talisman(ctx, tip.x, tip.y, c.t * 8, c.color, show, 1.2);
    }
    // corrente enrolando o alvo
    const wrap = win(0.32, 0.38, 0.55, 0.62, c.p);
    for (let k = 0; k < 3; k++) {
      ctx.save();
      ctx.strokeStyle = rgba(c.color, wrap);
      ctx.lineWidth = 4;
      glow(ctx, c.color, 12);
      ctx.beginPath();
      ctx.ellipse(tg.x, tg.y - 35 - k * 25, 30, 8, 0.15, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    const kk = seg(c.p, 0.55, 0.82);
    impact(ctx, end.x, end.y, kk, c.color, c.seed, 1.2);
    slash(ctx, end.x, end.y - 10, sideOf(c, tg) > 0 ? Math.PI + 0.4 : -0.4, 60, kk, c.color2, c.color, 16);
    return pulse(c.p, 0.56, 0.07) * 0.8;
  },
};

// ------------------------------------------------------------------ m15 Iaijutsu Final
// tudo escurece, ele guarda a espada... um risco de luz, e todos são cortados de uma vez
const m15: DuelMove = {
  frame: (c) => {
    const dir = faceTo(c.start.x, centroid(c.everyone).x);
    const p = c.p;
    const far = dir < 0 ? cx(Math.min(...xs(c)) - 160) : cx(Math.max(...xs(c)) + 160);
    if (p < 0.48) return { x: c.start.x, y: c.start.y, facing: dir, alpha: 1, pose: p < 0.15 ? P.guard(-2.6) : P.crouch(-2.4), aura: sm(0.1, 0.45, p) };
    if (p < 0.5) return { x: lerp(c.start.x, far, seg(p, 0.48, 0.5)), y: c.ground, facing: dir, alpha: 0.4, pose: P.lunge(1.6), ghosts: 5, aura: 1 };
    if (p < 0.85) return { x: far, y: c.ground, facing: dir, alpha: 1, pose: p < 0.62 ? P.after(1.6) : P.guard(-2.4), aura: 0.8 };
    const a = blink(p, 0.86, 0.93);
    return { x: p < 0.895 ? far : c.start.x, y: c.ground, facing: (-dir) as 1 | -1, alpha: a, pose: P.guard() };
  },
  back: (ctx, c) => {
    darken(ctx, c, win(0.08, 0.35, 0.62, 0.8, c.p) * 0.65);
  },
  front: (ctx, c) => {
    const dir = faceTo(c.start.x, centroid(c.everyone).x);
    const far = dir < 0 ? cx(Math.min(...xs(c)) - 160) : cx(Math.max(...xs(c)) + 160);
    // brilho na bainha enquanto concentra
    const charge = sm(0.15, 0.47, c.p) * (1 - sm(0.47, 0.5, c.p));
    if (charge > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      orb(ctx, c.start.x - dir * 10, c.start.y - 45, 20 + charge * 30, c.color2, charge);
      ctx.restore();
    }
    // o risco
    cutLine(ctx, { x: c.start.x, y: c.ground - 55 }, { x: far, y: c.ground - 55 }, seg(c.p, 0.48, 0.75), c.color, 7);
    flash(ctx, c, pulse(c.p, 0.495, 0.025) * 0.5);
    // cortes atrasados em cada um
    c.everyone.forEach((e, i) => {
      const k = seg(c.p, 0.54 + i * 0.008, 0.8);
      const a = { x: e.x - 70, y: e.y - CHEST - 50 };
      const b = { x: e.x + 70, y: e.y - CHEST + 50 };
      cutLine(ctx, a, b, k, c.color2, 10);
      cutLine(ctx, { x: b.x, y: a.y }, { x: a.x, y: b.y }, seg(c.p, 0.57 + i * 0.008, 0.82), c.color, 6);
      impact(ctx, e.x, e.y - CHEST, k, c.color2, c.seed + i, 1);
    });
    // pétalas de luz caindo depois
    const after = seg(c.p, 0.58, 1);
    if (after > 0 && after < 1) {
      for (let i = 0; i < 20; i++) {
        const x = lerp(c.start.x, far, hash(c.seed, i));
        const y = c.ground - 200 + after * 200 * (0.5 + hash(c.seed + 1, i));
        ctx.save();
        ctx.globalAlpha = 1 - after;
        ctx.fillStyle = i % 2 ? c.color2 : c.color;
        ctx.translate(x, y);
        ctx.rotate(after * 6 + i);
        ctx.fillRect(-4, -1, 8, 2);
        ctx.restore();
      }
    }
    return pulse(c.p, 0.56, 0.1) * 1;
  },
};

// ------------------------------------------------------------------ m16 Pétalas de Aço
// gira a arma acima da cabeça e solta um furacão de pétalas de metal afiadas
const m16: DuelMove = {
  frame: (c) => {
    const dir = faceTo(c.start.x, centroid(c.everyone).x);
    const p = c.p;
    const spin = { ...P.raise(c.t * 18), twoHanded: false };
    const pose = p < 0.15 ? P.guard() : p < 0.5 ? spin : p < 0.62 ? P.throwFwd() : P.guard();
    return { x: c.start.x, y: c.start.y, facing: dir, alpha: 1, pose, aura: win(0.1, 0.2, 0.6, 0.7, p) };
  },
  front: (ctx, c, f) => {
    const src = { x: f.x, y: f.y - 150 };
    const N = 70;
    for (let i = 0; i < N; i++) {
      const tg = c.everyone[i % c.everyone.length];
      const born = 0.15 + hash(c.seed, i) * 0.25;
      const life = seg(c.p, born, born + 0.05);
      if (life <= 0) continue;
      const orbitA = c.t * 6 + (i / N) * TAU;
      const orbitR = 30 + hash(c.seed + 1, i) * 70;
      const home = { x: src.x + Math.cos(orbitA) * orbitR, y: src.y + Math.sin(orbitA) * orbitR * 0.4 };
      const go = seg(c.p, 0.46 + hash(c.seed + 2, i) * 0.06, 0.56);
      const end = { x: tg.x + (hash(c.seed + 3, i) - 0.5) * 90, y: tg.y - CHEST + (hash(c.seed + 4, i) - 0.5) * 80 };
      const swirl = Math.sin(go * Math.PI) * 80 * (i % 2 ? 1 : -1);
      const x = lerp(home.x, end.x, go);
      const y = lerp(home.y, end.y, go) - swirl;
      const scatter = seg(c.p, 0.58, 0.9);
      const sx = x + (hash(c.seed + 5, i) - 0.5) * 220 * scatter;
      const sy = y + scatter * scatter * 120;
      const alpha = life * (1 - scatter);
      if (alpha <= 0) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(sx, sy);
      ctx.rotate(c.t * 10 + i);
      glow(ctx, c.color, 8);
      const g = ctx.createLinearGradient(-8, 0, 8, 0);
      g.addColorStop(0, '#d8d8e8');
      g.addColorStop(0.5, '#ffffff');
      g.addColorStop(1, c.color);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-9, 0);
      ctx.quadraticCurveTo(0, -6, 9, 0);
      ctx.quadraticCurveTo(0, 6, -9, 0);
      ctx.fill();
      ctx.restore();
    }
    for (const e of c.everyone) {
      const k = seg(c.p, 0.54, 0.78);
      impact(ctx, e.x, e.y - CHEST, k, c.color, c.seed + Math.round(e.x), 0.8);
      for (let j = 0; j < 4; j++) cutLine(ctx, { x: e.x - 40 + j * 20, y: e.y - 100 }, { x: e.x - 20 + j * 20, y: e.y - 20 }, seg(c.p, 0.53 + j * 0.02, 0.75), c.color2, 3);
    }
    return pulse(c.p, 0.56, 0.1) * 0.5;
  },
};

// ------------------------------------------------------------------ m17 Martelo do Céu
// um círculo gigante abre no céu e uma espada de luz colossal cai no meio da arena
const m17: DuelMove = {
  frame: (c) => {
    const dir = faceTo(c.start.x, centroid(c.everyone).x);
    const p = c.p;
    const pose = p < 0.12 ? P.guard() : p < 0.48 ? P.point(0.1) : p < 0.6 ? { ...P.strike(2.4), armF: [0.6, 0.3] as [number, number] } : P.guard();
    return { x: c.start.x, y: c.start.y, facing: dir, alpha: 1, pose, aura: win(0.1, 0.3, 0.6, 0.75, p) };
  },
  back: (ctx, c) => {
    const cen = centroid(c.everyone);
    const a = win(0.1, 0.3, 0.6, 0.8, c.p);
    magicCircle(ctx, cx(cen.x), c.ground - 420, 220, c.color, a, c.t, 0.3, 11);
    magicCircle(ctx, cx(cen.x), c.ground - 420, 140, c.color2, a * 0.8, -c.t * 1.6, 0.3, 12);
    darken(ctx, c, a * 0.3);
  },
  front: (ctx, c) => {
    const cen = centroid(c.everyone);
    const x = cx(cen.x);
    const drop = seg(c.p, 0.42, 0.54);
    const fade = 1 - sm(0.62, 0.85, c.p);
    const len = 470;
    if (drop > 0 && fade > 0) {
      const tipY = lerp(c.ground - 420, c.ground + 30, drop * drop);
      lightBlade(ctx, x, tipY - len, Math.PI, len, 34, '#ffffff', c.color, fade, true);
      if (drop < 1) pillar(ctx, x, tipY - len - 200, 40, 200, c.color2, 0.5);
    }
    const k = seg(c.p, 0.54, 0.92);
    if (k > 0 && k < 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      orb(ctx, x, c.ground - 20, 150 + 260 * k, c.color, (1 - k) * 0.9);
      ctx.restore();
      shockwave(ctx, x, c.ground, k, 2, c.color2, 1.8);
      shockwave(ctx, x, c.ground, Math.max(0.01, k - 0.15), 1.5, c.color, 1.4);
      debris(ctx, x, c.ground, k, 1.4, c.seed, ['#2a2240', '#ffffff', c.color], 40, 1.5);
      for (const e of c.everyone) pillar(ctx, e.x, e.y - 260, 26 * (1 - k), 270, c.color2, (1 - k) * 0.8);
    }
    for (const e of c.everyone) impact(ctx, e.x, e.y - CHEST, seg(c.p, 0.55, 0.8), c.color2, c.seed + Math.round(e.x), 0.8);
    flash(ctx, c, pulse(c.p, 0.545, 0.035) * 0.75);
    return pulse(c.p, 0.57, 0.14) * 1;
  },
};

// ------------------------------------------------------------------ m18 Dança das Sombras
// derrete numa poça de sombra, que se divide e surge atrás de cada um ao mesmo tempo
function shadowSpot(c: DuelMoveCtx, i: number) {
  const e = c.everyone[i];
  const x = behind(c, e, 60);
  return { x, y: e.y, f: faceTo(x, e.x) };
}
const m18: DuelMove = {
  frame: (c) => {
    const p = c.p;
    const sp = shadowSpot(c, 0);
    const melt = sm(0.06, 0.2, p);
    if (p < 0.22) return { x: c.start.x, y: c.start.y + melt * 10, facing: faceTo(c.start.x, sp.x), alpha: 1 - melt, pose: P.crouch(-1.5) };
    if (p < 0.46) return { x: sp.x, y: sp.y, facing: sp.f, alpha: 0, pose: P.crouch() };
    if (p < 0.8) {
      const pose = p < 0.52 ? P.crouch(-0.6) : p < 0.66 ? P.strike() : P.guard();
      return { x: sp.x, y: sp.y, facing: sp.f, alpha: sm(0.46, 0.5, p) * (1 - sm(0.74, 0.8, p)), pose, aura: 1 };
    }
    const back = sm(0.86, 0.96, p);
    return { x: c.start.x, y: c.start.y, facing: faceTo(c.start.x, sp.x), alpha: back, pose: P.guard() };
  },
  back: (ctx, c, f) => {
    const n = Math.min(6, c.everyone.length);
    // poça saindo do boss e se espalhando até cada um
    const run = seg(c.p, 0.2, 0.46);
    for (let i = 0; i < n; i++) {
      const sp = shadowSpot(c, i);
      const x = lerp(c.start.x, sp.x, sm(0, 1, run));
      const a = c.p < 0.2 ? sm(0.08, 0.2, c.p) : 1 - sm(0.5, 0.56, c.p);
      if (a <= 0) continue;
      ctx.save();
      ctx.globalAlpha = a * 0.85;
      ctx.fillStyle = '#05030c';
      ctx.beginPath();
      ctx.ellipse(x, c.ground + 2, 34 + Math.sin(c.t * 9 + i) * 4, 7, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = rgba(c.color2, a);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
    // clones de sombra (o 0 é o boss de verdade)
    for (let i = 1; i < n; i++) {
      const sp = shadowSpot(c, i);
      const a = sm(0.46, 0.5, c.p) * (1 - sm(0.72, 0.8, c.p));
      ghostOf(ctx, c, sp.x, sp.y, f.pose, sp.f, '#120a22', a * 0.95, 0);
      ghostOf(ctx, c, sp.x, sp.y, f.pose, sp.f, c.color2, a * 0.35, 14);
    }
  },
  front: (ctx, c) => {
    const n = Math.min(6, c.everyone.length);
    darken(ctx, c, win(0.15, 0.3, 0.6, 0.75, c.p) * 0.35);
    for (let i = 0; i < c.everyone.length; i++) {
      const e = c.everyone[i];
      const sp = shadowSpot(c, Math.min(i, n - 1));
      const k = seg(c.p, 0.53, 0.8);
      slash(ctx, e.x, e.y - CHEST, sp.f > 0 ? 0.3 : Math.PI - 0.3, 70, k, '#2a1a40', c.color2, 20);
      impact(ctx, e.x, e.y - CHEST, k, c.color2, c.seed + i, 0.9);
    }
    // mãos de sombra puxando
    const hands = win(0.3, 0.4, 0.52, 0.58, c.p);
    for (const e of c.everyone) {
      for (let j = 0; j < 3; j++) {
        const h = hands * (30 + j * 10);
        ctx.save();
        ctx.strokeStyle = rgba('#120a22', hands);
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(e.x - 18 + j * 18, c.ground);
        ctx.quadraticCurveTo(e.x - 24 + j * 18, c.ground - h * 0.6, e.x - 12 + j * 14, c.ground - h);
        ctx.stroke();
        ctx.restore();
      }
    }
    return pulse(c.p, 0.56, 0.08) * 0.7;
  },
};

// ------------------------------------------------------------------ m19 Contra-ataque
// postura de defesa com escudo de luz; aparou, some e lança o alvo para cima
const m19: DuelMove = {
  frame: (c) => {
    const tg = c.targets[0];
    const sd = sideOf(c, tg);
    const p = c.p;
    const bx = behind(c, tg, 60);
    const a = blink(p, 0.4, 0.46) * blink(p, 0.8, 0.88);
    if (p < 0.43) return { x: c.start.x, y: c.start.y, facing: faceTo(c.start.x, tg.x), alpha: a, pose: p > 0.3 && p < 0.36 ? P.hurt(0.3) : P.guard(0.4), aura: 0.6 };
    if (p < 0.84) {
      const pose = p < 0.5 ? P.crouch(2.6) : p < 0.62 ? P.raise(0.2) : P.after(0.4);
      const lift = win(0.5, 0.56, 0.62, 0.72, p) * 60;
      return { x: bx, y: tg.y - lift, facing: faceTo(bx, tg.x), alpha: a, pose, aura: 1 };
    }
    return { x: c.start.x, y: c.start.y, facing: faceTo(c.start.x, tg.x), alpha: a, pose: P.guard() };
  },
  front: (ctx, c, f) => {
    const tg = c.targets[0];
    const sd = sideOf(c, tg);
    const bx = behind(c, tg, 60);
    // escudo hexagonal
    const sh = win(0.05, 0.12, 0.36, 0.42, c.p);
    if (sh > 0 && c.p < 0.44) {
      const x = f.x - sd * 34;
      const y = f.y - 60;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, c.color2, 14);
      ctx.strokeStyle = rgba(c.color, sh);
      ctx.fillStyle = rgba(c.color2, sh * 0.15);
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = (i / 6) * TAU + Math.PI / 6;
        const px = x + Math.cos(a) * 26;
        const py = y + Math.sin(a) * 60;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      // faísca da aparada
      sparks(ctx, x, y - 10, seg(c.p, 0.3, 0.45), 1, c.seed, c.color2, 24, 120);
    }
    tpBurst(ctx, c.start.x, c.start.y, seg(c.p, 0.38, 0.55), c.color, c.color2, c.seed);
    tpBurst(ctx, bx, tg.y, seg(c.p, 0.44, 0.62), c.color, c.color2, c.seed + 1);
    tpBurst(ctx, c.start.x, c.start.y, seg(c.p, 0.84, 1), c.color, c.color2, c.seed + 2);
    // corte vertical que lança o alvo
    const k = seg(c.p, 0.5, 0.8);
    slash(ctx, tg.x, tg.y - CHEST - 20, -Math.PI / 2, 95, k, c.color, c.color2, 24, 2.2);
    if (k > 0 && k < 1) pillar(ctx, tg.x, tg.y - 300, 20 * (1 - k), 300, c.color2, (1 - k) * 0.7);
    impact(ctx, tg.x, tg.y - CHEST, seg(c.p, 0.54, 0.8), c.color2, c.seed, 1.1);
    return pulse(c.p, 0.33, 0.04) * 0.3 + pulse(c.p, 0.56, 0.08) * 0.8;
  },
};

// ------------------------------------------------------------------ m20 Despertar: Mil Lâminas
// sobe ao céu, abre o domínio: mil lâminas giram na arena e caem em todos de uma vez
function sky(c: DuelMoveCtx) {
  return { x: cx(centroid(c.everyone).x * 0.4 + c.W * 0.3), y: c.ground - 280 };
}
const m20: DuelMove = {
  frame: (c) => {
    const s = sky(c);
    const p = c.p;
    const dir = faceTo(c.start.x, centroid(c.everyone).x);
    if (p < 0.16) {
      const k = sm(0.02, 0.16, p);
      return { x: lerp(c.start.x, s.x, k), y: lerp(c.start.y, s.y, k), facing: dir, alpha: 1, pose: P.fly(), ghosts: 3, aura: 1 };
    }
    if (p < 0.82) {
      const pose = p < 0.3 ? P.pray() : p < 0.46 ? P.raise(0) : p < 0.62 ? { ...P.point(0.2), armF: [1.6, 0.1] as [number, number] } : P.raise(0);
      return { x: s.x, y: s.y + Math.sin(c.t * 3) * 6, facing: dir, alpha: 1, pose, aura: 1 };
    }
    const k = sm(0.82, 0.97, p);
    return { x: lerp(s.x, c.start.x, k), y: lerp(s.y, c.start.y, k * k), facing: dir, alpha: 1, pose: k < 1 ? P.fly() : P.guard(), aura: 1 - k * 0.5 };
  },
  back: (ctx, c) => {
    const s = sky(c);
    const dom = win(0.12, 0.3, 0.75, 0.9, c.p);
    darken(ctx, c, dom * 0.75, '#0c0418');
    if (dom <= 0) return;
    // rachaduras rosas no "céu" do domínio
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + hash(c.seed, i);
      lightning(ctx, { x: s.x, y: s.y - 60 }, { x: s.x + Math.cos(a) * 700, y: s.y - 60 + Math.sin(a) * 420 }, c.seed + i, 1.2, c.color, dom * 0.5, 2);
    }
    ctx.restore();
    magicCircle(ctx, s.x, s.y - 60, 260 * dom, c.color2, dom, c.t * 0.8, 1, 20);
    magicCircle(ctx, s.x, c.ground + 4, 420 * dom, c.color, dom * 0.7, -c.t * 0.6, 0.18, 21);
  },
  front: (ctx, c) => {
    const s = sky(c);
    const dom = win(0.12, 0.3, 0.75, 0.9, c.p);
    tpBurst(ctx, s.x, s.y, seg(c.p, 0.14, 0.34), c.color, c.color2, c.seed);
    // anel de lâminas girando em volta da arena
    const N = 48;
    for (let i = 0; i < N; i++) {
      const tg = c.everyone[i % c.everyone.length];
      const ring = (i / N) * TAU + c.t * 1.4 * (i % 2 ? 1 : -1);
      const rr = 260 + (i % 3) * 70;
      const home = { x: s.x + Math.cos(ring) * rr * 1.5, y: s.y - 40 + Math.sin(ring) * rr * 0.55 };
      const appear = sm(0.18 + (i / N) * 0.15, 0.24 + (i / N) * 0.15, c.p);
      const go = seg(c.p, 0.46 + hash(c.seed, i) * 0.05, 0.555);
      const end = { x: tg.x + (hash(c.seed + 1, i) - 0.5) * 80, y: tg.y - 20 - hash(c.seed + 2, i) * 60 };
      const x = lerp(home.x, end.x, go * go);
      const y = lerp(home.y, end.y, go * go);
      const ang = go > 0 ? Math.atan2(end.x - home.x, -(end.y - home.y)) : ring + Math.PI;
      const fade = 1 - sm(0.6, 0.72, c.p);
      lightBlade(ctx, x, y, ang, 52, 6, '#ffffff', i % 3 ? c.color : c.color2, appear * fade * Math.max(dom, go), false);
    }
    // explosão final
    const k = seg(c.p, 0.555, 0.9);
    if (k > 0 && k < 1) {
      for (const e of c.everyone) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        pillar(ctx, e.x, e.y - 700, 50 * (1 - k) + 6, 710, c.color, (1 - k) * 0.75);
        orb(ctx, e.x, e.y - CHEST, 90 + k * 160, c.color2, (1 - k) * 0.9);
        ctx.restore();
        shockwave(ctx, e.x, e.y, k, 1.2, c.color, 1.2);
        debris(ctx, e.x, e.y, k, 1, c.seed + Math.round(e.x), ['#2a2240', c.color, '#ffffff'], 18, 1.2);
      }
      sparks(ctx, s.x, s.y, k, 2, c.seed, c.color2, 40, 400);
    }
    flash(ctx, c, pulse(c.p, 0.555, 0.035) * 0.45);
    flash(ctx, c, pulse(c.p, 0.58, 0.05) * 0.4, c.color);
    return win(0.2, 0.3, 0.44, 0.48, c.p) * 0.2 + pulse(c.p, 0.57, 0.14) * 1;
  },
};

export const MOVES_B: Record<string, DuelMove> = { m11, m12, m13, m14, m15, m16, m17, m18, m19, m20 };
void self;
