/**
 * Tela das lutas EM EQUIPE (PvP em equipes e Waves), em Canvas 2D.
 *
 * A luta já vem pronta do servidor (posições, golpes, acertos, quem cai). Aqui:
 *  - jogadores e o mini-chefe desenhados como avatar (com as poses dos golpes);
 *  - monstros com os corpos animados dos bosses, em tamanho pequeno;
 *  - cenário do tema (céu, silhuetas, objetos, chão, paredões);
 *  - câmera SUAVE que enquadra todo mundo: afasta quando espalham, aproxima quando juntam;
 *  - HUD: no PvP mantém os números; nas Waves só as barras (sem números de vida/dano).
 */
import type { BossSpec, Element, TeamEv, TeamReplay, TeamUnitMeta, VfxKey, WeaponDef } from '@gymbattle/shared';
import { ANIM, ELEMENT_COLOR, FLAG, TF, TF_SIZE, WEAPONS_BY_ID } from '@gymbattle/shared';
import { drawAvatar, weaponShape, type Pose } from '../game/rig';
import { attackPose, motionOf, movePose, type AttackTiming, type Motion } from '../game/arena/poses';
import { drawSwingTrail } from '../game/arena/trail';
import { FxPool, elColors, rnd, spawnAreaFx } from '../game/arena/vfx';
import { sfxDodge, sfxExplosion, sfxHeal, sfxHit, sfxJump, sfxKo, sfxLand, sfxMiss, sfxRespawn, sfxShoot, sfxStatus, sfxSwing } from '../game/audio/sfx';
import { CombatMusic, trackFor } from '../game/audio/music';
import { bodyFor } from './bodies';
import type { Anchors, DrawState } from './types';
import { TAU, clamp, h01, mixHex, rgrad } from './util';

const FALLBACK = 'espada-curta-recruta';
const HEAVY = new Set(['greatsword', 'hammer', 'axe', 'scythe']);
const BOOM_VFX = new Set(['fireball', 'shadow_orb', 'poison_cloud', 'holy_nova']);
const TEAM_COLOR = ['#4aa8ff', '#ff5a5f'] as const;
const CHIEF_SCALE = 1.28;

const sm = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};

interface Track {
  f0: number;
  f1: number;
  x: Float32Array;
  y: Float32Array;
  face: Int8Array;
  anim: Uint8Array;
  animT: Float32Array;
  hp: Float32Array;
  flags: Uint8Array;
  gait: Float32Array;
}

interface UView {
  x: number;
  y: number;
  facing: 1 | -1;
  anim: number;
  animT: number;
  hp: number;
  flags: number;
  vx: number;
  vy: number;
  gait: number;
}

interface Atk {
  t: number;
  m: number;
  timing: AttackTiming;
  motion: Motion;
}

export interface TeamOpts {
  sound?: boolean;
  /** De que lado o jogador está (para "Vitória"/"Derrota"). Waves: sempre 0. */
  myTeam?: 0 | 1 | null;
  onEnd?: (winner: 0 | 1 | null) => void;
}

export class TeamBattle {
  readonly r: TeamReplay;
  private ctx: CanvasRenderingContext2D;
  private pool = new FxPool(320);
  private tracks: (Track | null)[] = [];
  private atks: Atk[][] = [];
  private weapons: (WeaponDef | null)[] = [];
  private specs: (BossSpec | null)[] = [];
  private anchors: (Anchors | null)[] = [];
  private hitsOn: number[][] = [];
  private projMeta = new Map<number, { vfx: VfxKey; el: Element; u: number; t: number }>();
  private waveEvs: Extract<TeamEv, { type: 'wave' }>[] = [];
  private chief = -1;
  private cursor = 0;
  private raf = 0;
  private last = 0;
  private hitstopUntil = 0;
  private flash = document.createElement('canvas');
  private music: CombatMusic;
  private endFired = false;
  private viewW = 1;
  private viewH = 1;
  private dpr = 1;
  private G: number;
  private W: number;
  simT = 0;
  speed = 1;
  playing = false;
  sound: boolean;
  private myTeam: 0 | 1 | null;
  private onEnd?: (w: 0 | 1 | null) => void;
  private cam: { x: Float32Array; y: Float32Array; s: Float32Array; shake: Float32Array } | null = null;

  constructor(private canvas: HTMLCanvasElement, replay: TeamReplay, opts: TeamOpts = {}) {
    this.r = replay;
    this.ctx = canvas.getContext('2d')!;
    this.G = replay.arena.ground;
    this.W = replay.arena.width;
    this.sound = opts.sound !== false;
    this.myTeam = opts.myTeam ?? (replay.mode === 'waves' ? 0 : null);
    this.onEnd = opts.onEnd;
    this.flash.width = 360;
    this.flash.height = 360;
    this.decode();
    this.music = new CombatMusic(trackFor(replay.seed));
    this.resize();
  }

  // ------------------------------------------------------------ dados
  private decode() {
    const R = this.r;
    const N = R.units.length;
    const first = new Int32Array(N).fill(-1);
    const lastF = new Int32Array(N).fill(-1);
    R.frames.forEach((row, i) => {
      const n = row[1];
      for (let j = 0; j < n; j++) {
        const u = row[2 + j * TF_SIZE + TF.u];
        if (first[u] < 0) first[u] = i;
        lastF[u] = i;
      }
    });
    for (let u = 0; u < N; u++) {
      if (first[u] < 0) {
        this.tracks.push(null);
        continue;
      }
      const len = lastF[u] - first[u] + 1;
      this.tracks.push({
        f0: first[u], f1: lastF[u],
        x: new Float32Array(len), y: new Float32Array(len), face: new Int8Array(len).fill(1), anim: new Uint8Array(len),
        animT: new Float32Array(len), hp: new Float32Array(len), flags: new Uint8Array(len), gait: new Float32Array(len),
      });
    }
    const seen = new Uint8Array(N);
    R.frames.forEach((row, i) => {
      seen.fill(0);
      const n = row[1];
      for (let j = 0; j < n; j++) {
        const o = 2 + j * TF_SIZE;
        const u = row[o + TF.u];
        const tr = this.tracks[u]!;
        const k = i - tr.f0;
        tr.x[k] = row[o + TF.x];
        tr.y[k] = row[o + TF.y];
        tr.face[k] = row[o + TF.facing];
        tr.anim[k] = row[o + TF.anim];
        tr.animT[k] = row[o + TF.animT];
        tr.hp[k] = row[o + TF.hp];
        tr.flags[k] = row[o + TF.flags];
        seen[u] = 1;
      }
      // lacuna (não deveria acontecer): repete o quadro anterior
      for (let u = 0; u < N; u++) {
        const tr = this.tracks[u];
        if (!tr || seen[u] || i < tr.f0 || i > tr.f1) continue;
        const k = i - tr.f0;
        if (k > 0) {
          tr.x[k] = tr.x[k - 1];
          tr.y[k] = tr.y[k - 1];
          tr.face[k] = tr.face[k - 1];
          tr.anim[k] = tr.anim[k - 1];
          tr.animT[k] = tr.animT[k - 1] + R.frameEvery;
          tr.hp[k] = tr.hp[k - 1];
          tr.flags[k] = tr.flags[k - 1];
        }
      }
    });
    // passada acumulada (para as pernas dos monstros)
    for (let u = 0; u < N; u++) {
      const tr = this.tracks[u];
      const m = R.units[u];
      if (!tr) continue;
      const stride = 150 * (m.scale ?? 0.3) * (m.body?.size ?? 1);
      for (let k = 1; k < tr.x.length; k++) tr.gait[k] = tr.gait[k - 1] + Math.abs(tr.x[k] - tr.x[k - 1]) / Math.max(20, stride);
    }
    for (const m of R.units) {
      this.atks.push([]);
      this.hitsOn.push([]);
      const wid = m.equipment?.weapon;
      this.weapons.push(m.kind === 'monster' ? null : (WEAPONS_BY_ID[wid ?? ''] ?? WEAPONS_BY_ID[FALLBACK]));
      this.anchors.push(null);
      if (m.kind === 'chief') this.chief = m.u;
      this.specs.push(
        m.body
          ? ({
              ...m.body, name: m.name, title: '', lore: '', attacks: [],
              bg: { sky: R.arena.theme.sky, ground: R.arena.theme.ground, fog: R.arena.theme.fog, particle: R.arena.theme.particle },
            } as BossSpec)
          : null,
      );
    }
    for (const e of R.events) {
      if (e.type === 'attack') {
        const m = R.units[e.u];
        const def = m.moves[e.m];
        const w = this.weapons[e.u];
        this.atks[e.u].push({
          t: e.t, m: e.m,
          timing: { start: e.t, windup: e.windup, active: e.active, recovery: e.recovery },
          motion: def && w ? motionOf(w, def) : 'swing',
        });
      } else if (e.type === 'hit') this.hitsOn[e.u].push(e.t);
      else if (e.type === 'proj') this.projMeta.set(e.id, { vfx: e.vfx, el: e.el, u: e.u, t: e.t });
      else if (e.type === 'wave') this.waveEvs.push(e);
    }
  }

