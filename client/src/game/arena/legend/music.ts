/**
 * Trilha épica dos eventos lendários — sintetizada na hora (Web Audio), sem
 * arquivos de música. Toca SÓ durante a cena: começa junto com o evento e acaba
 * (com o eco se apagando) exatamente quando a animação termina.
 *
 * Estrutura (duração total `dur`, golpe final em `ko`):
 *  0s        estrondo + subida
 *  ~0.6s     tambores e cordas em ostinato, coral de fundo
 *  ~45%      entram os metais com o tema, tambores dobram
 *  ko        PANCADA: estrondo, prato, acorde de metais e coral
 *  ko → dur  eco final e silêncio
 */
import type { MusicSpec } from './types';
import { getAudio, unlockAudio } from '../../audio/engine';

const SCALES: Record<MusicSpec['mood'], number[]> = {
  heroic: [0, 2, 4, 5, 7, 9, 11],
  holy: [0, 2, 4, 6, 7, 9, 11],
  dark: [0, 2, 3, 5, 7, 8, 10],
  storm: [0, 2, 3, 5, 7, 8, 10],
  arcane: [0, 2, 3, 5, 7, 8, 11],
  fire: [0, 1, 4, 5, 7, 8, 10],
  japan: [0, 2, 3, 7, 8, 12, 14],
  wild: [0, 3, 5, 7, 10, 12, 15],
};
/** Progressões (graus da escala) — 4 acordes. */
const PROG: Record<MusicSpec['mood'], number[]> = {
  heroic: [0, 4, 5, 3],
  holy: [0, 3, 1, 4],
  dark: [0, 5, 2, 6],
  storm: [0, 6, 5, 4],
  arcane: [0, 5, 3, 4],
  fire: [0, 1, 6, 0],
  japan: [0, 3, 1, 4],
  wild: [0, 2, 4, 1],
};
/** Tema (graus; null = pausa), em colcheias. */
const MOTIF: (number | null)[] = [0, null, 2, 4, 3, null, 2, 1, 2, null, 4, 5, 4, 3, 2, null];

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export interface MusicHandle {
  stop: () => void;
}

