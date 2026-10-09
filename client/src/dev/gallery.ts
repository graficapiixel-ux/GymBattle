// Página só de desenvolvimento: mostra avatares, armas e poses para conferir o visual.
import { WEAPONS, DEFAULT_AVATAR, type AvatarLook } from '@gymbattle/shared';
import { drawAvatar, drawWeapon, idlePose, weaponShape } from '../game/rig';
import { attackPose, motionOf } from '../game/arena/poses';
import { drawSwingTrail } from '../game/arena/trail';
import { MAPS } from '@gymbattle/shared';
import { scenesFor, SCENES_BY_ID, LEGEND_SEC, legendShake, drawLegendBackdrop as lgBack, drawLegendWorld as lgWorld, drawLegendOverlay as lgOver } from '../game/arena/legend';
import { renderLegendMusic } from '../game/arena/legend/music';

function wavBase64(buf: AudioBuffer): string {
  const ch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const w = (o: number, str: string) => { for (let i = 0; i < str.length; i++) out.setUint8(o + i, str.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true); out.setUint32(24, sr, true);
  out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, len * ch * 2, true);
  const data = Array.from({ length: ch }, (_, i) => buf.getChannelData(i));
  let o = 44;
  for (let i = 0; i < len; i++) for (let k = 0; k < ch; k++) { const v = Math.max(-1, Math.min(1, data[k][i])); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  const bytes = new Uint8Array(out.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
import type { WeaponCategory } from '@gymbattle/shared';

const q = new URLSearchParams(location.search);
const mode = q.get('mode') ?? 'poses';
const c = document.getElementById('c') as HTMLCanvasElement;
const ctx = c.getContext('2d')!;
const ids = ['espada-curta-recruta', 'montante-do-juramento', 'uchigatana', 'adaga-do-ladino', 'machado-de-guerra', 'martelo-do-ferreiro',
  'lanca-de-milicia', 'foice-do-campones', 'arco-curto-cacador', 'cajado-aprendiz', 'selo-do-novico', 'lamina-sol-negro'];
const look: AvatarLook = { ...DEFAULT_AVATAR, hair: Number(q.get('hair') ?? 1), beard: Number(q.get('beard') ?? 0) };

if (mode === 'sfx') {
  // mede o volume de cada efeito sonoro (pico e RMS) para equilibrar
  (window as unknown as Record<string, unknown>).__sfxLevels = async () => {
    const S = await import('../game/audio/sfx');
    const cases: [string, () => void][] = [
      ['swing', () => S.sfxSwing(false)], ['swing pesado', () => S.sfxSwing(true)],
      ['acerto', () => S.sfxHit(false, 'physical')], ['acerto forte', () => S.sfxHit(true, 'physical')],
      ['acerto fogo', () => S.sfxHit(false, 'fire')], ['acerto gelo', () => S.sfxHit(false, 'ice')], ['acerto raio', () => S.sfxHit(false, 'lightning')],
      ['flecha', () => S.sfxShoot('arrow', 'physical')], ['adaga lançada', () => S.sfxShoot('dagger_throw', 'physical')], ['lança raio', () => S.sfxShoot('lightning_spear', 'lightning')], ['magia', () => S.sfxShoot('arcane_missiles', 'arcane')], ['bola de fogo', () => S.sfxShoot('fireball', 'fire')],
      ['explosão', () => S.sfxExplosion(0.6, 'fire')], ['pulo', () => S.sfxJump(false)], ['aterrissar', () => S.sfxLand(true)],
      ['esquiva', () => S.sfxDodge()], ['esquivou', () => S.sfxMiss()], ['nocaute', () => S.sfxKo()], ['cura', () => S.sfxHeal()],
      ['congelou', () => S.sfxStatus('freeze')], ['choque', () => S.sfxStatus('shock')], ['renascer', () => S.sfxRespawn()],
    ];
    const out: Record<string, { peak: number; rms: number }> = {};
    for (const [name, fn] of cases) {
      const ac = new OfflineAudioContext(1, 44100 * 1.5, 44100);
      S.__sfxTarget({ ctx: ac, out: ac.destination });
      fn();
      const buf = await ac.startRendering();
      const d = buf.getChannelData(0);
      let peak = 0, sum = 0, n = 0;
      for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); peak = Math.max(peak, v); }
      // RMS só na parte audível (acima de -40 dB do pico)
      for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak * 0.01) { sum += v * v; n++; } }
      out[name] = { peak: +(20 * Math.log10(peak || 1e-9)).toFixed(1), rms: +(10 * Math.log10(sum / Math.max(1, n) || 1e-9)).toFixed(1) };
    }
    S.__sfxTarget(null);
    return out;
  };
} else if (mode === 'film') {
  // um único quadro de uma cena (para montar vídeos de prévia com música)
  const id = q.get('scene') ?? 'sword-dawn';
  const sc = SCENES_BY_ID[id];
  const pw = 640, ph = 400;
  c.width = pw; c.height = ph;
  const wpn: Record<string, string> = {
    sword: 'espada-curta-recruta', greatsword: 'montante-do-juramento', katana: 'uchigatana', dagger: 'adaga-do-ladino',
    axe: 'machado-de-guerra', hammer: 'martelo-do-ferreiro', spear: 'lanca-de-milicia', scythe: 'foice-do-campones',
    bow: 'arco-curto-cacador', staff: 'cajado-aprendiz', seal: 'selo-do-novico', hybrid: 'lamina-sol-negro',
  };
  const foe: AvatarLook = { ...look, gender: 1, hair: 9, hairColor: '#b3263a', skin: '#d9a07a', top: '#1f4fa8', shorts: '#16161a' };
  const map = MAPS[0];
  const frame = (p: number, t: number) => {
    const sh = legendShake(p);
    ctx.save();
    ctx.translate(sh.x, sh.y);
    const th = map.theme;
    const g = ctx.createLinearGradient(0, 0, 0, ph); g.addColorStop(0, th.skyTop); g.addColorStop(1, th.skyBottom);
    ctx.fillStyle = g; ctx.fillRect(-20, -20, pw + 40, ph + 40);
    ctx.fillStyle = th.far; for (let k = 0; k < 9; k++) ctx.fillRect(k * 80 - 20, 200 + (k % 3) * 25, 55, 200);
    const gy = 345;
    // antes do evento: os dois lutando (idle); o evento começa em t=0
    const A = { x: 200, y: gy, facing: 1 as const, look, equipment: { weapon: wpn[sc.cat], helm: null, chest: null, gloves: null, legs: null }, s: 1.1 };
    const B = { x: 430, y: gy, facing: -1 as const, look: foe, equipment: { weapon: 'espada-curta-recruta', helm: null, chest: null, gloves: null, legs: null }, s: 1.1 };
    const view = { w: pw, h: ph };
    lgBack(ctx, sc, p, view, A, B);
    ctx.fillStyle = th.platform; ctx.fillRect(-20, gy, pw + 40, ph - gy + 20);
    ctx.fillStyle = th.platformTop; ctx.fillRect(-20, gy, pw + 40, 4);
    lgWorld(ctx, sc, p, A, B);
    ctx.restore();
    lgOver(ctx, sc, p, view, A, B);
    void t;
  };
  frame(0, 0);
  (window as unknown as Record<string, unknown>).__film = {
    frame: (p: number) => { frame(p, p); return c.toDataURL('image/jpeg', 0.88); },
    wav: async () => {
      const buf = await renderLegendMusic(sc.music, LEGEND_SEC);
      return wavBase64(buf);
    },
    sec: LEGEND_SEC,
  };
} else if (mode === 'legend2') {
  const cat = (q.get('cat') ?? 'sword') as WeaponCategory;
  const wpn: Record<string, string> = {
    sword: 'espada-curta-recruta', greatsword: 'montante-do-juramento', katana: 'uchigatana', dagger: 'adaga-do-ladino',
    axe: 'machado-de-guerra', hammer: 'martelo-do-ferreiro', spear: 'lanca-de-milicia', scythe: 'foice-do-campones',
    bow: 'arco-curto-cacador', staff: 'cajado-aprendiz', seal: 'selo-do-novico', hybrid: 'lamina-sol-negro',
  };
  const list = scenesFor(cat);
  const only = q.get('scene');
  const scenes = only ? list.filter((x) => x.id === only) : list;
  const pw = 600, ph = 380, lab = 28;
  c.width = pw * 3; c.height = (ph + lab) * scenes.length;
  ctx.fillStyle = '#0c0c10'; ctx.fillRect(0, 0, c.width, c.height);
  const foe: AvatarLook = { ...look, gender: 1, hair: 9, hairColor: '#b3263a', skin: '#d9a07a', top: '#1f4fa8', shorts: '#16161a' };
  const labels = ['o céu escurece', 'o poder desperta', 'finalização'];
  scenes.forEach((sc, row) => {
    const map = MAPS[row % 2 ? 1 : 0];
    sc.frames.forEach((p, i) => {
      ctx.save();
      ctx.translate(i * pw, row * (ph + lab));
      ctx.beginPath(); ctx.rect(0, 0, pw, ph); ctx.clip();
      const th = map.theme;
      const g = ctx.createLinearGradient(0, 0, 0, ph); g.addColorStop(0, th.skyTop); g.addColorStop(1, th.skyBottom);
      ctx.fillStyle = g; ctx.fillRect(0, 0, pw, ph);
      ctx.fillStyle = th.far; for (let k = 0; k < 8; k++) ctx.fillRect(k * 85 - 20, 180 + (k % 3) * 25, 55, 200);
      const gy = 330;
      const flip = q.get('flip') === '1';
      const A = { x: flip ? 410 : 190, y: gy, facing: (flip ? -1 : 1) as 1 | -1, look, equipment: { weapon: wpn[cat], helm: null, chest: null, gloves: null, legs: null }, s: 1.05 };
      const B = { x: flip ? 190 : 410, y: gy, facing: (flip ? 1 : -1) as 1 | -1, look: foe, equipment: { weapon: 'espada-curta-recruta', helm: null, chest: null, gloves: null, legs: null }, s: 1.05 };
      const view = { w: pw, h: ph };
      lgBack(ctx, sc, p, view, A, B);
      ctx.fillStyle = th.platform; ctx.fillRect(0, gy, pw, ph - gy);
      ctx.fillStyle = th.platformTop; ctx.fillRect(0, gy, pw, 4);
      lgWorld(ctx, sc, p, A, B);
      lgOver(ctx, sc, p, view, A, B);
      ctx.restore();
      ctx.fillStyle = '#ccc'; ctx.font = '600 13px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(`${sc.name} · ${i + 1}. ${labels[i]}`, i * pw + 8, row * (ph + lab) + ph + 19);
    });
  });
} else if (mode === 'poses') {
  const cols = 5, cw = 150, ch = 150, sc = 1.1;
  c.width = cols * cw; c.height = ids.length * ch;
  ids.forEach((id, row) => {
    const w = WEAPONS.find((x) => x.id === id)!;
    const shape = weaponShape(w);
    const timing = { start: 0, windup: 8, active: 5, recovery: 8 };
    const frames: [string, (t: number) => ReturnType<typeof idlePose>][] = [
      ['idle', () => idlePose(shape, 0.3)],
      ['a1 prep', () => attackPose(shape, motionOf(w, w.a1), w.a1.hits, timing, 7, 0)],
      ['a1 golpe', () => attackPose(shape, motionOf(w, w.a1), w.a1.hits, timing, 10, 0)],
      ['a2 prep', () => attackPose(shape, motionOf(w, w.a2), w.a2.hits, timing, 7, 0)],
      ['a2 golpe', () => attackPose(shape, motionOf(w, w.a2), w.a2.hits, timing, 10, 0)],
    ];
    frames.forEach(([label, f], col) => {
      ctx.save();
      ctx.translate(col * cw + cw / 2, row * ch + ch - 16);
      ctx.scale(sc, sc);
      drawAvatar(ctx, { look, equipment: { weapon: id, helm: null, chest: null, gloves: null, legs: null }, pose: f(0), facing: 1, time: 0.3 });
      ctx.restore();
      ctx.fillStyle = '#888'; ctx.font = '10px sans-serif';
      ctx.fillText(`${id.slice(0, 16)} · ${label}`, col * cw + 4, row * ch + 12);
    });
  });
} else if (mode === 'heads') {
  const cols = 7, cw = 150, ch = 210; c.width = cols * cw; c.height = 4 * ch;
  const eyes = ['#3b2414', '#6b4a2a', '#3a7a3a', '#3a6ab0', '#7a8a94', '#8a3aa8'];
  const tops = ['#2a2a33', '#b3263a', '#1f4fa8', '#1f8a55', '#7a3ab0', '#e0602a', '#16161a'];
  for (let r = 0; r < 4; r++) for (let i = 0; i < cols; i++) {
    const hair = (r % 2) * 7 + i; const gender = r >= 2 ? 1 : 0;
    ctx.save(); ctx.translate(i * cw + cw / 2, r * ch + ch + 70); ctx.scale(2.6, 2.6);
    drawAvatar(ctx, { look: { ...look, gender, hair, beard: gender ? 0 : i % 6, face: i % 5, eyes: eyes[i % 6], marks: (i + r) % 5, accessory: (i + r * 2) % 5,
      top: tops[i], shorts: tops[(i + 3) % 7], skin: ['#f6d7c3', '#d9a07a', '#a86b42', '#6a3f24'][(i + r) % 4],
      hairColor: ['#2b1d14', '#6b4a2f', '#c9a26a', '#111111', '#b3263a', '#e8d9a8', '#3a5bd9'][i] }, equipment: { weapon: null, helm: null, chest: null, gloves: null, legs: null }, pose: idlePose('bow', 0), facing: 1 });
    ctx.restore();
    ctx.fillStyle = '#888'; ctx.font = '11px sans-serif'; ctx.fillText(`${gender ? 'F' : 'M'} cabelo ${hair}`, i * cw + 4, r * ch + 12);
  }
} else if (mode === 'trail') {
  // golpe no meio, com o rastro por onde a arma passou
  const cols = 4, cw = 260, ch = 230;
  c.width = cols * cw; c.height = ids.length * ch;
  ids.forEach((id, row) => {
    const w = WEAPONS.find((x) => x.id === id)!;
    const shape = weaponShape(w);
    [[w.a1, 0.35], [w.a1, 0.7], [w.a2, 0.35], [w.a2, 0.7]].forEach(([def, frac], col) => {
      const d = def as typeof w.a1;
      const timing = { start: 0, windup: 8, active: d.kind === 'combo' ? Math.max(3, d.hits * 3) : 5, recovery: 8 };
      const motion = motionOf(w, d);
      const local = timing.windup + timing.active * (frac as number);
      ctx.save();
      ctx.translate(col * cw + cw / 2 - 30, row * ch + ch - 20);
      ctx.scale(1.6, 1.6);
      drawSwingTrail(ctx, { look, weapon: w, shape, motion, hits: d.hits, timing, local, origin: () => ({ x: 0, y: 0, facing: 1 }), color: w.element === 'physical' ? '#bfe3ff' : '#ff9a3a' });
      drawAvatar(ctx, { look, equipment: { weapon: id, helm: null, chest: null, gloves: null, legs: null }, pose: attackPose(shape, motion, d.hits, timing, local, 0), facing: 1, time: 0.3 });
      ctx.restore();
      ctx.fillStyle = '#888'; ctx.font = '11px sans-serif';
      ctx.fillText(`${id.slice(0, 18)} · ${motion} ${Math.round((frac as number) * 100)}%`, col * cw + 4, row * ch + 14);
    });
  });
} else if (mode === 'weapons') {
  const list = WEAPONS; const cols = 16; const cw = 90; c.width = cols * cw; c.height = Math.ceil(list.length / cols) * 130;
  list.forEach((w, i) => {
    ctx.save(); ctx.translate((i % cols) * cw + cw / 2, Math.floor(i / cols) * 130 + 118);
    const shape = weaponShape(w); const L = shape === 'spear' || shape === 'staff' || shape === 'scythe' ? 0.95 : shape === 'dagger' ? 2.2 : 1.35;
    ctx.scale(L, L); ctx.rotate(0.35);
    drawWeapon(ctx, w, 0);
    ctx.restore();
  });
}
