/**
 * MÁQUINAS (feat.kind): 0 = mech juggernaut (MK-ZERO), 1 = autômato de relojoaria (O Relojoeiro),
 * 2 = satélite-olho flutuante com drones (Sentinela Ômega), 3 = forja de guerra sobre esteiras (Dravex).
 * Origem no chão, olhando para a esquerda; ~400 de largura x ~330 de altura em escala 1.
 *
 * LOCOMOÇÃO: um ciclo de passada (st.gait += 1) = 150 unidades locais percorridas. Os pés em apoio
 * andam para trás exatamente nessa velocidade (ficam plantados no chão), levantam, avançam e pisam.
 */
import type { BossSpec } from '@gymbattle/shared';
import type { Anchors, DrawState, V } from '../types';
import {
  attacking, breathe, dying, eyeGlow, hurtTint, mixHex, poseK, rgrad, strike, vgrad, windup, h01,
  TAU, clamp, hexA, orb, flame, magicCircle, sm, mix, easeIn,
} from '../util';

function poses(st: DrawState) {
  return {
    wu: windup(st), sk: strike(st), atk: attacking(st), b: breathe(st, 1.3), die: dying(st),
    shoot: poseK(st, 'shoot', 'breath'), slam: poseK(st, 'slam'), cast: poseK(st, 'cast'),
    swipe: poseK(st, 'swipe'), charge: poseK(st, 'charge'), roar: poseK(st, 'roar'),
    /** p do ataque (0 fora dele). */
    p: st.anim === 'attack' ? st.p : 0,
    /** Impacto: estoura em 0,55 e some até ~0,85. */
    imp: st.anim === 'attack' ? sm(0.5, 0.56, st.p) * (1 - sm(0.58, 0.88, st.p)) : 0,
    /** Follow-through: passa do ponto logo depois do impacto. */
    ft: st.anim === 'attack' ? sm(0.55, 0.66, st.p) * (1 - sm(0.68, 0.95, st.p)) : 0,
  };
}
type K = ReturnType<typeof poses>;
const NUL = null as unknown as CanvasRenderingContext2D;

function colors(s: BossSpec, st: DrawState) {
  const P = s.pal;
  const t = (h: string) => hurtTint(NUL, st, h);
  return {
    body: t(P.body), dark: t(P.dark), accent: t(P.accent), glow: P.glow, eye: P.eye,
    light: t(mixHex(P.body, '#ffffff', 0.35)), mid: t(mixHex(P.body, P.dark, 0.5)),
    steel: t('#c8ccd2'), black: t('#121418'),
    // luzes perdem a força ao morrer (e piscam antes de apagar)
    lit: st.anim === 'death' ? (1 - st.p) * (st.p > 0.3 ? 0.55 + 0.45 * (Math.sin(st.t * 37) > -0.2 ? 1 : 0) : 1) : 1,
  };
}
type C = ReturnType<typeof colors>;

const rot = (p: V, c: V, a: number): V => {
  const cs = Math.cos(a), sn = Math.sin(a);
  return { x: c.x + (p.x - c.x) * cs - (p.y - c.y) * sn, y: c.y + (p.x - c.x) * sn + (p.y - c.y) * cs };
};
const frac = (x: number) => x - Math.floor(x);

export function drawMachine(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState): Anchors {
  const kind = s.feat.kind ?? 0;
  const k = poses(st);
  const c = colors(s, st);
  const ks = kind === 1 ? 1.12 : 1;
  // dano: tranco para trás (para a direita) por cima de tudo
  const hx = st.hurt * 14;
  ctx.save();
  ctx.translate(hx, 0);
  ctx.scale(ks, ks);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const a = kind === 1 ? clockmaker(ctx, s, st, k, c, ks) : kind === 2 ? sentinel(ctx, s, st, k, c) : kind === 3 ? forge(ctx, s, st, k, c) : juggernaut(ctx, s, st, k, c);
  ctx.restore();
  const m = (v: V): V => ({ x: v.x * ks + hx, y: v.y * ks });
  return { mouth: m(a.mouth), hand: m(a.hand), core: m(a.core), top: a.top * ks, halfW: a.halfW * ks };
}

// ------------------------------------------------------------------ locomoção comum

interface Gait {
  /** fase 0..1 do ciclo */
  ph: number;
  mv: number;
  /** 0..1: quanto as pernas seguem o ciclo (some quando parado) */
  w: number;
  /** 1 = avançando (esquerda), −1 = recuando */
  dir: number;
  /** unidades locais percorridas por ciclo */
  unit: number;
  /** distância acumulada (com o sinal da direção atual) — esteiras e engrenagens */
  dist: number;
}

function gaitOf(st: DrawState, ks = 1): Gait {
  const mv = clamp(st.move);
  const dir = st.vx > 1 ? -1 : 1;
  return { ph: frac(st.gait), mv, w: sm(0.01, 0.2, mv), dir, unit: 150 / ks, dist: st.gait * (150 / ks) * dir };
}

interface Foot { x: number; y: number; pitch: number; imp: number; swing: number }

/**
 * Posição do pé (relativa ao ponto de descanso) numa fase do ciclo.
 * duty = fração do ciclo com o pé no chão; lift = altura da passada.
 */
function footAt(g: Gait, off: number, duty: number, lift: number): Foot {
  const q = frac(g.ph + off);
  const S = g.unit * duty;
  let x: number, y: number, pitch: number, imp = 0, swing = 0;
  if (q < duty) {
    const u = q / duty;
    x = -S / 2 + S * u;
    y = 0;
    // calcanhar sai do chão no fim do apoio
    pitch = -0.2 * sm(0.75, 1, u);
    imp = Math.pow(1 - clamp(q / 0.14), 2);
  } else {
    const u = (q - duty) / (1 - duty);
    const e = u * u * (3 - 2 * u);
    x = S / 2 - S * e;
    // sobe rápido, desce com peso
    y = -lift * Math.sin(Math.PI * Math.pow(u, 0.8));
    pitch = mix(-0.2, 0.14, sm(0, 0.8, u)) * (1 - sm(0.85, 1, u));
    swing = Math.sin(Math.PI * u);
  }
  return { x: x * g.dir * g.w, y: y * g.w, pitch: pitch * g.dir * g.w, imp: imp * g.w * sm(0.15, 0.5, g.mv), swing: swing * g.w };
}

/** Afundamento do corpo (positivo = para baixo): máximo logo após cada pisada (2 por ciclo). */
function bobOf(g: Gait, amp: number) {
  const q = 0.5 + 0.5 * Math.cos(4 * Math.PI * (g.ph - 0.07));
  return g.w * amp * (q * q - 0.35);
}

/** IK de dois ossos: devolve o joelho. bend = +1 joelho para a frente (esquerda). */
function ik(h: V, f: V, l1: number, l2: number, bend: number): V {
  const dx = f.x - h.x, dy = f.y - h.y;
  const d = clamp(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.01);
  const a = Math.atan2(dy, dx);
  const A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const ang = a + bend * A;
  return { x: h.x + Math.cos(ang) * l1, y: h.y + Math.sin(ang) * l1 };
}

// ------------------------------------------------------------------ peças comuns

/** Brilho somado. */
function bloom(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number) {
  if (a <= 0.02 || r <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgrad(ctx, x, y, r, hexA(color, clamp(a)), hexA(color, 0));
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Polígono fechado. */
function poly(ctx: CanvasRenderingContext2D, pts: number[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}

/** Rebites numa linha. */
function rivets(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, n: number, col: string, r = 2.6) {
  ctx.fillStyle = col;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const q = n > 1 ? i / (n - 1) : 0.5;
    const x = x0 + (x1 - x0) * q, y = y0 + (y1 - y0) * q;
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, TAU);
  }
  ctx.fill();
}

/** Segmento de membro afunilado (de a até b) com borda clara no lado de cima. */
function limb(ctx: CanvasRenderingContext2D, a: V, b: V, w0: number, w1: number, col: string, hi?: string, line?: string) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  const an = Math.atan2(ny, nx);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(a.x + (nx * w0) / 2, a.y + (ny * w0) / 2);
  ctx.lineTo(b.x + (nx * w1) / 2, b.y + (ny * w1) / 2);
  ctx.arc(b.x, b.y, w1 / 2, an, an + Math.PI, true);
  ctx.lineTo(a.x - (nx * w0) / 2, a.y - (ny * w0) / 2);
  ctx.arc(a.x, a.y, w0 / 2, an + Math.PI, an, true);
  ctx.closePath();
  ctx.fill();
  if (line) {
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  if (hi) {
    // lado iluminado = o de cima (normal com y negativo)
    const sg = ny < 0 ? 1 : -1;
    ctx.strokeStyle = hi;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(a.x + sg * nx * (w0 / 2 - 4) + dx * 0.12, a.y + sg * ny * (w0 / 2 - 4) + dy * 0.12);
    ctx.lineTo(b.x + sg * nx * (w1 / 2 - 4) - dx * 0.12, b.y + sg * ny * (w1 / 2 - 4) - dy * 0.12);
    ctx.stroke();
  }
}

/** Pistão hidráulico: cilindro fixo em a, haste cromada desliza até b. */
function piston(ctx: CanvasRenderingContext2D, a: V, b: V, cyl: number, wC: number, cylCol: string, rodCol: string, capCol: string) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L;
  ctx.strokeStyle = rodCol;
  ctx.lineWidth = wC * 0.42;
  ctx.beginPath();
  ctx.moveTo(a.x + ux * cyl * 0.5, a.y + uy * cyl * 0.5);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.strokeStyle = cylCol;
  ctx.lineWidth = wC;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(a.x + ux * Math.min(cyl, L * 0.85), a.y + uy * Math.min(cyl, L * 0.85));
  ctx.stroke();
  ctx.fillStyle = capCol;
  ctx.beginPath();
  ctx.arc(a.x, a.y, wC * 0.45, 0, TAU);
  ctx.moveTo(b.x + wC * 0.32, b.y);
  ctx.arc(b.x, b.y, wC * 0.32, 0, TAU);
  ctx.fill();
}

/** Engrenagem com dentes. */
function gear(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, teeth: number, ang: number, col: string, dark: string) {
  if (r <= 1) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = col;
  ctx.beginPath();
  const n = teeth * 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const rr = i % 4 < 2 ? r : r * 0.8;
    if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, TAU);
  ctx.fill();
  ctx.fillStyle = col;
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.rotate((i / 4) * TAU);
    ctx.fillRect(-r * 0.08, 0, r * 0.16, r * 0.62);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.2, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Baforada de vapor: u = 0 (saindo) → 1 (dissipado), indo na direção (dx,dy). */
