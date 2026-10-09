import type { MapDef } from '@gymbattle/shared';
import { rnd } from './vfx';
import { shade } from '../rig';

/**
 * Cenário de cada mapa: céu, silhuetas em paralaxe, partículas ambientes
 * (poeira, brasas, folhas, luzes) e plataformas. Tudo determinístico.
 */
export function drawBackground(
  ctx: CanvasRenderingContext2D, map: MapDef, view: { w: number; h: number }, cam: { x: number; y: number; zoom: number }, time: number, low: boolean,
) {
  const th = map.theme;
  // céu (tela inteira)
  const g = ctx.createLinearGradient(0, 0, 0, view.h);
  g.addColorStop(0, th.skyTop);
  g.addColorStop(1, th.skyBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, view.w, view.h);

  // elemento no céu (lua/sol/brilho do vulcão)
  const sky = { x: view.w * 0.78 - cam.x * 0.02, y: view.h * 0.2 };
  const glow = ctx.createRadialGradient(sky.x, sky.y, 0, sky.x, sky.y, view.h * 0.5);
  glow.addColorStop(0, th.accent + '55');
  glow.addColorStop(1, th.accent + '00');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.fillStyle = th.accent + (map.id === 'vulcao' ? '00' : '99');
  ctx.beginPath();
  ctx.arc(sky.x, sky.y, Math.min(view.w, view.h) * 0.05, 0, Math.PI * 2);
  ctx.fill();

  // camadas em paralaxe (em coordenadas do mundo, com fator)
  layer(ctx, map, view, cam, 0.25, th.far, 1, low);
  if (!low) layer(ctx, map, view, cam, 0.5, th.near, 2, low);

  // partículas ambientes
  const n = low ? 14 : 36;
  for (let i = 0; i < n; i++) {
    const sp = 0.3 + rnd(map.width, i) * 0.7;
    let x = rnd(7, i) * view.w;
    let y = rnd(11, i) * view.h;
    let r = 1.5;
    switch (th.ambient) {
      case 'embers':
        y = view.h - ((time * 60 * sp + rnd(3, i) * view.h) % (view.h + 20));
        x += Math.sin(time * 1.5 + i) * 12;
        ctx.fillStyle = i % 3 ? '#ff7a2f' : '#ffd24a';
        r = 1.5 + sp;
        break;
      case 'leaves':
        y = ((time * 40 * sp + rnd(3, i) * view.h) % (view.h + 20)) - 10;
        x = (x + time * 30 * sp) % view.w;
        ctx.fillStyle = i % 2 ? '#f0c060' : '#d88a3a';
        r = 2.2;
        break;
      case 'motes':
        y += Math.sin(time * 0.8 + i) * 10;
        x += Math.cos(time * 0.5 + i) * 10;
        ctx.fillStyle = '#b8d0ff';
        r = 1.2 + sp;
        break;
      default:
        y += Math.sin(time * 0.6 + i) * 8;
        x = (x + time * 8 * sp) % view.w;
        ctx.fillStyle = '#e8d0a0';
        r = 1 + sp;
    }
    ctx.globalAlpha = 0.25 + 0.4 * sp;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function layer(ctx: CanvasRenderingContext2D, map: MapDef, view: { w: number; h: number }, cam: { x: number; y: number; zoom: number }, f: number, color: string, seed: number, _low: boolean) {
  const z = 1 + (cam.zoom - 1) * f * 0.5;
  const ox = view.w / 2 - (cam.x - map.width / 2) * f * cam.zoom;
  const baseY = view.h * (0.62 + 0.12 * f) - (cam.y - map.height / 2) * f * cam.zoom * 0.5;
  ctx.fillStyle = color;
  ctx.beginPath();
  const W = view.w * 2.4;
  const start = ox - W / 2;
  ctx.moveTo(start, view.h);
  const steps = 26;
  for (let i = 0; i <= steps; i++) {
    const x = start + (W * i) / steps;
    let h: number;
    switch (map.id) {
      case 'castelo': {
        // ameias e torres
        const tower = rnd(seed * 31, i) > 0.72;
        h = tower ? 170 + rnd(seed, i) * 90 : 70 + rnd(seed * 3, i) * 30;
        ctx.lineTo(x, baseY - h * z);
        ctx.lineTo(x + (W / steps) * (tower ? 0.5 : 0.25), baseY - h * z);
        if (!tower) {
          ctx.lineTo(x + (W / steps) * 0.25, baseY - (h - 16) * z);
          ctx.lineTo(x + (W / steps) * 0.5, baseY - (h - 16) * z);
          ctx.lineTo(x + (W / steps) * 0.5, baseY - h * z);
        }
        continue;
      }
      case 'templo': {
        // colunas
        h = i % 3 === 0 ? 200 : 110 + rnd(seed, i) * 20;
        ctx.lineTo(x, baseY - h * z);
        ctx.lineTo(x + (W / steps) * (i % 3 === 0 ? 0.3 : 1), baseY - h * z);
        continue;
      }
      case 'vulcao': {
        const d = Math.abs(i - steps / 2) / (steps / 2);
        h = seed === 1 ? 320 * (1 - d) ** 1.4 + 40 : 90 + rnd(seed, i) * 60;
        break;
      }
      default:
        h = 90 + rnd(seed, i) * 110;
    }
    ctx.lineTo(x, baseY - h * z);
  }
  ctx.lineTo(start + W, view.h);
  ctx.closePath();
  ctx.fill();
  if (map.id === 'vulcao' && seed === 1) {
    // cratera brilhando
    const g = ctx.createRadialGradient(ox, baseY - 330 * z, 0, ox, baseY - 330 * z, 120 * z);
    g.addColorStop(0, '#ff7a2faa');
    g.addColorStop(1, '#ff7a2f00');
    ctx.fillStyle = g;
    ctx.fillRect(ox - 150 * z, baseY - 460 * z, 300 * z, 260 * z);
  }
}

/** Plataformas em coordenadas do mundo (o contexto já está transformado pela câmera). */
export function drawPlatforms(ctx: CanvasRenderingContext2D, map: MapDef, time: number) {
  const th = map.theme;
  for (const p of map.platforms) {
    if (p.thin) {
      // prancha fina com suportes
      ctx.fillStyle = shade(th.platform, 0.8);
      ctx.fillRect(p.x + 14, p.y + 6, 6, 20);
      ctx.fillRect(p.x + p.w - 20, p.y + 6, 6, 20);
      ctx.fillStyle = th.platform;
      roundRect(ctx, p.x, p.y, p.w, 10, 4);
      ctx.fillStyle = th.platformTop;
      ctx.fillRect(p.x + 2, p.y, p.w - 4, 3);
    } else {
      const depth = p.w > 400 ? 260 : 70;
      const g = ctx.createLinearGradient(0, p.y, 0, p.y + depth);
      g.addColorStop(0, th.platform);
      g.addColorStop(1, shade(th.platform, 0.45));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.w, p.y);
      ctx.lineTo(p.x + p.w - 30, p.y + depth);
      ctx.lineTo(p.x + 30, p.y + depth);
      ctx.closePath();
      ctx.fill();
      // blocos
      ctx.strokeStyle = shade(th.platform, 0.7);
      ctx.lineWidth = 2;
      for (let y = p.y + 26; y < p.y + depth - 10; y += 26) {
        const inset = ((y - p.y) / depth) * 30;
        ctx.beginPath();
        ctx.moveTo(p.x + inset, y);
        ctx.lineTo(p.x + p.w - inset, y);
        ctx.stroke();
      }
      ctx.fillStyle = th.platformTop;
      ctx.fillRect(p.x, p.y - 2, p.w, 6);
      if (map.id === 'vulcao') {
        // lava pulsando nas bordas
        ctx.globalAlpha = 0.5 + Math.sin(time * 3) * 0.2;
        ctx.fillStyle = '#ff7a2f';
        ctx.fillRect(p.x, p.y + 4, p.w, 2);
        ctx.globalAlpha = 1;
      }
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}
