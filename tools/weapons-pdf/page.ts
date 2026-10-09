/** Catálogo de armas em PDF: uma ficha bem separada por arma (2 por página). */
import {
  ATTRIBUTE_LABELS, CATEGORY_LABEL, ELEMENT_COLOR, ELEMENT_LABEL, RARITY_COLOR, RARITY_LABEL, WEAPONS,
  type AttackDef, type WeaponCategory, type WeaponDef,
} from '@gymbattle/shared';
import { drawWeapon, weaponShape } from '@/game/rig';

const KIND: Record<string, string> = {
  melee: 'Corpo a corpo', combo: 'Combo', dash: 'Investida', projectile: 'Projétil', area: 'Área', leap: 'Salto', pull: 'Puxão', heal: 'Cura',
};
const STATUS: Record<string, string> = { poison: 'Veneno', freeze: 'Congelar', burn: 'Queimadura', bleed: 'Sangramento', shock: 'Choque', launch: 'Arremesso' };
const ORDER: WeaponCategory[] = ['sword', 'greatsword', 'katana', 'dagger', 'axe', 'hammer', 'spear', 'scythe', 'bow', 'staff', 'seal', 'hybrid'];
const RAR = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
const nf = (n: number) => n.toLocaleString('pt-BR');

function icon(w: WeaponDef, size: number) {
  const c = document.createElement('canvas');
  const dpr = 2;
  c.width = size * dpr;
  c.height = size * dpr;
  c.style.width = c.style.height = size + 'px';
  const ctx = c.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const shape = weaponShape(w);
  const len: Record<string, number> = { sword: 58, greatsword: 82, katana: 72, dagger: 30, axe: 62, hammer: 64, spear: 104, scythe: 90, bow: 64, staff: 90, seal: 26, fist: 20 };
  const L = len[shape] ?? 60;
  const k = (size * 0.9) / L;
  ctx.translate(size / 2, size / 2);
  ctx.rotate(shape === 'bow' || shape === 'seal' ? 0 : Math.PI / 4);
  ctx.scale(k, k);
  ctx.translate(shape === 'bow' ? -4 : shape === 'seal' ? -3 : 0, shape === 'bow' || shape === 'seal' ? (shape === 'seal' ? 4 : 0) : L / 2 - 6);
  drawWeapon(ctx, w, 0.6);
  return c.toDataURL('image/png');
}

function attack(label: string, a: AttackDef, base: number) {
  const dmg = Math.round(base * a.power);
  const extras = [
    a.hits > 1 ? `${a.hits} golpes` : '',
    a.status ? `${STATUS[a.status.type] ?? a.status.type} (${Math.round(a.status.chance * 100)}%)` : '',
    a.lifesteal ? `Rouba ${Math.round(a.lifesteal * 100)}% de vida` : '',
  ].filter(Boolean);
  return `<div class="atk">
    <div class="atk-h"><span class="slot">${label}</span><b>${esc(a.name)}</b><span class="kind">${KIND[a.kind] ?? a.kind}</span></div>
    <p class="desc">${esc(a.desc)}</p>
    <div class="nums">
      <span><i>Dano</i>${a.kind === 'heal' ? '—' : nf(dmg)}</span>
      <span><i>Alcance</i>${a.range}</span>
      <span><i>Estamina</i>${a.stamina}</span>
      <span><i>Mana</i>${a.mana}</span>
      <span><i>Preparo</i>${a.windup} ms</span>
    </div>
    ${extras.length ? `<p class="extra">${extras.join(' · ')}</p>` : ''}
  </div>`;
}

function card(w: WeaponDef, n: number) {
  const rc = RARITY_COLOR[w.rarity];
  const ec = ELEMENT_COLOR[w.element];
  const req = Object.entries(w.requirements).map(([k, v]) => `<span class="chip">${ATTRIBUTE_LABELS[k as keyof typeof ATTRIBUTE_LABELS]?.short ?? k} ${v}</span>`).join('') || '<span class="muted">Nenhum</span>';
  const sc = Object.entries(w.scaling).map(([k, v]) => `<span class="chip">${ATTRIBUTE_LABELS[k as keyof typeof ATTRIBUTE_LABELS]?.short ?? k} <b>${v}</b></span>`).join('') || '<span class="muted">—</span>';
  return `<section class="card" style="--rc:${rc}">
    <div class="num">#${n}</div>
    <div class="top">
      <div class="img"><img src="${icon(w, 190)}" alt=""></div>
      <div class="info">
        <p class="rar">${RARITY_LABEL[w.rarity]}${w.starter ? ' · ARMA INICIAL' : ''}</p>
        <h2>${esc(w.name)}</h2>
        <p class="cat">${CATEGORY_LABEL[w.category]}</p>
        <div class="stats">
          <div><i>Preço</i><b>${w.price ? nf(w.price) + ' ouro' : 'Grátis'}</b></div>
          <div><i>Dano base</i><b>${nf(w.baseDamage)}</b></div>
          <div><i>Velocidade</i><b>${w.speed.toFixed(2).replace('.', ',')}×</b></div>
          <div><i>Elemento</i><b style="color:${ec}">${ELEMENT_LABEL[w.element]}</b></div>
        </div>
        <div class="row"><i>Requisitos</i>${req}</div>
        <div class="row"><i>Escala</i>${sc}</div>
      </div>
    </div>
    <p class="lore">“${esc(w.lore)}”</p>
    <div class="atks">${attack('Ataque 1', w.a1, w.baseDamage)}${attack('Ataque 2', w.a2, w.baseDamage)}</div>
  </section>`;
}

const sorted = [...WEAPONS].sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category) || RAR.indexOf(a.rarity) - RAR.indexOf(b.rarity) || a.price - b.price);
let html = `<section class="cover">
  <p class="brand">GYMBATTLE</p>
  <h1>Catálogo de Armas</h1>
  <p class="sub">${WEAPONS.length} armas · ${ORDER.filter((c) => WEAPONS.some((w) => w.category === c)).length} categorias</p>
  <div class="legend">${RAR.map((r) => `<span style="--rc:${RARITY_COLOR[r as keyof typeof RARITY_COLOR]}">${RARITY_LABEL[r as keyof typeof RARITY_LABEL]}: ${WEAPONS.filter((w) => w.rarity === r).length}</span>`).join('')}</div>
  <ol class="toc">${ORDER.filter((c) => WEAPONS.some((w) => w.category === c)).map((c) => `<li>${CATEGORY_LABEL[c]} <b>${WEAPONS.filter((w) => w.category === c).length}</b></li>`).join('')}</ol>
</section>`;
let n = 0;
for (const cat of ORDER) {
  const list = sorted.filter((w) => w.category === cat);
  if (!list.length) continue;
  html += `<section class="divider"><p>Categoria</p><h1>${CATEGORY_LABEL[cat]}</h1><p class="sub">${list.length} arma${list.length > 1 ? 's' : ''}</p></section>`;
  for (let i = 0; i < list.length; i += 2) {
    html += `<div class="page">${card(list[i], ++n)}${list[i + 1] ? card(list[i + 1], ++n) : ''}</div>`;
  }
}
document.getElementById('root')!.innerHTML = html;
(window as unknown as { done: boolean }).done = true;
