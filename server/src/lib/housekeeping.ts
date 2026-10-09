import { bossHousekeeping } from './bossEvents.js';
import { clearAllShields, isShieldsEnabled } from './settings.js';
import { purgeExpiredPosts } from './posts.js';
import { rankingHousekeeping } from './ranking.js';
import { sendWorkoutReminders } from './reminders.js';

let running = false;
let lastRun = 0;

/**
 * Tarefas periódicas. Roda pelo timer interno e também pela rota /api/tick
 * (chamada pelo cron da hospedagem, que acorda o app se ele estiver dormindo).
 * No máximo uma execução por minuto.
 */
export async function runHousekeeping(): Promise<boolean> {
  if (running || Date.now() - lastRun < 60_000) return false;
  running = true;
  lastRun = Date.now();
  try {
    const n = await purgeExpiredPosts();
    if (n) console.log(`🧹 ${n} foto(s) expirada(s) apagada(s)`);
    await rankingHousekeeping();
    // escudos desligados pelo admin: ninguém fica protegido
    if (!(await isShieldsEnabled())) await clearAllShields();
    await sendWorkoutReminders();
    await bossHousekeeping();
    return true;
  } catch (e) {
    console.error('Erro nas tarefas periódicas', e);
    return false;
  } finally {
    running = false;
  }
}
