import { test } from 'node:test';
import assert from 'node:assert/strict';
import { challengerChance, declineStakes, prDelta, seasonReward, softResetPr } from './ranking.js';

const ctx = (cPr: number, dPr: number, cPow: number, dPow: number) => ({ challengerPr: cPr, defenderPr: dPr, challengerPower: cPow, defenderPower: dPow });

test('contas iguais: +16 / −16', () => {
  assert.deepEqual(prDelta(ctx(1000, 1000, 3000, 3000), 'challenger'), { challenger: 16, defender: -16 });
  assert.deepEqual(prDelta(ctx(1000, 1000, 3000, 3000), 'defender'), { challenger: -16, defender: 16 });
});
test('o fraco que vence o forte ganha muito; o forte que vence o fraco ganha pouco', () => {
  const weakBeatsStrong = prDelta(ctx(1000, 1000, 3000, 3500), 'challenger');
  assert.ok(weakBeatsStrong.challenger >= 25, JSON.stringify(weakBeatsStrong));
  const strongBeatsWeak = prDelta(ctx(1000, 1000, 3500, 3000), 'challenger');
  assert.ok(strongBeatsWeak.challenger <= 6 && strongBeatsWeak.challenger >= 2, JSON.stringify(strongBeatsWeak));
});
test('desafiante favorito que perde, perde 25% a mais', () => {
  const r = prDelta(ctx(1000, 1000, 3300, 3000), 'defender');
  assert.equal(r.challenger, -Math.round(r.defender * 1.25));
});
test('PR também pesa na chance (30%)', () => {
  assert.ok(challengerChance(ctx(1400, 1000, 3000, 3000)) > 0.6);
  assert.ok(challengerChance(ctx(1000, 1000, 3000, 3000)) === 0.5);
});
test('vencer vale no mínimo 2 e no máximo 40', () => {
  assert.equal(prDelta(ctx(2000, 1000, 9000, 1000), 'challenger').challenger, 2);
  assert.ok(prDelta(ctx(1000, 1000, 1000, 9000), 'challenger').challenger <= 40);
});
test('recusar: perde metade do que perderia (3 a 15), desafiante ganha metade disso', () => {
  // fraco recusa o forte: perderia pouco lutando → perde o mínimo
  assert.deepEqual(declineStakes(ctx(1000, 1000, 3500, 3000)), { defender: -3, challenger: 2 });
  // forte recusa o fraco: perderia muito → perde bastante
  const d = declineStakes(ctx(1000, 1000, 3000, 3500));
  assert.ok(d.defender <= -13 && d.defender >= -15, JSON.stringify(d));
  assert.equal(d.challenger, Math.round(-d.defender / 2));
});
test('empate não muda PR', () => {
  assert.deepEqual(prDelta(ctx(1000, 1000, 3000, 3000), 'draw'), { challenger: 0, defender: 0 });
});
test('prêmios de temporada e soft reset', () => {
  assert.equal(seasonReward(1)?.gold, 2000);
  assert.equal(seasonReward(1)?.exclusiveTitle, true);
  assert.equal(seasonReward(3)?.xp, 1500);
  assert.equal(seasonReward(10)?.gold, 400);
  assert.equal(seasonReward(11), null);
  assert.equal(softResetPr(1400), 1000);
  assert.equal(softResetPr(800), 1000);
});
