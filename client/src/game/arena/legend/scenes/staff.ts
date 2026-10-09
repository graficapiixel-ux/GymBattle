import {
  KO, P, TAU, aura, avatar, debris, easeIn, glow, glyph, lin, magicCircle, mix, noGlow, orb, rgba, rising, rnd, shockwave, sm, sparks,
  stars, tube, victim, win,
} from '../kit';
import type { Scene } from '../types';

/** Meteoro de pedra com runas brilhando. */
function runeMeteor(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, s: number, a: number) {
  if (a <= 0 || r <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.translate(x, y);
  ctx.rotate(rot);
  glow(ctx, '#b060ff', 40 * s);
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
  g.addColorStop(0, '#6a5a7a');
  g.addColorStop(1, '#241a30');
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * TAU;
    const rr = r * (0.82 + rnd(71, i) * 0.22);
    if (i === 0) ctx.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr); else ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
  }
  ctx.closePath();
  ctx.fill();
  // rachaduras e runas brilhando
  ctx.strokeStyle = '#e0b0ff';
  ctx.lineWidth = r * 0.04;
  glow(ctx, '#b060ff', r * 0.2);
  for (let i = 0; i < 5; i++) {
    ctx.save();
    ctx.translate(Math.cos(i * 1.3) * r * 0.45, Math.sin(i * 1.3) * r * 0.45);
    glyph(ctx, r * 0.15, i);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.moveTo(-r * 0.7, -r * 0.1); ctx.lineTo(-r * 0.2, r * 0.1); ctx.lineTo(r * 0.1, -r * 0.3); ctx.lineTo(r * 0.6, r * 0.2);
  ctx.stroke();
  ctx.restore();
}

