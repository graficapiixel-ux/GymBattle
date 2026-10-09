/**
 * Como cada boss se MOVE pela arena (quão rápido, se salta, se voa, se pisa pesado
 * e como troca de lado com o time). Ágeis disparam em arrancadas e saltam por cima
 * do time; pesados andam devagar e fazem o chão tremer; voadores flutuam e cruzam
 * a arena pelo alto; espíritos somem e reaparecem.
 */
import type { BossSpec } from '@gymbattle/shared';

export interface Mobility {
  /** Velocidade máxima no chão (mundo/s). */
  speed: number;
  /** Rapidez para acelerar/frear (1/s): alto = arrancadas secas. */
  accel: number;
  /**
   * walk: anda contínuo · skitter: arrancadas curtas com pausas (inseto/lobo) ·
   * stomp: passos pesados e lentos · hover: flutua (sem pés) · hop: só se move pulando.
   */
  style: 'walk' | 'skitter' | 'stomp' | 'hover' | 'hop';
  /** 0..1: chance de usar um salto ao se reposicionar. */
  leap: number;
  /** Altura típica do salto (mundo, antes da escala). */
  leapH: number;
  /** Bate asas quando está no ar. */
  wings: boolean;
  /** 0..1: peso (pisadas tremem a tela e levantam poeira). */
  heavy: number;
  /** Como troca de lado com o time: salta por cima, voa por cima, some e reaparece, ou o time flanqueia. */
  swap: 'leap' | 'fly' | 'phase' | 'players';
  /** Chance de trocar de lado antes de um golpe. */
  swapChance: number;
  /** Tempo de reação para virar (s). */
  react: number;
}

const BASE: Record<string, Mobility> = {
  agile: {
    speed: 300,
    accel: 11,
    style: 'skitter',
    leap: 0.5,
    leapH: 230,
    wings: false,
    heavy: 0,
    swap: 'leap',
    swapChance: 0.45,
    react: 0.12,
  },
  medium: {
    speed: 150,
    accel: 5,
    style: 'walk',
    leap: 0.15,
    leapH: 160,
    wings: false,
    heavy: 0.35,
    swap: 'players',
    swapChance: 0.35,
    react: 0.35,
  },
  heavy: { speed: 75, accel: 3, style: 'stomp', leap: 0, leapH: 0, wings: false, heavy: 1, swap: 'players', swapChance: 0.35, react: 0.6 },
  hover: { speed: 190, accel: 3, style: 'hover', leap: 0, leapH: 260, wings: false, heavy: 0, swap: 'fly', swapChance: 0.4, react: 0.3 },
  ghost: { speed: 170, accel: 3.5, style: 'hover', leap: 0, leapH: 0, wings: false, heavy: 0, swap: 'phase', swapChance: 0.45, react: 0.2 },
  hop: { speed: 170, accel: 6, style: 'hop', leap: 1, leapH: 120, wings: false, heavy: 0.4, swap: 'leap', swapChance: 0.35, react: 0.25 },
};

