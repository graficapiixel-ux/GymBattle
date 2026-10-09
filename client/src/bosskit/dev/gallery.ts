/** Galeria de desenvolvimento: desenha bosses em vários estados (para conferir a arte). */
import type { BossSpec } from '@gymbattle/shared';
import { bodyFor } from '../bodies';
import type { DrawState } from '../types';
import { FX } from '../fx';

declare global {
  interface Window {
    renderGallery: (specs: BossSpec[], opts: { cell: number; mode: string }) => void;
  }
}

window.renderGallery = (specs, opts) => {
  const cell = opts.cell;
  const states: { label: string; st: Partial<DrawState>; atk?: number }[] = [];
  if (opts.mode === 'mini') {
    states.push({ label: 'idle', st: { anim: 'idle', p: 0 } });
    states.push({ label: 'breath', st: { anim: 'attack', p: 0.5, pose: 'breath' } });
    states.push({ label: 'slam', st: { anim: 'attack', p: 0.5, pose: 'slam' } });
    states.push({ label: 'death', st: { anim: 'death', p: 0.6 } });
  }
  // animação: 8 quadros em sequência (para conferir fluidez)
  if (opts.mode === 'walk') {
    for (let i = 0; i < 8; i++) states.push({ label: `walk ${i}/8`, st: { anim: 'idle', p: 0, move: 1, gait: i / 8, vx: -90, t: 0.4 + i * 0.1 } });
  }
  if (opts.mode === 'back') {
    for (let i = 0; i < 8; i++) states.push({ label: `recua ${i}/8`, st: { anim: 'idle', p: 0, move: 0.7, gait: i / 8, vx: 60, t: 0.4 + i * 0.1 } });
  }
  if (opts.mode === 'idle') {
    for (let i = 0; i < 8; i++) states.push({ label: `idle t=${(i * 0.35).toFixed(2)}`, st: { anim: 'idle', p: 0, t: i * 0.35 } });
  }
  if (opts.mode === 'hurt') {
    for (let i = 0; i < 4; i++) states.push({ label: `hurt ${i}`, st: { anim: 'idle', p: 0, hurt: 1 - i / 4, t: i * 0.1 } });
    for (let i = 0; i < 4; i++) states.push({ label: `enter-roar ${i}`, st: { anim: 'attack', pose: 'roar', p: 0.2 + i * 0.2, t: 3 + i * 0.4 } });
  }
  if (opts.mode === 'death') {
    for (let i = 0; i < 8; i++) states.push({ label: `death ${(i / 7).toFixed(2)}`, st: { anim: 'death', p: i / 7, t: 10 + i * 0.37 } });
  }
  if (opts.mode.startsWith('atk:')) {
    const pose = opts.mode.slice(4) as DrawState['pose'];
    const ps = [0.05, 0.2, 0.35, 0.45, 0.52, 0.58, 0.72, 0.9];
    ps.forEach((p) => states.push({ label: `${pose} ${p}`, st: { anim: 'attack', pose, p, t: 5 + p * 2 } }));
  }
  if (opts.mode === 'body') {
    states.push({ label: 'idle', st: { anim: 'idle', p: 0 } });
    states.push({ label: 'idle t=1.7', st: { anim: 'idle', p: 0, t: 1.7 } });
    for (const pose of ['breath', 'slam', 'cast', 'swipe', 'charge', 'roar', 'shoot'] as const) {
      states.push({ label: `${pose} 0.3`, st: { anim: 'attack', p: 0.3, pose } });
      states.push({ label: `${pose} 0.5`, st: { anim: 'attack', p: 0.5, pose } });
    }
    states.push({ label: 'hurt', st: { anim: 'hurt', p: 0.5, hurt: 1 } });
    states.push({ label: 'death 0.6', st: { anim: 'death', p: 0.6 } });
  }
  const cols = opts.mode !== 'fx' ? states.length : 6;
  if (!states.length && opts.mode !== 'fx') throw new Error('modo desconhecido: ' + opts.mode);
  const rows = opts.mode !== 'fx' ? specs.length : specs.reduce((n, s) => n + s.attacks.length, 0);
  const c = document.createElement('canvas');
  c.width = cols * cell;
  c.height = rows * cell;
  document.body.appendChild(c);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, c.width, c.height);
  let row = 0;
  for (const s of specs) {
    if (opts.mode !== 'fx') {
      states.forEach((sd, col) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(col * cell, row * cell, cell, cell);
        ctx.clip();
        ctx.fillStyle = s.bg.sky[1];
        ctx.fillRect(col * cell, row * cell, cell, cell);
        ctx.translate(col * cell + cell * 0.55, row * cell + cell * 0.88);
        const k = (cell / 640) * s.size;
        ctx.scale(k, k);
        const st: DrawState = { t: 0.4, anim: 'idle', p: 0, pose: 'roar', hurt: 0, rage: 0.3, move: 0, gait: 0, vx: 0, vy: 0, ...sd.st } as DrawState;
        try {
          const a = bodyFor(s.arch)(ctx, s, st);
          // âncoras
          for (const [nm, v, col2] of [['m', a.mouth, '#0f0'], ['h', a.hand, '#0ff'], ['c', a.core, '#f0f']] as const) {
            ctx.fillStyle = col2;
            ctx.fillRect(v.x - 4, v.y - 4, 8, 8);
            void nm;
          }
        } catch (e) {
          ctx.fillStyle = 'red';
          ctx.font = '40px sans-serif';
          ctx.fillText(String(e).slice(0, 40), -200, -100);
        }
        ctx.restore();
        ctx.fillStyle = '#fff';
        ctx.font = '12px sans-serif';
        ctx.fillText(`${s.id} ${sd.label}`, col * cell + 4, row * cell + 14);
      });
      row++;
    } else {
      for (const atk of s.attacks) {
        for (let col = 0; col < cols; col++) {
          const p = [0.15, 0.35, 0.5, 0.58, 0.7, 0.9][col];
          ctx.save();
          ctx.beginPath();
          ctx.rect(col * cell, row * cell, cell, cell);
          ctx.clip();
          ctx.fillStyle = s.bg.sky[1];
          ctx.fillRect(col * cell, row * cell, cell, cell);
          ctx.translate(col * cell, row * cell);
          ctx.scale(cell / 1000, cell / 1000);
          // mundo 1000 x 1000 (chão em 800)
          ctx.fillStyle = s.bg.ground;
          ctx.fillRect(0, 800, 1000, 200);
          const targets = [{ x: 150, y: 755 }, { x: 260, y: 755 }, { x: 370, y: 755 }];
          for (const t of targets) {
            ctx.fillStyle = '#ddd';
            ctx.fillRect(t.x - 12, t.y - 45, 24, 90);
          }
          ctx.fillStyle = s.pal.body;
          ctx.beginPath();
          ctx.ellipse(780, 650, 120, 150, 0, 0, Math.PI * 2);
          ctx.fill();
          try {
            const sh = FX[atk.fx](ctx, { atk, p, t: p * atk.dur, from: { x: 640, y: 560 }, hand: { x: 660, y: 720 }, core: { x: 780, y: 650 }, targets, ground: 800, W: 1000, seed: 7, size: s.size });
            ctx.fillStyle = '#fff';
            ctx.font = '30px sans-serif';
            ctx.fillText(`shake ${sh.toFixed(2)}`, 20, 980);
          } catch (e) {
            ctx.fillStyle = 'red';
            ctx.font = '30px sans-serif';
            ctx.fillText(String(e).slice(0, 50), 20, 500);
          }
          ctx.restore();
          ctx.fillStyle = '#fff';
          ctx.font = '12px sans-serif';
          ctx.fillText(`${atk.fx} (${atk.name}) p=${p}`, col * cell + 4, row * cell + 14);
        }
        row++;
      }
    }
  }
};
