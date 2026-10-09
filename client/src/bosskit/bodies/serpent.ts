/**
 * SERPENTES (feat.kind): 0 = Leviatã (serpente marinha saindo da água), 1 = Thalassor (kraken),
 * 2 = Hidra (três cabeças), 3 = Quetzaryn (serpente emplumada voando).
 * Origem no chão, olhando para a esquerda; ~400 de largura x ~340 de altura em escala 1.
 *
 * LOCOMOÇÃO: as serpentes rastejam com uma onda que viaja da cabeça até a cauda. A fase da onda
 * vem de st.gait (um ciclo = 150 unidades locais percorridas), então as corcovas ficam paradas no
 * MUNDO enquanto o corpo desliza por dentro delas (sem patinar). A hidra anda nas quatro patas.
 */
import type { BossSpec } from '@gymbattle/shared';
import type { Anchors, DrawState, V } from '../types';
import { eyeGlow, h01, hurtTint, mixHex, rgrad, vgrad, TAU, clamp, hexA, bez, tube, magicCircle, orb, sm } from '../util';

/** Passada do motor: um ciclo de gait = 150 unidades locais percorridas. */
const STRIDE = 150;

/**
 * Curvas de animação com os princípios clássicos:
 *  a   = antecipação (carga 0 → ~0,4, segura e solta rápido),
 *  s   = golpe (0,44 → 0,55, rápido), segura e volta suave até 1,
 *  imp = tranco do impacto (pico em 0,55 e decai),
 *  ft  = follow-through (passa do ponto depois do impacto),
 *  hold= sustentação (sopro/rugido),
 *  mv/g/dir = locomoção (quanto anda, fase da onda, sentido).
 */
function cv(st: DrawState) {
  const at = st.anim === 'attack';
  const p = st.p;
  const pose = (...n: string[]) => (at && n.includes(st.pose) ? 1 : 0);
  return {
    at: at ? 1 : 0,
    a: at ? sm(0.02, 0.4, p) * (1 - sm(0.44, 0.53, p)) : 0,
    s: at ? sm(0.44, 0.55, p) * (1 - sm(0.7, 1, p)) : 0,
    imp: at ? (p < 0.55 ? sm(0.5, 0.55, p) : Math.exp(-(p - 0.55) * 11)) : 0,
    ft: at ? Math.sin(clamp((p - 0.55) / 0.42) * Math.PI) : 0,
    hold: at ? sm(0.42, 0.5, p) * (1 - sm(0.8, 0.96, p)) : 0,
    on: at ? sm(0, 0.12, p) * (1 - sm(0.86, 1, p)) : 0,
    breath: pose('breath'), shoot: pose('shoot'), slam: pose('slam'), cast: pose('cast'),
    swipe: pose('swipe'), charge: pose('charge'), roar: pose('roar'),
    die: st.anim === 'death' ? st.p : 0,
    hurt: clamp(st.hurt),
    mv: clamp(st.move),
    g: st.gait,
    dir: st.vx > 1 ? 1 : -1,
    b: Math.sin(st.t * 1.4),
  };
}
type CV = ReturnType<typeof cv>;

/** O mesmo estado um pouco no passado (para atraso/rastro das partes soltas). */
function past(st: DrawState, dt: number): DrawState {
  return { ...st, t: st.t - dt, p: st.anim === 'idle' ? st.p : clamp(st.p - dt * 0.55), gait: st.gait - dt * 1.2 * st.move, hurt: clamp(st.hurt + dt * 2) };
}

const ctxNull = null as unknown as CanvasRenderingContext2D;
function colors(s: BossSpec, st: DrawState) {
  const P = s.pal;
  return {
    body: hurtTint(ctxNull, st, P.body), dark: hurtTint(ctxNull, st, P.dark), accent: hurtTint(ctxNull, st, P.accent),
    belly: hurtTint(ctxNull, st, mixHex(P.body, P.accent, 0.45)), light: hurtTint(ctxNull, st, mixHex(P.body, '#ffffff', 0.25)),
    glow: P.glow, eye: P.eye,
  };
}
type C = ReturnType<typeof colors>;

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const rotV = (x: number, y: number, a: number): V => ({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) });

export function drawSerpent(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState): Anchors {
  const kind = s.feat.kind ?? 0;
  const c = colors(s, st);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const a = kind === 1 ? kraken(ctx, s, st, c) : kind === 2 ? hydra(ctx, s, st, c) : kind === 3 ? quetzal(ctx, s, st, c) : leviathan(ctx, s, st, c);
  ctx.restore();
  return a;
}

// ------------------------------------------------------------------ peças comuns

/** Brilho somado (luz). */
function bloom(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number) {
  if (a <= 0.02 || r <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgrad(ctx, x, y, r, hexA(color, clamp(a)), hexA(color, 0));
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Rastro (smear) de um golpe rápido: fita que afina do ponto atual para trás. */
function smear(ctx: CanvasRenderingContext2D, pts: V[], w: number, color: string, a: number) {
  if (a <= 0.03 || pts.length < 2) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = clamp(a) * 0.55;
  tube(ctx, pts, (t) => w * t * t, color);
  ctx.globalAlpha = clamp(a) * 0.7;
  tube(ctx, pts, (t) => w * 0.3 * t * t, '#ffffff');
  ctx.restore();
}

/** Normal (lado de fora) de uma linha no ponto i. */
function nrm(pts: V[], i: number): V {
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
  const nx = -(b.y - a.y), ny = b.x - a.x;
  const l = Math.hypot(nx, ny) || 1;
  return { x: nx / l, y: ny / l };
}

/**
 * Corpo de serpente: contorno, corpo, faixa da barriga e escamas.
 * chunk > 0 desenha em pedaços (para laços que se cruzam).
 */
function snakeBody(ctx: CanvasRenderingContext2D, pts: V[], wf: (t: number) => number, c: C, chunk = 0, bellySide = -1) {
  const n = pts.length - 1;
  const step = chunk > 0 ? chunk : n;
  for (let a = 0; a < n; a += step) {
    const b = Math.min(n, a + step);
    const sub = pts.slice(a, b + 1);
    const W = (t: number) => Math.max(1, wf((a + t * (b - a)) / n));
    tube(ctx, sub, (t) => W(t) + 6, c.dark);
    tube(ctx, sub, W, c.body);
    // sombra do lado da barriga (volume)
    const sh = sub.map((p, i) => {
      const nn = nrm(pts, a + i);
      const w = W(i / Math.max(1, sub.length - 1));
      return { x: p.x + nn.x * w * 0.3 * bellySide, y: p.y + nn.y * w * 0.3 * bellySide };
    });
    ctx.globalAlpha = 0.28;
    tube(ctx, sh, (t) => W(t) * 0.42, c.dark);
    ctx.globalAlpha = 1;
    // barriga (faixa clara deslocada para um lado)
    const bel = sub.map((p, i) => {
      const nn = nrm(pts, a + i);
      const w = W(i / Math.max(1, sub.length - 1));
      return { x: p.x + nn.x * w * 0.22 * bellySide, y: p.y + nn.y * w * 0.22 * bellySide };
    });
    tube(ctx, bel, (t) => W(t) * 0.36, c.belly);
    // escamas da barriga
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 2;
    for (let i = 1; i < bel.length - 1; i += 2) {
      const nn = nrm(pts, a + i);
      const w = W(i / (sub.length - 1)) * 0.16;
      ctx.beginPath();
      ctx.moveTo(bel[i].x + nn.x * w, bel[i].y + nn.y * w);
      ctx.lineTo(bel[i].x - nn.x * w, bel[i].y - nn.y * w);
      ctx.stroke();
    }
    // brilho no dorso
    const top = sub.map((p, i) => {
      const nn = nrm(pts, a + i);
      const w = W(i / Math.max(1, sub.length - 1));
      return { x: p.x - nn.x * w * 0.26 * bellySide, y: p.y - nn.y * w * 0.26 * bellySide };
    });
    ctx.globalAlpha = 0.4;
    tube(ctx, top, (t) => W(t) * 0.14, c.light);
    ctx.globalAlpha = 1;
  }
}

/** Piscar: olho quase fechado por um instante a cada poucos segundos. */
function blinkAt(t: number, seed: number) {
  const per = 3.6 + h01(seed, 4) * 2.2;
  const ph = (t + h01(seed, 5) * 3) % per;
  return ph < 0.13 ? 0.08 + Math.abs(ph - 0.065) * 12 : 1;
}

/** Cabeça de serpente apontando para a esquerda (ang > 0 = focinho para cima). */
function snakeHead(
  ctx: CanvasRenderingContext2D, h: V, ang: number, sz: number, jaw: number, c: C, st: DrawState,
  crest: 'fin' | 'horn' | 'feather', heat: number, seed = 0, crestLag = 0,
) {
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(ang);
  ctx.scale(sz, sz);
  // crista atrás da cabeça (atrasa com o movimento: crestLag > 0 = jogada para trás)
  if (crest === 'fin') {
    for (let i = 0; i < 3; i++) {
      const wv = Math.sin(st.t * 3 + i * 0.8) * 0.08 + crestLag * (0.6 + i * 0.2);
      ctx.save();
      ctx.translate(14 - i * 8, -18 + i * 10);
      ctx.rotate(-0.5 + i * 0.45 + wv);
      ctx.fillStyle = c.dark;
      ctx.beginPath();
      ctx.moveTo(-2, -10);
      ctx.quadraticCurveTo(40, -40, 82 - i * 14, -18);
      ctx.quadraticCurveTo(46, 1, -2, 10);
      ctx.fill();
      ctx.fillStyle = hexA(c.accent, 0.85);
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.quadraticCurveTo(40, -36, 78 - i * 14, -18);
      ctx.quadraticCurveTo(46, -2, 0, 8);
      ctx.fill();
      ctx.strokeStyle = c.dark;
      ctx.lineWidth = 2;
      for (let r = 0; r < 4; r++) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(30 + r * 12 - i * 4, -24 + r * 4);
        ctx.stroke();
      }
      ctx.restore();
    }
  } else if (crest === 'horn') {
    for (let i = 0; i < 2; i++) {
      ctx.save();
      ctx.translate(6 + i * 10, -18 + i * 4);
      ctx.rotate(0.9 + i * 0.3 + crestLag * 0.15);
      ctx.fillStyle = c.dark;
      ctx.beginPath();
      ctx.moveTo(-9, 2);
      ctx.quadraticCurveTo(-4, -28, 16, -42);
      ctx.quadraticCurveTo(9, -18, 9, 2);
      ctx.fill();
      ctx.fillStyle = vgrad(ctx, -38, 0, mixHex(c.accent, '#ffffff', 0.35), c.accent);
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.quadraticCurveTo(-2, -26, 14, -38);
      ctx.quadraticCurveTo(6, -18, 6, 0);
      ctx.fill();
      ctx.restore();
    }
  } else {
    const cols = [c.accent, c.eye, c.glow, c.accent, c.eye];
    for (let i = 0; i < 5; i++) {
      const fl = Math.sin(st.t * 5 + i * 1.3) * 0.1 + crestLag * (0.5 + i * 0.12);
      feather(ctx, 10 - i * 4, -16 + i * 3, -1.0 + i * 0.32 + fl, 70 - Math.abs(i - 2) * 10, 11, cols[i], c.dark);
    }
  }
  // boca por dentro (aparece quando abre)
  // a mandíbula gira para BAIXO (sentido anti-horário, já que o focinho aponta para a esquerda)
  const ja = -jaw * 0.75;
  if (jaw > 0.04) {
    const r = rotV(-76, 10, ja);
    const tip = { x: 6 + r.x, y: 6 + r.y };
    ctx.fillStyle = heat > 0.2 ? mixHex('#3a0a12', c.glow, heat * 0.35) : '#3a0a12';
    ctx.beginPath();
    ctx.moveTo(14, 2);
    ctx.lineTo(-80, 6);
    ctx.lineTo(tip.x, tip.y);
    ctx.lineTo(10, 20);
    ctx.closePath();
    ctx.fill();
    // garganta
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(2, 10, 9, 7 + jaw * 4, 0, 0, TAU);
    ctx.fill();
    // língua bífida
    const rt = rotV(-50 - jaw * 12, 6, ja * 0.55);
    ctx.strokeStyle = '#c0304a';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(-4, 12);
    ctx.quadraticCurveTo(-26, 14 + jaw * 6, 6 + rt.x, 6 + rt.y);
    ctx.lineTo(6 + rt.x - 8, 6 + rt.y - 4);
    ctx.moveTo(6 + rt.x, 6 + rt.y);
    ctx.lineTo(6 + rt.x - 8, 6 + rt.y + 4);
    ctx.stroke();
  }
  // mandíbula de baixo
  ctx.save();
  ctx.translate(6, 6);
  ctx.rotate(ja);
  ctx.fillStyle = c.dark;
  ctx.beginPath();
  ctx.moveTo(6, -6);
  ctx.lineTo(-79, 0);
  ctx.quadraticCurveTo(-84, 13, -72, 18);
  ctx.lineTo(6, 25);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = c.body;
  ctx.beginPath();
  ctx.moveTo(2, -2);
  ctx.lineTo(-74, 3);
  ctx.quadraticCurveTo(-78, 11, -69, 14);
  ctx.lineTo(2, 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = c.belly;
  ctx.beginPath();
  ctx.moveTo(0, 14);
  ctx.lineTo(-64, 12);
  ctx.lineTo(0, 21);
  ctx.fill();
  ctx.fillStyle = '#f4ecd8';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(-70 + i * 11, 3);
    ctx.lineTo(-66 + i * 11, -8 - (i === 0 ? 5 : 0));
    ctx.lineTo(-62 + i * 11, 3);
    ctx.fill();
  }
  ctx.restore();
  // boca brilhando por dentro
  if (jaw > 0.08) bloom(ctx, -36, 14 + jaw * 14, 40 * jaw + 6, c.glow, 0.35 + heat * 0.45);
  // crânio: contorno escuro e volume
  const skull = () => {
    ctx.beginPath();
    ctx.moveTo(26, -14);
    ctx.quadraticCurveTo(14, -36, -24, -28);
    ctx.quadraticCurveTo(-60, -20, -84, -6);
    ctx.quadraticCurveTo(-90, 4, -80, 8);
    ctx.lineTo(4, 12);
    ctx.quadraticCurveTo(30, 8, 26, -14);
  };
  ctx.strokeStyle = c.dark;
  ctx.lineWidth = 6;
  skull();
  ctx.stroke();
  ctx.fillStyle = vgrad(ctx, -34, 12, c.light, c.body);
  skull();
  ctx.fill();
  // sombra da bochecha
  ctx.fillStyle = hexA(c.dark, 0.35);
  ctx.beginPath();
  ctx.moveTo(18, 6);
  ctx.quadraticCurveTo(-20, 0, -78, 7);
  ctx.lineTo(4, 12);
  ctx.closePath();
  ctx.fill();
  // brilho do focinho
  ctx.fillStyle = hexA('#ffffff', 0.18);
  ctx.beginPath();
  ctx.ellipse(-46, -18, 24, 4, -0.22, 0, TAU);
  ctx.fill();
  // escamas no topo
  ctx.strokeStyle = hexA(c.dark, 0.6);
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(-10 + i * 9, -22 + i * 1.5, 6, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  }
  // presas de cima
  ctx.fillStyle = '#f4ecd8';
  for (let i = 0; i < 6; i++) {
    const long = i === 1 ? 10 : 0;
    ctx.beginPath();
    ctx.moveTo(-76 + i * 11, 6);
    ctx.lineTo(-72 + i * 11, 16 + long);
    ctx.lineTo(-68 + i * 11, 6);
    ctx.fill();
  }
  // narina
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath();
  ctx.ellipse(-76, -5, 4, 2.2, 0.3, 0, TAU);
  ctx.fill();
  // olho (com órbita escura) e sobrancelha
  const open = st.anim === 'death' ? clamp(1 - st.p * 1.4) : (st.anim === 'attack' ? 1 : blinkAt(st.t, seed)) * (1 - st.hurt * 0.6);
  ctx.fillStyle = hexA(c.dark, 0.85);
  ctx.beginPath();
  ctx.ellipse(-30, -15, 12, 8, -0.1, 0, TAU);
  ctx.fill();
  eyeGlow(ctx, -30, -16, 7 + st.rage * 2.5, c.eye, open);
  ctx.strokeStyle = c.dark;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-46, -26 + jaw * 2);
  ctx.lineTo(-16, -21 - st.rage * 5 - jaw * 3);
  ctx.stroke();
  ctx.restore();
}

