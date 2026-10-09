import type { WeaponCategory } from '@gymbattle/shared';
import type { Actor } from './kit';

/** Estilo da trilha: escala, instrumentos e clima. */
export interface MusicSpec {
  /** Nota base (MIDI). 45 = Lá grave. */
  root: number;
  /** Clima: define a escala e os acordes. */
  mood: 'heroic' | 'dark' | 'japan' | 'arcane' | 'holy' | 'fire' | 'storm' | 'wild';
  /** Batidas por minuto. */
  bpm: number;
  /** Instrumento que faz a melodia. */
  lead: 'brass' | 'choir' | 'flute' | 'strings' | 'synth';
}

export interface Scene {
  id: string;
  /** Tipo de arma que ativa este evento. */
  cat: WeaponCategory;
  name: string;
  sub: string;
  /** Cor principal (título, brilhos) e cor do brilho. */
  color: string;
  glow: string;
  /** Céu da cena (topo, base). */
  sky: [string, string];
  /** Momentos usados nas prévias. */
  frames: [number, number, number];
  music: MusicSpec;
  /** Por cima do cenário, em coordenadas de TELA. `a`/`b` = posição dos lutadores na tela. */
  backdrop?: (ctx: CanvasRenderingContext2D, p: number, view: { w: number; h: number }, a: { x: number; y: number }, b: { x: number; y: number }) => void;
  /** Lutadores e efeitos, em coordenadas do MUNDO. */
  world: (ctx: CanvasRenderingContext2D, p: number, A: Actor, B: Actor) => void;
  /** Efeitos por cima de tudo, em coordenadas de TELA. */
  overlay?: (ctx: CanvasRenderingContext2D, p: number, view: { w: number; h: number }, a: { x: number; y: number }, b: { x: number; y: number }) => void;
}