function steam(ctx: CanvasRenderingContext2D, x: number, y: number, u: number, a: number, dx: number, dy: number, size = 1, rgb = '225,228,235') {
  if (a <= 0.02 || u >= 1 || u < 0) return;
  for (let i = 0; i < 3; i++) {
    const q = clamp(u * 1.1 - i * 0.08);
    const r = (6 + q * 26 + i * 4) * size;
    ctx.fillStyle = `rgba(${rgb},${(a * (1 - q) * 0.45).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x + dx * q * (1 + i * 0.3) + i * 5 * Math.sign(dx || 1), y + dy * q * (1 + i * 0.25) - i * 4, r, 0, TAU);
    ctx.fill();
  }
}

/** Faíscas (traços curtos, sem shadowBlur). base = ângulo médio, spread = abertura. */
function spark(ctx: CanvasRenderingContext2D, x: number, y: number, u: number, a: number, n: number, seed: number, col: string, reach = 60, base = -Math.PI / 2, spread = 2.4) {
  if (a <= 0.02 || u <= 0 || u >= 1) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = hexA(col, clamp(a * (1 - u * u)));
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const ang = base + (h01(seed + i, 3) - 0.5) * spread;
    const v = reach * (0.5 + h01(seed + i, 7));
    const d = v * u, g = 50 * u * u;
    const px = x + Math.cos(ang) * d, py = y + Math.sin(ang) * d + g;
    ctx.moveTo(px, py);
    ctx.lineTo(px - Math.cos(ang) * 8, py - Math.sin(ang) * 8 - 2);
  }
  ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------------ 0: MK-ZERO

/** Pé em cunha do MK (relativo ao tornozelo; a sola fica em y=+26). */
const MK_FOOT = [-56, 26, -42, 4, -14, -8, 24, -6, 40, 26];

/** Tornozelo para um pé no chão em (x,y) com inclinação: a parte mais baixa da sola encosta no chão. */
function ankleFor(f: { x: number; y: number; pitch: number }, pts: number[]): V {
  const cs = Math.cos(f.pitch), sn = Math.sin(f.pitch);
  let my = -1e9;
  for (let i = 0; i < pts.length; i += 2) my = Math.max(my, pts[i] * sn + pts[i + 1] * cs);
  return { x: f.x, y: f.y - my };
}

function juggernaut(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState, k: K, c: C): Anchors {
  const { wu, sk, b, die, p } = k;
  const g = gaitOf(st);
  const lights = c.lit * (0.75 + st.rage * 0.25);
  const lift = 16 + 26 * g.mv;
  const fF = footAt(g, 0, 0.62, lift);
  const fB = footAt(g, 0.5, 0.62, lift);

  // tiros: rajada de 0,45 a 0,85 — cada disparo dá um coice (as duas armas alternam)
  const fire = k.shoot * sm(0.44, 0.5, p) * (1 - sm(0.8, 0.88, p));
  const pulse = (o: number) => Math.pow(1 - frac(p * 22 + o), 1.6);
  const rec0 = fire * pulse(0), rec1 = fire * pulse(0.5);

  // morte: cambaleia, os joelhos cedem e o tronco desaba para a frente
  const dKnee = easeIn(sm(0.1, 0.6, die));
  const dFall = sm(0.42, 0.8, die);
  const dBounce = Math.sin(sm(0.8, 1, die) * Math.PI) * 0.06;
  const stagger = Math.sin(st.t * 9) * 9 * sm(0, 0.12, die) * (1 - sm(0.35, 0.5, die));

  const rise = k.slam * (wu * 30 - sk * 26) - k.slam * k.imp * 14 + k.roar * wu * 12 - k.charge * wu * 14 - k.shoot * wu * 10 - dKnee * 78 - dFall * 34;
  const bob = bobOf(g, 5 + 8 * g.mv);
  const idleShift = Math.sin(st.t * 0.8) * 5 * (1 - g.w);
  const T: V = { x: 10 + stagger + idleShift + (rec0 + rec1) * 3 + st.hurt * 6, y: -218 - rise + bob - b * 4 };
  const tilt = -0.05 * g.mv * g.dir + Math.sin(g.ph * TAU) * 0.022 * g.w
    + k.slam * (wu * 0.08 - sk * 0.13 - k.ft * 0.04) + k.shoot * (wu * 0.03 + fire * 0.025)
    + k.roar * (wu * 0.1 - sk * 0.05) - k.charge * (wu * 0.04 + sk * 0.12)
    + st.hurt * 0.09 - dFall * 0.5 + dBounce + Math.sin(st.t * 0.8) * 0.012 * (1 - g.w);

  // perna da frente no pisão: levanta alto, crava no chão e depois volta para a passada
  const footF = { x: -36 + fF.x, y: fF.y, pitch: fF.pitch };
  if (k.slam > 0) {
    const bw = k.slam * sm(0, 0.12, p) * (1 - sm(0.78, 1, p));
    const up = sm(0.04, 0.36, p) * (1 - sm(0.42, 0.53, p));
    const tx = mix(-62, -112, sm(0.38, 0.53, p));
    footF.x = mix(footF.x, tx, bw);
    footF.y = mix(footF.y, -118 * up, bw) - 26 * Math.sin(Math.PI * sm(0.78, 1, p)) * k.slam;
    footF.pitch = mix(footF.pitch, 0.3 * up, bw);
  }
  const footB = { x: 44 + fB.x, y: fB.y, pitch: fB.pitch };

  const hipF = rot({ x: T.x - 24, y: T.y + 72 }, T, tilt);
  const hipB = rot({ x: T.x + 30, y: T.y + 68 }, T, tilt);

  const leg = (hip: V, f: { x: number; y: number; pitch: number }, col: string, hi: string, edge: string) => {
    const A = ankleFor(f, MK_FOOT);
    const K2 = ik(hip, A, 82, 86, 1);
    const thA = Math.atan2(K2.y - hip.y, K2.x - hip.x);
    const shA = Math.atan2(A.y - K2.y, A.x - K2.x);
    // engrenagem do quadril (gira com a coxa)
    gear(ctx, hip.x, hip.y, 22, 10, thA * 2.4, edge, c.black);
    // coxa
    limb(ctx, hip, K2, 42, 32, col, hi);
    // pistão da coxa até a canela (a haste desliza quando o joelho dobra)
    const pa = { x: hip.x + (K2.x - hip.x) * 0.18 + 18, y: hip.y + (K2.y - hip.y) * 0.18 + 4 };
    const pb = { x: K2.x + (A.x - K2.x) * 0.72 + 16, y: K2.y + (A.y - K2.y) * 0.72 };
    piston(ctx, pa, pb, 52, 14, c.black, c.steel, edge);
    // canela
    limb(ctx, K2, A, 30, 22, col, hi);
    ctx.strokeStyle = hexA(c.accent, 0.7 * lights);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(K2.x + (A.x - K2.x) * 0.25 - 8, K2.y + (A.y - K2.y) * 0.25);
    ctx.lineTo(K2.x + (A.x - K2.x) * 0.6 - 7, K2.y + (A.y - K2.y) * 0.6);
    ctx.stroke();
    // joelho blindado com engrenagem (gira com a dobra do joelho)
    ctx.fillStyle = edge;
    ctx.beginPath();
    ctx.arc(K2.x, K2.y, 19, 0, TAU);
    ctx.fill();
    gear(ctx, K2.x, K2.y, 13, 8, (shA - thA) * 3, col, c.black);
    // tornozelo
    ctx.fillStyle = c.black;
    ctx.beginPath();
    ctx.arc(A.x, A.y, 10, 0, TAU);
    ctx.fill();
    // pé
    ctx.save();
    ctx.translate(A.x, A.y);
    ctx.rotate(f.pitch);
    ctx.fillStyle = col;
    poly(ctx, MK_FOOT);
    ctx.fill();
    ctx.fillStyle = edge;
    poly(ctx, [-42, 4, -14, -8, 24, -6, 20, 4]);
    ctx.fill();
    // garras da ponta
    ctx.fillStyle = c.black;
    poly(ctx, [-56, 26, -66, 28, -50, 16]);
    ctx.fill();
    ctx.fillStyle = hexA(c.accent, 0.85 * lights);
    ctx.fillRect(-46, 16, 80, 4);
    ctx.restore();
    return A;
  };

  // ---- perna de trás
  const aB = leg(hipB, footB, c.dark, hexA(c.mid, 0.9), c.mid);

  // braço-arma
  const recoilOf = (front: boolean) => (front ? rec0 : rec1) * 18;
  const gunAim = (front: boolean) => {
    let a = 0.06 + Math.sin(st.t * 1.1 + (front ? 0 : 1.5)) * 0.025 * (1 - g.w);
    // balanço contrário ao das pernas (com atraso)
    a += Math.sin(TAU * (g.ph - 0.12) + (front ? 0 : Math.PI)) * 0.06 * g.w;
    a += k.slam * (wu * 0.8 - sk * 0.85 - k.ft * 0.15) + k.roar * (wu + sk) * 0.5
      + k.shoot * (wu * 0.14 - fire * 0.05) + recoilOf(front) * 0.006 - k.charge * (wu * 0.2 + sk * 0.1) - sm(0, 0.6, die) * 0.35;
    return a;
  };
  const gun = (sh: V, front: boolean): V => {
    const col = front ? c.body : c.dark, edge = front ? c.light : c.mid;
    const aim = gunAim(front);
    const S = rot({ x: T.x + sh.x, y: T.y + sh.y }, T, tilt);
    const ua = 1.75 + tilt - aim * 0.35;
    const E = { x: S.x + Math.cos(ua) * 50, y: S.y + Math.sin(ua) * 50 };
    limb(ctx, S, E, 26, 22, col, edge);
    ctx.fillStyle = c.black;
    ctx.beginPath();
    ctx.arc(S.x, S.y, 12, 0, TAU);
    ctx.fill();
    const rc = recoilOf(front);
    ctx.save();
    ctx.translate(E.x, E.y);
    ctx.rotate(aim + tilt);
    ctx.translate(rc, 0);
    // corpo da arma
    ctx.fillStyle = vgrad(ctx, -24, 24, edge, col);
    poly(ctx, [34, -24, -58, -24, -70, -10, -70, 14, 30, 24, 44, 0]);
    ctx.fill();
    ctx.fillStyle = c.black;
    ctx.fillRect(-20, 14, 30, 16);
    ctx.fillStyle = hexA(c.accent, 0.85 * lights);
    ctx.fillRect(-50, -6, 50, 4);
    rivets(ctx, -52, -16, 24, -16, 5, c.mid, 2.2);
    // canos girando (gatling): giram devagar parados e disparam no tiro
    const spin = st.t * 3 + (k.shoot ? p * 140 * k.shoot : 0) + g.dist * 0.01;
    for (let i = 0; i < 3; i++) {
      const yy = Math.sin(spin + (i * TAU) / 3) * 7;
      ctx.fillStyle = Math.cos(spin + (i * TAU) / 3) > 0 ? edge : c.black;
      ctx.fillRect(-132, yy - 3.5, 64, 7);
    }
    ctx.fillStyle = col;
    ctx.fillRect(-138, -12, 10, 24);
    ctx.fillRect(-100, -11, 8, 22);
    // cano esquenta na rajada
    if (fire > 0.05) {
      ctx.fillStyle = hexA('#ff8a3a', fire * 0.35);
      ctx.fillRect(-136, -8, 46, 16);
    }
    ctx.restore();
    const ca = Math.cos(aim + tilt), sa = Math.sin(aim + tilt);
    const mz = { x: E.x + ca * rc - ca * 140, y: E.y + sa * rc - sa * 140 };
    // clarão do disparo
    const fl = (front ? rec0 : rec1) * c.lit;
    if (fl > 0.08) {
      orb(ctx, mz.x, mz.y, 44 * fl, '#ffcc33', fl);
      bloom(ctx, mz.x, mz.y, 70 * fl, s.pal.glow, fl * 0.6);
      // cartucho ejetado
      const u = 1 - fl;
      ctx.fillStyle = hurtTint(NUL, st, '#e0b040');
      ctx.fillRect(E.x + 20 + u * 30, E.y - 10 - u * 40 + u * u * 70, 6, 3);
    }
    return mz;
  };
  gun({ x: 38, y: -36 }, false);

  // ---- tronco
  ctx.save();
  ctx.translate(T.x, T.y);
  ctx.rotate(tilt);
  // pélvis com pistões
  ctx.fillStyle = c.dark;
  poly(ctx, [-44, 40, 52, 40, 44, 80, -36, 80]);
  ctx.fill();
  ctx.fillStyle = c.black;
  ctx.fillRect(-20, 52, 50, 10);

  // casulos de mísseis (abrem no tiro)
  const podOpen = clamp(k.shoot * (wu + fire * 1.2) + k.roar * (wu + sk) * 0.5);
  for (const [dx, col] of [[24, c.mid], [-10, c.body]] as const) {
    ctx.save();
    ctx.translate(dx, -66 - podOpen * 4);
    ctx.rotate(-podOpen * 0.12);
    ctx.fillStyle = vgrad(ctx, -40, 10, c.light, col);
    poly(ctx, [-30, 0, -26, -40, 40, -44, 46, 0]);
    ctx.fill();
    ctx.strokeStyle = c.dark;
    ctx.lineWidth = 2;
    ctx.stroke();
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 4; i++) {
        const x = -16 + i * 15, y = -30 + r * 15;
        ctx.fillStyle = c.black;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, TAU);
        ctx.fill();
        if (podOpen > 0.1) {
          ctx.fillStyle = hurtTint(NUL, st, i % 2 ? '#e8e8e8' : s.pal.accent);
          ctx.beginPath();
          ctx.arc(x, y, 4.5 * podOpen, 0, TAU);
          ctx.fill();
        }
      }
    }
    ctx.save();
    ctx.translate(-28, -40);
    ctx.rotate(-podOpen * 1.3);
    ctx.fillStyle = col;
    ctx.fillRect(0, -6, 72, 8);
    ctx.restore();
    ctx.restore();
  }

  // tronco blindado
  ctx.fillStyle = vgrad(ctx, -70, 60, c.light, c.dark);
  poly(ctx, [-78, -64, 64, -70, 92, -20, 84, 44, -54, 50, -90, 6]);
  ctx.fill();
  // placa de cima com sombra (volume)
  ctx.fillStyle = hexA('#ffffff', 0.08);
  poly(ctx, [-78, -64, 64, -70, 76, -46, -70, -40]);
  ctx.fill();
  ctx.fillStyle = hexA('#000000', 0.22);
  poly(ctx, [84, 44, -54, 50, -50, 34, 80, 28]);
  ctx.fill();
  ctx.strokeStyle = hexA(c.black, 0.8);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-60, -10); ctx.lineTo(80, -16);
  ctx.moveTo(10, -66); ctx.lineTo(16, 46);
  ctx.stroke();
  rivets(ctx, -66, -54, 54, -60, 7, c.mid);
  rivets(ctx, -44, 40, 74, 34, 6, c.mid);
  // listras de perigo
  ctx.save();
  poly(ctx, [-50, 30, 80, 24, 82, 42, -50, 48]);
  ctx.clip();
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = i % 2 ? '#1a1a1a' : hurtTint(NUL, st, '#ffcc33');
    poly(ctx, [-60 + i * 16, 50, -50 + i * 16, 20, -42 + i * 16, 20, -52 + i * 16, 50]);
    ctx.fill();
  }
  ctx.restore();
  // escapamento nas costas
  ctx.fillStyle = c.black;
  ctx.fillRect(80, -54, 18, 28);
  ctx.fillStyle = c.mid;
  ctx.fillRect(78, -58, 22, 6);
  // reator no peito (pulsa)
  const core = clamp(0.4 + st.rage * 0.4 + k.atk * 0.5 + 0.1 * Math.sin(st.t * 4)) * c.lit;
  ctx.fillStyle = c.black;
  ctx.beginPath();
  ctx.arc(40, 6, 18, 0, TAU);
  ctx.fill();
  ctx.fillStyle = rgrad(ctx, 40, 6, 14, '#ffffff', s.pal.glow);
  ctx.globalAlpha = 0.4 + core * 0.6;
  ctx.beginPath();
  ctx.arc(40, 6, 12, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  // ventoinha do reator
  ctx.strokeStyle = hexA(c.black, 0.7);
  ctx.lineWidth = 2.5;
  const fan = st.t * 5 + g.dist * 0.05;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = fan + (i * TAU) / 3;
    ctx.moveTo(40, 6);
    ctx.lineTo(40 + Math.cos(a) * 12, 6 + Math.sin(a) * 12);
  }
  ctx.stroke();
  bloom(ctx, 40, 6, 44, s.pal.glow, core * 0.6);

  // cabine com visor e olho vermelho que varre
  ctx.fillStyle = vgrad(ctx, -50, 20, c.body, c.dark);
  poly(ctx, [-70, -50, -20, -56, -10, 10, -84, 18, -112, -12]);
  ctx.fill();
  ctx.fillStyle = hexA('#ffffff', 0.12);
  poly(ctx, [-70, -50, -20, -56, -22, -44, -100, -14, -112, -12]);
  ctx.fill();
  ctx.fillStyle = '#0a0a0e';
  poly(ctx, [-100, -14, -26, -26, -26, -8, -94, -2]);
  ctx.fill();
  const scanIdle = Math.sin(st.t * 1.7) * 22 * (1 - g.w * 0.7);
  const scan = scanIdle - 20 - k.shoot * wu * 22 - k.slam * wu * 10;
  eyeGlow(ctx, -60 + scan, -13, 7 + st.rage * 2 + k.roar * sk * 4 + fire * 2, s.pal.eye, c.lit);
  // luz de alerta no topo (gira na raiva)
  const al = (0.3 + st.rage * 0.7) * c.lit * (0.5 + 0.5 * Math.sin(st.t * 8));
  ctx.fillStyle = hexA(s.pal.eye, 0.35 + al * 0.65);
  ctx.fillRect(-46, -62, 12, 6);
  bloom(ctx, -40, -62, 22, s.pal.eye, al * 0.6);
  ctx.restore();

  // ---- perna da frente e arma da frente
  const aF = leg(hipF, footF, c.body, hexA(c.light, 0.9), c.light);
  const muzzle = gun({ x: -18, y: -30 }, true);

  // ---- vapor e faíscas nas pisadas
  const plant = (A: V, f: Foot, seed: number) => {
    if (f.imp <= 0.01) return;
    const u = 1 - f.imp;
    steam(ctx, A.x + 26, A.y + 6, u, 0.9, 34, -30, 0.8);
    steam(ctx, A.x - 40, -4, u, 0.35, -36, -6, 0.7, '170,160,146');
    if (g.mv > 0.55) spark(ctx, A.x - 50, -2, u, 0.9, 6, seed + Math.floor(st.gait * 2), s.pal.glow, 40, -Math.PI * 0.75, 1.2);
  };
  if (k.slam === 0 || p > 0.95) plant(aF, fF, 10);
  plant(aB, fB, 20);
  // ---- impacto do pisão
  if (k.slam > 0) {
    const u = sm(0.52, 0.9, p);
    if (p > 0.52 && p < 0.92) {
      steam(ctx, aF.x + 30, -10, u, 1, 70, -20, 1.4);
      steam(ctx, aF.x - 50, -10, u, 1, -80, -16, 1.4, '130,120,110');
      spark(ctx, aF.x - 40, -6, u, 1, 12, 3, s.pal.glow, 90, -Math.PI / 2, 2.8);
      // vapor das válvulas do tronco
      const v = rot({ x: T.x + 90, y: T.y - 50 }, T, tilt);
      steam(ctx, v.x, v.y, u, 0.9, 40, -50, 1.1);
    }
  }
  // ---- vapor ocioso do escapamento (respiração da máquina)
  const vent = frac(st.t * 0.45);
  const ventP = rot({ x: T.x + 90, y: T.y - 60 }, T, tilt);
  steam(ctx, ventP.x, ventP.y, vent * 1.4, (0.45 + st.rage * 0.4 + g.mv * 0.3) * (1 - die), 30, -60, 0.8);
  // ---- dano: faíscas saindo da blindagem
  const coreP = rot({ x: T.x + 10, y: T.y }, T, tilt);
  if (st.hurt > 0.05) spark(ctx, coreP.x, coreP.y - 20, 1 - st.hurt, 1, 8, 41, '#ffd27a', 70, -Math.PI * 0.6, 2.4);
  // ---- morte: faíscas, fumaça preta e o colapso
  if (die > 0) {
    spark(ctx, coreP.x - 20, coreP.y - 30, sm(0.05, 0.3, die), 1, 10, 51, '#ffd27a', 90);
    spark(ctx, coreP.x + 30, coreP.y - 10, sm(0.4, 0.62, die), 1, 10, 61, '#ffd27a', 90);
    for (let i = 0; i < 3; i++) {
      const u = frac(st.t * 0.5 + i / 3);
      steam(ctx, coreP.x + 20 + i * 14, coreP.y - 70, u, sm(0.15, 0.45, die) * 1.6, 30, -110, 1.3, '70,70,78');
    }
    if (die > 0.78 && die < 0.98) steam(ctx, coreP.x - 60, -8, sm(0.78, 1, die), 1, -90, -10, 1.6, '110,104,98');
  }

  return {
    mouth: muzzle,
    hand: k.slam > 0 ? { x: aF.x - 40, y: Math.min(-8, aF.y + 20) } : { x: muzzle.x + 20, y: muzzle.y + 10 },
    core: coreP,
    top: T.y - 120,
    halfW: 150,
  };
}

// ------------------------------------------------------------------ 1: O RELOJOEIRO

const CK_FOOT = [-32, 14, -24, -2, 12, -5, 20, 14];

function clockmaker(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState, k: K, c: C, ks = 1): Anchors {
  const { wu, sk, b, die, p } = k;
  const g = gaitOf(st, ks);
  const brass = c.body, brassD = c.dark;
  const lift = 12 + 22 * g.mv;
  const fF = footAt(g, 0, 0.6, lift);
  const fB = footAt(g, 0.5, 0.6, lift);

  // badalada: o corpo inteiro vibra como um sino
  const ring = k.roar * sk * (1 - sm(0.75, 1, p));
  const buzz = Math.sin(st.t * 70) * 3 * ring;
  // morte: a corda acaba — ajoelha e tomba para a frente
  const dKnee = easeIn(sm(0.15, 0.6, die));
  const dFall = sm(0.45, 0.85, die);
  const dBounce = Math.sin(sm(0.82, 1, die) * Math.PI) * 0.07;

  const liftY = k.roar * (wu * 16 - sk * 6) + k.cast * (wu * 14 + sk * 6) - k.slam * (sk * 18 + k.imp * 8) + k.slam * wu * 8
    - k.shoot * wu * 16 + k.shoot * sk * 4 - dKnee * 52 - dFall * 18;
  // passo "tic-tac": leve solavanco a cada pisada
  const tick = Math.pow(1 - frac(g.ph * 2), 6) * 3 * g.w;
  const bob = bobOf(g, 4 + 6 * g.mv) + tick;
  const T: V = {
    x: buzz + Math.sin(st.t * 0.9) * 3 * (1 - g.w) + k.shoot * (wu * 10 - sk * 8) + st.hurt * 5,
    y: -190 + b * 4 * (1 - g.w) - liftY + bob,
  };
  const lean = -0.06 * g.mv * g.dir + Math.sin(TAU * g.ph) * 0.03 * g.w
    + k.slam * (wu * 0.12 - sk * 0.22 - k.ft * 0.05) - k.charge * sk * 0.15 + k.roar * (wu * 0.1 - sk * 0.04)
    + k.shoot * (wu * 0.08 - sk * 0.1) - k.cast * sk * 0.05 + st.hurt * 0.1 - dFall * 0.55 + dBounce;
  const spinK = 1 + k.cast * (wu + sk) * 6 + st.rage * 1.5 + k.roar * sk * 3;
  const glowA = clamp(0.5 + st.rage * 0.3 + k.atk * 0.5) * c.lit;
  const nG = Math.max(3, Math.min(7, s.feat.gears ?? 5));
  // engrenagens: giram com o tempo E com a distância andada (mais rápido andando)
  const gearRot = st.t * spinK * (1 - die * 0.9) + g.dist * 0.025;

  // engrenagens atrás do corpo
  const gearPos: [number, number, number][] = [[70, -80, 46], [-60, -96, 34], [96, -6, 30], [40, -140, 26], [-90, -30, 24], [120, -110, 20], [-40, -150, 18]];
  ctx.save();
  ctx.translate(T.x, T.y);
  ctx.rotate(lean * 0.5);
  for (let i = 0; i < nG; i++) {
    const [x, y, r] = gearPos[i];
    const spread = 1 + k.cast * (wu + sk) * 0.25 + ring * 0.08;
    // as engrenagens soltas balançam com atraso (sobreposição)
    const lag = Math.sin(TAU * (g.ph - 0.15 - i * 0.05) * 2) * 3 * g.w;
    const fallY = die > 0 ? easeIn(sm(0.25 + i * 0.05, 0.75 + i * 0.03, die)) * (190 - y) : 0;
    gear(ctx, x * spread, y * spread + lag + fallY, r, 8 + Math.round(r / 8), gearRot * (i % 2 ? -1 : 1) * (40 / r) + fallY * 0.03,
      i % 2 ? brass : mixHex(brass, brassD, 0.35), brassD);
  }
  ctx.restore();

  // pernas finas com engrenagem no joelho e pistão
  const hipF = rot({ x: T.x - 22, y: T.y + 66 }, T, lean);
  const hipB = rot({ x: T.x + 22, y: T.y + 66 }, T, lean);
  const footF = { x: -30 + fF.x, y: fF.y, pitch: fF.pitch };
  const footB = { x: 30 + fB.x, y: fB.y, pitch: fB.pitch };
  if (die > 0) {
    // os pés deslizam um pouco para a frente quando ele ajoelha
    footF.x -= dKnee * 18;
  }
  const leg = (hip: V, f: { x: number; y: number; pitch: number }, col: string) => {
    const A = ankleFor(f, CK_FOOT);
    const Kn = ik(hip, A, 64, 64, 1);
    const thA = Math.atan2(Kn.y - hip.y, Kn.x - hip.x);
    const shA = Math.atan2(A.y - Kn.y, A.x - Kn.x);
    limb(ctx, hip, Kn, 15, 12, col, hexA(c.light, 0.8));
    limb(ctx, Kn, A, 12, 10, col, hexA(c.light, 0.8));
    // pistão fino (haste desliza)
    piston(ctx, { x: hip.x + 9, y: hip.y + 6 }, { x: A.x + 8, y: A.y - 8 }, 46, 7, brassD, c.light, col);
    gear(ctx, Kn.x, Kn.y, 13, 8, (shA - thA) * 3, mixHex(col, '#ffffff', 0.15), brassD);
    ctx.save();
    ctx.translate(A.x, A.y);
    ctx.rotate(f.pitch);
    ctx.fillStyle = col;
    poly(ctx, CK_FOOT);
    ctx.fill();
    ctx.fillStyle = brassD;
    ctx.fillRect(-26, 8, 42, 4);
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, TAU);
    ctx.fill();
    ctx.restore();
    return A;
  };
  const aB = leg(hipB, footB, c.mid);

  // braços
  const arm = (sh: V, a1: number, a2: number, col: string): V => {
    const S = rot({ x: T.x + sh.x, y: T.y + sh.y }, T, lean);
    const E = { x: S.x + Math.cos(a1) * 62, y: S.y + Math.sin(a1) * 62 };
    const H = { x: E.x + Math.cos(a2) * 58, y: E.y + Math.sin(a2) * 58 };
    limb(ctx, S, E, 13, 11, col, hexA(c.light, 0.7));
    limb(ctx, E, H, 11, 9, col, hexA(c.light, 0.7));
    gear(ctx, E.x, E.y, 9, 6, (a2 - a1) * 3, brassD, col);
    ctx.strokeStyle = col;
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let i = -1; i <= 1; i++) {
      ctx.moveTo(H.x, H.y);
      ctx.lineTo(H.x + Math.cos(a2 + i * 0.5) * 18, H.y + Math.sin(a2 + i * 0.5) * 18);
    }
    ctx.stroke();
    return H;
  };
  // ângulos dos braços por pose
  let bA1 = 2.2, bA2 = 2.8, fA1 = 2.1, fA2 = 3.45;
  const sway = Math.sin(st.t * 1.5) * 0.06 * (1 - g.w);
  // balanço dos braços oposto ao das pernas
  const armSw = Math.sin(TAU * (g.ph - 0.1)) * 0.28 * g.w;
  const A = (kk: number, w: number[], sv: number[]) => {
    if (kk <= 0) return;
    bA1 += kk * (wu * (w[0] - bA1) + sk * (sv[0] - bA1));
    bA2 += kk * (wu * (w[1] - bA2) + sk * (sv[1] - bA2));
    fA1 += kk * (wu * (w[2] - fA1) + sk * (sv[2] - fA1));
    fA2 += kk * (wu * (w[3] - fA2) + sk * (sv[3] - fA2));
  };
  // (ângulos contínuos: π = frente/esquerda, 3π/2 = para cima — nada de girar pelo lado de trás)
  A(k.cast, [4.3, 4.0, 4.2, 4.0], [3.2, 3.3, 3.1, 3.2]);
  A(k.slam, [4.4, 4.6, 4.4, 4.9], [2.4, 2.3, 2.5, 2.2]);
  A(k.roar, [4.9, 5.4, 3.6, 3.9], [5.2, 5.7, 3.9, 4.3]);
  A(k.shoot, [1.9, 2.6, 1.7, 3.3], [2.2, 2.8, 3.1, 3.15]);
  A(k.swipe, [2.2, 2.8, 4.2, 4.6], [2.2, 2.8, 2.6, 2.2]);
  A(k.charge, [2.6, 3.0, 2.8, 3.1], [2.9, 3.1, 3.0, 3.1]);
  // follow-through: passa do ponto e volta
  fA2 += k.ft * (k.slam * 0.2 - k.shoot * 0.15 + k.cast * 0.1);
  bA1 -= sm(0, 0.7, die) * 0.6; fA1 -= sm(0, 0.7, die) * 0.5; fA2 -= sm(0.2, 0.8, die) * 1.0;
  arm({ x: 30, y: -40 }, bA1 + sway - armSw, bA2 + sway - armSw * 1.3, c.mid);

  // pêndulo: balança sozinho parado; andando, segue as passadas com atraso
  const pend = Math.sin(st.t * 2.6) * 0.32 * (1 - g.w) * (1 - die) + Math.sin(TAU * (g.ph - 0.18)) * 0.42 * g.w
    - lean * 0.8 + ring * Math.sin(st.t * 16) * 0.3 + st.vx * 0.0012 + dKnee * 1.1;
  ctx.save();
  ctx.translate(T.x, T.y + 50);
  ctx.rotate(pend + lean);
  ctx.strokeStyle = brassD;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 86);
  ctx.stroke();
  ctx.fillStyle = rgrad(ctx, -5, 86, 22, c.light, brass);
  ctx.beginPath();
  ctx.arc(0, 92, 18, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = brassD;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(T.x, T.y);
  ctx.rotate(lean);
  // chave de corda nas costas (gira com a caminhada; dispara no tiro de mola)
  const keyA = st.t * 1.2 * (1 - die) + g.dist * 0.03 + k.shoot * wu * 14 - k.shoot * sk * 3;
  ctx.save();
  ctx.translate(62, -10);
  ctx.fillStyle = brassD;
  ctx.fillRect(0, -4, 16, 8);
  ctx.translate(16, 0);
  ctx.scale(Math.cos(keyA) * 0.7 + 0.3 * Math.sign(Math.cos(keyA) || 1), 1);
  ctx.fillStyle = c.light;
  ctx.strokeStyle = brassD;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(4, -11, 8, 11, 0, 0, TAU);
  ctx.moveTo(12, 11);
  ctx.ellipse(4, 11, 8, 11, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = brassD;
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, TAU);
  ctx.fill();
  ctx.restore();
  // casaca de latão (tronco em barril)
  ctx.fillStyle = vgrad(ctx, -80, 80, c.light, brassD);
  ctx.beginPath();
  ctx.moveTo(-58, -64);
  ctx.quadraticCurveTo(-82, 0, -50, 72);
  ctx.lineTo(50, 72);
  ctx.quadraticCurveTo(82, 0, 58, -64);
  ctx.closePath();
  ctx.fill();
  // sombra lateral (volume do barril)
  ctx.fillStyle = hexA('#000000', 0.18);
  ctx.beginPath();
  ctx.moveTo(30, -64);
  ctx.quadraticCurveTo(70, 0, 34, 72);
  ctx.lineTo(50, 72);
  ctx.quadraticCurveTo(82, 0, 58, -64);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = brassD;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-64, 44);
  ctx.lineTo(64, 44);
  ctx.stroke();
  rivets(ctx, -50, 64, 50, 64, 7, brassD);
  rivets(ctx, -48, -56, 48, -56, 6, brassD, 2.2);
  // mostrador do relógio no peito
  const R = 46;
  ctx.fillStyle = brassD;
  ctx.beginPath();
  ctx.arc(-6, -2, R + 8, 0, TAU);
  ctx.fill();
  ctx.fillStyle = hurtTint(NUL, st, '#f4ead0');
  ctx.beginPath();
  ctx.arc(-6, -2, R, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#3a2a10';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    ctx.moveTo(-6 + Math.cos(a) * R * 0.8, -2 + Math.sin(a) * R * 0.8);
    ctx.lineTo(-6 + Math.cos(a) * R * 0.94, -2 + Math.sin(a) * R * 0.94);
  }
  ctx.stroke();
  // ponteiros: o de segundos anda em "tiques" (salta e assenta)
  const hm = st.t * 0.4 * spinK * (1 - die), hh = hm / 12 + 1;
  const tk = st.t * 2 * (1 - die);
  const sec = ((Math.floor(tk) + clamp(frac(tk) * 5) + Math.sin(clamp(frac(tk) * 5) * Math.PI) * 0.15) / 60) * TAU * spinK;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-6, -2);
  ctx.lineTo(-6 + Math.cos(hh - 1.57) * R * 0.5, -2 + Math.sin(hh - 1.57) * R * 0.5);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-6, -2);
  ctx.lineTo(-6 + Math.cos(hm - 1.57) * R * 0.82, -2 + Math.sin(hm - 1.57) * R * 0.82);
  ctx.stroke();
  ctx.strokeStyle = hurtTint(NUL, st, '#b02a1a');
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-6 - Math.cos(sec - 1.57) * 10, -2 - Math.sin(sec - 1.57) * 10);
  ctx.lineTo(-6 + Math.cos(sec - 1.57) * R * 0.9, -2 + Math.sin(sec - 1.57) * R * 0.9);
  ctx.stroke();
  ctx.fillStyle = c.accent;
  ctx.beginPath();
  ctx.arc(-6, -2, 5, 0, TAU);
  ctx.fill();
  // vidro do mostrador
  ctx.fillStyle = hexA('#ffffff', 0.18);
  ctx.beginPath();
  ctx.ellipse(-20, -18, 22, 12, -0.6, 0, TAU);
  ctx.fill();
  bloom(ctx, -6, -2, R * 1.4, s.pal.glow, glowA * 0.35 + ring * 0.6 + k.cast * k.imp * 0.5);
  // ondas da badalada
  if (ring > 0.05) {
    ctx.strokeStyle = hexA(s.pal.glow, ring * 0.8);
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const q = frac(st.t * 3 + i / 3);
      ctx.beginPath();
      ctx.arc(-6, -2, R + 10 + q * 60, 0, TAU);
      ctx.globalAlpha = 1 - q;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // cabeça pequena (estabiliza: compensa parte da inclinação)
  ctx.save();
  ctx.translate(-10, -80);
  ctx.rotate(-lean * 0.5 + Math.sin(TAU * 2 * (g.ph - 0.2)) * 0.03 * g.w - k.roar * wu * 0.15);
  ctx.translate(10, 80);
  ctx.fillStyle = brassD;
  ctx.fillRect(-20, -70, 20, 12);
  ctx.fillStyle = vgrad(ctx, -120, -64, c.light, brass);
  ctx.beginPath();
  ctx.ellipse(-10, -94, 30, 30, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = hexA('#000000', 0.15);
  ctx.beginPath();
  ctx.ellipse(2, -90, 18, 26, 0, -1.2, 1.6);
  ctx.fill();
  // grade da boca (abre na badalada)
  const jaw = k.roar * (wu * 2 + sk * 8);
  ctx.fillStyle = '#1a1208';
  ctx.fillRect(-38, -84, 22, 6 + jaw);
  ctx.strokeStyle = brassD;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    ctx.moveTo(-36 + i * 6, -84);
    ctx.lineTo(-36 + i * 6, -76 + jaw);
  }
  ctx.stroke();
  // cartola (atrasa nas passadas; pula na badalada; cai na morte)
  const hatLag = Math.sin(TAU * 2 * (g.ph - 0.3)) * 0.06 * g.w;
  const hatFly = sm(0.25, 0.7, die);
  const hatTilt = -0.12 + hatLag + k.roar * (sk * -0.35) - hatFly * 2.2;
  ctx.save();
  ctx.translate(-8 + hatFly * 110, -118 - k.roar * sk * 14 - Math.sin(hatFly * Math.PI) * 90);
  ctx.rotate(hatTilt);
  const hatA = 1 - sm(0.55, 0.75, die);
  ctx.globalAlpha = hatA;
  ctx.fillStyle = hurtTint(NUL, st, '#1e1610');
  ctx.fillRect(-42, -6, 84, 10);
  ctx.fillRect(-28, -66, 56, 62);
  ctx.fillStyle = hexA('#ffffff', 0.08);
  ctx.fillRect(-28, -66, 14, 62);
  ctx.fillStyle = c.accent;
  ctx.globalAlpha = (0.5 + glowA * 0.5) * hatA;
  ctx.fillRect(-28, -18, 56, 6);
  ctx.globalAlpha = hatA;
  gear(ctx, 20, -40, 12, 8, -gearRot * 2, brass, '#1e1610');
  ctx.globalAlpha = 1;
  ctx.restore();
  // olho-monóculo ciano (pisca de vez em quando)
  const blink = frac(st.t / 3.7) > 0.96 ? 0.1 : 1;
  ctx.strokeStyle = c.accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(-24, -98, 11, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = hexA(c.accent, 0.6);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-14, -92);
  ctx.quadraticCurveTo(-4, -70 + Math.sin(st.t * 2) * 3, 4, -64);
  ctx.stroke();
  eyeGlow(ctx, -24, -98, 6 + st.rage * 2 + ring * 3, s.pal.eye, c.lit * blink);
  ctx.restore();
  ctx.restore();

  const aF = leg(hipF, footF, brass);
  const hand = arm({ x: -40, y: -42 }, fA1 - sway + armSw * 0.7, fA2 - sway + armSw, brass);
  // lança em forma de ponteiro na mão da frente
  const la = fA2 - sway + armSw;
  ctx.save();
  ctx.translate(hand.x, hand.y);
  ctx.rotate(la);
  ctx.fillStyle = vgrad(ctx, -6, 6, c.light, brassD);
  poly(ctx, [-50, -5, 64, -5, 64, 5, -50, 5]);
  ctx.fill();
  ctx.fillStyle = brass;
  ctx.beginPath();
  ctx.arc(-50, 0, 10, 0, TAU);
  ctx.fill();
  ctx.fillStyle = c.accent;
  ctx.beginPath();
  ctx.moveTo(60, -14);
  ctx.lineTo(108, 0);
  ctx.lineTo(60, 14);
  ctx.lineTo(70, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  const tip = { x: hand.x + Math.cos(la) * 108, y: hand.y + Math.sin(la) * 108 };
  // rastro do ponteiro no golpe
  const smear = k.slam * sm(0.4, 0.5, p) * (1 - sm(0.54, 0.62, p));
  if (smear > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = hexA(s.pal.glow, smear * 0.5);
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.arc(hand.x, hand.y, 92, la + 0.08, la + 1.3);
    ctx.stroke();
    ctx.restore();
  }
  bloom(ctx, tip.x, tip.y, 26, s.pal.glow, glowA * 0.7);
  // círculo de tempo no cast
  const cg = k.cast * clamp(wu + sk) + ring * 0.6;
  if (cg > 0.05) magicCircle(ctx, T.x - 6, T.y - 2, 104 * cg, s.pal.glow, cg * 0.45, st.t * 3, 1);
  // impacto do ponteiro no chão
  if (k.slam > 0 && p > 0.52 && p < 0.92) {
    const u = sm(0.52, 0.9, p);
    spark(ctx, tip.x, Math.min(tip.y, -2), u, 1, 10, 7, s.pal.glow, 80);
    steam(ctx, tip.x, -6, u, 0.6, -50, -10, 1, '170,150,110');
    steam(ctx, tip.x, -6, u, 0.6, 50, -10, 1, '170,150,110');
  }
  // vapor/pó nas pisadas
  for (const [A2, f] of [[aF, fF], [aB, fB]] as const) {
    if (f.imp > 0.01 && !(k.slam && A2 === aF && p < 0.95)) {
      steam(ctx, A2.x - 18, -4, 1 - f.imp, 0.35, -26, -6, 0.5, '190,170,130');
    }
  }
  // dano: molas e parafusos saltam
  const coreP = rot({ x: T.x - 6, y: T.y - 2 }, T, lean);
  if (st.hurt > 0.05) spark(ctx, coreP.x, coreP.y, 1 - st.hurt, 1, 8, 77, '#ffe9a8', 70, -Math.PI * 0.6, 2.4);
  if (die > 0) {
    spark(ctx, coreP.x, coreP.y, sm(0.05, 0.3, die), 1, 12, 88, '#ffe9a8', 100);
    // mola solta pulando para longe
    const u = sm(0.1, 0.6, die);
    if (u > 0 && u < 1) {
      ctx.strokeStyle = c.light;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const sx = coreP.x + 40 + u * 120, sy = coreP.y - Math.sin(u * Math.PI) * 120 + u * 170;
      for (let i = 0; i <= 12; i++) ctx.lineTo(sx + i * 2, sy + Math.sin(i * 1.6 + u * 20) * 6);
      ctx.stroke();
    }
  }

  return {
    mouth: k.shoot > 0 ? tip : coreP,
    hand: { x: tip.x, y: Math.min(tip.y, -4) },
    core: coreP,
    top: T.y - 200,
    halfW: 140,
  };
}

// ------------------------------------------------------------------ 2: SENTINELA ÔMEGA

function sentinel(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState, k: K, c: C): Anchors {
  const { wu, sk, die, p } = k;
  const g = gaitOf(st);
  const R = 92;
  const vxN = clamp(st.vx / 150, -1, 1);
  // morte: soluça no ar, despenca, quica e tomba
  const dFall = easeIn(sm(0.2, 0.62, die));
  const dHit = sm(0.6, 0.64, die);
  const dBounce = Math.sin(sm(0.62, 0.82, die) * Math.PI) * 22;
  const sputter = die > 0 ? Math.sin(st.t * 31) * 8 * sm(0, 0.2, die) * (1 - dHit) : 0;
  // tiro: recua carregando, coice no disparo
  const kick = k.shoot * (wu * 22 + k.imp * 20 - sk * 6);
  const hover = Math.sin(st.t * 1.6) * 10 * (1 - die) + Math.sin(TAU * g.ph * 2) * 4 * g.w;
  const flyY = -200 + hover - k.cast * (wu * 24 - k.imp * 10) - k.roar * wu * 20 + k.shoot * wu * 8 + sputter;
  const yy = mix(flyY, -R + 4, dFall) - dBounce;
  const O: V = { x: kick + st.hurt * 10, y: yy };
  const open = clamp(k.cast * (wu * 0.7 + sk) + k.roar * (wu + sk) + st.rage * 0.15 - k.shoot * wu * 0.15 + sm(0.62, 0.9, die) * 0.5);
  const spinA = st.t * 0.5 + g.dist * 0.012 + k.cast * (wu * -0.6 + sk * 2.2) + k.swipe * (wu * -0.8 + sk * 2.4);
  const lensK = clamp(0.5 + st.rage * 0.3 + k.shoot * (wu * 1.2 + sk) + k.roar * sk * 0.6) * c.lit;
  const nD = Math.max(0, Math.min(6, s.feat.drones ?? 4));
  // inclina para a direção em que voa; balanço das "passadas"; tranco do dano
  const tiltO = vxN * 0.22 * (1 - die) + Math.sin(TAU * g.ph) * 0.05 * g.w + k.shoot * (wu * 0.1 - k.imp * 0.08)
    + st.hurt * 0.25 + k.swipe * (wu * 0.2 - sk * 0.3) + dFall * 0.5 + dHit * 0.4 + (die > 0 ? Math.sin(st.t * 13) * 0.08 * (1 - dHit) * sm(0, 0.1, die) : 0);

  // sombra no chão (cresce quando desce)
  const hgt = -yy - R;
  ctx.fillStyle = `rgba(0,0,0,${(0.2 + clamp(1 - hgt / 220) * 0.25).toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(O.x, -4, Math.max(20, 110 - hgt * 0.25), 12, 0, 0, TAU);
  ctx.fill();
  // poeira do chão soprada pelos propulsores
  const blow = clamp(1 - hgt / 160) * (1 - die);
  if (blow > 0.05) {
    for (let i = 0; i < 4; i++) {
      const u = frac(st.t * 0.9 + i / 4);
      const sd = i % 2 ? 1 : -1;
      ctx.fillStyle = `rgba(127,224,255,${(blow * (1 - u) * 0.18).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(O.x + sd * (30 + u * 90), -8 - u * 10, 14 + u * 20, 6 + u * 4, 0, 0, TAU);
      ctx.fill();
    }
  }

  // propulsores (jatos), presos ao corpo e inclinando com ele
  const thrOn = c.lit * (die > 0 ? (Math.sin(st.t * 23) > 0.3 ? 0.4 : 1) * (1 - dHit) : 1);
  const thr = thrOn * (0.65 + 0.35 * Math.sin(st.t * 20));
  const jetL = 70 + g.mv * 40 + k.cast * wu * 30 + k.imp * 30;
  ctx.save();
  ctx.translate(O.x, O.y);
  ctx.rotate(tiltO);
  ctx.globalCompositeOperation = 'lighter';
  for (const dx of [-32, 32]) {
    const L2 = jetL * (0.9 + 0.1 * Math.sin(st.t * 17 + dx));
    ctx.fillStyle = vgrad(ctx, R - 6, R + L2, hexA('#7fe0ff', 0.75 * thr), hexA('#7fe0ff', 0));
    poly(ctx, [dx - 11, R - 6, dx + 11, R - 6, dx + 16 + g.mv * 4, R + L2, dx - 16 - g.mv * 4, R + L2]);
    ctx.fill();
    ctx.fillStyle = vgrad(ctx, R - 6, R + L2 * 0.5, hexA('#ffffff', 0.8 * thr), hexA('#ffffff', 0));
    poly(ctx, [dx - 5, R - 6, dx + 5, R - 6, dx + 3, R + L2 * 0.5, dx - 3, R + L2 * 0.5]);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  // bocais dos propulsores
  ctx.fillStyle = c.dark;
  for (const dx of [-32, 32]) poly(ctx, [dx - 14, R - 22, dx + 14, R - 22, dx + 11, R - 2, dx - 11, R - 2]);
  ctx.fill();
  ctx.restore();

  // drones orbitando (os de trás primeiro); a órbita fica para trás quando ele voa (atraso)
  const drones: { p: V; z: number }[] = [];
  const orbR = 150 + k.cast * (wu * 30 + sk * 40) + k.roar * wu * 30;
  const orbX = O.x - st.vx * 0.22;
  for (let i = 0; i < nD; i++) {
    const a = st.t * (0.9 + k.cast * (wu + sk) * 2.5) + (i / nD) * TAU;
    const lag = -st.vx * 0.06 * (1 + Math.sin(a));
    let dx = orbX + Math.cos(a) * orbR + lag;
    let dy = O.y + Math.sin(a) * orbR * 0.32 - 10 + Math.sin(st.t * 2.3 + i * 1.7) * 6;
    // morte: cada drone apaga e cai num momento diferente
    if (die > 0) {
      const f = easeIn(sm(0.1 + i * 0.08, 0.5 + i * 0.08, die));
      dy = mix(dy, -14, f);
      dx += f * (i % 2 ? 30 : -20);
    }
    drones.push({ p: { x: dx, y: dy }, z: Math.sin(a) });
  }
  const drawDrone = (d: { p: V; z: number }, i: number) => {
    const sc = 0.85 + d.z * 0.2;
    ctx.save();
    ctx.translate(d.p.x, d.p.y);
    ctx.rotate(vxN * 0.3 + Math.sin(st.t * 3 + i) * 0.08 + (die > 0 ? sm(0.3, 0.7, die) * (i % 2 ? 1.2 : -1.2) : 0));
    ctx.scale(sc, sc);
    ctx.fillStyle = vgrad(ctx, -14, 14, d.z > 0 ? c.light : c.mid, c.dark);
    ctx.beginPath();
    ctx.ellipse(0, 0, 22, 13, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = c.dark;
    ctx.fillRect(-32, -3, 64, 6);
    // hélices girando
    const pr = Math.abs(Math.sin(st.t * 40 + i)) * (1 - die);
    ctx.fillStyle = c.mid;
    ctx.fillRect(-36, -8, 8, 16);
    ctx.fillRect(28, -8, 8, 16);
    ctx.fillStyle = hexA(c.light, 0.6);
    ctx.fillRect(-46, -11, 28 * pr + 2, 3);
    ctx.fillRect(18, -11, 28 * pr + 2, 3);
    eyeGlow(ctx, -12, 1, 4, s.pal.eye, c.lit);
    ctx.restore();
  };
  drones.forEach((d, i) => d.z < 0 && drawDrone(d, i));

  ctx.save();
  ctx.translate(O.x, O.y);
  ctx.rotate(tiltO);
  // antenas: balançam com atraso (sobreposição) conforme ele acelera/freia
  const antLag = vxN * 0.35 + Math.sin(st.t * 2.7) * 0.06 + Math.sin(TAU * g.ph * 2 - 1) * 0.05 * g.w + k.imp * 0.3 + st.hurt * 0.3;
  ctx.strokeStyle = c.mid;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(10, -R + 4);
  ctx.quadraticCurveTo(22, -R - 30, 30 + antLag * 40, -R - 52);
  ctx.moveTo(40, -R + 14);
  ctx.quadraticCurveTo(64, -R - 6, 80 + antLag * 20, -R - 22 + antLag * 6);
  ctx.stroke();
  // painel solar
  ctx.save();
  ctx.translate(80 + antLag * 20, -R - 22 + antLag * 6);
  ctx.rotate(0.45 + antLag * 0.4);
  ctx.fillStyle = hurtTint(NUL, st, '#2a3a5a');
  ctx.fillRect(-6, -12, 52, 24);
  ctx.strokeStyle = hexA('#7fe0ff', 0.5);
  ctx.lineWidth = 1;
  ctx.strokeRect(-6, -12, 52, 24);
  ctx.beginPath();
  for (let i = 1; i < 4; i++) {
    ctx.moveTo(-6 + i * 13, -12);
    ctx.lineTo(-6 + i * 13, 12);
  }
  ctx.moveTo(-6, 0);
  ctx.lineTo(46, 0);
  ctx.stroke();
  ctx.restore();
  eyeGlow(ctx, 30 + antLag * 40, -R - 54, 4, s.pal.eye, c.lit * (0.5 + 0.5 * Math.sin(st.t * 5)));
  // núcleo interno (aparece quando as placas abrem)
  ctx.fillStyle = rgrad(ctx, 0, 0, R, hexA(s.pal.glow, (0.9 + k.cast * k.imp * 0.1) * c.lit), c.dark);
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.86, 0, TAU);
  ctx.fill();
  if (open > 0.1) {
    // engrenagem do núcleo girando
    gear(ctx, 0, 0, R * 0.55, 12, -spinA * 2, hexA(c.mid, 0.9), c.dark);
    bloom(ctx, 0, 0, R * 1.2, s.pal.glow, open * 0.5 * c.lit);
  }
  // placas de blindagem (6 gomos que se afastam do centro)
  for (let i = 0; i < 6; i++) {
    const a0 = spinA + (i / 6) * TAU, a1 = a0 + TAU / 6 - 0.06;
    const am = (a0 + a1) / 2;
    const off = open * 24 + Math.sin(st.t * 2 + i) * 1.2 + (die > 0 ? dHit * h01(i, 4) * 20 : 0);
    ctx.save();
    ctx.translate(Math.cos(am) * off, Math.sin(am) * off);
    ctx.fillStyle = rgrad(ctx, -R * 0.4, -R * 0.4, R * 1.6, c.light, c.dark);
    ctx.beginPath();
    ctx.arc(0, 0, R, a0, a1);
    ctx.arc(0, 0, R * 0.5, a1, a0, true);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = c.dark;
    ctx.lineWidth = 2;
    ctx.stroke();
    // luz de status em cada placa (piscam em sequência)
    const blink = 0.5 + 0.5 * Math.sin(st.t * 4 - i * 1.1);
    ctx.fillStyle = hexA(s.pal.eye, (0.4 + blink * 0.5) * c.lit);
    ctx.beginPath();
    ctx.arc(Math.cos(am) * R * 0.78, Math.sin(am) * R * 0.78, 3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  // brilho especular (volume da esfera)
  ctx.fillStyle = hexA('#ffffff', 0.14);
  ctx.beginPath();
  ctx.ellipse(-R * 0.35, -R * 0.55, R * 0.35, R * 0.16, -0.5, 0, TAU);
  ctx.fill();
  // anel equatorial
  ctx.strokeStyle = c.mid;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.ellipse(0, 0, R + 10, 18, 0, 0.2, Math.PI - 0.2);
  ctx.stroke();
  // luzes correndo no anel (velocidade acompanha o movimento)
  ctx.fillStyle = hexA(s.pal.eye, 0.8 * c.lit);
  for (let i = 0; i < 3; i++) {
    const a = 0.25 + frac(st.t * 0.4 + g.dist * 0.004 + i / 3) * (Math.PI - 0.5);
    ctx.beginPath();
    ctx.arc(Math.cos(a) * (R + 10), Math.sin(a) * 18, 2.6, 0, TAU);
    ctx.fill();
  }
  // lente vermelha (olha para a esquerda; passeia procurando alvos no idle)
  const look = Math.sin(st.t * 0.7) * 6 * (1 - k.atk) + (frac(st.t * 0.31) > 0.8 ? 4 : 0) * (1 - k.atk);
  const L: V = { x: -R * 0.42 - k.shoot * wu * 4, y: 4 + look };
  ctx.fillStyle = c.dark;
  ctx.beginPath();
  ctx.ellipse(L.x, L.y, 40, 44, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = c.mid;
  ctx.beginPath();
  ctx.ellipse(L.x - 4, L.y, 32, 36, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = rgrad(ctx, L.x - 8, L.y - 4, 28, '#ffffff', s.pal.eye);
  ctx.globalAlpha = 0.3 + lensK * 0.7;
  ctx.beginPath();
  ctx.ellipse(L.x - 8, L.y, 22 + lensK * 4, 26 + lensK * 4, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  // íris mecânica: fecha carregando o tiro, escancara no disparo
  const iris = clamp(0.45 - k.shoot * wu * 0.35 + k.imp * 0.5 + k.cast * wu * 0.2 + st.rage * 0.1);
  ctx.strokeStyle = hexA('#000000', 0.55);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + st.t * 0.6 + k.shoot * wu * 3;
    ctx.moveTo(L.x - 8 + Math.cos(a) * 22 * iris, L.y + Math.sin(a) * 24 * iris);
    ctx.lineTo(L.x - 8 + Math.cos(a + 0.9) * 22, L.y + Math.sin(a + 0.9) * 24);
  }
  ctx.stroke();
  ctx.fillStyle = hexA('#2a0000', 0.7);
  ctx.beginPath();
  ctx.arc(L.x - 8, L.y, 6 * iris + 2, 0, TAU);
  ctx.fill();
  ctx.restore();
  const lensW = rot({ x: O.x - R * 0.42 - 14, y: O.y + 4 + look }, O, tiltO);
  bloom(ctx, lensW.x, lensW.y, 50 + lensK * 50 + k.shoot * k.imp * 60, s.pal.eye, lensK * 0.7);
  // linhas de carga convergindo para a lente
  const chg = k.shoot * wu * c.lit;
  if (chg > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = hexA(s.pal.eye, chg * 0.7);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + st.t;
      const r0 = 30 + frac(st.t * 2 + i * 0.37) * 50 * (1 - chg * 0.3);
      ctx.moveTo(lensW.x + Math.cos(a) * r0, lensW.y + Math.sin(a) * r0);
      ctx.lineTo(lensW.x + Math.cos(a) * (r0 - 12), lensW.y + Math.sin(a) * (r0 - 12));
    }
    ctx.stroke();
    ctx.restore();
  }

  drones.forEach((d, i) => d.z >= 0 && drawDrone(d, i));
  // pulso EMP no cast
  const emp = k.cast * sm(0.5, 0.95, p);
  if (emp > 0.02 && emp < 0.99) {
    ctx.strokeStyle = hexA('#7fe0ff', (1 - emp) * 0.9);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(O.x, O.y, R + 20 + emp * 120, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(O.x, O.y, R + 10 + emp * 80, 0, TAU);
    ctx.stroke();
  }
  // dano: faíscas
  if (st.hurt > 0.05) spark(ctx, O.x + 20, O.y - 30, 1 - st.hurt, 1, 8, 91, '#bfefff', 70, -Math.PI * 0.4, 2.4);
  if (die > 0) {
    spark(ctx, O.x + 10, O.y - 20, sm(0.02, 0.25, die), 1, 10, 93, '#bfefff', 90);
    spark(ctx, O.x, -10, sm(0.6, 0.85, die), 1, 14, 97, '#ffd27a', 120, -Math.PI / 2, 2.6);
    if (die > 0.6) {
      steam(ctx, O.x - 60, -10, sm(0.6, 0.95, die), 1, -80, -16, 1.6, '120,130,150');
      steam(ctx, O.x + 60, -10, sm(0.6, 0.95, die), 1, 80, -16, 1.6, '120,130,150');
    }
    for (let i = 0; i < 3; i++) steam(ctx, O.x + 10 + i * 12, O.y - R, frac(st.t * 0.5 + i / 3), sm(0.3, 0.6, die) * 1.4, 26, -100, 1.2, '60,64,72');
  }
  // drone da frente-esquerda = ponto de golpe
  const front = drones.length ? drones.reduce((a, d) => (d.p.x < a.p.x ? d : a)).p : { x: O.x - R, y: O.y + 40 };
  return {
    mouth: lensW,
    hand: k.slam > 0 ? { x: O.x - 40, y: O.y + R } : front,
    core: { x: O.x, y: O.y },
    top: O.y - R - 60,
    halfW: Math.max(R + 20, orbR * 0.9),
  };
}

// ------------------------------------------------------------------ 3: DRAVEX

/** Esteira em "estádio": centro esquerdo (-140,-34), direito (150,-34), raio 32. */
const TR = { x0: -140, x1: 150, cy: -34, r: 32 };
const TR_LEN = (TR.x1 - TR.x0) * 2 + TAU * TR.r;

/** Ponto e tangente na esteira (s anda no sentido: chão → traseira → topo → frente). */
function trackAt(s: number): { x: number; y: number; tx: number; ty: number } {
  const L = TR.x1 - TR.x0, arc = Math.PI * TR.r;
  let q = ((s % TR_LEN) + TR_LEN) % TR_LEN;
  if (q < L) return { x: TR.x0 + q, y: TR.cy + TR.r, tx: 1, ty: 0 };
  q -= L;
  if (q < arc) {
    const a = Math.PI / 2 - q / TR.r;
    return { x: TR.x1 + Math.cos(a) * TR.r, y: TR.cy + Math.sin(a) * TR.r, tx: Math.sin(a), ty: -Math.cos(a) };
  }
  q -= arc;
  if (q < L) return { x: TR.x1 - q, y: TR.cy - TR.r, tx: -1, ty: 0 };
  q -= L;
  const a = -Math.PI / 2 - q / TR.r;
  return { x: TR.x0 + Math.cos(a) * TR.r, y: TR.cy + Math.sin(a) * TR.r, tx: Math.sin(a), ty: -Math.cos(a) };
}

function forge(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState, k: K, c: C): Anchors {
  const { wu, sk, b, die, p } = k;
  const g = gaitOf(st);
  const heat = clamp(0.5 + st.rage * 0.35 + k.atk * 0.4 + k.shoot * (wu + sk) * 0.4) * c.lit;

  // investida: recua e empina (antecipação), dispara para a frente e bate o nariz no chão
  const X0 = 26 + k.charge * (wu * 24 - sk * 70 - k.ft * 10) + k.shoot * k.imp * 6;
  const wheelie = k.charge * (wu * 0.1 - sk * 0.06 - k.imp * 0.04) + k.swipe * (wu * 0.03 - sk * 0.03);
  // distância das esteiras: segue o chão; na investida patina no lugar antes de arrancar
  const dist = g.dist + k.charge * (p * 520 + wu * 40) + (die > 0 ? 0 : st.t * 6 * (1 - g.w));
  const bump = (x: number) => (Math.sin((x - g.dist) * 0.045) + 0.6 * Math.sin((x - g.dist) * 0.11 + 1.3)) * 3 * g.mv;
  // motor: vibração rápida (mais forte andando e na raiva), engasga na morte
  const rumble = Math.sin(st.t * 38) * (0.7 + g.mv * 0.8 + st.rage * 0.6) * (1 - sm(0.3, 0.6, die))
    + (die > 0 ? Math.sin(st.t * 9) * 3 * sm(0, 0.1, die) * (1 - sm(0.3, 0.45, die)) : 0);
  const bF = bump(-120), bB = bump(150);
  // tiros do bombardeio: cada chaminé dispara numa hora (0,48 / 0,58 / 0,68)
  const shot = (i: number) => (k.shoot && st.pose === 'shoot' ? sm(0.46 + i * 0.1, 0.48 + i * 0.1, p) * (1 - sm(0.49 + i * 0.1, 0.62 + i * 0.1, p)) : 0);
  const shots = shot(0) + shot(1) + shot(2);
  const flameOn = k.shoot && st.pose === 'breath' ? k.shoot : 0;
  const dSag = sm(0.3, 0.7, die);

  const H: V = {
    x: 0 + flameOn * sk * 8 + st.hurt * 4,
    y: -108 + rumble + (bF + bB) * 0.5 + b * 1.5 * (1 - g.w) + shots * 5 - k.charge * k.imp * 6 + dSag * 22 + flameOn * wu * -4,
  };
  const tilt = (bB - bF) * 0.004 + Math.sin(st.t * 1.1) * 0.01 * (1 - g.w) - 0.02 * g.mv * g.dir
    + flameOn * (wu * 0.05 - sk * 0.02) - shots * 0.02 + k.charge * (wu * 0.03 - sk * 0.05)
    + st.hurt * 0.06 - dSag * 0.09;

  ctx.save();
  ctx.translate(X0, 0);
  // empinar: gira em volta do contato traseiro da esteira
  ctx.translate(TR.x1 + TR.r, 0);
  ctx.rotate(wheelie);
  ctx.translate(-(TR.x1 + TR.r), 0);

  // fumaça e brasas das chaminés (mais forte andando; a fumaça fica para trás quando ele anda)
  const stacks: [number, number, number, number][] = [[50, -126, 24, 74], [96, -108, 20, 60], [132, -88, 16, 46]];
  const stackTilt = (i: number) => sm(0.35 + i * 0.1, 0.6 + i * 0.1, die) * (0.5 + i * 0.2);
  const stackTops: V[] = stacks.map(([x, y, , hgt], i) => {
    const base = rot({ x: H.x + x, y: H.y + y }, H, tilt);
    const a = tilt + stackTilt(i) - shot(i) * 0.04;
    return { x: base.x + Math.sin(a) * (hgt + shot(i) * -8), y: base.y - Math.cos(a) * (hgt - shot(i) * 8) };
  });
  const smokeRate = 0.5 + g.mv * 0.7 + st.rage * 0.3;
  for (let si = 0; si < stackTops.length; si++) {
    const t0 = stackTops[si];
    for (let i = 0; i < 5; i++) {
      const ph = frac(st.t * (smokeRate + si * 0.1) + i / 5);
      const boom = shot(si) + die * 0.6;
      const drift = 50 + g.mv * 60 * g.dir;
      ctx.fillStyle = `rgba(40,30,25,${((1 - ph) * (0.5 + boom * 0.3)).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(t0.x + ph * drift + Math.sin(ph * 6 + i) * 6, t0.y - ph * (90 + boom * 60), 8 + ph * 22 + boom * 10, 0, TAU);
      ctx.fill();
    }
    for (let i = 0; i < 3; i++) {
      const ph = frac(st.t * 0.9 + i / 3 + si * 0.3);
      ctx.fillStyle = hexA(s.pal.glow, (1 - ph) * heat);
      ctx.beginPath();
      ctx.arc(t0.x + Math.sin(i * 3 + ph * 8) * 14 + ph * g.mv * 30, t0.y - ph * 70, 2.5, 0, TAU);
      ctx.fill();
    }
  }

  // ---- esteiras (presas ao chão; o casco fica em cima da suspensão)
  // corpo interno da esteira
  ctx.fillStyle = hurtTint(NUL, st, '#1a1612');
  ctx.beginPath();
  ctx.arc(TR.x1, TR.cy, TR.r, -Math.PI / 2, Math.PI / 2);
  ctx.arc(TR.x0, TR.cy, TR.r, Math.PI / 2, Math.PI * 1.5);
  ctx.closePath();
  ctx.fill();
  // rodas de apoio (sobem e descem com o terreno) e roda motriz dentada
  const wAng = -dist / 22;
  for (let i = 0; i < 5; i++) {
    const wx = -96 + i * 54, wy = -34 + bump(wx) * 0.6;
    ctx.fillStyle = c.dark;
    ctx.beginPath();
    ctx.arc(wx, wy, 23, 0, TAU);
    ctx.fill();
    ctx.fillStyle = c.mid;
    ctx.beginPath();
    ctx.arc(wx, wy, 16, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = c.dark;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let j = 0; j < 3; j++) {
      const a = wAng + (j * TAU) / 3;
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx + Math.cos(a) * 14, wy + Math.sin(a) * 14);
    }
    ctx.stroke();
    ctx.fillStyle = c.accent;
    ctx.beginPath();
    ctx.arc(wx, wy, 4, 0, TAU);
    ctx.fill();
  }
  gear(ctx, TR.x1, TR.cy, 27, 10, -dist / 27, c.mid, c.dark);
  gear(ctx, TR.x0, TR.cy, 24, 9, -dist / 24, mixHex(c.mid, c.dark, 0.4), c.dark);
  // banda da esteira + garras que andam junto com o chão
  ctx.strokeStyle = hurtTint(NUL, st, '#2a241e');
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(TR.x1, TR.cy, TR.r, -Math.PI / 2, Math.PI / 2);
  ctx.arc(TR.x0, TR.cy, TR.r, Math.PI / 2, Math.PI * 1.5);
  ctx.closePath();
  ctx.stroke();
  ctx.strokeStyle = c.mid;
  ctx.lineWidth = 6;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  const nL = 36, sp = TR_LEN / nL;
  for (let i = 0; i < nL; i++) {
    const q = trackAt(i * sp + dist);
    const nx = q.ty, ny = -q.tx; // normal para fora
    const ox = q.x - nx * 3, oy = q.y - ny * 3;
    ctx.moveTo(ox - q.tx * 6, oy - q.ty * 6);
    ctx.lineTo(ox + q.tx * 6, oy + q.ty * 6);
  }
  ctx.stroke();
  ctx.lineCap = 'round';
  ctx.fillStyle = hexA(c.accent, 0.6);
  ctx.fillRect(-140, -72, 290, 3);

  // ---- suspensão: molas entre a esteira e o casco (comprimem com o peso)
  for (const sx of [-90, 10, 110]) {
    const top = rot({ x: H.x + sx, y: H.y + 30 }, H, tilt);
    const bot = { x: sx, y: -66 };
    ctx.strokeStyle = c.steel;
    ctx.lineWidth = 3;
    ctx.beginPath();
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const q = i / n;
      ctx.lineTo(mix(bot.x, top.x, q) + (i % 2 ? 7 : -7), mix(bot.y, top.y, q));
    }
    ctx.stroke();
    ctx.strokeStyle = c.black;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(bot.x, bot.y);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(H.x, H.y);
  ctx.rotate(tilt);
  ctx.translate(-H.x, -H.y);
  // chaminés (recuam a cada disparo; tombam na morte)
  stacks.forEach(([x, y, w, hgt], i) => {
    ctx.save();
    ctx.translate(H.x + x, H.y + y);
    ctx.rotate(stackTilt(i) - shot(i) * 0.04);
    const kk = shot(i) * 8;
    ctx.fillStyle = vgrad(ctx, -hgt, 0, c.mid, c.dark);
    ctx.fillRect(-w / 2, -hgt + kk, w, hgt + 20 - kk);
    ctx.fillStyle = hexA(c.accent, 0.5);
    ctx.fillRect(-w / 2, -hgt * 0.5 + kk * 0.5, w, 4);
    ctx.fillStyle = c.dark;
    ctx.fillRect(-w / 2 - 4, -hgt - 6 + kk, w + 8, 10);
    ctx.restore();
  });
  // casco-fornalha
  ctx.fillStyle = vgrad(ctx, H.y - 130, H.y + 30, c.light, c.dark);
  poly(ctx, [H.x - 110, H.y + 30, H.x - 120, H.y - 60, H.x - 70, H.y - 120, H.x + 60, H.y - 130, H.x + 150, H.y - 80, H.x + 160, H.y + 30]);
  ctx.fill();
  // volume: faixa clara em cima, sombra embaixo
  ctx.fillStyle = hexA('#ffffff', 0.08);
  poly(ctx, [H.x - 120, H.y - 60, H.x - 70, H.y - 120, H.x + 60, H.y - 130, H.x + 150, H.y - 80, H.x + 140, H.y - 70, H.x + 56, H.y - 112, H.x - 64, H.y - 104, H.x - 108, H.y - 54]);
  ctx.fill();
  ctx.fillStyle = hexA('#000000', 0.25);
  ctx.fillRect(H.x - 110, H.y + 12, 270, 18);
  ctx.strokeStyle = c.dark;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(H.x - 110, H.y - 40); ctx.lineTo(H.x + 155, H.y - 40);
  ctx.stroke();
  rivets(ctx, H.x - 100, H.y - 50, H.x + 140, H.y - 50, 10, c.mid);
  rivets(ctx, H.x - 60, H.y - 112, H.x + 50, H.y - 120, 5, c.mid);
  // manômetro (ponteiro treme; sobe no ataque)
  const gx = H.x + 110, gy = H.y - 20;
  ctx.fillStyle = c.dark;
  ctx.beginPath();
  ctx.arc(gx, gy, 14, 0, TAU);
  ctx.fill();
  ctx.fillStyle = hurtTint(NUL, st, '#e8dcc0');
  ctx.beginPath();
  ctx.arc(gx, gy, 10, 0, TAU);
  ctx.fill();
  const ga = -2.4 + heat * 2.6 + Math.sin(st.t * 23) * 0.08 + g.mv * 0.4 - dSag * 1.5;
  ctx.strokeStyle = '#a01010';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(gx, gy);
  ctx.lineTo(gx + Math.cos(ga) * 9, gy + Math.sin(ga) * 9);
  ctx.stroke();
  // porta da fornalha com grade (tremula)
  const fx = H.x + 30, fy = H.y - 10;
  const flick = 0.85 + 0.15 * Math.sin(st.t * 13) * Math.sin(st.t * 7.3);
  ctx.fillStyle = c.dark;
  ctx.beginPath();
  ctx.arc(fx, fy, 40, Math.PI, 0);
  ctx.lineTo(fx + 40, fy + 26);
  ctx.lineTo(fx - 40, fy + 26);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = rgrad(ctx, fx, fy + 6, 44, hurtTint(NUL, st, '#fff0a0'), s.pal.accent);
  ctx.globalAlpha = (0.35 + heat * 0.65) * flick;
  ctx.beginPath();
  ctx.arc(fx, fy, 32, Math.PI, 0);
  ctx.lineTo(fx + 32, fy + 20);
  ctx.lineTo(fx - 32, fy + 20);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = c.dark;
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let i = -2; i <= 2; i++) {
    ctx.moveTo(fx + i * 12, fy - 32 + Math.abs(i) * 4);
    ctx.lineTo(fx + i * 12, fy + 20);
  }
  ctx.stroke();
  bloom(ctx, fx, fy, 90, s.pal.glow, heat * 0.45 * flick);
  // cabine com olhos-fenda (estreitam na preparação)
  ctx.fillStyle = vgrad(ctx, H.y - 160, H.y - 100, c.body, c.dark);
  poly(ctx, [H.x - 96, H.y - 96, H.x - 80, H.y - 150, H.x - 20, H.y - 156, H.x - 4, H.y - 110]);
  ctx.fill();
  ctx.fillStyle = '#0a0806';
  ctx.fillRect(H.x - 84, H.y - 136, 64, 14);
  const squint = 6 - k.wu * 3 + k.imp * 2;
  for (const ex of [-74, -46]) {
    ctx.fillStyle = hexA(s.pal.eye, c.lit);
    ctx.fillRect(H.x + ex, H.y - 129 - squint / 2, 16, squint);
  }
  bloom(ctx, H.x - 52, H.y - 129, 40, s.pal.eye, c.lit * (0.4 + st.rage * 0.3));
  ctx.restore();

  // ---- bocal do lança-chamas (embaixo, na frente): avança na preparação
  const noz = rot({ x: H.x - 150 - flameOn * (wu * 14 - sk * 4), y: H.y - 18 }, H, tilt);
  ctx.save();
  ctx.translate(noz.x, noz.y);
  ctx.rotate(tilt + flameOn * wu * -0.1);
  ctx.fillStyle = c.mid;
  ctx.fillRect(0, -12, 64, 24);
  ctx.fillStyle = c.dark;
  poly(ctx, [-18, -18, 4, -12, 4, 12, -18, 18]);
  ctx.fill();
  ctx.fillStyle = hexA(c.accent, 0.9);
  ctx.fillRect(12, -12, 6, 24);
  ctx.fillRect(30, -12, 6, 24);
  ctx.restore();
  // chama-piloto (cresce na preparação, ruge no disparo)
  const fl = 10 + flameOn * (wu * 14 + sk * 30);
  ctx.save();
  ctx.translate(noz.x - 18, noz.y);
  ctx.rotate(-Math.PI / 2);
  flame(ctx, 0, 0, fl * 0.45, st.t * 9, s.pal.glow, s.pal.accent, c.lit);
  ctx.restore();

  // ---- braço da serra: ombro no topo-frente
  const sh = rot({ x: H.x - 60, y: H.y - 96 }, H, tilt);
  // ângulos contínuos (π = frente, 3π/2 = para cima)
  let a1 = 3.78 + Math.sin(st.t * 1.2) * 0.05 * (1 - g.w) + Math.sin(TAU * g.ph * 2 - 0.8) * 0.04 * g.w, a2 = 2.4 + Math.sin(st.t * 1.7) * 0.06;
  const A = (kk: number, w1: number, w2: number, s1: number, s2: number) => {
    if (kk <= 0) return;
    a1 += kk * (wu * (w1 - a1) + sk * (s1 - a1));
    a2 += kk * (wu * (w2 - a2) + sk * (s2 - a2));
  };
  A(k.swipe, 4.5, 4.4, 3.2, 1.9);
  A(k.slam, 4.4, 4.3, 3.3, 1.9);
  A(k.charge, 3.4, 3.2, 3.15, 3.1);
  A(flameOn, 4.0, 3.0, 4.1, 3.1);
  A(k.shoot && st.pose === 'shoot' ? 1 : 0, 3.9, 3.0, 4.0, 2.9);
  a2 -= k.swipe * k.ft * 0.25;
  // inércia: a serra atrasa quando ele arranca ou freia
  a2 += (st.vx / 150) * 0.15;
  a1 -= sm(0.2, 0.6, die) * 0.4; a2 -= sm(0.25, 0.7, die) * 0.8;
  const E = { x: sh.x + Math.cos(a1) * 80, y: sh.y + Math.sin(a1) * 80 };
  const W = { x: E.x + Math.cos(a2) * 72, y: Math.min(E.y + Math.sin(a2) * 72, -50) };
  limb(ctx, sh, E, 32, 26, c.body, hexA(c.light, 0.8), c.dark);
  limb(ctx, E, W, 24, 20, c.body, hexA(c.light, 0.8), c.dark);
  // pistão hidráulico (haste desliza com o cotovelo)
  piston(ctx, { x: sh.x + 14, y: sh.y + 16 }, { x: (E.x + W.x) / 2, y: (E.y + W.y) / 2 + 8 }, 50, 12, c.black, c.steel, c.mid);
  gear(ctx, sh.x, sh.y, 22, 10, a1 * 2.5, c.mid, c.dark);
  gear(ctx, E.x, E.y, 17, 8, (a2 - a1) * 3, c.mid, c.dark);
  // rastro da serra no golpe
  const smear = k.swipe * sm(0.38, 0.48, p) * (1 - sm(0.55, 0.64, p));
  if (smear > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = hexA('#c8c8c8', smear * 0.35);
    ctx.lineWidth = 90;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.arc(E.x, E.y, 72, a2 + 0.05, a2 + 1.2);
    ctx.stroke();
    ctx.strokeStyle = hexA(s.pal.glow, smear * 0.5);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(E.x, E.y, 72 + 56, a2 + 0.05, a2 + 1.0);
    ctx.stroke();
    ctx.restore();
    ctx.lineCap = 'round';
  }
  // lâmina da serra girando (desacelera e para na morte)
  const sawR = 56;
  const sawSpin = st.t * (6 + k.swipe * 30 + k.slam * 20 + st.rage * 6) * (1 - sm(0.2, 0.7, die)) + dist * 0.02;
  ctx.save();
  ctx.translate(W.x, W.y);
  ctx.rotate(-sawSpin);
  ctx.fillStyle = hurtTint(NUL, st, '#c8c8c8');
  ctx.beginPath();
  const nT = 24;
  for (let i = 0; i < nT; i++) {
    const a = (i / nT) * TAU;
    ctx.lineTo(Math.cos(a) * sawR, Math.sin(a) * sawR);
    ctx.lineTo(Math.cos(a + 0.18) * sawR * 0.86, Math.sin(a + 0.18) * sawR * 0.86);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = hurtTint(NUL, st, '#8a8a8a');
  ctx.beginPath();
  ctx.arc(0, 0, sawR * 0.62, 0, TAU);
  ctx.fill();
  // borrão de rotação
  ctx.strokeStyle = hexA('#ffffff', 0.25);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, sawR * 0.8, 0, 1.2);
  ctx.stroke();
  ctx.fillStyle = c.dark;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * sawR * 0.38, Math.sin(a) * sawR * 0.38, 7, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = c.accent;
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, TAU);
  ctx.fill();
  ctx.restore();
  // faíscas da serra (no golpe e quando raspa o chão)
  const spk = clamp(k.swipe * sk + k.slam * sk + st.rage * 0.2) * (1 - die);
  if (spk > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = hexA(s.pal.glow, spk);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = Math.PI * 0.6 + (i / 10) * 1.2 + Math.sin(st.t * 30 + i) * 0.2;
      const r1 = sawR + 20 + ((st.t * 200 + i * 37) % 50);
      ctx.moveTo(W.x + Math.cos(a) * sawR, W.y + Math.sin(a) * sawR);
      ctx.lineTo(W.x + Math.cos(a) * r1, W.y + Math.sin(a) * r1);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ---- poeira levantada pelas esteiras (atrás quando avança, na frente quando recua)
  const dustK = g.mv * (1 - die) + k.charge * (wu + sk) * 0.8;
  if (dustK > 0.05) {
    const back = g.dir > 0 || k.charge > 0;
    const bx = back ? TR.x1 + 20 : TR.x0 - 20;
    for (let i = 0; i < 5; i++) {
      const u = frac(st.t * 1.6 + i / 5);
      ctx.fillStyle = `rgba(120,96,70,${(dustK * (1 - u) * 0.4).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(bx + (back ? 1 : -1) * u * 70, -6 - u * 30 - h01(i, 2) * 10, 6 + u * 18, 0, TAU);
      ctx.fill();
    }
  }
  // impacto da investida: poeira e faíscas na frente
  if (k.charge > 0 && p > 0.52 && p < 0.92) {
    const u = sm(0.52, 0.9, p);
    steam(ctx, TR.x0 - 30, -10, u, 1, -80, -20, 1.4, '130,104,80');
    spark(ctx, TR.x0 - 20, -10, u, 1, 10, 33, s.pal.glow, 90, -Math.PI * 0.75, 1.6);
  }
  // bombardeio: clarão em cada chaminé
  stackTops.forEach((t0, i) => {
    const f = shot(i) * c.lit;
    if (f > 0.05) {
      orb(ctx, t0.x, t0.y - 6, 34 * f, s.pal.glow, f);
      bloom(ctx, t0.x, t0.y, 70 * f, s.pal.glow, f * 0.6);
    }
  });
  const coreP = rot({ x: H.x + 10, y: H.y - 50 }, H, tilt);
  if (st.hurt > 0.05) spark(ctx, coreP.x, coreP.y - 30, 1 - st.hurt, 1, 8, 55, '#ffd27a', 70, -Math.PI * 0.4, 2.4);
  if (die > 0) {
    spark(ctx, coreP.x, coreP.y - 40, sm(0.05, 0.3, die), 1, 10, 57, '#ffd27a', 100);
    // explosão da fornalha
    const ex = sm(0.42, 0.47, die) * (1 - sm(0.5, 0.75, die));
    if (ex > 0.02) {
      orb(ctx, furnaceAt(H, tilt).x, furnaceAt(H, tilt).y, 90 * ex, s.pal.glow, ex);
      bloom(ctx, furnaceAt(H, tilt).x, furnaceAt(H, tilt).y, 200 * ex, s.pal.accent, ex * 0.7);
    }
    spark(ctx, coreP.x, coreP.y, sm(0.44, 0.72, die), 1, 16, 59, s.pal.glow, 150, -Math.PI / 2, 3);
    for (let i = 0; i < 3; i++) steam(ctx, coreP.x - 20 + i * 24, coreP.y - 60, frac(st.t * 0.45 + i / 3), sm(0.4, 0.7, die) * 1.6, 30, -120, 1.5, '40,32,28');
  }
  ctx.restore();

  // âncoras no mundo (aplica o deslocamento e o empinar)
  const w = (v: V): V => {
    const r = rot(v, { x: TR.x1 + TR.r, y: 0 }, wheelie);
    return { x: r.x + X0, y: r.y };
  };
  return {
    mouth: w(st.pose === 'shoot' && k.shoot > 0 ? stackTops[0] : { x: noz.x - 14, y: noz.y }),
    hand: w({ x: W.x - sawR * 0.6, y: W.y + sawR * 0.4 }),
    core: w(coreP),
    top: Math.min(stackTops[0].y - 10, W.y - sawR, H.y - 170),
    halfW: 170,
  };
}

/** Porta da fornalha no mundo. */
function furnaceAt(H: V, tilt: number): V {
  return rot({ x: H.x + 30, y: H.y - 10 }, H, tilt);
}

