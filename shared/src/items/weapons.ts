/**
 * ============================================================
 *  GYMBATTLE — ARMAS (60 originais + 100 do arsenal = 160)
 * ============================================================
 * Para ajustar uma arma, altere os números aqui ou em arsenal.ts (preço,
 * requisitos, dano, custo). Os padrões de cada categoria ficam em
 * weaponKit.ts (CATEGORY) e o ajuste fino de dano em tuning.ts.
 */
import type { WeaponDef } from './types.js';
import { group } from './weaponKit.js';
import { ARSENAL } from './arsenal.js';

// ====================================================================
// 6 ESPADAS RETAS
// ====================================================================
const swords = group('sword', [
  {
    id: 'espada-curta-recruta', name: 'Espada Curta do Recruta', rarity: 'common', price: 250, starter: true, dmg: 1.15,
    req: { dex: 8 }, scale: { dex: 'C', str: 'D' },
    lore: 'Forjada às pressas para os novatos da guarda. Leve, honesta e sempre pronta.',
    a1: ['Corte triplo', 'Corte rápido em 3 golpes.', 'combo', 'multi_slash', { hits: 3 }],
    a2: ['Estocada', 'Estocada com avanço curto.', 'dash', 'thrust', { range: 110 }],
    look: { blade: '#c9ced6', handle: '#6b4a2f' },
  },
  {
    id: 'espada-longa-guarda', name: 'Espada Longa da Guarda', rarity: 'common', price: 340,
    req: { str: 11, dex: 9 }, scale: { str: 'C', dex: 'C' },
    lore: 'A arma padrão dos muros da cidade. Nenhum portão caiu enquanto ela estava de vigia.',
    a1: ['Corte cruzado', 'Dois cortes em X.', 'combo', 'slash', { hits: 2 }],
    a2: ['Golpe do escudo', 'Investida com o ombro seguida de corte descendente.', 'dash', 'heavy_slash', { range: 100 }],
    look: { blade: '#d4d8de', handle: '#3a3a44' },
  },
  {
    id: 'lamina-do-peregrino', name: 'Lâmina do Peregrino', rarity: 'uncommon', price: 820,
    req: { dex: 16, fai: 8 }, scale: { dex: 'C', fai: 'D' }, el: 'holy',
    lore: 'Carregada por andarilhos que atravessaram o deserto em jejum. Ainda cheira a incenso.',
    a1: ['Corte votivo', 'Corte leve que brilha em dourado.', 'melee', 'slash'],
    a2: ['Juramento de luz', 'Estocada que libera um pulso sagrado curto.', 'dash', 'holy_nova', { range: 105, mana: 8 }],
    look: { blade: '#e8e2c8', handle: '#8a6a2a', glow: '#ffd86b' },
  },
  {
    id: 'espada-rubra', name: 'Espada Rubra do Carrasco', rarity: 'rare', price: 2100,
    req: { str: 16, dex: 16 }, scale: { str: 'B', dex: 'B' }, el: 'blood',
    lore: 'Cada execução deixou uma gota que nunca secou. O aço bebe o que corta.',
    a1: ['Corte sangrento', 'Corte que causa sangramento.', 'melee', 'blood_slash', { status: { type: 'bleed', chance: 0.35, duration: 3000 } }],
    a2: ['Veredito', 'Salto curto com corte vertical brutal.', 'leap', 'blood_slash', { power: 2.1, range: 130 }],
    look: { blade: '#b3263a', handle: '#2a1418', glow: '#e0243b' },
  },
  {
    id: 'espada-do-vendaval', name: 'Espada do Vendaval', rarity: 'epic', price: 4600,
    req: { dex: 24, fai: 14 }, scale: { dex: 'A', fai: 'C' }, el: 'lightning',
    lore: 'Retirada de uma torre atingida por mil raios. A lâmina zumbe antes de cada tempestade.',
    a1: ['Corte faiscante', 'Dois cortes rápidos que eletrizam.', 'combo', 'slash', { hits: 2, status: { type: 'shock', chance: 0.25, duration: 1200 } }],
    a2: ['Rasgo do céu', 'Avança como um relâmpago atravessando o alvo.', 'dash', 'lightning_spear', { power: 2, range: 170, mana: 10 }],
    look: { blade: '#dfe8ff', handle: '#23304f', glow: '#ffe24a' },
  },
  {
    id: 'espada-do-primeiro-rei', name: 'Espada do Primeiro Rei', rarity: 'legendary', price: 10500,
    req: { str: 30, dex: 30, vig: 20 }, scale: { str: 'A', dex: 'A' },
    lore: 'Empunhada pelo rei que uniu as sete academias. Diz a lenda que ele nunca pulou um treino.',
    a1: ['Corte régio', 'Combo de 3 cortes com rastro prateado.', 'combo', 'multi_slash', { hits: 3, power: 1.15 }],
    a2: ['Decreto final', 'Crava a espada no chão e ergue uma onda de lâminas.', 'area', 'shockwave', { power: 2.3, range: 220, shake: 0.6 }],
    look: { blade: '#f2f4f8', handle: '#c9a227', glow: '#fff3c4' },
  },
]);

