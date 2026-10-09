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
import { FLYERS, mobilityOf, type Mobility } from './mobility';
import type { DuelFrame, DuelMoveCtx } from './duelist/types';
import type { Anchors, DrawState, V } from './types';
import { TAU, clamp, crescent, godRays, h01, mixHex, orb, rgrad, sm, sparks } from './util';

/** Largura do mundo do DUELISTA (do tamanho de um jogador: arena compacta, como antes). */
export const W = 1000;
/** Bosses grandes: arena de verdade, larga, com a câmera acompanhando a ação. */
export const ARENA_W = 2800;
export const GROUND = 500;
const FPS = 30;
const DT = 1 / FPS;
const GRAV = 1750;
export interface Plat {
  x0: number;
  x1: number;
  y: number;
}
/** Plataformas do duelista (só do lado dos jogadores). */
export const PLATS: Plat[] = [
  { x0: 70, x1: 250, y: 392 },
  { x0: 300, x1: 470, y: 318 },
];
/** Plataformas da arena grande: dos dois lados (o boss fica no chão do meio). */
const ARENA_PLATS: Plat[] = [
  { x0: 110, x1: 290, y: 392 },
  { x0: 380, x1: 550, y: 312 },
  { x0: 800, x1: 960, y: 392 },
  { x0: 1840, x1: 2000, y: 392 },
  { x0: 2250, x1: 2420, y: 312 },
  { x0: 2510, x1: 2690, y: 392 },
];
const DUEL_HOME = 770;
const P_SCALE_LAND = 1.2;
/** Em pé a câmera abre mais: os jogadores são desenhados um pouco maiores para continuarem legíveis. */
const P_SCALE_PORT = 1.42;
const D_SCALE = 1.25;
/** Comprimento de um ciclo de passada (mundo, antes da escala do boss). */
const STRIDE = 150;
/** Avanço (negativo = para a frente) que cada pose de golpe faz o corpo dar. */
const LUNGE: Partial<Record<string, number>> = { slam: -70, swipe: -90, charge: -190, roar: 12, breath: 20, shoot: 25, cast: 10 };
const MELEE_POSES = new Set(['slam', 'swipe', 'charge']);
/** Duração do giro do boss (s). */
const TURN = 0.3;
const FALLBACK_AV = {
  look: {
    skin: '#8a5a3c',
    face: 0,
    hair: 1,
    hairColor: '#222222',
    beard: 0,
    body: 1,
    height: 1,
    gender: 0,
    eyes: '#333333',
    marks: 0,
    accessory: 0,
    top: '#222222',
    shorts: '#222222',
  },
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
  /** Boss: passada acumulada, intensidade do andar, velocidade vertical e "no ar". */
  g: Float32Array;
  mv: Float32Array;
  vy: Float32Array;
  air: Float32Array;
}
const mkTrack = (n: number): Track => ({
  x: new Float32Array(n),
  y: new Float32Array(n),
  f: new Int8Array(n),
  anim: new Uint8Array(n),
  at: new Float32Array(n),
  vx: new Float32Array(n),
  alpha: new Float32Array(n).fill(1),
  g: new Float32Array(n),
  mv: new Float32Array(n),
  vy: new Float32Array(n),
  air: new Float32Array(n),
});

interface Tp {
  t: number;
  from: V;
  to: V;
  /** Tamanho do clarão (1 = duelista). */
  k?: number;
}

/** Salto/voo do boss grande: arco de x0 até x1. */
interface Leap {
  t0: number;
  dur: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  h: number;
  /** Vira de lado no meio do salto (passou por cima do time). */
  flip: boolean;
}

