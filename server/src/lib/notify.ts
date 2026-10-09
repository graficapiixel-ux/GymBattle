import webpush from 'web-push';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { getSettingRaw, setSettingRaw } from './settings.js';

export type NotifType = 'LIKE' | 'COMMENT' | 'CHALLENGE' | 'CHALLENGE_ACCEPTED' | 'CHALLENGE_DECLINED' | 'CHALLENGE_EXPIRED' | 'FAKE' | 'FAKE_GROUP' | 'REMINDER' | 'SEASON' | 'GROUP_INVITE' | 'GROUP' | 'BOSS_EVENT' | 'BOSS_INVITE' | 'BOSS_FIGHT';

interface NotifInput {
  userId: string;
  actorId?: string | null;
  type: NotifType;
  postId?: string | null;
  battleId?: string | null;
  challengeId?: string | null;
  groupId?: string | null;
  text?: string | null;
}

// ------------------------------------------------------------------ push (VAPID)

let vapidReady: Promise<string | null> | null = null;

/** Chaves VAPID: do ambiente ou geradas uma vez e guardadas no banco. */
export function vapidPublicKey(): Promise<string | null> {
  vapidReady ??= (async () => {
    try {
      let pub = process.env.VAPID_PUBLIC_KEY ?? (await getSettingRaw('vapidPublic'));
      let priv = process.env.VAPID_PRIVATE_KEY ?? (await getSettingRaw('vapidPrivate'));
      if (!pub || !priv) {
        const keys = webpush.generateVAPIDKeys();
        pub = keys.publicKey;
        priv = keys.privateKey;
        await setSettingRaw('vapidPublic', pub);
        await setSettingRaw('vapidPrivate', priv);
      }
      webpush.setVapidDetails(`mailto:${env.ADMIN_EMAIL}`, pub, priv);
      return pub;
    } catch (e) {
      console.warn('Push desativado:', (e as Error).message);
      return null;
    }
  })();
  return vapidReady;
}

const TITLES: Record<NotifType, string> = {
  LIKE: 'Nova curtida 💪',
  COMMENT: 'Novo comentário 💬',
  CHALLENGE: 'Você foi desafiado! ⚔️',
  CHALLENGE_ACCEPTED: 'Luta ranqueada! ⚔️',
  CHALLENGE_DECLINED: 'Desafio recusado',
  CHALLENGE_EXPIRED: 'Desafio expirado ⌛',
  FAKE: 'Foto removida pela verificação automática',
  FAKE_GROUP: 'Foto falsa no grupo 🚫',
  REMINDER: 'Hora do treino 💪',
  SEASON: 'Fim de temporada 🏆',
  GROUP_INVITE: 'Convite para grupo 👥',
  GROUP: 'Seu grupo 👥',
  BOSS_EVENT: 'EVENTO NA ARENA! 🐉',
  BOSS_INVITE: 'Chamado para a batalha ⚔️',
  BOSS_FIGHT: 'A batalha começou! 🔥',
};

async function sendPush(userId: string, title: string, body: string, url: string) {
  if (process.env.NODE_ENV === 'test') return;
  if (!(await vapidPublicKey())) return;
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  const payload = JSON.stringify({ title, body, url });
  await Promise.all(
    subs.map((s) =>
      webpush
        .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, timeout: 10_000 })
        .catch(async (e: { statusCode?: number }) => {
          // inscrição vencida/cancelada no navegador
          if (e.statusCode === 404 || e.statusCode === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        }),
    ),
  );
}

export function notifText(type: NotifType, actor: string | null, text?: string | null): string {
  const who = actor ?? 'Alguém';
  switch (type) {
    case 'LIKE':
      return `${who} curtiu seu treino`;
    case 'COMMENT':
      return `${who} comentou: “${(text ?? '').slice(0, 80)}”`;
    case 'CHALLENGE':
      return text ? `${who} ${text}` : `${who} te desafiou para uma luta ranqueada`;
    case 'CHALLENGE_ACCEPTED':
      // nunca conta quem venceu: a graça é assistir a luta
      return `${who} aceitou seu desafio! A luta já começou — assista ao vivo ⚔️`;
    case 'CHALLENGE_DECLINED':
    case 'CHALLENGE_EXPIRED':
      if (!text) return type === 'CHALLENGE_DECLINED' ? `${who} recusou seu desafio` : 'Um desafio expirou';
      return text.startsWith('Você') ? text : `${who} ${text}`;
    case 'FAKE_GROUP':
      return `${who} ${text ?? 'teve uma foto falsa apagada pelo sistema'}`;
    case 'FAKE':
      return text ?? 'Nossa verificação automática removeu uma foto sua.';
    case 'SEASON':
      return text ?? 'A temporada terminou';
    case 'REMINDER':
      return text ?? 'Bora treinar hoje? 💪';
    case 'GROUP_INVITE':
      return `${who} te convidou para o grupo “${text ?? ''}”`;
    case 'GROUP':
      return text ?? 'Novidade no seu grupo';
    case 'BOSS_EVENT':
      return text ?? 'Um evento começou na Arena!';
    case 'BOSS_INVITE':
      return `${who} te chamou para enfrentar ${text ?? 'o boss'} no time dele!`;
    case 'BOSS_FIGHT':
      return `A luta contra ${text ?? 'o boss'} começou — assista!`;
  }
}

export function notifUrl(n: { type: string; postId?: string | null; battleId?: string | null; challengeId?: string | null }) {
  if (n.type === 'BOSS_FIGHT' && n.battleId) return `/chefe/${n.battleId}`;
  if (n.type.startsWith('BOSS')) return '/arena';
  if (n.battleId) return `/luta/${n.battleId}`;
  // desafio recebido: abre a página do desafio (aceitar ou recusar), nunca aceita sozinho
  if (n.type === 'CHALLENGE' && n.challengeId) return `/desafio/${n.challengeId}`;
  if (n.postId) return `/p/${n.postId}`;
  if (n.type.startsWith('CHALLENGE')) return '/ranking';
  if (n.type === 'SEASON') return '/ranking';
  if (n.type === 'REMINDER') return '/postar';
  if (n.type === 'FAKE_GROUP') return '/';
  if (n.type.startsWith('GROUP')) return '/grupo';
  return '/notificacoes';
}

/** Cria a notificação (e envia push). Nunca derruba a ação principal. */
export async function notify(n: NotifInput) {
  try {
    if (n.actorId && n.actorId === n.userId) return; // não notifica a si mesmo
    if (n.type === 'LIKE' && n.postId && n.actorId) {
      // curtir/descurtir/curtir não gera spam
      const dup = await prisma.notification.findFirst({ where: { userId: n.userId, actorId: n.actorId, postId: n.postId, type: 'LIKE' } });
      if (dup) return;
    }
    const data = { ...n, text: n.text ? n.text.slice(0, 280) : n.text };
    const created = await prisma.notification.create({ data, include: { actor: { select: { username: true } } } });
    void sendPush(n.userId, TITLES[n.type], notifText(n.type, created.actor?.username ?? null, n.text), notifUrl(created)).catch(() => {});
  } catch (e) {
    console.warn('notify falhou', e);
  }
}
