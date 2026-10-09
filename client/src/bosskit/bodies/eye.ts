/**
 * ABISSAIS / OLHOS (feat.kind): 0 = Ophidrax, olho gigante com 8 tentáculos;
 * 1 = Grul'ganoth, bocarra do vazio com 5 olhos em volta e 10 tentáculos;
 * 2 = Íris Carmesim, olho rubro com veias, 6 tentáculos e lágrimas de sangue;
 * 3 = Xal'thuun, cabeça-bolha verde com 3 olhos, tentáculos na boca e 12 embaixo.
 * Todos FLUTUAM. Origem no chão, olhando para a esquerda; ~340 de altura em escala 1.
 *
 * Animação:
 *  - o corpo tem uma "pose" (deslocamento, giro, escala) calculada por função do
 *    progresso; a velocidade dessa pose (derivada) + st.vx/st.vy arrastam os
 *    tentáculos, que respondem com atraso da raiz para a ponta (overlapping action);
 *  - deslocamento = nado de lula: a cada ciclo de `gait` os tentáculos se juntam
 *    (puxada rápida) e se abrem devagar; o corpo dá um tranco para a frente e inclina;
 *  - a pupila procura os jogadores com sacadas (pulos rápidos de olhar), dilata e contrai;
 *  - pálpebras de verdade: piscam, apertam na mira, arregalam no golpe.
 */
import type { BossSpec } from '@gymbattle/shared';
import type { Anchors, DrawState, V } from '../types';
import { h01, hurtTint, mixHex, rgrad, vgrad, TAU, clamp, sm, tube, orb, hexA, lin, easeIn } from '../util';

interface Pal { body: string; dark: string; accent: string; glow: string; eye: string; flesh: string; lite: string }

const L = (a: number, b: number, k: number) => a + (b - a) * k;
const fr = (x: number) => x - Math.floor(x);
/** Oscilação amortecida que começa em x = 0 (impacto, quique). */
const dmp = (x: number, w: number, k: number) => (x <= 0 ? 0 : Math.exp(-x * k) * Math.sin(x * w));

/** Pose do corpo num instante (local, antes da escala do motor). */
interface Pose { x: number; y: number; rot: number; sx: number; sy: number }

/** Envelopes de um ataque em função do progresso q. */
interface Env { wu: number; sk: number; hold: number; atk: number; imp: number; pulse: number }
const NOENV: Env = { wu: 0, sk: 0, hold: 0, atk: 0, imp: 0, pulse: 0 };
function envAt(q: number): Env {
  const wu = sm(0, 0.35, q) * (1 - sm(0.42, 0.55, q));
  const sk = sm(0.38, 0.52, q) * (1 - sm(0.72, 1, q));
  return {
    wu, sk, hold: clamp(wu + sk),
    atk: sm(0, 0.15, q) * (1 - sm(0.85, 1, q)),
    imp: dmp(q - 0.55, 38, 10),
    pulse: sm(0.47, 0.53, q) * (1 - sm(0.55, 0.72, q)),
  };
}

/** Estado de um olho. */
interface EyeSt { lx: number; ly: number; dil: number; oU: number; oL: number; glow: number; dead: number }

interface Tent { root: V; a0: number; curl: number; len: number; w: number; idx: number; front: boolean; wave: number }

// constantes por tipo
const RAD = [112, 112, 100, 100];
const BASEY = [-228, -225, -235, -205];
const TLEN = [210, 200, 220, 175];
const TW = [30, 30, 18, 22];
const SPREAD = [1.1, 1.3, 0.9, 1.1];

/** Olhar com sacadas: o olho pula de um jogador para outro (determinístico). */
function gaze(t: number, seed: number): V {
  const P = 1.1 + h01(seed, 5) * 0.6;
  const tt = t + seed * 0.37;
  const i = Math.floor(tt / P);
  const f = (tt / P - i) * P;
  const tg = (j: number) => ({ x: -0.6 + (h01(j, seed + 11) - 0.5) * 0.6, y: 0.3 + (h01(j, seed + 13) - 0.5) * 0.45 });
  const a = tg(i - 1), b = tg(i);
  const k = sm(0, 0.08, f);
  return { x: L(a.x, b.x, k) + Math.sin(t * 13 + seed) * 0.012, y: L(a.y, b.y, k) + Math.cos(t * 11 + seed) * 0.012 };
}

/** Piscada (0 = aberto, 1 = fechado), às vezes dupla. */
function blinkAt(t: number, seed: number): number {
  const per = 3.3 + h01(seed, 1) * 2.2;
  const tt = t + h01(seed, 2) * per;
  const ph = tt % per;
  const n = Math.floor(tt / per);
  let c = ph < 0.2 ? Math.sin((ph / 0.2) * Math.PI) : 0;
  if (n % 3 === 1 && ph > 0.27 && ph < 0.45) c = Math.max(c, Math.sin(((ph - 0.27) / 0.18) * Math.PI));
  return c;
}

