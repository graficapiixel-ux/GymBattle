/**
 * EVENTO DE WAVES — catálogo (6 temas, monstros e mini-chefes) e montagem das waves.
 * Fica só no servidor: o jogador só vê o tema de um evento ativo.
 *
 * Os monstros usam os corpos animados dos bosses (em escala pequena, com cores
 * próprias). Os mini-chefes são humanos (desenhados como avatar), cada um com 6
 * golpes. A força de tudo é RELATIVA ao time que entra (vida e dano médios dos
 * jogadores), e cresce wave a wave.
 */
import type { AvatarLook, BossSpec, Element, FighterInput, StatusEffect, TeamArenaDef, TeamMove, VfxKey, WaveThemeAdmin, WaveThemePublic } from '@gymbattle/shared';
import { WEAPONS_BY_ID, derivedStats, mulberry32, weaponPower } from '@gymbattle/shared';
import { BOSSES_BY_ID } from '../bosses/catalog.js';
import type { TeamUnitInput } from './teamsim.js';

/** 10 waves + a do mini-chefe. */
export const WAVES_TOTAL = 11;

type Pose = NonNullable<TeamMove['pose']>;

function mv(
  name: string, kind: TeamMove['kind'], vfx: VfxKey, element: Element, o: Partial<TeamMove> & { pose?: Pose } = {},
): TeamMove {
  const ranged = kind === 'projectile' || kind === 'pull' || (kind === 'area' && (o.range ?? 0) >= 250);
  return {
    name, desc: '', kind, vfx, element,
    power: 1, hits: 1, stamina: 0, mana: 0,
    range: ranged ? 420 : 75,
    windup: ranged ? 420 : 300,
    recovery: ranged ? 420 : 380,
    knockback: 8,
    ...o,
  };
}
const st = (type: StatusEffect, chance: number, duration: number) => ({ type, chance, duration });

export interface MonsterDef {
  id: string;
  name: string;
  /** Corpo do kit (boss base) e escala do desenho. */
  base: string;
  scale: number;
  pal?: Partial<BossSpec['pal']>;
  hitbox: { w: number; h: number };
  role: 'melee' | 'ranged' | 'brute';
  /** "Peso" do monstro no orçamento da wave. */
  cost: number;
  /** Vida e dano relativos à média do time. */
  hp: number;
  dmg: number;
  atkSpeed?: number;
  runSpeed?: number;
  dodge?: number;
  moves: TeamMove[];
}

export interface ChiefDef {
  id: string;
  name: string;
  title: string;
  cls: string;
  look: AvatarLook;
  weapon: string;
  armor: string;
  aura: string;
  moves: TeamMove[];
}

export interface WaveTheme {
  id: string;
  name: string;
  desc: string;
  bg: TeamArenaDef['theme'];
  monsters: MonsterDef[];
  chief: ChiefDef;
  /** Tema "vizinho": às vezes aparecem monstros de lá misturados. */
  mix: string;
}

const look = (o: Partial<AvatarLook>): AvatarLook => ({
  skin: '#c68c5c', face: 0, hair: 1, hairColor: '#222222', beard: 0, body: 1, height: 1, gender: 0, eyes: '#333333', marks: 0, accessory: 0, top: '#222222', shorts: '#222222', ...o,
});

// golpes de monstro reaproveitados
const claw = (el: Element = 'physical', o: Partial<TeamMove> = {}) => mv('Garras', 'melee', el === 'physical' ? 'slash' : 'blood_slash', el, { pose: 'swipe', ...o });
const bite = (el: Element = 'physical', o: Partial<TeamMove> = {}) => mv('Mordida', 'combo', 'multi_slash', el, { pose: 'swipe', hits: 2, power: 1.1, ...o });
const slam = (el: Element = 'physical', o: Partial<TeamMove> = {}) => mv('Pancada', 'area', 'quake', el, { pose: 'slam', range: 130, power: 1.5, windup: 560, recovery: 560, knockback: 14, cooldown: 3200, shake: 0.4, ...o });
const charge = (el: Element = 'physical', o: Partial<TeamMove> = {}) => mv('Investida', 'dash', 'thrust', el, { pose: 'charge', range: 210, power: 1.3, windup: 420, cooldown: 4200, knockback: 12, ...o });
const pounce = (el: Element = 'physical', o: Partial<TeamMove> = {}) => mv('Bote', 'leap', 'leap_slam', el, { pose: 'charge', power: 1.4, windup: 300, cooldown: 4500, knockback: 12, ...o });
const shot = (vfx: VfxKey, el: Element, o: Partial<TeamMove> = {}) => mv('Disparo', 'projectile', vfx, el, { pose: 'shoot', power: 1, ...o });
const spell = (vfx: VfxKey, el: Element, o: Partial<TeamMove> = {}) => mv('Feitiço', 'area', vfx, el, { pose: 'cast', range: 460, power: 1.5, windup: 700, recovery: 600, cooldown: 5000, ...o });

