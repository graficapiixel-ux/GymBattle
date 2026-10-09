import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyXp, xpToNext, postReward, nextStreak, currentStreak, dayKey, weekKey,
  effectiveAttr, hitboxFor,
} from './progression.js';

test('curva de XP: 150 + 50 × nível', () => {
  assert.equal(xpToNext(1), 200);
  assert.equal(xpToNext(10), 650);
});

test('applyXp sobe vários níveis e dá pontos de atributo', () => {
  const r = applyXp({ level: 1, xp: 0, attrPoints: 0 }, 200 + 250 + 10);
  assert.equal(r.level, 3);
  assert.equal(r.xp, 10);
  assert.equal(r.attrPoints, 2);
});

test('XP pode ficar negativo sem perder nível', () => {
  const r = applyXp({ level: 5, xp: 30, attrPoints: 0 }, -150);
  assert.equal(r.level, 5);
  assert.equal(r.xp, -120);
});

test('recompensa com streak: +10%/dia, máx +50%', () => {
  assert.deepEqual(postReward(1), { xp: 100, gold: 50, bonus: 0 });
  assert.equal(postReward(3).xp, 120);
  assert.equal(postReward(6).xp, 150);
  assert.equal(postReward(30).xp, 150);
});

test('dayKey usa o fuso de Brasília', () => {
  // 02:00 UTC = 23:00 do dia anterior em Brasília
  assert.equal(dayKey(new Date('2026-09-30T02:00:00Z')), '2026-09-29');
});

test('weekKey retorna a segunda-feira', () => {
  assert.equal(weekKey('2026-10-04'), '2026-09-28'); // domingo
  assert.equal(weekKey('2026-09-28'), '2026-09-28');
});

test('streak: dias seguidos, 1 descanso por semana, 2 faltas zera', () => {
  let s = nextStreak({ streak: 0, lastPostDay: null, restWeeks: [] }, '2026-09-28');
  assert.equal(s.streak, 1);
  s = nextStreak(s, '2026-09-29');
  assert.equal(s.streak, 2);
  s = nextStreak(s, '2026-10-01'); // pulou 30/09 (descanso)
  assert.equal(s.streak, 3);
  const broken = nextStreak(s, '2026-10-03'); // pulou 02/10, mesma semana → zera
  assert.equal(broken.streak, 1);
  assert.equal(currentStreak(s, '2026-10-03'), 0);
  assert.equal(currentStreak(s, '2026-10-02'), 3);
});

test('soft cap de atributos', () => {
  assert.equal(effectiveAttr(30), 30);
  assert.equal(effectiveAttr(45), 37.5);
  assert.equal(effectiveAttr(60), 40.5);
});

test('hitbox e alcance são iguais para todos (altura não influencia)', () => {
  const tall = hitboxFor(1.1);
  const short = hitboxFor(0.9);
  assert.deepEqual(tall, short);
  assert.equal(tall.reachMult, 1);
  assert.deepEqual([tall.w, tall.h], [44, 96]);
});
