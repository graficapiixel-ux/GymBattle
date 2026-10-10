/**
 * Eventos de boss — SÓ TIPOS (nada daqui vira código no site).
 * O catálogo dos bosses, a chance de vitória e a arte ficam no servidor;
 * o navegador só recebe o boss de um evento já ativo (ou tudo, se for o admin).
 */
import type { AvatarLook } from './types.js';
import type { Equipment } from './items/equipment.js';

export type BossArch =
  | 'dragon' | 'golem' | 'eye' | 'undead' | 'elemental' | 'insect' | 'machine'
  | 'deity' | 'serpent' | 'spirit' | 'blob' | 'beast' | 'plant'
  /** Do tamanho de um jogador: luta como no PvP (corre, pula, teletransporta). */
  | 'duelist';

/** Efeitos de ataque (cada um tem animação própria no kit de arte). */
export type BossFx =
  | 'breath' | 'meteor' | 'beam' | 'slam' | 'spikes' | 'lightning' | 'tentacles' | 'claws' | 'tail'
  | 'poison' | 'shards' | 'vortex' | 'minions' | 'roar' | 'charge' | 'crystals' | 'orbs' | 'scream'
  | 'web' | 'acid' | 'judgement' | 'shadowHands' | 'wave' | 'boulder' | 'drain' | 'gatling' | 'missiles'
  | 'quake' | 'petals' | 'gaze' | 'blades' | 'nova'
  /** Golpe próprio de um duelista (ver BossAttack.move). */
  | 'duel';

/** Pose do boss enquanto ataca. */
export type BossPose = 'breath' | 'slam' | 'cast' | 'swipe' | 'charge' | 'roar' | 'shoot';

export interface BossAttack {
  id: string;
  name: string;
  fx: BossFx;
  pose: BossPose;
  color: string;
  color2: string;
  /** Atinge o time todo (true) ou 1–2 alvos. */
  aoe: boolean;
  /** Duração da animação (s). */
  dur: number;
  /** Duelista: id do golpe no kit (m01…m20). */
  move?: string;
}

export interface BossSpec {
  id: string;
  name: string;
  title: string;
  lore: string;
  arch: BossArch;
  /** Escala do corpo (0,8 a 1,6). */
  size: number;
  pal: { body: string; dark: string; accent: string; glow: string; eye: string };
  /** Detalhes do corpo (chifres, asas, braços, pernas, olhos, espinhos…), de 0 a ~8. */
  feat: Record<string, number>;
  bg: { sky: [string, string]; ground: string; fog: string; particle: string };
  attacks: BossAttack[];
  /** Duelista: aparência (desenhado como um jogador). */
  avatar?: { look: AvatarLook; equipment: Equipment };
}

export interface BossPlayerMeta {
  id: string;
  username: string;
  level: number;
  look: AvatarLook;
  equipment: Equipment;
  maxHp: number;
  /** Tipo de golpe da arma: corpo a corpo, à distância ou magia. */
  style: 'melee' | 'ranged' | 'magic';
  color: string;
}

export type BossEv =
  | { t: number; type: 'pAtk'; p: number; dur: number; hitAt: number; dmg: number; crit: boolean; slot: 1 | 2 }
  | { t: number; type: 'bAtk'; a: number; dur: number; hitAt: number; targets: number[]; dmg: number[] }
  | { t: number; type: 'pKo'; p: number }
  | { t: number; type: 'bHeal'; amount: number }
  | { t: number; type: 'bDie' }
  | { t: number; type: 'end'; won: boolean };

export interface BossReplay {
  v: 1;
  seed: number;
  won: boolean;
  /** Em segundos. */
  duration: number;
  /** Fim da entrada do boss (s). */
  entrance: number;
  boss: BossSpec;
  bossHp: number;
  players: BossPlayerMeta[];
  events: BossEv[];
}

/** Tipo de evento: boss, PvP em equipes ou waves de monstros. */
export type EventKind = 'BOSS' | 'PVP' | 'WAVES';

/** Tema de waves visto pelo jogador (só o visual; a força dos monstros fica no servidor). */
export interface WaveThemePublic {
  id: string;
  name: string;
  desc: string;
  bg: { sky: [string, string]; ground: string; fog: string; particle: string };
  /** Monstros do tema (corpo do kit + escala) para o retrato. */
  monsters: { name: string; body: Pick<BossSpec, 'id' | 'arch' | 'size' | 'pal' | 'feat'>; scale: number }[];
  chief: { name: string; title: string; cls: string; look: AvatarLook; equipment: Equipment; aura: string };
}

/** O que o jogador vê de um evento ATIVO (NUNCA a chance de vitória). */
export interface BossEventPublic {
  id: string;
  kind: EventKind;
  endsAt: string;
  startsAt: string;
  teamSize: number;
  attempts: number;
  attemptsLeft: number;
  lootText: string;
  /** Só em evento de boss. */
  boss: BossSpec | null;
  /** Só em evento de waves. */
  theme: WaveThemePublic | null;
  /** Minha sala (time) atual, se houver. */
  run: BossRunDTO | null;
  /** Convites de outros times para mim. */
  invites: BossRunDTO[];
  /** Minhas lutas neste evento. PvP: `vs` = nomes do time adversário; waves: `reached` = wave alcançada. */
  history: { runId: string; won: boolean | null; foughtAt: string; vs?: string; reached?: number }[];
}

export interface BossRunDTO {
  id: string;
  leaderId: string;
  /** QUEUED = PvP: procurando adversário. */
  status: 'FORMING' | 'QUEUED' | 'FOUGHT' | 'CANCELLED';
  members: { id: string; username: string; level: number; accepted: boolean; attemptsLeft: number; avatar: AvatarLook; equipment: Equipment }[];
  won: boolean | null;
  foughtAt: string | null;
  queuedAt?: string | null;
}

/** Visão do admin (com chance e histórico). */
export interface BossEventAdmin {
  id: string;
  kind: EventKind;
  bossId: string;
  bossName: string;
  startsAt: string;
  endsAt: string;
  endedAt: string | null;
  status: 'SCHEDULED' | 'ACTIVE' | 'ENDED';
  attempts: number;
  teamSize: number;
  lootItemId: string | null;
  lootGold: number;
  lootXp: number;
  lootText: string | null;
  winChance: number;
  /** Waves: chance automática (pelas habilidades) ou fixa (winChance). */
  chanceAuto: boolean;
  stats: { fights: number; wins: number; players: number };
}

/** Tema de waves no painel do admin. */
export interface WaveThemeAdmin extends WaveThemePublic {
  waves: number;
  monsterNames: string[];
  chiefMoves: string[];
}
