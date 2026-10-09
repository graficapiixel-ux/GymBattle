import { BALANCE } from './balance.js';

const B = BALANCE;

/** XP necessário para sair do `level` atual e ir para o próximo. */
export function xpToNext(level: number): number {
  return B.levels.xpBase + B.levels.xpPerLevel * level;
}

export interface LevelState {
  level: number;
  /** XP dentro do nível atual. Pode ser negativo (ex.: após remoção de foto fake). */
  xp: number;
  attrPoints: number;
}

/**
 * Aplica ganho (ou perda) de XP. O nível NUNCA diminui: se o XP ficar negativo,
 * o jogador precisa recuperá-lo antes de subir de novo.
 */
export function applyXp(state: LevelState, delta: number): LevelState & { levelsGained: number } {
  let { level, xp, attrPoints } = state;
  xp += delta;
  let levelsGained = 0;
  while (level < B.levels.maxLevel && xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level++;
    levelsGained++;
    attrPoints += B.levels.attributePointsPerLevel;
  }
  if (level >= B.levels.maxLevel) {
    level = B.levels.maxLevel;
    xp = Math.min(xp, xpToNext(level) - 1);
  }
  return { level, xp, attrPoints, levelsGained };
}

/** Bônus de streak (0 a maxBonus). Streak 1 = primeiro dia = sem bônus. */
export function streakBonus(streak: number): number {
  return Math.min(Math.max(streak - 1, 0) * B.streak.bonusPerDay, B.streak.maxBonus);
}

export function postReward(streak: number): { xp: number; gold: number; bonus: number } {
  const bonus = streakBonus(streak);
  return {
    xp: Math.round(B.post.baseXp * (1 + bonus)),
    gold: Math.round(B.post.baseGold * (1 + bonus)),
    bonus,
  };
}

// ------------------------------------------------------------------
// Dias no fuso de Brasília
// ------------------------------------------------------------------

/** Retorna 'YYYY-MM-DD' da data no fuso configurado. */
export function dayKey(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: B.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return parts; // en-CA já formata como YYYY-MM-DD
}

/** Hora (0–23) e dia da semana (0 = domingo) no fuso configurado. */
export function localClock(date: Date = new Date()): { hour: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: B.timezone, hour: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  return { hour, weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd) };
}

function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function daysBetween(a: string, b: string): number {
  return dayNumber(b) - dayNumber(a);
}

/** Chave da semana (segunda-feira da semana do dia) — usada para o dia de descanso. */
export function weekKey(key: string): string {
  const n = dayNumber(key);
  const dow = (new Date(n * 86_400_000).getUTCDay() + 6) % 7; // 0 = segunda
  const monday = new Date((n - dow) * 86_400_000);
  return monday.toISOString().slice(0, 10);
}

function addDays(key: string, n: number): string {
  return new Date((dayNumber(key) + n) * 86_400_000).toISOString().slice(0, 10);
}

export interface StreakState {
  streak: number;
  lastPostDay: string | null;
  /** Semanas (weekKey) em que o dia de descanso já foi usado. Guardamos só as recentes. */
  restWeeks: string[];
}

/**
 * Calcula a nova streak quando o jogador faz o post recompensado do dia `today`.
 * Regras: dia seguinte → +1. Faltou dias → cada dia faltante pode ser coberto pelo
 * dia de descanso da sua semana (1 por semana). Se algum dia faltante não puder
 * ser coberto, a streak volta a 1.
 */
export function nextStreak(state: StreakState, today: string): StreakState {
  if (!state.lastPostDay) return { streak: 1, lastPostDay: today, restWeeks: [] };
  const gap = daysBetween(state.lastPostDay, today);
  if (gap <= 0) return state; // mesmo dia: nada muda
  if (gap === 1) return { ...state, streak: state.streak + 1, lastPostDay: today };

  const used = [...state.restWeeks];
  for (let i = 1; i < gap; i++) {
    const wk = weekKey(addDays(state.lastPostDay, i));
    if (used.filter((w) => w === wk).length >= B.streak.restDaysPerWeek) {
      return { streak: 1, lastPostDay: today, restWeeks: [] };
    }
    used.push(wk);
  }
  const recent = used.filter((w) => daysBetween(w, today) <= 14);
  return { streak: state.streak + 1, lastPostDay: today, restWeeks: recent };
}

