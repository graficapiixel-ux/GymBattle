import { cpf } from './_util.js';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';

const app = createApp();
const tag = Math.random().toString(36).slice(2, 8);
const names = ['dono', 'adm', 'm1', 'm2', 'm3', 'fora', 'fora2'] as const;
type K = (typeof names)[number];
const ag = Object.fromEntries(names.map((k) => [k, request.agent(app)])) as Record<K, ReturnType<typeof request.agent>>;
const ids = {} as Record<K, string>;
const uname = (k: K) => `g${k}_${tag}`;
const siteAdmin = request.agent(app);

before(async () => {
  for (const k of names) {
    const r = await ag[k].post('/api/auth/register').send({ email: `${k}_${tag}@test.dev`, username: uname(k), password: 'senhaforte123', cpf: cpf() });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    ids[k] = r.body.user.id;
    await ag[k].post('/api/shop/starter').send({ weaponId: 'espada-curta-recruta' });
  }
  await siteAdmin.post('/api/auth/login').send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }).expect(200);
});

after(async () => {
  const users = await prisma.user.findMany({ where: { email: { endsWith: `_${tag}@test.dev` } }, select: { groupId: true } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `_${tag}@test.dev` } } });
  const gids = [...new Set(users.map((u) => u.groupId).filter(Boolean))] as string[];
  await prisma.group.deleteMany({ where: { id: { in: gids } } });
  await prisma.group.deleteMany({ where: { name: { contains: tag } } });
  await prisma.$disconnect();
});

test('cadastro exige CPF válido e único; login continua só com e-mail e senha', async () => {
  const base = { email: `semcpf_${tag}@test.dev`, username: `semcpf_${tag}`, password: 'senhaforte123' };
  let r = await request(app).post('/api/auth/register').send(base);
  assert.equal(r.status, 400);
  r = await request(app).post('/api/auth/register').send({ ...base, cpf: '111.111.111-11' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /CPF inválido/);
  const c = cpf();
  r = await request(app).post('/api/auth/register').send({ ...base, cpf: `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` });
  assert.equal(r.status, 201);
  // o CPF nunca é guardado em texto
  const u = await prisma.user.findUniqueOrThrow({ where: { email: base.email } });
  assert.ok(u.cpfHash && u.cpfHash.length === 64 && !u.cpfHash.includes(c));
  r = await request(app).post('/api/auth/register').send({ email: `outra_${tag}@test.dev`, username: `outra_${tag}`, password: 'senhaforte123', cpf: c });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'CPF_TAKEN');
  r = await request(app).post('/api/auth/login').send({ email: base.email, password: 'senhaforte123' });
  assert.equal(r.status, 200);
});

let groupId = '';
let code = '';

test('criar grupo: quem cria é o dono; admin do grupo NÃO acessa o admin do site', async () => {
  const r = await ag.dono.post('/api/groups').send({ name: `Galera ${tag}` }).expect(201);
  groupId = r.body.group.id;
  assert.equal(r.body.user.groupRole, 'OWNER');
  assert.equal(r.body.user.isAdmin, false);
  await ag.dono.get('/api/admin/groups').expect(403);
  await ag.dono.get('/api/admin/users').expect(403);
  const mine = await ag.dono.get('/api/groups/mine').expect(200);
  assert.equal(mine.body.group.memberCount, 1);
  assert.equal(mine.body.group.tournamentOpen, false);
  assert.ok(mine.body.inviteCode);
  code = mine.body.inviteCode;
});

test('convite por nome e por link; membro comum não convida', async () => {
  // convite por nome → notificação
  await ag.dono.post('/api/groups/mine/invites').send({ username: uname('adm') }).expect(201);
  await ag.dono.post('/api/groups/mine/invites').send({ username: uname('adm') }).expect(409);
  const n = await prisma.notification.findFirst({ where: { userId: ids.adm, type: 'GROUP_INVITE' } });
  assert.ok(n);
  const mine = await ag.adm.get('/api/groups/mine').expect(200);
  assert.equal(mine.body.invites.length, 1);
  await ag.adm.post(`/api/groups/invites/${mine.body.invites[0].id}/accept`).send({}).expect(200);

  // prévia do link funciona até sem login
  const prev = await request(app).get(`/api/groups/invite/${code}`).expect(200);
  assert.equal(prev.body.group.name, `Galera ${tag}`);
  await request(app).get('/api/groups/invite/naoexiste').expect(404);
  for (const k of ['m1', 'm2'] as const) {
    const r = await ag[k].post('/api/groups/join').send({ code }).expect(200);
    assert.equal(r.body.user.groupId, groupId);
  }
  // membro comum não pode convidar nem pegar o link
  await ag.m1.post('/api/groups/mine/invites').send({ username: uname('m3') }).expect(403);
  await ag.m1.post('/api/groups/mine/invite-link').send({}).expect(403);
  const mm = await ag.m1.get('/api/groups/mine').expect(200);
  assert.equal(mm.body.inviteCode, null);
});

