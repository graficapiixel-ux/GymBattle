/**
 * Kit dos bosses — entregue pelo servidor só para quem pode ver
 * (/api/events/kit.js). O site principal NÃO contém este código.
 */
import type { BossSpec } from '@gymbattle/shared';
import { BossBattle } from './battle';
import { bodyFor } from './bodies';
import type { DrawState } from './types';
import { TAU, h01, mixHex, rgrad } from './util';

export const KIT_VERSION = 1;
export { BossBattle };

/** Desenha o boss "posando" (idle, com um rugido de vez em quando) num retângulo. */
export function drawPortrait(ctx: CanvasRenderingContext2D, spec: BossSpec, t: number, w: number, h: number, opts: { bg?: boolean } = {}) {
  if (opts.bg !== false) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, spec.bg.sky[0]);
    g.addColorStop(1, spec.bg.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgrad(ctx, w * 0.5, h * 0.55, Math.max(w, h) * 0.6, spec.bg.fog + '55', 'transparent');
    ctx.fillRect(0, 0, w, h);
    // brasas/partículas subindo
    for (let i = 0; i < 26; i++) {
      const sp = 0.05 + h01(i, 1) * 0.12;
      const x = (h01(i, 2) * w + Math.sin(t + i) * 12) % w;
      const y = h - ((t * sp * h + h01(i, 3) * h) % h);
      ctx.globalAlpha = 0.3 + 0.6 * h01(i, 4);
      ctx.fillStyle = spec.bg.particle;
      ctx.beginPath();
      ctx.arc(x, y, 1 + h01(i, 5) * 2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = mixHex(spec.bg.ground, '#000000', 0.2);
    ctx.fillRect(0, h * 0.86, w, h * 0.14);
  }
  // a cada 6 s, um rugido
  const cyc = t % 6;
  const st: DrawState =
    cyc > 4.4
      ? { t, anim: 'attack', pose: 'roar', p: (cyc - 4.4) / 1.6, hurt: 0, rage: 0.6, move: 0, gait: 0, vx: 0, vy: 0 }
      : { t, anim: 'idle', pose: 'roar', p: 0, hurt: 0, rage: 0.3, move: 0, gait: 0, vx: 0, vy: 0 };
  const k = Math.min(w / 520, h / 420) * Math.min(1.15, 0.75 + spec.size * 0.25);
  ctx.save();
  ctx.translate(w * 0.54, h * 0.88);
  ctx.scale(k, k);
  try {
    bodyFor(spec.arch)(ctx, spec, st);
  } catch {
    /* ignora */
  }
  ctx.restore();
}

/** Liga um retrato animado num <canvas>. Devolve a função para parar. */
export function mountPortrait(canvas: HTMLCanvasElement, spec: BossSpec, opts: { bg?: boolean } = {}) {
  const ctx = canvas.getContext('2d')!;
  let raf = 0;
  const start = performance.now();
  const frame = (now: number) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(1, Math.round(rect.width * dpr));
    const H = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    drawPortrait(ctx, spec, Math.max(0, (now - start) / 1000), rect.width, rect.height, opts);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
