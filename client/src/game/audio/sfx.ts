/**
 * Efeitos sonoros do combate, sintetizados na hora (sem arquivos).
 * Cada som tem um volume base já equilibrado com os outros (GAIN), e o canal
 * de efeitos passa por um compressor — nenhum fica muito mais alto que outro.
 */
import type { Element, VfxKey } from '@gymbattle/shared';
import { getAudio } from './engine';

/** Volume relativo de cada tipo de som (equilíbrio). */
const GAIN = {
  // (medidos: sons de "ruído" filtrado precisam de ganho maior para soar no mesmo volume)
  swing: 1.4, swingHeavy: 2.6, hit: 0.47, hitBig: 0.58, shoot: 0.36, magic: 0.28, explosion: 0.45,
  jump: 0.84, land: 0.14, dodge: 0.7, ko: 0.66, heal: 0.18, status: 0.36, respawn: 0.25, miss: 0.4,
};

let noise: AudioBuffer | null = null;
function noiseBuf(ctx: BaseAudioContext) {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise;
  const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = b.getChannelData(0);
  let s = 7;
  for (let i = 0; i < d.length; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    d[i] = (s / 4294967296) * 2 - 1;
  }
  noise = b;
  return b;
}

/** Não repete o mesmo som mais de uma vez a cada ~35 ms (golpes múltiplos). */
const last = new Map<string, number>();
function gate(key: string, ms = 35) {
  const now = performance.now();
  if ((last.get(key) ?? 0) > now - ms) return false;
  last.set(key, now);
  return true;
}

type Ctx = { ctx: BaseAudioContext; out: AudioNode; t: number };
/** Só para medir volumes (galeria de desenvolvimento): renderiza num contexto offline. */
let override: { ctx: BaseAudioContext; out: AudioNode } | null = null;
export function __sfxTarget(t: { ctx: BaseAudioContext; out: AudioNode } | null) {
  override = t;
  last.clear();
}
function begin(key: string, delay = 0, ms?: number): Ctx | null {
  if (override) return { ctx: override.ctx, out: override.out, t: Math.max(0, delay) + 0.005 };
  const a = getAudio();
  if (!a || a.ctx.state !== 'running' || !gate(key, ms)) return null;
  return { ctx: a.ctx, out: a.sfx, t: a.ctx.currentTime + Math.max(0, delay) + 0.005 };
}

function env(c: Ctx, vol: number, att: number, dur: number, at = c.t) {
  const g = c.ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), at + att);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  g.connect(c.out);
  return g;
}

function tone(c: Ctx, type: OscillatorType, f0: number, f1: number, vol: number, dur: number, att = 0.004, at = c.t) {
  const o = c.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, at);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
  o.connect(env(c, vol, att, dur, at));
  o.start(at);
  o.stop(at + dur + 0.02);
}

function hiss(c: Ctx, type: BiquadFilterType, f0: number, f1: number, q: number, vol: number, dur: number, att = 0.005, at = c.t) {
  const src = c.ctx.createBufferSource();
  src.buffer = noiseBuf(c.ctx);
  const f = c.ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, at);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), at + dur);
  src.connect(f);
  f.connect(env(c, vol, att, dur, at));
  src.start(at, Math.random() * 0.5);
  src.stop(at + dur + 0.02);
}

// ------------------------------------------------------------------ sons

/** Lâmina cortando o ar. heavy = arma pesada (mais grave e longo). */
export function sfxSwing(heavy: boolean, delay = 0) {
  const c = begin('swing', delay, 60);
  if (!c) return;
  const v = heavy ? GAIN.swingHeavy : GAIN.swing;
  const d = heavy ? 0.28 : 0.17;
  hiss(c, 'bandpass', heavy ? 300 : 700, heavy ? 1400 : 3200, 1.4, v, d, d * 0.45);
}