export function drawEye(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState): Anchors {
  const kind = clamp(Math.round(s.feat.kind ?? 0), 0, 3);
  const C: Pal = {
    body: hurtTint(ctx, st, s.pal.body),
    dark: hurtTint(ctx, st, s.pal.dark),
    accent: hurtTint(ctx, st, s.pal.accent),
    glow: s.pal.glow,
    eye: s.pal.eye,
    flesh: hurtTint(ctx, st, mixHex(s.pal.body, '#ffffff', 0.18)),
    lite: hurtTint(ctx, st, mixHex(s.pal.body, '#ffffff', 0.42)),
  };
  const seed = Math.floor(h01(s.id.length * 7 + kind, s.id.charCodeAt(0)) * 1000);
  const t = st.t;
  const isAtk = st.anim === 'attack' || st.anim === 'enter';
  const pose = st.anim === 'enter' ? 'roar' : st.pose;
  const isDeath = st.anim === 'death';
  const q = st.p;
  const shoot = isAtk && (pose === 'shoot' || pose === 'breath') ? 1 : 0;
  const swipe = isAtk && pose === 'swipe' ? 1 : 0;
  const cast = isAtk && pose === 'cast' ? 1 : 0;
  const roar = isAtk && pose === 'roar' ? 1 : 0;
  const slam = isAtk && pose === 'slam' ? 1 : 0;
  const charge = isAtk && pose === 'charge' ? 1 : 0;
  const R = RAD[kind];
  const baseY = BASEY[kind];
  const rage = st.rage;
  const hurt = clamp(st.hurt);
  const mv = clamp(st.move);
  const dir = st.vx > 2 ? 1 : st.vx < -2 ? -1 : 0; // +1 = recuando
  const vxn = clamp(st.vx / 150, -1.6, 1.6);
  const vyn = clamp(st.vy / 150, -1.5, 1.5);
  // nado: puxada rápida (0..0,3) e relaxada lenta
  const gf = fr(st.gait);
  const pull = (gf < 0.3 ? sm(0, 0.3, gf) : 1 - sm(0.3, 1, gf)) * mv;
  const gph = st.gait * TAU;
  const die = isDeath ? q : 0;
  const fall = isDeath ? easeIn(lin(0.3, 0.62, q)) : 0;
  const limp = isDeath ? sm(0.55, 0.75, q) : 0;

  // ---------------- pose do corpo (função do progresso, para derivar velocidade)
  const poseAt = (qq: number, tt: number): Pose => {
    const E = isAtk ? envAt(qq) : NOENV;
    const calm = 1 - (isDeath ? sm(0.2, 0.45, qq) : 0);
    let x = 0;
    let y = (Math.sin(tt * 1.4) * 10 + Math.sin(tt * 0.53 + 1) * 4) * calm * (1 - mv * 0.5);
    let rot = Math.sin(tt * 0.9) * 0.035 * calm;
    const br = Math.sin(tt * 2) * 0.016 * calm;
    let sx = 1 + br, sy = 1 + br;
    // deslocamento (nado): inclina na direção do movimento, tranco a cada puxada
    rot += vxn * 0.17 + -dir * pull * 0.05;
    x += -dir * pull * 9;
    y += -pull * 7 + Math.sin(gph * 2) * 2 * mv;
    sx += -pull * 0.06 + (1 - pull) * mv * 0.015;
    sy += pull * 0.05;
    sy += -vyn * 0.035;
    sx += vyn * 0.02;
    // dano: tranco para trás e tremida
    x += hurt * 24;
    rot += hurt * (0.14 + Math.sin(tt * 48) * 0.04);
    sx -= hurt * 0.05;
    sy += hurt * 0.04;
    // raiva: tremor fino
    x += Math.sin(tt * 37) * rage * 1.5;
    if (shoot) {
      // mira (encolhe e recua de leve) → disparo → recuo forte com mola
      const rec = sm(0.47, 0.53, qq) * (1 - sm(0.6, 0.98, qq));
      x += E.wu * 14 + rec * 44 + E.imp * 7;
      y += -E.wu * 10 + rec * -6;
      rot += -E.wu * 0.05 + rec * 0.18 + E.imp * 0.05;
      sx += -E.wu * 0.06 + E.pulse * 0.1;
      sy += E.wu * 0.05 - E.pulse * 0.07;
    }
    if (swipe) {
      x += E.wu * 24 - E.sk * 52;
      y += -E.wu * 14 + E.sk * 12;
      rot += E.wu * 0.16 - E.sk * 0.22 + E.imp * 0.05;
      sx += E.pulse * 0.05;
    }
    if (cast) {
      const up = sm(0, 0.4, qq) * (1 - sm(0.7, 1, qq));
      y += -40 * up + E.pulse * 14 + E.imp * 6;
      rot += -E.wu * 0.06 + Math.sin(tt * 3) * 0.04 * E.hold + E.imp * 0.03;
      sx += -E.wu * 0.05 + E.pulse * 0.13;
      sy += -E.wu * 0.04 + E.pulse * 0.13;
    }
    if (roar) {
      const sh = sm(0.48, 0.52, qq) * (1 - sm(0.8, 0.95, qq));
      x += E.wu * 18 - E.sk * 16 + Math.sin(tt * 55) * 4 * sh;
      y += E.wu * 10 - E.sk * 6;
      rot += E.wu * 0.14 - E.sk * 0.1 + Math.sin(tt * 47) * 0.025 * sh;
      sx += E.wu * 0.07 + E.sk * 0.1 + E.imp * 0.03;
      sy += -E.wu * 0.09 + E.sk * 0.12 - E.imp * 0.03;
    }
    if (slam) {
      const pl = sm(0.42, 0.53, qq) * (1 - sm(0.68, 1, qq));
      const sq = sm(0.5, 0.55, qq) * (1 - sm(0.58, 0.78, qq));
      y += -75 * E.wu + 62 * pl - Math.abs(E.imp) * 14;
      rot += E.wu * 0.12 - pl * 0.08;
      sx += -E.wu * 0.05 + sq * 0.16;
      sy += E.wu * 0.07 - sq * 0.17;
    }
    if (charge) {
      x += E.wu * 40 - E.sk * 250;
      rot += E.wu * 0.1 - E.sk * 0.25;
    }
    if (isDeath) {
      const shk = sm(0, 0.06, qq) * (1 - sm(0.3, 0.42, qq));
      const fl = easeIn(lin(0.3, 0.62, qq));
      x += Math.sin(tt * 47) * 7 * shk;
      y += -26 * sm(0, 0.18, qq) * (1 - sm(0.2, 0.34, qq));
      y += fl * (-baseY - R * 0.8) - Math.abs(dmp(qq - 0.62, 24, 7)) * 30;
      rot += Math.sin(tt * 39) * 0.07 * shk + fl * 0.42 + dmp(qq - 0.62, 20, 8) * 0.12;
      const ls = sm(0.6, 0.63, qq) * (1 - sm(0.66, 0.86, qq));
      sx += ls * 0.15 + sm(0.62, 1, qq) * 0.05;
      sy += -ls * 0.17 - sm(0.62, 1, qq) * 0.06;
    }
    return { x, y, rot, sx, sy };
  };
  const P = poseAt(q, t);
  // velocidade da pose (unidades/s) → arrasto dos tentáculos (com atraso na ponta)
  const DT = 0.05;
  const dq = isAtk ? DT / 2.4 : isDeath ? DT / 2.2 : 0;
  const velAt = (qq: number, tt: number) => {
    const a = poseAt(qq, tt), b = poseAt(qq - dq, tt - DT);
    return { x: (a.x - b.x) / DT, y: (a.y - b.y) / DT };
  };
  const v0 = velAt(q, t), v1 = velAt(q - dq * 2.4, t - DT * 2.4);
  const drag0 = { x: clamp((st.vx + v0.x) / 160, -2.5, 2.5), y: clamp((st.vy + v0.y) / 160, -2, 2) };
  const drag1 = { x: clamp((st.vx + v1.x) / 160, -2.5, 2.5), y: clamp((st.vy + v1.y) / 160, -2, 2) };

  const cx = P.x;
  const cy = baseY + P.y;
  const cr = Math.cos(P.rot), sr = Math.sin(P.rot);
  /** Local do corpo → mundo local do boss. */
  const toW = (lx: number, ly: number): V => ({ x: cx + lx * P.sx * cr - ly * P.sy * sr, y: cy + lx * P.sx * sr + ly * P.sy * cr });

  // ---------------- olhos (estado)
  const E = isAtk ? envAt(q) : NOENV;
  const g = gaze(t, seed);
  let lx = g.x, ly = g.y;
  let dil = 0.45 + Math.sin(t * 0.6 + seed) * 0.08 - rage * 0.15;
  let blink = blinkAt(t, seed);
  let oU = 0.92, oL = 0.95;
  let glow = clamp(0.25 + rage * 0.35);
  // olha um pouco para onde vai (avançando)
  if (dir < 0) lx = L(lx, -0.85, mv * 0.4);
  if (shoot) {
    const k = clamp(E.atk * 1.5);
    lx = L(lx, -0.82, k);
    ly = L(ly, 0.3, k);
    const fire = sm(0.45, 0.52, q) * (1 - sm(0.72, 0.95, q));
    dil = L(L(dil, 0.03, E.wu), 0.78, fire);
    oU = L(L(oU, 0.38, E.wu), 1.12, fire);
    oL = L(L(oL, 0.6, E.wu), 1.05, fire);
    glow = Math.max(glow, E.wu * 0.9, fire);
    blink *= 1 - E.atk;
  }
  if (cast) {
    const k = clamp(E.atk * 1.5);
    lx = L(L(lx, 0.05, E.wu * k), -0.72, E.sk);
    ly = L(L(ly, -0.75, E.wu * k), 0.4, E.sk);
    dil = L(dil, 0.85, E.hold);
    oU = L(oU, 1.1, E.hold);
    glow = Math.max(glow, E.hold);
    blink *= 1 - E.atk;
  }
  if (roar) {
    lx = L(lx, -0.55, E.hold);
    ly = L(ly, 0.12, E.hold);
    dil = L(dil, 0.02, E.hold);
    oU = L(L(oU, 0.5, E.wu), 1.15, E.sk);
    oL = L(oL, 1.08, E.sk);
    glow = Math.max(glow, E.sk);
    blink *= 1 - E.atk;
  }
  if (swipe) {
    lx = L(lx, -0.78, E.atk);
    ly = L(ly, 0.48, E.atk);
    dil = L(dil, 0.2, E.hold);
    oU = L(oU, 0.62, E.wu);
    oL = L(oL, 0.7, E.hold);
    glow = Math.max(glow, E.sk * 0.7);
    blink *= 1 - E.atk;
  }
  if (slam) {
    lx = L(lx, -0.35, E.atk);
    ly = L(ly, 0.85, E.atk);
    oU = L(L(oU, 1.08, E.wu), 0.6, E.sk);
    dil = L(dil, 0.15, E.hold);
    glow = Math.max(glow, E.sk);
    blink *= 1 - E.atk;
  }
  if (charge) {
    lx = L(lx, -0.85, E.atk);
    oU = L(oU, 0.7, E.hold);
    glow = Math.max(glow, E.hold);
  }
  if (hurt > 0.02) {
    lx = L(lx, 0.35, hurt * 0.7);
    ly = L(ly, -0.35, hurt * 0.7);
    dil = L(dil, 0.08, hurt);
    oU *= 1 - hurt * 0.75;
    oL *= 1 - hurt * 0.45;
  }
  let dead = 0;
  if (isDeath) {
    const roll = sm(0.05, 0.3, q) * (1 - sm(0.55, 0.75, q));
    lx = L(L(lx, 0.25 + Math.sin(t * 23) * 0.15, roll), -0.1, limp);
    ly = L(L(ly, -0.85, roll), 0.18, limp);
    dil = L(L(dil, 0.02, roll), 1, sm(0.5, 0.8, q));
    oU = L(L(oU, 1.15, roll), 0.42, limp);
    oL = L(oL, 0.75, limp);
    glow = glow * (1 - sm(0.3, 0.7, q));
    blink = 0;
    dead = sm(0.55, 0.9, q);
  }
  oU = clamp(oU * (1 - blink), 0, 1.15);
  oL = clamp(oL * (1 - blink * 0.85), 0, 1.1);
  const eyeSt: EyeSt = { lx, ly, dil: clamp(dil), oU, oL, glow, dead };

  // ---------------- tentáculos
  const n = Math.max(4, Math.round(s.feat.tentacles ?? [8, 10, 6, 12][kind]));
  const wave0 = (1 - limp * 0.95) * (1 + rage * 0.35) * (1 + (isDeath ? (1 - sm(0.3, 0.5, q)) * 2.2 : 0));
  const makeTent = (i: number, qq: number): Tent => {
    const Ex = isAtk ? envAt(qq) : NOENV;
    const Px = qq === q ? P : poseAt(qq, t - (q - qq) * 2.4);
    const u = n > 1 ? i / (n - 1) : 0.5;
    const side = 0.5 - u; // + = esquerda
    let lxr: number, lyr: number;
    if (kind === 3) {
      lxr = (u - 0.5) * 2 * R * 0.78;
      lyr = R * 0.5 - Math.abs(side) * R * 0.2;
    } else {
      const ra = Math.PI / 2 + side * 2.1;
      lxr = Math.cos(ra) * R * 0.84;
      lyr = Math.sin(ra) * R * 0.78;
    }
    const c = Math.cos(Px.rot), sn = Math.sin(Px.rot);
    const root = { x: Px.x + lxr * Px.sx * c - lyr * Px.sy * sn, y: baseY + Px.y + lxr * Px.sx * sn + lyr * Px.sy * c };
    let a0 = side * SPREAD[kind] * 2 + Math.sin(t * 1.1 + i * 1.3) * 0.08;
    let curl = (i % 2 ? 0.7 : -0.6) * (0.6 + h01(i, 3) * 0.6) + side * 0.6;
    let len = TLEN[kind] * (0.8 + h01(i, 1) * 0.3);
    let w = TW[kind] * (0.8 + h01(i, 2) * 0.4);
    let wave = wave0;
    // nado: junta na puxada, abre na volta
    a0 = L(a0, side * 0.5, pull * 0.6) * (1 + (1 - pull) * mv * 0.2);
    curl *= 1 - pull * 0.55;
    // subida estica os tentáculos; descida abre
    curl *= 1 + clamp(vyn, -0.8, 0.8) * 0.35;
    // dano: encolhe
    curl = L(curl, side * 2.4 + (i % 2 ? 0.4 : -0.4), hurt * 0.55);
    a0 += hurt * side * 0.3;
    if (slam) {
      a0 = L(a0, side * 4.4, Ex.wu * 0.9);
      curl = L(curl, side * 3, Ex.wu);
      a0 = L(a0, side * 1.1, Ex.sk);
      curl = L(curl, -side * 0.5, Ex.sk);
      len *= (1 - Ex.wu * 0.3) * (1 + Ex.sk * 0.12);
      wave *= 1 - Ex.sk * 0.7;
    }
    if (cast) {
      const ck = clamp(Ex.atk * 1.4);
      a0 = L(a0, side * 3.6 + Math.sign(side || 1) * 0.5, ck * 0.85);
      curl = L(curl, Math.sin(t * 4 + i) * 0.8, ck);
      a0 += Ex.pulse * side * 0.6;
      wave *= 1 + ck;
    }
    if (roar) {
      curl = L(curl, side * 3.2, Ex.wu * 0.7);
      a0 = L(a0, side * 4.4, Ex.sk * 0.85);
      curl = L(curl, -side * 0.4 + Math.sin(t * 40 + i) * 0.15, Ex.sk * 0.8);
      len *= 1 + Ex.sk * 0.15;
    }
    if (charge) {
      a0 = L(a0, -0.9 + side * 0.6, Ex.hold);
      curl = L(curl, -0.4, Ex.hold);
    }
    if (shoot) {
      a0 -= 0.3 * Ex.wu;
      curl = L(curl, curl * 1.4, Ex.wu);
    }
    if (isDeath) {
      a0 = L(a0, side * 3.1, limp);
      curl = L(curl, side * 0.5, limp);
    }
    // golpe de tentáculo (swipe): o da frente enrola atrás do corpo e chicoteia
    if (swipe && i === 0) {
      const fol = sm(0.55, 0.68, qq) * (1 - sm(0.72, 1, qq));
      a0 = L(L(a0, -2.5, Ex.wu), 1.85, Ex.sk) + fol * 0.35;
      curl = L(L(curl, 1.5, Ex.wu), -0.55, Ex.sk) - fol * 0.6;
      len *= 1 + Ex.sk * 0.5 + Ex.wu * 0.1;
      w *= 1.3;
      wave *= 1 - Ex.hold * 0.8;
    }
    return { root, a0: a0 + Px.rot * 0.8, curl, len, w, idx: i, front: swipe && i === 0 ? Ex.sk > Ex.wu : i % 2 === 0, wave };
  };
  const tents: Tent[] = [];
  for (let i = 0; i < n; i++) tents.push(makeTent(i, q));

  const tp: TentGlobal = { t, mv, gph, drag0, drag1, floor: -3 };
  const tentFill = (i: number) => {
    if (kind === 1) return i % 2 ? C.dark : C.body;
    if (kind === 2) return i % 2 ? C.body : mixHex(C.body, C.dark, 0.4);
    return i % 2 ? mixHex(C.body, C.dark, 0.35) : C.body;
  };

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // sombra no chão (diminui com a altura)
  const hgt = clamp((-cy - R) / 200);
  ctx.fillStyle = `rgba(0,0,0,${0.32 - hgt * 0.15})`;
  ctx.beginPath();
  ctx.ellipse(cx, 0, Math.max(10, 120 - hgt * 40), 12, 0, 0, TAU);
  ctx.fill();

  const tipOf: V[] = [];
  for (const tn of tents) if (!tn.front) tipOf[tn.idx] = drawTentacle(ctx, tentPts(tn, tp), tn.w, tentFill(tn.idx), C, kind, glow, 1);

  // ---------------- corpo
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(P.rot);
  ctx.scale(P.sx, P.sy);
  let mouthL: V;
  const jaw = clamp(0.06 + Math.sin(t * 1.7) * 0.05 + roar * (E.wu * -0.05 + E.sk * 1.05) + shoot * E.hold * 0.4 + cast * E.hold * 0.4 + slam * E.sk * 0.4 + hurt * 0.4 + die * 0.4 - pull * 0.04);
  if (kind === 0) mouthL = bodyOphidrax(ctx, R, C, st, eyeSt, E, roar, s);
  else if (kind === 1) mouthL = bodyMaw(ctx, R, C, st, eyeSt, jaw, roar * E.hold, seed, s);
  else if (kind === 2) mouthL = bodyCrimson(ctx, R, C, st, eyeSt, E, roar, die, s);
  else mouthL = bodyDreamer(ctx, R, C, st, eyeSt, jaw, seed, s);
  ctx.restore();

  // rastro do chicote (swipe): fantasmas do tentáculo em instantes anteriores
  if (swipe && q > 0.43 && q < 0.66) {
    const a = sm(0.43, 0.48, q) * (1 - sm(0.56, 0.66, q));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let j = 2; j >= 1; j--) {
      const gt = makeTent(0, q - j * 0.022);
      const pts = tentPts(gt, tp);
      tube(ctx, pts, (k) => gt.w * (0.3 + k * 0.7) * (1 - k * 0.5), hexA(s.pal.glow, a * (0.32 - j * 0.07)));
    }
    ctx.restore();
  }

  for (const tn of tents) if (tn.front) tipOf[tn.idx] = drawTentacle(ctx, tentPts(tn, tp), tn.w, tentFill(tn.idx), C, kind, glow, 1);

  // tentáculos da boca do Xal'thuun (na frente de tudo)
  if (kind === 3) {
    for (let i = 0; i < 6; i++) {
      const root = toW(-R * 0.55 + i * 13 - jaw * (i - 2.5) * 6, R * 0.2);
      const tn: Tent = {
        root,
        a0: 0.25 + (2.5 - i) * 0.12 + jaw * (2.5 - i) * 0.35 + P.rot - charge * E.hold * 0.8 + hurt * 0.4,
        curl: (i % 2 ? 1 : -1) * 0.9 * (1 - jaw * 0.5) + hurt * 0.8,
        len: 75 + h01(i, 8) * 30 - jaw * 15,
        w: 17, idx: 100 + i, front: true, wave: wave0 * 1.6,
      };
      drawTentacle(ctx, tentPts(tn, tp), tn.w, i % 2 ? C.flesh : C.body, C, kind, glow, 1);
    }
  }

  // magia (cast): aura e pontos de luz orbitando
  if (cast && E.atk > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    orb(ctx, cx, cy, R * (1.2 + E.hold * 0.5 + E.pulse * 0.4) + Math.sin(t * 10) * 5, s.pal.glow, 0.32 * E.hold + E.pulse * 0.3);
    for (let i = 0; i < 5; i++) {
      const a = t * 2.4 + (i / 5) * TAU;
      const rr = R * (1.35 - E.wu * 0.25 + E.pulse * 0.6);
      orb(ctx, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.55, 14 + E.hold * 8, s.pal.glow, E.hold * 0.9);
    }
    ctx.restore();
  }
  ctx.restore();

  const mouth = toW(mouthL.x, mouthL.y);
  const hand = tipOf[0] ?? toW(-R, R);
  return {
    mouth,
    hand,
    core: { x: cx, y: cy },
    top: cy - R * P.sy - (kind === 3 ? R * 0.4 : kind === 0 ? 30 : kind === 2 ? 40 : 10),
    halfW: R + 20,
  };
}

