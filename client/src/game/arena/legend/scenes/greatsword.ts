import {
  KO, P, TAU, aura, avatar, crescent, debris, easeIn, easeOut, glow, groundCrack, lightBlade, lin, mix, moon, noGlow, orb, pillar,
  rgba, rising, rnd, shockwave, sm, sparks, victim, win,
} from '../kit';
import type { Scene } from '../types';

export const GREATSWORD: Scene[] = [
  {
    id: 'gs-skybreaker',
    cat: 'greatsword',
    name: 'ROMPE-CÉUS',
    sub: 'um salto, um giro, um corte que parte o mundo',
    color: '#ffd9b0',
    glow: '#ff4a10',
    sky: ['#120202', '#3a0c04'],
    frames: [0.24, 0.6, 0.83],
    music: { root: 43, mood: 'fire', bpm: 136, lead: 'brass' },
    backdrop(ctx, p, { w, h }) {
      const g = ctx.createRadialGradient(w / 2, h, 0, w / 2, h, h * 1.2);
      g.addColorStop(0, 'rgba(255,70,10,0.55)');
      g.addColorStop(1, 'rgba(255,70,10,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // cinzas caindo
      ctx.fillStyle = 'rgba(255,200,160,0.5)';
      for (let i = 0; i < 70; i++) {
        const y = (rnd(1, i) * h + p * h * 1.5 * (0.5 + rnd(2, i))) % h;
        const x = rnd(3, i) * w + Math.sin(p * 8 + i) * 10;
        ctx.fillRect(x, y, 2, 2);
      }
    },
    world(ctx, p, A, B) {
      const s = A.s, d = B.x >= A.x ? 1 : -1;
      const up = sm(0.28, 0.5, p);
      const down = easeIn(lin(0.72, KO, p));
      const x = mix(A.x, B.x - d * 40 * s, sm(0.3, 0.6, p));
      const y = A.y - up * 160 * s * (1 - down);
      const spinning = p > 0.3 && p < 0.72;
      const spinA = spinning ? (p - 0.3) * 60 * d : 0;
      const me = { ...A, x, y };
      const pose = p < 0.28 ? (p > 0.1 ? P.crouch(1.9) : P.guard(0.35)) : spinning ? P.spin(spinA, 1.2) : p < KO ? P.dive(2.9) : P.strike(2.6);
      // roda de fogo do giro
      if (spinning) {
        const k = win(0.3, 0.36, 0.66, 0.72, p);
        ctx.save();
        ctx.translate(x, y - 45 * s);
        for (let i = 0; i < 3; i++) {
          ctx.rotate(spinA * 0.4 + i * 2.1);
          glow(ctx, '#ff4a10', 20 * s);
          ctx.strokeStyle = rgba(i ? '#ffb040' : '#ffffff', k * (0.9 - i * 0.2));
          ctx.lineWidth = (10 - i * 3) * s;
          ctx.beginPath();
          ctx.arc(0, 0, (70 + i * 8) * s, 0, 4.2);
          ctx.stroke();
        }
        ctx.restore();
        orb(ctx, x, y - 45 * s, 110 * s, '#ff4a10', 0.35 * k);
      }
      aura(ctx, me, pose, ['#ff2a00', '#ff8a1a', '#ffd060'], win(0.1, 0.25, 0.9, 1, p), p, { dx: 0 });
      avatar(ctx, me, pose, { t: p * 7, rot: spinning ? spinA * 0.05 : 0 });
      // corte vertical descendo
      if (p > 0.7 && p < KO + 0.1) {
        const k = win(0.7, 0.74, KO + 0.02, KO + 0.1, p);
        ctx.save();
        glow(ctx, '#ff4a10', 40 * s);
        const top = A.y - 600 * s, bot = B.y;
        const g = ctx.createLinearGradient(0, top, 0, bot);
        g.addColorStop(0, 'rgba(255,120,40,0)');
        g.addColorStop(0.6, `rgba(255,190,90,${0.8 * k})`);
        g.addColorStop(1, `rgba(255,255,240,${k})`);
        ctx.fillStyle = g;
        const wd = 14 * s * k;
        const cx = B.x - d * 8 * s;
        ctx.beginPath();
        ctx.moveTo(cx - wd, top);
        ctx.quadraticCurveTo(cx - wd * 2.2, (top + bot) / 2, cx, bot);
        ctx.quadraticCurveTo(cx + wd * 2.2, (top + bot) / 2, cx + wd, top);
        ctx.fill();
        ctx.restore();
      }
      if (down > 0 && p < KO) lightBlade(ctx, x + d * 20 * s, y - 20 * s, Math.PI * 0.95 * d, 150 * s, 12 * s, '#ffd9b0', '#ff4a10', down);
      // fenda de lava
      const hit = lin(KO, KO + 0.18, p);
      const fis = sm(KO, KO + 0.05, p) * (1 - sm(0.93, 1, p));
      groundCrack(ctx, B.x, B.x + 280 * s, B.y + 1, fis, s, 3, '#ff5a10', 5);
      groundCrack(ctx, B.x, B.x - 280 * s, B.y + 1, fis, s, 4, '#ff5a10', 5);
      pillar(ctx, B.x, B.y, 30 * s * (1 - hit), 700 * s, '#ff6a20', win(KO - 0.005, KO, KO + 0.06, KO + 0.16, p));
      victim(ctx, B, p, 'split');
      shockwave(ctx, B.x, B.y, hit, s, '#ff8a3a', 1.2);
      debris(ctx, B.x, B.y, hit, s, 17, ['#3a1a10', '#6a2a10', '#ffb050'], 34, 1.2);
      sparks(ctx, B.x, B.y - 10 * s, lin(KO, KO + 0.1, p), s, 18, '#ffb050', 40, 240);
      rising(ctx, B.x, B.y, 400 * s, 300 * s, p, 19, 50, '#ff8a3a', s, win(KO, KO + 0.03, 0.92, 1, p));
    },
  },
  {
    id: 'gs-eclipse',
    cat: 'greatsword',
    name: 'ECLIPSE CARMESIM',
    sub: 'a lua sangra na sua lâmina',
    color: '#ffd0d0',
    glow: '#ff1a3a',
    sky: ['#050005', '#1e0410'],
    frames: [0.24, 0.58, 0.83],
    music: { root: 41, mood: 'dark', bpm: 120, lead: 'choir' },
    backdrop(ctx, p, { w, h }) {
      const mx = w * 0.5, my = h * 0.22, r = h * 0.13;
      const red = sm(0.1, 0.35, p);
      moon(ctx, mx, my, r, red > 0.5 ? '#ff4050' : '#e8e0e0', 1, 2.6);
      ctx.fillStyle = `rgba(255,20,40,${red * 0.6})`;
      ctx.beginPath(); ctx.arc(mx, my, r, 0, TAU); ctx.fill();
      // disco negro cobrindo a lua
      const cover = sm(0.25, 0.55, p);
      if (cover > 0) {
        ctx.save();
        glow(ctx, '#ff1a3a', 40);
        ctx.fillStyle = '#050005';
        ctx.beginPath();
        ctx.arc(mx + (1 - cover) * r * 2.1, my, r * 0.98, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      // raios vermelhos da coroa
      if (cover > 0.8) {
        ctx.save();
        ctx.globalAlpha = sm(0.8, 1, cover);
        for (let i = 0; i < 40; i++) {
          const a = (i / 40) * TAU + p;
          const l = r * (1.15 + rnd(8, i) * 0.6);
          ctx.strokeStyle = 'rgba(255,60,80,0.6)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(mx + Math.cos(a) * r, my + Math.sin(a) * r);
          ctx.lineTo(mx + Math.cos(a) * l, my + Math.sin(a) * l);
          ctx.stroke();
        }
        ctx.restore();
      }
    },
    world(ctx, p, A, B) {
      const s = A.s, d = B.x >= A.x ? 1 : -1;
      const charge = win(0.2, 0.3, 0.55, 0.6, p);
      const spin = p > 0.66 && p < KO + 0.04;
      const pose = p < 0.1 ? P.guard(0.35) : p < 0.6 ? P.raise(0) : p < 0.66 ? P.throwBack(-1.6) : spin ? P.spin((p - 0.66) * 80, 1.57) : P.after(1.9);
      // energia descendo da lua até a lâmina
      if (charge > 0) {
        ctx.save();
        glow(ctx, '#ff1a3a', 14 * s);
        for (let i = 0; i < 7; i++) {
          const tx = A.x + d * 2 * s, ty = A.y - 150 * s;
          const sx = A.x + (rnd(5, i) - 0.5) * 300 * s + 100 * s * d, sy = A.y - 330 * s;
          const phase = (p * 5 + rnd(6, i)) % 1;
          ctx.strokeStyle = `rgba(255,${60 + i * 12},${80 + i * 5},${0.75 * charge})`;
          ctx.lineWidth = (2 + rnd(7, i) * 3) * s;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.bezierCurveTo(sx + 40 * s * Math.sin(i + p * 9), (sy + ty) / 2, tx - 30 * s, ty - 60 * s, tx, ty);
          ctx.stroke();
          const bx = mix(sx, tx, phase), by = mix(sy, ty, phase);
          orb(ctx, bx, by, 7 * s, '#ff4060', 0.9 * charge);
        }
        ctx.restore();
      }
      aura(ctx, A, pose, ['#600010', '#ff1a3a', '#ffb0b8'], win(0.25, 0.45, 0.9, 1, p), p);
      avatar(ctx, A, pose, { t: p * 7 });
      if (charge > 0 || (p > 0.55 && p < 0.68)) orb(ctx, A.x + d * 2 * s, A.y - 150 * s, 40 * s, '#ff1a3a', Math.max(charge, win(0.55, 0.58, 0.64, 0.68, p)));
      // onda horizontal em meia-lua saindo do giro
      const wave = lin(0.68, KO + 0.02, p);
      if (wave > 0 && wave < 1) {
        const r = mix(30, Math.abs(B.x - A.x) + 30, easeOut(wave)) * (wave > 0 ? 1 : 0);
        ctx.save();
        ctx.translate(A.x, A.y - 45 * s);
        ctx.scale(1, 0.22);
        glow(ctx, '#ff1a3a', 30 * s);
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = i === 0 ? `rgba(255,240,240,${1 - wave * 0.5})` : `rgba(255,30,60,${(0.8 - i * 0.2) * (1 - wave * 0.4)})`;
          ctx.lineWidth = (i === 0 ? 8 : 30 - i * 6) * s;
          ctx.beginPath();
          ctx.arc(0, 0, r * s + i * 6 * s, 0, TAU);
          ctx.stroke();
        }
        ctx.restore();
        crescent(ctx, A.x + d * r * s, A.y - 45 * s, 70 * s, 22 * s, d > 0 ? 0 : Math.PI, '#ff5060', '#ff1a3a', 1 - wave * 0.3, 2.2);
      }
      victim(ctx, B, p, 'split');
      const hit = lin(KO, KO + 0.18, p);
      sparks(ctx, B.x, B.y - 50 * s, hit, s, 33, '#ff4060', 36, 200);
      rising(ctx, B.x, B.y, 200 * s, 200 * s, p, 34, 30, '#ff4060', s, win(KO, KO + 0.03, 0.9, 1, p));
      noGlow(ctx);
      void debris; void shockwave; void pillar; void groundCrack;
    },
  },
];
