import { cpf } from './_util.js';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { bossHousekeeping } from '../src/lib/bossEvents.js';
import { BOSSES } from '../src/bosses/catalog.js';

const app = createApp();
const tag = Math.random().toString(36).slice(2, 8);
const names = ['a', 'b', 'c'] as const;
const ag = Object.fromEntries(names.map((k) => [k, request.agent(app)])) as Record<(typeof names)[number], ReturnType<typeof request.agent>>;
const ids: Record<string, string> = {};
const admin = request.agent(app);
const created: string[] = [];

before(async () => {
  // nenhum outro evento ativo atrapalhando
  await prisma.bossEvent.updateMany({ where: { endedAt: null }, data: { endedAt: new Date() } });
  for (const k of names) {
    const r = await ag[k].post('/api/auth/register').send({ email: `ev${k}_${tag}@test.dev`, username: `ev${k}_${tag}`, password: 'senhaforte123', cpf: cpf() });
    ids[k] = r.body.user.id;
    await ag[k].post('/api/shop/starter').send({ weaponId: 'espada-curta-recruta' });
  }
  await admin.post('/api/auth/login').send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }).expect(200);
});
after(async () => {
  await prisma.bossEvent.deleteMany({ where: { id: { in: created } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `_${tag}@test.dev` } } });
  await prisma.$disconnect();
});

const mk = (o: Record<string, unknown> = {}) => ({
  bossId: 'vermithrax', startsAt: new Date(Date.now() - 60_000).toISOString(), hours: 2, attempts: 2, teamSize: 3,
  lootItemId: 'espada-do-primeiro-rei', lootGold: 50, lootXp: 0, lootText: '', winChance: 100, ...o,
});

test('SIGILO: sem evento ativo, jogador não vê nada, nem catálogo, nem kit', async () => {
  const r = await ag.a.get('/api/events/active').expect(200);
  assert.deepEqual(r.body.events, []);
  await ag.a.get('/api/events/kit.js').expect(404);
  await ag.a.get('/api/admin/events/bosses').expect(403);
  await ag.a.get('/api/admin/events').expect(403);
  // admin vê o catálogo inteiro (52)
  const cat = await admin.get('/api/admin/events/bosses').expect(200);
  assert.equal(cat.body.bosses.length, 53);
  assert.ok(cat.body.bosses.every((b: { attacks: unknown[] }) => b.attacks.length >= 4));
  // evento agendado (futuro) continua invisível
  const fut = await admin.post('/api/admin/events').send(mk({ startsAt: new Date(Date.now() + 3_600_000).toISOString() })).expect(201);
  created.push(fut.body.event.id);
  assert.equal(fut.body.event.status, 'SCHEDULED');
  assert.deepEqual((await ag.a.get('/api/events/active')).body.events, []);
  await ag.a.get('/api/events/kit.js').expect(404);
});

let evId = '';
test('evento ativo: aparece sem a chance de vitória; aviso para todos ao começar', async () => {
  const r = await admin.post('/api/admin/events').send(mk()).expect(201);
  evId = r.body.event.id;
  created.push(evId);
  assert.equal(r.body.event.winChance, 100);
  const pub = await ag.a.get('/api/events/active').expect(200);
  assert.equal(pub.body.events.length, 1);
  const e = pub.body.events[0];
  assert.equal(e.boss.name, 'Vermithrax');
  assert.equal(e.attemptsLeft, 2);
  assert.match(e.lootText, /\?\?\?/); // descrição vazia = misteriosa
  const raw = JSON.stringify(pub.body);
  assert.ok(!/winChance|chance/i.test(raw), 'a chance NUNCA vai para o jogador');
  assert.ok(!raw.includes('glaciareth'), 'outros bosses não aparecem');
  // kit liberado (503 nos testes: o arquivo compilado só existe no build)
  const kit = await ag.a.get('/api/events/kit.js');
  assert.ok([200, 503].includes(kit.status));
  await bossHousekeeping();
  const n = await prisma.notification.findFirst({ where: { userId: ids.a, type: 'BOSS_EVENT' } });
  assert.ok(n, 'todos recebem o aviso do evento');
  await bossHousekeeping(); // não repete
  assert.equal(await prisma.notification.count({ where: { userId: ids.a, type: 'BOSS_EVENT' } }), 1);
});

