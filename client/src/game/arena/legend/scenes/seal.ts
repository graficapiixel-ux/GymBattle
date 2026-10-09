import {
  KO, P, TAU, aura, avatar, bez, debris, easeIn, easeOut, glow, godRays, lightBlade, lin, magicCircle, mix, noGlow, orb, pillar, rgba,
  rising, rnd, shockwave, sm, sparks, tube, victim, win,
} from '../kit';
import type { Scene } from '../types';

/** Asas de penas de luz saindo das costas. */
function lightWings(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, open: number, t: number, alpha: number) {
  if (alpha <= 0 || open <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  glow(ctx, '#ffe080', 24 * s);
  for (const side of [-1, 1]) {
    for (let row = 0; row < 3; row++) {
      const n = 9 - row * 2;
      for (let i = 0; i < n; i++) {
        const k = i / (n - 1);
        const a = -Math.PI / 2 + side * (0.35 + k * 1.35 * open) + Math.sin(t * 6) * 0.04 * side;
        const len = (170 - row * 45 - Math.abs(k - 0.35) * 70) * s * open;
        const base = { x: x + side * (4 + row * 6) * s, y: y + row * 10 * s };
        const tip = { x: base.x + Math.cos(a) * len, y: base.y + Math.sin(a) * len * 0.9 };
        const pts = bez(base, { x: mix(base.x, tip.x, 0.3), y: mix(base.y, tip.y, 0.3) - 12 * s }, { x: mix(base.x, tip.x, 0.7), y: mix(base.y, tip.y, 0.7) - 6 * s }, tip, 10);
        const g = ctx.createLinearGradient(base.x, base.y, tip.x, tip.y);
        g.addColorStop(0, `rgba(255,250,220,${0.95 - row * 0.1})`);
        g.addColorStop(1, `rgba(255,220,120,${0.35 - row * 0.05})`);
        tube(ctx, pts, (q) => Math.sin(Math.min(1, q * 1.2) * Math.PI) * (14 - row * 2) * s + 2 * s, g);
      }
    }
  }
  ctx.restore();
}

/** Colosso sagrado de pedra e ouro subindo do chão. */
function colossus(ctx: CanvasRenderingContext2D, x: number, y: number, d: number, s: number, rise: number, t: number) {
  const H = 300 * s;
  const top = y - H * rise;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - 800 * s, y - 1500 * s, 1600 * s, 1500 * s);
  ctx.clip();
  // coroa de raios atrás da cabeça
  godRays(ctx, x, top + 45 * s, 20, 150 * s, 0.06, '#ffe080', 0.7 * rise, t * 0.5);
  ctx.save();
  glow(ctx, '#ffcc40', 20 * s);
  ctx.strokeStyle = rgba('#ffe7a0', rise);
  ctx.lineWidth = 5 * s;
  ctx.beginPath(); ctx.arc(x, top + 45 * s, 66 * s, 0, TAU); ctx.stroke();
  ctx.restore();
  const stone = (x0: number, x1: number) => {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, '#6a5a3e');
    g.addColorStop(0.45, '#efe4c8');
    g.addColorStop(0.6, '#d8c8a0');
    g.addColorStop(1, '#5a4a30');
    return g;
  };
  glow(ctx, '#ffcc40', 26 * s);
  // tronco
  ctx.fillStyle = stone(x - 90 * s, x + 90 * s);
  ctx.beginPath();
  ctx.moveTo(x - 80 * s, top + 100 * s);
  ctx.lineTo(x + 80 * s, top + 100 * s);
  ctx.lineTo(x + 62 * s, top + H);
  ctx.lineTo(x - 62 * s, top + H);
  ctx.closePath();
  ctx.fill();
  noGlow(ctx);
  // placa peitoral com borda dourada e gema
  ctx.strokeStyle = '#d8a830';
  ctx.lineWidth = 4 * s;
  ctx.beginPath();
  ctx.moveTo(x - 60 * s, top + 110 * s);
  ctx.quadraticCurveTo(x, top + 190 * s, x + 60 * s, top + 110 * s);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, top + 150 * s); ctx.lineTo(x, top + H - 20 * s);
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(x - 50 * s, top + (200 + i * 22) * s); ctx.lineTo(x + 50 * s, top + (200 + i * 22) * s);
    ctx.strokeStyle = 'rgba(90,70,30,0.5)';
    ctx.lineWidth = 2 * s;
    ctx.stroke();
  }
  orb(ctx, x, top + 145 * s, 22 * s, '#ffcc40', 1);
  // ombreiras
  for (const side of [-1, 1]) {
    ctx.fillStyle = stone(x + side * 60 * s, x + side * 140 * s);
    glow(ctx, '#ffcc40', 14 * s);
    ctx.beginPath();
    ctx.ellipse(x + side * 92 * s, top + 108 * s, 44 * s, 30 * s, side * 0.3, 0, TAU);
    ctx.fill();
    noGlow(ctx);
    ctx.strokeStyle = '#d8a830';
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.ellipse(x + side * 92 * s, top + 108 * s, 36 * s, 22 * s, side * 0.3, Math.PI, TAU);
    ctx.stroke();
  }
  // elmo
  ctx.fillStyle = stone(x - 40 * s, x + 40 * s);
  glow(ctx, '#ffcc40', 16 * s);
  ctx.beginPath();
  ctx.moveTo(x - 36 * s, top + 92 * s);
  ctx.lineTo(x - 40 * s, top + 34 * s);
  ctx.quadraticCurveTo(x, top - 8 * s, x + 40 * s, top + 34 * s);
  ctx.lineTo(x + 36 * s, top + 92 * s);
  ctx.quadraticCurveTo(x, top + 104 * s, x - 36 * s, top + 92 * s);
  ctx.fill();
  noGlow(ctx);
  ctx.fillStyle = '#d8a830';
  ctx.beginPath();
  ctx.moveTo(x, top - 30 * s); ctx.lineTo(x + 7 * s, top + 10 * s); ctx.lineTo(x - 7 * s, top + 10 * s);
  ctx.fill();
  ctx.fillStyle = '#1a1408';
  ctx.fillRect(x - 28 * s, top + 48 * s, 56 * s, 9 * s);
  ctx.fillRect(x - 3 * s, top + 48 * s, 6 * s, 34 * s);
  glow(ctx, '#ffffff', 16 * s);
  ctx.fillStyle = '#fffbe0';
  ctx.fillRect(x - 24 * s, top + 50 * s, 16 * s, 5 * s);
  ctx.fillRect(x + 8 * s, top + 50 * s, 16 * s, 5 * s);
  ctx.restore();
  void d;
}

