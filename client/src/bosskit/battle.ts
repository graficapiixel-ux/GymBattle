/**
 * Tela da luta contra o boss (Canvas 2D), com MOVIMENTO como no PvP.
 *
 * O resultado já vem decidido do servidor (quem bate, quanto, quem cai). Aqui
 * uma "coreografia" determinística (mesma semente → mesma luta para todo mundo)
 * faz os jogadores correrem, pularem nas plataformas, esquivarem dos golpes,
 * avançarem para bater e voarem longe quando apanham; o boss anda/flutua pela
 * arena — e o DUELISTA luta como um jogador: corre, pula e se teletransporta.
 */
import type { BossEv, BossPlayerMeta, BossReplay } from '@gymbattle/shared';
import { ANIM, WEAPONS_BY_ID, mulberry32, type WeaponDef } from '@gymbattle/shared';
import { P } from '../game/arena/legend/kit';
import { drawAvatar, idlePose, weaponShape, type Pose } from '../game/rig';
import { attackPose, motionOf, movePose, type AttackTiming, type Motion } from '../game/arena/poses';
import { drawSwingTrail } from '../game/arena/trail';
import { sfxExplosion, sfxHit, sfxJump, sfxKo, sfxShoot, sfxSwing } from '../game/audio/sfx';
import { CombatMusic, trackFor } from '../game/audio/music';
import { bodyFor } from './bodies';
import { FX } from './fx';
import { MOVES } from './duelist';
import type { DuelFrame, DuelMoveCtx } from './duelist/types';
import type { Anchors, DrawState, V } from './types';
import { TAU, clamp, crescent, godRays, h01, mixHex, orb, rgrad, sm, sparks } from './util';

export const W = 1000;
export const H = 600;
export const GROUND = 500;
const FPS = 30;
const DT = 1 / FPS;
const GRAV = 1750;
/** Plataformas flutuantes (só do lado dos jogadores). */
export const PLATS = [
  { x0: 70, x1: 250, y: 392 },
  { x0: 300, x1: 470, y: 318 },
];
const BOSS_HOME = 770;
/** Bosses que flutuam/descem do céu na entrada. */
const FLYERS = new Set(['eye', 'spirit', 'deity', 'elemental']);
const P_SCALE_LAND = 1.2;
/** Em pé a câmera abre mais: os jogadores são desenhados um pouco maiores para continuarem legíveis. */
const P_SCALE_PORT = 1.42;
const D_SCALE = 1.25;
/** Comprimento de um ciclo de passada (mundo, antes da escala do boss). */
const STRIDE = 150;
/** Avanço (negativo = para a frente) que cada pose de golpe faz o corpo dar. */
const LUNGE: Partial<Record<string, number>> = { slam: -70, swipe: -90, charge: -190, roar: 12, breath: 20, shoot: 25, cast: 10 };
const MELEE_POSES = new Set(['slam', 'swipe', 'charge']);
const FALLBACK_AV = {
  look: { skin: '#8a5a3c', face: 0, hair: 1, hairColor: '#222222', beard: 0, body: 1, height: 1, gender: 0, eyes: '#333333', marks: 0, accessory: 0, top: '#222222', shorts: '#222222' },
  equipment: { weapon: null, helm: null, chest: null, gloves: null, legs: null },
};

type PAtk = Extract<BossEv, { type: 'pAtk' }>;
type BAtk = Extract<BossEv, { type: 'bAtk' }>;

export interface BossHud {
  t: number;
  duration: number;
  bossHp: number;
  bossMax: number;
  players: { hp: number; max: number; ko: boolean }[];
  ended: boolean;
  won: boolean;
}

export interface BattleOpts {
  startAt?: number;
  sound?: boolean;
  onEnd?: (won: boolean) => void;
}

/** Trilha de movimento (um valor por quadro de 1/30 s). */
interface Track {
  x: Float32Array;
  y: Float32Array;
  f: Int8Array;
  anim: Uint8Array;
  at: Float32Array; // quadros desde o início da animação
  vx: Float32Array;
  alpha: Float32Array;
  /** Boss: passada acumulada, intensidade do andar e velocidade vertical. */
  g: Float32Array;
  mv: Float32Array;
  vy: Float32Array;
}
const mkTrack = (n: number): Track => ({
  x: new Float32Array(n), y: new Float32Array(n), f: new Int8Array(n), anim: new Uint8Array(n),
  at: new Float32Array(n), vx: new Float32Array(n), alpha: new Float32Array(n).fill(1),
  g: new Float32Array(n), mv: new Float32Array(n), vy: new Float32Array(n),
});

interface Tp {
  t: number;
  from: V;
  to: V;
}

export class BossBattle {
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private t0 = 0;
  private offset = 0;
  private playing = false;
  private lastT = -1;
  private ended = false;
  private music: CombatMusic | null = null;
  private pAtks: PAtk[];
  private bAtks: BAtk[];
  private kos: Map<number, number>;
  private dieAt: number | null;
  private endAt: number;
  private dpr = 1;
  private shakeNow = 0;
  private trail = 1;
  private portrait = false;
  private get ps() {
    return this.portrait ? P_SCALE_PORT : P_SCALE_LAND;
  }
  private weapons: (WeaponDef | undefined)[];
  private shapes: ReturnType<typeof weaponShape>[];
  // coreografia
  private N: number;
  private pt: Track[];
  private bt: Track;
  private targetsAt: V[][] = [];
  private startsAt: V[] = [];
  private everyoneAt: V[][] = [];
  private tps: Tp[] = [];
  /** Pisadas do boss (poeira e tremor). */
  private steps: { t: number; x: number; k: number }[] = [];
  private duel: boolean;
  private bk: number;

  constructor(private canvas: HTMLCanvasElement, private r: BossReplay, private opts: BattleOpts = {}) {
    this.ctx = canvas.getContext('2d')!;
    this.pAtks = r.events.filter((e): e is PAtk => e.type === 'pAtk');
    this.bAtks = r.events.filter((e): e is BAtk => e.type === 'bAtk');
    this.kos = new Map(r.events.filter((e) => e.type === 'pKo').map((e) => [(e as { p: number }).p, e.t]));
    this.dieAt = r.events.find((e) => e.type === 'bDie')?.t ?? null;
    this.endAt = r.events.find((e) => e.type === 'end')?.t ?? r.duration;
    this.weapons = r.players.map((p) => (p.equipment.weapon ? WEAPONS_BY_ID[p.equipment.weapon] : undefined));
    this.shapes = this.weapons.map((w) => weaponShape(w));
    this.duel = r.boss.arch === 'duelist';
    this.bk = this.duel ? D_SCALE : 0.62 * r.boss.size;
    this.N = Math.ceil(r.duration * FPS) + 2;
    this.pt = r.players.map(() => mkTrack(this.N));
    this.bt = mkTrack(this.N);
    this.choreograph();
    this.offset = clamp(opts.startAt ?? 0, 0, r.duration);
    this.resize();
  }

  get duration() {
    return this.r.duration;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    this.portrait = rect.height > rect.width * 1.05;
  }

