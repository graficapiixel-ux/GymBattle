import {
  KO, P, TAU, aura, avatar, debris, easeIn, glow, lightning, lin, magicCircle, mix, noGlow, orb, rgba, rising, rnd, shockwave,
  silhouette, sm, sparks, stars, tube, victim, win,
} from '../kit';
import type { Actor } from '../kit';
import type { Scene } from '../types';

export const SPEAR: Scene[] = [
  {
    id: 'spear-comet',
    cat: 'spear',
    name: 'LANÇA COMETA',
    sub: 'arremessada com a força de uma estrela',
    color: '#e8f4ff',
    glow: '#4a9aff',
    sky: ['#010312', '#0c1a3a'],
    frames: [0.24, 0.6, 0.83],
    music: { root: 48, mood: 'heroic', bpm: 144, lead: 'strings' },
    backdrop(ctx, p, { w, h }) {
      stars(ctx, w, h, 140, '#ffffff', 0.9, 44);
      // estrelas cadentes
      for (let i = 0; i < 5; i++) {
        const k = (p * 2 + rnd(45, i)) % 1;
        const x = rnd(46, i) * w + k * 200, y = rnd(47, i) * h * 0.4 + k * 80;
        const g = ctx.createLinearGradient(x, y, x - 80, y - 30);
        g.addColorStop(0, 'rgba(255,255,255,0.8)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 80, y - 30); ctx.stroke();
      }
    },
    world(ctx, p, A, B) {
      const s = A.s, d = B.x >= A.x ? 1 : -1;
      const pose = p < 0.1 ? P.guard(1.3) : p < 0.62 ? P.throwBack(-0.4) : P.throwFwd(1.7);
      const charge = win(0.15, 0.4, 0.6, 0.64, p);
      aura(ctx, A, pose, ['#1040a0', '#4a9aff', '#e8f4ff'], win(0.12, 0.3, 0.9, 1, p), p);
      avatar(ctx, A, pose, { t: p * 7 });
      // anéis espiralando na lança
      if (charge > 0) {
        const hx = A.x - d * 30 * s, hy = A.y - 90 * s;
        orb(ctx, hx, hy, 50 * s * charge, '#4a9aff', charge);
        ctx.save();
        glow(ctx, '#4a9aff', 10 * s);
        for (let i = 0; i < 3; i++) {
          const a = p * 30 + i * 2.1;
          ctx.strokeStyle = rgba('#bfe0ff', charge);
          ctx.lineWidth = 2 * s;
          ctx.beginPath();
          ctx.ellipse(hx, hy, 30 * s, 10 * s, a, 0, TAU);
          ctx.stroke();
        }
        ctx.restore();
      }
      // portais de aceleração na linha do arremesso
      const gates = win(0.35, 0.5, 0.82, 0.9, p);
      for (let i = 0; i < 3; i++) {
        const x = mix(A.x, B.x, 0.28 + i * 0.22);
        magicCircle(ctx, x, A.y - 70 * s, (40 + i * 6) * s * gates, '#8ac4ff', gates * 0.9, p * 4 * (i % 2 ? 1 : -1), 1, 30 + i);
      }
      // o cometa
      const fly = easeIn(lin(0.62, KO, p));
      if (p > 0.62 && p < KO + 0.01) {
        const x = mix(A.x + d * 20 * s, B.x, fly), y = A.y - 70 * s + (B.y - 50 * s - (A.y - 70 * s)) * fly;
        const pts = [];
        for (let i = 0; i <= 14; i++) pts.push({ x: x - d * i * 20 * s, y: y + Math.sin(i * 0.8 + p * 40) * 2 * s });
        const g = ctx.createLinearGradient(x, y, pts[14].x, y);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.3, 'rgba(120,180,255,0.8)');
        g.addColorStop(1, 'rgba(60,100,255,0)');
        glow(ctx, '#4a9aff', 30 * s);
        tube(ctx, pts, (k) => (1 - k) * 36 * s, g);
        noGlow(ctx);
        orb(ctx, x, y, 44 * s, '#8ac4ff', 1);
      }
      // linha de luz que fica depois do golpe
      const line = win(KO - 0.01, KO, KO + 0.06, KO + 0.16, p);
      if (line > 0) {
        ctx.save();
        glow(ctx, '#4a9aff', 20 * s);
        ctx.fillStyle = rgba('#ffffff', line);
        ctx.fillRect(Math.min(A.x, B.x + d * 800 * s), B.y - 52 * s, Math.abs(B.x + d * 800 * s - A.x), 3 * s);
        ctx.restore();
      }
      victim(ctx, B, p, 'launch');
      const hit = lin(KO, KO + 0.18, p);
      orb(ctx, B.x, B.y - 50 * s, 180 * s * (1 - hit * 0.5), '#4a9aff', win(KO - 0.005, KO, KO + 0.04, KO + 0.16, p));
      // estrela de 4 pontas no impacto
      const star = win(KO - 0.005, KO, KO + 0.03, KO + 0.1, p);
      if (star > 0) {
        ctx.save();
        glow(ctx, '#4a9aff', 20 * s);
        ctx.fillStyle = rgba('#ffffff', star);
        ctx.translate(B.x, B.y - 50 * s);
        for (let i = 0; i < 4; i++) {
          ctx.rotate(Math.PI / 2);
          ctx.beginPath();
          ctx.moveTo(-6 * s, 0); ctx.lineTo(0, -200 * s * star); ctx.lineTo(6 * s, 0);
          ctx.fill();
        }
        ctx.restore();
      }
      sparks(ctx, B.x, B.y - 50 * s, hit, s, 71, '#8ac4ff', 40, 240);
      shockwave(ctx, B.x, B.y, hit, s, '#8ac4ff');
      rising(ctx, B.x, B.y, 200 * s, 200 * s, p, 72, 30, '#bfe0ff', s, win(KO, KO + 0.03, 0.9, 1, p));
      void debris;
    },
  },
  {
    id: 'spear-lightning',
    cat: 'spear',
    name: 'INVESTIDA RELÂMPAGO',
    sub: 'mais rápido que o próprio trovão',
    color: '#fffbd0',
    glow: '#ffe030',
    sky: ['#06020e', '#1c0a34'],
    frames: [0.24, 0.6, 0.83],
    music: { root: 49, mood: 'storm', bpm: 170, lead: 'synth' },
    backdrop(ctx, p, { w, h }) {
      const g = ctx.createRadialGradient(w / 2, h * 0.6, 0, w / 2, h * 0.6, h);
      g.addColorStop(0, 'rgba(160,90,255,0.3)');
      g.addColorStop(1, 'rgba(160,90,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 3; i++) {
        const t = 0.15 + i * 0.1;
        const k = win(t, t + 0.004, t + 0.012, t + 0.03, p);
        if (k > 0) lightning(ctx, { x: w * (0.2 + i * 0.3), y: 0 }, { x: w * (0.25 + i * 0.28), y: h * 0.5 }, 10 + i, 1.4, '#c8a0ff', k, 2);
      }
    },
    world(ctx, p, A, B) {
      const s = A.s, d = B.x >= A.x ? 1 : -1;
      const charge = win(0.1, 0.25, 0.36, 0.4, p);
      const pose0 = p > 0.1 ? P.crouch(1.3) : P.guard(1.3);
      if (p < 0.4) {
        aura(ctx, A, pose0, ['#806000', '#ffe030', '#fffbd0'], charge, p);
        avatar(ctx, A, pose0, { t: p * 7 });
        for (let i = 0; i < 5; i++) {
          const a = rnd(5, i + Math.floor(p * 80)) * TAU;
          lightning(ctx, { x: A.x + Math.cos(a) * 15 * s, y: A.y - 40 * s + Math.sin(a) * 30 * s }, { x: A.x + Math.cos(a) * 55 * s, y: A.y - 40 * s + Math.sin(a) * 60 * s }, 20 + i + Math.floor(p * 80), 0.8 * s, '#ffe030', charge, 0);
        }
      }
      // três investidas: vai e volta atravessando o alvo
      const stops = [A.x, B.x + d * 150 * s, B.x - d * 130 * s, B.x + d * 90 * s];
      const legs = 3;
      const k = lin(0.4, 0.78, p) * legs;
      for (let i = 0; i < legs; i++) {
        const age = k - i;
        if (age < 0) continue;
        const x1 = stops[i], x2 = stops[i + 1];
        const y = A.y - (20 + i * 25) * s;
        const alpha = Math.max(0, 1 - Math.max(0, age - 1) / 1.2) * (1 - sm(0.9, 1, p));
        lightning(ctx, { x: x1, y }, { x: mix(x1, x2, Math.min(1, age)), y: y - 10 * s }, 40 + i, 2.2 * s, '#ffe030', alpha, 3);
        if (age < 1) {
          const me: Actor = { ...A, x: mix(x1, x2, age), y: A.y };
          silhouette(ctx, me, P.lunge(1.55), '#fff6a0', 0.9, { facing: (x2 > x1 ? 1 : -1) as 1 | -1, blur: 20 * s });
        }
      }
      victim(ctx, B, p, 'shock');
      if (p >= 0.78) {
        const me: Actor = { ...A, x: stops[3] };
        silhouette(ctx, me, P.lunge(1.55), '#ffe030', win(0.78, 0.8, 0.85, 0.95, p) * 0.6, { facing: (-d) as 1 | -1, blur: 20 * s, scale: 1.1 });
        avatar(ctx, me, P.after(1.55), { facing: (-d) as 1 | -1, t: p * 7 });
      }
      const hit = lin(KO, KO + 0.18, p);
      const bolt = win(KO - 0.01, KO, KO + 0.04, KO + 0.1, p);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + 0.4;
        lightning(ctx, { x: B.x, y: B.y - 50 * s }, { x: B.x + Math.cos(a) * 160 * s, y: B.y - 50 * s + Math.sin(a) * 110 * s }, 60 + i, 1.6 * s, '#ffe030', bolt, 2);
      }
      orb(ctx, B.x, B.y - 50 * s, 140 * s * (1 - hit), '#ffe030', bolt);
      sparks(ctx, B.x, B.y - 50 * s, hit, s, 70, '#fff6a0', 40, 220);
      shockwave(ctx, B.x, B.y, hit, s, '#ffe030');
      debris(ctx, B.x, B.y, hit, s, 73, ['#2a2030', '#4a4060', '#ffe030'], 20);
      void easeIn;
    },
  },
];
