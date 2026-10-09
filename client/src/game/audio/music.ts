/**
 * Trilha de combate: uma das músicas é sorteada quando a luta começa (pela
 * semente da luta, então os dois lutadores e quem assiste ouvem a mesma).
 * Os arquivos ficam em /audio/music/combat-N.mp3 (volume já equilibrado).
 */
import { getAudio } from './engine';

/** Quantas músicas de combate existem (combat-1.mp3 … combat-N.mp3). */
export const COMBAT_TRACKS = 2;

export function trackFor(seed: number) {
  return (Math.abs(Math.floor(seed)) % COMBAT_TRACKS) + 1;
}

export class CombatMusic {
  private el: HTMLAudioElement | null = null;
  private gain: GainNode | null = null;
  private playing = false;

  constructor(private track: number) {}

  private ensure() {
    if (this.el) return true;
    const a = getAudio();
    if (!a) return false;
    try {
      const el = new Audio(`/audio/music/combat-${this.track}.mp3`);
      el.loop = true;
      el.preload = 'auto';
      const src = a.ctx.createMediaElementSource(el);
      const g = a.ctx.createGain();
      g.gain.value = 0;
      src.connect(g);
      g.connect(a.music);
      this.el = el;
      this.gain = g;
      return true;
    } catch {
      return false;
    }
  }

  play() {
    if (this.playing || !this.ensure()) return;
    const a = getAudio()!;
    if (a.ctx.state === 'suspended') void a.ctx.resume();
    this.playing = true;
    const now = a.ctx.currentTime;
    this.gain!.gain.cancelScheduledValues(now);
    this.gain!.gain.setValueAtTime(this.gain!.gain.value, now);
    this.gain!.gain.linearRampToValueAtTime(1, now + 0.6);
    this.el!.play().catch(() => { this.playing = false; });
  }

  /** Para com fade (e pausa o arquivo depois). */
  pause(fade = 0.4) {
    if (!this.playing || !this.el || !this.gain) return;
    this.playing = false;
    const a = getAudio()!;
    const now = a.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(this.gain.gain.value, now);
    this.gain.gain.linearRampToValueAtTime(0, now + fade);
    const el = this.el;
    setTimeout(() => { if (!this.playing) el.pause(); }, fade * 1000 + 50);
  }

  destroy() {
    this.pause(0.2);
    const el = this.el;
    setTimeout(() => { el?.removeAttribute('src'); el?.load(); }, 300);
    this.el = null;
    this.gain = null;
  }
}
