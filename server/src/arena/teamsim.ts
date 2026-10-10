/**
 * ============================================================
 *  GYMBATTLE — LUTA EM EQUIPE (PvP em equipes e Waves)
 * ============================================================
 * Mesma base da luta 1×1 (sim.ts): física, golpes, projéteis, áreas, status,
 * esquiva e as MESMAS fórmulas de dano (atributos + arma). A diferença: aqui são
 * vários contra vários, numa arena grande e plana, com uma IA de equipe:
 *  - escolhe alvo (perto, ferido, perigoso, quem está batendo num aliado);
 *  - corpo a corpo cerca o alvo, quem atira mantém distância e foge de quem chega;
 *  - curandeiros curam o aliado mais ferido; todos esquivam de golpes anunciados;
 *  - ninguém fica empilhado: os aliados se espalham.
 * Determinística: mesma semente + mesmas unidades = mesma luta.
 */
import {
  BALANCE, ANIM, FLAG, WEAPONS_BY_ID, derivedStats, effectiveAttr, hitboxFor, meleeReach, mulberry32, weaponPower, weaponShapeOf,
  type AttackDef, type FighterInput, type StatusEffect, type VfxKey, type WeaponDef,
} from '@gymbattle/shared';
import type { TeamArenaDef, TeamEv, TeamMove, TeamReplay, TeamUnitKind, TeamUnitMeta } from '@gymbattle/shared';

const C = BALANCE.combat;
const TICK = C.tickRate; // 30
const DT = 1 / TICK;
const FRAME_EVERY = 3;
const GRAV = 2300;
const MAX_FALL = 1150;
const RUN = 250;
const JUMP_V = 830;
const DASH_V = 780;
const LEAP_V = 640;
const DASH_TICKS = 6;
const DASH_IFRAMES = 8;
const DASH_COST = 16;
const DEAD_SHOWN = 60; // ticks que o corpo continua na tela
const FALLBACK_WEAPON = 'espada-curta-recruta';

const ticks = (ms: number) => Math.max(1, Math.round((ms / 1000) * TICK));
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const sign = (v: number) => (v < 0 ? -1 : 1);

const PROJ_SPEED: Partial<Record<VfxKey, number>> = {
  arrow: 980, piercing_arrow: 1100, dagger_throw: 820, fireball: 640, shadow_orb: 470, ice_shard: 720,
  arcane_missiles: 700, lightning_spear: 1050, crescent: 780, poison_cloud: 520, holy_beam: 1150, chain_pull: 950, holy_nova: 700,
};

/** Entrada de uma unidade. Jogadores vêm da conta; monstros e chefe, do catálogo. */
export interface TeamUnitInput {
  kind: TeamUnitKind;
  team: 0 | 1;
  /** Jogador (atributos, arma, aparência). */
  fighter?: FighterInput;
  /** Monstro / chefe. */
  name?: string;
  hp?: number;
  /** Dano base por golpe (o poder do golpe multiplica). */
  dmg?: number;
  /** Velocidade de ataque (1 = normal) e de corrida (1 = de um jogador). */
  atkSpeed?: number;
  runSpeed?: number;
  hitbox?: { w: number; h: number };
  moves?: TeamMove[];
  /** Comportamento: corpo a corpo, à distância, ou bruto (não é interrompido). */
  ai?: 'melee' | 'ranged' | 'brute';
  /** Chance de esquivar golpes anunciados (monstros quase não esquivam). */
  dodge?: number;
  look?: TeamUnitMeta['look'];
  equipment?: TeamUnitMeta['equipment'];
  body?: TeamUnitMeta['body'];
  scale?: number;
  aura?: string;
  title?: string;
  wave?: number;
}

export interface TeamSimOpts {
  seed: number;
  mode: 'pvp' | 'waves';
  arena: TeamArenaDef;
  units: TeamUnitInput[];
  teamNames: [string, string];
  /** Waves: quantas são (a última é a do chefe). */
  waveTotal?: number;
  chiefName?: string;
}

type ActKind = 'none' | 'attack' | 'dash' | 'hitstun' | 'dead';
interface Act {
  kind: ActKind;
  start: number;
  end: number;
  m?: number;
  def?: TeamMove;
  windup?: number;
  active?: number;
  fired?: number;
  landed?: boolean;
  hit?: Set<number>;
  tumble?: boolean;
  target?: number;
}

interface Unit {
  u: number;
  meta: TeamUnitMeta;
  kind: TeamUnitKind;
  team: 0 | 1;
  weapon: WeaponDef | null;
  moves: TeamMove[];
  dmg: number;
  speed: number;
  run: number;
  reach: number;
  regenSt: number;
  regenMp: number;
  free: boolean; // sem custo de stamina/mana (monstros e chefe)
  ai: 'melee' | 'ranged' | 'brute';
  dodge: number;
  attrs: FighterInput['attributes'] | null;
  // estado
  inField: boolean;
  enteredAt: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  hp: number;
  st: number;
  mp: number;
  act: Act;
  iframes: number;
  status: Record<StatusEffect, number>;
  immuneUntil: { freeze: number; shock: number };
  dotPower: Record<StatusEffect, number>;
  dotFrom: Record<StatusEffect, number>;
  cds: number[];
  dashCd: number;
  landedAt: number;
  anim: number;
  animStart: number;
  deadAt: number;
  // IA
  nextThink: number;
  move: number;
  wantJump: boolean;
  wantDash: number;
  wantAttack: number; // índice do golpe + 1 (0 = nenhum)
  target: number;
  aggression: number;
}

interface Projectile {
  id: number;
  owner: number;
  m: number;
  def: TeamMove;
  x: number;
  y: number;
  vx: number;
  vy: number;
  until: number;
  homing: number; // alvo (-1 = reto)
  pull: boolean;
  vfx: VfxKey;
  missShown: boolean;
}

