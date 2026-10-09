import {
  KO, P, TAU, aura, avatar, bez, flame, glow, lin, mix, noGlow, orb, rgba, rising, rnd, shockwave, silhouette, sm, sparks, stars, tube,
  victim, win,
} from '../kit';
import type { V } from '../kit';
import type { Scene } from '../types';

// ------------------------------------------------------------------ dragão

/** Asa de dragão (membrana com ossos). side = 1 asa da frente, 0.8 asa de trás. */
function dragonWing(ctx: CanvasRenderingContext2D, x: number, y: number, back: number, s: number, flap: number, shade: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(back, 1);
  ctx.rotate(-0.25 + flap);
  const wrist = { x: 70 * s, y: -80 * s };
  const tips: V[] = [{ x: 175 * s, y: -95 * s }, { x: 190 * s, y: -30 * s }, { x: 160 * s, y: 30 * s }, { x: 95 * s, y: 50 * s }];
  // membrana (borda recortada entre as pontas)
  const g = ctx.createLinearGradient(0, 0, 190 * s, -60 * s);
  g.addColorStop(0, `rgba(${60 * shade | 0},6,6,0.95)`);
  g.addColorStop(0.6, `rgba(${170 * shade | 0},24,16,0.92)`);
  g.addColorStop(1, `rgba(${230 * shade | 0},70,30,0.85)`);
  glow(ctx, '#ff3a12', 18 * s);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(wrist.x, wrist.y);
  ctx.lineTo(tips[0].x, tips[0].y);
  for (let i = 1; i < tips.length; i++) {
    const a = tips[i - 1], b = tips[i];
    ctx.quadraticCurveTo((a.x + b.x) / 2 - 22 * s, (a.y + b.y) / 2 - 4 * s, b.x, b.y);
  }
  ctx.quadraticCurveTo(40 * s, 30 * s, 0, 20 * s);
  ctx.closePath();
  ctx.fill();
  noGlow(ctx);
  // ossos
  ctx.strokeStyle = `rgba(${255 * shade | 0},150,90,0.9)`;
  ctx.lineCap = 'round';
  ctx.lineWidth = 4 * s;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(wrist.x, wrist.y); ctx.stroke();
  ctx.lineWidth = 2.2 * s;
  for (const t of tips) { ctx.beginPath(); ctx.moveTo(wrist.x, wrist.y); ctx.lineTo(t.x, t.y); ctx.stroke(); }
  // garra do pulso
  ctx.fillStyle = '#ffd0a0';
  ctx.beginPath(); ctx.moveTo(wrist.x, wrist.y); ctx.lineTo(wrist.x - 6 * s, wrist.y - 16 * s); ctx.lineTo(wrist.x + 6 * s, wrist.y - 4 * s); ctx.fill();
  ctx.restore();
}