// ====================================================================
// 5 ESPADAS GRANDES / COLOSSAIS
// ====================================================================
const greatswords = group('greatsword', [
  {
    id: 'montante-de-ferro', name: 'Montante de Ferro Bruto', rarity: 'common', price: 380,
    req: { str: 13, fort: 8 }, scale: { str: 'C' },
    lore: 'Mais uma barra de ferro afiada do que uma espada. Funciona.',
    a1: ['Golpe largo', 'Golpe horizontal pesado.', 'melee', 'heavy_slash'],
    a2: ['Rodopio', 'Gira a lâmina acertando tudo ao redor.', 'area', 'spin', { range: 110 }],
    look: { blade: '#9aa0a8', handle: '#4a3524' },
  },
  {
    id: 'lamina-do-matador', name: 'Lâmina do Matador de Ogros', rarity: 'uncommon', price: 950,
    req: { str: 16, fort: 12 }, scale: { str: 'B' },
    lore: 'Feita para derrubar coisas três vezes maiores que você. Serve igual para humanos.',
    a1: ['Talho descendente', 'Golpe de cima para baixo.', 'melee', 'heavy_slash'],
    a2: ['Arremetida', 'Corre e desfere um golpe ascendente que lança o alvo.', 'dash', 'uppercut', { range: 150, status: { type: 'launch', chance: 1, duration: 600 } }],
    look: { blade: '#b8bcc4', handle: '#5b3a20' },
  },
  {
    id: 'montante-do-juramento', name: 'Montante do Juramento', rarity: 'rare', price: 2300,
    req: { str: 20, fort: 14 }, scale: { str: 'B', fort: 'D' },
    lore: 'Os cavaleiros juravam sobre ela antes da primeira batalha. Quem quebrava o juramento não a erguia mais.',
    a1: ['Golpe horizontal', 'Golpe horizontal pesado.', 'melee', 'heavy_slash'],
    a2: ['Juramento cravado', 'Salta e crava a espada no chão, gerando onda de choque com poeira e rachaduras.', 'leap', 'shockwave', { power: 2.1, range: 200, shake: 0.5 }],
    look: { blade: '#cfd3da', handle: '#2e2e3a' },
  },
  {
    id: 'espada-do-dragao-negro', name: 'Presa do Dragão Negro', rarity: 'epic', price: 5200,
    req: { str: 28, fort: 18, int: 12 }, scale: { str: 'A', int: 'D' }, el: 'shadow',
    lore: 'Esculpida a partir de um único dente. Às vezes ainda range quando está com fome.',
    a1: ['Mordida', 'Golpe pesado que deixa rastro sombrio.', 'melee', 'heavy_slash'],
    a2: ['Rugido abissal', 'Golpe no chão que libera chamas negras em linha.', 'area', 'black_flame', { power: 2.2, range: 240, mana: 12, shake: 0.5 }],
    look: { blade: '#2a2238', handle: '#1a1a1f', glow: '#8b5cf6' },
  },
  {
    id: 'colosso-do-eclipse', name: 'Colosso do Eclipse', rarity: 'legendary', price: 11500,
    req: { str: 40, fort: 26 }, scale: { str: 'S', fort: 'C' },
    lore: 'Pesa como uma montanha. Só quem treinou perna por anos consegue ao menos arrastá-lo.',
    a1: ['Queda de montanha', 'Golpe esmagador com tremor de tela.', 'melee', 'heavy_slash', { power: 1.2, shake: 0.4 }],
    a2: ['Eclipse', 'Gira o colosso em um arco completo e explode o chão ao redor.', 'area', 'quake', { power: 2.5, range: 230, shake: 0.8, status: { type: 'launch', chance: 1, duration: 700 } }],
    look: { blade: '#3b3f4a', handle: '#6b4a1a', glow: '#f5b544' },
  },
]);

// ====================================================================
// 5 KATANAS / CURVAS
// ====================================================================
const katanas = group('katana', [
  {
    id: 'cimitarra-do-deserto', name: 'Cimitarra do Deserto', rarity: 'common', price: 300,
    req: { dex: 13 }, scale: { dex: 'C' },
    lore: 'Curva como as dunas. Os mercadores a usavam para cortar cordas — e ladrões.',
    a1: ['Corte curvo', 'Corte em arco rápido.', 'melee', 'slash'],
    a2: ['Dança das dunas', 'Dois giros cortantes enquanto avança.', 'dash', 'spin', { hits: 2, range: 120 }],
    look: { blade: '#d8d2c0', handle: '#7a4a1e' },
  },
  {
    id: 'uchigatana', name: 'Uchigatana do Ronin', rarity: 'uncommon', price: 780,
    req: { dex: 17 }, scale: { dex: 'B' },
    lore: 'Pertenceu a um guerreiro sem mestre que treinava sozinho ao nascer do sol.',
    a1: ['Iaijutsu', 'Saque rápido com corte limpo.', 'melee', 'slash'],
    a2: ['Corte do vento', 'Corte que libera uma lâmina de ar curta.', 'projectile', 'crescent', { range: 260 }],
    look: { blade: '#e6e9ee', handle: '#1f1f28' },
  },
  {
    id: 'nodachi-carmesim', name: 'Nodachi Carmesim', rarity: 'rare', price: 1950,
    req: { dex: 19, str: 12 }, scale: { dex: 'B', str: 'C' }, el: 'blood',
    lore: 'Longa demais para a bainha. Quem a carrega a leva desembainhada — e vermelha.',
    a1: ['Corte longo', 'Corte de longo alcance que causa sangramento.', 'melee', 'blood_slash', { range: 95, status: { type: 'bleed', chance: 0.3, duration: 3000 } }],
    a2: ['Pétala rubra', 'Três cortes em sequência que acumulam sangramento.', 'combo', 'blood_slash', { hits: 3, power: 2 }],
    look: { blade: '#d9dde3', handle: '#8b1a2b', glow: '#e0243b' },
  },
  {
    id: 'katana-lua-palida', name: 'Katana da Lua Pálida', rarity: 'epic', price: 4800,
    req: { dex: 28, int: 14 }, scale: { dex: 'A', int: 'C' }, el: 'arcane',
    lore: 'Forjada sob uma lua que não existe mais. O rastro prateado lembra onde ela esteve.',
    a1: ['Iaijutsu lunar', 'Iaijutsu com rastro prateado.', 'melee', 'slash'],
    a2: ['Meia-lua', 'Corte que dispara uma meia-lua de luz azul.', 'projectile', 'crescent', { power: 1.9, range: 360, mana: 10 }],
    look: { blade: '#eaf2ff', handle: '#1d2340', glow: '#8ab4ff' },
  },
  {
    id: 'muramasa-do-vazio', name: 'Muramasa do Vazio', rarity: 'legendary', price: 10000,
    req: { dex: 38, int: 22 }, scale: { dex: 'S', int: 'C' }, el: 'shadow',
    lore: 'Uma lâmina que corta o espaço entre um instante e outro. O dono nunca foi visto sacando.',
    a1: ['Corte sem tempo', 'Quatro cortes quase invisíveis.', 'combo', 'multi_slash', { hits: 4, power: 1.2 }],
    a2: ['Passo do vazio', 'Desaparece e reaparece atrás do alvo com um corte sombrio.', 'dash', 'shadow_spin', { power: 2.3, range: 260, mana: 14 }],
    look: { blade: '#1b1b24', handle: '#4a2a6a', glow: '#8b5cf6' },
  },
]);