export const SEAL: Scene[] = [
  {
    id: 'seal-colossus',
    cat: 'seal',
    name: 'COLOSSO SAGRADO',
    sub: 'o guardião antigo responde ao chamado',
    color: '#fff3c4',
    glow: '#ffcc40',
    sky: ['#0c0802', '#382808'],
    frames: [0.24, 0.62, 0.83],
    music: { root: 45, mood: 'holy', bpm: 104, lead: 'choir' },
    backdrop(ctx, p, { w, h }) {
      const k = sm(0.15, 0.45, p);
      ctx.save();
      ctx.globalAlpha *= 0.35 * k;
      for (let i = 0; i < 8; i++) {
        const x = w * (0.08 + i * 0.12) + Math.sin(p * 4 + i) * 10;
        const g = ctx.createLinearGradient(x, 0, x, h);
        g.addColorStop(0, 'rgba(255,220,120,0.9)');
        g.addColorStop(1, 'rgba(255,220,120,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 16, 0, 32, h);
      }
      ctx.restore();
    },
    world(ctx, p, A, B) {
      const s = A.s, d = B.x >= A.x ? 1 : -1;
      const circle = win(0.1, 0.3, 0.9, 1, p);
      magicCircle(ctx, A.x - d * 60 * s, A.y, 150 * s * circle, '#ffd870', circle, p * 3, 0.25, 41);
      const rise = easeOut(sm(0.3, 0.58, p));
      const cx = A.x - d * 70 * s, fade = 1 - sm(0.9, 0.98, p);
      if (rise > 0) {
        ctx.save();
        ctx.globalAlpha *= fade;
        colossus(ctx, cx, A.y + 4 * s, d, s * 0.85, rise, p);
        // braço com a espada de luz
        const swing = easeIn(lin(0.64, KO, p));
        const top = A.y - 255 * s * rise;
        const sh = { x: cx + d * 80 * s, y: top + 100 * s };
        const ang = mix(-0.2 * d, Math.atan2(B.x - sh.x, -(B.y - 20 * s - sh.y)), swing);
        const hand = { x: sh.x + Math.sin(ang) * 60 * s, y: sh.y - Math.cos(ang) * 60 * s };
        ctx.strokeStyle = '#d8c8a0';
        ctx.lineCap = 'round';
        ctx.lineWidth = 30 * s;
        glow(ctx, '#ffcc40', 14 * s);
        ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(hand.x, hand.y); ctx.stroke();
        lightBlade(ctx, hand.x, hand.y, ang, 300 * s * sm(0.55, 0.65, p), 18 * s, '#fff3c4', '#ffcc40', 1);
        ctx.fillStyle = '#efe4c8';
        ctx.beginPath(); ctx.arc(hand.x, hand.y, 18 * s, 0, TAU); ctx.fill();
        ctx.restore();
      }
      const pose = p < 0.1 ? P.guard(0.15) : P.cast(0.1);
      aura(ctx, A, pose, ['#7a5010', '#ffcc40', '#fff3c4'], circle, p);
      avatar(ctx, A, pose, { t: p * 7 });
      victim(ctx, B, p, 'crush');
      const hit = lin(KO, KO + 0.2, p);
      pillar(ctx, B.x, B.y, 60 * s * (1 - hit), 900 * s, '#ffe080', win(KO - 0.005, KO, KO + 0.08, KO + 0.2, p));
      shockwave(ctx, B.x, B.y, hit, s, '#ffe080', 1.4);
      debris(ctx, B.x, B.y, hit, s, 51, ['#5a4a30', '#8a7650', '#ffe080'], 36, 1.3);
      sparks(ctx, B.x, B.y - 20 * s, lin(KO, KO + 0.1, p), s, 52, '#fff3c4', 40, 240);
    },
  },
  {
    id: 'seal-judgement',
    cat: 'seal',
    name: 'JULGAMENTO DIVINO',
    sub: 'os céus dão o veredito',
    color: '#fffbe6',
    glow: '#ffe080',
    sky: ['#0a0a14', '#2c2a3e'],
    frames: [0.24, 0.6, 0.83],
    music: { root: 48, mood: 'holy', bpm: 96, lead: 'choir' },
    backdrop(ctx, p, { w, h }, a, b) {
      // nuvens se abrindo em cima do alvo
      const open = sm(0.35, 0.6, p);
      for (let i = 0; i < 14; i++) {
        const side = i % 2 ? 1 : -1;
        const x = b.x + side * (60 + rnd(61, i) * 200 + open * 160);
        const y = h * (0.05 + rnd(62, i) * 0.15);
        const r = 60 + rnd(63, i) * 50;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(120,120,150,0.9)');
        g.addColorStop(1, 'rgba(120,120,150,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      }
      godRays(ctx, b.x, 0, 14, h * 1.3, 0.05, '#fff0b0', 0.5 * open, 0, 0.9);
      void a;
    },
    world(ctx, p, A, B) {
      const s = A.s, d = B.x >= A.x ? 1 : -1;
      const pose = p < 0.1 ? P.guard(0.15) : P.pray();
      const wings = sm(0.14, 0.4, p) * (1 - sm(0.9, 0.98, p));
      lightWings(ctx, A.x - d * 4 * s, A.y - 70 * s, s, easeOut(wings), p, wings);
      aura(ctx, A, pose, ['#806020', '#ffe080', '#ffffff'], wings, p);
      avatar(ctx, A, pose, { t: p * 7 });
      // auréola
      if (wings > 0) {
        ctx.save();
        glow(ctx, '#ffe080', 14 * s);
        ctx.strokeStyle = rgba('#fff4c0', wings);
        ctx.lineWidth = 3 * s;
        ctx.beginPath();
        ctx.ellipse(A.x, A.y - 106 * s, 16 * s, 5 * s, 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
      // espadas de luz cercando o alvo
      const ring = sm(0.5, 0.66, p) * (1 - sm(KO + 0.04, KO + 0.12, p));
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        const x = B.x + Math.cos(a) * 110 * s;
        const y = B.y - 50 * s + Math.sin(a) * 30 * s;
        const inward = sm(0.72, KO, p);
        lightBlade(ctx, mix(x, B.x, inward * 0.7), y - 80 * s, Math.PI, 70 * s, 6 * s, '#fffbe6', '#ffe080', ring);
      }
      magicCircle(ctx, B.x, B.y, 120 * s * ring, '#ffe080', ring, p * 2, 0.25, 71);
      // a lança divina desce do céu
      const fall = easeIn(lin(0.7, KO, p));
      if (p > 0.64 && p < KO + 0.02) {
        const y = mix(B.y - 700 * s, B.y, fall);
        lightBlade(ctx, B.x, y - 360 * s, Math.PI, 360 * s, 26 * s, '#ffffff', '#ffe080', sm(0.64, 0.7, p), false);
      }
      victim(ctx, B, p, 'crush');
      const hit = lin(KO, KO + 0.22, p);
      pillar(ctx, B.x, B.y, 80 * s * (1 - hit * 0.7), 1200 * s, '#ffe080', win(KO - 0.005, KO, KO + 0.1, KO + 0.22, p));
      shockwave(ctx, B.x, B.y, hit, s, '#fff0b0', 1.5);
      sparks(ctx, B.x, B.y - 30 * s, hit, s, 81, '#fff0b0', 50, 280);
      rising(ctx, B.x, B.y, 260 * s, 400 * s, p, 82, 60, '#fff4c0', s, win(KO, KO + 0.03, 0.92, 1, p));
      noGlow(ctx);
    },
  },
];
