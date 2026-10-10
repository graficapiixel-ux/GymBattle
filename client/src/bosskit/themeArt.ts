/**
 * Retrato animado de um tema de WAVES (card do evento): o cenário, monstros do
 * tema em volta e o mini-chefe no meio, com a aura. Também o retrato do PvP em
 * equipes (dois times de silhueta se encarando).
 */
import type { BossSpec, WaveThemePublic } from '@gymbattle/shared';
import { WEAPONS_BY_ID } from '@gymbattle/shared';
import { drawAvatar, idlePose, weaponShape } from '../game/rig';
import { bodyFor } from './bodies';
import type { DrawState } from './types';
import { TAU, h01, mixHex, rgrad } from './util';

function sky(ctx: CanvasRenderingContext2D, w: number, h: number, bg: WaveThemePublic['bg'], t: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, bg.sky[0]);
  g.addColorStop(1, bg.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgrad(ctx, w * 0.5, h * 0.7, Math.max(w, h) * 0.6, bg.fog + '55', bg.fog + '00');
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 28; i++) {
    const sp = 0.05 + h01(i, 1) * 0.12;
    const x = (h01(i, 2) * w + Math.sin(t + i) * 12) % w;
    const y = h - ((t * sp * h + h01(i, 3) * h) % h);
    ctx.globalAlpha = 0.3 + 0.6 * h01(i, 4);
    ctx.fillStyle = bg.particle;
    ctx.beginPath();
    ctx.arc(x, y, 1 + h01(i, 5) * 2, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  // morros
  ctx.fillStyle = mixHex(bg.sky[1], '#000000', 0.4);
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * 0.7 - 30 * Math.sin(x * 0.012) - 18 * Math.sin(x * 0.031 + 1));
  ctx.lineTo(w, h);
  ctx.fill();
  ctx.fillStyle = mixHex(bg.ground, '#000000', 0.15);
  ctx.fillRect(0, h * 0.86, w, h * 0.14);
}

/** Desenha o retrato do tema de waves num retângulo. */
export function drawThemePortrait(ctx: CanvasRenderingContext2D, th: WaveThemePublic, t: number, w: number, h: number) {
  sky(ctx, w, h, th.bg, t);
  const ground = h * 0.88;
  const k = Math.min(w / 520, h / 300);
  // monstros: 2 de cada lado, olhando para o centro
  const spots = [-0.36, -0.2, 0.2, 0.36];
  th.monsters.slice(0, 4).forEach((m, i) => {
    const spec = { ...m.body, name: m.name, title: '', lore: '', attacks: [], bg: th.bg } as unknown as BossSpec;
    const cyc = (t + i * 1.7) % 5;
    const st: DrawState =
      cyc > 3.8
        ? { t: t + i, anim: 'attack', pose: 'roar', p: (cyc - 3.8) / 1.2, hurt: 0, rage: 0.4, move: 0, gait: 0, vx: 0, vy: 0 }
        : { t: t + i, anim: 'idle', pose: 'roar', p: 0, hurt: 0, rage: 0.3, move: 0, gait: 0, vx: 0, vy: 0 };
    const x = w * (0.5 + spots[i]);
    const face = spots[i] < 0 ? 1 : -1; // olham para o meio
    ctx.save();
    ctx.translate(x, ground);
    ctx.globalAlpha = 0.92;
    ctx.scale(-face * m.scale * 1.15 * k, m.scale * 1.15 * k);
    try {
      bodyFor(spec.arch)(ctx, spec, st);
    } catch {
      /* ignora */
    }
    ctx.restore();
  });
  // o chefe no meio, com aura
  const c = th.chief;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.7 + 0.2 * Math.sin(t * 3);
  ctx.fillStyle = rgrad(ctx, w / 2, ground - 70 * k, 120 * k, c.aura + 'aa', c.aura + '00');
  ctx.fillRect(w / 2 - 140 * k, ground - 200 * k, 280 * k, 230 * k);
  ctx.restore();
  const weapon = WEAPONS_BY_ID[c.equipment.weapon ?? ''];
  ctx.save();
  ctx.translate(w / 2, ground);
  drawAvatar(ctx, { look: c.look, equipment: c.equipment, pose: idlePose(weaponShape(weapon), t), facing: 1, time: t, scale: 1.45 * k });
  ctx.restore();
}

/** Retrato do PvP em equipes: dois times se encarando. */
export function drawPvpPortrait(ctx: CanvasRenderingContext2D, t: number, w: number, h: number) {
  const bg = { sky: ['#0a0612', '#3a2050'] as [string, string], ground: '#2a2234', fog: '#ffd24a', particle: '#fff1b8' };
  sky(ctx, w, h, bg, t);
  const ground = h * 0.88;
  const k = Math.min(w / 520, h / 300);
  const team = (side: -1 | 1, color: string) => {
    for (let i = 0; i < 3; i++) {
      const x = w / 2 + side * (70 + i * 55) * k;
      ctx.save();
      ctx.translate(x, ground);
      ctx.globalAlpha = 1 - i * 0.18;
      drawAvatar(ctx, {
        look: {
          skin: ['#f1c27d', '#8d5524', '#c68642'][i], face: i, hair: i + 1, hairColor: '#2a1a10', beard: i % 2, body: 1, height: 1, gender: i % 2, eyes: '#333333',
          marks: 0, accessory: 0, top: color, shorts: '#1a1a1a',
        },
        equipment: { weapon: ['espada-curta-recruta', 'cajado-aprendiz', 'selo-do-novico'][i], helm: null, chest: null, gloves: null, legs: null },
        pose: idlePose(weaponShape(WEAPONS_BY_ID[['espada-curta-recruta', 'cajado-aprendiz', 'selo-do-novico'][i]]), t + i),
        facing: side > 0 ? -1 : 1,
        time: t,
        scale: 1.15 * k,
      });
      ctx.restore();
    }
  };
  team(-1, '#3b82f6');
  team(1, '#ef4444');
  // faísca no meio
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgrad(ctx, w / 2, ground - 60 * k, 70 * k * (0.9 + 0.1 * Math.sin(t * 6)), '#ffd24acc', '#ffd24a00');
  ctx.fillRect(w / 2 - 80 * k, ground - 140 * k, 160 * k, 160 * k);
  ctx.restore();
}

/** Liga um retrato animado num <canvas>. Devolve a função para parar. */
export function mountTeamPortrait(canvas: HTMLCanvasElement, theme: WaveThemePublic | null) {
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
    const t = Math.max(0, (now - start) / 1000);
    try {
      if (theme) drawThemePortrait(ctx, theme, t, rect.width, rect.height);
      else drawPvpPortrait(ctx, t, rect.width, rect.height);
    } catch {
      /* ignora */
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