// ====================================================================
// 5 ADAGAS E ARMAS DUPLAS
// ====================================================================
const daggers = group('dagger', [
  {
    id: 'adaga-do-ladino', name: 'Adaga do Ladino', rarity: 'common', price: 260,
    req: { dex: 12 }, scale: { dex: 'C' },
    lore: 'Pequena o bastante para caber na bota. Afiada o bastante para resolver problemas.',
    a1: ['Furos rápidos', 'Três estocadas curtas.', 'combo', 'multi_slash', { hits: 3 }],
    a2: ['Arremesso', 'Lança uma adaga.', 'projectile', 'dagger_throw', { range: 260, power: 1.4 }],
    look: { blade: '#c4c8cf', handle: '#3a2a1a' },
  },
  {
    id: 'facas-gemeas', name: 'Facas Gêmeas do Mercado', rarity: 'uncommon', price: 720,
    req: { dex: 16, fort: 8 }, scale: { dex: 'B' },
    lore: 'Um par de facas de açougueiro que decidiu ter uma carreira mais emocionante.',
    a1: ['Retalho', 'Quatro cortes alternados.', 'combo', 'multi_slash', { hits: 4 }],
    a2: ['Rodopio duplo', 'Gira com as duas lâminas.', 'area', 'spin', { range: 80, hits: 2 }],
    look: { blade: '#cfd4da', handle: '#5a2a1a' },
  },
  {
    id: 'adagas-gemeas-vibora', name: 'Adagas Gêmeas da Víbora', rarity: 'rare', price: 2000,
    req: { dex: 23, fort: 10 }, scale: { dex: 'B', int: 'D' }, el: 'poison',
    lore: 'O veneno escorre por sulcos na lâmina. Nunca se lava — só se renova.',
    a1: ['Mordida da víbora', 'Combo de 4 golpes rápidos que acumulam veneno.', 'combo', 'multi_slash', { hits: 4, status: { type: 'poison', chance: 0.4, duration: 4000 } }],
    a2: ['Bote reverso', 'Rolamento para trás lançando duas adagas.', 'projectile', 'dagger_throw', { hits: 2, range: 320, status: { type: 'poison', chance: 0.6, duration: 4000 } }],
    look: { blade: '#9fd47a', handle: '#1f2a18', glow: '#7ddc3d' },
  },
  {
    id: 'garras-do-lobo-gelido', name: 'Garras do Lobo Gélido', rarity: 'epic', price: 4300,
    req: { dex: 26, int: 16 }, scale: { dex: 'A', int: 'C' }, el: 'ice',
    lore: 'Arrancadas de uma alcateia que caçava na nevasca eterna. O frio vem junto.',
    a1: ['Arranhão gélido', 'Cinco golpes que podem congelar.', 'combo', 'multi_slash', { hits: 5, status: { type: 'freeze', chance: 0.12, duration: 600 } }],
    a2: ['Uivo da nevasca', 'Salta sobre o alvo com um golpe cruzado de gelo.', 'leap', 'ice_shard', { power: 2, range: 200, mana: 10 }],
    look: { blade: '#cfefff', handle: '#27435a', glow: '#7fd6ff' },
  },
  {
    id: 'lamina-sombra-e-sangue', name: 'Sombra e Sangue', rarity: 'legendary', price: 9500,
    req: { dex: 36, int: 18, fort: 18 }, scale: { dex: 'S', int: 'D' }, el: 'blood',
    lore: 'Duas adagas que nunca estiveram no mesmo lugar ao mesmo tempo. Uma corta, a outra cobra.',
    a1: ['Frenesi', 'Seis golpes vertiginosos com sangramento.', 'combo', 'blood_slash', { hits: 6, power: 1.25, status: { type: 'bleed', chance: 0.4, duration: 3000 } }],
    a2: ['Execução sombria', 'Some nas sombras e golpeia pelas costas.', 'dash', 'shadow_spin', { power: 2.4, range: 280, mana: 12 }],
    look: { blade: '#2a0f16', handle: '#141418', glow: '#e0243b' },
  },
]);

