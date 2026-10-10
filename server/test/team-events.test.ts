import { cpf } from './_util.js';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { bossHousekeeping } from '../src/lib/bossEvents.js';

const app = createApp();
const tag = Math.random().toString(36).slice(2, 8);
const names = ['a', 'b', 'c', 'd', 'e'] as const;
type K = (typeof names)[number];
const ag = Object.fromEntries(names.map((k) => [k, request.agent(app)])) as Record<K, ReturnType<typeof request.agent>>;
const ids: Record<string, string> = {};
const admin = request.agent(app);
const created: string[] = [];
const uname = (k: K) => `te${k}_${tag}`;

before(async () => {
  await prisma.bossEvent.updateMany({ where: { endedAt: null }, data: { endedAt: new Date() } });
  const weapons = ['espada-curta-recruta', 'cajado-aprendiz', 'selo-do-novico', 'espada-curta-recruta', 'cajado-aprendiz'];
  for (let i = 0; i < names.length; i++) {
    const k = names[i];
    const r = await ag[k].post('/api/auth/register').send({ email: `te${k}_${tag}@test.dev`, username: uname(k), password: 'senhaforte123', cpf: cpf() });
    ids[k] = r.body.user.id;
    await ag[k].post('/api/shop/starter').send({ weaponId: weapons[i] }).expect(200);
  }
  await admin.post('/api/auth/login').send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }).expect(200);
});
after(async () => {
  await prisma.bossEvent.deleteMany({ where: { id: { in: created } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `_${tag}@test.dev` } } });
  await prisma.$disconnect();
});

const base = (o: Record<string, unknown> = {}) => ({
  startsAt: new Date(Date.now() - 60_000).toISOString(), hours: 2, attempts: 2, teamSize: 2,
  lootItemId: null, lootGold: 70, lootXp: 0, lootText: '', ...o,
});
/** A chance/dificuldade nunca pode ir para o jogador. */
const noSecrets = (body: unknown) => {
  const raw = JSON.stringify(body);
  assert.ok(!/winChance|chanceAuto|chance|difficulty|TEAM_DIFF/i.test(raw), 'nada de chance para o jogador');
};

test('admin: temas das waves e chance automática por tamanho (só o admin)', async () => {
  await ag.a.get('/api/admin/events/themes').expect(403);
  const r = await admin.get('/api/admin/events/themes').expect(200);
  assert.equal(r.body.themes.length, 6);
  assert.ok(r.body.themes.every((t: { chiefMoves: string[]; monsters: unknown[] }) => t.chiefMoves.length === 6 && t.monsters.length === 4));
  assert.ok(r.body.autoChance['1'] < r.body.autoChance['5'], 'sozinho é mais difícil');
  // tema inválido / tipo trocado
  await admin.post('/api/admin/events').send(base({ kind: 'WAVES', bossId: 'nada' })).expect(400);
});

let pvpId = '';
test('PvP em equipes: aparece sem chance; aviso de início com o tipo certo', async () => {
  const r = await admin.post('/api/admin/events').send(base({ kind: 'PVP' })).expect(201);
  pvpId = r.body.event.id;
  created.push(pvpId);
  assert.equal(r.body.event.kind, 'PVP');
  const pub = await ag.a.get('/api/events/active').expect(200);
  const e = pub.body.events.find((x: { id: string }) => x.id === pvpId);
  assert.equal(e.kind, 'PVP');
  assert.equal(e.boss, null);
  noSecrets(pub.body);
  await bossHousekeeping();
  const n = await prisma.notification.findFirst({ where: { userId: ids.e, type: 'PVP_EVENT' } });
  assert.ok(n && /PvP em equipes/.test(n.text ?? ''));
});