// ======================================================================= tentáculo

interface TentGlobal { t: number; mv: number; gph: number; drag0: V; drag1: V; floor: number }

/** Cadeia de segmentos: ondulação da raiz à ponta + arrasto com atraso. */
function tentPts(tn: Tent, g: TentGlobal): V[] {
  const m = 12;
  const segL = tn.len / m;
  const pts: V[] = [tn.root];
  let a = tn.a0;
  let p = tn.root;
  const ws = 2.1 + h01(tn.idx, 4) * 0.8;
  for (let i = 1; i <= m; i++) {
    const k = i / m;
    const dx = L(g.drag0.x, g.drag1.x, k), dy = L(g.drag0.y, g.drag1.y, k);
    a += tn.curl / m;
    a += Math.sin(g.t * ws + tn.idx * 1.7 - k * 4.5) * 0.11 * tn.wave * (0.4 + k);
    a += Math.sin(g.gph - k * 5 + tn.idx * 0.5) * 0.15 * g.mv * k;
    // arrasto horizontal: anda para a esquerda → pontas ficam para trás
    a += dx * 0.1 * (0.25 + k);
    // arrasto vertical: subindo → pendem; descendo → abrem
    if (dy < 0) a = L(a, 0, clamp(-dy * 0.07 * k));
    else a += Math.sign(a || 1) * dy * 0.05 * k;
    p = { x: p.x - Math.sin(a) * segL, y: Math.min(g.floor, p.y + Math.cos(a) * segL) };
    pts.push(p);
  }
  return pts;
}

