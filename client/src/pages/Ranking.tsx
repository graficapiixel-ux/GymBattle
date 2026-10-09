import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Trophy, Crown, Swords, Clock, Check, X, Coins, Sparkles, ChevronRight, Medal, Eye, ShieldCheck, Hourglass, Users, Lock } from 'lucide-react';
import { BALANCE, WEAPONS_BY_ID, type GroupDTO, type PublicUser } from '@gymbattle/shared';
import { NoGroupCta, TournamentBar } from './GroupPage';
import { api } from '@/lib/api';
import { useAuth, useConfig } from '@/lib/auth';
import { nf } from '@/lib/format';
import { Avatar, LevelPill } from '@/components/UserChip';
import { WeaponIcon } from '@/components/AvatarCanvas';
import { Button, Card, Sheet, Spinner, toast } from '@/components/ui';

interface RankingData {
  group: GroupDTO | null;
  prizedPositions: number;
  season: { id: string; number: number; name: string; endsAt: string };
  prizes: { from: number; to: number; gold: number; xp: number; exclusiveTitle: boolean }[];
  leaderboard: { pos: number; user: PublicUser; rankPoints: number; protectedUntil: string | null }[];
  me: { pos: number; rankPoints: number; protectedUntil: string | null };
  fightRewardsLeft: number;
  total: number;
}

export interface ChallengeDTO {
  id: string;
  status: string;
  challenger: PublicUser;
  defender: PublicUser;
  challengerPos: number;
  challengerPr: number;
  defenderPr: number;
  defenderPos: number;
  battleId: string | null;
  prTransfer: number | null;
  createdAt: string;
  expiresAt: string;
  stakes: { challengerWins: { challenger: number; defender: number }; defenderWins: { challenger: number; defender: number }; decline: number; declineGain: number; challengerChance: number };
}

export interface ChallengeTarget {
  user: PublicUser;
  pos?: number;
  rankPoints: number;
  protectedUntil?: string | null;
}

export function useChallenges() {
  return useQuery({
    queryKey: ['challenges'],
    queryFn: () =>
      api.get<{
        received: ChallengeDTO[];
        sent: ChallengeDTO[];
        history: ChallengeDTO[];
        limits: { sentToday: number; maxPerDay: number; protectedUntil: string | null };
      }>('/ranking/challenges'),
    refetchInterval: 60_000,
  });
}

export default function Ranking() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['ranking'], queryFn: () => api.get<RankingData>('/ranking') });
  const [target, setTarget] = useState<ChallengeTarget | null>(null);
  if (isLoading || !data || !user) return <Spinner className="mx-auto mt-10" />;
  if (!data.group) {
    return (
      <div className="animate-fade-up space-y-4">
        <NoGroupCta>O ranking é disputado dentro de cada grupo. Crie um grupo ou entre no de um amigo.</NoGroupCta>
      </div>
    );
  }

  return (
    <div className="animate-fade-up space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-volt/12 text-volt">
            <Users className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{data.group.name}</p>
            <p className="text-xs text-muted">Ranking do grupo · {data.group.memberCount} {data.group.memberCount === 1 ? 'pessoa' : 'pessoas'}</p>
          </div>
          <Link to="/grupo" className="text-sm font-semibold text-volt">
            Ver grupo
          </Link>
        </div>
        {!data.group.tournamentOpen && (
          <div className="mt-3">
            <TournamentBar group={data.group} />
          </div>
        )}
      </Card>

      <SeasonCard data={data} />

      <Card className="flex items-center gap-4 p-4">
        <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-volt/10">
          <span className="font-display text-xl font-bold text-volt">#{data.me.pos}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Sua posição</p>
          <p className="text-xs text-muted">
            {nf.format(data.me.rankPoints)} PR · {data.fightRewardsLeft} luta{data.fightRewardsLeft === 1 ? '' : 's'} com recompensa hoje
          </p>
        </div>
        <Trophy className="size-6 text-xp" />
      </Card>

      {data.me.protectedUntil && <ProtectionCard until={data.me.protectedUntil} />}

      <Challenges />

      <section>
        <h3 className="mb-2 px-1 text-sm font-semibold">Classificação</h3>
        <Card className="divide-y divide-line overflow-hidden">
          {data.leaderboard.map((row) => {
            const me = row.user.id === user.id;
            const w = row.user.equipment.weapon ? WEAPONS_BY_ID[row.user.equipment.weapon] : undefined;
            return (
              <button
                key={row.user.id}
                onClick={() => !me && setTarget(row)}
                className={clsx('flex w-full items-center gap-3 px-3 py-2.5 text-left transition', me ? 'bg-volt/8' : 'hover:bg-surface-2')}
              >
                <PosBadge pos={row.pos} />
                <Avatar user={row.user} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={clsx('truncate text-sm font-semibold', me && 'text-volt')}>{row.user.username}</span>
                    <LevelPill level={row.user.level} />
                    {row.protectedUntil && <ShieldCheck className="size-3.5 shrink-0 text-mana" aria-label="Protegido contra desafios" />}
                  </div>
                  <p className="truncate text-xs text-subtle">{row.user.title ?? (w ? w.name : 'Recruta')}</p>
                </div>
                {w && <WeaponIcon weapon={w} size={30} className="hidden opacity-80 sm:block" />}
                <span className="font-display text-sm font-semibold tabular-nums">{nf.format(row.rankPoints)}</span>
                {!me && <ChevronRight className="size-4 text-subtle" />}
              </button>
            );
          })}
        </Card>
      </section>

      <PastSeasons />
      <ChallengeSheet target={target} onClose={() => setTarget(null)} />
    </div>
  );
}

