import type { BossArch } from '@gymbattle/shared';
import type { BodyDraw } from '../types';
import { drawDragon } from './dragon';
import { drawGolem } from './golem';
import { drawEye } from './eye';
import { drawUndead } from './undead';
import { drawElemental } from './elemental';
import { drawInsect } from './insect';
import { drawMachine } from './machine';
import { drawDeity } from './deity';
import { drawSerpent } from './serpent';
import { drawSpirit } from './spirit';
import { drawBlob } from './blob';
import { drawBeast } from './beast';
import { drawPlant } from './plant';
import { drawPlaceholder } from './placeholder';
import { drawDuelist } from './duelist';

/** Desenho do corpo por arquétipo. */
export const BODIES: Record<BossArch, BodyDraw> = {
  dragon: drawDragon, golem: drawGolem, eye: drawEye, undead: drawUndead, elemental: drawElemental, insect: drawInsect,
  machine: drawMachine, deity: drawDeity, serpent: drawSerpent, spirit: drawSpirit, blob: drawBlob, beast: drawBeast, plant: drawPlant,
  duelist: drawDuelist,
};

export function bodyFor(arch: BossArch): BodyDraw {
  return BODIES[arch] ?? drawPlaceholder;
}
