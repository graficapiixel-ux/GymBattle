/**
 * Avatar esquelético 2D em camadas (Canvas 2D).
 *
 * Ossos: quadril → tronco → pescoço → cabeça; ombros → braço → antebraço → mão;
 * quadril → coxa → canela → pé. Cada osso tem um ângulo (0 = apontando para baixo,
 * positivo = gira para a frente). Roupas, armaduras e armas são desenhadas por cima
 * dos ossos, então qualquer armadura funciona com qualquer arma e qualquer altura.
 *
 * Unidades: um avatar de altura 1,0 tem ~100 unidades do chão ao topo da cabeça.
 */
import {
  ARMOR_SETS_BY_ID, ELEMENT_COLOR, WEAPONS_BY_ID, clampHeight, parseArmorPieceId, weaponShapeOf,
  type ArmorSetDef, type AvatarLook, type Equipment, type WeaponCategory, type WeaponDef, type Element,
} from '@gymbattle/shared';

export interface Pose {
  /** Deslocamento vertical do quadril (respiração, agachar). */
  bob: number;
  /** Inclinação do tronco (rad, + para a frente). */
  lean: number;
  head: number;
  armB: [number, number];
  armF: [number, number];
  legB: [number, number];
  legF: [number, number];
  /** Ângulo absoluto da arma (0 = para cima, + para a frente). */
  weapon: number;
  /** Mão de trás segura a arma também (armas de duas mãos). */
  twoHanded?: boolean;
}

type V = { x: number; y: number };
const v = (x: number, y: number): V => ({ x, y });
const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y });
const dir = (angle: number, len: number): V => ({ x: Math.sin(angle) * len, y: Math.cos(angle) * len });
const lerp = (a: V, b: V, t: number): V => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** IK de 2 ossos: posiciona cotovelo e mão para alcançar `target` (cotovelo dobrando para baixo). */
function reach(sh: V, target: V, l1 = 15, l2 = 14): { el: V; hand: V } {
  const dx = target.x - sh.x;
  const dy = target.y - sh.y;
  const dist = Math.hypot(dx, dy) || 0.001;
  const d = Math.min(l1 + l2 - 0.05, Math.max(Math.abs(l1 - l2) + 0.05, dist));
  const a = Math.atan2(dy, dx);
  const b = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const e1 = { x: sh.x + Math.cos(a + b) * l1, y: sh.y + Math.sin(a + b) * l1 };
  const e2 = { x: sh.x + Math.cos(a - b) * l1, y: sh.y + Math.sin(a - b) * l1 };
  const el = e1.y >= e2.y ? e1 : e2;
  const hand = dist > l1 + l2 ? { x: sh.x + (dx / dist) * (l1 + l2), y: sh.y + (dy / dist) * (l1 + l2) } : target;
  return { el, hand };
}

const BODY = [
  { arm: 6.5, leg: 8.5, chest: 19, hip: 15 },
  { arm: 7.5, leg: 9.5, chest: 22, hip: 16 },
  { arm: 9, leg: 11, chest: 26, hip: 18 },
];

const DEFAULT_TOP = '#2a2a33';
const DEFAULT_SHORTS = '#3b3b48';
const SHOE = '#16161a';

export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * k)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * k)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * k)));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Categoria usada para escolher a pose/forma (híbridas imitam uma categoria). */
export function weaponShape(w: WeaponDef | undefined): WeaponCategory | 'fist' {
  return weaponShapeOf(w);
}

// ------------------------------------------------------------------ poses

export function idlePose(shape: ReturnType<typeof weaponShape>, t: number): Pose {
  const br = Math.sin(t * 2.2);
  const base: Pose = {
    bob: br * 0.7,
    lean: 0.06 + br * 0.01,
    head: -0.02 - br * 0.02,
    armB: [-0.25 + br * 0.03, 0.55],
    armF: [0.3 + br * 0.03, 1.05],
    legB: [-0.22, 0.1],
    legF: [0.26, -0.12],
    weapon: 0.4,
  };
  // pernas abertas em base de luta
  const stance = { legB: [-0.3, 0.14] as [number, number], legF: [0.36, -0.2] as [number, number], bob: 1.5 + br * 0.7 };
  switch (shape) {
    case 'sword': // guarda: espada à frente, apontada para cima e para o oponente
      return { ...base, ...stance, lean: 0.12, armF: [0.95 + br * 0.03, 0.85], armB: [0.55, 1.6], weapon: 0.75 + br * 0.02 };
    case 'greatsword': // espada grande nas duas mãos, lâmina para o alto
      return { ...base, ...stance, lean: 0.1, armF: [0.75 + br * 0.02, 1.0], weapon: 0.35 + br * 0.02, twoHanded: true };
    case 'katana': // chudan-no-kamae: ponta na altura do rosto do oponente
      return { ...base, ...stance, lean: 0.08, armF: [0.85 + br * 0.02, 0.95], weapon: 0.95 + br * 0.015, twoHanded: true };
    case 'dagger': // agachado, pegada invertida nas duas mãos
      return { ...base, bob: 4 + br * 0.7, lean: 0.25, armF: [0.55, 1.75], armB: [0.35, 1.9], weapon: 2.7, legF: [0.55, -0.55], legB: [-0.45, 0.25] };
    case 'axe': // machado de uma mão, cabeça para cima, outra mão em guarda
      return { ...base, ...stance, lean: 0.12, armF: [0.55 + br * 0.03, 1.15], armB: [0.5, 1.7], weapon: 0.55 };
    case 'hammer': // martelo apoiado no ombro, nas duas mãos
      return { ...base, ...stance, lean: 0.05, armF: [0.35, 1.9 + br * 0.03], weapon: -0.55 + br * 0.02, twoHanded: true };
    case 'spear': // lança na horizontal, apontada para o oponente, mão de trás no cabo
      return { ...base, ...stance, lean: 0.12, armF: [0.75 + br * 0.02, 0.75], weapon: 1.3 + br * 0.015, twoHanded: true };
    case 'scythe': // foice alta, lâmina por cima da cabeça
      return { ...base, ...stance, lean: 0.06, armF: [0.7 + br * 0.02, 0.95], weapon: 0.12 + br * 0.015, twoHanded: true };
    case 'staff': // cajado de pé ao lado do corpo, segurado pelo meio
      return { ...base, armF: [0.45, 0.75], armB: [0.35, 0.9 + br * 0.05], weapon: 0.05 + br * 0.01 };
    case 'bow':
      return { ...base, ...stance, armF: [1.1, 0.25], armB: [0.7, 1.7], weapon: 0.05 };
    case 'seal': // talismã erguido à frente, outra mão aberta
      return { ...base, ...stance, armF: [1.05, 0.95 + br * 0.05], armB: [0.6, 1.2], weapon: 0.15 };
    default: // punhos em guarda de boxe
      return { ...base, ...stance, lean: 0.12, armF: [0.55, 2.25 + br * 0.05], armB: [0.35, 2.35] };
  }
}

// ------------------------------------------------------------------ desenho

export interface DrawOpts {
  look: AvatarLook;
  equipment: Equipment;
  pose: Pose;
  /** 1 = olhando para a direita, -1 = esquerda. */
  facing?: 1 | -1;
  /** Tempo em segundos (animações de capa/partículas). */
  time?: number;
  /** Escala extra (a altura do avatar já é aplicada). */
  scale?: number;
  showHitbox?: { w: number; h: number } | null;
  /** Efeito de status desenhado no corpo. */
  status?: 'freeze' | 'poison' | 'burn' | 'shock' | null;
}