function PosBadge({ pos }: { pos: number }) {
  const medal = pos === 1 ? '#f5b544' : pos === 2 ? '#c9ced6' : pos === 3 ? '#c9814a' : null;
  return (
    <span className="grid w-7 shrink-0 place-items-center">
      {medal ? <Medal className="size-5" style={{ color: medal }} /> : <span className="text-xs font-bold text-subtle tabular-nums">{pos}</span>}
    </span>
  );
}

function ProtectionCard({ until }: { until: string }) {
  const left = useCountdown(until);
  return (
    <Card className="flex items-center gap-3 border-mana/30 p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-mana/15">
        <ShieldCheck className="size-5 text-mana" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Você está protegido por {left}</p>
        <p className="text-xs text-muted">Ninguém pode te desafiar agora. Se você desafiar alguém, a proteção acaba.</p>
      </div>
    </Card>
  );
}

export function useCountdown(iso: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, Date.parse(iso) - now);
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function SeasonCard({ data }: { data: RankingData }) {
  const left = useCountdown(data.season.endsAt);
  return (
    <Card className="relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -top-16 -right-10 size-52 rounded-full bg-gold/15 blur-3xl" />
      <div className="flex items-center gap-2 text-xs font-semibold text-gold">
        <Crown className="size-4" /> {data.season.name}
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
        <Clock className="size-3.5" /> Termina em <b className="text-fg">{left}</b>
      </p>
      {data.prizedPositions === 0 ? (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-surface-2 p-3 text-sm text-muted">
          <Lock className="size-4 shrink-0 text-gold" /> Os prêmios da temporada valem quando o grupo tiver {BALANCE.groups.minForTournament} pessoas.
        </p>
      ) : (
      <div className="mt-4 grid grid-cols-3 gap-2">
        {data.prizes
          .filter((p) => p.from <= data.prizedPositions)
          .map((p) => ({ ...p, to: Math.min(p.to, data.prizedPositions) }))
          .map((p) => (
          <div key={p.from} className="rounded-xl bg-surface-2 p-2.5 text-center">
            <p className="text-[11px] font-bold text-muted">{p.from === p.to ? `${p.from}º` : `${p.from}º–${p.to}º`}</p>
            <p className="mt-1 flex items-center justify-center gap-1 text-sm font-semibold text-gold tabular-nums">
              <Coins className="size-3.5" />
              {nf.format(p.gold)}
            </p>
            <p className="flex items-center justify-center gap-1 text-xs text-xp tabular-nums">
              <Sparkles className="size-3" />
              {nf.format(p.xp)} XP
            </p>
            {p.exclusiveTitle && <p className="mt-1 text-[10px] font-semibold text-volt">+ título exclusivo</p>}
          </div>
        ))}
      </div>
      )}
      <p className="mt-3 text-[11px] text-subtle">
        Prêmios para a metade de cima do grupo (até o 10º). No fim da temporada o PR de todos volta para 1000 e começa uma nova disputa.
      </p>
    </Card>
  );
}