test('torneio só libera com 5 pessoas', async () => {
  let r = await ag.m1.post('/api/ranking/challenges').send({ defenderId: ids.m2 });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'TOURNAMENT_LOCKED');
  assert.match(r.body.error, /faltam 1/);
  await ag.m3.post('/api/groups/join').send({ code }).expect(200);
  const g = await ag.m1.get('/api/groups/mine').expect(200);
  assert.equal(g.body.group.memberCount, 5);
  assert.equal(g.body.group.tournamentOpen, true);
  r = await ag.m1.post('/api/ranking/challenges').send({ defenderId: ids.m2 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
});

test('ranking, oponentes e feed são só do grupo; não dá para desafiar outro grupo', async () => {
  await ag.fora.post('/api/groups').send({ name: `Outro ${tag}` }).expect(201);
  const rk = await ag.m1.get('/api/ranking').expect(200);
  assert.equal(rk.body.total, 5);
  assert.equal(rk.body.group.id, groupId);
  assert.ok(rk.body.leaderboard.every((l: { user: { id: string } }) => Object.values(ids).includes(l.user.id) && l.user.id !== ids.fora));
  assert.equal(rk.body.prizedPositions, 3);
  const opp = await ag.m1.get('/api/battles/opponents').expect(200);
  assert.equal(opp.body.users.length, 4);
  assert.ok(!opp.body.users.some((u: { id: string }) => u.id === ids.fora));
  const r = await ag.m1.post('/api/ranking/challenges').send({ defenderId: ids.fora });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'OTHER_GROUP');
  await ag.m1.get(`/api/ranking/preview/${ids.fora}`).expect(404);
  // sem grupo: ranking vazio
  const solo = await ag.fora2.get('/api/ranking').expect(200);
  assert.equal(solo.body.group, null);
  assert.equal(solo.body.leaderboard.length, 0);
  // feed: post de outro grupo não aparece
  const post = await prisma.post.create({
    data: { userId: ids.fora, imagePath: 'x.webp', width: 10, height: 10, day: '2026-01-01', source: 'camera' },
  });
  const feed = await ag.m1.get('/api/posts').expect(200);
  assert.ok(!feed.body.posts.some((p: { id: string }) => p.id === post.id));
  const feedFora = await ag.fora.get('/api/posts').expect(200);
  assert.ok(feedFora.body.posts.some((p: { id: string }) => p.id === post.id));
  await prisma.post.delete({ where: { id: post.id } });
});

test('só 1 grupo por vez: entrar em outro pede confirmação e sai do anterior (desafios pendentes caem)', async () => {
  const pend = await prisma.challenge.findFirst({ where: { challengerId: ids.m1, status: 'PENDING' } });
  assert.ok(pend);
  await ag.fora.post('/api/groups/mine/invites').send({ username: uname('m1') }).expect(201);
  const inv = (await ag.m1.get('/api/groups/mine').expect(200)).body.invites[0];
  let r = await ag.m1.post(`/api/groups/invites/${inv.id}/accept`).send({});
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'ALREADY_IN_GROUP');
  assert.match(r.body.error, new RegExp(`Galera ${tag}`));
  r = await ag.m1.post(`/api/groups/invites/${inv.id}/accept`).send({ confirmLeave: true });
  assert.equal(r.status, 200);
  assert.notEqual(r.body.user.groupId, groupId);
  assert.equal((await prisma.challenge.findUniqueOrThrow({ where: { id: pend.id } })).status, 'CANCELLED');
  assert.equal(await prisma.user.count({ where: { groupId } }), 4);
  // volta pelo link (também pede confirmação)
  r = await ag.m1.post('/api/groups/join').send({ code });
  assert.equal(r.body.code, 'ALREADY_IN_GROUP');
  await ag.m1.post('/api/groups/join').send({ code, confirmLeave: true }).expect(200);
  // o grupo "Outro" ficou só com o dono dele
  const fora = await prisma.user.findUniqueOrThrow({ where: { id: ids.fora } });
  assert.equal(await prisma.user.count({ where: { groupId: fora.groupId } }), 1);
});

