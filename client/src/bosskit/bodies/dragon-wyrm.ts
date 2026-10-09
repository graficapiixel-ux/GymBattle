/**
 * WYRM DA TEMPESTADE (dragão kind 3, Zhar'kul): dragão oriental sem asas.
 *
 * Locomoção própria: o corpo longo "nada" no ar logo acima do chão. As corcovas formam
 * uma onda PRESA AO MUNDO (fase = posição no mundo / 150), então, quando ele avança,
 * as corcovas correm para trás ao longo do corpo, como uma serpente passando por um
 * caminho fixo. Quatro patas curtas (par da frente e par de trás) dão passos de verdade
 * e mantêm os pés plantados. Juba de "chamas elétricas" e bigodes vêm com atraso.
 * Origem no chão, olhando para a esquerda.
 */
import type { BossSpec } from '@gymbattle/shared';
import type { Anchors, DrawState, V } from '../types';
import { eyeGlow, hurtTint, mixHex, rgrad, vgrad, TAU, clamp, h01 } from '../util';
import { bump, capsule, cubic, frac, hashStr, ik, lerp, lerpV, normals, ss, stepFoot, tubePath } from './dragon-kit';

const STRIDE = 150;

export function drawWyrm(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState): Anchors {
  const P = s.pal;
  const seed = hashStr(s.id);
  const t = st.t;
  const body = hurtTint(ctx, st, P.body);
  const dark = hurtTint(ctx, st, P.dark);
  const line = mixHex(P.dark, '#000000', 0.45);
  const belly = hurtTint(ctx, st, mixHex(P.accent, '#fff4d0', 0.35));
  const far = hurtTint(ctx, st, mixHex(P.body, P.dark, 0.5));
  const mane = P.accent;

  const atk = st.anim === 'attack' || st.anim === 'enter';
  const pose = st.anim === 'enter' ? 'roar' : st.pose;
  const p = atk ? st.p : 0;
  const die = st.anim === 'death' ? st.p : 0;
  const alive = 1 - ss(0.2, 0.5, die);
  const hk = st.hurt;
  const mv = st.move * alive;
  const m = ss(0.02, 0.3, mv);
  const back = st.vx > 1 ? -1 : 1;
  const g = st.gait;

  // ---------------- tempos do ataque
  const ant = atk ? ss(0, 0.4, p) * (1 - ss(0.42, 0.52, p)) : 0;
  const hit = atk ? ss(0.42, 0.54, p) * (1 - ss(0.62, 1, p)) : 0;
  const act = atk ? ss(0, 0.12, p) * (1 - ss(0.85, 1, p)) : 0;
  const imp = atk ? bump(p, 0.565, 0.045) : 0;
  const isRoar = atk && (pose === 'roar' || pose === 'cast');
  const isCharge = atk && (pose === 'charge' || pose === 'swipe' || pose === 'slam');
  const isBeam = atk && (pose === 'breath' || pose === 'shoot');

  // ---------------- parâmetros do corpo
  let kx = 0.8 - mv * 0.03; // compressão horizontal (encolhe ao armar o bote)
  let x0 = -70; // peito
  let amp = 26 + mv * 10 + st.rage * 4; // altura das corcovas
  let chestY = -168 - Math.sin(t * 1.3 + seed) * 4;
  let hx = -70 + Math.sin(t * 0.7 + seed * 3) * 5 - mv * 8;
  let hy = -84 + Math.sin(t * 1.3 + seed - 0.6) * 4 + mv * 10;
  let hAng = Math.sin(t * 0.8) * 0.05 + mv * 0.08;
  let jaw = 0.05 + st.rage * 0.1 + 0.05 * Math.max(0, Math.sin(t * 1.1));
  let flare = 0.2 + st.rage * 0.3 + mv * 0.2; // juba eriçada
  let stream = mv * 0.5; // juba e bigodes jogados para trás
  let spark = st.rage * 0.4; // raios pelo corpo
  let mouthGlow = 0;

  if (isRoar) {
    const roarK = ss(0.42, 0.5, p) * (1 - ss(0.8, 0.95, p));
    const sh = roarK * Math.sin(t * 55) * 2.5;
    chestY += ant * 26 - hit * 42;
    amp += ant * 14 + hit * 10;
    kx -= ant * 0.06;
    x0 += ant * 18;
    hx += ant * 26 - hit * 10 + sh;
    hy += ant * 34 - hit * 26 + sh;
    hAng += ant * 0.25 - hit * 0.6;
    jaw = Math.max(jaw, roarK);
    flare += act * 0.6 + roarK * 0.8;
    spark += act * 0.6 + roarK;
    mouthGlow = roarK * 0.6;
  } else if (isCharge) {
    // arma o bote (encolhe como mola) e dispara esticado e rente ao chão
    const coil = ss(0.04, 0.4, p) * (1 - ss(0.42, 0.5, p));
    const shoot = ss(0.42, 0.52, p) * (1 - ss(0.66, 1, p));
    kx += -coil * 0.17 + shoot * 0.14;
    x0 += coil * 46 - shoot * 34;
    amp += coil * 22 - shoot * 18;
    chestY += coil * 18 + shoot * 40;
    hx += coil * 34 - shoot * 58;
    hy += coil * 30 + shoot * 50 + imp * 6;
    hAng += coil * 0.3 + shoot * 0.05;
    jaw = Math.max(jaw, shoot * 0.8 + coil * 0.15);
    flare += coil * 0.5 + shoot * 0.3;
    stream += shoot * 1.2;
    spark += coil * 0.6 + shoot * 0.9;
    mouthGlow = shoot * 0.4;
  } else if (isBeam) {
    const sus = ss(0.5, 0.56, p) * (1 - ss(0.84, 0.97, p));
    chestY += -ant * 30 + hit * 10;
    amp += -act * 8;
    x0 += ant * 14 - hit * 10 + sus * 8;
    hx += ant * 30 - hit * 36 + sus * (6 + Math.sin(t * 47) * 2);
    hy += -ant * 36 + hit * 30 + sus * Math.sin(t * 41) * 2;
    hAng += -ant * 0.4 + hit * 0.12;
    jaw = Math.max(jaw, ss(0.43, 0.52, p) * (1 - ss(0.84, 0.97, p)) + ant * 0.15);
    flare += act * 0.5;
    stream += sus * 0.6;
    spark += act * 0.5;
    mouthGlow = ss(0.1, 0.42, p) * (1 - ss(0.85, 1, p));
  }
  if (hk > 0.01) {
    x0 += hk * 18;
    hx += hk * 34 + Math.sin(t * 70) * hk * 3;
    hy -= hk * 22;
    hAng -= hk * 0.4;
    jaw = Math.max(jaw, hk * 0.6);
    amp += hk * 12;
    flare += hk * 0.6;
    spark += hk * 0.5;
  }
  // morte: se contorce, depois desaba no chão
  let writhe = 0;
  let fall = 0;
  let eyeOpen = 1;
  if (die > 0) {
    writhe = ss(0, 0.15, die) * (1 - ss(0.45, 0.7, die));
    fall = ss(0.3, 0.7, die);
    chestY += -writhe * 40;
    hy += -writhe * 40;
    hAng -= writhe * 0.6;
    jaw = Math.max(jaw, writhe * 0.9);
    flare *= 1 - fall;
    spark = writhe * 0.8;
    eyeOpen = 1 - ss(0.6, 0.85, die);
  }

  // ---------------- linha central do corpo (do peito à ponta da cauda)
  const L = 430;
  const N = 26;
  const pts: V[] = [];
  const bx = (sv: number) => x0 + sv * kx;
  const wave = (sv: number, lag = 0) => {
    const ph = TAU * (bx(sv) / STRIDE - (g - lag) * back) + t * 0.6 * (1 - m * 0.8) + writhe * t * 9;
    return Math.sin(ph);
  };
  const env = (sv: number) => {
    const between = 0.3 + 0.7 * Math.sin(Math.PI * clamp((sv - 70) / 200));
    return sv < 270 ? (sv < 70 ? 0.3 * ss(0, 70, sv) : between) : 0.3 + 1.0 * ss(270, 430, sv);
  };
  const baseY = (sv: number) => {
    const raised = lerp(chestY, -86, ss(0, 95, sv));
    const tail = ss(300, 430, sv);
    return raised + tail * 30;
  };
  const rad = (sv: number) => (sv < 50 ? lerp(34, 40, sv / 50) : lerp(40, 5, Math.pow(clamp((sv - 50) / (L - 50)), 1.25)));
  for (let i = 0; i <= N; i++) {
    const sv = (i / N) * L;
    let y = baseY(sv) - amp * env(sv) * wave(sv);
    // ponta da cauda enrola
    if (sv > 380) y -= (sv - 380) * 0.35 * (1 - fall);
    const pt = { x: bx(sv), y };
    pts.push(pt);
  }
  // queda na morte: deita no chão com um quique
  const sRad = pts.map((_, i) => rad((i / N) * L));
  if (fall > 0) {
    const bq = Math.sin(Math.PI * clamp((die - 0.66) / 0.12)) * 10;
    for (let i = 0; i <= N; i++) {
      const k = fall * (1 - (i / N) * 0.15);
      pts[i].y = lerp(pts[i].y, -sRad[i] * 0.85 - bq * (1 - i / N), k);
    }
  }
  for (let i = 0; i <= N; i++) pts[i].y = Math.min(pts[i].y, -sRad[i] * 0.85);

  // ---------------- cabeça e pescoço
  const chest = pts[0];
  let head: V = { x: chest.x + hx, y: chest.y + hy };
  if (die > 0) {
    const nf = ss(0.55, 0.8, die);
    const bq = Math.sin(Math.PI * clamp((die - 0.8) / 0.12)) * 14;
    head = lerpV(head, { x: chest.x - 110, y: -26 - bq }, nf);
    hAng = lerp(hAng, 0.1, nf);
    jaw = lerp(jaw, 0.3, nf);
  }
  const ca = Math.cos(-hAng);
  const sa = Math.sin(-hAng);
  const hp = (x: number, y: number): V => ({ x: head.x + x * ca - y * sa, y: head.y + x * sa + y * ca });
  const nape = hp(16, 2);
  const c1 = { x: chest.x - 46, y: chest.y - 6 };
  const c2 = { x: nape.x + 52, y: nape.y + 16 };
  const neck: V[] = [];
  const NK = 7;
  for (let i = 0; i < NK; i++) neck.push(cubic(nape, c2, c1, chest, i / NK));
  const all = neck.concat(pts);
  const allR = neck.map((_, i) => lerp(23, 34, i / NK)).concat(sRad);
  const nr = normals(all);

  // ---------------- patas (par da frente em s≈80, par de trás em s≈275)
  const D = lerp(0.7, 0.58, mv);
  const A = STRIDE * D * m;
  const lift = (lh: number) => lh * (0.55 + 0.45 * mv) * m;
  const legAt = (sv: number) => {
    const i = Math.round((sv / L) * N);
    return { p: pts[i], r: sRad[i], home: -70 + sv * 0.8 };
  };
  const legs = [
    { sv: 82, ph: 0.25, far: true },
    { sv: 272, ph: 0.75, far: true },
    { sv: 82, ph: 0.75, far: false },
    { sv: 272, ph: 0.25, far: false },
  ].map((l) => {
    const a = legAt(l.sv);
    const f = stepFoot(frac(g + l.ph), D, A, lift(22));
    const feet = { x: a.home - 10 - f.u * back + (l.far ? 12 : 0), y: (l.far ? -4 : 0) - f.lift };
    const root = { x: a.p.x + (l.far ? 8 : 0), y: a.p.y + a.r * 0.35 };
    // na morte as patas se abrem para os lados
    if (fall > 0) feet.x += (l.sv < 150 ? -30 : 30) * fall;
    return { root, foot: feet, sw: Math.max(0, f.sw), far: l.far };
  });
  const legCol = (isFar: boolean) => (isFar ? far : mixHex(body, dark, 0.15));

  // juba de trás (tufos atrás do corpo, aparecem pela borda de cima)
  const tufts = (s.feat.spikes ?? 10) + 8;
  const drawMane = (front: boolean) => {
    ctx.save();
    for (let j = 0; j < tufts; j++) {
      const k = j / (tufts - 1);
      const idx = Math.min(all.length - 2, Math.round(1 + k * (all.length - 6)));
      const pt = all[idx];
      const n = nr[idx];
      const r = allR[idx];
      const len = (22 + 20 * Math.sin(Math.PI * Math.min(1, k * 1.3))) * (0.8 + flare * 0.5) * (front ? 0.7 : 1) * (1 - fall * 0.4);
      const tang = Math.atan2(all[idx + 1].y - pt.y, all[idx + 1].x - pt.x);
      // aponta para "cima" (normal) mas deita para trás com o vento e tremula
      const flick = Math.sin(t * 7 + j * 1.7) * 0.18 + Math.sin(t * 13 + j) * 0.06;
      const ang = Math.atan2(n.y, n.x) * (1 - 0.35 - stream * 0.25) + tang * (0.35 + stream * 0.25) + flick;
      const bx0 = pt.x + n.x * r * 0.7;
      const by0 = pt.y + n.y * r * 0.7;
      const tip = { x: bx0 + Math.cos(ang) * len, y: by0 + Math.sin(ang) * len };
      ctx.fillStyle = front ? mixHex(mane, '#ffffff', 0.3) : mane;
      ctx.globalAlpha = (front ? 0.85 : 1) * (1 - die * 0.5);
      ctx.beginPath();
      ctx.moveTo(bx0 - Math.cos(tang) * 7, by0 - Math.sin(tang) * 7);
      ctx.quadraticCurveTo(bx0 + Math.cos(ang) * len * 0.6 - Math.cos(tang) * 6, by0 + Math.sin(ang) * len * 0.6 - Math.sin(tang) * 6, tip.x, tip.y);
      ctx.quadraticCurveTo(bx0 + Math.cos(ang) * len * 0.4 + Math.cos(tang) * 4, by0 + Math.sin(ang) * len * 0.4 + Math.sin(tang) * 4, bx0 + Math.cos(tang) * 8, by0 + Math.sin(tang) * 8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  };

  // ---------------- desenho
  ctx.lineJoin = 'round';
  for (const l of legs) if (l.far) wyrmLeg(ctx, l.root, l.foot, l.sw, legCol(true), line, mane);
  drawMane(false);
  // corpo
  tubePath(ctx, all, allR, nr);
  ctx.fillStyle = vgrad(ctx, -200, 0, mixHex(body, '#ffffff', 0.15), dark);
  ctx.fill();
  ctx.strokeStyle = line;
  ctx.lineWidth = 3;
  ctx.stroke();
  // barriga (faixa clara do lado de baixo, em placas)
  ctx.lineCap = 'butt';
  for (let i = 1; i < all.length - 2; i++) {
    const r = allR[i];
    const a = { x: all[i].x - nr[i].x * r * 0.6, y: all[i].y - nr[i].y * r * 0.6 };
    const b = { x: all[i + 1].x - nr[i + 1].x * allR[i + 1] * 0.6, y: all[i + 1].y - nr[i + 1].y * allR[i + 1] * 0.6 };
    ctx.strokeStyle = belly;
    ctx.lineWidth = Math.max(2, r * 0.62);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.strokeStyle = mixHex(belly, '#000000', 0.35);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(all[i].x - nr[i].x * r * 0.95, all[i].y - nr[i].y * r * 0.95);
    ctx.lineTo(all[i].x - nr[i].x * r * 0.3, all[i].y - nr[i].y * r * 0.3);
    ctx.stroke();
  }
  // escamas (arcos ao longo do dorso)
  ctx.strokeStyle = mixHex(dark, body, 0.5);
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.6;
  for (let i = 2; i < all.length - 3; i++) {
    const r = allR[i];
    for (const off of [0.15, 0.5]) {
      const c = { x: all[i].x + nr[i].x * r * off, y: all[i].y + nr[i].y * r * off };
      const tg = Math.atan2(all[i + 1].y - all[i].y, all[i + 1].x - all[i].x);
      ctx.beginPath();
      ctx.arc(c.x, c.y, r * 0.24, tg - 1.2, tg + 1.2, false);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  // brilho de borda no dorso
  ctx.strokeStyle = mixHex(body, '#ffffff', 0.45);
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  for (let i = 1; i < all.length - 4; i++) {
    const r = allR[i] * 0.82;
    const x = all[i].x + nr[i].x * r;
    const y = all[i].y + nr[i].y * r;
    if (i === 1) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  // tufo na ponta da cauda
  const tipI = all.length - 1;
  const tipA = Math.atan2(all[tipI].y - all[tipI - 1].y, all[tipI].x - all[tipI - 1].x);
  ctx.save();
  ctx.translate(all[tipI].x, all[tipI].y);
  ctx.rotate(tipA);
  ctx.fillStyle = mane;
  for (let j = 0; j < 4; j++) {
    const a = -0.6 + j * 0.4 + Math.sin(t * 6 + j) * 0.15;
    const l = 26 + j * 3 + flare * 8;
    ctx.beginPath();
    ctx.moveTo(-6, -4);
    ctx.quadraticCurveTo(Math.cos(a) * l * 0.5, Math.sin(a) * l * 0.5 - 6, Math.cos(a) * l, Math.sin(a) * l);
    ctx.quadraticCurveTo(Math.cos(a) * l * 0.4, Math.sin(a) * l * 0.4 + 6, -6, 4);
    ctx.fill();
  }
  ctx.restore();
  drawMane(true);
  for (const l of legs) if (!l.far) wyrmLeg(ctx, l.root, l.foot, l.sw, legCol(false), line, mane);

  // raios correndo pelo corpo
  const arcs = Math.round(spark * 4 + (frac(t * 0.77 + seed) < 0.12 ? 1 : 0));
  if (arcs > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = P.glow;
    ctx.lineCap = 'round';
    const tick = Math.floor(t * 14);
    for (let a = 0; a < arcs; a++) {
      const i0 = 2 + Math.floor(h01(tick, a) * (all.length - 8));
      const i1 = Math.min(all.length - 2, i0 + 2 + Math.floor(h01(tick, a + 7) * 4));
      ctx.lineWidth = 2.2;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      for (let k = 0; k <= 5; k++) {
        const q = lerpV(all[i0], all[i1], k / 5);
        const side = (h01(tick + k, a + 3) - 0.5) * 2;
        const r = allR[i0] * (1.05 + h01(tick + k, a) * 0.4);
        const x = q.x + nr[i0].x * r * side;
        const y = q.y + nr[i0].y * r * side;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.9;
      ctx.stroke();
      ctx.strokeStyle = P.glow;
    }
    ctx.restore();
  }

  // ---------------- cabeça
  const mouth = wyrmHead(ctx, head, hAng, jaw, s, st, { body, dark, line, belly, mane }, stream, flare, eyeOpen, mouthGlow * (1 - die), seed);

  const hand = isCharge ? mouth : { x: legs[2].foot.x - 18, y: legs[2].foot.y - 6 };
  const coreP = pts[Math.round(N * 0.35)];
  return {
    mouth,
    hand,
    core: { x: coreP.x, y: coreP.y },
    top: Math.min(head.y - 70, chestY - 40),
    halfW: 140,
  };
}

/** Pata curta de dragão oriental: ombro → cotovelo → pulso → mão de 3 garras. */
function wyrmLeg(ctx: CanvasRenderingContext2D, root: V, F: V, sw: number, col: string, line: string, mane: string) {
  const lift = Math.sin(Math.PI * Math.min(1, sw));
  const wrist = { x: F.x + 6 - lift * 4, y: F.y - 14 - lift * 3 };
  const elbow = ik(root, wrist, 50, 46, -1);
  ctx.save();
  ctx.fillStyle = col;
  ctx.strokeStyle = line;
  ctx.lineWidth = 2.6;
  capsule(ctx, root, elbow, 18, 11);
  ctx.fill();
  ctx.stroke();
  // tufo de pelo no cotovelo
  ctx.fillStyle = mane;
  ctx.beginPath();
  ctx.moveTo(elbow.x - 4, elbow.y - 6);
  ctx.quadraticCurveTo(elbow.x + 16, elbow.y - 2, elbow.x + 22, elbow.y + 10);
  ctx.quadraticCurveTo(elbow.x + 8, elbow.y + 6, elbow.x, elbow.y + 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = col;
  capsule(ctx, elbow, wrist, 10, 7);
  ctx.fill();
  ctx.stroke();
  capsule(ctx, wrist, F, 7, 6);
  ctx.fill();
  ctx.stroke();
  const hang = lift * 0.7;
  for (let i = 0; i < 3; i++) {
    const a = Math.PI + 0.2 - i * 0.18 - hang;
    const l = 15 - i * 2;
    const tip = { x: F.x + Math.cos(a) * l, y: F.y - Math.sin(a) * l };
    ctx.fillStyle = col;
    capsule(ctx, F, tip, 5, 3.5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f4ecd8';
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y - 3);
    ctx.lineTo(tip.x - 9 * Math.cos(hang), tip.y + 3 + hang * 6);
    ctx.lineTo(tip.x + 1, tip.y + 3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Cabeça de dragão oriental: focinho comprido, chifres em galhada, bigodes e barba. */
function wyrmHead(
  ctx: CanvasRenderingContext2D,
  h: V,
  ang: number,
  jaw: number,
  s: BossSpec,
  st: DrawState,
  C: { body: string; dark: string; line: string; belly: string; mane: string },
  stream: number,
  flare: number,
  eyeOpen: number,
  mouthGlow: number,
  seed: number,
): V {
  const P = s.pal;
  const t = st.t;
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(-ang); // ang negativo = focinho para cima
  ctx.lineJoin = 'round';
  // juba atrás da cabeça
  ctx.fillStyle = C.mane;
  for (let j = 0; j < 6; j++) {
    const a = -1.1 + j * 0.32 + Math.sin(t * 6 + j * 1.3) * 0.12 + stream * 0.25;
    const l = (34 + (j % 2) * 12) * (0.85 + flare * 0.4);
    ctx.beginPath();
    ctx.moveTo(12, -16 + j * 5);
    ctx.quadraticCurveTo(12 + Math.cos(a) * l * 0.6, -16 + j * 5 + Math.sin(a) * l * 0.6 - 8, 12 + Math.cos(a) * l, -16 + j * 5 + Math.sin(a) * l);
    ctx.quadraticCurveTo(12 + Math.cos(a) * l * 0.4, -12 + j * 5 + Math.sin(a) * l * 0.4 + 6, 12, -8 + j * 5);
    ctx.closePath();
    ctx.fill();
  }
  // galhada (chifres ramificados)
  const antler = (x: number, y: number, sc: number, col: string) => {
    ctx.strokeStyle = C.line;
    ctx.lineCap = 'round';
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 18 * sc, y - 20 * sc, x + 48 * sc, y - 34 * sc);
      ctx.moveTo(x + 16 * sc, y - 16 * sc);
      ctx.quadraticCurveTo(x + 12 * sc, y - 34 * sc, x + 20 * sc, y - 46 * sc);
      ctx.moveTo(x + 32 * sc, y - 28 * sc);
      ctx.quadraticCurveTo(x + 34 * sc, y - 44 * sc, x + 44 * sc, y - 52 * sc);
    };
    ctx.lineWidth = 9 * sc;
    path();
    ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = 5.5 * sc;
    path();
    ctx.stroke();
  };
  antler(6, -18, 0.85, mixHex(C.mane, C.dark, 0.35));
  antler(0, -22, 1, C.mane);

  // mandíbula
  ctx.save();
  ctx.translate(6, 4);
  ctx.rotate(jaw * 0.6);
  ctx.fillStyle = '#2a0a18';
  ctx.beginPath();
  ctx.moveTo(4, -2);
  ctx.lineTo(-72, 0);
  ctx.lineTo(-68, 8);
  ctx.lineTo(4, 10);
  ctx.fill();
  ctx.fillStyle = vgrad(ctx, 0, 22, C.body, C.dark);
  ctx.beginPath();
  ctx.moveTo(8, -2);
  ctx.lineTo(-70, 4);
  ctx.quadraticCurveTo(-78, 8, -72, 14);
  ctx.quadraticCurveTo(-34, 22, 4, 20);
  ctx.quadraticCurveTo(16, 12, 8, -2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = '#f4ecd8';
  for (let i = 0; i < 6; i++) {
    const x = -66 + i * 10;
    ctx.beginPath();
    ctx.moveTo(x, 5);
    ctx.lineTo(x + 3, -3);
    ctx.lineTo(x + 6, 5);
    ctx.fill();
  }
  // barba
  ctx.fillStyle = C.mane;
  for (let j = 0; j < 4; j++) {
    const bx = -40 + j * 10;
    const sw = Math.sin(t * 4 + j) * 4 + stream * 10;
    ctx.beginPath();
    ctx.moveTo(bx - 5, 16);
    ctx.quadraticCurveTo(bx + sw * 0.5, 30, bx + 6 + sw, 40 + j * 2);
    ctx.quadraticCurveTo(bx + 4, 28, bx + 5, 16);
    ctx.fill();
  }
  ctx.restore();
  // brilho na boca (carga do raio)
  if ((jaw > 0.1 && st.anim !== 'death') || mouthGlow > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const r = 16 + 30 * Math.max(jaw, mouthGlow);
    ctx.fillStyle = rgrad(ctx, -46, 10, r, P.glow + 'ee', P.glow + '00');
    ctx.beginPath();
    ctx.arc(-46, 10, r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  // crânio: testa alta, focinho longo com nariz bulboso
  ctx.beginPath();
  ctx.moveTo(24, -6);
  ctx.quadraticCurveTo(26, -28, 4, -30);
  ctx.quadraticCurveTo(-16, -34, -28, -22);
  ctx.quadraticCurveTo(-46, -16, -62, -18);
  ctx.quadraticCurveTo(-82, -22, -86, -8); // nariz
  ctx.quadraticCurveTo(-88, 4, -76, 6);
  ctx.lineTo(-6, 8);
  ctx.quadraticCurveTo(14, 12, 24, -6);
  ctx.closePath();
  ctx.fillStyle = vgrad(ctx, -34, 10, mixHex(C.body, '#ffffff', 0.25), C.dark);
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2.6;
  ctx.stroke();
  // lábio claro
  ctx.strokeStyle = C.belly;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-80, 3);
  ctx.lineTo(-10, 5);
  ctx.stroke();
  // dentes / presas
  ctx.fillStyle = '#f4ecd8';
  for (let i = 0; i < 7; i++) {
    const x = -76 + i * 10;
    const l = i === 1 ? 13 : 7;
    ctx.beginPath();
    ctx.moveTo(x, 6);
    ctx.lineTo(x + 3, 6 + l);
    ctx.lineTo(x + 6, 6);
    ctx.fill();
  }
  // narina
  ctx.fillStyle = '#000000aa';
  ctx.beginPath();
  ctx.ellipse(-78, -10, 5, 3, 0.4, 0, TAU);
  ctx.fill();
  // olho e sobrancelha de chama
  const blink = frac((t + seed * 9) / 4.1) < 0.035 ? 0.1 : 1;
  const open = Math.min(blink, 1 - st.hurt * 0.7) * eyeOpen;
  ctx.fillStyle = '#05080f';
  ctx.beginPath();
  ctx.ellipse(-22, -16, 11, 7, -0.2, 0, TAU);
  ctx.fill();
  eyeGlow(ctx, -22, -16, 7 + st.rage * 2, P.glow, open);
  ctx.fillStyle = C.mane;
  ctx.beginPath();
  ctx.moveTo(-36, -22);
  ctx.quadraticCurveTo(-20, -34, 2, -30 - Math.sin(t * 5) * 2);
  ctx.quadraticCurveTo(-16, -26, -32, -18);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // bigodes longos (fora da rotação: deitam para trás com o vento e com atraso)
  const cA = Math.cos(-ang);
  const sA = Math.sin(-ang);
  const W = (x: number, y: number): V => ({ x: h.x + x * cA - y * sA, y: h.y + x * sA + y * cA });
  ctx.strokeStyle = C.mane;
  ctx.lineCap = 'round';
  for (const [i, oy] of [[0, -6], [1, 2]] as const) {
    const b0 = W(-80, oy);
    const sway = Math.sin(t * 2.2 + i * 1.7) * 14;
    const sway2 = Math.sin(t * 2.2 + i * 1.7 - 1.1) * 20;
    const drift = 30 + stream * 70;
    const c1 = { x: b0.x - 44 + drift * 0.2, y: b0.y + 16 + sway };
    const e = { x: b0.x - 10 + drift * 1.6, y: b0.y + 70 + sway2 - stream * 40 };
    ctx.lineWidth = 3.4 - i;
    ctx.beginPath();
    ctx.moveTo(b0.x, b0.y);
    ctx.quadraticCurveTo(c1.x, c1.y, e.x, e.y);
    ctx.stroke();
  }
  const mx = -82;
  const my = 6 + jaw * 12;
  return W(mx, my);
}