function Challenges() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data } = useChallenges();
  const [busy, setBusy] = useState<string | null>(null);
  if (!data || !user) return null;
  if (!data.received.length && !data.sent.length) return null;

  async function act(c: ChallengeDTO, action: 'accept' | 'decline' | 'cancel') {
    setBusy(c.id + action);
    try {
      const r = await api.post<{ battle?: { id: string }; prLost?: number }>(`/ranking/challenges/${c.id}/${action}`);
      qc.invalidateQueries({ queryKey: ['challenges'] });
      qc.invalidateQueries({ queryKey: ['ranking'] });
      qc.invalidateQueries({ queryKey: ['me'] });
      if (action === 'accept' && r.battle) navigate(`/luta/${r.battle.id}`);
      else
        toast(
          action === 'decline'
            ? r.prLost
              ? `Desafio recusado: −${r.prLost} PR. Você está protegido por ${BALANCE.ranking.protectionHours} h.`
              : 'Desafio recusado.'
            : 'Desafio cancelado.',
        );
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-2">
      <h3 className="px-1 text-sm font-semibold">Desafios em aberto</h3>
      {data.received.map((c) => (
        <Card key={c.id} className="border-volt/30 p-3.5">
          <div className="flex items-center gap-3">
            <Avatar user={c.challenger} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                <b>{c.challenger.username}</b> <span className="text-muted">te desafiou!</span>
              </p>
              <p className="text-xs text-subtle">
                Vencer: <b className="text-volt">+{c.stakes.defenderWins.defender} PR</b> · perder:{' '}
                <b className="text-danger">{c.stakes.challengerWins.defender} PR</b> · recusar:{' '}
                <b className="text-danger">−{c.stakes.decline} PR</b>
              </p>
              <p className="text-xs text-subtle">
                <Hourglass className="inline size-3" /> <Expires iso={c.expiresAt} /> (sem resposta = recusa)
              </p>
            </div>
          </div>
          <Button className="mt-3 w-full" size="sm" icon={<Swords className="size-4" />} onClick={() => navigate(`/desafio/${c.id}`)}>
            Responder desafio
          </Button>
        </Card>
      ))}
      {data.sent.map((c) => (
        <Card key={c.id} className="flex items-center gap-3 p-3.5">
          <Avatar user={c.defender} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">
              Aguardando <b>{c.defender.username}</b>
            </p>
            <p className="text-xs text-subtle">
              <Expires iso={c.expiresAt} />
            </p>
          </div>
          <Button variant="ghost" size="sm" loading={busy === c.id + 'cancel'} onClick={() => void act(c, 'cancel')}>
            Cancelar
          </Button>
        </Card>
      ))}
    </section>
  );
}

function Expires({ iso }: { iso: string }) {
  const left = useCountdown(iso);
  return <>expira em {left}</>;
}

interface Preview {
  winChance: number;
  ifYouWin: number;
  ifYouLose: number;
  ifTheyDecline: number;
  theyLoseOnDecline: number;
  againAt: string | null;
  sentToday: number;
  maxPerDay: number;
  opponentProtectedUntil: string | null;
  myProtectedUntil: string | null;
  pending: boolean;
}

