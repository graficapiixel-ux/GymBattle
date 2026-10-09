/**
 * Poses de cada animação. Tudo é função do tempo (sem estado), então qualquer
 * cliente que desenhe o mesmo replay no mesmo instante vê a mesma pose.
 */
import { ANIM, type AttackDef, type WeaponDef } from '@gymbattle/shared';
import { idlePose, weaponShape, type Pose } from '../rig';

type Shape = ReturnType<typeof weaponShape>;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

function mix(a: Pose, b: Pose, t: number): Pose {
  const k = ease(t);
  return {
    bob: lerp(a.bob, b.bob, k),
    lean: lerp(a.lean, b.lean, k),
    head: lerp(a.head, b.head, k),
    armB: [lerp(a.armB[0], b.armB[0], k), lerp(a.armB[1], b.armB[1], k)],
    armF: [lerp(a.armF[0], b.armF[0], k), lerp(a.armF[1], b.armF[1], k)],
    legB: [lerp(a.legB[0], b.legB[0], k), lerp(a.legB[1], b.legB[1], k)],
    legF: [lerp(a.legF[0], b.legF[0], k), lerp(a.legF[1], b.legF[1], k)],
    weapon: lerp(a.weapon, b.weapon, k),
    twoHanded: a.twoHanded,
  };
}

export type Motion = 'swing' | 'slam' | 'combo' | 'thrust' | 'spin' | 'throw' | 'cast' | 'castUp' | 'bow' | 'leap' | 'heal' | 'stab';

export function motionOf(w: WeaponDef, def: AttackDef): Motion {
  const shape = weaponShape(w);
  if (def.kind === 'heal') return 'heal';
  if (def.kind === 'leap') return 'leap';
  if (shape === 'bow') return 'bow';
  if (def.vfx === 'spin' || def.vfx === 'whirlwind' || def.vfx === 'shadow_spin') return 'spin';
  if (def.kind === 'dash' || def.vfx === 'thrust') return 'thrust';
  if (shape === 'staff' || shape === 'seal') return def.kind === 'area' && def.range >= 250 ? 'castUp' : 'cast';
  if (def.kind === 'area' && def.range >= 250) return 'castUp';
  if (def.kind === 'projectile' || def.kind === 'pull') return 'throw';
  if (def.kind === 'area') return 'slam';
  if (shape === 'dagger') return 'stab';
  if (def.kind === 'combo') return 'combo';
  return 'swing';
}

export interface AttackTiming {
  start: number;
  windup: number;
  active: number;
  recovery: number;
}