test('cargos: admin promove e remove membro; só o dono rebaixa ou remove admin; ninguém remove o dono', async () => {
  // dono promove "adm"
  await ag.dono.post(`/api/groups/mine/members/${ids.adm}/role`).send({ role: 'ADMIN' }).expect(200);
  // admin promove m2 a admin
  await ag.adm.post(`/api/groups/mine/members/${ids.m2}/role`).send({ role: 'ADMIN' }).expect(200);
  // admin NÃO rebaixa admin, NÃO remove admin, NÃO mexe no dono
  await ag.adm.post(`/api/groups/mine/members/${ids.m2}/role`).send({ role: 'MEMBER' }).expect(403);
  await ag.adm.delete(`/api/groups/mine/members/${ids.m2}`).expect(403);
  await ag.adm.delete(`/api/groups/mine/members/${ids.dono}`).expect(403);
  await ag.adm.post(`/api/groups/mine/members/${ids.dono}/role`).send({ role: 'MEMBER' }).expect(403);
  // membro comum não mexe em ninguém
  await ag.m3.delete(`/api/groups/mine/members/${ids.m1}`).expect(403);
  // admin remove membro comum
  await ag.adm.delete(`/api/groups/mine/members/${ids.m3}`).expect(200);
  const m3 = await prisma.user.findUniqueOrThrow({ where: { id: ids.m3 } });
  assert.equal(m3.groupId, null);
  // admin do grupo muda o nome; membro comum não
  await ag.adm.patch('/api/groups/mine').send({ name: `Galera Nova ${tag}` }).expect(200);
  assert.equal((await prisma.group.findUniqueOrThrow({ where: { id: groupId } })).name, `Galera Nova ${tag}`);
  await ag.m1.patch('/api/groups/mine').send({ name: `Hack ${tag}` }).expect(403);
  // dono rebaixa admin
  await ag.dono.post(`/api/groups/mine/members/${ids.m2}/role`).send({ role: 'MEMBER' }).expect(200);
  // o admin do grupo continua sem acesso ao admin do site
  await ag.adm.get('/api/admin/groups').expect(403);
  const me = await ag.adm.get('/api/auth/me').expect(200);
  assert.equal(me.body.user.groupRole, 'ADMIN');
  assert.equal(me.body.user.isAdmin, false);
});

test('admin do site vê todos os grupos, espia um grupo e corrige cargos', async () => {
  const list = await siteAdmin.get(`/api/admin/groups?q=${tag}`).expect(200);
  const g = list.body.groups.find((x: { id: string }) => x.id === groupId);
  assert.ok(g);
  assert.equal(g.owner.username, uname('dono'));
  const spy = await siteAdmin.get(`/api/admin/groups/${groupId}`).expect(200);
  assert.equal(spy.body.members.length, g.memberCount);
  assert.ok(Array.isArray(spy.body.posts) && Array.isArray(spy.body.battles));
  await siteAdmin.post(`/api/admin/groups/${groupId}/members/${ids.m1}/role`).send({ role: 'ADMIN' }).expect(200);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: ids.m1 } })).groupRole, 'ADMIN');
  // não mexe no dono
  await siteAdmin.post(`/api/admin/groups/${groupId}/members/${ids.dono}/role`).send({ role: 'MEMBER' }).expect(400);
});

test('dono sai: o admin mais antigo vira dono; último a sair apaga o grupo', async () => {
  await ag.dono.post('/api/groups/mine/leave').expect(200);
  const heir = await prisma.user.findUniqueOrThrow({ where: { id: ids.adm } });
  assert.equal(heir.groupRole, 'OWNER');
  // grupo "Outro": só o dono dele → sair apaga
  const fora = await prisma.user.findUniqueOrThrow({ where: { id: ids.fora } });
  await ag.fora.post('/api/groups/mine/leave').expect(200);
  assert.equal(await prisma.group.findUnique({ where: { id: fora.groupId! } }), null);
});