export const STAFF: Scene[] = [
  {
    id: 'staff-domain',
    cat: 'staff',
    name: 'DOMÍNIO ABSOLUTO',
    sub: 'aqui, só existe a minha vontade',
    color: '#d9fbff',
    glow: '#7a5cff',
    sky: ['#000000', '#07051a'],
    frames: [0.24, 0.56, 0.87],
    music: { root: 42, mood: 'arcane', bpm: 100, lead: 'choir' },
    backdrop(ctx, p, { w, h }, a) {
      const R = sm(0.3, 0.55, p) * Math.hypot(w, h);
      if (R <= 0) return;
      ctx.save();
      ctx.beginPath();
      ctx.arc(a.x, a.y - 40, R, 0, TAU);
      ctx.clip();
      ctx.fillStyle = '#02010a';
      ctx.fillRect(0, 0, w, h);
      const neb: [number, number, string][] = [[0.3, 0.35, '122,92,255'], [0.7, 0.3, '0,200,220'], [0.55, 0.72, '255,60,180']];
      for (const [nx, ny, c] of neb) {
        const g = ctx.createRadialGradient(w * nx, h * ny, 0, w * nx, h * ny, h * 0.6);
        g.addColorStop(0, `rgba(${c},0.45)`);
        g.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      const gx = w * 0.5, gy = h * 0.36;
      for (let i = 0; i < 420; i++) {
        const arm = i % 3;
        const d = rnd(21, i);
        const ang = arm * (TAU / 3) + d * 5 + p * 3;
        const rr = d * h * 0.45;
        ctx.fillStyle = i % 5 ? 'rgba(220,240,255,0.85)' : 'rgba(255,190,255,0.9)';
        ctx.fillRect(gx + Math.cos(ang) * rr + (rnd(22, i) - 0.5) * 8, gy + Math.sin(ang) * rr * 0.42 + (rnd(23, i) - 0.5) * 6, 1.6, 1.6);
      }
      orb(ctx, gx, gy, h * 0.08, '#d0c0ff', 0.9);
      stars(ctx, w, h, 140, '#ffffff', 0.9, 88);
      ctx.restore();
      ctx.strokeStyle = 'rgba(170,150,255,0.95)';
      ctx.lineWidth = 3;
      glow(ctx, '#7a5cff', 24);
      ctx.beginPath();
      ctx.arc(a.x, a.y - 40, R, 0, TAU);
      ctx.stroke();
      noGlow(ctx);
    },
    world(ctx, p, A, B) {
      const s = A.s, d = B.x >= A.x ? 1 : -1;
      const hands = sm(0.08, 0.2, p);
      const pose = hands > 0 ? P.palms() : P.guard(0.05);
      aura(ctx, A, pose, ['#2a1060', '#7a5cff', '#d9fbff'], hands * (1 - sm(0.92, 1, p)), p);
      avatar(ctx, A, pose, { t: p * 7 });
      if (hands > 0) {
        const hx = A.x + d * 16 * s, hy = A.y - 60 * s;
        ctx.save();
        glow(ctx, '#7a5cff', 20 * s);
        for (let i = 0; i < 3; i++) {
          const k = (p * 3 + i / 3) % 1;
          ctx.strokeStyle = rgba('#c8beff', (1 - k) * hands);
          ctx.lineWidth = 2 * s;
          ctx.beginPath(); ctx.arc(hx, hy, k * 60 * s, 0, TAU); ctx.stroke();
        }
        ctx.restore();
        orb(ctx, hx, hy, 14 * s, '#c8beff', hands);
      }
      // runas presas em volta do alvo
      const cage = win(0.5, 0.6, 0.9, 1, p);
      if (cage > 0) {
        magicCircle(ctx, B.x, B.y, 90 * s * cage, '#8ae8ff', cage, p * 3, 0.25, 4);
        ctx.save();
        ctx.strokeStyle = rgba('#b4f0ff', cage);
        glow(ctx, '#00d0e0', 10 * s);
        ctx.lineWidth = 1.5 * s;
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU + p * 2;
          ctx.save();
          ctx.translate(B.x + Math.cos(a) * 85 * s, B.y - 45 * s + Math.sin(a) * 55 * s);
          glyph(ctx, 7 * s, i % 8);
          ctx.restore();
        }
        ctx.restore();
      }
      // raios convergindo
      const beams = win(0.62, KO, KO + 0.03, KO + 0.1, p);
      if (beams > 0) {
        ctx.save();
        glow(ctx, '#ffffff', 20 * s);
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * TAU + 0.2;
          const r = 700 * s * (1 - sm(0.62, KO, p)) + 10 * s;
          ctx.strokeStyle = rgba('#e6faff', beams);
          ctx.lineWidth = 3 * s;
          ctx.beginPath();
          ctx.moveTo(B.x + Math.cos(a) * 700 * s, B.y - 45 * s + Math.sin(a) * 700 * s);
          ctx.lineTo(B.x + Math.cos(a) * r, B.y - 45 * s + Math.sin(a) * r);
          ctx.stroke();
        }
        ctx.restore();
      }
      victim(ctx, B, p, 'dissolve');
      sparks(ctx, B.x, B.y - 45 * s, lin(KO, KO + 0.1, p), s, 9, '#d9fbff', 30, 180);
    },
  },
  {
    id: 'staff-meteor',
    cat: 'staff',
    name: 'METEORO ARCANO',
    sub: 'o céu obedece e cai',
    color: '#f0dcff',
    glow: '#b060ff',
    sky: ['#05020c', '#1c0a34'],
    frames: [0.24, 0.62, 0.83],
    music: { root: 39, mood: 'arcane', bpm: 116, lead: 'brass' },
    backdrop(ctx, p, { w, h }) {
      stars(ctx, w, h, 120, '#ffffff', 0.8, 55);
      const k = sm(0.2, 0.5, p);
      const g = ctx.createRadialGradient(w * 0.6, 0, 0, w * 0.6, 0, h);
      g.addColorStop(0, `rgba(176,96,255,${0.5 * k})`);
      g.addColorStop(1, 'rgba(176,96,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    world(ctx, p, A, B) {
      const s = A.s, d = B.x >= A.x ? 1 : -1;
      const pose = p < 0.1 ? P.guard(0.05) : P.cast(0.1);
      aura(ctx, A, pose, ['#3a1070', '#b060ff', '#f0dcff'], win(0.1, 0.25, 0.9, 1, p), p);
      avatar(ctx, A, pose, { t: p * 7 });
      const circ = sm(0.15, 0.4, p) * (1 - sm(0.86, 0.95, p));
      const cy = B.y - 270 * s;
      magicCircle(ctx, B.x, cy, 230 * s * circ, '#d0a0ff', circ, p * 2, 0.3, 21);
      magicCircle(ctx, B.x, cy - 30 * s, 150 * s * circ, '#f0dcff', circ * 0.8, -p * 3, 0.3, 22);
      // feixe da ponta do cajado até o círculo
      if (circ > 0 && p < 0.6) {
        ctx.save();
        glow(ctx, '#b060ff', 16 * s);
        ctx.strokeStyle = rgba('#e8ccff', circ * 0.8);
        ctx.lineWidth = 3 * s;
        ctx.beginPath();
        ctx.moveTo(A.x + d * 10 * s, A.y - 140 * s);
        ctx.quadraticCurveTo(mix(A.x, B.x, 0.3), cy - 60 * s, B.x, cy);
        ctx.stroke();
        ctx.restore();
      }
      // o meteoro sai do círculo e cai
      const emerge = sm(0.45, 0.62, p);
      const fall = easeIn(lin(0.64, KO, p));
      if (emerge > 0 && p < KO + 0.005) {
        const y = mix(cy + 70 * s, B.y - 40 * s, fall);
        const x = B.x + mix(-d * 60 * s, 0, fall);
        const r = 70 * s * emerge;
        if (fall > 0) {
          const pts = [];
          for (let i = 0; i <= 10; i++) pts.push({ x: x - d * i * 8 * s * fall, y: y - i * 40 * s * fall });
          const g = ctx.createLinearGradient(x, y, pts[10].x, pts[10].y);
          g.addColorStop(0, 'rgba(230,190,255,0.9)');
          g.addColorStop(1, 'rgba(176,96,255,0)');
          glow(ctx, '#b060ff', 30 * s);
          tube(ctx, pts, (k) => (1 - k) * r * 2.2, g);
          noGlow(ctx);
        }
        orb(ctx, x, y, r * 2, '#b060ff', 0.6 * emerge);
        runeMeteor(ctx, x, y, r, p * 6, s, emerge);
      }
      victim(ctx, B, p, 'launch');
      const hit = lin(KO, KO + 0.22, p);
      orb(ctx, B.x, B.y - 40 * s, 300 * s * (0.4 + hit * 0.6), '#b060ff', win(KO - 0.005, KO, KO + 0.06, KO + 0.22, p));
      shockwave(ctx, B.x, B.y, hit, s, '#d0a0ff', 1.6);
      debris(ctx, B.x, B.y, hit, s, 31, ['#241a30', '#4a3a5a', '#e0b0ff'], 44, 1.5);
      sparks(ctx, B.x, B.y - 30 * s, lin(KO, KO + 0.12, p), s, 32, '#e8ccff', 50, 300);
      rising(ctx, B.x, B.y, 300 * s, 300 * s, p, 33, 50, '#d0a0ff', s, win(KO, KO + 0.03, 0.92, 1, p));
    },
  },
];