// ====================================================================
// 5 MACHADOS
// ====================================================================
const axes = group('axe', [
  {
    id: 'machadinha-lenhador', name: 'Machadinha do Lenhador', rarity: 'common', price: 280,
    req: { str: 11 }, scale: { str: 'C' },
    lore: 'Derrubou mais árvores que inimigos. Por enquanto.',
    a1: ['Talho', 'Golpe diagonal.', 'melee', 'heavy_slash'],
    a2: ['Arremesso giratório', 'Lança a machadinha girando.', 'projectile', 'dagger_throw', { range: 280 }],
    look: { blade: '#a8aeb6', handle: '#7a5230' },
  },
  {
    id: 'machado-de-guerra', name: 'Machado de Guerra Nórdico', rarity: 'uncommon', price: 880,
    req: { str: 15, fort: 10 }, scale: { str: 'B' },
    lore: 'Runas desbotadas no cabo contam vitórias que ninguém mais lembra.',
    a1: ['Golpe nórdico', 'Dois golpes pesados alternados.', 'combo', 'heavy_slash', { hits: 2 }],
    a2: ['Fúria berserker', 'Gira acertando tudo ao redor.', 'area', 'whirlwind', { range: 110, hits: 3 }],
    look: { blade: '#b4bac2', handle: '#4a2e18' },
  },
  {
    id: 'machado-da-brasa', name: 'Machado da Brasa', rarity: 'rare', price: 2200,
    req: { str: 20, fai: 10 }, scale: { str: 'B', fai: 'D' }, el: 'fire',
    lore: 'Temperado na forja de um vulcão. O fio nunca esfria.',
    a1: ['Corte em brasa', 'Golpe que pode queimar.', 'melee', 'heavy_slash', { status: { type: 'burn', chance: 0.3, duration: 3000 } }],
    a2: ['Onda de fogo', 'Golpe no chão que lança uma onda de chamas.', 'area', 'flame_wave', { power: 1.9, range: 260, mana: 8 }],
    look: { blade: '#5a2a1a', handle: '#2a1a10', glow: '#ff7a2f' },
  },
  {
    id: 'machado-trovejante', name: 'Machado Trovejante', rarity: 'epic', price: 5000,
    req: { str: 26, fai: 16, fort: 14 }, scale: { str: 'A', fai: 'C' }, el: 'lightning',
    lore: 'Um deus do trovão o esqueceu numa taverna. Nunca voltou para buscar.',
    a1: ['Golpe eletrizado', 'Golpe pesado que pode paralisar.', 'melee', 'heavy_slash', { status: { type: 'shock', chance: 0.25, duration: 1200 } }],
    a2: ['Trovão arremessado', 'Arremessa o machado envolto em raios, que volta à mão.', 'projectile', 'lightning_spear', { power: 2.1, range: 340, mana: 12, shake: 0.4 }],
    look: { blade: '#c8d2e6', handle: '#26324a', glow: '#ffe24a' },
  },
  {
    id: 'machado-do-rei-gigante', name: 'Machado do Rei Gigante', rarity: 'legendary', price: 11000,
    req: { str: 38, fort: 24 }, scale: { str: 'S', fort: 'D' },
    lore: 'O último rei dos gigantes cortava montanhas ao meio com ele. Sobraram vales.',
    a1: ['Corte titânico', 'Dois golpes com tremor.', 'combo', 'heavy_slash', { hits: 2, power: 1.2, shake: 0.35 }],
    a2: ['Queda do gigante', 'Salto altíssimo e golpe que racha a arena.', 'leap', 'quake', { power: 2.6, range: 240, shake: 0.9, status: { type: 'launch', chance: 1, duration: 700 } }],
    look: { blade: '#8e939c', handle: '#3a2410', glow: '#f5b544' },
  },
]);

// ====================================================================
// 5 MARTELOS / MAÇAS
// ====================================================================
const hammers = group('hammer', [
  {
    id: 'maca-cravejada', name: 'Maça Cravejada', rarity: 'common', price: 320,
    req: { str: 13 }, scale: { str: 'C' },
    lore: 'Pregos, madeira e raiva. A receita mais antiga do mundo.',
    a1: ['Pancada', 'Golpe esmagador.', 'melee', 'heavy_slash'],
    a2: ['Esmagar crânio', 'Golpe de cima que atordoa brevemente.', 'melee', 'shockwave', { status: { type: 'shock', chance: 0.4, duration: 800 } }],
    look: { blade: '#6e6a66', handle: '#5a3a1e' },
  },
  {
    id: 'martelo-do-ferreiro', name: 'Martelo do Ferreiro', rarity: 'uncommon', price: 920,
    req: { str: 16, fort: 12 }, scale: { str: 'B' },
    lore: 'Forjou mil espadas. Um dia decidiu que ele mesmo era a melhor arma.',
    a1: ['Batida da bigorna', 'Golpe pesado com faíscas.', 'melee', 'heavy_slash'],
    a2: ['Tremor', 'Bate no chão gerando onda de choque.', 'area', 'shockwave', { range: 180, shake: 0.4 }],
    look: { blade: '#50545c', handle: '#6b4424' },
  },
  {
    id: 'maca-sagrada', name: 'Maça Sagrada do Inquisidor', rarity: 'rare', price: 2400,
    req: { str: 16, fai: 16 }, scale: { str: 'C', fai: 'B' }, el: 'holy',
    lore: 'Abençoada tantas vezes que brilha no escuro. Os pecadores preferem não olhar.',
    a1: ['Golpe consagrado', 'Golpe que brilha em luz sagrada.', 'melee', 'heavy_slash'],
    a2: ['Julgamento', 'Golpe no chão que ergue um pilar de luz.', 'area', 'holy_beam', { power: 2, range: 220, mana: 14 }],
    look: { blade: '#e8dca8', handle: '#7a5a20', glow: '#ffd86b' },
  },
  {
    id: 'martelo-de-magma', name: 'Martelo de Magma', rarity: 'epic', price: 5400,
    req: { str: 30, fort: 18, fai: 12 }, scale: { str: 'A', fai: 'D' }, el: 'fire',
    lore: 'A cabeça é uma rocha vulcânica que ainda não terminou de esfriar.',
    a1: ['Impacto ardente', 'Golpe que pode queimar.', 'melee', 'heavy_slash', { status: { type: 'burn', chance: 0.35, duration: 3000 } }],
    a2: ['Erupção', 'Bate no chão e faz o magma explodir sob o alvo.', 'area', 'meteor', { power: 2.3, range: 260, mana: 12, shake: 0.7 }],
    look: { blade: '#3a1a12', handle: '#2a1a10', glow: '#ff7a2f' },
  },
  {
    id: 'martelo-titã-caido', name: 'Martelo do Titã Caído', rarity: 'legendary', price: 12000,
    req: { str: 40, fort: 25 }, scale: { str: 'S', fort: 'C' },
    lore: 'O titã caiu. O martelo, não. Ainda treme quando alguém o ergue.',
    a1: ['Esmagamento', 'Esmagamento lento com tremor de tela.', 'melee', 'heavy_slash', { power: 1.3, shake: 0.5 }],
    a2: ['Explosão sísmica', 'Gira o martelo e solta uma explosão sísmica que lança o inimigo para cima.', 'area', 'quake', { power: 2.7, range: 240, shake: 1, status: { type: 'launch', chance: 1, duration: 800 } }],
    look: { blade: '#5b6068', handle: '#3a2a1a', glow: '#f5b544' },
  },
]);

