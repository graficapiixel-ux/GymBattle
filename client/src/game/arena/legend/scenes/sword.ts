import {
  KO, P, TAU, aura, avatar, debris, easeIn, glow, godRays, groundCrack, lightBlade, lin, magicCircle, mix, noGlow, orb, pillar,
  rgba, rising, rnd, shockwave, sm, sparks, stormClouds, lightning, victim, win,
} from '../kit';
import type { Scene } from '../types';

export const SWORD: Scene[] = [
  {
    id: 'sword-dawn',
    cat: 'sword',
    name: 'LÂMINA DO AMANHECER',
    sub: 'o sol nasce para cortar a escuridão',
    color: '#ffe9b0',
    glow: '#ffb020',
    sky: ['#07060f', '#2a1a10'],
    frames: [0.24, 0.6, 0.83],
    music: { root: 50, mood: 'heroic', bpm: 132, lead: 'brass' },
    backdrop(ctx, p, { w, h }, a) {
      // o sol nasce atrás do herói
      const rise = sm(0.12, 0.55, p);
      const sy = mix(h * 1.15, h * 0.42, rise);
      const sx = a.x;
      const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, h * 1.2);
      halo.addColorStop(0, `rgba(255,200,90,${0.75 * rise})`);
      halo.addColorStop(0.3, `rgba(255,120,40,${0.35 * rise})`);
      halo.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);
      godRays(ctx, sx, sy, 18, h * 1.4, 0.05, '#ffd27a', 0.35 * rise, p * 0.6);
      const sun = ctx.createRadialGradient(sx, sy, 0, sx, sy, h * 0.16);
      sun.addColorStop(0, '#fffbe8');
      sun.addColorStop(0.7, '#ffd070');
      sun.addColorStop(1, 'rgba(255,170,60,0)');
      ctx.fillStyle = sun;
      ctx.beginPath();
      ctx.arc(sx, sy, h * 0.16, 0, TAU);
      ctx.fill();
    },
    world(ctx, p, A, B) {
      const s = A.s, d = B.x >= A.x ? 1 : -1;
      const swing = easeIn(lin(0.68, KO, p));
      const pose = p > 0.68 ? P.strike(2.3) : p > 0.1 ? P.raise(0) : P.guard();
      const hx = A.x + d * 4 * s, hy = A.y - 104 * s;
      // luz sendo sugada para a espada
      if (p > 0.12 && p < 0.5) {
        const k = lin(0.12, 0.5, p);
        ctx.save();
        glow(ctx, '#ffc040', 8 * s);
        for (let i = 0; i < 60; i++) {
          const t0 = rnd(11, i);
          const f = (t0 + k * 2.2) % 1;
          const a = rnd(12, i) * TAU;
          const r = (1 - f) * (140 + rnd(13, i) * 120) * s;
          ctx.globalAlpha = f * 0.9;
          ctx.fillStyle = i % 3 ? '#ffe39a' : '#ffffff';
          const x = hx + Math.cos(a) * r, y = hy - 20 * s + Math.sin(a) * r;
          ctx.fillRect(x, y, 2.5 * s, 2.5 * s);
        }
        ctx.restore();
      }
      aura(ctx, A, pose, ['#ff7a10', '#ffc040', '#fff2c0'], win(0.15, 0.35, 0.9, 1, p), p);
      // lâmina de luz gigante
      const grow = sm(0.45, 0.62, p) * (1 - sm(0.9, 0.97, p));
      const toB = Math.atan2(B.x + d * 10 * s - hx, -(B.y - 10 * s - hy));
      const ang = mix(-0.12 * d, toB, swing);
      const len = 380 * s * grow;
      if (swing > 0 && swing < 1) {
        // rastro do golpe (leque de luz)
        ctx.save();
        glow(ctx, '#ffb020', 30 * s);
        const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, len);
        g.addColorStop(0, 'rgba(255,220,140,0)');
        g.addColorStop(0.7, 'rgba(255,220,140,0.25)');
        g.addColorStop(1, 'rgba(255,245,210,0.7)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        const a0 = -Math.PI / 2 + Math.min(-0.12 * d, ang), a1 = -Math.PI / 2 + Math.max(-0.12 * d, ang);
        ctx.arc(hx, hy, len, a0, a1);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      lightBlade(ctx, hx, hy, ang, len, 17 * s, '#ffe9b0', '#ffb020', 0.95);
      avatar(ctx, A, pose, { t: p * 7 });
      // impacto
      const hit = lin(KO, KO + 0.18, p);
      pillar(ctx, B.x, B.y, 40 * s * (1 - hit), 900 * s, '#ffc040', win(KO - 0.01, KO, KO + 0.08, KO + 0.18, p));
      groundCrack(ctx, A.x + d * 30 * s, B.x + d * 160 * s, A.y + 1, sm(KO, KO + 0.06, p) * (1 - sm(0.93, 1, p)), s, 21, '#ffb020');
      victim(ctx, B, p, 'launch');
      shockwave(ctx, B.x, B.y, hit, s, '#ffc040');
      debris(ctx, B.x, B.y, hit, s, 31);
      sparks(ctx, B.x, B.y - 40 * s, lin(KO, KO + 0.1, p), s, 41, '#ffd070', 40, 220);
      rising(ctx, B.x, B.y, 300 * s, 250 * s, p, 51, 40, '#ffd070', s, win(KO, KO + 0.05, 0.92, 1, p));
    },
  },
  {
    id: 'sword-storm',
    cat: 'sword',
    name: 'TEMPESTADE DE ESPADAS',
    sub: 'mil lâminas respondem ao chamado',
    color: '#e0fbff',
    glow: '#35c8ff',
    sky: ['#02060e', '#10243a'],
    frames: [0.24, 0.62, 0.825],
    music: { root: 45, mood: 'storm', bpm: 140, lead: 'strings' },
    backdrop(ctx, p, { w, h }) {
      stormClouds(ctx, w, h, p, '#1a2c44', 0.9);
      // relâmpagos ao fundo
      for (let i = 0; i < 4; i++) {
        const t = 0.2 + i * 0.13;
        const k = win(t, t + 0.005, t + 0.015, t + 0.03, p);
        if (k > 0) {
          ctx.fillStyle = `rgba(160,220,255,${0.18 * k})`;
          ctx.fillRect(0, 0, w, h);
          const x = w * (0.15 + rnd(9, i) * 0.7);
          lightning(ctx, { x, y: 0 }, { x: x + (rnd(10, i) - 0.5) * 120, y: h * 0.55 }, 60 + i, 1.5, '#9fe0ff', k, 2);
        }
      }
    },
    world(ctx, p, A, B) {
      const s = A.s, d = B.x >= A.x ? 1 : -1;
      const cx = B.x - d * 20 * s, cy = B.y - 285 * s;
      const pose = p > 0.1 && p < 0.9 ? P.point(-0.1) : P.guard();
      aura(ctx, A, pose, ['#0a78c0', '#35c8ff', '#dff8ff'], win(0.12, 0.3, 0.9, 1, p), p);
      avatar(ctx, A, pose, { t: p * 7 });
      // círculo mágico no céu
      const circ = sm(0.14, 0.34, p) * (1 - sm(0.86, 0.95, p));
      magicCircle(ctx, cx, cy, 175 * s * circ, '#7fdcff', circ, p * 3, 0.28, 7);
      // raio de ligação da mão até o círculo
      if (circ > 0 && p < 0.62) {
        ctx.save();
        glow(ctx, '#35c8ff', 12 * s);
        ctx.strokeStyle = `rgba(200,240,255,${0.6 * circ})`;
        ctx.lineWidth = 2 * s;
        ctx.beginPath();
        ctx.moveTo(A.x + d * 6 * s, A.y - 108 * s);
        ctx.quadraticCurveTo(A.x + d * 60 * s, cy - 40 * s, cx, cy);
        ctx.stroke();
        ctx.restore();
      }
      // espadas se formando e caindo
      const N = 24;
      for (let i = 0; i < N; i++) {
        const appear = sm(0.3 + (i / N) * 0.26, 0.34 + (i / N) * 0.26, p);
        if (appear <= 0) continue;
        const ox = (rnd(71, i) - 0.5) * 300 * s;
        const oy = (rnd(72, i) - 0.5) * 70 * s;
        const tf = 0.6 + (i / N) * 0.16;
        const fall = easeIn(lin(tf, tf + 0.035, p));
        const land = { x: B.x + (rnd(73, i) - 0.5) * 240 * s, y: B.y + 6 * s };
        const x = mix(cx + ox, land.x, fall), y = mix(cy + 60 * s + oy, land.y, fall);
        const tilt = (rnd(74, i) - 0.5) * 0.35 * fall;
        const fade = 1 - sm(0.9, 0.98, p);
        // lâmina aponta para baixo (ângulo π)
        lightBlade(ctx, x, y - 70 * s, Math.PI + tilt, 70 * s, 5 * s, '#e0fbff', '#35c8ff', appear * fade);
        if (fall >= 1) sparks(ctx, land.x, land.y, lin(tf + 0.035, tf + 0.08, p), s * 0.6, 80 + i, '#9fe8ff', 10, 80);
      }
      // a espada gigante final
      const big = sm(0.45, 0.58, p) * (1 - sm(0.9, 0.97, p));
      const bf = easeIn(lin(0.73, KO, p));
      const by = mix(cy + 150 * s, B.y + 8 * s, bf);
      lightBlade(ctx, B.x, by - 300 * s * big, Math.PI, 300 * s * big, 24 * s, '#ffffff', '#35c8ff', big);
      victim(ctx, B, p, 'shock');
      const hit = lin(KO, KO + 0.18, p);
      orb(ctx, B.x, B.y - 10 * s, 160 * s * (1 - hit), '#35c8ff', win(KO - 0.01, KO, KO + 0.05, KO + 0.15, p));
      shockwave(ctx, B.x, B.y, hit, s, '#7fdcff', 1.2);
      debris(ctx, B.x, B.y, hit, s, 91, ['#304050', '#506070', '#9fe8ff']);
      for (let i = 0; i < 3; i++) lightning(ctx, { x: B.x, y: B.y - 30 * s }, { x: B.x + (rnd(95, i) - 0.5) * 300 * s, y: B.y - rnd(96, i) * 200 * s }, 97 + i, 1.4 * s, '#7fdcff', win(KO, KO + 0.01, KO + 0.05, KO + 0.08, p), 1);
      noGlow(ctx);
      void rgba;
    },
  },
];