export const THEMES: WaveTheme[] = [
  // --------------------------------------------------------------------------- 1
  {
    id: 'cripta', name: 'Cripta Esquecida', desc: 'Os mortos não descansam. E estão com fome.', mix: 'abismo',
    bg: { id: 'cripta', name: 'Cripta Esquecida', sky: ['#07060c', '#2a2440'], ground: '#2a2632', fog: '#7a6aa8', particle: '#b8a8ff' },
    monsters: [
      { id: 'esqueleto', name: 'Esqueleto Guerreiro', base: 'ossuario', scale: 0.26, hitbox: { w: 46, h: 110 }, role: 'melee', cost: 1, hp: 0.42, dmg: 0.5,
        moves: [claw('physical', { name: 'Espada Enferrujada', vfx: 'slash' }), charge('physical', { name: 'Avanço Ósseo' })] },
      { id: 'espectro', name: 'Espectro Uivante', base: 'lamuria', scale: 0.3, pal: { glow: '#9fe8ff' }, hitbox: { w: 44, h: 120 }, role: 'ranged', cost: 1, hp: 0.32, dmg: 0.45, runSpeed: 1, dodge: 0.15,
        moves: [shot('shadow_orb', 'shadow', { name: 'Lamento' }), spell('poison_cloud', 'shadow', { name: 'Névoa Fria', status: st('freeze', 0.25, 700) })] },
      { id: 'dama', name: 'Dama Pálida', base: 'vesperine', scale: 0.32, hitbox: { w: 44, h: 120 }, role: 'melee', cost: 1.2, hp: 0.4, dmg: 0.6, runSpeed: 1.15, dodge: 0.2,
        moves: [bite('blood', { name: 'Unhas de Sangue', vfx: 'blood_slash', lifesteal: 0.25 }), pounce('blood', { name: 'Salto Fúnebre' })] },
      { id: 'acolito', name: 'Acólito Lich', base: 'morgrath', scale: 0.27, hitbox: { w: 50, h: 120 }, role: 'ranged', cost: 1.4, hp: 0.38, dmg: 0.5,
        moves: [shot('arcane_missiles', 'arcane', { name: 'Mísseis Profanos', hits: 2 }), spell('lightning_storm', 'shadow', { name: 'Raio Tumular', hits: 2 })] },
    ],
    chief: {
      id: 'varek', name: 'Varek', title: 'o Coveiro', cls: 'Necromante',
      look: look({ skin: '#b8b0a8', hair: 4, hairColor: '#d8d8d8', beard: 2, eyes: '#9f7fff', marks: 1, top: '#2a2438', shorts: '#1a1622' }),
      weapon: 'foice-do-lich', armor: 'necromante', aura: '#9f7fff',
      moves: [
        mv('Ceifa Tripla', 'combo', 'multi_slash', 'shadow', { hits: 3, power: 1.3, range: 105, cooldown: 900 }),
        mv('Corrente da Cova', 'pull', 'chain_pull', 'shadow', { power: 1.1, range: 460, cooldown: 4200, knockback: 6 }),
        mv('Chuva de Ossos', 'projectile', 'dagger_throw', 'physical', { hits: 5, power: 2.2, range: 520, cooldown: 5200 }),
        mv('Lápide', 'leap', 'leap_slam', 'shadow', { power: 2.1, windup: 360, cooldown: 6000, knockback: 16, shake: 0.6 }),
        mv('Miasma', 'area', 'poison_cloud', 'poison', { range: 480, power: 1.8, hits: 2, cooldown: 7000, status: st('poison', 0.8, 4000) }),
        mv('Colheita Final', 'dash', 'black_flame', 'shadow', { power: 2.8, range: 320, windup: 620, cooldown: 9000, knockback: 18, shake: 0.8 }),
      ],
    },
  },
  // --------------------------------------------------------------------------- 2
  {
    id: 'floresta', name: 'Floresta Sombria', desc: 'Cada árvore tem olhos. Cada sombra, dentes.', mix: 'cripta',
    bg: { id: 'floresta', name: 'Floresta Sombria', sky: ['#020a04', '#16361c'], ground: '#1c2a16', fog: '#5ab04a', particle: '#c8ff7a' },
    monsters: [
      { id: 'lobo', name: 'Lobo Sombrio', base: 'fenrak', scale: 0.26, pal: { body: '#3a3a44', glow: '#9fff7a' }, hitbox: { w: 70, h: 80 }, role: 'melee', cost: 1, hp: 0.36, dmg: 0.5, runSpeed: 1.35, dodge: 0.18,
        moves: [bite('physical', { name: 'Mordida' }), pounce('physical', { name: 'Bote' })] },
      { id: 'cogumelo', name: 'Cogumelo Furioso', base: 'myconid', scale: 0.3, hitbox: { w: 56, h: 100 }, role: 'brute', cost: 1.3, hp: 0.7, dmg: 0.55, runSpeed: 0.75,
        moves: [claw('physical', { name: 'Cabeçada', vfx: 'heavy_slash' }), slam('poison', { name: 'Nuvem de Esporos', vfx: 'poison_cloud', status: st('poison', 0.6, 3000) })] },
      { id: 'aranha', name: 'Aranha Tecelã', base: 'aracnara', scale: 0.24, hitbox: { w: 80, h: 70 }, role: 'ranged', cost: 1.1, hp: 0.34, dmg: 0.45, runSpeed: 1.2,
        moves: [shot('poison_cloud', 'poison', { name: 'Teia Venenosa', status: st('poison', 0.5, 3000) }), pounce('poison', { name: 'Salto da Aranha' })] },
      { id: 'broto', name: 'Broto Ancião', base: 'thornwood', scale: 0.24, hitbox: { w: 70, h: 130 }, role: 'brute', cost: 1.8, hp: 0.95, dmg: 0.7, runSpeed: 0.6,
        moves: [claw('physical', { name: 'Galho', range: 110, power: 1.2, windup: 480 }), slam('physical', { name: 'Raízes', vfx: 'quake' })] },
    ],
    chief: {
      id: 'sylva', name: 'Sylva', title: 'a Caçadora de Cabeças', cls: 'Arqueira',
      look: look({ skin: '#8d5524', gender: 1, hair: 3, hairColor: '#2e5a1a', eyes: '#7dff5a', marks: 2, top: '#2a3a1a', shorts: '#1a2410' }),
      weapon: 'arco-do-falcao-peregrino', armor: 'cacador', aura: '#7dff5a',
      moves: [
        mv('Flecha Certeira', 'projectile', 'arrow', 'physical', { power: 1.2, range: 620, windup: 300, cooldown: 600 }),
        mv('Leque de Flechas', 'projectile', 'arrow', 'physical', { hits: 5, power: 2.2, range: 560, cooldown: 4200 }),
        mv('Chuva de Flechas', 'area', 'arrow_rain', 'physical', { range: 600, hits: 3, power: 2.0, windup: 700, cooldown: 6200 }),
        mv('Flecha Perfurante', 'projectile', 'piercing_arrow', 'poison', { power: 2.0, range: 700, windup: 640, cooldown: 5000, status: st('poison', 0.8, 4000), shake: 0.4 }),
        mv('Salto Mortal', 'leap', 'leap_slam', 'physical', { power: 1.6, windup: 260, cooldown: 5200, knockback: 14 }),
        mv('Fúria da Mata', 'area', 'whirlwind', 'poison', { range: 150, hits: 3, power: 2.4, windup: 400, cooldown: 8000, knockback: 16, shake: 0.6 }),
      ],
    },
  },
  // --------------------------------------------------------------------------- 3
  {
    id: 'vulcao', name: 'Vulcão Rubro', desc: 'O chão queima. O ar queima. Eles também.', mix: 'fortaleza',
    bg: { id: 'vulcao', name: 'Vulcão Rubro', sky: ['#120202', '#5a1a08'], ground: '#2a1410', fog: '#ff6a2a', particle: '#ffb36b' },
    monsters: [
      { id: 'chama', name: 'Chama Viva', base: 'ignar', scale: 0.26, hitbox: { w: 50, h: 110 }, role: 'ranged', cost: 1, hp: 0.32, dmg: 0.5, runSpeed: 1.05,
        moves: [shot('fireball', 'fire', { name: 'Bola de Fogo', status: st('burn', 0.3, 3000) }), spell('flame_wave', 'fire', { name: 'Onda de Chamas', range: 300 })] },
      { id: 'magma', name: 'Golem de Magma', base: 'magmor', scale: 0.24, hitbox: { w: 80, h: 130 }, role: 'brute', cost: 1.8, hp: 1.0, dmg: 0.75, runSpeed: 0.6,
        moves: [claw('fire', { name: 'Punho Derretido', vfx: 'heavy_slash', power: 1.2, windup: 520 }), slam('fire', { name: 'Erupção', vfx: 'quake' })] },
      { id: 'dragonete', name: 'Dragonete de Brasa', base: 'vermithrax', scale: 0.22, hitbox: { w: 90, h: 90 }, role: 'melee', cost: 1.3, hp: 0.45, dmg: 0.6, runSpeed: 1.1,
        moves: [bite('fire', { name: 'Mordida Ardente' }), mv('Sopro', 'area', 'flame_wave', 'fire', { pose: 'breath', range: 170, power: 1.4, cooldown: 4000, status: st('burn', 0.5, 3000) })] },
      { id: 'rochedo', name: 'Rochedo', base: 'kragmaw', scale: 0.22, pal: { glow: '#ff7a2a' }, hitbox: { w: 80, h: 120 }, role: 'brute', cost: 1.6, hp: 0.9, dmg: 0.65, runSpeed: 0.65,
        moves: [claw('physical', { name: 'Soco de Pedra', vfx: 'heavy_slash', power: 1.2 }), charge('physical', { name: 'Avalanche' })] },
    ],
    chief: {
      id: 'ignis', name: 'Ignis', title: 'o Ferreiro de Guerra', cls: 'Guerreiro',
      look: look({ skin: '#a0603c', hair: 7, hairColor: '#ff5a1a', beard: 3, eyes: '#ffb36b', marks: 3, top: '#5a1a08', shorts: '#2a0a04' }),
      weapon: 'martelo-de-magma', armor: 'senhor-chamas', aura: '#ff6a2a',
      moves: [
        mv('Martelada', 'melee', 'heavy_slash', 'fire', { power: 1.5, range: 100, windup: 420, cooldown: 900, knockback: 14 }),
        mv('Forja Viva', 'combo', 'multi_slash', 'fire', { hits: 3, power: 1.9, range: 100, cooldown: 3800, status: st('burn', 0.4, 3000) }),
        mv('Meteoro', 'area', 'meteor', 'fire', { range: 560, power: 2.4, windup: 760, cooldown: 6000, shake: 0.9 }),
        mv('Salto Vulcânico', 'leap', 'leap_slam', 'fire', { power: 2.2, windup: 380, cooldown: 5600, knockback: 18, shake: 0.7 }),
        mv('Muralha de Lava', 'area', 'flame_wave', 'fire', { range: 360, hits: 2, power: 2.0, windup: 520, cooldown: 7200, status: st('burn', 0.7, 3500) }),
        mv('Terremoto', 'area', 'quake', 'fire', { range: 260, power: 2.8, windup: 900, cooldown: 9500, knockback: 22, shake: 1, status: st('launch', 1, 0) }),
      ],
    },
  },
  // --------------------------------------------------------------------------- 4
  {
    id: 'abismo', name: 'Abismo do Vazio', desc: 'Aqui embaixo, até o silêncio olha de volta.', mix: 'geleira',
    bg: { id: 'abismo', name: 'Abismo do Vazio', sky: ['#04020a', '#2a0a3a'], ground: '#1a0e24', fog: '#b05aff', particle: '#e0a8ff' },
    monsters: [
      { id: 'olho', name: 'Olho Vigia', base: 'ophidrax', scale: 0.24, hitbox: { w: 60, h: 90 }, role: 'ranged', cost: 1, hp: 0.32, dmg: 0.5, runSpeed: 0.9,
        moves: [shot('shadow_orb', 'shadow', { name: 'Olhar Sombrio' }), spell('lightning_storm', 'arcane', { name: 'Raio do Vazio', hits: 2 })] },
      { id: 'gosma', name: 'Gosma Faminta', base: 'gluttonox', scale: 0.24, hitbox: { w: 80, h: 80 }, role: 'brute', cost: 1.4, hp: 0.8, dmg: 0.55, runSpeed: 0.7,
        moves: [bite('poison', { name: 'Engolir', vfx: 'multi_slash' }), pounce('poison', { name: 'Pulo Pegajoso', status: st('poison', 0.5, 3000) })] },
      { id: 'sonhador', name: 'Cria do Sonhador', base: 'xalthuun', scale: 0.2, hitbox: { w: 70, h: 100 }, role: 'ranged', cost: 1.3, hp: 0.4, dmg: 0.5,
        moves: [shot('arcane_missiles', 'arcane', { name: 'Pesadelo', hits: 2 }), mv('Tentáculos', 'pull', 'chain_pull', 'shadow', { pose: 'swipe', power: 0.9, cooldown: 4800 })] },
      { id: 'boca', name: 'Boca do Vazio', base: 'grulganoth', scale: 0.2, hitbox: { w: 80, h: 110 }, role: 'brute', cost: 1.7, hp: 0.95, dmg: 0.7, runSpeed: 0.6,
        moves: [bite('shadow', { name: 'Devorar', power: 1.3 }), mv('Grito', 'area', 'shockwave', 'shadow', { pose: 'roar', range: 170, power: 1.5, cooldown: 4600, knockback: 16 })] },
    ],
    chief: {
      id: 'nyra', name: 'Nyra', title: 'a Tecelã do Vazio', cls: 'Arquimaga',
      look: look({ skin: '#d8c8e8', gender: 1, hair: 5, hairColor: '#e0a8ff', eyes: '#ff5aff', marks: 4, top: '#2a0a3a', shorts: '#14061e' }),
      weapon: 'cajado-da-singularidade', armor: 'espectro-vazio', aura: '#b05aff',
      moves: [
        mv('Orbe do Vazio', 'projectile', 'shadow_orb', 'shadow', { power: 1.3, range: 560, cooldown: 700 }),
        mv('Mísseis Gêmeos', 'projectile', 'arcane_missiles', 'arcane', { hits: 4, power: 2.0, range: 560, cooldown: 3800 }),
        mv('Singularidade', 'pull', 'chain_pull', 'arcane', { power: 1.6, range: 520, windup: 520, cooldown: 5200 }),
        mv('Prisão Estelar', 'area', 'ice_prison', 'arcane', { range: 560, power: 1.7, windup: 700, cooldown: 6800, status: st('freeze', 1, 900) }),
        mv('Passo Sombrio', 'dash', 'shadow_spin', 'shadow', { power: 1.6, range: 300, windup: 260, cooldown: 4600 }),
        mv('Colapso', 'area', 'lightning_storm', 'arcane', { range: 600, hits: 4, power: 2.9, windup: 900, cooldown: 9500, shake: 0.9 }),
      ],
    },
  },
  // --------------------------------------------------------------------------- 5
  {
    id: 'geleira', name: 'Geleira Eterna', desc: 'O frio aqui não congela só o corpo.', mix: 'floresta',
    bg: { id: 'geleira', name: 'Geleira Eterna', sky: ['#04101c', '#2a5a7a'], ground: '#2a3a48', fog: '#9fe8ff', particle: '#ffffff' },
    monsters: [
      { id: 'sentinela', name: 'Sentinela de Gelo', base: 'prismora', scale: 0.22, pal: { body: '#9fd8ff', glow: '#e0f8ff' }, hitbox: { w: 80, h: 130 }, role: 'brute', cost: 1.7, hp: 0.95, dmg: 0.7, runSpeed: 0.6,
        moves: [claw('ice', { name: 'Lâmina de Cristal', vfx: 'heavy_slash', power: 1.2 }), slam('ice', { name: 'Estilhaços', status: st('freeze', 0.3, 700) })] },
      { id: 'nevasca', name: 'Espírito da Nevasca', base: 'hailstrom', scale: 0.24, hitbox: { w: 50, h: 110 }, role: 'ranged', cost: 1, hp: 0.32, dmg: 0.48, runSpeed: 1.1,
        moves: [shot('ice_shard', 'ice', { name: 'Fragmento', hits: 2 }), spell('ice_prison', 'ice', { name: 'Prisão de Gelo', status: st('freeze', 0.8, 700) })] },
      { id: 'urso', name: 'Urso Rúnico', base: 'ursaroth', scale: 0.22, pal: { body: '#d8e0e8' }, hitbox: { w: 80, h: 110 }, role: 'melee', cost: 1.4, hp: 0.6, dmg: 0.65, runSpeed: 0.95,
        moves: [bite('physical', { name: 'Patada', vfx: 'multi_slash' }), charge('ice', { name: 'Avanço Gélido' })] },
      { id: 'glacial', name: 'Dragonete Glacial', base: 'glaciareth', scale: 0.22, hitbox: { w: 90, h: 90 }, role: 'melee', cost: 1.3, hp: 0.45, dmg: 0.6, runSpeed: 1.1,
        moves: [bite('ice', { name: 'Mordida Gelada' }), mv('Sopro Gélido', 'area', 'ice_prison', 'ice', { pose: 'breath', range: 170, power: 1.3, cooldown: 4200, status: st('freeze', 0.4, 700) })] },
    ],
    chief: {
      id: 'kael', name: 'Kael', title: 'a Lâmina do Inverno', cls: 'Samurai',
      look: look({ skin: '#f1c27d', hair: 6, hairColor: '#e8f4ff', eyes: '#7fd6ff', marks: 5, top: '#1a2a3a', shorts: '#0a1420' }),
      weapon: 'katana-tempestade-gelida', armor: 'imperador-gelo', aura: '#7fd6ff',
      moves: [
        mv('Corte Rápido', 'combo', 'slash', 'ice', { hits: 2, power: 1.2, range: 95, windup: 200, cooldown: 600 }),
        mv('Iaijutsu', 'dash', 'crescent', 'ice', { power: 2.2, range: 340, windup: 520, cooldown: 4400, knockback: 16, shake: 0.5 }),
        mv('Lua Gélida', 'projectile', 'crescent', 'ice', { hits: 3, power: 1.9, range: 520, cooldown: 4800 }),
        mv('Tempestade de Lâminas', 'area', 'whirlwind', 'ice', { range: 160, hits: 4, power: 2.4, windup: 380, cooldown: 6200, knockback: 14 }),
        mv('Queda do Inverno', 'leap', 'leap_slam', 'ice', { power: 2.0, windup: 300, cooldown: 5400, status: st('freeze', 0.6, 700) }),
        mv('Zero Absoluto', 'area', 'ice_prison', 'ice', { range: 600, power: 2.8, windup: 900, cooldown: 9500, status: st('freeze', 1, 1100), shake: 0.8 }),
      ],
    },
  },
  // --------------------------------------------------------------------------- 6
  {
    id: 'fortaleza', name: 'Fortaleza Mecânica', desc: 'Engrenagens que nunca dormem. Canhões que nunca erram.', mix: 'vulcao',
    bg: { id: 'fortaleza', name: 'Fortaleza Mecânica', sky: ['#06080c', '#2a3440'], ground: '#262a30', fog: '#5aa8ff', particle: '#ffd24a' },
    monsters: [
      { id: 'drone', name: 'Drone Vigia', base: 'omega', scale: 0.22, hitbox: { w: 60, h: 80 }, role: 'ranged', cost: 1, hp: 0.3, dmg: 0.5, runSpeed: 1.2, dodge: 0.12,
        moves: [shot('lightning_spear', 'lightning', { name: 'Laser', status: st('shock', 0.2, 600) }), shot('arcane_missiles', 'fire', { name: 'Mini-mísseis', hits: 3, power: 1.5, cooldown: 4000 })] },
      { id: 'juggernaut', name: 'Juggernaut Mk-I', base: 'mkzero', scale: 0.2, hitbox: { w: 90, h: 130 }, role: 'brute', cost: 1.9, hp: 1.05, dmg: 0.7, runSpeed: 0.55,
        moves: [shot('arrow', 'physical', { name: 'Metralhadora', vfx: 'dagger_throw', hits: 4, power: 1.4, range: 380 }), slam('lightning', { name: 'Pisão', vfx: 'quake' })] },
      { id: 'relojoeiro', name: 'Autômato de Corda', base: 'relojoeiro', scale: 0.24, hitbox: { w: 60, h: 120 }, role: 'melee', cost: 1.2, hp: 0.5, dmg: 0.55, runSpeed: 1,
        moves: [bite('physical', { name: 'Lâminas de Engrenagem', vfx: 'spin' }), charge('lightning', { name: 'Corda Solta' })] },
      { id: 'besouro', name: 'Besouro Blindado', base: 'khepros', scale: 0.2, hitbox: { w: 90, h: 80 }, role: 'melee', cost: 1.4, hp: 0.65, dmg: 0.6, runSpeed: 1,
        moves: [claw('physical', { name: 'Chifrada', vfx: 'heavy_slash' }), charge('physical', { name: 'Aríete', range: 260 })] },
    ],
    chief: {
      id: 'valkyra', name: 'Valkyra', title: 'a Comandante de Aço', cls: 'Lanceira',
      look: look({ skin: '#ffdbac', gender: 1, hair: 2, hairColor: '#ffd24a', eyes: '#5aa8ff', marks: 0, top: '#2a3440', shorts: '#14181e' }),
      weapon: 'lanca-do-trovao-divino', armor: 'arauto-tempestade', aura: '#ffd24a',
      moves: [
        mv('Estocada Dupla', 'combo', 'thrust', 'lightning', { hits: 2, power: 1.3, range: 130, cooldown: 700 }),
        mv('Investida Relâmpago', 'dash', 'lightning_spear', 'lightning', { power: 2.0, range: 380, windup: 420, cooldown: 4200, status: st('shock', 0.4, 700), shake: 0.5 }),
        mv('Lança Arremessada', 'projectile', 'lightning_spear', 'lightning', { power: 1.8, range: 640, windup: 520, cooldown: 4600, shake: 0.4 }),
        mv('Mergulho do Céu', 'leap', 'leap_slam', 'lightning', { power: 2.2, windup: 320, cooldown: 5600, knockback: 18, shake: 0.7 }),
        mv('Ciclone de Aço', 'area', 'whirlwind', 'physical', { range: 170, hits: 3, power: 2.2, windup: 360, cooldown: 6400, knockback: 14 }),
        mv('Julgamento do Trovão', 'area', 'lightning_storm', 'lightning', { range: 620, hits: 5, power: 3.0, windup: 900, cooldown: 9500, status: st('shock', 0.5, 800), shake: 1 }),
      ],
    },
  },
];