function limb(ctx: CanvasRenderingContext2D, a: V, b: V, width: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function circle(ctx: CanvasRenderingContext2D, c: V, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.fill();
}

function piece(eq: Equipment, slot: 'helm' | 'chest' | 'gloves' | 'legs'): ArmorSetDef | null {
  const id = eq[slot];
  if (!id) return null;
  const p = parseArmorPieceId(id);
  return p ? p.set : null;
}

/** Desenha o avatar com os pés na origem atual do contexto. */
const WEAPON_LEN: Record<string, number> = {
  sword: 46, greatsword: 70, katana: 60, dagger: 20, axe: 48, hammer: 50, spear: 92, scythe: 74, bow: 28, staff: 74, seal: 10, fist: 6,
};

/** Desliga brilhos caros (modo "gráficos baixos"). */
export const RENDER_OPTS = { lowFx: false };

/**
 * Desenha o avatar com os pés na origem atual do contexto.
 * Retorna a posição da ponta da arma e da mão (relativas aos pés) — usada para rastros.
 */
export function drawAvatar(ctx: CanvasRenderingContext2D, o: DrawOpts): { tip: V; hand: V } {
  const { look, equipment: eq, pose } = o;
  const t = o.time ?? 0;
  const facing = o.facing ?? 1;
  const hScale = clampHeight(look.height);
  const S = hScale * (o.scale ?? 1);
  const fem = look.gender === 1;
  const body0 = BODY[look.body] ?? BODY[1];
  // corpo feminino: ombros e braços mais finos, quadril mais largo
  const body = fem ? { arm: body0.arm * 0.86, leg: body0.leg * 0.96, chest: body0.chest * 0.84, hip: body0.hip * 1.12 } : body0;
  const topDefault = look.top ?? DEFAULT_TOP;
  const shortsDefault = look.shorts ?? DEFAULT_SHORTS;
  const skin = look.skin;
  const skinB = shade(skin, 0.82);

  const helm = piece(eq, 'helm');
  const chest = piece(eq, 'chest');
  const gloves = piece(eq, 'gloves');
  const legs = piece(eq, 'legs');
  const weapon = eq.weapon ? WEAPONS_BY_ID[eq.weapon] : undefined;
  const fxSet = [chest, helm, legs, gloves].find((p) => p?.style.fx);
  const fx = fxSet?.style.fx;

  // hitbox (em coordenadas do mundo, sem espelhamento)
  if (o.showHitbox) {
    ctx.save();
    ctx.strokeStyle = 'rgba(200,255,61,0.9)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-o.showHitbox.w / 2 * (o.scale ?? 1), -o.showHitbox.h * (o.scale ?? 1), o.showHitbox.w * (o.scale ?? 1), o.showHitbox.h * (o.scale ?? 1));
    ctx.restore();
  }

  ctx.save();
  ctx.scale(facing * S, S);

  // ------------- esqueleto
  const hip = v(0, -44 + pose.bob);
  const up = v(Math.sin(pose.lean), -Math.cos(pose.lean));
  const neck = add(hip, { x: up.x * 30, y: up.y * 30 });
  const headC = add(neck, dir(Math.PI + pose.lean + pose.head, 11));
  const shF = add(lerp(hip, neck, 0.88), v(2, 0));
  const shB = add(lerp(hip, neck, 0.88), v(-2, 0));
  const elbowF = add(shF, dir(pose.armF[0], 15));
  const handF = add(elbowF, dir(pose.armF[0] + pose.armF[1], 14));
  let elbowB = add(shB, dir(pose.armB[0], 15));
  let handB = add(elbowB, dir(pose.armB[0] + pose.armB[1], 14));
  const hipF = add(hip, v(2, 0));
  const hipB = add(hip, v(-2, 0));
  const kneeF = add(hipF, dir(pose.legF[0], 21));
  const footF = add(kneeF, dir(pose.legF[0] + pose.legF[1], 21));
  const kneeB = add(hipB, dir(pose.legB[0], 21));
  const footB = add(kneeB, dir(pose.legB[0] + pose.legB[1], 21));

  // ------------- aura / glow
  if (fx?.glow) {
    const g = ctx.createRadialGradient(0, -48, 4, 0, -48, 70);
    g.addColorStop(0, fx.glow + '55');
    g.addColorStop(1, fx.glow + '00');
    ctx.fillStyle = g;
    ctx.fillRect(-80, -130, 160, 140);
  }

  // ------------- capa (atrás de tudo)
  if (fx?.cape) {
    const wave = Math.sin(t * 3) * 4;
    const wave2 = Math.sin(t * 3 + 1.3) * 6;
    ctx.fillStyle = shade(fx.cape, 0.85);
    ctx.beginPath();
    ctx.moveTo(shB.x - 4, shB.y - 2);
    ctx.quadraticCurveTo(-22 + wave, hip.y + 4, -30 + wave2, footB.y - 8);
    ctx.lineTo(-8 + wave, footB.y - 12);
    ctx.quadraticCurveTo(-6, hip.y, shF.x + 2, shF.y - 2);
    ctx.closePath();
    ctx.fill();
  }

  // armas de duas mãos: a mão de trás segura o cabo de verdade (IK)
  const shapeW = weaponShape(weapon);
  const grip2 = SECOND_GRIP[shapeW];
  if (weapon && grip2 !== undefined && pose.twoHanded !== false) {
    const wd = v(Math.sin(pose.weapon), -Math.cos(pose.weapon));
    const r = reach(shB, add(handF, v(wd.x * grip2, wd.y * grip2)));
    elbowB = r.el;
    handB = r.hand;
  }

  const topColor = chest ? chest.style.primary : topDefault;

  // ------------- perna de trás
  drawLeg(ctx, hipB, kneeB, footB, body.leg, skinB, legs, true, shortsDefault);
  // ------------- braço de trás (e arma de duas mãos por trás)
  drawArm(ctx, shB, elbowB, handB, body.arm, skinB, chest, gloves, true);
  if (weapon && weaponShape(weapon) === 'dagger') drawWeaponAt(ctx, weapon, handB, pose.weapon + 0.3, t, true);

  // ------------- tronco
  drawTorso(ctx, hip, neck, pose.lean, body.chest, body.hip, skin, chest, topColor, t, fem);
  // ------------- perna da frente
  drawLeg(ctx, hipF, kneeF, footF, body.leg, skin, legs, false, shortsDefault);
  // saia/robe por cima das pernas
  if (legs && (legs.style.legs === 'robe_skirt' || legs.style.legs === 'hakama')) drawSkirt(ctx, hip, kneeF, kneeB, legs);
  if (chest && (chest.style.chest === 'robe' || chest.style.chest === 'coat')) drawCoatTail(ctx, hip, kneeF, kneeB, chest, t);
  // cinto
  ctx.fillStyle = chest ? chest.style.secondary : '#111114';
  ctx.save();
  ctx.translate(hip.x, hip.y);
  ctx.rotate(pose.lean);
  ctx.fillRect(-body.hip / 2 - 1, -3, body.hip + 2, 5);
  if (chest) {
    ctx.fillStyle = chest.style.accent;
    ctx.fillRect(-2, -3, 5, 5);
  }
  ctx.restore();

  // ------------- cabeça
  drawHead(ctx, headC, pose.lean + pose.head, look, helm, t);

  // ------------- arma e braço da frente
  if (weapon) drawWeaponAt(ctx, weapon, handF, pose.weapon, t, false);
  if (weapon && shapeW === 'bow') drawBowString(ctx, handF, pose.weapon, handB, weapon);
  drawArm(ctx, shF, elbowF, handF, body.arm, skin, chest, gloves, false);
  if (chest && (chest.style.chest === 'plate' || chest.style.chest === 'scale')) {
    // ombreira
    circle(ctx, add(shF, v(0, 1)), body.arm * 0.95, chest.style.secondary);
    circle(ctx, add(shF, v(0.5, 0)), body.arm * 0.6, chest.style.trim ?? chest.style.primary);
  }

  // posição da ponta da arma (para rastros)
  const wl = WEAPON_LEN[weaponShape(weapon)] ?? 40;
  const tipL = add(handF, v(Math.sin(pose.weapon) * wl, -Math.cos(pose.weapon) * wl));
  const toWorld = (p: V): V => ({ x: p.x * facing * S, y: p.y * S });
  const result = { tip: toWorld(tipL), hand: toWorld(handF) };

  // ------------- partículas lendárias (sem estado: função do tempo)
  if (fx?.particles) drawAmbientParticles(ctx, fx.particles, t);

  // ------------- efeitos de status
  if (o.status === 'freeze') {
    ctx.fillStyle = 'rgba(160,220,255,0.45)';
    ctx.fillRect(-18, -104, 36, 104);
    ctx.strokeStyle = 'rgba(220,245,255,0.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-18, -104, 36, 104);
  } else if (o.status === 'poison') {
    for (let i = 0; i < 4; i++) {
      const p = (t * 0.8 + i / 4) % 1;
      circle(ctx, v(Math.sin(i * 2.1 + t) * 10, -30 - p * 60), 2.2 * (1 - p), `rgba(125,220,61,${0.8 * (1 - p)})`);
    }
  } else if (o.status === 'burn') {
    for (let i = 0; i < 5; i++) {
      const p = (t * 1.4 + i / 5) % 1;
      circle(ctx, v(Math.sin(i * 1.7 + t * 3) * 12, -20 - p * 70), 3 * (1 - p), `rgba(255,122,47,${0.9 * (1 - p)})`);
    }
  }

  ctx.restore();
  return result;
}

function drawLeg(ctx: CanvasRenderingContext2D, hip: V, knee: V, foot: V, w: number, skin: string, legs: ArmorSetDef | null, back: boolean, shorts = DEFAULT_SHORTS) {
  const k = back ? 0.82 : 1;
  const style = legs?.style.legs;
  const col = legs ? shade(legs.style.primary, k) : shade(shorts, k);
  // pele por baixo
  limb(ctx, hip, knee, w, skin);
  limb(ctx, knee, foot, w * 0.9, skin);
  if (!legs || style === 'shorts') {
    limb(ctx, hip, lerp(hip, knee, 0.75), w + 1.5, col);
  } else if (style === 'plate') {
    limb(ctx, hip, knee, w + 1.5, col);
    limb(ctx, knee, foot, w + 1, shade(legs.style.secondary, k));
    circle(ctx, knee, w * 0.55, shade(legs.style.accent, k));
  } else {
    limb(ctx, hip, knee, w + 1.5, col);
    limb(ctx, knee, foot, w + 0.8, col);
  }
  // pé / bota
  const bootCol = legs ? shade(legs.style.secondary, k * 0.8) : SHOE;
  ctx.fillStyle = bootCol;
  ctx.beginPath();
  ctx.ellipse(foot.x + 3, foot.y + 1, 6.5, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawSkirt(ctx: CanvasRenderingContext2D, hip: V, kneeF: V, kneeB: V, legs: ArmorSetDef) {
  const long = legs.style.legs === 'robe_skirt';
  const bottomY = Math.max(kneeF.y, kneeB.y) + (long ? 14 : 4);
  ctx.fillStyle = legs.style.primary;
  ctx.beginPath();
  ctx.moveTo(hip.x - 9, hip.y - 2);
  ctx.lineTo(hip.x + 9, hip.y - 2);
  ctx.lineTo(Math.max(kneeF.x, kneeB.x) + 9, bottomY);
  ctx.lineTo(Math.min(kneeF.x, kneeB.x) - 9, bottomY);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = legs.style.accent;
  ctx.fillRect(Math.min(kneeF.x, kneeB.x) - 9, bottomY - 2.5, Math.abs(kneeF.x - kneeB.x) + 18, 2.5);
}

function drawCoatTail(ctx: CanvasRenderingContext2D, hip: V, kneeF: V, kneeB: V, chest: ArmorSetDef, t: number) {
  const robe = chest.style.chest === 'robe';
  const bottomY = Math.max(kneeF.y, kneeB.y) + (robe ? 16 : 6);
  const sway = Math.sin(t * 2.5) * 1.5;
  ctx.fillStyle = shade(chest.style.primary, 0.92);
  ctx.beginPath();
  ctx.moveTo(hip.x - 10, hip.y - 3);
  ctx.lineTo(hip.x + 10, hip.y - 3);
  if (robe) ctx.lineTo(Math.max(kneeF.x, kneeB.x) + 8 + sway, bottomY);
  else ctx.lineTo(hip.x + 6, hip.y + 10);
  ctx.lineTo(Math.min(kneeF.x, kneeB.x) - 11 + sway, bottomY);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = chest.style.accent;
  ctx.fillRect(Math.min(kneeF.x, kneeB.x) - 11 + sway, bottomY - 2, robe ? Math.abs(kneeF.x - kneeB.x) + 20 : 12, 2);
}

function drawTorso(ctx: CanvasRenderingContext2D, hip: V, neck: V, lean: number, chestW: number, hipW: number, skin: string, chest: ArmorSetDef | null, top: string, t: number, fem = false) {
  ctx.save();
  ctx.translate(hip.x, hip.y);
  ctx.rotate(lean);
  const len = Math.hypot(neck.x - hip.x, neck.y - hip.y);
  // pescoço
  ctx.fillStyle = skin;
  ctx.fillRect(-3, -len - 4, 7, 8);
  // tronco
  const style = chest?.style.chest;
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.moveTo(-hipW / 2, 0);
  ctx.lineTo(hipW / 2, 0);
  ctx.quadraticCurveTo(chestW / 2 + 2, -len * 0.55, chestW / 2 - 1, -len + 2);
  ctx.quadraticCurveTo(0, -len - 3, -chestW / 2 + 1, -len + 2);
  ctx.quadraticCurveTo(-chestW / 2 - 1, -len * 0.55, -hipW / 2, 0);
  ctx.closePath();
  ctx.fill();
  if (fem) {
    // cintura marcada e busto de perfil (discreto)
    ctx.fillStyle = shade(top, 0.9);
    ctx.beginPath();
    ctx.ellipse(chestW / 2 - 1.5, -len * 0.7, 4.2, 3.6, 0.2, -1.2, 2.2);
    ctx.fill();
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.ellipse(chestW / 2 - 2, -len * 0.72, 4, 3.4, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  if (!chest) {
    // regata de academia: cava mostrando o ombro + faixa
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(chestW / 2 - 3, -len + 4, 4, 6, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c8ff3d';
    ctx.fillRect(-chestW / 2 + 3, -len * 0.55, 3, 5);
  } else {
    const s = chest.style;
    if (style === 'plate') {
      ctx.fillStyle = s.secondary;
      ctx.fillRect(-chestW / 2 + 3, -len * 0.62, chestW - 6, 2.5);
      ctx.fillRect(-chestW / 2 + 4, -len * 0.35, chestW - 8, 2.5);
      ctx.fillStyle = s.trim ?? s.accent;
      ctx.beginPath();
      ctx.arc(chestW / 2 - 6, -len * 0.78, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (style === 'scale') {
      ctx.fillStyle = s.secondary;
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 4; c++) {
          ctx.beginPath();
          ctx.arc(-chestW / 2 + 5 + c * ((chestW - 8) / 3.5) + (r % 2) * 2.5, -len * 0.15 - r * (len * 0.16), 2.4, 0, Math.PI);
          ctx.fill();
        }
      }
    } else if (style === 'gi') {
      ctx.strokeStyle = s.accent;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(chestW / 2 - 4, -len + 2);
      ctx.lineTo(-2, -len * 0.4);
      ctx.stroke();
    } else if (style === 'vest') {
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.moveTo(chestW / 2 - 7, -len + 2);
      ctx.lineTo(chestW / 2 - 1, -len + 2);
      ctx.lineTo(hipW / 2 - 1, -4);
      ctx.lineTo(hipW / 2 - 5, -4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = s.accent;
      ctx.fillRect(-chestW / 2 + 2, -len * 0.7, chestW - 6, 2);
    } else if (style === 'robe' || style === 'coat') {
      ctx.fillStyle = s.accent;
      ctx.fillRect(chestW / 2 - 6, -len + 3, 2.5, len - 4);
      ctx.fillStyle = s.secondary;
      ctx.fillRect(-chestW / 2 + 2, -len + 1, chestW - 4, 4);
    } else {
      // túnica
      ctx.fillStyle = s.secondary;
      ctx.fillRect(-chestW / 2 + 2, -len * 0.4, chestW - 4, 3);
      ctx.fillStyle = s.accent;
      ctx.fillRect(chestW / 2 - 7, -len + 3, 3, 3);
    }
    if (s.fx?.glow) {
      const pulse = 0.5 + Math.sin(t * 3) * 0.3;
      ctx.fillStyle = s.fx.glow;
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      ctx.arc(chestW * 0.1, -len * 0.62, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

function drawArm(ctx: CanvasRenderingContext2D, sh: V, el: V, hand: V, w: number, skin: string, chest: ArmorSetDef | null, gloves: ArmorSetDef | null, back: boolean) {
  const k = back ? 0.82 : 1;
  const sleeve = chest && ['plate', 'robe', 'coat', 'gi', 'scale'].includes(chest.style.chest);
  const shortSleeve = chest && chest.style.chest === 'tunic';
  limb(ctx, sh, el, w, skin);
  limb(ctx, el, hand, w * 0.9, skin);
  if (sleeve) {
    limb(ctx, sh, el, w + 1.2, shade(chest!.style.primary, k));
    if (chest!.style.chest !== 'plate') limb(ctx, el, lerp(el, hand, 0.55), w + 0.8, shade(chest!.style.primary, k));
  } else if (shortSleeve) {
    limb(ctx, sh, lerp(sh, el, 0.45), w + 1.2, shade(chest!.style.primary, k));
  }
  if (gloves) {
    const gs = gloves.style;
    if (gs.gloves === 'gauntlet') {
      limb(ctx, lerp(el, hand, 0.35), hand, w + 1.4, shade(gs.secondary, k));
      circle(ctx, hand, w * 0.62, shade(gs.primary, k));
    } else if (gs.gloves === 'glove') {
      limb(ctx, lerp(el, hand, 0.7), hand, w + 0.6, shade(gs.secondary, k));
      circle(ctx, hand, w * 0.58, shade(gs.secondary, k));
    } else {
      circle(ctx, hand, w * 0.56, skin);
      limb(ctx, lerp(el, hand, 0.8), lerp(el, hand, 0.95), w + 0.6, shade(gs.accent, k));
    }
  } else {
    circle(ctx, hand, w * 0.56, skin);
  }
}

function drawHead(ctx: CanvasRenderingContext2D, c: V, angle: number, look: AvatarLook, helm: ArmorSetDef | null, t: number) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(angle);
  const R = 9.5;
  const hs = helm?.style.helm;
  const fullHelm = hs === 'helm_closed' || hs === 'dragon' || hs === 'skull';
  const hideHair = fullHelm || hs === 'hood' || hs === 'kabuto' || hs === 'helm_open' || hs === 'mask' || hs === 'wizard_hat';

  // cabelo comprido / rabo / coque ficam ATRÁS da cabeça
  if (!hideHair) drawHairBack(ctx, look, R, t);
  drawProfileHead(ctx, look, R);
  if (!fullHelm) drawFace(ctx, look, R);
  if (!hideHair) drawHairFront(ctx, look, R);
  if (!fullHelm) drawAccessory(ctx, look, R);
  if (helm) drawHelm(ctx, helm, R, t, look.skin);
  ctx.restore();
}

/**
 * Cabeça de PERFIL (olhando para +x): crânio, mandíbula e queixo à frente,
 * orelha no meio/atrás. Tudo de lado, combinando com o corpo.
 */
function drawProfileHead(ctx: CanvasRenderingContext2D, look: AvatarLook, R: number) {
  const skin = look.skin;
  const fem = look.gender === 1;
  // queixo mais suave e delicado no rosto feminino
  const jx = fem ? 0.26 : 0.34;
  const cy = fem ? 0.96 : 1.02;
  const dark = shade(skin, 0.8);
  ctx.fillStyle = skin;
  ctx.strokeStyle = shade(skin, 0.6);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  // crânio (costas e topo) + testa, nariz, boca, queixo e mandíbula
  ctx.moveTo(R * 0.72, -R * 0.62);
  ctx.bezierCurveTo(R * 0.45, -R * 1.18, -R * 0.95, -R * 1.12, -R * 1.02, -R * 0.1);
  ctx.bezierCurveTo(-R * 1.05, R * 0.5, -R * 0.6, R * 0.82, -R * 0.2, R * 0.86);
  ctx.lineTo(R * jx, R * cy); // mandíbula até o queixo
  ctx.quadraticCurveTo(R * (fem ? 0.7 : 0.78), R * cy, R * (fem ? 0.8 : 0.84), R * 0.66); // queixo
  ctx.lineTo(R * 0.9, R * 0.45); // boca
  ctx.lineTo(R * 0.98, R * 0.3);
  ctx.lineTo(R * 1.02, R * 0.2); // base do nariz
  ctx.lineTo(R * 1.22, R * 0.12); // ponta do nariz
  ctx.lineTo(R * 0.98, -R * 0.26); // ponte do nariz
  ctx.quadraticCurveTo(R * 0.96, -R * 0.42, R * 0.88, -R * 0.5); // sobrancelha
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // sombra suave da nuca/mandíbula
  ctx.fillStyle = shade(skin, 0.9);
  ctx.beginPath();
  ctx.moveTo(-R * 0.2, R * 0.86);
  ctx.lineTo(R * 0.34, R * 1.02);
  ctx.quadraticCurveTo(R * 0.1, R * 0.7, -R * 0.35, R * 0.55);
  ctx.closePath();
  ctx.fill();
  // orelha (no meio da cabeça, um pouco para trás)
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(-R * 0.12, R * 0.12, R * 0.2, R * 0.3, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shade(skin, 0.62);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(-R * 0.1, R * 0.12, R * 0.12, -1.2, 1.6);
  ctx.stroke();
}

function drawFace(ctx: CanvasRenderingContext2D, look: AvatarLook, R: number) {
  const angry = look.face === 2 ? 1 : look.face === 1 ? 0.5 : 0;
  // olho de perfil: branco + íris
  const ex = R * 0.6;
  const ey = -R * 0.2;
  const calm = look.face === 4;
  ctx.fillStyle = '#f4f1ea';
  ctx.beginPath();
  ctx.moveTo(ex - 1.9, ey);
  ctx.quadraticCurveTo(ex, ey - (calm ? 1 : 1.9), ex + 1.8, ey + 0.2);
  ctx.quadraticCurveTo(ex, ey + 1.3, ex - 1.9, ey);
  ctx.fill();
  ctx.fillStyle = look.eyes ?? '#1b1510';
  ctx.beginPath();
  ctx.arc(ex + 0.5, ey - 0.05, calm ? 0.8 : 1.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0d0a08';
  ctx.beginPath();
  ctx.arc(ex + 0.7, ey - 0.05, 0.45, 0, Math.PI * 2);
  ctx.fill();
  const fem = look.gender === 1;
  const makeup = look.marks === 4;
  if (fem || makeup) {
    // cílios
    ctx.strokeStyle = '#141010';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(ex + 1.6, ey - 0.4);
    ctx.lineTo(ex + 2.6, ey - 1.3);
    ctx.moveTo(ex + 0.9, ey - 1.1);
    ctx.lineTo(ex + 1.6, ey - 2.1);
    ctx.stroke();
  }
  // pálpebra
  ctx.strokeStyle = shade(look.skin, 0.55);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(ex - 2, ey - 0.2);
  ctx.quadraticCurveTo(ex, ey - (calm ? 1.1 : 2), ex + 1.9, ey + 0.1);
  ctx.stroke();
  // sobrancelha
  ctx.strokeStyle = shade(look.hairColor, 0.85);
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(ex - 2.4, ey - 2.6 - angry * 0.4);
  ctx.lineTo(ex + 2.2, ey - 2.9 + angry * 1.4);
  ctx.stroke();
  // boca
  if (fem || makeup) {
    ctx.fillStyle = makeup ? '#b3263a' : shade(look.skin, 0.72);
    ctx.beginPath();
    ctx.ellipse(R * 0.84, R * 0.47, 1.2, 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = shade(look.skin, 0.55);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(R * 0.62, R * 0.5 + (look.face === 2 ? 0.4 : 0));
  ctx.lineTo(R * 0.9, R * 0.44);
  ctx.stroke();
  // cicatriz
  if (look.face === 3) {
    ctx.strokeStyle = '#b3263a';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(ex - 1.5, ey - 4);
    ctx.lineTo(ex + 1, ey + 4.5);
    ctx.stroke();
  }
  drawMarks(ctx, look, R, ex, ey);
  if (!fem) drawBeard(ctx, look, R);
}

/** Sardas, pintura de guerra, tatuagem e maquiagem. */
function drawMarks(ctx: CanvasRenderingContext2D, look: AvatarLook, R: number, ex: number, ey: number) {
  switch (look.marks) {
    case 1: // sardas
      ctx.fillStyle = shade(look.skin, 0.68);
      for (const [dx, dy] of [[0, 3], [1.6, 2.6], [-1.3, 3.4], [0.8, 4.4], [2.6, 3.6]]) {
        ctx.beginPath();
        ctx.arc(ex + dx, ey + dy, 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    case 2: // pintura de guerra: duas faixas sob o olho
      ctx.fillStyle = '#141414';
      ctx.fillRect(ex - 3.2, ey + 1.8, 5.2, 1.1);
      ctx.fillStyle = '#b3263a';
      ctx.fillRect(ex - 3.2, ey + 3.4, 5.2, 1.1);
      return;
    case 3: {
      // tatuagem tribal na têmpora
      ctx.strokeStyle = '#1b2a3a';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-R * 0.1, -R * 0.55);
      ctx.quadraticCurveTo(R * 0.3, -R * 0.75, R * 0.25, -R * 0.35);
      ctx.quadraticCurveTo(R * 0.2, -R * 0.1, -R * 0.05, -R * 0.2);
      ctx.moveTo(R * 0.05, -R * 0.45);
      ctx.lineTo(R * 0.35, -R * 0.62);
      ctx.stroke();
      return;
    }
    case 4: // maquiagem: delineado
      ctx.strokeStyle = '#141010';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(ex - 1.8, ey - 0.3);
      ctx.quadraticCurveTo(ex, ey - 1.9, ex + 2.8, ey - 0.8);
      ctx.stroke();
      return;
  }
}

/** Acessórios: brinco, testeira, óculos, piercing. */
function drawAccessory(ctx: CanvasRenderingContext2D, look: AvatarLook, R: number) {
  switch (look.accessory) {
    case 1: // brinco
      ctx.strokeStyle = '#e0b84a';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(-R * 0.1, R * 0.5, 1.3, 0, Math.PI * 2);
      ctx.stroke();
      return;
    case 2: // testeira (faixa de suor)
      ctx.fillStyle = '#c8ff3d';
      ctx.beginPath();
      ctx.moveTo(R * 0.78, -R * 0.58);
      ctx.lineTo(R * 0.84, -R * 0.4);
      ctx.quadraticCurveTo(-R * 0.2, -R * 0.62, -R * 1.08, -R * 0.2);
      ctx.lineTo(-R * 1.08, -R * 0.42);
      ctx.quadraticCurveTo(-R * 0.2, -R * 0.84, R * 0.78, -R * 0.58);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-R * 1.05, -R * 0.35);
      ctx.lineTo(-R * 1.55, -R * 0.05);
      ctx.lineTo(-R * 1.45, -R * 0.3);
      ctx.fill();
      return;
    case 3: // óculos
      ctx.fillStyle = 'rgba(20,24,32,0.85)';
      ctx.beginPath();
      ctx.roundRect(R * 0.36, -R * 0.42, R * 0.52, R * 0.36, 1.2);
      ctx.fill();
      ctx.strokeStyle = '#141414';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(R * 0.36, -R * 0.3);
      ctx.lineTo(-R * 0.1, -R * 0.1);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(R * 0.46, -R * 0.36, R * 0.12, R * 0.08);
      return;
    case 4: // piercing no nariz
      ctx.strokeStyle = '#d4d8de';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(R * 1.08, R * 0.22, 0.9, 0, Math.PI * 2);
      ctx.stroke();
      return;
  }
}

/** Barbas de perfil, acompanhando a mandíbula. */
function drawBeard(ctx: CanvasRenderingContext2D, look: AvatarLook, R: number) {
  const bc = look.hairColor;
  const mustache = () => {
    ctx.fillStyle = bc;
    ctx.beginPath();
    ctx.moveTo(R * 0.62, R * 0.32);
    ctx.quadraticCurveTo(R * 0.85, R * 0.22, R * 1.02, R * 0.3);
    ctx.quadraticCurveTo(R * 0.98, R * 0.46, R * 0.7, R * 0.42);
    ctx.closePath();
    ctx.fill();
  };
  const jaw = (drop: number, alpha: string) => {
    ctx.fillStyle = bc + alpha;
    ctx.beginPath();
    ctx.moveTo(-R * 0.25, R * 0.25); // costeleta, na frente da orelha
    ctx.lineTo(R * 0.05, R * 0.2);
    ctx.quadraticCurveTo(R * 0.45, R * 0.55, R * 0.62, R * 0.5);
    ctx.lineTo(R * 0.9, R * 0.52);
    ctx.quadraticCurveTo(R * 0.95, R * (0.95 + drop * 0.6), R * 0.45, R * (1.08 + drop));
    ctx.quadraticCurveTo(-R * 0.05, R * (1.0 + drop * 0.4), -R * 0.25, R * 0.8);
    ctx.closePath();
    ctx.fill();
  };
  switch (look.beard) {
    case 1: // por fazer
      jaw(0, '55');
      return;
    case 2: // cavanhaque
      mustache();
      ctx.fillStyle = bc;
      ctx.beginPath();
      ctx.moveTo(R * 0.55, R * 0.6);
      ctx.lineTo(R * 0.88, R * 0.6);
      ctx.quadraticCurveTo(R * 0.85, R * 1.2, R * 0.55, R * 1.25);
      ctx.closePath();
      ctx.fill();
      return;
    case 3: // cheia
      jaw(0.1, '');
      mustache();
      return;
    case 4: // longa
      jaw(0.75, '');
      mustache();
      return;
    case 5: // bigode
      mustache();
      return;
  }
}

/** Parte do cabelo que fica atrás da cabeça (comprido, rabo, coque). */
function drawHairBack(ctx: CanvasRenderingContext2D, look: AvatarLook, R: number, t: number) {
  const c = shade(look.hairColor, 0.85);
  ctx.fillStyle = c;
  if (look.hair === 3) {
    // comprido: cai pelas costas até os ombros
    const sway = Math.sin(t * 2) * 0.8;
    ctx.beginPath();
    ctx.moveTo(R * 0.1, -R * 1.05);
    ctx.bezierCurveTo(-R * 1.3, -R * 0.9, -R * 1.45 + sway, R * 0.8, -R * 1.1 + sway, R * 1.9);
    ctx.lineTo(-R * 0.35 + sway, R * 1.75);
    ctx.quadraticCurveTo(-R * 0.4, R * 0.9, -R * 0.1, R * 0.3);
    ctx.closePath();
    ctx.fill();
  } else if (look.hair === 4) {
    // rabo de cavalo preso atrás
    const sw = Math.sin(t * 2.4) * 1.5;
    ctx.beginPath();
    ctx.moveTo(-R * 0.85, -R * 0.55);
    ctx.quadraticCurveTo(-R * 1.9, -R * 0.2 + sw * 0.3, -R * 1.6 + sw, R * 1.3);
    ctx.quadraticCurveTo(-R * 1.25 + sw, R * 0.4, -R * 0.75, -R * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(look.hairColor, 0.55);
    ctx.beginPath();
    ctx.arc(-R * 0.95, -R * 0.4, 1.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (look.hair === 7) {
    // coque no alto de trás
    ctx.beginPath();
    ctx.arc(-R * 0.75, -R * 0.95, R * 0.45, 0, Math.PI * 2);
    ctx.fill();
  } else if (look.hair === 8) {
    // chanel: cai até a altura do queixo, cobrindo a nuca
    ctx.beginPath();
    ctx.moveTo(R * 0.1, -R * 1.1);
    ctx.bezierCurveTo(-R * 1.35, -R * 1.0, -R * 1.35, R * 0.5, -R * 1.0, R * 0.95);
    ctx.lineTo(-R * 0.2, R * 0.95);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
  } else if (look.hair === 9) {
    // trança pendurada atrás
    const sw = Math.sin(t * 2) * 0.8;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.ellipse(-R * 0.95 + sw * (i / 6) + (i % 2 ? 0.8 : -0.8), -R * 0.1 + i * R * 0.34, R * 0.26, R * 0.22, 0.4 * (i % 2 ? 1 : -1), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#c8ff3d';
    ctx.fillRect(-R * 1.05 + sw, R * 1.85, R * 0.3, R * 0.14);
  } else if (look.hair === 11) {
    // black power: volume grande e redondo
    ctx.beginPath();
    ctx.arc(-R * 0.3, -R * 0.35, R * 1.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (look.hair === 12) {
    // dreads caindo pelas costas
    ctx.strokeStyle = c;
    ctx.lineWidth = 2.3;
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const sx = -R * (0.35 + i * 0.16);
      const sw = Math.sin(t * 2 + i) * 0.8;
      ctx.beginPath();
      ctx.moveTo(sx, -R * 0.6);
      ctx.quadraticCurveTo(sx - R * 0.5, R * 0.6, sx - R * 0.35 + sw, R * (1.5 + (i % 2) * 0.3));
      ctx.stroke();
    }
  } else if (look.hair === 13) {
    // comprido com franja: a parte de trás igual ao "Longo"
    const sway = Math.sin(t * 2) * 0.8;
    ctx.beginPath();
    ctx.moveTo(R * 0.1, -R * 1.05);
    ctx.bezierCurveTo(-R * 1.3, -R * 0.9, -R * 1.45 + sway, R * 0.8, -R * 1.1 + sway, R * 1.9);
    ctx.lineTo(-R * 0.35 + sway, R * 1.75);
    ctx.quadraticCurveTo(-R * 0.4, R * 0.9, -R * 0.1, R * 0.3);
    ctx.closePath();
    ctx.fill();
  }
}

/** "Capacete" de cabelo visto de lado: cobre topo e nuca, com a linha na testa e atrás da orelha. */
function hairCap(ctx: CanvasRenderingContext2D, R: number, extra = 1.3) {
  ctx.beginPath();
  ctx.moveTo(R * 0.74, -R * 0.6); // linha do cabelo na testa
  ctx.bezierCurveTo(R * 0.5, -R * 1.25 - extra * 0.3, -R * 1.05 - extra * 0.4, -R * 1.25, -R * 1.1 - extra * 0.25, -R * 0.1);
  ctx.bezierCurveTo(-R * 1.12, R * 0.35, -R * 0.85, R * 0.62, -R * 0.55, R * 0.7); // nuca
  ctx.lineTo(-R * 0.4, R * 0.35);
  ctx.quadraticCurveTo(-R * 0.35, -R * 0.2, -R * 0.05, -R * 0.2); // em volta da orelha
  ctx.quadraticCurveTo(R * 0.15, -R * 0.2, R * 0.2, R * 0.12); // costeleta
  ctx.lineTo(R * 0.32, R * 0.1);
  ctx.quadraticCurveTo(R * 0.3, -R * 0.35, R * 0.5, -R * 0.5);
  ctx.closePath();
}

function drawHairFront(ctx: CanvasRenderingContext2D, look: AvatarLook, R: number) {
  const c = look.hairColor;
  const hi = shade(c, 1.35);
  ctx.fillStyle = c;
  switch (look.hair) {
    case 0:
      return;
    case 1: // curto
    case 3: // comprido (a parte de trás já foi desenhada)
    case 4: // rabo
    case 7: // coque
    case 8: // chanel
    case 9: // trança
    case 12: // dreads
      hairCap(ctx, R);
      ctx.fill();
      break;
    case 10: {
      // undercut: laterais raspadas, topo mais longo penteado para trás
      ctx.fillStyle = c + '40';
      hairCap(ctx, R, 0);
      ctx.fill();
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(R * 0.85, -R * 0.62);
      ctx.bezierCurveTo(R * 0.7, -R * 1.55, -R * 0.9, -R * 1.5, -R * 1.1, -R * 0.55);
      ctx.quadraticCurveTo(-R * 0.3, -R * 0.95, R * 0.55, -R * 0.62);
      ctx.fill();
      break;
    }
    case 11: {
      // black power (a massa principal fica atrás); contorno na testa
      hairCap(ctx, R, 2);
      ctx.fill();
      return;
    }
    case 13: {
      // franja por cima da testa
      hairCap(ctx, R);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(R * 0.2, -R * 1.02);
      ctx.quadraticCurveTo(R * 1.05, -R * 0.95, R * 0.95, -R * 0.35);
      ctx.lineTo(R * 0.7, -R * 0.45);
      ctx.lineTo(R * 0.55, -R * 0.3);
      ctx.lineTo(R * 0.35, -R * 0.5);
      ctx.quadraticCurveTo(R * 0.1, -R * 0.75, R * 0.2, -R * 1.02);
      ctx.fill();
      break;
    }
    case 2: {
      // espetado: mechas apontando para cima e para trás
      hairCap(ctx, R, 0.8);
      ctx.fill();
      ctx.beginPath();
      const spikes = 6;
      for (let i = 0; i <= spikes; i++) {
        const a = -0.95 - (i / spikes) * 2.1; // da testa até a nuca, por cima
        const r1 = R * 1.02;
        const r2 = R * (1.55 - i * 0.03);
        const b = a - 0.18;
        ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.lineTo(Math.cos(a - 0.28) * r2 - 1.5, Math.sin(a - 0.28) * r2);
        ctx.lineTo(Math.cos(b - 0.2) * r1, Math.sin(b - 0.2) * r1);
      }
      ctx.fill();
      break;
    }
    case 5: {
      // moicano: laterais raspadas + crista do topo até a nuca
      ctx.fillStyle = c + '40';
      hairCap(ctx, R, 0);
      ctx.fill();
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(R * 0.55, -R * 0.75);
      for (let i = 0; i <= 5; i++) {
        const a = -1.05 - (i / 5) * 1.85;
        const r = i % 2 === 0 ? R * 1.6 : R * 1.12;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.lineTo(-R * 0.9, -R * 0.35);
      ctx.quadraticCurveTo(-R * 0.2, -R * 1.0, R * 0.55, -R * 0.75);
      ctx.fill();
      return;
    }
    case 6: {
      // cacheado: volume em cachos por cima e atrás
      hairCap(ctx, R, 1.6);
      ctx.fill();
      for (let i = 0; i < 9; i++) {
        const a = -0.85 - (i / 8) * 2.55;
        const r = R * 1.08;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r, Math.sin(a) * r, R * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
  }
  // brilho do cabelo
  ctx.strokeStyle = hi;
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(R * 0.25, -R * 1.0);
  ctx.quadraticCurveTo(-R * 0.35, -R * 1.18, -R * 0.8, -R * 0.75);
  ctx.stroke();
}

function drawHelm(ctx: CanvasRenderingContext2D, set: ArmorSetDef, R: number, t: number, skin: string) {
  const s = set.style;
  const p = s.primary;
  switch (s.helm) {
    case 'helm_closed':
    case 'dragon':
      ctx.fillStyle = p;
      ctx.beginPath();
      ctx.arc(0, 0, R + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0b0b0f';
      ctx.fillRect(R * 0.15, -2.2, R + 2, 2.4);
      ctx.fillStyle = s.secondary;
      ctx.fillRect(-R - 2, R * 0.2, 2 * R + 4, 2);
      if (s.helm === 'dragon') {
        ctx.fillStyle = s.accent;
        ctx.beginPath();
        ctx.moveTo(-R, -R * 0.6);
        ctx.lineTo(-R - 8, -R - 6);
        ctx.lineTo(-R + 3, -R * 0.95);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-2, -R - 1);
        ctx.lineTo(-6, -R - 9);
        ctx.lineTo(3, -R - 1);
        ctx.fill();
      } else {
        ctx.fillStyle = s.accent;
        ctx.fillRect(-2, -R - 5, 3, 6);
      }
      return;
    case 'helm_open':
      ctx.fillStyle = p;
      ctx.beginPath();
      ctx.arc(0, 0, R + 2, Math.PI * 0.95, Math.PI * 2.05);
      ctx.lineTo(R * 0.2, -1);
      ctx.lineTo(-R * 0.2, R * 0.7);
      ctx.lineTo(-R - 2, R * 0.5);
      ctx.fill();
      ctx.fillStyle = s.accent;
      ctx.beginPath();
      ctx.moveTo(-R, -R);
      ctx.quadraticCurveTo(-2, -R - 10, R * 0.7, -R - 1);
      ctx.lineTo(0, -R - 2);
      ctx.fill();
      return;
    case 'kabuto':
      ctx.fillStyle = p;
      ctx.beginPath();
      ctx.arc(0, -1, R + 2, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = s.secondary;
      ctx.beginPath();
      ctx.moveTo(-R - 5, -1);
      ctx.lineTo(R + 3, -1);
      ctx.lineTo(R - 1, 2);
      ctx.lineTo(-R - 7, 3);
      ctx.fill();
      ctx.fillStyle = s.accent;
      ctx.beginPath();
      ctx.moveTo(0, -R);
      ctx.lineTo(-7, -R - 9);
      ctx.lineTo(-2, -R - 1);
      ctx.lineTo(7, -R - 9);
      ctx.lineTo(3, -R);
      ctx.fill();
      return;
    case 'hood':
      ctx.fillStyle = p;
      ctx.beginPath();
      ctx.moveTo(R * 0.55, -R * 0.95);
      ctx.quadraticCurveTo(-R * 0.4, -R - 6, -R - 3, -1);
      ctx.quadraticCurveTo(-R - 4, R, -R * 0.2, R + 3);
      ctx.lineTo(-R * 0.4, R * 0.2);
      ctx.quadraticCurveTo(R * 0.3, -R * 0.4, R * 0.9, -R * 0.35);
      ctx.fill();
      return;
    case 'mask':
      ctx.fillStyle = p;
      ctx.beginPath();
      ctx.arc(0, 0, R + 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = skin;
      ctx.fillRect(R * 0.2, -3.5, R, 4);
      ctx.fillStyle = '#16161a';
      ctx.fillRect(R * 0.45, -2.3, 2.2, 1.8);
      ctx.strokeStyle = s.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-R, -3);
      ctx.lineTo(-R - 7, -1 + Math.sin(t * 5) * 1.5);
      ctx.stroke();
      return;
    case 'wizard_hat':
      ctx.fillStyle = p;
      ctx.beginPath();
      ctx.moveTo(-R - 5, -R * 0.4);
      ctx.lineTo(R + 5, -R * 0.4);
      ctx.lineTo(-4, -R - 16);
      ctx.fill();
      return;
    case 'bandana':
      ctx.fillStyle = p;
      ctx.beginPath();
      ctx.arc(0, 0, R + 0.8, Math.PI * 1.05, Math.PI * 1.95);
      ctx.lineTo(R * 0.8, -R * 0.5);
      ctx.lineTo(-R, -R * 0.3);
      ctx.fill();
      ctx.fillStyle = s.accent;
      ctx.fillRect(-R - 0.5, -R * 0.6, 2 * R + 1, 2.3);
      ctx.beginPath();
      ctx.moveTo(-R, -R * 0.5);
      ctx.lineTo(-R - 6, -R * 0.1 + Math.sin(t * 4) * 1.2);
      ctx.lineTo(-R - 5, -R * 0.6);
      ctx.fill();
      return;
    case 'horns':
      ctx.fillStyle = s.accent;
      ctx.beginPath();
      ctx.moveTo(-R * 0.3, -R * 0.8);
      ctx.quadraticCurveTo(-R - 4, -R - 8, -R - 7, -R - 2);
      ctx.quadraticCurveTo(-R - 2, -R - 4, -R * 0.7, -R * 0.55);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(R * 0.35, -R * 0.85);
      ctx.quadraticCurveTo(R + 2, -R - 9, R + 5, -R - 3);
      ctx.quadraticCurveTo(R + 1, -R - 4, R * 0.7, -R * 0.55);
      ctx.fill();
      ctx.fillStyle = p;
      ctx.beginPath();
      ctx.arc(0, 0, R + 1.5, Math.PI * 1.05, Math.PI * 1.95);
      ctx.lineTo(R, -R * 0.4);
      ctx.lineTo(-R - 1, -R * 0.3);
      ctx.fill();
      return;
    case 'skull':
      ctx.fillStyle = '#e8e4d8';
      ctx.beginPath();
      ctx.arc(0, -1, R + 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#16161a';
      circle(ctx, v(R * 0.45, -1.5), 2.6, '#16161a');
      ctx.fillRect(R * 0.35, 4, 5, 1.2);
      circle(ctx, v(R * 0.45, -1.5), 1, s.accent);
      ctx.fillStyle = p;
      ctx.beginPath();
      ctx.moveTo(R * 0.6, -R * 0.9);
      ctx.quadraticCurveTo(-R * 0.4, -R - 6, -R - 3, 0);
      ctx.quadraticCurveTo(-R - 3, R, -R * 0.2, R + 3);
      ctx.lineTo(-R * 0.5, 0);
      ctx.fill();
      return;
    case 'tricorn':
      ctx.fillStyle = p;
      ctx.beginPath();
      ctx.moveTo(-R - 6, -R * 0.5);
      ctx.quadraticCurveTo(0, -R * 0.2, R + 6, -R * 0.55);
      ctx.lineTo(R * 0.6, -R - 5);
      ctx.lineTo(-R * 0.6, -R - 6);
      ctx.fill();
      ctx.fillStyle = s.accent;
      ctx.fillRect(-R - 5, -R * 0.62, 2 * R + 10, 1.4);
      return;
    case 'circlet':
    case 'crown': {
      const big = s.helm === 'crown';
      ctx.fillStyle = s.trim ?? s.accent;
      ctx.fillRect(-R, -R * 0.62, 2 * R, big ? 3.5 : 2.2);
      if (big) {
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          const x = -R + 2 + i * ((2 * R - 4) / 3);
          ctx.moveTo(x - 2.2, -R * 0.62);
          ctx.lineTo(x, -R - 5);
          ctx.lineTo(x + 2.2, -R * 0.62);
          ctx.fill();
        }
      }
      circle(ctx, v(R * 0.55, -R * 0.52), 1.4, s.fx?.glow ?? s.accent);
      return;
    }
    default:
      return;
  }
}

// ------------------------------------------------------------------ armas

/** Desenha a arma com o cabo na mão `hand`, apontando em `angle` (0 = para cima). */
function drawWeaponAt(ctx: CanvasRenderingContext2D, w: WeaponDef, hand: V, angle: number, t: number, back: boolean) {
  ctx.save();
  ctx.translate(hand.x, hand.y);
  ctx.rotate(angle);
  if (back) ctx.globalAlpha = 0.92;
  drawWeapon(ctx, w, t);
  ctx.restore();
}

// ------------------------------------------------------------------ ferramentas de desenho das armas

function hashId(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Degradê metálico atravessando a lâmina (fio claro, costas escuras). */
function metal(ctx: CanvasRenderingContext2D, x0: number, x1: number, c: string) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, shade(c, 1.35));
  g.addColorStop(0.45, c);
  g.addColorStop(0.55, shade(c, 0.92));
  g.addColorStop(1, shade(c, 0.62));
  return g;
}

function outline(ctx: CanvasRenderingContext2D, c: string, w = 0.7) {
  ctx.strokeStyle = shade(c, 0.4);
  ctx.lineWidth = w;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function gem(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: string) {
  ctx.fillStyle = shade(c, 0.6);
  ctx.beginPath();
  ctx.arc(x, y, r + 0.6, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 0.2, x, y, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, shade(c, 1.3));
  g.addColorStop(1, c);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Cabo com tiras em diagonal. */
function grip(ctx: CanvasRenderingContext2D, y0: number, y1: number, w: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(-w / 2, y0, w, y1 - y0);
  ctx.strokeStyle = shade(c, 1.6);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let y = y0 + 1; y < y1 - 0.5; y += 2.2) {
    ctx.moveTo(-w / 2, y);
    ctx.lineTo(w / 2, y + 1.3);
  }
  ctx.stroke();
  ctx.strokeStyle = shade(c, 0.5);
  ctx.lineWidth = 0.5;
  ctx.strokeRect(-w / 2, y0, w, y1 - y0);
}

/** Cabo de madeira longo (com veios). */
function shaft(ctx: CanvasRenderingContext2D, y0: number, y1: number, w: number, c: string, wobble = 0) {
  ctx.fillStyle = c;
  ctx.beginPath();
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const y = y0 + ((y1 - y0) * i) / n;
    const dx = wobble ? Math.sin(i * 1.7) * wobble : 0;
    if (i === 0) ctx.moveTo(-w / 2 + dx, y);
    else ctx.lineTo(-w / 2 + dx, y);
  }
  for (let i = n; i >= 0; i--) {
    const y = y0 + ((y1 - y0) * i) / n;
    const dx = wobble ? Math.sin(i * 1.7) * wobble : 0;
    ctx.lineTo(w / 2 + dx, y);
  }
  ctx.closePath();
  ctx.fill();
  outline(ctx, c, 0.5);
  ctx.strokeStyle = shade(c, 1.25);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(-w * 0.15, y0 + 2);
  ctx.lineTo(-w * 0.15, y1 - 2);
  ctx.stroke();
}

/** Runas brilhando na lâmina (armas com elemento). */
function runes(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number, c: string, t: number) {
  if (RENDER_OPTS.lowFx) return;
  ctx.save();
  ctx.shadowColor = c;
  ctx.shadowBlur = 5;
  ctx.fillStyle = c;
  const n = 3;
  for (let i = 0; i < n; i++) {
    const y = y0 + ((y1 - y0) * (i + 0.5)) / n;
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 4 + i * 1.3);
    ctx.fillRect(x - 0.8, y - 1.6, 1.6, 3.2);
    ctx.fillRect(x - 1.6, y - 0.4, 3.2, 0.8);
  }
  ctx.restore();
}

/** Onde a segunda mão segura (distância da mão da frente ao longo da arma; negativo = em direção ao cabo). */
const SECOND_GRIP: Partial<Record<string, number>> = {
  greatsword: -8, katana: -8, hammer: -12, spear: -26, scythe: -24,
};

/** Arma em coordenadas locais: cabo na origem, lâmina para cima (−y). */
export function drawWeapon(ctx: CanvasRenderingContext2D, w: WeaponDef, t = 0) {
  const { blade, handle, glow } = w.look;
  const shape = weaponShape(w);
  const elColor = ELEMENT_COLOR[w.element];
  const h = hashId(w.id);
  const fancy = w.rarity === 'epic' || w.rarity === 'legendary';
  const trim = fancy ? '#d8b04a' : shade(handle, 1.5);
  const accent = glow ?? (w.element !== 'physical' ? elColor : '#c9ced6');
  const magic = w.element !== 'physical';
  const withGlow = (blur: number, fn: () => void) => {
    if (glow && !RENDER_OPTS.lowFx) {
      ctx.save();
      ctx.shadowColor = glow;
      ctx.shadowBlur = blur + Math.sin(t * 4) * 2;
      fn();
      ctx.restore();
    } else fn();
  };
  ctx.lineCap = 'round';
  switch (shape) {
    case 'sword': {
      const L = { common: 40, uncommon: 42, rare: 44, epic: 46, legendary: 48 }[w.rarity];
      const bw = 2.9 + (h % 3) * 0.35;
      grip(ctx, 0, 10, 3.2, handle);
      // pomo
      if (h % 2) gem(ctx, 0, 12, 2, fancy ? accent : trim);
      else {
        ctx.fillStyle = trim;
        ctx.beginPath();
        ctx.moveTo(0, 10);
        ctx.lineTo(2.5, 12.5);
        ctx.lineTo(0, 15);
        ctx.lineTo(-2.5, 12.5);
        ctx.fill();
      }
      // lâmina
      withGlow(8, () => {
        ctx.fillStyle = metal(ctx, -bw, bw, blade);
        ctx.beginPath();
        ctx.moveTo(-bw, -3);
        ctx.lineTo(bw, -3);
        ctx.lineTo(bw * 0.8, -L);
        ctx.lineTo(0, -L - 7);
        ctx.lineTo(-bw * 0.8, -L);
        ctx.closePath();
        ctx.fill();
        outline(ctx, blade);
      });
      ctx.strokeStyle = shade(blade, 0.7);
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(0, -L + 4);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(-bw + 0.5, -5);
      ctx.lineTo(-bw * 0.8 + 0.5, -L);
      ctx.stroke();
      if (magic) runes(ctx, 0, -8, -L + 6, elColor, t);
      // guarda
      const gw = 7 + (h % 4);
      ctx.fillStyle = trim;
      ctx.beginPath();
      if (h % 3 === 0) {
        ctx.moveTo(-gw, -1.5);
        ctx.quadraticCurveTo(0, -5, gw, -1.5);
        ctx.lineTo(gw - 1, -4.2);
        ctx.quadraticCurveTo(0, -7, -gw + 1, -4.2);
      } else {
        ctx.rect(-gw, -4, gw * 2, 2.8);
      }
      ctx.fill();
      outline(ctx, trim, 0.5);
      if (fancy) gem(ctx, 0, -2.6, 1.6, accent);
      break;
    }
    case 'greatsword': {
      const L = w.rarity === 'legendary' ? 68 : 62;
      const bw = 5 + (h % 3) * 0.5;
      grip(ctx, 0, 16, 3.8, handle);
      gem(ctx, 0, 18, 2.4, fancy ? accent : trim);
      withGlow(10, () => {
        ctx.fillStyle = metal(ctx, -bw, bw, blade);
        ctx.beginPath();
        ctx.moveTo(-bw * 0.7, -4);
        ctx.lineTo(bw * 0.7, -4);
        ctx.lineTo(bw * 0.7, -10);
        ctx.lineTo(bw, -12); // ricasso
        ctx.lineTo(bw * 1.05, -L);
        ctx.lineTo(0, -L - 10);
        ctx.lineTo(-bw * 1.05, -L);
        ctx.lineTo(-bw, -12);
        ctx.lineTo(-bw * 0.7, -10);
        ctx.closePath();
        ctx.fill();
        outline(ctx, blade, 0.8);
      });
      ctx.fillStyle = shade(blade, 0.72);
      ctx.fillRect(-1, -14, 2, -(L - 20));
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(-bw + 0.6, -12);
      ctx.lineTo(-bw * 1.05 + 0.6, -L);
      ctx.stroke();
      if (magic) runes(ctx, 0, -16, -L + 8, elColor, t);
      // guarda larga com pontas
      const gw = 11 + (h % 3) * 1.5;
      ctx.fillStyle = trim;
      ctx.beginPath();
      ctx.moveTo(-gw, -2);
      ctx.lineTo(gw, -2);
      ctx.lineTo(gw + 2, -5.5);
      ctx.lineTo(gw - 2, -5);
      ctx.lineTo(-gw + 2, -5);
      ctx.lineTo(-gw - 2, -5.5);
      ctx.closePath();
      ctx.fill();
      outline(ctx, trim, 0.5);
      if (fancy) gem(ctx, 0, -3.5, 2, accent);
      break;
    }
    case 'katana':
      drawKatana(ctx, w, blade, handle, glow);
      if (magic && !RENDER_OPTS.lowFx) runes(ctx, -2, -12, -46, elColor, t);
      break;
    case 'dagger': {
      const curved = h % 3 === 0;
      grip(ctx, -1, 7, 2.8, handle);
      gem(ctx, 0, 8.5, 1.4, fancy ? accent : trim);
      withGlow(6, () => {
        ctx.fillStyle = metal(ctx, -2.4, 2.4, blade);
        ctx.beginPath();
        ctx.moveTo(-2.4, -3);
        ctx.lineTo(2.4, -3);
        if (curved) {
          ctx.quadraticCurveTo(3, -14, 7, -19);
          ctx.quadraticCurveTo(-1, -12, -2.4, -3);
        } else {
          ctx.lineTo(1.8, -15);
          ctx.lineTo(0, -21);
          ctx.lineTo(-1.8, -15);
        }
        ctx.closePath();
        ctx.fill();
        outline(ctx, blade, 0.6);
      });
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(-1.6, -4);
      ctx.lineTo(curved ? 2 : -0.8, curved ? -14 : -17);
      ctx.stroke();
      ctx.fillStyle = trim;
      ctx.fillRect(-4.2, -3.6, 8.4, 2);
      if (magic) runes(ctx, 0, -6, -12, elColor, t);
      break;
    }
    case 'axe': {
      const L = w.rarity === 'legendary' ? 52 : 44;
      shaft(ctx, 8, -L + 2, 3.4, handle);
      grip(ctx, -2, 8, 3.8, shade(handle, 0.7));
      const double = fancy;
      const drawHead = (sgn: number, big: number) => {
        ctx.beginPath();
        ctx.moveTo(0, -L + 1);
        ctx.quadraticCurveTo(sgn * 9 * big, -L - 1, sgn * 17 * big, -L - 6 * big);
        ctx.quadraticCurveTo(sgn * 20 * big, -L + 6, sgn * 16 * big, -L + 17 * big);
        ctx.quadraticCurveTo(sgn * 8 * big, -L + 12, 0, -L + 12);
        ctx.closePath();
      };
      withGlow(9, () => {
        ctx.fillStyle = metal(ctx, 0, 18, blade);
        drawHead(1, 1);
        ctx.fill();
        outline(ctx, blade, 0.7);
        if (double) {
          ctx.fillStyle = metal(ctx, -14, 0, blade);
          drawHead(-1, 0.75);
          ctx.fill();
          outline(ctx, blade, 0.7);
        } else if (w.rarity !== 'common') {
          // ponta traseira
          ctx.fillStyle = shade(blade, 0.8);
          ctx.beginPath();
          ctx.moveTo(0, -L + 2);
          ctx.lineTo(-9, -L + 6);
          ctx.lineTo(0, -L + 9);
          ctx.fill();
        }
      });
      // fio brilhante
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(16.5, -L - 5);
      ctx.quadraticCurveTo(19.5, -L + 6, 15.5, -L + 16);
      ctx.stroke();
      ctx.fillStyle = trim;
      ctx.fillRect(-2.6, -L - 1, 5.2, 3);
      ctx.fillRect(-2.6, -L + 11, 5.2, 2.5);
      if (magic) runes(ctx, 8, -L + 2, -L + 10, elColor, t);
      break;
    }
    case 'hammer': {
      const L = 46;
      const mace = /maca|clava|mangual/.test(w.id);
      const big = w.rarity === 'legendary' || w.category === 'hybrid';
      shaft(ctx, 10, -L + 4, 3.6, handle);
      grip(ctx, -2, 10, 4, shade(handle, 0.7));
      withGlow(10, () => {
        if (mace) {
          const r = big ? 10 : 8;
          // flanges / espinhos
          ctx.fillStyle = shade(blade, 0.85);
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a - 0.25) * r * 0.8, -L + Math.sin(a - 0.25) * r * 0.8);
            ctx.lineTo(Math.cos(a) * (r + 5), -L + Math.sin(a) * (r + 5));
            ctx.lineTo(Math.cos(a + 0.25) * r * 0.8, -L + Math.sin(a + 0.25) * r * 0.8);
            ctx.fill();
          }
          const g = ctx.createRadialGradient(-r * 0.3, -L - r * 0.3, 1, 0, -L, r);
          g.addColorStop(0, shade(blade, 1.4));
          g.addColorStop(1, shade(blade, 0.65));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(0, -L, r, 0, Math.PI * 2);
          ctx.fill();
          outline(ctx, blade);
        } else {
          const hw = big ? 28 : 20;
          const hh = big ? 17 : 13;
          const g = ctx.createLinearGradient(0, -L - hh / 2, 0, -L + hh / 2);
          g.addColorStop(0, shade(blade, 1.35));
          g.addColorStop(0.5, blade);
          g.addColorStop(1, shade(blade, 0.6));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.roundRect(-hw / 2, -L - hh / 2, hw, hh, 2);
          ctx.fill();
          outline(ctx, blade, 0.8);
          // faixas de reforço
          ctx.fillStyle = trim;
          ctx.fillRect(-hw / 2 + 3, -L - hh / 2, 2.2, hh);
          ctx.fillRect(hw / 2 - 5.2, -L - hh / 2, 2.2, hh);
          // bico traseiro
          ctx.fillStyle = shade(blade, 0.8);
          ctx.beginPath();
          ctx.moveTo(-hw / 2, -L - 3);
          ctx.lineTo(-hw / 2 - 7, -L);
          ctx.lineTo(-hw / 2, -L + 3);
          ctx.fill();
        }
      });
      if (magic) runes(ctx, 0, -L - 3, -L + 3, elColor, t);
      if (fancy) gem(ctx, 0, -L, 2.2, accent);
      break;
    }
    case 'spear': {
      const L = 84;
      const halberd = /alabarda|glaive/.test(w.id);
      const trident = w.id.includes('tridente');
      shaft(ctx, 30, -L + 10, 2.8, handle);
      // ponteira no pé da lança
      ctx.fillStyle = trim;
      ctx.fillRect(-1.8, 28, 3.6, 3);
      grip(ctx, -3, 5, 3.3, shade(handle, 0.65));
      // borla (tassel) abaixo da lâmina
      if (!halberd) {
        const sw = Math.sin(t * 3) * 1.5;
        ctx.fillStyle = fancy ? accent : '#b3263a';
        ctx.beginPath();
        ctx.moveTo(-1.5, -L + 10);
        ctx.quadraticCurveTo(-5 + sw, -L + 16, -3 + sw, -L + 22);
        ctx.lineTo(1.5 + sw, -L + 20);
        ctx.lineTo(1.5, -L + 10);
        ctx.fill();
      }
      withGlow(9, () => {
        ctx.fillStyle = metal(ctx, -5, 5, blade);
        ctx.beginPath();
        if (trident) {
          ctx.rect(-7, -L - 4, 2, 13);
          ctx.rect(5, -L - 4, 2, 13);
          ctx.rect(-7, -L + 7, 14, 2.4);
          ctx.moveTo(-7, -L - 4);
          ctx.lineTo(-6, -L - 9);
          ctx.lineTo(-5, -L - 4);
          ctx.moveTo(5, -L - 4);
          ctx.lineTo(6, -L - 9);
          ctx.lineTo(7, -L - 4);
        }
        ctx.moveTo(0, -L - 15);
        ctx.quadraticCurveTo(5.5, -L - 2, 1.4, -L + 9);
        ctx.lineTo(-1.4, -L + 9);
        ctx.quadraticCurveTo(-5.5, -L - 2, 0, -L - 15);
        ctx.fill();
        outline(ctx, blade, 0.6);
        if (halberd) {
          ctx.fillStyle = metal(ctx, 0, 14, blade);
          ctx.beginPath();
          ctx.moveTo(1, -L + 2);
          ctx.quadraticCurveTo(15, -L - 1, 14, -L + 16);
          ctx.quadraticCurveTo(8, -L + 11, 1, -L + 13);
          ctx.closePath();
          ctx.fill();
          outline(ctx, blade, 0.6);
          ctx.fillStyle = shade(blade, 0.8);
          ctx.beginPath();
          ctx.moveTo(-1, -L + 4);
          ctx.lineTo(-8, -L + 1);
          ctx.lineTo(-1, -L + 9);
          ctx.fill();
        }
      });
      ctx.strokeStyle = shade(blade, 0.6);
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(0, -L - 12);
      ctx.lineTo(0, -L + 7);
      ctx.stroke();
      ctx.fillStyle = trim;
      ctx.fillRect(-2.2, -L + 9, 4.4, 3.2);
      if (magic) runes(ctx, 0, -L - 8, -L + 4, elColor, t);
      break;
    }
    case 'scythe': {
      const L = 72;
      shaft(ctx, 26, -L, 2.9, handle, 0.35);
      // pega do meio (nib)
      ctx.fillStyle = shade(handle, 0.75);
      ctx.fillRect(0, -30, 6, 2.6);
      grip(ctx, -3, 5, 3.3, shade(handle, 0.65));
      const bl = 32 + (h % 3) * 3;
      withGlow(10, () => {
        const g = ctx.createLinearGradient(0, -L - 10, 0, -L + 8);
        g.addColorStop(0, shade(blade, 1.3));
        g.addColorStop(1, shade(blade, 0.7));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, -L - 2);
        ctx.quadraticCurveTo(bl * 0.6, -L - 14, bl, -L + 10); // costas da lâmina
        ctx.quadraticCurveTo(bl * 0.62, -L - 3, 0, -L + 5); // fio
        ctx.closePath();
        ctx.fill();
        outline(ctx, blade, 0.7);
      });
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(2, -L + 4);
      ctx.quadraticCurveTo(bl * 0.62, -L - 2, bl - 1, -L + 9);
      ctx.stroke();
      ctx.fillStyle = trim;
      ctx.fillRect(-2.4, -L - 3, 4.8, 5);
      if (magic) runes(ctx, bl * 0.45, -L - 6, -L + 2, elColor, t);
      if (fancy) gem(ctx, 0, -L, 1.8, accent);
      break;
    }
    case 'bow': {
      // arco recurvo (a corda é desenhada pelo avatar, puxada pela outra mão)
      withGlow(8, () => {
        ctx.strokeStyle = shade(blade, 0.45);
        ctx.lineWidth = 4.2;
        ctx.beginPath();
        ctx.moveTo(-1, -31);
        ctx.quadraticCurveTo(3, -34, 5, -26);
        ctx.quadraticCurveTo(12, -8, 3, 0);
        ctx.quadraticCurveTo(12, 8, 5, 26);
        ctx.quadraticCurveTo(3, 34, -1, 31);
        ctx.stroke();
        ctx.strokeStyle = blade;
        ctx.lineWidth = 2.8;
        ctx.stroke();
      });
      ctx.strokeStyle = shade(blade, 1.35);
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(6, -24);
      ctx.quadraticCurveTo(11.5, -8, 4, -1);
      ctx.stroke();
      grip(ctx, -5, 5, 4.2, handle);
      if (fancy) {
        gem(ctx, 5, -26, 1.5, accent);
        gem(ctx, 5, 26, 1.5, accent);
      }
      if (magic) runes(ctx, 7, -18, -6, elColor, t);
      break;
    }
    case 'staff': {
      const L = 74;
      const crystal = h % 2 === 0;
      shaft(ctx, 30, -L + 6, 3.2, handle, 0.5);
      ctx.fillStyle = trim;
      ctx.fillRect(-2.2, 28, 4.4, 3);
      ctx.fillRect(-2.2, -L + 12, 4.4, 2.5);
      // garras que seguram a pedra
      ctx.strokeStyle = shade(handle, 1.2);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (const sgn of [-1, 1]) {
        ctx.moveTo(0, -L + 8);
        ctx.quadraticCurveTo(sgn * 8, -L + 2, sgn * 5, -L - 8);
      }
      ctx.stroke();
      const pulse = Math.sin(t * 3) * 0.8;
      ctx.save();
      if (!RENDER_OPTS.lowFx) {
        ctx.shadowColor = elColor;
        ctx.shadowBlur = 16 + pulse * 4;
      }
      if (crystal) {
        const g = ctx.createLinearGradient(-4, 0, 4, 0);
        g.addColorStop(0, shade(blade, 1.5));
        g.addColorStop(1, shade(blade, 0.7));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, -L - 13 - pulse);
        ctx.lineTo(4, -L - 2);
        ctx.lineTo(0, -L + 5);
        ctx.lineTo(-4, -L - 2);
        ctx.closePath();
        ctx.fill();
      } else {
        gem(ctx, 0, -L - 2, 4.6 + pulse * 0.4, blade);
      }
      ctx.restore();
      break;
    }
    case 'seal': {
      // talismã: medalhão com runas, preso por uma alça
      ctx.save();
      if (!RENDER_OPTS.lowFx) {
        ctx.shadowColor = elColor;
        ctx.shadowBlur = 12 + Math.sin(t * 3) * 3;
      }
      ctx.fillStyle = handle;
      ctx.beginPath();
      ctx.arc(3, -6, 8.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      const g = ctx.createRadialGradient(1.5, -8, 1, 3, -6, 7);
      g.addColorStop(0, shade(blade, 1.35));
      g.addColorStop(1, shade(blade, 0.75));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(3, -6, 6.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = shade(handle, 0.6);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      // estrela/runa gravada (varia por arma)
      const pts = 5 + (h % 3);
      for (let i = 0; i <= pts; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI * 2) / pts;
        const x = 3 + Math.cos(a) * 5;
        const y = -6 + Math.sin(a) * 5;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(3, -6, 7.6, 0, Math.PI * 2);
      ctx.strokeStyle = trim;
      ctx.lineWidth = 1;
      ctx.stroke();
      // alça
      ctx.fillStyle = shade(handle, 0.8);
      ctx.fillRect(-1, -1, 3, 5);
      break;
    }
  }
  ctx.shadowBlur = 0;
}

/**
 * Katana: lâmina levemente curva (sori), costas grossas e fio fino, linha de têmpera
 * (hamon), ponta angulada (kissaki), tsuba oval, habaki e cabo trançado (tsuka).
 */
function drawKatana(ctx: CanvasRenderingContext2D, w: WeaponDef, blade: string, handle: string, glow?: string) {
  const long = w.id === 'nodachi-carmesim' || w.rarity === 'legendary';
  const scimitar = w.id === 'cimitarra-do-deserto';
  const L = scimitar ? 44 : long ? 66 : 56; // comprimento da lâmina
  const sori = scimitar ? 10 : long ? 5 : 4; // curvatura
  const W0 = scimitar ? 6 : 3.4; // largura na base
  const bladeStart = -5; // logo acima da tsuba
  // eixo da lâmina: curva para trás (−x) e volta, como uma katana de verdade
  const P = (s: number) => ({ x: sori * s * s, y: bladeStart - L * s });
  const N = 14;

  ctx.save();
  // espelha: fio voltado para a frente/baixo e curva para o lado das costas
  ctx.scale(-1, 1);
  ctx.shadowBlur = 0;
  // --- lâmina: costas (lado +x) e fio (lado −x)
  const back: V[] = [];
  const edge: V[] = [];
  for (let i = 0; i <= N; i++) {
    const s = (i / N) * 0.9; // 0..0.9: resto é a ponta
    const c = P(s);
    const width = W0 * (1 - s * 0.25);
    back.push({ x: c.x + width * 0.45, y: c.y });
    edge.push({ x: c.x - width * 0.55, y: c.y });
  }
  const tip = P(1);
  const kissakiBack = { x: tip.x + 0.8, y: tip.y + 1 };
  const kissakiEdge = { x: tip.x - 1.2, y: tip.y + 5 };

  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 7;
  }
  // corpo (aço)
  ctx.fillStyle = shade(blade, 0.8);
  ctx.beginPath();
  ctx.moveTo(back[0].x, back[0].y);
  for (const p of back) ctx.lineTo(p.x, p.y);
  ctx.lineTo(kissakiBack.x, kissakiBack.y);
  ctx.lineTo(tip.x + 0.2, tip.y - 1.5);
  ctx.lineTo(kissakiEdge.x, kissakiEdge.y);
  for (let i = edge.length - 1; i >= 0; i--) ctx.lineTo(edge[i].x, edge[i].y);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  // fio brilhante (hamon) — faixa clara do lado do corte com borda ondulada
  ctx.fillStyle = blade;
  ctx.beginPath();
  ctx.moveTo(edge[0].x, edge[0].y);
  for (let i = 0; i <= N; i++) {
    const s = (i / N) * 0.9;
    const c = P(s);
    const width = W0 * (1 - s * 0.25);
    const wave = i % 2 === 0 ? 0.15 : -0.05;
    ctx.lineTo(c.x - width * (0.05 + wave), c.y);
  }
  ctx.lineTo(kissakiEdge.x + 0.6, kissakiEdge.y - 1);
  ctx.lineTo(kissakiEdge.x, kissakiEdge.y);
  for (let i = edge.length - 1; i >= 0; i--) ctx.lineTo(edge[i].x, edge[i].y);
  ctx.closePath();
  ctx.fill();

  // brilho na ponta
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.moveTo(kissakiEdge.x, kissakiEdge.y);
  ctx.lineTo(tip.x + 0.2, tip.y - 1.5);
  ctx.lineTo(kissakiEdge.x + 0.9, kissakiEdge.y - 1.2);
  ctx.fill();

  // sulco (bo-hi) nas costas
  ctx.strokeStyle = shade(blade, 0.6);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let i = 1; i <= 9; i++) {
    const c = P(i / 14);
    const x = c.x + W0 * 0.2;
    if (i === 1) ctx.moveTo(x, c.y);
    else ctx.lineTo(x, c.y);
  }
  ctx.stroke();

  // habaki (colar dourado)
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(-2.1, bladeStart - 2.5, 4.2, 3);

  // tsuba (guarda oval)
  ctx.fillStyle = '#1a1a20';
  ctx.beginPath();
  ctx.ellipse(0, -1.5, 5.2, 1.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade('#c9a227', 0.7);
  ctx.fillRect(-5, -1.9, 10, 0.8);

  // tsuka (cabo com trançado em diamantes)
  const HL = scimitar ? 10 : 16;
  ctx.fillStyle = handle;
  ctx.beginPath();
  ctx.moveTo(-1.9, 0);
  ctx.lineTo(1.9, 0);
  ctx.lineTo(1.7, HL);
  ctx.lineTo(-1.7, HL);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = shade(handle, 1.9);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let y = 1; y < HL - 1; y += 3) {
    ctx.moveTo(-1.8, y);
    ctx.lineTo(1.8, y + 1.5);
    ctx.moveTo(1.8, y);
    ctx.lineTo(-1.8, y + 1.5);
  }
  ctx.stroke();
  // kashira (ponta do cabo)
  ctx.fillStyle = '#1a1a20';
  ctx.fillRect(-2, HL, 4, 1.8);
  ctx.restore();
}

/** Corda do arco: passa pela mão de trás quando ela está puxando (com a flecha encaixada). */
function drawBowString(ctx: CanvasRenderingContext2D, hand: V, angle: number, pull: V, w: WeaponDef) {
  const rot = (p: V): V => ({ x: hand.x + p.x * Math.cos(angle) - p.y * Math.sin(angle), y: hand.y + p.x * Math.sin(angle) + p.y * Math.cos(angle) });
  const a = rot(v(-1, -31));
  const b = rot(v(-1, 31));
  const pulling = Math.hypot(pull.x - hand.x, pull.y - hand.y) < 36 && pull.x < hand.x - 4;
  ctx.strokeStyle = 'rgba(235,235,235,0.9)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  if (pulling) ctx.lineTo(pull.x, pull.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  if (pulling) {
    // flecha encaixada
    const dx = hand.x - pull.x;
    const dy = hand.y - pull.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const tip = { x: hand.x + ux * 10, y: hand.y + uy * 10 };
    ctx.strokeStyle = '#8a6a3a';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(pull.x, pull.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    ctx.fillStyle = w.element === 'physical' ? '#d4d8de' : ELEMENT_COLOR[w.element];
    ctx.beginPath();
    ctx.moveTo(tip.x + ux * 4, tip.y + uy * 4);
    ctx.lineTo(tip.x - uy * 2, tip.y + ux * 2);
    ctx.lineTo(tip.x + uy * 2, tip.y - ux * 2);
    ctx.fill();
    ctx.fillStyle = '#c0283c';
    ctx.fillRect(pull.x - 1.5, pull.y - 1.5, 3, 3);
  }
}

// ------------------------------------------------------------------ partículas ambientes

function drawAmbientParticles(ctx: CanvasRenderingContext2D, el: Element, t: number) {
  const col = ELEMENT_COLOR[el];
  for (let i = 0; i < 9; i++) {
    const p = (t * (0.35 + (i % 3) * 0.12) + i / 9) % 1;
    const x = Math.sin(i * 12.9898 + t * 0.7) * 22;
    const y = -8 - p * 100;
    const r = (el === 'ice' ? 1.8 : 2.2) * (1 - p * 0.6);
    ctx.globalAlpha = Math.sin(p * Math.PI) * 0.85;
    circle(ctx, v(x, y), r, col);
  }
  ctx.globalAlpha = 1;
}

/** Retorna o conjunto de armadura de uma peça (para miniaturas). */
export function armorSet(id: string) {
  return ARMOR_SETS_BY_ID[id];
}

/** Posição da ponta da arma e da mão (relativas aos pés) sem desenhar nada. */
export function weaponTip(look: AvatarLook, weapon: WeaponDef | undefined, pose: Pose, facing: 1 | -1, scale = 1): { tip: V; hand: V } {
  const S = clampHeight(look.height) * scale;
  const hip = v(0, -44 + pose.bob);
  const up = v(Math.sin(pose.lean), -Math.cos(pose.lean));
  const neck = add(hip, { x: up.x * 30, y: up.y * 30 });
  const shF = add(lerp(hip, neck, 0.88), v(2, 0));
  const elbowF = add(shF, dir(pose.armF[0], 15));
  const handF = add(elbowF, dir(pose.armF[0] + pose.armF[1], 14));
  const wl = WEAPON_LEN[weaponShape(weapon)] ?? 40;
  const tipL = add(handF, v(Math.sin(pose.weapon) * wl, -Math.cos(pose.weapon) * wl));
  return { tip: { x: tipL.x * facing * S, y: tipL.y * S }, hand: { x: handF.x * facing * S, y: handF.y * S } };
}
