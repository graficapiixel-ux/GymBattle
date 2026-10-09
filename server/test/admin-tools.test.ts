import { cpf, groupUp } from './_util.js';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { gunzipSync } from 'node:zlib';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import type { Replay } from '@gymbattle/shared';

const app = createApp();
const tag = Math.random().toString(36).slice(2, 8);
const ag = { x: request.agent(app), y: request.agent(app), admin: request.agent(app) };
const ids: Record<string, string> = {};

before(async () => {
  for (const k of ['x', 'y'] as const) {
    const r = await ag[k].post('/api/auth/register').send({ email: `${k}_${tag}@test.dev`, username: `${k}_${tag}`, password: 'senhaforte123', cpf: cpf() });
    ids[k] = r.body.user.id;
    await ag[k].post('/api/shop/starter').send({ weaponId: 'espada-curta-recruta' });
  }
  await groupUp(Object.values(ids));
  await ag.admin.post('/api/auth/login').send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }).expect(200);
});
after(async () => {
  await prisma.battle.deleteMany({ where: { OR: [{ aName: { endsWith: tag } }, { bName: { endsWith: tag } }] } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `_${tag}@test.dev` } } });
  await prisma.$disconnect();
});

test('só o admin mexe em XP, ouro, itens e evento', async () => {
  await ag.x.post(`/api/admin/users/${ids.y}/gold`).send({ amount: 100 }).expect(403);
  await ag.x.put(`/api/admin/users/${ids.y}/legend`).send({ on: true }).expect(403);
});

test('admin dá e tira XP e ouro', async () => {
  let r = await ag.admin.post(`/api/admin/users/${ids.x}/xp`).send({ amount: 5000 }).expect(200);
  assert.ok(r.body.user.level > 1);
  const lvl = r.body.user.level;
  r = await ag.admin.post(`/api/admin/users/${ids.x}/xp`).send({ amount: -99999 }).expect(200);
  assert.equal(r.body.user.level, lvl); // nível não cai
  r = await ag.admin.post(`/api/admin/users/${ids.x}/gold`).send({ amount: 500 }).expect(200);
  const g = r.body.user.gold;
  r = await ag.admin.post(`/api/admin/users/${ids.x}/gold`).send({ amount: -200 }).expect(200);
  assert.equal(r.body.user.gold, g - 200);
  r = await ag.admin.post(`/api/admin/users/${ids.x}/gold`).send({ amount: -999999 }).expect(200);
  assert.equal(r.body.user.gold, 0);
  await ag.admin.post(`/api/admin/users/${ids.x}/gold`).send({ amount: 0 }).expect(400);
});

test('admin dá e tira itens (e desequipa)', async () => {
  let r = await ag.admin.post(`/api/admin/users/${ids.x}/items`).send({ itemId: 'uchigatana' }).expect(200);
  assert.ok(r.body.user.items.some((i: { itemId: string }) => i.itemId === 'uchigatana'));
  const armor = 'armor:' + (await import('@gymbattle/shared')).ARMOR_SETS[0].id + ':helm';
  await ag.admin.post(`/api/admin/users/${ids.x}/items`).send({ itemId: armor }).expect(200);
  await ag.admin.post(`/api/admin/users/${ids.x}/items`).send({ itemId: 'nao-existe' }).expect(404);
  // equipa a katana e o admin tira: volta para a arma inicial
  await ag.x.put('/api/shop/equip').send({ slot: 'weapon', itemId: 'uchigatana' }).expect(200);
  r = await ag.admin.delete(`/api/admin/users/${ids.x}/items/uchigatana`).expect(200);
  assert.ok(!r.body.user.items.some((i: { itemId: string }) => i.itemId === 'uchigatana'));
  const u = await prisma.user.findUniqueOrThrow({ where: { id: ids.x } });
  assert.equal((u.equipment as { weapon: string }).weapon, 'espada-curta-recruta');
  r = await ag.admin.delete(`/api/admin/users/${ids.x}/items/${encodeURIComponent(armor)}`).expect(200);
  assert.equal(r.body.user.items.filter((i: { kind: string }) => i.kind === 'armor').length, 0);
});

test('evento lendário: acontece só na próxima luta e desliga sozinho', async () => {
  const r = await ag.admin.put(`/api/admin/users/${ids.y}/legend`).send({ on: true }).expect(200);
  assert.equal(r.body.user.legendNext, true);
  const fight = async () => {
    await prisma.user.updateMany({ where: { id: { in: [ids.x, ids.y] } }, data: { protectedUntil: null } });
    await prisma.challenge.deleteMany({ where: { challengerId: ids.x } });
    const ch = await ag.x.post('/api/ranking/challenges').send({ defenderId: ids.y }).expect(201);
    const res = await ag.y.post(`/api/ranking/challenges/${ch.body.challenge.id}/accept`).expect(200);
    const b = await prisma.battle.findUniqueOrThrow({ where: { id: res.body.battle.id } });
    return JSON.parse(gunzipSync(b.replay).toString()) as Replay;
  };
  const r1 = await fight();
  const ev = r1.events.find((e) => e.type === 'legend');
  assert.ok(ev && ev.type === 'legend');
  assert.equal(ev.p, 1); // y é o defensor (lutador 1)
  assert.equal(r1.winner, 1);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: ids.y } })).legendNext, false);
  const r2 = await fight();
  assert.ok(!r2.events.some((e) => e.type === 'legend'));
});
