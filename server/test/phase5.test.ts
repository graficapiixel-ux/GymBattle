import { cpf, groupUp } from './_util.js';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { BALANCE, declineStakes, powerRating, prDelta } from '@gymbattle/shared';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { currentSeason, expireChallenges, rankCtx } from '../src/lib/ranking.js';

const app = createApp();
const tag = Math.random().toString(36).slice(2, 8);
const ag = { x: request.agent(app), y: request.agent(app), z: request.agent(app), admin: request.agent(app) };
const ids: Record<string, string> = {};
let shieldsBefore = false;
const setPr = (k: string, pr: number) => prisma.user.update({ where: { id: ids[k] }, data: { rankPoints: pr } });
const pr = async (k: string) => (await prisma.user.findUniqueOrThrow({ where: { id: ids[k] } })).rankPoints;

before(async () => {
  for (const k of ['x', 'y', 'z'] as const) {
    const r = await ag[k].post('/api/auth/register').send({ email: `${k}_${tag}@test.dev`, username: `${k}_${tag}`, password: 'senhaforte123', cpf: cpf() });
    ids[k] = r.body.user.id;
    await ag[k].post('/api/shop/starter').send({ weaponId: 'espada-curta-recruta' });
  }
  for (let i = 0; i < 5; i++) {
    const u = await prisma.user.create({ data: { email: `w${i}_${tag}@test.dev`, username: `w${i}_${tag}`, passwordHash: 'x' } });
    ids[`w${i}`] = u.id;
  }
  await groupUp(Object.values(ids), { fill: false });
  await ag.admin.post('/api/auth/login').send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }).expect(200);
  shieldsBefore = (await ag.admin.get('/api/admin/settings').expect(200)).body.shieldsEnabled;
  await ag.admin.put('/api/admin/settings').send({ shieldsEnabled: true }).expect(200);
});
after(async () => {
  await ag.admin.put('/api/admin/settings').send({ shieldsEnabled: shieldsBefore });
  await prisma.battle.deleteMany({ where: { OR: [{ aName: { endsWith: tag } }, { bName: { endsWith: tag } }] } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `_${tag}@test.dev` } } });
  await prisma.$disconnect();
});

test('ranking mostra temporada, prêmios e minha posição', async () => {
  const r = await ag.x.get('/api/ranking').expect(200);
  assert.ok(r.body.season.name.startsWith('Temporada'));
  assert.equal(r.body.prizes[0].gold, 2000);
  assert.ok(r.body.me.pos >= 1);
  assert.equal(r.body.fightRewardsLeft, BALANCE.fights.rewardedPerDay);
});

const unprotect = (...ks: string[]) => prisma.user.updateMany({ where: { id: { in: ks.map((k) => ids[k]) } }, data: { protectedUntil: null } });
const prot = async (k: string) => (await prisma.user.findUniqueOrThrow({ where: { id: ids[k] } })).protectedUntil;