/** Cabeça de dragão espiritual (olhando para a direita, d=1). */
function dragonHead(ctx: CanvasRenderingContext2D, x: number, y: number, d: number, s: number, a: number, open: number, t: number) {
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.translate(x, y);
  ctx.scale(d, 1);
  glow(ctx, '#ff3a12', 30 * s);
  const skin = ctx.createLinearGradient(-40 * s, -40 * s, 90 * s, 20 * s);
  skin.addColorStop(0, 'rgba(160,20,10,0.9)');
  skin.addColorStop(0.6, 'rgba(255,90,30,0.92)');
  skin.addColorStop(1, 'rgba(255,200,110,0.95)');
  const jaw = open * 0.5;
  // chifres
  ctx.fillStyle = 'rgba(255,220,170,0.9)';
  ctx.beginPath();
  ctx.moveTo(-10 * s, -30 * s); ctx.quadraticCurveTo(-50 * s, -60 * s, -80 * s, -50 * s); ctx.quadraticCurveTo(-45 * s, -44 * s, -18 * s, -18 * s);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-4 * s, -24 * s); ctx.quadraticCurveTo(-35 * s, -40 * s, -62 * s, -24 * s); ctx.quadraticCurveTo(-32 * s, -26 * s, -10 * s, -12 * s);
  ctx.fill();
  // mandíbula de baixo
  ctx.save();
  ctx.rotate(jaw * 0.7);
  ctx.fillStyle = 'rgba(190,40,20,0.92)';
  ctx.beginPath();
  ctx.moveTo(-26 * s, 4 * s);
  ctx.lineTo(80 * s, 8 * s);
  ctx.quadraticCurveTo(40 * s, 26 * s, -20 * s, 22 * s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff8e8';
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo((12 + i * 11) * s, 7 * s); ctx.lineTo((16 + i * 11) * s, -2 * s); ctx.lineTo((20 + i * 11) * s, 7 * s); ctx.fill(); }
  ctx.restore();
  // crânio e focinho
  ctx.save();
  ctx.rotate(-jaw * 0.35);
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(-34 * s, -8 * s);
  ctx.quadraticCurveTo(-30 * s, -36 * s, 6 * s, -32 * s); // testa
  ctx.quadraticCurveTo(24 * s, -30 * s, 30 * s, -22 * s); // sobrancelha
  ctx.quadraticCurveTo(62 * s, -20 * s, 88 * s, -8 * s); // focinho
  ctx.quadraticCurveTo(94 * s, -2 * s, 86 * s, 4 * s);
  ctx.lineTo(-26 * s, 6 * s);
  ctx.closePath();
  ctx.fill();
  noGlow(ctx);
  ctx.fillStyle = '#fff8e8';
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo((14 + i * 11) * s, 3 * s); ctx.lineTo((18 + i * 11) * s, 12 * s); ctx.lineTo((22 + i * 11) * s, 3 * s); ctx.fill(); }
  // escamas
  ctx.strokeStyle = 'rgba(255,220,160,0.4)';
  ctx.lineWidth = 1.4 * s;
  for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc((-20 + i * 14) * s, -14 * s, 6 * s, Math.PI, TAU); ctx.stroke(); }
  // narina e olho
  ctx.fillStyle = '#3a0800';
  ctx.beginPath(); ctx.ellipse(80 * s, -9 * s, 3 * s, 1.6 * s, 0.3, 0, TAU); ctx.fill();
  glow(ctx, '#fff3a0', 14 * s);
  ctx.fillStyle = '#fff3a0';
  ctx.beginPath(); ctx.ellipse(18 * s, -20 * s, 7 * s, 3 * s, -0.2, 0, TAU); ctx.fill();
  ctx.fillStyle = '#200';
  noGlow(ctx);
  ctx.fillRect(17 * s, -23 * s, 1.8 * s, 6 * s);
  ctx.restore();
  // fumaça saindo das narinas
  if (open < 0.3) for (let i = 0; i < 3; i++) flame(ctx, 90 * s, -12 * s, 4 * s, t * 40 + i, '#ffd060', '#ff4010', 0.6);
  ctx.restore();
}

// ------------------------------------------------------------------ kitsune