export const THEMES_BY_ID: Record<string, WaveTheme> = Object.fromEntries(THEMES.map((t) => [t.id, t]));

// ------------------------------------------------------------------ dificuldade

/**
 * Multiplicador de dificuldade por tamanho do time (calibrado com milhares de
 * lutas simuladas em tools/team/calibrate.ts): sozinho é difícil; em time fica
 * mais fácil, mas as waves também crescem (mais monstros e mais vida).
 */
export const TEAM_DIFFICULTY: Record<number, number> = {
  1: 0.1015, 2: 0.1085, 3: 0.1326, 4: 0.1584, 5: 0.1675, 6: 0.1894, 7: 0.2047, 8: 0.2263, 9: 0.2474, 10: 0.2587,
};
/** Chance de vitória alvo (modo automático) por tamanho do time. */
export const TARGET_WIN: Record<number, number> = { 1: 0.22, 2: 0.36, 3: 0.46, 4: 0.53, 5: 0.58, 6: 0.6, 7: 0.62, 8: 0.63, 9: 0.64, 10: 0.65 };

/** Referência do time: vida e dano médios (com as MESMAS fórmulas da luta). */
export function teamRef(fighters: FighterInput[]) {
  let hp = 0;
  let dmg = 0;
  for (const f of fighters) {
    hp += derivedStats(f.attributes).maxHp;
    const w = WEAPONS_BY_ID[f.equipment.weapon ?? ''] ?? WEAPONS_BY_ID['espada-curta-recruta'];
    const p = weaponPower(w, f.attributes);
    dmg += p.damage * p.speed;
  }
  const n = Math.max(1, fighters.length);
  return { hp: hp / n, dmg: dmg / n };
}