const EL_TONE: Partial<Record<Element, (c: Ctx, v: number) => void>> = {
  fire: (c, v) => hiss(c, 'lowpass', 1800, 300, 0.7, v * 0.6, 0.35, 0.01),
  ice: (c, v) => { tone(c, 'sine', 2400, 1800, v * 0.35, 0.25); tone(c, 'sine', 3200, 2600, v * 0.2, 0.2); },
  lightning: (c, v) => { tone(c, 'square', 900, 120, v * 0.25, 0.14); hiss(c, 'highpass', 3000, 5000, 0.8, v * 0.4, 0.12); },
  holy: (c, v) => { tone(c, 'sine', 880, 870, v * 0.3, 0.5, 0.005); tone(c, 'sine', 1320, 1310, v * 0.2, 0.45, 0.005); },
  shadow: (c, v) => { tone(c, 'sawtooth', 110, 55, v * 0.25, 0.3); },
  poison: (c, v) => { for (let i = 0; i < 3; i++) tone(c, 'sine', 500 + i * 180, 900 + i * 200, v * 0.15, 0.08, 0.004, c.t + i * 0.05); },
  blood: (c, v) => hiss(c, 'lowpass', 900, 200, 1.2, v * 0.45, 0.2),
  arcane: (c, v) => { tone(c, 'triangle', 660, 1320, v * 0.25, 0.25); tone(c, 'sine', 990, 1980, v * 0.15, 0.22); },
};

/** Golpe acertando. */
export function sfxHit(big: boolean, el: Element) {
  const c = begin('hit', 0, 30);
  if (!c) return;
  const v = big ? GAIN.hitBig : GAIN.hit;
  // pancada (corpo) + estalo (impacto)
  tone(c, 'sine', big ? 150 : 190, big ? 42 : 60, v, big ? 0.32 : 0.18, 0.002);
  hiss(c, 'highpass', 2200, 900, 0.7, v * 0.55, big ? 0.14 : 0.08, 0.001);
  if (big) hiss(c, 'lowpass', 700, 120, 0.8, v * 0.5, 0.35, 0.004);
  EL_TONE[el]?.(c, v);
}

/** Disparo de projétil. */
export function sfxShoot(vfx: VfxKey, el: Element) {
  const c = begin('shoot:' + vfx, 0, 45);
  if (!c) return;
  const v = GAIN.shoot;
  switch (vfx) {
    case 'arrow':
    case 'piercing_arrow':
      tone(c, 'triangle', 320, 140, v, 0.12, 0.002);
      hiss(c, 'bandpass', 3000, 1500, 2, v * 0.5, 0.09);
      break;
    case 'dagger_throw':
      hiss(c, 'bandpass', 1800, 4200, 1.5, v * 4, 0.12, 0.03);
      break;
    case 'fireball':
      hiss(c, 'lowpass', 400, 1600, 0.8, v * 6, 0.32, 0.05);
      break;
    case 'lightning_spear':
      tone(c, 'square', 1400, 200, v * 0.6, 0.18);
      hiss(c, 'highpass', 4000, 2500, 0.8, v * 0.7, 0.15);
      break;
    default:
      // magia: brilho subindo com o timbre do elemento
      tone(c, 'sine', 380, 900, GAIN.magic, 0.24, 0.02);
      tone(c, 'triangle', 760, 1500, GAIN.magic * 0.5, 0.2, 0.02);
      EL_TONE[el]?.(c, GAIN.magic * 0.6);
  }
}

/** Explosão / área / projétil acertando. size 0–1. */
export function sfxExplosion(size: number, el: Element) {
  const c = begin('boom', 0, 50);
  if (!c) return;
  const v = GAIN.explosion * (0.6 + size * 0.4);
  tone(c, 'sine', 110, 35, v, 0.35 + size * 0.3, 0.003);
  hiss(c, 'lowpass', 2500, 150, 0.7, v * 0.7, 0.3 + size * 0.3, 0.004);
  EL_TONE[el]?.(c, v * 0.7);
}

export function sfxJump(double: boolean) {
  const c = begin('jump', 0, 80);
  if (c) hiss(c, 'bandpass', double ? 900 : 500, double ? 2600 : 1600, 1.2, GAIN.jump, 0.14, 0.02);
}

