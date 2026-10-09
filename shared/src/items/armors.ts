/**
 * ============================================================
 *  GYMBATTLE — 30 CONJUNTOS DE ARMADURA (somente estéticos)
 * ============================================================
 * Nenhuma armadura dá atributo. `price` é a soma das 4 peças;
 * comprar o conjunto completo tem desconto (BALANCE.shop.armorSetDiscount).
 */
import { BALANCE } from '../balance.js';
import type { ArmorSetDef, ArmorSlot } from './types.js';

export const ARMOR_SETS: ArmorSetDef[] = [
  // ---------------- COMUNS ----------------
  { id: 'recruta', name: 'Couro do Recruta', rarity: 'common', price: 260,
    lore: 'Couro batido e fivelas que rangem. Todo herói começou assim.',
    style: { helm: 'bandana', chest: 'tunic', gloves: 'wraps', legs: 'pants', primary: '#7a5a3a', secondary: '#4a3524', accent: '#c9a26a' } },
  { id: 'aprendiz', name: 'Túnica do Aprendiz', rarity: 'common', price: 280,
    lore: 'Cheira a pergaminho e a experimento que deu errado.',
    style: { helm: 'hood', chest: 'robe', gloves: 'glove', legs: 'robe_skirt', primary: '#3a4a8a', secondary: '#23305a', accent: '#c9b26a' } },
  { id: 'barbaro', name: 'Peles do Bárbaro', rarity: 'common', price: 300,
    lore: 'Peles de animais que o bárbaro jura ter vencido na mão.',
    style: { helm: 'horns', chest: 'vest', gloves: 'wraps', legs: 'shorts', primary: '#8a6a4a', secondary: '#5a3a24', accent: '#d8d0c0' } },
  { id: 'andarilho', name: 'Manto do Andarilho', rarity: 'common', price: 320,
    lore: 'Poeira de mil estradas. O andarilho nunca diz de onde vem.',
    style: { helm: 'hood', chest: 'coat', gloves: 'glove', legs: 'pants', primary: '#5a5a5e', secondary: '#3a3a3e', accent: '#9a8a6a' } },
  { id: 'monge', name: 'Hábito do Monge de Pedra', rarity: 'common', price: 360,
    lore: 'Mil flexões ao amanhecer. Mil antes de dormir.',
    style: { helm: 'none', chest: 'gi', gloves: 'wraps', legs: 'hakama', primary: '#c9a24a', secondary: '#8a5a2a', accent: '#3a2a1a' } },

  // ---------------- INCOMUNS ----------------
  { id: 'cavaleiro-ferro', name: 'Placas do Cavaleiro de Ferro', rarity: 'uncommon', price: 820,
    lore: 'Pesada, barulhenta e confiável. Como um bom supino.',
    style: { helm: 'helm_closed', chest: 'plate', gloves: 'gauntlet', legs: 'plate', primary: '#8a929c', secondary: '#5a626c', accent: '#c9a24a' } },
  { id: 'ninja-nevoa', name: 'Traje Ninja da Névoa', rarity: 'uncommon', price: 780,
    lore: 'Tecido que abafa passos. E gemidos no último set.',
    style: { helm: 'mask', chest: 'gi', gloves: 'wraps', legs: 'hakama', primary: '#23262e', secondary: '#15171c', accent: '#c0283c' } },
  { id: 'clerigo-aurora', name: 'Vestes do Clérigo da Aurora', rarity: 'uncommon', price: 860,
    lore: 'Brancas como a primeira luz. Difíceis de manter limpas.',
    style: { helm: 'circlet', chest: 'robe', gloves: 'glove', legs: 'robe_skirt', primary: '#e8e4d8', secondary: '#c9b27a', accent: '#ffd86b' } },
  { id: 'pirata', name: 'Casaca do Pirata Rubro', rarity: 'uncommon', price: 900,
    lore: 'Roubada de um almirante. Os botões ainda são de ouro.',
    style: { helm: 'tricorn', chest: 'coat', gloves: 'glove', legs: 'pants', primary: '#8a1a24', secondary: '#1f1f28', accent: '#e0b84a' } },
  { id: 'cacador', name: 'Couraça do Caçador da Floresta', rarity: 'uncommon', price: 740,
    lore: 'Camuflagem de folhas. Os cervos nunca desconfiam.',
    style: { helm: 'hood', chest: 'vest', gloves: 'glove', legs: 'pants', primary: '#3a5a2a', secondary: '#2a3a1a', accent: '#a88a4a' } },
  { id: 'legionario', name: 'Armadura do Legionário', rarity: 'uncommon', price: 960,
    lore: 'Marchou trinta quilômetros por dia. Com essa armadura. Sem reclamar.',
    style: { helm: 'helm_open', chest: 'plate', gloves: 'wraps', legs: 'shorts', primary: '#b8862a', secondary: '#8a1a1a', accent: '#e8d9a8' } },
  { id: 'viking', name: 'Cota do Viking', rarity: 'uncommon', price: 880,
    lore: 'Cota de malha e uma capa que já viu três invernos seguidos.',
    style: { helm: 'horns', chest: 'scale', gloves: 'gauntlet', legs: 'pants', primary: '#7a7e86', secondary: '#4a3a2a', accent: '#c9a26a' } },

  // ---------------- RAROS ----------------
  { id: 'samurai-carmesim', name: 'Ō-yoroi do Samurai Carmesim', rarity: 'rare', price: 2200,
    lore: 'Lâminas laqueadas em vermelho. O clã jurou nunca recuar.',
    style: { helm: 'kabuto', chest: 'scale', gloves: 'gauntlet', legs: 'hakama', primary: '#9a1a24', secondary: '#1f1f24', accent: '#e0b84a' } },
  { id: 'assassino', name: 'Couraça do Assassino Noturno', rarity: 'rare', price: 2000,
    lore: 'Nenhum brilho, nenhum som, nenhuma testemunha.',
    style: { helm: 'hood', chest: 'vest', gloves: 'glove', legs: 'pants', primary: '#1a1a22', secondary: '#2a2a36', accent: '#8b5cf6' } },
  { id: 'necromante', name: 'Mortalha do Necromante Pálido', rarity: 'rare', price: 2400,
    lore: 'Costurada com fios que não são exatamente fios.',
    style: { helm: 'skull', chest: 'robe', gloves: 'glove', legs: 'robe_skirt', primary: '#2a2a30', secondary: '#4a4a52', accent: '#7ddc3d' } },
  { id: 'guardiao-gelo', name: 'Placas do Guardião do Gelo', rarity: 'rare', price: 2300,
    lore: 'Esculpida em gelo que nunca derrete. Refresca no cardio.',
    style: { helm: 'helm_closed', chest: 'plate', gloves: 'gauntlet', legs: 'plate', primary: '#bfe6f5', secondary: '#6aa8c8', accent: '#e8f8ff' } },
  { id: 'gladiador', name: 'Arreios do Gladiador', rarity: 'rare', price: 1850,
    lore: 'Para quem luta pelo aplauso — e pelo pump.',
    style: { helm: 'helm_open', chest: 'vest', gloves: 'gauntlet', legs: 'shorts', primary: '#9a7a3a', secondary: '#5a3a1a', accent: '#c0283c' } },
  { id: 'templario', name: 'Cruzada do Templário', rarity: 'rare', price: 2450,
    lore: 'Branca, vermelha e inabalável.',
    style: { helm: 'helm_closed', chest: 'plate', gloves: 'gauntlet', legs: 'plate', primary: '#e8e8ea', secondary: '#9aa0a8', accent: '#c0283c' } },
  { id: 'ronin', name: 'Kimono do Ronin Errante', rarity: 'rare', price: 1900,
    lore: 'Sem mestre, sem casa, sem dia de descanso.',
    style: { helm: 'bandana', chest: 'gi', gloves: 'wraps', legs: 'hakama', primary: '#2a3a5a', secondary: '#1a2238', accent: '#d8d0c0' } },
  { id: 'cultista', name: 'Túnica do Cultista do Abismo', rarity: 'rare', price: 2100,
    lore: 'Os símbolos bordados mudam de lugar quando ninguém olha.',
    style: { helm: 'hood', chest: 'robe', gloves: 'glove', legs: 'robe_skirt', primary: '#3a1a4a', secondary: '#1a0f24', accent: '#b57cff' } },

  // ---------------- ÉPICOS ----------------
  { id: 'cavaleiro-sombrio', name: 'Armadura do Cavaleiro Sombrio', rarity: 'epic', price: 5200,
    lore: 'Forjada no escuro, para ser vista no escuro. Por último.',
    style: { helm: 'helm_closed', chest: 'plate', gloves: 'gauntlet', legs: 'plate', primary: '#1f2028', secondary: '#35363f', accent: '#8b5cf6', trim: '#5a4a7a' } },
  { id: 'paladino-dourado', name: 'Égide do Paladino Dourado', rarity: 'epic', price: 5500,
    lore: 'Reluz tanto que os inimigos pedem para desligar.',
    style: { helm: 'helm_open', chest: 'plate', gloves: 'gauntlet', legs: 'plate', primary: '#e0b84a', secondary: '#f0e0a0', accent: '#ffffff', trim: '#8a5a1a' } },
  { id: 'escamas-dragao', name: 'Escamas de Dragão', rarity: 'epic', price: 5000,
    lore: 'Cada escama caiu de um dragão diferente. Ninguém pergunta como.',
    style: { helm: 'dragon', chest: 'scale', gloves: 'gauntlet', legs: 'plate', primary: '#2a6a4a', secondary: '#1a3a2a', accent: '#e0b84a' } },
  { id: 'senhor-chamas', name: 'Couraça do Senhor das Chamas', rarity: 'epic', price: 5300,
    lore: 'Quente ao toque. Muito quente. Não toque.',
    style: { helm: 'horns', chest: 'plate', gloves: 'gauntlet', legs: 'plate', primary: '#3a1a12', secondary: '#6a2a12', accent: '#ff7a2f', trim: '#ffb04a' } },
  { id: 'arauto-tempestade', name: 'Manto do Arauto da Tempestade', rarity: 'epic', price: 4600,
    lore: 'O vento sempre sopra na direção que ele aponta.',
    style: { helm: 'circlet', chest: 'coat', gloves: 'gauntlet', legs: 'pants', primary: '#2a3a6a', secondary: '#1a2238', accent: '#ffe24a' } },

  // ---------------- LENDÁRIOS (animados) ----------------
  { id: 'rei-caido', name: 'Regalia do Rei Caído', rarity: 'legendary', price: 11000,
    lore: 'A coroa ainda pesa. A capa ainda tremula, mesmo sem vento.',
    style: { helm: 'crown', chest: 'plate', gloves: 'gauntlet', legs: 'plate', primary: '#3a3f4a', secondary: '#1f2228', accent: '#e0b84a', trim: '#c9a227', fx: { cape: '#7a1a24' } } },
  { id: 'avatar-solar', name: 'Avatar Solar', rarity: 'legendary', price: 12000,
    lore: 'Quem veste brilha como o meio-dia. Literalmente.',
    style: { helm: 'circlet', chest: 'plate', gloves: 'gauntlet', legs: 'plate', primary: '#f5d06a', secondary: '#fff0c0', accent: '#ffffff', trim: '#e09a2a', fx: { glow: '#ffd86b', particles: 'holy', cape: '#f5b544' } } },
  { id: 'espectro-vazio', name: 'Espectro do Vazio', rarity: 'legendary', price: 11500,
    lore: 'Metade da armadura não está aqui. A outra metade não tem certeza.',
    style: { helm: 'hood', chest: 'robe', gloves: 'glove', legs: 'robe_skirt', primary: '#15121f', secondary: '#2a2240', accent: '#b57cff', fx: { glow: '#8b5cf6', particles: 'shadow', cape: '#1a1430' } } },
  { id: 'dragao-ancestral', name: 'Armadura do Dragão Ancestral', rarity: 'legendary', price: 12000,
    lore: 'Feita do último dragão. Ele ainda cospe fogo de vez em quando.',
    style: { helm: 'dragon', chest: 'scale', gloves: 'gauntlet', legs: 'plate', primary: '#7a1a12', secondary: '#3a0f0a', accent: '#ffb04a', trim: '#e0b84a', fx: { particles: 'fire', glow: '#ff7a2f', cape: '#5a0f0a' } } },
  { id: 'imperador-gelo', name: 'Manto do Imperador de Gelo', rarity: 'legendary', price: 10500,
    lore: 'Onde ele pisa, o inverno começa.',
    style: { helm: 'crown', chest: 'coat', gloves: 'gauntlet', legs: 'plate', primary: '#dff6ff', secondary: '#7ab8d8', accent: '#ffffff', trim: '#4a8ab0', fx: { particles: 'ice', glow: '#7fd6ff', cape: '#bfe6f5' } } },
];

