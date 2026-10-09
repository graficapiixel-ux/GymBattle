/**
 * DEUSES CAÍDOS (feat.kind): 0 = serafim de luz com 3 pares de asas (Seraphiel),
 * 1 = deusa azul de oito braços (Kaal-Mara), 2 = deus-chacal com cajado (Anubhar),
 * 3 = rei caído com chifres, capa rasgada, asas de morcego e coroa quebrada (Oberon).
 * Origem no chão, olhando para a esquerda; ~400 de largura x ~350 de altura em escala 1.
 *
 * São VOADORES: não andam, flutuam. A locomoção vem de st.vx (inclinação e frenagem),
 * st.move (rastros, ondulação, batidas mais fortes) e st.vy (atraso vertical dos tecidos).
 * As asas batem com a fase `m.ph` (tempo + gait), cada par com atraso; tecidos, cabelos,
 * fitas e capas são cadeias com atraso progressivo (overlapping action).
 */
import type { BossSpec } from '@gymbattle/shared';
import type { Anchors, DrawState, V } from '../types';
import {
  attacking, breathe, dying, eyeGlow, hurtTint, mixHex, poseK, rgrad, strike, vgrad, windup,
  TAU, clamp, hexA, orb, godRays, magicCircle, sm, easeIn, smoothPath, crescent, h01,
} from '../util';

/** Curvas do ataque: antecipação (0→0,4), golpe (0,42→0,54), impacto (≈0,56), follow-through e volta. */
function poses(st: DrawState) {
  const on = st.anim === 'attack' ? 1 : 0;
  const p = on ? st.p : 0;
  return {
    wu: windup(st), sk: strike(st), atk: attacking(st), b: breathe(st, 1.4), die: dying(st),
    shoot: poseK(st, 'shoot', 'breath'), slam: poseK(st, 'slam'), cast: poseK(st, 'cast'),
    swipe: poseK(st, 'swipe'), charge: poseK(st, 'charge'), roar: poseK(st, 'roar'),
    p,
    /** carga (sobe até 0,4 e solta rápido) */
    ant: on * sm(0.02, 0.4, p) * (1 - sm(0.42, 0.5, p)),
    /** golpe: estala em 0,42–0,54, segura e volta suave até 1 */
    hit: on * sm(0.42, 0.54, p) * (1 - sm(0.64, 1, p)),
    /** pico do impacto (tranco do corpo inteiro) */
    imp: on * Math.exp(-(((p - 0.56) / 0.045) ** 2)),
    /** passa do ponto depois do impacto (follow-through) */
    fol: on * sm(0.54, 0.64, p) * (1 - sm(0.64, 0.95, p)),
    /** tremor no fim da carga */
    hold: on * sm(0.25, 0.38, p) * (1 - sm(0.42, 0.46, p)),
  };
}
type K = ReturnType<typeof poses>;
const NUL = null as unknown as CanvasRenderingContext2D;

function colors(s: BossSpec, st: DrawState) {
  const P = s.pal;
  const t = (h: string) => hurtTint(NUL, st, h);
  return {
    body: t(P.body), dark: t(P.dark), accent: t(P.accent), glow: P.glow, eye: P.eye,
    light: t(mixHex(P.body, '#ffffff', 0.3)), mid: t(mixHex(P.body, P.dark, 0.5)),
    gold: t('#ffcc33'), goldD: t('#a07010'), lit: 1 - dying(st), tint: t,
  };
}
type C = ReturnType<typeof colors>;

function idSeed(id: string) {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 9973;
  return h / 9973;
}

/** Estado de voo: batida das asas, inclinação, rastro dos tecidos, recuo de dano, piscar. */
function motion(s: BossSpec, st: DrawState) {
  const seed = idSeed(s.id);
  // fwd > 0: avançando (para a esquerda) — os tecidos vão para trás (+x)
  const fwd = clamp(-st.vx / 150, -1, 1);
  const sp = clamp(Math.max(st.move, Math.abs(fwd)));
  // rise > 0: subindo — as pontas soltas ficam para baixo
  const rise = clamp(-st.vy / 160, -1, 1);
  const ph = st.t * (1.7 + st.rage * 0.6) + st.gait * TAU + seed * TAU;
  const amp = 0.08 + sp * 0.22 + st.rage * 0.05;
  const hover = Math.sin(st.t * 1.25 + seed * 5) * 7 + Math.sin(st.t * 0.53 + seed * 9) * 3;
  // o corpo sobe quando as asas descem (batida de força)
  const beat = Math.sin(ph - 0.7) * (2.5 + sp * 6);
  const bl = (st.t / 3.3 + seed) % 1;
  const blink = bl < 0.05 ? Math.abs(bl / 0.025 - 1) : 1;
  const hj = st.hurt > 0.02 ? Math.sin(st.t * 70) * st.hurt * 3 : 0;
  return {
    seed, fwd, sp, rise, ph, amp, blink, t: st.t,
    flap: Math.sin(ph), dflap: Math.cos(ph),
    y: hover + beat - st.hurt * 6,
    /** inclinação: avança → tomba para a frente; recua → freia jogando o peso para trás */
    tilt: -fwd * 0.13 + st.hurt * 0.16,
    hx: st.hurt * 18 + hj,
    /** rastro de tecidos: um pouco para trás mesmo parado (brisa divina) */
    trail: 0.12 + fwd * (0.55 + 0.45 * sp),
  };
}
type M = ReturnType<typeof motion>;

export function drawDeity(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState): Anchors {
  const kind = s.feat.kind ?? 0;
  const k = poses(st);
  const c = colors(s, st);
  const m = motion(s, st);
  const lunge = k.charge * (k.ant * 30 - k.hit * 230 - k.fol * 20) + m.hx;
  ctx.save();
  ctx.translate(lunge, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const a = kind === 1 ? kaalmara(ctx, s, st, k, c, m) : kind === 2 ? anubhar(ctx, s, st, k, c, m) : kind === 3 ? oberon(ctx, s, st, k, c, m) : seraphiel(ctx, s, st, k, c, m);
  ctx.restore();
  const mv = (v: V): V => ({ x: v.x + lunge, y: v.y });
  return { mouth: mv(a.mouth), hand: mv(a.hand), core: mv(a.core), top: a.top, halfW: a.halfW };
}

// ------------------------------------------------------------------ peças comuns

const rot = (p: V, c: V, a: number): V => {
  const cs = Math.cos(a), sn = Math.sin(a);
  return { x: c.x + (p.x - c.x) * cs - (p.y - c.y) * sn, y: c.y + (p.x - c.x) * sn + (p.y - c.y) * cs };
};
const pol = (o: V, a: number, l: number): V => ({ x: o.x + Math.cos(a) * l, y: o.y + Math.sin(a) * l });

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

/** Segmento afinando com pontas redondas (osso de braço/perna). */
function seg(ctx: CanvasRenderingContext2D, a: V, b: V, wa: number, wb: number) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.beginPath();
  ctx.arc(a.x, a.y, wa / 2, ang + Math.PI / 2, ang - Math.PI / 2);
  ctx.arc(b.x, b.y, wb / 2, ang - Math.PI / 2, ang + Math.PI / 2);
  ctx.closePath();
  ctx.fill();
}

/** Braço de 2 segmentos com volume (base + luz no lado de cima); devolve cotovelo e mão. */
function limb(ctx: CanvasRenderingContext2D, S: V, a1: number, a2: number, l1: number, l2: number, w: number, col: string, hi?: string) {
  const E = pol(S, a1, l1);
  const H = pol(E, a2, l2);
  ctx.fillStyle = col;
  seg(ctx, S, E, w, w * 0.78);
  seg(ctx, E, H, w * 0.8, w * 0.58);
  if (hi) {
    ctx.strokeStyle = hi;
    ctx.lineWidth = w * 0.22;
    const o = (p: V, a: number, d: number): V => ({ x: p.x + Math.cos(a - Math.PI / 2) * d, y: p.y + Math.sin(a - Math.PI / 2) * d });
    ctx.beginPath();
    const s1 = o(S, a1, w * 0.22), e1 = o(E, a1, w * 0.18), e2 = o(E, a2, w * 0.16), h2 = o(H, a2, w * 0.1);
    ctx.moveTo(s1.x, s1.y); ctx.lineTo(e1.x, e1.y);
    ctx.moveTo(e2.x, e2.y); ctx.lineTo(h2.x, h2.y);
    ctx.stroke();
  }
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(H.x, H.y, w * 0.42, 0, TAU);
  ctx.fill();
  return { E, H };
}

/** Mistura de ângulo: repouso → carga (A) → golpe (H), com leve passada no follow-through. */
const blend = (k: K, kk: number, base: number, A: number, H: number) => {
  if (kk <= 0) return base;
  let v = base + (A - base) * k.ant * kk;
  v += (H - v) * k.hit * kk;
  return v + (H - A) * 0.14 * k.fol * kk;
};

/**
 * Cadeia com atraso (fita, véu, cabelo, cauda de capa): cai de R no ângulo `a0`, é arrastada
 * para trás por `trail` cada vez mais perto da ponta e ondula com uma onda que viaja da raiz
 * para a ponta.
 */
function chain(R: V, n: number, len: number, a0: number, trail: number, t: number, ph: number, amp: number, freq = 3): V[] {
  const pts: V[] = [R];
  let p = R;
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    const a = a0 - trail * 1.15 * Math.pow(u, 0.8) + Math.sin(t * freq - i * 0.75 + ph) * amp * u;
    p = pol(p, a, len / n);
    pts.push(p);
  }
  return pts;
}

/** Fita com largura variável ao longo da cadeia. */
function ribbon(ctx: CanvasRenderingContext2D, pts: V[], w0: number, w1: number, fill: string | CanvasGradient) {
  const L: V[] = [], R: V[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let nx = -(b.y - a.y), ny = b.x - a.x;
    const l = Math.hypot(nx, ny) || 1;
    nx /= l; ny /= l;
    const w = (w0 + (w1 - w0) * (i / (pts.length - 1))) / 2;
    L.push({ x: pts[i].x + nx * w, y: pts[i].y + ny * w });
    R.push({ x: pts[i].x - nx * w, y: pts[i].y - ny * w });
  }
  ctx.fillStyle = fill;
  ctx.beginPath();
  smoothPath(ctx, L, true);
  smoothPath(ctx, R.reverse(), false);
  ctx.closePath();
  ctx.fill();
}

/**
 * Asa de penas apontando para +x (espelhe com scale(-1,1)).
 * `bend` curva as penas progressivamente para a ponta (atraso da batida);
 * `fan` abre/fecha o leque das rêmiges.
 */
function featherWing(ctx: CanvasRenderingContext2D, L: number, colBack: string, colFront: string, edge: string, bend: number, fan = 1) {
  const n = 9;
  // osso da asa curvado pelo atraso
  const bx = (t: number) => L * t;
  const by = (t: number) => -L * 0.22 * Math.sin(t * Math.PI * 0.9) + bend * L * 0.35 * t * t;
  // cada camada de penas é UM caminho só (pontos girados à mão): barato no celular
  for (let layer = 0; layer < 2; layer++) {
    const len0 = layer ? 0.22 : 0.4, len1 = layer ? 0.3 : 0.64;
    ctx.fillStyle = layer ? colFront : colBack;
    ctx.beginPath();
    for (let i = n - 1; i >= 0; i--) {
      const t = i / (n - 1);
      const ang = Math.PI / 2 - t * 1.25 * fan + bend * t * 0.9;
      const fl = L * (len0 + (len1 - len0) * t);
      const cs = Math.cos(ang), sn = Math.sin(ang), ox = bx(t), oy = by(t);
      const X = (x: number, y: number) => ox + x * cs - y * sn;
      const Y = (x: number, y: number) => oy + x * sn + y * cs;
      ctx.moveTo(X(0, -fl * 0.09), Y(0, -fl * 0.09));
      ctx.quadraticCurveTo(X(fl * 0.55, -fl * 0.17), Y(fl * 0.55, -fl * 0.17), X(fl, 0), Y(fl, 0));
      ctx.quadraticCurveTo(X(fl * 0.55, fl * 0.15), Y(fl * 0.55, fl * 0.15), X(0, fl * 0.09), Y(0, fl * 0.09));
      ctx.closePath();
    }
    ctx.fill();
    if (!layer) {
      // raque das penas
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const ang = Math.PI / 2 - t * 1.25 * fan + bend * t * 0.9;
        const fl = L * (len0 + (len1 - len0) * t) * 0.9;
        ctx.moveTo(bx(t), by(t));
        ctx.lineTo(bx(t) + Math.cos(ang) * fl, by(t) + Math.sin(ang) * fl);
      }
      ctx.stroke();
    }
  }
  // coberteiras: faixa afinando sobre o osso da asa, com contorno
  const top: V[] = [], bot: V[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6, w = L * (0.11 - 0.09 * t);
    top.push({ x: bx(t), y: by(t) - w * 0.3 });
    bot.push({ x: bx(t) - w * 0.3, y: by(t) + w });
  }
  ctx.fillStyle = colFront;
  ctx.beginPath();
  smoothPath(ctx, top, true);
  smoothPath(ctx, bot.reverse(), false);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** Asa de morcego apontando para +x; `fold` 0..1 fecha, `bend` curva os dedos (atraso). */