/**
 * Streak "visível" hoje: se o jogador já perdeu a chance de manter a streak
 * (faltou mais dias do que o descanso cobre), mostra 0.
 */
export function currentStreak(state: StreakState, today: string): number {
  if (!state.lastPostDay) return 0;
  const gap = daysBetween(state.lastPostDay, today);
  if (gap <= 1) return state.streak;
  const sim = nextStreak(state, today);
  return sim.streak === 1 ? 0 : state.streak;
}

// ------------------------------------------------------------------
// Atributos
// ------------------------------------------------------------------

export const ATTRIBUTES = ['str', 'dex', 'vig', 'fort', 'ess', 'int', 'fai'] as const;
export type AttributeKey = (typeof ATTRIBUTES)[number];
export type Attributes = Record<AttributeKey, number>;

export const ATTRIBUTE_LABELS: Record<AttributeKey, { name: string; short: string; desc: string }> = {
  str: { name: 'Força', short: 'FOR', desc: 'Dano de armas pesadas e requisito das armas grandes.' },
  dex: { name: 'Destreza', short: 'DES', desc: 'Dano de armas leves/rápidas e velocidade de ataque.' },
  vig: { name: 'Vigor', short: 'VIG', desc: 'Vida máxima.' },
  fort: { name: 'Fortitude', short: 'FORT', desc: 'Stamina máxima e regeneração.' },
  ess: { name: 'Essência', short: 'ESS', desc: 'Mana máxima e regeneração.' },
  int: { name: 'Inteligência', short: 'INT', desc: 'Dano arcano, gelo, veneno e sombra.' },
  fai: { name: 'Fé', short: 'FÉ', desc: 'Milagres, fogo sagrado, raio, cura e buffs.' },
};

/** Valor efetivo com retornos decrescentes (soft caps). */
export function effectiveAttr(value: number): number {
  const a = B.attributes;
  const v = Math.min(value, a.max);
  if (v <= a.softCap1) return v;
  if (v <= a.softCap2) return a.softCap1 + (v - a.softCap1) * a.softCap1Rate;
  return a.softCap1 + (a.softCap2 - a.softCap1) * a.softCap1Rate + (v - a.softCap2) * a.softCap2Rate;
}

/** Custo em ouro da redistribuição de pontos. */
export function respecCost(level: number, respecCount: number): number {
  const r = B.attributes.respec;
  if (r.firstFree && respecCount === 0) return 0;
  return Math.min(r.maxGold, r.baseGold + r.goldPerLevel * level);
}

/** Total de pontos que o jogador tem (gastos + livres) para o nível. */
export function totalAttrPointsForLevel(level: number): number {
  return (level - 1) * B.levels.attributePointsPerLevel;
}

/** Pontos distribuídos (acima do valor inicial de cada atributo). */
export function spentPoints(attrs: Attributes): number {
  return ATTRIBUTES.reduce((sum, k) => sum + Math.max(0, attrs[k] - B.attributes.start), 0);
}

export function derivedStats(attrs: Attributes) {
  const a = B.attributes;
  const e = (k: AttributeKey) => effectiveAttr(attrs[k]);
  return {
    maxHp: Math.round(a.baseHp + a.hpPerVigor * e('vig') + a.hpPerAttributePoint * spentPoints(attrs)),
    maxStamina: Math.round(a.baseStamina + a.staminaPerFortitude * e('fort')),
    staminaRegen: a.baseStaminaRegen + a.staminaRegenPerFortitude * e('fort'),
    maxMana: Math.round(a.baseMana + a.manaPerEssence * e('ess')),
    manaRegen: a.baseManaRegen + a.manaRegenPerEssence * e('ess'),
  };
}

// ------------------------------------------------------------------
// Hitbox e alcance (iguais para todos; a altura não influencia mais)
// ------------------------------------------------------------------

export function clampHeight(h: number): number {
  return Math.min(B.avatar.maxHeight, Math.max(B.avatar.minHeight, h));
}

export function hitboxFor(height: number): { w: number; h: number; reachMult: number } {
  const s = clampHeight(height);
  const av = B.avatar;
  return {
    w: av.baseHitboxWidth * (1 + (s - 1) * av.hitboxWidthInfluence),
    h: av.baseHitboxHeight * (1 + (s - 1) * av.hitboxHeightInfluence),
    reachMult: 1 + (s - 1) * av.reachInfluence,
  };
}