/** Nove caudas de fogo (base em x,y; back = -1 aponta para a esquerda). */
function nineTails(ctx: CanvasRenderingContext2D, x: number, y: number, back: number, s: number, count: number, t: number, alpha: number) {
  if (alpha <= 0 || count <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  for (let i = 0; i < Math.ceil(count); i++) {
    const a = Math.min(1, count - i);
    const k = i / 8;
    const ang = -Math.PI / 2 + back * (0.15 + k * 1.55);
    const len = (150 + Math.sin(k * Math.PI) * 50) * s * a;
    const wave = Math.sin(t * 9 + i * 0.9) * 0.25;
    const p0 = { x, y };
    const p3 = { x: x + Math.cos(ang + wave * back) * len, y: y + Math.sin(ang + wave * back) * len };
    const p1 = { x: x + Math.cos(ang - back * 0.6) * len * 0.35, y: y + Math.sin(ang - back * 0.6) * len * 0.35 };
    const p2 = { x: x + Math.cos(ang + back * 0.5 + wave) * len * 0.75, y: y + Math.sin(ang + back * 0.5 + wave) * len * 0.75 };
    const pts = bez(p0, p1, p2, p3, 22);
    const g = ctx.createLinearGradient(p0.x, p0.y, p3.x, p3.y);
    g.addColorStop(0, 'rgba(255,214,140,0.95)');
    g.addColorStop(0.55, 'rgba(255,248,230,0.97)');
    g.addColorStop(0.85, 'rgba(160,230,255,0.95)');
    g.addColorStop(1, 'rgba(58,208,255,0.6)');
    glow(ctx, '#ffc860', 18 * s);
    tube(ctx, pts, (q) => (8 + Math.sin(q * Math.PI * 0.85) * 26) * s * (1 - q * 0.55), g, { wobble: 0.08, seed: i, time: t });
    noGlow(ctx);
    // linhas de pelo
    ctx.strokeStyle = 'rgba(255,190,90,0.45)';
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    for (let j = 4; j < pts.length - 3; j += 3) { ctx.moveTo(pts[j].x, pts[j].y); ctx.lineTo(pts[j + 2].x + back * 4 * s, pts[j + 2].y); }
    ctx.stroke();
    // ponta em fogo azul
    flame(ctx, p3.x, p3.y + 6 * s, 7 * s, t * 30 + i, '#9fe8ff', '#3ad0ff', a);
  }
  ctx.restore();
}

/** A raposa espiritual gigante (olhando para a direita se d=1). Pés em (x,y). */
function kitsune(ctx: CanvasRenderingContext2D, x: number, y: number, d: number, s: number, a: number, t: number, leap: number) {
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.translate(x, y);
  ctx.scale(d, 1);
  ctx.rotate(-leap * 0.18);
  nineTails(ctx, -80 * s, -80 * s, -1, s * 0.95, 9, t, 1);
  const fur = ctx.createLinearGradient(-100 * s, -120 * s, 120 * s, 0);
  fur.addColorStop(0, 'rgba(255,210,140,0.9)');
  fur.addColorStop(0.5, 'rgba(255,246,228,0.97)');
  fur.addColorStop(1, '#ffffff');
  const legFill = 'rgba(255,236,200,0.95)';
  const stretch = leap;
  glow(ctx, '#ffc860', 26 * s);
  // pernas de trás e da frente (esticam no salto)
  tube(ctx, bez({ x: -70 * s, y: -60 * s }, { x: -80 * s, y: -30 * s }, { x: -95 * s - stretch * 40 * s, y: -10 * s }, { x: -100 * s - stretch * 60 * s, y: 0 }, 8), (q) => (26 - q * 16) * s, legFill);
  tube(ctx, bez({ x: 55 * s, y: -55 * s }, { x: 62 * s, y: -30 * s }, { x: 64 * s + stretch * 40 * s, y: -12 * s }, { x: 60 * s + stretch * 70 * s, y: -stretch * 20 * s }, 8), (q) => (18 - q * 8) * s, legFill);
  tube(ctx, bez({ x: 30 * s, y: -55 * s }, { x: 34 * s, y: -30 * s }, { x: 40 * s + stretch * 30 * s, y: -10 * s }, { x: 38 * s + stretch * 55 * s, y: -stretch * 10 * s }, 8), (q) => (16 - q * 7) * s, 'rgba(230,200,160,0.9)');
  // corpo
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.moveTo(-100 * s, -70 * s);
  ctx.bezierCurveTo(-90 * s, -112 * s, -10 * s, -104 * s, 40 * s, -100 * s); // costas
  ctx.bezierCurveTo(70 * s, -98 * s, 82 * s, -70 * s, 72 * s, -42 * s); // peito
  ctx.bezierCurveTo(40 * s, -30 * s, -30 * s, -36 * s, -70 * s, -40 * s); // barriga
  ctx.quadraticCurveTo(-104 * s, -46 * s, -100 * s, -70 * s);
  ctx.fill();
  // juba de pelo pontudo no pescoço
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) {
    const k = i / 10;
    const ang = -2.4 + k * 2.6;
    const r = (i % 2 ? 34 : 50) * s;
    const px = 60 * s + Math.cos(ang) * r, py = -84 * s + Math.sin(ang) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  // cabeça
  ctx.fillStyle = '#fffaf0';
  ctx.beginPath();
  ctx.moveTo(62 * s, -128 * s);
  ctx.bezierCurveTo(84 * s, -140 * s, 104 * s, -130 * s, 112 * s, -118 * s); // testa
  ctx.quadraticCurveTo(136 * s, -108 * s, 158 * s, -100 * s); // focinho
  ctx.quadraticCurveTo(162 * s, -94 * s, 154 * s, -91 * s);
  ctx.quadraticCurveTo(126 * s, -86 * s, 110 * s, -80 * s); // queixo
  ctx.lineTo(118 * s, -70 * s); // tufo da bochecha
  ctx.lineTo(98 * s, -76 * s);
  ctx.lineTo(102 * s, -64 * s);
  ctx.quadraticCurveTo(74 * s, -80 * s, 62 * s, -128 * s);
  ctx.fill();
  // orelhas grandes
  for (const [ex, lean] of [[74, -0.2], [94, 0.05]] as const) {
    ctx.save();
    ctx.translate(ex * s, -128 * s);
    ctx.rotate(lean);
    ctx.fillStyle = '#fffaf0';
    ctx.beginPath(); ctx.moveTo(-12 * s, 4 * s); ctx.lineTo(0, -52 * s); ctx.lineTo(13 * s, 2 * s); ctx.fill();
    noGlow(ctx);
    ctx.fillStyle = 'rgba(58,208,255,0.8)';
    ctx.beginPath(); ctx.moveTo(-6 * s, 0); ctx.lineTo(0, -38 * s); ctx.lineTo(7 * s, 0); ctx.fill();
    glow(ctx, '#ffc860', 26 * s);
    ctx.restore();
  }
  noGlow(ctx);
  // marcas vermelhas de kitsune no rosto
  ctx.strokeStyle = '#ff3050';
  ctx.lineWidth = 2.2 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(96 * s, -134 * s); ctx.quadraticCurveTo(100 * s, -124 * s, 94 * s, -118 * s);
  ctx.moveTo(104 * s, -104 * s); ctx.quadraticCurveTo(116 * s, -100 * s, 126 * s, -104 * s);
  ctx.moveTo(100 * s, -96 * s); ctx.quadraticCurveTo(110 * s, -92 * s, 120 * s, -94 * s);
  ctx.stroke();
  // olho brilhando
  glow(ctx, '#3ad0ff', 16 * s);
  ctx.fillStyle = '#3ad0ff';
  ctx.beginPath(); ctx.ellipse(112 * s, -114 * s, 7 * s, 2.6 * s, -0.35, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.ellipse(113 * s, -114.5 * s, 2 * s, 1 * s, -0.35, 0, TAU); ctx.fill();
  noGlow(ctx);
  // focinho
  ctx.fillStyle = '#301818';
  ctx.beginPath(); ctx.arc(157 * s, -97 * s, 3 * s, 0, TAU); ctx.fill();
  // chamas azuis subindo pelas costas
  for (let i = 0; i < 9; i++) {
    const k = i / 8;
    const px = mix(-90, 40, k) * s, py = (-106 + Math.sin(k * Math.PI) * -4) * s;
    flame(ctx, px, py, (5 + (i % 3) * 2) * s, t * 30 + i * 1.7, '#9fe8ff', '#3ad0ff', 0.8);
  }
  ctx.restore();
}

export const HYBRID: Scene[] = [
  {
    id: 'hybrid-dragon',
    cat: 'hybrid',
    name: 'DESPERTAR DRACÔNICO',
    sub: 'o sangue do dragão ferve',
    color: '#ffe0b0',
    glow: '#ff3a12',
    sky: ['#0c0202', '#3a0808'],
    frames: [0.24, 0.62, 0.77],
    music: { root: 41, mood: 'fire', bpm: 128, lead: 'brass' },
    backdrop(ctx, p, { w, h }) {
      rising(ctx, w / 2, h, w, h, p, 3, 70, '#ff7a30', 1, 0.9);
      const g = ctx.createRadialGradient(w * 0.5, h * 0.2, 0, w * 0.5, h * 0.2, h);
      g.addColorStop(0, 'rgba(255,40,10,0.35)');
      g.addColorStop(1, 'rgba(255,40,10,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    world(ctx, p, A, B) {
      const s = A.s, d = B.x >= A.x ? 1 : -1;
      const wings = sm(0.1, 0.34, p) * (1 - sm(0.92, 1, p));
      const fly = sm(0.36, 0.5, p) * (1 - sm(0.86, 0.95, p));
      const breath = win(0.62, 0.68, KO + 0.04, KO + 0.12, p);
      const me = { ...A, y: A.y - fly * 70 * s };
      const pose = fly > 0.2 ? P.fly() : P.guard(0.9);
      const flap = Math.sin(p * 36) * 0.3 * Math.max(fly, 0.2);
      // asas (a de trás primeiro)
      if (wings > 0) {
        dragonWing(ctx, me.x - d * 8 * s, me.y - 64 * s, -d * 0.85, s * wings, flap * 0.8 - 0.1, 0.7);
        dragonWing(ctx, me.x - d * 2 * s, me.y - 60 * s, -d, s * wings, flap, 1);
      }
      aura(ctx, me, pose, ['#600808', '#ff3a12', '#ffd0a0'], wings, p);
      avatar(ctx, me, pose, { t: p * 7 });
      // escamas brilhando na pele
      if (wings > 0.5) {
        for (let i = 0; i < 10; i++) orb(ctx, me.x + (rnd(9, i) - 0.5) * 24 * s, me.y - (20 + rnd(10, i) * 60) * s, 3 * s, '#ff8040', wings * (0.5 + 0.5 * Math.sin(p * 30 + i)));
      }
      // cabeça de dragão espiritual
      const head = sm(0.5, 0.62, p) * (1 - sm(0.86, 0.94, p));
      const hx = me.x + d * 60 * s, hy = me.y - 70 * s;
      dragonHead(ctx, hx, hy, d, s * 1.3, head, breath, p);
      victim(ctx, B, p, 'burn');
      if (breath > 0) {
        const ox = hx + d * 100 * s, oy = hy + 4 * s;
        const tx = B.x + d * 20 * s, ty = B.y - 20 * s;
        const ang = Math.atan2(ty - oy, tx - ox), len = Math.hypot(tx - ox, ty - oy) * 1.1;
        ctx.save();
        ctx.translate(ox, oy);
        ctx.rotate(ang);
        glow(ctx, '#ff5a1a', 40 * s);
        for (let layer = 0; layer < 3; layer++) {
          const wdt = (70 - layer * 22) * s;
          const g = ctx.createLinearGradient(0, 0, len, 0);
          const cols = [['255,80,20', '255,40,10'], ['255,170,50', '255,90,20'], ['255,250,210', '255,200,90']][layer];
          g.addColorStop(0, `rgba(${cols[0]},${breath * 0.95})`);
          g.addColorStop(1, `rgba(${cols[1]},${breath * 0.4})`);
          ctx.fillStyle = g;
          const wob = Math.sin(p * 90 + layer) * 5 * s;
          ctx.beginPath();
          ctx.moveTo(0, -5 * s);
          ctx.quadraticCurveTo(len * 0.5, -wdt * 0.45 + wob, len, -wdt);
          ctx.quadraticCurveTo(len * 1.1, 0, len, wdt);
          ctx.quadraticCurveTo(len * 0.5, wdt * 0.45 - wob, 0, 5 * s);
          ctx.fill();
        }
        noGlow(ctx);
        for (let i = 0; i < 50; i++) {
          const k = (rnd(121, i) + p * 7) % 1;
          const px = k * len * 1.05, py = (rnd(122, i) - 0.5) * k * 120 * s;
          orb(ctx, px, py, (6 + k * 22) * s, '#ff8a2a', breath * (1 - k * 0.5), '#fff0c0');
        }
        ctx.restore();
      }
      const hit = lin(KO, KO + 0.2, p);
      shockwave(ctx, B.x, B.y, hit, s, '#ff8a3a', 1.2);
      sparks(ctx, B.x, B.y - 40 * s, hit, s, 131, '#ffc060', 40, 240);
      rising(ctx, B.x, B.y, 200 * s, 300 * s, p, 132, 60, '#ff8a3a', s, win(KO, KO + 0.03, 0.92, 1, p), 3);
    },
  },
  {
    id: 'hybrid-fox',
    cat: 'hybrid',
    name: 'KITSUNE DE NOVE CAUDAS',
    sub: 'o espírito da raposa desperta',
    color: '#fff6de',
    glow: '#3ad0ff',
    sky: ['#020612', '#0c1e3c'],
    frames: [0.3, 0.6, 0.76],
    music: { root: 47, mood: 'japan', bpm: 122, lead: 'flute' },
    backdrop(ctx, p, { w, h }) {
      stars(ctx, w, h, 80, '#bfe8ff', 0.6, 77);
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = `rgba(60,200,255,${0.1 + i * 0.04})`;
        ctx.lineWidth = h * 0.07;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 20) {
          const y = h * (0.16 + i * 0.07) + Math.sin(x * 0.01 + p * 6 + i) * h * 0.05;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // lanternas de fogo-fátuo flutuando
      for (let i = 0; i < 12; i++) {
        const x = rnd(78, i) * w, y = h * (0.3 + rnd(79, i) * 0.4) + Math.sin(p * 8 + i) * 8;
        flame(ctx, x, y, 4 + rnd(80, i) * 3, p * 20 + i, '#9fe8ff', '#3ad0ff', 0.6);
      }
    },
    world(ctx, p, A, B) {
      const s = A.s, d = B.x >= A.x ? 1 : -1;
      const tails = lin(0.12, 0.4, p) * 9;
      const glowA = win(0.1, 0.3, 0.9, 1, p);
      const spirit = sm(0.42, 0.56, p) * (1 - sm(0.9, 0.97, p));
      const leap = sm(0.64, KO, p);
      // o espírito gigante se forma atrás do lutador e salta
      if (spirit > 0) {
        const fx = mix(A.x - d * 70 * s, B.x - d * 150 * s, leap);
        const fy = A.y - Math.sin(leap * Math.PI) * 60 * s + (1 - spirit) * 60 * s;
        kitsune(ctx, fx, fy, d, s * (0.9 + leap * 0.1), spirit, p, leap);
      }
      // fogo-fátuo girando em volta
      for (let i = 0; i < 9; i++) {
        const ang = (i / 9) * TAU + p * 9;
        flame(ctx, A.x + Math.cos(ang) * 55 * s, A.y - 45 * s + Math.sin(ang) * 22 * s, 6 * s, p * 30 + i, '#9fe8ff', '#3ad0ff', glowA * (1 - spirit));
      }
      nineTails(ctx, A.x - d * 6 * s, A.y - 40 * s, -d, s * 0.55, tails, p, glowA * (1 - spirit * 0.85));
      const pose = P.guard(1.25);
      aura(ctx, A, pose, ['#c08020', '#ffe0a0', '#ffffff'], glowA, p);
      avatar(ctx, A, pose, { t: p * 7 });
      if (glowA > 0.3) {
        glow(ctx, '#3ad0ff', 10 * s);
        ctx.fillStyle = rgba('#3ad0ff', glowA);
        ctx.fillRect(A.x + d * 4 * s, A.y - 76 * s, 3 * s, 2 * s);
        noGlow(ctx);
      }
      victim(ctx, B, p, 'burn');
      // explosão de fogo azul
      const hit = lin(KO, KO + 0.2, p);
      if (hit > 0 && hit < 1) {
        for (let i = 0; i < 20; i++) {
          const a = (i / 20) * TAU;
          flame(ctx, B.x + Math.cos(a) * hit * 150 * s, B.y - 40 * s + Math.sin(a) * hit * 90 * s, 10 * s * (1 - hit * 0.6), i + p * 30, '#9fe8ff', '#3ad0ff', 1 - hit);
        }
        orb(ctx, B.x, B.y - 40 * s, 180 * s * (1 - hit * 0.5), '#3ad0ff', (1 - hit) * 0.9);
      }
      shockwave(ctx, B.x, B.y, hit, s, '#9fe8ff', 1.2);
      sparks(ctx, B.x, B.y - 40 * s, hit, s, 141, '#bfeaff', 30, 200);
      void silhouette;
    },
  },
];