test('PvP em equipes: fila, adversário, luta de verdade, espólio e avisos', async () => {
  // time A: a + b
  let r = await ag.a.post(`/api/events/${pvpId}/run`).expect(200);
  const runA = r.body.event.run.id;
  await ag.a.post(`/api/events/runs/${runA}/invite`).send({ username: uname('b') }).expect(200);
  assert.ok(await prisma.notification.findFirst({ where: { userId: ids.b, type: 'PVP_INVITE' } }));
  await ag.b.post(`/api/events/runs/${runA}/accept`).expect(200);
  // PvP não tem "lutar" direto
  const direct = await ag.a.post(`/api/events/runs/${runA}/fight`);
  assert.equal(direct.body.code, 'USE_QUEUE');
  await ag.b.post(`/api/events/runs/${runA}/queue`).expect(403); // só o líder
  r = await ag.a.post(`/api/events/runs/${runA}/queue`).expect(200);
  assert.equal(r.body.matched, false);
  assert.equal(r.body.event.run.status, 'QUEUED');
  // sai e volta para a fila
  await ag.a.post(`/api/events/runs/${runA}/unqueue`).expect(200);
  await ag.a.post(`/api/events/runs/${runA}/queue`).expect(200);
  // time B: c + d entra na fila → a luta sai na hora
  r = await ag.c.post(`/api/events/${pvpId}/run`).expect(200);
  const runB = r.body.event.run.id;
  await ag.c.post(`/api/events/runs/${runB}/invite`).send({ username: uname('d') }).expect(200);
  await ag.d.post(`/api/events/runs/${runB}/accept`).expect(200);
  r = await ag.c.post(`/api/events/runs/${runB}/queue`).expect(200);
  assert.equal(r.body.matched, true);
  const [A, B] = await Promise.all([prisma.bossRun.findUniqueOrThrow({ where: { id: runA } }), prisma.bossRun.findUniqueOrThrow({ where: { id: runB } })]);
  assert.equal(A.status, 'FOUGHT');
  assert.equal(B.status, 'FOUGHT');
  assert.equal(A.vsRunId, runB);
  assert.equal(B.vsRunId, runA);
  // replay: os dois lados podem assistir; quem não lutou, não
  const ra = await ag.b.get(`/api/events/runs/${runA}/replay`).expect(200);
  assert.equal(ra.body.kind, 'PVP');
  assert.equal(ra.body.replay.mode, 'pvp');
  assert.equal(ra.body.replay.units.length, 4);
  await ag.d.get(`/api/events/runs/${runA}/replay`).expect(200); // adversário
  await ag.e.get(`/api/events/runs/${runA}/replay`).expect(403);
  noSecrets(ra.body);
  // vencedor decidido pela luta: espólio só para quem venceu
  const w = ra.body.replay.winner as 0 | 1 | null;
  assert.equal(A.won, w === null ? null : w === 0);
  assert.equal(B.won, w === null ? null : w === 1);
  const goldOf = async (k: K) => (await prisma.gift.aggregate({ where: { userId: ids[k], eventId: pvpId, kind: 'GOLD' }, _sum: { amount: true } }))._sum.amount ?? 0;
  if (w !== null) {
    const winners = w === 0 ? (['a', 'b'] as K[]) : (['c', 'd'] as K[]);
    const losers = w === 0 ? (['c', 'd'] as K[]) : (['a', 'b'] as K[]);
    for (const k of winners) assert.equal(await goldOf(k), 70);
    for (const k of losers) assert.equal(await goldOf(k), 0);
  }
  // todos são avisados (sem dizer quem venceu), com link para a luta
  for (const k of ['a', 'b', 'c', 'd'] as K[]) {
    const n = await prisma.notification.findFirst({ where: { userId: ids[k], type: 'PVP_FIGHT' } });
    assert.ok(n, `aviso para ${k}`);
    assert.ok(!/venc|perd/i.test(n!.text ?? ''));
  }
  const list = await ag.a.get('/api/notifications').expect(200);
  const nf = list.body.notifications.find((x: { type: string }) => x.type === 'PVP_FIGHT');
  assert.equal(nf.url, `/evento/${runA}`);
  // histórico com o nome do adversário; tentativa gasta
  const pub = await ag.a.get('/api/events/active').expect(200);
  const e = pub.body.events.find((x: { id: string }) => x.id === pvpId);
  assert.equal(e.attemptsLeft, 1);
  assert.equal(e.history[0].vs, `Time de ${uname('c')}`);
  // admin: uma luta (não duas)
  const h = await admin.get(`/api/admin/events/${pvpId}/history`).expect(200);
  assert.equal(h.body.runs.length, 1);
  assert.equal(h.body.runs[0].vs.length, 2);
});

test('PvP: fila sem adversário até o fim do evento → cancela e a tentativa não é gasta', async () => {
  const r = await ag.e.post(`/api/events/${pvpId}/run`).expect(200);
  const run = r.body.event.run.id;
  await ag.e.post(`/api/events/runs/${run}/queue`).expect(200);
  await admin.post(`/api/admin/events/${pvpId}/end`).expect(200);
  assert.equal((await prisma.bossRun.findUniqueOrThrow({ where: { id: run } })).status, 'CANCELLED');
});