  play() {
    if (this.playing) return;
    this.playing = true;
    this.t0 = performance.now() - this.offset * 1000;
    if (this.opts.sound !== false && !this.music) this.music = new CombatMusic(trackFor(this.r.seed));
    this.music?.play();
    const loop = (now: number) => {
      if (!this.playing) return;
      this.offset = Math.min(this.r.duration, Math.max(0, (now - this.t0) / 1000));
      this.render(this.offset);
      if (this.offset >= this.r.duration) {
        this.playing = false;
        this.music?.pause(1.2);
        return;
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.music?.pause();
  }

  seek(T: number) {
    this.offset = clamp(T, 0, this.r.duration);
    this.lastT = this.offset;
    this.t0 = performance.now() - this.offset * 1000;
    this.render(this.offset);
  }

  destroy() {
    this.pause();
    this.music?.destroy();
    this.music = null;
  }

  // ================================================================== coreografia

  private bossReach(x: number) {
    return this.duel ? x - 70 : x - 165 * this.bk;
  }

  private moveCtx(j: number, p: number): DuelMoveCtx {
    const b = this.bAtks[j];
    const atk = this.r.boss.attacks[b.a];
    return {
      p, t: p * b.dur, dur: b.dur, start: this.startsAt[j], targets: this.targetsAt[j], everyone: this.everyoneAt[j],
      ground: GROUND, W, seed: Math.floor(b.t * 100) + 7, color: atk.color, color2: atk.color2,
      me: this.r.boss.avatar ?? FALLBACK_AV, s: D_SCALE, glow: this.r.boss.pal.glow, accent: this.r.boss.pal.accent,
    };
  }

  private choreograph() {
    const r = this.r;
    const n = r.players.length;
    const rng = mulberry32((r.seed ^ 0x5bd1e995) >>> 0);
    const R = (a: number, b: number) => a + (b - a) * rng();
    // eventos por jogador
    const myAtks = r.players.map((_, i) => this.pAtks.filter((a) => a.p === i));
    type St = {
      x: number; y: number; vx: number; vy: number; ground: boolean; f: 1 | -1; anim: number; since: number;
      goal: number; next: number; hitUntil: number; koed: boolean; recoil: number; dodged: number;
    };
    const st: St[] = r.players.map((p, i) => {
      const x = p.style === 'melee' ? 330 - i * 28 : 210 - i * 22;
      return { x: Math.max(40, x), y: GROUND, vx: 0, vy: 0, ground: true, f: 1, anim: ANIM.idle, since: 0, goal: x, next: R(0.2, 1.2), hitUntil: -1, koed: false, recoil: -1, dodged: -1 };
    });
    // boss
    const B = { x: BOSS_HOME, y: FLYERS.has(r.boss.arch) ? GROUND - 70 : GROUND, vx: 0, vy: 0, ground: true, f: -1 as 1 | -1, anim: ANIM.idle as number, since: 0, goal: BOSS_HOME, next: 5, tp: 7, alpha: 1, gait: 0, move: 0, alt: 70, atkX: BOSS_HOME, prep: -1, lastStep: 0 };
    const fly = FLYERS.has(r.boss.arch);
    let atkIdx = 0;
    let activeMove = -1;

    const setAnim = (o: { anim: number; since: number }, a: number, k: number) => {
      if (o.anim !== a) {
        o.anim = a;
        o.since = k;
      }
    };
    const physics = (o: { x: number; y: number; vx: number; vy: number; ground: boolean }, minX: number, maxX: number, plats = true) => {
      const prevY = o.y;
      if (!o.ground) o.vy += GRAV * DT;
      o.x += o.vx * DT;
      o.y += o.vy * DT;
      if (o.ground) {
        o.vx *= 0.86;
        // saiu da beirada da plataforma: cai
        if (o.y < GROUND - 1 && !PLATS.some((p) => o.x >= p.x0 && o.x <= p.x1 && Math.abs(o.y - p.y) < 2)) o.ground = false;
      } else if (o.vy >= 0) {
        if (plats) {
          for (const p of PLATS) {
            if (prevY <= p.y + 1 && o.y >= p.y && o.x >= p.x0 && o.x <= p.x1) {
              o.y = p.y;
              o.vy = 0;
              o.ground = true;
            }
          }
        }
        if (o.y >= GROUND) {
          o.y = GROUND;
          o.vy = 0;
          o.ground = true;
        }
      }
      if (o.x < minX) (o.x = minX), (o.vx = Math.max(0, o.vx));
      if (o.x > maxX) (o.x = maxX), (o.vx = Math.min(0, o.vx));
    };

    for (let k = 0; k < this.N; k++) {
      const s = k / FPS;
      // ------------------------------------------------ ataques do boss que começam agora
      while (atkIdx < this.bAtks.length && this.bAtks[atkIdx].t <= s + 1e-6) {
        const b = this.bAtks[atkIdx];
        this.targetsAt[atkIdx] = b.targets.map((i) => ({ x: st[i].x, y: st[i].y }));
        this.everyoneAt[atkIdx] = st.filter((_, i) => !this.kos.has(i) || this.kos.get(i)! > s).map((o) => ({ x: o.x, y: o.y }));
        if (!this.everyoneAt[atkIdx].length) this.everyoneAt[atkIdx] = [{ x: 200, y: GROUND }];
        if (!this.targetsAt[atkIdx].length) this.targetsAt[atkIdx] = [this.everyoneAt[atkIdx][0]];
        this.startsAt[atkIdx] = { x: B.x, y: B.y };
        if (this.duel) activeMove = atkIdx;
        atkIdx++;
      }

      // ------------------------------------------------ boss
      const bAtkNow = this.bAtks.find((b) => s >= b.t && s < b.t + b.dur);
      if (this.duel) {
        if (activeMove >= 0 && bAtkNow && bAtkNow === this.bAtks[activeMove]) {
          const b = bAtkNow;
          const atk = r.boss.attacks[b.a];
          const fr = MOVES[atk.move ?? 'm01'].frame(this.moveCtx(activeMove, (s - b.t) / b.dur));
          B.x = fr.x;
          B.y = fr.y;
          B.f = fr.facing;
          B.alpha = fr.alpha;
          B.vx = 0;
          B.vy = 0;
          B.ground = fr.y >= GROUND - 0.5 || PLATS.some((p) => Math.abs(fr.y - p.y) < 1 && fr.x >= p.x0 && fr.x <= p.x1);
          setAnim(B, ANIM.attack1, k);
        } else {
          if (activeMove >= 0) {
            // terminou o golpe: continua de onde parou (se estiver no ar, cai)
            activeMove = -1;
            B.alpha = 1;
            if (B.y < GROUND - 1) B.ground = false;
          }
          if (s > r.entrance && this.dieAt === null || (this.dieAt !== null && s < this.dieAt)) {
            if (s >= B.tp && B.ground) {
              // teletransporte: some e aparece em outro lugar
              const to = { x: R(470, 900), y: rng() < 0.3 ? 318 : GROUND };
              if (to.y < GROUND) to.x = R(320, 460);
              this.tps.push({ t: s, from: { x: B.x, y: B.y }, to });
              B.x = to.x;
              B.y = to.y;
              B.ground = true;
              B.vx = 0;
              B.tp = s + R(2.2, 3.8);
            }
            if (s >= B.next) {
              B.goal = R(460, 920);
              B.next = s + R(0.6, 1.3);
              if (B.ground && rng() < 0.4) {
                B.vy = rng() < 0.3 ? -700 : -520;
                B.ground = false;
              }
            }
            const tvx = Math.sign(B.goal - B.x) * Math.min(320, Math.abs(B.goal - B.x) * 4);
            B.vx += (tvx - B.vx) * 0.25;
          }
          physics(B, 300, 950);
          if (!B.ground) setAnim(B, B.vy < 0 ? ANIM.jump : ANIM.fall, k);
          else setAnim(B, Math.abs(B.vx) > 50 ? ANIM.run : ANIM.idle, k);
          // olha para o jogador mais próximo
          const near = st.filter((_, i) => !(this.kos.get(i)! <= s)).sort((a, b) => Math.abs(a.x - B.x) - Math.abs(b.x - B.x))[0];
          B.f = near ? (near.x < B.x ? -1 : 1) : -1;
        }
      } else {
        // bosses grandes: andam DE VERDADE (aceleram, freiam, avançam para golpear, recuam para atirar)
        const alive = s > r.entrance && (this.dieAt === null || s < this.dieAt);
        const nextAtk = this.bAtks[atkIdx];
        if (alive) {
          if (bAtkNow) {
            // durante o golpe: avanço/recuo do próprio golpe (o corpo continua dando passos)
            const atk = r.boss.attacks[bAtkNow.a];
            const p = (s - bAtkNow.t) / bAtkNow.dur;
            const lunge = LUNGE[atk.pose] ?? 0;
            const off = lunge * (sm(0.12, 0.45, p) - sm(0.62, 0.98, p));
            B.goal = clamp(B.atkX + off * this.bk, 520, 900);
          } else {
            B.atkX = B.x;
            if (nextAtk && nextAtk.t - s < 1.1) {
              // prepara o próximo golpe: corpo a corpo chega perto, à distância se afasta
              const pose = r.boss.attacks[nextAtk.a].pose;
              if (B.prep !== nextAtk.t) {
                B.prep = nextAtk.t;
                B.goal = MELEE_POSES.has(pose) ? clamp(B.x - R(60, 110), 560, 860) : pose === 'roar' ? B.x : clamp(B.x + R(30, 80), 600, 880);
              }
            } else if (s >= B.next) {
              B.goal = fly ? R(600, 880) : R(600, 860);
              B.next = s + R(1.4, 3.0);
              if (fly) B.alt = R(30, 150);
            }
          }
          B.atkX = bAtkNow ? B.atkX : B.x;
        }
        // velocidade com aceleração e frenagem (nada de deslizar em velocidade constante)
        const vmax = fly ? 150 : 95 / Math.sqrt(r.boss.size);
        const dx = B.goal - B.x;
        const vT = alive || bAtkNow ? Math.sign(dx) * Math.min(vmax * (bAtkNow ? 2.6 : 1), Math.abs(dx) * 2.2) : 0;
        B.vx += (vT - B.vx) * (1 - Math.exp(-DT * (fly ? 3 : 5)));
        if (Math.abs(dx) < 2 && Math.abs(B.vx) < 8) B.vx *= 0.5;
        const px = B.x;
        B.x += B.vx * DT;
        B.gait += Math.abs(B.x - px) / (STRIDE * this.bk);
        if (fly) {
          const tgtY = GROUND - B.alt - 14 * Math.sin(s * 1.3);
          const vyT = (tgtY - B.y) * 2.2;
          B.vy += (vyT - B.vy) * (1 - Math.exp(-DT * 3));
          B.y += B.vy * DT;
        } else {
          B.y = GROUND;
          B.vy = 0;
          // pisadas (poeira/tremor): a cada meio ciclo de passada
          const step = Math.floor(B.gait * 2);
          if (step !== B.lastStep) {
            B.lastStep = step;
            if (Math.abs(B.vx) > vmax * 0.25 && s > r.entrance) this.steps.push({ t: s, x: B.x, k: clamp(Math.abs(B.vx) / vmax) });
          }
        }
        B.move = clamp(Math.abs(B.vx) / vmax);
      }
      const bt = this.bt;
      bt.x[k] = B.x;
      bt.y[k] = B.y;
      bt.f[k] = B.f;
      bt.anim[k] = B.anim;
      bt.at[k] = k - B.since;
      bt.vx[k] = B.vx;
      bt.alpha[k] = B.alpha;
      bt.g[k] = this.duel ? 0 : B.gait;
      bt.mv[k] = this.duel ? 0 : B.move;
      bt.vy[k] = B.vy;

      // ------------------------------------------------ jogadores
      // duelista: durante um golpe ele pode ir para trás do time; a "frente" do time continua onde ele estava
      const front = this.duel ? this.bossReach(Math.max(470, activeMove >= 0 ? this.startsAt[activeMove].x : B.x)) : this.bossReach(Math.max(B.x, B.atkX));
      // ninguém fica empilhado: quem está no chão e colado no outro se afasta devagar
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = st[i];
          const b = st[j];
          if (a.koed || b.koed || Math.abs(a.y - b.y) > 40) continue;
          const dx = b.x - a.x;
          const gap = 34;
          if (Math.abs(dx) >= gap) continue;
          const dir = dx === 0 ? (i % 2 ? 1 : -1) : Math.sign(dx);
          const push = (gap - Math.abs(dx)) * 0.12;
          a.x -= dir * push;
          b.x += dir * push;
        }
      }
      for (let i = 0; i < n; i++) {
        const o = st[i];
        const meta = r.players[i];
        const koAt = this.kos.get(i);
        const maxX = Math.max(60, front - 10);
        if (koAt !== undefined && s >= koAt) {
          if (!o.koed) {
            o.koed = true;
            o.vx = -230;
            o.vy = -380;
            o.ground = false;
            setAnim(o, ANIM.tumble, k);
          }
          physics(o, 30, maxX + 60, false);
          if (o.ground) setAnim(o, ANIM.dead, k);
        } else {
          const hit = this.bAtks.find((b) => b.hitAt > s - DT && b.hitAt <= s && b.targets.includes(i));
          if (hit) {
            o.vx = -(230 + rng() * 120);
            o.vy = -320 - rng() * 120;
            o.ground = false;
            o.hitUntil = s + 0.6;
            setAnim(o, ANIM.hitstun, k);
          }
          const a = myAtks[i].find((e) => s >= e.t && s < e.t + e.dur);
          // na mira de um golpe do boss: não sai do lugar até levar (os efeitos miram onde ele estava)
          const pinned = this.bAtks.some((b) => s >= b.t && s < b.hitAt + 0.02 && b.targets.includes(i));
          if (s < o.hitUntil) {
            physics(o, 30, maxX);
            if (o.ground && s > o.hitUntil - 0.25) setAnim(o, ANIM.land, k);
          } else if (a && pinned) {
            // ataca do lugar mesmo
            o.vx *= 0.5;
            o.f = B.x < o.x ? -1 : 1;
            physics(o, 30, maxX);
            setAnim(o, a.slot === 2 ? ANIM.attack2 : ANIM.attack1, k);
          } else if (a) {
            const q = (s - a.t) / a.dur;
            o.f = B.x < o.x ? -1 : 1;
            if (meta.style === 'melee') {
              const tx = this.duel ? (B.x < o.x ? B.x + 60 : B.x - 60) : this.bossReach(B.x) - 20;
              if (q < 0.3) {
                const left = Math.max(0.05, (0.3 - q) * a.dur);
                o.vx = clamp((tx - o.x) / left, -900, 900);
                if (a.slot === 2 && o.ground && q < 0.06) {
                  o.vy = -560;
                  o.ground = false;
                }
                setAnim(o, o.ground ? ANIM.dash : ANIM.jump, k);
                physics(o, 30, tx + 30);
              } else if (q < 0.8) {
                o.vx *= 0.4;
                setAnim(o, a.slot === 2 ? ANIM.attack2 : ANIM.attack1, k);
                physics(o, 30, tx + 30);
              } else {
                if (o.recoil !== a.t) {
                  o.recoil = a.t;
                  o.vx = -300 - rng() * 120;
                  o.vy = -430;
                  o.ground = false;
                }
                setAnim(o, ANIM.jump, k);
                physics(o, 30, maxX);
              }
            } else {
              if (a.slot === 2 && o.ground && q < 0.06) {
                o.vy = -480;
                o.ground = false;
              }
              o.vx *= 0.7;
              setAnim(o, a.slot === 2 ? ANIM.attack2 : ANIM.attack1, k);
              physics(o, 30, maxX);
            }
          } else if (this.bAtks.some((b) => s >= b.t && s < b.hitAt && b.targets.includes(i))) {
            // está na mira: fica (quase) parado e leva o golpe
            o.vx *= 0.8;
            o.f = 1;
            physics(o, 30, maxX);
            setAnim(o, o.ground ? ANIM.idle : o.vy < 0 ? ANIM.jump : ANIM.fall, k);
          } else {
            // esquiva de golpes que não são para ele
            const danger = this.bAtks.find((b) => b.hitAt - s > 0.25 && b.hitAt - s <= 0.25 + DT && !b.targets.includes(i));
            if (danger && o.ground && o.dodged !== danger.t) {
              o.dodged = danger.t;
              o.vy = -520;
              o.vx = (rng() < 0.5 ? -1 : 1) * (200 + rng() * 140);
              o.ground = false;
            }
            if (s >= o.next) {
              const zone = meta.style === 'melee' ? [180, maxX - 20] : [40, Math.min(maxX - 40, 420)];
              // escolhe um lugar que não esteja colado no de outro jogador
              for (let tries = 0; tries < 5; tries++) {
                o.goal = R(zone[0], Math.max(zone[0] + 10, zone[1]));
                if (!st.some((q, j) => j !== i && !q.koed && Math.abs(q.goal - o.goal) < 46)) break;
              }
              o.next = s + R(0.6, 1.5);
              if (o.ground && rng() < 0.4) {
                const onPlat = PLATS.find((p) => o.goal >= p.x0 && o.goal <= p.x1);
                o.vy = onPlat ? (onPlat.y < 350 ? -720 : -640) : -520;
                o.ground = false;
              }
            }
            const tvx = Math.sign(o.goal - o.x) * Math.min(270, Math.abs(o.goal - o.x) * 4);
            o.vx += (tvx - o.vx) * 0.2;
            physics(o, 30, maxX);
            if (!o.ground) setAnim(o, o.vy < 0 ? ANIM.jump : ANIM.fall, k);
            else setAnim(o, Math.abs(o.vx) > 45 ? ANIM.run : ANIM.idle, k);
            o.f = Math.abs(o.vx) > 45 && !(!o.ground) ? (o.vx > 0 ? 1 : -1) : 1;
          }
        }
        const t = this.pt[i];
        t.x[k] = o.x;
        t.y[k] = o.y;
        t.f[k] = o.f;
        t.anim[k] = o.anim;
        t.at[k] = k - o.since;
        t.vx[k] = o.vx;
      }
    }
    this.computeCamera();
  }

