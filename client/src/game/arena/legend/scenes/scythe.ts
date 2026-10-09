import {
  KO, P, TAU, aura, avatar, crescent, easeIn, easeOut, glow, lin, mix, moon, noGlow, orb, rgba, rising, rnd, sm, sparks, victim, win,
} from '../kit';
import type { Scene } from '../types';

/** Ceifador gigante encapuzado. (x,y) = base do manto; `swing` 0→1 = golpe da foice. */
function reaper(ctx: CanvasRenderingContext2D, x: number, y: number, d: number, s: number, rise: number, swing: number, alpha: number, t: number) {
  if (alpha <= 0) return;
  const H = 300 * s;
  const top = y - H * rise;
  ctx.save();
  ctx.globalAlpha *= alpha;
  // só aparece acima do chão
  ctx.beginPath();
  ctx.rect(x - 800 * s, y - 1500 * s, 1600 * s, 1500 * s);
  ctx.clip();
  // manto esfarrapado
  glow(ctx, '#5affb0', 26 * s);
  const g = ctx.createLinearGradient(x, top, x, y);
  g.addColorStop(0, '#1a2a24');
  g.addColorStop(0.6, '#0c1410');
  g.addColorStop(1, 'rgba(8,14,10,0.2)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.bezierCurveTo(x + 50 * s, top, x + 58 * s, top + 40 * s, x + 56 * s, top + 70 * s); // capuz
  ctx.quadraticCurveTo(x + 110 * s, top + 90 * s, x + 120 * s, top + 140 * s); // ombro
  ctx.quadraticCurveTo(x + 130 * s, top + 230 * s, x + 150 * s, top + H);
  // barra rasgada
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const px = x + 150 * s - (300 * s * i) / n;
    const py = top + H - (i % 2 ? 20 + Math.sin(t * 20 + i) * 8 : 0) * s;
    ctx.lineTo(px, py);
  }
  ctx.quadraticCurveTo(x - 130 * s, top + 230 * s, x - 120 * s, top + 140 * s);
  ctx.quadraticCurveTo(x - 110 * s, top + 90 * s, x - 56 * s, top + 70 * s);
  ctx.bezierCurveTo(x - 58 * s, top + 40 * s, x - 50 * s, top, x, top);
  ctx.fill();
  noGlow(ctx);
  // dobras do manto
  ctx.strokeStyle = 'rgba(90,255,176,0.15)';
  ctx.lineWidth = 2 * s;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * 25 * s, top + 110 * s);
    ctx.quadraticCurveTo(x + i * 38 * s, top + 200 * s, x + i * 55 * s, top + H - 10 * s);
    ctx.stroke();
  }
  // rosto: vazio negro com olhos
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(x + d * 6 * s, top + 45 * s, 30 * s, 34 * s, 0, 0, TAU);
  ctx.fill();
  glow(ctx, '#5affb0', 16 * s);
  ctx.fillStyle = '#b0ffd8';
  for (const ex of [-11, 13]) {
    ctx.beginPath();
    ctx.ellipse(x + d * 6 * s + ex * s, top + 44 * s, 5 * s, 2.5 * s, ex < 0 ? 0.25 : -0.25, 0, TAU);
    ctx.fill();
  }
  // braço ossudo e a foice gigante
  const sh = { x: x + d * 95 * s, y: top + 120 * s };
  const ang = mix(-0.5 * d, 2.3 * d, easeIn(swing));
  const hand = { x: sh.x + Math.sin(ang * 0.4) * 50 * s * d, y: sh.y + 20 * s };
  ctx.strokeStyle = '#d8d8c8';
  ctx.lineWidth = 7 * s;
  ctx.lineCap = 'round';
  noGlow(ctx);
  ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(hand.x, hand.y); ctx.stroke();
  ctx.save();
  ctx.translate(hand.x, hand.y);
  ctx.rotate(ang);
  // cabo
  ctx.strokeStyle = '#2a2018';
  ctx.lineWidth = 9 * s;
  ctx.beginPath(); ctx.moveTo(0, 90 * s); ctx.lineTo(0, -260 * s); ctx.stroke();
  // lâmina
  glow(ctx, '#5affb0', 24 * s);
  const bg = ctx.createLinearGradient(0, -260 * s, 220 * s * d, -200 * s);
  bg.addColorStop(0, '#e8fff4');
  bg.addColorStop(1, '#6affc0');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(0, -250 * s);
  ctx.quadraticCurveTo(140 * s * d, -300 * s, 230 * s * d, -170 * s);
  ctx.quadraticCurveTo(130 * s * d, -240 * s, 0, -222 * s);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // dedos
  ctx.fillStyle = '#d8d8c8';
  ctx.beginPath(); ctx.arc(hand.x, hand.y, 8 * s, 0, TAU); ctx.fill();
  ctx.restore();
}

