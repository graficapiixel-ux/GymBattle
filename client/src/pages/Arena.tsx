import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Swords, Search, History, Eye, Bot, Trophy, ShieldCheck } from 'lucide-react';
import { WEAPONS_BY_ID, type PublicUser } from '@gymbattle/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { Avatar, LevelPill } from '@/components/UserChip';
import { WeaponIcon } from '@/components/AvatarCanvas';
import { Button, Card, Spinner } from '@/components/ui';
import { ChallengeSheet, type ChallengeTarget } from './Ranking';
import { BossEvents } from '@/components/BossEventCard';
import { NoGroupCta, TournamentBar, useMyGroup } from './GroupPage';

export interface BattleRow {
  id: string;
  mode: string;
  mapName: string;
  a: { id: string | null; username: string };
  b: { id: string | null; username: string };
  winner: number | null;
  durationSec: number;
  createdAt: string;
  live?: boolean;
}

export default function Arena() {
  const [tab, setTab] = useState<'fight' | 'history'>('fight');
  return (
    <div className="animate-fade-up space-y-4">
      {/* evento de boss (só aparece quando há um ativo) */}
      <BossEvents />
      <Card className="relative overflow-hidden p-5">
        <div className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full bg-hp/15 blur-3xl" />
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-volt/10">
            <Bot className="size-5 text-volt" />
          </span>
          <div>
            <h2 className="font-semibold">Lutas automáticas</h2>
            <p className="mt-0.5 text-sm text-muted">
              Desafie alguém: se a pessoa aceitar, os guerreiros lutam sozinhos com a build de cada um (atributos, arma e armadura) e
              vocês assistem até o fim. Toda luta vale PR no ranking.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 rounded-xl border border-line bg-surface p-1">
        {(
          [
            ['fight', 'Desafiar', Swords],
            ['history', 'Minhas lutas', History],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx(
              'flex h-10 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition sm:text-sm',
              tab === id ? 'bg-surface-3 text-fg' : 'text-subtle',
            )}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'fight' && <Opponents />}
      {tab === 'history' && <BattleList mine />}
    </div>
  );
}

function Opponents() {
  const { user } = useAuth();
  if (!user?.groupId) return <NoGroupCta>As lutas são entre as pessoas do seu grupo. Crie um grupo ou entre no de um amigo.</NoGroupCta>;
  return <OpponentList />;
}

function OpponentList() {
  const [q, setQ] = useState('');
  const [target, setTarget] = useState<ChallengeTarget | null>(null);
  const { data: group } = useMyGroup();
  const { data, isLoading } = useQuery({
    queryKey: ['opponents', q],
    queryFn: () =>
      api.get<{ users: (PublicUser & { rankPoints: number; protectedUntil: string | null })[] }>(`/battles/opponents?q=${encodeURIComponent(q)}`),
  });

  return (
    <div className="space-y-3">
      {group?.group && !group.group.tournamentOpen && (
        <Card className="p-4">
          <TournamentBar group={group.group} />
          <Link to="/grupo" className="mt-3 inline-block text-sm font-semibold text-volt">
            Convidar pessoas
          </Link>
        </Card>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar guerreiro"
          className="h-11 w-full rounded-xl border border-line-strong bg-surface pr-3 pl-10 outline-none focus:border-volt/60"
        />
      </div>
      <p className="px-1 text-xs text-subtle">
        O desafiado tem 24 h para aceitar. Seus desafios, pedidos recebidos e o ranking ficam em{' '}
        <Link to="/ranking" className="font-semibold text-volt">
          Ranking
        </Link>
        .
      </p>
      {isLoading && <Spinner className="mx-auto" />}
      <Card className="divide-y divide-line">
        {data?.users.map((u) => {
          const w = u.equipment.weapon ? WEAPONS_BY_ID[u.equipment.weapon] : undefined;
          return (
            <div key={u.id} className="flex items-center gap-3 p-3">
              <Link to={`/u/${u.username}`}>
                <Avatar user={u} size={44} />
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold">{u.username}</span>
                  <LevelPill level={u.level} />
                </div>
                <p className="flex items-center gap-1 truncate text-xs text-subtle">
                  <Trophy className="size-3" /> {u.rankPoints} PR {w && <>· {w.name}</>}
                </p>
              </div>
              {w && <WeaponIcon weapon={w} size={34} className="hidden sm:block" />}
              {u.protectedUntil ? (
                <span className="inline-flex items-center gap-1 rounded-lg bg-mana/10 px-2.5 py-1.5 text-xs font-semibold text-mana">
                  <ShieldCheck className="size-3.5" /> Protegido
                </span>
              ) : (
                <Button size="sm" onClick={() => setTarget({ user: u, rankPoints: u.rankPoints, protectedUntil: u.protectedUntil })} icon={<Swords className="size-3.5" />}>
                  Desafiar
                </Button>
              )}
            </div>
          );
        })}
        {data && data.users.length === 0 && <p className="p-6 text-center text-sm text-muted">Nenhum guerreiro encontrado.</p>}
      </Card>
      <ChallengeSheet target={target} onClose={() => setTarget(null)} />
    </div>
  );
}

export function BattleList({ mine, userId }: { mine?: boolean; userId?: string }) {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['battles', mine ? 'mine' : 'recent', userId],
    queryFn: () => api.get<{ battles: BattleRow[] }>(mine ? `/battles${userId ? `?user=${userId}` : ''}` : '/battles/recent'),
  });
  if (isLoading) return <Spinner className="mx-auto mt-6" />;
  if (!data?.battles.length)
    return <p className="py-10 text-center text-sm text-muted">{mine ? 'Você ainda não lutou.' : 'Nenhuma luta ainda.'}</p>;
  const me = userId ?? user?.id;
  return (
    <Card className="divide-y divide-line">
      {data.battles.map((b) => {
        const myIdx = b.a.id === me ? 0 : b.b.id === me ? 1 : -1;
        const live = b.live ?? Date.now() - Date.parse(b.createdAt) < b.durationSec * 1000;
        const res = live ? null : b.winner === null ? 'Empate' : myIdx === -1 ? null : b.winner === myIdx ? 'Vitória' : 'Derrota';
        return (
          <Link key={b.id} to={`/luta/${b.id}${live ? '?live=1' : ''}`} className="flex items-center gap-3 p-3.5 transition hover:bg-surface-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                <span className={clsx(!live && b.winner === 0 && 'text-volt')}>{b.a.username}</span>
                <span className="mx-1.5 text-subtle">vs</span>
                <span className={clsx(!live && b.winner === 1 && 'text-volt')}>{b.b.username}</span>
              </p>
              <p className="text-xs text-subtle">
                {b.mapName} · {live ? 'ao vivo' : `${b.durationSec}s`} · {b.mode === 'ranked' ? 'Ranqueada' : 'Treino'} · {timeAgo(b.createdAt)}
              </p>
            </div>
            {live && (
              <span className="inline-flex items-center gap-1 rounded-md bg-danger/15 px-2 py-0.5 text-xs font-bold text-danger">
                <span className="size-1.5 animate-pulse rounded-full bg-danger" /> AO VIVO
              </span>
            )}
            {res && (
              <span
                className={clsx(
                  'rounded-md px-2 py-0.5 text-xs font-bold',
                  res === 'Vitória' ? 'bg-volt/15 text-volt' : res === 'Derrota' ? 'bg-danger/15 text-danger' : 'bg-surface-3 text-muted',
                )}
              >
                {res}
              </span>
            )}
            <Eye className="size-4 text-subtle" />
          </Link>
        );
      })}
    </Card>
  );
}