function drawTentacle(ctx: CanvasRenderingContext2D, pts: V[], w: number, fill: string, C: Pal, kind: number, glowK: number, alpha: number): V {
  const m = pts.length - 1;
  void alpha;
  // contorno escuro + corpo + luz em cima
  tube(ctx, pts, (t) => (w + 5) * (1 - t * 0.88), C.dark);
  tube(ctx, pts, (t) => w * (1 - t * 0.9), fill);
  const hl: V[] = pts.map((q, i) => ({ x: q.x - w * 0.14 * (1 - i / m), y: q.y - w * 0.18 * (1 - i / m) }));
  tube(ctx, hl, (t) => w * 0.32 * (1 - t * 0.95), hexA(mixHex(fill, '#ffffff', 0.45), 0.4));
  if (kind !== 1) {
    // ventosas na face de baixo
    ctx.fillStyle = kind === 2 ? hexA(C.accent, 0.8) : hexA(mixHex(C.accent, '#ffffff', 0.3), 0.75);
    ctx.beginPath();
    for (let i = 2; i < m - 1; i += 2) {
      const a = pts[i - 1], b = pts[i + 1], q = pts[i];
      let nx = -(b.y - a.y), ny = b.x - a.x;
      const l = Math.hypot(nx, ny) || 1;
      nx /= l;
      ny /= l;
      if (ny < 0) (nx = -nx), (ny = -ny);
      const ww = w * (1 - i / m);
      const r = Math.max(0.8, ww * 0.15);
      const x = q.x + nx * ww * 0.26, y = q.y + ny * ww * 0.26;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, TAU);
    }
    ctx.fill();
  } else {
    // pontas do vazio brilhando
    const tp = pts[m];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    orb(ctx, tp.x, tp.y, 10 + glowK * 7, C.accent, 0.6 * glowK + 0.25);
    ctx.restore();
  }
  if (kind === 2) {
    // espinhos na ponta
    const tp = pts[m], pr = pts[m - 1];
    const ang = Math.atan2(tp.y - pr.y, tp.x - pr.x);
    ctx.fillStyle = C.accent;
    ctx.beginPath();
    ctx.moveTo(tp.x + Math.cos(ang) * 14, tp.y + Math.sin(ang) * 14);
    ctx.lineTo(tp.x + Math.cos(ang + 1.6) * 5, tp.y + Math.sin(ang + 1.6) * 5);
    ctx.lineTo(tp.x + Math.cos(ang - 1.6) * 5, tp.y + Math.sin(ang - 1.6) * 5);
    ctx.fill();
  }
  return pts[m];
}

