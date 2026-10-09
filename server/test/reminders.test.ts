import { cpf } from './_util.js';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { localClock } from '@gymbattle/shared';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { reminderText, sendWorkoutReminders } from '../src/lib/reminders.js';

const app = createApp();
const tag = Math.random().toString(36).slice(2, 8);
const ids: Record<string, string> = {};
// segunda-feira, 5 de outubro de 2026 (Brasília = UTC−3)
const MON_NOON = new Date('2026-10-05T15:30:00Z'); // 12:30
const MON_NIGHT = new Date('2026-10-05T23:10:00Z'); // 20:10
const MON_MORNING = new Date('2026-10-05T12:00:00Z'); // 09:00
const SUN_NOON = new Date('2026-10-04T15:30:00Z'); // domingo 12:30

const reminders = (k: string) => prisma.notification.findMany({ where: { userId: ids[k], type: 'REMINDER' } });

before(async () => {
  await prisma.setting.deleteMany({ where: { key: { startsWith: 'reminder:2026-10-0' } } });
  for (const k of ['treinou', 'faltou', 'sequencia']) {
    const r = await request(app).post('/api/auth/register').send({ email: `${k}_${tag}@test.dev`, username: `${k}_${tag}`, password: 'senhaforte123', cpf: cpf() });
    ids[k] = r.body.user.id;
  }
  await prisma.user.update({ where: { id: ids.treinou }, data: { lastPostDay: '2026-10-05', streak: 1 } });
  await prisma.user.update({ where: { id: ids.sequencia }, data: { lastPostDay: '2026-10-04', streak: 6 } });
});
after(async () => {
  await prisma.setting.deleteMany({ where: { key: { startsWith: 'reminder:2026-10-0' } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `_${tag}@test.dev` } } });
  await prisma.$disconnect();
});

test('relógio de Brasília', () => {
  assert.deepEqual(localClock(MON_NOON), { hour: 12, weekday: 1 });
  assert.deepEqual(localClock(SUN_NOON), { hour: 12, weekday: 0 });
  assert.deepEqual(localClock(MON_NIGHT), { hour: 20, weekday: 1 });
});

test('domingo e fora do horário: nenhum lembrete', async () => {
  assert.equal(await sendWorkoutReminders(SUN_NOON), 0);
  assert.equal(await sendWorkoutReminders(MON_MORNING), 0);
  assert.equal((await reminders('faltou')).length, 0);
});

test('12h: só quem não postou recebe; uma vez só por horário', async () => {
  assert.ok((await sendWorkoutReminders(MON_NOON)) > 0);
  assert.equal((await reminders('treinou')).length, 0);
  const r = await reminders('faltou');
  assert.equal(r.length, 1);
  assert.ok(r[0].text && r[0].text.length > 10);
  assert.equal(r[0].actorId, null);
  assert.equal(await sendWorkoutReminders(new Date(MON_NOON.getTime() + 20 * 60_000)), 0); // já enviado
  assert.equal((await reminders('faltou')).length, 1);
  // quem tem sequência recebe aviso para não perder
  const s = await reminders('sequencia');
  assert.match(s[0].text!, /6 dias/);
});

test('20h: novo lembrete substitui o anterior (não acumula)', async () => {
  assert.ok((await sendWorkoutReminders(MON_NIGHT)) > 0);
  const r = await reminders('faltou');
  assert.equal(r.length, 1);
  assert.equal((await reminders('treinou')).length, 0);
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: `faltou_${tag}@test.dev`, password: 'senhaforte123' }).expect(200);
  const list = await agent.get('/api/notifications').expect(200);
  const n = list.body.notifications.find((x: any) => x.type === 'REMINDER');
  assert.equal(n.url, '/postar');
});

test('textos', () => {
  assert.match(reminderText(20, 5, 'x'), /sequência de 5 dias/);
  assert.ok(reminderText(12, 0, 'a').length > 10);
  assert.ok(reminderText(20, 1, 'b').length > 10);
});

test('/api/tick responde (usado pelo cron da hospedagem)', async () => {
  const r = await request(app).get('/api/tick').expect(200);
  assert.equal(r.body.ok, true);
});
