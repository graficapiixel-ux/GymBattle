import {
  KO, P, TAU, aura, avatar, bez, easeIn, flame, glow, godRays, lin, magicCircle, mix, noGlow, orb, pillar, rgba, rising, rnd, shockwave,
  sm, sparks, stars, tube, victim, win,
} from '../kit';
import type { V } from '../kit';
import type { Scene } from '../types';

/** Fênix de fogo voando para a direita (d=1) ou esquerda (d=-1). */
function phoenix(ctx: CanvasRenderingContext2D, x: number, y: number, d: number, s: number, flap: number, t: number, alpha: number) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.scale(d, 1);
  glow(ctx, '#ff6a10', 30 * s);
  // cauda longa em chamas
  for (let i = 0; i < 5; i++) {
    const spread = (i - 2) * 16 * s;
    const pts = bez({ x: -20 * s, y: 0 }, { x: -90 * s, y: spread * 0.5 }, { x: -150 * s, y: spread + Math.sin(t * 20 + i) * 12 * s }, { x: -230 * s, y: spread * 1.6 + Math.sin(t * 14 + i) * 18 * s }, 16);
    const g = ctx.createLinearGradient(0, 0, -230 * s, 0);
    g.addColorStop(0, 'rgba(255,240,180,0.95)');
    g.addColorStop(0.4, 'rgba(255,140,30,0.85)');
    g.addColorStop(1, 'rgba(255,40,10,0)');
    tube(ctx, pts, (k) => (1 - k) * 18 * s, g);
  }
  // asas (penas em leque, batendo)
  for (const side of [-1, 1]) {
    const lift = side * (0.6 + flap * 0.7);
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 * side + lift * 0.3 - side * i * 0.16 - 0.4;
      const len = (150 - i * 12) * s;
      const base = { x: -4 * s * i, y: 0 };
      const tip = { x: base.x + Math.cos(a) * len - 30 * s, y: base.y + Math.sin(a) * len * (side < 0 ? 1 : 0.7) };
      const pts = bez(base, { x: base.x + (tip.x - base.x) * 0.3, y: base.y + (tip.y - base.y) * 0.1 - 20 * s * side }, { x: base.x + (tip.x - base.x) * 0.7, y: base.y + (tip.y - base.y) * 0.8 }, tip, 12);
      const g = ctx.createLinearGradient(base.x, base.y, tip.x, tip.y);
      g.addColorStop(0, 'rgba(255,250,210,0.95)');
      g.addColorStop(0.5, 'rgba(255,170,40,0.9)');
      g.addColorStop(1, 'rgba(255,60,10,0.15)');
      tube(ctx, pts, (k) => Math.sin(Math.min(1, k * 1.3) * Math.PI) * 22 * s + 2 * s, g);
    }
  }
  // corpo e cabeça
  noGlow(ctx);
  orb(ctx, 0, 0, 40 * s, '#ffa030', 1, '#fffbe0');
  glow(ctx, '#ffd060', 20 * s);
  ctx.fillStyle = '#fff4c0';
  ctx.beginPath();
  ctx.ellipse(18 * s, -6 * s, 26 * s, 12 * s, -0.2, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(44 * s, -16 * s, 11 * s, 0, TAU);
  ctx.fill();
  // bico
  ctx.fillStyle = '#ffb020';
  ctx.beginPath();
  ctx.moveTo(52 * s, -20 * s); ctx.lineTo(70 * s, -13 * s); ctx.lineTo(52 * s, -10 * s);
  ctx.fill();
  // crista de fogo
  for (let i = 0; i < 3; i++) flame(ctx, (38 - i * 7) * s, -26 * s, 5 * s, t * 30 + i, '#ffd060', '#ff5010', 0.9);
  // olho
  ctx.fillStyle = '#ffffff';
  glow(ctx, '#ffffff', 8 * s);
  ctx.beginPath(); ctx.arc(47 * s, -18 * s, 2.4 * s, 0, TAU); ctx.fill();
  ctx.restore();
}