test('desafio: aceitar roda luta ranqueada, aplica PR e só quem perde pontos fica protegido', async () => {
  // PR alto para ficarem lado a lado no topo (o banco de dev tem outros jogadores)
  await setPr('x', 6000);
  await setPr('y', 6100); // y está logo acima de x
  const pw = powerRating({ str: 5, dex: 5, vig: 5, fort: 5, ess: 5, int: 5, fai: 5 }, 'espada-curta-recruta');
  const ctx = { challengerPr: 6000, defenderPr: 6100, challengerPower: pw, defenderPower: pw };
  const win = prDelta(ctx, 'challenger'), lose = prDelta(ctx, 'defender');
  const prev = await ag.x.get(`/api/ranking/preview/${ids.y}`).expect(200);
  // mesmo poder, y com um pouco mais de PR: x é levemente azarão
  assert.ok(prev.body.winChance < 50 && prev.body.winChance > 40, String(prev.body.winChance));
  assert.equal(prev.body.ifYouWin, win.challenger);
  assert.equal(prev.body.ifYouLose, lose.challenger);
  assert.ok(win.challenger > -lose.challenger); // azarão ganha mais do que perde
  assert.equal(prev.body.ifTheyDecline, declineStakes(ctx).challenger);
  assert.equal(prev.body.maxPerDay, 5);

  const c = await ag.x.post('/api/ranking/challenges').send({ defenderId: ids.y }).expect(201);
  await ag.x.post('/api/ranking/challenges').send({ defenderId: ids.y }).expect(409); // já pendente
  await ag.y.post('/api/ranking/challenges').send({ defenderId: ids.x }).expect(409); // nem no sentido contrário
  const inbox = await ag.y.get('/api/ranking/challenges').expect(200);
  assert.ok(inbox.body.received.some((r: any) => r.id === c.body.challenge.id));
  await ag.x.post(`/api/ranking/challenges/${c.body.challenge.id}/accept`).expect(403); // só o defensor aceita

  const goldX = (await prisma.user.findUniqueOrThrow({ where: { id: ids.x } })).gold;
  const r = await ag.y.post(`/api/ranking/challenges/${c.body.challenge.id}/accept`).expect(200);
  const b = r.body.battle;
  assert.equal(b.mode, 'ranked');
  if (b.winner === null) {
    assert.equal(await pr('x'), 6000);
    assert.equal(await prot('x'), null);
    assert.equal(await prot('y'), null);
  } else if (b.winner === 0) {
    assert.equal(await pr('x'), 6000 + win.challenger);
    assert.equal(await pr('y'), 6100 + win.defender);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: ids.x } })).gold, goldX + BALANCE.fights.winGold);
    assert.equal(await prot('x'), null); // ganhou pontos: sem proteção
    assert.ok((await prot('y'))! > new Date()); // perdeu pontos: protegido
  } else {
    assert.equal(await pr('x'), 6000 + lose.challenger);
    assert.equal(await pr('y'), 6100 + lose.defender);
    assert.ok((await prot('x'))! > new Date());
    assert.equal(await prot('y'), null);
  }
  assert.deepEqual(b.result.pr.map((n: number) => typeof n), ['number', 'number']);
  await ag.y.post(`/api/ranking/challenges/${c.body.challenge.id}/accept`).expect(409); // não aceita duas vezes
});

test('notificação de desafio abre a página do desafio (não aceita sozinha)', async () => {
  await unprotect('x', 'y', 'z');
  await prisma.challenge.deleteMany({ where: { OR: [{ challengerId: ids.z }, { defenderId: ids.z }] } });
  const c = await ag.z.post('/api/ranking/challenges').send({ defenderId: ids.y }).expect(201);
  await new Promise((r) => setTimeout(r, 300));
  const n = await ag.y.get('/api/notifications').expect(200);
  const note = n.body.notifications.find((q: any) => q.type === 'CHALLENGE' && q.url.includes(c.body.challenge.id));
  assert.ok(note, 'notificação deveria apontar para /desafio/:id');
  assert.equal(note.url, `/desafio/${c.body.challenge.id}`);
  const page = await ag.y.get(`/api/ranking/challenges/${c.body.challenge.id}`).expect(200);
  assert.equal(page.body.challenge.status, 'PENDING'); // abrir não aceita
  await ag.x.get(`/api/ranking/challenges/${c.body.challenge.id}`).expect(404); // quem não participa não vê
  await ag.z.post(`/api/ranking/challenges/${c.body.challenge.id}/cancel`).expect(200);
});

test('recusar: perde metade do que perderia lutando, desafiante ganha metade disso, SEM proteção', async () => {
  await unprotect('x', 'y', 'z');
  await setPr('x', 3000);
  await setPr('z', 2000);
  const [ux, uz] = await Promise.all([prisma.user.findUniqueOrThrow({ where: { id: ids.x } }), prisma.user.findUniqueOrThrow({ where: { id: ids.z } })]);
  const st = declineStakes(rankCtx(uz, ux));
  const c1 = await ag.z.post('/api/ranking/challenges').send({ defenderId: ids.x }).expect(201);
  assert.equal(c1.body.challenge.stakes.decline, -st.defender);
  assert.equal(c1.body.challenge.stakes.declineGain, st.challenger);
  const d = await ag.x.post(`/api/ranking/challenges/${c1.body.challenge.id}/decline`).expect(200);
  assert.equal(d.body.prLost, -st.defender);
  assert.ok(-st.defender >= 3 && -st.defender <= 15);
  assert.equal(await pr('x'), 3000 + st.defender);
  assert.equal(await pr('z'), 2000 + st.challenger);
  assert.equal(await prot('x'), null); // recusar não dá proteção

  // o mesmo desafiante não pode desafiar a mesma pessoa de novo em 24 h
  const again = await ag.z.post('/api/ranking/challenges').send({ defenderId: ids.x });
  assert.equal(again.status, 400);
  assert.equal(again.body.code, 'SAME_TARGET');
  const pv = await ag.z.get(`/api/ranking/preview/${ids.x}`).expect(200);
  assert.ok(pv.body.againAt);
  // à meia-noite libera de novo: um desafio de ontem não bloqueia
  const { startOfTodayBR } = await import('../src/lib/ranking.js');
  await prisma.challenge.update({ where: { id: c1.body.challenge.id }, data: { createdAt: new Date(startOfTodayBR().getTime() - 60_000) } });
  const pv2 = await ag.z.get(`/api/ranking/preview/${ids.x}`).expect(200);
  assert.equal(pv2.body.againAt, null);
  const ok = await ag.z.post('/api/ranking/challenges').send({ defenderId: ids.x }).expect(201);
  await ag.z.post(`/api/ranking/challenges/${ok.body.challenge.id}/cancel`).expect(200);

  const h = await ag.x.get('/api/ranking/challenges').expect(200);
  assert.ok(h.body.history.map((q: any) => q.status).includes('DECLINED'));
});