  // ------------------------------------------------------------ controle
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.viewW = Math.max(1, r.width);
    this.viewH = Math.max(1, r.height);
    this.canvas.width = Math.round(this.viewW * this.dpr);
    this.canvas.height = Math.round(this.viewH * this.dpr);
  }

  play() {
    if (this.playing) return;
    this.playing = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.playing) return;
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      if (now >= this.hitstopUntil) this.advance(dt * this.r.tickRate * this.speed);
      try {
        if (this.sound && this.simT < this.r.duration) this.music.play();
        else this.music.pause(this.simT >= this.r.duration ? 1.5 : 0.4);
        this.render();
      } catch (e) {
        console.warn('render', e);
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.music.pause();
  }

  destroy() {
    this.pause();
    this.music.destroy();
  }

  setSpeed(s: number) {
    this.speed = s;
  }

  /** Pula para o instante T (ticks), recriando os efeitos recentes. */
  seek(T: number) {
    this.simT = clamp(T, 0, this.r.duration);
    this.pool.clear();
    this.cursor = 0;
    const from = this.simT - 60;
    const evs = this.r.events;
    while (this.cursor < evs.length && evs[this.cursor].t <= this.simT) {
      if (evs[this.cursor].t >= from) this.onEvent(evs[this.cursor], false);
      this.cursor++;
    }
    if (this.simT >= this.r.duration && !this.endFired) {
      this.endFired = true;
      this.onEnd?.(this.r.winner);
    }
    this.render();
  }

  private advance(d: number) {
    const next = Math.min(this.r.duration, this.simT + d);
    const evs = this.r.events;
    while (this.cursor < evs.length && evs[this.cursor].t <= next) {
      const e = evs[this.cursor];
      this.simT = Math.max(this.simT, e.t);
      this.onEvent(e, true);
      this.cursor++;
    }
    this.simT = next;
    if (this.simT >= this.r.duration && !this.endFired) {
      this.endFired = true;
      this.onEnd?.(this.r.winner);
    }
  }

  // ------------------------------------------------------------ estado interpolado
  unitAt(u: number, T: number): UView | null {
    const tr = this.tracks[u];
    if (!tr) return null;
    const fe = this.r.frameEvery;
    const fi = T / fe;
    const i = Math.floor(fi);
    if (i < tr.f0 || i > tr.f1) return null;
    const k = i - tr.f0;
    const k1 = Math.min(tr.x.length - 1, k + 1);
    const k0 = Math.max(0, k - 1);
    const k2 = Math.min(tr.x.length - 1, k + 2);
    const u01 = clamp(fi - i);
    const ax = tr.x[k];
    const bx = tr.x[k1];
    const ay = tr.y[k];
    const by = tr.y[k1];
    const jump = Math.abs(bx - ax) > 200 || Math.abs(by - ay) > 200;
    const cr = (p0: number, p1: number, p2: number, p3: number) => p1 + 0.5 * u01 * (p2 - p0 + u01 * (2 * p0 - 5 * p1 + 4 * p2 - p3 + u01 * (3 * (p1 - p2) + p3 - p0)));
    const x = jump ? ax : cr(tr.x[k0], ax, bx, tr.x[k2]);
    const y = jump ? ay : Math.min(this.G, cr(tr.y[k0], ay, by, tr.y[k2]));
    const same = tr.anim[k] === tr.anim[k1];
    return {
      x, y,
      facing: (tr.face[k] || 1) as 1 | -1,
      anim: tr.anim[k],
      animT: tr.animT[k] + (same ? u01 * fe : 0),
      hp: tr.hp[k] + (tr.hp[k1] - tr.hp[k]) * u01,
      flags: tr.flags[k],
      vx: (bx - ax) / fe,
      vy: (by - ay) / fe,
      gait: tr.gait[k] + (tr.gait[k1] - tr.gait[k]) * u01,
    };
  }

  private atkAt(u: number, T: number): Atk | null {
    const list = this.atks[u];
    let lo = 0;
    let hi = list.length - 1;
    let f = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].t <= T) {
        f = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (f < 0) return null;
    const a = list[f];
    const tm = a.timing;
    return T - a.t <= tm.windup + tm.active + tm.recovery ? a : null;
  }

  private lastHit(u: number, T: number): number | null {
    const l = this.hitsOn[u];
    for (let i = l.length - 1; i >= 0; i--) {
      if (l[i] > T) continue;
      return T - l[i] < 6 ? l[i] : null;
    }
    return null;
  }

  private projectilesAt(T: number) {
    const frames = this.r.frames;
    const fi = T / this.r.frameEvery;
    const i = clamp(Math.floor(fi), 0, frames.length - 1);
    const j = Math.min(frames.length - 1, i + 1);
    const k = clamp(fi - i);
    const read = (row: number[]) => {
      const m = new Map<number, [number, number]>();
      let o = 2 + row[1] * TF_SIZE;
      const n = row[o++];
      for (let q = 0; q < n; q++) m.set(row[o + q * 3], [row[o + q * 3 + 1], row[o + q * 3 + 2]]);
      return m;
    };
    const a = read(frames[i]);
    const b = read(frames[j]);
    const out: { id: number; x: number; y: number; vx: number; vy: number }[] = [];
    for (const [id, [x, y]] of a) {
      const nb = b.get(id);
      out.push(nb ? { id, x: x + (nb[0] - x) * k, y: y + (nb[1] - y) * k, vx: nb[0] - x, vy: nb[1] - y } : { id, x, y, vx: 0, vy: 0 });
    }
    return out;
  }

  // ------------------------------------------------------------ eventos → efeitos e sons
  private sfx(e: TeamEv) {
    if (!this.sound || this.speed > 2) return;
    switch (e.type) {
      case 'attack': {
        const def = this.r.units[e.u].moves[e.m];
        if (!def || def.kind === 'projectile' || def.kind === 'pull' || def.kind === 'heal' || (def.kind === 'area' && def.range >= 250)) break;
        const w = this.weapons[e.u];
        sfxSwing(!w || HEAVY.has(w.category), e.windup / this.r.tickRate / this.speed);
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
      case 'heal': if (e.amount > 0 && e.from !== e.u) sfxHeal(); break;
      case 'miss': sfxMiss(); break;
      case 'dodge': sfxDodge(); break;
      case 'jump': sfxJump(e.double); break;
      case 'land': if (e.hard) sfxLand(true); break;
      case 'ko': sfxKo(); break;
      case 'spawn': if (this.r.units[e.u].kind === 'chief') sfxExplosion(0.9, 'shadow'); break;
      case 'wave': sfxRespawn(); break;
    }
  }

  private onEvent(e: TeamEv, live: boolean) {
    if (live) {
      try {
        this.sfx(e);
      } catch {
        /* som nunca trava a luta */
      }
    }
    const P = this.pool;
    const pvp = this.r.mode === 'pvp';
    switch (e.type) {
      case 'attack': {
        const def = this.r.units[e.u].moves[e.m];
        const meta = this.r.units[e.u];
        if (!def || meta.kind === 'monster') break;
        if (def.kind === 'heal' || (def.kind === 'area' && def.range >= 250) || def.kind === 'projectile') {
          const v = this.unitAt(e.u, e.t);
          if (v) P.spawn('charge', e.t, v.x + v.facing * 22, v.y - 72, { color: elColors(def.element)[0], dur: e.windup, n: 10 });
        }
        break;
      }
      case 'hit': {
        const [c1, c2] = elColors(e.el);
        P.spawn('sparks', e.t, e.x, e.y, { color: e.el === 'physical' ? '#fff3c4' : c1, n: e.big ? 16 : 9, dur: 12, big: e.big });
        const from = this.unitAt(e.from, e.t);
        const side = from && from.x > e.x ? -1 : 1;
        const ang = side > 0 ? 0.55 + rnd(e.t, e.u) * 0.5 : Math.PI - 0.55 - rnd(e.t, e.u) * 0.5;
        P.spawn('impact', e.t, e.x, e.y, { r: ang, color: e.el === 'physical' ? '#bfe3ff' : c1, color2: e.el === 'physical' ? '#ffffff' : c2, dur: e.big ? 12 : 8, big: e.big });
        P.spawn('burst', e.t, e.x, e.y, { color: c1, color2: c2, n: e.big ? 14 : 7, dur: 16 });
        // PvP mantém os números; nas waves, só as barras
        if (pvp) P.spawn('number', e.t, e.x, e.y - 50, { text: String(e.dmg), color: e.big ? '#ffd24a' : '#ffffff', big: e.big, dur: 26, dir: side });
        if (live && e.big) this.hitstopUntil = performance.now() + 70 / this.speed;
        break;
      }
      case 'projEnd': {
        const m = this.projMeta.get(e.id);
        if (!m) break;
        const [c1, c2] = elColors(m.el);
        P.spawn('explosion', e.t, e.x, e.y, { r: e.hit ? 34 : 20, color: c1, color2: c2, dur: 12 });
        break;
      }
      case 'area': {
        const v = this.unitAt(e.u, e.t);
        spawnAreaFx(P, e.t, e.x, e.y, e.r, e.vfx, e.el, v?.facing ?? 1);
        break;
      }
      case 'status': {
        const v = this.unitAt(e.u, e.t);
        if (!v) break;
        if (e.status === 'freeze') P.spawn('ice', e.t, v.x, v.y, { color: ELEMENT_COLOR.ice, dur: Math.max(12, e.dur) });
        if (e.status === 'poison') P.spawn('cloud', e.t, v.x, v.y - 30, { r: 30, color: ELEMENT_COLOR.poison, color2: '#2f6a12', dur: 30 });
        if (e.status === 'shock') P.spawn('sparks', e.t, v.x, v.y - 50, { color: ELEMENT_COLOR.lightning, n: 12, dur: 14 });
        break;
      }
      case 'heal': {
        if (e.amount <= 0) break;
        const v = this.unitAt(e.u, e.t);
        if (!v) break;
        // cura da pausa entre waves: um brilho suave
        P.spawn('pillar', e.t, v.x, v.y, { r: e.from === e.u ? 16 : 22, color: '#7dffb0', dur: 18 });
        if (pvp) P.spawn('number', e.t, v.x, v.y - 110, { text: `+${e.amount}`, color: '#7dffb0', dur: 26 });
        break;
      }
      case 'miss':
        P.spawn('number', e.t, e.x, e.y - 24, { text: 'ESQUIVOU', color: '#7fd6ff', dur: 24 });
        break;
      case 'dodge': {
        const v = this.unitAt(e.u, e.t);
        if (v) P.spawn('dust', e.t, v.x, v.y, { color: '#c8c0b0', n: 6, dur: 14, front: false });
        break;
      }
      case 'land':
        P.spawn('dust', e.t, e.x, e.y, { color: mixHex(this.r.arena.theme.ground, '#ffffff', 0.4), n: e.hard ? 12 : 5, dur: e.hard ? 20 : 12, front: false });
        if (e.hard && this.r.units[e.u].kind === 'chief') P.spawn('ring', e.t, e.x, e.y, { r: 160, color: this.r.units[e.u].aura ?? '#ffffff', dur: 18, n: 0 });
        break;
      case 'ko': {
        const meta = this.r.units[e.u];
        const col = meta.kind === 'player' ? TEAM_COLOR[meta.team] : (meta.aura ?? meta.body?.pal.glow ?? '#b05aff');
        if (meta.kind === 'monster') {
          P.spawn('burst', e.t, e.x, e.y - meta.hitbox.h * 0.5, { color: col, color2: '#000000', n: 18, dur: 26 });
          P.spawn('cloud', e.t, e.x, e.y - 30, { r: 40, color: mixHex(col, '#000000', 0.4), color2: '#000000', dur: 34 });
        } else {
          P.spawn('koBlast', e.t, e.x, e.y, { color: col, dur: 28 });
          P.spawn('explosion', e.t, e.x, e.y - 40, { r: meta.kind === 'chief' ? 150 : 80, color: col, color2: '#ffffff', dur: 22 });
        }
        break;
      }
      case 'spawn': {
        const meta = this.r.units[e.u];
        if (meta.kind === 'chief') {
          P.spawn('pillar', e.t, e.x, this.G, { r: 60, color: meta.aura ?? '#ffffff', dur: 40 });
        } else {
          const col = meta.body?.pal.glow ?? this.r.arena.theme.fog;
          P.spawn('ring', e.t, e.x, e.y, { r: 50, color: col, dur: 16, n: 0 });
          P.spawn('dust', e.t, e.x, e.y, { color: '#8a8070', n: 8, dur: 16, front: false });
        }
        break;
      }
      default:
        break;
    }
  }

  // ------------------------------------------------------------ câmera (enquadra todo mundo)
  private buildCamera() {
    const N = Math.max(2, Math.ceil(this.r.duration) + 2);
    const x = new Float32Array(N);
    const y = new Float32Array(N);
    const s = new Float32Array(N);
    const shake = new Float32Array(N);
    let px = this.W / 2;
    let pt = this.G - 120;
    let pw = 500;
    const units = this.r.units;
    const NEAR = 380;
    for (let t = 0; t < N; t += 1) {
      // 1) os jogadores (e o mini-chefe) sempre cabem na tela
      let minX = Infinity;
      let maxX = -Infinity;
      let top = Infinity;
      const add = (u: number, v: UView) => {
        const half = units[u].hitbox.w / 2 + 30;
        minX = Math.min(minX, v.x - half);
        maxX = Math.max(maxX, v.x + half);
        top = Math.min(top, v.y - units[u].hitbox.h * (units[u].kind === 'chief' ? CHIEF_SCALE : 1) - 40);
      };
      const monsters: { u: number; v: UView }[] = [];
      for (let u = 0; u < units.length; u++) {
        const v = this.unitAt(u, t);
        if (!v || (v.anim === ANIM.dead && v.animT > 10)) continue;
        if (units[u].kind === 'monster') monsters.push({ u, v });
        else add(u, v);
      }
      // 2) monstros perto da ação também; os que ainda vêm de longe ganham setinhas na borda
      if (minX === Infinity) for (const m of monsters) add(m.u, m.v);
      else {
        const a = minX;
        const b = maxX;
        for (const m of monsters) if (m.v.x > a - NEAR && m.v.x < b + NEAR) add(m.u, m.v);
      }
      if (minX < Infinity) {
        px = (minX + maxX) / 2;
        pw = Math.max(380, maxX - minX);
        pt = top;
      }
      x[t] = px;
      y[t] = pt;
      s[t] = Math.log(pw);
    }
    // média exponencial para frente E para trás: segue sem atraso e sem tranco
    const zero = (src: Float32Array, tau: number) => {
      let out = src;
      const al = 1 - Math.exp(-1 / tau);
      for (let pass = 0; pass < 2; pass++) {
        const o = new Float32Array(out);
        for (let k = 1; k < N; k++) o[k] = o[k - 1] + (o[k] - o[k - 1]) * al;
        for (let k = N - 2; k >= 0; k--) o[k] = o[k + 1] + (o[k] - o[k + 1]) * al;
        out = o;
      }
      return out;
    };
    for (const e of this.r.events) {
      let a = 0;
      let len = 10;
      if (e.type === 'hit' && e.big) a = 7;
      else if (e.type === 'ko') {
        a = units[e.u].kind === 'chief' ? 22 : units[e.u].kind === 'player' ? 10 : 4;
        len = 16;
      } else if (e.type === 'land' && e.hard && units[e.u].kind === 'chief') {
        a = 16;
        len = 18;
      } else if (e.type === 'area' && e.r >= 120) a = 5;
      if (!a) continue;
      for (let d = 0; d < len; d++) {
        const t = Math.floor(e.t) + d;
        if (t >= 0 && t < N) shake[t] = Math.max(shake[t], a * (1 - d / len));
      }
    }
    this.cam = { x: zero(x, 14), y: zero(y, 14), s: zero(s, 22), shake };
  }

  private camera(T: number) {
    if (!this.cam) this.buildCamera();
    const C = this.cam!;
    const N = C.x.length;
    const f = clamp(T, 0, N - 1.001);
    const i = Math.floor(f);
    const u = f - i;
    const L = (a: Float32Array) => a[i] + (a[i + 1] - a[i]) * u;
    const portrait = this.viewH > this.viewW * 1.05;
    const span = Math.exp(L(C.s)) + (portrait ? 70 : 260);
    const groundAt = portrait ? 0.74 : 0.82;
    const hudTop = this.r.mode === 'waves' ? 86 : 70;
    // aproxima quando estão juntos (até um limite) e afasta o quanto precisar
    const maxZoom = this.viewW / (portrait ? 300 : 620);
    const fitW = this.viewW / span;
    // altura: do mais alto até o chão precisa caber entre o HUD e o chão
    const need = Math.max(160, this.G - L(C.y));
    const fitH = (this.viewH * groundAt - hudTop) / need;
    const minZoom = Math.min(this.viewW / (this.W + 160), (this.viewH * groundAt - hudTop) / 700);
    const zoom = clamp(Math.min(maxZoom, fitW, fitH), minZoom, maxZoom);
    const halfW = this.viewW / zoom / 2;
    let cx = L(C.x);
    if (halfW * 2 >= this.W + 160) cx = this.W / 2;
    else cx = clamp(cx, halfW - 80, this.W + 80 - halfW);
    const cy = this.G - (groundAt - 0.5) * this.viewH / zoom;
    const sh = L(C.shake) * (this.viewW / 900);
    return {
      x: cx + sh * (Math.sin(T * 2.7 + 0.3) * 0.6 + Math.sin(T * 4.3 + 1.7) * 0.4) / zoom,
      y: cy + sh * (Math.sin(T * 3.1 + 2.2) * 0.6 + Math.sin(T * 5.2 + 0.4) * 0.4) / zoom,
      zoom,
    };
  }

  // ------------------------------------------------------------ desenho
  render(at?: number) {
    if (at !== undefined) this.simT = at;
    const ctx = this.ctx;
    const T = this.simT;
    const time = T / this.r.tickRate;
    const cam = this.camera(T);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawBackground(ctx, cam, time);

    ctx.save();
    ctx.translate(this.viewW / 2, this.viewH / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
    this.drawWalls(ctx, time);
    this.pool.draw(ctx, T, false);

    // ordem: caídos atrás, depois monstros, jogadores, chefe; quem ataca na frente
    const list: { u: number; v: UView; z: number }[] = [];
    for (let u = 0; u < this.r.units.length; u++) {
      const v = this.unitAt(u, T);
      if (!v) continue;
      const m = this.r.units[u];
      let z = m.kind === 'monster' ? 1 : m.kind === 'player' ? 2 : 3;
      if (v.anim === ANIM.dead) z = 0;
      else if (v.anim === ANIM.attack1 || v.anim === ANIM.attack2) z += 3;
      list.push({ u, v, z });
    }
    list.sort((a, b) => a.z - b.z || a.v.x - b.v.x);
    for (const it of list) {
      const m = this.r.units[it.u];
      try {
        if (m.kind === 'monster') this.drawMonster(ctx, it.u, it.v, T, time);
        else this.drawHuman(ctx, it.u, it.v, T, time);
      } catch {
        /* um desenho com problema nunca derruba a luta */
      }
    }
    this.drawProjectiles(ctx, T);
    this.pool.draw(ctx, T, true);
    // nomes / barrinhas por cima de todos (nomes colados sobem um pouco para não se misturarem)
    let lastX = -Infinity;
    let lift = 0;
    for (const it of [...list].sort((a, b) => a.v.x - b.v.x)) {
      const isP = this.r.units[it.u].kind === 'player';
      if (isP) {
        lift = (it.v.x - lastX) * cam.zoom < 64 ? (lift + 1) % 3 : 0;
        lastX = it.v.x;
      }
      this.drawOverhead(ctx, it.u, it.v, cam.zoom, isP ? lift : 0);
    }
    ctx.restore();

    this.drawForeground(ctx, time);
    this.drawArrows(ctx, cam, list, time);
    this.drawHud(ctx, T, list);
  }

  private drawHuman(ctx: CanvasRenderingContext2D, u: number, v: UView, T: number, time: number) {
    const meta = this.r.units[u];
    const chief = meta.kind === 'chief';
    const k = chief ? CHIEF_SCALE : 1;
    let alpha = 1;
    if (v.anim === ANIM.dead) {
      if (v.animT > 58) return;
      alpha = 1 - sm(26, 58, v.animT);
    }
    const w = this.weapons[u] ?? WEAPONS_BY_ID[FALLBACK];
    const shape = weaponShape(w);
    const eq = meta.equipment?.weapon ? meta.equipment : { helm: null, chest: null, gloves: null, legs: null, ...(meta.equipment ?? {}), weapon: FALLBACK };
    let pose: Pose;
    const atk = v.anim === ANIM.attack1 || v.anim === ANIM.attack2 ? this.atkAt(u, T) : null;
    if (atk) {
      const def = meta.moves[atk.m];
      pose = attackPose(shape, atk.motion, def?.hits ?? 1, atk.timing, T - atk.t, time);
    } else pose = movePose(shape, v.anim, v.animT, time, v.vx).pose;
    const status = v.flags & FLAG.freeze ? 'freeze' : v.flags & FLAG.burn ? 'burn' : v.flags & FLAG.poison ? 'poison' : v.flags & FLAG.shock ? 'shock' : null;

    // sombra
    const lift = clamp((this.G - v.y) / 300);
    ctx.fillStyle = `rgba(0,0,0,${0.35 * (1 - lift) * alpha})`;
    ctx.beginPath();
    ctx.ellipse(v.x, this.G + 1, 24 * k * (1 - lift * 0.5), 5 * k * (1 - lift * 0.5), 0, 0, TAU);
    ctx.fill();

    // aura do chefe
    if (chief && meta.aura && v.anim !== ANIM.dead) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.75 + 0.25 * Math.sin(time * 4);
      ctx.globalAlpha = 0.55 * pulse;
      ctx.fillStyle = rgrad(ctx, v.x, v.y - 60 * k, 110 * k, meta.aura + 'aa', meta.aura + '00');
      ctx.fillRect(v.x - 130 * k, v.y - 190 * k, 260 * k, 220 * k);
      // fagulhas subindo
      for (let i = 0; i < 10; i++) {
        const ph = (time * (0.5 + h01(i, 3)) + h01(i, 1)) % 1;
        ctx.globalAlpha = (1 - ph) * 0.9;
        ctx.fillStyle = meta.aura;
        ctx.beginPath();
        ctx.arc(v.x + (h01(i, 2) - 0.5) * 70 * k + Math.sin(time * 3 + i) * 6, v.y - ph * 150 * k, 2 + h01(i, 4) * 2, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    // rastro da arma
    if (atk && ['swing', 'slam', 'combo', 'spin', 'thrust', 'throw', 'leap', 'stab'].includes(atk.motion) && k === 1) {
      const def = meta.moves[atk.m];
      drawSwingTrail(ctx, {
        look: meta.look!, weapon: w, shape, motion: atk.motion, hits: def?.hits ?? 1, timing: atk.timing, local: T - atk.t,
        origin: (lt) => {
          const g = this.unitAt(u, atk.t + lt) ?? v;
          return { x: g.x, y: g.y, facing: g.facing };
        },
        color: !def || def.element === 'physical' ? '#cfe8ff' : ELEMENT_COLOR[def.element],
        low: false,
      });
    }
    // imagens residuais da esquiva
    if (v.anim === ANIM.dash) {
      for (let q = 3; q >= 1; q--) {
        const g = this.unitAt(u, T - q * 1.2);
        if (!g) continue;
        ctx.save();
        ctx.globalAlpha = 0.13 * (4 - q) * alpha;
        ctx.translate(g.x, g.y);
        drawAvatar(ctx, { look: meta.look!, equipment: eq, pose, facing: g.facing, time, scale: k });
        ctx.restore();
      }
    }
    ctx.save();
    ctx.globalAlpha = alpha * (v.flags & FLAG.iframes && v.anim !== ANIM.dash ? 0.6 + 0.4 * Math.abs(Math.sin(time * 18)) : 1);
    ctx.translate(v.x, v.y);
    drawAvatar(ctx, { look: meta.look!, equipment: eq, pose, facing: v.facing, time, status, scale: k });
    ctx.restore();

    const hit = this.lastHit(u, T);
    if (hit !== null && alpha > 0.5) this.drawFlash(ctx, meta, eq, pose, v, time, k, 0.55 * (1 - (T - hit) / 6));
  }

  private drawFlash(ctx: CanvasRenderingContext2D, meta: TeamUnitMeta, eq: NonNullable<TeamUnitMeta['equipment']>, pose: Pose, v: UView, time: number, k: number, a: number) {
    if (a <= 0) return;
    const fc = this.flash;
    const fx = fc.getContext('2d')!;
    fx.setTransform(1, 0, 0, 1, 0, 0);
    fx.clearRect(0, 0, fc.width, fc.height);
    fx.save();
    fx.translate(180, 290);
    drawAvatar(fx, { look: meta.look!, equipment: eq, pose, facing: v.facing, time, scale: k });
    fx.restore();
    fx.globalCompositeOperation = 'source-atop';
    fx.fillStyle = '#ffffff';
    fx.fillRect(0, 0, fc.width, fc.height);
    fx.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.globalAlpha = Math.min(1, a);
    ctx.drawImage(fc, v.x - 180, v.y - 290);
    ctx.restore();
  }

  private drawMonster(ctx: CanvasRenderingContext2D, u: number, v: UView, T: number, time: number) {
    const meta = this.r.units[u];
    const spec = this.specs[u];
    if (!spec) return;
    const k = meta.scale ?? 0.25;
    let alpha = 1;
    let st: DrawState;
    const hurtAt = this.lastHit(u, T);
    const hurt = hurtAt === null ? 0 : 1 - (T - hurtAt) / 6;
    const rage = clamp(1 - v.hp / meta.maxHp) * 0.8;
    const air = v.y < this.G - 4 ? 1 : 0;
    const vxLocal = -v.vx * this.r.tickRate * v.facing;
    if (v.anim === ANIM.dead) {
      if (v.animT > 58) return;
      alpha = 1 - sm(30, 58, v.animT);
      st = { t: time, anim: 'death', pose: 'roar', p: clamp(v.animT / 40), hurt: 0, rage, move: 0, gait: v.gait, vx: 0, vy: 0, air: 0 };
    } else {
      const atk = v.anim === ANIM.attack1 || v.anim === ANIM.attack2 ? this.atkAt(u, T) : null;
      if (atk) {
        const tm = atk.timing;
        const loc = T - atk.t;
        const p = loc < tm.windup ? 0.5 * (loc / Math.max(1, tm.windup)) : 0.5 + 0.5 * clamp((loc - tm.windup) / Math.max(1, tm.active + tm.recovery));
        st = { t: time, anim: 'attack', pose: meta.moves[atk.m]?.pose ?? 'swipe', p, hurt, rage, move: 0, gait: v.gait, vx: 0, vy: v.vy, air };
      } else {
        const stun = v.anim === ANIM.hitstun || v.anim === ANIM.tumble;
        st = {
          t: time + u * 0.37, anim: stun ? 'hurt' : 'idle', pose: 'roar', p: stun ? clamp(v.animT / 12) : 0, hurt, rage,
          move: clamp(Math.abs(v.vx * this.r.tickRate) / 230), gait: v.gait, vx: vxLocal, vy: v.vy * this.r.tickRate, air,
        };
      }
    }
    // sombra
    const lift = clamp((this.G - v.y) / 300);
    ctx.fillStyle = `rgba(0,0,0,${0.32 * (1 - lift) * alpha})`;
    ctx.beginPath();
    ctx.ellipse(v.x, this.G + 2, meta.hitbox.w * 0.6 * (1 - lift * 0.5), 6 * (1 - lift * 0.5), 0, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(v.x, v.y);
    // congelado: tom azul
    if (v.flags & FLAG.freeze) ctx.filter = 'saturate(0.4) hue-rotate(160deg) brightness(1.2)';
    // o desenho olha para a esquerda; virado para a direita, espelha
    ctx.scale(-v.facing * k, k);
    try {
      this.anchors[u] = bodyFor(spec.arch)(ctx, spec, st);
    } catch {
      /* ignora */
    }
    ctx.restore();
  }

  private drawOverhead(ctx: CanvasRenderingContext2D, u: number, v: UView, zoom: number, lift = 0) {
    const meta = this.r.units[u];
    if (v.anim === ANIM.dead) return;
    const s = 1 / Math.max(0.35, zoom); // tamanho constante na tela
    if (meta.kind === 'monster') {
      if (v.hp >= meta.maxHp - 0.5) return;
      const A = this.anchors[u];
      const top = A ? v.y + A.top * (meta.scale ?? 0.25) : v.y - meta.hitbox.h;
      const w = 34 * s;
      const h = 4 * s;
      const y = Math.min(top, v.y - meta.hitbox.h) - 10 * s;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(v.x - w / 2 - s, y - s, w + 2 * s, h + 2 * s);
      ctx.fillStyle = '#ff5a5f';
      ctx.fillRect(v.x - w / 2, y, w * clamp(v.hp / meta.maxHp), h);
      return;
    }
    if (meta.kind === 'chief') return;
    // jogador: setinha da cor do time e o nome
    const top = v.y - meta.hitbox.h - 16 - lift * 13 * s;
    ctx.fillStyle = TEAM_COLOR[meta.team];
    ctx.beginPath();
    ctx.moveTo(v.x - 6 * s, top - 8 * s);
    ctx.lineTo(v.x + 6 * s, top - 8 * s);
    ctx.lineTo(v.x, top);
    ctx.fill();
    if (zoom > 0.45) {
      ctx.font = `700 ${11 * s}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(meta.name, v.x + s, top - 11 * s + s);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(meta.name, v.x, top - 11 * s);
    }
  }

  private drawProjectiles(ctx: CanvasRenderingContext2D, T: number) {
    for (const pr of this.projectilesAt(T)) {
      const m = this.projMeta.get(pr.id);
      if (!m) continue;
      const [c1, c2] = elColors(m.el);
      const owner = this.unitAt(m.u, m.t);
      const ang = Math.atan2(pr.vy, pr.vx || (owner?.facing ?? 1));
      const age = T - m.t;
      ctx.save();
      ctx.translate(pr.x, pr.y);
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
      ctx.shadowColor = c1;
      ctx.shadowBlur = 14;
      switch (m.vfx) {
        case 'arrow':
        case 'piercing_arrow':
          ctx.strokeStyle = '#d8c8a0';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(-22, 0);
          ctx.lineTo(8, 0);
          ctx.stroke();
          ctx.fillStyle = m.el === 'physical' ? '#c9ced6' : c1;
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
        case 'holy_beam':
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
          break;
        default: {
          const r = m.vfx === 'shadow_orb' ? 15 : m.vfx === 'fireball' ? 12 : 9;
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.8);
          g.addColorStop(0, '#ffffff');
          g.addColorStop(0.35, c1);
          g.addColorStop(1, c2 + '00');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(0, 0, r * 1.8, 0, TAU);
          ctx.fill();
          if (m.vfx === 'shadow_orb') {
            ctx.fillStyle = '#0b0712';
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.6, 0, TAU);
            ctx.fill();
          }
        }
      }
      ctx.restore();
      if (m.vfx === 'chain_pull') {
        const o = this.unitAt(m.u, T);
        if (o) {
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
  }

  // ------------------------------------------------------------ cenário
  private drawBackground(ctx: CanvasRenderingContext2D, cam: { x: number; y: number; zoom: number }, time: number) {
    const th = this.r.arena.theme;
    const W = this.viewW;
    const H = this.viewH;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, th.sky[0]);
    g.addColorStop(1, th.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const gy = (this.G - cam.y) * cam.zoom + H / 2; // chão na tela
    // brilho do horizonte
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgrad(ctx, W / 2, gy, Math.max(W, H) * 0.7, th.fog + '44', th.fog + '00');
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    // camadas com profundidade (mais longe = move menos e é menor)
    const layer = (par: number, zk: number, draw: (sx: number, sy: number, sc: number, i: number) => void, step: number) => {
      const z = cam.zoom * zk;
      const baseY = gy - (1 - zk) * 40;
      const left = cam.x * par - W / 2 / z - step;
      const right = cam.x * par + W / 2 / z + step;
      for (let wx = Math.floor(left / step) * step; wx <= right; wx += step) {
        const i = Math.round(wx / step);
        const sx = (wx - cam.x * par) * z + W / 2;
        draw(sx + (h01(i, 7) - 0.5) * step * 0.5 * z, baseY, z, i);
      }
    };
    // montanhas/silhuetas distantes
    const far = mixHex(th.sky[1], '#000000', 0.35);
    ctx.fillStyle = far;
    ctx.beginPath();
    ctx.moveTo(0, H);
    {
      const z = cam.zoom * 0.45;
      const baseY = gy - 30;
      for (let sx = -10; sx <= W + 10; sx += 8) {
        const wx = cam.x * 0.15 + (sx - W / 2) / z;
        const h = 150 + 70 * Math.sin(wx * 0.004) + 50 * Math.sin(wx * 0.011 + 1.3) + 25 * Math.sin(wx * 0.031);
        ctx.lineTo(sx, baseY - h * z);
      }
    }
    ctx.lineTo(W, H);
    ctx.fill();
    // objetos do tema
    const mid = mixHex(th.sky[1], th.ground, 0.5);
    const prop = PROPS[th.id] ?? PROPS.coliseu;
    ctx.save();
    ctx.globalAlpha = 0.75;
    layer(0.35, 0.6, (sx, sy, sc, i) => prop(ctx, sx, sy, sc, i, mixHex(mid, '#000000', 0.25), th, time), 360);
    ctx.globalAlpha = 1;
    layer(0.65, 0.82, (sx, sy, sc, i) => prop(ctx, sx, sy, sc, i + 999, mid, th, time), 520);
    ctx.restore();
    // chão
    const gg = ctx.createLinearGradient(0, gy, 0, H);
    gg.addColorStop(0, mixHex(th.ground, '#ffffff', 0.08));
    gg.addColorStop(1, mixHex(th.ground, '#000000', 0.55));
    ctx.fillStyle = gg;
    ctx.fillRect(0, gy, W, H - gy);
    ctx.fillStyle = mixHex(th.ground, th.fog, 0.35);
    ctx.fillRect(0, gy - 1, W, 2.5);
    // textura do chão (presa ao mundo)
    ctx.fillStyle = mixHex(th.ground, '#000000', 0.25);
    for (let i = -2; i < 60; i++) {
      const wx = Math.floor(cam.x / 90) * 90 + (i - 30) * 90;
      const sx = (wx - cam.x) * cam.zoom + W / 2;
      if (sx < -40 || sx > W + 40) continue;
      const len = (14 + h01(Math.round(wx), 2) * 30) * cam.zoom;
      const dy = (6 + h01(Math.round(wx), 3) * 26) * cam.zoom;
      ctx.fillRect(sx, gy + dy, len, Math.max(1, 2 * cam.zoom));
    }
  }

  private drawWalls(ctx: CanvasRenderingContext2D, time: number) {
    const th = this.r.arena.theme;
    const G = this.G;
    for (const x of [0, this.W]) {
      const dir = x === 0 ? 1 : -1;
      const c = mixHex(th.ground, '#000000', 0.15);
      ctx.fillStyle = c;
      ctx.fillRect(x - 40 * (1 - dir) / 2 - (dir > 0 ? 0 : 0), G - 460, 40, 460);
      ctx.fillStyle = mixHex(th.ground, '#ffffff', 0.12);
      ctx.fillRect(dir > 0 ? x + 34 : x - 40, G - 460, 6, 460);
      // tocha
      const fx = x + dir * 28;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgrad(ctx, fx, G - 300, 70, th.fog + '88', th.fog + '00');
      ctx.fillRect(fx - 70, G - 370, 140, 140);
      ctx.fillStyle = th.particle;
      ctx.beginPath();
      ctx.ellipse(fx, G - 302 - Math.sin(time * 12) * 2, 6, 12 + Math.sin(time * 9) * 2, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawForeground(ctx: CanvasRenderingContext2D, time: number) {
    const th = this.r.arena.theme;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 34; i++) {
      const sp = 0.03 + h01(i, 1) * 0.07;
      const x = (h01(i, 2) * this.viewW + Math.sin(time * 0.7 + i) * 18) % this.viewW;
      const y = this.viewH - ((time * sp * this.viewH + h01(i, 3) * this.viewH) % this.viewH);
      ctx.globalAlpha = 0.18 + 0.4 * h01(i, 4);
      ctx.fillStyle = th.particle;
      ctx.beginPath();
      ctx.arc(x, y, 1 + h01(i, 5) * 1.8, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    // vinheta
    const v = ctx.createRadialGradient(this.viewW / 2, this.viewH / 2, Math.min(this.viewW, this.viewH) * 0.45, this.viewW / 2, this.viewH / 2, Math.max(this.viewW, this.viewH) * 0.8);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, this.viewW, this.viewH);
  }

  // ------------------------------------------------------------ HUD
  /** Setinhas na borda para quem está fora da tela (monstros chegando, inimigos longe). */
  private drawArrows(ctx: CanvasRenderingContext2D, cam: { x: number; y: number; zoom: number }, list: { u: number; v: UView }[], time: number) {
    const W = this.viewW;
    const count = [0, 0];
    const col = ['', ''];
    for (const it of list) {
      const m = this.r.units[it.u];
      if (it.v.anim === ANIM.dead) continue;
      const sx = (it.v.x - cam.x) * cam.zoom + W / 2;
      if (sx >= -8 && sx <= W + 8) continue;
      const side = sx < 0 ? 0 : 1;
      count[side]++;
      col[side] = m.kind === 'player' ? TEAM_COLOR[m.team] : (m.body?.pal.glow ?? '#ff5a5f');
    }
    const gy = (this.G - cam.y) * cam.zoom + this.viewH / 2;
    for (const side of [0, 1]) {
      if (!count[side]) continue;
      const d = side === 0 ? -1 : 1;
      const bob = Math.sin(time * 6) * 3;
      const x = side === 0 ? 14 + bob : W - 14 - bob;
      const y = gy - 46;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.arc(x - d * 16, y, 17, 0, TAU);
      ctx.fill();
      ctx.fillStyle = col[side] || '#ff5a5f';
      ctx.shadowColor = ctx.fillStyle as string;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - d * 14, y - 11);
      ctx.lineTo(x - d * 14, y + 11);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.font = '800 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`${count[side]}`, x - d * 24, y);
      ctx.restore();
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D, T: number, list: { u: number; v: UView }[]) {
    const waves = this.r.mode === 'waves';
    const views = new Map(list.map((x) => [x.u, x.v]));
    const W = this.viewW;
    const compact = W < 520;
    ctx.save();
    ctx.textBaseline = 'middle';
    // painéis dos times
    const sides: (0 | 1)[] = waves ? [0] : [0, 1];
    for (const team of sides) {
      const members = this.r.units.filter((m) => m.team === team && m.kind === 'player');
      const right = team === 1;
      const pw = compact ? Math.min(150, W * 0.42) : 190;
      const x0 = right ? W - pw - 10 : 10;
      let y = 10;
      ctx.font = `800 ${compact ? 11 : 12}px system-ui, sans-serif`;
      ctx.textAlign = right ? 'right' : 'left';
      ctx.fillStyle = TEAM_COLOR[team];
      ctx.fillText(this.r.teamNames[team].toUpperCase(), right ? x0 + pw : x0, y + 6);
      y += 16;
      const rowH = compact ? 13 : 15;
      for (const m of members) {
        const v = views.get(m.u);
        const hp = v ? v.hp : this.lastHp(m.u, T);
        const dead = !v || v.anim === ANIM.dead;
        ctx.globalAlpha = dead ? 0.45 : 1;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(x0, y, pw, rowH - 2);
        const frac = clamp(hp / m.maxHp);
        ctx.fillStyle = frac > 0.5 ? '#4ade80' : frac > 0.25 ? '#facc15' : '#f87171';
        const bw = (pw - 4) * frac;
        ctx.fillRect(right ? x0 + pw - 2 - bw : x0 + 2, y + 2, bw, rowH - 6);
        ctx.font = `700 ${compact ? 9 : 10}px system-ui, sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = right ? 'right' : 'left';
        const label = waves ? m.name : `${m.name}  ${Math.max(0, Math.round(hp))}/${m.maxHp}`;
        ctx.fillText(label, right ? x0 + pw - 5 : x0 + 5, y + rowH / 2 - 1);
        y += rowH;
      }
      ctx.globalAlpha = 1;
    }
    if (waves) this.drawWaveHud(ctx, T, views);
    this.drawBanners(ctx, T);
    ctx.restore();
  }

  private lastHp(u: number, T: number) {
    const tr = this.tracks[u];
    if (!tr) return 0;
    const i = Math.floor(T / this.r.frameEvery);
    if (i > tr.f1) return tr.hp[tr.hp.length - 1];
    return tr.hp[0];
  }

  private currentWave(T: number) {
    let w: Extract<TeamEv, { type: 'wave' }> | null = null;
    for (const e of this.waveEvs) if (e.t <= T) w = e;
    return w;
  }

  private drawWaveHud(ctx: CanvasRenderingContext2D, T: number, views: Map<number, UView>) {
    const W = this.viewW;
    const w = this.currentWave(T);
    // tela estreita: a wave vai para a direita e a barra do chefe desce (abaixo da lista do time)
    const compact = W < 520;
    const players = this.r.units.filter((m) => m.kind === 'player').length;
    const cxw = compact ? W - 60 : W / 2;
    if (w) {
      const label = w.boss ? 'MINI-CHEFE' : `WAVE ${w.n} / ${w.total - 1}`;
      ctx.font = '900 13px system-ui, sans-serif';
      const tw = ctx.measureText(label).width + 26;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath();
      ctx.roundRect(cxw - tw / 2, 8, tw, 24, 12);
      ctx.fill();
      ctx.fillStyle = w.boss ? '#ffd24a' : '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(label, cxw, 20.5);
      // monstros que faltam nesta wave (bolinhas)
      if (!w.boss) {
        const foes = this.r.units.filter((m) => m.team === 1 && (m.wave ?? 0) === w.n);
        const alive = foes.filter((m) => {
          const v = views.get(m.u);
          return !v ? T < this.firstSeen(m.u) : v.anim !== ANIM.dead;
        }).length;
        const n = foes.length;
        const dw = Math.min(10, (compact ? 100 : 120) / Math.max(1, n));
        for (let i = 0; i < n; i++) {
          ctx.fillStyle = i < alive ? '#ff5a5f' : 'rgba(255,255,255,0.18)';
          ctx.beginPath();
          ctx.arc(cxw - ((n - 1) * dw) / 2 + i * dw, 40, 3, 0, TAU);
          ctx.fill();
        }
      }
    }
    // barra grande do mini-chefe (sem números)
    if (this.chief >= 0) {
      const v = views.get(this.chief);
      if (v && v.anim !== ANIM.dead) {
        const m = this.r.units[this.chief];
        const bw = compact ? W - 40 : Math.min(W * 0.62, 460);
        const x = W / 2 - bw / 2;
        const y = compact ? 26 + players * 13 + 18 : 50;
        ctx.textAlign = 'center';
        ctx.font = '900 13px system-ui, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`${m.name.toUpperCase()}`, W / 2, y);
        ctx.font = '600 10px system-ui, sans-serif';
        ctx.fillStyle = m.aura ?? '#ffd24a';
        ctx.fillText(m.title ?? '', W / 2, y + 13);
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(x - 2, y + 21, bw + 4, 10);
        const frac = clamp(v.hp / m.maxHp);
        const g = ctx.createLinearGradient(x, 0, x + bw, 0);
        g.addColorStop(0, '#ff3b3b');
        g.addColorStop(1, m.aura ?? '#ff9a3b');
        ctx.fillStyle = g;
        ctx.fillRect(x, y + 23, bw * frac, 6);
      }
    }
  }

  private firstSeen(u: number) {
    const tr = this.tracks[u];
    return tr ? tr.f0 * this.r.frameEvery : Infinity;
  }

  private drawBanners(ctx: CanvasRenderingContext2D, T: number) {
    const W = this.viewW;
    const H = this.viewH;
    const tps = this.r.tickRate;
    const big = (title: string, sub: string, color: string, age: number, dur: number) => {
      const a = sm(0, 0.25 * tps, age) * (1 - sm(dur - 0.5 * tps, dur, age));
      if (a <= 0) return;
      const sc = 1 + 0.15 * (1 - sm(0, 0.3 * tps, age));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(W / 2, H * 0.4);
      ctx.scale(sc, sc);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(-W / 2, -38, W, sub ? 82 : 66);
      ctx.textAlign = 'center';
      ctx.font = `900 ${Math.min(46, W / 9)}px system-ui, sans-serif`;
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(title, 0, 0);
      ctx.shadowBlur = 0;
      if (sub) {
        ctx.font = `700 ${Math.min(16, W / 26)}px system-ui, sans-serif`;
        ctx.fillStyle = color;
        ctx.fillText(sub, 0, 30);
      }
      ctx.restore();
    };
    if (this.r.mode === 'waves') {
      const w = this.currentWave(T);
      if (w) {
        const age = T - w.t;
        if (w.boss) {
          const m = this.chief >= 0 ? this.r.units[this.chief] : null;
          big(m ? m.name.toUpperCase() : 'MINI-CHEFE', m?.title ?? '', m?.aura ?? '#ffd24a', age, 2.6 * tps);
        } else big(`WAVE ${w.n}`, w.n === 1 ? this.r.teamNames[1] : '', this.r.arena.theme.fog, age, 1.7 * tps);
      }
    }
    // fim
    const end = this.r.events.find((e) => e.type === 'end');
    if (end && T >= end.t + 15) {
      const age = T - end.t - 15;
      let title: string;
      let sub = '';
      let color = '#ffd24a';
      if (this.r.mode === 'waves') {
        title = this.r.winner === 0 ? 'VITÓRIA!' : 'DERROTA';
        color = this.r.winner === 0 ? '#ffd24a' : '#ff5a5f';
        const reached = this.r.waves?.reached ?? 0;
        sub = this.r.winner === 0 ? `${this.r.waves?.chief ?? 'O chefe'} foi derrotado` : reached >= (this.r.waves?.total ?? 11) ? 'Caíram diante do mini-chefe' : `Chegaram à wave ${reached}`;
      } else if (this.r.winner === null) {
        title = 'EMPATE';
        color = '#cfd6e4';
      } else {
        const mine = this.myTeam;
        title = mine === null ? 'FIM DE LUTA' : mine === this.r.winner ? 'VITÓRIA!' : 'DERROTA';
        color = mine === null || mine === this.r.winner ? '#ffd24a' : '#ff5a5f';
        sub = `${this.r.teamNames[this.r.winner]} venceu`;
      }
      big(title, sub, color, age, Infinity);
    }
  }
}

// ------------------------------------------------------------------ objetos dos cenários
type Prop = (ctx: CanvasRenderingContext2D, x: number, y: number, s: number, i: number, c: string, th: TeamReplay['arena']['theme'], time: number) => void;

const glowDot = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: string) => {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgrad(ctx, x, y, r, c + 'aa', c + '00');
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
};

const PROPS: Record<string, Prop> = {
  cripta: (ctx, x, y, s, i, c, th) => {
    ctx.fillStyle = c;
    const k = h01(i, 1);
    if (k < 0.55) {
      // lápide
      const w = (30 + k * 30) * s;
      const h = (50 + k * 50) * s;
      ctx.beginPath();
      ctx.moveTo(x - w / 2, y);
      ctx.lineTo(x - w / 2, y - h + w / 2);
      ctx.arc(x, y - h + w / 2, w / 2, Math.PI, 0);
      ctx.lineTo(x + w / 2, y);
      ctx.fill();
    } else if (k < 0.8) {
      // cruz
      ctx.fillRect(x - 5 * s, y - 120 * s, 10 * s, 120 * s);
      ctx.fillRect(x - 28 * s, y - 95 * s, 56 * s, 10 * s);
    } else {
      // árvore seca
      ctx.strokeStyle = c;
      ctx.lineCap = 'round';
      ctx.lineWidth = 12 * s;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 6 * s, y - 160 * s);
      ctx.stroke();
      ctx.lineWidth = 5 * s;
      for (let b = 0; b < 4; b++) {
        const by = y - (70 + b * 25) * s;
        const d = b % 2 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(x + 4 * s, by);
        ctx.quadraticCurveTo(x + d * 40 * s, by - 20 * s, x + d * 60 * s, by - 50 * s);
        ctx.stroke();
      }
    }
    if (h01(i, 9) > 0.7) glowDot(ctx, x, y - 30 * s, 26 * s, th.particle);
  },
  floresta: (ctx, x, y, s, i, c, th) => {
    ctx.fillStyle = c;
    const h = (220 + h01(i, 1) * 160) * s;
    ctx.fillRect(x - 7 * s, y - h * 0.3, 14 * s, h * 0.3);
    for (let l = 0; l < 4; l++) {
      const ly = y - h * 0.25 - l * h * 0.2;
      const lw = (90 - l * 16) * s;
      ctx.beginPath();
      ctx.moveTo(x - lw, ly);
      ctx.lineTo(x, ly - h * 0.32);
      ctx.lineTo(x + lw, ly);
      ctx.fill();
    }
    if (h01(i, 5) > 0.55) {
      ctx.fillStyle = th.particle;
      ctx.globalAlpha *= 0.8;
      ctx.beginPath();
      ctx.ellipse(x + 40 * s, y - 10 * s, 12 * s, 7 * s, 0, Math.PI, 0);
      ctx.fill();
      ctx.globalAlpha /= 0.8;
      glowDot(ctx, x + 40 * s, y - 12 * s, 22 * s, th.particle);
    }
  },
  vulcao: (ctx, x, y, s, i, c, th, time) => {
    ctx.fillStyle = c;
    const h = (90 + h01(i, 1) * 150) * s;
    const w = (60 + h01(i, 2) * 70) * s;
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.lineTo(x - w * 0.4, y - h * 0.7);
    ctx.lineTo(x - w * 0.1, y - h);
    ctx.lineTo(x + w * 0.3, y - h * 0.6);
    ctx.lineTo(x + w, y);
    ctx.fill();
    ctx.strokeStyle = th.fog;
    ctx.globalAlpha *= 0.5 + 0.3 * Math.sin(time * 2 + i);
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.1, y - h * 0.9);
    ctx.lineTo(x - w * 0.2, y - h * 0.5);
    ctx.lineTo(x + w * 0.05, y - h * 0.2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    glowDot(ctx, x, y, 50 * s, th.fog);
  },
  abismo: (ctx, x, y, s, i, c, th, time) => {
    const fy = y - (140 + h01(i, 1) * 160) * s + Math.sin(time * 0.8 + i) * 10 * s;
    const h = (40 + h01(i, 2) * 50) * s;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(x, fy - h);
    ctx.lineTo(x + h * 0.35, fy);
    ctx.lineTo(x, fy + h * 0.6);
    ctx.lineTo(x - h * 0.35, fy);
    ctx.fill();
    glowDot(ctx, x, fy, h, th.fog);
    if (h01(i, 4) > 0.5) {
      ctx.strokeStyle = c;
      ctx.lineWidth = 14 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - 50 * s, y);
      ctx.quadraticCurveTo(x - 30 * s, y - 140 * s, x + 20 * s + Math.sin(time + i) * 10 * s, y - 180 * s);
      ctx.stroke();
    }
  },
  geleira: (ctx, x, y, s, i, c, th) => {
    ctx.fillStyle = mixHex(c, '#bfe8ff', 0.25);
    const n = 2 + Math.floor(h01(i, 1) * 3);
    for (let q = 0; q < n; q++) {
      const ox = (q - n / 2) * 30 * s;
      const h = (70 + h01(i * 7 + q, 2) * 140) * s;
      ctx.beginPath();
      ctx.moveTo(x + ox - 16 * s, y);
      ctx.lineTo(x + ox + 2 * s, y - h);
      ctx.lineTo(x + ox + 18 * s, y);
      ctx.fill();
    }
    ctx.fillStyle = mixHex(c, '#ffffff', 0.35);
    ctx.beginPath();
    ctx.ellipse(x, y, 70 * s, 14 * s, 0, Math.PI, 0);
    ctx.fill();
    if (h01(i, 6) > 0.6) glowDot(ctx, x, y - 60 * s, 40 * s, th.fog);
  },
  fortaleza: (ctx, x, y, s, i, c, th, time) => {
    ctx.fillStyle = c;
    const h = (180 + h01(i, 1) * 160) * s;
    const w = 60 * s;
    ctx.fillRect(x - w / 2, y - h, w, h);
    for (let q = 0; q < 3; q++) ctx.fillRect(x - w / 2 + q * (w / 2.5), y - h - 14 * s, w / 5, 14 * s);
    ctx.fillStyle = th.particle;
    ctx.globalAlpha *= 0.7;
    ctx.fillRect(x - 6 * s, y - h * 0.7, 12 * s, 16 * s);
    ctx.globalAlpha /= 0.7;
    if (h01(i, 3) > 0.5) {
      ctx.save();
      ctx.translate(x + 70 * s, y - 70 * s);
      ctx.rotate(time * 0.6 * (h01(i, 4) > 0.5 ? 1 : -1));
      ctx.strokeStyle = c;
      ctx.lineWidth = 9 * s;
      ctx.beginPath();
      ctx.arc(0, 0, 32 * s, 0, TAU);
      ctx.stroke();
      for (let t = 0; t < 8; t++) {
        ctx.rotate(TAU / 8);
        ctx.fillStyle = c;
        ctx.fillRect(-5 * s, -44 * s, 10 * s, 14 * s);
      }
      ctx.restore();
    }
  },
  coliseu: (ctx, x, y, s, i, c) => {
    ctx.fillStyle = c;
    const h = 200 * s;
    const w = 150 * s;
    ctx.fillRect(x - w / 2, y - h, w, 18 * s);
    for (const d of [-1, 1]) ctx.fillRect(x + d * w * 0.42 - 9 * s, y - h, 18 * s, h);
    ctx.beginPath();
    ctx.arc(x, y - h + 18 * s, w * 0.33, Math.PI, 0);
    ctx.lineTo(x + w * 0.33, y - h + 30 * s);
    ctx.lineTo(x - w * 0.33, y - h + 30 * s);
    ctx.fill();
    if (h01(i, 2) > 0.6) {
      ctx.fillStyle = '#c04040';
      ctx.fillRect(x - 8 * s, y - h + 30 * s, 16 * s, 60 * s);
    }
  },
  noturna: (ctx, x, y, s, i, c, th, time) => {
    ctx.fillStyle = c;
    ctx.fillRect(x - 4 * s, y - 170 * s, 8 * s, 170 * s);
    ctx.fillRect(x - 18 * s, y - 176 * s, 36 * s, 8 * s);
    glowDot(ctx, x, y - 182 * s, 40 * s * (0.9 + 0.1 * Math.sin(time * 3 + i)), th.fog);
    if (h01(i, 3) > 0.5) {
      ctx.fillStyle = mixHex(c, th.fog, 0.3);
      ctx.beginPath();
      ctx.moveTo(x + 4 * s, y - 160 * s);
      ctx.lineTo(x + 50 * s, y - 150 * s + Math.sin(time * 2 + i) * 4 * s);
      ctx.lineTo(x + 4 * s, y - 120 * s);
      ctx.fill();
    }
  },
  templo: (ctx, x, y, s, i, c, th, time) => {
    ctx.fillStyle = c;
    const h = (200 + h01(i, 1) * 80) * s;
    ctx.fillRect(x - 16 * s, y - h, 32 * s, h);
    ctx.fillRect(x - 26 * s, y - h - 12 * s, 52 * s, 12 * s);
    ctx.fillRect(x - 24 * s, y - 14 * s, 48 * s, 14 * s);
    if (h01(i, 2) > 0.5) {
      ctx.fillRect(x + 50 * s, y - 40 * s, 24 * s, 40 * s);
      glowDot(ctx, x + 62 * s, y - 50 * s, 34 * s * (0.85 + 0.15 * Math.sin(time * 9 + i)), th.fog);
    }
  },
  pantano: (ctx, x, y, s, i, c, th) => {
    ctx.strokeStyle = c;
    ctx.lineCap = 'round';
    ctx.lineWidth = 3 * s;
    for (let q = 0; q < 6; q++) {
      const ox = (q - 3) * 9 * s;
      ctx.beginPath();
      ctx.moveTo(x + ox, y);
      ctx.quadraticCurveTo(x + ox + 6 * s, y - 50 * s, x + ox + (h01(i + q, 1) - 0.5) * 30 * s, y - (70 + h01(i + q, 2) * 60) * s);
      ctx.stroke();
    }
    if (h01(i, 5) > 0.6) glowDot(ctx, x + 30 * s, y - 60 * s, 18 * s, th.particle);
  },
};
