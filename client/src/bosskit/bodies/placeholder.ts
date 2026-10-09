import type { BodyDraw } from '../types';
import { breathe, eyeGlow, hurtTint, TAU } from '../util';

/** Corpo provisório (só enquanto um arquétipo não tem desenho próprio). */
export const drawPlaceholder: BodyDraw = (ctx, s, st) => {
  const b = breathe(st);
  ctx.fillStyle = hurtTint(ctx, st, s.pal.body);
  ctx.beginPath();
  ctx.ellipse(0, -120 + b * 4, 90, 120, 0, 0, TAU);
  ctx.fill();
  eyeGlow(ctx, -40, -170, 10, s.pal.eye);
  return { mouth: { x: -70, y: -160 }, hand: { x: -80, y: -60 }, core: { x: 0, y: -120 }, top: -240, halfW: 90 };
};
