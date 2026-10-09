import { cpf } from './_util.js';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { setSetting } from '../src/lib/settings.js';

const app = createApp();
const tag = Math.random().toString(36).slice(2, 8);
const mk = (n: string) => ({ email: `${n}_${tag}@test.dev`, username: `${n}_${tag}`, password: 'senhaforte123', cpf: cpf() });

const adminAgent = request.agent(app);
const userAgent = request.agent(app);
const alice = { ...mk('alice') };

before(async () => {
  await setSetting('signupEnabled', 'true');
  const r = await adminAgent
    .post('/api/auth/login')
    .send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
  assert.equal(r.status, 200, 'admin precisa existir (rode npm run db:seed)');
});

after(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: `_${tag}@test.dev` } } });
  await setSetting('signupEnabled', 'true');
  await prisma.$disconnect();
});

test('cadastro cria sessão em cookie httpOnly', async () => {
  const r = await userAgent.post('/api/auth/register').send(alice);
  assert.equal(r.status, 201);
  const cookie = String(r.headers['set-cookie']);
  assert.match(cookie, /gb_session=/);
  assert.match(cookie, /HttpOnly/i);
  assert.equal(r.body.user.level, 1);
  assert.equal(r.body.user.isAdmin, false);
  assert.equal(r.body.user.passwordHash, undefined);
  const me = await userAgent.get('/api/auth/me');
  assert.equal(me.body.user.email, alice.email);
});

test('senha errada é recusada; e-mail do admin não pode ser cadastrado', async () => {
  const bad = await request(app).post('/api/auth/login').send({ email: alice.email, password: 'errada123' });
  assert.equal(bad.status, 401);
  const dup = await request(app)
    .post('/api/auth/register')
    .send({ email: process.env.ADMIN_EMAIL, username: `x_${tag}`, password: 'senhaforte123', cpf: cpf() });
  assert.equal(dup.status, 409);
});

test('usuário comum não acessa rotas de admin (checado no backend)', async () => {
  for (const [m, url] of [['get', '/api/admin/users'], ['put', '/api/admin/settings'], ['get', '/api/admin/logs']] as const) {
    const r = await (userAgent as any)[m](url).send({ signupEnabled: false });
    assert.equal(r.status, 403, `${m} ${url}`);
  }
  const anon = await request(app).get('/api/admin/users');
  assert.equal(anon.status, 401);
});

test('admin desativa cadastro público → registro bloqueado; admin ainda cria conta', async () => {
  let r = await adminAgent.put('/api/admin/settings').send({ signupEnabled: false });
  assert.equal(r.status, 200);
  assert.equal((await request(app).get('/api/config')).body.signupEnabled, false);

  r = await request(app).post('/api/auth/register').send(mk('bob'));
  assert.equal(r.status, 403);

  r = await adminAgent.post('/api/admin/users').send(mk('carol'));
  assert.equal(r.status, 201);

  await adminAgent.put('/api/admin/settings').send({ signupEnabled: true });
});

test('admin exclui conta e ação vai para o log; admin não pode se excluir', async () => {
  const list = await adminAgent.get('/api/admin/users').query({ q: `carol_${tag}` });
  const carol = list.body.users[0];
  assert.ok(carol);
  const del = await adminAgent.delete(`/api/admin/users/${carol.id}`);
  assert.equal(del.status, 200);
  const logs = await adminAgent.get('/api/admin/logs');
  assert.ok(logs.body.logs.some((l: any) => l.action === 'DELETE_USER' && l.details.userId === carol.id));

  const me = await adminAgent.get('/api/auth/me');
  const self = await adminAgent.delete(`/api/admin/users/${me.body.user.id}`);
  assert.equal(self.status, 400);
});

test('distribuir pontos e redistribuir (primeira grátis, depois custa ouro)', async () => {
  await prisma.user.update({ where: { email: alice.email }, data: { attrPoints: 5, gold: 1000, level: 6 } });
  let r = await userAgent.post('/api/me/attributes').send({ str: 3, vig: 2 });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.attributes.str, 8);
  assert.equal(r.body.user.attrPoints, 0);

  r = await userAgent.post('/api/me/attributes').send({ dex: 1 });
  assert.equal(r.status, 400); // sem pontos

  r = await userAgent.get('/api/me/respec');
  assert.equal(r.body.cost, 0);
  r = await userAgent.post('/api/me/respec');
  assert.equal(r.status, 200);
  assert.equal(r.body.refunded, 5);
  assert.equal(r.body.user.attributes.str, 5);
  assert.equal(r.body.user.attrPoints, 5);
  assert.equal(r.body.user.gold, 1000);

  // segunda: custo 200 + 10×6 = 260, com cooldown de 24h
  r = await userAgent.post('/api/me/attributes').send({ int: 5 });
  r = await userAgent.post('/api/me/respec');
  assert.equal(r.status, 400);
  await prisma.user.update({ where: { email: alice.email }, data: { lastRespecAt: new Date(Date.now() - 25 * 3600e3) } });
  r = await userAgent.get('/api/me/respec');
  assert.equal(r.body.cost, 260);
  r = await userAgent.post('/api/me/respec');
  assert.equal(r.status, 200);
  assert.equal(r.body.user.gold, 740);
});

