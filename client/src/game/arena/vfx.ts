/**
 * Efeitos visuais da arena.
 *
 * Todos os efeitos são FUNÇÕES DO TEMPO com aleatoriedade semeada pelo evento:
 * dado o mesmo replay e o mesmo instante, qualquer tela desenha exatamente os
 * mesmos pixels (lutador A, lutador B e espectadores).
 *
 * Os objetos de efeito vêm de um pool reaproveitado (sem alocação por quadro).
 */
import { ELEMENT_COLOR, type Element, type VfxKey } from '@gymbattle/shared';

export type FxKind =
  | 'sparks' | 'burst' | 'ring' | 'cracks' | 'dust' | 'pillar' | 'bolt' | 'meteor' | 'explosion'
  | 'cloud' | 'ice' | 'flameWave' | 'arrowRain' | 'number' | 'koBlast' | 'slashArc' | 'charge' | 'blackFlame' | 'impact';

export interface Fx {
  active: boolean;
  kind: FxKind;
  t0: number; // tick de início
  dur: number; // ticks
  x: number;
  y: number;
  r: number;
  dir: number;
  color: string;
  color2: string;
  seed: number;
  n: number;
  text: string;
  big: boolean;
  front: boolean;
}

/** Aleatório determinístico: mesmo (semente, índice) → mesmo número. */
export function rnd(seed: number, i: number) {
  let h = (seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const QUALITY = { particles: 1 };

export class FxPool {
  private pool: Fx[] = [];
  constructor(size = 256) {
    for (let i = 0; i < size; i++) this.pool.push(blank());
  }
  spawn(kind: FxKind, t0: number, x: number, y: number, o: Partial<Fx> = {}): Fx | null {
    let fx = this.pool.find((f) => !f.active);
    if (!fx) {
      // reaproveita o efeito mais antigo
      fx = this.pool.reduce((a, b) => (a.t0 < b.t0 ? a : b));
    }
    Object.assign(fx, blank(), { active: true, kind, t0, x, y }, o);
    if (!o.seed) fx.seed = (Math.round(t0 * 1000) * 7919 + Math.round(x) * 131 + Math.round(y)) >>> 0;
    return fx;
  }
  clear() {
    for (const f of this.pool) f.active = false;
  }
  /** Desenha os efeitos ativos (layer 'back' ou 'front') no instante `now` (ticks). */
  draw(ctx: CanvasRenderingContext2D, now: number, front: boolean) {
    for (const f of this.pool) {
      if (!f.active || f.front !== front) continue;
      const age = now - f.t0;
      if (age < 0) continue;
      if (age > f.dur) {
        f.active = false;
        continue;
      }
      drawFx(ctx, f, age);
    }
  }
}

function blank(): Fx {
  return { active: false, kind: 'sparks', t0: 0, dur: 20, x: 0, y: 0, r: 60, dir: 1, color: '#fff', color2: '#fff', seed: 1, n: 10, text: '', big: false, front: true };
}

const TICK_S = 1 / 30;

function drawFx(ctx: CanvasRenderingContext2D, f: Fx, age: number) {
  const k = age / f.dur; // 0..1
  const s = age * TICK_S; // segundos
  const n = Math.max(1, Math.round(f.n * QUALITY.particles));
  ctx.save();
  switch (f.kind) {
    case 'sparks': {
      ctx.strokeStyle = f.color;
      ctx.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const a = rnd(f.seed, i) * Math.PI * 2;
        const sp = 260 + rnd(f.seed, i + 50) * 520;
        const x = f.x + Math.cos(a) * sp * s;
        const y = f.y + Math.sin(a) * sp * s + 600 * s * s;
        const len = 10 * (1 - k) + 2;
        ctx.globalAlpha = 1 - k;
        ctx.lineWidth = f.big ? 3 : 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - Math.cos(a) * len, y - Math.sin(a) * len);
        ctx.stroke();
      }
      // clarão no ponto de impacto
      ctx.globalAlpha = Math.max(0, 1 - k * 3);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(f.x, f.y, Math.max(0, (f.big ? 13 : 8) * (1.2 - k * 2.2)), 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'burst': {
      for (let i = 0; i < n; i++) {
        const a = rnd(f.seed, i) * Math.PI * 2;
        const sp = 60 + rnd(f.seed, i + 9) * 180;
        const rise = f.color === ELEMENT_COLOR.fire || f.color === ELEMENT_COLOR.holy ? -120 : 40;
        const x = f.x + Math.cos(a) * sp * s;
        const y = f.y + Math.sin(a) * sp * s * 0.6 + rise * s;
        ctx.globalAlpha = (1 - k) * 0.9;
        ctx.fillStyle = i % 3 === 0 ? f.color2 : f.color;
        ctx.beginPath();
        ctx.arc(x, y, (2 + rnd(f.seed, i + 3) * 3) * (1 - k * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'ring': {
      const r = f.r * easeOut(k);
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 6 * (1 - k) + 1;
      ctx.beginPath();
      ctx.ellipse(f.x, f.y, r, r * 0.22, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = (1 - k) * 0.35;
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.ellipse(f.x, f.y, r * 0.9, r * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      // poeira
      ctx.fillStyle = '#b8a888';
      for (let i = 0; i < n; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const d = r * (0.6 + rnd(f.seed, i) * 0.5);
        ctx.globalAlpha = (1 - k) * 0.5;
        ctx.beginPath();
        ctx.arc(f.x + side * d, f.y - 6 - rnd(f.seed, i + 4) * 30 * k, 6 + 10 * k, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'cracks': {
      ctx.strokeStyle = '#0b0b0f';
      ctx.lineWidth = 2;
      ctx.globalAlpha = k < 0.7 ? 0.8 : (1 - k) / 0.3 * 0.8;
      for (let i = 0; i < 5; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        let x = f.x;
        let y = f.y;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let j = 0; j < 4; j++) {
          x += side * (8 + rnd(f.seed, i * 9 + j) * 18) * Math.min(1, age / 4);
          y += (rnd(f.seed, i * 7 + j) - 0.3) * 6;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;
    }
    case 'dust': {
      ctx.fillStyle = f.color;
      for (let i = 0; i < n; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const sp = 40 + rnd(f.seed, i) * 110;
        ctx.globalAlpha = (1 - k) * 0.55;
        ctx.beginPath();
        ctx.arc(f.x + side * sp * s * 1.6, f.y - 4 - rnd(f.seed, i + 3) * 40 * s, 4 + 9 * k, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'pillar': {
      const inK = Math.min(1, age / 4);
      const w = f.r * (0.6 + 0.4 * inK) * (1 - k * 0.5);
      const g = ctx.createLinearGradient(f.x - w, 0, f.x + w, 0);
      g.addColorStop(0, f.color + '00');
      g.addColorStop(0.5, f.color);
      g.addColorStop(1, f.color + '00');
      ctx.globalAlpha = (1 - k) * inK;
      ctx.fillStyle = g;
      ctx.fillRect(f.x - w, f.y - 900, w * 2, 900);
      ctx.globalAlpha = (1 - k) * inK * 0.9;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(f.x - w * 0.18, f.y - 900, w * 0.36, 900);
      // brilho no chão
      ctx.beginPath();
      ctx.ellipse(f.x, f.y, w * 1.4, w * 0.3, 0, 0, Math.PI * 2);
      ctx.fillStyle = f.color;
      ctx.globalAlpha = (1 - k) * 0.6;
      ctx.fill();
      break;
    }
    case 'bolt': {
      const vis = age < 3 || (age > 5 && age < 7);
      if (vis) {
        ctx.strokeStyle = f.color;
        ctx.shadowColor = f.color;
        ctx.shadowBlur = QUALITY.particles < 1 ? 0 : 18;
        ctx.lineWidth = 5;
        ctx.beginPath();
        let x = f.x + (rnd(f.seed, 99) - 0.5) * 80;
        let y = f.y - 700;
        ctx.moveTo(x, y);
        for (let i = 1; i <= 10; i++) {
          x = f.x + (i === 10 ? 0 : (rnd(f.seed, i) - 0.5) * 60);
          y = f.y - 700 + (700 * i) / 10;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.ellipse(f.x, f.y, 50 * (1 - k) + 10, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'meteor': {
      const fallK = Math.min(1, age / (f.dur * 0.35));
      if (fallK < 1) {
        const sx = f.x - 260 * f.dir;
        const sy = f.y - 700;
        const x = sx + (f.x - sx) * fallK;
        const y = sy + (f.y - sy) * fallK * fallK;
        // rastro
        ctx.strokeStyle = f.color;
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = f.r * 0.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x - (f.x - sx) * 0.15, y - (f.y - sy) * 0.2);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = f.color2;
        ctx.beginPath();
        ctx.arc(x, y, f.r * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.arc(x, y, f.r * 0.22, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const ek = (age - f.dur * 0.35) / (f.dur * 0.65);
        explosion(ctx, f, ek, f.r * 1.3);
      }
      break;
    }
    case 'explosion':
      explosion(ctx, f, k, f.r);
      break;
    case 'cloud': {
      for (let i = 0; i < 9; i++) {
        const ox = (rnd(f.seed, i) - 0.5) * f.r * 1.6;
        const oy = -rnd(f.seed, i + 20) * f.r * 0.8 - 10;
        const drift = Math.sin(s * 2 + i) * 6;
        ctx.globalAlpha = (k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8) * 0.45;
        ctx.fillStyle = i % 2 ? f.color : f.color2;
        ctx.beginPath();
        ctx.arc(f.x + ox + drift, f.y + oy - s * 12, f.r * (0.35 + rnd(f.seed, i + 40) * 0.3), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'ice': {
      const grow = Math.min(1, age / 4);
      ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 0.9;
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i - 3) * 0.35;
        const len = (50 + rnd(f.seed, i) * 50) * grow;
        const bx = f.x + (i - 3) * 9;
        ctx.fillStyle = i % 2 ? '#dff6ff' : f.color;
        ctx.beginPath();
        ctx.moveTo(bx - 7, f.y);
        ctx.lineTo(bx + Math.cos(a) * len, f.y + Math.sin(a) * len);
        ctx.lineTo(bx + 7, f.y);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'flameWave': {
      for (let i = 0; i < n; i++) {
        const d = (i / n) * f.r;
        const appear = d / f.r;
        if (k < appear * 0.5) continue;
        const life = Math.min(1, (k - appear * 0.5) / 0.5);
        const h = (40 + rnd(f.seed, i) * 40) * (1 - life);
        const x = f.x + f.dir * d;
        ctx.globalAlpha = (1 - life) * 0.9;
        const g = ctx.createLinearGradient(x, f.y, x, f.y - h);
        g.addColorStop(0, f.color);
        g.addColorStop(1, f.color2 + '00');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x - 12, f.y);
        ctx.quadraticCurveTo(x, f.y - h * 1.2, x + 12, f.y);
        ctx.fill();
      }
      break;
    }
    case 'blackFlame': {
      for (let i = 0; i < n; i++) {
        const ox = (rnd(f.seed, i) - 0.5) * f.r * 1.4;
        const rise = rnd(f.seed, i + 30) * 160 * s + 20 * k;
        ctx.globalAlpha = (1 - k) * 0.85;
        ctx.fillStyle = i % 3 === 0 ? f.color : '#140c1c';
        ctx.beginPath();
        ctx.arc(f.x + ox, f.y - rise - 10, (8 + rnd(f.seed, i + 5) * 12) * (1 - k * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'arrowRain': {
      ctx.strokeStyle = f.color2;
      ctx.lineWidth = 2;
      for (let i = 0; i < 7; i++) {
        const delay = rnd(f.seed, i) * 0.5;
        const kk = (k - delay) / 0.5;
        if (kk < 0 || kk > 1) continue;
        const x = f.x + (rnd(f.seed, i + 10) - 0.5) * f.r * 2;
        const y = f.y - 500 + 500 * kk;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(x + 6, y - 26);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'number': {
      const y = f.y - 30 * easeOut(Math.min(1, k * 2)) - 18 * k;
      const scale = k < 0.12 ? 0.6 + (k / 0.12) * 0.7 : 1.3 - Math.min(0.3, (k - 0.12) * 2);
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      ctx.translate(f.x + f.dir * 14 * k, y);
      ctx.scale(scale, scale);
      ctx.font = `800 ${f.big ? 30 : 22}px "Space Grotesk Variable", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(f.text, 0, 0);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, 0, 0);
      break;
    }
    case 'koBlast': {
      const r = 260 * easeOut(k);
      ctx.globalAlpha = (1 - k) * 0.9;
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + rnd(f.seed, i) * 0.3;
        ctx.strokeStyle = i % 2 ? f.color : '#ffffff';
        ctx.lineWidth = 10 * (1 - k) + 2;
        ctx.beginPath();
        ctx.moveTo(f.x + Math.cos(a) * r * 0.3, f.y + Math.sin(a) * r * 0.3);
        ctx.lineTo(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r);
        ctx.stroke();
      }
      ctx.fillStyle = f.color;
      ctx.globalAlpha = (1 - k) * 0.5;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'impact': {
      // corte no ponto do acerto: risco brilhante na direção do golpe + linhas de velocidade
      const ang = f.r; // ângulo do risco (radianos)
      const len = (f.big ? 70 : 46) * (0.6 + 0.4 * easeOut(Math.min(1, k * 3)));
      const alpha = Math.max(0, 1 - k * 1.6);
      ctx.translate(f.x, f.y);
      ctx.rotate(ang);
      // halo colorido
      ctx.globalAlpha = alpha * 0.55;
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, len * 0.55, (f.big ? 9 : 6) * (1 - k), 0, 0, Math.PI * 2);
      ctx.fill();
      // núcleo branco afinando
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.quadraticCurveTo(0, -(f.big ? 4 : 2.6) * (1 - k), len / 2, 0);
      ctx.quadraticCurveTo(0, (f.big ? 4 : 2.6) * (1 - k), -len / 2, 0);
      ctx.fill();
      // risco cruzado nos golpes fortes
      if (f.big) {
        ctx.rotate(1.2);
        ctx.globalAlpha = alpha * 0.8;
        ctx.beginPath();
        ctx.moveTo(-len * 0.35, 0);
        ctx.quadraticCurveTo(0, -2.4 * (1 - k), len * 0.35, 0);
        ctx.quadraticCurveTo(0, 2.4 * (1 - k), -len * 0.35, 0);
        ctx.fill();
        ctx.rotate(-1.2);
      }
      // linhas de velocidade saindo do impacto
      ctx.strokeStyle = f.color2;
      ctx.lineWidth = 1.5;
      const m = f.big ? 8 : 5;
      for (let i = 0; i < m; i++) {
        const a = rnd(f.seed, i) * Math.PI * 2;
        const r0 = 10 + easeOut(k) * 40;
        const r1 = r0 + 14 * (1 - k);
        ctx.globalAlpha = alpha * 0.8;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.stroke();
      }
      break;
    }
    case 'slashArc': {
      // meia-lua de energia (katana, foice, etc.)
      const a0 = f.dir > 0 ? -1.3 : Math.PI + 1.3;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 8 * (1 - k) + 2;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (0.7 + 0.3 * k), a0, a0 + 2.6 * f.dir, f.dir < 0);
      ctx.stroke();
      break;
    }
    case 'charge': {
      // energia se juntando na arma durante a preparação
      for (let i = 0; i < n; i++) {
        const a = rnd(f.seed, i) * Math.PI * 2;
        const d = (1 - ((k + rnd(f.seed, i + 7)) % 1)) * 40;
        ctx.globalAlpha = 0.9 * (1 - d / 40);
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 0.35 + 0.35 * k;
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 6 + 10 * k, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function explosion(ctx: CanvasRenderingContext2D, f: Fx, k: number, R: number) {
  const r = R * easeOut(k);
  const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, Math.max(1, r));
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, f.color);
  g.addColorStop(1, f.color2 + '00');
  ctx.globalAlpha = 1 - k;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = f.color;
  ctx.lineWidth = 4 * (1 - k);
  ctx.beginPath();
  ctx.arc(f.x, f.y, r * 1.15, 0, Math.PI * 2);
  ctx.stroke();
}

function easeOut(t: number) {
  return 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
}

/** Cores (principal, secundária) por elemento. */
export function elColors(el: Element): [string, string] {
  const c = ELEMENT_COLOR[el];
  const second: Record<Element, string> = {
    physical: '#ffe8b0', fire: '#ffd24a', ice: '#ffffff', lightning: '#ffffff', shadow: '#2a1440',
    holy: '#ffffff', poison: '#2f6a12', blood: '#5a0010', arcane: '#c8d8ff',
  };
  return [c, second[el]];
}

/** Efeito de área de acordo com o VFX da arma. */
export function spawnAreaFx(pool: FxPool, t: number, x: number, y: number, r: number, vfx: VfxKey, el: Element, dir: number) {
  const [c1, c2] = elColors(el);
  const pc = QUALITY.particles;
  switch (vfx) {
    case 'shockwave':
    case 'quake':
    case 'leap_slam':
      pool.spawn('ring', t, x, y, { r: r * 1.2, color: c1, dur: 18, n: 10, front: false });
      pool.spawn('cracks', t, x, y, { dur: 45, front: false });
      pool.spawn('dust', t, x, y, { color: '#b8a888', n: 12, dur: 22 });
      if (vfx === 'quake') pool.spawn('burst', t, x, y - 20, { color: c1, color2: c2, n: 22, dur: 24 });
      break;
    case 'meteor':
      pool.spawn('meteor', t, x, y, { r: Math.max(50, r), color: c1, color2: c2, dur: 26, dir });
      pool.spawn('ring', t + 9, x, y, { r: r * 1.4, color: c1, dur: 16, front: false });
      break;
    case 'lightning_storm':
    case 'lightning_spear':
      pool.spawn('bolt', t, x, y, { color: c1, dur: 10 });
      pool.spawn('sparks', t, x, y - 10, { color: c1, n: 10, dur: 12 });
      break;
    case 'holy_beam':
    case 'holy_nova':
      pool.spawn('pillar', t, x, y, { r: Math.max(24, r * 0.5), color: c1, dur: 20 });
      pool.spawn('burst', t, x, y - 30, { color: c1, color2: c2, n: 16, dur: 22 });
      break;
    case 'ice_prison':
    case 'ice_shard':
      pool.spawn('ice', t, x, y, { color: c1, dur: 26 });
      pool.spawn('burst', t, x, y - 40, { color: c1, color2: c2, n: 12, dur: 18 });
      break;
    case 'flame_wave':
      pool.spawn('flameWave', t, x - dir * r * 0.5, y, { r: r * 1.3, dir, color: c1, color2: c2, n: Math.round(14 * pc) + 4, dur: 22 });
      break;
    case 'poison_cloud':
      pool.spawn('cloud', t, x, y, { r: Math.max(45, r), color: c1, color2: c2, dur: 45 });
      break;
    case 'black_flame':
      pool.spawn('blackFlame', t, x, y, { r: Math.max(50, r), color: c1, n: 22, dur: 26 });
      pool.spawn('explosion', t, x, y - 30, { r: r * 0.8, color: c1, color2: '#140c1c', dur: 14 });
      break;
    case 'arrow_rain':
      pool.spawn('arrowRain', t, x, y, { r: Math.max(40, r), color: c1, color2: '#d8c8a0', dur: 16 });
      pool.spawn('burst', t + 6, x, y - 10, { color: c1, color2: c2, n: 6, dur: 12 });
      break;
    case 'spin':
    case 'whirlwind':
    case 'shadow_spin':
      pool.spawn('slashArc', t, x, y - 45, { r: r * 0.8, dir: 1, color: c1, dur: 10 });
      pool.spawn('slashArc', t + 3, x, y - 45, { r: r * 0.8, dir: -1, color: c1, dur: 10 });
      break;
    default:
      pool.spawn('explosion', t, x, y - 30, { r: Math.max(40, r * 0.7), color: c1, color2: c2, dur: 14 });
  }
}