/** Ajustes por boss (o resto vem do arquétipo). */
const BY_ID: Record<string, Partial<Mobility> & { base: keyof typeof BASE }> = {
  // insetos
  thessa: { base: 'agile', speed: 330, leap: 0.6, leapH: 260, wings: true, swapChance: 0.55 }, // louva-a-deus: rápida, salta e voa
  azhrak: { base: 'agile', speed: 230, leap: 0.12, leapH: 140, heavy: 0.25, swap: 'players', swapChance: 0.35, react: 0.2 }, // escorpião: corre de lado, não voa
  aracnara: { base: 'agile', speed: 280, leap: 0.55, leapH: 240 }, // aranha: bote com salto
  khepros: { base: 'medium', speed: 130, heavy: 0.7, leap: 0.25, leapH: 170, wings: true, swap: 'leap' }, // besouro titã: pesado, mas voa curto
  // dragões
  vermithrax: { base: 'medium', speed: 140, heavy: 0.8, leap: 0.3, leapH: 300, wings: true, swap: 'fly', swapChance: 0.45 },
  glaciareth: { base: 'medium', speed: 140, heavy: 0.7, leap: 0.3, leapH: 300, wings: true, swap: 'fly', swapChance: 0.45 },
  nyxvorath: { base: 'medium', speed: 150, heavy: 0.8, leap: 0.3, leapH: 320, wings: true, swap: 'fly', swapChance: 0.45 },
  zharkul: { base: 'agile', speed: 240, leap: 0.4, leapH: 280, heavy: 0.2, swap: 'fly' }, // wyrm: serpenteia rápido
  // golens e máquinas
  kragmaw: { base: 'heavy' },
  ferrolho: { base: 'heavy', speed: 85 },
  prismora: { base: 'heavy', speed: 90, heavy: 0.7 },
  magmor: { base: 'heavy' },
  mkzero: { base: 'heavy', speed: 95, heavy: 0.9 },
  relojoeiro: { base: 'medium', speed: 120, heavy: 0.5 },
  omega: { base: 'hover', speed: 210 },
  dravex: { base: 'heavy', speed: 120, heavy: 0.8, accel: 2 }, // esteiras: embala devagar e vai longe
  // mortos-vivos
  morgrath: { base: 'ghost', speed: 120 },
  ossuario: { base: 'heavy', speed: 85 },
  vesperine: { base: 'ghost', speed: 190 },
  grimhollow: { base: 'agile', speed: 340, leap: 0.35, leapH: 200, heavy: 0.4, swap: 'leap' }, // cavaleiro a galope
  // feras
  fenrak: { base: 'agile', speed: 360, leap: 0.55, leapH: 240, heavy: 0.2 }, // lobo
  ursaroth: { base: 'medium', speed: 160, heavy: 0.7, leap: 0.2, leapH: 150 },
  trifauce: { base: 'agile', speed: 270, leap: 0.45, leapH: 260, wings: true },
  behemoth: { base: 'heavy', speed: 105, accel: 2.4 },
  // serpentes
  leviata: { base: 'medium', speed: 170, heavy: 0.5 },
  thalassor: { base: 'medium', speed: 120, heavy: 0.6 },
  hidra: { base: 'medium', speed: 130, heavy: 0.7 },
  quetzaryn: { base: 'agile', speed: 240, leap: 0.5, leapH: 300, wings: true, heavy: 0.1, swap: 'fly' },
  // plantas (enraizadas: arrastam-se devagar)
  thornwood: { base: 'heavy', speed: 55, heavy: 0.8 },
  rafflesia: { base: 'heavy', speed: 60, heavy: 0.4 },
  myconid: { base: 'hop', speed: 140, leapH: 100 },
  sakuraya: { base: 'heavy', speed: 50, heavy: 0.7 },
  // gosmas
  gluttonox: { base: 'hop', speed: 150, leapH: 130, heavy: 0.7 },
  milbocas: { base: 'hop', speed: 180, leapH: 140 },
  ovocosmico: { base: 'hover', speed: 130 },
  botoes: { base: 'hop', speed: 200, leapH: 160, heavy: 0.2 },
};

const BY_ARCH: Record<string, keyof typeof BASE> = {
  dragon: 'medium',
  golem: 'heavy',
  eye: 'hover',
  undead: 'medium',
  elemental: 'hover',
  insect: 'agile',
  machine: 'heavy',
  deity: 'hover',
  serpent: 'medium',
  spirit: 'ghost',
  blob: 'hop',
  beast: 'medium',
  plant: 'heavy',
  duelist: 'agile',
};

/** Bosses que flutuam o tempo todo (sem pés no chão). */
export const FLYERS = new Set(['eye', 'spirit', 'deity', 'elemental']);

export function mobilityOf(spec: BossSpec): Mobility {
  const o = BY_ID[spec.id];
  const base = BASE[o?.base ?? BY_ARCH[spec.arch] ?? 'medium'];
  const m: Mobility = { ...base, ...(o ?? {}) };
  delete (m as Partial<{ base: string }>).base;
  // quem flutua por natureza nunca "pisa"
  if (FLYERS.has(spec.arch) || spec.id === 'omega' || spec.id === 'ovocosmico') {
    m.style = 'hover';
    m.heavy = 0;
    if (m.swap === 'leap' || m.swap === 'players') m.swap = 'fly';
  }
  return m;
}