  /** Locomoção do boss interpolada (para o desenho do corpo). */
  private loco(T: number) {
    const tr = this.bt;
    const fk = clamp(T * FPS, 0, this.N - 1.001);
    const k = Math.floor(fk);
    const u = fk - k;
    const L = (a: Float32Array) => a[k] + (a[k + 1] - a[k]) * u;
    return { move: L(tr.mv), gait: L(tr.g), vx: this.duel ? 0 : L(tr.vx), vy: L(tr.vy) };
  }

  /** Posição interpolada de uma trilha no instante T (s). */
  private at(tr: Track, T: number) {
    const fk = clamp(T * FPS, 0, this.N - 1.001);
    const k = Math.floor(fk);
    const u = fk - k;
    const jump = Math.abs(tr.x[k + 1] - tr.x[k]) > 120; // teletransporte: sem interpolar
    return {
      x: jump ? tr.x[k] : tr.x[k] + (tr.x[k + 1] - tr.x[k]) * u,
      y: jump ? tr.y[k] : tr.y[k] + (tr.y[k + 1] - tr.y[k]) * u,
      f: tr.f[k] as 1 | -1,
      anim: tr.anim[k],
      at: tr.at[k] + u,
      vx: tr.vx[k],
      alpha: tr.alpha[k] + (tr.alpha[k + 1] - tr.alpha[k]) * u,
    };
  }

