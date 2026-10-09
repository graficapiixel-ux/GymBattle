import { cpf } from './_util.js';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';

const app = createApp();
const tag = Math.random().toString(36).slice(2, 8);
const p = request.agent(app);
const admin = request.agent(app);
let id = '';

before(async () => {
  const r = await p.post('/api/auth/register').send({ email: `gift_${tag}@test.dev`, username: `gift_${tag}`, password: 'senhaforte123', cpf: cpf() });
  id = r.body.user.id;
  await admin.post('/api/auth/login').send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }).expect(200);
});
after(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: `_${tag}@test.dev` } } });
  await prisma.$disconnect();
});

test('presente COM motivo gera aviso; SEM motivo só entrega', async () => {
  const before = await prisma.user.findUniqueOrThrow({ where: { id } });
  await admin.post(`/api/admin/users/${id}/gold`).send({ amount: 77 }).expect(200);
  let g = await p.get('/api/me/gifts').expect(200);
  assert.equal(g.body.gifts.length, 0);
  await admin.post(`/api/admin/users/${id}/gold`).send({ amount: 50, reason: 'boss de hoje' }).expect(200);
  await admin.post(`/api/admin/users/${id}/items`).send({ itemId: 'espada-curta-recruta', reason: 'presente' }).expect(200);
  await admin.post(`/api/admin/users/${id}/xp`).send({ amount: 30, reason: '   ' }).expect(200); // motivo em branco = sem aviso
  await admin.post(`/api/admin/users/${id}/xp`).send({ amount: -10, reason: 'tirando' }).expect(200); // tirar nunca avisa
  const after = await prisma.user.findUniqueOrThrow({ where: { id } });
  assert.equal(after.gold, before.gold + 127);
  g = await p.get('/api/me/gifts').expect(200);
  assert.equal(g.body.gifts.length, 2);
  assert.equal(g.body.gifts[0].kind, 'GOLD');
  assert.equal(g.body.gifts[0].reason, 'boss de hoje');
  assert.equal(g.body.gifts[1].kind, 'ITEM');
  assert.equal(g.body.gifts[1].itemName, 'Espada Curta do Recruta');
  assert.ok(g.body.gifts[1].rarity);
  // marcar visto: some da fila (um de cada vez)
  await p.post(`/api/me/gifts/${g.body.gifts[0].id}/seen`).expect(200);
  g = await p.get('/api/me/gifts').expect(200);
  assert.equal(g.body.gifts.length, 1);
  // outra pessoa não marca o presente dos outros
  await admin.post(`/api/me/gifts/${g.body.gifts[0].id}/seen`).expect(200);
  assert.equal((await p.get('/api/me/gifts')).body.gifts.length, 1);
  // log do admin tem tudo
  const log = await admin.get('/api/admin/gifts').expect(200);
  const mine = log.body.gifts.filter((x: { username: string }) => x.username === `gift_${tag}`);
  assert.equal(mine.length, 5);
  assert.ok(mine.some((x: { reason: string | null }) => x.reason === 'boss de hoje'));
  await p.get('/api/admin/gifts').expect(403);
});