/** Monta a trilha num contexto (tempo real ou offline). */
export function scheduleLegendMusic(ac: BaseAudioContext, out: AudioNode, spec: MusicSpec, t0: number, dur: number, koFrac = 0.8, from = t0) {
  /** Notas que começariam antes de `from` (cena já em andamento) são puladas. */
  const skip = (t: number) => t < from - 0.005;
  const ko = t0 + dur * koFrac;
  const end = t0 + dur;
  const scale = SCALES[spec.mood];
  const deg = (d: number, oct = 0) => {
    const n = scale.length;
    const o = Math.floor(d / n);
    return spec.root + scale[((d % n) + n) % n] + 12 * (o + oct);
  };
  const beat = 60 / spec.bpm;
  const eighth = beat / 2;

  // ---------------- mixagem: master → compressor → saída, com reverb
  const master = ac.createGain();
  master.gain.setValueAtTime(0, Math.max(t0, from));
  master.gain.linearRampToValueAtTime(0.7, Math.max(t0, from) + 0.05);
  master.gain.setValueAtTime(0.7, end - 0.9);
  master.gain.linearRampToValueAtTime(0, end);
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp);
  comp.connect(out);
  const verb = ac.createConvolver();
  verb.buffer = impulse(ac, 2.6);
  const verbGain = ac.createGain();
  verbGain.gain.value = 0.35;
  verb.connect(verbGain);
  verbGain.connect(master);
  const bus = (wet = 0.3) => {
    const g = ac.createGain();
    g.connect(master);
    const s = ac.createGain();
    s.gain.value = wet;
    g.connect(s);
    s.connect(verb);
    return g;
  };
  const drums = bus(0.15);
  const strings = bus(0.3);
  const brass = bus(0.35);
  const choir = bus(0.6);
  const fx = bus(0.4);
  const noise = noiseBuffer(ac);

  // ---------------- instrumentos
  const boom = (t: number, vol = 1) => {
    if (skip(t)) return;
    const o = ac.createOscillator();
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 1.2);
    const g = env(ac, t, 0.005, 1.6, vol * 0.9);
    o.connect(g); g.connect(fx);
    o.start(t); o.stop(t + 1.8);
    noiseHit(ac, noise, t, 1.2, 400, 'lowpass', vol * 0.5, fx);
  };
  const taiko = (t: number, vol = 1) => {
    if (skip(t)) return;
    const o = ac.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.18);
    const g = env(ac, t, 0.002, 0.45, vol * 0.8);
    o.connect(g); g.connect(drums);
    o.start(t); o.stop(t + 0.5);
    noiseHit(ac, noise, t, 0.08, 900, 'lowpass', vol * 0.25, drums);
  };
  const tick = (t: number, vol = 0.3) => !skip(t) && noiseHit(ac, noise, t, 0.05, 3500, 'bandpass', vol, drums);
  const saw = (m: number, t: number, len: number, vol: number, dest: AudioNode, cutoff: number, detune = 8, n = 2, type: OscillatorType = 'sawtooth', att = 0.01) => {
    if (skip(t)) return;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = env(ac, t, att, len, vol);
    f.connect(g); g.connect(dest);
    for (let i = 0; i < n; i++) {
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.value = midiHz(m);
      o.detune.value = (i - (n - 1) / 2) * detune;
      o.connect(f);
      o.start(t); o.stop(t + len + 0.1);
    }
  };
  const brassNote = (m: number, t: number, len: number, vol = 0.22) => {
    if (skip(t)) return;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(300, t);
    f.frequency.linearRampToValueAtTime(2600, t + 0.08);
    f.frequency.exponentialRampToValueAtTime(1200, t + len);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.05);
    g.gain.setValueAtTime(vol * 0.85, t + len * 0.8);
    g.gain.linearRampToValueAtTime(0, t + len + 0.08);
    f.connect(g); g.connect(brass);
    for (let i = 0; i < 3; i++) {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midiHz(m);
      o.detune.value = (i - 1) * 7;
      const vib = ac.createOscillator();
      vib.frequency.value = 5.2;
      const vg = ac.createGain();
      vg.gain.value = 5;
      vib.connect(vg); vg.connect(o.detune);
      o.connect(f);
      o.start(t); o.stop(t + len + 0.15);
      vib.start(t); vib.stop(t + len + 0.15);
    }
  };
  const choirChord = (ms: number[], t: number, len: number, vol = 0.07) => {
    if (skip(t)) return;
    for (const m of ms) {
      for (const formant of [730, 1090]) {
        const bp = ac.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = formant;
        bp.Q.value = 3;
        const g = ac.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vol * 2.2, t + Math.min(0.6, len / 2));
        g.gain.setValueAtTime(vol * 2.2, t + len - 0.3);
        g.gain.linearRampToValueAtTime(0, t + len);
        bp.connect(g); g.connect(choir);
        for (let i = 0; i < 2; i++) {
          const o = ac.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = midiHz(m);
          o.detune.value = i ? 9 : -9;
          const vib = ac.createOscillator();
          vib.frequency.value = 4.6 + i * 0.4;
          const vg = ac.createGain();
          vg.gain.value = 9;
          vib.connect(vg); vg.connect(o.detune);
          o.connect(bp);
          o.start(t); o.stop(t + len + 0.1);
          vib.start(t); vib.stop(t + len + 0.1);
        }
      }
    }
  };
  const lead = (m: number, t: number, len: number) => {
    if (skip(t)) return;
    if (spec.lead === 'brass') brassNote(m, t, len, 0.2);
    else if (spec.lead === 'choir') choirChord([m], t, len, 0.09);
    else if (spec.lead === 'flute') {
      const o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.value = midiHz(m + 12);
      const vib = ac.createOscillator();
      vib.frequency.value = 5.5;
      const vg = ac.createGain();
      vg.gain.value = 12;
      vib.connect(vg); vg.connect(o.detune);
      const g = env(ac, t, 0.04, len, 0.16);
      o.connect(g); g.connect(brass);
      o.start(t); o.stop(t + len + 0.1);
      vib.start(t); vib.stop(t + len + 0.1);
      noiseHit(ac, noise, t, 0.08, 2500, 'bandpass', 0.05, brass);
    } else if (spec.lead === 'synth') saw(m + 12, t, len, 0.09, brass, 2400, 12, 2, 'square', 0.005);
    else saw(m + 12, t, len, 0.1, strings, 3200, 10, 3, 'sawtooth', 0.03);
  };
  const swell = (a: number, to: number, vol = 0.35) => {
    if (skip(a)) return;
    const from = a;
    const src = ac.createBufferSource();
    src.buffer = noise;
    const f = ac.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.setValueAtTime(3000, from);
    f.frequency.linearRampToValueAtTime(7000, to);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, from);
    g.gain.exponentialRampToValueAtTime(vol, to);
    g.gain.linearRampToValueAtTime(0, to + 0.02);
    src.connect(f); f.connect(g); g.connect(fx);
    src.start(from); src.stop(to + 0.05);
  };

  // ---------------- a partitura
  boom(t0, 1);
  swell(t0, t0 + 0.55, 0.08);
  const chordAt = (i: number) => PROG[spec.mood][i % 4];
  const bars = Math.max(1, Math.floor((ko - t0 - 0.5) / (beat * 4)));
  const body = t0 + 0.5;
  const barLen = (ko - body) / Math.max(bars, 1);
  // cordas e tambores em ostinato até o golpe final
  const stepLen = barLen / 8;
  for (let b = 0; b < bars; b++) {
    const bt = body + b * barLen;
    const c = chordAt(b);
    const full = b >= Math.floor(bars / 2);
    choirChord([deg(c, -1), deg(c + 2, -1), deg(c + 4, -1)], bt, barLen + 0.05, full ? 0.06 : 0.045);
    for (let i = 0; i < 8; i++) {
      const t = bt + i * stepLen;
      const n = i % 4 === 3 ? deg(c + 4, -2) : deg(c, -2);
      saw(n, t, stepLen * 0.8, full ? 0.12 : 0.09, strings, full ? 2200 : 1400, 10, 2, 'sawtooth', 0.005);
      if (i % 2 === 0) saw(deg(c, -3), t, stepLen * 1.6, 0.1, strings, 500, 6, 1, 'sawtooth', 0.005);
      if (i === 0 || i === 3 || i === 6 || (full && (i === 4 || i === 7))) taiko(t, i === 0 ? 1 : 0.7);
      if (full || i % 2 === 1) tick(t + stepLen / 2, 0.14);
    }
    // tema na segunda metade
    if (full) {
      const motifStep = barLen / 16;
      for (let i = 0; i < 16; i++) {
        const d = MOTIF[i];
        if (d === null) continue;
        let len = motifStep;
        let j = i + 1;
        while (j < 16 && MOTIF[j] === null) { len += motifStep; j++; }
        lead(deg(c + d), bt + i * motifStep, len * 0.95);
      }
    }
  }
  // rufo de tambores e prato subindo até o golpe
  const rollStart = ko - Math.min(1.2, barLen);
  for (let t = rollStart, k = 0; t < ko - 0.02; k++) {
    taiko(t, 0.4 + (0.6 * (t - rollStart)) / (ko - rollStart));
    t += Math.max(0.045, 0.13 - k * 0.008);
  }
  swell(rollStart - 0.4, ko, 0.18);
  // PANCADA final
  boom(ko, 1.3);
  if (!skip(ko)) noiseHit(ac, noise, ko, 1.6, 5000, 'highpass', 0.35, fx);
  const cK = chordAt(0);
  for (const d of [0, 2, 4]) brassNote(deg(cK + d, -1), ko, Math.min(1.2, end - ko - 0.2), 0.16);
  brassNote(deg(cK, -2), ko, Math.min(1.2, end - ko - 0.2), 0.2);
  choirChord([deg(cK, 0), deg(cK + 2, 0), deg(cK + 4, 0)], ko, end - ko - 0.05, 0.07);
  taiko(ko, 1.2);
  taiko(ko + beat, 0.8);
  void eighth;
}