  // ================================================================== estado

  hud(T = this.offset): BossHud {
    let dmg = 0;
    for (const a of this.pAtks) if (a.hitAt <= T) dmg += a.dmg;
    const ph = this.r.players.map((p) => ({ hp: p.maxHp, max: p.maxHp, ko: false }));
    for (const b of this.bAtks) {
      if (b.hitAt > T) continue;
      b.targets.forEach((i, k) => (ph[i].hp = Math.max(0, ph[i].hp - b.dmg[k])));
    }
    this.kos.forEach((t, i) => t <= T && (ph[i].ko = true));
    return {
      t: T, duration: this.r.duration, bossHp: Math.max(0, this.r.bossHp - dmg), bossMax: this.r.bossHp, players: ph,
      ended: T >= this.endAt, won: this.r.won,
    };
  }

  private bossState(T: number): { st: DrawState; atk: BAtk | null; j: number; alpha: number; dy: number } {
    const r = this.r;
    const hud = this.hud(T);
    const rage = 1 - hud.bossHp / hud.bossMax;
    let hurt = 0;
    for (const a of this.pAtks) {
      const d = T - a.hitAt;
      // clarão curto e parcial (antes o boss ficava todo branco quase o tempo todo)
      if (d >= 0 && d < 0.16) hurt = Math.max(hurt, (a.crit ? 0.6 : 0.4) * (1 - d / 0.16));
    }
    const loc = this.loco(T);
    const base: DrawState = { t: T, anim: 'idle', p: 0, pose: 'roar', hurt, rage, ...loc };
    if (T < r.entrance) {
      const k = sm(0.4, 2.3, T);
      const fly = FLYERS.has(r.boss.arch) || this.duel;
      const dy = fly ? -(1 - k) * 520 : (1 - k) * 420;
      if (T > 2.4 && T < 4.0) return { st: { ...base, anim: 'attack', pose: 'roar', p: (T - 2.4) / 1.6, hurt: 0 }, atk: null, j: -1, alpha: 1, dy };
      return { st: { ...base, hurt: 0 }, atk: null, j: -1, alpha: clamp(T / 0.6), dy };
    }
    if (this.dieAt !== null && T >= this.dieAt) {
      const p = clamp((T - this.dieAt) / 2.6);
      return { st: { ...base, anim: 'death', p, hurt: p < 0.6 ? (Math.sin(p * 40) > 0 ? 0.8 : 0) : 0 }, atk: null, j: -1, alpha: 1 - sm(0.55, 1, p), dy: sm(0.4, 1, p) * 40 };
    }
    for (let j = 0; j < this.bAtks.length; j++) {
      const b = this.bAtks[j];
      if (T >= b.t && T < b.t + b.dur) {
        const atk = r.boss.attacks[b.a];
        return { st: { ...base, anim: 'attack', pose: atk.pose, p: (T - b.t) / b.dur }, atk: b, j, alpha: 1, dy: 0 };
      }
    }
    return { st: base, atk: null, j: -1, alpha: 1, dy: 0 };
  }

  // ================================================================== desenho

  /**
   * Câmera: enquadra a ação (jogadores vivos + boss) e é suavizada com média
   * exponencial para frente E para trás (sem atraso, sem tranco), pré-calculada.
   */
  private cam = { x: new Float32Array(0), w: new Float32Array(0), top: new Float32Array(0), bx: new Float32Array(0) };
  private computeCamera() {
    const N = this.N;
    const rx = new Float32Array(N);
    const rw = new Float32Array(N);
    const rt = new Float32Array(N);
    const n = this.r.players.length;
    const half = this.duel ? 60 : 200 * this.bk;
    const tall = this.duel ? 160 : 340 * this.bk;
    for (let k = 0; k < N; k++) {
      const s = k / FPS;
      let a = Infinity;
      let b = -Infinity;
      let top = GROUND - 170;
      for (let i = 0; i < n; i++) {
        const ko = this.kos.get(i);
        if (ko !== undefined && s > ko + 1.5) continue; // caído há tempo: sai do enquadramento
        const x = this.pt[i].x[k];
        a = Math.min(a, x - 70);
        b = Math.max(b, x + 70);
        top = Math.min(top, this.pt[i].y[k] - 150);
      }
      const bx = this.bt.x[k];
      const by = this.bt.y[k];
      if (this.bt.alpha[k] > 0.2 || !this.duel) {
        a = Math.min(a, bx - half);
        b = Math.max(b, bx + half * 0.8);
        top = Math.min(top, by - tall);
      }
      if (!isFinite(a)) {
        a = bx - 300;
        b = bx + 200;
      }
      rx[k] = (a + b) / 2;
      rw[k] = b - a;
      rt[k] = Math.max(top, GROUND - 620);
    }
    const smooth = (src: Float32Array, tau: number) => {
      const out = new Float32Array(src);
      const al = 1 - Math.exp(-DT / tau);
      for (let k = 1; k < N; k++) out[k] = out[k - 1] + (out[k] - out[k - 1]) * al;
      for (let k = N - 2; k >= 0; k--) out[k] = out[k + 1] + (out[k] - out[k + 1]) * al;
      return out;
    };
    this.cam = { x: smooth(rx, 0.35), w: smooth(rw, 0.6), top: smooth(rt, 0.5), bx: smooth(this.bt.x, 0.45) };
  }

  private camera(T: number, cw: number, ch: number) {
    const fk = clamp(T * FPS, 0, this.N - 1.001);
    const k = Math.floor(fk);
    const u = fk - k;
    const L = (a: Float32Array) => a[k] + (a[k + 1] - a[k]) * u;
    const cx0 = L(this.cam.x);
    const w0 = L(this.cam.w);
    const top = L(this.cam.top);
    const port = this.portrait;
    const size = this.r.boss.size;
    // celular em pé: abre mais (antes cortava os jogadores e ficava "colado" no boss)
    const minW = port ? (this.duel ? 560 : 640) : this.duel ? 720 : 820;
    const maxW = port ? (this.duel ? 700 : 740 + 50 * size) : W + 120;
    let viewW = clamp(w0 + (port ? 60 : 140), minW, maxW);
    const gy = port ? 0.76 : 0.85; // onde fica o chão na tela
    let kk = cw / viewW;
    // garante que o alto da ação cabe (boss no céu, pulos)
    const need = GROUND - top + 30;
    if (need > (ch / kk) * gy) {
      kk = Math.max((ch * gy) / need, cw / (maxW * 1.25));
      viewW = cw / kk;
    }
    const viewH = ch / kk;
    const margin = 110;
    let cx = cx0;
    // se não couber todo mundo, o boss continua inteiro na tela e entram os jogadores mais perto
    // dele (transição contínua: só desloca quando precisa)
    if (!this.duel) cx = Math.max(cx0, L(this.cam.bx) + 200 * this.bk - viewW / 2);
    cx = viewW >= W + 2 * margin ? W / 2 : clamp(cx, viewW / 2 - margin, W - viewW / 2 + margin);
    return { k: kk, ox: -(cx - viewW / 2), oy: viewH * gy - GROUND };
  }