export const ARMOR_SETS_BY_ID: Record<string, ArmorSetDef> = Object.assign(Object.create(null), Object.fromEntries(ARMOR_SETS.map((a) => [a.id, a])));
export const ARMOR_SLOTS: ArmorSlot[] = ['helm', 'chest', 'gloves', 'legs'];
export const ARMOR_SLOT_LABEL: Record<ArmorSlot, string> = { helm: 'Elmo', chest: 'Peitoral', gloves: 'Luvas', legs: 'Calças' };

/** ID de item de uma peça: "armor:<conjunto>:<peça>" */
export const armorPieceId = (setId: string, slot: ArmorSlot) => `armor:${setId}:${slot}`;

export function parseArmorPieceId(id: string): { set: ArmorSetDef; slot: ArmorSlot } | null {
  const [kind, setId, slot] = id.split(':');
  if (kind !== 'armor') return null;
  const set = ARMOR_SETS_BY_ID[setId];
  if (!set || !ARMOR_SLOTS.includes(slot as ArmorSlot)) return null;
  return { set, slot: slot as ArmorSlot };
}

export function armorPiecePrice(set: ArmorSetDef, slot: ArmorSlot): number {
  return Math.round(set.price * BALANCE.shop.armorPieceShare[slot]);
}

/** Preço do conjunto completo com desconto, considerando só as peças que faltam. */
export function armorSetPrice(set: ArmorSetDef, owned: ArmorSlot[] = []): number {
  const missing = ARMOR_SLOTS.filter((s) => !owned.includes(s));
  const sum = missing.reduce((t, s) => t + armorPiecePrice(set, s), 0);
  return missing.length === 4 ? Math.round(sum * (1 - BALANCE.shop.armorSetDiscount)) : sum;
}
