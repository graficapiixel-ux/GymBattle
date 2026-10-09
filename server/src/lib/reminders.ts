import { BALANCE, currentStreak, dayKey, localClock } from '@gymbattle/shared';
import { prisma } from '../db.js';
import { notify } from './notify.js';

const R = BALANCE.reminders;

const NOON = [
  'Ainda dá tempo! Bora treinar e postar a foto do treino de hoje 💪',
  'O ferro não se levanta sozinho. Partiu academia?',
  'Seu guerreiro está esperando: treine hoje e ganhe XP e ouro ⚔️',
  'Meio-dia e nada de treino? A arena não perdoa. Bora!',
  'Quem treina hoje luta melhor amanhã. Vai lá! 🏋️',
];
const NIGHT = [
  'Última chamada! Treine e poste a foto antes da meia-noite 🔥',
  'O dia está acabando e um treino rápido ainda conta. Bora?',
  'Seus rivais já treinaram hoje. E você? 👀',
  'Ainda dá tempo de ganhar o XP e o ouro de hoje. Partiu treino!',
];

/** Escolha estável por pessoa e por dia (cada um recebe uma frase diferente). */
function pick(list: string[], seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

export function reminderText(hour: number, streak: number, seed: string) {
  if (streak >= 2) {
    return hour >= 18
      ? `Não perca sua sequência de ${streak} dias! Treine e poste até a meia-noite 🔥`
      : `Você está com ${streak} dias seguidos. Bora manter a sequência hoje! 💪`;
  }
  return pick(hour >= 18 ? NIGHT : NOON, seed);
}

/**
 * Envia o lembrete de treino (12h e 20h, menos domingo) para quem ainda não
 * postou hoje. Cada horário é enviado uma única vez por dia, mesmo que esta
 * função rode várias vezes (ela é chamada a cada poucos minutos).
 */
export async function sendWorkoutReminders(now = new Date()): Promise<number> {
  const { hour, weekday } = localClock(now);
  if ((R.skipWeekdays as readonly number[]).includes(weekday)) return 0;
  const slot = R.hours.find((h) => hour >= h && hour < h + R.windowHours);
  if (slot === undefined) return 0;
  const day = dayKey(now);
  const key = `reminder:${day}:${slot}`;
  // "trava" o horário: só a primeira execução envia
  try {
    await prisma.setting.create({ data: { key, value: now.toISOString() } });
  } catch {
    return 0;
  }
  const users = await prisma.user.findMany({
    where: { OR: [{ lastPostDay: null }, { lastPostDay: { not: day } }] },
    select: { id: true, streak: true, lastPostDay: true, restWeeks: true },
  });
  let sent = 0;
  for (const u of users) {
    const streak = currentStreak({ streak: u.streak, lastPostDay: u.lastPostDay, restWeeks: (u.restWeeks as string[] | null) ?? [] }, day);
    // só o lembrete mais recente fica na lista (sem acumular)
    await prisma.notification.deleteMany({ where: { userId: u.id, type: 'REMINDER', readAt: null } });
    await notify({ userId: u.id, type: 'REMINDER', text: reminderText(slot, streak, u.id + day + slot) });
    sent++;
  }
  // limpa as travas antigas
  const old = dayKey(new Date(now.getTime() - 3 * 86_400_000));
  await prisma.setting.deleteMany({ where: { key: { startsWith: 'reminder:', lt: `reminder:${old}` } } });
  if (sent) console.log(`⏰ Lembrete das ${slot}h enviado para ${sent} jogador(es)`);
  return sent;
}