  render(T: number) {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const { k, ox, oy } = this.camera(T, cw, ch);
    const viewH = ch / k;

    this.sounds(T);
    const bs = this.bossState(T);
    // pisadas pesadas tremem a tela
    const size = this.r.boss.size;
    for (const st of this.steps) if (T - st.t >= 0 && T - st.t < 0.06 && size >= 1) this.shakeNow = Math.max(this.shakeNow, 0.1 * st.k * size);
    const shake = this.shakeNow;
    const dtR = this.lastT >= 0 && T > this.lastT ? Math.min(0.1, T - this.lastT) : 1 / 60;
    this.shakeNow *= Math.pow(0.85, dtR * 60);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.save();
    ctx.scale(k, k);
    // tremor contínuo (soma de senoides): treme sem "teleportar" a imagem a cada quadro
    const sx = shake ? (Math.sin(T * 71 + 0.4) * 0.6 + Math.sin(T * 113 + 2.1) * 0.4) * 11 * shake : 0;
    const sy = shake ? (Math.sin(T * 83 + 1.3) * 0.6 + Math.sin(T * 127 + 0.2) * 0.4) * 8 * shake : 0;
    ctx.translate(ox + sx, oy + sy);

    this.drawBackground(ctx, T, viewH, ox, oy);
    this.drawPlatforms(ctx, T);
    this.drawSteps(ctx, T);

    // ---- boss
    const B = this.at(this.bt, T);
    const bk = this.bk;
    const bx = B.x;
    const by = B.y + bs.dy;
    let A: Anchors = { mouth: { x: -120, y: -200 }, hand: { x: -100, y: -60 }, core: { x: 0, y: -150 }, top: -300, halfW: 150 };
    let duelFrame: DuelFrame | null = null;
    let mctx: DuelMoveCtx | null = null;
    if (this.duel) {
      if (bs.atk && bs.j >= 0) {
        mctx = this.moveCtx(bs.j, bs.st.p);
        duelFrame = MOVES[this.r.boss.attacks[bs.atk.a].move ?? 'm01'].frame(mctx);
      }
      A = { mouth: { x: -10, y: -70 }, hand: { x: -30, y: -50 }, core: { x: 0, y: -52 }, top: -110, halfW: 30 };
      // efeitos de trás do golpe
      if (duelFrame && mctx && bs.atk) {
        try {
          MOVES[this.r.boss.attacks[bs.atk.a].move ?? 'm01'].back?.(ctx, mctx, duelFrame);
        } catch {
          /* ignora */
        }
      }
      this.drawTeleports(ctx, T);
      this.drawDuelist(ctx, T, bs, duelFrame, B.x, by, B);
    } else {
      ctx.save();
      ctx.globalAlpha = bs.alpha;
      ctx.translate(bx, by);
      if (T < this.r.entrance && !FLYERS.has(this.r.boss.arch)) {
        ctx.beginPath();
        ctx.rect(-600, -900, 1200, 900);
        ctx.clip();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(0, GROUND - by + 4, 200 * bk, 22 * bk, 0, 0, TAU);
      ctx.fill();
      ctx.scale(bk, bk);
      try {
        A = bodyFor(this.r.boss.arch)(ctx, this.r.boss, bs.st);
      } catch {
        /* um desenho com problema nunca derruba a luta */
      }
      ctx.restore();
    }
    const bossX = duelFrame ? duelFrame.x : bx;
    const bossY = duelFrame ? duelFrame.y : by;
    const toWorld = (v: V): V => ({ x: bossX + v.x * (this.duel ? 1 : bk), y: bossY + v.y * (this.duel ? 1 : bk) });
    const core = toWorld(A.core);

    if (this.dieAt !== null && T >= this.dieAt) this.drawDeath(ctx, T - this.dieAt, core, A, this.duel ? 1 : bk);

    // ---- jogadores (de trás para frente)
    const hud = this.hud(T);
    for (let i = 0; i < this.r.players.length; i++) this.drawPlayer(ctx, i, T, hud, core);

    // ---- efeito do golpe do boss
    if (bs.atk && bs.j >= 0) {
      const atk = this.r.boss.attacks[bs.atk.a];
      try {
        let s = 0;
        if (this.duel && mctx && duelFrame) s = MOVES[atk.move ?? 'm01'].front(ctx, mctx, duelFrame);
        else {
          const targets = this.targetsAt[bs.j].map((p) => ({ x: p.x, y: p.y - 50 * this.ps }));
          s = FX[atk.fx](ctx, {
            atk, p: bs.st.p, t: T - bs.atk.t, from: toWorld(A.mouth), hand: toWorld(A.hand), core, targets, ground: GROUND, W,
            seed: Math.floor(bs.atk.t * 100), size: this.r.boss.size,
          });
        }
        this.shakeNow = Math.max(this.shakeNow, s);
      } catch {
        /* ignora */
      }
    }
    // entrada: rugido
    if (T > 2.4 && T < 4.2) {
      const p = (T - 2.4) / 1.8;
      try {
        const s = FX.roar(ctx, {
          atk: { id: 'enter', name: '', fx: 'roar', pose: 'roar', color: this.r.boss.pal.glow, color2: '#ffffff', aoe: true, dur: 1.8 },
          p: 0.3 + p * 0.6, t: p * 1.8, from: toWorld(A.mouth), hand: toWorld(A.hand), core, targets: [], ground: GROUND, W, seed: 3, size: this.r.boss.size,
        });
        this.shakeNow = Math.max(this.shakeNow, s * 0.8);
      } catch {
        /* ignora */
      }
    }

    this.drawNumbers(ctx, T, core);
    ctx.restore();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawOffscreen(ctx, T, hud, k, ox, oy, cw, ch);
    this.drawHud(ctx, T, hud, cw);
    this.drawBanner(ctx, T, cw, ch);
    this.lastT = T;
    if (!this.ended && T >= this.endAt) {
      this.ended = true;
      this.opts.onEnd?.(this.r.won);
    }
  }

  /** Setinha na borda para quem ficou fora do enquadramento (celular em pé). */
  private drawOffscreen(ctx: CanvasRenderingContext2D, T: number, hud: BossHud, k: number, ox: number, oy: number, cw: number, ch: number) {
    const dpr = this.dpr;
    for (let i = 0; i < this.r.players.length; i++) {
      if (hud.players[i].ko) continue;
      const v = this.at(this.pt[i], T);
      const sx = (v.x + ox) * k;
      if (sx > -4 && sx < cw + 4) continue;
      const left = sx <= 0;
      const sy = clamp((v.y - 50 * this.ps + oy) * k, 40 * dpr, ch - 40 * dpr);
      const x = left ? 10 * dpr : cw - 10 * dpr;
      const c = this.r.players[i].color;
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.arc(x + (left ? 9 : -9) * dpr, sy, 11 * dpr, 0, TAU);
      ctx.fill();
      ctx.fillStyle = c;
      ctx.beginPath();
      const d = left ? 1 : -1;
      ctx.moveTo(x + d * 3 * dpr, sy);
      ctx.lineTo(x + d * 13 * dpr, sy - 6 * dpr);
      ctx.lineTo(x + d * 13 * dpr, sy + 6 * dpr);
      ctx.closePath();
      ctx.fill();
      // vida
      const ph = hud.players[i];
      ctx.fillStyle = ph.hp / ph.max > 0.35 ? '#3ddc97' : '#ff4a4a';
      ctx.fillRect(x + (left ? 0 : -18) * dpr, sy + 13 * dpr, 18 * dpr * (ph.hp / ph.max), 3 * dpr);
      ctx.restore();
    }
  }

  private drawBackground(ctx: CanvasRenderingContext2D, T: number, viewH: number, ox: number, oy: number) {
    const bg = this.r.boss.bg;
    const L = -Math.abs(ox) - 600;
    const Wd = W + Math.abs(ox) * 2 + 1200;
    const top = -oy - 10;
    const g = ctx.createLinearGradient(0, top, 0, GROUND);
    g.addColorStop(0, bg.sky[0]);
    g.addColorStop(1, bg.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(L, top, Wd, viewH + 40);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgrad(ctx, BOSS_HOME, GROUND - 200, 420, bg.fog + '44', 'transparent');
    ctx.fillRect(BOSS_HOME - 450, GROUND - 650, 900, 700);
    ctx.restore();
    for (let layer = 0; layer < 2; layer++) {
      ctx.fillStyle = mixHex(bg.sky[1], '#000000', 0.35 + layer * 0.25);
      ctx.beginPath();
      ctx.moveTo(L, GROUND);
      for (let x = L; x <= L + Wd; x += 40) {
        const hgt = 60 + layer * 30 + h01(Math.floor((x + 3000) / 40), layer + 3) * (90 - layer * 30) + Math.sin(x * 0.01 + layer) * 20;
        ctx.lineTo(x, GROUND - 40 - hgt + layer * 60);
      }
      ctx.lineTo(L + Wd, GROUND);
      ctx.fill();
    }
    for (let i = 0; i < 3; i++) {
      const x = ((T * (12 + i * 6) + i * 333) % (W + 600)) - 300;
      ctx.fillStyle = rgrad(ctx, x, GROUND - 30 - i * 25, 260, bg.fog + '22', 'transparent');
      ctx.fillRect(x - 260, GROUND - 300, 520, 400);
    }
    const gg = ctx.createLinearGradient(0, GROUND, 0, GROUND + 160);
    gg.addColorStop(0, bg.ground);
    gg.addColorStop(1, mixHex(bg.ground, '#000000', 0.7));
    ctx.fillStyle = gg;
    ctx.fillRect(L, GROUND, Wd, 900);
    ctx.fillStyle = mixHex(bg.ground, '#ffffff', 0.18);
    ctx.fillRect(L, GROUND, Wd, 3);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 36; i++) {
      const sp = 8 + h01(i, 1) * 22;
      const x = ((h01(i, 2) * (W + 200) + Math.sin(T * 0.7 + i) * 30) % (W + 200)) - 100;
      const y = GROUND - ((T * sp + h01(i, 3) * 800) % (GROUND + oy + 100));
      ctx.globalAlpha = 0.25 + 0.5 * h01(i, 4);
      ctx.fillStyle = bg.particle;
      ctx.beginPath();
      ctx.arc(x, y, 1 + h01(i, 5) * 2.2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Plataformas de pedra flutuantes (como nos mapas do PvP). */
  private drawPlatforms(ctx: CanvasRenderingContext2D, T: number) {
    const bg = this.r.boss.bg;
    for (const [n, p] of PLATS.entries()) {
      const w = p.x1 - p.x0;
      ctx.save();
      // brilho embaixo
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgrad(ctx, (p.x0 + p.x1) / 2, p.y + 18, w * 0.6, bg.fog + '33', 'transparent');
      ctx.fillRect(p.x0 - 40, p.y - 20, w + 80, 90);
      ctx.restore();
      const top = mixHex(bg.ground, '#ffffff', 0.22);
      const body = mixHex(bg.ground, '#000000', 0.25);
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(p.x0, p.y);
      ctx.lineTo(p.x1, p.y);
      ctx.lineTo(p.x1 - 18, p.y + 22);
      for (let i = 6; i >= 0; i--) {
        const x = p.x0 + 18 + ((w - 36) * i) / 6;
        ctx.lineTo(x, p.y + 26 + h01(i + n * 10, 4) * 26);
      }
      ctx.lineTo(p.x0 + 18, p.y + 22);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = top;
      ctx.fillRect(p.x0, p.y - 3, w, 6);
      // runas piscando
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(T * 2 + n);
      ctx.fillStyle = bg.particle;
      for (let i = 1; i < 4; i++) ctx.fillRect(p.x0 + (w * i) / 4 - 2, p.y + 8, 4, 4);
      ctx.globalAlpha = 1;
    }
  }

  private playerPose(i: number, T: number, v: ReturnType<BossBattle['at']>): { pose: Pose; rot: number; alpha: number; atk: { a: PAtk; motion: Motion; timing: AttackTiming; local: number } | null } {
    const shape = this.shapes[i];
    const w = this.weapons[i];
    if (v.anim === ANIM.attack1 || v.anim === ANIM.attack2) {
      const a = this.pAtks.find((e) => e.p === i && T >= e.t && T < e.t + e.dur);
      if (a && w) {
        const def = a.slot === 2 ? w.a2 : w.a1;
        const motion = motionOf(w, def);
        const melee = this.r.players[i].style === 'melee';
        const start = melee ? a.t + 0.3 * a.dur : a.t;
        const timing: AttackTiming = melee
          ? { start: start * FPS, windup: 0.25 * a.dur * FPS, active: 0.1 * a.dur * FPS, recovery: 0.15 * a.dur * FPS }
          : { start: start * FPS, windup: 0.5 * a.dur * FPS, active: 0.1 * a.dur * FPS, recovery: 0.35 * a.dur * FPS };
        const local = (T - start) * FPS;
        return { pose: attackPose(shape, motion, def.hits, timing, local, T), rot: 0, alpha: 1, atk: { a, motion, timing, local } };
      }
    }
    const m = movePose(shape, v.anim, v.at, T, v.vx);
    return { ...m, atk: null };
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, i: number, T: number, hud: BossHud, core: V) {
    const p = this.r.players[i];
    const v = this.at(this.pt[i], T);
    const shape = this.shapes[i];
    const w = this.weapons[i];
    const { pose, rot, alpha, atk } = this.playerPose(i, T, v);
    const s = this.ps;
    const eq = p.equipment;

    // sombra no chão / plataforma
    const plat = PLATS.find((pl) => v.x >= pl.x0 && v.x <= pl.x1 && v.y <= pl.y + 1);
    const gy = plat ? plat.y : GROUND;
    const d = clamp((gy - v.y) / 260);
    ctx.fillStyle = `rgba(0,0,0,${0.35 * (1 - d)})`;
    ctx.beginPath();
    ctx.ellipse(v.x, gy + 2, 24 * s * (1 - d * 0.5), 5 * s * (1 - d * 0.5), 0, 0, TAU);
    ctx.fill();

    // imagens residuais na corrida rápida
    if (v.anim === ANIM.dash) {
      for (let g = 3; g >= 1; g--) {
        const gv = this.at(this.pt[i], T - g * 0.04);
        ctx.save();
        ctx.globalAlpha = 0.13 * (4 - g);
        ctx.translate(gv.x, gv.y);
        drawAvatar(ctx, { look: p.look, equipment: eq, pose, facing: gv.f, time: T, scale: s });
        ctx.restore();
      }
    }
    // rastro da arma
    if (atk && w && ['swing', 'slam', 'combo', 'spin', 'thrust', 'throw', 'leap', 'stab'].includes(atk.motion)) {
      try {
        drawSwingTrail(ctx, {
          look: p.look, weapon: w, shape, motion: atk.motion, hits: (atk.a.slot === 2 ? w.a2 : w.a1).hits, timing: atk.timing, local: atk.local,
          origin: (lt) => {
            const g = this.at(this.pt[i], (atk.timing.start + lt) / FPS);
            return { x: g.x, y: g.y, facing: g.f };
          },
          color: p.color,
        });
      } catch {
        /* ignora */
      }
    }
    // projétil / magia
    if (atk && p.style !== 'melee') this.drawShot(ctx, i, atk.a, T, core);
    if (atk && p.style === 'melee') {
      const kk = sm(0.5, 0.58, (T - atk.a.t) / atk.a.dur) * (1 - sm(0.62, 0.76, (T - atk.a.t) / atk.a.dur));
      if (kk > 0.01) crescent(ctx, core.x - 30, core.y + 8, 64 + (atk.a.slot === 2 ? 26 : 0), 14, -0.6, '#ffffff', p.color, kk, 2.2);
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(v.x, v.y);
    if (rot) {
      ctx.translate(0, -44 * s);
      ctx.rotate(rot);
      ctx.translate(0, 44 * s);
    }
    drawAvatar(ctx, { look: p.look, equipment: eq, pose, facing: v.f, time: T, scale: s });
    ctx.restore();

    // clarão vermelho ao apanhar
    for (const b of this.bAtks) {
      const dd = T - b.hitAt;
      if (dd >= 0 && dd < 0.4 && b.targets.includes(i)) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,60,60,${(1 - dd / 0.4) * 0.4})`;
        ctx.beginPath();
        ctx.ellipse(v.x, v.y - 45 * s, 28 * s, 52 * s, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }

    // barra de vida + nome (acompanham o jogador)
    const ph = hud.players[i];
    if (ph.ko && T - (this.kos.get(i) ?? 0) > 1.5) return;
    const bw = 50;
    const by = v.y - 104 * s;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(v.x - bw / 2 - 1, by - 1, bw + 2, 7);
    ctx.fillStyle = ph.ko ? '#555' : ph.hp / ph.max > 0.35 ? '#3ddc97' : '#ff4a4a';
    ctx.fillRect(v.x - bw / 2, by, (bw * ph.hp) / ph.max, 5);
    if (this.r.players.length <= 5) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `600 ${this.portrait ? 11 : 13}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      const max = this.portrait ? 9 : 12;
      ctx.fillText(p.username.length > max ? p.username.slice(0, max - 1) + '…' : p.username, v.x, by - 5);
    }
    void shape;
  }

  private drawShot(ctx: CanvasRenderingContext2D, i: number, a: PAtk, T: number, core: V) {
    const p = this.r.players[i];
    const q0 = a.t + a.dur * 0.32;
    const kk = clamp((T - q0) / (a.hitAt - q0));
    if (kk <= 0 || kk >= 1) return;
    const src = this.at(this.pt[i], q0);
    const from = { x: src.x + 20, y: src.y - 60 * this.ps };
    const x = from.x + (core.x - from.x) * kk;
    const y = from.y + (core.y - from.y) * kk - Math.sin(kk * Math.PI) * (p.style === 'ranged' ? 50 : 14);
    ctx.save();
    if (p.style === 'ranged') {
      const nx = from.x + (core.x - from.x) * Math.min(1, kk + 0.02);
      const ny = from.y + (core.y - from.y) * Math.min(1, kk + 0.02) - Math.sin(Math.min(1, kk + 0.02) * Math.PI) * 50;
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(ny - y, nx - x));
      ctx.strokeStyle = '#e8e0c8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-28, 0);
      ctx.lineTo(10, 0);
      ctx.stroke();
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(15, 0);
      ctx.lineTo(4, -5);
      ctx.lineTo(4, 5);
      ctx.fill();
    } else {
      ctx.globalCompositeOperation = 'lighter';
      orb(ctx, x, y, a.slot === 2 ? 20 : 13, p.color);
      for (let g = 1; g < 5; g++) {
        const k2 = Math.max(0, kk - g * 0.05);
        ctx.globalAlpha = 0.5 - g * 0.1;
        orb(ctx, from.x + (core.x - from.x) * k2, from.y + (core.y - from.y) * k2, 9 - g, p.color);
      }
    }
    ctx.restore();
    // faíscas no impacto
    const imp = clamp((T - a.hitAt) / 0.25);
    if (imp > 0 && imp < 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      sparks(ctx, core.x - 20, core.y, imp, 1, Math.floor(a.t * 10), p.color, a.crit ? 22 : 12, a.crit ? 140 : 90);
      ctx.restore();
    }
  }

  // ------------------------------------------------------------------ duelista

  private drawDuelist(ctx: CanvasRenderingContext2D, T: number, bs: ReturnType<BossBattle['bossState']>, fr: DuelFrame | null, x: number, y: number, B: ReturnType<BossBattle['at']>) {
    const av = this.r.boss.avatar;
    if (!av) return;
    const glowC = this.r.boss.pal.glow;
    const shape = weaponShape(av.equipment.weapon ? WEAPONS_BY_ID[av.equipment.weapon] : undefined);
    let pose: Pose;
    let px = x;
    let py = y;
    let facing: 1 | -1 = B.f;
    let alpha = bs.alpha * B.alpha;
    let rot = 0;
    let ghosts = 0;
    let aura = 0.4 + bs.st.rage * 0.4;
    if (fr) {
      pose = fr.pose;
      px = fr.x;
      py = fr.y;
      facing = fr.facing;
      alpha = fr.alpha;
      rot = fr.rot ?? 0;
      ghosts = fr.ghosts ?? 0;
      aura = Math.max(aura, fr.aura ?? 0);
    } else if (bs.st.anim === 'death') {
      pose = P.hurt(1);
      rot = -sm(0, 0.5, bs.st.p) * 1.4;
    } else if (T < this.r.entrance) {
      pose = T > 2.4 ? P.cast(0.2) : idlePose(shape, T);
      aura = T > 2.4 ? 1 : 0.5;
    } else {
      pose = movePose(shape, B.anim, B.at, T, B.vx).pose;
    }
    const s = D_SCALE;
    // aura
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = rgrad(ctx, px, py - 55 * s, 90 * s * (0.8 + aura * 0.5), glowC + Math.round(clamp(aura) * 110).toString(16).padStart(2, '0'), 'transparent');
    ctx.beginPath();
    ctx.arc(px, py - 55 * s, 90 * s * (0.8 + aura * 0.5), 0, TAU);
    ctx.fill();
    for (let i = 0; i < 14; i++) {
      const ph = (T * (0.5 + h01(i, 2) * 0.6) + h01(i, 3)) % 1;
      ctx.globalAlpha = alpha * Math.sin(ph * Math.PI) * (0.4 + aura * 0.6);
      ctx.fillStyle = i % 3 ? glowC : this.r.boss.pal.accent;
      ctx.beginPath();
      ctx.arc(px + (h01(i, 4) - 0.5) * 60 * s, py - ph * 130 * s, Math.max(0.5, 1.5 + h01(i, 5) * 2), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    // imagens residuais
    if (fr && ghosts > 0 && bs.atk && bs.j >= 0) {
      const mv = MOVES[this.r.boss.attacks[bs.atk.a].move ?? 'm01'];
      for (let g = ghosts; g >= 1; g--) {
        const pp = Math.max(0, bs.st.p - g * 0.018);
        const gf = mv.frame(this.moveCtx(bs.j, pp));
        ctx.save();
        ctx.globalAlpha = 0.12 * (ghosts + 1 - g) * gf.alpha;
        ctx.translate(gf.x, gf.y);
        if (gf.rot) {
          ctx.translate(0, -44 * s);
          ctx.rotate(gf.rot);
          ctx.translate(0, 44 * s);
        }
        drawAvatar(ctx, { look: av.look, equipment: av.equipment, pose: gf.pose, facing: gf.facing, time: T, scale: s });
        ctx.restore();
      }
    }
    if (alpha <= 0.01) return;
    // sombra
    const plat = PLATS.find((pl) => px >= pl.x0 && px <= pl.x1 && py <= pl.y + 1);
    const gy = plat ? plat.y : GROUND;
    ctx.fillStyle = `rgba(0,0,0,${0.35 * alpha})`;
    ctx.beginPath();
    ctx.ellipse(px, gy + 2, 26 * s, 6 * s, 0, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(px, py);
    if (rot) {
      ctx.translate(0, -44 * s);
      ctx.rotate(rot);
      ctx.translate(0, 44 * s);
    }
    drawAvatar(ctx, { look: av.look, equipment: av.equipment, pose, facing, time: T, scale: s });
    ctx.restore();
    // flash de dano
    if (bs.st.hurt > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,255,255,${bs.st.hurt * 0.35})`;
      ctx.beginPath();
      ctx.ellipse(px, py - 50 * s, 26 * s, 50 * s, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  /** Poeira das pisadas do boss. */
  private drawSteps(ctx: CanvasRenderingContext2D, T: number) {
    const bk = this.bk;
    const dust = mixHex(this.r.boss.bg.ground, '#c8b8a0', 0.5);
    for (let i = 0; i < this.steps.length; i++) {
      const st = this.steps[i];
      const d = T - st.t;
      if (d < 0 || d > 0.7) continue;
      const q = d / 0.7;
      const side = i % 2 ? 1 : -1;
      const x = st.x + side * 55 * bk;
      ctx.save();
      for (let j = 0; j < 6; j++) {
        const dir = (j % 2 ? 1 : -1) * (0.4 + h01(i, j) * 0.8);
        ctx.globalAlpha = (1 - q) * 0.35 * (0.4 + st.k * 0.6);
        ctx.fillStyle = dust;
        ctx.beginPath();
        ctx.arc(x + dir * q * 70 * bk, GROUND - 6 * bk - q * (14 + h01(i, j + 9) * 18) * bk, (8 + q * 22) * bk * (0.6 + h01(i, j + 3) * 0.6), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /** Teletransportes fora dos golpes: tinta/luz onde sumiu e onde apareceu. */
  private drawTeleports(ctx: CanvasRenderingContext2D, T: number) {
    const c1 = this.r.boss.pal.glow;
    const c2 = this.r.boss.pal.accent;
    for (const tp of this.tps) {
      const d = T - tp.t;
      if (d < -0.15 || d > 0.6) continue;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const [pt, delay] of [[tp.from, 0], [tp.to, 0.05]] as const) {
        const k = clamp((d - delay + 0.15) / 0.6);
        if (k <= 0 || k >= 1) continue;
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = c1;
        ctx.lineWidth = 3 * (1 - k) + 1;
        ctx.beginPath();
        ctx.ellipse(pt.x, pt.y - 55, 20 + k * 60, 70 + k * 30, 0, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = rgrad(ctx, pt.x, pt.y - 55, 80, c2 + '88', 'transparent');
        ctx.fillRect(pt.x - 80, pt.y - 140, 160, 170);
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * TAU + h01(i, 9);
          ctx.fillStyle = i % 2 ? c1 : '#ffffff';
          ctx.beginPath();
          ctx.arc(pt.x + Math.cos(a) * k * 70, pt.y - 55 + Math.sin(a) * k * 90, Math.max(0.5, 3 * (1 - k)), 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  private drawDeath(ctx: CanvasRenderingContext2D, d: number, core: V, A: Anchors, bk: number) {
    const glowC = this.r.boss.pal.glow;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) {
      const at = i * 0.28;
      const k = (d - at) / 0.5;
      if (k <= 0 || k >= 1) continue;
      const x = core.x + (h01(i, 7) - 0.5) * A.halfW * bk * 1.6;
      const y = core.y + (h01(i, 8) - 0.5) * 160 * bk;
      ctx.fillStyle = rgrad(ctx, x, y, 30 + k * 90, '#ffffff', 'transparent');
      ctx.globalAlpha = 1 - k;
      ctx.beginPath();
      ctx.arc(x, y, 30 + k * 90, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const fk = clamp((d - 1.6) / 1.0);
    if (fk > 0 && fk < 1) {
      ctx.fillStyle = rgrad(ctx, core.x, core.y, 80 + fk * 900, `rgba(255,255,255,${1 - fk})`, 'transparent');
      ctx.fillRect(core.x - 1000, core.y - 1000, 2000, 2000);
      godRays(ctx, core.x, core.y, 14, 700, 30, glowC, (1 - fk) * 0.8, d * 0.5);
      if (fk < 0.2) this.shakeNow = Math.max(this.shakeNow, 1);
    }
    for (let i = 0; i < 70; i++) {
      const st = h01(i, 9) * 1.6;
      const k = (d - st) / 1.6;
      if (k <= 0 || k >= 1) continue;
      const x = core.x + (h01(i, 10) - 0.5) * A.halfW * bk * 2 + Math.sin(k * 6 + i) * 10;
      const y = core.y + (h01(i, 11) - 0.3) * 200 * bk - k * 260;
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.fillStyle = i % 3 ? glowC : '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.5, 2 + h01(i, 12) * 4 * (1 - k)), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawNumbers(ctx: CanvasRenderingContext2D, T: number, core: V) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    for (const a of this.pAtks) {
      const d = T - a.hitAt;
      if (d < 0 || d > 1.1) continue;
      const k = d / 1.1;
      const x = core.x - 30 + (h01(a.t * 10, 1) - 0.5) * 120;
      const y = core.y - 40 - k * 70;
      const size = a.crit ? 34 : 24;
      ctx.globalAlpha = 1 - sm(0.6, 1, k);
      ctx.font = `900 ${Math.round(size * (1 + (1 - sm(0, 0.15, k)) * 0.6))}px system-ui, sans-serif`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      const txt = a.crit ? `${a.dmg}!` : String(a.dmg);
      ctx.strokeText(txt, x, y);
      ctx.fillStyle = a.crit ? '#ffd23a' : '#ffffff';
      ctx.fillText(txt, x, y);
    }
    for (const b of this.bAtks) {
      const d = T - b.hitAt;
      if (d < 0 || d > 1.1) continue;
      const k = d / 1.1;
      b.targets.forEach((i, j) => {
        const v = this.at(this.pt[i], T);
        const x = v.x;
        const y = v.y - 125 * this.ps - k * 50;
        ctx.globalAlpha = 1 - sm(0.6, 1, k);
        ctx.font = '900 22px system-ui, sans-serif';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(`-${b.dmg[j]}`, x, y);
        ctx.fillStyle = '#ff5a5a';
        ctx.fillText(`-${b.dmg[j]}`, x, y);
      });
    }
    ctx.restore();
  }

  private drawHud(ctx: CanvasRenderingContext2D, T: number, hud: BossHud, cw: number) {
    const s = this.dpr;
    const show = sm(3.6, 4.4, T);
    if (show <= 0) return;
    const pad = 14 * s;
    const w = Math.min(cw - pad * 2, 620 * s);
    const x = (cw - w) / 2;
    const y = 14 * s;
    const frac = hud.bossHp / hud.bossMax;
    this.trail += (frac - this.trail) * 0.04;
    if (this.trail < frac) this.trail = frac;
    ctx.save();
    ctx.globalAlpha = show;
    ctx.font = `800 ${Math.round(15 * s)}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 6 * s;
    ctx.fillText(this.r.boss.name.toUpperCase(), x, y + 14 * s);
    ctx.font = `600 ${Math.round(11 * s)}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.textAlign = 'right';
    ctx.fillText(`${hud.bossHp.toLocaleString('pt-BR')} / ${hud.bossMax.toLocaleString('pt-BR')}`, x + w, y + 14 * s);
    ctx.shadowBlur = 0;
    const by = y + 22 * s;
    const bh = 12 * s;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x - 2 * s, by - 2 * s, w + 4 * s, bh + 4 * s);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(x, by, w * this.trail, bh);
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#b3121f');
    g.addColorStop(1, mixHex(this.r.boss.pal.glow, '#ff2a2a', 0.5));
    ctx.fillStyle = g;
    ctx.fillRect(x, by, w * frac, bh);
    // nome do golpe do boss
    const cur = this.bAtks.find((b) => T >= b.t && T < b.t + b.dur);
    if (cur) {
      const k = sm(0, 0.15, (T - cur.t) / cur.dur) * (1 - sm(0.8, 1, (T - cur.t) / cur.dur));
      ctx.globalAlpha = show * k;
      ctx.font = `800 ${Math.round(13 * s)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = this.r.boss.pal.accent;
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 6 * s;
      ctx.fillText(`« ${this.r.boss.attacks[cur.a].name} »`, cw / 2, by + bh + 20 * s);
    }
    ctx.restore();
  }

  private drawBanner(ctx: CanvasRenderingContext2D, T: number, cw: number, ch: number) {
    const s = this.dpr;
    const r = this.r;
    ctx.save();
    ctx.textAlign = 'center';
    const ek = sm(2.4, 2.7, T) * (1 - sm(3.9, 4.3, T));
    if (ek > 0) {
      const big = Math.min(64 * s, cw / Math.max(6, r.boss.name.length * 0.8));
      ctx.globalAlpha = ek;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, ch * 0.62, cw, big * 1.9);
      const zoom = 1 + (1 - sm(2.4, 2.65, T)) * 1.5;
      ctx.translate(cw / 2, ch * 0.62 + big * 1.05);
      ctx.scale(zoom, zoom);
      ctx.font = `900 ${Math.round(big)}px system-ui, sans-serif`;
      ctx.shadowColor = r.boss.pal.glow;
      ctx.shadowBlur = 24 * s;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(r.boss.name.toUpperCase(), 0, 0);
      ctx.shadowBlur = 0;
      ctx.font = `600 ${Math.round(big * 0.32)}px system-ui, sans-serif`;
      ctx.fillStyle = r.boss.pal.accent;
      ctx.fillText(r.boss.title, 0, big * 0.55);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    const resT = r.won ? (this.dieAt ?? this.endAt) + 2.4 : this.endAt - 2.2;
    const rk = sm(resT, resT + 0.35, T);
    if (rk > 0) {
      const txt = r.won ? 'VITÓRIA!' : 'DERROTA';
      const col = r.won ? '#ffd23a' : '#ff3a3a';
      ctx.globalAlpha = rk;
      ctx.fillStyle = r.won ? 'rgba(20,14,0,0.55)' : 'rgba(30,0,0,0.6)';
      ctx.fillRect(0, 0, cw, ch);
      if (r.won) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        godRays(ctx, cw / 2, ch * 0.42, 16, Math.max(cw, ch), 40 * s, '#ffcc33', 0.35 * rk, T * 0.3);
        ctx.restore();
      }
      const size = Math.min(88 * s, cw / 5.2);
      const z = 1 + (1 - sm(resT, resT + 0.3, T)) * 2;
      ctx.translate(cw / 2, ch * 0.45);
      ctx.scale(z, z);
      ctx.font = `900 ${Math.round(size)}px system-ui, sans-serif`;
      ctx.shadowColor = col;
      ctx.shadowBlur = 30 * s;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(txt, 0, 0);
      ctx.shadowBlur = 0;
      ctx.font = `600 ${Math.round(size * 0.24)}px system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(r.won ? `${r.boss.name} foi derrotado!` : `${r.boss.name} venceu desta vez…`, 0, size * 0.6);
    }
    ctx.restore();
  }

  private sounds(T: number) {
    if (this.opts.sound === false || this.lastT < 0 || T < this.lastT || T - this.lastT > 0.5) return;
    const crossed = (at: number) => this.lastT < at && at <= T;
    for (const a of this.pAtks) {
      const p = this.r.players[a.p];
      if (crossed(a.t + a.dur * 0.32)) {
        if (p.style === 'melee') sfxSwing(a.slot === 2, 0);
        else sfxShoot(p.style === 'ranged' ? 'arrow' : 'fireball', 'arcane');
      }
      if (crossed(a.hitAt)) sfxHit(a.crit, 'fire');
    }
    for (const b of this.bAtks) if (crossed(b.hitAt)) sfxExplosion(0.9, 'shadow');
    for (const tp of this.tps) if (crossed(tp.t)) sfxJump(true);
    this.kos.forEach((t) => crossed(t) && sfxKo());
    if (crossed(2.45)) sfxExplosion(1, 'shadow');
    if (this.dieAt !== null && (crossed(this.dieAt) || crossed(this.dieAt + 1.6))) sfxKo();
  }
}

export type { BossPlayerMeta };