// ======================================================================= globo ocular

interface EyeLook {
  sclera: string; iris: string; ring: string; pupil: 'slit' | 'round'; glowCol: string;
  lid: string; lidDark: string; lashes?: boolean; deco?: (r: number) => void;
}

/**
 * Globo ocular com volume: esclera sombreada, íris que encurta quando olha para o
 * lado, pupila que dilata, reflexo fixo (molhado) e pálpebras com dobra.
 * Devolve a posição da pupila (local).
 */
function eyeball(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, E: EyeSt, o: EyeLook): V {
  ctx.save();
  ctx.translate(x, y);
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.clip();
  // esclera
  const sg = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.05, 0, 0, r * 1.05);
  sg.addColorStop(0, mixHex(o.sclera, '#ffffff', 0.5));
  sg.addColorStop(0.55, o.sclera);
  sg.addColorStop(1, mixHex(o.sclera, '#000000', 0.55));
  ctx.fillStyle = sg;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  if (o.deco) o.deco(r);
  // íris (encurta na direção do olhar = esfera)
  const ix = E.lx * r * 0.45, iy = E.ly * r * 0.45;
  const d = Math.min(0.75, Math.hypot(E.lx, E.ly) * 0.45);
  const sq = Math.sqrt(1 - d * d);
  const ang = Math.atan2(iy, ix);
  const ir = r * 0.55;
  const iris = mixHex(o.iris, '#5a5a5a', E.dead * 0.6);
  ctx.save();
  ctx.translate(ix, iy);
  ctx.rotate(ang);
  ctx.scale(sq, 1);
  const ig = ctx.createRadialGradient(0, 0, ir * 0.15, 0, 0, ir);
  ig.addColorStop(0, mixHex(iris, '#ffffff', 0.4));
  ig.addColorStop(0.5, iris);
  ig.addColorStop(0.86, mixHex(iris, o.ring, 0.65));
  ig.addColorStop(1, mixHex(o.ring, '#000000', 0.4));
  ctx.fillStyle = ig;
  ctx.beginPath();
  ctx.arc(0, 0, ir, 0, TAU);
  ctx.fill();
  // fibras da íris
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = Math.max(1, r * 0.025);
  ctx.beginPath();
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU;
    const r0 = ir * (0.3 + E.dil * 0.25), r1 = ir * (i % 2 ? 0.9 : 0.72);
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a + 0.08) * r1, Math.sin(a + 0.08) * r1);
  }
  ctx.stroke();
  ctx.strokeStyle = hexA(mixHex(iris, '#ffffff', 0.55), 0.45);
  ctx.lineWidth = Math.max(1, r * 0.03);
  ctx.beginPath();
  ctx.arc(0, 0, ir * (0.42 + E.dil * 0.2), 0, TAU);
  ctx.stroke();
  ctx.restore();
  // pupila
  ctx.fillStyle = '#05010a';
  ctx.beginPath();
  if (o.pupil === 'slit') ctx.ellipse(ix, iy, Math.max(0.6, ir * (0.07 + E.dil * 0.5) * (0.8 + sq * 0.2)), ir * (0.72 + E.dil * 0.16), 0, 0, TAU);
  else ctx.arc(ix, iy, ir * (0.14 + E.dil * 0.56), 0, TAU);
  ctx.fill();
  // brilho dentro da pupila (carregando)
  if (E.glow > 0.3) {
    ctx.globalCompositeOperation = 'lighter';
    orb(ctx, ix, iy, ir * (0.55 + E.glow * 0.35), o.glowCol, (E.glow - 0.3) * 0.75);
    ctx.globalCompositeOperation = 'source-over';
  }
  // pálpebras: bordas
  const yu = L(r * 0.12, -r * 1.08, Math.min(1, E.oU)) - Math.max(0, E.oU - 1) * r * 0.6 + E.ly * r * 0.2 * Math.min(1, E.oU);
  const yl = L(r * 0.12, r * 1.08, Math.min(1, E.oL)) + Math.max(0, E.oL - 1) * r * 0.6 + E.ly * r * 0.1 * Math.min(1, E.oL);
  const ye = r * 0.06;
  const cU = 2 * yu - ye, cL = 2 * yl - ye;
  // sombra da pálpebra de cima sobre o olho
  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.beginPath();
  ctx.moveTo(-r * 1.1, ye);
  ctx.quadraticCurveTo(0, cU + r * 0.35, r * 1.1, ye);
  ctx.lineTo(r * 1.1, -r * 1.2);
  ctx.lineTo(-r * 1.1, -r * 1.2);
  ctx.fill();
  // reflexo fixo (olho molhado)
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.36, -r * 0.4, r * 0.32, r * 0.2, -0.6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = `rgba(255,255,255,${0.9 - E.dead * 0.5})`;
  ctx.beginPath();
  ctx.ellipse(-r * 0.42, -r * 0.46, r * 0.09, r * 0.065, -0.6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.arc(r * 0.3, r * 0.36, r * 0.04, 0, TAU);
  ctx.fill();
  // pálpebra de cima
  ctx.fillStyle = vgrad(ctx, -r, yu, o.lid, mixHex(o.lid, o.lidDark, 0.55));
  ctx.beginPath();
  ctx.moveTo(-r * 1.1, -r * 1.2);
  ctx.lineTo(r * 1.1, -r * 1.2);
  ctx.lineTo(r * 1.1, ye);
  ctx.quadraticCurveTo(0, cU, -r * 1.1, ye);
  ctx.closePath();
  ctx.fill();
  // pálpebra de baixo
  ctx.fillStyle = vgrad(ctx, r, yl, o.lid, mixHex(o.lid, o.lidDark, 0.45));
  ctx.beginPath();
  ctx.moveTo(-r * 1.1, r * 1.2);
  ctx.lineTo(r * 1.1, r * 1.2);
  ctx.lineTo(r * 1.1, ye);
  ctx.quadraticCurveTo(0, cL, -r * 1.1, ye);
  ctx.closePath();
  ctx.fill();
  // dobra acima da pálpebra
  ctx.strokeStyle = hexA(o.lidDark, 0.45);
  ctx.lineWidth = Math.max(1, r * 0.04);
  ctx.beginPath();
  ctx.moveTo(-r * 1.1, ye - r * 0.12);
  ctx.quadraticCurveTo(0, cU - r * 0.3, r * 1.1, ye - r * 0.12);
  ctx.stroke();
  // borda das pálpebras + brilho úmido
  ctx.strokeStyle = o.lidDark;
  ctx.lineWidth = Math.max(1.2, r * 0.07);
  ctx.beginPath();
  ctx.moveTo(-r * 1.1, ye);
  ctx.quadraticCurveTo(0, cU, r * 1.1, ye);
  ctx.moveTo(-r * 1.1, ye);
  ctx.quadraticCurveTo(0, cL, r * 1.1, ye);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = Math.max(0.8, r * 0.025);
  ctx.beginPath();
  ctx.moveTo(-r * 0.8, ye + (cL - ye) * 0.4 - r * 0.04);
  ctx.quadraticCurveTo(0, cL - r * 0.05, r * 0.8, ye + (cL - ye) * 0.4 - r * 0.04);
  ctx.stroke();
  ctx.restore();
  // cílios (fora do recorte)
  if (o.lashes) {
    ctx.strokeStyle = o.lidDark;
    ctx.lineWidth = Math.max(1, r * 0.04);
    ctx.beginPath();
    for (let i = 1; i < 8; i++) {
      const k = i / 8;
      const xx = -r * 1.1 + k * r * 2.2;
      // ponto na curva quadrática da borda de cima
      const yy = (1 - k) * (1 - k) * ye + 2 * k * (1 - k) * cU + k * k * ye;
      if (xx * xx + yy * yy > r * r * 1.05) continue;
      const nx = (k - 0.5) * 0.9, ny = -1;
      ctx.moveTo(xx, yy);
      ctx.lineTo(xx + nx * r * 0.14, yy + ny * r * 0.14 * (0.4 + Math.min(1, E.oU) * 0.6));
    }
    ctx.stroke();
  }
  ctx.restore();
  return { x: x + ix, y: y + iy };
}

