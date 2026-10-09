import {
  KO, P, TAU, aura, avatar, debris, easeIn, glow, groundCrack, lin, mix, noGlow, orb, pillar, rising, rnd, shockwave, silhouette, sm,
  smoke, sparks, tube, victim, win,
} from '../kit';
import type { Scene } from '../types';

/** Espinho de pedra saindo do chão. */
function spike(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, w: number, lean: number, s: number, seed: number) {
  if (h <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(lean);
  const g = ctx.createLinearGradient(-w, 0, w, 0);
  g.addColorStop(0, '#3a2a1c');
  g.addColorStop(0.45, '#8a6a48');
  g.addColorStop(0.55, '#a8845a');
  g.addColorStop(1, '#4a3424');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-w, 0);
  ctx.lineTo(-w * 0.55, -h * 0.55);
  ctx.lineTo(-w * 0.15, -h);
  ctx.lineTo(w * 0.2, -h * 0.7);
  ctx.lineTo(w * 0.6, -h * 0.4);
  ctx.lineTo(w, 0);
  ctx.closePath();
  ctx.fill();
  // rachaduras brilhando
  glow(ctx, '#ffb040', 8 * s);
  ctx.strokeStyle = 'rgba(255,190,90,0.8)';
  ctx.lineWidth = 1.5 * s;
  ctx.beginPath();
  ctx.moveTo((rnd(seed, 1) - 0.5) * w, -h * 0.1);
  ctx.lineTo((rnd(seed, 2) - 0.5) * w * 0.8, -h * 0.4);
  ctx.lineTo((rnd(seed, 3) - 0.5) * w * 0.5, -h * 0.7);
  ctx.stroke();
  ctx.restore();
}