export function sfxLand(hard: boolean) {
  const c = begin('land', 0, 90);
  if (!c) return;
  tone(c, 'sine', hard ? 120 : 160, 50, GAIN.land * (hard ? 1.4 : 1), hard ? 0.22 : 0.1, 0.002);
  hiss(c, 'lowpass', 900, 200, 0.7, GAIN.land * 0.6, hard ? 0.18 : 0.08);
}

export function sfxDodge() {
  const c = begin('dodge', 0, 80);
  if (c) hiss(c, 'bandpass', 2600, 600, 1.1, GAIN.dodge, 0.16, 0.01);
}

export function sfxMiss() {
  const c = begin('miss', 0, 120);
  if (!c) return;
  hiss(c, 'bandpass', 3500, 1200, 1.5, GAIN.miss, 0.12, 0.005);
  tone(c, 'sine', 1400, 1900, GAIN.miss * 0.4, 0.08);
}

/** Nocaute: estrondo grave com cauda. */
export function sfxKo() {
  const c = begin('ko', 0, 300);
  if (!c) return;
  tone(c, 'sine', 95, 28, GAIN.ko, 1.1, 0.003);
  hiss(c, 'lowpass', 3000, 90, 0.6, GAIN.ko * 0.6, 0.9, 0.004);
  hiss(c, 'highpass', 5000, 3000, 0.7, GAIN.ko * 0.25, 0.5, 0.002);
}

export function sfxHeal() {
  const c = begin('heal', 0, 200);
  if (!c) return;
  [660, 880, 1320].forEach((f, i) => tone(c, 'sine', f, f * 1.01, GAIN.heal, 0.45, 0.01, c.t + i * 0.07));
}

export function sfxStatus(kind: 'freeze' | 'shock' | 'poison' | 'burn' | 'bleed' | 'launch') {
  const c = begin('status:' + kind, 0, 150);
  if (!c) return;
  const v = GAIN.status;
  if (kind === 'freeze') { tone(c, 'sine', 3000, 2200, v * 0.6, 0.3); hiss(c, 'highpass', 6000, 4000, 1, v * 0.5, 0.3); }
  else if (kind === 'shock') { for (let i = 0; i < 3; i++) tone(c, 'square', 1200 - i * 200, 150, v * 0.63, 0.07, 0.002, c.t + i * 0.05); }
  else if (kind === 'poison') EL_TONE.poison!(c, v * 1.5);
  else if (kind === 'burn') EL_TONE.fire!(c, v * 1.2);
  else if (kind === 'bleed') EL_TONE.blood!(c, v * 1.2);
}

export function sfxRespawn() {
  const c = begin('respawn', 0, 300);
  if (!c) return;
  tone(c, 'triangle', 440, 880, GAIN.respawn, 0.5, 0.05);
  hiss(c, 'bandpass', 800, 4000, 1, GAIN.respawn * 0.5, 0.5, 0.1);
}

/** Fanfarra de recompensa (mais rica quanto maior a raridade). */
export function sfxReward(rarity: string) {
  const c = begin('reward', 0, 500);
  if (!c) return;
  const rich = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 }[rarity] ?? 2;
  // estouro grave + brilho
  tone(c, 'sine', 120, 40, 0.5, 0.6, 0.003);
  hiss(c, 'highpass', 6000, 2500, 0.7, 0.25, 0.6, 0.004);
  // arpejo subindo
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568];
  notes.slice(0, 3 + Math.min(3, rich)).forEach((f, i) => {
    tone(c, 'triangle', f, f, 0.16, 0.5, 0.01, c.t + 0.15 + i * 0.09);
    tone(c, 'sine', f * 2, f * 2, 0.05, 0.4, 0.01, c.t + 0.15 + i * 0.09);
  });
  // acorde final
  const at = c.t + 0.2 + notes.length * 0.09;
  [523.25, 659.25, 783.99, 1046.5].forEach((f) => tone(c, 'sine', f, f * 1.005, 0.08 + rich * 0.015, 1.4, 0.03, at));
}