// ======================================================================= corpos

/** Ophidrax: um olho enorme com casca de carne roxa e espinhos. */
function bodyOphidrax(ctx: CanvasRenderingContext2D, R: number, C: Pal, st: DrawState, E: EyeSt, A: Env, roar: number, s: BossSpec): V {
  const flare = clamp(A.hold * 0.6 + roar * A.sk * 0.6 + st.hurt * 0.5);
  // espinhos/barbatanas em volta (ondulam em sequência, abrem no ataque)
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * 0.95 + (i / 8) * Math.PI * 0.95 + 0.05;
    const wv = Math.sin(st.t * 2.4 - i * 0.7);
    const len = (34 + (i % 2) * 22 + wv * 5) * (1 + flare * 0.45);
    const bend = -0.15 + wv * 0.08 - flare * 0.1;
    const bx = Math.cos(a) * R * 0.92, by = Math.sin(a) * R * 0.92;
    ctx.fillStyle = i % 2 ? C.dark : mixHex(C.dark, C.body, 0.35);
    ctx.beginPath();
    ctx.moveTo(bx + Math.cos(a + 1.57) * 12, by + Math.sin(a + 1.57) * 12);
    ctx.quadraticCurveTo(bx + Math.cos(a) * len * 0.7, by + Math.sin(a) * len * 0.7 - 6, bx + Math.cos(a + bend) * len, by + Math.sin(a + bend) * len);
    ctx.lineTo(bx + Math.cos(a - 1.57) * 12, by + Math.sin(a - 1.57) * 12);
    ctx.fill();
  }
  // casca de carne
  ctx.fillStyle = rgrad(ctx, -R * 0.3, -R * 0.45, R * 1.35, C.lite, C.dark);
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.fill();
  // luz de contorno (de baixo, cor da magia)
  ctx.strokeStyle = hexA(s.pal.glow, 0.18 + E.glow * 0.25);
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, R - 3, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  // veias da casca (pulsam)
  const hb = Math.pow(Math.max(0, Math.sin(st.t * 3.2)), 6);
  ctx.strokeStyle = hexA(C.accent, 0.3 + hb * 0.25);
  ctx.lineWidth = 3 + hb;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    ctx.moveTo(Math.cos(a) * R * 0.98, Math.sin(a) * R * 0.98);
    ctx.quadraticCurveTo(Math.cos(a + 0.2) * R * 0.88, Math.sin(a + 0.2) * R * 0.88, Math.cos(a + 0.1) * R * 0.78, Math.sin(a + 0.1) * R * 0.78);
  }
  ctx.stroke();
  // órbita (anel escuro em volta do olho)
  const er = R * 0.74;
  const ex = -R * 0.12 + E.lx * 4, ey = E.ly * 3;
  ctx.fillStyle = hexA(C.dark, 0.85);
  ctx.beginPath();
  ctx.arc(ex, ey, er * 1.08, 0, TAU);
  ctx.fill();
  const pp = eyeball(ctx, ex, ey, er, E, {
    sclera: '#f2e6d6', iris: C.eye, ring: C.accent, pupil: 'slit', glowCol: s.pal.glow, lid: C.body, lidDark: C.dark, lashes: true,
  });
  // brilho em volta
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = hexA(s.pal.glow, 0.2 + E.glow * 0.4);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(ex, ey, er + 5, 0, TAU);
  ctx.stroke();
  ctx.restore();
  return pp;
}