export const BOW: Scene[] = [
  {
    id: 'bow-celestial',
    cat: 'bow',
    name: 'CHUVA CELESTIAL',
    sub: 'uma flecha abre o céu inteiro',
    color: '#eaf6ff',
    glow: '#5cc8ff',
    sky: ['#020a16', '#12304c'],
    frames: [0.24, 0.55, 0.78],
    music: { root: 50, mood: 'holy', bpm: 132, lead: 'strings' },
    backdrop(ctx, p, { w, h }, a, b) {
      stars(ctx, w, h, 100, '#ffffff', 0.7, 12);
      const open = sm(0.44, 0.56, p);
      if (open > 0) {
        godRays(ctx, b.x, h * 0.02, 16, h * 1.2, 0.04, '#bfe8ff', 0.4 * open, 0, 1.2);
      }
      void a;
    },
    world(ctx, p, A, B) {
      const s = A.s, d = B.x >= A.x ? 1 : -1;
      const pose = p < 0.1 ? P.aim() : P.kneelAim();
      // círculo mágico nas costas do arqueiro
      const back = win(0.12, 0.3, 0.88, 0.96, p);
      magicCircle(ctx, A.x - d * 6 * s, A.y - 60 * s, 80 * s * back, '#8fdcff', back * 0.6, p * 3, 1, 3);
      aura(ctx, A, pose, ['#0a4a80', '#5cc8ff', '#eaf6ff'], back, p);
      avatar(ctx, A, pose, { t: p * 7 });
      // flecha carregando e disparando para o alto
      const hand = { x: A.x + d * 26 * s, y: A.y - 110 * s };
      const charge = win(0.2, 0.38, 0.4, 0.42, p);
      orb(ctx, hand.x, hand.y, 40 * s * charge, '#5cc8ff', charge);
      const shot = lin(0.41, 0.47, p);
      if (shot > 0 && shot < 1) {
        const y0 = mix(hand.y, B.y - 640 * s, shot), x0 = mix(hand.x, B.x, shot);
        ctx.save();
        glow(ctx, '#5cc8ff', 20 * s);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4 * s;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(mix(hand.x, B.x, shot * 0.8), mix(hand.y, B.y - 640 * s, shot * 0.8)); ctx.stroke();
        ctx.restore();
      }
      // portal no céu
      const open = sm(0.46, 0.56, p) * (1 - sm(0.88, 0.95, p));
      magicCircle(ctx, B.x, B.y - 300 * s, 210 * s * open, '#bfe8ff', open, -p * 2, 0.26, 9);
      victim(ctx, B, p, 'fall');
      // a chuva de flechas de luz
      const rain = lin(0.54, 0.84, p);
      if (rain > 0 && p < 0.92) {
        ctx.save();
        glow(ctx, '#5cc8ff', 8 * s);
        ctx.lineCap = 'round';
        for (let i = 0; i < 380; i++) {
          const born = rnd(101, i) * 0.8;
          const k = (rain - born) / 0.14;
          if (k < 0 || k > 1.25) continue;
          const spread = (rnd(102, i) - 0.5) * (i % 3 ? 170 : 380) * s;
          const x = B.x + spread * (0.8 + Math.min(k, 1) * 0.2);
          const y = Math.min(mix(B.y - 290 * s, B.y, Math.min(k, 1)), B.y);
          ctx.globalAlpha = k > 1 ? (1.25 - k) * 4 : 1;
          ctx.strokeStyle = i % 4 ? 'rgba(210,240,255,0.95)' : '#ffffff';
          ctx.lineWidth = (1.4 + rnd(103, i) * 1.4) * s;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y - 40 * s);
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(x, y + 5 * s); ctx.lineTo(x - 3 * s, y - 2 * s); ctx.lineTo(x + 3 * s, y - 2 * s);
          ctx.fill();
          if (k > 1) {
            ctx.fillStyle = 'rgba(210,245,255,0.8)';
            ctx.beginPath();
            ctx.ellipse(x, B.y, 10 * s * (k - 0.95) * 4, 3 * s, 0, 0, TAU);
            ctx.fill();
          }
        }
        ctx.restore();
      }
      const hit = lin(KO, KO + 0.18, p);
      pillar(ctx, B.x, B.y, 50 * s * (1 - hit), 600 * s, '#8fdcff', win(KO - 0.01, KO, KO + 0.05, KO + 0.15, p));
      shockwave(ctx, B.x, B.y, hit, s, '#8fdcff', 1.3);
      sparks(ctx, B.x, B.y - 20 * s, hit, s, 104, '#bfe8ff', 40, 240);
      void easeIn; void rgba;
    },
  },
  {
    id: 'bow-phoenix',
    cat: 'bow',
    name: 'FLECHA DA FÊNIX',
    sub: 'a flecha renasce em chamas',
    color: '#fff0c8',
    glow: '#ff6a10',
    sky: ['#0c0302', '#3a1204'],
    frames: [0.24, 0.66, 0.84],
    music: { root: 45, mood: 'heroic', bpm: 126, lead: 'brass' },
    backdrop(ctx, p, { w, h }) {
      const g = ctx.createRadialGradient(w / 2, h * 0.3, 0, w / 2, h * 0.3, h);
      g.addColorStop(0, 'rgba(255,120,30,0.4)');
      g.addColorStop(1, 'rgba(255,60,10,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      rising(ctx, w / 2, h, w, h, p, 5, 60, '#ffa040', 1, 0.8);
    },
    world(ctx, p, A, B) {
      const s = A.s, d = B.x >= A.x ? 1 : -1;
      const pose = P.aim();
      aura(ctx, A, pose, ['#801000', '#ff6a10', '#ffe0a0'], win(0.12, 0.3, 0.9, 1, p), p);
      avatar(ctx, A, pose, { t: p * 7 });
      const tip = { x: A.x + d * 30 * s, y: A.y - 70 * s };
      // chamas girando e entrando na flecha
      const gather = win(0.14, 0.3, 0.55, 0.6, p);
      if (gather > 0) {
        for (let i = 0; i < 40; i++) {
          const k = (rnd(21, i) + p * 2.5) % 1;
          const a = rnd(22, i) * TAU + k * 4;
          const r = (1 - k) * 160 * s;
          flame(ctx, tip.x + Math.cos(a) * r, tip.y + Math.sin(a) * r * 0.7, 5 * s * (1 - k * 0.5), p * 40 + i, '#ffd060', '#ff4010', gather * k);
        }
        orb(ctx, tip.x, tip.y, 50 * s * gather, '#ff6a10', gather);
        // o arco pegando fogo
        for (let i = 0; i < 6; i++) flame(ctx, A.x + d * 26 * s, A.y - (40 + i * 12) * s, 5 * s, p * 30 + i, '#ffd060', '#ff4010', gather);
      }
      // a fênix voa até o alvo
      const fly = lin(0.6, KO, p);
      if (p > 0.58 && p < KO + 0.02) {
        const grow = sm(0.58, 0.64, p);
        const x = mix(tip.x, B.x, fly), y = mix(tip.y, B.y - 60 * s, fly) - Math.sin(fly * Math.PI) * 80 * s;
        const trail: V[] = [];
        for (let i = 0; i < 12; i++) {
          const f = Math.max(0, fly - i * 0.03);
          trail.push({ x: mix(tip.x, B.x, f), y: mix(tip.y, B.y - 60 * s, f) - Math.sin(f * Math.PI) * 80 * s });
        }
        const g = ctx.createLinearGradient(x, y, trail[11].x, trail[11].y);
        g.addColorStop(0, 'rgba(255,200,80,0.8)');
        g.addColorStop(1, 'rgba(255,60,10,0)');
        glow(ctx, '#ff6a10', 20 * s);
        tube(ctx, trail, (k) => (1 - k) * 40 * s, g);
        noGlow(ctx);
        phoenix(ctx, x, y, d, s * 0.75 * grow, Math.sin(p * 50), p, 1);
      }
      victim(ctx, B, p, 'burn');
      const hit = lin(KO, KO + 0.2, p);
      pillar(ctx, B.x, B.y, 60 * s * (1 - hit * 0.6), 800 * s, '#ff6a10', win(KO - 0.01, KO, KO + 0.08, KO + 0.2, p));
      for (let i = 0; i < 16 && p > KO; i++) {
        const a = (i / 16) * TAU;
        flame(ctx, B.x + Math.cos(a) * hit * 150 * s, B.y - 10 * s + Math.sin(a) * hit * 30 * s, 12 * s * (1 - hit), p * 40 + i, '#ffd060', '#ff4010', 1 - hit);
      }
      shockwave(ctx, B.x, B.y, hit, s, '#ff8a3a', 1.2);
      sparks(ctx, B.x, B.y - 50 * s, hit, s, 31, '#ffc060', 40, 260);
      rising(ctx, B.x, B.y, 200 * s, 300 * s, p, 32, 50, '#ffa040', s, win(KO, KO + 0.03, 0.92, 1, p), 3);
      void easeIn; void rgba;
    },
  },
];