export function ChallengeSheet({ target, onClose }: { target: ChallengeTarget | null; onClose: () => void }) {
  const qc = useQueryClient();
  const shields = useConfig().data?.shieldsEnabled ?? false;
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({
    queryKey: ['preview', target?.user.id],
    queryFn: () => api.get<Preview>(`/ranking/preview/${target!.user.id}`),
    enabled: !!target,
  });
  if (!target) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const limit = !!data && data.sentToday >= data.maxPerDay;
  const blocked = limit || !!data?.opponentProtectedUntil || !!data?.pending || !!data?.againAt;

  async function challenge() {
    setBusy(true);
    try {
      await api.post('/ranking/challenges', { defenderId: target!.user.id });
      qc.invalidateQueries({ queryKey: ['challenges'] });
      qc.invalidateQueries({ queryKey: ['ranking'] });
      qc.invalidateQueries({ queryKey: ['opponents'] });
      qc.invalidateQueries({ queryKey: ['me'] });
      toast(`Desafio enviado para ${target!.user.username}!`);
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={!!target} onClose={onClose} title={`Desafiar ${target.user.username}`}>
      <div className="flex items-center gap-3">
        <Avatar user={target.user} size={56} />
        <div>
          <p className="font-semibold">
            {target.pos ? `#${target.pos} · ` : ''}
            {nf.format(target.rankPoints)} PR
          </p>
          <p className="text-sm text-muted">Nível {target.user.level}</p>
        </div>
        <Link to={`/u/${target.user.username}`} className="ml-auto text-xs font-semibold text-volt">
          Ver perfil
        </Link>
      </div>
      {data && (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-[11px] text-muted">
            <span>Sua chance de vencer</span>
            <b className={data.winChance >= 50 ? 'text-volt' : 'text-danger'}>{data.winChance}%</b>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-volt" style={{ width: `${data.winChance}%` }} />
          </div>
        </div>
      )}
      {data ? (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-surface p-3">
            <p className="text-[11px] text-muted">Se você vencer</p>
            <p className="font-display text-2xl font-bold text-volt">+{data.ifYouWin}</p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="text-[11px] text-muted">Se você perder</p>
            <p className="font-display text-2xl font-bold text-danger">{data.ifYouLose}</p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="text-[11px] text-muted">Se recusar</p>
            <p className="font-display text-2xl font-bold text-volt">+{data.ifTheyDecline}</p>
          </div>
        </div>
      ) : (
        <Spinner className="mx-auto my-6" />
      )}
      {data?.againAt && !data.pending && <AgainNote at={data.againAt} name={target.user.username} />}
      {data?.opponentProtectedUntil && <ProtectedNote until={data.opponentProtectedUntil} name={target.user.username} />}
      {data?.myProtectedUntil && !data.opponentProtectedUntil && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-mana/10 p-3 text-xs text-mana">
          <ShieldCheck className="mt-px size-4 shrink-0" /> Você está protegido. Ao enviar este desafio, sua proteção acaba.
        </p>
      )}
      <p className="mt-3 text-xs text-subtle">
        Os pontos dependem da chance de cada um (nível, atributos, arma e PR): vencer quem é mais forte vale muito, vencer quem é mais fraco
        vale pouco. {target.user.username} tem 24 h para aceitar; se recusar ou não responder, perde {data?.theyLoseOnDecline ?? '…'} PR e você
        ganha {data?.ifTheyDecline ?? '…'}.{shields ? ` Quem perde pontos numa luta fica ${BALANCE.ranking.protectionHours} h protegido contra desafios.` : ''} Você pode enviar{' '}
        {data?.maxPerDay ?? BALANCE.ranking.maxChallengesPerDay} desafios por dia{data ? ` (hoje: ${data.sentToday})` : ''}.
      </p>
      <Button className="mt-4 w-full" size="lg" loading={busy} disabled={!data || blocked} onClick={challenge} icon={<Swords className="size-4" />}>
        {limit ? 'Limite de hoje atingido' : data?.againAt ? 'Você já desafiou hoje' : data?.pending ? 'Já existe um desafio entre vocês' : data?.opponentProtectedUntil ? 'Jogador protegido' : 'Enviar desafio'}
      </Button>
    </Sheet>
  );
}

function AgainNote({ at, name }: { at: string; name: string }) {
  const left = useCountdown(at);
  return (
    <p className="mt-3 flex items-start gap-2 rounded-xl bg-surface p-3 text-xs text-muted">
      <Hourglass className="mt-px size-4 shrink-0" /> Você já desafiou {name} hoje. Libera de novo à meia-noite (em {left}).
    </p>
  );
}

function ProtectedNote({ until, name }: { until: string; name: string }) {
  const left = useCountdown(until);
  return (
    <p className="mt-3 flex items-start gap-2 rounded-xl bg-mana/10 p-3 text-xs text-mana">
      <ShieldCheck className="mt-px size-4 shrink-0" /> {name} perdeu pontos recentemente e está protegido contra desafios por {left}.
    </p>
  );
}

function PastSeasons() {
  const { data } = useQuery({
    queryKey: ['past-seasons'],
    queryFn: () => api.get<{ seasons: { id: string; name: string; results: { pos: number; username: string; pr: number }[] | null }[] }>('/ranking/seasons'),
  });
  if (!data?.seasons.length) return null;
  return (
    <section>
      <h3 className="mb-2 px-1 text-sm font-semibold">Campeões anteriores</h3>
      <Card className="divide-y divide-line">
        {data.seasons.map((s) => {
          const champ = s.results?.[0];
          return (
            <div key={s.id} className="flex items-center gap-3 p-3 text-sm">
              <Crown className="size-4 text-gold" />
              <span className="min-w-0 flex-1 truncate text-muted">{s.name}</span>
              {champ && (
                <Link to={`/u/${champ.username}`} className="font-semibold">
                  {champ.username}
                </Link>
              )}
            </div>
          );
        })}
      </Card>
    </section>
  );
}
