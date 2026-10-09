import {
  KO, P, TAU, aura, lightBlade, avatar, bez, clamp, easeIn, easeOut, glow, lin, mix, moon, noGlow, orb, rgba, rising, rnd, silhouette, sm, smoke, sparks, tube,
  victim, win,
} from '../kit';
import type { Actor, V } from '../kit';
import type { Scene } from '../types';

function slashX(ctx: CanvasRenderingContext2D, cx: number, cy: number, ang: number, len: number, s: number, a: number, col: string) {
  if (a <= 0) return;
  ctx.save();
  glow(ctx, col, 14 * s);
  ctx.fillStyle = `rgba(255,255,255,${a})`;
  ctx.translate(cx, cy);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(-len, 0);
  ctx.quadraticCurveTo(0, -3 * s, len, 0);
  ctx.quadraticCurveTo(0, 3 * s, -len, 0);
  ctx.fill();
  ctx.restore();
}

/** Serpente espiritual gigante: `pts` vai da cauda até a cabeça. */
function serpent(ctx: CanvasRenderingContext2D, pts: V[], s: number, open: number, alpha: number, t: number) {
  if (alpha <= 0 || pts.length < 3) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  glow(ctx, '#3cff6a', 22 * s);
  const head = pts[pts.length - 1], neck = pts[pts.length - 3];
  const g = ctx.createLinearGradient(pts[0].x, pts[0].y, head.x, head.y);
  g.addColorStop(0, 'rgba(10,60,20,0.2)');
  g.addColorStop(0.4, '#1f7a34');
  g.addColorStop(1, '#43d86a');
  tube(ctx, pts, (k) => (6 + Math.sin(k * Math.PI) * 26 + k * 10) * s, g);
  noGlow(ctx);
  // escamas (faixas claras ao longo do corpo)
  ctx.strokeStyle = 'rgba(190,255,190,0.35)';
  ctx.lineWidth = 1.5 * s;
  for (let i = 2; i < pts.length - 2; i += 2) {
    const a = pts[i - 1], b = pts[i + 1];
    const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
    const w = (6 + Math.sin((i / pts.length) * Math.PI) * 26 + (i / pts.length) * 10) * s * 0.42;
    ctx.beginPath();
    ctx.moveTo(pts[i].x + Math.cos(ang) * w, pts[i].y + Math.sin(ang) * w);
    ctx.quadraticCurveTo(pts[i].x + Math.cos(ang - Math.PI / 2) * 6 * s, pts[i].y + Math.sin(ang - Math.PI / 2) * 6 * s, pts[i].x - Math.cos(ang) * w, pts[i].y - Math.sin(ang) * w);
    ctx.stroke();
  }
  // cabeça
  const ang = Math.atan2(head.y - neck.y, head.x - neck.x);
  ctx.translate(head.x, head.y);
  ctx.rotate(ang);
  glow(ctx, '#3cff6a', 18 * s);
  const hg = ctx.createLinearGradient(-20 * s, -20 * s, 40 * s, 20 * s);
  hg.addColorStop(0, '#2a9a48');
  hg.addColorStop(1, '#8affa6');
  ctx.fillStyle = hg;
  const jaw = open * 0.55;
  // maxilar de cima
  ctx.save();
  ctx.rotate(-jaw);
  ctx.beginPath();
  ctx.moveTo(-18 * s, -14 * s);
  ctx.quadraticCurveTo(10 * s, -26 * s, 44 * s, -6 * s);
  ctx.lineTo(46 * s, 0);
  ctx.lineTo(-14 * s, 4 * s);
  ctx.closePath();
  ctx.fill();
  // presas
  noGlow(ctx);
  ctx.fillStyle = '#ffffff';
  for (const fx of [30, 38]) {
    ctx.beginPath();
    ctx.moveTo(fx * s, -1 * s); ctx.lineTo((fx + 3) * s, 12 * s * (0.4 + open)); ctx.lineTo((fx + 6) * s, -1 * s);
    ctx.fill();
  }
  // olho
  glow(ctx, '#fff200', 10 * s);
  ctx.fillStyle = '#fff200';
  ctx.beginPath(); ctx.ellipse(12 * s, -13 * s, 5 * s, 3 * s, -0.25, 0, TAU); ctx.fill();
  ctx.fillStyle = '#000';
  noGlow(ctx);
  ctx.fillRect(11.4 * s, -16 * s, 1.4 * s, 6 * s);
  ctx.restore();
  // maxilar de baixo
  ctx.save();
  ctx.rotate(jaw * 0.8);
  ctx.fillStyle = '#2a8a44';
  ctx.beginPath();
  ctx.moveTo(-14 * s, 2 * s);
  ctx.lineTo(40 * s, 4 * s);
  ctx.quadraticCurveTo(12 * s, 16 * s, -12 * s, 12 * s);
  ctx.closePath();
  ctx.fill();
  // língua
  if (open > 0.3) {
    ctx.strokeStyle = '#ff3060';
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(20 * s, 6 * s);
    ctx.quadraticCurveTo(40 * s, 8 * s + Math.sin(t * 60) * 3 * s, 52 * s, 4 * s);
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

export const DAGGER: Scene[] = [
  {
    id: 'dagger-phantom',
    cat: 'dagger',
    name: 'LÂMINAS FANTASMAS',
    sub: 'mil punhais giram, só um destino',
    color: '#e6fbff',
    glow: '#5ae0ff',
    sky: ['#010608', '#08222c'],
    frames: [0.24, 0.6, 0.83],
    music: { root: 47, mood: 'dark', bpm: 150, lead: 'synth' },
    backdrop(ctx, p, { w, h }) {
      moon(ctx, w * 0.78, h * 0.2, h * 0.08, '#bff4ff', 1, 3);
      for (let i = 0; i < 10; i++) {
        const x = ((rnd(11, i) * w + p * 160 * (i % 2 ? 1 : -1)) % (w + 200)) - 100;
        const y = h * (0.5 + rnd(12, i) * 0.5);
        const g = ctx.createRadialGradient(x, y, 0, x, y, h * 0.3);
        g.addColorStop(0, 'rgba(90,224,255,0.14)');
        g.addColorStop(1, 'rgba(90,224,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
    },
    world(ctx, p, A, B) {
      const s = A.s, d = B.x >= A.x ? 1 : -1;
      const N = 28;
      const toss = p > 0.12 && p < 0.3;
      const pose = p < 0.12 ? P.crouch(2.7) : toss ? P.throwFwd(2.4) : p < 0.72 ? P.cast(0.4) : P.after(2.8);
      aura(ctx, A, pose, ['#04303c', '#5ae0ff', '#e6fbff'], win(0.1, 0.25, 0.9, 1, p), p);
      avatar(ctx, A, pose, { t: p * 7 });
      // punhais se multiplicando num redemoinho em volta do alvo
      const spread = sm(0.18, 0.4, p);
      const tighten = sm(0.45, 0.72, p);
      const strike = easeIn(lin(0.72, KO, p));
      const cx = B.x, cy = B.y - 50 * s;
      const spin = p * 18;
      for (let i = 0; i < N; i++) {
        const born = 0.18 + (i / N) * 0.2;
        const vis = sm(born, born + 0.04, p) * (1 - sm(KO, KO + 0.02, p));
        if (vis <= 0) continue;
        // anel 3D inclinado: cada punhal numa órbita
        const ring = i % 3;
        const ang = (i / N) * TAU * 3 + spin * (ring === 1 ? -1 : 1);
        const R = mix(220, 70, tighten) * s * (1 - strike) * (0.85 + ring * 0.15);
        const tilt = [0.35, -0.5, 0.9][ring];
        let x = cx + Math.cos(ang) * R;
        let y = cy + Math.sin(ang) * R * 0.4 + Math.cos(ang) * R * 0.3 * tilt;
        // saem da mão do lutador
        const hx = A.x + d * 20 * s, hy = A.y - 70 * s;
        const out = sm(born, born + 0.08, p);
        x = mix(hx, x, out);
        y = mix(hy, y, out);
        // aponta para o centro (no golpe final) ou na direção do giro
        const aim = strike > 0 ? Math.atan2(cx - x, -(cy - y)) : ang + (ring === 1 ? -1 : 1) * Math.PI / 2 + Math.PI / 2;
        // rastro fantasma
        const tail = [];
        for (let k = 0; k < 6; k++) {
          const a2 = ang - (ring === 1 ? -1 : 1) * k * 0.09;
          const r2 = R * (1 + k * 0.01);
          tail.push({ x: mix(hx, cx + Math.cos(a2) * r2, out), y: mix(hy, cy + Math.sin(a2) * r2 * 0.4 + Math.cos(a2) * r2 * 0.3 * tilt, out) });
        }
        if (strike === 0 && out >= 1) {
          const g = ctx.createLinearGradient(tail[0].x, tail[0].y, tail[5].x, tail[5].y);
          g.addColorStop(0, rgba('#bff4ff', 0.6 * vis));
          g.addColorStop(1, rgba('#5ae0ff', 0));
          tube(ctx, tail, (k) => (1 - k) * 5 * s, g);
        }
        const behind = Math.sin(ang) < 0 && strike === 0;
        lightBlade(ctx, x, y + 12 * s, aim, 26 * s, 4 * s, '#f0fdff', '#5ae0ff', vis * (behind ? 0.55 : 1));
      }
      victim(ctx, B, p, 'fall');
      const hit = lin(KO, KO + 0.18, p);
      orb(ctx, cx, cy, 170 * s * (1 - hit * 0.5), '#5ae0ff', win(KO - 0.005, KO, KO + 0.04, KO + 0.15, p));
      for (let i = 0; i < 8; i++) slashX(ctx, cx, cy, (i / 8) * Math.PI + 0.2, 130 * s, s * 1.2, win(KO - 0.005, KO, KO + 0.03, KO + 0.1, p), '#5ae0ff');
      sparks(ctx, cx, cy, hit, s, 5, '#bff4ff', 50, 240);
      rising(ctx, B.x, B.y, 160 * s, 200 * s, p, 6, 30, '#bff4ff', s, win(KO, KO + 0.03, 0.9, 1, p));
      noGlow(ctx);
      void smoke; void silhouette; void clamp; void easeOut; void glow;
    },
  },
  {
    id: 'dagger-viper',
    cat: 'dagger',
    name: 'PRESA DA VÍBORA',
    sub: 'o veneno desperta a serpente',
    color: '#d8ffe0',
    glow: '#3cff6a',
    sky: ['#010803', '#0a2a12'],
    frames: [0.24, 0.6, 0.83],
    music: { root: 46, mood: 'wild', bpm: 138, lead: 'synth' },
    backdrop(ctx, p, { w, h }) {
      for (let i = 0; i < 12; i++) {
        const x = ((rnd(21, i) * w + p * 120 * (i % 2 ? 1 : -1)) % (w + 200)) - 100;
        const y = h * (0.5 + rnd(22, i) * 0.5);
        const g = ctx.createRadialGradient(x, y, 0, x, y, h * 0.3);
        g.addColorStop(0, 'rgba(60,255,110,0.18)');
        g.addColorStop(1, 'rgba(60,255,110,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      // bolhas tóxicas
      ctx.strokeStyle = 'rgba(140,255,160,0.5)';
      for (let i = 0; i < 30; i++) {
        const k = (rnd(23, i) + p * 1.5) % 1;
        const x = rnd(24, i) * w, y = h - k * h * 0.8;
        ctx.beginPath(); ctx.arc(x, y, 2 + rnd(25, i) * 4, 0, TAU); ctx.stroke();
      }
    },
    world(ctx, p, A, B) {
      const s = A.s, d = B.x >= A.x ? 1 : -1;
      const pose = p < 0.1 ? P.guard(2.7) : p < 0.55 ? P.crouch(2.7) : P.throwFwd(2.4);
      // adagas pingando veneno
      const coat = win(0.12, 0.25, 0.9, 1, p);
      silhouette(ctx, A, pose, '#3cff6a', coat * 0.5, { scale: 1.08, blur: 16 * s });
      avatar(ctx, A, pose, { t: p * 7 });
      if (coat > 0) {
        for (let i = 0; i < 8; i++) {
          const k = (rnd(31, i) + p * 4) % 1;
          orb(ctx, A.x + d * (10 + rnd(32, i) * 16) * s, A.y - 40 * s + k * 40 * s, 3 * s, '#3cff6a', coat * (1 - k));
        }
      }
      // a serpente sai do chão atrás do lutador e dá o bote
      const rise = sm(0.28, 0.52, p);
      const strike = easeIn(lin(0.66, KO, p));
      const retreat = sm(KO + 0.04, 0.95, p);
      if (rise > 0) {
        const base = { x: A.x - d * 70 * s, y: A.y + 10 * s };
        const idle = { x: A.x - d * 20 * s + Math.sin(p * 20) * 6 * s, y: A.y - 190 * s * rise };
        const target = { x: B.x - d * 10 * s, y: B.y - 55 * s };
        const head = { x: mix(idle.x, target.x, strike), y: mix(idle.y, target.y, strike) };
        const c1 = { x: base.x - d * 40 * s, y: base.y - 120 * s * rise };
        const c2 = { x: mix(idle.x - d * 60 * s, (A.x + B.x) / 2, strike), y: mix(idle.y + 30 * s, A.y - 200 * s, strike) };
        const pts = bez(base, c1, c2, head, 30);
        const open = Math.max(win(0.45, 0.52, 0.6, 0.66, p), win(0.72, 0.78, KO + 0.02, KO + 0.08, p));
        serpent(ctx, pts, s * 1.2, open, rise * (1 - retreat), p);
      }
      victim(ctx, B, p, 'poison');
      const hit = lin(KO, KO + 0.16, p);
      sparks(ctx, B.x, B.y - 55 * s, hit, s, 41, '#3cff6a', 40, 180);
      orb(ctx, B.x, B.y - 50 * s, 120 * s * (1 - hit), '#3cff6a', win(KO - 0.01, KO, KO + 0.04, KO + 0.14, p));
      rising(ctx, B.x, B.y, 120 * s, 180 * s, p, 42, 40, '#7aff9a', s, win(KO, KO + 0.03, 0.9, 1, p), 3);
      noGlow(ctx);
      void rgba;
    },
  },
];