export const SCYTHE: Scene[] = [
  {
    id: 'scythe-reaper',
    cat: 'scythe',
    name: 'O CEIFADOR',
    sub: 'a morte veio buscar o que é dela',
    color: '#d8ffe8',
    glow: '#5affb0',
    sky: ['#020605', '#0e1c16'],
    frames: [0.24, 0.6, 0.84],
    music: { root: 40, mood: 'dark', bpm: 90, lead: 'choir' },
    backdrop(ctx, p, { w, h }) {
      moon(ctx, w * 0.5, h * 0.2, h * 0.1, '#cfe8dc', 0.9, 2.4);
      for (let i = 0; i < 12; i++) {
        const x = ((rnd(51, i) * w + p * 150 * (i % 2 ? 1 : -1)) % (w + 200)) - 100;
        const y = h * (0.55 + rnd(52, i) * 0.45);
        const g = ctx.createRadialGradient(x, y, 0, x, y, h * 0.3);
        g.addColorStop(0, 'rgba(120,200,160,0.2)');
        g.addColorStop(1, 'rgba(120,200,160,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
    },
    world(ctx, p, A, B) {
      const s = A.s, d = B.x >= A.x ? 1 : -1;
      const rise = easeOut(sm(0.22, 0.52, p));
      const swing = lin(0.64, KO, p);
      reaper(ctx, A.x - d * 30 * s, A.y + 10 * s, d, s, rise, swing, (1 - sm(0.9, 0.98, p)), p);
      const pose = p < 0.1 ? P.guard(0.2) : P.cast(0.15);
      aura(ctx, A, pose, ['#0a3a24', '#5affb0', '#d8ffe8'], win(0.12, 0.3, 0.9, 1, p), p);
      avatar(ctx, A, pose, { t: p * 7 });
      // rastro da foice gigante
      if (swing > 0.3 && swing < 1) {
        crescent(ctx, B.x - d * 60 * s, B.y - 140 * s, 180 * s, 30 * s, d > 0 ? 0.5 : Math.PI - 0.5, '#b0ffd8', '#5affb0', (swing - 0.3) * 1.2, 1.6);
      }
      victim(ctx, B, p, 'fall');
      // a alma é arrancada e puxada para o ceifador
      const pull = lin(KO + 0.02, 0.95, p);
      if (pull > 0 && pull < 1) {
        const sx = mix(B.x, A.x - d * 20 * s, easeIn(pull)), sy = mix(B.y - 60 * s, A.y - 260 * s, easeIn(pull));
        ctx.save();
        glow(ctx, '#5affb0', 20 * s);
        const tail = [];
        for (let i = 0; i < 10; i++) tail.push({ x: mix(sx, B.x, i / 30), y: mix(sy, B.y - 60 * s, i / 30) + Math.sin(i + p * 30) * 5 * s });
        ctx.strokeStyle = rgba('#b0ffd8', 1 - pull);
        ctx.lineWidth = 6 * s;
        ctx.beginPath();
        ctx.moveTo(tail[0].x, tail[0].y);
        for (const q of tail) ctx.lineTo(q.x, q.y);
        ctx.stroke();
        ctx.restore();
        orb(ctx, sx, sy, 22 * s, '#5affb0', 1 - pull * 0.5);
      }
      sparks(ctx, B.x, B.y - 50 * s, lin(KO, KO + 0.1, p), s, 91, '#5affb0', 30, 180);
      rising(ctx, B.x, B.y, 160 * s, 160 * s, p, 92, 24, '#b0ffd8', s, win(KO, KO + 0.03, 0.9, 1, p));
    },
  },
  {
    id: 'scythe-moon',
    cat: 'scythe',
    name: 'LUA MINGUANTE',
    sub: 'a lua desce para ceifar',
    color: '#efe6ff',
    glow: '#a070ff',
    sky: ['#04020c', '#160c30'],
    frames: [0.24, 0.6, 0.835],
    music: { root: 44, mood: 'arcane', bpm: 118, lead: 'choir' },
    backdrop(ctx, p, { w, h }) {
      // a lua cheia vai sendo "comida" até virar uma foice no céu
      const mx = w * 0.5, my = h * 0.24, r = h * 0.14;
      const bite = sm(0.12, 0.55, p) * (1 - sm(0.62, 0.66, p));
      moon(ctx, mx, my, r, '#d8ccff', 1 - sm(0.62, 0.66, p), 2.4);
      if (bite > 0) {
        ctx.fillStyle = '#060312';
        ctx.beginPath();
        ctx.arc(mx + r * (1.6 - bite * 1.3), my - r * 0.1, r * 1.02, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 80; i++) ctx.fillRect(rnd(61, i) * w, rnd(62, i) * h * 0.7, 1.4, 1.4);
    },
    world(ctx, p, A, B) {
      const s = A.s, d = B.x >= A.x ? 1 : -1;
      const spinning = p > 0.3 && p < 0.62;
      const pose = p < 0.1 ? P.guard(0.2) : spinning ? P.spin(p * 60, 1.4) : p < 0.66 ? P.throwBack(-1.2) : P.throwFwd(1.8);
      aura(ctx, A, pose, ['#300a60', '#a070ff', '#efe6ff'], win(0.12, 0.3, 0.9, 1, p), p);
      // foice girando em rodas de luz
      if (spinning) {
        const k = win(0.3, 0.35, 0.58, 0.62, p);
        for (let i = 0; i < 3; i++) crescent(ctx, A.x, A.y - 50 * s, (60 + i * 10) * s, 12 * s, p * 70 + i * 2.1, '#d8ccff', '#a070ff', k * (0.9 - i * 0.2), 2.6);
      }
      avatar(ctx, A, pose, { t: p * 7 });
      // a lua crescente viaja até o alvo
      const fly = easeIn(lin(0.64, KO, p));
      if (p > 0.62 && p < KO + 0.03) {
        const grow = sm(0.6, 0.68, p);
        const x = mix(A.x + d * 50 * s, B.x + d * 30 * s, fly);
        const y = mix(A.y - 180 * s, B.y - 55 * s, fly);
        for (let i = 1; i < 5; i++) crescent(ctx, x - d * i * 30 * s * fly, y - i * 20 * s * fly, 110 * s * grow, 28 * s, d > 0 ? 0 : Math.PI, '#d8ccff', '#a070ff', 0.25 - i * 0.04, 2.4);
        crescent(ctx, x, y, 110 * s * grow, 30 * s, d > 0 ? 0 : Math.PI, '#efe6ff', '#a070ff', 1, 2.4);
      }
      victim(ctx, B, p, 'split');
      const hit = lin(KO, KO + 0.18, p);
      orb(ctx, B.x, B.y - 50 * s, 150 * s * (1 - hit), '#a070ff', win(KO - 0.005, KO, KO + 0.04, KO + 0.15, p));
      sparks(ctx, B.x, B.y - 50 * s, hit, s, 81, '#d8ccff', 40, 220);
      rising(ctx, B.x, B.y, 160 * s, 200 * s, p, 82, 30, '#d8ccff', s, win(KO, KO + 0.03, 0.9, 1, p));
      noGlow(ctx);
      void glow; void TAU;
    },
  },
];
