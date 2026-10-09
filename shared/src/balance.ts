/**
 * ============================================================
 *  GYMBATTLE — TABELA DE BALANCEAMENTO
 * ============================================================
 * Este é o ÚNICO lugar onde ficam os números do jogo.
 * Servidor e cliente importam daqui, então basta alterar um valor,
 * rodar o build e fazer deploy. Nenhuma lógica precisa ser mexida.
 */

export const BALANCE = {
  /** Fuso usado para definir "o dia" (1 post recompensado por dia). */
  timezone: 'America/Sao_Paulo',

  // ---------------------------------------------------------------
  // POSTS DE TREINO
  // ---------------------------------------------------------------
  post: {
    baseXp: 100,
    baseGold: 50,
    /** Quantos posts por dia rendem recompensa. */
    rewardedPerDay: 1,
    /** Fotos são apagadas depois desse número de dias (a recompensa fica). */
    photoRetentionDays: 7,
    /** Dimensão máxima (px) do lado maior da imagem após o redimensionamento. */
    maxImageSize: 1280,
    webpQuality: 78,
    /** Distância de Hamming máxima entre hashes perceptuais para considerar duplicada (0–64). */
    duplicateHashDistance: 8,
    /** Limite do arquivo enviado. Fotos maiores são diminuídas no aparelho antes do envio; o servidor também reduz. */
    maxUploadMB: 50,
  },

  // ---------------------------------------------------------------
  // STREAK (dias seguidos postando)
  // ---------------------------------------------------------------
  streak: {
    /** Bônus por dia de streak (0.10 = +10%). */
    bonusPerDay: 0.1,
    /** Bônus máximo (0.50 = +50%). */
    maxBonus: 0.5,
    /** Dias de descanso permitidos por semana (seg–dom) sem quebrar a streak. */
    restDaysPerWeek: 1,
  },

  // ---------------------------------------------------------------
  // LEMBRETE DE TREINO
  // Quem ainda não postou no dia recebe um lembrete nestes horários
  // (Brasília). Domingo é descanso: nenhum lembrete.
  // ---------------------------------------------------------------
  reminders: {
    hours: [12, 20],
    /** Se o servidor estava parado no horário, ainda envia até N horas depois. */
    windowHours: 2,
    /** 0 = domingo, 6 = sábado. */
    skipWeekdays: [0],
  },

  // ---------------------------------------------------------------
  // LUTAS
  // ---------------------------------------------------------------
  fights: {
    winXp: 15,
    winGold: 10,
    lossXp: 5,
    lossGold: 0,
    /** Lutas recompensadas por dia (amistosas nunca recompensam). */
    rewardedPerDay: 5,
  },

  // ---------------------------------------------------------------
  // NÍVEIS
  // ---------------------------------------------------------------
  levels: {
    maxLevel: 99,
    /** XP para o próximo nível = base + perLevel × nível atual */
    xpBase: 150,
    xpPerLevel: 50,
    attributePointsPerLevel: 1,
  },

  // ---------------------------------------------------------------
  // ATRIBUTOS
  // ---------------------------------------------------------------
  attributes: {
    start: 5,
    max: 60,
    /** Retornos decrescentes: até softCap1 rende 100%, até softCap2 rende softCap1Rate, depois softCap2Rate. */
    softCap1: 30,
    softCap2: 45,
    softCap1Rate: 0.5,
    softCap2Rate: 0.2,
    /** Penalidade ao usar arma sem requisitos (estilo Dark Souls). */
    unmetRequirementDamageMult: 0.4,
    unmetRequirementSpeedMult: 0.75,
    /** Valores derivados. */
    baseHp: 250,
    hpPerVigor: 30,
    /** Vida extra por ponto de atributo distribuído em QUALQUER atributo (treinar deixa todo mundo mais resistente). */
    hpPerAttributePoint: 9,
    baseStamina: 80,
    staminaPerFortitude: 4,
    baseStaminaRegen: 38, // por segundo
    staminaRegenPerFortitude: 0.8,
    baseMana: 40,
    manaPerEssence: 5,
    baseManaRegen: 3,
    manaRegenPerEssence: 0.25,
    /**
     * Redistribuição de pontos (estilo "Larva de Lágrima" do Elden Ring).
     * Devolve todos os pontos gastos para o jogador redistribuir.
     * Custo = baseGold + goldPerLevel × nível (limitado a maxGold). A primeira é grátis.
     */
    respec: { firstFree: true, baseGold: 200, goldPerLevel: 10, maxGold: 1500, cooldownHours: 24 },
    /** Escalonamento de arma: quanto cada letra multiplica o bônus do atributo. */
    scaling: { S: 1.6, A: 1.25, B: 0.95, C: 0.65, D: 0.35 } as Record<string, number>,
  },

  // ---------------------------------------------------------------
  // LOJA — preços por raridade (média ~60 ouro/dia)
  // ---------------------------------------------------------------
  shop: {
    rarityPrice: {
      common: [250, 400],
      uncommon: [700, 1000],
      rare: [1800, 2500],
      epic: [4000, 5500],
      legendary: [9000, 12000],
    } as Record<string, [number, number]>,
    /**
     * Revelação progressiva: a loja começa escondida. Uma arma aparece quando
     * QUALQUER um dos atributos exigidos estiver a `revealMargin` pontos (ou menos)
     * do requisito. Ex.: margem 2 → com FOR 8 aparece a arma que pede FOR 10.
     */
    revealMargin: 2,
    /** Armaduras (sem requisitos) aparecem por nível do jogador. */
    armorRevealLevel: { common: 1, uncommon: 3, rare: 8, epic: 15, legendary: 25 } as Record<string, number>,
    /** Desconto ao comprar o conjunto completo de armadura (4 peças). */
    armorSetDiscount: 0.15,
    /** Parte do preço da armadura que cada peça representa. */
    armorPieceShare: { helm: 0.25, chest: 0.35, gloves: 0.15, legs: 0.25 },
  },

  // ---------------------------------------------------------------
  // AVATAR — HITBOX
  // Todos têm o mesmo tamanho: a altura NÃO muda hitbox nem alcance
  // (min = max = 1). O campo continua existindo só por compatibilidade.
  // ---------------------------------------------------------------
  avatar: {
    minHeight: 1,
    maxHeight: 1,
    /** Hitbox (unidades do mundo), igual para todos. */
    baseHitboxWidth: 44,
    baseHitboxHeight: 96,
    hitboxHeightInfluence: 0,
    hitboxWidthInfluence: 0,
    reachInfluence: 0,
  },

  // ---------------------------------------------------------------
  // COMBATE
  // ---------------------------------------------------------------
  combat: {
    tickRate: 30,
    lives: 3,
    /** Knockback multiplicado conforme HP cai: mult = 1 + (1 - hp/maxHp) × lowHpKnockbackBonus */
    lowHpKnockbackBonus: 1.5,
    /**
     * Duelo até a morte: não há limite de tempo. Depois de `suddenDeathAfterSec`
     * o dano cresce +100% a cada `suddenDeathRampSec` (morte súbita), então toda
     * luta termina. `safetyCapSec` é só uma trava de segurança do servidor.
     */
    suddenDeathAfterSec: 90,
    suddenDeathRampSec: 30,
    safetyCapSec: 600,
    /**
     * Evento lendário: só acontece quando o administrador ativa para um jogador
     * ("acionar na próxima luta"). Num momento aleatório dessa luta o jogador ativa
     * o poder máximo do tipo da sua arma e vence na hora, não importa quantas vidas
     * o outro ainda tenha. Depois disso desativa sozinho. Não há aviso: é surpresa.
     */
    /** Duração da cena, em segundos, e o momento do golpe final (fração da cena). */
    legendSec: 7.5,
    legendKoFrac: 0.8,
    /**
     * A IA é igual para todos: nenhum atributo deixa o guerreiro "mais esperto".
     * Tempo de reação em ticks (30 ticks = 1 s).
     */
    aiReactionTicks: 6,
    /** Chance de esquivar de um golpe anunciado: base + por ponto de Fortitude. */
    dodgeBase: 0.24,
    dodgePerFortitude: 0.004,
    /** Destreza acelera um pouco a corrida e os ataques (por ponto efetivo). */
    runSpeedPerDex: 0.002,
    attackSpeedPerDex: 0.0015,
    /**
     * Postura (poise): armas pesadas não são interrompidas no meio do golpe.
     * O golpe recebido causa dano normal, mas o empurrão cai para esta fração.
     */
    poiseCategories: ['greatsword', 'hammer', 'axe'] as string[],
    poiseKnockbackMult: 0.35,
    /**
     * Efeitos de status. Dano contínuo por segundo = fração do dano da arma de
     * quem aplicou (assim veneno/fogo/sangramento crescem junto com a arma).
     * Paralisia/congelamento duram `stunDurationMult` do valor da arma e,
     * ao acabar, o lutador fica `stunImmunitySec` imune ao mesmo efeito.
     * Em golpes de vários acertos a chance por acerto cai (chance ÷ √acertos).
     */
    status: {
      poisonPerSec: 0.22,
      burnPerSec: 0.28,
      bleedPerSec: 0.25,
      stunDurationMult: 0.5,
      stunImmunitySec: 3,
    },
    interpolationDelayMs: 100,
    lagCompensationMaxMs: 250,
  },

  // ---------------------------------------------------------------
  // GRUPOS — cada grupo disputa só entre si
  // ---------------------------------------------------------------
  groups: {
    /** Torneio (desafios, ranking valendo, prêmios da temporada) só com esta quantidade de pessoas. */
    minForTournament: 5,
    maxMembers: 200,
    nameMin: 3,
    nameMax: 40,
  },

  // ---------------------------------------------------------------
  // RANKING (PR)
  // ---------------------------------------------------------------
  ranking: {
    startPr: 1000,
    // ---- PR por chance de vitória (calculada antes da luta)
    /** Escala do poder de combate (calibrada com lutas simuladas). */
    powerScale: 990,
    /** Peso do poder de combate na chance de vencer (o resto vem da diferença de PR). */
    powerWeight: 0.7,
    /** PR em jogo por luta: vencedor ganha K × chance que tinha de perder. */
    prK: 32,
    prMinGain: 2,
    prMaxGain: 40,
    /** Desafiante favorito que perde, perde este tanto a mais. */
    favoriteChallengerLossMult: 1.25,
    /** Quantos desafios cada jogador pode ENVIAR por dia (fuso de Brasília). */
    maxChallengesPerDay: 5,
    /** Horas que o desafiado tem para aceitar. */
    challengeExpiresHours: 24,
    /**
     * Recusar (ou deixar expirar): o desafiado perde METADE do que perderia se
     * lutasse e perdesse (entre min e max). O desafiante ganha metade disso.
     */
    decline: { lossShare: 0.5, min: 3, max: 15, challengerShare: 0.5 },
    /** Aviso ao desafiado quando faltar este tempo para o desafio expirar. */
    expiryWarnHours: 2,
    /** Cada um só pode desafiar a mesma pessoa uma vez por dia (zera à meia-noite de Brasília). */
    oncePerTargetPerDay: true,
    /**
     * Proteção: quem PERDE pontos NUMA LUTA fica este tempo sem poder ser
     * desafiado (recusar não dá proteção). Enviar um desafio cancela a proteção.
     */
    protectionHours: 36,
    /** Se a temporada começar com menos dias que isso para o fim do mês, ela vai até o fim do mês seguinte. */
    minSeasonDays: 10,
    /**
     * Reset no fim da temporada: PR novo = 1000 + (PR − 1000) × fator.
     * 0 = todo mundo volta para 1000 (reset completo).
     */
    seasonSoftResetFactor: 0,
    seasonRewards: [
      { from: 1, to: 1, gold: 2000, xp: 3000, exclusiveTitle: true },
      { from: 2, to: 3, gold: 1000, xp: 1500, exclusiveTitle: false },
      { from: 4, to: 10, gold: 400, xp: 600, exclusiveTitle: false },
    ],
  },
} as const;

export type Balance = typeof BALANCE;
