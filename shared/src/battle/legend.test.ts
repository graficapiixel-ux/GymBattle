import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateBattle, simulateBattleWithLegend } from './sim.js';
import { DEFAULT_AVATAR } from '../types.js';
import { BALANCE } from '../balance.js';
import type { FighterInput } from './types.js';

const fighter = (id: string, weapon: string): FighterInput => ({
  id, username: id, level: 1, title: null,
  attributes: { str: 5, dex: 5, vig: 5, fort: 5, ess: 5, int: 5, fai: 5 },
  look: { ...DEFAULT_AVATAR }, equipment: { weapon, helm: null, chest: null, gloves: null, legs: null },
});
const A = fighter('a', 'espada-curta-recruta');
const B = fighter('b', 'cajado-aprendiz');

test('evento lendário: quem ativa vence na hora, mesmo com o outro cheio de vidas', () => {
  for (const p of [0, 1] as const) {
    const r = simulateBattle({ seed: 42, fighters: [A, B], legend: { at: 200, p, variant: 1 } });
    const ev = r.events.find((e) => e.type === 'legend');
    assert.ok(ev && ev.type === 'legend');
    assert.equal(ev.p, p);
    assert.equal(r.winner, p);
    const end = r.events.find((e) => e.type === 'end');
    assert.ok(end && end.type === 'end' && end.reason === 'legend');
    // o adversário ainda tinha todas as vidas antes da cena
    const before = r.frames.find((f) => f[0] >= ev.t)!;
    assert.equal(before[1 + (1 - p) * 10 + 8], BALANCE.combat.lives);
    // a cena inteira está no replay
    assert.ok(r.duration >= ev.t + ev.dur);
    // nada acontece durante a cena (nenhum golpe, nenhum dano)
    assert.equal(r.events.filter((e) => (e.type === 'hit' || e.type === 'attack') && e.t > ev.t && e.t < ev.t + ev.dur).length, 0);
  }
});

test('evento lendário só acontece quando ativado', () => {
  for (let s = 0; s < 300; s++) {
    const r = simulateBattle({ seed: s * 31 + 7, fighters: [A, B] });
    assert.ok(!r.events.some((e) => e.type === 'legend'));
  }
  for (const p of [0, 1] as const) {
    const r = simulateBattleWithLegend({ seed: 99, fighters: [A, B] }, p);
    const ev = r.events.find((e) => e.type === 'legend');
    assert.ok(ev && ev.type === 'legend' && ev.p === p);
    assert.equal(r.winner, p);
  }
});
