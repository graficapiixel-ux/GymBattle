/**
 * BIZARROS (feat.kind): 0 = massa de gosma faminta (7 olhos), 1 = massa de carne com bocas,
 * 2 = ovo cósmico rachado (olho na fresta), 3 = boneco de pano remendado com tesoura.
 * Origem no chão, olhando para a esquerda. Cada um mora no seu arquivo `blob-*.ts`;
 * a locomoção e a gelatina compartilhadas estão em `blob-kit.ts`.
 */
import type { BossSpec } from '@gymbattle/shared';
import type { Anchors, DrawState } from '../types';
import { makeC } from './blob-kit';
import { slime } from './blob-slime';
import { mouths } from './blob-mouths';
import { cosmicEgg } from './blob-egg';
import { ragdoll } from './blob-doll';

export function drawBlob(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState): Anchors {
  const kind = s.feat.kind ?? 0;
  const c = makeC(ctx, s, st);
  ctx.save();
  let a: Anchors;
  if (kind === 1) a = mouths(ctx, s, st, c);
  else if (kind === 2) a = cosmicEgg(ctx, s, st, c);
  else if (kind === 3) a = ragdoll(ctx, s, st, c);
  else a = slime(ctx, s, st, c);
  ctx.restore();
  return a;
}
