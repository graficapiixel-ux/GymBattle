import { cpf, groupUp } from './_util.js';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { dayKey } from '@gymbattle/shared';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { uploadRoot } from '../src/lib/images.js';
import { purgeExpiredPosts } from '../src/lib/posts.js';

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
const mk = (n: string) => ({ email: `${n}_${tag}@test.dev`, username: `${n}_${tag}`, password: 'senhaforte123', cpf: cpf() });

const admin = request.agent(app);
const ana = request.agent(app);
const beto = request.agent(app);
const anaData = mk('ana');
const betoData = mk('beto');

/** Imagem aleatória com formas (parecida com uma foto), única a cada chamada. */
async function photo(opts: { size?: number; gps?: boolean; format?: 'jpeg' | 'png' } = {}) {
  const w = opts.size ?? 800, h = Math.round(w * 1.25);
  const r = () => Math.floor(Math.random() * 255);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="rgb(${r()},${r()},${r()})"/>`;
  for (let i = 0; i < 14; i++) {
    svg += `<circle cx="${Math.random() * w}" cy="${Math.random() * h}" r="${60 + Math.random() * 220}" fill="rgb(${r()},${r()},${r()})" opacity="0.8"/>`;
  }
  let img = sharp(Buffer.from(svg + '</svg>'));
  if (opts.gps) {
    img = img.withExif({
      IFD0: { Make: 'TestPhone', Model: 'GymCam 3000' },
      IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '23/1 33/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '46/1 38/1 0/1' },
    });
  }
  return opts.format === 'png' ? img.png().toBuffer() : img.jpeg({ quality: 92 }).toBuffer();
}

let groupId = '';
const userId = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id;

before(async () => {
  await admin.post('/api/auth/login').send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }).expect(200);
  await ana.post('/api/auth/register').send(anaData).expect(201);
  await beto.post('/api/auth/register').send(betoData).expect(201);
  const g = await groupUp([await userId(anaData.email), await userId(betoData.email)]);
  groupId = g.groupId;
});

after(async () => {
  const users = await prisma.user.findMany({ where: { email: { endsWith: `_${tag}@test.dev` } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  const posts = await prisma.post.findMany({ where: { userId: { in: ids } } });
  for (const p of posts) fs.rmSync(path.join(uploadRoot(), p.imagePath), { force: true });
  await prisma.photoHash.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

let firstPostId = '';
let firstPhoto: Buffer;

test('1º post do dia dá 100 XP e 50 de ouro; foto sai em WebP sem GPS/EXIF', async () => {
  firstPhoto = await photo({ gps: true });
  // confere que a foto de entrada TEM GPS
  assert.ok((await sharp(firstPhoto).metadata()).exif, 'foto de teste deveria ter EXIF');

  const today = await ana.get('/api/posts/today').expect(200);
  assert.equal(today.body.rewardAvailable, true);

  const r = await (await postReq(ana)).r.field('caption', 'Dia de perna 🦵').field('source', 'camera').attach('photo', firstPhoto, 'treino.jpg');
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual(
    { xp: r.body.reward.xp, gold: r.body.reward.gold, streak: r.body.reward.streak },
    { xp: 100, gold: 50, streak: 1 },
  );
  assert.equal(r.body.user.gold, 50);
  assert.equal(r.body.user.xp, 100);
  firstPostId = r.body.post.id;

  const file = path.join(uploadRoot(), r.body.post.imageUrl.replace('/uploads/', ''));
  const meta = await sharp(file).metadata();
  assert.equal(meta.format, 'webp');
  assert.equal(meta.exif, undefined, 'EXIF/GPS deveria ter sido removido');
  assert.ok(Math.max(meta.width!, meta.height!) <= 1280);

  const served = await ana.get(r.body.post.imageUrl);
  assert.equal(served.status, 200);
});

test('2º post no mesmo dia é publicado, mas não dá recompensa', async () => {
  const r = await (await postReq(ana)).r.attach('photo', await photo(), 'b.jpg');
  assert.equal(r.status, 201);
  assert.equal(r.body.reward, null);
  assert.equal(r.body.user.gold, 50);
  const today = await ana.get('/api/posts/today');
  assert.equal(today.body.rewardAvailable, false);
});

test('foto duplicada (mesmo recomprimida/redimensionada) é bloqueada para qualquer um', async () => {
  const resized = await sharp(firstPhoto).resize(600).jpeg({ quality: 60 }).toBuffer();
  const r = await (await postReq(beto)).r.attach('photo', resized, 'copy.jpg');
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'DUPLICATE_PHOTO');
  const asPng = await sharp(firstPhoto).png().toBuffer();
  const r2 = await (await postReq(ana)).r.attach('photo', asPng, 'copy.png');
  assert.equal(r2.status, 409);
});

test('foto gigante (48 MP, arquivo pesado) é aceita e diminuída automaticamente', async () => {
  // desenho único (círculos em posições aleatórias) + ruído para o arquivo ficar pesado
  const dots = Array.from({ length: 6 }, () => `<circle cx="${Math.random() * 8000}" cy="${Math.random() * 6000}" r="${600 + Math.random() * 900}" fill="#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}"/>`).join('');
  const shapes = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="8000" height="6000">${dots}</svg>`);
  const big = await sharp({ create: { width: 8000, height: 6000, channels: 3, background: '#808080', noise: { type: 'gaussian', mean: 128, sigma: 15 } } })
    .composite([{ input: shapes }])
    .jpeg({ quality: 97 })
    .toBuffer();
  assert.ok(big.length > 12 * 1024 * 1024, `arquivo de teste deveria ser grande (${big.length})`);
  const r = await (await postReq(beto)).r.attach('photo', big, 'enorme.jpg');
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.ok(Math.max(r.body.post.width, r.body.post.height) <= 1280);
});

