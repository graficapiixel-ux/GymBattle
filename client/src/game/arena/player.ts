/**
 * Player do replay da arena (Canvas 2D).
 *
 * Tudo o que aparece na tela é função de (replay, instante): lutadores, poses,
 * projéteis, efeitos, câmera e tremor. Por isso o lutador A, o lutador B e
 * qualquer espectador veem exatamente a mesma cena no mesmo instante.
 */
import {
  ANIM, ELEMENT_COLOR, F, F_SIZE, FLAG, MAPS_BY_ID, WEAPONS_BY_ID,
  type AttackDef, type BattleEvent, type Element, type MapDef, type Replay, type VfxKey, type WeaponDef,
} from '@gymbattle/shared';
import { drawAvatar, weaponShape, weaponTip, RENDER_OPTS, type Pose } from '../rig';
import { attackPose, motionOf, movePose, type AttackTiming, type Motion } from './poses';
import { FxPool, QUALITY, elColors, rnd, spawnAreaFx } from './vfx';
import { drawSwingTrail } from './trail';
import { drawBackground, drawPlatforms } from './background';
import { scenesFor, legendShake, drawLegendBackdrop, drawLegendWorld, drawLegendOverlay, type Scene, type Actor } from './legend';
import { playLegendMusic, type MusicHandle } from './legend/music';
import { duckForLegend } from '../audio/engine';
import { CombatMusic, trackFor } from '../audio/music';
import {
  sfxDodge, sfxExplosion, sfxHeal, sfxHit, sfxJump, sfxKo, sfxLand, sfxMiss, sfxRespawn, sfxShoot, sfxStatus, sfxSwing,
} from '../audio/sfx';

const HEAVY = new Set(['greatsword', 'hammer', 'axe', 'scythe']);
const BOOM_VFX = new Set(['fireball', 'shadow_orb', 'poison_cloud', 'holy_nova']);
import { BALANCE } from '@gymbattle/shared';

type LegendEv = Extract<BattleEvent, { type: 'legend' }>;
const smooth = (a: number, b: number, x: number) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

export interface FighterHud {
  hp: number;
  maxHp: number;
  st: number;
  maxSt: number;
  mp: number;
  maxMp: number;
  lives: number;
  flags: number;
}

export interface HudState {
  t: number;
  duration: number;
  fighters: [FighterHud, FighterHud];
  ended: boolean;
}

interface FighterView {
  x: number;
  y: number;
  facing: 1 | -1;
  anim: number;
  animT: number;
  hp: number;
  st: number;
  mp: number;
  lives: number;
  flags: number;
  vx: number;
}

interface AtkState {
  t: number;
  slot: 1 | 2;
  timing: AttackTiming;
  def: AttackDef;
  motion: Motion;
}

interface ProjMeta {
  vfx: VfxKey;
  el: Element;
  owner: number;
  t: number;
}

const FALLBACK = 'espada-curta-recruta';

export class ArenaPlayer {
  readonly replay: Replay;
  readonly map: MapDef;
  private ctx: CanvasRenderingContext2D;
  private weapons: WeaponDef[];
  private pool = new FxPool(260);
  private attackEvents: AtkState[][] = [[], []];
  private hits: Extract<BattleEvent, { type: 'hit' }>[] = [];
  private kos: Extract<BattleEvent, { type: 'ko' }>[] = [];
  private projMeta = new Map<number, ProjMeta>();
  private cursor = 0;
  private raf = 0;
  private lastReal = 0;
  private hitstopUntil = 0;
  private flash = document.createElement('canvas');
  simT = 0;
  speed = 1;
  playing = false;
  low = false;
  onHud?: (s: HudState) => void;
  onEnd?: () => void;
  private endFired = false;
  private hudAt = 0;
  private viewW = 0;
  private viewH = 0;
  private dpr = 1;
  /** Evento lendário desta luta (se houver) e a cena correspondente. */
  private legend: LegendEv | null = null;
  private legendScene: Scene | null = null;
  private music: MusicHandle | null = null;
  /** Trilha de combate (sorteada pela semente da luta). */
  private combatMusic: CombatMusic;
  /** Tocar sons (a página pode desligar, ex.: prévias). */
  sound = true;

  constructor(private canvas: HTMLCanvasElement, replay: Replay) {
    this.replay = replay;
    this.map = MAPS_BY_ID[replay.map];
    this.ctx = canvas.getContext('2d')!;
    this.weapons = replay.fighters.map((f) => WEAPONS_BY_ID[f.equipment.weapon ?? ''] ?? WEAPONS_BY_ID[FALLBACK]);
    // pré-indexa eventos usados pelas poses/câmera
    for (const e of replay.events) {
      if (e.type === 'attack') {
        const w = this.weapons[e.p];
        const def = e.slot === 1 ? w.a1 : w.a2;
        this.attackEvents[e.p].push({
          t: e.t, slot: e.slot, def, motion: motionOf(w, def),
          timing: { start: e.t, windup: e.windup, active: e.active, recovery: e.recovery },
        });
      } else if (e.type === 'hit') this.hits.push(e);
      else if (e.type === 'ko' && e.reason !== 'legend') this.kos.push(e);
      else if (e.type === 'legend') {
        this.legend = e;
        const list = scenesFor(this.weapons[e.p].category);
        this.legendScene = list[e.variant % list.length] ?? list[0];
      }
      else if (e.type === 'proj') this.projMeta.set(e.id, { vfx: e.vfx, el: e.el, owner: e.p, t: e.t });
    }
    this.combatMusic = new CombatMusic(trackFor(replay.seed));
    this.flash.width = 320;
    this.flash.height = 320;
    this.resize();
  }

