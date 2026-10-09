import {
  KO, P, TAU, aura, avatar, debris, easeIn, glow, groundCrack, lightning, lin, mix, noGlow, orb, pillar, rgba, rising, rnd, shockwave,
  sm, sparks, stormClouds, victim, win,
} from '../kit';
import type { Scene } from '../types';

/** Machado de energia girando (lâmina em meia-lua + cabo). */
function spinningAxe(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, s: number, a: number) {
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.translate(x, y);
  // disco de movimento
  glow(ctx, '#6ad8ff', 30 * s);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 48 * s);
  g.addColorStop(0, 'rgba(200,245,255,0.1)');
  g.addColorStop(0.8, 'rgba(120,220,255,0.45)');
  g.addColorStop(1, 'rgba(120,220,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, 48 * s, 0, TAU); ctx.fill();
  ctx.rotate(ang);
  ctx.fillStyle = '#6a4a2a';
  ctx.fillRect(-3 * s, -30 * s, 6 * s, 60 * s);
  ctx.fillStyle = '#eaf8ff';
  ctx.beginPath();
  ctx.moveTo(0, -30 * s);
  ctx.quadraticCurveTo(26 * s, -40 * s, 34 * s, -14 * s);
  ctx.quadraticCurveTo(22 * s, -16 * s, 3 * s, -12 * s);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, -30 * s);
  ctx.quadraticCurveTo(-26 * s, -40 * s, -34 * s, -14 * s);
  ctx.quadraticCurveTo(-22 * s, -16 * s, -3 * s, -12 * s);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export const AXE: Scene[] = [
  {
    id: 'axe-titan',
    cat: 'axe',
    name: 'FÚRIA DO TITÃ',
    sub: 'a terra se parte sob seus pés',
    color: '#ffd08a',
    glow: '#ff5a1a',
    sky: ['#120403', '#4a1206'],
    frames: [0.24, 0.6, 0.83],
    music: { root: 40, mood: 'fire', bpm: 112, lead: 'brass' },
    backdrop(ctx, p, { w, h }) {
      const g = ctx.createRadialGradient(w / 2, h, 0, w / 2, h, h * 1.1);
      g.addColorStop(0, 'rgba(255,90,20,0.55)');
      g.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      rising(ctx, w / 2, h, w, h, p, 7, 80, '#ffb050', 1, 0.8);
    },
    world(ctx, p, A, B) {
      const s = A.s, d = B.x >= A.x ? 1 : -1;
      const grow = sm(0.1, 0.42, p);
      const sc = 1 + grow * 1.05;
      const lift = sm(0.45, 0.62, p);
      const smash = sm(0.7, KO - 0.02, p);
      const pose = smash > 0 ? P.strike(2.5) : lift > 0 ? P.raise(-0.6 - lift * 0.8) : P.guard(0.5);
      const shake = p > 0.12 && p < 0.45 ? Math.sin(p * 600) * 1.5 * s : 0;
      // chão rachando em volta dele enquanto cresce
      for (let i = 0; i < 6; i++) {
        const dir = i % 2 ? 1 : -1;
        groundCrack(ctx, A.x, A.x + dir * (80 + i * 30) * s, A.y + 1, sm(0.2 + i * 0.04, 0.45, p) * (1 - sm(0.93, 1, p)), s, 50 + i, '#ff7a20', 2.5);
      }
      const me = { ...A, x: A.x + shake };
      aura(ctx, me, pose, ['#ff2a00', '#ff8a1a', '#ffd060'], win(0.08, 0.3, 0.92, 1, p), p, { scale: sc });
      avatar(ctx, me, pose, { scale: sc, t: p * 7 });
      // a pancada
      const hit = lin(KO, KO + 0.18, p);
      groundCrack(ctx, A.x + d * 60 * s, B.x + d * 220 * s, A.y + 1, sm(KO - 0.01, KO + 0.05, p) * (1 - sm(0.93, 1, p)), s, 60, '#ffb060', 6);
      pillar(ctx, B.x, B.y, 50 * s * (1 - hit), 500 * s, '#ff6a20', win(KO - 0.005, KO, KO + 0.05, KO + 0.15, p));
      victim(ctx, B, p, 'launch');
      shockwave(ctx, B.x, B.y, hit, s, '#ffa050', 1.3);
      debris(ctx, B.x, B.y, hit, s, 61, ['#3a2010', '#6a3a20', '#ff9a40'], 40, 1.3);
      sparks(ctx, B.x, B.y - 10 * s, lin(KO, KO + 0.1, p), s, 62, '#ffc060', 40, 260);
    },
  },
  {
    id: 'axe-thunder',
    cat: 'axe',
    name: 'MACHADO DO TROVÃO',
    sub: 'o céu empresta sua fúria',
    color: '#e6faff',
    glow: '#4ad0ff',
    sky: ['#02040a', '#101a2e'],
    frames: [0.24, 0.62, 0.83],
    music: { root: 45, mood: 'storm', bpm: 150, lead: 'brass' },
    backdrop(ctx, p, { w, h }) {
      stormClouds(ctx, w, h, p, '#223048', 1, 9);
      const f = Math.max(win(0.2, 0.205, 0.215, 0.24, p), win(KO - 0.01, KO, KO + 0.01, KO + 0.05, p));
      if (f > 0) {
        ctx.fillStyle = `rgba(190,235,255,${0.35 * f})`;
        ctx.fillRect(0, 0, w, h);
      }
      // chuva
      ctx.strokeStyle = 'rgba(170,200,230,0.35)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 90; i++) {
        const x = (rnd(71, i) * (w + 100) + p * 900) % (w + 100) - 50;
        const y = (rnd(72, i) * h + p * h * 12) % h;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 6, y + 16); ctx.stroke();
      }
    },
    world(ctx, p, A, B) {
      const s = A.s, d = B.x >= A.x ? 1 : -1;
      const pose = p < 0.12 ? P.guard(0.55) : p < 0.56 ? P.raise(0.1) : p < 0.64 ? P.throwBack(-1.2) : P.throwFwd(1.7);
      const charged = win(0.21, 0.26, 0.9, 1, p);
      // raio atinge o machado erguido
      const strike1 = win(0.195, 0.2, 0.23, 0.27, p);
      lightning(ctx, { x: A.x + d * 20 * s, y: A.y - 600 * s }, { x: A.x + d * 2 * s, y: A.y - 120 * s }, 3, 2.4 * s, '#6ad8ff', strike1, 3);
      aura(ctx, A, pose, ['#0a4a90', '#4ad0ff', '#e6faff'], charged, p);
      avatar(ctx, A, pose, { t: p * 7 });
      // faíscas correndo pelo corpo
      if (charged > 0 && p < 0.66) {
        for (let i = 0; i < 4; i++) {
          const a = rnd(81, i + Math.floor(p * 60)) * TAU;
          const c = { x: A.x, y: A.y - 50 * s };
          lightning(ctx, { x: c.x + Math.cos(a) * 20 * s, y: c.y + Math.sin(a) * 40 * s }, { x: c.x + Math.cos(a + 1) * 45 * s, y: c.y + Math.sin(a + 1) * 60 * s }, 90 + i + Math.floor(p * 60), 0.8 * s, '#6ad8ff', charged, 0);
        }
        orb(ctx, A.x + d * 2 * s, A.y - 120 * s, 40 * s, '#4ad0ff', charged * 0.8);
      }
      // machado girando até o alvo
      const fly = lin(0.64, KO, p);
      if (fly > 0 && p < KO + 0.02) {
        const x = mix(A.x + d * 30 * s, B.x, fly);
        const y = mix(A.y - 80 * s, B.y - 50 * s, fly) - Math.sin(fly * Math.PI) * 60 * s;
        // rastro elétrico
        for (let i = 1; i < 6; i++) {
          const f2 = Math.max(0, fly - i * 0.04);
          const tx = mix(A.x + d * 30 * s, B.x, f2), ty = mix(A.y - 80 * s, B.y - 50 * s, f2) - Math.sin(f2 * Math.PI) * 60 * s;
          orb(ctx, tx, ty, (30 - i * 4) * s, '#4ad0ff', 0.5 - i * 0.08);
        }
        spinningAxe(ctx, x, y, p * 120 * d, s * 1.1, 1);
      }
      // o grande raio final
      const bolt = win(KO - 0.01, KO, KO + 0.05, KO + 0.12, p);
      for (let i = 0; i < 3; i++) lightning(ctx, { x: B.x + (i - 1) * 40 * s, y: B.y - 700 * s }, { x: B.x + (i - 1) * 6 * s, y: B.y }, 200 + i, (3.2 - i * 0.8) * s, '#6ad8ff', bolt, 4);
      victim(ctx, B, p, 'shock');
      const hit = lin(KO, KO + 0.18, p);
      orb(ctx, B.x, B.y - 20 * s, 150 * s * (1 - hit), '#4ad0ff', bolt);
      shockwave(ctx, B.x, B.y, hit, s, '#6ad8ff', 1.2);
      debris(ctx, B.x, B.y, hit, s, 210, ['#203040', '#405060', '#9fe8ff'], 26);
      sparks(ctx, B.x, B.y - 30 * s, lin(KO, KO + 0.1, p), s, 211, '#9fe8ff', 40, 240);
      noGlow(ctx);
      void easeIn; void glow; void rgba;
    },
  },
];
