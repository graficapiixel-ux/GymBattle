import { cpf } from './_util.js';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/auth.js';

const app = createApp();
const tag = Math.random().toString(36).slice(2, 8);
const old = request.agent(app);
const admin = request.agent(app);
let oldId = '';

before(async () => {
  // conta antiga, criada antes do CPF ser obrigatório
  const u = await prisma.user.create({ data: { email: `old_${tag}@test.dev`, username: `old_${tag}`, passwordHash: await hashPassword('senhaforte123') } });
  oldId = u.id;
  await old.post('/api/auth/login').send({ email: `old_${tag}@test.dev`, password: 'senhaforte123' }).expect(200);
  await admin.post('/api/auth/login').send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }).expect(200);
});
after(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: `_${tag}@test.dev` } } });
  await prisma.$disconnect();
});

test('cadastro: limite por IP folgado (várias pessoas da mesma academia conseguem criar conta)', async () => {
  for (let i = 0; i < 8; i++) {
    await request(app).post('/api/auth/register').send({ email: `n${i}_${tag}@test.dev`, username: `n${i}_${tag}`, password: 'senhaforte123', cpf: cpf() }).expect(201);
  }
});

test('conta antiga confirma o CPF uma vez; válido, único e não pode trocar', async () => {
  let me = await old.get('/api/auth/me').expect(200);
  assert.equal(me.body.user.hasCpf, false);
  let r = await old.post('/api/me/cpf').send({ cpf: '123.456.789-00' });
  assert.equal(r.status, 400);
  // CPF de outra conta
  const taken = cpf();
  await request(app).post('/api/auth/register').send({ email: `t_${tag}@test.dev`, username: `t_${tag}`, password: 'senhaforte123', cpf: taken }).expect(201);
  r = await old.post('/api/me/cpf').send({ cpf: taken });
  assert.equal(r.body.code, 'CPF_TAKEN');
  const mine = cpf();
  r = await old.post('/api/me/cpf').send({ cpf: mine }).expect(200);
  assert.equal(r.body.user.hasCpf, true);
  assert.equal(r.body.user.cpfLast2, mine.slice(-2));
  r = await old.post('/api/me/cpf').send({ cpf: cpf() });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'CPF_LOCKED');
  me = await old.get('/api/auth/me').expect(200);
  assert.equal(me.body.user.hasCpf, true);
});

test('foto de perfil (qualquer foto, até da galeria); admin pode remover', async () => {
  const img = await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 200, g: 40, b: 90 } } }).jpeg().toBuffer();
  let r = await old.post('/api/me/photo').attach('photo', img, 'eu.jpg').expect(200);
  const url = r.body.user.photoUrl as string;
  assert.match(url, /^\/uploads\/avatars\/.+\.webp$/);
  const file = await request(app).get(url).expect(200);
  const meta = await sharp(file.body).metadata();
  assert.equal(meta.width, 320);
  assert.equal(meta.height, 320);
  // aparece para os outros
  const pub = await admin.get(`/api/users/old_${tag}`).expect(200);
  assert.equal(pub.body.user.photoUrl, url);
  r = await admin.delete(`/api/admin/users/${oldId}/photo`).expect(200);
  assert.equal(r.body.user.photoUrl, null);
  await request(app).get(url).expect((res) => assert.notEqual(res.status, 200));
  await old.post('/api/me/photo').attach('photo', Buffer.from('nada'), 'x.jpg').expect(400);
});
