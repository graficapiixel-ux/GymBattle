/** Duelista no retrato: o próprio boneco do jogador, grande, com aura e lâminas flutuando. */
import type { BodyDraw } from '../types';
import { P } from '../../game/arena/legend/kit';
import { drawAvatar, idlePose, weaponShape } from '../../game/rig';
import { WEAPONS_BY_ID } from '@gymbattle/shared';
import { TAU, h01, rgrad, sm } from '../util';
import { lightBlade } from '../../game/arena/legend/kit';

export const drawDuelist: BodyDraw = (ctx, s, st) => {
  const av = s.avatar;
  const S = 2.6;
  const t = st.t;
  // aura
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgrad(ctx, 0, -140, 230, s.pal.glow + '66', 'transparent');
  ctx.fillRect(-260, -380, 520, 400);
  for (let i = 0; i < 22; i++) {
    const ph = (t * (0.4 + h01(i, 2) * 0.5) + h01(i, 3)) % 1;
    ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.8;
    ctx.fillStyle = i % 3 ? s.pal.glow : s.pal.accent;
    ctx.beginPath();
    ctx.arc((h01(i, 4) - 0.5) * 200, -ph * 330, 2 + h01(i, 5) * 3, 0, TAU);
    ctx.fill();
  }
  // lâminas orbitando
  for (let i = 0; i < 6; i++) {
    const a = t * 0.8 + (i / 6) * TAU;
    const x = Math.cos(a) * 150;
    const y = -150 + Math.sin(a) * 40;
    ctx.globalAlpha = 0.55 + 0.35 * Math.sin(a);
    lightBlade(ctx, x, y, Math.PI + Math.sin(t + i) * 0.3, 60, 7, '#ffffff', i % 2 ? s.pal.accent : s.pal.glow, 1, false);
  }
  ctx.restore();
  if (!av) return { mouth: { x: -20, y: -230 }, hand: { x: -60, y: -140 }, core: { x: 0, y: -140 }, top: -300, halfW: 70 };
  const shape = weaponShape(av.equipment.weapon ? WEAPONS_BY_ID[av.equipment.weapon] : undefined);
  const atk = st.anim === 'attack' ? sm(0, 0.3, st.p) * (1 - sm(0.8, 1, st.p)) : 0;
  const pose = atk > 0.5 ? P.cast(0.3) : idlePose(shape, t);
  drawAvatar(ctx, { look: av.look, equipment: av.equipment, pose, facing: -1, time: t, scale: S });
  return { mouth: { x: -20, y: -230 }, hand: { x: -60, y: -140 }, core: { x: 0, y: -140 }, top: -300, halfW: 70 };
};