/** Pose durante um ataque. `local` = ticks (fracionários) desde o início. */
export function attackPose(shape: Shape, motion: Motion, hits: number, timing: AttackTiming, local: number, time: number): Pose {
  const base = idlePose(shape, time);
  const { windup: W, active: A, recovery: R } = timing;
  const pw = local / W; // preparação
  const pa = (local - W) / Math.max(1, A); // golpe
  const pr = (local - W - A) / Math.max(1, R); // recuperação
  const heavy = shape === 'greatsword' || shape === 'hammer' || shape === 'axe';

  const raised: Pose = { ...base, lean: -0.12, armF: [-2.4, 0.5], armB: [-1.6, 0.6], weapon: -2.3, legF: [0.35, -0.25], legB: [-0.3, 0.1], twoHanded: heavy || base.twoHanded };
  const struck: Pose = { ...base, lean: 0.35, bob: 3, armF: [1.35, 0.15], armB: [0.9, 0.5], weapon: 2.35, legF: [0.55, -0.3], legB: [-0.45, 0.1], twoHanded: raised.twoHanded };
  const upStrike: Pose = { ...struck, armF: [0.9, 1.2], weapon: 0.4, lean: 0.15 };

  let p: Pose;
  switch (motion) {
    case 'swing':
    case 'slam': {
      const r = motion === 'slam' ? { ...raised, weapon: -3.0, armF: [-2.9, 0.2] as [number, number] } : raised;
      const s = motion === 'slam' ? { ...struck, lean: 0.55, bob: 7, weapon: 2.9, armF: [1.6, 0] as [number, number] } : struck;
      if (local < W) p = mix(base, r, easeOut(pw));
      else if (local < W + A) p = mix(r, s, easeOut(pa * 1.4));
      else p = mix(s, base, pr);
      break;
    }
    case 'combo': {
      if (local < W) p = mix(base, raised, easeOut(pw));
      else if (local < W + A) {
        const n = Math.max(1, hits);
        const seg = Math.min(n - 1, Math.floor(pa * n));
        const k = pa * n - seg;
        const from = seg === 0 ? raised : seg % 2 === 1 ? struck : upStrike;
        const to = seg % 2 === 0 ? struck : upStrike;
        p = mix(from, to, easeOut(k * 1.3));
      } else p = mix(hits % 2 === 0 ? upStrike : struck, base, pr);
      break;
    }
    case 'stab': {
      const back: Pose = { ...base, armF: [0.1, 1.8], weapon: 1.9, lean: 0.05 };
      const out: Pose = { ...base, armF: [1.5, 0.05], weapon: 1.57, lean: 0.3, legF: [0.5, -0.2], legB: [-0.4, 0.1] };
      const outB: Pose = { ...out, armF: [0.3, 1.5], armB: [1.5, 0.05], weapon: 1.57 };
      if (local < W) p = mix(base, back, easeOut(pw));
      else if (local < W + A) {
        const n = Math.max(1, hits);
        const k = (pa * n) % 1;
        const seg = Math.floor(pa * n);
        p = mix(back, seg % 2 === 0 ? out : outB, k < 0.5 ? easeOut(k * 2) : 1 - (k - 0.5));
      } else p = mix(out, base, pr);
      break;
    }
    case 'thrust': {
      const back: Pose = { ...base, lean: -0.05, armF: [-0.4, 1.4], armB: [-0.6, 1.2], weapon: 1.57, legF: [0.45, -0.35], legB: [-0.25, 0.1] };
      const out: Pose = { ...base, lean: 0.45, bob: 4, armF: [1.52, 0.02], armB: [0.8, 0.6], weapon: 1.57, legF: [0.8, -0.2], legB: [-0.7, 0.05] };
      if (local < W) p = mix(base, back, easeOut(pw));
      else if (local < W + A) p = mix(back, out, easeOut(pa * 2));
      else p = mix(out, base, pr);
      break;
    }
    case 'spin': {
      if (local < W) p = mix(base, { ...raised, armF: [0.2, 0.6], weapon: -1.4 }, easeOut(pw));
      else if (local < W + A) {
        const ang = pa * Math.PI * 2 * Math.max(1, hits);
        p = { ...struck, armF: [1.5, 0.1], weapon: 1.57 + ang, lean: 0.1 };
      } else p = mix({ ...struck, weapon: 1.57 }, base, pr);
      break;
    }
    case 'throw': {
      const r = { ...raised, weapon: -1.8, armF: [-2.0, 0.8] as [number, number] };
      const s = { ...struck, armF: [1.7, 0.1] as [number, number], weapon: 1.9 };
      if (local < W) p = mix(base, r, easeOut(pw));
      else if (local < W + A) p = mix(r, s, easeOut(pa * 2));
      else p = mix(s, base, pr);
      break;
    }
    case 'cast': {
      // cajado fica quase de pé (aponta a pedra para o alvo); selo vai à frente
      const staff = shape === 'staff';
      const charge: Pose = { ...base, lean: -0.08, armF: staff ? [0.9, 0.6] : [1.9, 0.5], armB: [0.8, 1.2], weapon: staff ? 0.3 : 0.9, legF: [0.35, -0.2] };
      const release: Pose = { ...base, lean: 0.25, armF: staff ? [1.35, 0.25] : [1.55, 0.05], armB: [0.4, 1.3], weapon: staff ? 0.75 : 1.35, legF: [0.5, -0.25], legB: [-0.4, 0.1] };
      if (local < W) p = mix(base, charge, easeOut(pw));
      else if (local < W + A) p = mix(charge, release, easeOut(pa * 3));
      else p = mix(release, base, pr);
      break;
    }
    case 'castUp': {
      const up: Pose = { ...base, lean: -0.15, bob: -2, armF: [2.9, 0.1], armB: [2.7, 0.2], weapon: 0.05, legF: [0.25, -0.1], legB: [-0.25, 0.05] };
      const down: Pose = { ...base, lean: 0.3, bob: 5, armF: [1.3, 0.1], armB: [1.0, 0.4], weapon: shape === 'staff' ? 0.6 : 1.2, legF: [0.5, -0.4], legB: [-0.5, 0.2] };
      if (local < W) p = mix(base, up, easeOut(pw));
      else if (local < W + A) p = mix(up, down, easeOut(pa * 2.5));
      else p = mix(down, base, pr);
      break;
    }
    case 'bow': {
      const draw: Pose = { ...base, lean: -0.05, armF: [1.55, 0], armB: [1.3, 2.0], weapon: 0 };
      const loose: Pose = { ...draw, armB: [0.9, 1.0] };
      if (local < W) p = mix(base, draw, easeOut(pw * 1.5));
      else if (local < W + A) p = mix(draw, loose, easeOut(pa * 3));
      else p = mix(loose, base, pr);
      break;
    }
    case 'leap': {
      const tuck: Pose = { ...raised, legF: [1.4, -2.0], legB: [0.9, -1.8], weapon: -2.6, armF: [-2.7, 0.3] };
      if (local < W) p = mix(base, { ...base, bob: 8, legF: [0.9, -1.6], legB: [-0.2, -1.4] }, easeOut(pw));
      else if (local < W + A) p = mix(tuck, { ...struck, weapon: 2.9, armF: [1.6, 0], lean: 0.6, bob: 8 }, easeOut(pa * 1.6));
      else p = mix({ ...struck, bob: 8 }, base, pr);
      break;
    }
    case 'heal': {
      const pray: Pose = { ...base, lean: -0.1, armF: [2.4, 0.6], armB: [2.2, 0.8], weapon: 0.2, head: -0.15 };
      if (local < W + A) p = mix(base, pray, easeOut(local / Math.max(1, W)));
      else p = mix(pray, base, pr);
      break;
    }
  }
  return p!;
}

