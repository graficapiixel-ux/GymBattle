import { BALANCE } from '../balance.js';
import { ATTRIBUTES, effectiveAttr, type AttributeKey, type Attributes } from '../progression.js';
import type { ArmorSetDef, ArmorSlot, AttackDef, Grade, WeaponCategory, WeaponDef } from './types.js';

export interface Equipment {
  weapon: string | null;
  helm: string | null;
  chest: string | null;
  gloves: string | null;
  legs: string | null;
}

export const EMPTY_EQUIPMENT: Equipment = { weapon: null, helm: null, chest: null, gloves: null, legs: null };

export type EquipSlot = 'weapon' | ArmorSlot;

/** Requisitos que faltam para usar a arma sem penalidade. */
export function missingRequirements(w: WeaponDef, attrs: Attributes): { attr: AttributeKey; need: number; have: number }[] {
  // armas iniciais seguem a mesma regra das outras: sem o atributo da arma, o potencial cai
  // (antes eram isentas, e a Espada do Recruta rendia 100% até em builds de Fé ou Inteligência)
  return (Object.entries(w.requirements) as [AttributeKey, number][])
    .filter(([k, need]) => attrs[k] < need)
    .map(([k, need]) => ({ attr: k, need, have: attrs[k] }));
}

/**
 * Poder de ataque da arma para esses atributos:
 * base × (1 + Σ escalonamento × (atributo efetivo − 5) / 50).
 * Sem os requisitos: dano bem menor e ataques mais lentos (estilo Dark Souls).
 */
export function weaponPower(w: WeaponDef, attrs: Attributes) {
  const sc = BALANCE.attributes.scaling;
  let bonus = 0;
  for (const [k, g] of Object.entries(w.scaling) as [AttributeKey, Grade][]) {
    bonus += (sc[g] ?? 0) * Math.max(0, effectiveAttr(attrs[k]) - BALANCE.attributes.start) / 50;
  }
  const unmet = missingRequirements(w, attrs).length > 0;
  const damage = w.baseDamage * (1 + bonus) * (unmet ? BALANCE.attributes.unmetRequirementDamageMult : 1);
  const speed = w.speed * (unmet ? BALANCE.attributes.unmetRequirementSpeedMult : 1) * (1 + Math.max(0, effectiveAttr(attrs.dex) - 5) * BALANCE.combat.attackSpeedPerDex);
  return { damage: Math.round(damage), bonus, speed: +speed.toFixed(2), unmet };
}

export const attrsFrom = (o: Record<AttributeKey, number>): Attributes =>
  Object.fromEntries(ATTRIBUTES.map((k) => [k, o[k]])) as Attributes;

/** A arma já aparece na loja? (qualquer atributo exigido perto do requisito) */
export function isWeaponRevealed(w: WeaponDef, attrs: Attributes): boolean {
  if (w.starter) return true;
  const m = BALANCE.shop.revealMargin;
  return (Object.entries(w.requirements) as [AttributeKey, number][]).some(([k, need]) => attrs[k] >= need - m);
}

/** A armadura já aparece na loja? (por nível) */
export function isArmorRevealed(a: ArmorSetDef, level: number): boolean {
  return level >= (BALANCE.shop.armorRevealLevel[a.rarity] ?? 1);
}

/** Forma usada para desenhar a arma (híbridas usam a forma do tipo base). */
export function weaponShapeOf(w: WeaponDef | undefined): WeaponCategory | 'fist' {
  if (!w) return 'fist';
  if (w.category !== 'hybrid') return w.category;
  if (w.id.includes('martelo')) return 'hammer';
  if (w.id.includes('lanca')) return 'spear';
  if (w.id.includes('katana')) return 'katana';
  if (w.id.includes('foice')) return 'scythe';
  return 'sword';
}

/**
 * Até onde a ponta da arma chega no desenho durante o golpe (medido no
 * esqueleto do avatar). O golpe corpo a corpo acerta até aqui, para que
 * "a lâmina passou pelo inimigo" sempre signifique dano.
 */
export const VISUAL_REACH: Record<string, number> = {
  sword: 82, greatsword: 107, katana: 95, dagger: 59, axe: 85, hammer: 87, spear: 134, scythe: 109, fist: 40, bow: 60, staff: 90, seal: 50,
};

/** Alcance real de um golpe corpo a corpo (o maior entre o da ficha e o do desenho). */
export function meleeReach(w: WeaponDef, def: AttackDef): number {
  if (def.kind !== 'melee' && def.kind !== 'combo') return def.range;
  return Math.max(def.range, (VISUAL_REACH[weaponShapeOf(w)] ?? def.range) - 4);
}
