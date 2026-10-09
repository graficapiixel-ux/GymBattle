/**
 * CATÁLOGO SECRETO DOS BOSSES — existe só no servidor.
 * Nada daqui vai para o código do site: o navegador só recebe o boss de um
 * evento já ativo (ou o catálogo inteiro, se for o admin).
 */
import type { BossArch, BossAttack, BossFx, BossPose, BossSpec } from '@gymbattle/shared';

const atk = (name: string, fx: BossFx, pose: BossPose, color: string, color2: string, aoe = false, dur = 2.2): Omit<BossAttack, 'id'> => ({
  name, fx, pose, color, color2, aoe, dur,
});

interface Def {
  id: string;
  name: string;
  title: string;
  lore: string;
  arch: BossArch;
  kind: number;
  size: number;
  pal: [body: string, dark: string, accent: string, glow: string, eye: string];
  feat?: Record<string, number>;
  bg: [skyTop: string, skyBottom: string, ground: string, fog: string, particle: string];
  attacks: Omit<BossAttack, 'id'>[];
}

const DEFS: Def[] = [
  // ------------------------------------------------------------------ DRAGÕES
  {
    id: 'vermithrax', name: 'Vermithrax', title: 'a Brasa Primordial', arch: 'dragon', kind: 0, size: 1.45,
    lore: 'Dormia sob o vulcão desde antes dos reis. Acordou com fome — e o mundo inteiro cheira a carvão.',
    pal: ['#b3261e', '#4a0d0a', '#ffb347', '#ff6a1a', '#ffe14d'], feat: { horns: 4, spikes: 7, wings: 1 },
    bg: ['#1a0402', '#5a1606', '#2a0c06', '#ff5a1a', '#ff9a3a'],
    attacks: [
      atk('Sopro Infernal', 'breath', 'breath', '#ff5a1a', '#ffe14d', true, 2.6),
      atk('Chuva de Meteoros', 'meteor', 'roar', '#ff7a1a', '#ffd34d', true, 2.8),
      atk('Garras Ígneas', 'claws', 'swipe', '#ff6a2a', '#ffffff', false, 1.8),
      atk('Cauda de Lava', 'tail', 'swipe', '#ff4a10', '#ffb347', true, 2),
      atk('Rugido Vulcânico', 'roar', 'roar', '#ff8a3a', '#ffe9b0', true, 2.2),
    ],
  },
  {
    id: 'glaciareth', name: 'Glaciareth', title: 'a Rainha do Inverno Eterno', arch: 'dragon', kind: 1, size: 1.4,
    lore: 'Onde suas asas passam, o verão nunca mais volta. Seus ovos são icebergs.',
    pal: ['#9fd8f2', '#2a5a7a', '#ffffff', '#7fe0ff', '#4af0ff'], feat: { horns: 2, spikes: 9, wings: 1, crown: 1 },
    bg: ['#04121e', '#2a5a7a', '#cfe8f5', '#bfeaff', '#ffffff'],
    attacks: [
      atk('Sopro Congelante', 'breath', 'breath', '#9fe8ff', '#ffffff', true, 2.6),
      atk('Lanças de Gelo', 'shards', 'cast', '#bff4ff', '#4af0ff', true, 2.2),
      atk('Cauda Glacial', 'tail', 'swipe', '#cfeeff', '#4af0ff', true, 2),
      atk('Prisão de Cristal', 'crystals', 'slam', '#9fe8ff', '#ffffff', false, 2.2),
    ],
  },
  {
    id: 'nyxvorath', name: "Nyx'Vorath", title: 'o Dragão do Eclipse', arch: 'dragon', kind: 2, size: 1.5,
    lore: 'Engoliu o sol uma vez. Cuspiu de volta só porque estava frio demais.',
    pal: ['#2a1640', '#0a0414', '#b57cff', '#8a3aff', '#ff3af0'], feat: { horns: 6, spikes: 5, wings: 1 },
    bg: ['#050208', '#1e0a32', '#120818', '#6a2aaa', '#c08aff'],
    attacks: [
      atk('Sopro do Vazio', 'breath', 'breath', '#8a3aff', '#ff3af0', true, 2.6),
      atk('Mãos da Sombra', 'shadowHands', 'cast', '#5a1a9a', '#c08aff', true, 2.4),
      atk('Orbes do Eclipse', 'orbs', 'cast', '#b57cff', '#ffffff', true, 2.4),
      atk('Garra Lunar', 'claws', 'swipe', '#c08aff', '#ffffff', false, 1.8),
    ],
  },
  {
    id: 'zharkul', name: "Zhar'kul", title: 'o Wyrm da Tempestade', arch: 'dragon', kind: 3, size: 1.35,
    lore: 'Não tem asas: nada nas nuvens como serpente e desce com o trovão.',
    pal: ['#2f5ea8', '#0e1e3a', '#ffe14d', '#4ad0ff', '#ffffff'], feat: { horns: 2, spikes: 10, wings: 0, whiskers: 1 },
    bg: ['#040a18', '#1e3058', '#182230', '#4ad0ff', '#bfe8ff'],
    attacks: [
      atk('Relâmpago Encadeado', 'lightning', 'roar', '#bfe8ff', '#ffe14d', true, 2.4),
      atk('Mergulho Trovejante', 'charge', 'charge', '#4ad0ff', '#ffffff', true, 2),
      atk('Feixe Elétrico', 'beam', 'breath', '#7fe0ff', '#ffffff', true, 2.4),
      atk('Rugido do Trovão', 'roar', 'roar', '#ffe14d', '#ffffff', true, 2),
    ],
  },
  // ------------------------------------------------------------------ GOLENS
  {
    id: 'kragmaw', name: 'Kragmaw', title: 'o Colosso de Basalto', arch: 'golem', kind: 0, size: 1.5,
    lore: 'Uma montanha que cansou de ficar parada. Cada passo seu vira um vale.',
    pal: ['#5a5550', '#2a2622', '#ff9a3a', '#ff7a1a', '#ffb347'], feat: { cracks: 1, moss: 1 },
    bg: ['#0e0c0a', '#3a2e24', '#3a3028', '#8a6a4a', '#c8a070'],
    attacks: [
      atk('Punho Sísmico', 'slam', 'slam', '#c8a070', '#ff9a3a', true, 2.2),
      atk('Rocha Arremessada', 'boulder', 'shoot', '#6a625a', '#ff9a3a', false, 2),
      atk('Terremoto', 'quake', 'slam', '#8a6a4a', '#ffb347', true, 2.6),
      atk('Espinhos de Pedra', 'spikes', 'slam', '#7a726a', '#c8a070', true, 2.2),
    ],
  },
  {
    id: 'ferrolho', name: 'Ferrolho', title: 'o Golem de Ferro Fundido', arch: 'golem', kind: 1, size: 1.35,
    lore: 'Forjado por anões para guardar um tesouro. Os anões sumiram; ele ainda guarda.',
    pal: ['#6a7078', '#2a2e34', '#ff6a1a', '#ff8a2a', '#ffcc33'], feat: { rivets: 1, chimney: 1 },
    bg: ['#0a0a0c', '#2a2420', '#2a2a2e', '#ff6a1a', '#ffb060'],
    attacks: [
      atk('Martelo de Forja', 'slam', 'slam', '#ffb060', '#ffffff', false, 2),
      atk('Escória Derretida', 'acid', 'shoot', '#ff6a1a', '#ffcc33', true, 2.2),
      atk('Engrenagens Voadoras', 'blades', 'cast', '#9aa0a8', '#ffcc33', true, 2.2),
      atk('Vapor Escaldante', 'breath', 'breath', '#e8e8e8', '#ffb060', true, 2.4),
    ],
  },
  {
    id: 'prismora', name: 'Prismora', title: 'a Sentinela de Cristal', arch: 'golem', kind: 2, size: 1.3,
    lore: 'Refrata a luz e a coragem de quem a encara. Ninguém lembra quem a construiu.',
    pal: ['#7fe0d0', '#1a4a5a', '#ff9af0', '#b0fff0', '#ffffff'], feat: { crystals: 7 },
    bg: ['#020c12', '#163a4a', '#1a3040', '#7fe0d0', '#ff9af0'],
    attacks: [
      atk('Lanças de Cristal', 'crystals', 'slam', '#7fe0d0', '#ff9af0', true, 2.2),
      atk('Raio Prismático', 'beam', 'shoot', '#ff9af0', '#7fe0ff', true, 2.4),
      atk('Estilhaços', 'shards', 'cast', '#b0fff0', '#ffffff', true, 2),
      atk('Pulso Refrator', 'nova', 'cast', '#ffffff', '#ff9af0', true, 2),
    ],
  },
  {
    id: 'magmor', name: 'Magmor', title: 'o Coração de Lava', arch: 'golem', kind: 3, size: 1.45,
    lore: 'Pedra por fora, inferno por dentro. Quando está com raiva, a pele racha.',
    pal: ['#2a1a14', '#120a06', '#ff5a10', '#ff7a1a', '#ffe14d'], feat: { cracks: 2 },
    bg: ['#140402', '#4a1204', '#1e0a04', '#ff4a10', '#ffb347'],
    attacks: [
      atk('Erupção', 'meteor', 'roar', '#ff5a10', '#ffe14d', true, 2.8),
      atk('Onda de Magma', 'wave', 'slam', '#ff4a10', '#ffb347', true, 2.4),
      atk('Punho Incandescente', 'slam', 'slam', '#ff7a1a', '#ffe14d', false, 2),
      atk('Gêiseres', 'spikes', 'cast', '#ff7a1a', '#ffe14d', true, 2.2),
    ],
  },
  // ------------------------------------------------------------------ ABISSAIS (OLHOS)
  {
    id: 'ophidrax', name: 'Ophidrax', title: 'o Olho que Tudo Vê', arch: 'eye', kind: 0, size: 1.3,
    lore: 'Flutua acima do abismo e não pisca há mil anos. Quem cruza o olhar, esquece o próprio nome.',
    pal: ['#5a2a6a', '#1e0a26', '#ff3a6a', '#ff6af0', '#ffe14d'], feat: { tentacles: 8, eyes: 1 },
    bg: ['#06020a', '#2a0a3a', '#14081a', '#8a2aaa', '#ff6af0'],
    attacks: [
      atk('Olhar Desintegrador', 'gaze', 'shoot', '#ff3a6a', '#ffe14d', true, 2.6),
      atk('Tentáculos do Abismo', 'tentacles', 'swipe', '#5a2a6a', '#ff6af0', true, 2.4),
      atk('Pulso Psíquico', 'nova', 'cast', '#ff6af0', '#ffffff', true, 2),
      atk('Lágrimas Ácidas', 'acid', 'cast', '#9aff4a', '#ffe14d', true, 2.2),
    ],
  },
  {
    id: 'grulganoth', name: "Grul'ganoth", title: 'a Boca do Vazio', arch: 'eye', kind: 1, size: 1.45,
    lore: 'Uma ferida no céu com dentes. Tudo o que cai nela vira silêncio.',
    pal: ['#1a1a2a', '#05050a', '#7a3aff', '#4a2aff', '#ff3a3a'], feat: { tentacles: 10, eyes: 5, mouth: 1 },
    bg: ['#020208', '#0e0a2a', '#0a0a14', '#4a2aff', '#9a7aff'],
    attacks: [
      atk('Vórtice Devorador', 'vortex', 'roar', '#4a2aff', '#9a7aff', true, 2.6),
      atk('Tentáculos', 'tentacles', 'swipe', '#2a2a4a', '#7a3aff', true, 2.4),
      atk('Grito Abissal', 'scream', 'roar', '#9a7aff', '#ffffff', true, 2.2),
      atk('Esferas de Pesadelo', 'orbs', 'cast', '#7a3aff', '#ff3a3a', true, 2.4),
    ],
  },
  {
    id: 'iriscarmesim', name: 'Íris Carmesim', title: 'a Que Chora Sangue', arch: 'eye', kind: 2, size: 1.2,
    lore: 'Nasceu de mil olhares de ódio. Cada lágrima sua é uma lâmina.',
    pal: ['#8a0a1a', '#2a0206', '#ff3a4a', '#ff1a3a', '#ffffff'], feat: { tentacles: 6, eyes: 1, veins: 1 },
    bg: ['#0a0002', '#3a040a', '#1a0204', '#aa0a1a', '#ff4a5a'],
    attacks: [
      atk('Olhar Sangrento', 'gaze', 'shoot', '#ff1a3a', '#ffffff', true, 2.4),
      atk('Drenar Vida', 'drain', 'cast', '#ff1a3a', '#ff9aa0', true, 2.6),
      atk('Espinhos de Sangue', 'spikes', 'slam', '#aa0a1a', '#ff3a4a', true, 2.2),
      atk('Chuva Rubra', 'meteor', 'roar', '#ff1a3a', '#ff9aa0', true, 2.6),
    ],
  },
  {
    id: 'xalthuun', name: "Xal'thuun", title: 'o Sonhador Afogado', arch: 'eye', kind: 3, size: 1.5,
    lore: 'Dorme no fundo do mar e sonha com a superfície. Hoje, o sonho acordou.',
    pal: ['#2a5a4a', '#0a1e1a', '#9aff4a', '#4affb0', '#ffe14d'], feat: { tentacles: 12, eyes: 3, mouth: 1 },
    bg: ['#020a08', '#0a2a24', '#0a1a16', '#2aaa7a', '#9aff4a'],
    attacks: [
      atk('Abraço Abissal', 'tentacles', 'swipe', '#2a5a4a', '#9aff4a', true, 2.6),
      atk('Névoa da Loucura', 'poison', 'cast', '#4affb0', '#9aff4a', true, 2.4),
      atk('Raio Insano', 'beam', 'shoot', '#9aff4a', '#ffffff', true, 2.4),
      atk('Crias do Abismo', 'minions', 'roar', '#2a5a4a', '#4affb0', true, 2.6),
    ],
  },
  // ------------------------------------------------------------------ MORTOS-VIVOS
  {
    id: 'morgrath', name: 'Morgrath', title: 'o Rei Lich', arch: 'undead', kind: 0, size: 1.25,
    lore: 'Trocou o coração por uma filactéria e o reino por um exército de ossos.',
    pal: ['#3a2a4a', '#140a1a', '#4affb0', '#2aff8a', '#4affb0'], feat: { crown: 1, robe: 1, staff: 1 },
    bg: ['#04020a', '#1a0a2a', '#14101a', '#2aff8a', '#9affd0'],
    attacks: [
      atk('Orbes Necróticos', 'orbs', 'cast', '#2aff8a', '#ffffff', true, 2.4),
      atk('Mãos do Túmulo', 'shadowHands', 'slam', '#1a3a2a', '#4affb0', true, 2.4),
      atk('Drenar Alma', 'drain', 'cast', '#4affb0', '#ffffff', true, 2.6),
      atk('Exército Esquelético', 'minions', 'roar', '#d8d0b8', '#2aff8a', true, 2.6),
    ],
  },
  {
    id: 'ossuario', name: 'Ossuário', title: 'o Gigante de Mil Ossos', arch: 'undead', kind: 1, size: 1.55,
    lore: 'Feito dos ossos de todos os que caíram no Vale Branco. Ainda procura mais.',
    pal: ['#d8d0b8', '#5a5040', '#ff3a3a', '#ff6a3a', '#ff3a3a'], feat: { ribs: 1, skulls: 5 },
    bg: ['#0a0806', '#2a2418', '#3a3428', '#8a8070', '#d8d0b8'],
    attacks: [
      atk('Esmagar', 'slam', 'slam', '#d8d0b8', '#ff6a3a', false, 2),
      atk('Lanças de Osso', 'spikes', 'slam', '#e8e0c8', '#ff3a3a', true, 2.2),
      atk('Arremesso de Crânio', 'boulder', 'shoot', '#e8e0c8', '#ff6a3a', false, 2),
      atk('Rugido dos Mortos', 'roar', 'roar', '#d8d0b8', '#ff3a3a', true, 2.2),
    ],
  },
  {
    id: 'vesperine', name: 'Lady Vesperine', title: 'a Noiva Pálida', arch: 'undead', kind: 2, size: 1.05,
    lore: 'Foi pedida em casamento pela própria Noite. Disse sim — e nunca mais viu o sol.',
    pal: ['#e8e0f0', '#3a0a1a', '#ff1a3a', '#aa0a2a', '#ff1a3a'], feat: { wings: 1, dress: 1 },
    bg: ['#08020a', '#2a0a1a', '#1a0a12', '#aa0a2a', '#ff6a8a'],
    attacks: [
      atk('Lâminas de Sangue', 'blades', 'swipe', '#ff1a3a', '#ffffff', true, 2.2),
      atk('Revoada de Morcegos', 'minions', 'cast', '#2a0a1a', '#ff1a3a', true, 2.4),
      atk('Beijo Drenante', 'drain', 'cast', '#ff1a3a', '#ff9aa0', false, 2.4),
      atk('Lua Rubra', 'nova', 'roar', '#ff1a3a', '#ffffff', true, 2.2),
    ],
  },
  {
    id: 'grimhollow', name: 'O Cavaleiro Sem Cabeça', title: 'de Grimhollow', arch: 'undead', kind: 3, size: 1.3,
    lore: 'Perdeu a cabeça num duelo. Desde então, procura uma que sirva.',
    pal: ['#2a2a34', '#0a0a10', '#ff8a1a', '#ff6a1a', '#ffb347'], feat: { horse: 1, lance: 1 },
    bg: ['#04040a', '#1a1428', '#121218', '#ff6a1a', '#ffb347'],
    attacks: [
      atk('Investida Fantasma', 'charge', 'charge', '#ff8a1a', '#ffffff', true, 2),
      atk('Ceifa Sombria', 'claws', 'swipe', '#ffb347', '#ffffff', false, 1.8),
      atk('Fogo-Fátuo', 'orbs', 'cast', '#ff8a1a', '#ffe14d', true, 2.4),
      atk('Chamado da Tumba', 'shadowHands', 'roar', '#2a2a34', '#ff8a1a', true, 2.4),
    ],
  },
  // ------------------------------------------------------------------ ELEMENTAIS
  {
    id: 'ignar', name: 'Ignar', title: 'o Fogo que Anda', arch: 'elemental', kind: 0, size: 1.35,
    lore: 'Um incêndio que aprendeu a andar. Não odeia ninguém — só tem fome de tudo.',
    pal: ['#ff6a1a', '#8a1a04', '#ffe14d', '#ff4a10', '#ffffff'], feat: { flames: 9 },
    bg: ['#100200', '#4a1004', '#1e0602', '#ff4a10', '#ffb347'],
    attacks: [
      atk('Coluna de Chamas', 'judgement', 'cast', '#ff6a1a', '#ffe14d', true, 2.4),
      atk('Bolas de Fogo', 'meteor', 'shoot', '#ff4a10', '#ffe14d', true, 2.4),
      atk('Onda Ardente', 'wave', 'slam', '#ff6a1a', '#ffb347', true, 2.2),
      atk('Explosão Solar', 'nova', 'roar', '#ffe14d', '#ffffff', true, 2.2),
    ],
  },
  {
    id: 'hailstrom', name: 'Hailstrom', title: 'o Espírito da Nevasca', arch: 'elemental', kind: 1, size: 1.3,
    lore: 'Um inverno com raiva. Seu coração é um floco de neve do tamanho de um punho.',
    pal: ['#cfeeff', '#4a7a9a', '#ffffff', '#9fe8ff', '#4af0ff'], feat: { flakes: 1 },
    bg: ['#06101a', '#3a5a7a', '#d8eef8', '#e8f8ff', '#ffffff'],
    attacks: [
      atk('Nevasca', 'vortex', 'roar', '#e8f8ff', '#9fe8ff', true, 2.6),
      atk('Estacas de Gelo', 'spikes', 'slam', '#bff4ff', '#ffffff', true, 2.2),
      atk('Rajada Congelante', 'breath', 'breath', '#bff4ff', '#ffffff', true, 2.4),
      atk('Granizo', 'shards', 'cast', '#e8f8ff', '#4af0ff', true, 2.2),
    ],
  },
  {
    id: 'volturion', name: 'Volturion', title: 'o Trovão Vivo', arch: 'elemental', kind: 2, size: 1.25,
    lore: 'Nasceu quando dois raios caíram no mesmo lugar. Não consegue ficar parado.',
    pal: ['#4ad0ff', '#0a2a5a', '#ffe14d', '#7fe0ff', '#ffffff'], feat: { arcs: 6 },
    bg: ['#020612', '#0e2048', '#101828', '#4ad0ff', '#ffe14d'],
    attacks: [
      atk('Tempestade de Raios', 'lightning', 'cast', '#bfe8ff', '#ffe14d', true, 2.4),
      atk('Esferas Elétricas', 'orbs', 'shoot', '#7fe0ff', '#ffffff', true, 2.2),
      atk('Descarga Total', 'nova', 'roar', '#ffe14d', '#ffffff', true, 2),
      atk('Investida Relâmpago', 'charge', 'charge', '#4ad0ff', '#ffffff', false, 1.8),
    ],
  },
  {
    id: 'zahrim', name: 'Zahrim', title: 'a Tempestade de Areia', arch: 'elemental', kind: 3, size: 1.45,
    lore: 'O deserto inteiro, furioso, girando em forma de gigante. Leva caravanas como poeira.',
    pal: ['#d8a860', '#6a4a20', '#ffe9a8', '#ffcc66', '#ff9a3a'], feat: { swirl: 1 },
    bg: ['#1a1006', '#7a5a2a', '#c8a060', '#e8c080', '#ffe9a8'],
    attacks: [
      atk('Tornado de Areia', 'vortex', 'roar', '#d8a860', '#ffe9a8', true, 2.6),
      atk('Lâminas de Vento', 'blades', 'swipe', '#ffe9a8', '#ffffff', true, 2),
      atk('Areia Movediça', 'quake', 'slam', '#c8a060', '#6a4a20', true, 2.4),
      atk('Chuva de Pedras', 'boulder', 'cast', '#8a6a40', '#ffcc66', true, 2.2),
    ],
  },
  // ------------------------------------------------------------------ INSETOS
  {
    id: 'thessa', name: 'Thessa', title: 'a Rainha Louva-a-Deus', arch: 'insect', kind: 0, size: 1.3,
    lore: 'Reza antes de cada caçada. Ninguém sabe para quem — mas a reza sempre é atendida.',
    pal: ['#4ab04a', '#14401a', '#ffe14d', '#9aff4a', '#ff3a3a'], feat: { legs: 4 },
    bg: ['#020a02', '#143a14', '#0e200e', '#4ab04a', '#9aff4a'],
    attacks: [
      atk('Foices Gêmeas', 'claws', 'swipe', '#9aff4a', '#ffffff', false, 1.8),
      atk('Salto Predador', 'charge', 'charge', '#4ab04a', '#ffe14d', false, 1.8),
      atk('Lâminas Verdes', 'blades', 'cast', '#9aff4a', '#ffe14d', true, 2.2),
      atk('Ferroada Venenosa', 'acid', 'shoot', '#9aff4a', '#4ab04a', true, 2.2),
    ],
  },
  {
    id: 'azhrak', name: 'Azhrak', title: 'o Escorpião Rei', arch: 'insect', kind: 1, size: 1.4,
    lore: 'Seu ferrão matou um deus menor. Ele guarda o veneno do deus num frasco.',
    pal: ['#2a1a10', '#0a0604', '#ff3a1a', '#ff6a1a', '#ff3a1a'], feat: { legs: 8 },
    bg: ['#100802', '#5a3a14', '#8a6a3a', '#c8a060', '#ffcc66'],
    attacks: [
      atk('Ferrão Mortal', 'tail', 'swipe', '#ff3a1a', '#9aff4a', false, 2),
      atk('Pinças Esmagadoras', 'claws', 'swipe', '#ff6a1a', '#ffffff', false, 1.8),
      atk('Veneno do Deserto', 'poison', 'cast', '#9aff4a', '#ffe14d', true, 2.4),
      atk('Emergir da Areia', 'spikes', 'slam', '#c8a060', '#ff3a1a', true, 2.2),
    ],
  },
  {
    id: 'aracnara', name: 'Aracnara', title: 'a Tecelã da Noite', arch: 'insect', kind: 2, size: 1.3,
    lore: 'Tece teias entre as estrelas. Os sonhos ruins que você tem? Ficaram presos nelas.',
    pal: ['#1a1420', '#06040a', '#b57cff', '#ff3af0', '#ff3a3a'], feat: { legs: 8, eyes: 8 },
    bg: ['#030206', '#140a20', '#0a0810', '#6a2aaa', '#e8e0f8'],
    attacks: [
      atk('Teia Gigante', 'web', 'shoot', '#e8e0f8', '#b57cff', true, 2.4),
      atk('Ninhada', 'minions', 'roar', '#1a1420', '#ff3a3a', true, 2.4),
      atk('Ácido Corrosivo', 'acid', 'shoot', '#9aff4a', '#ffe14d', true, 2.2),
      atk('Bote Mortal', 'charge', 'charge', '#b57cff', '#ffffff', false, 1.8),
    ],
  },
  {
    id: 'khepros', name: 'Khepros', title: 'o Besouro Titã', arch: 'insect', kind: 3, size: 1.45,
    lore: 'Empurra o sol pelo céu todos os dias. Hoje tirou folga para lutar.',
    pal: ['#1a5a6a', '#0a1e26', '#ffcc33', '#4af0ff', '#ffcc33'], feat: { legs: 6, horn: 1 },
    bg: ['#060806', '#3a3014', '#5a4a24', '#ffcc33', '#ffe9a8'],
    attacks: [
      atk('Carapaça Rolante', 'charge', 'charge', '#4af0ff', '#ffcc33', true, 2),
      atk('Enxame', 'minions', 'roar', '#1a5a6a', '#ffcc33', true, 2.4),
      atk('Chifre Trovejante', 'slam', 'slam', '#ffcc33', '#ffffff', false, 2),
      atk('Raio do Sol', 'beam', 'shoot', '#ffcc33', '#ffffff', true, 2.4),
    ],
  },
  // ------------------------------------------------------------------ MÁQUINAS
  {
    id: 'mkzero', name: 'MK-ZERO', title: 'o Juggernaut', arch: 'machine', kind: 0, size: 1.4,
    lore: 'Protótipo de guerra que fugiu do laboratório. Ainda executa a missão: "eliminar tudo".',
    pal: ['#5a6470', '#1e2228', '#ff3a3a', '#ff4a3a', '#ff3a3a'], feat: { guns: 2 },
    bg: ['#06080a', '#1e2a34', '#20262c', '#ff3a3a', '#ffb060'],
    attacks: [
      atk('Metralhadora', 'gatling', 'shoot', '#ffcc33', '#ff6a1a', true, 2.4),
      atk('Salva de Mísseis', 'missiles', 'shoot', '#ff6a1a', '#e8e8e8', true, 2.6),
      atk('Canhão de Plasma', 'beam', 'shoot', '#4af0ff', '#ffffff', true, 2.4),
      atk('Pisada Hidráulica', 'quake', 'slam', '#9aa0a8', '#ff6a1a', true, 2.2),
    ],
  },
  {
    id: 'relojoeiro', name: 'O Relojoeiro', title: 'Senhor das Horas Perdidas', arch: 'machine', kind: 1, size: 1.25,
    lore: 'Conserta o tempo quando ele quebra. Às vezes quebra de propósito.',
    pal: ['#c8963a', '#4a3010', '#4af0ff', '#ffcc66', '#4af0ff'], feat: { gears: 5 },
    bg: ['#0a0804', '#2a1e0a', '#1e160a', '#ffcc66', '#ffe9a8'],
    attacks: [
      atk('Engrenagens Cortantes', 'blades', 'cast', '#c8963a', '#ffe9a8', true, 2.2),
      atk('Ponteiros do Tempo', 'spikes', 'slam', '#ffcc66', '#4af0ff', true, 2.2),
      atk('Badalada do Fim', 'nova', 'roar', '#ffcc66', '#ffffff', true, 2.2),
      atk('Molas Explosivas', 'boulder', 'shoot', '#c8963a', '#ff6a1a', true, 2),
    ],
  },
  {
    id: 'omega', name: 'Sentinela Ômega', title: 'o Olho de Aço', arch: 'machine', kind: 2, size: 1.2,
    lore: 'Satélite de vigilância que caiu do céu. Agora vigia você. De muito perto.',
    pal: ['#d8dce4', '#3a4048', '#ff3a3a', '#ff4a4a', '#ff3a3a'], feat: { drones: 4 },
    bg: ['#020408', '#101a2a', '#141820', '#ff3a3a', '#7fe0ff'],
    attacks: [
      atk('Laser de Varredura', 'gaze', 'shoot', '#ff3a3a', '#ffffff', true, 2.6),
      atk('Drones de Ataque', 'minions', 'cast', '#d8dce4', '#ff3a3a', true, 2.4),
      atk('Pulso EMP', 'nova', 'cast', '#7fe0ff', '#ffffff', true, 2),
      atk('Mísseis Teleguiados', 'missiles', 'shoot', '#ff6a1a', '#ffffff', true, 2.4),
    ],
  },
  {
    id: 'dravex', name: 'Dravex', title: 'a Forja de Guerra Ambulante', arch: 'machine', kind: 3, size: 1.5,
    lore: 'Uma fábrica de armas com pernas. Cada parafuso seu foi feito para ferir.',
    pal: ['#4a3a2a', '#1a140e', '#ff6a1a', '#ff8a2a', '#ffcc33'], feat: { treads: 1, saw: 1 },
    bg: ['#0a0604', '#2a1a0a', '#2a2018', '#ff6a1a', '#ffb060'],
    attacks: [
      atk('Lança-Chamas', 'breath', 'breath', '#ff6a1a', '#ffe14d', true, 2.6),
      atk('Bombardeio', 'meteor', 'shoot', '#ff6a1a', '#e8e8e8', true, 2.6),
      atk('Serra Giratória', 'blades', 'swipe', '#c8c8c8', '#ff6a1a', false, 2),
      atk('Esteira Esmagadora', 'charge', 'charge', '#4a3a2a', '#ff8a2a', true, 2),
    ],
  },
  // ------------------------------------------------------------------ DEUSES CAÍDOS
  {
    id: 'seraphiel', name: 'Seraphiel', title: 'a Luz Caída', arch: 'deity', kind: 0, size: 1.3,
    lore: 'Expulsa do céu por perguntar demais. Desceu ainda brilhando — e com muita raiva.',
    pal: ['#f8f0e0', '#8a7040', '#ffe14d', '#fff2a8', '#4af0ff'], feat: { wings: 3, halo: 1 },
    bg: ['#0a0802', '#4a3a1a', '#2a2418', '#ffe14d', '#ffffff'],
    attacks: [
      atk('Julgamento', 'judgement', 'cast', '#ffe14d', '#ffffff', true, 2.6),
      atk('Lâminas de Luz', 'blades', 'cast', '#fff2a8', '#ffffff', true, 2.2),
      atk('Asas Cortantes', 'claws', 'swipe', '#ffffff', '#ffe14d', true, 1.8),
      atk('Explosão Divina', 'nova', 'roar', '#ffe14d', '#ffffff', true, 2.2),
    ],
  },
  {
    id: 'kaalmara', name: 'Kaal-Mara', title: 'a Deusa de Mil Braços', arch: 'deity', kind: 1, size: 1.4,
    lore: 'Dança para destruir mundos velhos e abrir espaço para os novos. Você é o mundo velho.',
    pal: ['#3a6ab0', '#10204a', '#ffcc33', '#ff6af0', '#ffcc33'], feat: { arms: 8, halo: 1 },
    bg: ['#04060e', '#1a2a5a', '#14183a', '#ff6af0', '#ffcc33'],
    attacks: [
      atk('Chuva de Lâminas', 'blades', 'cast', '#ffcc33', '#ffffff', true, 2.4),
      atk('Dança da Destruição', 'claws', 'swipe', '#ff6af0', '#ffcc33', true, 2.2),
      atk('Olho Divino', 'beam', 'shoot', '#ff6af0', '#ffffff', true, 2.4),
      atk('Palmas do Trovão', 'lightning', 'slam', '#ffcc33', '#ffffff', true, 2.2),
    ],
  },
  {
    id: 'anubhar', name: 'Anubhar', title: 'o Pesador de Almas', arch: 'deity', kind: 2, size: 1.35,
    lore: 'Pesa o coração de cada guerreiro contra uma pena. Até hoje a pena sempre ganhou.',
    pal: ['#1a1a1e', '#06060a', '#ffcc33', '#4af0ff', '#ffcc33'], feat: { staff: 1, ears: 1 },
    bg: ['#080604', '#3a2a10', '#c8a060', '#e8c080', '#ffcc33'],
    attacks: [
      atk('Balança da Morte', 'drain', 'cast', '#4af0ff', '#ffcc33', true, 2.6),
      atk('Areias do Tempo', 'vortex', 'roar', '#e8c080', '#ffcc33', true, 2.4),
      atk('Pilar Solar', 'judgement', 'cast', '#ffcc33', '#ffffff', true, 2.4),
      atk('Escaravelhos', 'minions', 'slam', '#1a5a6a', '#ffcc33', true, 2.4),
    ],
  },
  {
    id: 'oberon', name: 'Oberon Caído', title: 'o Rei sem Coroa', arch: 'deity', kind: 3, size: 1.45,
    lore: 'Governava o céu noturno. Perdeu a coroa numa aposta e decidiu que ninguém mais teria uma.',
    pal: ['#2a1a3a', '#0a0612', '#ff3a6a', '#b57cff', '#ff3a6a'], feat: { wings: 2, horns: 2, cape: 1 },
    bg: ['#030208', '#160a2a', '#0e0a16', '#8a3aff', '#ff3a6a'],
    attacks: [
      atk('Coroa de Espinhos', 'spikes', 'slam', '#ff3a6a', '#b57cff', true, 2.2),
      atk('Cometa Negro', 'meteor', 'cast', '#8a3aff', '#ff3a6a', true, 2.6),
      atk('Mãos do Abismo', 'shadowHands', 'cast', '#2a1a3a', '#b57cff', true, 2.4),
      atk('Grito Divino', 'scream', 'roar', '#ff3a6a', '#ffffff', true, 2.2),
    ],
  },
  // ------------------------------------------------------------------ SERPENTES / MAR
  {
    id: 'leviata', name: 'Leviatã', title: 'o Abismo que Respira', arch: 'serpent', kind: 0, size: 1.55,
    lore: 'Quando ele boceja, nasce uma maré. Quando acorda de vez, somem ilhas.',
    pal: ['#1a4a6a', '#06141e', '#4af0ff', '#2ad0ff', '#ffe14d'], feat: { fins: 1 },
    bg: ['#020812', '#0a2a4a', '#0a2a3a', '#2a8aaa', '#bfe8ff'],
    attacks: [
      atk('Tsunami', 'wave', 'roar', '#2a8aaa', '#bfe8ff', true, 2.8),
      atk('Jato Abissal', 'beam', 'breath', '#4af0ff', '#ffffff', true, 2.4),
      atk('Mordida Colossal', 'charge', 'charge', '#1a4a6a', '#ffffff', false, 1.8),
      atk('Redemoinho', 'vortex', 'swipe', '#2a8aaa', '#bfe8ff', true, 2.4),
    ],
  },
  {
    id: 'thalassor', name: 'Thalassor', title: 'o Kraken Ancestral', arch: 'serpent', kind: 1, size: 1.5,
    lore: 'Afundou mais navios do que existem no mar hoje. Guarda os mastros como troféus.',
    pal: ['#8a2a3a', '#2a0a10', '#ffcc66', '#ff6a8a', '#ffcc33'], feat: { tentacles: 8 },
    bg: ['#02060c', '#0a1e30', '#0a1a24', '#2a6a8a', '#bfe8ff'],
    attacks: [
      atk('Tentáculos Colossais', 'tentacles', 'swipe', '#8a2a3a', '#ff6a8a', true, 2.6),
      atk('Tinta Negra', 'poison', 'shoot', '#1a1a2a', '#6a2aaa', true, 2.4),
      atk('Onda Gigante', 'wave', 'slam', '#2a6a8a', '#bfe8ff', true, 2.6),
      atk('Abraço Afogador', 'drain', 'cast', '#2a6a8a', '#ff6a8a', false, 2.4),
    ],
  },
  {
    id: 'hidra', name: 'Hidra', title: 'de Três Cabeças', arch: 'serpent', kind: 2, size: 1.45,
    lore: 'Corte uma cabeça e nascem duas. Corte as duas e ela fica… levemente irritada.',
    pal: ['#3a6a2a', '#10200a', '#ffe14d', '#9aff4a', '#ffe14d'], feat: { heads: 3 },
    bg: ['#040802', '#1e3a10', '#14200c', '#6aaa2a', '#9aff4a'],
    attacks: [
      atk('Sopro Triplo', 'breath', 'breath', '#9aff4a', '#ff6a1a', true, 2.6),
      atk('Cuspe Ácido', 'acid', 'shoot', '#9aff4a', '#ffe14d', true, 2.2),
      atk('Mordidas Cruzadas', 'charge', 'charge', '#3a6a2a', '#ffffff', false, 2),
      atk('Regenerar', 'drain', 'roar', '#9aff4a', '#ffffff', true, 2.4),
    ],
  },
  {
    id: 'quetzaryn', name: 'Quetzaryn', title: 'a Serpente Emplumada', arch: 'serpent', kind: 3, size: 1.35,
    lore: 'Traz o vento e a chuva para quem a honra. Para quem a desafia, traz só o vento — muito vento.',
    pal: ['#1aaa7a', '#0a3a2a', '#ff3a6a', '#4affb0', '#ffe14d'], feat: { feathers: 1 },
    bg: ['#020a08', '#0e3a2a', '#1a2a14', '#4affb0', '#ffe14d'],
    attacks: [
      atk('Penas Cortantes', 'blades', 'swipe', '#4affb0', '#ff3a6a', true, 2.2),
      atk('Vento Sagrado', 'vortex', 'roar', '#bfffe8', '#4affb0', true, 2.4),
      atk('Raio do Sol', 'beam', 'breath', '#ffe14d', '#ffffff', true, 2.4),
      atk('Tempestade de Plumas', 'petals', 'cast', '#ff3a6a', '#4affb0', true, 2.4),
    ],
  },
  // ------------------------------------------------------------------ ESPÍRITOS
  {
    id: 'lamuria', name: 'Lamúria', title: 'a Banshee do Pântano', arch: 'spirit', kind: 0, size: 1.15,
    lore: 'Chora por todos que vão morrer naquela noite. Hoje, chora olhando para você.',
    pal: ['#bfe8e0', '#2a4a4a', '#ffffff', '#9affe8', '#ffffff'], feat: { hair: 1 },
    bg: ['#020606', '#0e2a2a', '#0a1a18', '#4affd0', '#bfffe8'],
    attacks: [
      atk('Grito da Morte', 'scream', 'roar', '#bfffe8', '#ffffff', true, 2.4),
      atk('Lamento', 'drain', 'cast', '#9affe8', '#ffffff', true, 2.4),
      atk('Correntes Espectrais', 'shadowHands', 'cast', '#2a4a4a', '#9affe8', true, 2.4),
      atk('Névoa Gélida', 'poison', 'cast', '#bfe8e0', '#ffffff', true, 2.2),
    ],
  },
  {
    id: 'errante', name: 'O Errante', title: 'de Cinzas', arch: 'spirit', kind: 1, size: 1.25,
    lore: 'O que sobrou de um feiticeiro que tentou roubar o fogo do sol. Ainda queima por dentro.',
    pal: ['#3a3434', '#0e0c0c', '#ff6a1a', '#ff4a1a', '#ffe14d'], feat: { scythe: 1 },
    bg: ['#060404', '#2a1410', '#141010', '#ff4a1a', '#8a7a70'],
    attacks: [
      atk('Chuva de Cinzas', 'meteor', 'roar', '#8a7a70', '#ff6a1a', true, 2.6),
      atk('Chama Fria', 'orbs', 'cast', '#4af0ff', '#ffffff', true, 2.2),
      atk('Foice Espectral', 'claws', 'swipe', '#ff6a1a', '#ffffff', false, 1.8),
      atk('Assombrar', 'charge', 'charge', '#3a3434', '#ff6a1a', true, 2),
    ],
  },
  {
    id: 'kitsurai', name: 'Kitsurai', title: 'a Raposa de Nove Caudas', arch: 'spirit', kind: 2, size: 1.25,
    lore: 'Mil anos de idade, nove caudas e nenhuma paciência para guerreiros mal-educados.',
    pal: ['#f8e8d0', '#8a5a2a', '#ff3a6a', '#ff8a3a', '#ffcc33'], feat: { tails: 9 },
    bg: ['#08040a', '#2a1428', '#1a0e14', '#ff8a3a', '#ff9af0'],
    attacks: [
      atk('Fogo de Raposa', 'orbs', 'cast', '#4af0ff', '#ffffff', true, 2.4),
      atk('Ilusões', 'minions', 'cast', '#f8e8d0', '#ff3a6a', true, 2.4),
      atk('Caudas Flamejantes', 'tail', 'swipe', '#ff8a3a', '#ffe14d', true, 2.2),
      atk('Uivo Lunar', 'roar', 'roar', '#ff9af0', '#ffffff', true, 2),
    ],
  },
  {
    id: 'guardiao', name: 'O Guardião', title: 'das Almas Perdidas', arch: 'spirit', kind: 3, size: 1.35,
    lore: 'Carrega uma lanterna com todas as almas que se perderam no caminho. Quer mais luz.',
    pal: ['#2a2a3a', '#0a0a14', '#ffe14d', '#ffcc66', '#ffe14d'], feat: { lantern: 1 },
    bg: ['#020208', '#121228', '#0a0a14', '#ffcc66', '#9a9aff'],
    attacks: [
      atk('Luz da Lanterna', 'beam', 'shoot', '#ffe14d', '#ffffff', true, 2.4),
      atk('Almas Errantes', 'minions', 'cast', '#9a9aff', '#ffffff', true, 2.4),
      atk('Recolher Almas', 'drain', 'cast', '#ffcc66', '#9a9aff', true, 2.6),
      atk('Correntes do Barqueiro', 'shadowHands', 'slam', '#2a2a3a', '#ffe14d', true, 2.2),
    ],
  },
  // ------------------------------------------------------------------ BIZARROS
  {
    id: 'gluttonox', name: 'Gluttonox', title: 'a Massa Faminta', arch: 'blob', kind: 0, size: 1.4,
    lore: 'Começou como uma gota de lodo. Comeu uma cidade. Ainda está na entrada.',
    pal: ['#7ad04a', '#2a5a14', '#ff3af0', '#9aff4a', '#ffe14d'], feat: { eyes: 7 },
    bg: ['#040802', '#1a3a0a', '#14200a', '#7ad04a', '#ff3af0'],
    attacks: [
      atk('Engolir', 'vortex', 'roar', '#7ad04a', '#9aff4a', true, 2.4),
      atk('Jato Ácido', 'acid', 'shoot', '#9aff4a', '#ffe14d', true, 2.2),
      atk('Divisão', 'minions', 'slam', '#7ad04a', '#ff3af0', true, 2.4),
      atk('Esmagamento Gosmento', 'slam', 'slam', '#7ad04a', '#ffffff', true, 2.2),
    ],
  },
  {
    id: 'milbocas', name: 'Mil-Bocas', title: 'o Coro Faminto', arch: 'blob', kind: 1, size: 1.35,
    lore: 'Cada boca canta uma nota. Juntas, cantam o seu fim.',
    pal: ['#d88a9a', '#5a2a34', '#ffffff', '#ff6a8a', '#ffe14d'], feat: { mouths: 9 },
    bg: ['#0a0406', '#3a1420', '#1e0a10', '#ff6a8a', '#ffd0d8'],
    attacks: [
      atk('Dentadas', 'blades', 'swipe', '#ffffff', '#ff6a8a', true, 2.2),
      atk('Coral do Fim', 'scream', 'roar', '#ff6a8a', '#ffffff', true, 2.4),
      atk('Saliva Corrosiva', 'acid', 'shoot', '#ffe14d', '#9aff4a', true, 2.2),
      atk('Mordida em Massa', 'charge', 'charge', '#d88a9a', '#ffffff', false, 2),
    ],
  },
  {
    id: 'ovocosmico', name: 'O Ovo Cósmico', title: 'Aquilo que Vai Nascer', arch: 'blob', kind: 2, size: 1.3,
    lore: 'Ninguém sabe o que tem dentro. Ninguém quer saber. Ele já está rachando.',
    pal: ['#1a1a3a', '#05050f', '#ff9af0', '#7a5aff', '#ffffff'], feat: { cracks: 1, stars: 1 },
    bg: ['#010104', '#0a0a24', '#0a0814', '#7a5aff', '#ffffff'],
    attacks: [
      atk('Estrelas Cadentes', 'meteor', 'cast', '#ffffff', '#ff9af0', true, 2.6),
      atk('Pulso Cósmico', 'nova', 'roar', '#7a5aff', '#ffffff', true, 2.2),
      atk('Rachadura da Realidade', 'beam', 'shoot', '#ff9af0', '#ffffff', true, 2.4),
      atk('Gravidade Zero', 'vortex', 'cast', '#7a5aff', '#ff9af0', true, 2.4),
    ],
  },
  {
    id: 'botoes', name: 'Senhor Botões', title: 'o Boneco Remendado', arch: 'blob', kind: 3, size: 1.25,
    lore: 'Um brinquedo esquecido no sótão por cem anos. Cresceu. E aprendeu a costurar gente.',
    pal: ['#c8a080', '#5a3a2a', '#ff3a3a', '#ff6a6a', '#1a1a1a'], feat: { stitches: 1 },
    bg: ['#080604', '#2a1e18', '#1e1610', '#aa6a4a', '#ffd0a0'],
    attacks: [
      atk('Chuva de Agulhas', 'shards', 'cast', '#e8e8e8', '#ff3a3a', true, 2.2),
      atk('Fios de Marionete', 'web', 'cast', '#e8d0c0', '#ff3a3a', true, 2.4),
      atk('Tesourada', 'claws', 'swipe', '#c8c8c8', '#ffffff', false, 1.8),
      atk('Risada Macabra', 'scream', 'roar', '#ff6a6a', '#ffffff', true, 2.2),
    ],
  },
  // ------------------------------------------------------------------ FERAS
  {
    id: 'fenrak', name: 'Fenrak', title: 'o Lobo do Fim', arch: 'beast', kind: 0, size: 1.4,
    lore: 'Dizem que vai engolir a lua no último dia. Está treinando com guerreiros.',
    pal: ['#5a6070', '#1a1e26', '#bfe8ff', '#7fe0ff', '#4af0ff'], feat: { mane: 1 },
    bg: ['#02040a', '#14203a', '#c8d8e8', '#bfe8ff', '#ffffff'],
    attacks: [
      atk('Uivo Glacial', 'roar', 'roar', '#bfe8ff', '#ffffff', true, 2.2),
      atk('Bote Selvagem', 'charge', 'charge', '#5a6070', '#ffffff', false, 1.8),
      atk('Garras do Fim', 'claws', 'swipe', '#7fe0ff', '#ffffff', true, 1.8),
      atk('Lua de Gelo', 'shards', 'cast', '#bfe8ff', '#4af0ff', true, 2.4),
    ],
  },
  {
    id: 'ursaroth', name: 'Ursaroth', title: 'o Urso Rúnico', arch: 'beast', kind: 1, size: 1.5,
    lore: 'Xamãs gravaram runas no seu pelo para protegê-lo. Funcionou bem demais.',
    pal: ['#6a4a2a', '#2a1a0a', '#4af0ff', '#4ad0ff', '#4af0ff'], feat: { runes: 1 },
    bg: ['#040806', '#1a2a1a', '#1a2014', '#4ad0ff', '#bfe8ff'],
    attacks: [
      atk('Patada Rúnica', 'claws', 'swipe', '#4af0ff', '#ffffff', false, 1.8),
      atk('Pancada Sísmica', 'slam', 'slam', '#6a4a2a', '#4af0ff', true, 2.2),
      atk('Rugido Ancestral', 'roar', 'roar', '#4ad0ff', '#ffffff', true, 2.2),
      atk('Círculo de Runas', 'judgement', 'cast', '#4af0ff', '#ffffff', true, 2.4),
    ],
  },
  {
    id: 'trifauce', name: 'Trifauce', title: 'a Quimera', arch: 'beast', kind: 2, size: 1.4,
    lore: 'Leão, bode e serpente discutindo quem manda. Concordam em uma coisa só: você.',
    pal: ['#c8963a', '#4a3010', '#9aff4a', '#ff6a1a', '#ffe14d'], feat: { goat: 1, snake: 1, wings: 1 },
    bg: ['#0a0604', '#3a2410', '#2a2014', '#ff6a1a', '#ffcc66'],
    attacks: [
      atk('Fogo do Leão', 'breath', 'breath', '#ff6a1a', '#ffe14d', true, 2.4),
      atk('Ferrão da Serpente', 'tail', 'swipe', '#9aff4a', '#ffffff', false, 2),
      atk('Chifrada do Bode', 'charge', 'charge', '#c8963a', '#ffffff', false, 1.8),
      atk('Hálito Venenoso', 'poison', 'roar', '#9aff4a', '#ffe14d', true, 2.4),
    ],
  },
  {
    id: 'behemoth', name: 'Behemoth', title: 'das Planícies Rachadas', arch: 'beast', kind: 3, size: 1.6,
    lore: 'Quando corre, a terra treme em três reinos. Quando para, é porque achou algo para esmagar.',
    pal: ['#5a3a2a', '#1e120a', '#ff3a1a', '#ff6a1a', '#ff3a1a'], feat: { tusks: 1, armor: 1 },
    bg: ['#0a0604', '#3a1e10', '#4a3020', '#c8804a', '#ffb060'],
    attacks: [
      atk('Estouro', 'charge', 'charge', '#c8804a', '#ffffff', true, 2),
      atk('Pisoteio', 'quake', 'slam', '#8a6a4a', '#ffb060', true, 2.4),
      atk('Chifres Furiosos', 'slam', 'slam', '#ff6a1a', '#ffffff', false, 2),
      atk('Bufo Fervente', 'breath', 'breath', '#e8e8e8', '#ff6a1a', true, 2.2),
    ],
  },
  // ------------------------------------------------------------------ PLANTAS
  {
    id: 'thornwood', name: 'Thornwood', title: 'o Carvalho Ancião', arch: 'plant', kind: 0, size: 1.55,
    lore: 'Plantado no primeiro dia do mundo. Lembra de cada machado que já o tocou.',
    pal: ['#5a4030', '#2a1a10', '#7ad04a', '#9aff4a', '#ffe14d'], feat: { leaves: 1 },
    bg: ['#020602', '#14301a', '#1a2410', '#7ad04a', '#c8ff9a'],
    attacks: [
      atk('Raízes Esmagadoras', 'spikes', 'slam', '#5a4030', '#7ad04a', true, 2.2),
      atk('Galhos Chicote', 'tentacles', 'swipe', '#5a4030', '#9aff4a', true, 2.4),
      atk('Folhas Navalha', 'petals', 'cast', '#7ad04a', '#ffe14d', true, 2.2),
      atk('Seiva da Terra', 'drain', 'roar', '#9aff4a', '#ffe14d', true, 2.4),
    ],
  },
  {
    id: 'rafflesia', name: 'Rafflesia', title: 'a Flor Carnívora', arch: 'plant', kind: 1, size: 1.35,
    lore: 'Atrai suas presas com um perfume doce. Você sentiu? Pois é.',
    pal: ['#c82a4a', '#4a0a1a', '#ffe14d', '#ff6a8a', '#ffe14d'], feat: { petals: 6 },
    bg: ['#060204', '#2a0a14', '#14100a', '#ff6a8a', '#ffe14d'],
    attacks: [
      atk('Mordida Floral', 'charge', 'charge', '#c82a4a', '#ffffff', false, 1.8),
      atk('Esporos Tóxicos', 'poison', 'roar', '#ffe14d', '#9aff4a', true, 2.4),
      atk('Tempestade de Pétalas', 'petals', 'cast', '#ff6a8a', '#ffe14d', true, 2.2),
      atk('Cipós Constritores', 'tentacles', 'swipe', '#3a6a2a', '#9aff4a', true, 2.4),
    ],
  },
  {
    id: 'myconid', name: 'Myconid', title: 'o Rei Cogumelo', arch: 'plant', kind: 2, size: 1.3,
    lore: 'Toda a floresta é conectada às suas raízes. Ele sabe que você está aqui desde a entrada.',
    pal: ['#8a3aaa', '#2a0a3a', '#4af0ff', '#b57cff', '#4af0ff'], feat: { spots: 1 },
    bg: ['#04020a', '#1a0a2a', '#120a14', '#b57cff', '#4af0ff'],
    attacks: [
      atk('Nuvem de Esporos', 'poison', 'roar', '#b57cff', '#4af0ff', true, 2.4),
      atk('Brotar Cogumelos', 'minions', 'slam', '#8a3aaa', '#4af0ff', true, 2.4),
      atk('Pancada do Chapéu', 'slam', 'slam', '#8a3aaa', '#ffffff', false, 2),
      atk('Bioluminescência', 'nova', 'cast', '#4af0ff', '#ffffff', true, 2.2),
    ],
  },
  {
    id: 'sakuraya', name: 'Sakuraya', title: 'a Árvore que Sangra', arch: 'plant', kind: 3, size: 1.5,
    lore: 'Suas flores são lindas porque bebem o que cai debaixo delas.',
    pal: ['#3a1a1a', '#140808', '#ff9ab0', '#ff6a8a', '#ff1a3a'], feat: { blossoms: 1 },
    bg: ['#060204', '#2a0a14', '#1a0a0e', '#ff6a8a', '#ffd0d8'],
    attacks: [
      atk('Tempestade de Pétalas', 'petals', 'cast', '#ff9ab0', '#ffffff', true, 2.4),
      atk('Raízes Sangrentas', 'spikes', 'slam', '#aa0a1a', '#ff6a8a', true, 2.2),
      atk('Beber a Vida', 'drain', 'cast', '#ff1a3a', '#ff9ab0', true, 2.6),
      atk('Florescer', 'nova', 'roar', '#ff9ab0', '#ffffff', true, 2.2),
    ],
  },
];

export const BOSSES: BossSpec[] = DEFS.map((d) => ({
  id: d.id,
  name: d.name,
  title: d.title,
  lore: d.lore,
  arch: d.arch,
  size: d.size,
  pal: { body: d.pal[0], dark: d.pal[1], accent: d.pal[2], glow: d.pal[3], eye: d.pal[4] },
  feat: { kind: d.kind, ...(d.feat ?? {}) },
  bg: { sky: [d.bg[0], d.bg[1]], ground: d.bg[2], fog: d.bg[3], particle: d.bg[4] },
  attacks: d.attacks.map((a, i) => ({ ...a, id: `${d.id}-${i}` })),
}));

export const BOSSES_BY_ID: Record<string, BossSpec> = Object.assign(Object.create(null), Object.fromEntries(BOSSES.map((b) => [b.id, b])));