function env(ac: BaseAudioContext, t: number, att: number, len: number, vol: number) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + att);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  return g;
}

function noiseHit(ac: BaseAudioContext, buf: AudioBuffer, t: number, len: number, freq: number, type: BiquadFilterType, vol: number, dest: AudioNode) {
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = env(ac, t, 0.003, len, vol);
  src.connect(f); f.connect(g); g.connect(dest);
  src.start(t, Math.random() * 0.5); src.stop(t + len + 0.05);
}

let noiseCache: AudioBuffer | null = null;
function noiseBuffer(ac: BaseAudioContext) {
  if (noiseCache && noiseCache.sampleRate === ac.sampleRate) return noiseCache;
  const b = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = b.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < d.length; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    d[i] = (seed / 4294967296) * 2 - 1;
  }
  noiseCache = b;
  return b;
}

function impulse(ac: BaseAudioContext, sec: number) {
  const len = Math.floor(ac.sampleRate * sec);
  const b = ac.createBuffer(2, len, ac.sampleRate);
  let seed = 999;
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      d[i] = ((seed / 4294967296) * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
  }
  return b;
}

// ------------------------------------------------------------------ tocar no jogo

/** Libera o áudio no primeiro toque (mantido pelo nome antigo). */
export function unlockLegendAudio() {
  unlockAudio();
}

/**
 * Toca a trilha a partir de `offsetSec` (se a cena já estiver no meio, entra no
 * ponto certo). Termina sozinha no fim da cena; `stop()` corta antes.
 */
export function playLegendMusic(spec: MusicSpec, durSec: number, offsetSec = 0, koFrac = 0.8): MusicHandle {
  try {
    const a = getAudio();
    if (!a) return { stop: () => {} };
    const ac = a.ctx;
    if (ac.state === 'suspended') void ac.resume();
    const out = ac.createGain();
    out.gain.value = 1;
    out.connect(a.legend);
    // começa "no passado" para cair no ponto exato da cena
    const now = ac.currentTime + 0.03;
    const t0 = now - Math.max(0, offsetSec);
    scheduleLegendMusic(ac, out, spec, t0, durSec, koFrac, now);
    let stopped = false;
    const timer = setTimeout(() => stop(), (durSec - offsetSec + 0.5) * 1000);
    function stop() {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      const now = ac.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(out.gain.value, now);
      out.gain.linearRampToValueAtTime(0, now + 0.15);
      setTimeout(() => out.disconnect(), 300);
    }
    return { stop };
  } catch {
    return { stop: () => {} };
  }
}

/** Renderiza a trilha num buffer (usado para gerar prévias em .wav). */
export async function renderLegendMusic(spec: MusicSpec, durSec: number, sampleRate = 44100): Promise<AudioBuffer> {
  const ac = new OfflineAudioContext(2, Math.ceil(sampleRate * durSec), sampleRate);
  scheduleLegendMusic(ac, ac.destination, spec, 0, durSec);
  return ac.startRendering();
}
