/**
 * Chance real de vitória contra o boss (fica só no servidor; o jogador nunca vê).
 * Base definida pelo admin + 1 ponto percentual por membro EXTRA do time:
 * sozinho = base, 2 = +1%, 3 = +2%, ...
 */
export function bossWinChance(base: number, teamSize: number): number {
  const bonus = Math.max(0, Math.floor(teamSize) - 1);
  return Math.max(0, Math.min(100, base + bonus));
}