function monsterUnit(m: MonsterDef, ref: { hp: number; dmg: number }, k: number, D: number, extraHp: number, wave: number): TeamUnitInput {
  const base = BOSSES_BY_ID[m.base];
  const ramp = 1 + 0.07 * (k - 1);
  return {
    kind: 'monster', team: 1, name: m.name, wave,
    hp: m.hp * ref.hp * ramp * Math.pow(D, 0.6) * extraHp,
    dmg: m.dmg * ref.dmg * (1 + 0.035 * (k - 1)) * Math.pow(D, 0.4),
    atkSpeed: m.atkSpeed ?? 1, runSpeed: m.runSpeed ?? 0.85, hitbox: m.hitbox, moves: m.moves, ai: m.role, dodge: m.dodge ?? 0.05,
    body: base ? { id: m.id, arch: base.arch, size: base.size, pal: { ...base.pal, ...(m.pal ?? {}) }, feat: base.feat } : undefined,
    scale: m.scale,
  };
}

/**
 * Monta todas as unidades de um evento de waves para esse time.
 * `D` = multiplicador extra de dificuldade (1 = automático/balanceado).
 */
export function buildWaves(theme: WaveTheme, fighters: FighterInput[], seed: number, D = 1): TeamUnitInput[] {
  const rng = mulberry32((seed ^ 0x2f6b9a17) >>> 0);
  const n = fighters.length;
  const ref = teamRef(fighters);
  const Dn = (TEAM_DIFFICULTY[Math.min(10, n)] ?? 1) * D;
  const units: TeamUnitInput[] = fighters.map((f) => ({ kind: 'player', team: 0, fighter: f }));
  const mixTheme = THEMES_BY_ID[theme.mix];
  const MAX_IN_WAVE = 8;
  for (let k = 1; k < WAVES_TOTAL; k++) {
    // orçamento da wave: cresce com a wave e com o time (menos que linear: time ajuda)
    const budget = (1.5 + 0.38 * k) * Math.pow(n, 0.78);
    // primeiras waves: só os 2 primeiros tipos; depois o tema inteiro; às vezes um intruso do tema vizinho
    const pool = k <= 2 ? theme.monsters.slice(0, 2) : k <= 4 ? theme.monsters.slice(0, 3) : theme.monsters;
    const picks: MonsterDef[] = [];
    let spent = 0;
    while (spent < budget - 0.3 && picks.length < MAX_IN_WAVE) {
      let m = pool[Math.floor(rng() * pool.length)];
      if (mixTheme && k >= 4 && rng() < 0.18) m = mixTheme.monsters[Math.floor(rng() * mixTheme.monsters.length)];
      picks.push(m);
      spent += m.cost;
    }
    // orçamento que não coube (time grande): vira vida extra
    const extraHp = spent > 0 ? Math.max(1, budget / spent) : 1;
    for (const m of picks) units.push(monsterUnit(m, ref, k, Dn, extraHp, k));
  }
  // wave final: o mini-chefe + 2 capangas
  const c = theme.chief;
  units.push({
    kind: 'chief', team: 1, name: c.name, title: `${c.title} · ${c.cls}`, wave: WAVES_TOTAL,
    hp: 5.2 * ref.hp * Math.pow(n, 0.82) * Math.pow(Dn, 0.6),
    dmg: 0.62 * ref.dmg * Math.pow(Dn, 0.4),
    atkSpeed: 1.05, runSpeed: 1.1, hitbox: { w: 44, h: 104 }, moves: c.moves, ai: c.moves[0].kind === 'projectile' ? 'ranged' : 'melee', dodge: 0.32,
    look: c.look,
    equipment: { weapon: c.weapon, helm: `armor:${c.armor}:helm`, chest: `armor:${c.armor}:chest`, gloves: `armor:${c.armor}:gloves`, legs: `armor:${c.armor}:legs` },
    aura: c.aura,
  });
  for (let i = 0; i < Math.min(4, 1 + Math.floor(n / 2)); i++) {
    units.push(monsterUnit(theme.monsters[i % theme.monsters.length], ref, WAVES_TOTAL - 1, Dn, 1, WAVES_TOTAL));
  }
  return units;
}

