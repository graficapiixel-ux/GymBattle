/**
 * DRAGÕES (feat.kind): 0 = dragão de fogo alado, 1 = dragão de gelo com coroa,
 * 2 = dragão do eclipse (muitos chifres), 3 = wyrm da tempestade (sem asas, serpentino —
 * desenhado em dragon-wyrm.ts, com locomoção própria).
 *
 * Esqueleto de quadrúpede pesado: quadril e ombro são os dois "pilares" do tronco;
 * as 4 patas usam IK de duas peças e pisam de verdade (pés plantados enquanto apoiam,
 * avanço por passada = 150 unidades locais, igual ao motor). O pescoço em S segue a
 * cabeça com atraso, a cauda ondula por segmentos (cada um atrasado em relação ao
 * anterior) e as asas balançam a cada pisada.
 * Origem no chão, olhando para a esquerda; ~260 de altura em escala 1.
 */
import type { BossSpec } from '@gymbattle/shared';
import type { Anchors, DrawState, V } from '../types';
import { eyeGlow, hurtTint, mixHex, rgrad, vgrad, TAU, clamp } from '../util';
import { addV, bump, capsule, cubic, dirV, frac, hashStr, ik, lerp, lerpV, normals, ss, stepFoot, tubePath } from './dragon-kit';
import { drawWyrm } from './dragon-wyrm';

/** Avanço do corpo por ciclo de passada (unidades locais) — igual ao STRIDE do motor. */
const STRIDE = 150;

interface Pal {
  body: string;
  dark: string;
  line: string;
  belly: string;
  far: string;
  farLine: string;
  accent: string;
  glow: string;
  eye: string;
  mem: string;
  memFar: string;
  hi: string;
}

export function drawDragon(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState): Anchors {
  if ((s.feat.kind ?? 0) === 3) return drawWyrm(ctx, s, st);
  return drawDrake(ctx, s, st);
}

function palette(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState, kind: number): Pal {
  const P = s.pal;
  const body = hurtTint(ctx, st, P.body);
  const dark = hurtTint(ctx, st, P.dark);
  const line = mixHex(P.dark, '#000000', kind === 2 ? 0.2 : 0.5);
  const mem = kind === 1 ? mixHex(P.body, P.dark, 0.35) : kind === 2 ? mixHex(P.dark, P.body, 0.5) : mixHex(P.dark, P.body, 0.55);
  return {
    body,
    dark,
    line,
    belly: hurtTint(ctx, st, mixHex(P.accent, P.body, kind === 2 ? 0.55 : 0.4)),
    far: hurtTint(ctx, st, mixHex(P.body, P.dark, 0.5)),
    farLine: mixHex(line, '#000000', 0.3),
    accent: hurtTint(ctx, st, P.accent),
    glow: P.glow,
    eye: P.eye,
    mem: hurtTint(ctx, st, mem),
    memFar: hurtTint(ctx, st, mixHex(mem, P.dark, 0.5)),
    hi: mixHex(P.body, '#ffffff', kind === 2 ? 0.25 : 0.3),
  };
}

/** Pose calculada de um quadro (tudo o que o desenho precisa). */
interface Rig {
  S: V; // ombro (junta da pata da frente)
  H: V; // quadril
  pitch: number;
  breath: number;
  headP: V;
  headAng: number;
  jaw: number;
  wingS: number;
  wingR: number;
  wingFar: number;
  feet: { nh: V; fh: V; nf: V; ff: V };
  curl: { nh: number; fh: number; nf: number; ff: number };
  eyeOpen: number;
  throat: number;
  throatK: number;
  chest: number;
  handGlow: number;
  neckCurl: number;
}