export const HAMMER: Scene[] = [
  {
    id: 'hammer-meteor',
    cat: 'hammer',
    name: 'QUEDA DO METEORO',
    sub: 'ele sobe ao céu e volta como uma estrela',
    color: '#ffe0b0',
    glow: '#ff6a10',
    sky: ['#0a0306', '#2a0e0a'],
    frames: [0.24, 0.73, 0.83],
    music: { root: 38, mood: 'fire', bpm: 124, lead: 'brass' },
    backdrop(ctx, p, { w, h }, a, b) {
      // o céu acende onde o meteoro vai aparecer
      const k = sm(0.45, 0.7, p);
      const g = ctx.createRadialGradient(b.x - 200, 0, 0, b.x - 200, 0, h);
      g.addColorStop(0, `rgba(255,140,40,${0.6 * k})`);
      g.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      void a;
    },
    world(ctx, p, A, B) {
      const s = A.s, d = B.x >= A.x ? 1 : -1;
      // agacha, salta para fora da tela
      const jump = easeIn(lin(0.28, 0.42, p));
      if (p < 0.42) {
        const pose = p < 0.28 ? (p > 0.1 ? P.crouch(-0.4) : P.guard(-0.55)) : P.raise(-0.5);
        const me = { ...A, y: A.y - jump * 700 * s };
        aura(ctx, me, pose, ['#ff2a00', '#ff8a1a', '#ffe060'], win(0.1, 0.25, 0.9, 1, p), p);
        avatar(ctx, me, pose, { t: p * 7 });
        smoke(ctx, A.x, A.y - 5 * s, s, lin(0.28, 0.45, p), 7, 'rgba(120,100,90,', 1.6);
        if (jump > 0) {
          const g = ctx.createLinearGradient(0, me.y, 0, A.y);
          g.addColorStop(0, 'rgba(255,160,60,0)');
          g.addColorStop(1, 'rgba(255,200,120,0.6)');
          ctx.fillStyle = g;
          ctx.fillRect(A.x - 10 * s, me.y - 60 * s, 20 * s, A.y - me.y);
        }
      }
      // o meteoro
      const fl = lin(0.55, KO, p);
      const fall = fl * fl;
      if (p > 0.55 && p < KO) {
        const sx = B.x - d * 300 * s, sy = B.y - 400 * s;
        const x = mix(sx, B.x, fall), y = mix(sy, B.y - 30 * s, fall);
        const ang = Math.atan2(B.y - sy, B.x - sx);
        // cauda de fogo
        const tail = [];
        for (let i = 0; i <= 12; i++) tail.push({ x: x - Math.cos(ang) * i * 26 * s * (0.5 + fall), y: y - Math.sin(ang) * i * 26 * s * (0.5 + fall) });
        const g = ctx.createLinearGradient(x, y, tail[12].x, tail[12].y);
        g.addColorStop(0, 'rgba(255,255,220,0.95)');
        g.addColorStop(0.3, 'rgba(255,160,40,0.8)');
        g.addColorStop(1, 'rgba(255,60,10,0)');
        glow(ctx, '#ff6a10', 40 * s);
        tube(ctx, tail, (k) => (1 - k) * 90 * s, g);
        noGlow(ctx);
        orb(ctx, x, y, 70 * s, '#ff8a20', 1);
        silhouette(ctx, { ...A, x: x + Math.cos(ang) * 10 * s, y: y + 40 * s }, P.dive(3.0), '#2a0a00', 0.9, { facing: d as 1 | -1 });
        // fagulhas soltas
        for (let i = 0; i < 20; i++) {
          const k = (rnd(31, i) + p * 8) % 1;
          orb(ctx, x - Math.cos(ang) * k * 200 * s + (rnd(32, i) - 0.5) * 40 * s, y - Math.sin(ang) * k * 200 * s + (rnd(33, i) - 0.5) * 40 * s, 5 * s, '#ffb040', 1 - k);
        }
      }
      const hit = lin(KO, KO + 0.2, p);
      if (p >= KO) {
        // cratera e o lutador de pé no meio dela
        ctx.save();
        ctx.fillStyle = 'rgba(30,10,5,0.8)';
        ctx.beginPath();
        ctx.ellipse(B.x, B.y + 2 * s, 120 * s, 14 * s, 0, 0, Math.PI);
        ctx.fill();
        ctx.restore();
        groundCrack(ctx, B.x, B.x + 260 * s, B.y + 1, 1 - sm(0.93, 1, p), s, 41, '#ff6a10', 4);
        groundCrack(ctx, B.x, B.x - 260 * s, B.y + 1, 1 - sm(0.93, 1, p), s, 42, '#ff6a10', 4);
        avatar(ctx, { ...A, x: B.x - d * 25 * s }, P.strike(2.9), { t: p * 7, facing: d as 1 | -1 });
      }
      victim(ctx, B, p, 'launch');
      orb(ctx, B.x, B.y - 40 * s, 260 * s * (0.4 + hit), '#ff8a20', win(KO - 0.005, KO, KO + 0.05, KO + 0.2, p));
      shockwave(ctx, B.x, B.y, hit, s, '#ffb050', 1.6);
      debris(ctx, B.x, B.y, hit, s, 51, ['#2a1408', '#5a2a10', '#ffa040'], 50, 1.5);
      sparks(ctx, B.x, B.y - 20 * s, lin(KO, KO + 0.12, p), s, 52, '#ffc060', 50, 300);
      smoke(ctx, B.x, B.y - 20 * s, s, lin(KO + 0.03, 1, p), 53, 'rgba(80,60,50,', 3);
      void TAU; void pillar;
    },
  },
  {
    id: 'hammer-quake',
    cat: 'hammer',
    name: 'IRA DA TERRA',
    sub: 'a montanha acorda com uma martelada',
    color: '#ffe6c0',
    glow: '#ffa030',
    sky: ['#0a0704', '#2e2012'],
    frames: [0.24, 0.66, 0.84],
    music: { root: 36, mood: 'wild', bpm: 108, lead: 'brass' },
    backdrop(ctx, p, { w, h }) {
      rising(ctx, w / 2, h, w, h * 0.9, p, 3, 60, '#c89a60', 1, 0.5, 2);
      const g = ctx.createRadialGradient(w / 2, h, 0, w / 2, h, h);
      g.addColorStop(0, 'rgba(255,150,50,0.3)');
      g.addColorStop(1, 'rgba(255,150,50,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    world(ctx, p, A, B) {
      const s = A.s, d = B.x >= A.x ? 1 : -1;
      const slam = p > 0.46;
      const pose = p < 0.12 ? P.guard(-0.55) : !slam ? P.raise(-0.9) : P.strike(2.8);
      aura(ctx, A, pose, ['#7a4a10', '#ffa030', '#ffe6c0'], win(0.12, 0.3, 0.9, 1, p), p);
      avatar(ctx, A, pose, { t: p * 7 });
      // martelada
      const k0 = lin(0.46, 0.6, p);
      shockwave(ctx, A.x + d * 40 * s, A.y, k0, s, '#ffa030', 0.8);
      debris(ctx, A.x + d * 40 * s, A.y, k0, s, 11, ['#3a2a1c', '#6a4a2c'], 14, 0.6);
      // a rachadura corre até o alvo e espinhos sobem em sequência
      const run = sm(0.48, 0.74, p);
      groundCrack(ctx, A.x + d * 40 * s, mix(A.x + d * 40 * s, B.x + d * 60 * s, run), A.y + 1, run > 0 ? 1 - sm(0.93, 1, p) : 0, s, 21, '#ffa030', 4);
      const N = 6;
      for (let i = 0; i < N; i++) {
        const t = 0.52 + (i / N) * 0.2;
        const up = easeIn(lin(t, t + 0.03, p)) * (1 - sm(0.9, 0.98, p));
        const x = mix(A.x + d * 70 * s, B.x - d * 30 * s, i / (N - 1));
        spike(ctx, x, A.y + 2 * s, (40 + i * 14) * s * up, (12 + i * 2) * s, (rnd(22, i) - 0.5) * 0.3, s, 23 + i);
        if (up > 0 && up < 1) debris(ctx, x, A.y, up, s * 0.6, 30 + i, ['#3a2a1c', '#6a4a2c'], 8, 0.5);
      }
      victim(ctx, B, p, 'launch');
      // espinho gigante embaixo do alvo
      const big = easeIn(lin(KO - 0.02, KO + 0.01, p)) * (1 - sm(0.92, 0.99, p));
      spike(ctx, B.x, B.y + 4 * s, 200 * s * big, 34 * s, d * 0.08, s, 90);
      const hit = lin(KO, KO + 0.2, p);
      shockwave(ctx, B.x, B.y, hit, s, '#ffa030', 1.3);
      debris(ctx, B.x, B.y, hit, s, 91, ['#3a2a1c', '#6a4a2c', '#ffb050'], 40, 1.3);
      sparks(ctx, B.x, B.y - 60 * s, lin(KO, KO + 0.1, p), s, 92, '#ffc060', 30, 200);
      smoke(ctx, B.x, B.y - 10 * s, s, lin(KO, 1, p), 93, 'rgba(120,100,80,', 2.5);
      noGlow(ctx);
      void glow; void orb; void pillar;
    },
  },
];