test('arquivo que não é imagem é recusado', async () => {
  const r = await (await postReq(beto)).r.attach('photo', Buffer.from('não sou imagem'), { filename: 'x.jpg', contentType: 'image/jpeg' });
  assert.equal(r.status, 400);
});

test('streak: +10% por dia seguido', async () => {
  const id = await userId(betoData.email);
  const yesterday = new Date(Date.now() - 86_400_000);
  await prisma.user.update({ where: { id }, data: { streak: 3, lastPostDay: dayKey(yesterday) } });
  const r = await (await postReq(beto)).r.attach('photo', await photo(), 'c.jpg');
  assert.equal(r.status, 201);
  assert.equal(r.body.reward.streak, 4);
  assert.equal(r.body.reward.xp, 130);
  assert.equal(r.body.reward.gold, 65);
});

test('apagar o post que contou no dia devolve a streak ao que era (streak é de cada um)', async () => {
  const caio = request.agent(app);
  const caioData = { email: `caio_${tag}@test.dev`, username: `caio_${tag}`, password: 'senhaforte123', cpf: cpf() };
  await caio.post('/api/auth/register').send(caioData).expect(201);
  const id = await userId(caioData.email);
  await prisma.user.update({ where: { id }, data: { groupId } });
  const yesterday = dayKey(new Date(Date.now() - 86_400_000));
  await prisma.user.update({ where: { id }, data: { streak: 2, lastPostDay: yesterday } });
  const betoBefore = await prisma.user.findUniqueOrThrow({ where: { email: betoData.email } });

  const r = await (await postReq(caio)).r.attach('photo', await photo(), 'caio.jpg').expect(201);
  assert.equal(r.body.reward.streak, 3);
  // a streak de outra pessoa não muda
  const betoAfter = await prisma.user.findUniqueOrThrow({ where: { email: betoData.email } });
  assert.deepEqual([betoAfter.streak, betoAfter.lastPostDay, betoAfter.gold], [betoBefore.streak, betoBefore.lastPostDay, betoBefore.gold]);

  const d = await caio.delete(`/api/posts/${r.body.post.id}`).expect(200);
  assert.equal(d.body.user.streak, 2);
  assert.equal(d.body.user.xp, 0);
  assert.equal(d.body.user.gold, 0);
  const u = await prisma.user.findUniqueOrThrow({ where: { id } });
  assert.equal(u.lastPostDay, yesterday);
  const today = await caio.get('/api/posts/today').expect(200);
  assert.equal(today.body.rewardAvailable, true);
});

test('feed: mais recentes primeiro, com autor, nível e paginação', async () => {
  const r = await beto.get('/api/posts').expect(200);
  assert.ok(r.body.posts.length >= 3);
  const times = r.body.posts.map((p: any) => Date.parse(p.createdAt));
  assert.deepEqual(times, [...times].sort((a, b) => b - a));
  const p = r.body.posts.find((x: any) => x.id === firstPostId);
  assert.equal(p.author.username, anaData.username);
  assert.equal(p.author.level, 1);
  assert.ok('title' in p.author && 'avatar' in p.author);
});

