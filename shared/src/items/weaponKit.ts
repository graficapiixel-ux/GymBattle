/**
 * Ferramentas para montar armas: dano por raridade, padrões por categoria
 * e a função `group`, usada pelo catálogo original e pelo arsenal novo.
 */
import type { AttributeKey } from '../progression.js';
import type {
  AttackDef, AttackKind, Element, Grade, Rarity, VfxKey, WeaponCategory, WeaponDef,
} from './types.js';
import { WEAPON_TUNING } from './tuning.js';

/** Dano base por raridade. */
export const RARITY_DAMAGE: Record<Rarity, number> = { common: 40, uncommon: 50, rare: 62, epic: 76, legendary: 92 };

/** Padrões por categoria: fator de dano, velocidade, alcance, custos e tempos de A1/A2. */
export const CATEGORY: Record<
  WeaponCategory,
  { dmg: number; speed: number; range: number; a1: [number, number]; a2: [number, number]; windup: [number, number]; recovery: [number, number]; kb: [number, number] }
> = {
  //            dano  vel   alcance  A1 [stam,mana]  A2 [stam,mana]  windup[a1,a2]  recovery[a1,a2]  knockback[a1,a2]
  sword:      { dmg: 1.0, speed: 1.0, range: 70, a1: [12, 0], a2: [22, 0], windup: [180, 320], recovery: [220, 380], kb: [6, 12] },
  greatsword: { dmg: 1.3, speed: 0.7, range: 95, a1: [22, 0], a2: [36, 0], windup: [380, 560], recovery: [420, 620], kb: [12, 20] },
  katana:     { dmg: 0.95, speed: 1.15, range: 80, a1: [12, 0], a2: [22, 6], windup: [150, 300], recovery: [200, 340], kb: [5, 11] },
  dagger:     { dmg: 0.75, speed: 1.5, range: 50, a1: [8, 0], a2: [16, 0], windup: [90, 220], recovery: [140, 260], kb: [3, 8] },
  axe:        { dmg: 1.15, speed: 0.85, range: 72, a1: [16, 0], a2: [28, 0], windup: [260, 420], recovery: [300, 460], kb: [9, 16] },
  hammer:     { dmg: 1.35, speed: 0.65, range: 78, a1: [24, 0], a2: [38, 0], windup: [420, 600], recovery: [460, 680], kb: [14, 24] },
  spear:      { dmg: 1.0, speed: 0.95, range: 110, a1: [14, 0], a2: [24, 0], windup: [200, 340], recovery: [240, 400], kb: [7, 14] },
  scythe:     { dmg: 1.1, speed: 0.85, range: 100, a1: [16, 0], a2: [26, 8], windup: [260, 400], recovery: [300, 440], kb: [8, 14] },
  bow:        { dmg: 0.9, speed: 1.0, range: 420, a1: [10, 0], a2: [22, 0], windup: [260, 480], recovery: [260, 420], kb: [4, 10] },
  staff:      { dmg: 0.95, speed: 1.0, range: 380, a1: [2, 10], a2: [4, 32], windup: [260, 520], recovery: [280, 480], kb: [4, 12] },
  seal:       { dmg: 0.95, speed: 1.0, range: 380, a1: [0, 12], a2: [0, 34], windup: [280, 540], recovery: [280, 500], kb: [5, 12] },
  hybrid:     { dmg: 1.1, speed: 1.1, range: 90, a1: [14, 4], a2: [24, 18], windup: [170, 360], recovery: [220, 400], kb: [7, 15] },
};

export type AtkIn = [name: string, desc: string, kind: AttackKind, vfx: VfxKey, extra?: Partial<AttackDef>];

function attack(cat: WeaponCategory, slot: 1 | 2, element: Element, [name, desc, kind, vfx, extra]: AtkIn): AttackDef {
  const c = CATEGORY[cat];
  const i = slot - 1;
  const [stamina, mana] = slot === 1 ? c.a1 : c.a2;
  return {
    name, desc, kind, vfx, element,
    power: slot === 1 ? 1 : 1.8,
    hits: 1,
    stamina, mana,
    range: kind === 'projectile' || kind === 'area' ? Math.max(c.range, 300) : c.range,
    windup: c.windup[i],
    recovery: c.recovery[i],
    knockback: c.kb[i],
    ...extra,
  };
}

export interface WIn {
  id: string; name: string; rarity: Rarity; price: number;
  req: Partial<Record<AttributeKey, number>>;
  scale: Partial<Record<AttributeKey, Grade>>;
  el?: Element; lore: string;
  a1: AtkIn; a2: AtkIn;
  look: WeaponDef['look'];
  starter?: boolean; dmg?: number; speed?: number;
}

export function group(category: WeaponCategory, items: WIn[]): WeaponDef[] {
  const c = CATEGORY[category];
  return items.map((w) => {
    const element = w.el ?? 'physical';
    return {
      id: w.id, name: w.name, lore: w.lore, category, rarity: w.rarity, price: w.price,
      requirements: w.req, scaling: w.scale, element,
      // WEAPON_TUNING: ajuste fino de cada arma, calculado com milhares de lutas simuladas
      baseDamage: Math.round(RARITY_DAMAGE[w.rarity] * c.dmg * (w.dmg ?? 1) * (WEAPON_TUNING[w.id] ?? 1)),
      speed: +(c.speed * (w.speed ?? 1)).toFixed(2),
      a1: attack(category, 1, element, w.a1),
      a2: attack(category, 2, element, w.a2),
      starter: w.starter,
      look: w.look,
    };
  });
}

