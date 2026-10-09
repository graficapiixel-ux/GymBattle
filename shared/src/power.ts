import { BALANCE } from './balance.js';
import { WEAPONS_BY_ID } from './items/index.js';
import { weaponPower } from './items/equipment.js';
import { derivedStats, type Attributes } from './progression.js';

/**
 * Força de combate de uma conta, calculada com as MESMAS fórmulas da luta:
 * vida total × dano da arma equipada (com os atributos da pessoa) × velocidade.
 * Isso já inclui nível, atributos upados, se eles combinam com a arma e a raridade dela.
 */
export function combatStrength(attrs: Attributes, weaponId: string | null | undefined): number {
  const w = WEAPONS_BY_ID[weaponId ?? ''] ?? WEAPONS_BY_ID['espada-curta-recruta'];
  const p = weaponPower(w, attrs);
  const hp = derivedStats(attrs).maxHp;
  return Math.max(1, hp * p.damage * p.speed);
}

/** Poder em escala de rating (diferença de 400 = ~91% de chance para o mais forte). */
export function powerRating(attrs: Attributes, weaponId: string | null | undefined): number {
  return Math.round(BALANCE.ranking.powerScale * Math.log10(combatStrength(attrs, weaponId)));
}

/** Chance (0–1) de A vencer B pela diferença de rating (fórmula do xadrez). */
export const eloChance = (ra: number, rb: number) => 1 / (1 + Math.pow(10, (rb - ra) / 400));

/** Chance de A vencer: 70% pelo poder de combate, 30% pela diferença de PR. */
export function winChance(a: { power: number; pr: number }, b: { power: number; pr: number }): number {
  const w = BALANCE.ranking.powerWeight;
  return w * eloChance(a.power, b.power) + (1 - w) * eloChance(a.pr, b.pr);
}