test('curtir, descurtir, comentar', async () => {
  let r = await beto.post(`/api/posts/${firstPostId}/like`).expect(200);
  assert.equal(r.body.likeCount, 1);
  r = await beto.post(`/api/posts/${firstPostId}/like`).expect(200); // idempotente
  assert.equal(r.body.likeCount, 1);
  r = await ana.post(`/api/posts/${firstPostId}/like`).expect(200);
  assert.equal(r.body.likeCount, 2);
  r = await beto.delete(`/api/posts/${firstPostId}/like`).expect(200);
  assert.equal(r.body.likeCount, 1);

  r = await beto.post(`/api/posts/${firstPostId}/comments`).send({ text: 'Monstro! 💪' }).expect(201);
  const cid = r.body.comment.id;
  r = await ana.get(`/api/posts/${firstPostId}/comments`).expect(200);
  assert.equal(r.body.comments[0].text, 'Monstro! 💪');
  assert.equal(r.body.comments[0].mine, false);
  await ana.delete(`/api/posts/${firstPostId}/comments/${cid}`).expect(403);

  // curtidas e comentários não dão recompensa
  const me = await ana.get('/api/auth/me');
  assert.equal(me.body.user.gold, 50);
});

test('denúncia aparece para o admin; usuário comum não modera', async () => {
  await beto.post(`/api/posts/${firstPostId}/report`).send({ reason: 'fake', details: 'foto da internet' }).expect(201);
  await ana.post(`/api/posts/${firstPostId}/report`).send({ reason: 'fake' }).expect(400); // próprio post
  const r = await admin.get('/api/admin/reports').expect(200);
  const rep = r.body.reports.find((x: any) => x.post.id === firstPostId);
  assert.equal(rep.count, 1);
  assert.equal(rep.reasons[0].reason, 'fake');
  await beto.get('/api/admin/reports').expect(403);
  await beto.post(`/api/admin/posts/${firstPostId}/fake`).expect(403);
});

test('marcar como FAKE: apaga foto, remove XP/ouro (pode ficar negativo), zera streak, loga', async () => {
  const id = await userId(anaData.email);
  // Ana gastou o ouro: saldo 20 → vai ficar 20 − 50 = −30
  await prisma.user.update({ where: { id }, data: { gold: 20, streak: 5 } });
  const post = await prisma.post.findUniqueOrThrow({ where: { id: firstPostId } });
  const file = path.join(uploadRoot(), post.imagePath);
  assert.ok(fs.existsSync(file));

  const r = await admin.post(`/api/admin/posts/${firstPostId}/fake`).send({ reason: 'print da internet' }).expect(200);
  // o grupo inteiro fica sabendo (beto está no mesmo grupo que a ana)
  await new Promise((res) => setTimeout(res, 300));
  const gn = (await beto.get('/api/notifications').expect(200)).body.notifications.find((n: any) => n.type === 'FAKE_GROUP');
  assert.ok(gn, 'beto recebeu o aviso do grupo');
  assert.match(gn.text, /foto falsa apagada/);
  assert.match(gn.text, /perdeu −50 de ouro, −100 XP e a streak\.$/);
  assert.equal(gn.actor.username, anaData.username);
  assert.equal(r.body.xpRemoved, 100);
  assert.equal(r.body.goldRemoved, 50);

  const u = await prisma.user.findUniqueOrThrow({ where: { id } });
  assert.equal(u.gold, -30);
  assert.equal(u.xp, 0);
  assert.equal(u.streak, 0);
  assert.equal(fs.existsSync(file), false, 'arquivo deveria ter sido apagado');
  assert.equal(await prisma.post.count({ where: { id: firstPostId } }), 0);

  const logs = await admin.get('/api/admin/logs');
  assert.ok(logs.body.logs.some((l: any) => l.action === 'MARK_FAKE' && l.details.postId === firstPostId));
  // o aviso para o jogador fala em verificação automática, sem citar o admin
  const notes = await ana.get('/api/notifications').expect(200);
  const fake = notes.body.notifications.find((n: any) => n.type === 'FAKE');
  assert.match(fake.text, /verificação automática/);
  assert.equal(fake.actor, null);

  // mesmo apagada, a foto continua bloqueada
  const again = await (await postReq(beto)).r.attach('photo', firstPhoto, 'again.jpg');
  assert.equal(again.status, 409);
});