/** Pose de movimento/reação a partir do código de animação. */
export function movePose(shape: Shape, anim: number, animT: number, time: number, vx: number): { pose: Pose; rot: number; alpha: number } {
  const base = idlePose(shape, time);
  switch (anim) {
    case ANIM.run: {
      const ph = animT * 0.62;
      const s = Math.sin(ph);
      const c = Math.cos(ph);
      return {
        pose: {
          ...base,
          bob: -Math.abs(c) * 3,
          lean: 0.2,
          legF: [s * 0.75, -0.2 - Math.max(0, -c) * 1.1],
          legB: [-s * 0.75, -0.2 - Math.max(0, c) * 1.1],
          armB: [s * 0.7, 0.9],
          armF: shape === 'fist' ? [-s * 0.7, 0.9] : [base.armF[0] - s * 0.2, base.armF[1]],
        },
        rot: 0,
        alpha: 1,
      };
    }
    case ANIM.jump:
      return { pose: { ...base, bob: -2, lean: 0.05, legF: [0.9, -1.5], legB: [-0.1, -1.1], armB: [-1.2, 0.8] }, rot: 0, alpha: 1 };
    case ANIM.fall:
      return { pose: { ...base, lean: -0.05, legF: [0.35, -0.4], legB: [-0.3, -0.2], armB: [-1.9, 0.4] }, rot: 0, alpha: 1 };
    case ANIM.dash:
      return {
        pose: { ...base, lean: 0.7, bob: 6, legF: [1.1, -0.9], legB: [-1.0, 0.1], armB: [-1.4, 0.3], armF: [0.9, 0.5] },
        rot: 0,
        alpha: 0.75,
      };
    case ANIM.land:
      return { pose: { ...base, bob: 7 - animT * 1.2, legF: [0.7, -1.2], legB: [-0.4, -0.9], lean: 0.25 }, rot: 0, alpha: 1 };
    case ANIM.hitstun:
    case ANIM.frozen:
      return {
        pose: { ...base, lean: -0.4, head: -0.3, armF: [-0.8, 0.9], armB: [-1.8, 0.7], legF: [0.5, -0.3], legB: [-0.5, 0.1], weapon: -0.6 },
        rot: 0,
        alpha: 1,
      };
    case ANIM.tumble:
      return {
        pose: { ...base, lean: -0.3, armF: [-2.2, 0.4], armB: [-2.6, 0.3], legF: [0.8, -1.0], legB: [-0.6, -0.4], weapon: -1.2 },
        rot: -animT * 0.55 * Math.sign(vx || 1),
        alpha: 1,
      };
    case ANIM.dead: {
      const k = Math.min(1, animT / 14);
      return {
        pose: { ...base, lean: -1.2 * k, bob: 20 * k, head: -0.4, armF: [-1.5, 0.3], armB: [-2.0, 0.3], legF: [0.9 * k, -0.2], legB: [0.6 * k, 0] },
        rot: 0,
        alpha: 1 - Math.max(0, (animT - 16) / 18),
      };
    }
    case ANIM.respawn:
      return { pose: base, rot: 0, alpha: 0.5 + 0.5 * Math.abs(Math.sin(animT * 0.6)) };
    case ANIM.victory: {
      const k = Math.min(1, animT / 10);
      return {
        pose: { ...base, armF: [lerp(base.armF[0], 2.9, k), lerp(base.armF[1], 0.1, k)], weapon: lerp(base.weapon, 0, k), lean: -0.1 * k, bob: -Math.abs(Math.sin(time * 5)) * 2 },
        rot: 0,
        alpha: 1,
      };
    }
    default:
      return { pose: base, rot: 0, alpha: 1 };
  }
}
