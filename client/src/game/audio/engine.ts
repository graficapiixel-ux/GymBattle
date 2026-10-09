/**
 * Áudio do jogo: um único AudioContext com três "canais":
 *  - music  (trilha de combate, sorteada por luta)
 *  - sfx    (sons dos golpes, pulos, magias…)
 *  - legend (trilha do evento lendário)
 * Durante um evento lendário, music e sfx somem e fica só o legend.
 * Tudo passa por um compressor no fim para nenhum som estourar.
 */

export interface AudioBuses {
  ctx: AudioContext;
  master: GainNode;
  music: GainNode;
  sfx: GainNode;
  legend: GainNode;
}

/** Volumes de cada canal (equilíbrio entre música, efeitos e evento). */
export const MIX = { master: 0.9, music: 0.32, sfx: 0.7, legend: 0.85 };

const KEY = 'gb_sound';
let buses: AudioBuses | null = null;
let muted = (() => {
  try {
    return localStorage.getItem(KEY) === 'off';
  } catch {
    return false;
  }
})();
let ducked = false;
const listeners = new Set<(m: boolean) => void>();

export function getAudio(): AudioBuses | null {
  if (buses) return buses;
  try {
    const ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 8;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    comp.connect(ctx.destination);
    const master = ctx.createGain();
    master.gain.value = muted ? 0 : MIX.master;
    master.connect(comp);
    const bus = (v: number) => {
      const g = ctx.createGain();
      g.gain.value = v;
      g.connect(master);
      return g;
    };
    buses = { ctx, master, music: bus(MIX.music), sfx: bus(MIX.sfx), legend: bus(MIX.legend) };
    return buses;
  } catch {
    return null;
  }
}

/** Chamado no primeiro toque/tecla: o navegador só libera som depois de uma interação. */
export function unlockAudio() {
  const a = getAudio();
  if (a && a.ctx.state === 'suspended') void a.ctx.resume();
}

export function isMuted() {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem(KEY, m ? 'off' : 'on');
  } catch { /* sem armazenamento */ }
  const a = getAudio();
  if (a) {
    const now = a.ctx.currentTime;
    a.master.gain.cancelScheduledValues(now);
    a.master.gain.setTargetAtTime(m ? 0 : MIX.master, now, 0.05);
    if (!m && a.ctx.state === 'suspended') void a.ctx.resume();
  }
  listeners.forEach((f) => f(m));
}

export function onMutedChange(f: (m: boolean) => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** Evento lendário: silencia música e efeitos (e devolve depois), com fade. */
export function duckForLegend(on: boolean) {
  if (ducked === on) return;
  ducked = on;
  const a = getAudio();
  if (!a) return;
  const now = a.ctx.currentTime;
  for (const [g, v] of [[a.music, MIX.music], [a.sfx, MIX.sfx]] as const) {
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.linearRampToValueAtTime(on ? 0 : v, now + (on ? 0.35 : 0.8));
  }
}
