/**
 * Cria (ou atualiza) a conta administradora.
 * Senha vem de ADMIN_PASSWORD. Rodar: npm run db:seed
 * Se a conta já existir, a senha só é trocada quando ADMIN_RESET_PASSWORD=true.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { DEFAULT_AVATAR } from '@gymbattle/shared';

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL || 'lucasmartins2216@gmail.com').toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    const data: { role: 'ADMIN'; passwordHash?: string } = { role: 'ADMIN' };
    if (process.env.ADMIN_RESET_PASSWORD === 'true') {
      if (!password || password.length < 8) throw new Error('ADMIN_PASSWORD precisa ter 8+ caracteres.');
      data.passwordHash = await bcrypt.hash(password, 12);
    }
    await prisma.user.update({ where: { email }, data });
    console.log(`✔ Admin ${email} já existe (papel garantido${data.passwordHash ? ', senha redefinida' : ''}).`);
    return;
  }

  if (!password || password.length < 8) {
    throw new Error('Defina ADMIN_PASSWORD (8+ caracteres) no .env antes de rodar o seed.');
  }
  await prisma.user.create({
    data: {
      email,
      username: 'admin',
      passwordHash: await bcrypt.hash(password, 12),
      role: 'ADMIN',
      title: 'Mestre da Arena',
      avatar: DEFAULT_AVATAR as object,
    },
  });
  console.log(`✔ Conta admin criada: ${email}`);
}

main()
  .catch((e) => {
    console.error('✖', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