// ====================================================================
// 5 LANÇAS / ALABARDAS
// ====================================================================
const spears = group('spear', [
  {
    id: 'lanca-de-milicia', name: 'Lança de Milícia', rarity: 'common', price: 290,
    req: { str: 9, dex: 12 }, scale: { str: 'D', dex: 'C' },
    lore: 'Dê uma lança a um camponês e ele vira soldado. Dê duas e ele vira general.',
    a1: ['Estocada dupla', 'Duas estocadas rápidas.', 'combo', 'thrust', { hits: 2 }],
    a2: ['Investida', 'Corre com a lança à frente.', 'dash', 'thrust', { range: 170 }],
    look: { blade: '#b6bcc4', handle: '#7a5a3a' },
  },
  {
    id: 'alabarda-da-muralha', name: 'Alabarda da Muralha', rarity: 'uncommon', price: 900,
    req: { str: 14, dex: 10 }, scale: { str: 'C', dex: 'C' },
    lore: 'Machado, lança e gancho num só. Os engenheiros da muralha não gostavam de escolher.',
    a1: ['Varredura', 'Golpe em arco com a lâmina.', 'melee', 'heavy_slash', { range: 115 }],
    a2: ['Gancho', 'Puxa o inimigo para perto com o gancho.', 'pull', 'chain_pull', { range: 160, power: 1.4 }],
    look: { blade: '#aab0b8', handle: '#4a3a2a' },
  },
  {
    id: 'tridente-das-mares', name: 'Tridente das Marés', rarity: 'rare', price: 2150,
    req: { dex: 19, int: 12 }, scale: { dex: 'B', int: 'C' }, el: 'ice',
    lore: 'Pescado do fundo de um lago congelado. Às vezes pinga água do nada.',
    a1: ['Estocada tripla', 'Três pontas, três feridas.', 'combo', 'thrust', { hits: 3 }],
    a2: ['Maré gelada', 'Arremessa o tridente, que congela ao acertar.', 'projectile', 'ice_shard', { power: 1.9, range: 340, mana: 10, status: { type: 'freeze', chance: 0.3, duration: 700 } }],
    look: { blade: '#9fd8f0', handle: '#27405a', glow: '#7fd6ff' },
  },
  {
    id: 'lanca-do-dragao-celeste', name: 'Lança do Dragão Celeste', rarity: 'epic', price: 4900,
    req: { dex: 24, str: 16, fai: 12 }, scale: { dex: 'A', str: 'C' }, el: 'lightning',
    lore: 'Os cavaleiros-dragão saltavam das nuvens com ela. Poucos aterrissavam de pé.',
    a1: ['Estocada relâmpago', 'Estocada longa que eletriza.', 'melee', 'thrust', { range: 125, status: { type: 'shock', chance: 0.25, duration: 1000 } }],
    a2: ['Salto do dragão', 'Salto altíssimo e mergulho com a lança.', 'leap', 'lightning_spear', { power: 2.2, range: 260, mana: 10, shake: 0.5 }],
    look: { blade: '#e0e8ff', handle: '#2a3a6a', glow: '#ffe24a' },
  },
  {
    id: 'lanca-do-sol-poente', name: 'Lança do Sol Poente', rarity: 'legendary', price: 10200,
    req: { dex: 34, fai: 26 }, scale: { dex: 'A', fai: 'B' }, el: 'holy',
    lore: 'Dizem que foi arremessada contra o sol e voltou trazendo um pedaço dele.',
    a1: ['Raios da tarde', 'Três estocadas douradas.', 'combo', 'thrust', { hits: 3, power: 1.2 }],
    a2: ['Crepúsculo', 'Arremessa a lança, que explode em luz ao cair.', 'projectile', 'holy_nova', { power: 2.5, range: 400, mana: 16, shake: 0.5 }],
    look: { blade: '#ffe7a3', handle: '#8a5a1a', glow: '#ffd86b' },
  },
]);

// ====================================================================
// 4 FOICES
// ====================================================================
const scythes = group('scythe', [
  {
    id: 'foice-do-campones', name: 'Foice do Camponês', rarity: 'common', price: 300,
    req: { dex: 13, str: 8 }, scale: { dex: 'C' },
    lore: 'A colheita foi ruim. A revolta, excelente.',
    a1: ['Ceifa', 'Golpe em arco amplo.', 'melee', 'slash', { range: 100 }],
    a2: ['Giro da colheita', 'Gira a foice ao redor do corpo.', 'area', 'spin', { range: 115 }],
    look: { blade: '#aab0b8', handle: '#6b4a2a' },
  },
  {
    id: 'foice-da-praga', name: 'Foice da Praga', rarity: 'uncommon', price: 860,
    req: { dex: 16, int: 10 }, scale: { dex: 'C', int: 'C' }, el: 'poison',
    lore: 'Usada para colher ervas que ninguém deveria colher.',
    a1: ['Ceifa tóxica', 'Golpe que pode envenenar.', 'melee', 'slash', { status: { type: 'poison', chance: 0.35, duration: 4000 } }],
    a2: ['Nuvem pestilenta', 'Golpe no chão que solta uma nuvem de veneno.', 'area', 'poison_cloud', { range: 200, mana: 10, status: { type: 'poison', chance: 0.8, duration: 5000 } }],
    look: { blade: '#8fb36a', handle: '#2a2a1a', glow: '#7ddc3d' },
  },
  {
    id: 'foice-do-colhedor', name: 'Foice do Colhedor', rarity: 'epic', price: 4700,
    req: { dex: 24, int: 20 }, scale: { dex: 'B', int: 'B' }, el: 'shadow',
    lore: 'Não colhe trigo. Colhe o último suspiro.',
    a1: ['Giro sombrio', 'Giro amplo com rastro de sombra.', 'melee', 'shadow_spin', { range: 115 }],
    a2: ['Corrente espectral', 'Puxa o inimigo com uma corrente espectral.', 'pull', 'chain_pull', { power: 1.9, range: 300, mana: 12 }],
    look: { blade: '#2a2238', handle: '#1a1a22', glow: '#8b5cf6' },
  },
  {
    id: 'foice-da-lua-de-sangue', name: 'Foice da Lua de Sangue', rarity: 'legendary', price: 10800,
    req: { dex: 32, int: 26, vig: 18 }, scale: { dex: 'A', int: 'B' }, el: 'blood',
    lore: 'Só aparece quando a lua fica vermelha. Esta noite, ela está.',
    a1: ['Colheita carmesim', 'Dois giros que causam sangramento.', 'combo', 'blood_slash', { hits: 2, power: 1.2, status: { type: 'bleed', chance: 0.45, duration: 3000 } }],
    a2: ['Eclipse rubro', 'Arremessa uma lua de sangue giratória que corta tudo no caminho.', 'projectile', 'crescent', { power: 2.5, range: 380, mana: 16, hits: 3 }],
    look: { blade: '#5a0f1a', handle: '#141418', glow: '#e0243b' },
  },
]);