test('altura não existe mais: todo mundo tem o mesmo tamanho', async () => {
  const r = await userAgent.put('/api/me/avatar').send({ height: 1.5 });
  assert.equal(r.body.user.avatar.height, 1);
});

test('aparência: personagem feminina, olhos, marcas, acessório e cores da roupa', async () => {
  const r = await userAgent.put('/api/me/avatar').send({ gender: 1, beard: 3, hair: 13, eyes: '#3a7a3a', marks: 2, accessory: 2, top: '#b3263a', shorts: '#16161a' }).expect(200);
  const a = r.body.user.avatar;
  assert.equal(a.gender, 1);
  assert.equal(a.beard, 0); // feminina não usa barba
  assert.deepEqual([a.hair, a.eyes, a.marks, a.accessory, a.top, a.shorts], [13, '#3a7a3a', 2, 2, '#b3263a', '#16161a']);
  await userAgent.put('/api/me/avatar').send({ eyes: '#123456' }).expect(400); // só cores da lista
  await userAgent.put('/api/me/avatar').send({ hair: 99 }).expect(400);
});

test('trocar senha desconecta os OUTROS aparelhos (este continua logado)', async () => {
  const other = request.agent(app);
  await other.post('/api/auth/login').send({ email: alice.email, password: alice.password }).expect(200);
  await other.get('/api/me/respec').expect(200);

  let r = await userAgent.post('/api/me/password').send({ current: 'errada', next: 'novasenha123' });
  assert.equal(r.status, 400);
  r = await userAgent.post('/api/me/password').send({ current: alice.password, next: 'novasenha123' });
  assert.equal(r.status, 200);
  await userAgent.get('/api/me/respec').expect(200); // este aparelho segue logado
  await other.get('/api/me/respec').expect(401); // o outro caiu
  const l = await request(app).post('/api/auth/login').send({ email: alice.email, password: 'novasenha123' });
  assert.equal(l.status, 200);
  alice.password = 'novasenha123';
});

test('sair de todos os aparelhos', async () => {
  const a = request.agent(app);
  const b = request.agent(app);
  await a.post('/api/auth/login').send({ email: alice.email, password: alice.password }).expect(200);
  await b.post('/api/auth/login').send({ email: alice.email, password: alice.password }).expect(200);
  await a.post('/api/auth/logout-all').expect(200);
  await a.get('/api/me/respec').expect(401);
  await b.get('/api/me/respec').expect(401);
  await userAgent.post('/api/auth/login').send({ email: alice.email, password: alice.password }).expect(200);
});

test('segurança: origem estranha, JSON quebrado, nomes reservados, token falso', async () => {
  const evil = await userAgent.post('/api/me/attributes').set('Origin', 'https://site-malicioso.com').send({ str: 1 });
  assert.equal(evil.status, 403);
  const bad = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email": ');
  assert.equal(bad.status, 400);
  const reserved = await request(app).post('/api/auth/register').send({ ...mk('x'), username: 'Admin_Oficial' });
  assert.equal(reserved.status, 400);
  const forged = await request(app).get('/api/auth/me').set('Cookie', 'gb_session=eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.');
  assert.equal(forged.body.user, null);
  const push = await userAgent.post('/api/notifications/push/subscribe').send({ endpoint: 'https://127.0.0.1:8080/x', keys: { p256dh: 'a', auth: 'b' } });
  assert.equal(push.status, 400);
});

test('conta admin é anônima: nome comum e sem título de cargo', async () => {
  const email = String(process.env.ADMIN_EMAIL).toLowerCase();
  const before = await prisma.user.findUniqueOrThrow({ where: { email } });
  await prisma.user.update({ where: { email }, data: { username: 'admin', title: 'Mestre da Arena' } });
  const { ensureAdmin } = await import('../src/startup.js');
  await ensureAdmin();
  const after = await prisma.user.findUniqueOrThrow({ where: { email } });
  assert.match(after.username, /^Lucas\d*$/);
  assert.equal(after.title, null);
  if (before.username !== 'admin') await prisma.user.update({ where: { email }, data: { username: before.username, title: before.title } });
  const pub = await userAgent.get(`/api/users/${after.username}`);
  assert.equal(JSON.stringify(pub.body).includes('ADMIN'), false);
  assert.equal(JSON.stringify(pub.body).includes(email), false);
});

test('logout limpa a sessão', async () => {
  await userAgent.post('/api/auth/logout');
  const r = await userAgent.get('/api/auth/me');
  assert.equal(r.body.user, null);
  const p = await userAgent.get('/api/me/respec');
  assert.equal(p.status, 401);
});