test('time: convite, aceite, luta; cada um ganha o espólio inteiro; tentativas contam', async () => {
  let r = await ag.a.post(`/api/events/${evId}/run`).expect(200);
  const runId = r.body.event.run.id;
  await ag.b.post(`/api/events/runs/${runId}/invite`).send({ username: `evc_${tag}` }).expect(403); // só o líder convida
  await ag.a.post(`/api/events/runs/${runId}/invite`).send({ username: `evb_${tag}` }).expect(200);
  await ag.a.post(`/api/events/runs/${runId}/invite`).send({ username: `evc_${tag}` }).expect(200);
  await ag.a.post(`/api/events/runs/${runId}/invite`).send({ username: `evc_${tag}` }).expect(409);
  const inv = await ag.b.get('/api/events/active').expect(200);
  assert.equal(inv.body.events[0].invites.length, 1);
  await ag.b.post(`/api/events/runs/${runId}/accept`).expect(200);
  // c não aceitou: fica de fora
  await ag.b.post(`/api/events/runs/${runId}/fight`).expect(409); // só o líder luta
  const goldBefore = (await prisma.user.findUniqueOrThrow({ where: { id: ids.b } })).gold;
  r = await ag.a.post(`/api/events/runs/${runId}/fight`).expect(200);
  assert.equal(r.body.runId, runId);
  await ag.a.post(`/api/events/runs/${runId}/fight`).expect(409); // não luta duas vezes
  const rep = await ag.b.get(`/api/events/runs/${runId}/replay`).expect(200);
  assert.equal(rep.body.replay.won, true); // chance 100%
  assert.equal(rep.body.replay.players.length, 2);
  await ag.c.get(`/api/events/runs/${runId}/replay`).expect(403); // não lutou
  // espólio para CADA um
  for (const k of ['a', 'b'] as const) {
    assert.ok(await prisma.inventoryItem.findUnique({ where: { userId_itemId: { userId: ids[k], itemId: 'espada-do-primeiro-rei' } } }));
  }
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: ids.b } })).gold, goldBefore + 50);
  assert.equal(await prisma.inventoryItem.count({ where: { userId: ids.c, itemId: 'espada-do-primeiro-rei' } }), 0);
  // o aviso grande só aparece depois que a luta passa (sem spoiler)
  assert.equal((await ag.b.get('/api/me/gifts')).body.gifts.length, 0);
  await prisma.gift.updateMany({ where: { userId: ids.b, eventId: evId }, data: { showAt: new Date(Date.now() - 1000) } });
  const g = await ag.b.get('/api/me/gifts').expect(200);
  assert.equal(g.body.gifts.length, 2);
  assert.match(g.body.gifts[0].reason, /Vitória contra Vermithrax/);
  // tentativas: 1 de 2 usada
  const pub = await ag.a.get('/api/events/active').expect(200);
  assert.equal(pub.body.events[0].attemptsLeft, 1);
  assert.equal(pub.body.events[0].history.length, 1);
  // histórico do admin
  const h = await admin.get(`/api/admin/events/${evId}/history`).expect(200);
  assert.equal(h.body.runs.length, 1);
  assert.equal(h.body.loot.length, 4);
  // segunda e última tentativa (solo), depois acabou
  r = await ag.a.post(`/api/events/${evId}/run`).expect(200);
  await ag.a.post(`/api/events/runs/${r.body.event.run.id}/fight`).expect(200);
  const no = await ag.a.post(`/api/events/${evId}/run`);
  assert.equal(no.body.code, 'NO_ATTEMPTS');
});

test('chance 0%: sempre derrota e ninguém ganha nada', async () => {
  const r = await admin.post('/api/admin/events').send(mk({ bossId: 'ossuario', winChance: 0, teamSize: 1, lootGold: 999 })).expect(201);
  created.push(r.body.event.id);
  const before = (await prisma.user.findUniqueOrThrow({ where: { id: ids.c } })).gold;
  const run = await ag.c.post(`/api/events/${r.body.event.id}/run`).expect(200);
  // c ainda tem outro evento ativo (vermithrax); este é o ossuário
  await ag.c.post(`/api/events/runs/${run.body.event.run.id}/fight`).expect(200);
  const rep = await ag.c.get(`/api/events/runs/${run.body.event.run.id}/replay`).expect(200);
  assert.equal(rep.body.replay.won, false);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: ids.c } })).gold, before);
});

test('admin: editar, encerrar (o card some) e prévia', async () => {
  const ed = await admin.put(`/api/admin/events/${evId}`).send(mk({ lootText: 'Uma espada lendária!' })).expect(200);
  assert.equal(ed.body.event.lootText, 'Uma espada lendária!');
  const pv = await admin.post('/api/admin/events/preview').send({ bossId: BOSSES[30].id, won: true, team: 2 }).expect(200);
  assert.equal(pv.body.replay.won, true);
  for (const id of created) await admin.post(`/api/admin/events/${id}/end`).expect(200);
  assert.deepEqual((await ag.a.get('/api/events/active')).body.events, []);
  // quem lutou ainda pode rever a luta (kit liberado por 3 dias)
  const kit = await ag.a.get('/api/events/kit.js');
  assert.ok([200, 503].includes(kit.status), `kit ${kit.status} ${JSON.stringify(kit.body)}`);
  // quem nunca lutou não
  const fresh = request.agent(app);
  await fresh.post('/api/auth/register').send({ email: `evz_${tag}@test.dev`, username: `evz_${tag}`, password: 'senhaforte123', cpf: cpf() });
  await fresh.get('/api/events/kit.js').expect(404);
});
