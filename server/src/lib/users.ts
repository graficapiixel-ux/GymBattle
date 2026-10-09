import { Prisma } from '@prisma/client';
import { BALANCE, DEFAULT_AVATAR } from '@gymbattle/shared';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { hashPassword } from './auth.js';
import { conflict } from './http.js';
import { createHmac } from 'node:crypto';

/** "Hash" irreversível do CPF (com segredo): o número em si nunca é guardado. */
export function cpfHash(digits: string) {
  const key = env.CPF_SECRET ?? createHmac('sha256', env.JWT_SECRET).update('gymbattle-cpf-v1').digest('hex');
  return createHmac('sha256', key).update(digits).digest('hex');
}

export async function createUser(input: { email: string; username: string; password: string; cpf?: string }) {
  if (input.email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase()) {
    throw conflict('Este e-mail já está em uso.', 'EMAIL_TAKEN');
  }
  const cpf = input.cpf ? cpfHash(input.cpf) : null;
  if (cpf && (await prisma.user.findUnique({ where: { cpfHash: cpf }, select: { id: true } }))) {
    throw conflict('Já existe uma conta com este CPF. Cada pessoa só pode ter uma conta.', 'CPF_TAKEN');
  }
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: input.email }, { username: input.username }] },
    select: { email: true },
  });
  if (existing) {
    throw existing.email === input.email
      ? conflict('Este e-mail já está em uso.', 'EMAIL_TAKEN')
      : conflict('Este nome de usuário já está em uso.', 'USERNAME_TAKEN');
  }
  try {
    return await prisma.user.create({
      data: {
        email: input.email,
        username: input.username,
        passwordHash: await hashPassword(input.password),
        cpfHash: cpf,
        rankPoints: BALANCE.ranking.startPr,
        avatar: DEFAULT_AVATAR as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw conflict('E-mail, nome de usuário ou CPF já em uso.', 'TAKEN');
    }
    throw e;
  }
}
