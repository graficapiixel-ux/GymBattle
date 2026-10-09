/** Efeitos dos ataques dos bosses: cada BossFx tem animação própria. */
import type { BossFx } from '@gymbattle/shared';
import type { FxDraw } from './types';
import { slam, spikes, quake, wave, tail, tentacles, shadowHands, crystals, charge, claws } from './fx/ground';
import { breath, beam, gaze, scream, roar, gatling, missiles, orbs, drain } from './fx/ranged';
import { meteor, lightning, judgement, poison, vortex, nova, petals } from './fx/sky';
import { shards, web, acid, boulder, blades, minions } from './fx/thrown';

export const FX: Record<BossFx, FxDraw> = {
  breath, meteor, beam, slam, spikes, lightning, tentacles, claws, tail, poison, shards, vortex, minions, roar, charge,
  crystals, orbs, scream, web, acid, judgement, shadowHands, wave, boulder, drain, gatling, missiles, quake, petals, gaze, blades, nova,
  // o duelista desenha os próprios golpes (duelist/)
  duel: () => 0,
};