function batWing(ctx: CanvasRenderingContext2D, L: number, mem: string, bone: string, edge: string, fold: number, bend = 0) {
  const tw = (p: V): V => rot(p, { x: 0, y: 0 }, bend * 0.45 * Math.min(1, Math.hypot(p.x, p.y) / L));
  const tips: V[] = [
    tw({ x: L * 0.55, y: -L * 0.55 * (1 - fold * 0.5) }),
    tw({ x: L, y: -L * 0.35 * (1 - fold * 0.4) }),
    tw({ x: L * 0.95 * (1 - fold * 0.2), y: L * 0.1 }),
    tw({ x: L * 0.7 * (1 - fold * 0.25), y: L * 0.42 }),
    tw({ x: L * 0.35, y: L * 0.5 }),
  ];
  const elbow = tw({ x: L * 0.4, y: -L * 0.35 * (1 - fold * 0.5) });
  ctx.fillStyle = mem;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(elbow.x, elbow.y);
  ctx.lineTo(tips[0].x, tips[0].y);
  for (let i = 1; i < tips.length; i++) {
    const p = tips[i - 1], q = tips[i];
    const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
    // borda recortada entre os dedos (a membrana cede para dentro)
    ctx.quadraticCurveTo(mx * 0.82 + (elbow.x - mx) * 0.05, my * 0.82 + 10, q.x, q.y);
  }
  ctx.quadraticCurveTo(L * 0.12, L * 0.3, 0, 20);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = bone;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(elbow.x, elbow.y);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (const t of tips) {
    ctx.moveTo(elbow.x, elbow.y);
    ctx.lineTo(t.x, t.y);
  }
  ctx.stroke();
  // garra no cotovelo
  ctx.fillStyle = bone;
  ctx.beginPath();
  ctx.moveTo(elbow.x - 4, elbow.y);
  ctx.lineTo(elbow.x - 6, elbow.y - 18);
  ctx.lineTo(elbow.x + 6, elbow.y - 2);
  ctx.fill();
  return tips[1];
}

function poly3(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fill();
}

/** Queda da morte: cambaleio (0→0,3), queda com gravidade (0,25→0,85) e quique. */
function deathCurve(d: number) {
  const stag = sm(0, 0.12, d) * (1 - sm(0.22, 0.5, d));
  const fall = easeIn(sm(0.22, 0.82, d));
  const bounce = d > 0.82 ? Math.sin(((d - 0.82) / 0.18) * Math.PI) * 10 * (1 - (d - 0.82) / 0.18) : 0;
  return { stag, fall, bounce, wob: Math.sin(d * 40) * stag };
}

// ------------------------------------------------------------------ 0: SERAPHIEL

