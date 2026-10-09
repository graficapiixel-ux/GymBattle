/**
 * MORTOS-VIVOS (feat.kind): 0 = Morgrath, rei lich (manto, coroa, cajado com orbe verde, mãos de osso);
 * 1 = Ossuário, gigante de ossos (costelas, crânios fundidos, órbitas vermelhas);
 * 2 = Lady Vesperine, noiva vampira (vestido, asas de morcego, cabelo longo, olhos vermelhos);
 * 3 = Cavaleiro Sem Cabeça de Grimhollow (cavalo negro, lança, fogo no lugar da cabeça).
 * Origem no chão, olhando para a esquerda; ~340 de altura em escala 1.
 * Cada boss mora no seu arquivo (undead-*.ts); as peças comuns ficam em undead-kit.ts.
 */
import type { BossSpec } from '@gymbattle/shared';
import type { Anchors, DrawState } from '../types';
import { attacking, breathe, dying, hurtTint, mixHex, poseK, strike, windup, clamp } from '../util';
import { type Pal, type Pose, impact } from './undead-kit';
import { lich } from './undead-lich';
import { boneGiant } from './undead-ossos';
import { vampire } from './undead-noiva';
import { rider } from './undead-cavaleiro';

export function drawUndead(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState): Anchors {
  const kind = clamp(Math.round(s.feat.kind ?? 0), 0, 3);
  const bone = kind === 1 ? s.pal.body : '#ddd5c2';
  const C: Pal = {
    body: hurtTint(ctx, st, s.pal.body),
    dark: hurtTint(ctx, st, s.pal.dark),
    accent: hurtTint(ctx, st, s.pal.accent),
    glow: s.pal.glow,
    eye: s.pal.eye,
    bone: hurtTint(ctx, st, bone),
    boneD: hurtTint(ctx, st, mixHex(bone, '#2a2418', 0.45)),
  };
  const wu = windup(st);
  const sk = strike(st);
  const P: Pose = {
    wu, sk, hold: clamp(wu + sk), atk: attacking(st), die: dying(st), b: breathe(st, 1.3),
    slam: poseK(st, 'slam'), swipe: poseK(st, 'swipe'), cast: poseK(st, 'cast'), shoot: poseK(st, 'breath', 'shoot'),
    charge: poseK(st, 'charge'), roar: poseK(st, 'roar'), imp: impact(st), p: st.anim === 'attack' ? st.p : 0,
  };
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  let a: Anchors;
  if (kind === 0) a = lich(ctx, s, st, C, P);
  else if (kind === 1) a = boneGiant(ctx, s, st, C, P);
  else if (kind === 2) a = vampire(ctx, s, st, C, P);
  else a = rider(ctx, s, st, C, P);
  ctx.restore();
  return a;
}
