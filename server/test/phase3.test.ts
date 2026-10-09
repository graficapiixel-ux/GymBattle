import { cpf } from './_util.js';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { ARMOR_SETS_BY_ID, armorPieceId, armorPiecePrice, armorSetPrice } from '@gymbattle/shared';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';

const app = createApp();
const tag = Math.random().toString(36).slice(2, 8);
const cris = request.agent(app);
const email = `cris_${tag}@test.dev`;
const setGold = (gold: number) => prisma.user.update({ where: { email }, data: { gold } });

before(async () => {
  await cris.post('/api/auth/register').send({ email, username: `cris_${tag}`, password: 'senhaforte123', cpf: cpf() }).expect(201);
});
after(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

test('novo jogador precisa escolher a arma inicial; só uma vez e só entre as 3', async () => {
  let me = await cris.get('/api/auth/me');
  assert.equal(me.body.user.starterWeapon, null);
  assert.equal(me.body.user.equipment.weapon, null);

  await cris.post('/api/shop/starter').send({ weaponId: 'katana-lua-palida' }).expect(400);
  const r = await cris.post('/api/shop/starter').send({ weaponId: 'cajado-aprendiz' }).expect(200);
  assert.equal(r.body.user.equipment.weapon, 'cajado-aprendiz');
  assert.equal(r.body.user.gold, 0);
  await cris.post('/api/shop/starter').send({ weaponId: 'selo-do-novico' }).expect(409);

  me = await cris.get('/api/shop/inventory');
  assert.deepEqual(me.body.items.map((i: any) => i.itemId), ['cajado-aprendiz']);
});

test('comprar arma: precisa de ouro, desconta, não compra duas vezes', async () => {
  await setGold(100);
  let r = await cris.post('/api/shop/buy').send({ itemId: 'espada-curta-recruta' });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'NO_GOLD');

  await setGold(1000);
  r = await cris.post('/api/shop/buy').send({ itemId: 'espada-curta-recruta' }).expect(200);
  assert.equal(r.body.user.gold, 750);
  r = await cris.post('/api/shop/buy').send({ itemId: 'espada-curta-recruta' });
  assert.equal(r.status, 409);

  await cris.post('/api/shop/buy').send({ itemId: 'nao-existe' }).expect(404);
});

test('ouro negativo não compra nada', async () => {
  await setGold(-40);
  const r = await cris.post('/api/shop/buy').send({ itemId: 'selo-do-novico' });
  assert.equal(r.status, 400);
});

test('loja progressiva: arma escondida não pode ser comprada; aparece perto do requisito', async () => {
  await setGold(5000);
  // Espada Longa pede FOR 10 e DES 9 — com tudo em 5 está escondida
  let r = await cris.post('/api/shop/buy').send({ itemId: 'espada-longa-guarda' });
  assert.equal(r.status, 403);
  // basta UM dos atributos chegar perto (DES 7 = 9 − 2)
  await prisma.user.update({ where: { email }, data: { dex: 7 } });
  r = await cris.post('/api/shop/buy').send({ itemId: 'espada-longa-guarda' });
  assert.equal(r.status, 200);
  // armadura lendária exige nível
  r = await cris.post('/api/shop/buy-set').send({ setId: 'rei-caido' });
  assert.equal(r.status, 403);
  await prisma.user.update({ where: { email }, data: { dex: 5 } });
});

test('armadura: peça avulsa e conjunto com desconto só das peças que faltam', async () => {
  const set = ARMOR_SETS_BY_ID['recruta'];
  await setGold(5000);
  let r = await cris.post('/api/shop/buy').send({ itemId: armorPieceId('recruta', 'helm') }).expect(200);
  assert.equal(r.body.spent, armorPiecePrice(set, 'helm'));
  r = await cris.post('/api/shop/buy-set').send({ setId: 'recruta' }).expect(200);
  assert.equal(r.body.spent, armorSetPrice(set, ['helm']));
  await cris.post('/api/shop/buy-set').send({ setId: 'recruta' }).expect(409);

  // conjunto inteiro novo tem desconto
  const full = ARMOR_SETS_BY_ID['aprendiz'];
  r = await cris.post('/api/shop/buy-set').send({ setId: 'aprendiz' }).expect(200);
  assert.equal(r.body.spent, armorSetPrice(full));
  assert.ok(r.body.spent < full.price);
});

test('equipar: só itens próprios, no lugar certo; arma sem requisito pode ser equipada', async () => {
  await cris.put('/api/shop/equip').send({ slot: 'weapon', itemId: 'martelo-titã-caido' }).expect(400); // não tem
  await cris.put('/api/shop/equip').send({ slot: 'chest', itemId: armorPieceId('recruta', 'helm') }).expect(400);
  await cris.put('/api/shop/equip').send({ slot: 'weapon', itemId: null }).expect(400);

  let r = await cris.put('/api/shop/equip').send({ slot: 'helm', itemId: armorPieceId('recruta', 'helm') }).expect(200);
  assert.equal(r.body.user.equipment.helm, 'armor:recruta:helm');
  r = await cris.put('/api/shop/equip').send({ slot: 'chest', itemId: armorPieceId('aprendiz', 'chest') }).expect(200);
  assert.equal(r.body.user.equipment.chest, 'armor:aprendiz:chest');
  r = await cris.put('/api/shop/equip').send({ slot: 'weapon', itemId: 'espada-curta-recruta' }).expect(200);
  assert.equal(r.body.user.equipment.weapon, 'espada-curta-recruta');
  r = await cris.put('/api/shop/equip').send({ slot: 'helm', itemId: null }).expect(200);
  assert.equal(r.body.user.equipment.helm, null);

  // o feed/perfil público também mostra o equipamento
  const p = await cris.get(`/api/users/cris_${tag}`).expect(200);
  assert.equal(p.body.user.equipment.weapon, 'espada-curta-recruta');
});
