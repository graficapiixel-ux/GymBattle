import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bossWinChance } from '../src/bosses/chance.js';

test('chance do boss: +1% por membro extra do time, sem passar de 100', () => {
  assert.equal(bossWinChance(40, 1), 40); // sozinho: sem bônus
  assert.equal(bossWinChance(40, 2), 41);
  assert.equal(bossWinChance(40, 3), 42);
  assert.equal(bossWinChance(40, 5), 44);
  assert.equal(bossWinChance(0, 1), 0);
  assert.equal(bossWinChance(99, 6), 100);
  assert.equal(bossWinChance(100, 4), 100);
});