// ====================================================================
// 4 ARCOS / BESTAS
// ====================================================================
const bows = group('bow', [
  {
    id: 'arco-curto-cacador', name: 'Arco Curto do Caçador', rarity: 'common', price: 270,
    req: { dex: 13 }, scale: { dex: 'C' },
    lore: 'Leve e silencioso. O coelho nunca soube de onde veio.',
    a1: ['Flecha rápida', 'Dispara uma flecha.', 'projectile', 'arrow'],
    a2: ['Rajada tripla', 'Três flechas em leque.', 'projectile', 'arrow', { hits: 3 }],
    look: { blade: '#8a6a3a', handle: '#4a3a2a' },
  },
  {
    id: 'besta-pesada', name: 'Besta Pesada da Fortaleza', rarity: 'uncommon', price: 940,
    req: { str: 12, dex: 15 }, scale: { dex: 'C', str: 'C' },
    lore: 'Demora para recarregar. Não precisa recarregar duas vezes.',
    a1: ['Virote', 'Dispara um virote pesado.', 'projectile', 'arrow', { power: 1.2 }],
    a2: ['Virote perfurante', 'Virote que atravessa e empurra forte.', 'projectile', 'piercing_arrow', { power: 2, knockback: 16 }],
    look: { blade: '#5a4a3a', handle: '#3a3a44' },
  },
  {
    id: 'arco-das-chamas', name: 'Arco das Chamas Eternas', rarity: 'rare', price: 2300,
    req: { dex: 19, fai: 12 }, scale: { dex: 'B', fai: 'C' }, el: 'fire',
    lore: 'A corda é feita de crina de um cavalo de fogo. Não toque.',
    a1: ['Flecha em brasa', 'Flecha que pode queimar.', 'projectile', 'arrow', { status: { type: 'burn', chance: 0.35, duration: 3000 } }],
    a2: ['Chuva de fogo', 'Dispara para o alto; flechas em chamas caem sobre o alvo.', 'area', 'arrow_rain', { power: 2, hits: 5, mana: 8 }],
    look: { blade: '#7a2a12', handle: '#3a1a10', glow: '#ff7a2f' },
  },
  {
    id: 'arco-do-caçador-de-estrelas', name: 'Arco do Caçador de Estrelas', rarity: 'legendary', price: 9800,
    req: { dex: 36, int: 20 }, scale: { dex: 'S', int: 'C' }, el: 'arcane',
    lore: 'Seu dono derrubou uma estrela cadente por aposta. Ganhou a aposta e o arco.',
    a1: ['Flecha estelar', 'Duas flechas de luz teleguiadas.', 'projectile', 'arcane_missiles', { hits: 2, power: 1.2 }],
    a2: ['Queda estelar', 'Uma estrela desce do céu sobre o alvo.', 'area', 'meteor', { power: 2.6, mana: 18, shake: 0.7 }],
    look: { blade: '#dfe6ff', handle: '#2a2a5a', glow: '#8ab4ff' },
  },
]);

