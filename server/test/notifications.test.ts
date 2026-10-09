import { cpf, groupUp } from './_util.js';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';

/** Senha de "foto tirada na hora" (o app pede ao abrir a câmera). */
const capTok = async (ag: { post: (u: string) => any }) => (await ag.post('/api/posts/capture-token').expect(200)).body.token as string;
/** Novo post já com a senha (pedida ANTES de montar a requisição). */
const postReq = async (ag: any) => {
  const t = await capTok(ag);
  // embrulhado: a requisição do supertest é "thenable" e o await a dispararia
  return { r: ag.post('/api/posts').field('captureToken', t) };
};

const app = createApp();
const tag = Math.random().toString(36).slice(2, 8);
const a = request.agent(app);
const b = request.agent(app);
const ids: Record<string, string> = {};
let postId = '';

before(async () => {
  for (const [k, ag] of [['a', a], ['b', b]] as const) {
    const r = await ag.post('/api/auth/register').send({ email: `n${k}_${tag}@test.dev`, username: `n${k}_${tag}`, password: 'senhaforte123', cpf: cpf() });
    ids[k] = r.body.user.id;
    await ag.post('/api/shop/starter').send({ weaponId: 'espada-curta-recruta' });
  }
  await groupUp(Object.values(ids));
  const r = () => Math.floor(Math.random() * 255);
  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="700">';
  for (let i = 0; i < 12; i++) svg += `<circle cx="${Math.random() * 600}" cy="${Math.random() * 700}" r="${60 + Math.random() * 150}" fill="rgb(${r()},${r()},${r()})"/>`;
  const img = await sharp(Buffer.from(svg + '</svg>')).jpeg().toBuffer();
  const p = await (await postReq(a)).r.attach('photo', img, 'x.jpg').expect(201);
  postId = p.body.post.id;
});
after(async () => {
  const users = await prisma.user.findMany({ where: { email: { endsWith: `_${tag}@test.dev` } } });
  await prisma.photoHash.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await prisma.battle.deleteMany({ where: { OR: [{ aName: { endsWith: tag } }, { bName: { endsWith: tag } }] } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `_${tag}@test.dev` } } });
  await prisma.$disconnect();
});

test('curtida e comentário geram notificação para o dono (sem spam ao recurtir)', async () => {
  await b.post(`/api/posts/${postId}/like`).expect(200);
  await b.delete(`/api/posts/${postId}/like`).expect(200);
  await b.post(`/api/posts/${postId}/like`).expect(200);
  await b.post(`/api/posts/${postId}/comments`).send({ text: 'Brabo!' }).expect(201);
  await a.post(`/api/posts/${postId}/like`).expect(200); // curtir o próprio post não notifica
  await new Promise((r) => setTimeout(r, 200));
  const u = await a.get('/api/notifications/unread').expect(200);
  assert.equal(u.body.count, 2);
  const list = await a.get('/api/notifications').expect(200);
  const texts = list.body.notifications.map((n: any) => n.text);
  assert.ok(texts.some((t: string) => t === `nb_${tag} curtiu seu treino`));
  assert.ok(texts.some((t: string) => t.startsWith(`nb_${tag} comentou: “Brabo!”`)));
  assert.equal(list.body.notifications[0].url, `/p/${postId}`);
  assert.ok(list.body.notifications[0].thumb);
  await a.post('/api/notifications/read-all').expect(200);
  assert.equal((await a.get('/api/notifications/unread')).body.count, 0);
  const one = await b.get(`/api/posts/${postId}`).expect(200);
  assert.equal(one.body.post.id, postId);
});

test('desafio e resultado geram notificação', async () => {
  const c = await a.post('/api/ranking/challenges').send({ defenderId: ids.b }).expect(201);
  await new Promise((r) => setTimeout(r, 150));
  let list = await b.get('/api/notifications').expect(200);
  assert.ok(list.body.notifications.some((n: any) => n.type === 'CHALLENGE' && n.text.includes('te desafiou') && n.url === `/desafio/${c.body.challenge.id}`));
  await b.post(`/api/ranking/challenges/${c.body.challenge.id}/accept`).expect(200);
  await new Promise((r) => setTimeout(r, 150));
  list = await a.get('/api/notifications').expect(200);
  const acc = list.body.notifications.find((n: any) => n.type === 'CHALLENGE_ACCEPTED');
  assert.ok(acc && acc.url.startsWith('/luta/'));
  // sem spoiler: não diz quem venceu nem quanto PR
  assert.doesNotMatch(acc.text, /venc|perd|empate|PR/i);
});

test('chave pública de push disponível', async () => {
  const r = await a.get('/api/notifications/push/key').expect(200);
  assert.ok(typeof r.body.publicKey === 'string' && r.body.publicKey.length > 40);
});
