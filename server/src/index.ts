import './boot.js';
import http from 'node:http';
import { env } from './env.js';
import { createApp } from './app.js';
import { prisma } from './db.js';
import { runHousekeeping } from './lib/housekeeping.js';
import { ensureAdmin, migrate, seedFirstGroup } from './startup.js';

const app = createApp();
const server = http.createServer(app);

// Sobe o servidor HTTP na hora (a hospedagem exige listen() em poucos segundos)
// e prepara o banco logo em seguida.
async function start() {
  server.listen(env.PORT, () => {
    console.log(`⚔️  GymBattle rodando na porta ${env.PORT} (${env.NODE_ENV})`);
  });
  try {
    await migrate();
  } catch (e) {
    console.error('Erro ao aplicar migrations:', e);
  }
  try {
    await ensureAdmin();
  } catch (e) {
    console.error('Erro ao criar a conta admin:', e);
  }
  try {
    await seedFirstGroup();
  } catch (e) {
    console.error('Erro ao criar o grupo inicial:', e);
  }
  void runHousekeeping();
}
void start();

// Tarefas periódicas (a cada 5 min): apaga fotos antigas, expira desafios, fecha a
// temporada e envia os lembretes de treino. A hospedagem também chama /api/tick.
setInterval(() => void runHousekeeping(), 5 * 60_000).unref();

async function shutdown(signal: string) {
  console.log(`Recebido ${signal}, encerrando...`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
