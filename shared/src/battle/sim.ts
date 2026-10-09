/**
 * ============================================================
 *  GYMBATTLE — SIMULAÇÃO DA LUTA AUTOMÁTICA
 * ============================================================
 * Roda no servidor a 30 ticks/s. Os dois guerreiros são controlados por IA
 * com base na build (atributos e arma). O resultado é um replay com
 * quadros + eventos; todos os clientes (lutadores e espectadores) desenham
 * exatamente o mesmo replay, então todo mundo vê as mesmas animações e efeitos.
 *
 * Determinístico: mesma semente + mesmos lutadores = mesma luta.
 */
import { BALANCE } from '../balance.js';
import { derivedStats, effectiveAttr, hitboxFor } from '../progression.js';
import { WEAPONS_BY_ID } from '../items/weapons.js';
import { meleeReach, weaponPower, weaponShapeOf } from '../items/equipment.js';
import type { AttackDef, StatusEffect, VfxKey, WeaponDef } from '../items/types.js';
import { MAPS_BY_ID, type MapDef } from './maps.js';
import { ANIM, FLAG, type BattleEvent, type FighterInput, type FighterMeta, type Replay } from './types.js';

const C = BALANCE.combat;
const TICK = C.tickRate; // 30
const DT = 1 / TICK;
const MAX_TICKS = TICK * C.safetyCapSec; // trava de segurança (na prática a morte súbita termina antes)
const SUDDEN = TICK * C.suddenDeathAfterSec;
/** Multiplicador de dano da morte súbita no tick t. */
const suddenDeath = (t: number) => (t > SUDDEN ? 1 + (t - SUDDEN) / (TICK * C.suddenDeathRampSec) : 1);
const FRAME_EVERY = 2;

// física (unidades do mundo por segundo)
const GRAV = 2300;
const MAX_FALL = 1150;
const RUN = 250;
const JUMP_V = 830;
const DJUMP_V = 740;
const DASH_V = 780;
const LEAP_V = 640;
const DASH_TICKS = 6;
const DASH_IFRAMES = 8;
const DASH_COST = 16;
const DJUMP_COST = 8;
const RESPAWN_IFRAMES = 60;
const DEAD_TICKS = 36;

const FALLBACK_WEAPON = 'espada-curta-recruta';

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ticks = (ms: number) => Math.max(1, Math.round((ms / 1000) * TICK));
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const sign = (v: number) => (v < 0 ? -1 : 1);

type ActKind = 'none' | 'attack' | 'dash' | 'hitstun' | 'dead';

interface Act {
  kind: ActKind;
  start: number;
  end: number;
  // ataque
  slot?: 1 | 2;
  def?: AttackDef;
  windup?: number;
  active?: number;
  fired?: number;
  landed?: boolean;
  hitDone?: boolean;
  missShown?: boolean;
  tumble?: boolean;
}

interface Fighter {
  i: number;
  meta: FighterMeta;
  weapon: WeaponDef;
  dmg: number;
  speed: number;
  reach: number;
  regenSt: number;
  regenMp: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  onThin: boolean;
  jumps: number;
  dropUntil: number;
  hp: number;
  st: number;
  mp: number;
  lives: number;
  act: Act;
  iframes: number;
  status: Record<StatusEffect, number>;
  /** Imune a paralisia/congelamento até este tick. */
  immuneUntil: { freeze: number; shock: number };
  /** Dano da arma de quem aplicou cada efeito (base do dano contínuo). */
  dotPower: Record<StatusEffect, number>;
  dashCd: number;
  landedAt: number;
  anim: number;
  animStart: number;
  respawnedAt: number;
  // IA
  nextThink: number;
  move: number;
  wantJump: boolean;
  wantDrop: boolean;
  wantDash: number; // direção
  wantAttack: 0 | 1 | 2;
  aggression: number;
  reaction: number;
  /** Plataforma para onde a IA está indo (-1 = nenhuma). */
  navTo: number;
}

interface Projectile {
  id: number;
  owner: number;
  slot: 1 | 2;
  def: AttackDef;
  x: number;
  y: number;
  vx: number;
  vy: number;
  until: number;
  homing: boolean;
  pull: boolean;
  vfx: VfxKey;
}

const PROJ_SPEED: Partial<Record<VfxKey, number>> = {
  arrow: 980, piercing_arrow: 1100, dagger_throw: 820, fireball: 640, shadow_orb: 470, ice_shard: 720,
  arcane_missiles: 700, lightning_spear: 1050, crescent: 780, poison_cloud: 520, holy_beam: 1150, chain_pull: 950, holy_nova: 700,
};

function buildMeta(f: FighterInput): FighterMeta {
  const d = derivedStats(f.attributes);
  const hb = hitboxFor(f.look.height);
  return { ...f, maxHp: d.maxHp, maxSt: d.maxStamina, maxMp: d.maxMana, hitbox: { w: Math.round(hb.w), h: Math.round(hb.h) } };
}

/** Plano de evento lendário: começa no tick `at`, ativado pelo lutador `p`. */
export interface LegendPlan {
  at: number;
  p: 0 | 1;
  variant: 0 | 1;
}

type BattleOpts = { seed: number; mapId?: string; fighters: [FighterInput, FighterInput]; legend?: LegendPlan | false };

/** Simula uma luta (sem evento lendário, a menos que `legend` seja passado). */
export function simulateBattle(opts: BattleOpts): Replay {
  return runBattle({ ...opts, legend: opts.legend ?? false });
}

/**
 * Luta em que o lutador `p` ativa o evento lendário num momento aleatório
 * (sorteado dentro da duração que a luta teria), com uma das 2 cenas da arma.
 */
export function simulateBattleWithLegend(opts: Omit<BattleOpts, 'legend'>, p: 0 | 1): Replay {
  const lr = mulberry32((opts.seed ^ 0x6c3b9a1d) >>> 0);
  const base = runBattle({ ...opts, legend: false });
  const endT = base.events.find((e) => e.type === 'end')?.t ?? base.duration;
  const lo = Math.min(4 * TICK, Math.floor(endT * 0.3));
  const hi = Math.max(lo + 1, endT - TICK);
  const at = Math.floor(lo + lr() * (hi - lo));
  return runBattle({ ...opts, legend: { at, p, variant: lr() < 0.5 ? 0 : 1 } });
}