test('fotos com mais de 7 dias são apagadas; recompensa fica', async () => {
  const id = await userId(betoData.email);
  const post = await prisma.post.findFirstOrThrow({ where: { userId: id } });
  await prisma.post.update({ where: { id: post.id }, data: { createdAt: new Date(Date.now() - 8 * 86_400_000) } });
  const goldBefore = (await prisma.user.findUniqueOrThrow({ where: { id } })).gold;
  const n = await purgeExpiredPosts();
  assert.ok(n >= 1);
  assert.equal(await prisma.post.count({ where: { id: post.id } }), 0);
  assert.equal(fs.existsSync(path.join(uploadRoot(), post.imagePath)), false);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id } })).gold, goldBefore);
  assert.ok(await prisma.photoHash.count({ where: { postId: post.id } }));
});

test('perfil público mostra nível, atributos, posição no ranking, streak e fotos', async () => {
  const r = await ana.get(`/api/users/${betoData.username}`).expect(200);
  assert.equal(r.body.user.username, betoData.username);
  assert.ok(r.body.user.rankPosition >= 1);
  assert.equal(r.body.user.attributes.str, 5);
  assert.ok(Array.isArray(r.body.posts));
  await ana.get('/api/users/nao_existe_xyz').expect(404);
});

test('só foto tirada na hora pela câmera do app: sem senha, senha de outro, vencida ou repetida é recusada', async () => {
  const { issueCaptureToken } = await import('../src/lib/capture.js');
  // sem senha (ex.: foto da galeria enviada direto)
  let r = await beto.post('/api/posts').attach('photo', await photo(), 'g1.jpg');
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'CAMERA_ONLY');
  // senha de outra pessoa
  const anaTok = await capTok(ana);
  r = await beto.post('/api/posts').field('captureToken', anaTok).attach('photo', await photo(), 'g2.jpg');
  assert.equal(r.body.code, 'CAMERA_ONLY');
  // senha falsificada
  const t = await capTok(beto);
  const pic3 = await photo();
  r = await beto.post('/api/posts').field('captureToken', t.slice(0, -3) + 'abc').attach('photo', pic3, 'g3.jpg');
  assert.equal(r.body.code, 'CAMERA_ONLY');
  // senha vencida (câmera aberta há mais de 15 min)
  const me = (await beto.get('/api/auth/me').expect(200)).body.user.id;
  r = await beto.post('/api/posts').field('captureToken', issueCaptureToken(me, Date.now() - 16 * 60_000)).attach('photo', await photo(), 'g4.jpg');
  assert.equal(r.body.code, 'CAMERA_ONLY');
  assert.match(r.body.error, /demorou/);
  // senha válida funciona uma vez só
  const ok = await capTok(beto);
  await beto.post('/api/posts').field('captureToken', ok).attach('photo', await photo(), 'g5.jpg').expect(201);
  r = await beto.post('/api/posts').field('captureToken', ok).attach('photo', await photo(), 'g6.jpg');
  assert.equal(r.body.code, 'CAMERA_ONLY');
});

test('foto antiga (data da câmera de antes de agora) é recusada; foto de agora passa', async () => {
  const fmt = (d: Date) => {
    // hora local de Brasília no formato EXIF
    const b = new Date(d.getTime() - 3 * 3_600_000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${b.getUTCFullYear()}:${p(b.getUTCMonth() + 1)}:${p(b.getUTCDate())} ${p(b.getUTCHours())}:${p(b.getUTCMinutes())}:${p(b.getUTCSeconds())}`;
  };
  const withDate = async (d: Date, offset = true) =>
    sharp(await photo())
      .withExif({ IFD0: { Make: 'TestPhone' }, IFD2: { DateTimeOriginal: fmt(d), ...(offset ? { OffsetTimeOriginal: '-03:00' } : {}) } })
      .jpeg()
      .toBuffer();
  // foto de 2 dias atrás (da galeria)
  let r = await (await postReq(beto)).r.attach('photo', await withDate(new Date(Date.now() - 2 * 86_400_000)), 'velha.jpg');
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'OLD_PHOTO');
  // foto de 1 hora atrás, com fuso gravado
  r = await (await postReq(beto)).r.attach('photo', await withDate(new Date(Date.now() - 3_600_000)), 'hora.jpg');
  assert.equal(r.body.code, 'OLD_PHOTO');
  // foto de agora
  r = await (await postReq(beto)).r.attach('photo', await withDate(new Date()), 'agora.jpg');
  assert.equal(r.status, 201);
  // de agora, mas a câmera não gravou o fuso: também passa
  r = await (await postReq(beto)).r.attach('photo', await withDate(new Date(), false), 'agora2.jpg');
  assert.equal(r.status, 201);
});
