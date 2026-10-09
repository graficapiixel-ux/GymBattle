import {
  KO, P, TAU, avatar, easeIn, glow, lin, mix, moon, noGlow, rgba, rnd, silhouette, sm, sparks, victim, win,
} from '../kit';
import type { Actor } from '../kit';
import type { Scene } from '../types';

/** Pétalas voando (rosa-claro), com vento. */
function petals(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, p: number, s: number, n: number, seed: number, alpha: number, burst = 0) {
  if (alpha <= 0) return;
  ctx.save();
  for (let i = 0; i < n; i++) {
    const k = (rnd(seed, i) + p * (0.6 + rnd(seed + 1, i) * 0.6)) % 1;
    let x = cx + (rnd(seed + 2, i) - 0.5) * w - k * 160 * s + Math.sin(k * 9 + i) * 18 * s;
    let y = cy - h / 2 + k * h;
    if (burst > 0) {
      const a = rnd(seed + 3, i) * TAU;
      x = cx + Math.cos(a) * burst * (80 + rnd(seed + 4, i) * 220) * s;
      y = cy + Math.sin(a) * burst * (50 + rnd(seed + 5, i) * 150) * s;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(k * 14 + i);
    ctx.scale(1, 0.5 + 0.5 * Math.sin(p * 20 + i));
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = i % 5 ? '#ffc9d9' : '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -3.5 * s);
    ctx.quadraticCurveTo(3 * s, -1 * s, 0, 3.5 * s);
    ctx.quadraticCurveTo(-3 * s, -1 * s, 0, -3.5 * s);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** Linha de corte brilhante. */
function slash(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, s: number, a: number, col = '#ff2a4a') {
  if (a <= 0) return;
  ctx.save();
  glow(ctx, col, 18 * s);
  const nx = -(y2 - y1), ny = x2 - x1, l = Math.hypot(nx, ny) || 1;
  const w = 3.5 * s;
  ctx.fillStyle = `rgba(255,255,255,${a})`;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo((x1 + x2) / 2 + (nx / l) * w, (y1 + y2) / 2 + (ny / l) * w);
  ctx.lineTo(x2, y2);
  ctx.lineTo((x1 + x2) / 2 - (nx / l) * w, (y1 + y2) / 2 - (ny / l) * w);
  ctx.fill();
  ctx.restore();
}

function afterimage(ctx: CanvasRenderingContext2D, A: Actor, x: number, y: number, facing: 1 | -1, a: number) {
  silhouette(ctx, { ...A, x, y }, P.lunge(1.55), '#ff8fb0', a * 0.5, { facing, blur: 10 * A.s });
}

export const KATANA: Scene[] = [
  {
    id: 'katana-horizon',
    cat: 'katana',
    name: 'CORTE DO HORIZONTE',
    sub: 'um único golpe, antes do tempo voltar',
    color: '#ffffff',
    glow: '#ff2a4a',
    sky: ['#0b0d14', '#343a4a'],
    frames: [0.24, 0.66, 0.835],
    music: { root: 50, mood: 'japan', bpm: 96, lead: 'flute' },
    backdrop(ctx, p, { w, h }) {
      moon(ctx, w * 0.62, h * 0.33, h * 0.26, '#e9ecf2', 1, 1.9);
      // silêncio: tudo desbotado depois do corte
      const gray = win(0.45, 0.5, 0.78, 0.8, p);
      if (gray > 0) {
        ctx.fillStyle = `rgba(200,205,215,${0.18 * gray})`;
        ctx.fillRect(0, 0, w, h);
      }
    },
    world(ctx, p, A, B) {
      const s = A.s, d = B.x >= A.x ? 1 : -1;
      const dash = sm(0.44, 0.46, p);
      const behind: Actor = { ...A, x: B.x + d * 75 * s };
      if (dash < 1) {
        const pose = p > 0.1 ? P.crouch(2.2) : P.guard(0.95);
        silhouette(ctx, A, pose, '#ff2a4a', win(0.2, 0.3, 0.42, 0.44, p) * 0.6, { scale: 1.08, blur: 16 * s });
        avatar(ctx, A, pose, { t: p * 7 });
        // vento varrendo o chão
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 1.5 * s;
        for (let i = 0; i < 8; i++) {
          const y = A.y - (3 + i * 11) * s;
          const x = A.x - d * ((p * 1400 + i * 70) % 220) * s;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - d * 40 * s, y);
          ctx.stroke();
        }
        ctx.restore();
      }
      victim(ctx, B, p, 'split');
      if (dash > 0) {
        // o rastro do corte relâmpago
        const fade = 1 - sm(0.46, 0.62, p);
        slash(ctx, A.x, A.y - 45 * s, behind.x, A.y - 47 * s, s, fade);
        for (let i = 0; i < 4; i++) afterimage(ctx, A, mix(A.x, behind.x, (i + 1) / 5), A.y, d as 1 | -1, fade * (0.3 + i * 0.15));
        // guarda a katana devagar... clic
        const sheath = sm(0.5, 0.78, p);
        const pose = P.after(1.55 - sheath * 3.3);
        pose.armF = [1.55 - sheath * 1.5, 0.05 + sheath * 1.35];
        avatar(ctx, behind, pose, { facing: d as 1 | -1, t: p * 7 });
        petals(ctx, B.x, B.y - 120 * s, 600 * s, 300 * s, p, s, 40, 61, 1);
      }
      // "clic": o corte aparece atravessando o horizonte
      const cut = win(KO - 0.008, KO, KO + 0.05, KO + 0.14, p);
      if (cut > 0) {
        const y = B.y - 52 * B.s;
        ctx.save();
        glow(ctx, '#ff2a4a', 30 * s);
        ctx.fillStyle = `rgba(255,255,255,${cut})`;
        ctx.fillRect(B.x - 3000, y - 1.5 * s, 6000, 3 * s);
        ctx.fillStyle = `rgba(255,42,74,${cut * 0.45})`;
        ctx.fillRect(B.x - 3000, y - 9 * s, 6000, 18 * s);
        ctx.restore();
        sparks(ctx, B.x, y, lin(KO, KO + 0.1, p), s, 7, '#ff6080', 30, 200);
      }
      petals(ctx, B.x, B.y - 50 * s, 0, 0, p, s, 60, 70, win(KO, KO + 0.01, 0.9, 1, p), sm(KO, KO + 0.15, p));
      noGlow(ctx);
    },
  },
  {
    id: 'katana-petals',
    cat: 'katana',
    name: 'TEMPESTADE DE PÉTALAS',
    sub: 'oito cortes, uma flor que cai',
    color: '#ffe0ea',
    glow: '#ff5a8a',
    sky: ['#140614', '#4a1a38'],
    frames: [0.24, 0.6, 0.845],
    music: { root: 52, mood: 'japan', bpm: 128, lead: 'strings' },
    backdrop(ctx, p, { w, h }) {
      // céu de entardecer e uma árvore florida ao fundo
      const g = ctx.createRadialGradient(w * 0.5, h * 0.9, 0, w * 0.5, h * 0.9, h);
      g.addColorStop(0, 'rgba(255,120,160,0.45)');
      g.addColorStop(1, 'rgba(255,120,160,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.fillStyle = '#1a0a14';
      const tx = w * 0.82, ty = h * 0.95;
      ctx.beginPath();
      ctx.moveTo(tx - 12, ty); ctx.quadraticCurveTo(tx - 20, ty - h * 0.3, tx - 60, ty - h * 0.5);
      ctx.lineTo(tx - 50, ty - h * 0.52); ctx.quadraticCurveTo(tx, ty - h * 0.35, tx + 50, ty - h * 0.55);
      ctx.lineTo(tx + 58, ty - h * 0.52); ctx.quadraticCurveTo(tx + 10, ty - h * 0.3, tx + 12, ty);
      ctx.fill();
      for (let i = 0; i < 24; i++) {
        const cx = tx + (rnd(40, i) - 0.5) * 220, cy = ty - h * (0.45 + rnd(41, i) * 0.25);
        const r = 22 + rnd(42, i) * 30;
        const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        cg.addColorStop(0, 'rgba(255,170,200,0.7)');
        cg.addColorStop(1, 'rgba(255,140,180,0)');
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
      }
      ctx.restore();
    },
    world(ctx, p, A, B) {
      const s = A.s, d = B.x >= A.x ? 1 : -1;
      const gone = p > 0.34 && p < 0.72;
      if (p <= 0.34) {
        const pose = p > 0.12 ? P.crouch(2.0) : P.guard(0.95);
        silhouette(ctx, A, pose, '#ff5a8a', win(0.15, 0.25, 0.3, 0.34, p) * 0.7, { scale: 1.08, blur: 16 * s });
        avatar(ctx, A, pose, { t: p * 7 });
      }
      // tempestade de pétalas girando em volta do alvo
      const storm = win(0.3, 0.4, 0.85, 0.95, p);
      ctx.save();
      for (let i = 0; i < 140; i++) {
        const a = rnd(90, i) * TAU + p * (8 + rnd(91, i) * 6);
        const r = (40 + rnd(92, i) * 170) * s * (1 - sm(0.74, KO, p) * 0.7);
        const x = B.x + Math.cos(a) * r, y = B.y - 50 * s + Math.sin(a) * r * 0.45;
        ctx.globalAlpha = storm * 0.9;
        ctx.fillStyle = i % 5 ? '#ffc9d9' : '#ffffff';
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a * 2);
        ctx.fillRect(-3 * s, -1.2 * s, 6 * s, 2.4 * s);
        ctx.restore();
      }
      ctx.restore();
      victim(ctx, B, p, 'fall');
      // oito cortes em zigue-zague, com imagens residuais
      if (gone) {
        const n = 8;
        const k = lin(0.36, 0.72, p) * n;
        for (let i = 0; i < n; i++) {
          const a = (i * 2.4) % TAU;
          const r = 140 * s;
          const x1 = B.x + Math.cos(a) * r, y1 = B.y - 50 * s + Math.sin(a) * r * 0.5;
          const x2 = B.x - Math.cos(a) * r, y2 = B.y - 50 * s - Math.sin(a) * r * 0.5;
          const age = k - i;
          if (age < 0) continue;
          const alpha = Math.max(0, 1 - age / 3);
          slash(ctx, x1, y1, x2, y2, s, alpha, '#ff5a8a');
          if (age < 1) afterimage(ctx, A, mix(x1, x2, age), mix(y1, y2, age) + 45 * s, x2 > x1 ? 1 : -1, 1);
        }
      }
      if (p >= 0.72) {
        const behind: Actor = { ...A, x: B.x + d * 80 * s };
        const sheath = sm(0.72, 0.8, p);
        const pose = P.after(1.55 - sheath * 3.3);
        pose.armF = [1.55 - sheath * 1.5, 0.05 + sheath * 1.35];
        avatar(ctx, behind, pose, { facing: d as 1 | -1, t: p * 7 });
      }
      // explosão de pétalas no KO
      const burst = sm(KO, KO + 0.18, p);
      if (burst > 0) {
        petals(ctx, B.x, B.y - 50 * s, 0, 0, p, s * 1.4, 120, 33, 1 - sm(0.9, 1, p), burst);
        for (let i = 0; i < 8; i++) {
          const a = (i * 2.4) % TAU;
          slash(ctx, B.x + Math.cos(a) * 160 * s, B.y - 50 * s + Math.sin(a) * 80 * s, B.x - Math.cos(a) * 160 * s, B.y - 50 * s - Math.sin(a) * 80 * s, s, win(KO - 0.01, KO, KO + 0.03, KO + 0.08, p), '#ff5a8a');
        }
      }
      noGlow(ctx);
      void easeIn; void rgba;
    },
  },
];