test('aviso 2 h antes de expirar, e sem resposta em 24 h conta como recusa', async () => {
  await unprotect('x', 'y', 'z');
  await prisma.challenge.deleteMany({ where: { challengerId: ids.z, defenderId: ids.y } });
  await setPr('y', 3000);
  await setPr('z', 2000);
  const c = await ag.z.post('/api/ranking/challenges').send({ defenderId: ids.y }).expect(201);
  await prisma.challenge.update({ where: { id: c.body.challenge.id }, data: { expiresAt: new Date(Date.now() + 90 * 60_000) } });
  await expireChallenges();
  await expireChallenges(); // não avisa duas vezes
  await new Promise((r) => setTimeout(r, 300));
  const warn = await prisma.notification.findMany({ where: { userId: ids.y, challengeId: c.body.challenge.id, type: 'CHALLENGE' } });
  assert.equal(warn.length, 2); // o desafio + um aviso
  assert.ok(warn.some((n) => n.text?.includes('prazo acaba')));

  const [uy, uz] = await Promise.all([prisma.user.findUniqueOrThrow({ where: { id: ids.y } }), prisma.user.findUniqueOrThrow({ where: { id: ids.z } })]);
  const st = declineStakes(rankCtx(uz, uy));
  await prisma.challenge.update({ where: { id: c.body.challenge.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  const r = await ag.y.post(`/api/ranking/challenges/${c.body.challenge.id}/accept`);
  assert.equal(r.status, 409);
  const row = await prisma.challenge.findUniqueOrThrow({ where: { id: c.body.challenge.id } });
  assert.equal(row.status, 'EXPIRED');
  assert.equal(await pr('y'), 3000 + st.defender);
  assert.equal(await pr('z'), 2000 + st.challenger);
  assert.equal(await prot('y'), null);
});

test('no máximo 5 desafios enviados por dia', async () => {
  await unprotect('x', 'y', 'z');
  await prisma.challenge.deleteMany({ where: { challengerId: ids.y } });
  for (let i = 0; i < BALANCE.ranking.maxChallengesPerDay; i++) {
    const c = await ag.y.post('/api/ranking/challenges').send({ defenderId: ids[`w${i}`] }).expect(201);
    await ag.y.post(`/api/ranking/challenges/${c.body.challenge.id}/cancel`).expect(200);
  }
  const r = await ag.y.post('/api/ranking/challenges').send({ defenderId: ids.x });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'DAILY_LIMIT');
  const box = await ag.y.get('/api/ranking/challenges').expect(200);
  assert.deepEqual(box.body.limits.sentToday, 5);
});

test('recompensa de luta limitada a 5 por dia', async () => {
  await unprotect('x', 'y', 'z');
  await prisma.challenge.deleteMany({ where: { OR: [{ challengerId: ids.x }, { challengerId: ids.z }] } });
  const today = await prisma.rewardLedger.count({ where: { userId: ids.x, source: 'FIGHT' } });
  // simula que já recebeu 5 hoje
  for (let i = today; i < BALANCE.fights.rewardedPerDay; i++) {
    await prisma.rewardLedger.create({ data: { userId: ids.x, source: 'FIGHT', xp: 5 } });
  }
  const c = await ag.x.post('/api/ranking/challenges').send({ defenderId: ids.z }).expect(201);
  const r = await ag.z.post(`/api/ranking/challenges/${c.body.challenge.id}/accept`).expect(200);
  const xReward = r.body.battle.result.rewards.find((q: any) => q.p === 0);
  assert.deepEqual([xReward.xp, xReward.gold], [0, 0]);
  const rk = await ag.x.get('/api/ranking');
  assert.equal(rk.body.fightRewardsLeft, 0);
});

test('fim de temporada (admin): top 1 ganha 2000 ouro + 3000 XP + título; PR de todos volta para 1000', async () => {
  await setPr('x', 9000);
  await setPr('y', 8000);
  await setPr('z', 7000);
  const before = await prisma.user.findUniqueOrThrow({ where: { id: ids.x } });
  const s = await currentSeason();
  await ag.x.post('/api/admin/seasons/current/end').expect(403);
  const r = await ag.admin.post('/api/admin/seasons/current/end').expect(200);
  // cada grupo tem seu pódio: x é o 1º do grupo dele
  const mine = r.body.results.find((x: { userId: string }) => x.userId === ids.x);
  assert.equal(mine?.pos, 1);
  const after = await prisma.user.findUniqueOrThrow({ where: { id: ids.x } });
  assert.equal(after.gold, before.gold + 2000);
  assert.equal(after.title, `Campeão da Temporada ${s.number}`);
  assert.ok(after.level > before.level); // 3000 XP sobe vários níveis
  assert.equal(after.rankPoints, 1000); // reset completo
  assert.equal(await pr('y'), 1000);
  assert.equal(await pr('z'), 1000);
  const next = await currentSeason();
  assert.equal(next.number, s.number + 1);
});

test('quem é mais fraco ganha MAIS ao vencer e perde MENOS ao perder (contas reais)', async () => {
  await unprotect('x', 'y', 'z');
  await prisma.challenge.deleteMany({ where: { OR: [{ challengerId: ids.x }, { challengerId: ids.y }] } });
  await setPr('x', 1000);
  await setPr('y', 1000);
  // y forte: atributos altos (a arma inicial é a mesma)
  await prisma.user.update({ where: { id: ids.y }, data: { level: 40, str: 40, dex: 25, vig: 30, fort: 15 } });
  await prisma.user.update({ where: { id: ids.x }, data: { level: 1, str: 5, dex: 5, vig: 5, fort: 5 } });
  const weak = (await ag.x.get(`/api/ranking/preview/${ids.y}`).expect(200)).body;
  const strong = (await ag.y.get(`/api/ranking/preview/${ids.x}`).expect(200)).body;
  assert.ok(weak.winChance < 30, `chance do fraco ${weak.winChance}`);
  assert.ok(strong.winChance > 70, `chance do forte ${strong.winChance}`);
  // fraco: vencer vale muito, perder custa pouco
  assert.ok(weak.ifYouWin >= 20 && -weak.ifYouLose <= 10, JSON.stringify(weak));
  // forte: vencer vale pouco, perder custa muito
  assert.ok(strong.ifYouWin <= 10 && -strong.ifYouLose >= 20, JSON.stringify(strong));
  assert.ok(weak.ifYouWin > strong.ifYouWin);
});

test('escudos desligados pelo admin: somem na hora e ninguém ganha escudo', async () => {
  await ag.x.put('/api/admin/settings').send({ shieldsEnabled: false }).expect(403);
  await prisma.user.update({ where: { id: ids.z }, data: { protectedUntil: new Date(Date.now() + 10 * 3_600_000) } });
  const r = await ag.admin.put('/api/admin/settings').send({ shieldsEnabled: false }).expect(200);
  assert.equal(r.body.shieldsEnabled, false);
  assert.equal(await prot('z'), null);
  const cfg = await request(app).get('/api/config').expect(200);
  assert.equal(cfg.body.shieldsEnabled, false);
  // luta: quem perde PR não fica protegido
  await prisma.challenge.deleteMany({ where: { OR: [{ challengerId: ids.x }, { challengerId: ids.z }] } });
  const c = await ag.x.post('/api/ranking/challenges').send({ defenderId: ids.z }).expect(201);
  await ag.z.post(`/api/ranking/challenges/${c.body.challenge.id}/accept`).expect(200);
  assert.equal(await prot('x'), null);
  assert.equal(await prot('z'), null);
  // um escudo "velho" que sobrou não impede desafio
  await prisma.user.update({ where: { id: ids.y }, data: { protectedUntil: new Date(Date.now() + 10 * 3_600_000) } });
  await prisma.challenge.deleteMany({ where: { challengerId: ids.z } });
  await ag.z.post('/api/ranking/challenges').send({ defenderId: ids.y }).expect(201);
  // ligar de novo volta ao normal
  await ag.admin.put('/api/admin/settings').send({ shieldsEnabled: true }).expect(200);
});
