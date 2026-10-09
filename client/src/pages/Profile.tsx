import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Coins, Flame, LogOut, Minus, Plus, RotateCcw, Shield, Trophy, ChevronRight, Heart, Zap, Droplet, KeyRound,
} from 'lucide-react';
import {
  ATTRIBUTES, ATTRIBUTE_LABELS, BALANCE, WEAPONS, derivedStats, isWeaponRevealed, type AttributeKey, type MeUser,
} from '@gymbattle/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { InstallButton } from '@/components/InstallButton';
import { PhotoGrid } from './UserProfile';
import { Avatar } from '@/components/UserChip';
import { CpfCard, PhotoCard } from '@/components/ProfileExtras';
import type { ProfileDTO } from '@gymbattle/shared';
import { Alert, Button, Card, Input, Progress, Sheet, toast } from '@/components/ui';

export default function Profile() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <div className="animate-fade-up space-y-4">
      <ProfileHeader user={user} />
      {!user.hasCpf && <CpfCard user={user} />}
      <PhotoCard user={user} />
      <div className="grid grid-cols-3 gap-3">
        <Stat icon={<Coins className="size-4 text-gold" />} label="Ouro" value={user.gold} negative={user.gold < 0} />
        <Stat icon={<Flame className="size-4 text-orange-400" />} label="Streak" value={`${user.streak} d`} />
        <Stat icon={<Trophy className="size-4 text-xp" />} label="Ranking" value={`${user.rankPoints} PR`} />
      </div>
      <AttributesCard user={user} />
      <MyPhotos username={user.username} />
      {user.isAdmin && (
        <Link to="/admin">
          <Card className="flex items-center gap-3 p-4 transition hover:bg-surface-2">
            <span className="grid size-10 place-items-center rounded-xl bg-volt/10">
              <Shield className="size-5 text-volt" />
            </span>
            <div>
              <p className="font-semibold">Painel admin</p>
              <p className="text-xs text-muted">Contas, cadastro e moderação</p>
            </div>
            <ChevronRight className="ml-auto size-5 text-subtle" />
          </Card>
        </Link>
      )}
      {user.hasCpf && <CpfCard user={user} />}
      <PasswordCard />
      <div className="grid gap-2 pt-2 sm:grid-cols-2">
        <InstallButton className="w-full" />
        <Button variant="ghost" className="w-full" icon={<LogOut className="size-4" />} onClick={() => void logout()}>
          Sair
        </Button>
      </div>
      <button
        onClick={() => {
          if (confirm('Sair desta conta em TODOS os aparelhos (celular, computador...)?')) void logout(true);
        }}
        className="mx-auto block text-xs text-subtle underline-offset-2 hover:text-muted hover:underline"
      >
        Sair de todos os aparelhos
      </button>
    </div>
  );
}

function ProfileHeader({ user }: { user: MeUser }) {
  return (
    <Card className="relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-volt/10 blur-3xl" />
      <div className="flex items-center gap-4">
        <Avatar user={user} size={64} />
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold">{user.username}</h2>
          <p className="text-sm text-muted">{user.title ?? 'Recruta'}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs text-subtle">Nível</p>
          <p className="font-display text-3xl font-bold leading-none text-volt">{user.level}</p>
        </div>
      </div>
      <div className="mt-5">
        <div className="mb-1.5 flex justify-between text-xs">
          <span className="text-muted">XP</span>
          <span className={clsx('tabular-nums', user.xp < 0 ? 'text-danger' : 'text-muted')}>
            {user.xp} / {user.xpToNext}
          </span>
        </div>
        <Progress value={user.xp} max={user.xpToNext} color="bg-xp" />
      </div>
    </Card>
  );
}

function Stat({ icon, label, value, negative }: { icon: React.ReactNode; label: string; value: React.ReactNode; negative?: boolean }) {
  return (
    <Card className="p-3.5">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        {icon}
        {label}
      </div>
      <p className={clsx('mt-1.5 font-display text-lg font-semibold tabular-nums', negative && 'text-danger')}>{value}</p>
    </Card>
  );
}