  // ------------------------------------------------------------ controle
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, this.low ? 1 : 2);
    this.viewW = Math.max(1, r.width);
    this.viewH = Math.max(1, r.height);
    this.canvas.width = Math.round(this.viewW * this.dpr);
    this.canvas.height = Math.round(this.viewH * this.dpr);
  }

  setLow(low: boolean) {
    this.low = low;
    RENDER_OPTS.lowFx = low;
    QUALITY.particles = low ? 0.35 : 1;
    this.resize();
  }

  play() {
    if (this.playing) return;
    this.playing = true;
    this.lastReal = performance.now();
    const loop = (now: number) => {
      if (!this.playing) return;
      const dt = Math.min(0.1, (now - this.lastReal) / 1000);
      this.lastReal = now;
      if (now >= this.hitstopUntil) this.advance(dt * this.replay.tickRate * this.speed);
      try {
        this.syncMusic();
        this.render();
      } catch (e) {
        // um erro de desenho nunca pode travar a reprodução
        console.warn('render', e);
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.stopMusic();
    this.combatMusic.pause();
    duckForLegend(false);
  }

  private stopMusic() {
    this.music?.stop();
    this.music = null;
  }

  /** Progresso (0–1) da cena lendária no instante T, ou null se não está nela. */
  legendAt(T: number): number | null {
    const L = this.legend;
    if (!L || T < L.t || T > L.t + L.dur) return null;
    return (T - L.t) / L.dur;
  }

  /** Músicas: a de combate toca durante a luta; no evento lendário tudo cala e fica só a do evento. */
  private syncMusic() {
    const inLegend = this.legendAt(this.simT) !== null;
    const running = this.sound && this.playing && this.simT < this.replay.duration;
    if (running) this.combatMusic.play();
    else this.combatMusic.pause(this.simT >= this.replay.duration ? 1.5 : 0.4);
    duckForLegend(inLegend && this.sound);
    this.syncLegendMusic();
  }

  /** A trilha do evento toca só durante a cena (e só em velocidade normal). */
  private syncLegendMusic() {
    const p = this.legendAt(this.simT);
    const want = this.sound && p !== null && p < 0.995 && this.playing && this.speed === 1 && !!this.legendScene;
    if (want && !this.music) {
      const offset = (this.simT - this.legend!.t) / this.replay.tickRate;
      this.music = playLegendMusic(this.legendScene!.music, this.legend!.dur / this.replay.tickRate, offset, BALANCE.combat.legendKoFrac);
    } else if (!want && this.music) this.stopMusic();
  }

  destroy() {
    this.pause();
    this.combatMusic.destroy();
  }

  /** Pula para o instante T (ticks) — recria os efeitos de forma determinística. */
  seek(T: number) {
    this.stopMusic();
    this.simT = Math.max(0, Math.min(T, this.replay.duration));
    this.pool.clear();
    this.cursor = 0;
    const from = this.simT - 70;
    while (this.cursor < this.replay.events.length && this.replay.events[this.cursor].t <= this.simT) {
      const e = this.replay.events[this.cursor];
      if (e.t >= from) this.onEvent(e, false);
      this.cursor++;
    }
    this.render();
  }

  private advance(dTicks: number) {
    const next = Math.min(this.replay.duration, this.simT + dTicks);
    while (this.cursor < this.replay.events.length && this.replay.events[this.cursor].t <= next) {
      const e = this.replay.events[this.cursor];
      this.simT = Math.max(this.simT, e.t);
      this.onEvent(e, true);
      this.cursor++;
    }
    this.simT = next;
    if (this.simT >= this.replay.duration && !this.endFired) {
      this.endFired = true;
      this.onEnd?.();
    }
  }

  // ------------------------------------------------------------ eventos → efeitos
  /** Sons do combate (só ao vivo/reprodução normal, fora do evento lendário). */
  private playSfx(e: BattleEvent) {
    if (!this.sound || this.speed > 2) return;
    const L = this.legend;
    if (L && e.t >= L.t && e.t <= L.t + L.dur) return;
    switch (e.type) {
      case 'attack': {
        const a = this.attackEvents[e.p].find((x) => x.t === e.t);
        if (!a) break;
        const k = a.def.kind;
        if (k === 'projectile' || k === 'pull' || k === 'heal' || (k === 'area' && a.def.range >= 250)) break;
        const delay = e.windup / this.replay.tickRate / this.speed;
        sfxSwing(HEAVY.has(this.weapons[e.p].category), delay);
        break;
      }
      case 'hit': sfxHit(e.big, e.el); break;
      case 'proj': sfxShoot(e.vfx, e.el); break;
      case 'projEnd': {
        const m = this.projMeta.get(e.id);
        if (m && BOOM_VFX.has(m.vfx)) sfxExplosion(e.hit ? 0.5 : 0.25, m.el);
        break;
      }
      case 'area': sfxExplosion(Math.min(1, e.r / 150), e.el); break;
      case 'status': sfxStatus(e.status); break;
      case 'heal': if (e.amount > 0) sfxHeal(); break;
      case 'miss': sfxMiss(); break;
      case 'dodge': sfxDodge(); break;
      case 'jump': sfxJump(e.double); break;
      case 'land': sfxLand(e.hard); break;
      case 'ko': if (e.reason !== 'legend') sfxKo(); break;
      case 'respawn': sfxRespawn(); break;
    }
  }

  private onEvent(e: BattleEvent, live: boolean) {
    const P = this.pool;
    if (live) {
      try {
        this.playSfx(e);
      } catch { /* som nunca trava a luta */ }
    }
    switch (e.type) {
      case 'attack': {
        const a = this.attackEvents[e.p].find((x) => x.t === e.t);
        if (!a) break;
        if (a.motion === 'cast' || a.motion === 'castUp' || a.motion === 'heal') {
          const v = this.fighterAt(e.p, e.t);
          const [c1] = elColors(a.def.element);
          P.spawn('charge', e.t, v.x + v.facing * 22, v.y - 72, { color: c1, dur: e.windup, n: 10 });
        }
        break;
      }
      case 'hit': {
        const [c1, c2] = elColors(e.el);
        P.spawn('sparks', e.t, e.x, e.y, { color: e.el === 'physical' ? '#fff3c4' : c1, n: e.big ? 16 : 9, dur: 12, big: e.big });
        {
          // corte na direção do golpe (de cima para baixo, vindo do lado do atacante)
          const from = this.fighterAt(e.from, e.t);
          const side = from.x <= e.x ? 1 : -1;
          const ang = side > 0 ? 0.55 + rnd(e.t, e.p) * 0.5 : Math.PI - 0.55 - rnd(e.t, e.p) * 0.5;
          P.spawn('impact', e.t, e.x, e.y, { r: ang, color: e.el === 'physical' ? '#bfe3ff' : c1, color2: e.el === 'physical' ? '#ffffff' : c2, dur: e.big ? 12 : 8, big: e.big });
        }
        P.spawn('burst', e.t, e.x, e.y, { color: c1, color2: c2, n: e.big ? 16 : 8, dur: 18 });
        const dir = e.x >= this.fighterAt(e.from, e.t).x ? 1 : -1;
        P.spawn('number', e.t, e.x, e.y - 50, { text: String(e.dmg), color: e.big ? '#ffd24a' : '#ffffff', big: e.big, dur: 26, dir });
        if (live && e.big) this.hitstopUntil = performance.now() + 90 / this.speed;
        else if (live) this.hitstopUntil = performance.now() + 35 / this.speed;
        break;
      }
      case 'proj':
        break;
      case 'projEnd': {
        const m = this.projMeta.get(e.id);
        if (!m) break;
        const [c1, c2] = elColors(m.el);
        P.spawn('explosion', e.t, e.x, e.y, { r: e.hit ? 34 : 20, color: c1, color2: c2, dur: 12 });
        break;
      }
      case 'area': {
        const v = this.fighterAt(e.p, e.t);
        spawnAreaFx(P, e.t, e.x, e.y, e.r, e.vfx, e.el, v.facing);
        break;
      }
      case 'status': {
        const v = this.fighterAt(e.p, e.t);
        if (e.status === 'freeze') P.spawn('ice', e.t, v.x, v.y, { color: ELEMENT_COLOR.ice, dur: Math.max(12, e.dur) });
        if (e.status === 'poison') P.spawn('cloud', e.t, v.x, v.y - 30, { r: 30, color: ELEMENT_COLOR.poison, color2: '#2f6a12', dur: 30 });
        if (e.status === 'shock') P.spawn('sparks', e.t, v.x, v.y - 50, { color: ELEMENT_COLOR.lightning, n: 12, dur: 14 });
        break;
      }
      case 'heal': {
        if (e.amount <= 0) break;
        const v = this.fighterAt(e.p, e.t);
        P.spawn('pillar', e.t, v.x, v.y, { r: 22, color: '#7dffb0', dur: 18 });
        P.spawn('number', e.t, v.x, v.y - 110, { text: `+${e.amount}`, color: '#7dffb0', dur: 26 });
        break;
      }
      case 'miss': {
        // o golpe passou, mas o alvo estava esquivando (invulnerável)
        P.spawn('number', e.t, e.x, e.y - 24, { text: 'ESQUIVOU', color: '#7fd6ff', dur: 26 });
        break;
      }
      case 'dodge': {
        const v = this.fighterAt(e.p, e.t);
        P.spawn('dust', e.t, v.x, v.y, { color: '#c8c0b0', n: 6, dur: 14, front: false });
        break;
      }
      case 'jump': {
        if (!e.double) break;
        const v = this.fighterAt(e.p, e.t);
        P.spawn('ring', e.t, v.x, v.y, { r: 30, color: '#ffffff', dur: 10, n: 0 });
        break;
      }
      case 'land': {
        P.spawn('dust', e.t, e.x, e.y, { color: '#c8b898', n: e.hard ? 10 : 5, dur: e.hard ? 20 : 12, front: false });
        break;
      }
      case 'ko': {
        if (e.reason === 'legend') break;
        const x = Math.max(40, Math.min(this.map.width - 40, e.x));
        const y = Math.max(40, Math.min(this.map.height - 20, e.y));
        const col = e.p === 0 ? '#4aa8ff' : '#ff5a5f';
        P.spawn('koBlast', e.t, x, y, { color: col, dur: 28 });
        P.spawn('explosion', e.t, x, y, { r: 90, color: col, color2: '#ffffff', dur: 20 });
        break;
      }
      case 'respawn': {
        const [sx, sy] = this.map.spawns[e.p];
        P.spawn('pillar', e.t, sx, sy, { r: 30, color: e.p === 0 ? '#4aa8ff' : '#ff5a5f', dur: 24 });
        break;
      }
      case 'end':
      case 'legend':
        break;
    }
  }

  // ------------------------------------------------------------ estado interpolado
  private frameIndex(T: number) {
    const fe = this.replay.frameEvery;
    return Math.max(0, Math.min(this.replay.frames.length - 1, Math.floor(T / fe)));
  }

  fighterAt(p: number, T: number): FighterView {
    const frames = this.replay.frames;
    const i = this.frameIndex(T);
    const a = frames[i];
    const b = frames[Math.min(frames.length - 1, i + 1)];
    const o = 1 + p * F_SIZE;
    const span = b[0] - a[0] || 1;
    const k = Math.max(0, Math.min(1, (T - a[0]) / span));
    const ax = a[o + F.x];
    const ay = a[o + F.y];
    const bx = b[o + F.x];
    const by = b[o + F.y];
    const jump = Math.abs(bx - ax) > 160 || Math.abs(by - ay) > 160;
    // curva suave (Catmull-Rom) entre os quadros gravados a 15/s — sem "quinas" no movimento
    const pr = frames[Math.max(0, i - 1)];
    const nx = frames[Math.min(frames.length - 1, i + 2)];
    const cx0 = pr[o + F.x];
    const cy0 = pr[o + F.y];
    const cx3 = nx[o + F.x];
    const cy3 = nx[o + F.y];
    const curve = !jump && Math.abs(ax - cx0) < 160 && Math.abs(ay - cy0) < 160 && Math.abs(cx3 - bx) < 160 && Math.abs(cy3 - by) < 160;
    const cr = (p0: number, p1: number, p2: number, p3: number) => {
      return p1 + 0.5 * k * (p2 - p0 + k * (2 * p0 - 5 * p1 + 4 * p2 - p3 + k * (3 * (p1 - p2) + p3 - p0)));
    };
    const x = jump ? ax : curve ? cr(cx0, ax, bx, cx3) : ax + (bx - ax) * k;
    const y = jump ? ay : curve ? Math.min(cr(cy0, ay, by, cy3), Math.max(ay, by)) : ay + (by - ay) * k;
    const same = a[o + F.anim] === b[o + F.anim];
    return {
      x, y,
      facing: (a[o + F.facing] as 1 | -1) || 1,
      anim: a[o + F.anim],
      animT: a[o + F.animT] + (same ? (T - a[0]) : 0),
      hp: a[o + F.hp], st: a[o + F.st], mp: a[o + F.mp], lives: a[o + F.lives], flags: a[o + F.flags],
      vx: (bx - ax) / span,
    };
  }

  private projectilesAt(T: number): { id: number; x: number; y: number; vx: number; vy: number }[] {
    const frames = this.replay.frames;
    const i = this.frameIndex(T);
    const a = frames[i];
    const b = frames[Math.min(frames.length - 1, i + 1)];
    const k = Math.max(0, Math.min(1, (T - a[0]) / (b[0] - a[0] || 1)));
    const read = (row: number[]) => {
      const out = new Map<number, [number, number]>();
      let o = 1 + 2 * F_SIZE;
      const n = row[o++];
      for (let j = 0; j < n; j++) out.set(row[o + j * 3], [row[o + j * 3 + 1], row[o + j * 3 + 2]]);
      return out;
    };
    const pa = read(a);
    const pb = read(b);
    const res: { id: number; x: number; y: number; vx: number; vy: number }[] = [];
    for (const [id, [x, y]] of pa) {
      const nb = pb.get(id);
      if (nb) res.push({ id, x: x + (nb[0] - x) * k, y: y + (nb[1] - y) * k, vx: nb[0] - x, vy: nb[1] - y });
      else res.push({ id, x, y, vx: 0, vy: 0 });
    }
    return res;
  }

  private attackAt(p: number, T: number): AtkState | null {
    const list = this.attackEvents[p];
    let lo = 0;
    let hi = list.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].t <= T) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return found >= 0 ? list[found] : null;
  }

  private poseAt(p: number, T: number, v: FighterView): { pose: Pose; rot: number; alpha: number; atk: AtkState | null } {
    const shape = weaponShape(this.weapons[p]);
    const time = T / this.replay.tickRate;
    if (v.anim === ANIM.attack1 || v.anim === ANIM.attack2) {
      const atk = this.attackAt(p, T);
      if (atk) {
        const local = T - atk.t;
        return { pose: attackPose(shape, atk.motion, atk.def.hits, atk.timing, local, time), rot: atk.motion === 'spin' && local > atk.timing.windup && local < atk.timing.windup + atk.timing.active ? 0 : 0, alpha: 1, atk };
      }
    }
    const m = movePose(shape, v.anim, v.animT, time, v.vx);
    return { ...m, atk: null };
  }

  // ------------------------------------------------------------ câmera (determinística)
  /**
   * Trilha da câmera pré-calculada (1 amostra por tick) e suavizada com média
   * exponencial para frente E para trás (fase zero: segue sem atraso e sem
   * tranco). O zoom é suavizado em escala logarítmica, então nunca "pula".
   * O tremor usa senoides (contínuo) em vez de sorteio por quadro.
   */
  private camTrack: { x: Float32Array; y: Float32Array; sx: Float32Array; sy: Float32Array; shake: Float32Array; punch: Float32Array } | null = null;

  private buildCamera() {
    const N = Math.max(2, Math.ceil(this.replay.duration) + 2);
    const x = new Float32Array(N);
    const y = new Float32Array(N);
    const sx = new Float32Array(N);
    const sy = new Float32Array(N);
    let px = this.map.width / 2;
    let py = this.map.height / 2;
    let pw = 700;
    let ph = 520;
    for (let t = 0; t < N; t++) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let lead = 0;
      let alive = 0;
      for (let p = 0; p < 2; p++) {
        const v = this.fighterAt(p, t);
        if (v.anim === ANIM.dead && v.animT > 6) continue;
        const fx = Math.max(-120, Math.min(this.map.width + 120, v.x));
        const fy = Math.max(-100, Math.min(this.map.height + 60, v.y - 50));
        minX = Math.min(minX, fx);
        maxX = Math.max(maxX, fx);
        minY = Math.min(minY, fy);
        maxY = Math.max(maxY, fy);
        lead += Math.max(-8, Math.min(8, v.vx));
        alive++;
      }
      if (alive) {
        // olha um pouco para onde a ação está indo
        px = (minX + maxX) / 2 + (lead / alive) * 6;
        py = (minY + maxY) / 2;
        pw = Math.max(260, maxX - minX);
        ph = Math.max(160, maxY - minY);
      }
      x[t] = px;
      y[t] = py;
      sx[t] = Math.log(pw);
      sy[t] = Math.log(ph);
    }
    const zeroPhase = (src: Float32Array, tauTicks: number, passes = 2) => {
      let out = src;
      const al = 1 - Math.exp(-1 / tauTicks);
      for (let pass = 0; pass < passes; pass++) {
        const o = new Float32Array(out);
        for (let k = 1; k < N; k++) o[k] = o[k - 1] + (o[k] - o[k - 1]) * al;
        for (let k = N - 2; k >= 0; k--) o[k] = o[k + 1] + (o[k] - o[k + 1]) * al;
        out = o;
      }
      return out;
    };
    // tremor (amplitude) e "soco" de zoom nos golpes fortes, também por tick
    const shake = new Float32Array(N);
    const punch = new Float32Array(N);
    for (const h of this.hits) {
      const maxHp = this.replay.fighters[h.p].maxHp;
      const a = h.big ? 14 : 4 + (h.dmg / maxHp) * 40;
      for (let d = 0; d < 12; d++) {
        const t = Math.floor(h.t) + d;
        if (t >= 0 && t < N) shake[t] += a * (1 - d / 12);
      }
      for (let d = 0; d < 18; d++) {
        const t = Math.floor(h.t) + d;
        if (t >= 0 && t < N) punch[t] = Math.max(punch[t], (h.big ? 1 : 0.35) * smooth(0, 3, d) * (1 - smooth(4, 18, d)));
      }
    }
    for (const ko of this.kos) {
      for (let d = 0; d < 18; d++) {
        const t = Math.floor(ko.t) + d;
        if (t >= 0 && t < N) shake[t] += 20 * (1 - d / 18);
      }
    }
    this.camTrack = { x: zeroPhase(x, 9), y: zeroPhase(y, 12), sx: zeroPhase(sx, 20), sy: zeroPhase(sy, 20), shake, punch };
  }

  private cameraAt(T: number) {
    if (!this.camTrack) this.buildCamera();
    const C = this.camTrack!;
    const N = C.x.length;
    const f = Math.max(0, Math.min(N - 1.001, T));
    const i = Math.floor(f);
    const u = f - i;
    const L = (a: Float32Array) => a[i] + (a[i + 1] - a[i]) * u;
    let cx = L(C.x);
    let cy = L(C.y);
    // em pé a tela é estreita: menos margem dos lados (senão os lutadores ficam minúsculos)
    const portrait = this.viewH > this.viewW * 1.05;
    const spanX = Math.exp(L(C.sx)) + (portrait ? 250 : 440);
    const spanY = Math.exp(L(C.sy)) + (portrait ? 300 : 360);
    const minZoom = this.viewW / 1500;
    const maxZoom = Math.min(this.viewW / (portrait ? 480 : 560), this.viewH / 360);
    let zoom = Math.max(minZoom, Math.min(maxZoom, Math.min(this.viewW / spanX, this.viewH / spanY)));
    zoom *= 1 + 0.045 * L(C.punch);
    // não mostrar muito além do mapa
    const halfW = this.viewW / zoom / 2;
    cx = Math.max(-150 + halfW * 0.4, Math.min(this.map.width + 150 - halfW * 0.4, cx));
    cy = Math.min(this.map.height - this.viewH / zoom / 2 + 120, cy);
    // tremor contínuo (senoides), proporcional ao dano
    const sh = L(C.shake);
    let out = {
      x: cx + sh * (Math.sin(T * 2.7 + 0.3) * 0.6 + Math.sin(T * 4.3 + 1.7) * 0.4),
      y: cy + sh * (Math.sin(T * 3.1 + 2.2) * 0.6 + Math.sin(T * 5.2 + 0.4) * 0.4),
      zoom,
    };
    // evento lendário: a câmera desliza até enquadrar a cena inteira e volta no fim
    const Lg = this.legend;
    if (Lg && T >= Lg.t - 1 && T <= Lg.t + Lg.dur + 40) {
      const p = (T - Lg.t) / Lg.dur;
      const k = smooth(0, 0.1, p) * (1 - smooth(1, 1 + 40 / Lg.dur, p));
      if (k > 0) {
        const lz = Math.min(this.viewW / 780, this.viewH / 540);
        const lx = (Lg.ax + Lg.bx) / 2;
        const ly = Lg.y - 150;
        const s2 = legendShake(Math.max(0, Math.min(1, p)));
        out = {
          x: out.x + (lx - out.x) * k + s2.x / lz,
          y: out.y + (ly - out.y) * k + s2.y / lz,
          zoom: Math.exp(Math.log(out.zoom) + (Math.log(lz) - Math.log(out.zoom)) * k),
        };
      }
    }
    return out;
  }

  /** Lutador para a cena lendária (desliza da posição de antes até o lugar da cena). */
  private legendActor(p: number, lp: number): Actor {
    const L = this.legend!;
    const meta = this.replay.fighters[p];
    const pre = this.fighterAt(p, L.t - 1);
    const sx = p === L.p ? L.ax : L.bx;
    const k = smooth(0, 0.09, lp);
    const other = p === L.p ? L.bx : L.ax;
    return {
      x: pre.x + (sx - pre.x) * k,
      y: pre.y + (L.y - pre.y) * k,
      facing: (other >= sx ? 1 : -1) as 1 | -1,
      look: meta.look,
      equipment: meta.equipment.weapon ? meta.equipment : { ...meta.equipment, weapon: FALLBACK },
      s: 1,
    };
  }

  // ------------------------------------------------------------ desenho
  render() {
    const ctx = this.ctx;
    const T = this.simT;
    const time = T / this.replay.tickRate;
    const cam = this.cameraAt(T);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    drawBackground(ctx, this.map, { w: this.viewW, h: this.viewH }, cam, time, this.low);

    // evento lendário em andamento?
    const lp = this.legendAt(T);
    const sc = lp !== null ? this.legendScene : null;
    const view = { w: this.viewW, h: this.viewH };
    const toScreen = (x: number, y: number) => ({ x: (x - cam.x) * cam.zoom + this.viewW / 2, y: (y - cam.y) * cam.zoom + this.viewH / 2 });
    let LA: Actor | null = null;
    let LB: Actor | null = null;
    if (sc && lp !== null) {
      LA = this.legendActor(this.legend!.p, lp);
      LB = this.legendActor(1 - this.legend!.p, lp);
      drawLegendBackdrop(ctx, sc, lp, view, toScreen(LA.x, LA.y), toScreen(LB.x, LB.y));
    }

    ctx.save();
    ctx.translate(this.viewW / 2, this.viewH / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    drawPlatforms(ctx, this.map, time);
    this.pool.draw(ctx, T, false);

    const views = [this.fighterAt(0, T), this.fighterAt(1, T)];
    if (sc && lp !== null && LA && LB) {
      // durante a cena, quem desenha os lutadores é a própria cena
      drawLegendWorld(ctx, sc, lp, LA, LB);
    } else {
      // quem está atacando fica na frente
      const order = views[0].anim >= ANIM.attack1 && views[0].anim <= ANIM.attack2 ? [1, 0] : [0, 1];
      for (const p of order) this.drawFighter(p, views[p], T, time);
      this.drawProjectiles(T);
    }
    this.pool.draw(ctx, T, true);
    ctx.restore();
    if (sc && lp !== null && LA && LB) drawLegendOverlay(ctx, sc, lp, view, toScreen(LA.x, LA.y), toScreen(LB.x, LB.y));

    // clarão de KO
    for (const ko of this.kos) {
      const age = T - ko.t;
      if (age >= 0 && age < 10) {
        ctx.fillStyle = `rgba(255,255,255,${0.22 * (1 - age / 10)})`;
        ctx.fillRect(0, 0, this.viewW, this.viewH);
      }
    }

    const now = performance.now();
    if (this.onHud && now - this.hudAt > 66) {
      this.hudAt = now;
      const f = this.replay.fighters;
      this.onHud({
        t: T,
        duration: this.replay.duration,
        ended: T >= this.replay.duration,
        fighters: [0, 1].map((p) => ({
          hp: views[p].hp, maxHp: f[p].maxHp, st: views[p].st, maxSt: f[p].maxSt, mp: views[p].mp, maxMp: f[p].maxMp,
          lives: views[p].lives, flags: views[p].flags,
        })) as [FighterHud, FighterHud],
      });
    }
  }

  private drawFighter(p: number, v: FighterView, T: number, time: number) {
    const ctx = this.ctx;
    const meta = this.replay.fighters[p];
    if (v.anim === ANIM.dead && v.animT > 34) return;
    if (v.x < this.map.blast.left + 5 || v.x > this.map.blast.right - 5 || v.y > this.map.blast.bottom - 5) return;
    const { pose, rot, alpha, atk } = this.poseAt(p, T, v);
    const status = v.flags & FLAG.freeze ? 'freeze' : v.flags & FLAG.burn ? 'burn' : v.flags & FLAG.poison ? 'poison' : null;
    const eq = meta.equipment.weapon ? meta.equipment : { ...meta.equipment, weapon: FALLBACK };

    // sombra no chão
    const ground = this.groundBelow(v.x, v.y);
    if (ground !== null) {
      const d = Math.min(1, (ground - v.y) / 300);
      ctx.fillStyle = `rgba(0,0,0,${0.35 * (1 - d)})`;
      ctx.beginPath();
      ctx.ellipse(v.x, ground + 1, 24 * (1 - d * 0.5), 5 * (1 - d * 0.5), 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // imagens residuais do dash
    if (v.anim === ANIM.dash) {
      for (let k = 3; k >= 1; k--) {
        const g = this.fighterAt(p, T - k * 1.2);
        ctx.save();
        ctx.globalAlpha = 0.14 * (4 - k);
        ctx.translate(g.x, g.y);
        drawAvatar(ctx, { look: meta.look, equipment: eq, pose, facing: g.facing, time });
        ctx.restore();
      }
    }

    // rastro da arma durante o golpe
    if (atk) this.drawTrail(p, atk, T, v, eq);

    ctx.save();
    ctx.globalAlpha = alpha * (v.flags & FLAG.iframes && v.anim !== ANIM.dash ? 0.55 + 0.45 * Math.abs(Math.sin(time * 18)) : 1);
    ctx.translate(v.x, v.y);
    if (rot) {
      ctx.translate(0, -44);
      ctx.rotate(rot);
      ctx.translate(0, 44);
    }
    drawAvatar(ctx, { look: meta.look, equipment: eq, pose, facing: v.facing, time, status });
    ctx.restore();

    // clarão branco ao ser atingido
    const lastHit = this.lastHitOn(p, T);
    if (lastHit !== null && T - lastHit < 2.5) {
      this.drawFlash(p, v, pose, rot, eq, time, 0.6 * (1 - (T - lastHit) / 2.5));
    }

    // choque elétrico
    if (v.flags & FLAG.shock) {
      ctx.strokeStyle = ELEMENT_COLOR.lightning;
      ctx.lineWidth = 2;
      const q = Math.floor(T * 3);
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        let x = v.x + (rnd(q, i) - 0.5) * 40;
        let y = v.y - 90;
        ctx.moveTo(x, y);
        for (let j = 0; j < 4; j++) {
          x += (rnd(q, i * 10 + j) - 0.5) * 22;
          y += 20;
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    // marcador do lutador (seta com a cor do lado)
    const col = p === 0 ? '#4aa8ff' : '#ff5a5f';
    const top = v.y - meta.hitbox.h - 26;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(v.x - 7, top);
    ctx.lineTo(v.x + 7, top);
    ctx.lineTo(v.x, top + 8);
    ctx.fill();
  }

  private lastHitOn(p: number, T: number): number | null {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (h.t > T) continue;
      if (T - h.t > 4) return null;
      if (h.p === p) return h.t;
    }
    return null;
  }

  private drawFlash(p: number, v: FighterView, pose: Pose, rot: number, eq: typeof this.replay.fighters[0]['equipment'], time: number, k: number) {
    const meta = this.replay.fighters[p];
    const fc = this.flash;
    const fx = fc.getContext('2d')!;
    fx.setTransform(1, 0, 0, 1, 0, 0);
    fx.clearRect(0, 0, fc.width, fc.height);
    fx.save();
    fx.translate(160, 250);
    if (rot) {
      fx.translate(0, -44);
      fx.rotate(rot);
      fx.translate(0, 44);
    }
    drawAvatar(fx, { look: meta.look, equipment: eq, pose, facing: v.facing, time });
    fx.restore();
    fx.globalCompositeOperation = 'source-atop';
    fx.fillStyle = '#ffffff';
    fx.fillRect(0, 0, fc.width, fc.height);
    fx.globalCompositeOperation = 'source-over';
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = Math.min(1, k);
    ctx.drawImage(fc, v.x - 160, v.y - 250);
    ctx.restore();
  }

  private drawTrail(p: number, atk: AtkState, T: number, _v: FighterView, _eq: typeof this.replay.fighters[0]['equipment']) {
    const motion = atk.motion;
    if (!['swing', 'slam', 'combo', 'spin', 'thrust', 'throw', 'leap', 'stab'].includes(motion)) return;
    const el = atk.def.element;
    drawSwingTrail(this.ctx, {
      look: this.replay.fighters[p].look,
      weapon: this.weapons[p],
      shape: weaponShape(this.weapons[p]),
      motion,
      hits: atk.def.hits,
      timing: atk.timing,
      local: T - atk.t,
      origin: (lt) => {
        const g = this.fighterAt(p, atk.t + lt);
        return { x: g.x, y: g.y, facing: g.facing };
      },
      color: el === 'physical' ? '#cfe8ff' : ELEMENT_COLOR[el],
      low: this.low,
    });
  }

  private drawProjectiles(T: number) {
    const ctx = this.ctx;
    for (const pr of this.projectilesAt(T)) {
      const m = this.projMeta.get(pr.id);
      if (!m) continue;
      const [c1, c2] = elColors(m.el);
      const ang = Math.atan2(pr.vy, pr.vx || (this.fighterAt(m.owner, m.t).facing));
      const age = T - m.t;
      ctx.save();
      ctx.translate(pr.x, pr.y);
      // rastro
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = c1;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-Math.cos(ang) * 34, -Math.sin(ang) * 34);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.rotate(ang);
      if (!this.low) {
        ctx.shadowColor = c1;
        ctx.shadowBlur = 14;
      }
      switch (m.vfx) {
        case 'arrow':
        case 'piercing_arrow':
          ctx.strokeStyle = '#d8c8a0';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(-22, 0);
          ctx.lineTo(8, 0);
          ctx.stroke();
          ctx.fillStyle = c1 === ELEMENT_COLOR.physical ? '#c9ced6' : c1;
          ctx.beginPath();
          ctx.moveTo(14, 0);
          ctx.lineTo(6, -4);
          ctx.lineTo(6, 4);
          ctx.fill();
          break;
        case 'dagger_throw':
          ctx.rotate(age * 1.2);
          ctx.fillStyle = '#d4d8de';
          ctx.fillRect(-10, -2, 20, 4);
          ctx.fillStyle = c1;
          ctx.fillRect(-12, -3, 5, 6);
          break;
        case 'lightning_spear':
        case 'holy_beam': {
          ctx.strokeStyle = c1;
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(-26, 0);
          for (let i = 1; i <= 4; i++) ctx.lineTo(-26 + i * 11, (rnd(Math.floor(T * 3) + pr.id, i) - 0.5) * 10);
          ctx.stroke();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();
          break;
        }
        case 'crescent':
          ctx.strokeStyle = c1;
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.arc(-10, 0, 22, -1.2, 1.2);
          ctx.stroke();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();
          break;
        case 'ice_shard':
          ctx.fillStyle = c1;
          ctx.beginPath();
          ctx.moveTo(14, 0);
          ctx.lineTo(-8, -6);
          ctx.lineTo(-14, 0);
          ctx.lineTo(-8, 6);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-6, -1, 16, 2);
          break;
        case 'shadow_orb':
        case 'poison_cloud':
        case 'fireball':
        case 'arcane_missiles':
        case 'holy_nova':
        default: {
          const r = m.vfx === 'shadow_orb' ? 15 : m.vfx === 'fireball' ? 12 : 9;
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.8);
          g.addColorStop(0, '#ffffff');
          g.addColorStop(0.35, c1);
          g.addColorStop(1, c2 + '00');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(0, 0, r * 1.8, 0, Math.PI * 2);
          ctx.fill();
          if (m.vfx === 'shadow_orb') {
            ctx.fillStyle = '#0b0712';
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.restore();
      // corrente do puxão até o dono
      if (m.vfx === 'chain_pull') {
        const o = this.fighterAt(m.owner, T);
        ctx.save();
        ctx.strokeStyle = c1;
        ctx.globalAlpha = 0.8;
        ctx.setLineDash([6, 5]);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(o.x + o.facing * 20, o.y - 60);
        ctx.lineTo(pr.x, pr.y);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  private groundBelow(x: number, y: number): number | null {
    let best: number | null = null;
    for (const p of this.map.platforms) {
      if (x >= p.x && x <= p.x + p.w && p.y >= y - 1 && (best === null || p.y < best)) best = p.y;
    }
    return best;
  }
}
