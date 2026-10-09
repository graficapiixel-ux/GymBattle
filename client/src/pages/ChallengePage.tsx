import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Swords, X, Hourglass, ShieldCheck, Trophy, Eye } from 'lucide-react';
import { BALANCE, WEAPONS_BY_ID } from '@gymbattle/shared';
import { api } from '@/lib/api';
import { useAuth, useConfig } from '@/lib/auth';
import { nf } from '@/lib/format';
import { Avatar, LevelPill } from '@/components/UserChip';
import { WeaponIcon } from '@/components/AvatarCanvas';
import { Button, Card, Sheet, Spinner, toast } from '@/components/ui';
import { useCountdown, type ChallengeDTO } from './Ranking';

/**
 * Página de um desafio recebido: a pessoa vê quem desafiou e o que está em jogo
 * e escolhe aceitar ou recusar. Os botões só funcionam depois de um instante e
 * sempre pedem confirmação (evita aceitar sem querer com um toque duplo).
 */
export default function ChallengePage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [armed, setArmed] = useState(false);
  const [confirm, setConfirm] = useState<'accept' | 'decline' | null>(null);
  const shields = useConfig().data?.shieldsEnabled ?? false;
  const [busy, setBusy] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ['challenge', id],
    queryFn: () => api.get<{ challenge: ChallengeDTO }>(`/ranking/challenges/${id}`),
  });
  useEffect(() => {
    const t = setTimeout(() => setArmed(true), 900);
    return () => clearTimeout(t);
  }, []);

  if (isLoading) return <Spinner className="mx-auto mt-10" />;
  if (error || !data || !user) {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm text-muted">{(error as Error)?.message ?? 'Desafio não encontrado.'}</p>
        <Link to="/ranking" className="mt-3 inline-block text-sm font-semibold text-volt">
          Ir para o ranking
        </Link>
      </Card>
    );
  }
  const c = data.challenge;
  const received = c.defender.id === user.id;
  const other = received ? c.challenger : c.defender;
  const weapon = other.equipment.weapon ? WEAPONS_BY_ID[other.equipment.weapon] : undefined;

  async function act(action: 'accept' | 'decline') {
    setBusy(true);
    try {
      const r = await api.post<{ battle?: { id: string }; prLost?: number }>(`/ranking/challenges/${c.id}/${action}`);
      qc.invalidateQueries({ queryKey: ['challenges'] });
      qc.invalidateQueries({ queryKey: ['ranking'] });
      qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['challenge', id] });
      if (action === 'accept' && r.battle) navigate(`/luta/${r.battle.id}`, { replace: true });
      else {
        toast(r.prLost ? `Desafio recusado: −${r.prLost} PR. Você está protegido por ${BALANCE.ranking.protectionHours} h.` : 'Desafio recusado.');
        navigate('/ranking', { replace: true });
      }
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  return (
    <div className="animate-fade-up space-y-4">
      <Card className="relative overflow-hidden p-5 text-center">
        <div className="pointer-events-none absolute -top-16 left-1/2 size-56 -translate-x-1/2 rounded-full bg-volt/10 blur-3xl" />
        <div className="relative flex flex-col items-center">
          <Avatar user={other} size={84} />
          <p className="mt-3 text-lg font-semibold">
            {other.username} <LevelPill level={other.level} />
          </p>
          <p className="text-sm text-muted">
            {received ? 'te desafiou para um duelo ranqueado' : 'recebeu seu desafio'}
          </p>
          {weapon && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-xs text-muted">
              <WeaponIcon weapon={weapon} size={22} /> {weapon.name}
            </div>
          )}
          <p className="mt-2 inline-flex items-center gap-1 text-xs text-subtle">
            <Trophy className="size-3" /> #{received ? c.challengerPos : c.defenderPos} · {nf.format(received ? c.challengerPr : c.defenderPr)} PR
          </p>
        </div>
      </Card>

      {c.status === 'PENDING' ? (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stake label="Se vencer" value={`+${received ? c.stakes.defenderWins.defender : c.stakes.challengerWins.challenger}`} good />
            <Stake label="Se perder" value={`${received ? c.stakes.challengerWins.defender : c.stakes.defenderWins.challenger}`} />
            <Stake label="Se recusar" value={received ? `−${c.stakes.decline}` : `+${c.stakes.declineGain}`} good={!received} />
          </div>
          <p className="text-center text-xs text-muted">
            Sua chance de vencer: <b className="text-fg">{received ? 100 - c.stakes.challengerChance : c.stakes.challengerChance}%</b>
          </p>
          <p className="flex items-center justify-center gap-1.5 text-xs text-subtle">
            <Hourglass className="size-3.5" /> <Left iso={c.expiresAt} /> · sem resposta conta como recusa
          </p>
          {received ? (
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button variant="secondary" size="lg" disabled={!armed} icon={<X className="size-4" />} onClick={() => setConfirm('decline')}>
                Recusar
              </Button>
              <Button size="lg" disabled={!armed} icon={<Swords className="size-4" />} onClick={() => setConfirm('accept')}>
                Aceitar
              </Button>
            </div>
          ) : (
            <p className="text-center text-sm text-muted">Aguardando {other.username} responder.</p>
          )}
          <p className="text-center text-[11px] text-subtle">
            A luta é automática e ao vivo: os dois assistem até o fim.
            {shields && ` Quem perde PR na luta fica ${BALANCE.ranking.protectionHours} h protegido contra desafios.`}
          </p>
        </>
      ) : (
        <Card className="p-5 text-center">
          <p className="text-sm font-semibold">
            {c.status === 'ACCEPTED' ? 'Desafio aceito' : c.status === 'DECLINED' ? 'Desafio recusado' : c.status === 'EXPIRED' ? 'Desafio expirado' : 'Desafio cancelado'}
          </p>
          {c.battleId && (
            <Button className="mt-3" icon={<Eye className="size-4" />} onClick={() => navigate(`/luta/${c.battleId}`)}>
              Ver a luta
            </Button>
          )}
        </Card>
      )}

      <Sheet open={!!confirm} onClose={() => setConfirm(null)} title={confirm === 'accept' ? 'Aceitar o duelo?' : 'Recusar o desafio?'}>
        {confirm === 'accept' ? (
          <p className="text-sm text-muted">
            A luta contra <b className="text-fg">{other.username}</b> começa na hora e você assiste ao vivo até o fim.
          </p>
        ) : (
          <p className="text-sm text-muted">
            Você perde {c.stakes.decline} PR e {other.username} ganha {c.stakes.declineGain}. Recusar não dá proteção contra novos desafios.
          </p>
        )}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={() => setConfirm(null)}>
            Voltar
          </Button>
          <Button
            variant={confirm === 'decline' ? 'danger' : 'primary'}
            loading={busy}
            icon={confirm === 'accept' ? <Swords className="size-4" /> : undefined}
            onClick={() => confirm && void act(confirm)}
          >
            {confirm === 'accept' ? 'Lutar agora' : 'Recusar'}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function Stake({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="rounded-xl bg-surface p-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className={`font-display text-2xl font-bold ${good ? 'text-volt' : 'text-danger'}`}>{value}</p>
      <p className="text-[10px] text-subtle">PR</p>
    </div>
  );
}

function Left({ iso }: { iso: string }) {
  return <>expira em {useCountdown(iso)}</>;
}