function AttributesCard({ user }: { user: MeUser }) {
  const { setUser } = useAuth();
  const empty = useMemo(() => Object.fromEntries(ATTRIBUTES.map((k) => [k, 0])) as Record<AttributeKey, number>, []);
  const [pending, setPending] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [respecOpen, setRespecOpen] = useState(false);

  const used = ATTRIBUTES.reduce((s, k) => s + pending[k], 0);
  const remaining = user.attrPoints - used;
  const preview = Object.fromEntries(ATTRIBUTES.map((k) => [k, user.attributes[k] + pending[k]])) as Record<AttributeKey, number>;
  const stats = derivedStats(preview);
  const spent = ATTRIBUTES.reduce((s, k) => s + user.attributes[k] - BALANCE.attributes.start, 0);

  const change = (k: AttributeKey, d: number) => setPending((p) => ({ ...p, [k]: Math.max(0, p[k] + d) }));

  async function save() {
    setSaving(true);
    try {
      const before = WEAPONS.filter((w) => isWeaponRevealed(w, user.attributes)).length;
      const { user: u } = await api.post<{ user: MeUser }>('/me/attributes', pending);
      const after = WEAPONS.filter((w) => isWeaponRevealed(w, u.attributes)).length;
      setUser(u);
      setPending(empty);
      toast(after > before ? `${after - before} nova${after - before > 1 ? 's armas apareceram' : ' arma apareceu'} na loja!` : 'Atributos atualizados!');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Atributos</h3>
          <p className="text-xs text-muted">
            {user.attrPoints > 0 ? (
              <>
                <span className="font-semibold text-volt">{remaining}</span> ponto{remaining === 1 ? '' : 's'} para distribuir
              </>
            ) : (
              `Ganhe 1 ponto a cada nível · máx. ${BALANCE.attributes.max}`
            )}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={<RotateCcw className="size-3.5" />}
          onClick={() => setRespecOpen(true)}
          disabled={spent <= 0}
          title="Redistribuir pontos"
        >
          Redistribuir
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <MiniStat icon={<Heart className="size-3.5 text-hp" />} label="Vida" value={stats.maxHp} />
        <MiniStat icon={<Zap className="size-3.5 text-stamina" />} label="Stamina" value={stats.maxStamina} />
        <MiniStat icon={<Droplet className="size-3.5 text-mana" />} label="Mana" value={stats.maxMana} />
      </div>

      <ul className="mt-4 divide-y divide-line">
        {ATTRIBUTES.map((k) => {
          const info = ATTRIBUTE_LABELS[k];
          const v = preview[k];
          return (
            <li key={k} className="flex items-center gap-3 py-2.5">
              <span className="w-11 shrink-0 rounded-md bg-surface-2 py-1 text-center text-[11px] font-bold tracking-wide text-muted">
                {info.short}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{info.name}</p>
                <p className="truncate text-xs text-subtle">{info.desc}</p>
              </div>
              {user.attrPoints > 0 && (
                <button
                  onClick={() => change(k, -1)}
                  disabled={pending[k] === 0}
                  className="grid size-8 place-items-center rounded-lg bg-surface-2 text-muted disabled:opacity-30"
                  aria-label={`Remover ponto de ${info.name}`}
                >
                  <Minus className="size-4" />
                </button>
              )}
              <span className={clsx('w-7 text-center font-display text-lg font-semibold tabular-nums', pending[k] > 0 && 'text-volt')}>
                {v}
              </span>
              {user.attrPoints > 0 && (
                <button
                  onClick={() => change(k, +1)}
                  disabled={remaining <= 0 || v >= BALANCE.attributes.max}
                  className="grid size-8 place-items-center rounded-lg bg-volt/15 text-volt disabled:opacity-30"
                  aria-label={`Adicionar ponto em ${info.name}`}
                >
                  <Plus className="size-4" />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {used > 0 && (
        <div className="mt-3 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => setPending(empty)}>
            Cancelar
          </Button>
          <Button className="flex-1" loading={saving} onClick={save}>
            Confirmar {used} ponto{used === 1 ? '' : 's'}
          </Button>
        </div>
      )}

      <RespecSheet open={respecOpen} onClose={() => setRespecOpen(false)} spent={spent} />
    </Card>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl bg-surface-2 px-2 py-2.5">
      <div className="flex items-center justify-center gap-1 text-[11px] text-muted">
        {icon}
        {label}
      </div>
      <p className="mt-0.5 font-display font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function RespecSheet({ open, onClose, spent }: { open: boolean; onClose: () => void; spent: number }) {
  const { user, setUser } = useAuth();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const { data } = useQuery({
    queryKey: ['respec', user?.level, user?.gold],
    queryFn: () => api.get<{ cost: number; spentPoints: number; availableAt: string | null }>('/me/respec'),
    enabled: open,
  });
  const cost = data?.cost ?? 0;
  const canAfford = (user?.gold ?? 0) >= cost;

  async function confirm() {
    setLoading(true);
    try {
      const r = await api.post<{ user: MeUser; refunded: number }>('/me/respec');
      setUser(r.user);
      qc.invalidateQueries({ queryKey: ['respec'] });
      toast(`${r.refunded} pontos devolvidos. Redistribua!`);
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Redistribuir pontos">
      <p className="text-sm text-muted">
        Todos os atributos voltam para {BALANCE.attributes.start} e você recebe de volta os{' '}
        <b className="text-fg">{spent} pontos</b> gastos para distribuir como quiser.
      </p>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-surface p-4">
        <span className="text-sm text-muted">Custo</span>
        {data ? (
          <span className="flex items-center gap-1.5 font-display text-xl font-semibold">
            {cost === 0 ? (
              <span className="text-volt">Grátis</span>
            ) : (
              <>
                <Coins className="size-5 text-gold" /> {cost}
              </>
            )}
          </span>
        ) : (
          <span className="text-sm text-subtle">…</span>
        )}
      </div>
      <p className="mt-2 text-xs text-subtle">
        A primeira é grátis. Depois custa {BALANCE.attributes.respec.baseGold} + {BALANCE.attributes.respec.goldPerLevel} × nível
        (máx. {BALANCE.attributes.respec.maxGold}). Uma vez a cada {BALANCE.attributes.respec.cooldownHours} h.
      </p>
      {data?.availableAt && (
        <div className="mt-3">
          <Alert tone="info">Disponível de novo em {new Date(data.availableAt).toLocaleString('pt-BR')}.</Alert>
        </div>
      )}
      {data && !canAfford && !data.availableAt && (
        <div className="mt-3">
          <Alert>Ouro insuficiente.</Alert>
        </div>
      )}
      <Button
        className="mt-5 w-full"
        size="lg"
        loading={loading}
        disabled={!data || !canAfford || !!data.availableAt}
        onClick={confirm}
        icon={<RotateCcw className="size-4" />}
      >
        Redistribuir
      </Button>
    </Sheet>
  );
}

function MyPhotos({ username }: { username: string }) {
  const { data } = useQuery({
    queryKey: ['profile', username],
    queryFn: () => api.get<ProfileDTO>(`/users/${encodeURIComponent(username)}`),
  });
  if (!data) return null;
  return <PhotoGrid posts={data.posts} />;
}

function PasswordCard() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await api.post('/me/password', { current, next });
      toast('Senha alterada!');
      setOpen(false);
      setCurrent('');
      setNext('');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant="secondary" className="w-full" icon={<KeyRound className="size-4" />} onClick={() => setOpen(true)}>
        Trocar senha
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Trocar senha">
        <div className="flex flex-col gap-3.5">
          <Input label="Senha atual" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          <Input label="Nova senha" type="password" autoComplete="new-password" hint="Mínimo 8 caracteres" value={next} onChange={(e) => setNext(e.target.value)} />
          <Button size="lg" loading={busy} disabled={!current || next.length < 8} onClick={save}>
            Salvar nova senha
          </Button>
        </div>
      </Sheet>
    </>
  );
}
