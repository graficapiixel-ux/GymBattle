/**
 * INSETOS (feat.kind): 0 = louva-a-deus rainha (Thessa), 1 = escorpião rei (Azhrak),
 * 2 = aranha tecelã da noite (Aracnara), 3 = escaravelho titã (Khepros).
 * Origem no chão, olhando para a esquerda; ~400 de largura x ~330 de altura em escala 1.
 *
 * Cada inseto mora no seu arquivo (insect-*.ts) e usa o esqueleto comum de insect-rig.ts:
 * marcha em tripé/tetrápode com pés plantados (passos guiados por st.gait), pernas por
 * cinemática inversa, golpes com antecipação → golpe → impacto → volta, dano e morte.
 */
import type { BossSpec } from '@gymbattle/shared';
import type { Anchors, DrawState } from '../types';
import { mantis } from './insect-mantis';
import { scarab } from './insect-scarab';
import { scorpion } from './insect-scorpion';
import { spider } from './insect-spider';

/** Escala própria da louva-a-deus (mais alta e esguia). */
const MANTIS_K = 1.12;

export function drawInsect(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState): Anchors {
  const kind = s.feat.kind ?? 0;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (kind === 0) ctx.scale(MANTIS_K, MANTIS_K);
  const a = kind === 1 ? scorpion(ctx, s, st) : kind === 2 ? spider(ctx, s, st) : kind === 3 ? scarab(ctx, s, st) : mantis(ctx, s, st);
  ctx.restore();
  return a;
}
