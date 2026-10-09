import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { DEFAULT_AVATAR } from '@gymbattle/shared';
import { prisma } from './db.js';
import { env } from './env.js';
import { newInviteCode } from './lib/groups.js';

/** Roda um comando e devolve a saída (sem depender de promisify, que alguns hosts alteram). */
function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout?.on('data', (d) => (out += String(d)));
    child.stderr?.on('data', (d) => (out += String(d)));
    const timer = setTimeout(() => child.kill('SIGKILL'), 180_000);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`prisma migrate deploy saiu com código ${code}:\n${out.slice(-2000)}`));
    });
  });
}
const here = path.dirname(fileURLToPath(import.meta.url));

function schemaPath() {
  const candidates = [path.resolve(here, '../prisma/schema.prisma'), path.resolve(process.cwd(), 'server/prisma/schema.prisma')];
  return candidates.find((p) => fs.existsSync(p));
}

/** Aplica as migrations pendentes do banco (prisma migrate deploy). */
export async function migrate() {
  if (process.env.AUTO_MIGRATE === 'false') return;
  const schema = schemaPath();
  if (!schema) {
    console.warn('⚠️  schema.prisma não encontrado; migrations não aplicadas.');
    return;
  }
  const require = createRequire(import.meta.url);
  const cli = path.join(path.dirname(require.resolve('prisma/package.json')), 'build/index.js');
  const stdout = await run(process.execPath, [cli, 'migrate', 'deploy', '--schema', schema]);
  const applied = stdout.split('\n').filter((l) => /applied|No pending/i.test(l));
  console.log('🗄️  Banco:', applied.join(' ').trim() || 'ok');
}

const ADMIN_NAME = 'Lucas';

async function freeName(base: string) {
  let name = base;
  for (let i = 2; await prisma.user.findUnique({ where: { username: name } }); i++) name = `${base}${i}`;
  return name;
}

/** Garante que a conta admin exista (senha vem de ADMIN_PASSWORD). */
export async function ensureAdmin() {
  const email = env.ADMIN_EMAIL.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== 'ADMIN') await prisma.user.update({ where: { email }, data: { role: 'ADMIN' } });
    // conta admin anônima: nome comum e sem título que entregue o cargo
    if (existing.username === 'admin' || existing.title === 'Mestre da Arena') {
      const name = await freeName(ADMIN_NAME);
      const posts = await prisma.post.count({ where: { userId: existing.id } });
      await prisma.user.update({
        where: { email },
        data: {
          ...(existing.username === 'admin' ? { username: name } : {}),
          title: existing.title === 'Mestre da Arena' ? null : existing.title,
          // streak de um post de teste já apagado
          ...(posts === 0 ? { streak: 0, lastPostDay: null, restWeeks: [] } : {}),
        },
      });
    }
    return;
  }
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 8) {
    console.warn('⚠️  Conta admin ainda não existe: defina ADMIN_PASSWORD (8+ caracteres) e reinicie.');
    return;
  }
  await prisma.user.create({
    data: {
      email,
      username: await freeName(ADMIN_NAME),
      passwordHash: await bcrypt.hash(password, 12),
      role: 'ADMIN',
      avatar: DEFAULT_AVATAR as object,
    },
  });
  console.log(`👑 Conta admin criada: ${email}`);
}

/**
 * Uma vez só (na chegada dos grupos): todo mundo que já jogava vira o grupo do
 * admin do site (o dono), e a Anavi vira admin desse grupo.
 */
export async function seedFirstGroup() {
  const KEY = 'groupsSeeded';
  if (await prisma.setting.findUnique({ where: { key: KEY } })) return;
  const owner = await prisma.user.findUnique({ where: { email: env.ADMIN_EMAIL.toLowerCase() } });
  if (!owner) return; // tenta de novo no próximo início
  const summary = await prisma.$transaction(async (tx) => {
    if (await tx.setting.findUnique({ where: { key: KEY } })) return null;
    const now = new Date();
    let groupId = owner.groupId;
    if (!groupId) {
      const g = await tx.group.create({ data: { name: 'Grupo do Lucas', inviteCode: newInviteCode() } });
      groupId = g.id;
      await tx.user.update({ where: { id: owner.id }, data: { groupId, groupRole: 'OWNER', groupJoinedAt: now } });
    }
    const moved = await tx.user.updateMany({ where: { groupId: null }, data: { groupId, groupRole: 'MEMBER', groupJoinedAt: now } });
    // Anavi → admin do grupo (nome exato; se não houver, o primeiro que começa com "anavi")
    const all = await tx.user.findMany({ where: { groupId }, select: { id: true, username: true } });
    const anavi =
      all.find((u) => u.username.toLowerCase() === 'anavi') ??
      all.find((u) => u.username.toLowerCase().startsWith('anavi')) ??
      all.find((u) => u.username.toLowerCase().includes('anavi'));
    if (anavi && anavi.id !== owner.id) await tx.user.update({ where: { id: anavi.id }, data: { groupRole: 'ADMIN' } });
    await tx.setting.create({ data: { key: KEY, value: new Date().toISOString() } });
    await tx.moderationLog.create({
      data: { action: 'SEED_GROUP', actorId: owner.id, details: { groupId, moved: moved.count, anavi: anavi?.username ?? null } },
    });
    return { moved: moved.count, anavi: anavi?.username ?? null };
  });
  if (summary) console.log(`👥 Grupo inicial criado: ${summary.moved} jogadores; admin do grupo: ${summary.anavi ?? '(Anavi não encontrada)'}`);
}
