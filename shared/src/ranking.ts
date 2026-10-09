import { BALANCE } from './balance.js';
import { winChance } from './power.js';

const R = BALANCE.ranking;

export interface RankContext {
  challengerPr: number;
  defenderPr: number;
  /** Poder de combate (powerRating) de cada um na hora da luta. */
  challengerPower: number;
  defenderPower: number;
}

const clampGain = (v: number) => Math.max(R.prMinGain, Math.min(R.prMaxGain, Math.round(v)));

/** Chance (0–1) de o desafiante vencer. */
export function challengerChance(ctx: RankContext): number {
  return winChance({ power: ctx.challengerPower, pr: ctx.challengerPr }, { power: ctx.defenderPower, pr: ctx.defenderPr });
}

/**
 * Variação de PR de uma luta ranqueada, pela chance que cada um tinha de vencer:
 *  - o vencedor ganha K × (chance que ele tinha de PERDER), entre prMinGain e prMaxGain;
 *  - o perdedor perde o mesmo (desafiante favorito que perde, perde 25% a mais).
 */
export function prDelta(ctx: RankContext, winner: 'challenger' | 'defender' | 'draw'): { challenger: number; defender: number } {
  if (winner === 'draw') return { challenger: 0, defender: 0 };
  const e = challengerChance(ctx);
  if (winner === 'challenger') {
    const g = clampGain(R.prK * (1 - e));
    return { challenger: g, defender: -g };
  }
  const g = clampGain(R.prK * e);
  const loss = e > 0.5 ? Math.round(g * R.favoriteChallengerLossMult) : g;
  return { challenger: -loss, defender: g };
}

/**
 * Recusar/deixar expirar: o desafiado perde metade do que perderia lutando e
 * perdendo (entre min e max); o desafiante ganha metade disso.
 */
export function declineStakes(ctx: RankContext): { defender: number; challenger: number } {
  const D = R.decline;
  const wouldLose = -prDelta(ctx, 'challenger').defender;
  const loss = Math.max(D.min, Math.min(D.max, Math.round(wouldLose * D.lossShare)));
  return { defender: -loss, challenger: Math.max(1, Math.round(loss * D.challengerShare)) };
}

/** Prêmio de fim de temporada para uma posição (ou null). */
export function seasonReward(position: number) {
  return R.seasonRewards.find((r) => position >= r.from && position <= r.to) ?? null;
}

/** Soft reset: PR volta parcialmente em direção a 1000. */
export function softResetPr(pr: number): number {
  return Math.round(R.startPr + (pr - R.startPr) * R.seasonSoftResetFactor);
}