/** Ponta da boca no mundo local. */
function mouthAt(h: V, ang: number, sz: number, jaw = 0): V {
  const r = rotV((-76 + jaw * 6) * sz, (8 + jaw * 24) * sz, ang);
  return { x: h.x + r.x, y: h.y + r.y };
}

/** Pena (folha alongada com haste). */
function feather(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, w: number, col: string, shaft: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.45, -w, len, 0);
  ctx.quadraticCurveTo(len * 0.45, w, 0, 0);
  ctx.fill();
  ctx.strokeStyle = shaft;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(len * 0.95, 0);
  ctx.stroke();
  ctx.restore();
}

/** Água: parte de trás (mancha escura) — desenhar antes do corpo. */
function waterBack(ctx: CanvasRenderingContext2D, st: DrawState, w: number) {
  ctx.fillStyle = rgrad(ctx, 0, 4, w, 'rgba(10,60,90,0.85)', 'rgba(4,20,34,0)');
  ctx.save();
  ctx.scale(1, 0.16);
  ctx.beginPath();
  ctx.arc(0, 20, w, 0, TAU);
  ctx.fill();
  ctx.restore();
  // ondas concêntricas
  ctx.strokeStyle = '#bfe8ff';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const ph = (st.t * 0.35 + i / 3) % 1;
    ctx.globalAlpha = (1 - ph) * 0.45;
    ctx.beginPath();
    ctx.ellipse(0, 4, 60 + ph * (w - 50), Math.max(1, (60 + ph * (w - 50)) * 0.12), 0, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/**
 * Água: superfície da frente com espuma nos pontos onde o corpo entra.
 * mv/dir: quando anda, esteira de espuma escorrendo para trás (presa ao mundo pelo gait).
 */
function waterFront(ctx: CanvasRenderingContext2D, st: DrawState, w: number, foam: number[], churn: number, mv = 0, dir = -1) {
  const t = st.t;
  const wave = (x: number) => Math.sin(x * 0.045 + t * 2.2) * 4 + Math.sin(x * 0.11 - t * 3.1) * 2 * (1 + churn) - 3;
  ctx.fillStyle = vgrad(ctx, -8, 24, 'rgba(40,140,180,0.92)', 'rgba(6,30,50,0)');
  ctx.beginPath();
  ctx.moveTo(-w, wave(-w) + 4);
  for (let x = -w + 16; x <= w; x += 16) ctx.lineTo(x, wave(x) * (1 - Math.abs(x) / w * 0.6));
  ctx.lineTo(w, 8);
  ctx.quadraticCurveTo(0, 40, -w, 8);
  ctx.closePath();
  ctx.fill();
  // linha brilhante da superfície
  ctx.strokeStyle = 'rgba(200,245,255,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = -w * 0.85; x <= w * 0.85; x += 16) {
    const y = wave(x) * (1 - Math.abs(x) / w * 0.6);
    if (x === -w * 0.85) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  // esteira
  if (mv > 0.05) {
    ctx.strokeStyle = 'rgba(230,250,255,0.75)';
    ctx.lineWidth = 2.5;
    const back = -dir;
    for (let i = 0; i < 7; i++) {
      const ph = ((((st.gait * STRIDE) / 70 + i / 7) % 1) + 1) % 1;
      const x0 = back * (w * 0.1 + ph * w * 0.95) * (dir < 0 ? 1 : 1);
      const len = 16 + 22 * (1 - ph);
      const y0 = 3 + (i % 3) * 5;
      ctx.globalAlpha = mv * Math.sin(ph * Math.PI) * 0.85;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + back * len, y0 + 1.5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // espuma
  ctx.fillStyle = '#e6faff';
  for (let f = 0; f < foam.length; f++) {
    const fx = foam[f];
    for (let i = 0; i < 7; i++) {
      const ph = (t * (0.7 + h01(i, f) * 0.6) + h01(f, i)) % 1;
      const x = fx + (h01(i, f + 3) - 0.5) * 50;
      const y = -2 - Math.sin(ph * Math.PI) * (8 + churn * 26) * (0.5 + h01(i, 9));
      ctx.globalAlpha = (1 - ph) * 0.85;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.5, 3 + h01(i, f) * 5 * (1 - ph * 0.5)), 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/** Explosão de água (jatos + gotas em arco) num ponto da superfície. k: 1 → 0 ao longo do tempo. */
function splash(ctx: CanvasRenderingContext2D, x: number, k: number, size: number, seed: number) {
  if (k <= 0.02) return;
  const q = 1 - k; // 0 = começo, 1 = fim
  // jatos: sobem rápido e caem
  const rise = Math.sin(Math.min(1, Math.sqrt(q) * 1.15) * Math.PI) * size;
  ctx.fillStyle = '#d8f6ff';
  for (let i = 0; i < 7; i++) {
    const u = i / 6 - 0.5;
    const hh = rise * (0.45 + h01(i, seed) * 0.75) * (1 - Math.abs(u) * 0.9);
    if (hh < 2) continue;
    const bx = x + u * size * 1.1 * (0.7 + q * 0.5);
    const lean = u * size * 0.5 * (0.3 + q);
    const w = 5 + h01(i, seed + 7) * 7;
    ctx.globalAlpha = Math.min(1, k * 1.4) * 0.8;
    ctx.beginPath();
    ctx.moveTo(bx - w, 4);
    ctx.quadraticCurveTo(bx - w * 0.3 + lean * 0.4, 4 - hh * 0.6, bx + lean, 4 - hh);
    ctx.quadraticCurveTo(bx + w * 0.3 + lean * 0.4, 4 - hh * 0.6, bx + w, 4);
    ctx.fill();
  }
  // gotas
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 18; i++) {
    const a = -Math.PI * (0.1 + h01(i, seed + 1) * 0.8);
    const v = size * (0.9 + h01(i, seed + 2) * 1.3);
    const px = x + Math.cos(a) * v * q;
    const py = Math.sin(a) * v * q * 1.5 + q * q * size * 1.8;
    if (py > 4) continue;
    ctx.globalAlpha = k;
    ctx.beginPath();
    ctx.arc(px, py, Math.max(0.5, 2.5 + h01(i, seed + 3) * 4.5), 0, TAU);
    ctx.fill();
  }
  // anel de espuma na superfície
  ctx.globalAlpha = k * 0.7;
  ctx.strokeStyle = '#e6faff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(x, 4, size * (0.4 + q * 0.9), size * (0.06 + q * 0.1), 0, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Recorte: só desenha acima da água (o resto fica submerso). */
function clipAboveWater(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.rect(-460, -560, 920, 564);
  ctx.clip();
}

// ------------------------------------------------------------------ 0: LEVIATÃ

/** Comprimento de onda das corcovas do Leviatã (unidades locais). */
const LEVI_WL = 210;

/** Pose da cabeça/pescoço do Leviatã num instante (chamada também no passado para rastros e atrasos). */
function leviPose(st: DrawState) {
  const k = cv(st);
  const { a, s, imp, ft, hold, mv, die, hurt } = k;
  const fwd = k.dir < 0 ? 1 : 0;
  // fase da onda: as corcovas ficam presas no mundo enquanto ele avança (recuando, a onda inverte)
  const ph = (k.dir < 0 ? 1 : -1) * (st.gait * STRIDE) / LEVI_WL;
  const wg = TAU * ph;
  let x = -100 + Math.sin(st.t * 1.1) * 8;
  let y = -230 + k.b * 6;
  let ang = -0.18 + Math.sin(st.t * 0.9) * 0.05;
  let coil = 0.12 + k.b * 0.05;
  let ox = 0;
  let jaw = 0;
  // nadando: avança a cabeça e abaixa (ataque), recuando ergue a cabeça (cautela)
  x -= mv * (fwd * 36 - (1 - fwd) * 26);
  y += mv * (fwd * 26 - (1 - fwd) * 6) + Math.sin(wg) * 9 * mv;
  ang += mv * (fwd * -0.06 + (1 - fwd) * 0.14) + Math.sin(wg - 1.1) * 0.05 * mv;
  coil += mv * 0.3;
  // sopro: empina e enrola o pescoço, depois projeta a cabeça e segura (recuo do jato no impacto)
  if (k.breath) {
    x += 60 * a - 80 * s + 24 * imp; y += -48 * a + 30 * s - 6 * imp; ang += 0.42 * a - 0.28 * s + 0.08 * imp;
    coil += 0.55 * a - 0.3 * s;
    jaw = sm(0.24, 0.42, st.p) * (1 - sm(0.84, 0.98, st.p));
  }
  // tiro: carga curta, cuspida seca com tranco para trás
  if (k.shoot) {
    x += 38 * a - 50 * s + 34 * imp; y += -24 * a + 14 * s - 6 * imp; ang += 0.22 * a - 0.14 * s + 0.16 * imp;
    coil += 0.35 * a;
    jaw = sm(0.36, 0.47, st.p) * (1 - sm(0.66, 0.84, st.p));
  }
  // rugido: empina com o focinho para cima, depois projeta a cabeça para os jogadores e treme
  if (k.roar) {
    x += 34 * a - 36 * s; y += -78 * a - 8 * s; ang += 0.62 * a - 0.12 * s;
    coil += 0.45 * a;
    jaw = clamp(0.25 * a + sm(0.4, 0.5, st.p) * (1 - sm(0.86, 1, st.p)));
    y += hold * Math.sin(st.t * 62) * 5;
    ang += hold * Math.sin(st.t * 47) * 0.03;
  }
  // investida (bote): recolhe o pescoço em S bem apertado e dispara, a mordida fecha no impacto
  if (k.charge) {
    x += 95 * a - 150 * s; y += 30 * a + 95 * s + 12 * imp; ang += 0.26 * a - 0.34 * s - 0.1 * imp;
    coil += 1.0 * a - 0.12 * s;
    ox += 20 * a - 30 * s;
    jaw = sm(0.18, 0.4, st.p) * (1 - sm(0.52, 0.57, st.p)) + 0.18 * ft;
  }
  // varrida: ergue para trás e desce em arco cortando na diagonal
  if (k.swipe) {
    x += 84 * a - 165 * s; y += -86 * a + 140 * s; ang += 0.48 * a - 0.58 * s - 0.12 * ft;
    coil += 0.45 * a - 0.2 * s;
    jaw = 0.3 * a + 0.5 * s;
  }
  // pancada: empina bem alto e despenca a cabeça na água
  if (k.slam) {
    x += 30 * a - 84 * s; y += -125 * a + 232 * s; ang += 0.55 * a - 0.62 * s + 0.1 * imp;
    coil += 0.25 * a - 0.25 * s;
    jaw = 0.35 * a;
  }
  // magia: ergue-se como um pilar, cabeça levemente para cima
  if (k.cast) {
    x += 26 * a - 40 * s + 16 * imp; y += -96 * a - 40 * s; ang += 0.5 * a - 0.12 * s + 0.1 * imp;
    coil -= 0.12 * (a + s);
    jaw = 0.3 * a + 0.75 * s;
  }
  // dano: a cabeça leva um tranco para trás e para cima
  x += 40 * hurt; y -= 18 * hurt; ang += 0.32 * hurt; ox += 12 * hurt;
  jaw = Math.max(jaw, 0.45 * hurt);
  // morte: convulsiona empinando, desaba de cara na água e afunda
  const r = sm(0, 0.28, die), f = Math.pow(sm(0.3, 0.6, die), 2);
  if (die > 0) {
    x += 30 * r - 150 * f; y += -64 * r + 270 * f; ang += 0.55 * r - 1.15 * f;
    x += Math.sin(st.t * 15) * 10 * r * (1 - f);
    ang += Math.sin(st.t * 11) * 0.1 * r * (1 - f);
    coil += 0.4 * r - 0.5 * f;
    jaw = Math.max(jaw, 0.7 * r * (1 - f) + 0.25 * f);
  }
  y = Math.max(-345, Math.min(-28, y));
  return { x, y, ang, jaw: clamp(jaw), coil: clamp(coil, 0, 1.05), ox, ph, sink: Math.pow(sm(0.6, 1, die), 1.4) * 300, k };
}

function leviathan(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState, c: C): Anchors {
  const L = leviPose(st);
  const k = L.k;
  const { mv, die } = k;
  const head: V = { x: L.x, y: L.y };
  const ang = L.ang, ox = L.ox, sink = L.sink;
  const heat = clamp(k.on * 1.1 + st.rage * 0.4);
  // atraso das partes soltas: a mesma pose um pouco antes
  const P0 = leviPose(past(st, 0.09));
  const crestLag = clamp((head.x - P0.x) * -0.012 + (head.y - P0.y) * 0.01 - (ang - P0.ang) * 1.5, -0.7, 0.7);
  const wTime = st.t * 0.11; // deriva lenta das corcovas parado

  ctx.save();
  ctx.translate(ox, 0);
  waterBack(ctx, st, 250);
  ctx.save();
  clipAboveWater(ctx);
  ctx.translate(0, sink);

  // ---- espinha: cauda → corcovas (sob a água) → base → pescoço → cabeça
  const B: V = { x: 40, y: 26 + Math.sin(TAU * L.ph) * 6 * mv };
  // corpo submerso com corcovas: mistura da onda parada (idle) com a onda da passada
  const NB = 30;
  const body: V[] = [];
  const hAmp = 74 + 22 * mv + 30 * k.roar * k.a + 40 * sm(0, 0.25, die) * (1 - sm(0.4, 0.7, die));
  const flick = k.swipe * (k.a * -40 + k.s * 70) + k.slam * k.imp * 30;
  for (let j = NB; j >= 0; j--) {
    const u = j / NB; // 0 = base, 1 = ponta da cauda
    const x = B.x + 8 + u * 222;
    const xs = x - B.x;
    const w1 = Math.sin(TAU * (xs / LEVI_WL - wTime));
    const w2 = Math.sin(TAU * (xs / LEVI_WL - L.ph - wTime));
    const env = sm(0.08, 0.32, u);
    let y = 30 - hAmp * env * lerp(w1, w2, mv);
    // a ponta da cauda sobe para a nadadeira aparecer
    y = lerp(y, -34 + Math.sin(st.t * 2.1) * 10 - flick, sm(0.8, 1, u));
    body.push({ x, y });
  }
  const neckEnd = rotV(20, -2, ang);
  // pescoço: arco normal ↔ S apertado (coil) do bote
  const c1 = { x: lerp(B.x + 110, B.x - 75, L.coil), y: lerp(B.y - 170, B.y - 120, L.coil) };
  const c2 = { x: lerp(head.x + 130, head.x + 215, L.coil), y: lerp(head.y - 60, head.y + 115, L.coil) };
  const NN = 28;
  const neck = bez(B, c1, c2, { x: head.x + neckEnd.x, y: head.y + neckEnd.y }, NN);
  // onda viajando da cabeça para a base ao longo do pescoço (cabeça estável)
  const nAmp = 4 + 15 * mv + 18 * sm(0, 0.3, die) * (1 - sm(0.3, 0.6, die)) + 6 * k.hurt;
  const nOff = neck.map((p, i) => {
    const uh = 1 - i / NN; // 0 = cabeça
    const nn = nrm(neck, i);
    const d = nAmp * sm(0, 0.4, uh) * (1 - 0.5 * sm(0.75, 1, uh)) * Math.sin(TAU * (uh * 0.85 - L.ph - wTime * 3));
    return { x: p.x + nn.x * d, y: p.y + nn.y * d };
  });
  const spine = body.concat(nOff.slice(1));
  const n = spine.length - 1;
  const wf = (t: number) => {
    const i = t * n;
    if (i <= NB) return lerp(16, 70, Math.pow(i / NB, 0.55));
    return lerp(76, 40, Math.pow((i - NB) / NN, 0.8));
  };

  // nadadeira da cauda (atrás do corpo)
  const tp = spine[0], tq = spine[2];
  const ta = Math.atan2(tp.y - tq.y, tp.x - tq.x);
  ctx.save();
  ctx.translate(tp.x, tp.y);
  ctx.rotate(ta + Math.sin(st.t * 2.6 - 1) * 0.15);
  for (const [col, sc] of [[c.dark, 1.08], [hexA(c.accent, 0.9), 1]] as const) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(-6 * sc, 0);
    ctx.quadraticCurveTo(20 * sc, -40 * sc, 58 * sc, -52 * sc);
    ctx.quadraticCurveTo(36 * sc, -10 * sc, 30 * sc, 0);
    ctx.quadraticCurveTo(36 * sc, 10 * sc, 58 * sc, 52 * sc);
    ctx.quadraticCurveTo(20 * sc, 40 * sc, -6 * sc, 0);
    ctx.fill();
  }
  ctx.strokeStyle = hexA(c.dark, 0.7);
  ctx.lineWidth = 2;
  for (let r = -2; r <= 2; r++) {
    if (!r) continue;
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(44, r * 20);
    ctx.stroke();
  }
  ctx.restore();

  // velas dorsais nas corcovas (atrás do corpo), balançando com atraso
  for (let i = 3; i < NB - 3; i += 3) {
    const p = spine[i];
    if (p.y > -8) continue;
    const nn = nrm(spine, i);
    const w = wf(i / n) / 2;
    const fh = 18 + 10 * Math.sin(i * 0.8 - st.t * 3);
    const tx = -nn.y, ty = nn.x;
    const lag = Math.sin(st.t * 3 - i * 0.6) * 6 + 10 * mv;
    ctx.fillStyle = c.dark;
    ctx.beginPath();
    ctx.moveTo(p.x + nn.x * w + tx * 14, p.y + nn.y * w + ty * 14);
    ctx.lineTo(p.x + nn.x * (w + fh) - tx * lag, p.y + nn.y * (w + fh) - ty * lag);
    ctx.lineTo(p.x + nn.x * w - tx * 12, p.y + nn.y * w - ty * 12);
    ctx.fill();
    ctx.fillStyle = hexA(c.accent, 0.85);
    ctx.beginPath();
    ctx.moveTo(p.x + nn.x * w + tx * 10, p.y + nn.y * w + ty * 10);
    ctx.lineTo(p.x + nn.x * (w + fh - 4) - tx * lag, p.y + nn.y * (w + fh - 4) - ty * lag);
    ctx.lineTo(p.x + nn.x * w - tx * 8, p.y + nn.y * w - ty * 8);
    ctx.fill();
  }

  // crista de barbatanas ao longo do pescoço (atrás do corpo), ondula com atraso
  if ((s.feat.fins ?? 1) > 0) {
    const i0 = NB + 3, i1 = n - 3;
    const outer: V[] = [];
    for (let i = i0; i <= i1; i++) {
      const nn = nrm(spine, i);
      const uh = (n - i) / NN;
      const fh = 8 + Math.abs(Math.sin(i * 0.9 - st.t * 2.4 - L.ph * TAU)) * (11 + 6 * mv) + Math.sin(uh * Math.PI) * 8 + heat * 6;
      const w = wf(i / n) / 2;
      outer.push({ x: spine[i].x + nn.x * (w + fh), y: spine[i].y + nn.y * (w + fh) });
    }
    ctx.fillStyle = c.dark;
    ctx.beginPath();
    ctx.moveTo(spine[i0].x, spine[i0].y);
    for (const p of outer) ctx.lineTo(p.x + 2, p.y - 2);
    for (let i = i1; i >= i0; i--) ctx.lineTo(spine[i].x, spine[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = hexA(c.accent, 0.85);
    ctx.beginPath();
    ctx.moveTo(spine[i0].x, spine[i0].y);
    for (const p of outer) ctx.lineTo(p.x, p.y);
    for (let i = i1; i >= i0; i--) ctx.lineTo(spine[i].x, spine[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = c.dark;
    ctx.lineWidth = 2.5;
    for (let j = 0; j < outer.length; j += 2) {
      const i = j + i0;
      ctx.beginPath();
      ctx.moveTo(spine[i].x, spine[i].y);
      ctx.lineTo(outer[j].x, outer[j].y);
      ctx.stroke();
    }
  }

  snakeBody(ctx, spine, wf, c);
  // manchas luminosas ao longo do corpo (na inspiração do sopro, a luz corre até a boca)
  const inhale = (k.breath + k.shoot + k.cast) * k.a;
  for (let i = 6; i < n - 2; i += 3) {
    if (spine[i].y > -6) continue;
    const nn = nrm(spine, i);
    const w = wf(i / n) * 0.3;
    const u = i / n;
    const run = inhale > 0.02 ? Math.exp(-Math.pow(u - inhale, 2) / 0.012) : 0;
    const pulse = 0.35 + Math.sin(st.t * 3 - i * 0.5) * 0.25 + heat * 0.3 + run * 0.9;
    ctx.fillStyle = hexA(c.glow, clamp(pulse));
    ctx.beginPath();
    ctx.arc(spine[i].x + nn.x * w, spine[i].y + nn.y * w, 3.5 + run * 3, 0, TAU);
    ctx.fill();
    if (run > 0.3) bloom(ctx, spine[i].x, spine[i].y, 26, c.glow, run * 0.5);
  }
  if (heat > 0.05) bloom(ctx, head.x + 40, head.y + 30, 120, c.glow, heat * 0.3);
  // rastro do golpe rápido (bote, varrida, pancada)
  const fast = (k.charge + k.swipe + k.slam) * sm(0.44, 0.5, st.p) * (1 - sm(0.57, 0.68, st.p));
  if (fast > 0.03) {
    const tr: V[] = [];
    for (let j = 6; j >= 0; j--) {
      const Pj = leviPose({ ...st, p: st.p - j * 0.009 });
      const m = mouthAt({ x: Pj.x + Pj.ox - ox, y: Pj.y }, Pj.ang, 1.35);
      tr.push(m);
    }
    smear(ctx, tr, 90, c.glow, fast);
  }
  snakeHead(ctx, head, ang, 1.35, L.jaw, c, st, 'fin', heat, 1, crestLag);
  ctx.restore();

  // água: espuma onde o corpo atravessa a superfície
  const foam: number[] = [];
  for (let i = 1; i <= NB; i++) if ((spine[i - 1].y + sink > 4) !== (spine[i].y + sink > 4)) foam.push(spine[i].x);
  foam.push(B.x - 30);
  const churn = clamp(k.on * 0.6 + st.rage * 0.3 + mv * 0.4 + die);
  waterFront(ctx, st, 250, foam, churn, mv, k.dir);
  // espirros: cabeça batendo na água (pancada), cauda (varrida) e queda da morte
  const hit = (from: number, p: number) => sm(from - 0.03, from, p) * (1 - sm(from, from + 0.4, p));
  if (k.slam) splash(ctx, head.x - 40, hit(0.55, st.p), 110, 3);
  if (k.swipe) splash(ctx, spine[0].x - 20, hit(0.56, st.p), 70, 5);
  if (k.charge) splash(ctx, B.x - 30, hit(0.5, st.p) * 0.8, 60, 7);
  if (die > 0) splash(ctx, head.x - 50, hit(0.6, die), 130, 9);
  if (k.cast > 0) {
    // orbes girando em volta da cabeça na carga; círculo mágico em pé na frente da boca no disparo
    const mm = mouthAt(head, ang, 1.35, L.jaw);
    for (let i = 0; i < 4; i++) {
      const a = st.t * 5 + (i / 4) * TAU;
      orb(ctx, head.x - 30 + Math.cos(a) * 90 * (1 - k.s), head.y + Math.sin(a) * 40 * (1 - k.s), 10 + 8 * k.a, c.glow, k.a * 0.9 + k.s * 0.3);
    }
    if (k.s > 0.02) {
      ctx.save();
      ctx.translate(mm.x - 40, mm.y);
      ctx.rotate(Math.PI / 2);
      magicCircle(ctx, 0, 0, 90 * k.s, c.glow, k.s * 0.9, st.t * 2, 0.3);
      ctx.restore();
    }
    bloom(ctx, mm.x, mm.y, 60 + 60 * k.imp, c.glow, (k.a + k.s) * 0.5);
  }
  // bolhas subindo enquanto afunda
  if (die > 0.62) {
    ctx.strokeStyle = '#d8f6ff';
    ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      const q = ((st.t * (0.8 + h01(i, 2) * 0.6) + h01(i, 3)) % 1);
      ctx.globalAlpha = (1 - q) * sm(0.62, 0.75, die) * (1 - sm(0.92, 1, die));
      ctx.beginPath();
      ctx.arc(-120 + h01(i, 4) * 300, 2 - q * 26, 2 + h01(i, 5) * 5, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  const m = mouthAt(head, ang, 1.35, L.jaw);
  return {
    mouth: { x: m.x + ox, y: Math.min(-10, m.y + sink) },
    hand: { x: head.x - 60 + ox, y: Math.min(-10, head.y + 40 + sink) },
    core: { x: 60 + ox, y: Math.min(-30, -140 + sink) },
    top: Math.min(-20, Math.max(-380, Math.min(head.y - 80, -260)) + sink),
    halfW: 150,
  };
}

// ------------------------------------------------------------------ 1: KRAKEN

/**
 * Pose do Thalassor. Ele "anda" sobre quatro tentáculos-perna que mergulham na água, puxam o
 * corpo (ponta plantada, presa ao mundo) e saem pingando para o próximo passo (sequência em
 * onda: 0 → 1 → 2 → 3). Os outros tentáculos são braços: atacam e balançam com atraso.
 */
function krakenPose(st: DrawState, n: number) {
  const k = cv(st);
  const { a, s, imp, ft, hold, mv, die, hurt } = k;
  const fwd = k.dir < 0;
  const ph = fwd ? st.gait : -st.gait;
  const w = sm(0, 0.18, mv);
  // manto: sobe no meio do apoio e afunda quando um tentáculo planta (dois "passos" por ciclo)
  const bob = Math.cos(TAU * 2 * ph) * 9 * w;
  let hx = 30 + Math.sin(st.t * 0.8) * 6 - 14 * mv * (fwd ? 1 : -0.6);
  let hy = -182 + k.b * 6 + bob;
  let tilt = 0.32 + Math.sin(st.t * 0.9) * 0.03 + (fwd ? 0.14 : -0.06) * mv + Math.sin(TAU * 2 * ph - 0.8) * 0.03 * w;
  let inf = k.b * 0.025 + Math.sin(TAU * 2 * ph) * 0.03 * w; // inflar/contrair o manto
  let jaw = 0;
  if (k.breath || k.roar) {
    hx += 26 * a - 22 * s; hy += -22 * a + 12 * s; tilt += 0.12 * a - 0.16 * s;
    inf += 0.14 * a - 0.08 * s;
    jaw = sm(0.25, 0.45, st.p) * (1 - sm(0.84, 0.98, st.p));
    hy += k.roar * hold * Math.sin(st.t * 60) * 5; hx += k.roar * hold * Math.sin(st.t * 47) * 3;
  }
  if (k.shoot) {
    hx += 16 * a - 12 * s + 24 * imp; hy += -10 * a; tilt += 0.1 * a + 0.1 * imp;
    inf += 0.18 * a - 0.2 * s;
    jaw = sm(0.36, 0.46, st.p) * (1 - sm(0.62, 0.8, st.p));
  }
  if (k.slam) { hy += -48 * a + 46 * s + 10 * imp; tilt += -0.14 * a + 0.22 * s; inf += 0.06 * a - 0.08 * imp; }
  if (k.swipe) { hx += 22 * a - 34 * s; tilt += 0.12 * a - 0.18 * s; }
  if (k.charge) { hx += 40 * a - 92 * s; hy += 24 * a + 12 * s; tilt += 0.22 * a - 0.3 * s; inf += 0.1 * a - 0.12 * s; jaw = 0.4 * s; }
  if (k.cast) { hy -= 36 * (a + s * 0.7); inf += 0.08 * (a + s); jaw = 0.3 * (a + s); }
  hx += 26 * hurt; hy -= 6 * hurt; tilt += 0.16 * hurt; inf -= 0.08 * hurt;
  const fl = sm(0, 0.3, die), fall = sm(0.3, 0.7, die);
  hx += Math.sin(st.t * 13) * 8 * fl * (1 - fall); hy += -20 * fl + 70 * fall; tilt += 0.6 * fall;
  inf -= 0.22 * fall;
  jaw = Math.max(jaw, 0.6 * fl * (1 - fall));
  const sink = Math.pow(sm(0.55, 1, die), 1.4) * 290;

  // pontas dos tentáculos
  const legHome = [-150, -62, 62, 160];
  const legs: { tip: V; lift: number; plant: number }[] = [];
  for (let j = 0; j < 4; j++) {
    const q = (((ph + j * 0.25) % 1) + 1) % 1;
    const sweep = 92 * w;
    let x: number, y: number, lift = 0, plant = 0;
    if (q < 0.6) {
      const u = q / 0.6;
      x = legHome[j] + sweep * (u - 0.5);
      y = 30;
      plant = 1 - sm(0, 0.25, u);
    } else {
      const r = (q - 0.6) / 0.4;
      x = legHome[j] + sweep * (0.5 - sm(0, 1, r));
      lift = Math.sin(r * Math.PI) * w;
      y = 30 - lift * 125;
    }
    x += Math.sin(st.t * 1.2 + j * 1.7) * 6;
    // ataques: as pernas se firmam (abrem) na pancada e se encolhem no rugido
    x += (j < 2 ? -1 : 1) * 20 * (k.slam * k.s + k.roar * a);
    // morte: debatem e depois afundam moles
    y -= 80 * fl * (1 - fall) * (0.5 + 0.5 * Math.sin(st.t * 9 + j * 2));
    legs.push({ tip: { x, y }, lift, plant: plant * w });
  }
  // braços: 0 frente-esquerda (frente), 1 alto-esquerda (atrás), 2 alto-direita (atrás), 3 direita (frente)
  const na = Math.max(2, n - 4);
  const arms: V[] = [];
  for (let j = 0; j < na; j++) {
    const q = na > 1 ? j / (na - 1) : 0;
    const ph2 = j * 1.9;
    const left = q < 0.5;
    const idle: V = {
      x: lerp(-205, 205, q) + Math.sin(st.t * 1.3 + ph2) * 14 + (left ? -1 : 1) * 10 * Math.sin(TAU * ph + j) * w + (left ? 0 : 26 * mv),
      y: lerp(-175, -150, q) - Math.sin(q * Math.PI) * 120 + Math.sin(st.t * 1.7 + ph2) * 16 + Math.cos(TAU * ph + j) * 12 * w,
    };
    let x = idle.x, y = idle.y;
    const add = (W: V, S: V, kk: number) => {
      x += kk * (a * (W.x - idle.x) + s * (S.x - idle.x));
      y += kk * (a * (W.y - idle.y) + s * (S.y - idle.y));
    };
    const lead = left ? 1 : 0.35;
    add({ x: -150 + j * 60, y: -335 }, { x: -275 + j * 20, y: -20 + j * 30 }, k.swipe * lead);
    add({ x: -130 + q * 260, y: -340 }, { x: -230 + q * 120, y: 12 }, k.slam * (left ? 1 : 0.4));
    add({ x: lerp(-210, 210, q), y: -270 - Math.sin(q * Math.PI) * 80 }, { x: lerp(-230, 230, q), y: -300 - Math.sin(q * Math.PI) * 60 }, k.cast);
    add({ x: lerp(-200, 200, q), y: -280 - Math.sin(q * Math.PI) * 60 }, { x: lerp(-285, 285, q), y: -190 - Math.sin(q * Math.PI) * 130 }, k.roar);
    add({ x: lerp(-230, 230, q), y: -200 - Math.sin(q * Math.PI) * 100 }, { x: lerp(-250, 260, q), y: -150 - Math.sin(q * Math.PI) * 130 }, k.breath);
    add({ x: 120 + q * 80, y: -200 }, { x: -290 + q * 40, y: -110 + q * 40 }, k.charge * (left ? 1 : 0.5));
    add({ x: idle.x + 20, y: idle.y + 40 }, { x: idle.x + 30, y: idle.y + 50 }, k.shoot * 0.6);
    // follow-through: passa do ponto e volta
    x -= ft * 30 * (k.swipe + k.charge) * lead;
    // dano: os braços se encolhem para o manto
    x = lerp(x, hx, 0.35 * hurt); y = lerp(y, hy + 60, 0.35 * hurt);
    // morte: debatem para cima e depois caem moles na água
    y -= fl * (1 - fall) * 80 * (0.5 + 0.5 * Math.sin(st.t * 8 + j * 2.4));
    y = lerp(y, 30, fall);
    x = Math.max(-300, Math.min(260, x));
    y = Math.max(-370, Math.min(30, y));
    arms.push({ x, y });
  }
  return { k, hx, hy, tilt, inf, jaw: clamp(jaw), sink, legs, arms, ph, w, fl, fall };
}

/** Linha de um tentáculo: raiz → ponta, com curva, onda viajando e ponta enrolada. */
function tentLine(R: V, T: V, C2: V, wave: number, wph: number, curl: number, curlDir: number, N = 18): V[] {
  const pts = bez(R, { x: R.x + (T.x - R.x) * 0.12, y: R.y + 70 }, C2, T, N);
  for (let i = 1; i < pts.length - 1; i++) {
    const u = i / N;
    const nn = nrm(pts, i);
    const d = wave * Math.sin(TAU * u * 1.3 - wph) * u * (1 - u) * 4;
    pts[i] = { x: pts[i].x + nn.x * d, y: pts[i].y + nn.y * d };
  }
  // ponta enrolada
  const end = pts[pts.length - 1], prev = pts[pts.length - 2];
  let ang = Math.atan2(end.y - prev.y, end.x - prev.x);
  let r = 9;
  let p = end;
  for (let j = 0; j < 6; j++) {
    ang += curlDir * 0.6 * curl;
    p = { x: p.x + Math.cos(ang) * r, y: p.y + Math.sin(ang) * r };
    pts.push(p);
    r *= 0.8;
  }
  return pts;
}

function kraken(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState, c: C): Anchors {
  const n = Math.max(6, Math.min(10, s.feat.tentacles ?? 8));
  const K = krakenPose(st, n);
  const P0 = krakenPose(past(st, 0.12), n); // atraso (overlapping action)
  const { k, hx, hy, tilt, inf, jaw, sink } = K;
  const { mv, die } = k;
  const heat = clamp(k.on * 1.1 + st.rage * 0.4);

  ctx.save();
  waterBack(ctx, st, 250);
  ctx.save();
  clipAboveWater(ctx);
  ctx.translate(0, sink);

  const tw = (t: number) => Math.max(2, 36 * (1 - t) + 3);
  const root = (q: number): V => {
    const r = rotV(-62 + q * 120, 74, tilt * 0.5);
    return { x: hx + r.x, y: hy + r.y };
  };
  type T = { pts: V[]; front: boolean };
  const all: T[] = [];
  // pernas: a curva do meio vem da ponta no passado (atraso) e arqueia para fora da água
  K.legs.forEach((L, j) => {
    const R = root(j / 3);
    const Lp = P0.legs[j];
    const side = j < 2 ? -1 : 1;
    const C2 = { x: (L.tip.x + Lp.tip.x) / 2 + side * 46, y: Math.min(L.tip.y, Lp.tip.y) - 70 - L.lift * 20 };
    const pts = tentLine(R, L.tip, C2, 8 + 10 * mv, st.t * 3 + j * 1.7, 0.6 + L.lift * 0.6, -side);
    all.push({ pts, front: j % 2 === 0 });
  });
  // braços
  K.arms.forEach((A, j) => {
    const q = K.arms.length > 1 ? j / (K.arms.length - 1) : 0;
    const R = root(0.15 + q * 0.7);
    const Ap = P0.arms[j] ?? A;
    const side = q < 0.5 ? -1 : 1;
    const up = A.y < R.y - 40;
    const C2 = { x: Ap.x + side * (up ? 40 : 60) * (1 - 2 * k.swipe * k.s), y: Ap.y + (up ? 110 : 40) };
    const pts = tentLine(R, A, C2, 12 + 8 * mv + 10 * K.fl, st.t * 3.3 + j * 2.1, 1 - 0.6 * (k.s * (k.swipe + k.slam + k.charge)), side);
    all.push({ pts, front: j === 0 });
  });

  // tentáculos de trás (mais escuros)
  const backC: C = { ...c, body: mixHex(c.body, c.dark, 0.4), belly: mixHex(c.belly, c.dark, 0.4) };
  for (const tt of all) if (!tt.front) snakeBody(ctx, tt.pts, tw, backC);

  // manto (cabeça bulbosa e manchada), infla e contrai
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(tilt);
  ctx.scale(1 - inf * 0.4, 1 + inf);
  ctx.fillStyle = c.dark;
  ctx.beginPath();
  ctx.ellipse(10, -45, 88, 106, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = rgrad(ctx, -20, -90, 160, c.light, c.body);
  ctx.beginPath();
  ctx.ellipse(10, -45, 82, 100, 0, 0, TAU);
  ctx.fill();
  // sombra de baixo (volume)
  ctx.fillStyle = hexA(c.dark, 0.35);
  ctx.beginPath();
  ctx.ellipse(18, 6, 70, 40, 0, 0, Math.PI);
  ctx.fill();
  // manchas
  for (let i = 0; i < 14; i++) {
    const a = h01(i, 7) * TAU, rr = Math.sqrt(h01(i, 8));
    ctx.fillStyle = hexA(i % 3 ? c.dark : c.accent, i % 3 ? 0.45 : 0.35);
    ctx.beginPath();
    ctx.ellipse(10 + Math.cos(a) * rr * 70, -60 + Math.sin(a) * rr * 90, 6 + h01(i, 9) * 9, 4 + h01(i, 3) * 6, a, 0, TAU);
    ctx.fill();
  }
  // brilho especular
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  ctx.ellipse(-30, -100, 22, 38, -0.4, 0, TAU);
  ctx.fill();
  if (heat > 0.05) bloom(ctx, 10, -60, 120, c.glow, heat * 0.35);
  ctx.restore();

  // rastro do braço que golpeia
  const fast = (k.swipe + k.slam + k.charge) * sm(0.44, 0.5, st.p) * (1 - sm(0.57, 0.68, st.p));
  if (fast > 0.03) {
    const tr: V[] = [];
    for (let j = 6; j >= 0; j--) tr.push(krakenPose({ ...st, p: st.p - j * 0.01 }, n).arms[0]);
    smear(ctx, tr, 70, c.glow, fast);
  }

  // tentáculos da frente com ventosas
  for (const tt of all) {
    if (!tt.front) continue;
    snakeBody(ctx, tt.pts, tw, c);
    ctx.fillStyle = c.light;
    ctx.strokeStyle = c.dark;
    ctx.lineWidth = 1.2;
    for (let j = 2; j < tt.pts.length - 4; j += 2) {
      const nn = nrm(tt.pts, j);
      const w = tw(j / (tt.pts.length - 1));
      const r = Math.max(1, w * 0.17);
      const x = tt.pts[j].x - nn.x * w * 0.28, y = tt.pts[j].y - nn.y * w * 0.28;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  }
  // olhos grandes e bico
  const eyeY = hy + 30;
  const open = st.anim === 'death' ? clamp(1 - st.p * 1.4) : (st.anim === 'attack' ? 1 : blinkAt(st.t, 2)) * (1 - st.hurt * 0.7);
  for (const [ex, er] of [[hx - 55, 17], [hx + 18, 15]] as const) {
    ctx.fillStyle = c.dark;
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, er + 7, er * 0.8 + 6, -0.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = mixHex(c.eye, '#ffffff', 0.15);
    ctx.save();
    ctx.shadowColor = c.eye;
    ctx.shadowBlur = 14 + st.rage * 10;
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, er, Math.max(0.5, er * 0.75 * open), -0.2, 0, TAU);
    ctx.fill();
    ctx.restore();
    // pupila em fenda (olha para os jogadores; dilata com a raiva/ataque)
    ctx.fillStyle = '#100408';
    ctx.beginPath();
    ctx.ellipse(ex - 4, eyeY, er * 0.6 * open, Math.max(0.3, er * 0.16 * (1 + jaw + heat * 0.5) * open), -0.2, 0, TAU);
    ctx.fill();
    // pálpebra pesada (raiva)
    ctx.strokeStyle = c.dark;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(ex, eyeY - 2, er + 3, er * 0.75 + 3, -0.2, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }
  // bico
  const bx = hx - 20, by = hy + 80;
  if (jaw > 0.05) bloom(ctx, bx - 10, by + 4, 34 * jaw + 6, c.glow, 0.6);
  ctx.fillStyle = '#2a1a10';
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(-jaw * 0.5);
  ctx.beginPath();
  ctx.moveTo(14, -10);
  ctx.quadraticCurveTo(-6, -14, -26, 4);
  ctx.quadraticCurveTo(-6, -2, 10, 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(jaw * 0.6);
  ctx.beginPath();
  ctx.moveTo(12, 2);
  ctx.quadraticCurveTo(-8, 4, -20, 12);
  ctx.quadraticCurveTo(-4, 14, 12, 10);
  ctx.fill();
  ctx.restore();

  // magia: orbes nas pontas dos braços erguidos
  if (k.cast > 0) for (const A of K.arms) orb(ctx, A.x, A.y, 10 + heat * 8, c.glow, (k.a + k.s) * 0.9);
  // pingos caindo das pernas que saem da água
  ctx.fillStyle = '#d8f6ff';
  K.legs.forEach((L, j) => {
    if (L.lift < 0.15) return;
    for (let i = 0; i < 3; i++) {
      const q = (st.t * 2.2 + i / 3 + j * 0.3) % 1;
      ctx.globalAlpha = (1 - q) * L.lift;
      ctx.beginPath();
      ctx.arc(L.tip.x + (i - 1) * 6, L.tip.y + 10 + q * 60, 2.2, 0, TAU);
      ctx.fill();
    }
  });
  ctx.globalAlpha = 1;
  ctx.restore();

  // água: espuma onde as pernas entram, espirro a cada passo plantado, pancada dos braços
  const foam = K.legs.map((L) => L.tip.x);
  waterFront(ctx, st, 250, foam, clamp(k.on * 0.8 + st.rage * 0.3 + k.slam * k.s * 2 + die + mv * 0.3), mv, k.dir);
  K.legs.forEach((L, j) => splash(ctx, L.tip.x, L.plant * 0.7, 34, 11 + j));
  const hit = (from: number, p: number) => sm(from - 0.03, from, p) * (1 - sm(from, from + 0.4, p));
  if (k.slam) { splash(ctx, K.arms[0].x, hit(0.55, st.p), 110, 3); if (K.arms[1]) splash(ctx, K.arms[1].x, hit(0.56, st.p), 90, 4); }
  if (die > 0) splash(ctx, hx, hit(0.72, die), 140, 8);
  if (k.cast > 0) magicCircle(ctx, hx, hy - 50, 110 * (k.a + k.s * 0.8), c.glow, k.on * 0.6, st.t * 0.8, 0.5);
  ctx.restore();

  const tip = K.arms[0];
  return {
    mouth: { x: bx - 20, y: Math.min(-10, by + sink) },
    hand: { x: tip.x, y: Math.min(-10, tip.y + sink) },
    core: { x: hx, y: Math.min(-30, hy + sink) },
    top: Math.min(-20, Math.max(-380, hy - 180) + sink),
    halfW: 170,
  };
}

// ------------------------------------------------------------------ 2: HIDRA

/** IK de duas partes: devolve o joelho (dobra = +1 joelho para a frente, −1 para trás). */
function ik(H: V, F: V, l1: number, l2: number, bend: number): V {
  let dx = F.x - H.x, dy = F.y - H.y;
  let d = Math.hypot(dx, dy) || 1;
  const maxD = l1 + l2 - 0.5;
  if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; }
  const a = Math.atan2(dy, dx);
  const k = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  return { x: H.x + Math.cos(a + bend * k) * l1, y: H.y + Math.sin(a + bend * k) * l1 };
}

/**
 * Pose da Hidra: anda nas quatro patas (sequência lateral: trás-perto, frente-perto, trás-longe,
 * frente-longe), pés plantados no mundo; o corpo afunda a cada pisada e balança. Cada cabeça
 * tem o próprio ritmo e entra no golpe com um pequeno atraso.
 */
function hydraPose(st: DrawState, nh: number) {
  const k = cv(st);
  const { a, s, imp, mv, die, hurt } = k;
  const fwd = k.dir < 0;
  const ph = fwd ? st.gait : -st.gait;
  const w = sm(0, 0.18, mv);
  // corpo: afunda em cada pisada (4 por ciclo), balança e inclina
  let bob = (Math.cos(TAU * 4 * ph) * 0.5 + 0.5) * 7 * w - k.b * 2.5;
  let ox = 0;
  let pitch = Math.sin(TAU * 2 * ph) * 0.025 * w + (fwd ? -0.03 : 0.02) * mv;
  // pancada: empina nas patas de trás e despenca as da frente
  pitch += k.slam * (-0.34 * a + 0.06 * s - 0.04 * imp);
  bob += k.slam * (8 * a + 16 * imp);
  // investida: agacha e dispara para a frente
  ox += k.charge * (20 * a - 55 * s); bob += k.charge * (16 * a - 4 * s); pitch += k.charge * (0.05 * a + 0.05 * s);
  ox += k.swipe * (12 * a - 26 * s);
  ox += (k.breath + k.shoot) * (8 * a + 14 * imp);
  bob += (k.roar + k.cast) * (-6 * a - 4 * s);
  pitch += (k.roar + k.cast) * (-0.08 * a - 0.04 * s);
  // dano e morte
  ox += 18 * hurt; pitch -= 0.05 * hurt;
  const buck = sm(0.2, 0.62, die);
  bob += buck * buck * 62; pitch += Math.sin(st.t * 12) * 0.04 * sm(0, 0.2, die) * (1 - buck) + buck * 0.06;

  // patas (perto/longe x frente/trás)
  const legsDef = [
    { hip: { x: 118, y: -96 }, near: false, front: false, off: 0.5 },
    { hip: { x: -16, y: -100 }, near: false, front: true, off: 0.75 },
    { hip: { x: 98, y: -88 }, near: true, front: false, off: 0 },
    { hip: { x: -38, y: -92 }, near: true, front: true, off: 0.25 },
  ];
  const pivot = { x: 110, y: -92 };
  const xf = (p: V): V => {
    const r = rotV(p.x - pivot.x, p.y - pivot.y, pitch);
    return { x: pivot.x + r.x + ox, y: pivot.y + r.y + bob };
  };
  const legs = legsDef.map((L) => {
    const q = (((ph + L.off) % 1) + 1) % 1;
    const duty = 0.66;
    const sweep = STRIDE * duty * w;
    const home = L.hip.x - 6 + ox * 0.6;
    let fx: number, fy = 0, lift = 0, plant = 0;
    if (q < duty) {
      fx = home + sweep * (q / duty - 0.5);
      plant = 1 - sm(0, 0.12, q / duty);
    } else {
      const r = (q - duty) / (1 - duty);
      fx = home + sweep * (0.5 - sm(0, 1, r));
      lift = Math.sin(r * Math.PI) * w;
      fy = -lift * 30;
    }
    // patas da frente na pancada: sobem com o empinar e pisam forte à frente
    if (L.front && k.slam) {
      const up = a * (1 - s);
      fx = lerp(fx, home - 30, up + s); fy = lerp(fy, -70 - (L.near ? 0 : 10), up);
      fx -= s * 20;
    }
    if (L.front && k.charge) fx -= s * 34;
    const hip = xf(L.hip);
    // morte: as patas escorregam para fora
    fx += (L.front ? -1 : 1) * buck * 26;
    return { hip, foot: { x: fx, y: fy }, near: L.near, front: L.front, lift, plant: plant * w };
  });

  // pescoços e cabeças
  const heads: { h: V; ang: number; jaw: number; base: V; k: CV; i: number }[] = [];
  for (let i = 0; i < nh; i++) {
    const q = nh > 1 ? i / (nh - 1) : 0.5;
    // cada cabeça com atraso próprio (as de baixo atacam um pouco depois)
    const sti: DrawState = { ...st, p: st.anim === 'attack' ? clamp(st.p - i * 0.04) : st.p, t: st.t + i * 0.37 };
    const ki = cv(sti);
    const sd = 1.7 + i * 2.3;
    const fq = 1 + i * 0.23;
    let hx = lerp(-25, -200, Math.pow(q, 0.75)) + Math.sin(st.t * 1.3 * fq + sd) * 12;
    let hy = lerp(-325, -150, Math.pow(q, 1.2)) + Math.sin(st.t * 1.1 * fq + sd) * 9 + k.b * 4;
    let ang = lerp(0.02, -0.22, q) + Math.sin(st.t * 0.55 + sd) * 0.12;
    // andando: cabeças estabilizam (só um leve balanço com atraso) e avançam
    hy += Math.sin(TAU * 2 * ph - 1 - i * 0.6) * 6 * w;
    hx -= 16 * mv * (fwd ? 1 : -0.5);
    const A = ki.a, S = ki.s, I = ki.imp;
    let jaw = 0;
    if (k.breath) {
      hx += A * 52 - S * 62 + I * 16; hy += -A * 34 + S * 22; ang += A * 0.42 - S * 0.3;
      jaw = sm(0.25, 0.42, sti.p) * (1 - sm(0.84, 0.98, sti.p));
    }
    if (k.shoot) {
      hx += A * 32 - S * 44 + I * 30; hy += -A * 18 + S * 8; ang += A * 0.22 - S * 0.12 + I * 0.16;
      jaw = sm(0.36, 0.46, sti.p) * (1 - sm(0.64, 0.82, sti.p));
    }
    if (k.roar) {
      // leque: cada cabeça empina num ângulo diferente
      hx += A * (30 - q * 10) - S * 30; hy -= (A * 52 + S * 26) * (1 - q * 0.3); ang += A * (0.7 - q * 0.2) + S * 0.1;
      jaw = clamp(0.3 * A + sm(0.4, 0.5, sti.p) * (1 - sm(0.86, 1, sti.p)));
      hy += ki.hold * Math.sin(st.t * 58 + i) * 4;
    }
    if (k.cast) {
      hx += A * (20 - q * 40); hy -= (A * 46 + S * 30) * (1 - q * 0.3); ang += A * 0.5 + S * 0.2;
      jaw = 0.35 * (A + S);
    }
    if (k.slam) {
      hx += A * 26 - S * 46; hy += -A * 46 + S * (110 + 40 * (1 - q)); ang += A * 0.32 - S * 0.62;
      jaw = 0.4 * A + 0.5 * S;
    }
    if (k.swipe) {
      // chicote: cada cabeça corta em arco com atraso
      hx += A * 72 - S * 128; hy += -A * 40 + S * (60 + 30 * (1 - q)); ang += A * 0.42 - S * 0.52 - ki.ft * 0.12;
      jaw = 0.25 * A + 0.6 * S;
    }
    if (k.charge) {
      // bote: recolhe e morde no impacto
      hx += A * 46 - S * 60; hy += A * 24 + S * 40 * (1 - q * 0.5); ang += A * 0.2 - S * 0.28;
      jaw = sm(0.2, 0.4, sti.p) * (1 - sm(0.52, 0.57, sti.p)) + 0.15 * ki.ft;
    }
    // dano: tranco para trás
    hx += 30 * hurt * (1 - q * 0.3); hy -= 12 * hurt; ang += 0.3 * hurt;
    jaw = Math.max(jaw, 0.4 * hurt);
    // morte: cada cabeça tomba numa hora (a de cima por último)
    const dh = sm(0.15 + (nh - 1 - i) * 0.1, 0.5 + (nh - 1 - i) * 0.1, die);
    if (die > 0) {
      hx += Math.sin(st.t * 9 + i * 2) * 12 * sm(0, 0.15, die) * (1 - dh);
      hy += -30 * sm(0, 0.15, die) * (1 - dh) + dh * dh * (lerp(330, 150, q) - 10);
      hx -= dh * 30; ang -= dh * 0.6;
      jaw = Math.max(jaw, 0.6 * (1 - dh) * sm(0, 0.15, die) + 0.3 * dh);
    }
    hy = Math.max(-340, Math.min(-28, hy + bob * 0.6));
    hx += ox;
    const base = xf({ x: lerp(22, -48, q), y: lerp(-196, -154, q) });
    heads.push({ h: { x: hx, y: hy }, ang, jaw: clamp(jaw), base, k: ki, i });
  }
  return { k, ph, w, bob, ox, pitch, pivot, xf, legs, heads, buck };
}

function hydra(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState, c: C): Anchors {
  const nh = Math.max(1, Math.min(5, s.feat.heads ?? 3));
  const H = hydraPose(st, nh);
  const P0 = hydraPose(past(st, 0.1), nh);
  const { k, ph, w, bob, ox, pitch, pivot } = H;
  const { mv } = k;
  const heat = clamp(k.on * 1.1 + st.rage * 0.4);
  const cy = -128;
  const darkC: C = { ...c, body: mixHex(c.body, c.dark, 0.35), light: mixHex(c.light, c.dark, 0.35), belly: mixHex(c.belly, c.dark, 0.35) };

  ctx.save();
  // sombra
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(40 + ox, 0, 190 - bob, 16, 0, 0, TAU);
  ctx.fill();

  const leg = (L: (typeof H.legs)[number], col: C) => {
    const l1 = 52, l2 = 50;
    const knee = ik(L.hip, { x: L.foot.x, y: L.foot.y - 12 }, l1, l2, L.front ? -1 : 1);
    const ankle = { x: L.foot.x, y: L.foot.y - 12 };
    // coxa e canela
    tube(ctx, [L.hip, knee], (t) => lerp(46, 30, t), col.dark);
    tube(ctx, [L.hip, knee], (t) => lerp(40, 24, t), col.body);
    tube(ctx, [knee, ankle], (t) => lerp(30, 22, t), col.dark);
    tube(ctx, [knee, ankle], (t) => lerp(24, 17, t), col.body);
    ctx.fillStyle = hexA(col.light, 0.5);
    ctx.beginPath();
    ctx.arc(knee.x - 3, knee.y - 3, 7, 0, TAU);
    ctx.fill();
    // pé (gira um pouco ao levantar) e garras
    ctx.save();
    ctx.translate(L.foot.x, L.foot.y);
    ctx.rotate(L.lift * 0.35);
    ctx.fillStyle = col.dark;
    ctx.beginPath();
    ctx.ellipse(-8, -6, 25, 11, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = col.body;
    ctx.beginPath();
    ctx.ellipse(-8, -7, 21, 8, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = c.accent;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-28 + i * 10, -8);
      ctx.lineTo(-40 + i * 10, 0);
      ctx.lineTo(-24 + i * 10, -1);
      ctx.fill();
    }
    ctx.restore();
  };

  // cauda: balança com atraso e serpenteia com a passada
  const tb = H.xf({ x: 150, y: -112 });
  const tailPts: V[] = [];
  const tsw = Math.sin(st.t * 1.4) * 10 + k.swipe * (k.a * 30 - k.s * 40) + (P0.ox - ox) * 0.6;
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;
    const wv = Math.sin(TAU * (u * 0.9 - 2 * ph) - st.t * 1.2) * (6 + 10 * mv) * u;
    tailPts.push({ x: tb.x + u * 120 + u * u * 20, y: tb.y + u * 70 - u * u * 40 + (tsw + wv) * u - H.buck * u * 30 });
  }
  snakeBody(ctx, tailPts, (t) => 52 * (1 - t) + 4, c, 0, 1);
  // patas de longe (mais escuras)
  for (const L of H.legs) if (!L.near) leg(L, darkC);

  // corpo pesado (inclina pelo quadril)
  ctx.save();
  ctx.translate(pivot.x + ox, pivot.y + bob);
  ctx.rotate(pitch);
  ctx.translate(-pivot.x, -pivot.y);
  const breath = 1 + k.b * 0.012;
  ctx.fillStyle = c.dark;
  ctx.beginPath();
  ctx.ellipse(50, cy, 130, 82 * breath, -0.08, 0, TAU);
  ctx.fill();
  ctx.fillStyle = vgrad(ctx, cy - 80, cy + 70, c.light, c.body);
  ctx.beginPath();
  ctx.ellipse(50, cy, 124, 76 * breath, -0.08, 0, TAU);
  ctx.fill();
  // sombra de baixo
  ctx.fillStyle = hexA(c.dark, 0.3);
  ctx.beginPath();
  ctx.ellipse(50, cy + 40, 112, 34, -0.08, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = c.belly;
  ctx.beginPath();
  ctx.ellipse(30, cy + 40, 90, 28, -0.08, 0, Math.PI);
  ctx.fill();
  ctx.strokeStyle = hexA(c.dark, 0.3);
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(-40 + i * 28, cy + 42);
    ctx.lineTo(-44 + i * 28, cy + 64);
    ctx.stroke();
  }
  // escamas grandes no lombo
  ctx.strokeStyle = hexA(c.dark, 0.5);
  ctx.lineWidth = 2.5;
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.arc(-30 + i * 28 + r * 14, cy - 40 + r * 24, 12, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
    }
  }
  // espinhos nas costas (tremem com a passada)
  for (let i = 0; i < 7; i++) {
    const x = 150 - i * 24;
    const y = cy - 70 - Math.sin(i / 6 * Math.PI) * 8;
    const hh = 16 + Math.sin(i / 6 * Math.PI) * 8 + heat * 4;
    const lean = Math.sin(TAU * 2 * ph - i * 0.5) * 3 * w;
    ctx.fillStyle = c.dark;
    ctx.beginPath();
    ctx.moveTo(x - 10, y + 9);
    ctx.lineTo(x + 2 + lean, y - hh - 2);
    ctx.lineTo(x + 11, y + 9);
    ctx.fill();
    ctx.fillStyle = vgrad(ctx, y - hh, y + 8, mixHex(c.accent, '#ffffff', 0.3), c.accent);
    ctx.beginPath();
    ctx.moveTo(x - 8, y + 8);
    ctx.lineTo(x + 2 + lean, y - hh);
    ctx.lineTo(x + 9, y + 8);
    ctx.fill();
  }
  if (heat > 0.05) bloom(ctx, -10, cy - 10, 100, c.glow, heat * 0.4);
  ctx.restore();

  // pescoços e cabeças (de cima/trás para baixo/frente)
  for (const Hd of H.heads) {
    const q = nh > 1 ? Hd.i / (nh - 1) : 0.5;
    const shade: C = Hd.i === 0 && nh > 2 ? { ...c, body: mixHex(c.body, c.dark, 0.2) } : c;
    const Hp = P0.heads[Hd.i];
    const bs = Hd.base, h = Hd.h;
    const end = rotV(14, -2, Hd.ang);
    const rise = clamp((bs.y - h.y) * 0.6, 0, 100);
    const neck = bez(bs, { x: bs.x + 20 - q * 60, y: bs.y - rise + q * 40 }, { x: Hp.h.x + 90 - q * 20, y: Hp.h.y + 30 - q * 10 - (1 - rise / 100) * 30 }, { x: h.x + end.x, y: h.y + end.y }, 20);
    // onda descendo pelo pescoço (cabeça estável)
    const amp = 3 + 9 * mv + 6 * st.hurt;
    for (let j = 1; j < neck.length - 1; j++) {
      const uh = 1 - j / 20;
      const nn = nrm(neck, j);
      const d = amp * Math.sin(TAU * (uh * 0.9 - 2 * ph) - st.t * 2 - Hd.i) * sm(0, 0.4, uh) * (1 - uh * 0.5);
      neck[j] = { x: neck[j].x + nn.x * d, y: neck[j].y + nn.y * d };
    }
    const nwf = (t: number) => 54 - t * 20 - q * 4;
    snakeBody(ctx, neck, nwf, shade);
    // rastro do golpe rápido
    const fast = (k.swipe + k.charge + k.slam) * sm(0.44, 0.5, st.p) * (1 - sm(0.57, 0.68, st.p));
    if (fast > 0.03 && Hd.i === nh - 1) {
      const tr: V[] = [];
      for (let j = 6; j >= 0; j--) {
        const Pj = hydraPose({ ...st, p: st.p - j * 0.01 }, nh).heads[Hd.i];
        tr.push(mouthAt(Pj.h, Pj.ang, 0.82, Pj.jaw));
      }
      smear(ctx, tr, 60, c.glow, fast);
    }
    const lag = clamp((h.x - Hp.h.x) * -0.015 + (h.y - Hp.h.y) * 0.012, -0.6, 0.6);
    snakeHead(ctx, h, Hd.ang, 0.82, Hd.jaw, shade, st, 'horn', heat, Hd.i + 3, lag);
  }
  // patas de perto
  for (const L of H.legs) if (L.near) leg(L, c);
  // poeira das pisadas
  for (const L of H.legs) {
    if (L.plant < 0.05) continue;
    ctx.fillStyle = mixHex(s.bg.ground, '#d8d0b0', 0.55);
    for (let i = 0; i < 4; i++) {
      const q = 1 - L.plant;
      ctx.globalAlpha = L.plant * 0.6;
      ctx.beginPath();
      ctx.arc(L.foot.x - 10 + (i - 1.5) * 14 * (1 + q), -4 - q * 10 - h01(i, 3) * 6, 4 + q * 8, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // tremor da pisada forte na pancada
  if (k.slam) {
    const sh = sm(0.53, 0.56, st.p) * (1 - sm(0.56, 0.8, st.p));
    if (sh > 0.02) {
      ctx.strokeStyle = hexA(c.glow, sh);
      ctx.lineWidth = 4;
      for (const L of H.legs) if (L.front) {
        ctx.beginPath();
        ctx.ellipse(L.foot.x - 10, 0, 40 + (1 - sh) * 80, 8 + (1 - sh) * 10, 0, 0, TAU);
        ctx.stroke();
      }
    }
  }
  if (k.cast + k.roar > 0 && heat > 0.1) magicCircle(ctx, 40 + ox, 0, 150 * (k.a + k.s * 0.6), c.glow, k.on * 0.6, st.t, 0.25);
  if (k.cast > 0) for (const Hd of H.heads) { const m = mouthAt(Hd.h, Hd.ang, 0.82, Hd.jaw); orb(ctx, m.x - 10, m.y, 12 + 10 * k.a, c.glow, (k.a + k.s) * 0.8); }
  ctx.restore();

  const lead = H.heads[nh - 1];
  const mid = H.heads[Math.floor(nh / 2)];
  const m = mouthAt(mid.h, mid.ang, 0.82, mid.jaw);
  const ml = mouthAt(lead.h, lead.ang, 0.82, lead.jaw);
  let top = 0;
  for (const Hd of H.heads) top = Math.min(top, Hd.h.y - 50);
  const core = H.xf({ x: 40, y: -128 });
  return {
    mouth: m,
    hand: { x: Math.min(ml.x, -120 + ox), y: Math.min(-10, ml.y) },
    core,
    top: Math.max(-380, top),
    halfW: 160,
  };
}

// ------------------------------------------------------------------ 3: QUETZARYN

/**
 * Pose da Quetzaryn: voa ondulando o corpo inteiro (onda vertical da cabeça para a cauda,
 * presa ao gait quando avança) e batendo as asas de penas. A batida acelera quando ela anda
 * (a fase soma o gait), a descida da asa é rápida e a subida lenta; o corpo sobe a cada batida.
 */
function quetzalPose(st: DrawState) {
  const k = cv(st);
  const { a, s, imp, ft, hold, mv, die, hurt } = k;
  const fwd = k.dir < 0;
  const w = sm(0, 0.2, mv);
  const ph = (fwd ? 1 : -1) * st.gait * STRIDE / 220 + st.t * 0.3;
  // batida da asa: fase contínua (tempo + passada)
  let fphi = st.t * 3.1 + TAU * st.gait * 0.9 + sm(0, 0.3, die) * st.t * 9;
  const flap = 0.5 - 0.5 * Math.cos(fphi + 0.45 * Math.sin(fphi)); // 0 = asa em cima, 1 = embaixo
  let d = lerp(0.25, 0.05, w) + flap * lerp(0.45, 0.85, w);
  let fold = 0; // asa recolhida
  let ox = 0;
  let oy = -Math.sin(fphi + 0.45 * Math.sin(fphi) - 0.6) * (5 + 7 * w) + Math.sin(st.t * 1.5) * 6;
  let tilt = (fwd ? -0.05 : 0.04) * mv;
  let hx = -158 + Math.sin(st.t * 1.1) * 8 - 18 * mv * (fwd ? 1 : -0.5);
  let hy = -232 + Math.sin(st.t * 1.4) * 6 + 10 * mv;
  let ang = -0.1 + Math.sin(st.t * 0.7) * 0.05;
  let jaw = 0, wave = 1;
  const hold2 = (target: number, kk: number) => { d = lerp(d, target, clamp(kk)); };
  if (k.breath) {
    hx += 50 * a - 64 * s + 20 * imp; hy += -32 * a + 22 * s; ang += 0.42 * a - 0.3 * s;
    hold2(0.05, a); hold2(0.95, s * (1 - ft * 0.4));
    jaw = sm(0.24, 0.42, st.p) * (1 - sm(0.84, 0.98, st.p));
    ox += 10 * a + 16 * imp;
  }
  if (k.shoot) {
    hx += 30 * a - 40 * s + 28 * imp; hy += -18 * a + 10 * s; ang += 0.22 * a - 0.12 * s + 0.14 * imp;
    hold2(0.1, a); hold2(0.9, s);
    jaw = sm(0.36, 0.46, st.p) * (1 - sm(0.64, 0.82, st.p));
  }
  if (k.roar) {
    hx += 30 * a - 30 * s; hy += -46 * a - 18 * s; ang += 0.66 * a + 0.08 * s;
    hold2(0, a + s); oy -= 20 * a + 10 * s;
    jaw = clamp(0.3 * a + sm(0.4, 0.5, st.p) * (1 - sm(0.86, 1, st.p)));
    hy += hold * Math.sin(st.t * 60) * 4;
  }
  if (k.cast) {
    oy -= 44 * (a + s * 0.6); hy -= 30 * a + 20 * s; ang += 0.4 * a + 0.1 * s;
    hold2(0, a + s);
    jaw = 0.3 * a + 0.6 * s;
  }
  if (k.swipe) {
    // rajada: ergue as asas e dá uma batida violenta para a frente
    ox += 22 * a - 46 * s; oy += -26 * a + 18 * s; tilt += 0.08 * a - 0.12 * s;
    hold2(0, a); hold2(1, s);
    hx += 20 * a - 40 * s; ang += 0.2 * a - 0.2 * s;
    jaw = 0.3 * a + 0.6 * s;
  }
  if (k.slam) {
    // sobe e mergulha de cabeça
    oy += -64 * a + 100 * s + 10 * imp; tilt += 0.1 * a - 0.28 * s;
    hy += -20 * a + 50 * s; ang += 0.3 * a - 0.7 * s; hx -= 30 * s;
    hold2(0, a); hold2(0.7, s); fold += 0.5 * s;
    jaw = 0.3 * a + 0.4 * s;
  }
  if (k.charge) {
    // recolhe as asas para trás e dispara esticada; a mordida fecha no impacto
    ox += 30 * a - 110 * s; oy += 10 * a + 24 * s; tilt += -0.06 * s;
    hold2(0.55, a + s); fold += 0.7 * a + 0.8 * s;
    hx += 50 * a - 60 * s; hy += 16 * a + 30 * s; ang += 0.2 * a - 0.25 * s;
    wave *= 1 - 0.7 * s;
    jaw = sm(0.2, 0.4, st.p) * (1 - sm(0.52, 0.57, st.p)) + 0.15 * ft;
  }
  // dano: tranco para trás e asas encolhem
  ox += 20 * hurt; hx += 26 * hurt; hy -= 12 * hurt; ang += 0.3 * hurt;
  hold2(0.7, hurt * 0.7); fold += 0.4 * hurt;
  jaw = Math.max(jaw, 0.4 * hurt);
  // morte: debate as asas, despenca girando e cai no chão com as asas abertas e moles
  const fall = Math.pow(sm(0.25, 0.68, die), 2);
  const lie = sm(0.6, 0.75, die);
  oy += fall * 150 - Math.sin(st.t * 14) * 6 * sm(0, 0.2, die) * (1 - fall);
  tilt += fall * 0.18 - lie * 0.14;
  hy += fall * 40 + lie * 12; hx -= fall * 30; ang -= fall * 0.4;
  if (die > 0) { d = lerp(lerp(d, 1.05, fall), 0.3, lie); fold = lerp(fold, 0.2, fall); }
  wave *= 1 - lie * 0.7;
  jaw = Math.max(jaw, 0.6 * sm(0, 0.2, die) * (1 - lie) + 0.2 * lie);
  return { k, w, ph, fphi, d: clamp(d, 0, 1.1), fold: clamp(fold), ox, oy, tilt, hx, hy, ang, jaw: clamp(jaw), wave, fall, lie };
}

/** Asa de penas articulada (ombro → cotovelo → pulso), com penas primárias em leque. */
function featherWing(ctx: CanvasRenderingContext2D, S: V, d: number, dLag: number, fold: number, sc: number, c: C, back: boolean, t: number) {
  const dk = (col: string) => (back ? mixHex(col, c.dark, 0.45) : col);
  const cols = [dk(c.body), dk(c.accent), dk(c.glow), dk(c.eye)];
  // ângulos: em cima ≈ −1,9 (para cima), embaixo ≈ +1,0 (para baixo e para trás)
  const al = lerp(-1.9, 1.0, d) + fold * 0.9;
  const bend = lerp(-0.2, 0.6, dLag) + fold * 1.2; // o pulso atrasa (overlapping)
  const L1 = 54 * sc, L2 = 62 * sc;
  const E = { x: S.x + Math.cos(al) * L1, y: S.y + Math.sin(al) * L1 };
  const a2 = al + bend * 0.6;
  const W = { x: E.x + Math.cos(a2) * L2, y: E.y + Math.sin(a2) * L2 };
  const spread = lerp(1.0, 0.55, dLag) * (1 - fold * 0.6);
  const sec: { P: V; fa: number; len: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const u = i / 5;
    const P = { x: lerp(S.x, W.x, 0.2 + u * 0.8), y: lerp(S.y, W.y, 0.2 + u * 0.8) };
    const fa = lerp(al, a2, u) + (1.5 - u * 0.3) + Math.sin(t * 6 + i) * 0.03 - fold * 0.5;
    sec.push({ P, fa, len: (72 + u * 16) * sc * (1 - fold * 0.35) });
  }
  const pri: { fa: number; len: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const u = i / 6;
    pri.push({ fa: a2 + 0.05 + u * spread + Math.sin(t * 7 + i * 1.3) * 0.03, len: (132 - u * 34) * sc * (1 - fold * 0.3) });
  }
  // superfície da asa (dá corpo ao leque)
  ctx.fillStyle = dk(mixHex(c.accent, c.dark, 0.35));
  ctx.beginPath();
  ctx.moveTo(S.x, S.y);
  ctx.lineTo(E.x, E.y);
  ctx.lineTo(W.x, W.y);
  for (const f of pri) ctx.lineTo(W.x + Math.cos(f.fa) * f.len * 0.82, W.y + Math.sin(f.fa) * f.len * 0.82);
  for (let i = sec.length - 1; i >= 0; i--) ctx.lineTo(sec[i].P.x + Math.cos(sec[i].fa) * sec[i].len * 0.8, sec[i].P.y + Math.sin(sec[i].fa) * sec[i].len * 0.8);
  ctx.closePath();
  ctx.fill();
  sec.forEach((f, i) => feather(ctx, f.P.x, f.P.y, f.fa, f.len, 16 * sc, cols[i % 4], c.dark));
  pri.forEach((f, i) => feather(ctx, W.x, W.y, f.fa, f.len, 18 * sc, cols[(i + 1) % 4], c.dark));
  // cobertas (o "braço" da asa)
  tube(ctx, [S, E, W], (u) => (26 - u * 12) * sc, back ? mixHex(c.dark, '#000000', 0.2) : c.dark);
  tube(ctx, [S, E, W], (u) => (21 - u * 10) * sc, dk(c.body));
  for (let i = 0; i < 6; i++) {
    const u = i / 5;
    const P = { x: lerp(S.x, W.x, u), y: lerp(S.y, W.y, u) };
    feather(ctx, P.x, P.y, lerp(al, a2, u) + 1.3, 36 * sc, 10 * sc, cols[(i + 2) % 4], c.dark);
  }
  const fa = pri[3].fa;
  return { x: W.x + Math.cos(fa) * pri[3].len, y: W.y + Math.sin(fa) * pri[3].len };
}

function quetzal(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState, c0: C): Anchors {
  // barriga dourada
  const c: C = { ...c0, belly: hurtTint(ctxNull, st, mixHex(s.pal.eye, s.pal.body, 0.35)) };
  const Q = quetzalPose(st);
  const Q0 = quetzalPose(past(st, 0.09));
  const { k, ox, oy, tilt, ph, d, fold, jaw } = Q;
  const { mv } = k;
  const heat = clamp(k.on * 1.1 + st.rage * 0.4);
  const groundY = -oy; // chão no espaço deslocado

  ctx.save();
  // sombra no chão (encolhe quando sobe)
  ctx.fillStyle = `rgba(0,0,0,${0.3 - clamp(-oy / 200) * 0.12 + Q.lie * 0.1})`;
  ctx.beginPath();
  ctx.ellipse(ox + 30, 0, 170 + oy * 0.2, 14, 0, 0, TAU);
  ctx.fill();
  ctx.translate(ox, oy);
  ctx.translate(40, -170);
  ctx.rotate(tilt);
  ctx.translate(-40, 170);

  // espinha: ombro → cauda, com onda vertical viajando da cabeça para a cauda
  const S: V = { x: -64, y: -196 };
  const N = 30;
  const amp = (24 + 18 * Q.w + 8 * Math.sin(st.t * 0.8)) * Q.wave;
  const body: V[] = [];
  for (let i = N; i >= 0; i--) {
    const u = i / N;
    const env = sm(0, 0.3, u) * (1 - 0.3 * u);
    let y = S.y + u * 34 + amp * env * Math.sin(TAU * (u * 1.25 - ph));
    // no chão (morte), o corpo se esparrama
    y = lerp(y, Math.min(y, groundY - 12 - 30 * (1 - u) * 0.3), Q.lie);
    body.push({ x: S.x + u * 300 - u * u * 10, y });
  }
  const end = rotV(14, -2, Q.ang);
  const H: V = { x: Q.hx, y: Q.hy };
  const Hp: V = { x: Q0.hx, y: Q0.hy };
  const neck = bez(S, { x: S.x - 30, y: S.y - 30 }, { x: Hp.x + 66, y: Hp.y + 14 }, { x: H.x + end.x, y: H.y + end.y }, 14);
  const spine = body.concat(neck.slice(1));
  const L = spine.length - 1;
  const bw = (t: number) => {
    const i = t * L;
    if (i <= N) return lerp(12, 60, Math.pow(i / N, 0.6));
    return lerp(60, 40, (i - N) / 14);
  };

  // asa de trás
  const dLag = Q0.d;
  featherWing(ctx, { x: S.x + 30, y: S.y - 14 }, d, dLag, fold, 0.88, c, true, st.t);

  // plumas da cauda (atrasam com a onda)
  const t0 = spine[0], t1 = spine[3];
  const ta = Math.atan2(t0.y - t1.y, t0.x - t1.x);
  const tcols = [c.accent, c.eye, c.glow, c.accent, c.glow];
  for (let i = 0; i < 5; i++) {
    const lag = Math.sin(st.t * 4 - i * 0.6 + TAU * ph) * (0.12 + 0.1 * mv);
    feather(ctx, t0.x, t0.y, ta - 0.6 + i * 0.3 + lag, 78 - Math.abs(i - 2) * 12, 11, tcols[i], c.dark);
  }

  snakeBody(ctx, spine, bw, c);
  // faixas coloridas nas costas
  for (let i = 3; i < L - 4; i += 3) {
    const nn = nrm(spine, i);
    const wv = bw(i / L) * 0.3;
    ctx.fillStyle = (i / 3) % 2 ? c.accent : c.eye;
    ctx.beginPath();
    ctx.arc(spine[i].x - nn.x * wv, spine[i].y - nn.y * wv, 3.5, 0, TAU);
    ctx.fill();
  }
  // penas pequenas ao longo do dorso (tremulam com o vento)
  for (let i = 4; i < N - 2; i += 3) {
    const nn = nrm(spine, i);
    const wv = bw(i / L) * 0.5;
    const fa = Math.atan2(-nn.y, -nn.x) + 0.9 + Math.sin(st.t * 6 - i * 0.7) * 0.12 + mv * 0.2;
    feather(ctx, spine[i].x - nn.x * wv, spine[i].y - nn.y * wv, fa, 26, 6, i % 2 ? c.accent : c.glow, c.dark);
  }
  if (heat > 0.05) bloom(ctx, 30, -180, 130, c.glow, heat * 0.16);
  // gola de penas na nuca (tremula e atrasa com a cabeça)
  const nk = neck[Math.floor(neck.length * 0.6)];
  const crestLag = clamp((H.x - Hp.x) * -0.015 + (H.y - Hp.y) * 0.012, -0.6, 0.6);
  for (let i = 0; i < 7; i++) {
    feather(ctx, nk.x, nk.y, -2.0 + i * 0.48 + Math.sin(st.t * 6 + i) * 0.08 + crestLag * 0.5, 38, 8, i % 2 ? c.accent : c.glow, c.dark);
  }
  // rastro da asa na rajada / do bote
  const fast = (k.swipe + k.charge + k.slam) * sm(0.44, 0.5, st.p) * (1 - sm(0.57, 0.68, st.p));
  snakeHead(ctx, H, Q.ang, 1.0, jaw, c, st, 'feather', heat, 7, crestLag);
  // asa da frente
  const tip = featherWing(ctx, { x: S.x + 12, y: S.y - 4 }, d, dLag, fold, 1, c, false, st.t);
  if (fast > 0.03) {
    const tr: V[] = [];
    for (let j = 6; j >= 0; j--) {
      const Pj = quetzalPose({ ...st, p: st.p - j * 0.01 });
      if (k.swipe) {
        const al = lerp(-1.9, 1.0, Pj.d), a2 = al + lerp(-0.2, 0.6, Pj.d) * 0.6;
        const E = { x: S.x + 12 + Math.cos(al) * 54, y: S.y - 4 + Math.sin(al) * 54 };
        tr.push({ x: E.x + Math.cos(a2) * 180 + Pj.ox - ox, y: E.y + Math.sin(a2) * 180 + Pj.oy - oy });
      } else tr.push({ x: mouthAt({ x: Pj.hx, y: Pj.hy }, Pj.ang, 1).x + Pj.ox - ox, y: mouthAt({ x: Pj.hx, y: Pj.hy }, Pj.ang, 1).y + Pj.oy - oy });
    }
    smear(ctx, tr, 70, c.glow, fast);
  }
  // penas soltas caindo na morte e no dano forte
  const loose = Math.max(k.die > 0 ? sm(0.1, 0.3, k.die) * (1 - sm(0.85, 1, k.die)) : 0, k.hurt * 0.8);
  if (loose > 0.03) {
    for (let i = 0; i < 6; i++) {
      const q = (st.t * (0.4 + h01(i, 1) * 0.3) + h01(i, 2)) % 1;
      ctx.globalAlpha = loose * (1 - q);
      feather(ctx, -80 + h01(i, 3) * 220 + Math.sin(st.t * 3 + i) * 20, -230 + q * 220, Math.sin(st.t * 4 + i) * 0.8 + 1.4, 26, 7, [c.accent, c.eye, c.glow][i % 3], c.dark);
    }
    ctx.globalAlpha = 1;
  }
  if (k.cast > 0) {
    magicCircle(ctx, 30, -160, 130 * (k.a + k.s * 0.7), c.glow, k.on * 0.7, st.t, 0.5);
    const m = mouthAt(H, Q.ang, 1, jaw);
    orb(ctx, m.x - 10, m.y, 14 + 16 * k.s, c.glow, (k.a + k.s) * 0.9);
  }
  if (k.slam) {
    const sh = sm(0.53, 0.56, st.p) * (1 - sm(0.56, 0.85, st.p));
    if (sh > 0.02) {
      ctx.strokeStyle = hexA(c.glow, sh);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(H.x - 30, groundY, 60 + (1 - sh) * 120, 10 + (1 - sh) * 12, 0, 0, TAU);
      ctx.stroke();
    }
  }
  ctx.restore();

  // âncoras no espaço do chão (aplicando inclinação e deslocamento)
  const world = (p: V): V => {
    const r = rotV(p.x - 40, p.y + 170, tilt);
    return { x: r.x + 40 + ox, y: r.y - 170 + oy };
  };
  const m = world(mouthAt(H, Q.ang, 1, jaw));
  const hand = k.swipe ? world(tip) : world({ x: -130, y: -120 });
  const core = world({ x: 40, y: -180 });
  return {
    mouth: { x: m.x, y: Math.min(-10, m.y) },
    hand: { x: hand.x, y: Math.min(-10, hand.y) },
    core,
    top: Math.max(-380, Math.min(-60, core.y - 150)),
    halfW: 170,
  };
}