// ====================================================================
// 6 CAJADOS (Inteligência)
// ====================================================================
const staffs = group('staff', [
  {
    id: 'cajado-aprendiz', name: 'Cajado de Aprendiz', rarity: 'common', price: 250, starter: true,
    req: { int: 8 }, scale: { int: 'C' }, el: 'arcane',
    lore: 'Todo arquimago começou com um destes. A maioria o queimou na primeira semana.',
    a1: ['Faísca arcana', 'Pequeno projétil de energia.', 'projectile', 'arcane_missiles'],
    a2: ['Rajada arcana', 'Três projéteis teleguiados.', 'projectile', 'arcane_missiles', { hits: 3 }],
    look: { blade: '#5b8cff', handle: '#6b4a2a', glow: '#5b8cff' },
  },
  {
    id: 'cajado-de-brasas', name: 'Cajado de Brasas', rarity: 'uncommon', price: 800,
    req: { int: 13, ess: 10 }, scale: { int: 'B' }, el: 'fire',
    lore: 'A ponta é um carvão que nunca apaga. Ótimo para acampamentos. E para inimigos.',
    a1: ['Bola de fogo', 'Arremessa uma bola de fogo.', 'projectile', 'fireball', { status: { type: 'burn', chance: 0.3, duration: 3000 } }],
    a2: ['Muralha de chamas', 'Uma onda de fogo avança pelo chão.', 'area', 'flame_wave', { power: 1.9 }],
    look: { blade: '#ff7a2f', handle: '#4a2a1a', glow: '#ff7a2f' },
  },
  {
    id: 'cajado-peçonhento', name: 'Cajado Peçonhento', rarity: 'rare', price: 1900,
    req: { int: 16, ess: 14 }, scale: { int: 'B' }, el: 'poison',
    lore: 'Uma serpente se enrolou nele e nunca mais saiu. Ainda está viva.',
    a1: ['Cuspe da serpente', 'Projétil que envenena.', 'projectile', 'poison_cloud', { status: { type: 'poison', chance: 0.6, duration: 4000 } }],
    a2: ['Pântano', 'Nuvem tóxica grande sobre o alvo.', 'area', 'poison_cloud', { power: 1.7, status: { type: 'poison', chance: 1, duration: 6000 } }],
    look: { blade: '#7ddc3d', handle: '#2a3a1a', glow: '#7ddc3d' },
  },
  {
    id: 'cajado-da-sombra', name: 'Cajado da Sombra Faminta', rarity: 'rare', price: 2450,
    req: { int: 18, ess: 16 }, scale: { int: 'B', ess: 'D' }, el: 'shadow',
    lore: 'Absorve a luz ao redor. Em dias nublados, fica mal-humorado.',
    a1: ['Orbe sombrio', 'Orbe lento e pesado de sombra.', 'projectile', 'shadow_orb', { power: 1.15 }],
    a2: ['Devorar', 'Um vórtice de sombra puxa e esmaga o alvo.', 'pull', 'shadow_orb', { power: 2, range: 340 }],
    look: { blade: '#3a2a5a', handle: '#1a1a22', glow: '#8b5cf6' },
  },
  {
    id: 'cajado-geada-eterna', name: 'Cajado da Geada Eterna', rarity: 'epic', price: 5100,
    req: { int: 26, ess: 18 }, scale: { int: 'A', ess: 'D' }, el: 'ice',
    lore: 'Encontrado no coração de uma geleira. O inverno obedece a quem o segura.',
    a1: ['Fragmento de gelo', 'Fragmento de gelo teleguiado (pouca mana).', 'projectile', 'ice_shard', { mana: 8 }],
    a2: ['Prisão de gelo', 'Prisão de gelo que congela o alvo por 0,8 s (muita mana).', 'area', 'ice_prison', { power: 1.6, mana: 40, status: { type: 'freeze', chance: 1, duration: 800 } }],
    look: { blade: '#bfefff', handle: '#27435a', glow: '#7fd6ff' },
  },
  {
    id: 'cajado-do-arquimago', name: 'Cajado do Arquimago Ancestral', rarity: 'legendary', price: 11200,
    req: { int: 37, ess: 28 }, scale: { int: 'S', ess: 'C' }, el: 'arcane',
    lore: 'Escreveu metade dos livros da biblioteca proibida. A outra metade, apagou.',
    a1: ['Mísseis arcanos', 'Quatro mísseis teleguiados.', 'projectile', 'arcane_missiles', { hits: 4, power: 1.25 }],
    a2: ['Cometa', 'Invoca um cometa que cai sobre o alvo.', 'area', 'meteor', { power: 2.8, mana: 44, shake: 0.9 }],
    look: { blade: '#9ab8ff', handle: '#2a2250', glow: '#5b8cff' },
  },
]);

// ====================================================================
// 5 SELOS / TALISMÃS (Fé)
// ====================================================================
const seals = group('seal', [
  {
    id: 'selo-do-novico', name: 'Selo do Noviço', rarity: 'common', price: 250, starter: true,
    req: { fai: 8 }, scale: { fai: 'C' }, el: 'holy',
    lore: 'Entregue no primeiro dia do mosteiro, junto com uma vassoura.',
    a1: ['Lança de luz', 'Pequeno raio sagrado.', 'projectile', 'holy_beam'],
    a2: ['Cura menor', 'Recupera um pouco de vida.', 'heal', 'heal', { power: 1.0, range: 0 }],
    look: { blade: '#ffd86b', handle: '#8a6a2a', glow: '#ffd86b' },
  },
  {
    id: 'talisma-da-chama', name: 'Talismã da Chama Sagrada', rarity: 'uncommon', price: 850,
    req: { fai: 13, ess: 10 }, scale: { fai: 'B' }, el: 'fire',
    lore: 'Arde sem consumir. Os fiéis dizem que é milagre; os ferreiros, que é inveja.',
    a1: ['Chama sagrada', 'Uma labareda curta à frente.', 'area', 'flame_wave', { range: 160 }],
    a2: ['Coluna de fogo', 'Uma coluna de fogo sobe sob o alvo.', 'area', 'meteor', { power: 1.9, status: { type: 'burn', chance: 0.6, duration: 3000 } }],
    look: { blade: '#ff9a4a', handle: '#6a3a1a', glow: '#ff7a2f' },
  },
  {
    id: 'selo-da-aurora', name: 'Selo da Aurora', rarity: 'rare', price: 2250,
    req: { fai: 18, ess: 14 }, scale: { fai: 'B', ess: 'D' }, el: 'holy',
    lore: 'Brilha mais forte a cada manhã em que seu dono acorda cedo para treinar.',
    a1: ['Raio da manhã', 'Raio de luz de longo alcance.', 'projectile', 'holy_beam', { power: 1.1 }],
    a2: ['Bênção da aurora', 'Cura considerável e explosão de luz ao redor.', 'heal', 'holy_nova', { power: 1.6, range: 120 }],
    look: { blade: '#fff0b0', handle: '#b08a3a', glow: '#ffd86b' },
  },
  {
    id: 'selo-trovao-ancestral', name: 'Selo do Trovão Ancestral', rarity: 'epic', price: 5300,
    req: { fai: 26, ess: 16 }, scale: { fai: 'A', ess: 'D' }, el: 'lightning',
    lore: 'Gravado com o nome do primeiro deus da tempestade. Ele ainda responde quando chamado.',
    a1: ['Lança de raio', 'Lança de raio arremessada.', 'projectile', 'lightning_spear', { status: { type: 'shock', chance: 0.25, duration: 1000 } }],
    a2: ['Fúria dos céus', 'Invoca 3 raios em área com flash na tela.', 'area', 'lightning_storm', { power: 2.2, hits: 3, shake: 0.5 }],
    look: { blade: '#fff3a0', handle: '#3a3a6a', glow: '#ffe24a' },
  },
  {
    id: 'selo-do-juizo-final', name: 'Selo do Juízo Final', rarity: 'legendary', price: 11800,
    req: { fai: 40, ess: 28 }, scale: { fai: 'S', ess: 'C' }, el: 'holy',
    lore: 'Não é usado para pedir. É usado para sentenciar.',
    a1: ['Sentença', 'Três lanças de luz em sequência.', 'projectile', 'holy_beam', { hits: 3, power: 1.25 }],
    a2: ['Juízo', 'Um pilar de luz colossal desce sobre o alvo e cura você.', 'area', 'holy_nova', { power: 2.8, mana: 46, shake: 0.8 }],
    look: { blade: '#fffbe0', handle: '#c9a227', glow: '#fff3c4' },
  },
]);