function seraphiel(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState, k: K, c: C, m: M): Anchors {
  const { ant, hit, imp, fol } = k;
  const D = deathCurve(k.die);
  const cA = k.cast * ant, cH = k.cast * hit;
  const wA = k.swipe * ant, wH = k.swipe * hit;
  const rA = k.roar * ant, rH = k.roar * hit;
  const lA = k.slam * ant, lH = k.slam * hit;
  const sA = k.shoot * ant, sH = k.shoot * hit;
  const live = 1 - D.fall;
  const shake = (k.hold + st.rage * 0.15) * Math.sin(st.t * 55) * 2;

  const B: V = {
    x: shake + wA * 22 - wH * 50 - wH * fol * 10 + cH * 12 + sH * 10 + rA * 6 - lH * 22 + D.stag * 16 + D.fall * 24 + D.wob * 4,
    y: -205 + m.y * live - cA * 26 + cH * 8 + rA * 14 - rH * 28 - lA * 34 + lH * 34 + wA * -8 + wH * 10
      + imp * (k.slam * 16 + k.cast * 6 + k.swipe * 8) + D.fall * 120 - D.bounce,
  };
  const lean = m.tilt * live + cA * 0.08 - cH * 0.1 + wA * 0.18 - wH * 0.26 - rA * 0.12 + rH * 0.14 + lA * 0.1 - lH * 0.22
    + sA * 0.06 - sH * 0.08 + D.stag * 0.22 + D.fall * 0.48;
  const light = clamp(0.55 + st.rage * 0.3 + k.atk * 0.5) * c.lit;
  const pairs = Math.max(1, Math.min(3, s.feat.wings ?? 3));
  const P = k.p;

  // aura de luz
  bloom(ctx, B.x, B.y - 20, 220, s.pal.glow, 0.22 * light + rH * 0.35 + k.cast * k.imp * 0.3);
  if (k.roar > 0 || k.cast > 0) godRays(ctx, B.x, B.y - 60, 14, 270 + rH * 80, 0.07, s.pal.accent, (rH * 0.9 + k.cast * (ant + hit) * 0.4) * c.lit, st.t * 0.2);

  // ---- 3 pares de asas: cada par bate com atraso; pontas atrasam (bend)
  const root: V = rot({ x: B.x + 12, y: B.y - 52 }, B, lean);
  const wingCols = [c.mid, mixHex(c.body, c.mid, 0.35), c.body];
  const open = cA * 0.4 + rH * 0.6 - rA * 0.25 + lA * 0.45 - lH * 0.3 - sA * 0.1 + st.rage * 0.05;
  let wingTip: V = root;
  for (let side = 0; side < 2; side++) {
    for (let p = 0; p < pairs; p++) {
      const pi = pairs === 3 ? p : p + 1;
      const phP = m.ph - pi * 0.5 - side * 0.12;
      const fl = Math.sin(phP), dfl = Math.cos(phP);
      const base = [-0.8, -0.25, 0.32][pi];
      // golpe das asas cortantes: o lado da frente (0) sobe para trás e varre para a frente/baixo
      const cut = side === 0 ? -wA * (0.9 - pi * 0.2) + wH * (1.5 - pi * 0.3) : -wA * 0.3 + wH * 0.5;
      // batida de força do cast/slam no impacto
      const snap = (cH * 0.5 + lH * 0.6) * (1 - pi * 0.2);
      const ang = base - open * (1.2 - pi * 0.35) - fl * m.amp * (1 + pi * 0.15) * live + cut + snap
        + D.stag * -0.4 + D.fall * (0.9 + pi * 0.2);
      const sc = (1 - rA * 0.3 + rH * 0.08 - D.fall * 0.3) * (side ? 1 : 0.85);
      const L = [150, 175, 130][pi];
      const bend = dfl * m.amp * 1.3 * live + imp * (k.cast + k.swipe + k.slam) * 0.35 - fol * k.swipe * 0.3 + D.fall * 0.3
        + (side ? -m.fwd * 0.12 : m.fwd * 0.12);
      ctx.save();
      ctx.translate(root.x, root.y + pi * 6);
      if (side === 0) ctx.scale(-1, 1);
      ctx.rotate(ang);
      ctx.scale(sc, sc);
      ctx.globalAlpha = side === 0 ? 0.88 : 1;
      featherWing(ctx, L, mixHex(wingCols[pi], s.pal.dark, side ? 0.12 : 0.38), side ? c.light : c.body, hexA(s.pal.dark, 0.4), bend, 1 + open * 0.15 - rA * 0.2);
      ctx.restore();
      if (side === 0 && pi === 1) {
        const tl = { x: Math.cos(ang) * L * sc * 0.95, y: Math.sin(ang) * L * sc * 0.95 };
        wingTip = { x: root.x - tl.x, y: root.y + pi * 6 + tl.y };
      }
    }
  }
  // rastro das asas cortantes (smear em arco)
  const smear = k.swipe * sm(0.43, 0.5, P) * (1 - sm(0.58, 0.7, P));
  if (smear > 0.02) {
    crescent(ctx, root.x, root.y, 165, 34, Math.PI - 0.15, '#ffffff', s.pal.accent, smear * c.lit, 2.2);
    crescent(ctx, root.x, root.y + 20, 135, 22, Math.PI + 0.2, s.pal.glow, '#ffffff', smear * 0.7 * c.lit, 1.8);
  }

  // ---- auréola girando (atrás da cabeça, chega com atraso)
  const headL = { x: B.x - 10, y: B.y - 94 };
  const head = rot(headL, B, lean);
  const hR = 42 * (1 + rH * 0.35 + cA * 0.15) * (1 - D.fall * 0.2);
  const haloC = { x: head.x + 12 + m.trail * 6, y: head.y - 10 - rH * 10 + Math.sin(st.t * 1.7) * 2 };
  const spinR = st.t * 0.7 + P * k.atk * 5;
  bloom(ctx, haloC.x, haloC.y, hR * 1.7, s.pal.accent, 0.4 * light + rH * 0.3);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(haloC.x, haloC.y);
  const crack = sm(0.3, 0.7, k.die);
  for (let half = 0; half < 2; half++) {
    ctx.save();
    // na morte a auréola racha em duas e cai torta
    ctx.translate((half ? 1 : -1) * crack * 18, crack * (half ? 70 : 40) * D.fall);
    ctx.rotate((half ? 1 : -1) * crack * 0.5);
    const a0 = half ? -Math.PI / 2 : Math.PI / 2;
    ctx.strokeStyle = hexA(s.pal.accent, 0.9 * c.lit + 0.1);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, 0, hR, a0, a0 + Math.PI);
    ctx.stroke();
    ctx.strokeStyle = hexA('#ffffff', 0.7 * c.lit);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
  if (c.lit > 0.05) {
    // anel externo tracejado girando ao contrário + gemas orbitando
    ctx.strokeStyle = hexA(s.pal.accent, 0.55 * c.lit);
    ctx.lineWidth = 2.5;
    ctx.setLineDash([10, 9]);
    ctx.lineDashOffset = spinR * 40;
    ctx.beginPath();
    ctx.arc(0, 0, hR + 11, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = hexA('#ffffff', 0.9 * c.lit);
    for (let i = 0; i < 6; i++) {
      const a = spinR + (i / 6) * TAU;
      const r = hR + 11, x = Math.cos(a) * r, y = Math.sin(a) * r;
      ctx.beginPath();
      ctx.moveTo(x, y - 5); ctx.lineTo(x + 3, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 3, y);
      ctx.fill();
    }
  }
  ctx.restore();

  ctx.save();
  ctx.translate(B.x, B.y);
  ctx.rotate(lean);
  ctx.translate(-B.x, -B.y);

  // ---- braços (ângulos: 0 = trás/direita, π/2 = baixo, π = frente/esquerda)
  const sw = Math.sin(st.t * 1.3 + 0.5) * 0.07;
  const drag = -m.fwd * 0.25 * live;
  const dieA = D.fall * 0.5;
  let b1 = 1.72 + sw + drag, b2 = 1.95 + sw + drag, f1 = 1.95 - sw + drag, f2 = 2.45 - sw + drag;
  b1 = blend(k, k.cast, b1, -1.3, 0.35); b2 = blend(k, k.cast, b2, -1.55, 0.15);
  // (ângulos > π: o braço passa pela FRENTE do corpo, não por trás)
  f1 = blend(k, k.cast, f1, 4.33, 3.0); f2 = blend(k, k.cast, f2, 4.58, 3.08);
  b1 = blend(k, k.swipe, b1, 0.4, 1.4); b2 = blend(k, k.swipe, b2, 0.2, 1.7);
  f1 = blend(k, k.swipe, f1, 0.6, 2.6); f2 = blend(k, k.swipe, f2, 0.3, 2.95);
  b1 = blend(k, k.roar, b1, 1.9, -0.55); b2 = blend(k, k.roar, b2, -0.9, -0.35);
  f1 = blend(k, k.roar, f1, 1.15, 3.63); f2 = blend(k, k.roar, f2, 3.78, 3.33);
  b1 = blend(k, k.slam, b1, -1.4, 2.0); b2 = blend(k, k.slam, b2, -1.3, 1.8);
  f1 = blend(k, k.slam, f1, 4.58, 2.3); f2 = blend(k, k.slam, f2, 4.78, 2.0);
  f1 = blend(k, k.shoot, f1, 1.2, 3.1); f2 = blend(k, k.shoot, f2, 4.18, 3.14);
  b1 = blend(k, k.shoot, b1, 0.9, 0.5); b2 = blend(k, k.shoot, b2, 0.6, 0.3);
  f1 = blend(k, k.charge, f1, 0.8, 3.0); f2 = blend(k, k.charge, f2, 1.2, 3.05);
  // na queda os braços pendem com a gravidade (compensando a inclinação do corpo)
  b1 += dieA - D.stag * 1.6; f1 += -D.fall * 0.5 - D.stag * 2.2; b2 += dieA - D.stag * 1.4; f2 += -D.stag * 2.0 - D.fall * 0.7;

  const skin = c.tint('#f4e4d0'), skinL = c.tint('#fff6ea');
  const sleeve = mixHex(c.body, s.pal.dark, 0.18);
  // braço de trás
  const bS = { x: B.x + 16, y: B.y - 56 };
  const bArm = limb(ctx, bS, b1, b2, 50, 48, 15, c.tint(mixHex('#f4e4d0', s.pal.dark, 0.25)));
  ctx.fillStyle = mixHex(sleeve, s.pal.dark, 0.2);
  seg(ctx, bS, pol(bS, b1, 34), 22, 26);

  // ---- túnica: duas camadas, barra cisalhada pelo rastro e onda que viaja da frente para trás
  const hemShift = m.trail * 55 + wH * 30 - wA * 14 + rH * 10 + D.fall * -30;
  // na queda a túnica se amontoa no chão
  const hemY = B.y + 168 + m.rise * 14 * live + cA * 12 - rH * 10 + lH * -18 - D.fall * 95;
  const wave = (i: number, ph: number) => Math.sin(st.t * 3.1 - i * 0.75 + ph) * (4 + m.sp * 7 + rH * 6);
  for (let layer = 0; layer < 2; layer++) {
    const ext = layer ? 0 : 14;
    const sh = hemShift * (layer ? 1 : 1.25);
    const hem: V[] = [];
    for (let i = 0; i <= 8; i++) {
      const u = i / 8;
      hem.push({ x: B.x + 84 + ext - u * (168 + ext * 2) + sh * (0.75 + 0.25 * (1 - u)) + wave(i, layer * 1.7) * 0.6, y: hemY + ext * 0.6 + wave(i + 3, layer * 2.3) + Math.sin(u * Math.PI * 4) * 4 });
    }
    ctx.fillStyle = layer
      ? vgrad(ctx, B.y - 70, hemY, c.light, mixHex(c.body, s.pal.dark, 0.3))
      : mixHex(c.body, s.pal.dark, 0.5);
    ctx.beginPath();
    ctx.moveTo(B.x - 34, B.y - 66);
    ctx.lineTo(B.x + 34, B.y - 66);
    ctx.quadraticCurveTo(B.x + 58 + sh * 0.3, B.y + 60, hem[0].x, hem[0].y);
    smoothPath(ctx, hem, false);
    ctx.quadraticCurveTo(B.x - 66 + sh * 0.2, B.y + 50, B.x - 34, B.y - 66);
    ctx.fill();
    ctx.strokeStyle = hexA(s.pal.dark, 0.45);
    ctx.lineWidth = 2;
    ctx.stroke();
    if (layer) {
      // dobras do tecido seguindo o cisalhamento
      ctx.strokeStyle = hexA(s.pal.dark, 0.22);
      ctx.lineWidth = 2;
      for (let i = 1; i < 8; i += 2) {
        ctx.beginPath();
        ctx.moveTo(B.x - 22 + i * 6, B.y - 10);
        ctx.quadraticCurveTo(B.x - 30 + i * 9 + sh * 0.3, B.y + 80, hem[8 - i].x, hem[8 - i].y - 4);
        ctx.stroke();
      }
      // barra bordada em ouro
      ctx.strokeStyle = hexA(s.pal.accent, 0.85);
      ctx.lineWidth = 3;
      ctx.beginPath();
      smoothPath(ctx, hem.map((p) => ({ x: p.x, y: p.y - 6 })), true);
      ctx.stroke();
    }
  }
  // faixa dourada
  ctx.fillStyle = c.accent;
  ctx.beginPath();
  ctx.moveTo(B.x - 37, B.y - 12); ctx.lineTo(B.x + 37, B.y - 12); ctx.lineTo(B.x + 35, B.y - 1); ctx.lineTo(B.x - 35, B.y - 1);
  ctx.fill();
  ctx.fillStyle = c.tint(s.pal.eye);
  ctx.beginPath();
  ctx.arc(B.x, B.y - 6, 4, 0, TAU);
  ctx.fill();

  // ---- fitas da faixa: pendem do laço nas costas e esvoaçam com atraso
  const waist = { x: B.x + 22, y: B.y - 4 };
  const rTrail = m.trail * 1.3 + 0.25 + wH * 0.7 - wA * 0.3 + rH * 0.3 + D.fall * -0.6 + cA * -0.2;
  ctx.fillStyle = c.accent;
  ctx.beginPath();
  ctx.ellipse(waist.x, waist.y - 2, 9, 6, 0.4, 0, TAU);
  ctx.fill();
  for (let i = 0; i < 2; i++) {
    const pts = chain(waist, 9, 150 - i * 30, Math.PI / 2 - 0.15, rTrail * (1 - i * 0.15), st.t, m.seed * 7 + i * 1.4, 0.32 + m.sp * 0.25, 3.2 + i * 0.4);
    ribbon(ctx, pts, 11, 3, i ? hexA(s.pal.accent, 0.8) : c.accent);
  }

  // ---- cabeça: estabiliza contra a inclinação; cabelo de luz com atraso
  const H = { x: headL.x, y: headL.y + k.b * 2 };
  // (rotação positiva = nariz para cima, pois ela olha para a esquerda)
  const look = -lean * 0.55 - rA * 0.45 + rH * 0.5 + cA * 0.35 - cH * 0.1 + sA * 0.1 + wA * 0.1 - wH * 0.12 + lA * 0.2 - lH * 0.25
    + D.stag * 0.5 - D.fall * 0.2;
  ctx.fillStyle = skin;
  ctx.fillRect(H.x - 1, H.y + 14, 13, 22);
  ctx.save();
  ctx.translate(H.x, H.y);
  ctx.rotate(look);
  ctx.scale(1.18, 1.18);
  const hairT = m.trail + rH * 0.5 + wH * 0.4 - cA * 0.15 + D.fall * -0.4 - look * 0.6;
  for (let i = 0; i < 2; i++) {
    const pts = chain({ x: 14 - i * 4, y: -14 + i * 6 }, 7, 80 - i * 12, Math.PI / 2 - 0.45, hairT * 0.9, st.t, i * 0.9 + m.seed * 3, 0.28 + m.sp * 0.15, 2.6);
    ribbon(ctx, pts, 22 - i * 4, 2, i === 1 ? hexA(s.pal.glow, 0.85) : vgrad(ctx, -30, 60, c.accent, hexA(s.pal.glow, 0.5)));
  }
  // massa de cabelo atrás do rosto
  ctx.fillStyle = vgrad(ctx, -28, 30, c.tint('#fff2a8'), c.accent);
  ctx.beginPath();
  ctx.ellipse(8, -4, 19, 25, 0.25, 0, TAU);
  ctx.fill();
  ctx.fillStyle = vgrad(ctx, -24, 24, skinL, skin);
  ctx.strokeStyle = hexA(s.pal.dark, 0.5);
  ctx.lineWidth = 1.6;
  // perfil: testa, nariz, lábios e queixo
  ctx.beginPath();
  ctx.moveTo(6, -23);
  ctx.quadraticCurveTo(-14, -24, -16, -6);
  ctx.lineTo(-22, 5);
  ctx.lineTo(-16, 8);
  ctx.quadraticCurveTo(-17, 12, -14, 14);
  ctx.quadraticCurveTo(-12, 22, -2, 23);
  ctx.quadraticCurveTo(14, 22, 17, 4);
  ctx.quadraticCurveTo(19, -18, 6, -23);
  ctx.fill();
  ctx.stroke();
  // sombra do maxilar
  ctx.fillStyle = hexA(s.pal.dark, 0.15);
  ctx.beginPath();
  ctx.ellipse(4, 8, 13, 12, 0, 0, Math.PI);
  ctx.fill();
  // franja / coroa de cabelo
  ctx.fillStyle = c.accent;
  ctx.beginPath();
  ctx.ellipse(4, -14, 20, 10, -0.2, Math.PI, TAU);
  ctx.fill();
  // mecha caindo na frente do ombro
  ctx.fillStyle = c.accent;
  ctx.beginPath();
  ctx.moveTo(6, -18);
  ctx.quadraticCurveTo(22, 0, 14 + Math.sin(st.t * 2.2) * 2 + hairT * 4, 30);
  ctx.quadraticCurveTo(10, 8, 0, -12);
  ctx.fill();
  // diadema
  ctx.strokeStyle = c.tint('#fff2a8');
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(2, -2, 19, Math.PI * 1.05, Math.PI * 1.7);
  ctx.stroke();
  const eo = (st.anim === 'death' ? 1 - st.p : 1) * (rA > 0.3 ? 0.2 : m.blink);
  eyeGlow(ctx, -9, -2, 4 + st.rage * 1.5 + rH * 2 + cA * 1.5, s.pal.eye, eo);
  const mo = clamp(rH * 1.2 + k.cast * imp * 0.6 + D.stag);
  if (mo > 0.08) {
    ctx.fillStyle = '#5a3020';
    ctx.beginPath();
    ctx.ellipse(-11, 12, 4, 6 * mo, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // ---- tronco com peitoral
  ctx.fillStyle = vgrad(ctx, B.y - 80, B.y, c.light, c.body);
  ctx.beginPath();
  ctx.moveTo(B.x - 30, B.y - 70);
  ctx.quadraticCurveTo(B.x, B.y - 82, B.x + 30, B.y - 70);
  ctx.quadraticCurveTo(B.x + 26, B.y - 36, B.x + 24, B.y - 6);
  ctx.lineTo(B.x - 26, B.y - 6);
  ctx.quadraticCurveTo(B.x - 30, B.y - 40, B.x - 30, B.y - 70);
  ctx.fill();
  ctx.strokeStyle = hexA(s.pal.dark, 0.4);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = c.accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(B.x - 26, B.y - 66);
  ctx.lineTo(B.x, B.y - 30);
  ctx.lineTo(B.x + 26, B.y - 66);
  ctx.stroke();
  bloom(ctx, B.x - 2, B.y - 44, 22, s.pal.accent, 0.4 * light + k.cast * hit * 0.4);
  // braço da frente (manga larga + antebraço)
  const fS = { x: B.x - 20, y: B.y - 60 };
  const fArm = limb(ctx, fS, f1, f2, 54, 52, 16, skin, hexA('#ffffff', 0.35));
  ctx.fillStyle = sleeve;
  seg(ctx, fS, pol(fS, f1, 38), 24, 30);
  // punho dourado da manga
  ctx.strokeStyle = c.accent;
  ctx.lineWidth = 4;
  ctx.beginPath();
  const cuff = pol(fS, f1, 38);
  ctx.moveTo(cuff.x + Math.cos(f1 + 1.57) * 15, cuff.y + Math.sin(f1 + 1.57) * 15);
  ctx.lineTo(cuff.x - Math.cos(f1 + 1.57) * 15, cuff.y - Math.sin(f1 + 1.57) * 15);
  ctx.stroke();
  ctx.restore();

  const handW = rot(fArm.H, B, lean);
  const bhW = rot(bArm.H, B, lean);
  // luz nas mãos: junta acima da cabeça na carga do cast e dispara no golpe
  const hg = clamp(k.cast * (ant + hit) + k.shoot * (ant + hit) + k.slam * hit + k.swipe * hit * 0.5) * c.lit;
  orb(ctx, handW.x, handW.y, 18 + hg * 38 + k.imp * 20, s.pal.accent, 0.35 + hg * 0.65);
  if (cA > 0.05) {
    const mid = { x: (handW.x + bhW.x) / 2, y: Math.min(handW.y, bhW.y) - 20 };
    orb(ctx, mid.x, mid.y, 20 + cA * 40 + Math.sin(st.t * 30) * 3 * k.hold, s.pal.glow, cA * c.lit);
  }
  if (k.cast > 0) magicCircle(ctx, head.x, head.y - 120 - cA * 10, 74 * clamp(ant + hit), s.pal.accent, k.cast * clamp(ant + hit) * 0.8, st.t * 2 + P * 6, 0.35);

  // penas soltas caindo na morte
  if (k.die > 0.15) {
    ctx.fillStyle = hexA('#ffffff', 0.8 * (1 - sm(0.8, 1, k.die)));
    for (let i = 0; i < 7; i++) {
      const u = sm(0.15 + i * 0.05, 1, k.die);
      if (u <= 0) continue;
      const fx = root.x + (h01(i, 3) - 0.5) * 260 + Math.sin(st.t * 2 + i) * 14;
      const fy = root.y - 60 + u * (140 + h01(i, 5) * 120);
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(Math.sin(st.t * 2.4 + i * 2) * 0.8);
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 3, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  const mouthW = rot({ x: H.x - 14, y: H.y + 10 }, B, lean);
  return {
    mouth: k.shoot > 0 || k.cast > 0 ? handW : mouthW,
    hand: k.swipe > 0 ? { x: (wingTip.x + handW.x) / 2, y: (wingTip.y + handW.y) / 2 } : handW,
    core: rot({ x: B.x, y: B.y - 34 }, B, lean),
    top: Math.min(haloC.y - hR - 12, root.y - 175),
    halfW: 170,
  };
}

// ------------------------------------------------------------------ 1: KAAL-MARA

/** Fases do ataque num progresso atrasado (cada braço começa um pouco depois do anterior). */
function phAt(p: number, on: number) {
  return {
    ant: on * sm(0.02, 0.4, p) * (1 - sm(0.42, 0.5, p)),
    hit: on * sm(0.42, 0.54, p) * (1 - sm(0.64, 1, p)),
    fol: on * sm(0.54, 0.64, p) * (1 - sm(0.64, 0.95, p)),
  };
}

/** Empurra um ângulo de membro para que a ponta vá para trás (+x) com o arrasto `d`. */
const dragA = (a: number, d: number) => a - Math.sin(a) * d;

/** Perfil de rosto olhando para a esquerda (testa, nariz, lábios, queixo), ~36 x 46. */
function faceProfile(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.moveTo(6, -23);
  ctx.quadraticCurveTo(-14, -24, -16, -6);
  ctx.lineTo(-22, 5);
  ctx.lineTo(-16, 8);
  ctx.quadraticCurveTo(-17, 12, -14, 14);
  ctx.quadraticCurveTo(-12, 22, -2, 23);
  ctx.quadraticCurveTo(14, 22, 17, 4);
  ctx.quadraticCurveTo(19, -18, 6, -23);
}

function kaalmara(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState, k: K, c: C, m: M): Anchors {
  const { ant, hit, imp, fol } = k;
  const D = deathCurve(k.die);
  const live = 1 - D.fall;
  const P = k.p, on = st.anim === 'attack' ? 1 : 0;
  const cA = k.cast * ant, cH = k.cast * hit;
  const wA = k.swipe * ant, wH = k.swipe * hit;
  const oA = k.shoot * ant, oH = k.shoot * hit;
  const lA = k.slam * ant, lH = k.slam * hit;
  const rA = k.roar * ant, rH = k.roar * hit;
  const shake = (k.hold + st.rage * 0.12) * Math.sin(st.t * 50) * 2;
  // dança: o quadril balança num 8 lento
  const sway = Math.sin(st.t * 1.6 + m.seed * 4) * 6 * live;
  const B: V = {
    x: sway * 0.6 + shake + wA * 16 - wH * 42 - cA * 6 + cH * 8 + oH * 8 - lH * 20 + D.stag * 14 + D.fall * 10,
    y: -192 + m.y * live + Math.sin(st.t * 3.2) * 1.5 - cA * 18 - lA * 34 + lH * 30 + rA * 10 - rH * 18 - oA * 6
      + imp * (k.slam * 18 + k.swipe * 6) + D.fall * 118 - D.bounce,
  };
  const lean = m.tilt * live + Math.sin(st.t * 1.6 + m.seed * 4 + 0.6) * 0.035 * live + wA * 0.16 - wH * 0.24 - cH * 0.08
    + lA * 0.1 - lH * 0.2 + oA * 0.1 - oH * 0.06 + rH * 0.1 + D.stag * 0.18 - D.fall * 0.3;
  const nArms = Math.max(4, Math.min(10, s.feat.arms ?? 8));
  const light = clamp(0.5 + st.rage * 0.3 + k.atk * 0.5) * c.lit;
  const skin = c.body, skinD = c.mid, skinL = c.light;
  const outline = hexA(s.pal.dark, 0.7);

  // ---- auréola-sol girando (chega com atraso atrás da cabeça)
  const headL = { x: B.x - 6, y: B.y - 98 };
  const head = rot(headL, B, lean);
  const hc = { x: head.x + 10 + m.trail * 8, y: head.y - 6 - rH * 8 };
  const spin = st.t * 0.35 + P * on * (k.swipe ? -6 : 3);
  const hR = 54 * (1 + rH * 0.2 + oH * 0.15 + cA * 0.1) * (1 - D.fall * 0.25);
  bloom(ctx, hc.x, hc.y, 110, s.pal.glow, 0.3 * light + oH * 0.3);
  ctx.save();
  ctx.translate(hc.x, hc.y);
  ctx.rotate(spin);
  ctx.globalAlpha = 0.35 + 0.65 * c.lit;
  ctx.fillStyle = hexA(s.pal.accent, 0.9);
  for (let i = 0; i < 18; i++) {
    const fl = Math.sin(st.t * 6 + i * 1.7) * 4 + (i % 2) * 12;
    ctx.save();
    ctx.rotate((i / 18) * TAU);
    ctx.beginPath();
    ctx.moveTo(-5, -hR);
    ctx.quadraticCurveTo(-3, -hR - 12, 0, -hR - 18 - fl);
    ctx.quadraticCurveTo(3, -hR - 12, 5, -hR);
    ctx.fill();
    ctx.restore();
  }
  ctx.strokeStyle = c.accent;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(0, 0, hR, 0, TAU);
  ctx.stroke();
  // anel interno girando ao contrário
  ctx.rotate(-spin * 2.4);
  ctx.strokeStyle = hexA(s.pal.glow, 0.7);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, hR - 10, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = c.tint(s.pal.glow);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * (hR - 10), Math.sin(a) * (hR - 10), 3, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // círculo mágico atrás do corpo (o leque de braços gira na frente dele)
  if (k.cast > 0) magicCircle(ctx, B.x, B.y - 60, 125 * clamp(ant + hit), s.pal.glow, k.cast * clamp(ant + hit) * 0.5, -st.t * 2 - P * 4, 1);
  // ---- cabelo longo atrás de tudo (atraso forte)
  const hairR = rot({ x: headL.x + 14, y: headL.y - 10 }, B, lean);
  const hairT = m.trail * 1.1 + wH * 0.6 - wA * 0.4 + rH * 0.4 + 0.15 - D.fall * 0.5;
  for (let i = 0; i < 2; i++) {
    const pts = chain({ x: hairR.x - i * 6, y: hairR.y + i * 8 }, 9, 150 - i * 30, Math.PI / 2 - 0.2, hairT, st.t, i * 1.3 + m.seed * 5, 0.25 + m.sp * 0.15, 2.4);
    ribbon(ctx, pts, 30 - i * 8, 4, i ? c.tint(mixHex(s.pal.dark, '#000000', 0.3)) : c.dark);
  }

  // ---- leque de braços: cada braço com atraso (onda que percorre o leque)
  type Arm = { S: V; a1: number; a2: number; front: boolean; i: number; glow: number };
  const arms: Arm[] = [];
  for (let i = 0; i < nArms; i++) {
    const t = i / (nArms - 1);
    const rest = Math.PI * 0.8 + t * Math.PI * 1.45;
    // cada braço com seu próprio progresso atrasado (a ordem muda com o golpe)
    const delay = k.swipe ? (1 - t) * 0.08 : k.cast ? t * 0.1 : Math.abs(t - 0.5) * 0.08;
    const q = phAt(P - delay, on);
    const B3 = (kk: number, A: number, H: number, base: number) => {
      if (kk <= 0) return base;
      let v = base + (A - base) * q.ant * kk;
      v += (H - v) * q.hit * kk;
      return v + (H - A) * 0.15 * q.fol * kk;
    };
    let a = rest;
    a = B3(k.cast, 4.71 + (t - 0.5) * 2.6, Math.PI + (t - 0.5) * 1.0, a);
    a = B3(k.swipe, rest + 0.9, rest - 1.9, a);
    a = B3(k.shoot, 4.71 + (t - 0.5) * 1.1, 4.71 + (rest - 4.71) * 1.35, a);
    a = B3(k.slam, 4.71 + (t - 0.5) * 0.8, 2.45 + (t - 0.5) * 0.7, a);
    a = B3(k.roar, 4.71 + (rest - 4.71) * 0.55, 4.71 + (rest - 4.71) * 1.25, a);
    a = B3(k.charge, rest + 0.4, Math.PI + (t - 0.5) * 0.8, a);
    // onda viajando pelo leque + arrasto do voo
    const wv = Math.sin(st.t * 2.2 - i * 0.75 + m.seed * 3);
    const wvLag = Math.sin(st.t * 2.2 - i * 0.75 + m.seed * 3 - 0.9);
    a += wv * 0.1 * (1 - k.atk * 0.6) * live;
    a = dragA(a, m.trail * 0.12 * live);
    // morte: os braços desabam um a um
    const dd = sm(0.1 + t * 0.25, 0.45 + t * 0.25, k.die);
    a += ((t < 0.5 ? 2.3 : a > 3.9 ? 1.0 + TAU : 1.0) - a) * dd;
    let a2 = a + 0.35 * (i < nArms / 2 ? -1 : 1) + wvLag * 0.2 * live - k.hit * 0.25 * (i < nArms / 2 ? -1 : 1);
    a2 = dragA(a2, m.trail * 0.25 * live);
    const front = i % 2 === 0;
    // os braços brotam empilhados dos ombros: os de baixo saem mais baixo no tronco
    const rank = Math.abs(t - 0.5) * 2;
    const S = rot({ x: B.x + (front ? -18 + rank * 6 : 16 - rank * 6), y: B.y - 66 + rank * 24 }, B, lean);
    const glow = clamp(q.ant * (k.cast + k.slam) * 0.6 + q.hit * (k.cast + k.swipe + k.slam)) * c.lit;
    arms.push({ S, a1: a, a2, front, i, glow });
  }
  const tips: V[] = [];
  const drawArm = (r: Arm) => {
    const col = r.front ? skin : skinD;
    const { E, H } = limb(ctx, r.S, r.a1, r.a2, 54, 48, r.front ? 13 : 11, col, r.front ? hexA('#ffffff', 0.18) : undefined);
    // bracelete de ouro no pulso (faixa atravessada)
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    const w1 = pol(E, r.a2, 34), nx = Math.cos(r.a2 + 1.57) * 6, ny = Math.sin(r.a2 + 1.57) * 6;
    ctx.moveTo(w1.x + nx, w1.y + ny);
    ctx.lineTo(w1.x - nx, w1.y - ny);
    ctx.stroke();
    // lâmina curva na mão
    const ba = r.a2 + 0.3;
    ctx.save();
    ctx.translate(H.x, H.y);
    ctx.rotate(ba);
    ctx.fillStyle = vgrad(ctx, -8, 6, c.tint('#fff6d0'), c.accent);
    ctx.beginPath();
    ctx.moveTo(-4, -3);
    ctx.quadraticCurveTo(30, -15, 54, -2);
    ctx.quadraticCurveTo(30, 2, -4, 4);
    ctx.fill();
    ctx.strokeStyle = hexA(s.pal.dark, 0.5);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    const tip = pol(H, ba, 52);
    if (r.glow > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = hexA(s.pal.accent, r.glow * 0.8);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(H.x, H.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
      ctx.restore();
    }
    tips.push(tip);
    return { H, tip };
  };
  for (const r of arms) if (!r.front) drawArm(r);

  ctx.save();
  ctx.translate(B.x, B.y);
  ctx.rotate(lean);
  ctx.translate(-B.x, -B.y);

  // ---- pernas flutuando em pose de dança: uma pende com o pé em ponta, a outra dobrada cruzando
  const kick = wH * 1.0 - wA * 0.3 + rA * 0.3;
  const tuck = lA * 0.8 + cA * 0.3 + D.stag * 0.4;
  const legSw = Math.sin(st.t * 1.25 + m.seed) * 0.08 * live;
  const legLag = Math.sin(st.t * 1.25 + m.seed - 0.8) * 0.12 * live;
  const legs: [V, number, number, string][] = [
    // [quadril, coxa, canela, cor]
    [{ x: B.x + 10, y: B.y + 22 }, dragA(2.45 + tuck * 0.5 + kick * 0.6 + legSw, m.trail * 0.08), dragA(1.2 - tuck * 0.7 + kick * 1.9 + legLag, m.trail * 0.2), skinD],
    [{ x: B.x - 6, y: B.y + 22 }, dragA(1.75 - legSw + tuck * 1.0 - lH * 0.2, m.trail * 0.1), dragA(1.72 - legLag - tuck * 1.6 + lH * 0.2, m.trail * 0.22), skin],
  ];
  for (const [hip, t1, t2, col] of legs) {
    const { H: ft } = limb(ctx, hip, t1, t2, 62, 58, 22, col, col === skin ? hexA('#ffffff', 0.15) : undefined);
    // pé em ponta
    ctx.fillStyle = col;
    ctx.save();
    ctx.translate(ft.x, ft.y);
    ctx.rotate(t2 + 0.25);
    ctx.beginPath();
    ctx.ellipse(10, 0, 16, 6.5, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    // tornozeleira com sininhos
    const an = pol(ft, t2 + Math.PI, 10);
    ctx.fillStyle = c.accent;
    ctx.beginPath();
    ctx.arc(an.x, an.y, 6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = c.tint('#fff2b0');
    for (let j = 0; j < 3; j++) {
      const bb = pol(an, t2 + 1.57 + (j - 1) * 0.6, 7);
      ctx.beginPath();
      ctx.arc(bb.x, bb.y + 3, 2, 0, TAU);
      ctx.fill();
    }
  }

  // ---- saia esvoaçante (cisalha para trás com o voo; a barra ondula da frente para trás)
  const sh = m.trail * 34 + wH * 22 - wA * 10 + rH * 8 - D.fall * 12;
  const hemY = B.y + 86 + m.rise * 10 * live - lA * 6 + lH * 10 - rH * 10;
  const hem: V[] = [];
  for (let i = 0; i <= 7; i++) {
    const u = i / 7;
    const wv = Math.sin(st.t * 3.4 - i * 0.8 + m.seed * 2) * (3 + m.sp * 5 + wH * 6);
    hem.push({ x: B.x + 74 - u * 146 + sh * (0.6 + 0.4 * (1 - u)) + wv * 0.5, y: hemY + wv + Math.sin(u * Math.PI * 3.5) * 5 - (1 - u) * 6 });
  }
  ctx.fillStyle = vgrad(ctx, B.y, hemY, c.tint(s.pal.glow), c.tint(mixHex(s.pal.glow, s.pal.dark, 0.5)));
  ctx.beginPath();
  ctx.moveTo(B.x - 32, B.y - 6);
  ctx.lineTo(B.x + 32, B.y - 6);
  ctx.quadraticCurveTo(B.x + 62 + sh * 0.4, B.y + 40, hem[0].x, hem[0].y);
  smoothPath(ctx, hem, false);
  ctx.quadraticCurveTo(B.x - 54 + sh * 0.2, B.y + 36, B.x - 32, B.y - 6);
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2;
  ctx.stroke();
  // pregas
  ctx.strokeStyle = hexA(s.pal.dark, 0.25);
  ctx.lineWidth = 2;
  for (let i = 1; i < 7; i += 2) {
    ctx.beginPath();
    ctx.moveTo(B.x - 24 + i * 8, B.y);
    ctx.quadraticCurveTo(B.x - 28 + i * 10 + sh * 0.3, B.y + 40, hem[7 - i].x, hem[7 - i].y - 3);
    ctx.stroke();
  }
  ctx.strokeStyle = c.accent;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  smoothPath(ctx, hem.map((p) => ({ x: p.x, y: p.y - 4 })), true);
  ctx.stroke();
  // faixa da frente (pende entre as pernas e esvoaça)
  const sashR = { x: B.x - 6, y: B.y + 2 };
  const sp1 = chain(sashR, 7, 110, Math.PI / 2 + 0.05, m.trail * 1.2 + wH * 0.5 + 0.1, st.t, m.seed * 4, 0.3 + m.sp * 0.2, 3.4);
  ribbon(ctx, sp1, 14, 6, c.accent);
  // cinto de ouro com pingentes que balançam
  ctx.fillStyle = c.accent;
  ctx.fillRect(B.x - 34, B.y - 10, 68, 10);
  for (let i = 0; i < 5; i++) {
    const px = B.x - 28 + i * 14;
    const pa = Math.sin(st.t * 2.6 - i * 0.6) * 0.2 + m.trail * 0.3;
    ctx.beginPath();
    ctx.moveTo(px - 4, B.y);
    ctx.lineTo(px + 4, B.y);
    ctx.lineTo(px + Math.sin(pa) * 14, B.y + Math.cos(pa) * 14);
    ctx.fill();
  }

  // ---- tronco
  ctx.fillStyle = vgrad(ctx, B.y - 80, B.y, skinL, skin);
  ctx.beginPath();
  ctx.moveTo(B.x - 34, B.y - 70);
  ctx.quadraticCurveTo(B.x, B.y - 80 + k.b * 1.5, B.x + 34, B.y - 70);
  ctx.quadraticCurveTo(B.x + 22, B.y - 36, B.x + 24, B.y - 6);
  ctx.lineTo(B.x - 24, B.y - 6);
  ctx.quadraticCurveTo(B.x - 22, B.y - 36, B.x - 34, B.y - 70);
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2;
  ctx.stroke();
  // sombra da cintura / peito
  ctx.fillStyle = hexA(s.pal.dark, 0.25);
  ctx.beginPath();
  ctx.ellipse(B.x + 12, B.y - 30, 10, 24, 0, 0, TAU);
  ctx.fill();
  // colar em camadas
  ctx.strokeStyle = c.accent;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(B.x - 2, B.y - 74, 22, 0.3, Math.PI - 0.3);
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(B.x - 2, B.y - 74, 30, 0.45, Math.PI - 0.45);
  ctx.stroke();
  ctx.fillStyle = c.tint(s.pal.glow);
  ctx.beginPath();
  ctx.arc(B.x - 2, B.y - 46 + Math.sin(st.t * 2.6) * 1.5, 4.5, 0, TAU);
  ctx.fill();

  // ---- cabeça: estabiliza; inclina para trás na carga do olho e avança no disparo
  const H = { x: headL.x, y: headL.y + k.b * 2 };
  const look = -lean * 0.6 + oA * 0.4 - oH * 0.15 - rA * 0.3 + rH * 0.3 + wA * 0.1 - wH * 0.1 + D.stag * 0.4 - D.fall * 0.5
    + Math.sin(st.t * 1.6 + m.seed * 4 + 1.2) * 0.06 * live;
  ctx.fillStyle = skin;
  ctx.fillRect(H.x - 5, H.y + 14, 13, 18);
  ctx.save();
  ctx.translate(H.x, H.y);
  ctx.rotate(look);
  ctx.scale(1.1, 1.1);
  // coque de cabelo atrás
  ctx.fillStyle = c.dark;
  ctx.beginPath();
  ctx.ellipse(10, -4, 18, 22, 0.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = vgrad(ctx, -24, 24, skinL, skin);
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.6;
  faceProfile(ctx);
  ctx.fill();
  ctx.stroke();
  // franja escura
  ctx.fillStyle = c.dark;
  ctx.beginPath();
  ctx.moveTo(-14, -14);
  ctx.quadraticCurveTo(0, -26, 18, -12);
  ctx.quadraticCurveTo(18, 6, 12, 14);
  ctx.quadraticCurveTo(8, -6, -14, -14);
  ctx.fill();
  // terceiro olho
  const third = clamp(0.4 + k.shoot * (ant * 1.5 + hit) + st.rage * 0.3) * c.lit;
  ctx.fillStyle = c.tint(s.pal.glow);
  ctx.beginPath();
  ctx.ellipse(-10, -12, 2.5, 4.5 * (oA > 0.3 ? 1.3 : m.blink), 0, 0, TAU);
  ctx.fill();
  const eo = (st.anim === 'death' ? 1 - st.p : 1) * (oA > 0.3 ? 0.25 : m.blink);
  eyeGlow(ctx, -9, -1, 4 + st.rage * 1.5, s.pal.eye, eo);
  // lábios
  ctx.fillStyle = c.tint('#c0306a');
  ctx.beginPath();
  ctx.ellipse(-14, 13, 3, 1.5 + rH * 3 + D.stag * 2, 0, 0, TAU);
  ctx.fill();
  // coroa em camadas (mukuta)
  ctx.fillStyle = vgrad(ctx, -66, -14, c.tint('#fff2b0'), c.accent);
  ctx.beginPath();
  ctx.moveTo(-16, -16);
  ctx.lineTo(-14, -40);
  ctx.lineTo(-6, -32);
  ctx.lineTo(2, -64);
  ctx.lineTo(10, -32);
  ctx.lineTo(18, -40);
  ctx.lineTo(20, -16);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = hexA(s.pal.dark, 0.5);
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = c.tint(s.pal.glow);
  ctx.beginPath();
  ctx.arc(2, -28, 4, 0, TAU);
  ctx.fill();
  // brinco pendente (atrasa)
  const ea = Math.sin(st.t * 2.4 - 0.7) * 0.3 + m.trail * 0.4 - look;
  ctx.fillStyle = c.accent;
  ctx.beginPath();
  ctx.arc(6 + Math.sin(ea) * 12, 10 + Math.cos(ea) * 12, 4, 0, TAU);
  ctx.fill();
  ctx.restore();
  const eye3 = rot({ x: -11, y: -13.2 }, { x: 0, y: 0 }, look);
  const eye3L = { x: H.x + eye3.x, y: H.y + eye3.y };
  ctx.restore();
  const eyeW = rot(eye3L, B, lean);
  bloom(ctx, eyeW.x, eyeW.y, 14 + third * 30 + oH * 30, s.pal.glow, third);

  for (const r of arms) if (r.front) drawArm(r);

  // rastro da dança da destruição: arcos nas pontas das lâminas
  const smear = k.swipe * sm(0.42, 0.5, P) * (1 - sm(0.6, 0.72, P));
  if (smear > 0.02) {
    const bc = rot({ x: B.x, y: B.y - 58 }, B, lean);
    crescent(ctx, bc.x, bc.y, 150, 30, Math.PI + 0.1, '#ffffff', s.pal.glow, smear * c.lit, 2.6);
    crescent(ctx, bc.x, bc.y, 112, 18, Math.PI - 0.5, s.pal.accent, '#ffffff', smear * 0.7 * c.lit, 2.0);
  }
  // mão de referência: lâmina mais à frente (ou o ponto onde as palmas se encontram no slam)
  let hand: V = { x: -150, y: -150 };
  let best = Infinity;
  for (const tp of tips) if (tp.x < best) { best = tp.x; hand = tp; }
  if (k.slam > 0) {
    let sx = 0, sy = 0;
    for (const tp of tips) { sx += tp.x; sy += tp.y; }
    const avg = { x: sx / tips.length, y: sy / tips.length };
    hand = { x: hand.x + (avg.x - hand.x) * 0.5, y: hand.y + (avg.y - hand.y) * 0.5 };
  }
  if (k.slam > 0) orb(ctx, hand.x, hand.y, 30 + 50 * (lH + imp), s.pal.accent, k.slam * (lH * 0.8 + imp));

  return { mouth: eyeW, hand, core: rot({ x: B.x, y: B.y - 40 }, B, lean), top: hc.y - hR - 30, halfW: 160 };
}

// ------------------------------------------------------------------ 2: ANUBHAR

function anubhar(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState, k: K, c: C, m: M): Anchors {
  const { ant, hit, imp } = k;
  const D = deathCurve(k.die);
  const live = 1 - D.fall;
  const P = k.p;
  const cA = k.cast * ant, cH = k.cast * hit;
  const rA = k.roar * ant, rH = k.roar * hit;
  const lA = k.slam * ant, lH = k.slam * hit;
  const wA = k.swipe * ant, wH = k.swipe * hit;
  const shake = (k.hold + st.rage * 0.12) * Math.sin(st.t * 52) * 2;
  const B: V = {
    x: shake + cH * 10 - lH * 26 + rA * 6 + wA * 14 - wH * 36 + D.stag * 14 + D.fall * 16,
    y: -172 + m.y * live - cA * 20 + cH * 6 + rA * 16 - rH * 22 - lA * 36 + lH * 34
      + imp * (k.slam * 18 + k.cast * 5) + D.fall * 112 - D.bounce,
  };
  const lean = m.tilt * live + cA * 0.06 - cH * 0.1 - rA * 0.16 + rH * 0.1 + lA * 0.1 - lH * 0.24 + wA * 0.14 - wH * 0.2
    + D.stag * 0.2 - D.fall * 0.28;
  const glowA = clamp(0.5 + st.rage * 0.3 + k.atk * 0.5) * c.lit;
  const gold = c.gold, goldD = c.goldD;
  const skin = c.body, skinL = c.light;
  const outline = hexA(s.pal.glow, 0.18);

  // ---- disco solar girando atrás da cabeça
  const headL = { x: B.x - 6, y: B.y - 132 };
  const head = rot(headL, B, lean);
  const dc = { x: head.x + 14 + m.trail * 8, y: head.y - 34 - rH * 10 };
  const dR = 46 * (1 + rH * 0.25 + cA * 0.15) * (1 - D.fall * 0.3);
  const spin = st.t * 0.5 + P * k.atk * 4;
  bloom(ctx, dc.x, dc.y, dR * 1.8, s.pal.accent, 0.3 * glowA + rH * 0.25);
  ctx.save();
  ctx.translate(dc.x, dc.y);
  ctx.globalAlpha = 0.3 + 0.7 * c.lit;
  ctx.strokeStyle = gold;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, dR, 0, TAU);
  ctx.stroke();
  ctx.rotate(spin);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU, r0 = dR + 4, r1 = dR + (i % 3 ? 9 : 16);
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
  }
  ctx.stroke();
  ctx.rotate(-spin * 2.2);
  ctx.strokeStyle = hexA(s.pal.glow, 0.6);
  ctx.setLineDash([6, 10]);
  ctx.beginPath();
  ctx.arc(0, 0, dR - 9, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // ---- areias do tempo orbitando (sobem mais rápido no ataque)
  ctx.fillStyle = hexA('#e8c080', 0.7 * c.lit);
  for (let i = 0; i < 10; i++) {
    const a = st.t * (0.8 + (i % 3) * 0.2) * (1 + k.atk * 2) + i * 0.63;
    const r = 70 + (i % 4) * 16 + rH * 50;
    const x = B.x + Math.cos(a) * r, y = B.y - 50 + Math.sin(a) * r * 0.35 - rH * 30;
    ctx.fillRect(x, y, 3, 3);
  }

  // ---- faixas da cintura atrás do corpo (atraso)
  const beltR = rot({ x: B.x + 26, y: B.y - 8 }, B, lean);
  const tT = m.trail * 1.25 + 0.2 + wH * 0.6 + rH * 0.3 - lA * 0.3 - D.fall * 0.6;
  for (let i = 0; i < 2; i++) {
    const pts = chain({ x: beltR.x - i * 6, y: beltR.y }, 8, 120 - i * 26, Math.PI / 2 - 0.1, tT * (1 - i * 0.2), st.t, i * 1.5 + m.seed * 6, 0.3 + m.sp * 0.2, 3);
    ribbon(ctx, pts, 14, 5, i ? c.tint('#f4ead8') : gold);
  }

  ctx.save();
  ctx.translate(B.x, B.y);
  ctx.rotate(lean);
  ctx.translate(-B.x, -B.y);

  // ---- braço de trás com a balança das almas (pêndulo com atraso)
  const sw = Math.sin(st.t * 1.3 + 1.1) * 0.06;
  let b1 = 1.0 + sw - m.fwd * 0.15 * live, b2 = -0.55 + sw;
  b1 = blend(k, k.cast, b1, -0.9, -0.7); b2 = blend(k, k.cast, b2, -1.5, -1.25);
  b1 = blend(k, k.roar, b1, 1.6, -0.6); b2 = blend(k, k.roar, b2, 2.6, -0.3);
  b1 = blend(k, k.slam, b1, -0.9, 1.4); b2 = blend(k, k.slam, b2, -1.2, 1.0);
  b1 = blend(k, k.swipe, b1, 1.2, 0.9); b2 = blend(k, k.swipe, b2, 0.4, -0.2);
  b1 += D.fall * 0.6 - D.stag * 1.2; b2 += D.fall * 2.0 - D.stag * 1.0;
  const bS = { x: B.x + 22, y: B.y - 90 };
  const bA = limb(ctx, bS, b1, b2, 56, 52, 17, c.mid);
  ctx.strokeStyle = goldD;
  ctx.lineWidth = 5;
  ctx.beginPath();
  const bw = pol(bA.E, b2, 34);
  ctx.arc(bw.x, bw.y, 8, 0, TAU);
  ctx.stroke();
  // balança: o travessão inclina com o balanço da mão; os pratos pendem e atrasam
  const swingT = Math.sin(st.t * 1.2) * 0.15 + m.trail * 0.25 + k.cast * (ant + hit) * 0.45 * Math.sin(st.t * 6) + rH * 0.3 * Math.sin(st.t * 9);
  const panLag = Math.sin(st.t * 1.2 - 0.7) * 0.25 + m.trail * 0.45 * live + wH * 0.4 - D.fall * 0.3;
  const sc = { x: bA.H.x, y: bA.H.y - 4 };
  ctx.save();
  ctx.translate(sc.x, sc.y);
  ctx.strokeStyle = gold;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(0, -34);
  ctx.stroke();
  ctx.fillStyle = gold;
  ctx.beginPath();
  ctx.arc(0, -36, 4, 0, TAU);
  ctx.fill();
  ctx.rotate(swingT);
  ctx.beginPath();
  ctx.moveTo(-36, -30); ctx.lineTo(36, -30);
  ctx.stroke();
  for (const sd of [-1, 1]) {
    ctx.save();
    ctx.translate(sd * 36, -30);
    ctx.rotate(-swingT + panLag * (sd < 0 ? 1 : 0.8));
    ctx.strokeStyle = gold;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(-10, 28); ctx.moveTo(0, 0); ctx.lineTo(10, 28);
    ctx.stroke();
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.ellipse(0, 28, 13, 4.5, 0, 0, Math.PI);
    ctx.fill();
    // coração (esquerda) contra a pena (direita)
    if (sd < 0) orb(ctx, 0, 21, 9 + glowA * 6, s.pal.glow, glowA);
    else {
      ctx.fillStyle = c.tint('#f4ead8');
      ctx.beginPath();
      ctx.ellipse(0, 18, 3, 10, 0.3 + Math.sin(st.t * 3) * 0.1, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();

  // ---- pernas pendendo (pés em ponta), balançam com atraso
  const tuck = lA * 0.7 + rA * 0.5 + D.stag * 0.3;
  const ls = Math.sin(st.t * 1.25 + m.seed * 3) * 0.07 * live;
  const ll = Math.sin(st.t * 1.25 + m.seed * 3 - 0.8) * 0.1 * live;
  const legs: [V, number, number, string][] = [
    [{ x: B.x + 14, y: B.y + 18 }, dragA(1.62 + ls + tuck * 0.9, m.trail * 0.12), dragA(1.68 + ll - tuck * 1.3, m.trail * 0.25), c.mid],
    [{ x: B.x - 12, y: B.y + 18 }, dragA(1.8 - ls + tuck * 1.1 - lH * 0.25, m.trail * 0.1), dragA(1.62 - ll - tuck * 1.5, m.trail * 0.22), skin],
  ];
  for (const [hip, t1, t2, col] of legs) {
    const { H: ft } = limb(ctx, hip, t1, t2, 66, 60, 24, col, col === skin ? hexA('#ffffff', 0.12) : undefined);
    ctx.fillStyle = col;
    ctx.save();
    ctx.translate(ft.x, ft.y);
    ctx.rotate(t2 + 0.35);
    ctx.beginPath();
    ctx.ellipse(10, 0, 18, 7, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    // tornozeleira de ouro
    const an = pol(ft, t2 + Math.PI, 14);
    ctx.strokeStyle = gold;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(an.x + Math.cos(t2 + 1.57) * 12, an.y + Math.sin(t2 + 1.57) * 12);
    ctx.lineTo(an.x - Math.cos(t2 + 1.57) * 12, an.y - Math.sin(t2 + 1.57) * 12);
    ctx.stroke();
  }

  // ---- saiote (shendyt) plissado: a barra esvoaça para trás
  const sh = m.trail * 22 + wH * 14 + rH * 6 - lA * 6;
  const kY = B.y + 64 + m.rise * 8 * live;
  const hem: V[] = [];
  for (let i = 0; i <= 6; i++) {
    const u = i / 6;
    const wv = Math.sin(st.t * 3.6 - i * 0.9 + m.seed) * (2 + m.sp * 4);
    hem.push({ x: B.x + 48 - u * 102 + sh * (0.5 + 0.5 * (1 - u)) + wv * 0.4, y: kY + wv - u * 4 });
  }
  ctx.fillStyle = vgrad(ctx, B.y - 10, kY, c.tint('#f4ead8'), c.tint('#c8b890'));
  ctx.beginPath();
  ctx.moveTo(B.x - 36, B.y - 10);
  ctx.lineTo(B.x + 36, B.y - 10);
  ctx.lineTo(hem[0].x, hem[0].y);
  smoothPath(ctx, hem, false);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = goldD;
  ctx.lineWidth = 1.6;
  for (let i = 1; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(B.x - 32 + i * 11, B.y - 4);
    ctx.lineTo(hem[6 - i].x, hem[6 - i].y - 2);
    ctx.stroke();
  }
  // avental central dourado (pendente balança)
  const apA = Math.sin(st.t * 2.4 - 0.5) * 0.08 + m.trail * 0.2;
  ctx.fillStyle = gold;
  ctx.save();
  ctx.translate(B.x - 2, B.y - 6);
  ctx.rotate(-apA);
  poly3(ctx, -12, 0, 12, 0, 0, 74);
  ctx.fillStyle = c.tint(s.pal.glow);
  ctx.fillRect(-2, 10, 4, 40);
  ctx.restore();
  ctx.fillStyle = gold;
  ctx.fillRect(B.x - 38, B.y - 16, 76, 10);

  // ---- tronco musculoso escuro (respira)
  const br = k.b * 1.5;
  ctx.fillStyle = vgrad(ctx, B.y - 110, B.y, skinL, skin);
  ctx.beginPath();
  ctx.moveTo(B.x - 46 - br, B.y - 100);
  ctx.quadraticCurveTo(B.x, B.y - 112 - br, B.x + 46 + br, B.y - 100);
  ctx.quadraticCurveTo(B.x + 34, B.y - 50, B.x + 28, B.y - 12);
  ctx.lineTo(B.x - 30, B.y - 12);
  ctx.quadraticCurveTo(B.x - 36, B.y - 50, B.x - 46 - br, B.y - 100);
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2;
  ctx.stroke();
  // músculos (luz de contorno)
  ctx.strokeStyle = hexA(s.pal.glow, 0.15);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(B.x - 30, B.y - 70); ctx.quadraticCurveTo(B.x - 6, B.y - 62, B.x + 2, B.y - 74);
  ctx.moveTo(B.x - 18, B.y - 44); ctx.lineTo(B.x + 6, B.y - 44);
  ctx.moveTo(B.x - 16, B.y - 30); ctx.lineTo(B.x + 6, B.y - 30);
  ctx.stroke();
  // colar largo (usekh) em faixas
  for (let i = 3; i >= 0; i--) {
    ctx.fillStyle = i % 2 ? c.tint(s.pal.glow) : gold;
    ctx.beginPath();
    ctx.ellipse(B.x - 2, B.y - 100, 48 - i * 2, 16 + i * 8, 0, 0, Math.PI);
    ctx.fill();
  }
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(B.x - 2, B.y - 100, 22, 12, 0, 0, Math.PI);
  ctx.fill();

  // ---- cabeça de chacal: estabiliza, orelhas com atraso e tremidas
  const H = { x: headL.x, y: headL.y + k.b * 2 };
  const look = -lean * 0.6 - rA * 0.35 + rH * 0.55 + cA * 0.25 - cH * 0.1 + lA * 0.15 - lH * 0.2 + D.stag * 0.4 - D.fall * 0.5;
  const jaw = clamp(rH * 1.1 + rA * 0.15 + k.cast * imp * 0.5 + D.stag * 0.6 + k.die * 0.2);
  // orelhas: tremidinha a cada ~4 s, deitam para trás no voo rápido e na carga do grito
  const tw = (st.t / 4.1 + m.seed) % 1;
  const twitch = tw < 0.06 ? Math.sin((tw / 0.06) * Math.PI * 2) * 0.12 : 0;
  const earBack = m.fwd * 0.18 * live + rA * 0.45 - rH * 0.1 + Math.sin(st.t * 1.3 - 0.9) * 0.03 + D.fall * 0.5;
  ctx.save();
  ctx.translate(H.x, H.y);
  ctx.rotate(look);
  // pescoço
  ctx.fillStyle = skin;
  ctx.fillRect(-10, 0, 26, 34);
  for (const [ex, col, ph] of [[14, c.mid, 0.4], [2, skin, 0]] as const) {
    ctx.save();
    ctx.translate(ex + 4, -14);
    ctx.rotate(earBack + twitch * (ph ? 0.6 : 1) + Math.sin(st.t * 2 + ph) * 0.02);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(-14, -2);
    ctx.quadraticCurveTo(-6, -50, 2, -72);
    ctx.quadraticCurveTo(12, -40, 14, 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.moveTo(-6, -6);
    ctx.quadraticCurveTo(-2, -36, 2, -54);
    ctx.quadraticCurveTo(7, -30, 7, -4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // crânio
  ctx.fillStyle = vgrad(ctx, -26, 20, skinL, skin);
  ctx.beginPath();
  ctx.ellipse(6, -2, 24, 22, 0, 0, TAU);
  ctx.fill();
  // mandíbula de baixo
  ctx.save();
  ctx.translate(-8, 8);
  ctx.rotate(-jaw * 0.5);
  ctx.fillStyle = c.mid;
  ctx.beginPath();
  ctx.moveTo(0, -4);
  ctx.lineTo(-44, 2);
  ctx.lineTo(-40, 8);
  ctx.lineTo(4, 12);
  ctx.closePath();
  ctx.fill();
  if (jaw > 0.15) {
    ctx.fillStyle = '#e8e0d0';
    for (let i = 0; i < 4; i++) poly3(ctx, -38 + i * 9, 1, -34 + i * 9, 1, -36 + i * 9, -4);
  }
  ctx.restore();
  // focinho comprido
  ctx.fillStyle = vgrad(ctx, -16, 10, skinL, skin);
  ctx.beginPath();
  ctx.moveTo(-6, -16);
  ctx.quadraticCurveTo(-30, -14, -54, 0);
  ctx.quadraticCurveTo(-58, 6, -50, 8);
  ctx.lineTo(-4, 12);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(-53, 2, 3, 0, TAU);
  ctx.fill();
  if (jaw > 0.1) bloom(ctx, -30, 12, 28 * jaw, s.pal.glow, jaw * 0.8);
  // delineado egípcio + olho
  ctx.strokeStyle = gold;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-18, -8);
  ctx.lineTo(4, -8);
  ctx.lineTo(10, -2);
  ctx.stroke();
  const eo = (st.anim === 'death' ? 1 - st.p : 1) * m.blink;
  eyeGlow(ctx, -8, -8, 4.5 + st.rage * 1.5 + cA * 1.5, s.pal.eye, eo);
  // faixa dourada na testa
  ctx.fillStyle = gold;
  ctx.fillRect(-6, -22, 30, 5);
  ctx.restore();
  const mouthL = { x: H.x + Math.cos(look + Math.PI - 0.15) * 40, y: H.y + Math.sin(look + Math.PI - 0.15) * 40 + 10 };

  // ---- braço da frente segurando o cajado (was)
  const fw = Math.sin(st.t * 1.3 + 0.2) * 0.05;
  let f1 = 1.75 - fw - m.fwd * 0.1 * live, f2 = 2.2 - fw;
  let stA = -Math.PI / 2 + 0.06 + Math.sin(st.t * 1.3 - 0.5) * 0.04 + m.fwd * 0.08 * live;
  f1 = blend(k, k.cast, f1, 4.5, 3.05); f2 = blend(k, k.cast, f2, 4.6, 3.1); stA = blend(k, k.cast, stA, -1.62, -2.95);
  f1 = blend(k, k.roar, f1, 1.2, 3.9); f2 = blend(k, k.roar, f2, 3.6, 4.1); stA = blend(k, k.roar, stA, -3.0, -1.9);
  f1 = blend(k, k.slam, f1, 4.4, 2.0); f2 = blend(k, k.slam, f2, 4.6, 1.75); stA = blend(k, k.slam, stA, -1.6, -1.45);
  f1 = blend(k, k.swipe, f1, 0.8, 2.7); f2 = blend(k, k.swipe, f2, 0.6, 2.9); stA = blend(k, k.swipe, stA, -0.6, -3.6);
  f1 = blend(k, k.shoot, f1, 1.4, 3.05); f2 = blend(k, k.shoot, f2, 3.9, 3.1); stA = blend(k, k.shoot, stA, -1.7, -3.0);
  f1 = blend(k, k.charge, f1, 1.2, 3.0); f2 = blend(k, k.charge, f2, 2.0, 3.0); stA = blend(k, k.charge, stA, -1.2, -2.6);
  f1 += -D.stag * 1.2 - D.fall * 0.2; f2 += -D.stag * 1.0 + D.fall * 0.2; stA += D.stag * -0.4 - D.fall * 0.9;
  const fS = { x: B.x - 26, y: B.y - 90 };
  const fA = limb(ctx, fS, f1, f2, 56, 50, 18, skin, hexA('#ffffff', 0.12));
  ctx.strokeStyle = gold;
  ctx.lineWidth = 5;
  ctx.beginPath();
  const ar = pol(fS, f1, 30);
  ctx.moveTo(ar.x + Math.cos(f1 + 1.57) * 10, ar.y + Math.sin(f1 + 1.57) * 10);
  ctx.lineTo(ar.x - Math.cos(f1 + 1.57) * 10, ar.y - Math.sin(f1 + 1.57) * 10);
  ctx.stroke();
  const hand = fA.H;
  // na morte a mão solta o cajado, que escorrega e tomba para a frente
  const grip = { x: hand.x - D.fall * 24, y: hand.y + D.fall * 46 };
  const top = pol(grip, stA, 150);
  const bot = pol(grip, stA, -90);
  ctx.strokeStyle = goldD;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(bot.x, bot.y);
  ctx.lineTo(top.x, top.y);
  ctx.stroke();
  ctx.strokeStyle = gold;
  ctx.lineWidth = 5;
  ctx.stroke();
  // mão fechada sobre o cajado
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(hand.x, hand.y, 9, 0, TAU);
  ctx.fill();
  // cabeça do cajado (chacal estilizado) e forquilha
  ctx.save();
  ctx.translate(top.x, top.y);
  ctx.rotate(stA + Math.PI / 2);
  ctx.fillStyle = gold;
  ctx.beginPath();
  ctx.moveTo(4, 2);
  ctx.lineTo(-24, -6);
  ctx.lineTo(-20, -14);
  ctx.lineTo(6, -16);
  ctx.lineTo(10, -28);
  ctx.lineTo(12, -12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(bot.x, bot.y);
  ctx.rotate(stA + Math.PI / 2);
  ctx.strokeStyle = gold;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-8, 14); ctx.lineTo(0, 0); ctx.lineTo(8, 14);
  ctx.stroke();
  ctx.restore();
  ctx.restore();

  const topW = rot(top, B, lean), botW = rot(bot, B, lean);
  const sg = clamp(k.cast * (ant + hit) + k.shoot * (ant + hit) + st.rage * 0.2) * c.lit;
  orb(ctx, topW.x, topW.y, 14 + sg * 36 + k.cast * imp * 30, s.pal.glow, 0.4 + sg * 0.6);
  if (k.slam > 0) orb(ctx, botW.x, botW.y, 20 + (lH + imp) * 40, s.pal.accent, k.slam * (lH * 0.6 + imp));
  if (k.cast > 0) magicCircle(ctx, B.x, -6, 160 * clamp(ant + hit), s.pal.accent, k.cast * clamp(ant + hit) * 0.6, st.t + P * 3, 0.22);

  return {
    mouth: k.cast > 0 || k.shoot > 0 ? topW : rot(mouthL, B, lean),
    hand: k.slam > 0 ? botW : k.swipe > 0 ? topW : rot(hand, B, lean),
    core: rot({ x: B.x, y: B.y - 60 }, B, lean),
    top: Math.min(rot({ x: H.x, y: H.y - 86 }, B, lean).y, topW.y - 30, dc.y - dR - 16),
    halfW: 130,
  };
}

// ------------------------------------------------------------------ 3: OBERON

function oberon(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState, k: K, c: C, m: M): Anchors {
  const { ant, hit, imp } = k;
  const D = deathCurve(k.die);
  const live = 1 - D.fall;
  const P = k.p;
  const cA = k.cast * ant, cH = k.cast * hit;
  const rA = k.roar * ant, rH = k.roar * hit;
  const lA = k.slam * ant, lH = k.slam * hit;
  const wA = k.swipe * ant, wH = k.swipe * hit;
  const shake = (k.hold + st.rage * 0.15) * Math.sin(st.t * 48) * 2.5;
  // asas pesadas: batida mais lenta e mais ampla que as penas
  const ph = m.ph * 0.85;
  const flap = Math.sin(ph), dfl = Math.cos(ph);
  const beat = Math.sin(ph - 0.8) * (3 + m.sp * 7);
  const B: V = {
    x: shake - cA * 8 + cH * -16 + rA * 8 - lA * 6 - lH * 34 + wA * 14 - wH * 40 + D.stag * 16 + D.fall * 14,
    y: -172 + (m.y - Math.sin(m.ph - 0.7) * (2.5 + m.sp * 6) + beat) * live - lA * 44 + lH * 40 - cA * 10 + rA * 14 - rH * 20
      + imp * (k.slam * 22 + k.cast * 6) + D.fall * 112 - D.bounce,
  };
  const lean = m.tilt * live + cA * 0.12 - cH * 0.2 + rA * -0.12 + rH * 0.14 + lA * 0.08 - lH * 0.3 + wA * 0.15 - wH * 0.24
    + D.stag * 0.22 - D.fall * 0.32;
  const dark = clamp(0.5 + st.rage * 0.35 + k.atk * 0.5) * c.lit;
  const armor = c.body, armorD = c.dark;
  const edge = hexA(s.pal.accent, 0.35);

  // ---- asas de morcego: fecham na subida, abrem na descida; dedos atrasam
  const wOpen = clamp(0.38 + flap * 0.12 * live + m.sp * 0.1 + rH * 0.62 - rA * 0.35 + lA * 0.55 - lH * 0.1 + cA * 0.15 - D.fall * 0.4 - D.stag * -0.3);
  const wRoot = rot({ x: B.x + 20, y: B.y - 92 }, B, lean);
  const wingA = -0.25 - wOpen * 0.5 - flap * (0.2 + m.sp * 0.3) * live - lA * 0.35 + lH * 0.75 + rA * 0.45 + cH * 0.2 + D.fall * 0.9;
  for (const side of [0, 1]) {
    ctx.save();
    ctx.translate(wRoot.x, wRoot.y);
    if (side === 0) ctx.scale(-0.8, 0.9);
    ctx.rotate(wingA + (side ? 0 : 0.1) + (side ? -m.fwd * 0.08 : m.fwd * 0.12) * live);
    const fold = clamp(1 - wOpen + dfl * 0.3 * live);
    batWing(ctx, 125 + wOpen * 70, c.tint(mixHex(s.pal.dark, s.pal.accent, side ? 0.2 : 0.09)), armorD, hexA(s.pal.accent, 0.6), fold,
      dfl * 0.35 * live + imp * k.slam * 0.4 + D.fall * 0.4);
    ctx.restore();
  }

  // ---- capa rasgada: pesada, chega atrasada e se enche de ar no mergulho
  const capeT = m.trail + 0.15 + wH * 0.5 + lH * -0.2 + rH * 0.4 - D.fall * 0.4;
  const flow = Math.sin(st.t * 1.8) * 8;
  ctx.save();
  ctx.translate(B.x, B.y);
  ctx.rotate(lean);
  ctx.translate(-B.x, -B.y);
  const cTop = B.y - 100;
  const hemY = B.y + 168 + m.rise * 16 * live - lH * 46 - rH * 14 + cA * 6 - D.fall * 70;
  const sh = capeT * 70 + lH * 20;
  const hem: V[] = [];
  for (let i = 0; i <= 10; i++) {
    const u = i / 10;
    const wv = Math.sin(st.t * 2.1 - i * 0.65 + m.seed * 3) * (5 + m.sp * 8 + lH * 10);
    const tear = i % 2 ? 22 + ((i * 7) % 13) : 0;
    hem.push({ x: B.x + 132 - u * 160 + sh * (0.55 + 0.45 * (1 - u)) + flow * (1 - u) + wv * 0.4, y: hemY - tear + wv - (1 - u) * 6 });
  }
  ctx.fillStyle = vgrad(ctx, cTop, hemY, c.tint(mixHex(s.pal.dark, s.pal.accent, 0.28)), armorD);
  ctx.beginPath();
  ctx.moveTo(B.x - 30, cTop);
  ctx.lineTo(B.x + 40, cTop);
  ctx.quadraticCurveTo(B.x + 96 + sh * 0.5 + flow, B.y + 30, hem[0].x, hem[0].y);
  for (const p of hem) ctx.lineTo(p.x, p.y);
  ctx.quadraticCurveTo(B.x - 14 + sh * 0.2, B.y + 40, B.x - 30, cTop);
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 2;
  ctx.stroke();
  // forro vermelho aparecendo na dobra
  ctx.strokeStyle = hexA(s.pal.accent, 0.4);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(B.x + 40, cTop + 4);
  ctx.quadraticCurveTo(B.x + 92 + sh * 0.5 + flow, B.y + 30, hem[0].x - 4, hem[0].y - 8);
  ctx.stroke();

  // ---- braço de trás
  const sw = Math.sin(st.t * 1.3 + 0.7) * 0.06;
  let b1 = 1.75 + sw - m.fwd * 0.2 * live, b2 = 1.95 + sw - m.fwd * 0.25 * live;
  b1 = blend(k, k.cast, b1, 4.53, 2.6); b2 = blend(k, k.cast, b2, 4.68, 2.4);
  b1 = blend(k, k.slam, b1, 4.5, 2.0); b2 = blend(k, k.slam, b2, 4.6, 1.9);
  b1 = blend(k, k.roar, b1, 2.0, -0.6); b2 = blend(k, k.roar, b2, 3.4, -0.4);
  b1 = blend(k, k.swipe, b1, 0.4, 1.5); b2 = blend(k, k.swipe, b2, 0.2, 1.8);
  b1 = blend(k, k.shoot, b1, 0.8, 0.5); b2 = blend(k, k.shoot, b2, 0.5, 0.3);
  b1 += -D.stag * 1.4 + D.fall * 0.2; b2 += -D.stag * 1.2;
  const bS = { x: B.x + 22, y: B.y - 88 };
  const bA = limb(ctx, bS, b1, b2, 56, 54, 20, armorD);

  // ---- pernas blindadas pendendo (sabatons em ponta)
  const tuck = lA * 0.9 + rA * 0.5 + D.stag * 0.3 - lH * 0.3;
  const ls = Math.sin(st.t * 1.1 + m.seed * 3) * 0.07 * live;
  const ll = Math.sin(st.t * 1.1 + m.seed * 3 - 0.8) * 0.1 * live;
  const legs: [V, number, number, string][] = [
    [{ x: B.x + 14, y: B.y + 4 }, dragA(1.6 + ls + tuck * 0.9, m.trail * 0.12), dragA(1.7 + ll - tuck * 1.3, m.trail * 0.25), armorD],
    [{ x: B.x - 14, y: B.y + 4 }, dragA(1.82 - ls + tuck * 1.1, m.trail * 0.1), dragA(1.62 - ll - tuck * 1.5, m.trail * 0.22), armor],
  ];
  for (const [hip, t1, t2, col] of legs) {
    const { E: kn, H: ft } = limb(ctx, hip, t1, t2, 80, 74, 28, col, col === armor ? hexA('#ffffff', 0.1) : undefined);
    // sabaton pontudo
    ctx.fillStyle = col;
    ctx.save();
    ctx.translate(ft.x, ft.y);
    ctx.rotate(t2 + 0.3);
    ctx.beginPath();
    ctx.moveTo(-10, -12);
    ctx.lineTo(30, 0);
    ctx.lineTo(-10, 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // joelheira com espinho
    ctx.fillStyle = c.accent;
    ctx.save();
    ctx.translate(kn.x, kn.y);
    ctx.rotate(t1);
    poly3(ctx, -6, -12, 10, -12, 6, -30);
    ctx.restore();
  }

  // ---- tronco de armadura (respira)
  const br = k.b * 1.5;
  ctx.fillStyle = vgrad(ctx, B.y - 110, B.y + 20, c.light, armorD);
  ctx.beginPath();
  ctx.moveTo(B.x - 50 - br, B.y - 104);
  ctx.lineTo(B.x + 50 + br, B.y - 104);
  ctx.quadraticCurveTo(B.x + 40, B.y - 50, B.x + 26, B.y - 14);
  ctx.lineTo(B.x + 34, B.y + 10);
  ctx.lineTo(B.x - 36, B.y + 10);
  ctx.lineTo(B.x - 28, B.y - 14);
  ctx.quadraticCurveTo(B.x - 42, B.y - 50, B.x - 50 - br, B.y - 104);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = hexA(s.pal.accent, 0.4 + dark * 0.5);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(B.x - 30, B.y - 90); ctx.lineTo(B.x - 2, B.y - 40); ctx.lineTo(B.x + 30, B.y - 90);
  ctx.moveTo(B.x - 2, B.y - 40); ctx.lineTo(B.x - 2, B.y + 4);
  ctx.stroke();
  // gema no peito (pulsa como um coração)
  const pulse = 0.7 + 0.3 * Math.max(0, Math.sin(st.t * 3.2)) ** 4;
  bloom(ctx, B.x - 2, B.y - 52, 30 + rH * 20, s.pal.accent, dark * 0.7 * pulse);
  ctx.fillStyle = c.tint(s.pal.accent);
  ctx.beginPath();
  ctx.moveTo(B.x - 2, B.y - 62); ctx.lineTo(B.x + 7, B.y - 52); ctx.lineTo(B.x - 2, B.y - 42); ctx.lineTo(B.x - 11, B.y - 52);
  ctx.fill();
  // cinto com fivela
  ctx.fillStyle = armorD;
  ctx.fillRect(B.x - 38, B.y - 4, 74, 12);
  ctx.fillStyle = c.accent;
  ctx.fillRect(B.x - 8, B.y - 3, 12, 10);

  // ---- cabeça com chifres (estabiliza; joga para trás no grito)
  const H = { x: B.x - 6, y: B.y - 128 + k.b * 2 };
  const look = -lean * 0.6 - rA * 0.45 + rH * 0.5 + cA * 0.2 - cH * 0.15 + lA * 0.2 - lH * 0.3 + D.stag * 0.45 - D.fall * 0.5;
  ctx.save();
  ctx.translate(H.x, H.y);
  ctx.rotate(look);
  const hornN = Math.max(0, Math.min(4, s.feat.horns ?? 2));
  for (let i = 0; i < hornN; i++) {
    const back = i % 2 === 1;
    ctx.fillStyle = back ? c.tint('#3a2a3a') : c.tint('#5a4a5a');
    ctx.save();
    ctx.translate(back ? 12 : 0, -14);
    ctx.scale(1 + i * 0.1, 1 + i * 0.1);
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.bezierCurveTo(-20, -40, 20, -50, 30, -82);
    ctx.bezierCurveTo(18, -46, 0, -40, 10, 0);
    ctx.closePath();
    ctx.fill();
    // anéis do chifre
    ctx.strokeStyle = hexA('#000000', 0.25);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let j = 1; j < 4; j++) {
      const y = -j * 14;
      ctx.moveTo(-8 + j * 2, y);
      ctx.lineTo(8 + j * 4, y - 4);
    }
    ctx.stroke();
    ctx.restore();
  }
  // cabelo escuro longo com atraso
  const hairT = m.trail + rH * 0.5 - look * 0.6 + 0.1;
  const hp = chain({ x: 14, y: -14 }, 6, 64, Math.PI / 2 - 0.3, hairT, st.t, m.seed * 2, 0.22 + m.sp * 0.12, 2.4);
  ribbon(ctx, hp, 22, 3, armorD);
  ctx.fillStyle = vgrad(ctx, -24, 24, c.tint('#c8b8d8'), c.tint('#6a5a7a'));
  ctx.beginPath();
  ctx.moveTo(-18, -16);
  ctx.quadraticCurveTo(4, -26, 16, -10);
  ctx.lineTo(14, 16);
  ctx.quadraticCurveTo(-4, 28, -12, 20);
  ctx.lineTo(-16, 10);
  ctx.lineTo(-24, 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = armorD;
  ctx.beginPath();
  ctx.moveTo(-14, -18);
  ctx.quadraticCurveTo(20, -30, 24, 0);
  ctx.quadraticCurveTo(26, 16, 18, 24);
  ctx.quadraticCurveTo(10, 8, 6, -6);
  ctx.quadraticCurveTo(-4, -10, -14, -18);
  ctx.fill();
  const eo = (st.anim === 'death' ? 1 - st.p : 1) * m.blink;
  eyeGlow(ctx, -12, -2, 4.5 + st.rage * 2 + rH * 2, s.pal.eye, eo);
  const mo = clamp(rH * 1.2 + D.stag + k.cast * imp * 0.5);
  if (mo > 0.08) {
    ctx.fillStyle = '#200010';
    ctx.beginPath();
    ctx.ellipse(-13, 13, 5, 7 * mo, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // ---- ombreiras com espinhos (por cima do pescoço)
  for (const [sx, col] of [[24, armorD], [-30, armor]] as const) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(B.x + sx, B.y - 98, 28, 18, 0, Math.PI, TAU);
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = c.accent;
    poly3(ctx, B.x + sx - 8, B.y - 110, B.x + sx + 4, B.y - 112, B.x + sx - 6, B.y - 134);
  }

  // ---- braço da frente com garras
  let f1 = 1.95 - sw - m.fwd * 0.15 * live, f2 = 2.5 - sw - m.fwd * 0.2 * live;
  f1 = blend(k, k.cast, f1, 2.9, 2.2); f2 = blend(k, k.cast, f2, 3.0, 1.6);
  f1 = blend(k, k.slam, f1, 4.6, 2.2); f2 = blend(k, k.slam, f2, 4.7, 2.0);
  f1 = blend(k, k.roar, f1, 1.2, 3.7); f2 = blend(k, k.roar, f2, -0.9, 3.9);
  f1 = blend(k, k.swipe, f1, 0.5, 2.6); f2 = blend(k, k.swipe, f2, 0.3, 2.9);
  f1 = blend(k, k.shoot, f1, 1.3, 3.1); f2 = blend(k, k.shoot, f2, 4.1, 3.14);
  f1 = blend(k, k.charge, f1, 0.9, 3.0); f2 = blend(k, k.charge, f2, 1.3, 3.05);
  f1 += -D.stag * 2.0 - D.fall * 0.3; f2 += -D.stag * 1.8 - D.fall * 0.5;
  const fS = { x: B.x - 32, y: B.y - 92 };
  const fA = limb(ctx, fS, f1, f2, 58, 56, 22, armor, hexA('#ffffff', 0.12));
  const hand = fA.H;
  ctx.fillStyle = c.tint('#c8b8d8');
  const curl = lA * 0.3 + rA * 0.2 - rH * 0.2;
  for (let i = -1; i <= 1; i++) {
    const a = f2 + i * (0.4 - curl);
    poly3(ctx, hand.x + Math.cos(a + 1.2) * 4, hand.y + Math.sin(a + 1.2) * 4, hand.x + Math.cos(a) * 26, hand.y + Math.sin(a) * 26, hand.x + Math.cos(a - 1.2) * 4, hand.y + Math.sin(a - 1.2) * 4);
  }
  ctx.restore();

  const handW = rot(hand, B, lean), bhW = rot(bA.H, B, lean);
  // energia sombria nas mãos: o cometa nasce acima da mão de trás e é arremessado
  const hg = clamp(k.slam * (ant * 0.5 + hit) + k.shoot * (ant + hit) * 0.8 + st.rage * 0.15) * c.lit;
  orb(ctx, handW.x, handW.y, 14 + hg * 40 + k.slam * imp * 30, s.pal.glow, 0.3 + hg * 0.7);
  const cg = k.cast * clamp(ant * 1.2 + hit * (1 - sm(0.5, 0.6, P))) * c.lit;
  if (cg > 0.02) {
    orb(ctx, bhW.x, bhW.y - 10, 18 + cg * 40 + Math.sin(st.t * 30) * 3 * k.hold, s.pal.glow, cg);
    orb(ctx, bhW.x, bhW.y - 10, 8 + cg * 14, s.pal.accent, cg, '#000000');
  }

  // ---- coroa quebrada flutuando: segue a cabeça com atraso e cai na morte
  const headW = rot(H, B, lean);
  const cr: V = {
    x: headW.x + 4 + Math.sin(st.t * 0.9) * 6 + m.trail * 16 - sm(0.3, 1, k.die) * 60,
    y: headW.y - 92 + Math.sin(st.t * 1.3) * 6 - rH * 28 + rA * 8 - lA * 10 + lH * 20 + m.rise * 10 * live
      // na morte a coroa despenca até o chão
      + easeIn(sm(0.3, 0.8, k.die)) * 360 - (k.die > 0.8 ? Math.sin(((k.die - 0.8) / 0.2) * Math.PI) * 18 : 0),
  };
  const crRot = 0.25 + Math.sin(st.t * 0.7) * 0.12 + k.cast * (ant + hit) * 0.5 + m.trail * 0.2 + rH * Math.sin(st.t * 12) * 0.2 + k.die * 1.6;
  bloom(ctx, cr.x, cr.y, 50 + rH * 30, s.pal.accent, dark * 0.5);
  ctx.save();
  ctx.translate(cr.x, cr.y);
  ctx.rotate(crRot);
  ctx.fillStyle = vgrad(ctx, -22, 10, c.tint('#fff2b0'), c.tint('#c8963a'));
  ctx.beginPath();
  ctx.moveTo(-30, 10); ctx.lineTo(-32, -14); ctx.lineTo(-22, -4); ctx.lineTo(-14, -24); ctx.lineTo(-6, -6); ctx.lineTo(-2, 10);
  ctx.closePath();
  ctx.fill();
  // metade direita separada pela rachadura (abre mais no grito)
  ctx.save();
  ctx.translate(8 + Math.sin(st.t * 1.1) * 2 + rH * 10 + k.die * 14, 4);
  ctx.rotate(0.3 + rH * 0.3 + k.die * 0.6);
  ctx.beginPath();
  ctx.moveTo(0, 6); ctx.lineTo(2, -8); ctx.lineTo(10, -24); ctx.lineTo(16, -4); ctx.lineTo(26, -14); ctx.lineTo(26, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = c.tint(s.pal.accent);
  ctx.beginPath();
  ctx.arc(-16, 2, 3.5, 0, TAU);
  ctx.fill();
  ctx.restore();
  // lascas caindo da coroa
  for (let i = 0; i < 3; i++) {
    const q = (st.t * 0.5 + i / 3) % 1;
    ctx.fillStyle = hexA('#ffcc66', (1 - q) * 0.8);
    ctx.fillRect(cr.x + 6 + i * 6, cr.y + 10 + q * 50, 3, 3);
  }

  return {
    mouth: k.cast > 0 ? { x: bhW.x, y: bhW.y - 10 } : k.shoot > 0 ? handW : rot({ x: H.x - 14, y: H.y + 10 }, B, lean),
    hand: k.cast > 0 ? bhW : handW,
    core: rot({ x: B.x, y: B.y - 50 }, B, lean),
    top: Math.min(cr.y - 30, headW.y - 90),
    halfW: 150,
  };
}
