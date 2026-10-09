import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Bell, BellRing, Heart, MessageCircle, Swords, ShieldAlert, Crown, X, Hourglass, Dumbbell, Users, Flame } from 'lucide-react';
import type { PublicUser } from '@gymbattle/shared';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { enablePush, pushState, type PushState } from '@/lib/push';
import { Avatar } from '@/components/UserChip';
import { Button, Card, Spinner, toast } from '@/components/ui';

interface Notif {
  id: string;
  type: string;
  actor: PublicUser | null;
  text: string;
  url: string;
  thumb: string | null;
  read: boolean;
  createdAt: string;
}

const ICON: Record<string, { icon: typeof Bell; color: string }> = {
  LIKE: { icon: Heart, color: 'text-hp' },
  COMMENT: { icon: MessageCircle, color: 'text-mana' },
  CHALLENGE: { icon: Swords, color: 'text-volt' },
  CHALLENGE_ACCEPTED: { icon: Swords, color: 'text-volt' },
  CHALLENGE_DECLINED: { icon: X, color: 'text-muted' },
  CHALLENGE_EXPIRED: { icon: Hourglass, color: 'text-muted' },
  REMINDER: { icon: Dumbbell, color: 'text-volt' },
  FAKE: { icon: ShieldAlert, color: 'text-danger' },
  FAKE_GROUP: { icon: ShieldAlert, color: 'text-danger' },
  SEASON: { icon: Crown, color: 'text-gold' },
  GROUP_INVITE: { icon: Users, color: 'text-volt' },
  GROUP: { icon: Users, color: 'text-volt' },
  BOSS_EVENT: { icon: Flame, color: 'text-hp' },
  BOSS_INVITE: { icon: Swords, color: 'text-volt' },
  BOSS_FIGHT: { icon: Swords, color: 'text-hp' },
};

export default function Notifications() {
  const qc = useQueryClient();
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['notifications'],
    queryFn: ({ pageParam }) => api.get<{ notifications: Notif[]; nextCursor: string | null }>(`/notifications${pageParam ? `?cursor=${pageParam}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });

  // ao abrir, marca tudo como lido
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => {
      void api.post('/notifications/read-all').then(() => qc.setQueryData(['unread'], { count: 0 }));
    }, 800);
    return () => clearTimeout(t);
  }, [data, qc]);

  const items = data?.pages.flatMap((p) => p.notifications) ?? [];
  return (
    <div className="animate-fade-up space-y-4">
      <PushCard />
      {isLoading && <Spinner className="mx-auto" />}
      {!isLoading && items.length === 0 && (
        <div className="flex flex-col items-center py-14 text-center">
          <div className="grid size-16 place-items-center rounded-2xl border border-line bg-surface">
            <Bell className="size-7 text-volt" />
          </div>
          <p className="mt-4 font-semibold">Nada por aqui ainda</p>
          <p className="mt-1 text-sm text-muted">Curtidas, comentários e desafios aparecem aqui.</p>
        </div>
      )}
      {items.length > 0 && (
        <Card className="divide-y divide-line overflow-hidden">
          {items.map((n) => {
            const I = ICON[n.type] ?? { icon: Bell, color: 'text-muted' };
            return (
              <Link key={n.id} to={n.url} className={clsx('flex items-center gap-3 p-3.5 transition hover:bg-surface-2', !n.read && 'bg-volt/5')}>
                <div className="relative shrink-0">
                  {n.actor ? (
                    <Avatar user={n.actor} size={42} />
                  ) : (
                    <span className="grid size-[42px] place-items-center rounded-full bg-surface-3">
                      <I.icon className={clsx('size-5', I.color)} />
                    </span>
                  )}
                  {n.actor && (
                    <span className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full border-2 border-surface bg-surface-3">
                      <I.icon className={clsx('size-2.5', I.color, n.type === 'LIKE' && 'fill-current')} />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug">{n.text}</p>
                  <p className="mt-0.5 text-xs text-subtle">{timeAgo(n.createdAt)}</p>
                </div>
                {n.thumb && <img src={n.thumb} alt="" className="size-11 shrink-0 rounded-lg object-cover" loading="lazy" />}
                {!n.read && <span className="size-2 shrink-0 rounded-full bg-volt" />}
              </Link>
            );
          })}
        </Card>
      )}
      {hasNextPage && (
        <Button variant="ghost" className="w-full" loading={isFetchingNextPage} onClick={() => void fetchNextPage()}>
          Carregar mais
        </Button>
      )}
    </div>
  );
}

function PushCard() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void pushState().then(setState);
  }, []);
  // já ativadas (ou sem suporte): o cartão some
  if (!state || state === 'unsupported' || state === 'on') return null;

  async function enable() {
    setBusy(true);
    try {
      const s = await enablePush();
      setState(s);
      if (s === 'on') toast('Pronto! Você vai receber notificações neste aparelho.');
      else if (s === 'denied') toast('Permissão negada nas configurações do navegador.', 'error');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-3">
        <BellRing className="size-5 text-muted" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Notificações no celular</p>
        <p className="text-xs text-muted">
          {state === 'off' && 'Receba avisos mesmo com o app fechado.'}
          {state === 'denied' && 'Bloqueadas no navegador. Libere nas configurações do site.'}
          {state === 'needs-install' && 'No iPhone, instale o app (Baixar app) para receber notificações.'}
        </p>
      </div>
      {state === 'off' && (
        <Button size="sm" loading={busy} onClick={() => void enable()}>
          Ativar
        </Button>
      )}
    </Card>
  );
}