function styleOf(moves: TeamMove[]): 'melee' | 'ranged' {
  const a1 = moves[0];
  return a1 && (a1.kind === 'projectile' || (a1.kind === 'area' && a1.range >= 250)) ? 'ranged' : 'melee';
}

export function simulateTeamFight(opts: TeamSimOpts): TeamReplay {
  const rng = mulberry32(opts.seed);
  const W = opts.arena.width;
  const G = opts.arena.ground;
  const L = 40;
  const R = W - 40;
  const events: TeamEv[] = [];
  const frames: number[][] = [];
  const projectiles: Projectile[] = [];
  let projSeq = 1;
  let t = 0;
  let endTick = -1;
  let winner: 0 | 1 | null = null;
  const waves = opts.mode === 'waves';
  const waveTotal = opts.waveTotal ?? 0;
  let wave = 0;
  let waveStart = 0;
  let nextWaveAt = waves ? Math.round(1.2 * TICK) : -1;
  const spawnQueue: { at: number; u: number; side: number }[] = [];

  // ------------------------------------------------------------ unidades
  const units: Unit[] = opts.units.map((inp, u) => {
    let meta: TeamUnitMeta;
    let weapon: WeaponDef | null = null;
    let moves: TeamMove[];
    let dmg: number;
    let speed: number;
    let run = 1;
    let regenSt = 30;
    let regenMp = 6;
    let reach = 1;
    let attrs: FighterInput['attributes'] | null = null;
    if (inp.kind === 'player' && inp.fighter) {
      const f = inp.fighter;
      const d = derivedStats(f.attributes);
      const hb = hitboxFor(f.look.height);
      weapon = WEAPONS_BY_ID[f.equipment.weapon ?? ''] ?? WEAPONS_BY_ID[FALLBACK_WEAPON];
      const p = weaponPower(weapon, f.attributes);
      moves = [weapon.a1, weapon.a2];
      dmg = p.damage;
      speed = p.speed;
      run = 1 + effectiveAttr(f.attributes.dex) * C.runSpeedPerDex;
      regenSt = d.staminaRegen;
      regenMp = d.manaRegen;
      reach = hb.reachMult;
      attrs = f.attributes;
      meta = {
        u, kind: 'player', team: inp.team, name: f.username, userId: f.id, level: f.level, look: f.look, equipment: f.equipment,
        maxHp: d.maxHp, maxSt: d.maxStamina, maxMp: d.maxMana, hitbox: { w: Math.round(hb.w), h: Math.round(hb.h) }, moves,
      };
    } else {
      moves = inp.moves ?? [];
      dmg = inp.dmg ?? 20;
      speed = inp.atkSpeed ?? 1;
      run = inp.runSpeed ?? 0.85;
      if (inp.kind === 'chief' && inp.equipment?.weapon) weapon = WEAPONS_BY_ID[inp.equipment.weapon] ?? null;
      meta = {
        u, kind: inp.kind, team: inp.team, name: inp.name ?? 'Monstro',
        maxHp: Math.max(1, Math.round(inp.hp ?? 200)), maxSt: 100, maxMp: 100,
        hitbox: inp.hitbox ?? { w: 40, h: 90 }, moves,
        look: inp.look, equipment: inp.equipment, body: inp.body, scale: inp.scale, aura: inp.aura, title: inp.title, wave: inp.wave ?? 0,
      };
    }
    const startsIn = !waves || inp.team === 0 || (inp.wave ?? 0) === 0;
    return {
      u, meta, kind: inp.kind, team: inp.team, weapon, moves, dmg, speed, run, reach, regenSt, regenMp,
      free: inp.kind !== 'player',
      ai: inp.ai ?? (styleOf(moves) === 'ranged' ? 'ranged' : 'melee'),
      dodge: inp.dodge ?? (inp.kind === 'player' && attrs ? C.dodgeBase + effectiveAttr(attrs.fort) * C.dodgePerFortitude : 0.05),
      attrs,
      inField: startsIn, enteredAt: startsIn ? 0 : -1,
      x: 0, y: G, vx: 0, vy: 0, facing: inp.team === 0 ? 1 : -1, grounded: true,
      hp: meta.maxHp, st: meta.maxSt, mp: meta.maxMp,
      act: { kind: 'none', start: 0, end: 0 },
      iframes: 0,
      status: { poison: 0, freeze: 0, burn: 0, bleed: 0, shock: 0, launch: 0 },
      immuneUntil: { freeze: 0, shock: 0 },
      dotPower: { poison: 0, freeze: 0, burn: 0, bleed: 0, shock: 0, launch: 0 },
      dotFrom: { poison: -1, freeze: -1, burn: -1, bleed: -1, shock: -1, launch: -1 },
      cds: moves.map(() => 0),
      dashCd: 0, landedAt: -99, anim: ANIM.idle, animStart: 0, deadAt: -1,
      nextThink: 8 + Math.floor(rng() * 12),
      move: 0, wantJump: false, wantDash: 0, wantAttack: 0, target: -1,
      aggression: 0.45 + rng() * 0.35,
    };
  });

  // posições iniciais
  {
    const team0 = units.filter((f) => f.team === 0);
    const team1 = units.filter((f) => f.team === 1 && f.inField);
    if (waves) {
      // time no meio da arena; os monstros chegam pelos dois lados
      team0.forEach((f, i) => {
        f.x = W / 2 + (i - (team0.length - 1) / 2) * 70;
        f.facing = i % 2 ? -1 : 1;
      });
    } else {
      const gap = Math.min(80, 600 / Math.max(1, Math.max(team0.length, team1.length)));
      team0.forEach((f, i) => (f.x = W * 0.3 - i * gap));
      team1.forEach((f, i) => (f.x = W * 0.7 + i * gap));
    }
  }

  const alive = (f: Unit) => f.inField && f.act.kind !== 'dead';
  const enemiesOf = (f: Unit) => units.filter((o) => o.team !== f.team && alive(o));
  const alliesOf = (f: Unit) => units.filter((o) => o.team === f.team && alive(o));
  const hurt = (f: Unit) => ({ x1: f.x - f.meta.hitbox.w / 2, x2: f.x + f.meta.hitbox.w / 2, y1: f.y - f.meta.hitbox.h, y2: f.y });
  const canAct = (f: Unit) => f.act.kind === 'none' && f.status.freeze <= t && f.status.shock <= t && endTick < 0;
  /** Dano cresce se a luta (ou a wave) se arrasta: toda luta termina. */
  const sudden = () => {
    const since = waves ? t - waveStart : t;
    const after = TICK * (waves ? 70 : C.suddenDeathAfterSec);
    return since > after ? 1 + (since - after) / (TICK * C.suddenDeathRampSec) : 1;
  };

  // ------------------------------------------------------------ dano
  function applyHit(target: Unit, from: Unit, def: TeamMove, m: number, dirX: number, mult = 1) {
    if (target.iframes > t || !alive(target)) return false;
    let dmg = ((from.dmg * def.power) / def.hits) * (0.9 + rng() * 0.2) * mult * sudden();
    if (target.status.freeze > t) dmg *= 1.2;
    dmg = Math.max(1, Math.round(dmg));
    target.hp = Math.max(0, target.hp - dmg);
    if (def.lifesteal) {
      const heal = Math.round(dmg * def.lifesteal);
      from.hp = Math.min(from.meta.maxHp, from.hp + heal);
      events.push({ t, type: 'heal', u: from.u, from: from.u, amount: heal });
    }
    if (def.status && def.status.type !== 'launch' && rng() < def.status.chance / Math.sqrt(Math.max(1, def.hits))) {
      const s = def.status.type;
      const stun = s === 'freeze' || s === 'shock';
      const immune = stun && target.immuneUntil[s] > t;
      // o chefe não fica preso por congelamento/paralisia longos
      if (!immune && target.status[s] <= t) {
        const dur = ticks(def.status.duration * (stun ? C.status.stunDurationMult : 1) * (target.kind === 'chief' && stun ? 0.4 : 1));
        target.status[s] = t + dur;
        target.dotPower[s] = from.dmg;
        target.dotFrom[s] = from.u;
        if (stun) target.immuneUntil[s] = t + dur + ticks(C.status.stunImmunitySec * 1000);
        events.push({ t, type: 'status', u: target.u, status: s, dur });
        if (stun) target.act = { kind: 'none', start: t, end: t };
      }
    }
    const hpFrac = target.hp / target.meta.maxHp;
    const heavyBody = target.ai === 'brute' || target.kind === 'chief';
    const kb = def.knockback * 26 * (1 + (1 - hpFrac) * C.lowHpKnockbackBonus * 0.5) * mult * (heavyBody ? 0.35 : 1);
    const launch = def.status?.type === 'launch' && !heavyBody;
    const frozen = target.status.freeze > t;
    const ta = target.act;
    const committed = ta.kind === 'attack' && !!ta.def && (ta.def.kind === 'leap' || (ta.def.kind === 'area' && ta.def.range < 250));
    const poised = !launch && !frozen && ta.kind === 'attack' &&
      (committed || heavyBody || (target.weapon && C.poiseCategories.includes(weaponShapeOf(target.weapon)))) &&
      t - ta.start < (ta.windup ?? 0) + (ta.active ?? 0);
    const tumble = !poised && (kb > 650 || launch);
    if (poised) target.vx += dirX * kb * C.poiseKnockbackMult;
    else {
      target.vx = frozen ? dirX * kb * 0.4 : dirX * kb;
      target.vy = launch ? -1050 : frozen ? 0 : -kb * 0.45 - (heavyBody ? 40 : 140);
      target.grounded = false;
      const stun = Math.round((5 + kb / 70) * (heavyBody ? 0.5 : 1));
      if (!frozen && target.status.shock <= t) target.act = { kind: 'hitstun', start: t, end: t + stun, tumble };
      target.facing = (dirX > 0 ? -1 : 1) as 1 | -1;
    }
    const hb = hurt(target);
    events.push({
      t, type: 'hit', u: target.u, from: from.u, dmg, m,
      x: Math.round(target.x), y: Math.round((hb.y1 + hb.y2) / 2), el: def.element, big: tumble || (def.shake ?? 0) >= 0.4,
    });
    return true;
  }

  function missAt(o: Unit) {
    if (alive(o)) events.push({ t, type: 'miss', u: o.u, x: Math.round(o.x), y: Math.round(o.y - o.meta.hitbox.h * 0.6) });
  }

  // ------------------------------------------------------------ ataques
  function startAttack(f: Unit, m: number) {
    const def = f.moves[m];
    if (!def) return false;
    if (!f.free && (f.st < def.stamina || f.mp < def.mana)) return false;
    if (f.cds[m] > t) return false;
    if (!f.free) {
      f.st -= def.stamina;
      f.mp -= def.mana;
    }
    if (def.cooldown) f.cds[m] = t + ticks(def.cooldown);
    const windup = ticks(def.windup / f.speed);
    const active =
      def.kind === 'combo' || def.kind === 'projectile' ? Math.max(3, def.hits * 3)
      : def.kind === 'area' ? Math.max(3, def.hits * 4)
      : def.kind === 'dash' ? DASH_TICKS
      : def.kind === 'leap' ? 24
      : 5;
    const recovery = ticks(def.recovery / f.speed);
    f.act = { kind: 'attack', start: t, end: t + windup + active + recovery, m, def, windup, active, fired: 0, hit: new Set(), target: f.target };
    events.push({ t, type: 'attack', u: f.u, m, windup, active, recovery, facing: f.facing });
    if (def.kind === 'leap' && f.grounded) {
      const o = units[f.target];
      const flight = (2 * LEAP_V) / GRAV + windup * DT * 0.3;
      const tx = o ? clamp(o.x + o.vx * flight * 0.6, L, R) : f.x + f.facing * 200;
      f.vy = -LEAP_V;
      f.vx = clamp((tx - f.x) / flight, -700, 700);
      f.grounded = false;
    }
    return true;
  }

  function reachOf(f: Unit, def: AttackDef) {
    if (def.kind === 'projectile' || def.kind === 'pull') return def.range;
    if (def.kind === 'area' && def.range >= 250) return def.range;
    if (def.kind === 'leap') return 320;
    if (def.kind === 'dash') return def.range * f.reach + 30;
    if (def.kind === 'heal') return 9999;
    const base = f.weapon ? meleeReach(f.weapon, def) : def.range;
    return base * f.reach + 2;
  }

  function inRange(f: Unit, o: Unit, def: AttackDef) {
    const dx = Math.abs(o.x - f.x);
    const dy = o.y - f.y;
    const r = reachOf(f, def);
    if (def.kind === 'projectile' || def.kind === 'pull') return dx <= r && Math.abs(dy) < 160;
    if (def.kind === 'area' && def.range >= 250) return dx <= r && Math.abs(dy) < 260;
    if (def.kind === 'leap') return dx >= 70 && dx <= Math.min(r, 320) && dy > -140 && dy < 80;
    return dx <= r + o.meta.hitbox.w / 2 && dy > -f.meta.hitbox.h * 0.8 && dy < o.meta.hitbox.h * 0.8;
  }

  function boxHits(f: Unit, o: Unit, def: AttackDef, override?: number) {
    const r = override ?? reachOf(f, def);
    const x1 = f.facing > 0 ? f.x - 18 : f.x - r;
    const x2 = f.facing > 0 ? f.x + r : f.x + 18;
    const h = f.meta.hitbox.h;
    const y1 = f.y - h * 1.3;
    const y2 = f.y + 4;
    const b = hurt(o);
    return x1 < b.x2 && x2 > b.x1 && y1 < b.y2 && y2 > b.y1;
  }

  function spawnProjectile(f: Unit, def: TeamMove, m: number, spread: number) {
    const o = units[f.target] && alive(units[f.target]) ? units[f.target] : null;
    const speed = PROJ_SPEED[def.vfx] ?? 760;
    const h = f.meta.hitbox.h;
    const sx = f.x + f.facing * 22;
    const sy = f.y - h * 0.62;
    let vx = f.facing * speed;
    let vy = spread * 140;
    if (o && sign(o.x - sx) === f.facing) {
      const dx = o.x - sx;
      const dy = o.y - o.meta.hitbox.h * 0.55 - sy;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      vx = (dx / len) * speed;
      vy = (dy / len) * speed + spread * 140;
    }
    const p: Projectile = {
      id: projSeq++, owner: f.u, m, def, x: sx, y: sy, vx, vy,
      until: t + Math.ceil((Math.max(def.range, 320) / speed) * TICK) + 6,
      homing: def.vfx === 'arcane_missiles' || def.vfx === 'ice_shard' ? (o ? o.u : -1) : -1,
      pull: def.kind === 'pull',
      vfx: def.vfx,
      missShown: false,
    };
    projectiles.push(p);
    events.push({ t, type: 'proj', id: p.id, u: f.u, m, x: Math.round(sx), y: Math.round(sy), vfx: def.vfx, el: def.element });
  }

  function areaStrike(f: Unit, def: TeamMove, m: number, index: number, centered = false) {
    const o = units[f.target] && alive(units[f.target]) ? units[f.target] : null;
    const spell = def.range >= 250;
    let cx: number;
    let cy: number;
    let r: number;
    if (spell) {
      const tx = o ? o.x : f.x + f.facing * 260;
      cx = tx + (def.hits > 1 ? (index % 2 === 0 ? -1 : 1) * Math.round(rng() * 60) : 0);
      cy = G;
      r = def.hits > 1 ? 70 : 95;
    } else {
      cx = centered ? f.x : f.x + f.facing * def.range * f.reach * 0.2;
      cy = f.y;
      r = def.range * f.reach;
    }
    events.push({ t, type: 'area', u: f.u, m, x: Math.round(cx), y: Math.round(cy), r: Math.round(r), vfx: def.vfx, el: def.element });
    for (const e of enemiesOf(f)) {
      const b = hurt(e);
      const inX = b.x2 > cx - r && b.x1 < cx + r;
      const inY = spell ? b.y2 > cy - 240 && b.y1 < cy + 20 : b.y2 > cy - r * 0.9 - 30 && b.y1 < cy + 20;
      if (inX && inY && !applyHit(e, f, def, m, sign(e.x - cx || f.facing))) missAt(e);
    }
  }

  function healAllies(f: Unit, def: TeamMove) {
    // cura o aliado mais ferido por perto (inclusive ele mesmo) e um pouco quem está em volta
    const near = alliesOf(f).filter((a) => Math.abs(a.x - f.x) < 380);
    near.sort((a, b) => a.hp / a.meta.maxHp - b.hp / b.meta.maxHp);
    const main = near[0] ?? f;
    const amount = Math.round(f.dmg * def.power * 1.1);
    for (const a of near) {
      const k = a === main ? 1 : Math.abs(a.x - f.x) < 160 ? 0.35 : 0;
      if (!k) continue;
      const before = a.hp;
      a.hp = Math.min(a.meta.maxHp, a.hp + Math.round(amount * k));
      events.push({ t, type: 'heal', u: a.u, from: f.u, amount: a.hp - before });
    }
  }

  function updateAttack(f: Unit) {
    const a = f.act;
    if (a.kind !== 'attack' || !a.def) return;
    const def = a.def;
    const m = a.m!;
    const local = t - a.start;
    const w = a.windup!;
    if (local < w) {
      if (f.grounded) f.vx *= 0.7;
      return;
    }
    const k = local - w;
    if (k >= a.active!) {
      if (f.grounded) f.vx *= 0.75;
      return;
    }
    switch (def.kind) {
      case 'melee':
      case 'combo': {
        if (k === 0 && f.grounded) f.vx = f.facing * 140;
        const every = def.kind === 'combo' ? 3 : a.active!;
        const idx = Math.floor(k / every);
        if (idx < def.hits && (a.fired ?? 0) <= idx) {
          // corta todos os inimigos que a lâmina alcança (golpe em arco)
          let any = false;
          for (const o of enemiesOf(f)) {
            if (!boxHits(f, o, def)) continue;
            any = true;
            if (!applyHit(o, f, def, m, f.facing)) missAt(o);
          }
          if (any || k % every === every - 1) a.fired = idx + 1;
        }
        break;
      }
      case 'dash': {
        const speed = clamp((def.range * f.reach) / (DASH_TICKS * DT), 500, 1300);
        f.vx = f.facing * speed;
        if (f.vy > 0) f.vy *= 0.5;
        for (const o of enemiesOf(f)) {
          if (a.hit!.has(o.u) || !boxHits(f, o, def, 38)) continue;
          a.hit!.add(o.u);
          let landed = false;
          for (let h = 0; h < def.hits; h++) landed = applyHit(o, f, def, m, f.facing) || landed;
          if (!landed) missAt(o);
        }
        if (def.vfx === 'black_flame' && k === a.active! - 1) areaStrike(f, { ...def, range: 90, power: def.power * 0.4, hits: 1 }, m, 0);
        break;
      }
      case 'projectile':
      case 'pull': {
        if (k % 3 === 0 && (a.fired ?? 0) < def.hits) {
          const n = a.fired ?? 0;
          const spread = def.hits > 1 && (def.vfx === 'arrow' || def.vfx === 'dagger_throw') ? n - (def.hits - 1) / 2 : 0;
          spawnProjectile(f, def, m, spread);
          a.fired = n + 1;
        }
        break;
      }
      case 'area': {
        if (k % 4 === 0 && (a.fired ?? 0) < def.hits) {
          areaStrike(f, def, m, a.fired ?? 0);
          a.fired = (a.fired ?? 0) + 1;
        }
        break;
      }
      case 'leap': {
        const o = units[a.target ?? -1];
        if (!a.landed && !f.grounded && o) {
          const want = clamp((o.x - f.x) * 2.2, -700, 700);
          f.vx += clamp(want - f.vx, -1400 * DT, 1400 * DT);
        }
        if (!a.landed && (f.grounded || k >= a.active! - 1)) {
          a.landed = true;
          areaStrike(f, { ...def, range: Math.max(130, def.range * 0.6) }, m, 0, true);
          a.active = k + 1;
        }
        break;
      }
      case 'heal': {
        if (k === 0) {
          healAllies(f, def);
          if (def.vfx === 'holy_nova') areaStrike(f, { ...def, range: 110, power: def.power * 0.5 }, m, 0);
        }
        break;
      }
    }
  }

  function updateProjectiles() {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      const owner = units[p.owner];
      const tgt = p.homing >= 0 ? units[p.homing] : null;
      if (tgt && alive(tgt)) {
        const ty = tgt.y - tgt.meta.hitbox.h * 0.55;
        p.vy += clamp((ty - p.y) * 5, -1800, 1800) * DT;
        p.vy = clamp(p.vy, -500, 500);
      }
      p.x += p.vx * DT;
      p.y += p.vy * DT;
      const RR = p.vfx === 'shadow_orb' || p.vfx === 'fireball' || p.vfx === 'poison_cloud' ? 20 : 12;
      let done = false;
      for (const o of units) {
        if (o.team === owner.team || !alive(o)) continue;
        const b = hurt(o);
        const touching = p.x + RR > b.x1 && p.x - RR < b.x2 && p.y + RR > b.y1 && p.y - RR < b.y2;
        if (!touching) continue;
        if (o.iframes > t) {
          if (!p.missShown) {
            p.missShown = true;
            missAt(o);
          }
          continue;
        }
        applyHit(o, owner, p.def, p.m, sign(p.vx));
        if (p.pull) {
          o.vx = sign(owner.x - o.x) * 720;
          o.vy = -260;
        }
        events.push({ t, type: 'projEnd', id: p.id, x: Math.round(p.x), y: Math.round(p.y), hit: true });
        projectiles.splice(i, 1);
        done = true;
        break;
      }
      if (done) continue;
      if (t >= p.until || p.x < L - 200 || p.x > R + 200 || p.y > G + 60) {
        events.push({ t, type: 'projEnd', id: p.id, x: Math.round(p.x), y: Math.round(Math.min(p.y, G)), hit: false });
        projectiles.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------ movimento
  function jump(f: Unit) {
    if (!f.grounded) return;
    f.vy = -JUMP_V;
    f.grounded = false;
    events.push({ t, type: 'jump', u: f.u, double: false });
  }

  function dash(f: Unit, dir: number) {
    if (f.dashCd > t || (!f.free && f.st < DASH_COST)) return;
    if (!f.free) f.st -= DASH_COST;
    f.dashCd = t + 22;
    f.iframes = Math.max(f.iframes, t + DASH_IFRAMES);
    f.act = { kind: 'dash', start: t, end: t + DASH_TICKS };
    f.vx = dir * DASH_V;
    f.vy = Math.min(f.vy, 0) * 0.3;
    f.facing = (dir > 0 ? 1 : -1) as 1 | -1;
    events.push({ t, type: 'dodge', u: f.u });
  }

  function physics(f: Unit) {
    const stunned = f.status.freeze > t || f.status.shock > t;
    const controlling = f.act.kind === 'none' && !stunned;
    if (f.act.kind === 'dash') {
      /* mantém */
    } else if (controlling) {
      const target = f.move * RUN * f.run;
      const accel = f.grounded ? 3400 : 1800;
      f.vx += clamp(target - f.vx, -accel * DT, accel * DT);
    } else if (f.act.kind === 'hitstun' || stunned) {
      f.vx *= f.grounded ? 0.82 : 0.985;
    } else if (f.act.kind === 'attack' && !f.grounded) {
      f.vx *= 0.97;
    }
    if (!f.grounded) f.vy = Math.min(MAX_FALL, f.vy + GRAV * DT);
    f.x += f.vx * DT;
    f.y += f.vy * DT;
    // paredões da arena
    if (f.x < L) {
      f.x = L;
      f.vx = Math.max(0, f.vx) * 0.3;
    } else if (f.x > R) {
      f.x = R;
      f.vx = Math.min(0, f.vx) * 0.3;
    }
    if (f.y >= G && f.vy >= 0) {
      const hard = f.vy > 900;
      if (!f.grounded) {
        f.landedAt = t;
        if (f.act.kind !== 'hitstun' || hard) events.push({ t, type: 'land', u: f.u, x: Math.round(f.x), y: G, hard });
        if (f.act.kind === 'hitstun' && f.act.tumble) f.act.end = Math.min(f.act.end, t + 6);
      }
      f.y = G;
      f.vy = 0;
      f.grounded = true;
    }
    if (f.grounded && f.act.kind !== 'none') f.vx *= 0.88;
  }

  // ------------------------------------------------------------ IA de equipe
  /** Quem cada unidade está mirando (para "proteger o aliado que está apanhando"). */
  function pickTarget(f: Unit): Unit | null {
    const foes = enemiesOf(f);
    if (!foes.length) return null;
    let best: Unit | null = null;
    let bestS = Infinity;
    for (const o of foes) {
      const d = Math.abs(o.x - f.x);
      let s = d / 220 + (o.hp / o.meta.maxHp) * 1.1;
      if (o.u === f.target) s -= 0.7; // não fica trocando de alvo à toa
      // quem está batendo num aliado ferido vira prioridade
      const threat = units[o.target];
      if (threat && threat.team === f.team && threat.u !== f.u && threat.hp < threat.meta.maxHp * 0.5) s -= 0.5;
      // curandeiros e atiradores inimigos atrás da linha: os ágeis vão atrás deles
      if (f.kind === 'player' && o.ai === 'ranged' && f.ai === 'melee') s -= 0.15;
      // o chefe é a ameaça principal quando está em campo, mas ninguém ignora quem está colado
      if (o.kind === 'chief' && d > 160) s -= 0.25;
      s += rng() * 0.25;
      if (s < bestS) {
        bestS = s;
        best = o;
      }
    }
    return best;
  }

  function nearestEnemyDist(f: Unit) {
    let d = Infinity;
    for (const o of enemiesOf(f)) d = Math.min(d, Math.abs(o.x - f.x));
    return d;
  }

  function think(f: Unit) {
    f.wantJump = false;
    f.wantDash = 0;
    f.wantAttack = 0;
    const o = pickTarget(f);
    if (!o) {
      // sem inimigos: volta para perto do centro do próprio grupo
      const allies = alliesOf(f);
      const cx = allies.reduce((s, a) => s + a.x, 0) / Math.max(1, allies.length);
      f.move = Math.abs(cx - f.x) > 80 ? sign(cx - f.x) : 0;
      f.target = -1;
      return;
    }
    f.target = o.u;
    const dx = o.x - f.x;
    const dist = Math.abs(dx);
    const ranged = f.ai === 'ranged';

    // 1) esquivar de um golpe anunciado que vai me pegar
    for (const e of enemiesOf(f)) {
      const ea = e.act;
      if (ea.kind !== 'attack' || !ea.def || t - ea.start >= (ea.windup ?? 0)) continue;
      if (ea.target !== f.u && !inRange(e, f, ea.def)) continue;
      if (!inRange(e, f, ea.def)) continue;
      if (rng() < f.dodge && (f.free || f.st >= DASH_COST + 4)) {
        const away = sign(f.x - e.x);
        const blocked = f.x + away * 140 < L || f.x + away * 140 > R;
        f.wantDash = blocked ? -away : away;
        return;
      }
      break;
    }
    // 2) projétil vindo: corpo a corpo atravessa com esquiva
    if (!ranged && f.kind === 'player' && f.grounded && f.st >= DASH_COST + 4) {
      const incoming = projectiles.some((p) => units[p.owner].team !== f.team && Math.abs(p.x - f.x) < 190 && sign(f.x - p.x) === sign(p.vx) && Math.abs(p.y - (f.y - f.meta.hitbox.h / 2)) < 90);
      if (incoming && rng() < 0.6) {
        f.wantDash = sign(dx);
        return;
      }
    }
    // 3) curar quem precisa (curandeiro olha o time inteiro)
    const healIdx = f.moves.findIndex((m) => m.kind === 'heal');
    if (healIdx >= 0) {
      const hm = f.moves[healIdx];
      const needy = alliesOf(f).some((a) => Math.abs(a.x - f.x) < 380 && a.hp < a.meta.maxHp * 0.5);
      if (needy && (f.free || f.mp >= hm.mana) && f.cds[healIdx] <= t && rng() < 0.6) {
        f.wantAttack = healIdx + 1;
        return;
      }
    }
    // 4) atacar: golpes fortes quando o alvo está atordoado/ferido; senão o básico
    const opStunned = o.act.kind === 'hitstun' || o.status.freeze > t || o.status.shock > t;
    if (o.iframes <= t + 2) {
      const order = f.moves.map((m, i) => ({ m, i })).filter(({ m }) => m.kind !== 'heal');
      // monstros e chefe: golpes especiais primeiro (têm recarga); jogadores: como no 1×1
      order.sort((a, b) => (f.free ? b.m.power - a.m.power : b.i - a.i));
      for (const { m, i } of order) {
        if (f.cds[i] > t) continue;
        if (!f.free && (f.st < m.stamina || f.mp < m.mana)) continue;
        if (!inRange(f, o, m)) continue;
        const big = i > 0 || m.power >= 1.6;
        const p = big ? (f.free ? 0.55 : 0.28 + (opStunned ? 0.35 : 0) + (o.hp < o.meta.maxHp * 0.3 ? 0.15 : 0)) * (0.7 + f.aggression) : 0.55 + f.aggression * 0.4;
        if (rng() < p) {
          f.facing = sign(dx) as 1 | -1;
          f.wantAttack = i + 1;
          return;
        }
      }
    }
    // 4b) corpo a corpo fecha a distância com um avanço
    const a1 = f.moves[0];
    if (!ranged && f.kind === 'player' && f.grounded && a1 && dist > reachOf(f, a1) + 30 && dist < 330 && f.st >= DASH_COST + a1.stamina && rng() < 0.2) {
      f.wantDash = sign(dx);
      return;
    }
    // 5) posicionamento
    let move = 0;
    if (ranged) {
      // mantém distância de QUALQUER inimigo, não só do alvo
      const near = nearestEnemyDist(f);
      const desired = 270;
      if (near < desired - 80) move = -sign(dx);
      else if (dist > (a1 ? reachOf(f, a1) - 30 : desired + 60)) move = sign(dx);
      // encurralado na parede: escapa pelo outro lado com esquiva
      if (move !== 0 && (f.x + move * 90 < L || f.x + move * 90 > R)) {
        move = 0;
        if (near < 120 && f.grounded && rng() < 0.35) {
          f.wantDash = sign(dx);
          return;
        }
      }
    } else {
      const lowSt = !f.free && a1 && f.st < Math.min(a1.stamina + 6, f.meta.maxSt * 0.25);
      const desired = a1 ? Math.max(40, reachOf(f, a1) * 0.6) : 60;
      if (lowSt && dist < 220) move = -sign(dx);
      else if (dist > desired + 25) move = sign(dx);
      if (dist < 26 && rng() < 0.3) move = -sign(dx);
    }
    // espalha: não fica colado num aliado (cada um ataca de um lado)
    for (const a of alliesOf(f)) {
      if (a === f || Math.abs(a.x - f.x) > 44 || !a.grounded) continue;
      if (move === 0 || rng() < 0.4) move = a.x > f.x ? -1 : 1;
      // cerco: corpo a corpo tenta ir para o outro lado do alvo
      if (!ranged && Math.abs(o.x - f.x) < 140 && rng() < 0.25) {
        f.wantJump = true;
        move = sign(dx);
      }
      break;
    }
    f.move = move;
    if (f.grounded && rng() < 0.015) f.wantJump = true;
  }

  // ------------------------------------------------------------ KO
  function ko(f: Unit) {
    events.push({ t, type: 'ko', u: f.u, x: Math.round(f.x), y: Math.round(f.y) });
    f.act = { kind: 'dead', start: t, end: Number.MAX_SAFE_INTEGER };
    f.deadAt = t;
    f.vx *= 0.3;
    for (const k of Object.keys(f.status) as StatusEffect[]) f.status[k] = 0;
  }

  // ------------------------------------------------------------ waves
  function startWave(n: number) {
    wave = n;
    waveStart = t;
    const boss = n === waveTotal;
    events.push({ t, type: 'wave', n, total: waveTotal, boss });
    // pausa entre waves: o time respira (cura parcial; quem caiu continua caído)
    if (n > 1) {
      for (const p of units) {
        if (p.team !== 0 || !alive(p)) continue;
        const heal = Math.round(p.meta.maxHp * (boss ? 0.35 : 0.22));
        const before = p.hp;
        p.hp = Math.min(p.meta.maxHp, p.hp + heal);
        p.st = p.meta.maxSt;
        p.mp = Math.max(p.mp, p.meta.maxMp * 0.7);
        if (p.hp > before) events.push({ t, type: 'heal', u: p.u, from: p.u, amount: p.hp - before });
      }
    }
    const list = units.filter((f) => f.team === 1 && (f.meta.wave ?? 0) === n);
    list.forEach((f, i) => {
      const side = f.kind === 'chief' ? 0 : i % 2 === 0 ? -1 : 1;
      spawnQueue.push({ at: t + Math.round(i * 0.35 * TICK) + (f.kind === 'chief' ? 20 : 0), u: f.u, side });
    });
  }

  function spawn(f: Unit, side: number) {
    f.inField = true;
    f.enteredAt = t;
    const team = units.filter((p) => p.team === 0 && alive(p));
    const cx = team.length ? team.reduce((s, p) => s + p.x, 0) / team.length : W / 2;
    if (side === 0) {
      // o chefe cai do alto no lado mais vazio
      f.x = clamp(cx < W / 2 ? cx + 420 : cx - 420, L + 60, R - 60);
      f.y = G - 520;
      f.grounded = false;
      f.vy = 200;
    } else {
      f.x = side < 0 ? L + 10 + rng() * 60 : R - 10 - rng() * 60;
      f.y = G;
      f.grounded = true;
    }
    f.facing = f.x < cx ? 1 : -1;
    f.nextThink = t + 6 + Math.floor(rng() * 10);
    events.push({ t, type: 'spawn', u: f.u, x: Math.round(f.x), y: Math.round(f.y) });
  }

  // ------------------------------------------------------------ gravação
  function animOf(f: Unit): number {
    if (endTick >= 0 && winner === f.team && f.act.kind !== 'dead' && t - endTick > 15) return ANIM.victory;
    if (f.act.kind === 'dead') return ANIM.dead;
    if (f.status.freeze > t) return ANIM.frozen;
    if (f.act.kind === 'hitstun') return f.act.tumble ? ANIM.tumble : ANIM.hitstun;
    if (f.status.shock > t) return ANIM.hitstun;
    if (f.act.kind === 'attack') return (f.act.m ?? 0) === 0 ? ANIM.attack1 : ANIM.attack2;
    if (f.act.kind === 'dash') return ANIM.dash;
    if (!f.grounded) return f.vy < 0 ? ANIM.jump : ANIM.fall;
    if (t - f.landedAt < 5) return ANIM.land;
    return Math.abs(f.vx) > 40 ? ANIM.run : ANIM.idle;
  }

  function record() {
    const row: number[] = [t, 0];
    let n = 0;
    for (const f of units) {
      if (!f.inField) continue;
      if (f.act.kind === 'dead' && t - f.deadAt > DEAD_SHOWN) continue;
      const code = animOf(f);
      const start = f.act.kind === 'attack' || f.act.kind === 'dead' ? f.act.start : code === f.anim ? f.animStart : t;
      f.anim = code;
      f.animStart = start;
      let flags = 0;
      if (f.iframes > t) flags |= FLAG.iframes;
      if (f.status.freeze > t) flags |= FLAG.freeze;
      if (f.status.poison > t) flags |= FLAG.poison;
      if (f.status.burn > t) flags |= FLAG.burn;
      if (f.status.bleed > t) flags |= FLAG.bleed;
      if (f.status.shock > t) flags |= FLAG.shock;
      row.push(f.u, Math.round(f.x), Math.round(f.y), f.facing, code, t - start, Math.round(f.hp), flags);
      n++;
    }
    row[1] = n;
    row.push(projectiles.length);
    for (const p of projectiles) row.push(p.id, Math.round(p.x), Math.round(p.y));
    frames.push(row);
  }

  // ============================================================ loop principal
  const MAX = TICK * (waves ? 900 : 420);
  for (t = 0; t <= MAX + 200; t++) {
    // waves: próxima wave quando a atual acabou
    if (waves && endTick < 0) {
      if (nextWaveAt >= 0 && t >= nextWaveAt) {
        nextWaveAt = -1;
        startWave(wave + 1);
      }
      while (spawnQueue.length && spawnQueue[0].at <= t) {
        const s = spawnQueue.shift()!;
        spawn(units[s.u], s.side);
      }
      const foesLeft = units.some((f) => f.team === 1 && (alive(f) || (!f.inField && (f.meta.wave ?? 0) === wave)));
      if (wave > 0 && nextWaveAt < 0 && !spawnQueue.length && !foesLeft) {
        if (wave >= waveTotal) {
          winner = 0;
          endTick = t;
          events.push({ t, type: 'end', winner });
        } else nextWaveAt = t + Math.round(2.6 * TICK);
      }
    }
    const order = t % 2 === 0 ? units : [...units].reverse();
    for (const f of order) {
      if (!f.inField) continue;
      if (f.act.kind !== 'none' && f.act.kind !== 'dead' && t >= f.act.end) f.act = { kind: 'none', start: t, end: t };
      if (f.act.kind === 'dead') {
        physics(f);
        continue;
      }
      // dano contínuo
      const dot = (s: StatusEffect, perSec: number) => {
        if (f.status[s] > t) f.hp = Math.max(0, f.hp - (f.dotPower[s] * perSec * sudden()) / TICK);
      };
      dot('poison', C.status.poisonPerSec);
      dot('burn', C.status.burnPerSec);
      dot('bleed', C.status.bleedPerSec);
      const busy = f.act.kind === 'attack';
      f.st = Math.min(f.meta.maxSt, f.st + f.regenSt * DT * (busy ? 0.25 : 1));
      f.mp = Math.min(f.meta.maxMp, f.mp + f.regenMp * DT);
      if (endTick < 0 && t >= f.nextThink && canAct(f)) {
        think(f);
        f.nextThink = t + C.aiReactionTicks + Math.floor(rng() * 4) + (f.kind === 'monster' ? 2 : 0);
      }
      if (canAct(f)) {
        const o = units[f.target];
        if (f.move !== 0 && f.grounded) f.facing = sign(f.move) as 1 | -1;
        if (f.move === 0 && o && alive(o) && Math.abs(o.x - f.x) > 10) f.facing = sign(o.x - f.x) as 1 | -1;
        if (f.wantDash) {
          dash(f, f.wantDash);
          f.wantDash = 0;
        } else if (f.wantAttack) {
          if (o && Math.abs(o.x - f.x) > 4) f.facing = sign(o.x - f.x) as 1 | -1;
          startAttack(f, f.wantAttack - 1);
          f.wantAttack = 0;
          f.move = 0;
        } else if (f.wantJump) {
          jump(f);
          f.wantJump = false;
        }
      } else if (endTick >= 0 && f.act.kind === 'none') f.move = 0;
      updateAttack(f);
      physics(f);
    }
    updateProjectiles();
    for (const f of units) if (alive(f) && f.hp <= 0) ko(f);

    // fim: um dos lados sem ninguém de pé
    if (endTick < 0) {
      const up0 = units.some((f) => f.team === 0 && alive(f));
      const up1 = units.some((f) => f.team === 1 && alive(f));
      if (!up0) {
        winner = 1;
        endTick = t;
        events.push({ t, type: 'end', winner });
      } else if (!waves && !up1) {
        winner = 0;
        endTick = t;
        events.push({ t, type: 'end', winner });
      } else if (t >= MAX) {
        const frac = (team: 0 | 1) => units.filter((f) => f.team === team && alive(f)).reduce((s, f) => s + f.hp / f.meta.maxHp, 0);
        winner = waves ? 1 : frac(0) === frac(1) ? null : frac(0) > frac(1) ? 0 : 1;
        endTick = t;
        events.push({ t, type: 'end', winner });
      }
    }
    if (t % FRAME_EVERY === 0) record();
    if (endTick >= 0 && t >= endTick + 80) break;
  }

  return {
    v: 1,
    mode: opts.mode,
    seed: opts.seed,
    arena: opts.arena,
    tickRate: TICK,
    frameEvery: FRAME_EVERY,
    duration: t,
    winner,
    units: units.map((f) => f.meta),
    frames,
    events,
    teamNames: opts.teamNames,
    waves: waves ? { reached: wave, total: waveTotal, chief: opts.chiefName ?? '' } : undefined,
  };
}
