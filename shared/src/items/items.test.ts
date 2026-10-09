import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARSENAL } from './arsenal.js';
import { WEAPONS, ARMOR_SETS, STARTER_WEAPONS, isWeaponRevealed, isArmorRevealed, armorSetPrice, armorPiecePrice, weaponPower, BALANCE, CATEGORY_LABEL } from '../index.js';

const count = (cat: string) => WEAPONS.filter((w) => w.category === cat).length;

test('160 armas: 60 originais + 100 do arsenal (25 por caminho, vários tipos em cada)', () => {
  assert.equal(WEAPONS.length, 160);
  assert.equal(ARSENAL.length, 100);
  const G = 'SABCD';
  const pathOf = (w: (typeof WEAPONS)[number]) => Object.entries(w.scaling).sort((a, b) => G.indexOf(a[1]) - G.indexOf(b[1]))[0][0];
  for (const path of ['str', 'dex', 'int', 'fai']) {
    const mine = ARSENAL.filter((w) => pathOf(w) === path);
    assert.equal(mine.length, 25, path);
    assert.ok(new Set(mine.map((w) => w.category)).size >= 8, `${path}: poucos tipos de arma`);
    const byR = (r: string) => mine.filter((w) => w.rarity === r).length;
    assert.deepEqual([byR('common'), byR('uncommon'), byR('rare'), byR('epic'), byR('legendary')], [5, 6, 6, 5, 3], path);
  }
  const orig = { sword: 6, greatsword: 5, katana: 5, dagger: 5, axe: 5, hammer: 5, spear: 5, scythe: 4, bow: 4, staff: 6, seal: 5, hybrid: 5 };
  for (const [c, n] of Object.entries(orig)) assert.equal(count(c) - ARSENAL.filter((w) => w.category === c).length, n, c);
  assert.equal(Object.keys(CATEGORY_LABEL).length, 12);
});

test('ids únicos e preços dentro da faixa da raridade', () => {
  assert.equal(new Set(WEAPONS.map((w) => w.id)).size, 160);
  assert.equal(new Set(WEAPONS.map((w) => w.name)).size, 160);
  for (const w of WEAPONS) {
    const [min, max] = BALANCE.shop.rarityPrice[w.rarity];
    assert.ok(w.price >= min && w.price <= max, `${w.id} ${w.price}`);
  }
  for (const a of ARMOR_SETS) {
    const [min, max] = BALANCE.shop.rarityPrice[a.rarity];
    assert.ok(a.price >= min && a.price <= max, `${a.id} ${a.price}`);
  }
});

test('custos: físicos gastam stamina (pouca mana no máximo), magias gastam mana', () => {
  for (const w of WEAPONS) {
    for (const a of [w.a1, w.a2]) {
      if (w.category === 'staff' || w.category === 'seal') assert.ok(a.mana > 0 && a.stamina <= 4, `${w.id} ${a.name}`);
      else assert.ok(a.stamina > 0, `${w.id} ${a.name}`);
    }
    assert.ok(w.a2.power >= w.a1.power, `${w.id}: A2 deve ser mais forte`);
    assert.ok(w.a2.stamina + w.a2.mana >= w.a1.stamina + w.a1.mana, `${w.id}: A2 deve ser mais caro`);
  }
});

test('armas híbridas são lendárias e pedem 2+ atributos', () => {
  for (const w of WEAPONS.filter((x) => x.category === 'hybrid')) {
    assert.equal(w.rarity, 'legendary');
    assert.ok(Object.keys(w.requirements).length >= 2);
  }
});

test('3 armas iniciais: espada curta, cajado de aprendiz e selo de noviço', () => {
  assert.deepEqual(STARTER_WEAPONS.map((w) => w.id).sort(), ['cajado-aprendiz', 'espada-curta-recruta', 'selo-do-novico']);
});

test('30 armaduras, preço de conjunto tem desconto', () => {
  assert.equal(ARMOR_SETS.length, 30);
  const set = ARMOR_SETS[0];
  const pieces = (['helm', 'chest', 'gloves', 'legs'] as const).reduce((s, p) => s + armorPiecePrice(set, p), 0);
  assert.ok(armorSetPrice(set) < pieces);
  assert.equal(armorSetPrice(set, ['helm']), pieces - armorPiecePrice(set, 'helm'));
});

test('sem requisitos a arma causa bem menos dano e fica mais lenta', () => {
  const w = WEAPONS.find((x) => x.id === 'martelo-titã-caido')!;
  const base = { str: 5, dex: 5, vig: 5, fort: 5, ess: 5, int: 5, fai: 5 };
  const weak = weaponPower(w, base);
  const strong = weaponPower(w, { ...base, str: 40, fort: 25 });
  assert.ok(weak.unmet && !strong.unmet);
  assert.ok(strong.damage > weak.damage * 3);
  assert.ok(weak.speed < strong.speed);
});

test('revelação progressiva da loja', () => {
  const base = { str: 5, dex: 5, vig: 5, fort: 5, ess: 5, int: 5, fai: 5 };
  const visible = WEAPONS.filter((w) => isWeaponRevealed(w, base)).map((w) => w.id).sort();
  assert.deepEqual(visible, ['cajado-aprendiz', 'espada-curta-recruta', 'selo-do-novico']);
  const montante = WEAPONS.find((w) => w.id === 'montante-do-juramento')!; // FOR 20, FORT 14
  assert.equal(isWeaponRevealed(montante, { ...base, str: 17 }), false);
  assert.equal(isWeaponRevealed(montante, { ...base, str: 18 }), true);
  assert.equal(isWeaponRevealed(montante, { ...base, fort: 12 }), true); // só um dos dois basta
  const lend = ARMOR_SETS.find((a) => a.rarity === 'legendary')!;
  assert.equal(isArmorRevealed(lend, 10), false);
  assert.equal(isArmorRevealed(lend, 25), true);
});
