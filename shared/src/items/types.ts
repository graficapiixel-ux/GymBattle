import type { AttributeKey } from '../progression.js';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';
export type Element = 'physical' | 'fire' | 'ice' | 'lightning' | 'shadow' | 'holy' | 'poison' | 'blood' | 'arcane';

export type WeaponCategory =
  | 'sword' | 'greatsword' | 'katana' | 'dagger' | 'axe' | 'hammer'
  | 'spear' | 'scythe' | 'bow' | 'staff' | 'seal' | 'hybrid';

/** Formas de ataque que a simulação de luta entende. */
export type AttackKind =
  | 'melee'      // golpe corpo a corpo
  | 'combo'      // vários golpes rápidos
  | 'dash'       // avança e golpeia
  | 'projectile' // dispara algo
  | 'area'       // explosão/área ao redor ou no alvo
  | 'leap'       // salta e cai sobre o alvo
  | 'pull'       // puxa o inimigo
  | 'heal';      // recupera vida

export type StatusEffect = 'poison' | 'freeze' | 'burn' | 'bleed' | 'shock' | 'launch';

/** Efeitos visuais conhecidos pelo renderizador (mesmo módulo em servidor e cliente). */
export type VfxKey =
  | 'slash' | 'heavy_slash' | 'thrust' | 'multi_slash' | 'spin' | 'whirlwind' | 'crescent'
  | 'shockwave' | 'quake' | 'leap_slam' | 'uppercut'
  | 'dagger_throw' | 'arrow' | 'arrow_rain' | 'piercing_arrow'
  | 'ice_shard' | 'ice_prison' | 'fireball' | 'meteor' | 'flame_wave'
  | 'lightning_spear' | 'lightning_storm' | 'shadow_orb' | 'shadow_spin' | 'chain_pull'
  | 'holy_beam' | 'holy_nova' | 'heal' | 'poison_cloud' | 'blood_slash' | 'black_flame' | 'arcane_missiles';

export interface AttackDef {
  name: string;
  desc: string;
  kind: AttackKind;
  /** Multiplicador sobre o dano base da arma (soma de todos os golpes). */
  power: number;
  hits: number;
  stamina: number;
  mana: number;
  /** Alcance em unidades do mundo. */
  range: number;
  /** Tempo de preparação e recuperação (ms). */
  windup: number;
  recovery: number;
  knockback: number;
  status?: { type: StatusEffect; chance: number; duration: number };
  vfx: VfxKey;
  element: Element;
  /** Tremor de tela (0–1). */
  shake?: number;
  /** Fração do dano causado que volta como vida. */
  lifesteal?: number;
}

export interface WeaponDef {
  id: string;
  name: string;
  lore: string;
  category: WeaponCategory;
  rarity: Rarity;
  price: number;
  requirements: Partial<Record<AttributeKey, number>>;
  scaling: Partial<Record<AttributeKey, Grade>>;
  element: Element;
  baseDamage: number;
  /** Multiplicador de velocidade (1 = normal). */
  speed: number;
  a1: AttackDef;
  a2: AttackDef;
  starter?: boolean;
  /** Cores para desenhar a arma. */
  look: { blade: string; handle: string; glow?: string };
}

export type ArmorSlot = 'helm' | 'chest' | 'gloves' | 'legs';

export interface ArmorSetDef {
  id: string;
  name: string;
  lore: string;
  rarity: Rarity;
  /** Preço do conjunto completo SEM desconto (soma das peças). */
  price: number;
  style: {
    helm: 'hood' | 'helm_closed' | 'helm_open' | 'kabuto' | 'crown' | 'horns' | 'mask' | 'wizard_hat' | 'bandana' | 'skull' | 'tricorn' | 'circlet' | 'dragon' | 'none';
    chest: 'tunic' | 'plate' | 'robe' | 'gi' | 'vest' | 'scale' | 'coat';
    gloves: 'wraps' | 'gauntlet' | 'glove';
    legs: 'pants' | 'plate' | 'hakama' | 'robe_skirt' | 'shorts';
    primary: string;
    secondary: string;
    accent: string;
    trim?: string;
    /** Efeitos animados (lendários). */
    fx?: { cape?: string; glow?: string; particles?: Element };
  };
}

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Comum',
  uncommon: 'Incomum',
  rare: 'Raro',
  epic: 'Épico',
  legendary: 'Lendário',
};

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#a1a1aa',
  uncommon: '#3ddc97',
  rare: '#4aa8ff',
  epic: '#b57cff',
  legendary: '#f5b544',
};

export const CATEGORY_LABEL: Record<WeaponCategory, string> = {
  sword: 'Espada reta',
  greatsword: 'Espada grande',
  katana: 'Katana / curva',
  dagger: 'Adagas',
  axe: 'Machado',
  hammer: 'Martelo / maça',
  spear: 'Lança / alabarda',
  scythe: 'Foice',
  bow: 'Arco / besta',
  staff: 'Cajado',
  seal: 'Selo / talismã',
  hybrid: 'Híbrida lendária',
};

export const ELEMENT_COLOR: Record<Element, string> = {
  physical: '#e4e4e7',
  fire: '#ff7a2f',
  ice: '#7fd6ff',
  lightning: '#ffe24a',
  shadow: '#8b5cf6',
  holy: '#ffd86b',
  poison: '#7ddc3d',
  blood: '#e0243b',
  arcane: '#5b8cff',
};

export const ELEMENT_LABEL: Record<Element, string> = {
  physical: 'Físico',
  fire: 'Fogo',
  ice: 'Gelo',
  lightning: 'Raio',
  shadow: 'Sombra',
  holy: 'Sagrado',
  poison: 'Veneno',
  blood: 'Sangue',
  arcane: 'Arcano',
};