export function arenaFor(theme: WaveTheme, n: number): TeamArenaDef {
  return { width: Math.round(1900 + 160 * Math.min(10, n)), ground: 600, theme: theme.bg };
}

// ------------------------------------------------------------------ visões

/** O que o jogador vê do tema (só o visual: nada de vida, dano ou dificuldade). */
export function themePublic(theme: WaveTheme): WaveThemePublic {
  const c = theme.chief;
  return {
    id: theme.id, name: theme.name, desc: theme.desc, bg: { sky: theme.bg.sky, ground: theme.bg.ground, fog: theme.bg.fog, particle: theme.bg.particle },
    monsters: theme.monsters.flatMap((m) => {
      const base = BOSSES_BY_ID[m.base];
      return base ? [{ name: m.name, scale: m.scale, body: { id: m.id, arch: base.arch, size: base.size, pal: { ...base.pal, ...(m.pal ?? {}) }, feat: base.feat } }] : [];
    }),
    chief: {
      name: c.name, title: c.title, cls: c.cls, look: c.look, aura: c.aura,
      equipment: { weapon: c.weapon, helm: `armor:${c.armor}:helm`, chest: `armor:${c.armor}:chest`, gloves: `armor:${c.armor}:gloves`, legs: `armor:${c.armor}:legs` },
    },
  };
}

/** Visão do admin: o visual + nomes dos monstros e golpes do chefe. */
export function themeAdmin(theme: WaveTheme): WaveThemeAdmin {
  return {
    ...themePublic(theme),
    waves: WAVES_TOTAL,
    monsterNames: theme.monsters.map((m) => m.name),
    chiefMoves: theme.chief.moves.map((m) => m.name),
  };
}