test('Waves (chance fixa 100% e 0%): luta inteira, mini-chefe, espólio e avisos', async () => {
  const win = await admin.post('/api/admin/events').send(base({ kind: 'WAVES', bossId: 'cripta', teamSize: 3, chanceAuto: false, winChance: 100 })).expect(201);
  created.push(win.body.event.id);
  assert.equal(win.body.event.chanceAuto, false);
  const pub = await ag.a.get('/api/events/active').expect(200);
  const e = pub.body.events.find((x: { id: string }) => x.id === win.body.event.id);
  assert.equal(e.kind, 'WAVES');
  assert.equal(e.theme.name, 'Cripta Esquecida');
  assert.equal(e.theme.chief.name, 'Varek');
  noSecrets(pub.body);
  // a + b
  let r = await ag.a.post(`/api/events/${e.id}/run`).expect(200);
  const run = r.body.event.run.id;
  await ag.a.post(`/api/events/runs/${run}/invite`).send({ username: uname('b') }).expect(200);
  assert.ok(await prisma.notification.findFirst({ where: { userId: ids.b, type: 'WAVES_INVITE' } }));
  await ag.b.post(`/api/events/runs/${run}/accept`).expect(200);
  r = await ag.a.post(`/api/events/runs/${run}/fight`).expect(200);
  assert.equal(r.body.kind, 'WAVES');
  const rep = await ag.b.get(`/api/events/runs/${run}/replay`).expect(200);
  assert.equal(rep.body.kind, 'WAVES');
  assert.equal(rep.body.replay.mode, 'waves');
  assert.equal(rep.body.replay.winner, 0);
  assert.equal(rep.body.replay.waves.reached, 11);
  assert.ok(rep.body.replay.units.some((u: { kind: string }) => u.kind === 'chief'));
  noSecrets(rep.body);
  const row = await prisma.bossRun.findUniqueOrThrow({ where: { id: run } });
  assert.equal(row.won, true);
  assert.equal(row.reached, 11);
  assert.equal(await prisma.gift.count({ where: { eventId: e.id, kind: 'GOLD' } }), 2);
  assert.ok(await prisma.notification.findFirst({ where: { userId: ids.b, type: 'WAVES_FIGHT', battleId: run } }));

  const lose = await admin.post('/api/admin/events').send(base({ kind: 'WAVES', bossId: 'vulcao', teamSize: 1, chanceAuto: false, winChance: 0 })).expect(201);
  created.push(lose.body.event.id);
  r = await ag.c.post(`/api/events/${lose.body.event.id}/run`).expect(200);
  await ag.c.post(`/api/events/runs/${r.body.event.run.id}/fight`).expect(200);
  const lr = await ag.c.get(`/api/events/runs/${r.body.event.run.id}/replay`).expect(200);
  assert.equal(lr.body.replay.winner, 1);
  assert.equal(await prisma.gift.count({ where: { eventId: lose.body.event.id } }), 0);
  const hist = (await ag.c.get('/api/events/active')).body.events.find((x: { id: string }) => x.id === lose.body.event.id).history[0];
  assert.equal(hist.won, false);
  assert.ok(hist.reached >= 1 && hist.reached <= 11);
});

test('Waves automático + prévias do admin (nada é gravado)', async () => {
  const auto = await admin.post('/api/admin/events').send(base({ kind: 'WAVES', bossId: 'geleira', teamSize: 1 })).expect(201);
  created.push(auto.body.event.id);
  assert.equal(auto.body.event.chanceAuto, true);
  const r = await ag.d.post(`/api/events/${auto.body.event.id}/run`).expect(200);
  await ag.d.post(`/api/events/runs/${r.body.event.run.id}/fight`).expect(200);
  const before = await prisma.bossRun.count();
  const pw = await admin.post('/api/admin/events/preview-team').send({ kind: 'WAVES', themeId: 'abismo', team: 2 }).expect(200);
  assert.equal(pw.body.replay.mode, 'waves');
  const pp = await admin.post('/api/admin/events/preview-team').send({ kind: 'PVP', team: 2 }).expect(200);
  assert.equal(pp.body.replay.mode, 'pvp');
  assert.equal(await prisma.bossRun.count(), before);
  await ag.a.post('/api/admin/events/preview-team').send({ kind: 'PVP', team: 2 }).expect(403);
  // não dá para trocar o tipo de um evento
  await admin.put(`/api/admin/events/${auto.body.event.id}`).send(base({ kind: 'PVP' })).expect(400);
  for (const id of created) await admin.post(`/api/admin/events/${id}/end`);
});