const easeIO = (u: number) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);

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
  /** Para que lado o boss olhava quando cada golpe começou (-1 esquerda, 1 direita). */
  private atkFace: (1 | -1)[] = [];
  private tps: Tp[] = [];
  /** Pisadas do boss (poeira e tremor). */
  private steps: { t: number; x: number; k: number; land?: boolean }[] = [];
  /** Giros do boss (para a animação de virar). */
  private turns: { t: number; to: 1 | -1 }[] = [];
  private duel: boolean;
  private bk: number;
  /** Largura do mundo e plataformas desta luta. */
  private AW: number;
  private plats: Plat[];
  private mob: Mobility;
  private hover: boolean;
  /** Chega descendo do céu (voadores, alados e o duelista); os outros sobem do chão. */
  private get entersFromSky() {
    return this.duel || this.hover || this.mob.wings || FLYERS.has(this.r.boss.arch);
  }

  constructor(
    private canvas: HTMLCanvasElement,
    private r: BossReplay,
    private opts: BattleOpts = {},
  ) {
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
    this.AW = this.duel ? W : ARENA_W;
    this.plats = this.duel ? PLATS : ARENA_PLATS;
    this.mob = mobilityOf(r.boss);
    this.hover = !this.duel && this.mob.style === 'hover';
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

  /** Distância do centro do boss até onde fica quem bate nele corpo a corpo. */
  private get reach() {
    return this.duel ? 70 : 165 * this.bk;
  }

  private moveCtx(j: number, p: number): DuelMoveCtx {
    const b = this.bAtks[j];
    const atk = this.r.boss.attacks[b.a];
    return {
      p,
      t: p * b.dur,
      dur: b.dur,
      start: this.startsAt[j],
      targets: this.targetsAt[j],
      everyone: this.everyoneAt[j],
      ground: GROUND,
      W,
      seed: Math.floor(b.t * 100) + 7,
      color: atk.color,
      color2: atk.color2,
      me: this.r.boss.avatar ?? FALLBACK_AV,
      s: D_SCALE,
      glow: this.r.boss.pal.glow,
      accent: this.r.boss.pal.accent,
    };
  }

  private choreograph() {
    const r = this.r;
    const n = r.players.length;
    const AW = this.AW;
    const plats = this.plats;
    const mob = this.mob;
    const bk = this.bk;
    const rng = mulberry32((r.seed ^ 0x5bd1e995) >>> 0);
    const R = (a: number, b: number) => a + (b - a) * rng();
    // eventos por jogador
    const myAtks = r.players.map((_, i) => this.pAtks.filter((a) => a.p === i));
    type St = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      ground: boolean;
      f: 1 | -1;
      anim: number;
      since: number;
      goal: number;
      next: number;
      hitUntil: number;
      koed: boolean;
      recoil: number;
      dodged: number;
    };
    // o time começa à esquerda do boss; na arena grande ele entra mais para o meio
    const home = this.duel ? DUEL_HOME : AW * 0.6;
    const teamFront = this.duel ? 330 : home - this.reach - 60;
    const st: St[] = r.players.map((p, i) => {
      const x = this.duel
        ? p.style === 'melee'
          ? teamFront - i * 28
          : teamFront - 120 - i * 22
        : p.style === 'melee'
          ? teamFront - i * 70
          : teamFront - 320 - i * 80;
      return {
        x: Math.max(40, x),
        y: GROUND,
        vx: 0,
        vy: 0,
        ground: true,
        f: 1,
        anim: ANIM.idle,
        since: 0,
        goal: x,
        next: R(0.2, 1.2),
        hitUntil: -1,
        koed: false,
        recoil: -1,
        dodged: -1,
      };
    });
    // boss
    const hoverAlt = 70;
    const B = {
      x: home,
      y: this.hover ? GROUND - hoverAlt : GROUND,
      vx: 0,
      vy: 0,
      ground: true,
      f: -1 as 1 | -1,
      anim: ANIM.idle as number,
      since: 0,
      goal: home,
      next: 5,
      tp: 7,
      alpha: 1,
      gait: 0,
      move: 0,
      alt: hoverAlt,
      atkX: home,
      prep: -1,
      fin: -1,
      lastStep: 0,
      air: 0,
      leap: null as Leap | null,
      phase: null as { t0: number; x1: number; f: 1 | -1 } | null,
      want: -1 as 1 | -1,
      turnAt: 0,
      lastSwap: -9,
    };
    /** Lado do time em relação ao boss (-1 = time à esquerda). */
    let side: 1 | -1 = -1;
    /** Jogadores atravessando para o outro lado (flanco). */
    const crossing = new Array<boolean>(n).fill(false);
    let atkIdx = 0;
    let activeMove = -1;

    const setAnim = (o: { anim: number; since: number }, a: number, k: number) => {
      if (o.anim !== a) {
        o.anim = a;
        o.since = k;
      }
    };
    const physics = (o: { x: number; y: number; vx: number; vy: number; ground: boolean }, minX: number, maxX: number, usePlats = true) => {
      const prevY = o.y;
      if (!o.ground) o.vy += GRAV * DT;
      o.x += o.vx * DT;
      o.y += o.vy * DT;
      if (o.ground) {
        o.vx *= 0.86;
        // saiu da beirada da plataforma: cai
        if (o.y < GROUND - 1 && !plats.some((p) => o.x >= p.x0 && o.x <= p.x1 && Math.abs(o.y - p.y) < 2)) o.ground = false;
      } else if (o.vy >= 0) {
        if (usePlats) {
          for (const p of plats) {
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
      if (o.x < minX) ((o.x = minX), (o.vx = Math.max(0, o.vx)));
      if (o.x > maxX) ((o.x = maxX), (o.vx = Math.min(0, o.vx)));
    };
    /** Vivos no instante s. */
    const aliveP = (s: number) => st.filter((_, i) => !(this.kos.has(i) && this.kos.get(i)! <= s));
    /** Limites para o boss não esmagar o time contra a parede. */
    const room = this.duel ? 360 : 520;
    const bossClamp = (x: number, sd: 1 | -1) =>
      sd < 0 ? clamp(x, Math.max(200, room + this.reach), AW - 200) : clamp(x, 200, Math.min(AW - 200, AW - room - this.reach));
    /** Começa um salto/voo do boss. */
    const startLeap = (s: number, x1: number, h: number, flip: boolean) => {
      const dist = Math.abs(x1 - B.x);
      const dur = clamp(0.55 + dist / (mob.wings || this.hover ? 900 : 1100) + h / 900, 0.6, 1.35);
      const baseY = this.hover ? GROUND - B.alt : GROUND;
      B.leap = { t0: s, dur, x0: B.x, x1, y0: B.y, y1: baseY, h, flip };
      B.vx = 0;
    };
    /** Troca de lado com o time (cada boss do seu jeito). Devolve true se começou. */
    const trySwap = (s: number, budget: number) => {
      if (s - B.lastSwap < 3.5) return false;
      const team = aliveP(s);
      if (!team.length) return false;
      const xs = team.map((o) => o.x);
      // lado oposto: além do jogador mais distante, na direção do time
      const far = side < 0 ? Math.min(...xs) : Math.max(...xs);
      const land = far + side * (this.reach + R(150, 280));
      const okLand = land > 220 && land < AW - 220;
      if ((mob.swap === 'leap' || mob.swap === 'fly') && okLand && budget > 1.2) {
        const h = mob.swap === 'fly' ? Math.max(mob.leapH, 240) : Math.max(mob.leapH, 180) * 0.85;
        startLeap(s, land, h * (0.85 + rng() * 0.25), true);
        side = -side as 1 | -1;
        B.lastSwap = s;
        return true;
      }
      if (mob.swap === 'phase' && okLand && budget > 0.9) {
        B.phase = { t0: s, x1: land, f: -side as 1 | -1 };
        side = -side as 1 | -1;
        B.lastSwap = s;
        return true;
      }
      if (mob.swap === 'players' && budget > 1.05) {
        // o time flanqueia: corre por baixo/por trás do boss e ele vira em seguida
        const behind = B.x - side * (this.reach + 260);
        if (behind < 240 || behind > AW - 240) return false;
        side = -side as 1 | -1;
        for (let i = 0; i < n; i++) if (!st[i].koed) crossing[i] = true;
        B.lastSwap = s;
        return true;
      }
      // time encostado na parede (não dá para passar por cima): o boss recua para o meio e a luta vem atrás
      if (mob.swap !== 'players' && !okLand && budget > 1.0) {
        const back = clamp(B.x - side * R(300, 520), 260, AW - 260);
        if (Math.abs(back - B.x) > 160) {
          if (mob.leap > 0 || mob.swap === 'leap' || mob.swap === 'fly') startLeap(s, back, Math.max(80, mob.leapH * 0.5), false);
          else B.goal = back;
          B.next = s + 2.5;
          B.lastSwap = s - 1.5;
          return true;
        }
      }
      return false;
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
        this.atkFace[atkIdx] = this.duel ? -1 : B.f;
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
          if ((s > r.entrance && this.dieAt === null) || (this.dieAt !== null && s < this.dieAt)) {
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
        // ---------------- bosses grandes: andam, disparam, saltam, voam e VIRAM para onde o time está
        const alive = s > r.entrance && (this.dieAt === null || s < this.dieAt);
        const nextAtk = this.bAtks[atkIdx];
        const vmax = mob.speed;
        const px = B.x;
        const py = B.y;
        B.air = 0;
        if (B.leap) {
          // ---- salto / voo em arco
          const L = B.leap;
          const u = clamp((s - L.t0) / L.dur);
          B.x = L.x0 + (L.x1 - L.x0) * easeIO(u);
          B.y = L.y0 + (L.y1 - L.y0) * u - L.h * 4 * u * (1 - u);
          B.air = Math.sin(Math.PI * Math.min(1, u * 1.15));
          if (L.flip && u >= 0.5 && B.want === B.f) {
            // passou por cima do time: vira no ar
            B.want = side;
            B.turnAt = s;
          }
          if (u >= 1) {
            B.leap = null;
            B.x = L.x1;
            B.y = L.y1;
            B.atkX = B.x;
            B.goal = B.x;
            if (!this.hover) this.steps.push({ t: s, x: B.x, k: 1, land: true });
          }
          B.vx = (B.x - px) / DT;
          B.vy = (B.y - py) / DT;
        } else if (B.phase) {
          // ---- some e reaparece do outro lado do time
          const q = (s - B.phase.t0) / 0.7;
          B.alpha = q < 0.4 ? 1 - q / 0.4 : q < 0.6 ? 0 : clamp((q - 0.6) / 0.4);
          if (q >= 0.5 && B.x !== B.phase.x1) {
            this.tps.push({ t: s - 0.2, from: { x: B.x, y: B.y - 60 * bk }, to: { x: B.phase.x1, y: B.y - 60 * bk }, k: 2.2 * bk });
            B.x = B.phase.x1;
            B.f = B.phase.f;
            B.want = B.phase.f;
            this.turns.push({ t: s - TURN, to: B.f });
            B.atkX = B.goal = B.x;
          }
          if (q >= 1) {
            B.phase = null;
            B.alpha = 1;
          }
          B.vx = 0;
        } else {
          if (alive) {
            if (bAtkNow) {
              // durante o golpe: avanço/recuo do próprio golpe, na direção para onde olha
              const atk = r.boss.attacks[bAtkNow.a];
              const p = (s - bAtkNow.t) / bAtkNow.dur;
              const lunge = LUNGE[atk.pose] ?? 0;
              const off = -B.f * lunge * (sm(0.12, 0.45, p) - sm(0.62, 0.98, p));
              B.goal = clamp(B.atkX + off * bk, 160, AW - 160);
            } else {
              B.atkX = B.x;
              const budget = nextAtk ? nextAtk.t - s : 99;
              const prepT = mob.swap === 'players' ? 2.2 : 1.7;
              // reta final antes do golpe: posiciona de vez (ágil decide em cima da hora)
              const finalT = mob.style === 'skitter' ? 0.55 : mob.style === 'stomp' ? 1.3 : 0.9;
              if (nextAtk && budget < prepT && B.prep !== nextAtk.t) {
                // às vezes troca de lado com o time antes do golpe (ou quando o time está encurralado)
                B.prep = nextAtk.t;
                const team = aliveP(s);
                const xs = team.map((o) => o.x);
                const near = xs.length ? (side < 0 ? Math.max(...xs) : Math.min(...xs)) : B.x + side * 300;
                const space = side < 0 ? near - 40 : AW - 40 - near;
                const cramped = side < 0 ? B.x < room + this.reach + 80 : B.x > AW - room - this.reach - 80;
                if (rng() < mob.swapChance || cramped || space < 260) trySwap(s, budget);
              }
              if (B.leap || B.phase) {
                /* já está saltando/sumindo */
              } else if (nextAtk && budget < finalT) {
                if (B.fin !== nextAtk.t) {
                  // corpo a corpo chega perto (sem passar por cima de ninguém); à distância se afasta
                  B.fin = nextAtk.t;
                  const pose = r.boss.attacks[nextAtk.a].pose;
                  const xs = aliveP(s).map((o) => o.x);
                  const near = xs.length ? (side < 0 ? Math.max(...xs) : Math.min(...xs)) : B.x + side * 300;
                  if (MELEE_POSES.has(pose)) {
                    const tgt = near - side * (this.reach + R(10, 60));
                    const u = clamp((tgt - B.x) * side, -40, 300);
                    B.goal = bossClamp(B.x + side * u, side);
                    if (mob.leap > 0 && Math.abs(B.goal - B.x) > 150 && budget > 0.5 && rng() < mob.leap)
                      startLeap(s, B.goal, mob.leapH * 0.4, false);
                  } else if (pose !== 'roar') {
                    B.goal = bossClamp(B.x - side * R(40, 120), side);
                  } else B.goal = B.x;
                }
              } else if (s >= B.next) {
                // passeio entre os golpes: cada um do seu jeito (finta, arrancada, recuo, salto curto)
                const fwd = (a: number, b: number) => bossClamp(B.x + side * R(a, b), side);
                const canLeap = budget > finalT + 1.1;
                if (mob.style === 'skitter') {
                  B.goal = fwd(-200, 240);
                  B.next = s + R(0.35, 0.8);
                  if (canLeap && mob.leap > 0 && rng() < mob.leap * 0.4) startLeap(s, fwd(-240, 240), mob.leapH * R(0.3, 0.55), false);
                } else if (mob.style === 'hop') {
                  const x1 = fwd(-160, 200);
                  if (canLeap && Math.abs(x1 - B.x) > 30) startLeap(s, x1, mob.leapH * R(0.6, 1), false);
                  B.next = s + R(0.5, 1.0);
                } else if (mob.style === 'hover') {
                  B.goal = fwd(-170, 240);
                  B.alt = R(40, 170);
                  B.next = s + R(0.9, 1.8);
                } else {
                  B.goal = fwd(-110, 180);
                  B.next = s + (mob.style === 'stomp' ? R(1.6, 3.0) : R(0.9, 2.0));
                  if (canLeap && mob.leap > 0 && rng() < mob.leap * 0.3) startLeap(s, fwd(-150, 220), mob.leapH * R(0.4, 0.7), false);
                }
                // janela longa sem golpe: chance de cruzar a arena
                if (!B.leap && budget > 2.6 && rng() < mob.swapChance * 0.35) trySwap(s, budget);
              }
            }
          }
          if (!B.leap && !B.phase) {
            // velocidade com aceleração e frenagem (nada de deslizar em velocidade constante)
            const dx = B.goal - B.x;
            const vT = alive || bAtkNow ? Math.sign(dx) * Math.min(vmax * (bAtkNow ? 2.6 : 1), Math.abs(dx) * 2.2) : 0;
            B.vx += (vT - B.vx) * (1 - Math.exp(-DT * mob.accel));
            if (Math.abs(dx) < 2 && Math.abs(B.vx) < 8) B.vx *= 0.5;
            B.x += B.vx * DT;
            if (this.hover) {
              const tgtY = GROUND - B.alt - 14 * Math.sin(s * 1.3);
              const vyT = (tgtY - B.y) * 2.2;
              B.vy += (vyT - B.vy) * (1 - Math.exp(-DT * 3));
              B.y += B.vy * DT;
            } else {
              B.y = GROUND;
              B.vy = 0;
            }
          }
        }
        B.x = clamp(B.x, 120, AW - 120);
        // passada só avança com os pés no chão
        if (!B.leap) B.gait += Math.abs(B.x - px) / (STRIDE * bk);
        if (!this.hover && !B.leap) {
          // pisadas (poeira/tremor): a cada meio ciclo de passada
          const step = Math.floor(B.gait * 2);
          if (step !== B.lastStep) {
            B.lastStep = step;
            if (Math.abs(B.vx) > vmax * 0.25 && s > r.entrance && mob.heavy > 0)
              this.steps.push({ t: s, x: B.x, k: clamp(Math.abs(B.vx) / vmax) * mob.heavy });
          }
        }
        B.move = B.leap ? 0 : clamp(Math.abs(B.vx) / Math.max(60, vmax));
        // virar para o time (com tempo de reação; nunca no meio de um golpe)
        if (!bAtkNow && !B.phase && alive) {
          if (B.want !== side && !(B.leap && B.leap.flip)) {
            B.want = side;
            B.turnAt = s + mob.react;
          }
          if (B.f !== B.want && s >= B.turnAt) {
            B.f = B.want;
            this.turns.push({ t: s, to: B.f });
          }
        }
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
      bt.air[k] = B.air;

      // ------------------------------------------------ jogadores
      // duelista: durante um golpe ele pode ir para trás do time; a "frente" do time continua onde ele estava
      const sd: 1 | -1 = this.duel ? -1 : side;
      const refX = this.duel
        ? Math.max(470, activeMove >= 0 ? this.startsAt[activeMove].x : B.x)
        : B.leap
          ? B.leap.x1
          : B.phase
            ? B.phase.x1
            : sd < 0
              ? Math.max(B.x, B.atkX)
              : Math.min(B.x, B.atkX);
      const front = refX + sd * this.reach;
      /** Limites de x para o jogador i (do lado do time, sem entrar no boss). */
      const lim = (i: number): [number, number] =>
        crossing[i] ? [30, AW - 30] : sd < 0 ? [30, Math.max(60, front - 10)] : [Math.min(AW - 60, front + 10), AW - 30];
      // quem flanqueou já chegou do outro lado?
      for (let i = 0; i < n; i++) if (crossing[i] && ((st[i].x - B.x) * sd > this.reach + 12 || st[i].koed)) crossing[i] = false;
      // ninguém fica empilhado: quem está no chão e colado no outro se afasta devagar
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = st[i];
          const b = st[j];
          if (a.koed || b.koed || Math.abs(a.y - b.y) > 40) continue;
          const dx = b.x - a.x;
          // na arena grande cada um tem seu espaço (antes ficava todo mundo colado)
          const gap = this.duel ? 34 : 72;
          if (Math.abs(dx) >= gap) continue;
          const dir = dx === 0 ? (i % 2 ? 1 : -1) : Math.sign(dx);
          const push = (gap - Math.abs(dx)) * (this.duel ? 0.12 : 0.2);
          a.x -= dir * push;
          b.x += dir * push;
        }
      }
      for (let i = 0; i < n; i++) {
        const o = st[i];
        const meta = r.players[i];
        const koAt = this.kos.get(i);
        let [minX, maxX] = lim(i);
        // fora da área permitida (o boss chegou/pousou perto): sai andando rápido, nunca "teleporta"
        if (!o.koed && !this.duel) {
          if (o.x > maxX + 1) {
            o.x -= Math.min(o.x - maxX, 520 * DT);
            maxX = Math.max(maxX, o.x);
          } else if (o.x < minX - 1) {
            o.x += Math.min(minX - o.x, 520 * DT);
            minX = Math.min(minX, o.x);
          }
        }
        const toBoss: 1 | -1 = B.x < o.x ? -1 : 1;
        if (koAt !== undefined && s >= koAt) {
          if (!o.koed) {
            o.koed = true;
            crossing[i] = false;
            o.vx = -toBoss * 230;
            o.vy = -380;
            o.ground = false;
            setAnim(o, ANIM.tumble, k);
          }
          physics(o, 30, AW - 30, false);
          if (o.ground) setAnim(o, ANIM.dead, k);
        } else if (crossing[i]) {
          // flanco: dispara até o outro lado e salta por cima dos pés do boss
          const tx = B.x + sd * (this.reach + 60 + i * 30);
          o.vx += (Math.sign(tx - o.x) * 640 - o.vx) * 0.4;
          o.f = o.vx > 0 ? 1 : -1;
          if (o.ground && Math.abs(o.x - B.x) < this.reach + 70 && (o.x - B.x) * sd < 0) {
            o.vy = -640 - rng() * 120;
            o.ground = false;
          }
          physics(o, 30, AW - 30);
          setAnim(o, o.ground ? ANIM.dash : o.vy < 0 ? ANIM.jump : ANIM.fall, k);
        } else {
          const hit = this.bAtks.find((b) => b.hitAt > s - DT && b.hitAt <= s && b.targets.includes(i));
          if (hit) {
            o.vx = -toBoss * (230 + rng() * 120);
            o.vy = -320 - rng() * 120;
            o.ground = false;
            o.hitUntil = s + 0.6;
            setAnim(o, ANIM.hitstun, k);
          }
          const a = myAtks[i].find((e) => s >= e.t && s < e.t + e.dur);
          // na mira de um golpe do boss: não sai do lugar até levar (os efeitos miram onde ele estava)
          const pinned = this.bAtks.some((b) => s >= b.t && s < b.hitAt + 0.02 && b.targets.includes(i));
          if (s < o.hitUntil) {
            physics(o, minX, maxX);
            if (o.ground && s > o.hitUntil - 0.25) setAnim(o, ANIM.land, k);
          } else if (a && pinned) {
            // ataca do lugar mesmo
            o.vx *= 0.5;
            o.f = toBoss;
            physics(o, minX, maxX);
            setAnim(o, a.slot === 2 ? ANIM.attack2 : ANIM.attack1, k);
          } else if (a) {
            const q = (s - a.t) / a.dur;
            o.f = toBoss;
            if (meta.style === 'melee') {
              // cada um bate de um ponto (não empilham todos no mesmo lugar)
              const tx = this.duel ? (B.x < o.x ? B.x + 60 : B.x - 60) : front + sd * (20 + (i % 3) * 38);
              const lo = Math.min(minX, tx - 30);
              const hi = Math.max(maxX, tx + 30);
              if (q < 0.3) {
                const left = Math.max(0.05, (0.3 - q) * a.dur);
                o.vx = clamp((tx - o.x) / left, -900, 900);
                if (a.slot === 2 && o.ground && q < 0.06) {
                  o.vy = -560;
                  o.ground = false;
                }
                setAnim(o, o.ground ? ANIM.dash : ANIM.jump, k);
                physics(o, lo, hi);
              } else if (q < 0.8) {
                o.vx *= 0.4;
                setAnim(o, a.slot === 2 ? ANIM.attack2 : ANIM.attack1, k);
                physics(o, lo, hi);
              } else {
                if (o.recoil !== a.t) {
                  o.recoil = a.t;
                  o.vx = sd * (300 + rng() * 120);
                  o.vy = -430;
                  o.ground = false;
                }
                setAnim(o, ANIM.jump, k);
                physics(o, minX, maxX);
              }
            } else {
              if (a.slot === 2 && o.ground && q < 0.06) {
                o.vy = -480;
                o.ground = false;
              }
              o.vx *= 0.7;
              setAnim(o, a.slot === 2 ? ANIM.attack2 : ANIM.attack1, k);
              physics(o, minX, maxX);
            }
          } else if (this.bAtks.some((b) => s >= b.t && s < b.hitAt && b.targets.includes(i))) {
            // está na mira: fica (quase) parado e leva o golpe
            o.vx *= 0.8;
            o.f = toBoss;
            physics(o, minX, maxX);
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
              // zona do time: corpo a corpo perto da frente do boss; à distância mais para trás
              const zone: [number, number] = this.duel
                ? meta.style === 'melee'
                  ? [180, maxX - 20]
                  : [40, Math.min(maxX - 40, 420)]
                : meta.style === 'melee'
                  ? [40, 420]
                  : [300, 860];
              // escolhe um lugar que não esteja colado no de outro jogador
              for (let tries = 0; tries < 5; tries++) {
                if (this.duel) o.goal = R(zone[0], Math.max(zone[0] + 10, zone[1]));
                else o.goal = clamp(front + sd * R(zone[0], zone[1]), 40, AW - 40);
                if (!st.some((q, j) => j !== i && !q.koed && Math.abs(q.goal - o.goal) < (this.duel ? 46 : 110))) break;
              }
              o.next = s + R(0.6, 1.5);
              if (o.ground && rng() < 0.4) {
                const onPlat = plats.find((p) => o.goal >= p.x0 && o.goal <= p.x1);
                o.vy = onPlat ? (onPlat.y < 350 ? -720 : -640) : -520;
                o.ground = false;
              }
            }
            const tvx = Math.sign(o.goal - o.x) * Math.min(270, Math.abs(o.goal - o.x) * 4);
            o.vx += (tvx - o.vx) * 0.2;
            physics(o, minX, maxX);
            if (!o.ground) setAnim(o, o.vy < 0 ? ANIM.jump : ANIM.fall, k);
            else setAnim(o, Math.abs(o.vx) > 45 ? ANIM.run : ANIM.idle, k);
            o.f = Math.abs(o.vx) > 45 && o.ground ? (o.vx > 0 ? 1 : -1) : toBoss;
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
    this.turns.sort((a, b) => a.t - b.t);
    this.computeCamera();
  }

  /** Para onde o boss olha no instante T, com o giro animado: -1..1 (escala x do desenho = -isto). */
  private faceAt(T: number): number {
    if (this.duel) return -1;
    let last: { t: number; to: 1 | -1 } | null = null;
    for (const tr of this.turns) {
      if (tr.t > T) break;
      last = tr;
    }
    if (!last) return -1;
    const u = clamp((T - last.t) / TURN);
    // vira "de lado" passando pelo perfil fino (como um papel girando), sem nunca sumir de vez
    const v = -last.to * Math.cos(Math.PI * sm(0, 1, u));
    return Math.sign(v || last.to) * Math.max(0.12, Math.abs(v));
  }

  /** Locomoção do boss interpolada (para o desenho do corpo). */
  private loco(T: number) {
    const tr = this.bt;
    const fk = clamp(T * FPS, 0, this.N - 1.001);
    const k = Math.floor(fk);
    const u = fk - k;
    const L = (a: Float32Array) => a[k] + (a[k + 1] - a[k]) * u;
    // o desenho é sempre "olhando para a esquerda": a velocidade vai no referencial dele
    const f = Math.sign(this.faceAt(T)) || -1;
    return { move: L(tr.mv), gait: L(tr.g), vx: this.duel ? 0 : -f * L(tr.vx), vy: L(tr.vy), air: L(tr.air) };
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
      t: T,
      duration: this.r.duration,
      bossHp: Math.max(0, this.r.bossHp - dmg),
      bossMax: this.r.bossHp,
      players: ph,
      ended: T >= this.endAt,
      won: this.r.won,
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
      const fly = this.entersFromSky;
      const dy = fly ? -(1 - k) * 520 : (1 - k) * 420;
      // quem tem asas chega voando (batendo as asas) e pousa
      const air = this.mob.wings && !this.duel ? 1 - sm(1.9, 2.35, T) : 0;
      if (T > 2.4 && T < 4.0)
        return { st: { ...base, anim: 'attack', pose: 'roar', p: (T - 2.4) / 1.6, hurt: 0, air }, atk: null, j: -1, alpha: 1, dy };
      return { st: { ...base, hurt: 0, air }, atk: null, j: -1, alpha: clamp(T / 0.6), dy };
    }
    if (this.dieAt !== null && T >= this.dieAt) {
      const p = clamp((T - this.dieAt) / 2.6);
      return {
        st: { ...base, anim: 'death', p, hurt: p < 0.6 ? (Math.sin(p * 40) > 0 ? 0.8 : 0) : 0 },
        atk: null,
        j: -1,
        alpha: 1 - sm(0.55, 1, p),
        dy: sm(0.4, 1, p) * 40,
      };
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
    const tall = this.duel ? 160 : 390 * this.bk;
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
        b = Math.max(b, bx + half);
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
    // picos (salto alto, time espalhado) não podem ser "apagados" pela média: segura o pico por ~0,5 s antes de suavizar
    const hold = (src: Float32Array, win: number, pick: (a: number, b: number) => number) => {
      const out = new Float32Array(N);
      for (let k = 0; k < N; k++) {
        let v = src[k];
        for (let j = Math.max(0, k - win); j <= Math.min(N - 1, k + win); j++) v = pick(v, src[j]);
        out[k] = v;
      }
      return out;
    };
    this.cam = {
      x: smooth(rx, 0.35),
      w: smooth(hold(rw, 12, Math.max), 0.45),
      top: smooth(hold(rt, 15, Math.min), 0.3),
      bx: smooth(this.bt.x, this.duel ? 0.45 : 0.1),
    };
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
    const minW = port ? (this.duel ? 560 : 540) : this.duel ? 720 : 900;
    // celular em pé: fecha mais na ação (quem sai do quadro vira setinha na borda)
    const maxW = port ? (this.duel ? 700 : 680 + 40 * size) : this.duel ? W + 120 : 1280 + 60 * size;
    let viewW = clamp(w0 + (port ? 60 : 140), minW, maxW);
    const gy = port ? (this.duel ? 0.76 : 0.8) : 0.85; // onde fica o chão na tela
    let kk = cw / viewW;
    // garante que o alto da ação cabe (boss no céu, pulos)
    const need = GROUND - top + (this.duel ? 30 : 70); // + espaço da barra de vida do boss
    if (need > (ch / kk) * gy) {
      kk = Math.max((ch * gy) / need, cw / (maxW * (port ? 1.2 : 1.6)));
      viewW = cw / kk;
    }
    const viewH = ch / kk;
    const margin = 110;
    let cx = cx0;
    // se não couber todo mundo, o boss continua inteiro na tela e entram os jogadores mais perto
    // dele (transição contínua: só desloca quando precisa)
    if (!this.duel) {
      const bx = L(this.cam.bx);
      const half = 250 * this.bk + 20;
      const lo = bx + half - viewW / 2;
      const hi = bx - half + viewW / 2;
      cx = lo <= hi ? clamp(cx0, lo, hi) : bx;
    }
    const AW = this.AW;
    cx = viewW >= AW + 2 * margin ? AW / 2 : clamp(cx, viewW / 2 - margin, AW - viewW / 2 + margin);
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
    for (const st of this.steps) {
      if (T - st.t < 0 || T - st.t >= 0.06) continue;
      const amt = st.land ? 0.04 + 0.24 * this.mob.heavy * size : size >= 1 ? 0.1 * st.k * size : 0;
      this.shakeNow = Math.max(this.shakeNow, amt);
    }
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

    this.drawBackground(ctx, T, cw / k, viewH, ox, oy);
    this.drawPlatforms(ctx, T);
    this.drawSteps(ctx, T);

    // ---- boss
    const B = this.at(this.bt, T);
    const bk = this.bk;
    const face = this.faceAt(T);
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
      this.drawTeleports(ctx, T);
      ctx.save();
      ctx.globalAlpha = bs.alpha * B.alpha;
      ctx.translate(bx, by);
      if (T < this.r.entrance && !this.entersFromSky) {
        ctx.beginPath();
        ctx.rect(-600, -900, 1200, 900);
        ctx.clip();
      }
      // sombra no chão (encolhe quando ele está no alto)
      const lift = clamp((GROUND - by) / 420);
      ctx.fillStyle = `rgba(0,0,0,${0.35 * (1 - lift * 0.6)})`;
      ctx.beginPath();
      ctx.ellipse(0, GROUND - by + 4, 200 * bk * (1 - lift * 0.45), 22 * bk * (1 - lift * 0.45), 0, 0, TAU);
      ctx.fill();
      // o desenho olha para a esquerda; virado para a direita, espelha (com o giro animado)
      ctx.scale(-face * bk, bk);
      try {
        A = bodyFor(this.r.boss.arch)(ctx, this.r.boss, bs.st);
      } catch {
        /* um desenho com problema nunca derruba a luta */
      }
      ctx.restore();
    }
    const bossX = duelFrame ? duelFrame.x : bx;
    const bossY = duelFrame ? duelFrame.y : by;
    const toWorld = (v: V): V => ({ x: bossX + v.x * (this.duel ? 1 : -face * bk), y: bossY + v.y * (this.duel ? 1 : bk) });
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
          // os efeitos foram feitos com o time à esquerda: virado para a direita, desenha espelhado
          const mir = this.atkFace[bs.j] === 1;
          const c = this.startsAt[bs.j].x;
          const m = (v: V): V => (mir ? { x: 2 * c - v.x, y: v.y } : v);
          const targets = this.targetsAt[bs.j].map((p) => m({ x: p.x, y: p.y - 50 * this.ps }));
          ctx.save();
          if (mir) ctx.transform(-1, 0, 0, 1, 2 * c, 0);
          s = FX[atk.fx](ctx, {
            atk,
            p: bs.st.p,
            t: T - bs.atk.t,
            from: m(toWorld(A.mouth)),
            hand: m(toWorld(A.hand)),
            core: m(core),
            targets,
            ground: GROUND,
            W: this.AW,
            seed: Math.floor(bs.atk.t * 100),
            size: this.r.boss.size,
          });
          ctx.restore();
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
          p: 0.3 + p * 0.6,
          t: p * 1.8,
          from: toWorld(A.mouth),
          hand: toWorld(A.hand),
          core,
          targets: [],
          ground: GROUND,
          W: this.AW,
          seed: 3,
          size: this.r.boss.size,
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

  /**
   * Fundo com profundidade (parallax). Tudo é ancorado no MUNDO: as montanhas são
   * amostradas sempre nos mesmos pontos, então o contorno não "treme" quando a câmera anda.
   */
  private drawBackground(ctx: CanvasRenderingContext2D, T: number, viewW: number, viewH: number, ox: number, oy: number) {
    const bg = this.r.boss.bg;
    const AW = this.AW;
    const vx0 = -ox;
    const vx1 = -ox + viewW;
    const L = vx0 - 80;
    const Rr = vx1 + 80;
    const top = -oy - 10;
    const g = ctx.createLinearGradient(0, top, 0, GROUND);
    g.addColorStop(0, bg.sky[0]);
    g.addColorStop(1, bg.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(L, top, Rr - L, viewH + 40);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgrad(ctx, AW / 2, GROUND - 220, AW * 0.55, bg.fog + '40', 'transparent');
    ctx.fillRect(L, GROUND - 900, Rr - L, 950);
    ctx.restore();
    // 3 camadas de morros: as do fundo andam menos que a câmera
    const cx = (vx0 + vx1) / 2;
    const STEP = 48;
    for (let layer = 0; layer < 3; layer++) {
      const pf = [0.22, 0.42, 0.66][layer];
      const shift = (cx - AW / 2) * (1 - pf);
      const hAt = (xs: number) => {
        const c = Math.floor(xs / STEP);
        const u = xs / STEP - c;
        const a = h01(c + 5000, layer + 3);
        const b = h01(c + 5001, layer + 3);
        const k = u * u * (3 - 2 * u);
        return (a + (b - a) * k) * (110 - layer * 25) + Math.sin(xs * 0.006 + layer * 2) * 26;
      };
      ctx.fillStyle = mixHex(bg.sky[1], '#000000', 0.3 + layer * 0.17);
      ctx.beginPath();
      ctx.moveTo(L, GROUND + 2);
      const xs0 = Math.floor((L - shift) / 16) * 16;
      for (let xs = xs0; xs + shift <= Rr + 16; xs += 16) {
        ctx.lineTo(xs + shift, GROUND - 30 - (150 - layer * 40) - hAt(xs) + layer * 55);
      }
      ctx.lineTo(Rr + 16, GROUND + 2);
      ctx.closePath();
      ctx.fill();
    }
    for (let i = 0; i < 3; i++) {
      const x = ((T * (12 + i * 6) + i * 777) % (AW + 900)) - 450;
      ctx.fillStyle = rgrad(ctx, x, GROUND - 30 - i * 25, 300, bg.fog + '22', 'transparent');
      ctx.fillRect(x - 300, GROUND - 330, 600, 430);
    }
    const gg = ctx.createLinearGradient(0, GROUND, 0, GROUND + 160);
    gg.addColorStop(0, bg.ground);
    gg.addColorStop(1, mixHex(bg.ground, '#000000', 0.7));
    ctx.fillStyle = gg;
    ctx.fillRect(L, GROUND, Rr - L, 900);
    ctx.fillStyle = mixHex(bg.ground, '#ffffff', 0.18);
    ctx.fillRect(L, GROUND, Rr - L, 3);
    // pedrinhas no chão (dão noção de deslocamento quando a câmera corre)
    ctx.fillStyle = mixHex(bg.ground, '#ffffff', 0.1);
    for (let c = Math.floor(L / 70); c * 70 < Rr; c++) {
      const x = c * 70 + h01(c + 900, 1) * 50;
      const w = 4 + h01(c + 900, 2) * 10;
      ctx.fillRect(x, GROUND + 8 + h01(c + 900, 3) * 40, w, 2.5);
    }
    if (!this.duel) this.drawWalls(ctx, top);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 60; i++) {
      const sp = 8 + h01(i, 1) * 22;
      const span = AW + 400;
      const x = ((h01(i, 2) * span + Math.sin(T * 0.7 + i) * 30) % span) - 200;
      const y = GROUND - ((T * sp + h01(i, 3) * 800) % 820);
      if (x < L - 10 || x > Rr + 10) continue;
      ctx.globalAlpha = 0.25 + 0.5 * h01(i, 4);
      ctx.fillStyle = bg.particle;
      ctx.beginPath();
      ctx.arc(x, y, 1 + h01(i, 5) * 2.2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Paredões de pedra nas pontas da arena (ninguém sai dela). */
  private drawWalls(ctx: CanvasRenderingContext2D, top: number) {
    const bg = this.r.boss.bg;
    const body = mixHex(bg.ground, '#000000', 0.35);
    const edge = mixHex(bg.ground, '#ffffff', 0.12);
    for (const sd of [-1, 1]) {
      const x0 = sd < 0 ? 0 : this.AW;
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(x0 + sd * 600, GROUND + 200);
      const y0 = Math.floor((top - 20) / 30) * 30;
      ctx.lineTo(x0 + sd * 600, y0);
      for (let y = y0; y <= GROUND; y += 30) {
        const c = Math.floor(y / 30);
        ctx.lineTo(x0 - sd * (h01(c + 300, sd + 2) * 26 + (y > GROUND - 60 ? 18 : 0)), y);
      }
      ctx.lineTo(x0 - sd * 40, GROUND + 200);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = edge;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let y = y0; y <= GROUND; y += 30) {
        const c = Math.floor(y / 30);
        const x = x0 - sd * (h01(c + 300, sd + 2) * 26 + (y > GROUND - 60 ? 18 : 0));
        if (y === y0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  /** Plataformas de pedra flutuantes (como nos mapas do PvP). */
  private drawPlatforms(ctx: CanvasRenderingContext2D, T: number) {
    const bg = this.r.boss.bg;
    for (const [n, p] of this.plats.entries()) {
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

  private playerPose(
    i: number,
    T: number,
    v: ReturnType<BossBattle['at']>,
  ): { pose: Pose; rot: number; alpha: number; atk: { a: PAtk; motion: Motion; timing: AttackTiming; local: number } | null } {
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
    const plat = this.plats.find((pl) => v.x >= pl.x0 && v.x <= pl.x1 && v.y <= pl.y + 1);
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
          look: p.look,
          weapon: w,
          shape,
          motion: atk.motion,
          hits: (atk.a.slot === 2 ? w.a2 : w.a1).hits,
          timing: atk.timing,
          local: atk.local,
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
    const from = { x: src.x + 20 * src.f, y: src.y - 60 * this.ps };
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

  private drawDuelist(
    ctx: CanvasRenderingContext2D,
    T: number,
    bs: ReturnType<BossBattle['bossState']>,
    fr: DuelFrame | null,
    x: number,
    y: number,
    B: ReturnType<BossBattle['at']>,
  ) {
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
    ctx.fillStyle = rgrad(
      ctx,
      px,
      py - 55 * s,
      90 * s * (0.8 + aura * 0.5),
      glowC +
        Math.round(clamp(aura) * 110)
          .toString(16)
          .padStart(2, '0'),
      'transparent',
    );
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
      // pouso: nuvem dos dois lados; passo: só embaixo do pé que pisou
      const sides = st.land ? [-1.4, 1.4] : [i % 2 ? 1 : -1];
      for (const side of sides) {
        const x = st.x + side * 55 * bk;
        ctx.save();
        for (let j = 0; j < (st.land ? 9 : 6); j++) {
          const dir = (j % 2 ? 1 : -1) * (0.4 + h01(i, j) * 0.8);
          ctx.globalAlpha = (1 - q) * 0.35 * (0.4 + st.k * 0.6);
          ctx.fillStyle = dust;
          ctx.beginPath();
          ctx.arc(
            x + dir * q * 70 * bk,
            GROUND - 6 * bk - q * (14 + h01(i, j + 9) * 18) * bk,
            (8 + q * 22) * bk * (0.6 + h01(i, j + 3) * 0.6),
            0,
            TAU,
          );
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  /** Teletransportes fora dos golpes: tinta/luz onde sumiu e onde apareceu. */
  private drawTeleports(ctx: CanvasRenderingContext2D, T: number) {
    const c1 = this.r.boss.pal.glow;
    const c2 = this.r.boss.pal.accent;
    for (const tp of this.tps) {
      const d = T - tp.t;
      if (d < -0.15 || d > 0.6) continue;
      const sc = tp.k ?? 1;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const [pt, delay] of [
        [tp.from, 0],
        [tp.to, 0.05],
      ] as const) {
        const k = clamp((d - delay + 0.15) / 0.6);
        if (k <= 0 || k >= 1) continue;
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = c1;
        ctx.lineWidth = 3 * (1 - k) + 1;
        ctx.beginPath();
        ctx.ellipse(pt.x, pt.y - 55 * sc, (20 + k * 60) * sc, (70 + k * 30) * sc, 0, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = rgrad(ctx, pt.x, pt.y - 55 * sc, 80 * sc, c2 + '88', 'transparent');
        ctx.fillRect(pt.x - 80 * sc, pt.y - 140 * sc, 160 * sc, 170 * sc);
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * TAU + h01(i, 9);
          ctx.fillStyle = i % 2 ? c1 : '#ffffff';
          ctx.beginPath();
          ctx.arc(pt.x + Math.cos(a) * k * 70 * sc, pt.y - 55 * sc + Math.sin(a) * k * 90 * sc, Math.max(0.5, 3 * (1 - k) * sc), 0, TAU);
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