function runBattle(opts: BattleOpts): Replay {
  const rng = mulberry32(opts.seed);
  const map: MapDef = MAPS_BY_ID[opts.mapId ?? ''] ?? Object.values(MAPS_BY_ID)[opts.seed % 4];
  const solids = map.platforms.filter((p) => !p.thin);
  const stageMin = Math.min(...solids.map((p) => p.x));
  const stageMax = Math.max(...solids.map((p) => p.x + p.w));
  const centerX = (stageMin + stageMax) / 2;

  /** Plataforma mais alta abaixo de (x, y) — ou null se embaixo é o vazio. */
  const groundBelow = (x: number, y: number, pad = 0) => {
    let best: (typeof map.platforms)[number] | null = null;
    for (const p of map.platforms) {
      if (x < p.x - pad || x > p.x + p.w + pad || p.y < y - 1) continue;
      if (!best || p.y < best.y) best = p;
    }
    return best;
  };
  /** Plataforma em que o lutador está pisando. */
  const standingOn = (f: { x: number; y: number }) =>
    map.platforms.find((p) => f.x >= p.x && f.x <= p.x + p.w && Math.abs(f.y - p.y) < 1.5) ?? null;
  /** Plataforma sólida mais próxima (para voltar à arena). */
  const nearestSolid = (x: number, y: number) => {
    let best = solids[0];
    let bestD = Infinity;
    for (const p of solids) {
      const cx = clamp(x, p.x + 24, p.x + p.w - 24);
      const d = Math.abs(cx - x) + Math.max(0, y - p.y) * 0.6;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  };

  // ---- navegação entre plataformas (IA): grafo de "dá para ir de A até B"
  type Plat = (typeof map.platforms)[number];
  const plats = map.platforms;
  const linked = (a: Plat, b: Plat) => {
    const gapX = Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w));
    const up = a.y - b.y; // > 0: b está mais alto
    if (up > 20) return up <= 235 && gapX <= 90;
    // descer: plataforma fina (atravessa) ou sair pela borda caindo em b
    if (up < -20) return a.thin ? gapX <= 150 || (b.x < a.x + a.w && b.x + b.w > a.x) : (b.x < a.x || b.x + b.w > a.x + a.w) && gapX <= 150;
    return gapX <= 170;
  };
  const adj = plats.map((a) => plats.map((b, j) => (a !== b && linked(a, b) ? j : -1)).filter((j) => j >= 0));
  /** Próxima plataforma no caminho de `from` até `to` (busca em largura). */
  const nextStep = (from: number, to: number): number => {
    if (from === to) return -1;
    const prev = new Array(plats.length).fill(-2);
    prev[from] = -1;
    const q = [from];
    while (q.length) {
      const c = q.shift()!;
      for (const n of adj[c]) {
        if (prev[n] !== -2) continue;
        prev[n] = c;
        if (n === to) {
          let k = n;
          while (prev[k] !== from) k = prev[k];
          return k;
        }
        q.push(n);
      }
    }
    return -1;
  };
  /** Plataforma que sustenta um ponto (em cima dela ou logo abaixo). */
  const supportIdx = (x: number, y: number) => {
    const p = plats.find((q) => x >= q.x && x <= q.x + q.w && Math.abs(y - q.y) < 1.5) ?? groundBelow(x, y);
    return p ? plats.indexOf(p) : -1;
  };

  const events: BattleEvent[] = [];
  const frames: number[][] = [];
  const stats = { damage: [0, 0] as [number, number], hits: [0, 0] as [number, number], kos: [0, 0] as [number, number] };
  const projectiles: Projectile[] = [];
  let projSeq = 1;

  const fighters: Fighter[] = opts.fighters.map((input, i) => {
    const meta = buildMeta(input);
    const weapon = WEAPONS_BY_ID[input.equipment.weapon ?? ''] ?? WEAPONS_BY_ID[FALLBACK_WEAPON];
    const power = weaponPower(weapon, input.attributes);
    const d = derivedStats(input.attributes);
    const [sx, sy] = map.spawns[i];
    return {
      i, meta, weapon,
      dmg: power.damage,
      speed: power.speed,
      reach: hitboxFor(input.look.height).reachMult,
      regenSt: d.staminaRegen,
      regenMp: d.manaRegen,
      x: sx, y: sy, vx: 0, vy: 0,
      facing: (i === 0 ? 1 : -1) as 1 | -1,
      grounded: true, onThin: false, jumps: 1, dropUntil: 0,
      hp: meta.maxHp, st: meta.maxSt, mp: meta.maxMp, lives: BALANCE.combat.lives,
      act: { kind: 'none', start: 0, end: 0 },
      iframes: 0,
      status: { poison: 0, freeze: 0, burn: 0, bleed: 0, shock: 0, launch: 0 },
      immuneUntil: { freeze: 0, shock: 0 },
      dotPower: { poison: 0, freeze: 0, burn: 0, bleed: 0, shock: 0, launch: 0 },
      dashCd: 0, landedAt: -99, anim: ANIM.idle, animStart: 0, respawnedAt: -999,
      nextThink: 10 + Math.floor(rng() * 10),
      move: 0, wantJump: false, wantDrop: false, wantDash: 0, wantAttack: 0,
      aggression: 0.45 + rng() * 0.35,
      reaction: C.aiReactionTicks,
      navTo: -1,
    };
  });

  let winner: number | null = null;
  let endTick = -1;
  let t = 0;
  // evento lendário
  const plan = opts.legend || null;
  const LEG = Math.round(C.legendSec * TICK);
  let legStart = -1;
  let legEnd = -1;
  let legKo = -1;
  const inLegend = () => legStart >= 0 && t < legEnd;

  const hurt = (f: Fighter) => ({ x1: f.x - f.meta.hitbox.w / 2, x2: f.x + f.meta.hitbox.w / 2, y1: f.y - f.meta.hitbox.h, y2: f.y });
  const canAct = (f: Fighter) =>
    f.act.kind === 'none' && f.status.freeze <= t && f.status.shock <= t && f.lives > 0 && endTick < 0;
  const isDead = (f: Fighter) => f.act.kind === 'dead';

  // ------------------------------------------------------------ dano
  function applyHit(target: Fighter, from: Fighter, def: AttackDef, slot: 1 | 2, dirX: number, mult = 1) {
    if (target.iframes > t || isDead(target) || target.lives <= 0) return false;
    let dmg = (from.dmg * def.power) / def.hits * (0.9 + rng() * 0.2) * mult * suddenDeath(t);
    if (target.status.freeze > t) dmg *= 1.2;
    dmg = Math.max(1, Math.round(dmg));
    target.hp = Math.max(0, target.hp - dmg);
    stats.damage[from.i] += dmg;
    stats.hits[from.i] += 1;
    if (def.lifesteal) {
      const heal = Math.round(dmg * def.lifesteal);
      from.hp = Math.min(from.meta.maxHp, from.hp + heal);
      events.push({ t, type: 'heal', p: from.i, amount: heal });
    }
    // status (em combos, a chance por acerto é menor; efeitos ativos não são renovados)
    if (def.status && def.status.type !== 'launch' && rng() < def.status.chance / Math.sqrt(Math.max(1, def.hits))) {
      const s = def.status.type;
      const stun = s === 'freeze' || s === 'shock';
      const immune = stun && target.immuneUntil[s] > t;
      if (!immune && target.status[s] <= t) {
        const dur = ticks(def.status.duration * (stun ? C.status.stunDurationMult : 1));
        target.status[s] = t + dur;
        target.dotPower[s] = from.dmg;
        if (stun) target.immuneUntil[s] = t + dur + ticks(C.status.stunImmunitySec * 1000);
        events.push({ t, type: 'status', p: target.i, status: s, dur });
        if (stun) target.act = { kind: 'none', start: t, end: t };
      }
    }
    // knockback: quanto menos vida, mais longe voa
    const hpFrac = target.hp / target.meta.maxHp;
    const kb = def.knockback * 26 * (1 + (1 - hpFrac) * BALANCE.combat.lowHpKnockbackBonus) * mult;
    const launch = def.status?.type === 'launch';
    const frozen = target.status.freeze > t;
    // postura: arma pesada no meio do golpe não é interrompida (só por arremesso)
    const ta = target.act;
    const committed = ta.kind === 'attack' && !!ta.def && (ta.def.kind === 'leap' || (ta.def.kind === 'area' && ta.def.range < 250));
    const poised = !launch && !frozen && ta.kind === 'attack' && (committed || C.poiseCategories.includes(weaponShapeOf(target.weapon))) &&
      t - ta.start < (ta.windup ?? 0) + (ta.active ?? 0);
    const tumble = !poised && (kb > 650 || launch);
    if (poised) {
      target.vx += dirX * kb * C.poiseKnockbackMult;
    } else {
      target.vx = frozen ? dirX * kb * 0.4 : dirX * kb;
      target.vy = launch ? -1050 : frozen ? 0 : -kb * 0.45 - 140;
      target.grounded = false;
      const stun = 5 + Math.round(kb / 70);
      if (!frozen && target.status.shock <= t) target.act = { kind: 'hitstun', start: t, end: t + stun, tumble };
      target.facing = (dirX > 0 ? -1 : 1) as 1 | -1;
    }
    const hb = hurt(target);
    events.push({
      t, type: 'hit', p: target.i, from: from.i, dmg, slot,
      x: Math.round(target.x), y: Math.round((hb.y1 + hb.y2) / 2),
      el: def.element, big: tumble || (def.shake ?? 0) >= 0.4,
    });
    return true;
  }

  /** A lâmina passou pelo alvo, mas ele estava invulnerável (esquiva/renascendo). */
  function dodged(o: Fighter, a: Act) {
    if (a.hitDone === undefined || !a.missShown) {
      a.missShown = true;
      if (!isDead(o)) events.push({ t, type: 'miss', p: o.i, x: Math.round(o.x), y: Math.round(o.y - o.meta.hitbox.h * 0.6) });
    }
  }

  // ------------------------------------------------------------ ataques
  function startAttack(f: Fighter, slot: 1 | 2) {
    const def = slot === 1 ? f.weapon.a1 : f.weapon.a2;
    if (f.st < def.stamina || f.mp < def.mana) return false;
    f.st -= def.stamina;
    f.mp -= def.mana;
    const windup = ticks(def.windup / f.speed);
    const active =
      def.kind === 'combo' || def.kind === 'projectile' ? Math.max(3, def.hits * 3)
      : def.kind === 'area' ? Math.max(3, def.hits * 4)
      : def.kind === 'dash' ? DASH_TICKS
      : def.kind === 'leap' ? 24
      : 5;
    const recovery = ticks(def.recovery / f.speed);
    f.act = { kind: 'attack', start: t, end: t + windup + active + recovery, slot, def, windup, active, fired: 0 };
    events.push({ t, type: 'attack', p: f.i, slot, windup, active, recovery, facing: f.facing });
    if (def.kind === 'leap' && f.grounded) {
      // salta mirando onde o alvo vai estar quando cair (sem sair da plataforma dele)
      const o = fighters[1 - f.i];
      const flight = (2 * LEAP_V) / GRAV + windup * DT * 0.3;
      const land = groundBelow(o.x, o.y - 4);
      let tx = o.x + o.vx * flight * 0.6;
      if (land) tx = clamp(tx, land.x + 20, land.x + land.w - 20);
      f.vy = -LEAP_V;
      f.vx = clamp((tx - f.x) / flight, -700, 700);
      f.grounded = false;
    }
    return true;
  }

  function attackBoxHit(f: Fighter, o: Fighter, def: AttackDef, extra = 0) {
    const r = meleeReach(f.weapon, def) * f.reach + extra;
    // a caixa cobre o arco inteiro da arma: um pouco atrás do corpo e acima da cabeça
    const x1 = f.facing > 0 ? f.x - 18 : f.x - r;
    const x2 = f.facing > 0 ? f.x + r : f.x + 18;
    const h = f.meta.hitbox.h;
    const y1 = f.y - h * 1.3;
    const y2 = f.y + 4;
    const b = hurt(o);
    return x1 < b.x2 && x2 > b.x1 && y1 < b.y2 && y2 > b.y1;
  }

  function spawnProjectile(f: Fighter, def: AttackDef, slot: 1 | 2, spread: number) {
    const o = fighters[1 - f.i];
    const speed = PROJ_SPEED[def.vfx] ?? 760;
    const h = f.meta.hitbox.h;
    const sx = f.x + f.facing * 22;
    const sy = f.y - h * 0.62;
    // mira na altura do oponente
    const dx = o.x - sx;
    const dy = o.y - o.meta.hitbox.h * 0.55 - sy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const aim = def.kind === 'pull' || def.vfx === 'holy_beam' || def.vfx === 'lightning_spear' || def.vfx === 'shadow_orb';
    let vx = f.facing * speed;
    let vy = spread * 140;
    if (aim && sign(dx) === f.facing) {
      vx = (dx / len) * speed;
      vy = (dy / len) * speed + spread * 140;
    }
    const p: Projectile = {
      id: projSeq++, owner: f.i, slot, def, x: sx, y: sy, vx, vy,
      until: t + Math.ceil((Math.max(def.range, 320) / speed) * TICK) + 4,
      homing: def.vfx === 'arcane_missiles' || def.vfx === 'ice_shard',
      pull: def.kind === 'pull',
      vfx: def.vfx,
    };
    projectiles.push(p);
    events.push({ t, type: 'proj', id: p.id, p: f.i, slot, x: Math.round(sx), y: Math.round(sy), vfx: def.vfx, el: def.element });
  }

  function areaStrike(f: Fighter, def: AttackDef, slot: 1 | 2, index: number, centered = false) {
    const o = fighters[1 - f.i];
    const spell = def.range >= 250;
    let cx: number;
    let cy: number;
    let r: number;
    if (spell) {
      cx = o.x + (def.hits > 1 ? (index % 2 === 0 ? -1 : 1) * Math.round(rng() * 40) : 0);
      cy = o.grounded ? o.y : Math.min(o.y + 40, map.height);
      r = def.hits > 1 ? 58 : 80;
    } else {
      // golpes em área de perto (giros, ondas de choque) acertam em volta do corpo todo
      cx = centered ? f.x : f.x + f.facing * def.range * f.reach * 0.2;
      cy = f.y;
      r = def.range * f.reach;
    }
    events.push({ t, type: 'area', p: f.i, slot, x: Math.round(cx), y: Math.round(cy), r: Math.round(r), vfx: def.vfx, el: def.element });
    const b = hurt(o);
    const inX = b.x2 > cx - r && b.x1 < cx + r;
    const inY = spell ? b.y2 > cy - 220 && b.y1 < cy + 20 : b.y2 > cy - r * 0.9 - 30 && b.y1 < cy + 20;
    if (inX && inY && !applyHit(o, f, def, slot, sign(o.x - cx || f.facing)) && !isDead(o)) {
      events.push({ t, type: 'miss', p: o.i, x: Math.round(o.x), y: Math.round(o.y - o.meta.hitbox.h * 0.6) });
    }
  }

  function updateAttack(f: Fighter) {
    const a = f.act;
    if (a.kind !== 'attack' || !a.def) return;
    const def = a.def;
    const slot = a.slot!;
    const o = fighters[1 - f.i];
    const local = t - a.start;
    const w = a.windup!;
    if (local < w) {
      // no chão, freia durante a preparação
      if (f.grounded) f.vx *= 0.7;
      return;
    }
    const k = local - w; // tick dentro da fase ativa
    if (k >= a.active!) {
      if (f.grounded) f.vx *= 0.75;
      return;
    }
    switch (def.kind) {
      case 'melee':
      case 'combo': {
        if (k === 0 && f.grounded) f.vx = f.facing * 140;
        // cada golpe tem uma janela (3 ticks no combo, a fase ativa inteira no golpe único);
        // o acerto vale em qualquer tick da janela em que a lâmina encosta no alvo
        const every = def.kind === 'combo' ? 3 : a.active!;
        const idx = Math.floor(k / every);
        if (idx < def.hits && (a.fired ?? 0) <= idx) {
          if (attackBoxHit(f, o, def)) {
            a.fired = idx + 1;
            if (!applyHit(o, f, def, slot, f.facing)) dodged(o, a);
          } else if (k % every === every - 1) a.fired = idx + 1;
        }
        break;
      }
      case 'dash': {
        const speed = clamp((def.range * f.reach) / (DASH_TICKS * DT), 500, 1300);
        f.vx = f.facing * speed;
        // no ar, o avanço não leva para o vazio
        if (!f.grounded && !groundBelow(f.x + f.facing * 90, f.y)) f.vx = f.facing * Math.min(speed, 260);
        if (f.vy > 0) f.vy *= 0.5;
        if (!a.hitDone && attackBoxHit(f, o, { ...def, range: 38 }, 0)) {
          a.hitDone = true;
          let landed = false;
          for (let h = 0; h < def.hits; h++) landed = applyHit(o, f, def, slot, f.facing) || landed;
          if (!landed) dodged(o, a);
        }
        if (def.vfx === 'black_flame' && k === a.active! - 1) {
          areaStrike(f, { ...def, range: 90, power: def.power * 0.4, hits: 1 }, slot, 0);
        }
        break;
      }
      case 'projectile':
      case 'pull': {
        if (k % 3 === 0 && (a.fired ?? 0) < def.hits) {
          const n = a.fired ?? 0;
          const spread = def.hits > 1 && def.vfx === 'arrow' ? n - (def.hits - 1) / 2 : 0;
          spawnProjectile(f, def, slot, spread);
          a.fired = n + 1;
        }
        break;
      }
      case 'area': {
        if (k % 4 === 0 && (a.fired ?? 0) < def.hits) {
          areaStrike(f, def, slot, a.fired ?? 0);
          a.fired = (a.fired ?? 0) + 1;
        }
        break;
      }
      case 'leap': {
        if (!a.landed && !f.grounded) {
          // corrige a rota no ar, de leve, na direção do alvo
          const want = clamp((o.x - f.x) * 2.2, -700, 700);
          f.vx += clamp(want - f.vx, -1400 * DT, 1400 * DT);
        }
        if (!a.landed && (f.grounded || k >= a.active! - 1)) {
          a.landed = true;
          areaStrike(f, { ...def, range: Math.max(130, def.range * 0.6) }, slot, 0, true);
          a.active = k + 1; // encerra a fase ativa
        }
        break;
      }
      case 'heal': {
        if (k === 0) {
          const amount = Math.round(f.dmg * def.power * 1.1);
          const before = f.hp;
          f.hp = Math.min(f.meta.maxHp, f.hp + amount);
          events.push({ t, type: 'heal', p: f.i, amount: f.hp - before });
          if (def.vfx === 'holy_nova') areaStrike(f, { ...def, range: 110, power: def.power * 0.5 }, slot, 0);
        }
        break;
      }
    }
  }

  function updateProjectiles() {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      const o = fighters[1 - p.owner];
      if (p.homing && !isDead(o)) {
        const ty = o.y - o.meta.hitbox.h * 0.55;
        p.vy += clamp((ty - p.y) * 5, -1800, 1800) * DT;
        p.vy = clamp(p.vy, -500, 500);
      }
      p.x += p.vx * DT;
      p.y += p.vy * DT;
      const b = hurt(o);
      const R = p.vfx === 'shadow_orb' || p.vfx === 'fireball' || p.vfx === 'poison_cloud' ? 20 : 12;
      const touching = !isDead(o) && p.x + R > b.x1 && p.x - R < b.x2 && p.y + R > b.y1 && p.y - R < b.y2;
      const hit = touching && o.iframes <= t;
      if (touching && !hit && !(p as { missShown?: boolean }).missShown) {
        (p as { missShown?: boolean }).missShown = true;
        events.push({ t, type: 'miss', p: o.i, x: Math.round(o.x), y: Math.round(o.y - o.meta.hitbox.h * 0.6) });
      }
      if (hit) {
        const owner = fighters[p.owner];
        applyHit(o, owner, p.def, p.slot, sign(p.vx));
        if (p.pull) {
          o.vx = sign(owner.x - o.x) * 720;
          o.vy = -260;
        }
        events.push({ t, type: 'projEnd', id: p.id, x: Math.round(p.x), y: Math.round(p.y), hit: true });
        projectiles.splice(i, 1);
      } else if (t >= p.until || p.x < map.blast.left || p.x > map.blast.right) {
        events.push({ t, type: 'projEnd', id: p.id, x: Math.round(p.x), y: Math.round(p.y), hit: false });
        projectiles.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------ movimento
  function jump(f: Fighter) {
    if (f.grounded) {
      f.vy = -JUMP_V;
      f.grounded = false;
      events.push({ t, type: 'jump', p: f.i, double: false });
    } else if (f.jumps > 0 && f.st >= DJUMP_COST) {
      f.vy = -DJUMP_V;
      f.jumps -= 1;
      f.st -= DJUMP_COST;
      events.push({ t, type: 'jump', p: f.i, double: true });
    }
  }

  function dash(f: Fighter, dir: number, recover = false) {
    if (f.dashCd > t || f.st < DASH_COST) return;
    // esquiva nunca leva para cima do vazio (só a de recuperação, que volta para a arena)
    if (!recover && !groundBelow(f.x + dir * (f.grounded ? 150 : 190), f.y - 4)) return;
    f.st -= DASH_COST;
    f.dashCd = t + 22;
    f.iframes = Math.max(f.iframes, t + DASH_IFRAMES);
    f.act = { kind: 'dash', start: t, end: t + DASH_TICKS };
    f.vx = dir * DASH_V;
    f.vy = recover ? -420 : Math.min(f.vy, 0) * 0.3;
    f.facing = (dir > 0 ? 1 : -1) as 1 | -1;
    events.push({ t, type: 'dodge', p: f.i });
  }

  function physics(f: Fighter) {
    const stunned = f.status.freeze > t || f.status.shock > t;
    const controlling = f.act.kind === 'none' && !stunned;
    // movimento "por vontade própria" (não foi arremessado por um golpe)
    const voluntary = f.act.kind !== 'hitstun' && f.act.kind !== 'dead' && !stunned;
    if (f.act.kind === 'dash') {
      // mantém a velocidade do dash
    } else if (controlling) {
      const target = f.move * RUN * (1 + effectiveAttr(f.meta.attributes.dex) * C.runSpeedPerDex);
      const accel = f.grounded ? 3400 : 1800;
      const dv = target - f.vx;
      f.vx += clamp(dv, -accel * DT, accel * DT);
    } else if (f.act.kind === 'hitstun' || stunned) {
      f.vx *= f.grounded ? 0.82 : 0.985;
    } else if (f.act.kind === 'attack' && !f.grounded) {
      // atacando no ar: o embalo morre aos poucos (e rápido se embaixo é o vazio)
      f.vx *= groundBelow(f.x + f.vx * 0.25, f.y) ? 0.97 : 0.82;
    }
    const prevY = f.y;
    if (!f.grounded) f.vy = Math.min(MAX_FALL, f.vy + GRAV * DT);
    let nx = f.x + f.vx * DT;
    // nunca sai de uma plataforma para o vazio por conta própria (andando, avançando ou esquivando).
    // Sair de uma plataforma fina para o chão de baixo é permitido.
    if (voluntary && f.grounded) {
      const on = standingOn(f);
      if (on && (nx < on.x || nx > on.x + on.w) && !groundBelow(nx, f.y + 2)) {
        nx = clamp(nx, on.x + 3, on.x + on.w - 3);
        f.vx = 0;
      }
    }
    f.x = nx;
    f.y += f.vy * DT;

    // aterrissagem em plataformas (só caindo, de cima)
    if (f.vy >= 0) {
      for (const p of map.platforms) {
        if (f.x < p.x || f.x > p.x + p.w) continue;
        if (p.thin && f.dropUntil > t) continue;
        if (prevY <= p.y + 1 && f.y >= p.y) {
          const hard = f.vy > 900;
          f.y = p.y;
          f.vy = 0;
          if (!f.grounded) {
            f.landedAt = t;
            if (f.act.kind !== 'hitstun' || hard) events.push({ t, type: 'land', p: f.i, x: Math.round(f.x), y: p.y, hard });
          }
          f.grounded = true;
          f.onThin = p.thin;
          f.jumps = 1;
          if (f.act.kind === 'hitstun' && f.act.tumble) f.act.end = Math.min(f.act.end, t + 6);
          break;
        }
      }
    }
    // agarrar a borda: caindo logo ao lado de uma plataforma sólida → sobe
    if (!f.grounded && f.vy > 0 && f.act.kind !== 'hitstun' && f.status.freeze <= t && f.status.shock <= t) {
      for (const p of solids) {
        const nearLeft = f.x < p.x && p.x - f.x < 44;
        const nearRight = f.x > p.x + p.w && f.x - (p.x + p.w) < 44;
        if ((nearLeft || nearRight) && f.y > p.y && f.y - p.y < 110) {
          f.x = nearLeft ? p.x + 6 : p.x + p.w - 6;
          f.y = p.y;
          f.vy = 0;
          f.vx = 0;
          f.grounded = true;
          f.onThin = false;
          f.jumps = 1;
          f.landedAt = t;
          events.push({ t, type: 'land', p: f.i, x: Math.round(f.x), y: p.y, hard: false });
          break;
        }
      }
    }
    if (f.grounded) {
      const on = map.platforms.some((p) => f.x >= p.x && f.x <= p.x + p.w && Math.abs(f.y - p.y) < 1.5);
      if (!on) f.grounded = false;
      else f.vx *= f.act.kind === 'none' ? 1 : 0.88;
    }
  }

  // ------------------------------------------------------------ IA
  function reachOf(f: Fighter, def: AttackDef) {
    if (def.kind === 'projectile' || def.kind === 'pull') return def.range;
    if (def.kind === 'area' && def.range >= 250) return def.range;
    if (def.kind === 'leap') return 300;
    if (def.kind === 'dash') return def.range * f.reach + 30;
    if (def.kind === 'heal') return 9999;
    return meleeReach(f.weapon, def) * f.reach + 2;
  }

  function inRange(f: Fighter, o: Fighter, def: AttackDef) {
    const dx = Math.abs(o.x - f.x);
    const dy = o.y - f.y;
    const r = reachOf(f, def);
    if (def.kind === 'projectile' || def.kind === 'pull') return dx <= r && Math.abs(dy) < 140;
    if (def.kind === 'area' && def.range >= 250) return dx <= r && Math.abs(dy) < 260;
    if (def.kind === 'leap') return dx >= 70 && dx <= Math.min(r, 280) && dy > -140 && dy < 80;
    return dx <= r + o.meta.hitbox.w / 2 && dy > -f.meta.hitbox.h * 0.8 && dy < o.meta.hitbox.h * 0.8;
  }

  /**
   * Ir até a plataforma do oponente: sobe pulando (com pulo duplo), desce pela
   * plataforma fina ou pela borda, e pula vãos. Retorna false se não há caminho.
   */
  function navigate(f: Fighter, o: Fighter): boolean {
    const cur = supportIdx(f.x, f.y);
    const goal = supportIdx(o.x, o.y);
    if (cur < 0 || goal < 0 || cur === goal) {
      f.navTo = -1;
      return false;
    }
    const nx = nextStep(cur, goal);
    if (nx < 0) {
      f.navTo = -1;
      return false;
    }
    f.navTo = nx;
    const c = plats[cur], n = plats[nx];
    if (!f.grounded) {
      // no ar: mira na plataforma de destino e usa o pulo duplo se ainda estiver abaixo dela
      const tx = clamp(f.x, n.x + 30, n.x + n.w - 30);
      f.move = Math.abs(tx - f.x) > 8 ? sign(tx - f.x) : 0;
      if (n.y < c.y - 20 && f.y > n.y - 20 && f.vy > -160 && f.jumps > 0) f.wantJump = true;
      return true;
    }
    const up = c.y - n.y;
    if (up > 20) {
      // subir: vai para baixo da plataforma de cima (ou para a borda mais perto dela) e pula
      const tx = clamp(clamp(f.x, n.x + 30, n.x + n.w - 30), c.x + 8, c.x + c.w - 8);
      if (Math.abs(f.x - tx) > 14) f.move = sign(tx - f.x);
      else {
        f.move = sign(n.x + n.w / 2 - f.x) || 0;
        f.wantJump = true;
      }
      return true;
    }
    if (up < -20) {
      // descer
      if (c.thin && f.x >= n.x + 10 && f.x <= n.x + n.w - 10) {
        f.move = 0;
        f.wantDrop = true;
        return true;
      }
      const goRight = n.x + n.w / 2 > c.x + c.w / 2 ? (n.x + n.w > c.x + c.w) : !(n.x < c.x);
      const dir = c.thin && f.x >= n.x && f.x <= n.x + n.w ? 0 : goRight ? 1 : -1;
      const edge = dir > 0 ? c.x + c.w : c.x;
      f.move = dir || sign(n.x + n.w / 2 - f.x);
      // vão entre a borda e a plataforma de baixo: pula para fora
      if (dir && Math.abs(f.x - edge) < 34 && !groundBelow(edge + dir * 12, f.y + 2)) f.wantJump = true;
      return true;
    }
    // mesma altura, com um vão no meio: corre e pula na borda
    const dir = sign(n.x + n.w / 2 - f.x);
    const edge = dir > 0 ? c.x + c.w : c.x;
    f.move = dir;
    if (Math.abs(f.x - edge) < 40) f.wantJump = true;
    return true;
  }

  function think(f: Fighter) {
    const o = fighters[1 - f.i];
    f.wantJump = false;
    f.wantDrop = false;
    f.wantDash = 0;
    f.wantAttack = 0;
    const dx = o.x - f.x;
    const dist = Math.abs(dx);
    const dy = o.y - f.y;
    const a1 = f.weapon.a1;
    const a2 = f.weapon.a2;
    const ranged = (a1.kind === 'projectile' || (a1.kind === 'area' && a1.range >= 250));
    // em perigo: no ar e sem nada embaixo
    const overVoid = !f.grounded && !groundBelow(f.x, f.y, 6);

    // 1) voltar para a arena: mira na plataforma sólida mais próxima
    if (overVoid) {
      const p = nearestSolid(f.x, f.y);
      const tx = clamp(f.x, p.x + 30, p.x + p.w - 30);
      const dir = sign(tx - f.x);
      const horiz = Math.abs(tx - f.x);
      f.move = dir;
      const below = f.y > p.y - 30;
      if (f.jumps > 0 && (f.vy > -120 || below)) f.wantJump = true;
      else if (f.jumps === 0 && (below || f.vy > 60 || horiz > 150)) f.wantDash = dir;
      return;
    }
    // ainda no ar a caminho de outra plataforma
    if (!f.grounded && f.navTo >= 0 && f.act.kind === 'none' && navigate(f, o)) return;
    const plat = standingOn(f);
    const edgeL = plat ? plat.x : stageMin;
    const edgeR = plat ? plat.x + plat.w : stageMax;
    // 2) esquivar de um golpe que está vindo
    const oa = o.act;
    if (oa.kind === 'attack' && oa.def && t - oa.start < (oa.windup ?? 0) && inRange(o, f, oa.def)) {
      const chance = C.dodgeBase + effectiveAttr(f.meta.attributes.fort) * C.dodgePerFortitude;
      if (rng() < chance && f.st >= DASH_COST + 4) {
        const away = sign(f.x - o.x);
        const nearEdge = f.x + away * 140 < edgeL || f.x + away * 140 > edgeR;
        f.wantDash = nearEdge ? -away : away;
        return;
      }
    }
    // 2b) projétil vindo: guerreiros corpo a corpo atravessam com esquiva
    if (!ranged && f.grounded && f.st >= DASH_COST + 4) {
      const incoming = projectiles.some((p) => p.owner !== f.i && Math.abs(p.x - f.x) < 190 && sign(f.x - p.x) === sign(p.vx) && Math.abs(p.y - (f.y - f.meta.hitbox.h / 2)) < 90);
      if (incoming && rng() < 0.65) {
        f.wantDash = sign(dx);
        return;
      }
    }
    // 3) curar com pouca vida
    if (a2.kind === 'heal' && f.hp < f.meta.maxHp * 0.45 && f.mp >= a2.mana && rng() < 0.5) {
      f.wantAttack = 2;
      return;
    }
    // 4) atacar
    const opStunned = o.act.kind === 'hitstun' || o.status.freeze > t || o.status.shock > t;
    const canA2 = f.st >= a2.stamina && f.mp >= a2.mana && a2.kind !== 'heal';
    const canA1 = f.st >= a1.stamina && f.mp >= a1.mana;
    const safeLeap = (def: AttackDef) => def.kind !== 'leap' || (o.grounded && !!groundBelow(o.x, o.y));
    // avanço corpo a corpo só se o caminho até o alvo tiver chão
    const safeDash = (def: AttackDef) => def.kind !== 'dash' || !!groundBelow(f.x + sign(dx) * Math.min(dist, def.range), f.y - 4);
    const safe = (def: AttackDef) => safeLeap(def) && safeDash(def);
    if (!isDead(o) && o.iframes <= t + 2) {
      const pA2 = 0.28 + (opStunned ? 0.35 : 0) + (o.hp < o.meta.maxHp * 0.3 ? 0.15 : 0);
      if (canA2 && safe(a2) && inRange(f, o, a2) && rng() < pA2 * (0.7 + f.aggression)) {
        f.facing = sign(dx) as 1 | -1;
        f.wantAttack = 2;
        return;
      }
      if (canA1 && safe(a1) && inRange(f, o, a1) && rng() < 0.55 + f.aggression * 0.4) {
        f.facing = sign(dx) as 1 | -1;
        f.wantAttack = 1;
        return;
      }
    }
    // 4b) corpo a corpo fecha a distância com um avanço
    if (!ranged && f.grounded && dist > reachOf(f, a1) + 30 && dist < 330 && Math.abs(dy) < 60 && f.st >= DASH_COST + a1.stamina && rng() < 0.22 && groundBelow(f.x + sign(dx) * 160, f.y - 4)) {
      f.wantDash = sign(dx);
      return;
    }
    // 4c) em plataformas diferentes: vai até o oponente (sem ficar só olhando e pulando)
    const myP = supportIdx(f.x, f.y), opP = supportIdx(o.x, o.y);
    if (myP >= 0 && opP >= 0 && myP !== opP && !isDead(o)) {
      const oRanged = o.weapon.a1.kind === 'projectile' || (o.weapon.a1.kind === 'area' && o.weapon.a1.range >= 250);
      const canShoot = ranged && Math.abs(dy) < 120 && dist <= reachOf(f, a1);
      const lower = f.y > o.y + 20;
      const level = Math.abs(dy) <= 20;
      // quem está embaixo sobe; quem está em cima desce se o outro atira de longe (ou às vezes)
      if (!canShoot && (lower || level || oRanged || rng() < 0.35) && navigate(f, o)) return;
    } else f.navTo = -1;
    // 5) posicionamento
    const lowSt = f.st < Math.min(a1.stamina + 6, f.meta.maxSt * 0.25);
    const desired = ranged ? 250 : Math.max(40, reachOf(f, a1) * 0.6);
    let move = 0;
    if (lowSt && dist < 220) move = -sign(dx);
    else if (dist > desired + 25) move = sign(dx);
    else if (ranged && dist < desired - 90) move = -sign(dx);
    if (dist < 30 && Math.abs(dy) < 20 && rng() < 0.3) move = -sign(dx);
    if (move !== 0) {
      const ahead = f.x + move * 70;
      if (f.grounded && !groundBelow(ahead, f.y - 4)) {
        // borda à frente: se o alvo está do outro lado de um vão, pula; senão, não anda para o vazio
        const across = map.platforms.some((p) => {
          const gap = move > 0 ? p.x - edgeR : edgeL - (p.x + p.w);
          return gap > 0 && gap < 170 && p.y > f.y - 110 && p.y < f.y + 140;
        });
        if (across && sign(dx) === move && Math.abs(f.x - (move > 0 ? edgeR : edgeL)) < 40) f.wantJump = true;
        else if (!across) move = 0;
      } else if (!f.grounded && !groundBelow(f.x + move * 110, f.y)) {
        // no ar, não se afasta da terra firme
        const p = nearestSolid(f.x, f.y);
        move = sign(clamp(f.x, p.x + 30, p.x + p.w - 30) - f.x) || 0;
      }
    }
    f.move = move;
    // vertical
    if (dy < -70 && Math.abs(dx) < 260 && f.grounded) f.wantJump = true;
    else if (dy < -70 && !f.grounded && f.vy > 0 && f.jumps > 0) f.wantJump = true;
    else if (dy > 70 && f.grounded && f.onThin && Math.abs(dx) < 300) f.wantDrop = true;
    else if (f.grounded && rng() < 0.03) f.wantJump = true;
  }

  // ------------------------------------------------------------ KO / respawn
  function ko(f: Fighter, reason: 'hp' | 'ring' | 'legend') {
    f.lives -= 1;
    stats.kos[1 - f.i] += 1;
    events.push({ t, type: 'ko', p: f.i, reason, x: Math.round(clamp(f.x, map.blast.left + 40, map.blast.right - 40)), y: Math.round(clamp(f.y, map.blast.top + 40, map.blast.bottom - 40)) });
    f.act = { kind: 'dead', start: t, end: t + DEAD_TICKS };
    f.vx = 0;
    f.vy = 0;
    for (const k of Object.keys(f.status) as StatusEffect[]) f.status[k] = 0;
    if (reason === 'ring') {
      // fica escondido fora da tela até renascer
      f.x = clamp(f.x, map.blast.left, map.blast.right);
    }
    if (f.lives <= 0 && endTick < 0) {
      winner = 1 - f.i;
      endTick = t;
      events.push({ t, type: 'end', winner, reason: reason === 'legend' ? 'legend' : 'ko' });
    }
  }

  function respawn(f: Fighter) {
    const [sx, sy] = map.spawns[f.i];
    f.x = sx;
    f.y = sy - 260;
    f.vx = 0;
    f.vy = 0;
    f.grounded = false;
    f.hp = f.meta.maxHp;
    f.st = f.meta.maxSt;
    f.mp = Math.max(f.mp, f.meta.maxMp * 0.5);
    f.iframes = t + RESPAWN_IFRAMES;
    f.respawnedAt = t;
    f.act = { kind: 'none', start: t, end: t };
    events.push({ t, type: 'respawn', p: f.i });
  }

  // ------------------------------------------------------------ gravação
  function animOf(f: Fighter): number {
    if (endTick >= 0 && winner === f.i && t - endTick > 20) return ANIM.victory;
    if (f.act.kind === 'dead') return ANIM.dead;
    if (f.status.freeze > t) return ANIM.frozen;
    if (t - f.respawnedAt < 18) return ANIM.respawn;
    if (f.act.kind === 'hitstun') return f.act.tumble ? ANIM.tumble : ANIM.hitstun;
    if (f.status.shock > t) return ANIM.hitstun;
    if (f.act.kind === 'attack') return f.act.slot === 2 ? ANIM.attack2 : ANIM.attack1;
    if (f.act.kind === 'dash') return ANIM.dash;
    if (!f.grounded) return f.vy < 0 ? ANIM.jump : ANIM.fall;
    if (t - f.landedAt < 5) return ANIM.land;
    return Math.abs(f.vx) > 40 ? ANIM.run : ANIM.idle;
  }

  function record() {
    const row: number[] = [t];
    for (const f of fighters) {
      const code = animOf(f);
      // ataques sempre começam no início da ação
      const start = f.act.kind === 'attack' || f.act.kind === 'dead' ? f.act.start : code === f.anim ? f.animStart : t;
      if (code !== f.anim) f.anim = code;
      f.animStart = start;
      let flags = 0;
      if (f.iframes > t) flags |= FLAG.iframes;
      if (f.status.freeze > t) flags |= FLAG.freeze;
      if (f.status.poison > t) flags |= FLAG.poison;
      if (f.status.burn > t) flags |= FLAG.burn;
      if (f.status.bleed > t) flags |= FLAG.bleed;
      if (f.status.shock > t) flags |= FLAG.shock;
      row.push(
        Math.round(f.x * 2) / 2, Math.round(f.y * 2) / 2, f.facing, code, t - start,
        Math.round(f.hp), Math.round(f.st), Math.round(f.mp), f.lives, flags,
      );
    }
    row.push(projectiles.length);
    for (const p of projectiles) row.push(p.id, Math.round(p.x), Math.round(p.y));
    frames.push(row);
  }

  /** Começa o evento: para tudo e coloca os dois frente a frente na maior plataforma. */
  function startLegend(pl: LegendPlan) {
    const a = fighters[pl.p], b = fighters[1 - pl.p];
    const mid = (a.x + b.x) / 2;
    const big = [...solids].sort((p, q) => q.w - p.w || Math.abs(p.x + p.w / 2 - mid) - Math.abs(q.x + q.w / 2 - mid))[0];
    const cx = big.x + big.w / 2;
    const d = a.x <= b.x ? 1 : -1;
    const place = (f: Fighter, x: number, facing: 1 | -1) => {
      f.x = clamp(x, big.x + 30, big.x + big.w - 30);
      f.y = big.y;
      f.vx = 0;
      f.vy = 0;
      f.grounded = true;
      f.onThin = false;
      f.facing = facing;
      f.act = { kind: 'none', start: t, end: t };
      f.iframes = 0;
      for (const k of Object.keys(f.status) as StatusEffect[]) f.status[k] = 0;
      f.move = 0;
      f.wantAttack = 0;
      f.wantDash = 0;
      f.wantJump = false;
    };
    place(a, cx - d * 110, d as 1 | -1);
    place(b, cx + d * 110, (-d) as 1 | -1);
    for (const p of projectiles) events.push({ t, type: 'projEnd', id: p.id, x: Math.round(p.x), y: Math.round(p.y), hit: false });
    projectiles.length = 0;
    legStart = t;
    legEnd = t + LEG;
    legKo = t + Math.round(LEG * C.legendKoFrac);
    events.push({ t, type: 'legend', p: pl.p, variant: pl.variant, dur: LEG, ko: legKo, ax: Math.round(a.x), bx: Math.round(b.x), y: big.y });
  }

  // ============================================================ loop principal
  for (t = 0; t <= MAX_TICKS + LEG + 90; t++) {
    // evento lendário: começa quando os dois estão vivos em campo
    if (plan && legStart < 0 && endTick < 0 && t >= plan.at && fighters.every((f) => f.lives > 0 && !isDead(f) && f.act.kind !== 'hitstun')) startLegend(plan);
    if (inLegend()) {
      // tudo parado: a cena acontece no cliente; no golpe final o adversário cai de vez
      if (t === legKo) {
        const v = fighters[1 - plan!.p];
        v.lives = 1;
        ko(v, 'legend');
      }
      if (t % FRAME_EVERY === 0) record();
      continue;
    }
    // alterna a ordem a cada tick para nenhum lado ter vantagem
    const order = t % 2 === 0 ? [fighters[0], fighters[1]] : [fighters[1], fighters[0]];
    for (const f of order) {
      const o = fighters[1 - f.i];
      // fim de ação
      if (f.act.kind !== 'none' && t >= f.act.end) {
        if (f.act.kind === 'dead') {
          if (f.lives > 0) respawn(f);
          else f.act.end = t + 999999;
        } else f.act = { kind: 'none', start: t, end: t };
      }
      if (isDead(f)) continue;

      // dano contínuo
      const dot = (s: StatusEffect, perSec: number) => {
        if (f.status[s] > t) {
          const d = (f.dotPower[s] * perSec * suddenDeath(t)) / TICK;
          f.hp = Math.max(0, f.hp - d);
          stats.damage[1 - f.i] += d;
        }
      };
      dot('poison', C.status.poisonPerSec);
      dot('burn', C.status.burnPerSec);
      dot('bleed', C.status.bleedPerSec);

      // regeneração
      const busy = f.act.kind === 'attack';
      f.st = Math.min(f.meta.maxSt, f.st + f.regenSt * DT * (busy ? 0.25 : 1));
      f.mp = Math.min(f.meta.maxMp, f.mp + f.regenMp * DT);

      // IA
      if (endTick < 0 && t >= f.nextThink && canAct(f)) {
        think(f);
        f.nextThink = t + f.reaction + Math.floor(rng() * 4);
      }
      if (canAct(f)) {
        if (f.move !== 0 && f.grounded) f.facing = sign(f.move) as 1 | -1;
        if (!f.grounded && Math.abs(o.x - f.x) > 20 && f.move === 0) f.facing = sign(o.x - f.x) as 1 | -1;
        if (f.wantDash) {
          dash(f, f.wantDash, f.x < stageMin || f.x > stageMax);
          f.wantDash = 0;
        } else if (f.wantAttack) {
          if (Math.abs(o.x - f.x) > 4) f.facing = sign(o.x - f.x) as 1 | -1;
          startAttack(f, f.wantAttack);
          f.wantAttack = 0;
          f.move = 0;
        } else {
          if (f.wantJump) {
            jump(f);
            f.wantJump = false;
          }
          if (f.wantDrop && f.grounded && f.onThin) {
            f.dropUntil = t + 8;
            f.grounded = false;
            f.y += 2;
            f.wantDrop = false;
          }
        }
      } else if (endTick >= 0 && f.act.kind === 'none') {
        f.move = 0;
      }
      updateAttack(f);
      physics(f);
    }
    updateProjectiles();

    // KOs
    for (const f of order) {
      if (isDead(f) || f.lives <= 0) continue;
      const out = f.x < map.blast.left || f.x > map.blast.right || f.y > map.blast.bottom || f.y < map.blast.top;
      if (out) ko(f, 'ring');
      else if (f.hp <= 0) ko(f, 'hp');
    }

    // tempo esgotado
    if (endTick < 0 && t >= MAX_TICKS) {
      const [a, b] = fighters;
      const score = (f: Fighter) => f.lives * 10 + f.hp / f.meta.maxHp;
      winner = score(a) === score(b) ? null : score(a) > score(b) ? 0 : 1;
      endTick = t;
      events.push({ t, type: 'end', winner, reason: 'time' });
    }

    if (t % FRAME_EVERY === 0) record();
    if (endTick >= 0 && t >= Math.max(endTick + 75, legEnd + 30)) break;
  }

  return {
    v: 1,
    seed: opts.seed,
    map: map.id,
    tickRate: TICK,
    frameEvery: FRAME_EVERY,
    duration: t,
    winner,
    fighters: [fighters[0].meta, fighters[1].meta],
    frames,
    events,
    stats: { ...stats, damage: [Math.round(stats.damage[0]), Math.round(stats.damage[1])] as [number, number] },
  };
}