// ====================================================================
// 5 HÍBRIDAS ÚNICAS LENDÁRIAS
// ====================================================================
const hybrids = group('hybrid', [
  {
    id: 'lamina-sol-negro', name: 'Lâmina do Sol Negro', rarity: 'legendary', price: 11500,
    req: { dex: 30, fai: 30 }, scale: { dex: 'A', fai: 'A' }, el: 'fire',
    lore: 'Forjada quando o sol se apagou por um dia. O que sobrou do fogo, ficou nela.',
    a1: ['Combo solar', 'Combo com rastro de fogo dourado.', 'combo', 'multi_slash', { hits: 3, power: 1.2, status: { type: 'burn', chance: 0.3, duration: 3000 } }],
    a2: ['Sol negro', 'Estocada que explode em chamas negras (stamina + mana).', 'dash', 'black_flame', { power: 2.6, range: 180, shake: 0.6 }],
    look: { blade: '#1a1410', handle: '#c9a227', glow: '#ff9a2f' },
  },
  {
    id: 'martelo-arcano-do-colosso', name: 'Martelo Rúnico do Colosso', rarity: 'legendary', price: 11200,
    req: { str: 32, int: 26 }, scale: { str: 'A', int: 'B' }, el: 'arcane',
    lore: 'Cada runa é um feitiço de impacto. Cada impacto, uma aula de física.',
    a1: ['Impacto rúnico', 'Golpe pesado que explode em runas.', 'melee', 'heavy_slash', { power: 1.25, shake: 0.4 }],
    a2: ['Cataclismo rúnico', 'Salta e descarrega todas as runas no chão.', 'leap', 'quake', { power: 2.6, range: 240, shake: 0.9, status: { type: 'launch', chance: 1, duration: 700 } }],
    look: { blade: '#3a3f5a', handle: '#2a2230', glow: '#5b8cff' },
  },
  {
    id: 'lanca-sangue-sagrado', name: 'Lança do Sangue Sagrado', rarity: 'legendary', price: 10600,
    req: { str: 26, fai: 30, vig: 20 }, scale: { str: 'B', fai: 'A' }, el: 'blood',
    lore: 'Perfurou um santo. O sangue dele cura quem a empunha — e condena quem ela toca.',
    a1: ['Estocada votiva', 'Duas estocadas que roubam vida.', 'combo', 'thrust', { hits: 2, power: 1.15, status: { type: 'bleed', chance: 0.35, duration: 3000 } }],
    a2: ['Transfusão', 'Estocada longa que drena vida do alvo para você.', 'dash', 'blood_slash', { power: 2.2, range: 200, lifesteal: 0.5 }],
    look: { blade: '#c0283c', handle: '#e8d9a8', glow: '#e0243b' },
  },
  {
    id: 'katana-tempestade-gelida', name: 'Katana da Tempestade Gélida', rarity: 'legendary', price: 10900,
    req: { dex: 32, int: 20, fai: 20 }, scale: { dex: 'A', int: 'C', fai: 'C' }, el: 'ice',
    lore: 'Neve e trovão presos na mesma lâmina. Nenhum dos dois está feliz com isso.',
    a1: ['Corte da nevasca', 'Três cortes que podem congelar.', 'combo', 'multi_slash', { hits: 3, power: 1.2, status: { type: 'freeze', chance: 0.15, duration: 600 } }],
    a2: ['Tempestade branca', 'Raios de gelo caem em área.', 'area', 'lightning_storm', { power: 2.5, hits: 3, shake: 0.6, status: { type: 'freeze', chance: 0.5, duration: 800 } }],
    look: { blade: '#dff6ff', handle: '#27435a', glow: '#7fd6ff' },
  },
  {
    id: 'foice-do-abismo-estelar', name: 'Foice do Abismo Estelar', rarity: 'legendary', price: 12000,
    req: { dex: 28, int: 27, fai: 16 }, scale: { dex: 'B', int: 'A', fai: 'D' }, el: 'shadow',
    lore: 'Colhe estrelas mortas e as transforma em buracos negros de bolso.',
    a1: ['Ceifa cósmica', 'Giro amplo que deixa pequenas estrelas.', 'melee', 'shadow_spin', { power: 1.2, range: 120 }],
    a2: ['Singularidade', 'Abre um buraco negro que puxa e esmaga o alvo.', 'pull', 'shadow_orb', { power: 2.7, range: 360, shake: 0.7 }],
    look: { blade: '#1a1430', handle: '#3a2a5a', glow: '#b57cff' },
  },
]);

export const WEAPONS: WeaponDef[] = [
  ...swords, ...greatswords, ...katanas, ...daggers, ...axes, ...hammers,
  ...spears, ...scythes, ...bows, ...staffs, ...seals, ...hybrids,
  ...ARSENAL,
];

// sem protótipo: ids como "constructor" ou "__proto__" não existem
export const WEAPONS_BY_ID: Record<string, WeaponDef> = Object.assign(Object.create(null), Object.fromEntries(WEAPONS.map((w) => [w.id, w])));

export const STARTER_WEAPONS = WEAPONS.filter((w) => w.starter);
