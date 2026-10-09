/**
 * INSETO 2 — ARANHA TECELÃ DA NOITE (Aracnara).
 * 8 pernas longas com joelhos acima do corpo, marcha tetrápode rápida e precisa,
 * corpo suspenso que quase não balança, abdômen pulsando, palpos e presas tremendo.
 */
import type { BossSpec } from '@gymbattle/shared';
import type { Anchors, DrawState, V } from '../types';
import { TAU, clamp, eyeGlow, hexA, magicCircle, mixHex, orb, rgrad, sm, vgrad } from '../util';
import {
  add, beatAt, bloom, colors, fidget, footShadows, gaitBob, gaitOf, idHash, leg, lerp, limb, poseW, rot, stepFoot, NOBEAT,
} from './insect-rig';

const PIV: V = { x: 20, y: -150 };

export function spider(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState): Anchors {
  const c = colors(s, st);
  const w = poseW(st);
  const p = st.p;
  const bt = st.anim === 'attack' ? beatAt(p) : NOBEAT;
  const { ant: a, hit: h, imp: im } = bt;
  const die = st.anim === 'death' ? p : 0;
  const seed = idHash(s.id);
  const G = gaitOf(st, 1, 32, 0.6);
  const br = Math.sin(st.t * 1.8);
  const glowA = clamp(0.55 + st.rage * 0.4 + w.on * (a + h) * 0.4) * (1 - die);
  const idle = (1 - G.mv) * (1 - w.on * 0.7) * (1 - die);

  // ---------------------------------------------------------------- corpo suspenso
  let ox = 0, oy = 0, pitch = 0;
  oy += gaitBob(G, 4) + br * 3;
  pitch += Math.sin(G.g * TAU) * 0.012 * G.mv - 0.03 * G.mv * G.dir;
  ox += -G.dir * G.mv * 6 + Math.sin(st.t * 0.7) * 3 * idle;
  // tiro (teia/ácido): empina, depois cospe para a frente com recuo
  ox += w.shoot * (a * 14 - h * 16 + im * 10) + w.cast * a * 8;
  oy += w.shoot * (-a * 10 + h * 6) + w.cast * -a * 14;
  pitch += w.shoot * (a * 0.24 - h * 0.12) + w.cast * (a + h) * 0.16;
  // ninhada (rugido): empina alto, patas abertas, tremendo
  oy += w.roar * (-a * 26 - h * 20);
  pitch += w.roar * (a * 0.3 + h * 0.22);
  ox += w.roar * (a + h) * Math.sin(st.t * 58) * 2.2;
  // bote: agacha (antecipação) e salta para a frente cravando as presas
  const pounce = w.charge * Math.sin(Math.PI * sm(0.4, 0.556, p)) * (1 - sm(0.556, 0.56, p));
  ox += w.charge * (a * 26 - h * 70) + w.swipe * (a * 12 - h * 30) + w.slam * (a * 8 - h * 18);
  oy += w.charge * (a * 50 - pounce * 40 + im * 30 + h * 18) + w.slam * (-a * 18 + h * 16);
  pitch += w.charge * (a * 0.1 - h * 0.18) + w.slam * (a * 0.26 - h * 0.12) + w.swipe * (a * 0.12 - h * 0.08);
  ox += im * Math.sin(p * 150) * 3;
  // dano
  ox += st.hurt * 18;
  oy -= st.hurt * 10;
  pitch += st.hurt * 0.1;
  // morte: as pernas cedem, o corpo despenca e quica
  if (die > 0) {
    ox += sm(0, 0.18, die) * 12 + Math.sin(die * 34) * 6 * (1 - sm(0.2, 0.4, die));
    oy += 90 * Math.pow(sm(0.2, 0.6, die), 2) - 10 * Math.sin(Math.PI * sm(0.6, 0.76, die));
    pitch += 0.2 * sm(0, 0.18, die) * (1 - sm(0.25, 0.5, die)) - 0.08 * sm(0.4, 0.7, die);
  }
  const hang = -150;
  const Bf = (q: V): V => add(rot(q, PIV, pitch), ox, oy);

  // ---------------------------------------------------------------- teia ao fundo (some quando anda)
  const webA = (0.26 + w.cast * (a + h) * 0.4 + w.shoot * a * 0.15) * (1 - G.mv * 0.75) * (1 - die);
  if (webA > 0.02) {
    ctx.save();
    ctx.globalAlpha = webA;
    ctx.strokeStyle = '#e8e0f8';
    ctx.lineWidth = 1.2;
    const wc: V = { x: 70, y: -250 + Math.sin(st.t * 0.9) * 3 };
    const sway = Math.sin(st.t * 0.9) * 0.03;
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const an = (i / 9) * TAU + 0.2 + sway;
      ctx.moveTo(wc.x, wc.y);
      ctx.lineTo(wc.x + Math.cos(an) * 170, wc.y + Math.sin(an) * 120);
    }
    for (let r = 1; r <= 4; r++) {
      for (let i = 0; i <= 9; i++) {
        const an = (i / 9) * TAU + 0.2 + sway;
        const x = wc.x + Math.cos(an) * r * 38, y = wc.y + Math.sin(an) * r * 27;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.quadraticCurveTo(wc.x + Math.cos(an - 0.35) * r * 32, wc.y + Math.sin(an - 0.35) * r * 23 + 3, x, y);
      }
    }
    ctx.stroke();
    ctx.restore();
    if (w.cast > 0) magicCircle(ctx, wc.x, wc.y, 150 * clamp(a + h), s.pal.accent, clamp(a + h) * 0.7, st.t * 1.5, 0.75);
  }
  // fio de seda que sobe do abdômen (balança com atraso)
  const silkFrom = Bf({ x: 120, y: hang - 70 });
  const silkTopX = silkFrom.x + G.dir * G.mv * 30 + Math.sin(st.t * 1.2) * 6;
  ctx.strokeStyle = hexA('#e8e0f8', 0.5 * (1 - die));
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(silkFrom.x, silkFrom.y);
  ctx.quadraticCurveTo(silkFrom.x + (silkTopX - silkFrom.x) * 0.3, silkFrom.y - 140, silkTopX, -440);
  ctx.stroke();

  // ---------------------------------------------------------------- pernas
  const nearF = [-226, -140, 116, 206], farF = [-186, -92, 70, 168];
  const spread = 1 + sm(0.2, 0.6, die) * 0.2;
  const curl = sm(0.58, 0.95, die);
  const legOf = (i: number, near: boolean) => {
    const hip = Bf({ x: -40 + i * 16 + (near ? 0 : 8), y: hang + (near ? 6 : -6) });
    const ph = ((i + (near ? 0 : 1)) % 2) * 0.5 - i * 0.045;
    let f: V = stepFoot(G, (near ? nearF : farF)[i] * spread, ph);
    f = add(f, 0, -fidget(st, i + (near ? 0 : 4), 8, Math.floor(seed * 71), idle) * 20);
    // patas da frente viram armas
    let up = 0, tgt: V = f;
    const T = (wt: number, wa: V, wh: V) => {
      if (wt <= 0) return;
      const at = { x: lerp(lerp(f.x, hip.x + wa.x, a), hip.x + wh.x, h), y: lerp(lerp(f.y, hip.y + wa.y, a), wh.y > 900 ? -4 : hip.y + wh.y, h) };
      tgt = { x: lerp(tgt.x, at.x, wt), y: lerp(tgt.y, at.y, wt) };
      up = Math.max(up, wt);
    };
    const fk = i === 0 ? 1 : i === 1 ? 0.55 : 0;
    if (fk > 0) {
      const sd = near ? 1 : 0.7;
      T(w.roar * fk, { x: -190 * sd, y: -160 - (near ? 0 : 60) }, { x: -210 * sd, y: -190 - (near ? 0 : 40) });
      T(w.charge * fk, { x: -90, y: -210 }, { x: -250 * sd, y: 999 });
      T(w.shoot * fk, { x: -150, y: -160 - (near ? 0 : 40) }, { x: -230, y: -80 - (near ? 0 : 60) });
      T(w.cast * fk, { x: -170, y: -170 }, { x: -200, y: -150 });
      T(w.swipe * fk, { x: -50, y: -230 }, { x: -250 * sd, y: 999 });
      T(w.slam * fk, { x: -100, y: -220 }, { x: -210, y: 999 });
      // tremor das patas erguidas
      tgt.y += up * (a + h) * Math.sin(st.t * 37 + i + (near ? 0 : 2)) * 3;
      f = tgt;
    }
    if (curl > 0) {
      // aranha morta: patas se dobram para dentro, tremendo
      const out = f.x < hip.x ? -1 : 1;
      const tw = Math.sin(st.t * 30 + i * 1.9) * 6 * sm(0.6, 0.7, die) * (1 - sm(0.86, 1, die));
      f = { x: lerp(f.x, hip.x + out * 40, curl), y: lerp(f.y, Math.min(-6, hip.y + 26) + tw, curl) };
    }
    // joelho alto acima do corpo (a perna abre para o lado: silhueta clássica de aranha);
    // patas erguidas usam a IK de verdade
    const kneeFn = (ank: V, ikK: V): V => {
      const dx = ank.x - hip.x;
      const kh = 36 + 0.4 * Math.sqrt(Math.max(0, 300 * 300 - dx * dx)) - sm(0.2, 0.6, die) * 30;
      const kk = { x: hip.x + dx * 0.42, y: Math.min(hip.y, ank.y) - kh };
      return { x: lerp(kk.x, ikK.x, up), y: lerp(kk.y, ikK.y, up) };
    };
    return { hip, f, kneeFn };
  };
  const near = [0, 1, 2, 3].map((i) => legOf(i, true));
  const far = [0, 1, 2, 3].map((i) => legOf(i, false));
  footShadows(ctx, [...near, ...far].map((l) => l.f), 9);
  const farLook = { w: 12, fill: mixHex(c.body, c.accent, 0.08), line: c.line, joint: mixHex(c.accent, c.dark, 0.55), spikes: 3, tars: 16 };
  const nearLook = { w: 16, fill: mixHex(mixHex(c.body, '#ffffff', 0.1), c.accent, 0.15), line: c.line, hi: hexA(c.accent, 0.55), joint: mixHex(c.accent, c.body, 0.25), spikes: 3, tars: 18 };
  for (let i = 3; i >= 0; i--) leg(ctx, far[i].hip, far[i].f, 150, 168, farLook, false, far[i].kneeFn);

  // ---------------------------------------------------------------- abdômen (atrasa e pulsa)
  ctx.save();
  ctx.translate(ox, oy);
  ctx.translate(PIV.x, PIV.y);
  ctx.rotate(pitch);
  ctx.translate(-PIV.x, -PIV.y);
  const ab: V = { x: 92, y: hang - 30 };
  const abTilt = -0.35 + Math.sin(G.g * 4 * Math.PI - 1.4) * 0.04 * G.mv + Math.sin(st.t * 1.1) * 0.03 - w.roar * (a + h) * 0.2
    + st.hurt * 0.1 + w.charge * (a * -0.1 + h * 0.15);
  const pulse = 0.6 + 0.4 * Math.sin(st.t * 2.4) + w.roar * (a + h) * 0.6 * (0.5 + 0.5 * Math.sin(st.t * 14));
  const swell = 1 + Math.sin(st.t * 1.8) * 0.025 + w.roar * (a + h) * 0.06;
  ctx.save();
  ctx.translate(ab.x, ab.y);
  ctx.rotate(abTilt);
  ctx.scale(swell, swell);
  ctx.fillStyle = c.line;
  ctx.beginPath();
  ctx.ellipse(0, 0, 101, 85, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = rgrad(ctx, -24, -38, 130, mixHex(c.body, '#ffffff', 0.16), c.dark);
  ctx.beginPath();
  ctx.ellipse(0, 0, 98, 82, 0, 0, TAU);
  ctx.fill();
  // pelos na borda
  ctx.strokeStyle = hexA(mixHex(c.accent, c.body, 0.6), 0.5);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 22; i++) {
    const an = -2.6 + i * 0.16;
    const r = 98 + Math.sin(st.t * 3 + i) * 1.5;
    ctx.moveTo(Math.cos(an) * 94, Math.sin(an) * 78);
    ctx.lineTo(Math.cos(an) * (r + 7), Math.sin(an) * (r * 0.84 + 6));
  }
  ctx.stroke();
  ctx.globalAlpha = glowA * (0.65 + 0.35 * pulse);
  ctx.fillStyle = s.pal.accent;
  ctx.beginPath();
  ctx.moveTo(-30, -14); ctx.lineTo(-6, 0); ctx.lineTo(-30, 14); ctx.lineTo(-20, 0);
  ctx.moveTo(8, -12); ctx.lineTo(30, 0); ctx.lineTo(8, 12); ctx.lineTo(16, 0);
  ctx.fill();
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(40 + i * 16, -30 + i * 6);
    ctx.lineTo(54 + i * 16, -40 + i * 7);
    ctx.lineTo(48 + i * 16, -24 + i * 5);
    ctx.moveTo(40 + i * 16, 30 - i * 6);
    ctx.lineTo(54 + i * 16, 40 - i * 7);
    ctx.lineTo(48 + i * 16, 24 - i * 5);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = hexA('#ffffff', 0.1);
  ctx.beginPath();
  ctx.ellipse(-20, -50, 46, 14, -0.3, 0, TAU);
  ctx.fill();
  // fiandeiras
  ctx.fillStyle = c.dark;
  ctx.beginPath();
  ctx.ellipse(84, 40, 12, 8, -0.4, 0, TAU);
  ctx.fill();
  ctx.restore();
  bloom(ctx, ab.x - 10, ab.y, 70, s.pal.glow, glowA * 0.35 * pulse);
  // pedicelo
  ctx.fillStyle = c.dark;
  ctx.beginPath();
  ctx.ellipse(8, hang - 6, 22, 16, -0.3, 0, TAU);
  ctx.fill();
  ctx.restore();

  // ---------------------------------------------------------------- pernas da frente
  for (let i = 3; i >= 0; i--) leg(ctx, near[i].hip, near[i].f, 156, 174, nearLook, false, near[i].kneeFn);

  // ---------------------------------------------------------------- cefalotórax, palpos, presas e olhos
  ctx.save();
  ctx.translate(ox, oy);
  ctx.translate(PIV.x, PIV.y);
  ctx.rotate(pitch);
  ctx.translate(-PIV.x, -PIV.y);
  const ce: V = { x: -46, y: hang + 4 };
  ctx.fillStyle = c.line;
  ctx.beginPath();
  ctx.ellipse(ce.x, ce.y, 63, 47 + br * 0.6, -0.1, 0, TAU);
  ctx.fill();
  ctx.fillStyle = vgrad(ctx, ce.y - 48, ce.y + 40, mixHex(c.body, '#ffffff', 0.16), c.dark);
  ctx.beginPath();
  ctx.ellipse(ce.x, ce.y, 60, 44 + br * 0.6, -0.1, 0, TAU);
  ctx.fill();
  // sulco central e brilho
  ctx.strokeStyle = hexA(c.accent, 0.35);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ce.x - 30, ce.y - 30);
  ctx.quadraticCurveTo(ce.x + 10, ce.y - 46, ce.x + 50, ce.y - 18);
  ctx.stroke();
  ctx.fillStyle = hexA('#ffffff', 0.12);
  ctx.beginPath();
  ctx.ellipse(ce.x - 6, ce.y - 28, 30, 8, -0.15, 0, TAU);
  ctx.fill();
  // palpos (bracinhos da frente: tateiam o ar sem parar)
  const fang = clamp(w.shoot * (a * 0.4 + h) + w.charge * (a * 0.5 + h) + w.roar * (a + h) * 0.7 + st.hurt * 0.6 + die * 0.4);
  for (const [dx, col, ph] of [[10, c.dark, 1.3], [0, c.body, 0]] as const) {
    const base = { x: ce.x - 52 + dx, y: ce.y + 8 };
    const pa = -2.5 + Math.sin(st.t * 3.1 + ph) * 0.2 + Math.sin(st.t * 11 + ph) * 0.05 - fang * 0.5 + G.mv * Math.sin(G.g * TAU * 2 + ph) * 0.2;
    const k1 = { x: base.x + Math.cos(pa) * 30, y: base.y + Math.sin(pa) * 30 };
    const k2 = { x: k1.x + Math.cos(pa + 1.9) * 28, y: k1.y + Math.sin(pa + 1.9) * 28 };
    limb(ctx, base, k1, 9, 8, col, c.line);
    limb(ctx, k1, k2, 8, 6, col, c.line);
  }
  // presas (quelíceras) que tremem
  const chatter = Math.sin(st.t * 21) * 0.05;
  for (const [dx, col] of [[8, c.dark], [0, c.body]] as const) {
    ctx.save();
    ctx.translate(ce.x - 66 + dx, ce.y + 22);
    ctx.rotate(0.3 + fang * 0.6 - dx * 0.04 + chatter * (dx ? -1 : 1));
    ctx.fillStyle = c.line;
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 20, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 18, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = c.T('#e8e0f8');
    ctx.beginPath();
    ctx.moveTo(-6, 12);
    ctx.quadraticCurveTo(-8, 32, 4, 40);
    ctx.quadraticCurveTo(0, 26, 6, 12);
    ctx.fill();
    ctx.restore();
  }
  // 8 olhos (piscam em sequência)
  const er = 1 + st.rage * 0.3 + w.roar * h * 0.4;
  const eyes: [number, number, number][] = [[-96, -10, 8], [-80, -14, 8], [-104, -24, 4.5], [-88, -30, 5], [-72, -30, 4.5], [-110, -8, 3.5], [-64, -20, 4], [-98, 2, 3]];
  const n = s.feat.eyes ?? 8;
  for (let i = 0; i < Math.min(n, eyes.length); i++) {
    const [x, y, r] = eyes[i];
    const bk = (st.t * 0.6 + seed * 3) % 4 - i * 0.03;
    const eo = st.anim === 'death' ? 1 - die : bk > 0 && bk < 0.08 ? 0.15 : 1;
    eyeGlow(ctx, ce.x + x + 50, ce.y + y, r * er, s.pal.eye, eo);
  }
  ctx.restore();
  const mouthL = Bf({ x: ce.x - 66, y: ce.y + 40 });

  // brilho da teia/ácido na boca
  const web = w.shoot * clamp(a + h);
  if (web > 0.05) orb(ctx, mouthL.x, mouthL.y, 30 * web, '#e8e0f8', web);

  return { mouth: mouthL, hand: near[0].f, core: Bf({ x: 10, y: hang - 10 }), top: Math.min(-330, Bf({ x: 92, y: hang - 120 }).y), halfW: 200 };
}
