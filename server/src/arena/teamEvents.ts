/**
 * Lutas dos eventos em equipe: PvP em equipes (de verdade, pelos atributos) e
 * Waves (o time contra 10 ondas de monstros + o mini-chefe).
 * A chance das waves NUNCA sai daqui: o jogador só recebe a luta pronta.
 */
import { randomInt } from 'node:crypto';
import type { FighterInput, TeamArenaDef, TeamReplay } from '@gymbattle/shared';
import { simulateTeamFight } from './teamsim.js';
import { WAVES_TOTAL, arenaFor, buildWaves, type WaveTheme } from './waves.js';

/** Cenários do PvP em equipes (sorteados pela semente). */
const PVP_ARENAS: TeamArenaDef['theme'][] = [
  { id: 'coliseu', name: 'Coliseu de Areia', sky: ['#1a0e06', '#7a4a1e'], ground: '#5a3e22', fog: '#ffb36b', particle: '#ffe0a8' },
  { id: 'noturna', name: 'Arena Noturna', sky: ['#04060e', '#1e2a4a'], ground: '#1e2430', fog: '#5aa8ff', particle: '#cfe4ff' },
  { id: 'templo', name: 'Templo dos Campeões', sky: ['#0a0612', '#3a2050'], ground: '#2a2234', fog: '#ffd24a', particle: '#fff1b8' },
  { id: 'pantano', name: 'Pântano de Guerra', sky: ['#020806', '#1a3a2a'], ground: '#1c2a20', fog: '#7dffb0', particle: '#c8ffd8' },
];

/** Vida extra no PvP em equipes (igual para todos). */
export const PVP_HP_MULT = 2.2;

export function pvpArena(totalPlayers: number, seed: number): TeamArenaDef {
  return {
    width: Math.round(Math.min(3200, Math.max(1700, 1500 + 150 * totalPlayers))),
    ground: 600,
    theme: PVP_ARENAS[seed % PVP_ARENAS.length],
  };
}

/** PvP em equipes: quem vence é decidido pela luta (atributos, armas e IA), sem chance definida. */
export function runPvp(a: { name: string; fighters: FighterInput[] }, b: { name: string; fighters: FighterInput[] }, seed: number): TeamReplay {
  return simulateTeamFight({
    seed,
    mode: 'pvp',
    arena: pvpArena(a.fighters.length + b.fighters.length, seed),
    units: [
      ...a.fighters.map((f) => ({ kind: 'player' as const, team: 0 as const, fighter: f })),
      ...b.fighters.map((f) => ({ kind: 'player' as const, team: 1 as const, fighter: f })),
    ],
    teamNames: [a.name, b.name],
    // sem "vidas" como no 1×1: mais vida deixa a luta em equipe com tempo de ser assistida
    playerHpMult: PVP_HP_MULT,
  });
}

function wavesOnce(theme: WaveTheme, fighters: FighterInput[], seed: number, D: number) {
  return simulateTeamFight({
    seed,
    mode: 'waves',
    arena: arenaFor(theme, fighters.length),
    units: buildWaves(theme, fighters, seed, D),
    teamNames: [fighters.length === 1 ? fighters[0].username : `Time de ${fighters[0].username}`, theme.name],
    waveTotal: WAVES_TOTAL,
    chiefName: `${theme.chief.name} ${theme.chief.title}`,
  });
}

/**
 * Waves. Automático: a luta decide (a dificuldade já é calibrada pelo tamanho do
 * time, e a força de cada um faz a diferença). Fixo: sorteia o resultado com a
 * chance do admin e procura uma luta com esse resultado (ajustando a força das hordas).
 */
export function runWaves(theme: WaveTheme, fighters: FighterInput[], chance: { auto: true } | { auto: false; percent: number }): { replay: TeamReplay; seed: number } {
  if (chance.auto) {
    const seed = randomInt(1, 2_000_000_000);
    return { replay: wavesOnce(theme, fighters, seed, 1), seed };
  }
  const want = randomInt(0, 10_000) < chance.percent * 100;
  let D = 1;
  let last: { replay: TeamReplay; seed: number } | null = null;
  for (let i = 0; i < 12; i++) {
    const seed = randomInt(1, 2_000_000_000);
    const replay = wavesOnce(theme, fighters, seed, D);
    last = { replay, seed };
    if ((replay.winner === 0) === want) return last;
    D *= want ? 0.7 : 1.45;
  }
  return last!;
}
