import { cpf, groupUp } from './_util.js';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { simulateBattle, type Replay } from '@gymbattle/shared';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';

const app = createApp();
const tag = Math.random().toString(36).slice(2, 8);
const agents = { a: request.agent(app), b: request.agent(app), spec: request.agent(app) };
const ids: Record<string, string> = {};

before(async () => {
  for (const k of ['a', 'b', 'spec'] as const) {
    const r = await agents[k].post('/api/auth/register').send({ email: `${k}_${tag}@test.dev`, username: `${k}_${tag}`, password: 'senhaforte123', cpf: cpf() });
    ids[k] = r.body.user.id;
  }
  await agents.a.post('/api/shop/starter').send({ weaponId: 'espada-curta-recruta' }).expect(200);
  await agents.b.post('/api/shop/starter').send({ weaponId: 'cajado-aprendiz' }).expect(200);
  await groupUp(Object.values(ids));
});
after(async () => {
  await prisma.battle.deleteMany({ where: { OR: [{ aName: { endsWith: tag } }, { bName: { endsWith: tag } }] } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `_${tag}@test.dev` } } });
  await prisma.$disconnect();
});

let battleId = '';

test('luta (desafio aceito) é simulada no servidor e gravada; amistosa não existe mais', async () => {
  const c = await agents.a.post('/api/ranking/challenges').send({ defenderId: ids.b }).expect(201);
  const r = await agents.b.post(`/api/ranking/challenges/${c.body.challenge.id}/accept`).expect(200);
  battleId = r.body.battle.id;
  assert.equal(r.body.battle.mode, 'ranked');
  assert.ok(r.body.battle.durationSec > 3);
  await agents.a.post('/api/battles/friendly').send({ opponentId: ids.b }).expect(404);
});

test('duelo ao vivo: os dois lutadores veem a luta em /battles/live; quem não luta, não', async () => {
  const a = await agents.a.get('/api/battles/live').expect(200);
  assert.equal(a.body.battle?.id, battleId);
  assert.ok(Date.parse(a.body.battle.endsAt) > Date.parse(a.body.serverNow));
  const b = await agents.b.get('/api/battles/live').expect(200);
  assert.equal(b.body.battle?.id, battleId);
  const spec = await agents.spec.get('/api/battles/live').expect(200);
  assert.equal(spec.body.battle, null);
  // depois que acaba, ninguém fica preso
  await prisma.battle.update({ where: { id: battleId }, data: { createdAt: new Date(Date.now() - 10 * 60_000) } });
  const after = await agents.a.get('/api/battles/live').expect(200);
  assert.equal(after.body.battle, null);
  const one = await agents.a.get(`/api/battles/${battleId}`).expect(200);
  assert.ok(one.body.battle.endsAt && one.body.serverNow);
});

test('lutador A, lutador B e espectador recebem EXATAMENTE o mesmo replay', async () => {
  const get = (k: keyof typeof agents) =>
    agents[k].get(`/api/battles/${battleId}/replay`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
  const [ra, rb, rs] = await Promise.all([get('a'), get('b'), get('spec')]);
  for (const r of [ra, rb, rs]) assert.equal(r.status, 200);
  assert.ok((ra.body as Buffer).equals(rb.body as Buffer));
  assert.ok((ra.body as Buffer).equals(rs.body as Buffer));

  const replay: Replay = JSON.parse((ra.body as Buffer).toString('utf8'));
  assert.equal(replay.fighters[0].username, `a_${tag}`);
  assert.equal(replay.fighters[1].username, `b_${tag}`);
  assert.ok(replay.frames.length > 50);
  assert.ok(replay.events.some((e) => e.type === 'attack'), 'deve ter ataques');
  assert.ok(replay.events.some((e) => e.type === 'hit'), 'deve ter acertos');
  assert.ok(replay.events.some((e) => e.type === 'end'), 'deve terminar');
  // ataques dos DOIS lutadores estão no replay (todos veem os ataques de todos)
  assert.ok(replay.events.some((e) => e.type === 'attack' && e.p === 0));
  assert.ok(replay.events.some((e) => e.type === 'attack' && e.p === 1));

  const summary = await agents.spec.get(`/api/battles/${battleId}`).expect(200);
  assert.equal(summary.body.battle.winner, replay.winner);
});

test('simulação é determinística (mesma semente = mesma luta)', async () => {
  const r = await agents.a.get(`/api/battles/${battleId}/replay`).set('Accept-Encoding', 'identity');
  const replay: Replay = JSON.parse(r.text);
  const again = simulateBattle({ seed: replay.seed, mapId: replay.map, fighters: [replay.fighters[0], replay.fighters[1]] });
  assert.equal(JSON.stringify(again.frames), JSON.stringify(replay.frames));
  assert.equal(JSON.stringify(again.events), JSON.stringify(replay.events));
});

test('histórico e lista de oponentes', async () => {
  const h = await agents.b.get('/api/battles').expect(200);
  assert.ok(h.body.battles.some((b: any) => b.id === battleId));
  const o = await agents.a.get('/api/battles/opponents').query({ q: tag }).expect(200);
  assert.ok(o.body.users.some((u: any) => u.id === ids.b && 'protectedUntil' in u));
  assert.ok(!o.body.users.some((u: any) => u.id === ids.a));
});
