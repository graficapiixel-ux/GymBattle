/**
 * INSETO 3 — ESCARAVELHO TITÃ (Khepros).
 * 6 pernas em tripé de verdade (perto-frente + longe-meio + perto-trás alternando com os
 * outros três), corpo pesado que afunda a cada pisada, élitros que abrem e o disco solar
 * flutuando atrás com atraso.
 */
import type { BossSpec } from '@gymbattle/shared';
import type { Anchors, DrawState, V } from '../types';
import { TAU, clamp, eyeGlow, godRays, hexA, mixHex, rgrad, sm, vgrad } from '../util';
import {
  add, beatAt, bloom, colors, fidget, footShadows, gaitBob, gaitOf, idHash, leg, lerp, poseW, rot, stepFoot, NOBEAT,
} from './insect-rig';

const PIV: V = { x: 10, y: -70 };
const BY = -100;

export function scarab(ctx: CanvasRenderingContext2D, s: BossSpec, st: DrawState): Anchors {
  const c = colors(s, st);
  const w = poseW(st);
  const p = st.p;
  const bt = st.anim === 'attack' ? beatAt(p) : NOBEAT;
  const { ant: a, hit: h, imp: im } = bt;
  const die = st.anim === 'death' ? p : 0;
  const seed = idHash(s.id);
  const G = gaitOf(st, 1, 22, 0.56);
  const br = Math.sin(st.t * 1.4);
  const glowA = clamp(0.5 + st.rage * 0.4 + w.on * (a + h) * 0.5) * (1 - die);
  const idle = (1 - G.mv) * (1 - w.on * 0.7) * (1 - die);

  // ---------------------------------------------------------------- corpo pesado
  let ox = 0, oy = 0, pitch = 0;
  oy += gaitBob(G, 7) + br * 1.5;
  // gingado de tripé: o corpo rola um pouco para o lado do tripé apoiado
  pitch += Math.sin(G.g * TAU) * 0.022 * G.mv - 0.03 * G.mv * G.dir;
  ox += -G.dir * G.mv * 5 + Math.sin(st.t * 0.6) * 2 * idle;
  // chifrada: empina a frente e esmaga
  pitch += w.slam * (a * 0.3 - h * 0.3);
  oy += w.slam * (-a * 6 + h * 10 + im * 12);
  ox += w.slam * (a * 14 - h * 24);
  // carapaça rolante: abaixa a cabeça, finca as patas e dispara
  pitch += w.charge * (-a * 0.1 - h * 0.12);
  oy += w.charge * (a * 14 - h * 4);
  ox += w.charge * (a * 24 - h * 46);
  // enxame: ergue a frente, élitros abertos, treme
  pitch += w.roar * (a + h) * 0.1;
  oy += w.roar * -a * 6;
  ox += (w.roar + w.charge * h) * Math.sin(st.t * 60) * 2;
  // raio do sol: firma o corpo, recua no disparo
  pitch += w.shoot * (a * 0.08 - h * 0.04);
  ox += w.shoot * (a * 6 + im * 12) + w.cast * a * 6;
  ox += im * Math.sin(p * 150) * 3;
  // dano
  ox += st.hurt * 14;
  pitch += st.hurt * 0.07;
  oy -= st.hurt * 4;
  // morte
  if (die > 0) {
    ox += sm(0, 0.2, die) * 12 + Math.sin(die * 28) * 5 * (1 - sm(0.2, 0.4, die));
    oy += 52 * Math.pow(sm(0.22, 0.6, die), 2) - 7 * Math.sin(Math.PI * sm(0.6, 0.76, die));
    pitch += 0.14 * sm(0, 0.18, die) * (1 - sm(0.25, 0.5, die)) - 0.1 * sm(0.4, 0.7, die);
  }
  const Bf = (q: V): V => add(rot(q, PIV, pitch), ox, oy);

  // ---------------------------------------------------------------- disco solar (atrasa e balança)
  const sunHome: V = {
    x: 50 + G.dir * G.mv * 18 + st.hurt * 16 + ox * 0.6,
    y: -300 + Math.sin(st.t * 1.2) * 6 + Math.sin(G.g * 4 * Math.PI + 1.2) * 4 * G.mv + oy * 0.4,
  };
  const shotK = clamp(w.shoot * (a * 1.6 + h) + w.cast * (a + h) * 0.3);
  const toFront = w.shoot * clamp(a * 1.6 + h);
  const sun: V = {
    x: lerp(sunHome.x, Bf({ x: -170, y: -240 }).x, toFront),
    y: lerp(sunHome.y, -250 + oy, toFront) + Math.pow(sm(0.1, 0.55, die), 2) * 230,
  };
  const sunR = (34 + shotK * 10 + st.rage * 4 + w.shoot * im * 8) * (1 - sm(0.5, 0.75, die) * 0.4);
  godRays(ctx, sun.x, sun.y, 12, sunR * 2.4, 0.09, s.pal.accent, (0.35 + shotK * 0.5) * (1 - die), st.t * 0.3);
  ctx.fillStyle = rgrad(ctx, sun.x - 8, sun.y - 8, sunR, die > 0.5 ? mixHex('#fff6c8', '#806020', die) : '#fff6c8', s.pal.accent);
  ctx.beginPath();
  ctx.arc(sun.x, sun.y, sunR, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.translate(sun.x, sun.y);
  ctx.rotate(st.t * 0.5);
  ctx.strokeStyle = hexA('#ffffff', 0.7);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, sunR * 0.7, 0, TAU);
  ctx.stroke();
  // hieróglifos girando no disco
  ctx.strokeStyle = hexA(mixHex(s.pal.accent, '#000000', 0.3), 0.6);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const an = (i / 6) * TAU;
    ctx.moveTo(Math.cos(an) * sunR * 0.45, Math.sin(an) * sunR * 0.45);
    ctx.lineTo(Math.cos(an + 0.2) * sunR * 0.62, Math.sin(an + 0.2) * sunR * 0.62);
  }
  ctx.stroke();
  ctx.restore();
  bloom(ctx, sun.x, sun.y, sunR * 2, s.pal.accent, (0.5 + shotK * 0.4) * (1 - die * 0.7));

  // ---------------------------------------------------------------- pernas (tripé)
  const nearF = [-150, -30, 100], farF = [-104, 14, 142];
  const spread = 1 + sm(0.22, 0.6, die) * 0.25;
  const curl = sm(0.64, 1, die);
  const legOf = (i: number, near: boolean) => {
    const hip = Bf({ x: (near ? -60 : -36) + i * 50, y: BY + (near ? 34 : 24) });
    // tripé: perto 0 e 2 com longe 1; longe 0 e 2 com perto 1 (onda leve de trás p/ frente)
    const ph = ((i + (near ? 0 : 1)) % 2) * 0.5 - i * 0.03;
    let f: V = stepFoot(G, (near ? nearF : farF)[i] * spread, ph);
    f = add(f, 0, -fidget(st, i + (near ? 0 : 3), 6, Math.floor(seed * 53), idle) * 14);
    // fincar as patas: trás empurra na investida, frente segura a chifrada
    f.x += w.charge * (a * 12 + h * 20) * (i === 2 ? 1 : i === 1 ? 0.5 : -0.3) * (1 - sm(0.62, 0.85, p));
    if (curl > 0) {
      // besouro morto: patas encolhem para cima, tremendo
      const out = i === 0 ? -1 : i === 2 ? 1 : f.x < hip.x ? -1 : 1;
      const tw = Math.sin(st.t * 28 + i * 2.3 + (near ? 0 : 1)) * 7 * sm(0.66, 0.74, die) * (1 - sm(0.86, 1, die));
      f = { x: lerp(f.x, hip.x + out * 44, curl), y: lerp(f.y, hip.y - 26 + tw, curl) };
    }
    return { hip, f };
  };
  const near = [0, 1, 2].map((i) => legOf(i, true));
  const far = [0, 1, 2].map((i) => legOf(i, false));
  footShadows(ctx, [...near, ...far].map((l) => l.f), 13);
  const farLook = { w: 13, fill: c.mid, line: c.line, joint: c.dark, spikes: 3, tars: 16 };
  const nearLook = { w: 16, fill: c.body, line: c.line, hi: hexA(mixHex(s.pal.glow, '#ffffff', 0.3), 0.45), joint: c.accent, spikes: 3, tars: 18 };
  for (let i = 2; i >= 0; i--) leg(ctx, far[i].hip, far[i].f, 66, 74, farLook);

  ctx.save();
  ctx.translate(ox, oy);
  ctx.translate(PIV.x, PIV.y);
  ctx.rotate(pitch);
  ctx.translate(-PIV.x, -PIV.y);

  // ---------------------------------------------------------------- asas membranosas (élitro aberto)
  const open = clamp(w.roar * (a + h) + w.cast * (a + h) * 0.5 + w.charge * (a * 0.4 + h) * 0.6 + w.slam * a * 0.3
    + sm(0, 0.15, die) * (1 - sm(0.25, 0.5, die)) * 0.6);
  if (open > 0.05) {
    ctx.save();
    ctx.translate(-10, BY - 70);
    for (const [an, al] of [[-0.9, 0.35], [-0.55, 0.5]] as const) {
      ctx.save();
      ctx.rotate((an + Math.sin(st.t * 40 + an * 3) * 0.08) * open);
      ctx.globalAlpha = al * open;
      ctx.fillStyle = vgrad(ctx, -40, 30, '#e8fbff', s.pal.glow);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(120, -70, 230, -10);
      ctx.quadraticCurveTo(120, 20, 0, 10);
      ctx.fill();
      ctx.strokeStyle = hexA('#ffffff', 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(4, 2);
      ctx.quadraticCurveTo(110, -46, 210, -10);
      ctx.moveTo(4, 4);
      ctx.quadraticCurveTo(100, -20, 180, 0);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  // abdômen por baixo (respira)
  ctx.fillStyle = c.dark;
  ctx.beginPath();
  ctx.ellipse(70, BY + 20, 110, 48 + br * 1.5, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = hexA(c.accent, 0.3);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    ctx.moveTo(20 + i * 30, BY + 40);
    ctx.quadraticCurveTo(28 + i * 30, BY + 56 + br, 36 + i * 30, BY + 62);
  }
  ctx.stroke();

  // ---------------------------------------------------------------- élitro iridescente (cúpula)
  ctx.save();
  ctx.translate(-34, BY - 30);
  ctx.rotate(-open * 0.7 + Math.sin(st.t * 31) * 0.01 * open);
  const ir = ctx.createLinearGradient(-20, -110, 160, 60);
  const sh = (Math.sin(st.t * 0.9 + ox * 0.01) + 1) * 0.1;
  ir.addColorStop(0, c.dark);
  ir.addColorStop(0.15 + sh, c.body);
  ir.addColorStop(0.35 + sh, c.T(mixHex(s.pal.glow, s.pal.body, 0.35)));
  ir.addColorStop(0.5 + sh, c.T(mixHex(s.pal.accent, s.pal.body, 0.4)));
  ir.addColorStop(0.7 + sh * 0.5, c.body);
  ir.addColorStop(1, c.dark);
  const dome = () => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(10, -120, 210, -130, 228, 30);
    ctx.quadraticCurveTo(232, 62, 200, 70);
    ctx.quadraticCurveTo(100, 82, 6, 54);
    ctx.closePath();
  };
  ctx.fillStyle = ir;
  dome();
  ctx.fill();
  ctx.strokeStyle = c.line;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = hexA(s.pal.glow, 0.35);
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(20 + i * 6, 40 - i * 22);
    ctx.bezierCurveTo(60 + i * 10, -70 + i * 22, 170 - i * 8, -64 + i * 20, 214 - i * 6, 40);
    ctx.stroke();
  }
  ctx.fillStyle = hexA('#ffffff', 0.18 + 0.06 * Math.sin(st.t * 1.3));
  ctx.beginPath();
  ctx.ellipse(80 + Math.sin(st.t * 0.9) * 8, -52, 50, 14, -0.2, 0, TAU);
  ctx.fill();
  // reflexo do sol na cúpula
  ctx.fillStyle = hexA(s.pal.accent, 0.12 + shotK * 0.15);
  ctx.beginPath();
  ctx.ellipse(110, -78, 30, 9, -0.1, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = hexA(c.accent, 0.85);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(6, 54);
  ctx.quadraticCurveTo(100, 82, 200, 70);
  ctx.stroke();
  ctx.restore();

  // ---------------------------------------------------------------- pronoto + cabeça
  const head: V = { x: -86, y: BY - 6 };
  ctx.fillStyle = vgrad(ctx, head.y - 60, head.y + 50, mixHex(c.body, s.pal.glow, 0.25), c.dark);
  ctx.beginPath();
  ctx.ellipse(head.x + 30, head.y - 8, 56, 52, 0.1, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = c.line;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = hexA('#ffffff', 0.14);
  ctx.beginPath();
  ctx.ellipse(head.x + 24, head.y - 40, 26, 9, -0.3, 0, TAU);
  ctx.fill();
  // a cabeça acena um pouco a cada passo (atraso)
  const nod = Math.sin(G.g * 4 * Math.PI - 0.9) * 0.03 * G.mv + br * 0.01 + w.charge * h * 0.08;
  ctx.save();
  ctx.translate(head.x, head.y);
  ctx.rotate(nod);
  ctx.translate(-head.x, -head.y);
  ctx.fillStyle = vgrad(ctx, head.y - 30, head.y + 40, c.body, c.dark);
  ctx.beginPath();
  ctx.moveTo(head.x - 16, head.y - 26);
  ctx.quadraticCurveTo(head.x - 64, head.y - 10, head.x - 70, head.y + 26);
  ctx.quadraticCurveTo(head.x - 30, head.y + 44, head.x + 4, head.y + 30);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = c.line;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = c.accent;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(head.x - 70 + i * 8, head.y + 26 + i * 2);
    ctx.lineTo(head.x - 76 + i * 8, head.y + 36 + i * 2);
    ctx.lineTo(head.x - 62 + i * 8, head.y + 30 + i * 2);
    ctx.fill();
  }
  // chifre grande curvado
  const hornUp = w.slam * (a * 0.22 - h * 0.05) + w.roar * (a + h) * 0.12 + w.shoot * a * 0.08 - w.charge * h * 0.1;
  const hornP: V = { x: head.x - 30, y: head.y - 14 };
  ctx.save();
  ctx.translate(hornP.x, hornP.y);
  ctx.rotate(-hornUp);
  const hg = ctx.createLinearGradient(0, 0, -64, -150);
  hg.addColorStop(0, c.body);
  hg.addColorStop(0.45, c.accent);
  hg.addColorStop(1, c.T('#fff2b0'));
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.moveTo(-24, 14);
  ctx.bezierCurveTo(-78, -6, -96, -80, -64, -150);
  ctx.bezierCurveTo(-66, -84, -36, -36, 34, -4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = c.line;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-74, -60); ctx.lineTo(-58, -74); ctx.lineTo(-64, -54);
  ctx.fill();
  ctx.strokeStyle = hexA('#ffffff', 0.45);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-30, 4);
  ctx.bezierCurveTo(-72, -14, -82, -74, -66, -136);
  ctx.stroke();
  ctx.restore();
  const hornTipL = rot(rot({ x: head.x - 94, y: head.y - 164 }, hornP, -hornUp), head, nod);
  const eo = st.anim === 'death' ? 1 - die : (st.t + seed * 4) % 4.6 < 0.11 ? 0.2 : 1;
  eyeGlow(ctx, head.x - 20, head.y + 4, 7 + st.rage * 2, s.pal.eye, eo);
  // antenas em leque (tremem e abrem)
  const fan = 0.4 + Math.sin(st.t * 2.6) * 0.12 + Math.sin(st.t * 17) * 0.04 + w.on * (a + h) * 0.3;
  ctx.fillStyle = c.accent;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(head.x - 44 - i * 4, head.y + 18 + i * 6, 9, 3, -0.6 + i * fan, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  ctx.restore();
  const hornTip = Bf(hornTipL);
  bloom(ctx, hornTip.x, hornTip.y, 26 + w.slam * (a + h) * 20, s.pal.accent, glowA * 0.6);

  // ---------------------------------------------------------------- pernas da frente
  for (let i = 2; i >= 0; i--) leg(ctx, near[i].hip, near[i].f, 68, 76, nearLook);

  let hand: V = near[0].f;
  if (w.slam * (a + h) > 0.05) hand = { x: lerp(hand.x, hornTip.x, clamp((a + h) * 2)), y: lerp(hand.y, hornTip.y, clamp((a + h) * 2)) };
  return {
    mouth: shotK > 0.1 ? sun : { x: hornTip.x, y: hornTip.y + 20 },
    hand,
    core: Bf({ x: 30, y: BY - 20 }),
    top: Math.min(sun.y - sunR, hornTip.y) - 10,
    halfW: 180,
  };
}