/** Grul'ganoth: boca enorme cheia de dentes em anéis, 5 olhos em volta. */
function bodyMaw(ctx: CanvasRenderingContext2D, R: number, C: Pal, st: DrawState, E: EyeSt, jaw: number, vortex: number, seed: number, s: BossSpec): V {
  const t = st.t;
  // massa disforme (pulsa)
  ctx.fillStyle = rgrad(ctx, -R * 0.25, -R * 0.4, R * 1.35, mixHex(C.body, '#ffffff', 0.16), C.dark);
  ctx.beginPath();
  for (let i = 0; i <= 28; i++) {
    const a = (i / 28) * TAU;
    const r = R * (1 + Math.sin(a * 5 + t * 1.5) * 0.04 + Math.sin(a * 3 - t) * 0.03 + jaw * 0.05);
    const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.95;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  // nódulos/pústulas
  ctx.fillStyle = hexA(mixHex(C.body, '#ffffff', 0.25), 0.5);
  for (let i = 0; i < 7; i++) {
    const a = -0.4 + h01(i, 21) * 1.6 + (i % 2) * 2.4;
    const rr = R * (0.72 + h01(i, 22) * 0.2);
    ctx.beginPath();
    ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 4 + h01(i, 23) * 6, 0, TAU);
    ctx.fill();
  }
  // boca (abre muito no ataque)
  const mx = -R * 0.22, my = R * 0.05;
  const mr = R * (0.55 + jaw * 0.18);
  const mry = mr * (0.5 + jaw * 0.5);
  ctx.fillStyle = mixHex(C.accent, C.dark, 0.6);
  ctx.beginPath();
  ctx.ellipse(mx, my, mr * 1.12, mry * 1.15 + 6, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = hexA(mixHex(C.accent, '#ffffff', 0.3), 0.35);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(mx, my - 2, mr * 1.1, mry * 1.13 + 5, 0, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
  const glowK = Math.max(E.glow, vortex);
  const g = ctx.createRadialGradient(mx, my, 0, mx, my, mr);
  g.addColorStop(0, mixHex(s.pal.glow, '#ffffff', 0.4 * glowK));
  g.addColorStop(0.25, s.pal.glow);
  g.addColorStop(0.6, '#0a0418');
  g.addColorStop(1, '#000000');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(mx, my, mr, mry, 0, 0, TAU);
  ctx.fill();
  // espiral dentro da garganta (gira mais rápido no vórtice)
  const spin = t * (2 + vortex * 6);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = hexA(C.accent, 0.35 + glowK * 0.35);
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 40; i++) {
    const k = i / 40;
    const a = k * TAU * 2 + spin;
    const x = mx + Math.cos(a) * mr * k * 0.7, y = my + Math.sin(a) * mry * k * 0.7;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
  // anéis de dentes (giram em sentidos opostos no vórtice)
  for (let ring = 0; ring < 2; ring++) {
    const rr = ring === 0 ? 1 : 0.68;
    const nT = ring === 0 ? 18 : 13;
    const rot = ring * 0.2 + vortex * t * (ring ? -1.6 : 1.1);
    ctx.fillStyle = ring === 0 ? '#e8e0cc' : '#b8b0a0';
    ctx.strokeStyle = 'rgba(40,20,30,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < nT; i++) {
      const a = (i / nT) * TAU + rot;
      const tl = 0.68 - jaw * 0.05 + Math.sin(i * 2.3) * 0.04;
      const bx = mx + Math.cos(a) * mr * rr, by = my + Math.sin(a) * mry * rr;
      const tx = mx + Math.cos(a) * mr * rr * tl, ty = my + Math.sin(a) * mry * rr * (tl - 0.06);
      const px = -Math.sin(a) * 7, py = Math.cos(a) * 7 * (mry / mr);
      ctx.moveTo(bx + px, by + py);
      ctx.lineTo(tx, ty);
      ctx.lineTo(bx - px, by - py);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
  }
  // olhos em volta da boca: cada um olha e pisca por conta própria
  const ne = Math.max(1, Math.round(s.feat.eyes ?? 5));
  for (let i = 0; i < ne; i++) {
    const a = -Math.PI * 0.95 + (i / Math.max(1, ne - 1)) * Math.PI * 1.25;
    const ex = mx + Math.cos(a) * (mr * 1.12 + 30) + 8, ey = my + Math.sin(a) * (mry * 1.1 + 28);
    const er = 12 + (i === 2 ? 5 : 0);
    const own = gaze(t, seed + i * 17);
    const lx = L(own.x, E.lx, 0.6), ly = L(own.y, E.ly, 0.6);
    const op = clamp(Math.min(E.oU, 1) * (1 - blinkAt(t, seed + i * 31)));
    // órbita
    ctx.fillStyle = C.dark;
    ctx.beginPath();
    ctx.ellipse(ex, ey, er * 1.45, er * 1.15, a, 0, TAU);
    ctx.fill();
    if (op > 0.04) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(ex, ey, er, er * 0.75 * op, 0, 0, TAU);
      ctx.clip();
      ctx.fillStyle = mixHex(C.eye, '#000000', 0.25);
      ctx.fillRect(ex - er, ey - er, er * 2, er * 2);
      ctx.fillStyle = mixHex(C.eye, '#ffffff', 0.25);
      ctx.beginPath();
      ctx.arc(ex + lx * er * 0.35, ey + ly * er * 0.3, er * 0.7, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(ex + lx * er * 0.45, ey + ly * er * 0.35, Math.max(0.6, er * (0.1 + E.dil * 0.3)), er * 0.6, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(ex - er * 0.35, ey - er * 0.3 * op, er * 0.14, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      orb(ctx, ex, ey, er * 2.2, C.eye, (0.25 + glowK * 0.4) * op);
      ctx.restore();
    }
    // pálpebra (linha)
    ctx.strokeStyle = mixHex(C.body, '#ffffff', 0.1);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(ex, ey, er * 1.05, er * 0.8 * Math.max(0.05, op), 0, Math.PI, TAU);
    ctx.stroke();
  }
  return { x: mx - mr * 0.2, y: my };
}

/** Íris Carmesim: olho rubro cheio de veias, coroa de espinhos e lágrimas de sangue. */
function bodyCrimson(ctx: CanvasRenderingContext2D, R: number, C: Pal, st: DrawState, E: EyeSt, A: Env, roar: number, die: number, s: BossSpec): V {
  const t = st.t;
  const hb = Math.pow(Math.max(0, Math.sin(t * TAU * (0.9 + st.rage * 0.6))), 8) * (1 - die);
  const flare = clamp(roar * A.sk + A.pulse + st.hurt * 0.4);
  // coroa de espinhos atrás (gira devagar, cresce no grito)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + t * 0.15;
    const len = R * (0.45 + (i % 2) * 0.25) * (1 + flare * 0.35 + hb * 0.05);
    ctx.fillStyle = i % 2 ? C.dark : mixHex(C.dark, C.body, 0.4);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a - 0.15) * R * 0.9, Math.sin(a - 0.15) * R * 0.9);
    ctx.lineTo(Math.cos(a) * (R + len), Math.sin(a) * (R + len));
    ctx.lineTo(Math.cos(a + 0.15) * R * 0.9, Math.sin(a + 0.15) * R * 0.9);
    ctx.fill();
  }
  // carne em volta
  ctx.fillStyle = rgrad(ctx, -R * 0.25, -R * 0.35, R * 1.3, mixHex(C.body, '#ffffff', 0.15), C.dark);
  ctx.beginPath();
  ctx.arc(0, 0, R * (1.08 + hb * 0.015), 0, TAU);
  ctx.fill();
  const er = R * 0.88;
  const ex = E.lx * 3, ey = E.ly * 3;
  const pp = eyeball(ctx, ex, ey, er, E, {
    sclera: '#f4dcd8', iris: C.accent, ring: mixHex(C.body, C.dark, 0.3), pupil: 'round', glowCol: s.pal.glow,
    lid: C.body, lidDark: C.dark,
    deco: (r) => {
      if ((s.feat.veins ?? 1) <= 0) return;
      // veias saindo da borda (pulsam com o coração)
      ctx.strokeStyle = hexA(C.accent, 0.55 + hb * 0.35 + flare * 0.2);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU + h01(i, 2) * 0.3;
        let x = Math.cos(a) * r, y = Math.sin(a) * r;
        ctx.lineWidth = 2.4 + hb * 1.4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
          const aa = a + Math.PI + (h01(i, k + 3) - 0.5) * 1.2;
          x += Math.cos(aa) * r * (0.12 + flare * 0.03);
          y += Math.sin(aa) * r * (0.12 + flare * 0.03);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (h01(i, 9) - 0.5) * 20, y + (h01(i, 10) - 0.5) * 20);
        ctx.stroke();
      }
    },
  });
  // lágrimas de sangue escorrendo (esticam com o movimento, espirram no grito)
  const tearK = 1 - die * 0.6;
  ctx.fillStyle = s.pal.glow;
  for (let i = 0; i < 2; i++) {
    const x = (i ? 0.35 : -0.45) * er + ex;
    const y0 = er * 0.72 + ey;
    const len = 62 + Math.sin(t * 1.3 + i * 2) * 8 + flare * 25;
    ctx.beginPath();
    ctx.moveTo(x - 4, y0);
    ctx.quadraticCurveTo(x - 5, y0 + len * 0.6, x, y0 + len);
    ctx.quadraticCurveTo(x + 5, y0 + len * 0.6, x + 4, y0);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y0 + len - 3, 4.5, 0, TAU);
    ctx.fill();
    for (let j = 0; j < 2; j++) {
      const ph = (t * 0.8 + j * 0.5 + i * 0.3) % 1;
      ctx.globalAlpha = (1 - ph) * tearK;
      ctx.beginPath();
      ctx.ellipse(x, y0 + len + 6 + ph * ph * 140, 3.5, 5.5, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  return pp;
}

/** Xal'thuun: cabeça-bolha verde (afogada), 3 olhos, manchas que brilham. */
function bodyDreamer(ctx: CanvasRenderingContext2D, R: number, C: Pal, st: DrawState, E: EyeSt, jaw: number, seed: number, s: BossSpec): V {
  const t = st.t;
  const sw = Math.sin(t * 1.6) * 0.03; // crânio respira (a parte de trás incha)
  // crânio inchado (mais alto atrás)
  ctx.fillStyle = vgrad(ctx, -R * 1.5, R * 0.6, mixHex(C.body, '#ffffff', 0.16), C.dark);
  ctx.beginPath();
  ctx.moveTo(-R * 0.95, R * 0.35);
  ctx.bezierCurveTo(-R * 1.15, -R * 0.4, -R * 0.6, -R * (1.25 + sw), R * 0.15, -R * (1.35 + sw * 2));
  ctx.bezierCurveTo(R * (0.9 + sw), -R * (1.4 + sw * 2), R * (1.15 + sw), -R * 0.6, R * 0.95, R * 0.1);
  ctx.bezierCurveTo(R * 0.85, R * 0.6, R * 0.3, R * 0.7, -R * 0.1, R * 0.6);
  ctx.bezierCurveTo(-R * 0.5, R * 0.62, -R * 0.85, R * 0.55, -R * 0.95, R * 0.35);
  ctx.fill();
  // brilho úmido no alto
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-R * 0.75, -R * 0.55);
  ctx.bezierCurveTo(-R * 0.55, -R * 1.05, -R * 0.1, -R * 1.25, R * 0.3, -R * 1.25);
  ctx.stroke();
  // dobras do cérebro / rugas (se mexem)
  ctx.strokeStyle = hexA(C.dark, 0.55);
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const y = -R * 1.1 + i * R * 0.22;
    const w = Math.sin(t * 1.3 + i) * 6;
    ctx.moveTo(-R * 0.1 + i * 8, y);
    ctx.bezierCurveTo(R * 0.2, y - 18 + w, R * 0.4, y + 18 - w, R * 0.75, y - 4);
  }
  ctx.stroke();
  // manchas bioluminescentes (pulsam em onda)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) {
    const x = -R * 0.5 + h01(i, 1) * R * 1.3, y = -R * 1.1 + h01(i, 2) * R * 1.1;
    const pulse = 0.4 + Math.sin(t * 2 - x * 0.02) * 0.3 + E.glow * 0.35;
    ctx.fillStyle = hexA(C.accent, clamp(pulse * 0.6));
    ctx.beginPath();
    ctx.arc(x, y, 3 + h01(i, 3) * 5, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  // rosto: focinho escuro
  ctx.fillStyle = hexA(C.dark, 0.6);
  ctx.beginPath();
  ctx.ellipse(-R * 0.45, R * 0.05, R * 0.55, R * 0.42, 0.1, 0, TAU);
  ctx.fill();
  // 3 olhos amarelos (um grande, dois menores), cada um com seu ritmo
  const ne = Math.max(1, Math.round(s.feat.eyes ?? 3));
  const pos: [number, number, number][] = [[-0.66, -0.16, 0.22], [-0.3, -0.42, 0.17], [-0.28, -0.04, 0.13]];
  let main: V = { x: pos[0][0] * R, y: pos[0][1] * R };
  for (let i = 0; i < Math.min(ne, 3); i++) {
    const [ex, ey, er] = pos[i];
    const x = ex * R, y = ey * R, r = er * R;
    const own = gaze(t, seed + i * 9);
    const bl = i === 0 ? 0 : blinkAt(t, seed + i * 13);
    const Ei: EyeSt = {
      ...E,
      lx: L(E.lx, own.x, i === 0 ? 0 : 0.35),
      ly: L(E.ly, own.y, i === 0 ? 0 : 0.35),
      oU: E.oU * (1 - bl),
      oL: E.oL * (1 - bl * 0.8),
    };
    ctx.fillStyle = C.dark;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.28, r * 1.08, 0, 0, TAU);
    ctx.fill();
    const pp = eyeball(ctx, x, y, r, Ei, {
      sclera: mixHex(C.eye, '#ffffff', 0.1), iris: C.eye, ring: '#a07a10', pupil: 'slit', glowCol: s.pal.glow, lid: C.body, lidDark: C.dark,
    });
    if (i === 0) main = pp;
  }
  // boca escondida pelos tentáculos
  ctx.fillStyle = '#020806';
  ctx.beginPath();
  ctx.ellipse(-R * 0.45, R * 0.25, R * (0.18 + jaw * 0.1), R * (0.06 + jaw * 0.12), 0, 0, TAU);
  ctx.fill();
  if (jaw > 0.15) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    orb(ctx, -R * 0.45, R * 0.25, R * 0.4 * jaw, s.pal.glow, jaw * 0.8);
    ctx.restore();
  }
  // o olho grande é a origem do raio
  return main;
}
