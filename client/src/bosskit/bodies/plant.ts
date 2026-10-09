/**
 * PLANTAS (feat.kind): 0 = carvalho ancião (treant que anda sobre pernas-raiz), 1 = flor carnívora gigante
 * (bulbo que se arrasta com raízes-tentáculo), 2 = rei cogumelo (passinhos saltitantes, chapéu gelatinoso),
 * 3 = cerejeira que sangra (tronco em S sobre pernas-raiz, pétalas e seiva).
 * Origem no chão, olhando para a esquerda. Cada planta mora no seu arquivo plant-*.ts.
 */
import type { BossSpec } from '@gymbattle/shared';
import type { Anchors, DrawState } from '../types';
import { makeC } from './plant-kit';
import { treant } from './plant-treant';
import { rafflesia } from './plant-flower';
import { myconid } from './plant-shroom';
import { sakura } from './plant-sakura';

export function drawPlant(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState): Anchors {
  const kind = s.feat.kind ?? 0;
  const c = makeC(ctx, s, st);
  ctx.save();
  let a: Anchors;
  if (kind === 1) a = rafflesia(ctx, s, st, c);
  else if (kind === 2) a = myconid(ctx, s, st, c);
  else if (kind === 3) a = sakura(ctx, s, st, c);
  else a = treant(ctx, s, st, c);
  ctx.restore();
  return a;
}