function drawDrake(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState): Anchors {
  const kind = s.feat.kind ?? 0;
  const C = palette(ctx, s, st, kind);
  const seed = hashStr(s.id);
  const t = st.t;
  const atk = st.anim === 'attack' || st.anim === 'enter';
  const pose = st.anim === 'enter' ? 'roar' : st.pose;
  const p = atk ? st.p : 0;
  const die = st.anim === 'death' ? st.p : 0;
  const alive = 1 - ss(0.15, 0.4, die);
  const hk = st.hurt;
  const rage = st.rage;

  // ---------------- locomoção: 4 patas em sequência lateral (TP, TD... = traseira/dianteira)
  const mv = st.move * alive;
  const m = ss(0.02, 0.3, mv);
  const back = st.vx > 1 ? -1 : 1; // recuando: a passada inverte
  const D = lerp(0.72, 0.6, mv); // fração de apoio (andar rápido = menos tempo no chão)
  const A = STRIDE * D * m;
  const g = st.gait;
  const lift = (h: number) => h * (0.55 + 0.45 * mv) * m;
  const fNH = stepFoot(frac(g), D, A, lift(26));
  const fNF = stepFoot(frac(g + 0.75), D, A, lift(30));
  const fFH = stepFoot(frac(g + 0.5), D, A, lift(26));
  const fFF = stepFoot(frac(g + 0.25), D, A, lift(30));
  // peso: afunda logo depois de cada pisada (quadril com as traseiras, ombro com as dianteiras)
  const weight = 4 + 5 * mv;
  const dipH = (fNH.dip + fFH.dip) * weight * m;
  const dipS = (fNF.dip + fFF.dip) * weight * m;
  // versão atrasada (pescoço, asas e cauda chegam depois)
  const lagDip = (lag: number) => {
    const a = stepFoot(frac(g - lag), D, A, 0).dip + stepFoot(frac(g + 0.5 - lag), D, A, 0).dip;
    const b = stepFoot(frac(g + 0.75 - lag), D, A, 0).dip + stepFoot(frac(g + 0.25 - lag), D, A, 0).dip;
    return (a + b) * 0.5 * weight * m;
  };

  // ---------------- respiração, troca de peso, raiva
  const br = Math.sin(t * 1.5 + seed * 6);
  const brLag = Math.sin(t * 1.5 + seed * 6 - 0.7);
  const shift = Math.sin(t * 0.47 + seed * 3) * (1 - m) * alive;
  const tremor = rage > 0.5 ? Math.sin(t * 37) * (rage - 0.5) * 2 : 0;

  // ---------------- base do esqueleto
  let sx = -58 + shift * 5 - mv * 8;
  let sy = -142 - br * 2.5 + dipS + mv * 7 + shift * 1.5;
  let hx = 70 + shift * 5 - mv * 4;
  let hy = -134 - br * 1 + dipH + shift * -1.5;
  // cabeça relativa ao ombro (estabilizada: não herda o balanço inteiro do passo)
  let hdx = -112 + Math.sin(t * 0.7 + seed * 2) * 5 * alive - mv * 10;
  let hdy = -104 - brLag * 3 - dipS * 0.7 + lagDip(0.08) * 0.45 + mv * 8 + Math.sin(t * 0.53) * 3 * alive;
  let headAng = Math.sin(t * 0.61 + seed) * 0.04 + Math.sin(TAU * 2 * (g - 0.12)) * 0.05 * m + mv * 0.06;
  let jaw = 0.04 + 0.04 * Math.max(0, Math.sin(t * 0.9)) + rage * 0.1;
  // asas: dobradas, com um "ajeitar" de vez em quando e um balanço a cada pisada
  const rustle = bump(frac((t + seed * 7) / 6.3), 0.5, 0.06);
  let wingS = 0.08 + 0.04 * Math.sin(t * 0.8) + rustle * 0.35 + mv * 0.12 + rage * 0.08;
  let wingR = lagDip(0.12) * 0.012 + Math.sin(t * 0.8 + 1) * 0.02 - rustle * 0.08;
  let throat = 0;
  let throatK = 0;
  let chest = rage * 0.4 * alive;
  let handGlow = 0;
  let neckCurl = 0;
  // pés: casa (u = 0) e alvo com a passada
  const foot = (x0: number, f: { u: number; lift: number }, y0 = 0): V => ({ x: x0 - f.u * back, y: y0 - f.lift });
  const feet = { nh: foot(66, fNH), fh: foot(86, fFH, -5), nf: foot(-66, fNF), ff: foot(-48, fFF, -5) };
  const curl = { nh: Math.max(0, fNH.sw), fh: Math.max(0, fFH.sw), nf: Math.max(0, fNF.sw), ff: Math.max(0, fFF.sw) };
  // patas da frente levantadas (empinar) e garra que golpeia
  let rear = 0;
  let armN: V | null = null;
  let armK = 0;
  let smear: { a0: number; a1: number; r: number; k: number } | null = null;

  // ---------------- tempos do ataque
  const ant = atk ? ss(0, 0.4, p) * (1 - ss(0.42, 0.52, p)) : 0; // preparação
  const hit = atk ? ss(0.42, 0.54, p) * (1 - ss(0.62, 1, p)) : 0; // golpe (sai rápido, volta devagar)
  const act = atk ? ss(0, 0.12, p) * (1 - ss(0.85, 1, p)) : 0;
  const imp = atk ? bump(p, 0.565, 0.045) : 0; // tranco do impacto
  const S0 = { x: sx, y: sy };

  if (atk && (pose === 'breath' || pose === 'shoot')) {
    const sus = ss(0.5, 0.56, p) * (1 - ss(0.84, 0.97, p)); // sopro sustentado
    sx += ant * 16 - hit * 18 + sus * 8;
    sy += -ant * 12 + hit * 8;
    hy += ant * 4;
    hdx += ant * 46 - hit * 34 + sus * (8 + Math.sin(t * 47) * 2.5);
    hdy += -ant * 34 + hit * 34 + sus * Math.sin(t * 39) * 2;
    headAng += -ant * 0.38 + hit * 0.16;
    jaw = Math.max(jaw, ss(0.43, 0.52, p) * (1 - ss(0.84, 0.97, p)) + ant * 0.08);
    neckCurl = ant;
    wingS += act * 0.22 + sus * 0.15;
    wingR += -ant * 0.12 + sus * 0.12 + imp * 0.15;
    throat = ss(0.06, 0.44, p);
    throatK = (ss(0.06, 0.2, p) * (1 - ss(0.5, 0.6, p))) * (0.6 + 0.4 * throat);
    chest += act * 0.9;
  } else if (atk && (pose === 'roar' || pose === 'cast')) {
    const isCast = pose === 'cast';
    const rr = ss(0.05, 0.42, p) * (1 - ss(0.78, 0.97, p)) * (isCast ? 0.6 : 1);
    rear = isCast ? 0 : rr;
    sx += rr * 26;
    sy -= rr * (isCast ? 70 : 74);
    hy += rr * 6;
    hx += rr * 6;
    const roarK = ss(0.42, 0.5, p) * (1 - ss(0.8, 0.95, p));
    const shake = roarK * Math.sin(t * 55) * 2.2;
    hdx += ant * 34 - hit * 26 + shake;
    hdy += ant * 30 - hit * (isCast ? 18 : 34) + shake;
    headAng += ant * 0.32 - hit * (isCast ? 0.3 : 0.55);
    jaw = Math.max(jaw, isCast ? act * 0.25 + imp * 0.6 : roarK);
    wingS += ss(0.1, 0.42, p) * (1 - ss(0.82, 1, p)) * 0.95;
    wingR += -ant * 0.12 - hit * 0.2 + imp * 0.38;
    chest += act * 0.8;
    if (isCast) {
      // garra da frente levanta e empurra a magia para a frente
      armK = ss(0.05, 0.3, p) * (1 - ss(0.75, 0.95, p));
      armN = { x: lerp(-34, -112, ss(0.4, 0.55, p)), y: lerp(-58, -6, ss(0.4, 0.55, p)) - ant * 30 };
      handGlow = act * (0.6 + 0.4 * Math.sin(t * 12)) + imp;
    } else if (p > 0.82) {
      // patas da frente voltam ao chão
      chest += 0;
    }
  } else if (atk && pose === 'swipe') {
    const sw = ss(0.02, 0.3, p) * (1 - ss(0.78, 0.98, p));
    sx += ant * 22 - hit * 30;
    sy += -ant * 34 + hit * 16 + imp * 6;
    hy += hit * 4;
    hdx += ant * 26 - hit * 34;
    hdy += -ant * 6 + hit * 30;
    headAng += ant * 0.1 + hit * 0.15;
    jaw = Math.max(jaw, hit * 0.55 + ant * 0.15);
    wingS += ant * 0.4 + imp * 0.35 + hit * 0.2;
    wingR += -ant * 0.15 + imp * 0.25;
    // arco da garra: sobe para trás, passa por cima e desce na frente
    const th = (q: number) => 1.57 - 2.64 * ss(0.05, 0.4, q) - 3.04 * ss(0.42, 0.55, q) - 0.6 * ss(0.55, 0.75, q);
    const rr = (q: number) => 96 + 34 * ss(0.4, 0.5, q) * (1 - ss(0.6, 0.8, q));
    armK = sw;
    const a1 = th(p);
    armN = dirV(a1, rr(p)); // relativo ao ombro (resolvido abaixo)
    const smK = ss(0.43, 0.48, p) * (1 - ss(0.58, 0.68, p));
    if (smK > 0.01) smear = { a0: th(p - 0.07), a1, r: rr(p), k: smK };
  } else if (atk && pose === 'slam') {
    const rr = ss(0.05, 0.4, p) * (1 - ss(0.44, 0.53, p));
    const crash = ss(0.45, 0.55, p) * (1 - ss(0.62, 0.95, p));
    rear = rr;
    sx += rr * 30 - crash * 12;
    sy += -rr * 88 + crash * 20 + imp * 6;
    hy += crash * 6 + rr * 6;
    feet.nf.x -= crash * 34;
    feet.ff.x -= crash * 30;
    hdx += ant * 24 - crash * 20;
    hdy += -rr * 8 + crash * 34;
    headAng += -ant * 0.3 + crash * 0.25;
    jaw = Math.max(jaw, rr * 0.5 + imp * 0.6);
    wingS += rr * 1 + crash * 0.3;
    wingR += -rr * 0.25 + imp * 0.6;
    chest += act * 0.5;
  } else if (atk && pose === 'charge') {
    sx += ant * 16 - hit * 30;
    sy += ant * 10 + hit * 18;
    hdx += ant * 20 - hit * 46;
    hdy += ant * 30 + hit * 40;
    headAng += ant * 0.25 + hit * 0.3;
    jaw = Math.max(jaw, hit * 0.7);
    wingS += act * 0.6;
    wingR += hit * 0.3;
  }

  // ---------------- dano: tranco para trás
  if (hk > 0.01) {
    const j = Math.sin(t * 70) * hk * 2.5;
    sx += hk * 20 + j;
    sy -= hk * 9;
    hx += hk * 6;
    hdx += hk * 40;
    hdy -= hk * 18;
    headAng -= hk * 0.35;
    jaw = Math.max(jaw, hk * 0.55);
    wingS += hk * 0.35;
    wingR -= hk * 0.15;
  }

  // ---------------- morte: cambaleia, as traseiras cedem, depois a frente e o pescoço
  let eyeOpen = 1;
  if (die > 0) {
    const stg = ss(0, 0.22, die) * (1 - ss(0.28, 0.5, die));
    const hindF = ss(0.2, 0.46, die);
    const frontF = ss(0.36, 0.58, die);
    const bounce = Math.sin(Math.PI * clamp((die - 0.58) / 0.14)) * (1 - ss(0.72, 0.8, die));
    sx += stg * 22 + Math.sin(die * 40) * stg * 4 - frontF * 8;
    sy += -stg * 34 + frontF * 98 - bounce * 9;
    hx += stg * 10 + hindF * 16;
    hy += hindF * 88;
    feet.nf.x -= frontF * 26;
    feet.ff.x -= frontF * 18;
    feet.nh.x += hindF * 18;
    hdx += stg * 14;
    hdy -= stg * 44;
    headAng -= stg * 0.6;
    jaw = Math.max(jaw, stg * 0.9);
    wingS = lerp(wingS, 0.85, stg) * (1 - ss(0.4, 0.75, die));
    wingR += stg * -0.3 + ss(0.4, 0.8, die) * 0.3;
    eyeOpen = 1 - ss(0.6, 0.88, die);
  }
  sy += tremor;
  // no ar (salto/voo pela arena): asas abertas batendo forte
  const air = clamp(st.air ?? 0);
  if (air > 0) {
    const fl = Math.sin(t * 9.5);
    wingS = lerp(wingS, 0.7 + 0.35 * fl, air);
    wingR += air * (fl * 0.35 - 0.1);
  }

  const S: V = { x: sx, y: sy };
  const H: V = { x: hx, y: hy };
  // cabeça (no fim da morte cai no chão com um quique)
  let headP: V = { x: sx + hdx, y: sy + hdy };
  if (die > 0) {
    const nf = ss(0.5, 0.8, die);
    const bq = Math.sin(Math.PI * clamp((die - 0.8) / 0.12)) * 16;
    headP = lerpV(headP, { x: sx - 150, y: -30 - bq }, nf);
    headAng = lerp(headAng, 0.12, nf);
    jaw = lerp(jaw, 0.3, nf);
  }

  // patas da frente quando empina: garras no ar, se debatendo um pouco
  if (rear > 0.01) {
    const fl = Math.sin(t * 9) * 6 * rear;
    feet.nf = lerpV(feet.nf, { x: S.x - 40 + fl, y: S.y + 78 - fl }, rear);
    feet.ff = lerpV(feet.ff, { x: S.x - 22 - fl, y: S.y + 86 + fl }, rear);
    curl.nf = lerp(curl.nf, 0.8, rear);
    curl.ff = lerp(curl.ff, 0.8, rear);
  }
  if (armN && armK > 0.01) {
    const tgt = pose === 'swipe' ? { x: S.x + armN.x, y: Math.min(-6, S.y + 26 + armN.y) } : { x: S.x + armN.x, y: S.y + armN.y + 30 };
    feet.nf = lerpV(feet.nf, tgt, armK);
    curl.nf = lerp(curl.nf, 0.3, armK);
  }

  const R: Rig = {
    S, H, pitch: Math.atan2(H.y - S.y, H.x - S.x), breath: br, headP, headAng, jaw: clamp(jaw), wingS: clamp(wingS, 0, 1.1), wingR,
    wingFar: lagDip(0.18) * 0.01, feet, curl, eyeOpen, throat, throatK, chest: clamp(chest), handGlow, neckCurl,
  };
  void S0;

  // ---------------- tronco (sistema local)
  const mid: V = { x: (S.x + H.x) / 2, y: (S.y + H.y) / 2 };
  const Ln = Math.hypot(H.x - S.x, H.y - S.y);
  const ca = Math.cos(R.pitch);
  const sa = Math.sin(R.pitch);
  const toW = (x: number, y: number): V => ({ x: mid.x + x * ca - y * sa, y: mid.y + x * sa + y * ca });
  const hl = Ln / 2;
  const wingRoot = toW(-hl + 18, -60);
  const wingTail = toW(hl - 14, -52);
  const neckBase = toW(-hl - 22, -24);
  const tailBase = toW(hl + 40, -12);

  // ---------------- 1) asa de trás
  const wingOn = (s.feat.wings ?? 1) > 0;
  if (wingOn) drawWing(ctx, addV(wingRoot, { x: 16, y: -8 }), toW(hl + 6, -50), R.wingS * 0.95, R.wingR - 0.12 + R.wingFar, 0.92, C, kind, t, true, die);

  // ---------------- 2) patas de trás (lado de lá)
  hindLeg(ctx, toW(hl - 2, 8), R.feet.fh, R.curl.fh, C.far, C.farLine, C.accent, true);
  frontLeg(ctx, toW(-hl + 12, 14), R.feet.ff, R.curl.ff, C.far, C.farLine, C.accent, true);

  // ---------------- 3) cauda
  const tail = drawTail(ctx, tailBase, R.pitch, s, st, C, kind, p, atk ? pose : '', m, g, die, seed);

  // ---------------- 4) tronco
  drawTorso(ctx, mid, R.pitch, Ln, R, s, C, kind, t, die);

  // ---------------- 5) pata traseira (lado de cá) com a coxa grande
  const legC = mixHex(C.body, C.dark, 0.18);
  hindLeg(ctx, toW(hl - 6, 4), R.feet.nh, R.curl.nh, legC, C.line, C.accent, false);

  // ---------------- 6) asa da frente (dobrada sobre o flanco ou aberta)
  if (wingOn) drawWing(ctx, wingRoot, wingTail, R.wingS, R.wingR, 1, C, kind, t, false, die);

  // ---------------- 7) pescoço e cabeça
  const mouth = drawNeckHead(ctx, neckBase, R, s, st, C, kind, seed);

  // ---------------- 8) pata da frente (lado de cá) + rastro da garra
  const J = toW(-hl + 4, 18);
  const hand = frontLeg(ctx, J, R.feet.nf, R.curl.nf, legC, C.line, C.accent, false);
  if (smear) drawSmear(ctx, J, smear, s.pal.glow);
  if (handGlow > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const rg = 30 + handGlow * 22;
    ctx.fillStyle = rgrad(ctx, hand.x, hand.y, rg, s.pal.glow + 'dd', s.pal.glow + '00');
    ctx.beginPath();
    ctx.arc(hand.x, hand.y, rg, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  void tail;

  const handA = pose === 'slam' && atk ? lerpV(R.feet.nf, R.feet.ff, 0.5) : hand;
  return {
    mouth,
    hand: handA,
    core: toW(-10, 0),
    top: Math.min(headP.y - 60, S.y - 90),
    halfW: 130,
  };
}

/* =========================================================================================
 * TRONCO
 * ======================================================================================= */
function drawTorso(ctx: CanvasRenderingContext2D, mid: V, pitch: number, Ln: number, R: Rig, s: BossSpec, C: Pal, kind: number, t: number, die: number) {
  const hl = Ln / 2;
  const b = R.breath;
  ctx.save();
  ctx.translate(mid.x, mid.y);
  ctx.rotate(pitch);
  const belly = 56 + b * 2.5;
  const chestF = -hl - 58 - b * 1.5;
  const rump = hl + 58;
  // silhueta
  const shape = () => {
    ctx.beginPath();
    ctx.moveTo(chestF, -6);
    ctx.bezierCurveTo(chestF + 4, -46, -hl - 10, -66 - b, -hl + 22, -66 - b * 1.2); // peito → cernelha
    ctx.bezierCurveTo(-10, -58, hl - 20, -66, hl + 18, -58); // costas
    ctx.bezierCurveTo(rump - 4, -48, rump + 6, -10, rump - 10, 14); // garupa
    ctx.bezierCurveTo(rump - 26, 40, hl - 6, belly - 6, hl - 30, belly - 4);
    ctx.bezierCurveTo(10, belly + 4, -hl + 10, belly + 2, -hl - 24, 40); // barriga caída
    ctx.bezierCurveTo(-hl - 44, 30, chestF - 4, 26, chestF, -6);
    ctx.closePath();
  };
  shape();
  ctx.fillStyle = vgrad(ctx, -70, belly, mixHex(R.chest > 0 ? C.body : C.body, C.hi, 0.35), C.dark);
  ctx.fill();
  ctx.save();
  ctx.clip();
  // placas da barriga
  ctx.fillStyle = C.belly;
  ctx.beginPath();
  ctx.moveTo(chestF - 4, 6);
  ctx.bezierCurveTo(chestF + 6, 34, -hl - 30, 40, -hl - 10, 46);
  ctx.bezierCurveTo(-hl + 30, belly + 8, hl - 20, belly + 2, rump - 30, 44);
  ctx.lineTo(rump, 80);
  ctx.lineTo(chestF - 10, 80);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = mixHex(C.belly, '#000000', 0.35);
  ctx.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    const x = chestF + 14 + i * ((rump - chestF - 40) / 8);
    ctx.beginPath();
    ctx.moveTo(x - 6, 20);
    ctx.quadraticCurveTo(x + 4, 50, x - 2, 80);
    ctx.stroke();
  }
  // escamas do flanco (fileiras de arcos)
  ctx.strokeStyle = mixHex(C.dark, C.body, 0.35);
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.6;
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 6; i++) {
      const x = -hl + 2 + i * 26 + (r % 2) * 13;
      const y = -40 + r * 18;
      ctx.beginPath();
      ctx.arc(x, y, 9, 0.3, Math.PI - 0.3);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  // sombra de volume embaixo e brilho no dorso
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(0, belly + 10, rump, 26, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  // contorno
  shape();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 3.2;
  ctx.stroke();
  // luz de borda nas costas
  ctx.strokeStyle = C.hi;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-hl - 6, -60);
  ctx.bezierCurveTo(-10, -55, hl - 20, -62, hl + 18, -55);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // marcas próprias de cada dragão
  if (kind === 0) {
    // rachaduras de lava pulsando
    const pul = 0.45 + 0.3 * Math.sin(t * 3.1) + R.chest * 0.4;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = s.pal.glow;
    ctx.globalAlpha = clamp(pul) * (1 - die * 0.8);
    ctx.lineWidth = 2.5;
    const cracks = [
      [-hl - 30, -10, -hl - 12, 4, -hl - 20, 22, -hl - 2, 30],
      [-20, -30, -6, -20, -16, -4, 6, 6],
      [hl - 10, -36, hl + 4, -22, hl - 6, -8],
    ];
    for (const c of cracks) {
      ctx.beginPath();
      ctx.moveTo(c[0], c[1]);
      for (let i = 2; i < c.length; i += 2) ctx.lineTo(c[i], c[i + 1]);
      ctx.stroke();
    }
    ctx.restore();
  } else if (kind === 1) {
    // brilhos de gelo
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 4; i++) {
      const ph = frac(t * 0.35 + i * 0.27);
      const a = Math.sin(ph * Math.PI);
      const x = -hl + i * 40 + 6;
      const y = -36 + (i % 2) * 20;
      ctx.globalAlpha = a * 0.9;
      ctx.beginPath();
      ctx.moveTo(x, y - 7 * a);
      ctx.lineTo(x + 1.6, y);
      ctx.lineTo(x, y + 7 * a);
      ctx.lineTo(x - 1.6, y);
      ctx.closePath();
      ctx.moveTo(x - 7 * a, y);
      ctx.lineTo(x, y + 1.6);
      ctx.lineTo(x + 7 * a, y);
      ctx.lineTo(x, y - 1.6);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else {
    // runas do eclipse
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = s.pal.glow;
    ctx.lineWidth = 2;
    ctx.globalAlpha = (0.35 + 0.25 * Math.sin(t * 2.2) + R.chest * 0.4) * (1 - die);
    ctx.beginPath();
    ctx.arc(-6, -14, 20, 0, TAU);
    ctx.moveTo(4, -14);
    ctx.arc(-2, -14, 13, 0, TAU, true);
    ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const x = -hl + 10 + i * 30;
      ctx.beginPath();
      ctx.arc(x, -44 + (i % 2) * 6, 2.2, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  // brilho interno no peito (cresce no ataque e na raiva)
  if (R.chest > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const a = Math.round(clamp(R.chest) * 140 * (1 - die))
      .toString(16)
      .padStart(2, '0');
    ctx.fillStyle = rgrad(ctx, -hl - 20, 10, 80, s.pal.glow + a, s.pal.glow + '00');
    ctx.beginPath();
    ctx.arc(-hl - 20, 10, 80, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // espinhos das costas
  const n = s.feat.spikes ?? 6;
  for (let i = 0; i < n; i++) {
    const k = n > 1 ? i / (n - 1) : 0.5;
    const x = -hl + 4 + k * (Ln + 20);
    const y = -62 + Math.sin(k * Math.PI) * 4;
    const h = (20 + Math.sin(k * Math.PI) * 16) * (kind === 1 ? 1.25 : 1);
    spike(ctx, x, y, h, -0.35, kind, C, t + i);
  }
  ctx.restore();
}

/** Espinho dorsal (osso, cristal de gelo ou lâmina do eclipse). */
function spike(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, lean: number, kind: number, C: Pal, ph: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(lean);
  if (kind === 1) {
    ctx.fillStyle = 'rgba(230,248,255,0.85)';
    ctx.beginPath();
    ctx.moveTo(-7, 4);
    ctx.lineTo(-4, -h * 0.7);
    ctx.lineTo(1, -h);
    ctx.lineTo(6, -h * 0.6);
    ctx.lineTo(8, 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(ph * 2);
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(0, -h * 0.85);
    ctx.stroke();
  } else {
    ctx.fillStyle = C.accent;
    ctx.beginPath();
    ctx.moveTo(-9, 5);
    if (kind === 2) ctx.quadraticCurveTo(-6, -h * 0.6, 8, -h);
    else ctx.quadraticCurveTo(-4, -h * 0.5, 3, -h);
    ctx.quadraticCurveTo(4, -h * 0.4, 10, 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
  ctx.restore();
}

/* =========================================================================================
 * PATAS
 * ======================================================================================= */
/** Pata traseira digitígrada: quadril → joelho (para a frente) → jarrete → dedos. */
function hindLeg(ctx: CanvasRenderingContext2D, hip: V, F: V, curl: number, col: string, line: string, clawC: string, far: boolean) {
  const heel = Math.sin(Math.PI * curl);
  const ank: V = { x: F.x + 18 + heel * 4, y: F.y - 30 - heel * 6 };
  const knee = ik(hip, ank, 64, 56, 1);
  ctx.save();
  ctx.fillStyle = col;
  ctx.strokeStyle = line;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  // dedos (atrás do pé)
  toes(ctx, F, curl, col, line, clawC, 1);
  ctx.fillStyle = col;
  ctx.strokeStyle = line;
  ctx.lineWidth = 3;
  capsule(ctx, ank, F, 11, 9);
  ctx.fill();
  ctx.stroke();
  capsule(ctx, knee, ank, 18, 12);
  ctx.fill();
  ctx.stroke();
  // coxa musculosa (sem contorno no topo: nasce do corpo)
  capsule(ctx, hip, knee, far ? 28 : 33, 19);
  ctx.fill();
  limbEdges(ctx, hip, knee, far ? 28 : 33, 19);
  if (!far) {
    // volume do músculo
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.ellipse(hip.x - 8, hip.y - 4, 22, 28, 0.4, 0, TAU);
    ctx.fill();
  }
  // junta do joelho
  ctx.fillStyle = line;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.arc(knee.x, knee.y, 6, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Pata dianteira: ombro → cotovelo (para trás) → pulso → mão com garras. Devolve a ponta das garras. */
function frontLeg(ctx: CanvasRenderingContext2D, J: V, F: V, curl: number, col: string, line: string, clawC: string, far: boolean): V {
  const lift = Math.sin(Math.PI * Math.min(1, curl));
  const wrist: V = { x: F.x + 8 - lift * 6, y: F.y - 20 - lift * 4 };
  const elbow = ik(J, wrist, 56, 52, -1);
  ctx.save();
  ctx.fillStyle = col;
  ctx.strokeStyle = line;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  capsule(ctx, J, elbow, far ? 24 : 29, 16);
  ctx.fill();
  limbEdges(ctx, J, elbow, far ? 24 : 29, 16);
  capsule(ctx, elbow, wrist, 16, 11);
  ctx.fill();
  ctx.stroke();
  capsule(ctx, wrist, F, 11, 9);
  ctx.fill();
  ctx.stroke();
  toes(ctx, F, curl, col, line, clawC, 0.95);
  if (!far) {
    // ombro (volume)
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath();
    ctx.ellipse(J.x - 4, J.y - 2, 18, 22, 0.3, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  return { x: F.x - 26, y: F.y + 2 };
}

/** Contorno só das laterais e da ponta de uma cápsula (a raiz se funde ao corpo). */
function limbEdges(ctx: CanvasRenderingContext2D, a: V, b: V, ra: number, rb: number) {
  const th = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.beginPath();
  ctx.moveTo(a.x + Math.cos(th + Math.PI / 2) * ra * 0.98, a.y + Math.sin(th + Math.PI / 2) * ra * 0.98);
  ctx.lineTo(b.x + Math.cos(th + Math.PI / 2) * rb, b.y + Math.sin(th + Math.PI / 2) * rb);
  ctx.arc(b.x, b.y, rb, th + Math.PI / 2, th - Math.PI / 2, true);
  ctx.lineTo(a.x + Math.cos(th - Math.PI / 2) * ra * 0.98, a.y + Math.sin(th - Math.PI / 2) * ra * 0.98);
  ctx.stroke();
}

/** Três dedos com garras (para a frente). curl > 0: dedos pendem durante o balanço. */
function toes(ctx: CanvasRenderingContext2D, F: V, curl: number, col: string, line: string, clawC: string, sc: number) {
  const hang = Math.sin(Math.PI * Math.min(1, curl)) * 0.7;
  for (let i = 0; i < 3; i++) {
    const a = Math.PI + 0.18 - i * 0.14 - hang; // aponta para a esquerda, cai quando no ar
    const len = (24 - i * 3) * sc;
    const tip = { x: F.x + Math.cos(a) * len, y: F.y - Math.sin(a) * len * -1 };
    ctx.fillStyle = col;
    ctx.strokeStyle = line;
    ctx.lineWidth = 2.5;
    capsule(ctx, { x: F.x, y: F.y }, tip, 8, 5);
    ctx.fill();
    ctx.stroke();
    // garra
    ctx.fillStyle = clawC;
    ctx.beginPath();
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    ctx.moveTo(tip.x - dy * 4, tip.y + dx * 4);
    ctx.quadraticCurveTo(tip.x + dx * 12, tip.y + dy * 12 - 2, tip.x + dx * 13 + 2, tip.y + dy * 13 + 7);
    ctx.lineTo(tip.x + dy * 4, tip.y - dx * 4);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

/* =========================================================================================
 * ASA (osso do braço, antebraço, 4 dedos e membrana recortada)
 * ======================================================================================= */
function drawWing(ctx: CanvasRenderingContext2D, root: V, attach: V, s: number, raise: number, sc: number, C: Pal, kind: number, t: number, far: boolean, die: number) {
  const hA = lerp(-0.55, -1.75, s) + raise;
  const E = addV(root, dirV(hA, lerp(52, 48, s) * sc));
  const fA = lerp(-2.75, -2.05, s) + raise * 1.25;
  const W = addV(E, dirV(fA, lerp(60, 66, s) * sc));
  const fold = [0.22, 0.36, 0.5, 0.64];
  const open = [-1.75, -1.05, -0.35, 0.4];
  const lenF = [150, 134, 114, 92];
  const lenO = [140, 168, 162, 138];
  const tips: V[] = [];
  for (let i = 0; i < 4; i++) {
    const a = lerp(fold[i], open[i], s) + raise * (0.8 + i * 0.15) + Math.sin(t * 2.3 + i * 0.9) * 0.015 * (1 + s * 2);
    tips.push(addV(W, dirV(a, lerp(lenF[i], lenO[i], s) * sc)));
  }
  const mem = far ? C.memFar : C.mem;
  const line = far ? C.farLine : C.line;
  // membrana com recortes entre os dedos (a borda "enche" de vento com o balanço)
  const billow = 0.2 + 0.06 * Math.sin(t * 3.1) + s * 0.08;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(root.x, root.y);
  ctx.lineTo(E.x, E.y);
  ctx.lineTo(W.x, W.y);
  ctx.lineTo(tips[0].x, tips[0].y);
  for (let i = 1; i < 4; i++) {
    const a = tips[i - 1];
    const b = tips[i];
    const c = lerpV(lerpV(a, b, 0.5), W, billow + 0.1);
    ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
  }
  const ce = lerpV(lerpV(tips[3], attach, 0.5), W, 0.25);
  ctx.quadraticCurveTo(ce.x, ce.y, attach.x, attach.y);
  ctx.closePath();
  ctx.globalAlpha = kind === 1 ? 0.8 : 0.96;
  const mg = ctx.createRadialGradient(W.x, W.y, 10, W.x, W.y, 190 * sc);
  mg.addColorStop(0, mixHex(mem, '#ffffff', far ? 0 : 0.12));
  mg.addColorStop(1, mixHex(mem, '#000000', 0.25));
  ctx.fillStyle = mg;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = line;
  ctx.lineWidth = 2.6;
  ctx.stroke();
  // estrelas do eclipse / brilho de gelo dentro da membrana
  if (kind === 2 && !far) {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 9; i++) {
      const k1 = (i * 0.37) % 1;
      const k2 = (i * 0.61 + 0.2) % 1;
      const pt = lerpV(lerpV(W, tips[i % 4], 0.3 + k1 * 0.6), tips[(i + 1) % 4], k2 * 0.4);
      ctx.globalAlpha = 0.4 + 0.5 * Math.abs(Math.sin(t * 1.7 + i * 2.1));
      ctx.fillRect(pt.x - 1.2, pt.y - 1.2, 2.4, 2.4);
    }
    ctx.restore();
  }
  // veias da membrana
  ctx.strokeStyle = far ? C.farLine : kind === 1 ? '#ffffff' : C.accent;
  ctx.globalAlpha = kind === 1 ? 0.55 : 0.35;
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 3; i++) {
    const m = lerpV(tips[i], tips[i + 1], 0.5);
    const c = lerpV(W, m, 0.55);
    ctx.beginPath();
    ctx.moveTo(W.x, W.y);
    ctx.quadraticCurveTo(c.x + 6, c.y + 6, m.x * 0.15 + c.x * 0.85, m.y * 0.15 + c.y * 0.85);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // borda incandescente na raiva / magia
  if (!far && (kind !== 1 || s > 0.4)) {
    ctx.strokeStyle = C.glow;
    ctx.globalAlpha = 0.15 + 0.35 * s * (1 - die);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tips[0].x, tips[0].y);
    for (let i = 1; i < 4; i++) {
      const c = lerpV(lerpV(tips[i - 1], tips[i], 0.5), W, billow + 0.1);
      ctx.quadraticCurveTo(c.x, c.y, tips[i].x, tips[i].y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // dedos (ossos)
  ctx.strokeStyle = line;
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    ctx.lineWidth = 6 - i * 0.6;
    ctx.beginPath();
    ctx.moveTo(W.x, W.y);
    ctx.lineTo(tips[i].x, tips[i].y);
    ctx.stroke();
  }
  ctx.strokeStyle = far ? C.far : C.body;
  for (let i = 0; i < 4; i++) {
    ctx.lineWidth = 3 - i * 0.3;
    ctx.beginPath();
    ctx.moveTo(W.x, W.y);
    ctx.lineTo(tips[i].x, tips[i].y);
    ctx.stroke();
  }
  // braço e antebraço
  ctx.fillStyle = far ? C.far : C.body;
  ctx.strokeStyle = line;
  ctx.lineWidth = 2.6;
  capsule(ctx, root, E, 13 * sc, 9 * sc);
  ctx.fill();
  ctx.stroke();
  capsule(ctx, E, W, 9 * sc, 7 * sc);
  ctx.fill();
  ctx.stroke();
  // polegar com garra no pulso
  ctx.fillStyle = C.accent;
  ctx.beginPath();
  ctx.moveTo(W.x - 5, W.y - 2);
  ctx.quadraticCurveTo(W.x - 16, W.y - 14, W.x - 12, W.y - 24);
  ctx.quadraticCurveTo(W.x - 6, W.y - 12, W.x + 5, W.y - 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/* =========================================================================================
 * CAUDA (corrente de segmentos; cada um repete o movimento do anterior com atraso)
 * ======================================================================================= */
function drawTail(ctx: CanvasRenderingContext2D, base: V, pitch: number, s: BossSpec, st: DrawState, C: Pal, kind: number, p: number, pose: string, m: number, g: number, die: number, seed: number) {
  const N = 14;
  const seg = 17;
  const pts: V[] = [{ ...base }];
  const rad: number[] = [];
  let a = pitch + 0.62;
  const t = st.t;
  const alive = 1 - ss(0.3, 0.7, die);
  for (let i = 1; i <= N; i++) {
    const k = i / N;
    // curvatura de repouso: desce, deita no chão e enrola a ponta para cima
    let c = i <= 3 ? -0.04 : i < 10 ? -0.05 : -0.2;
    // ondulação viva (onda que corre para a ponta) + balanço da passada
    c += Math.sin(t * 1.4 - i * 0.5 + seed * 5) * 0.045 * k * alive;
    c += Math.sin(TAU * 2 * g - i * 0.55) * 0.06 * m * (0.3 + k);
    // golpe com a cauda (atrasado por segmento)
    if (pose) {
      const q = clamp(p - i * 0.012);
      let w = 0;
      if (pose === 'swipe') w = -ss(0.05, 0.4, q) * 0.9 + ss(0.42, 0.58, q) * 1.8 - ss(0.6, 1, q) * 0.9;
      else if (pose === 'roar' || pose === 'slam') w = -ss(0.05, 0.4, q) * 0.6 * (1 - ss(0.45, 0.6, q)) + bump(q, 0.58, 0.06) * 0.8;
      else if (pose === 'breath' || pose === 'shoot') w = ss(0.05, 0.4, q) * 0.4 * (1 - ss(0.5, 0.9, q));
      else w = -ss(0.05, 0.4, q) * 0.4 + ss(0.45, 0.6, q) * 0.4 - ss(0.6, 1, q) * 0.0;
      c += w * 0.07 * (0.4 + k);
    }
    if (st.hurt > 0.01) c += Math.sin(t * 30 - i) * 0.05 * st.hurt;
    c *= 1 - die * 0.6;
    a += c;
    const prev = pts[i - 1];
    const pt = { x: prev.x + Math.cos(a) * seg, y: prev.y + Math.sin(a) * seg };
    pts.push(pt);
  }
  for (let i = 0; i <= N; i++) rad.push(lerp(30, 4, Math.pow(i / N, 0.85)));
  // a cauda deita no chão em vez de atravessá-lo
  for (let i = 0; i <= N; i++) pts[i].y = Math.min(pts[i].y, -rad[i] * 0.9);
  const nr = normals(pts);
  tubePath(ctx, pts, rad, nr);
  ctx.fillStyle = vgrad(ctx, base.y - 30, 0, C.body, C.dark);
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 3;
  ctx.stroke();
  // faixas da barriga (lado de baixo)
  ctx.strokeStyle = C.belly;
  ctx.globalAlpha = 0.85;
  for (let i = 1; i < N - 1; i++) {
    const r = rad[i];
    ctx.lineWidth = Math.max(1.5, r * 0.35);
    ctx.beginPath();
    ctx.moveTo(pts[i].x - nr[i].x * r * 0.62, pts[i].y - nr[i].y * r * 0.62);
    ctx.lineTo(pts[i + 1].x - nr[i + 1].x * rad[i + 1] * 0.62, pts[i + 1].y - nr[i + 1].y * rad[i + 1] * 0.62);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // espinhos ao longo da cauda (lado de cima = normal "+")
  for (let i = 1; i < N - 2; i += 2) {
    const ang = Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x);
    const tx = pts[i].x + nr[i].x * rad[i] * 0.85;
    const ty = pts[i].y + nr[i].y * rad[i] * 0.85;
    spike(ctx, tx, ty, 14 * (1 - i / N) + 6, ang + 0.15, kind, C, t + i);
  }
  // ponta da cauda
  const tip = pts[N];
  const ta = Math.atan2(tip.y - pts[N - 1].y, tip.x - pts[N - 1].x);
  ctx.save();
  ctx.translate(tip.x, tip.y);
  ctx.rotate(ta);
  if (kind === 0) {
    // lâmina de fogo
    ctx.fillStyle = C.accent;
    ctx.beginPath();
    ctx.moveTo(-4, -12);
    ctx.quadraticCurveTo(26, -22, 36, 0);
    ctx.quadraticCurveTo(22, 14, -4, 10);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    const fl = 0.6 + 0.4 * Math.sin(t * 13);
    ctx.fillStyle = s.pal.glow + '99';
    ctx.beginPath();
    ctx.moveTo(4, -6);
    ctx.quadraticCurveTo(28 + fl * 8, -18 - fl * 6, 30, 0);
    ctx.quadraticCurveTo(18, 6, 4, 4);
    ctx.fill();
  } else if (kind === 1) {
    // cristais de gelo
    ctx.fillStyle = 'rgba(230,248,255,0.9)';
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 1.5;
    for (const [ax, l] of [[-0.5, 26], [0, 36], [0.55, 22]] as const) {
      ctx.save();
      ctx.rotate(ax);
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(l * 0.75, -6);
      ctx.lineTo(l, 0);
      ctx.lineTo(l * 0.75, 6);
      ctx.lineTo(0, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  } else {
    // lâmina crescente
    ctx.fillStyle = C.accent;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(14, -34, 40, -30);
    ctx.quadraticCurveTo(18, -16, 12, 2);
    ctx.quadraticCurveTo(22, 20, 36, 30);
    ctx.quadraticCurveTo(8, 26, 0, 0);
    ctx.fill();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
  return tip;
}

/* =========================================================================================
 * PESCOÇO EM S + CABEÇA
 * ======================================================================================= */
function drawNeckHead(ctx: CanvasRenderingContext2D, base: V, R: Rig, s: BossSpec, st: DrawState, C: Pal, kind: number, seed: number): V {
  const h = R.headP;
  const ha = R.headAng;
  // nuca (ponto onde o pescoço entra no crânio), no sistema da cabeça
  const nape = { x: h.x + Math.cos(-ha) * 14 - Math.sin(-ha) * 4, y: h.y + Math.sin(-ha) * 14 + Math.cos(-ha) * 4 };
  // controles do S: sai do peito para cima e chega por baixo/por trás da cabeça
  const curl = R.neckCurl;
  const c1 = { x: base.x - 10 + curl * 24, y: base.y - 52 - curl * 10 };
  const c2 = { x: nape.x + 46 + curl * 30, y: nape.y + 34 + curl * 26 };
  const N = 12;
  const pts: V[] = [];
  const rad: number[] = [];
  for (let i = 0; i <= N; i++) {
    const k = i / N;
    pts.push(cubic(base, c1, c2, nape, k));
    rad.push(lerp(36, 20, Math.pow(k, 0.8)));
  }
  const nr = normals(pts);
  tubePath(ctx, pts, rad, nr);
  ctx.fillStyle = vgrad(ctx, h.y - 20, base.y + 40, mixHex(C.body, C.hi, 0.25), C.dark);
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 3;
  ctx.stroke();
  // placas da garganta (lado da frente = normal "+")
  ctx.strokeStyle = C.belly;
  ctx.lineCap = 'butt';
  for (let i = 1; i < N; i++) {
    const r = rad[i];
    ctx.lineWidth = r * 0.5;
    ctx.beginPath();
    ctx.moveTo(pts[i].x + nr[i].x * r * 0.68, pts[i].y + nr[i].y * r * 0.68);
    ctx.lineTo(pts[i + 1].x + nr[i + 1].x * rad[i + 1] * 0.68, pts[i + 1].y + nr[i + 1].y * rad[i + 1] * 0.68);
    ctx.stroke();
  }
  ctx.strokeStyle = mixHex(C.belly, '#000000', 0.35);
  ctx.lineWidth = 1.6;
  for (let i = 1; i < N; i++) {
    const r = rad[i];
    ctx.beginPath();
    ctx.moveTo(pts[i].x + nr[i].x * r * 0.95, pts[i].y + nr[i].y * r * 0.95);
    ctx.lineTo(pts[i].x + nr[i].x * r * 0.4, pts[i].y + nr[i].y * r * 0.4);
    ctx.stroke();
  }
  // espinhos da nuca (lado de trás = normal "-")
  for (let i = 1; i < N - 1; i += 2) {
    const ang = Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x);
    const r = rad[i];
    spike(ctx, pts[i].x - nr[i].x * r * 0.85, pts[i].y - nr[i].y * r * 0.85, 16 - i * 0.5, ang + Math.PI + 0.2, kind, C, st.t + i);
  }
  // brilho subindo pela garganta (sopro carregando)
  if (R.throatK > 0.02) {
    const q = cubic(base, c1, c2, nape, R.throat);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const rr = 34 + R.throat * 10;
    const a = Math.round(clamp(R.throatK) * 230)
      .toString(16)
      .padStart(2, '0');
    ctx.fillStyle = rgrad(ctx, q.x, q.y, rr, s.pal.glow + a, s.pal.glow + '00');
    ctx.beginPath();
    ctx.arc(q.x, q.y, rr, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  return drawHead(ctx, h, ha, R, s, st, C, kind, seed);
}

function drawHead(ctx: CanvasRenderingContext2D, h: V, ang: number, R: Rig, s: BossSpec, st: DrawState, C: Pal, kind: number, seed: number): V {
  const P = s.pal;
  const t = st.t;
  const jaw = R.jaw;
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(-ang); // ang negativo = focinho para cima
  ctx.lineJoin = 'round';

  // eclipse atrás da cabeça (Nyx'Vorath)
  if (kind === 2) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pul = 0.55 + 0.2 * Math.sin(t * 1.8) + R.chest * 0.3;
    ctx.fillStyle = rgrad(ctx, 22, -26, 70, P.glow + '00', P.glow + '00');
    const g = ctx.createRadialGradient(22, -26, 34, 22, -26, 66);
    g.addColorStop(0, P.glow + Math.round(pul * 200).toString(16).padStart(2, '0'));
    g.addColorStop(1, P.glow + '00');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(22, -26, 66, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#050208';
    ctx.beginPath();
    ctx.arc(22, -26, 36, 0, TAU);
    ctx.fill();
  }

  // chifres (atrás do crânio)
  const horns = s.feat.horns ?? 2;
  if (kind === 2) {
    // coroa de chifres em leque, como um halo
    for (let i = 0; i < horns; i++) {
      const k = horns > 1 ? i / (horns - 1) : 0.5;
      const a = -2.0 + k * 1.9;
      const len = 46 + Math.sin(k * Math.PI) * 18;
      horn(ctx, 16 + Math.cos(a) * 8, -22 + Math.sin(a) * 6, a, len, 8, 0.35, C.accent, C.line, P.glow);
    }
  } else if (kind === 1) {
    horn(ctx, 14, -22, -0.35 - Math.PI * 0.12, 64, 9, -0.25, '#eaf8ff', C.line, '');
    horn(ctx, 24, -14, -0.15, 44, 7, -0.25, mixHex('#eaf8ff', C.dark, 0.3), C.line, '');
  } else {
    // dois chifres grandes curvados para trás + dois menores nas bochechas
    horn(ctx, 22, -12, 0.05, 40, 8, -0.4, mixHex(C.accent, C.dark, 0.25), C.line, '');
    horn(ctx, 12, -24, -0.45, 70, 11, 0.35, C.accent, C.line, '');
    if (horns > 2) {
      horn(ctx, 2, -26, -0.75, 48, 8, 0.3, C.accent, C.line, '');
      horn(ctx, 6, 6, 0.35, 30, 6, -0.2, mixHex(C.accent, C.dark, 0.3), C.line, '');
    }
  }

  // mandíbula de baixo (gira a partir da articulação)
  ctx.save();
  ctx.translate(8, 2);
  ctx.rotate(jaw * 0.62);
  // interior
  ctx.fillStyle = '#3a0a10';
  ctx.beginPath();
  ctx.moveTo(4, -2);
  ctx.lineTo(-64, 2);
  ctx.lineTo(-60, 8);
  ctx.lineTo(4, 10);
  ctx.closePath();
  ctx.fill();
  // língua
  if (jaw > 0.15) {
    ctx.fillStyle = '#b8344a';
    ctx.beginPath();
    ctx.ellipse(-24, 4, 26, 4 + jaw * 2, -0.05, 0, TAU);
    ctx.fill();
  }
  // osso da mandíbula
  ctx.fillStyle = vgrad(ctx, 0, 22, C.body, C.dark);
  ctx.beginPath();
  ctx.moveTo(8, -2);
  ctx.lineTo(-10, 6);
  ctx.lineTo(-62, 6);
  ctx.quadraticCurveTo(-70, 9, -64, 16);
  ctx.quadraticCurveTo(-30, 24, 4, 22);
  ctx.quadraticCurveTo(16, 14, 8, -2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2.6;
  ctx.stroke();
  ctx.fillStyle = C.belly;
  ctx.beginPath();
  ctx.moveTo(-60, 16);
  ctx.quadraticCurveTo(-30, 23, 2, 21);
  ctx.quadraticCurveTo(-28, 18, -60, 14);
  ctx.fill();
  // dentes de baixo
  ctx.fillStyle = '#f4ecd8';
  for (let i = 0; i < 6; i++) {
    const x = -58 + i * 9;
    ctx.beginPath();
    ctx.moveTo(x, 7);
    ctx.lineTo(x + 3, -3 + (i === 0 ? -3 : 0));
    ctx.lineTo(x + 6, 7);
    ctx.fill();
  }
  ctx.restore();

  // brilho dentro da boca aberta
  if (jaw > 0.12 && st.anim !== 'death') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const r = 18 + 30 * jaw;
    ctx.fillStyle = rgrad(ctx, -40, 8 + jaw * 10, r, P.glow + 'ee', P.glow + '00');
    ctx.beginPath();
    ctx.arc(-40, 8 + jaw * 10, r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // crânio e focinho
  const skull = () => {
    ctx.beginPath();
    ctx.moveTo(26, -10);
    ctx.quadraticCurveTo(24, -30, 4, -32); // nuca
    ctx.quadraticCurveTo(-14, -34, -24, -26); // testa
    ctx.quadraticCurveTo(-40, -20, -60, -16); // ponte do focinho
    ctx.quadraticCurveTo(-76, -14, -78, -4); // narina
    ctx.quadraticCurveTo(-78, 4, -70, 6);
    ctx.lineTo(-8, 8); // lábio
    ctx.quadraticCurveTo(14, 12, 26, -10);
    ctx.closePath();
  };
  skull();
  ctx.fillStyle = vgrad(ctx, -34, 10, mixHex(C.body, C.hi, 0.45), C.dark);
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2.8;
  ctx.stroke();
  // escamas do focinho
  ctx.strokeStyle = mixHex(C.dark, C.body, 0.4);
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = 0.6;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(-58 + i * 11, -10 + i * 0.5, 5, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // dentes de cima (presas)
  ctx.fillStyle = '#f4ecd8';
  for (let i = 0; i < 7; i++) {
    const x = -70 + i * 9;
    const l = i === 1 ? 14 : 8;
    ctx.beginPath();
    ctx.moveTo(x, 5);
    ctx.lineTo(x + 3, 5 + l);
    ctx.lineTo(x + 6, 5);
    ctx.fill();
  }
  // espinhos da bochecha (babado)
  ctx.fillStyle = kind === 1 ? 'rgba(230,248,255,0.9)' : C.accent;
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 3; i++) {
    const y = -4 + i * 8;
    ctx.beginPath();
    ctx.moveTo(14, y - 4);
    ctx.lineTo(40 + i * 3 + Math.sin(t * 2 + i) * 1.5, y + 4 + i * 3);
    ctx.lineTo(12, y + 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // coroa de gelo (Glaciareth)
  if (s.feat.crown) {
    for (let i = 0; i < 5; i++) {
      const a = -2.3 + i * 0.32;
      const l = 26 + (i % 2 ? 0 : 14) + (i === 2 ? 8 : 0);
      ctx.save();
      ctx.translate(-2 + Math.cos(a) * 12, -26 + Math.sin(a) * 4);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = 'rgba(235,250,255,0.92)';
      ctx.beginPath();
      ctx.moveTo(-5, 2);
      ctx.lineTo(-3, -l * 0.75);
      ctx.lineTo(0, -l);
      ctx.lineTo(3, -l * 0.75);
      ctx.lineTo(5, 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();
    }
    // joia
    eyeGlow(ctx, -6, -32, 3.5, P.glow, 1);
  }
  // narina com fumaça / brasas / vapor gelado
  ctx.fillStyle = '#000000aa';
  ctx.beginPath();
  ctx.ellipse(-70, -8, 4, 2.4, 0.3, 0, TAU);
  ctx.fill();
  const puffs = st.anim === 'death' ? 0 : 3;
  for (let i = 0; i < puffs; i++) {
    const ph = frac(t * 0.7 + i / 3 + seed);
    const c = kind === 1 ? '#e8fbff' : kind === 2 ? P.accent : ph < 0.35 ? P.glow : '#8a7a70';
    ctx.globalAlpha = (1 - ph) * (kind === 0 && ph < 0.35 ? 0.85 : 0.4);
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(-74 - ph * 18 + h01s(i, seed) * 6, -10 - ph * 24, 2 + ph * 6, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // arcada e olho
  const blink = frac((t + seed * 9) / 3.9) < 0.035 ? 0.1 : 1;
  const hurtSquint = 1 - st.hurt * 0.7;
  const open = Math.min(blink, hurtSquint) * R.eyeOpen;
  ctx.fillStyle = '#12060a';
  ctx.beginPath();
  ctx.ellipse(-20, -16, 11, 7, -0.15, 0, TAU);
  ctx.fill();
  eyeGlow(ctx, -20, -16, 7 + st.rage * 2, P.eye, open);
  if (kind === 2) {
    eyeGlow(ctx, -6, -22, 4, P.eye, open);
    eyeGlow(ctx, -34, -20, 3.5, P.eye, open);
  }
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-36, -24 - st.rage * 2);
  ctx.quadraticCurveTo(-20, -30, -2, -24);
  ctx.stroke();
  ctx.restore();

  // ponto da boca (origem do sopro) no mundo
  const mx = -74;
  const my = 6 + jaw * 12;
  return { x: h.x + mx * Math.cos(-ang) - my * Math.sin(-ang), y: h.y + mx * Math.sin(-ang) + my * Math.cos(-ang) };
}

function h01s(i: number, seed: number) {
  const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Chifre curvo afinado. a = direção, bendK = curvatura. */
function horn(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, len: number, w: number, bendK: number, col: string, line: string, tipGlow: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a + Math.PI);
  // aponta para +x depois da rotação extra (a + π olha para trás porque o dragão olha à esquerda)
  ctx.scale(-1, 1);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(0, -w);
  ctx.quadraticCurveTo(len * 0.55, -w * 0.8 + bendK * len * 0.5, len, bendK * len * 0.7);
  ctx.quadraticCurveTo(len * 0.5, w * 0.6 + bendK * len * 0.35, 0, w);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  ctx.stroke();
  // anéis
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.5;
  for (let i = 1; i < 4; i++) {
    const k = i / 4;
    ctx.beginPath();
    ctx.moveTo(len * k * 0.95, -w * (1 - k) + bendK * len * k * k * 0.6);
    ctx.lineTo(len * k * 0.9, w * (1 - k) * 0.8 + bendK * len * k * k * 0.5);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (tipGlow) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = tipGlow + 'cc';
    ctx.beginPath();
    ctx.arc(len, bendK * len * 0.7, 3.5, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** Rastro em arco da garra (smear) durante o golpe. */
function drawSmear(ctx: CanvasRenderingContext2D, J: V, sm: { a0: number; a1: number; r: number; k: number }, glow: string) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(-2000, -2000, 4000, 2000); // nada abaixo do chão
  ctx.clip();
  ctx.translate(J.x, J.y + 26);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = sm.k * 0.8;
  ctx.fillStyle = glow + 'aa';
  ctx.beginPath();
  const a0 = sm.a0;
  const a1 = sm.a1;
  ctx.arc(0, 0, sm.r + 22, a0, a1, a1 < a0);
  ctx.arc(0, 0, sm.r - 4, a1, a0 + (a1 - a0) * 0.1, a1 > a0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.globalAlpha = sm.k;
  ctx.beginPath();
  ctx.arc(0, 0, sm.r + 16, a0 + (a1 - a0) * 0.4, a1, a1 < a0);
  ctx.stroke();
  ctx.restore();
}
