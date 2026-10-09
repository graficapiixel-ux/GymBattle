import { useMemo, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import clsx from 'clsx';
import { Flame, UsersRound, Search, UserPlus, Trash2, Users, Settings2, ScrollText, Flag, CalendarRange, ShieldAlert, Check, ShieldCheck, SlidersHorizontal, Sparkles, Plus, Minus, Coins, Star, Sword, Shield } from 'lucide-react';
import { ARMOR_SETS, ARMOR_SLOTS, ARMOR_SLOT_LABEL, BALANCE, REPORT_REASONS, WEAPONS, armorPieceId, type AdminReportDTO, type AdminUserDetail, type AdminUserRow, type GiftDTO } from '@gymbattle/shared';
import { UserChip } from '@/components/UserChip';
import { GroupsTab } from '@/components/AdminGroups';
import { EventsTab } from '@/components/AdminEvents';
import { timeAgo } from '@/lib/format';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Alert, Button, Card, Input, Sheet, Spinner, toast } from '@/components/ui';

const TABS = [
  { id: 'reports', label: 'Denúncias', icon: Flag },
  { id: 'users', label: 'Contas', icon: Users },
  { id: 'groups', label: 'Grupos', icon: UsersRound },
  { id: 'events', label: 'Eventos', icon: Flame },
  { id: 'settings', label: 'Ajustes', icon: Settings2 },
  { id: 'logs', label: 'Log', icon: ScrollText },
  { id: 'seasons', label: 'Temporadas', icon: CalendarRange },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState<TabId>('reports');
  if (!user?.isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="animate-fade-up">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              'inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition',
              tab === t.id ? 'border-volt/40 bg-volt/10 text-volt' : 'border-line bg-surface text-muted hover:text-fg',
            )}
          >
            <t.icon className="size-4" />
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {tab === 'reports' && <ReportsTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'groups' && <GroupsTab />}
        {tab === 'events' && <EventsTab />}
        {tab === 'settings' && <SettingsTab />}
        {tab === 'logs' && <LogsTab />}
        {tab === 'seasons' && <SeasonsTab />}
      </div>
    </div>
  );
}

function UsersTab() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<AdminUserRow | null>(null);
  const [manage, setManage] = useState<AdminUserRow | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', q],
    queryFn: () => api.get<{ total: number; users: AdminUserRow[] }>(`/admin/users?q=${encodeURIComponent(q)}`),
    placeholderData: keepPreviousData,
  });

  const del = useMutation({
    mutationFn: (id: string) => api.del(`/admin/users/${id}`),
    onSuccess: () => {
      toast('Conta excluída.');
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome ou e-mail"
            className="h-11 w-full rounded-xl border border-line-strong bg-surface pr-3 pl-10 outline-none focus:border-volt/60"
          />
        </div>
        <Button icon={<UserPlus className="size-4" />} onClick={() => setCreateOpen(true)}>
          <span className="hidden sm:inline">Nova conta</span>
        </Button>
      </div>

      <p className="text-xs text-subtle">{data ? `${data.total} conta${data.total === 1 ? '' : 's'}` : ' '}</p>

      <Card className="divide-y divide-line">
        {isLoading && (
          <div className="grid place-items-center p-8">
            <Spinner />
          </div>
        )}
        {data?.users.map((u) => (
          <div key={u.id} className="flex items-center gap-3 p-3.5">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-sm font-bold text-muted">
              {u.username.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate text-sm font-medium">
                {u.username}
                {u.role === 'ADMIN' && (
                  <span className="rounded-md bg-volt/15 px-1.5 py-0.5 text-[10px] font-bold text-volt">ADMIN</span>
                )}
              </p>
              <p className="truncate text-xs text-subtle">
                {u.email} · Nv {u.level} · {new Date(u.createdAt).toLocaleDateString('pt-BR')}
              </p>
            </div>
            <button
              onClick={() => setManage(u)}
              className="grid size-9 place-items-center rounded-lg text-subtle transition hover:bg-volt/10 hover:text-volt"
              aria-label={`Gerenciar ${u.username}`}
            >
              <SlidersHorizontal className="size-4" />
            </button>
            {u.role !== 'ADMIN' && (
              <button
                onClick={() => setToDelete(u)}
                className="grid size-9 place-items-center rounded-lg text-subtle transition hover:bg-danger/10 hover:text-danger"
                aria-label={`Excluir ${u.username}`}
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        ))}
        {data && data.users.length === 0 && <p className="p-6 text-center text-sm text-muted">Nenhuma conta encontrada.</p>}
      </Card>

      <CreateUserSheet open={createOpen} onClose={() => setCreateOpen(false)} />
      {manage && <ManageUserSheet row={manage} onClose={() => setManage(null)} />}

      <Sheet open={!!toDelete} onClose={() => setToDelete(null)} title="Excluir conta?">
        <p className="text-sm text-muted">
          A conta <b className="text-fg">{toDelete?.username}</b> ({toDelete?.email}) será apagada permanentemente, com todo o
          progresso. Essa ação não pode ser desfeita.
        </p>
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setToDelete(null)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            loading={del.isPending}
            onClick={() => toDelete && del.mutate(toDelete.id)}
            icon={<Trash2 className="size-4" />}
          >
            Excluir
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

/** Todos os itens que podem ser dados (armas e peças de armadura). */
const ALL_ITEMS: { itemId: string; name: string; kind: 'weapon' | 'armor' }[] = [
  ...WEAPONS.map((w) => ({ itemId: w.id, name: w.name, kind: 'weapon' as const })),
  ...ARMOR_SETS.flatMap((a) => ARMOR_SLOTS.map((slot) => ({ itemId: armorPieceId(a.id, slot), name: `${a.name} · ${ARMOR_SLOT_LABEL[slot]}`, kind: 'armor' as const }))),
];
const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function ManageUserSheet({ row, onClose }: { row: AdminUserRow; onClose: () => void }) {
  const qc = useQueryClient();
  const key = ['admin-user', row.id];
  const { data } = useQuery({ queryKey: key, queryFn: () => api.get<{ user: AdminUserDetail }>(`/admin/users/${row.id}`) });
  const u = data?.user;
  const [xp, setXp] = useState('');
  const [gold, setGold] = useState('');
  // com motivo → a pessoa vê o aviso grande na tela; sem → só recebe
  const [reason, setReason] = useState('');
  const why = () => reason.trim() || undefined;
  const [find, setFind] = useState('');
  const done = (msg: string) => (d: { user: AdminUserDetail }) => {
    qc.setQueryData(key, d);
    qc.invalidateQueries({ queryKey: ['admin-users'] });
    toast(msg);
  };
  const fail = (e: unknown) => toast((e as Error).message, 'error');
  const giveXp = useMutation({ mutationFn: (amount: number) => api.post<{ user: AdminUserDetail }>(`/admin/users/${row.id}/xp`, { amount, reason: amount > 0 ? why() : undefined }), onSuccess: (d, a) => { setXp(''); if (a > 0) setReason(''); done(a > 0 ? `+${a} XP` : `${a} XP`)(d); }, onError: fail });
  const giveGold = useMutation({ mutationFn: (amount: number) => api.post<{ user: AdminUserDetail }>(`/admin/users/${row.id}/gold`, { amount, reason: amount > 0 ? why() : undefined }), onSuccess: (d, a) => { setGold(''); if (a > 0) setReason(''); done(a > 0 ? `+${a} de ouro` : `${a} de ouro`)(d); }, onError: fail });
  const giveItem = useMutation({ mutationFn: (itemId: string) => api.post<{ user: AdminUserDetail }>(`/admin/users/${row.id}/items`, { itemId, reason: why() }), onSuccess: (d) => { setReason(''); done('Item entregue.')(d); }, onError: fail });
  const delPhoto = useMutation({ mutationFn: () => api.del<{ user: AdminUserDetail }>(`/admin/users/${row.id}/photo`), onSuccess: done('Foto removida.'), onError: fail });
  const takeItem = useMutation({ mutationFn: (itemId: string) => api.del<{ user: AdminUserDetail }>(`/admin/users/${row.id}/items/${encodeURIComponent(itemId)}`), onSuccess: done('Item removido.'), onError: fail });
  const legend = useMutation({
    mutationFn: (on: boolean) => api.put<{ user: AdminUserDetail }>(`/admin/users/${row.id}/legend`, { on }),
    onSuccess: (d) => done(d.user.legendNext ? 'Evento ativado para a próxima luta.' : 'Evento desativado.')(d),
    onError: fail,
  });
  const owned = new Set(u?.items.map((i) => i.itemId));
  const matches = useMemo(() => {
    const q = norm(find.trim());
    if (q.length < 2) return [];
    return ALL_ITEMS.filter((i) => norm(i.name).includes(q)).slice(0, 8);
  }, [find]);
  const num = (v: string) => Math.abs(Math.round(Number(v.replace(',', '.')))) || 0;

  return (
    <Sheet open onClose={onClose} title={`Gerenciar ${row.username}`}>
      {!u ? (
        <div className="grid place-items-center p-8"><Spinner /></div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-surface p-2.5"><p className="text-[11px] text-subtle">Nível</p><p className="font-bold">{u.level}</p></div>
            <div className="rounded-xl bg-surface p-2.5"><p className="text-[11px] text-subtle">XP</p><p className="font-bold">{u.xp}<span className="text-xs text-subtle">/{u.xpToNext}</span></p></div>
            <div className="rounded-xl bg-surface p-2.5"><p className="text-[11px] text-subtle">Ouro</p><p className="font-bold text-amber-300">{u.gold}</p></div>
          </div>

          {/* foto de perfil e CPF */}
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
            {u.photoUrl ? (
              <img src={u.photoUrl} alt="Foto de perfil" className="size-14 rounded-full object-cover" />
            ) : (
              <span className="grid size-14 place-items-center rounded-full bg-surface-2 text-[10px] text-subtle">sem foto</span>
            )}
            <div className="min-w-0 flex-1 text-sm">
              <p className={u.hasCpf ? 'text-volt' : 'text-gold'}>{u.hasCpf ? '✓ CPF confirmado' : '⚠ Ainda sem CPF'}</p>
            </div>
            {u.photoUrl && (
              <Button size="sm" variant="danger" loading={delPhoto.isPending} onClick={() => confirm('Remover a foto de perfil desta pessoa?') && delPhoto.mutate()}>
                Remover foto
              </Button>
            )}
          </div>

          {/* evento lendário */}
          <div className={clsx('rounded-2xl border p-4', u.legendNext ? 'border-volt/50 bg-volt/10' : 'border-line bg-surface')}>
            <div className="flex items-start gap-3">
              <Sparkles className={clsx('mt-0.5 size-5 shrink-0', u.legendNext ? 'text-volt' : 'text-subtle')} />
              <div className="flex-1">
                <p className="font-semibold">Evento lendário na próxima luta</p>
                <p className="mt-1 text-xs text-muted">
                  Na próxima luta dessa pessoa, num momento aleatório, ela ativa o evento da arma dela e vence na hora. Acontece uma vez só e desliga sozinho. Ninguém é avisado.
                </p>
              </div>
              <button
                role="switch"
                aria-checked={u.legendNext}
                aria-label="Evento lendário na próxima luta"
                disabled={legend.isPending}
                onClick={() => legend.mutate(!u.legendNext)}
                className={clsx('relative h-8 w-14 shrink-0 rounded-full transition', u.legendNext ? 'bg-volt' : 'bg-surface-3')}
              >
                <span className={clsx('absolute top-1 size-6 rounded-full bg-white shadow transition-all', u.legendNext ? 'left-7' : 'left-1')} />
              </button>
            </div>
            <p className={clsx('mt-3 text-xs font-medium', u.legendNext ? 'text-volt' : 'text-subtle')}>{u.legendNext ? '● Armado: acontece na próxima luta' : '● Desligado'}</p>
          </div>

          {/* motivo do presente */}
          <div className="rounded-2xl border border-gold/30 bg-gold/5 p-3">
            <label htmlFor="gift-reason" className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="size-4 text-gold" /> Motivo do presente (opcional)
            </label>
            <input
              id="gift-reason"
              value={reason}
              maxLength={200}
              onChange={(e) => setReason(e.target.value)}
              placeholder="ex.: boss de hoje"
              className="h-11 w-full rounded-xl border border-line-strong bg-surface px-3 outline-none focus:border-volt/60"
            />
            <p className="mt-1.5 text-xs text-subtle">
              {reason.trim()
                ? 'A pessoa vai ver um aviso GRANDE na tela com o presente e este motivo.'
                : 'Sem motivo: a pessoa só recebe, sem nenhum aviso.'}
            </p>
          </div>

          {/* XP */}
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Star className="size-4 text-volt" /> XP</p>
            <div className="flex gap-2">
              <input inputMode="numeric" value={xp} onChange={(e) => setXp(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Quantidade" className="h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3 outline-none focus:border-volt/60" />
              <Button variant="secondary" icon={<Minus className="size-4" />} disabled={!num(xp)} loading={giveXp.isPending && Number(giveXp.variables) < 0} onClick={() => giveXp.mutate(-num(xp))}>Tirar</Button>
              <Button icon={<Plus className="size-4" />} disabled={!num(xp)} loading={giveXp.isPending && Number(giveXp.variables) > 0} onClick={() => giveXp.mutate(num(xp))}>Dar</Button>
            </div>
            <p className="mt-1.5 text-[11px] text-subtle">Dar XP pode subir de nível. Tirar XP não baixa o nível (o XP pode ficar negativo).</p>
          </div>

          {/* Ouro */}
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Coins className="size-4 text-amber-300" /> Ouro</p>
            <div className="flex gap-2">
              <input inputMode="numeric" value={gold} onChange={(e) => setGold(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Quantidade" className="h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3 outline-none focus:border-volt/60" />
              <Button variant="secondary" icon={<Minus className="size-4" />} disabled={!num(gold)} loading={giveGold.isPending && Number(giveGold.variables) < 0} onClick={() => giveGold.mutate(-num(gold))}>Tirar</Button>
              <Button icon={<Plus className="size-4" />} disabled={!num(gold)} loading={giveGold.isPending && Number(giveGold.variables) > 0} onClick={() => giveGold.mutate(num(gold))}>Dar</Button>
            </div>
          </div>

          {/* Itens */}
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Sword className="size-4 text-volt" /> Itens</p>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" />
              <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Buscar arma ou armadura para dar" className="h-11 w-full rounded-xl border border-line-strong bg-surface pr-3 pl-10 outline-none focus:border-volt/60" />
            </div>
            {matches.length > 0 && (
              <div className="mt-2 divide-y divide-line rounded-xl border border-line">
                {matches.map((i) => (
                  <div key={i.itemId} className="flex items-center gap-2 px-3 py-2">
                    {i.kind === 'weapon' ? <Sword className="size-4 shrink-0 text-subtle" /> : <Shield className="size-4 shrink-0 text-subtle" />}
                    <span className="min-w-0 flex-1 truncate text-sm">{i.name}</span>
                    {owned.has(i.itemId) ? (
                      <span className="text-xs text-subtle">já tem</span>
                    ) : (
                      <Button size="sm" loading={giveItem.isPending && giveItem.variables === i.itemId} onClick={() => giveItem.mutate(i.itemId)}>Dar</Button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 mb-1.5 text-xs text-subtle">Itens dessa pessoa ({u.items.length})</p>
            <div className="max-h-64 divide-y divide-line overflow-y-auto rounded-xl border border-line">
              {u.items.length === 0 && <p className="p-3 text-center text-sm text-muted">Nenhum item.</p>}
              {u.items.map((i) => (
                <div key={i.itemId} className="flex items-center gap-2 px-3 py-2">
                  {i.kind === 'weapon' ? <Sword className="size-4 shrink-0 text-subtle" /> : <Shield className="size-4 shrink-0 text-subtle" />}
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {i.name}
                    {i.equipped && <span className="ml-1.5 rounded bg-volt/15 px-1 text-[10px] font-bold text-volt">EQUIPADO</span>}
                    {i.starter && <span className="ml-1.5 rounded bg-surface-3 px-1 text-[10px] text-muted">inicial</span>}
                  </span>
                  <Button size="sm" variant="secondary" loading={takeItem.isPending && takeItem.variables === i.itemId} onClick={() => takeItem.mutate(i.itemId)}>Tirar</Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function CreateUserSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ email: '', username: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => api.post('/admin/users', form),
    onSuccess: () => {
      toast('Conta criada!');
      setForm({ email: '', username: '', password: '' });
      setError(null);
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      onClose();
    },
    onError: (e) => setError((e as Error).message),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Sheet open={open} onClose={onClose} title="Criar conta">
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <Input label="E-mail" type="email" value={form.email} onChange={set('email')} autoComplete="off" />
        <Input label="Nome de usuário" value={form.username} onChange={set('username')} autoComplete="off" />
        <Input label="Senha inicial" type="text" value={form.password} onChange={set('password')} hint="Mínimo 8 caracteres. Envie para a pessoa." autoComplete="off" />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" size="lg" loading={create.isPending} className="mt-1">
          Criar conta
        </Button>
      </form>
    </Sheet>
  );
}

type SettingsState = { signupEnabled: boolean; shieldsEnabled: boolean };

function SettingsTab() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin-settings'], queryFn: () => api.get<SettingsState>('/admin/settings') });
  const save = useMutation({
    mutationFn: (patch: Partial<SettingsState>) => api.put<SettingsState>('/admin/settings', patch),
    onSuccess: (d, patch) => {
      qc.setQueryData(['admin-settings'], d);
      qc.invalidateQueries({ queryKey: ['config'] });
      qc.invalidateQueries({ queryKey: ['ranking'] });
      if (patch.signupEnabled !== undefined) toast(d.signupEnabled ? 'Cadastro público ativado.' : 'Cadastro público desativado.');
      if (patch.shieldsEnabled !== undefined) toast(d.shieldsEnabled ? 'Escudos ligados.' : 'Escudos desligados: ninguém está protegido.');
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  return (
    <div className="space-y-3">
      <ToggleCard
        title="Criação de contas pelo público"
        text="Quando desligado, a opção “Criar conta” some da tela inicial e só você cria contas por este painel."
        on={data?.signupEnabled}
        busy={save.isPending}
        onToggle={(v) => save.mutate({ signupEnabled: v })}
        onLabel="● Aberto para novos jogadores"
        offLabel="● Fechado — somente convites"
      />
      <ToggleCard
        title="Escudos (proteção de desafios)"
        text={`Ligado: quem perde PR numa luta fica ${BALANCE.ranking.protectionHours} h sem poder ser desafiado. Desligado: ninguém tem escudo (os escudos atuais somem na hora) e ninguém ganha escudo, aconteça o que acontecer.`}
        on={data?.shieldsEnabled}
        busy={save.isPending}
        onToggle={(v) => save.mutate({ shieldsEnabled: v })}
        onLabel="● Escudos ligados"
        offLabel="● Escudos desligados — ninguém fica protegido"
      />
    </div>
  );
}

function ToggleCard(p: { title: string; text: string; on: boolean | undefined; busy: boolean; onToggle: (v: boolean) => void; onLabel: string; offLabel: string }) {
  const on = p.on ?? false;
  const ready = p.on !== undefined;
  return (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <h3 className="font-semibold">{p.title}</h3>
          <p className="mt-1 text-sm text-muted">{p.text}</p>
        </div>
        <button
          role="switch"
          aria-checked={on}
          aria-label={p.title}
          disabled={!ready || p.busy}
          onClick={() => p.onToggle(!on)}
          className={clsx('relative h-8 w-14 shrink-0 rounded-full transition', on ? 'bg-volt' : 'bg-surface-3')}
        >
          <span className={clsx('absolute top-1 size-6 rounded-full bg-white shadow transition-all', on ? 'left-7' : 'left-1')} />
        </button>
      </div>
      <p className={clsx('mt-4 text-xs font-medium', on ? 'text-volt' : 'text-subtle')}>{ready ? (on ? p.onLabel : p.offLabel) : ' '}</p>
    </Card>
  );
}

const ACTION_LABEL: Record<string, string> = {
  CREATE_USER: 'Criou conta',
  DELETE_USER: 'Excluiu conta',
  TOGGLE_SIGNUP: 'Alterou cadastro público',
  TOGGLE_SHIELDS: 'Ligou/desligou os escudos',
  MARK_FAKE: 'Marcou foto como fake',
  DISMISS_REPORTS: 'Descartou denúncias',
  UPDATE_SEASON: 'Alterou a temporada',
  END_SEASON: 'Encerrou a temporada',
  ADMIN_XP: 'Alterou XP',
  ADMIN_GOLD: 'Alterou ouro',
  ADMIN_GIVE_ITEM: 'Deu item',
  ADMIN_TAKE_ITEM: 'Tirou item',
  ADMIN_LEGEND_ON: 'Ativou evento lendário',
  ADMIN_LEGEND_OFF: 'Desativou evento lendário',
};

/** Log de presentes: quem recebeu, o quê, motivo e quando. */
function GiftsLog() {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ['admin-gifts'],
    queryFn: () =>
      api.get<{ gifts: (GiftDTO & { username: string; popup: boolean; seenAt: string | null })[] }>('/admin/gifts'),
  });
  const list = data?.gifts ?? [];
  return (
    <Card className="mb-4 overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 p-3.5 text-left text-sm font-semibold">
        <Sparkles className="size-4 text-gold" /> Presentes entregues ({list.length})
        <span className="ml-auto text-xs font-normal text-subtle">{open ? 'Fechar' : 'Ver'}</span>
      </button>
      {open && (
        <div className="divide-y divide-line border-t border-line">
          {list.length === 0 && <p className="p-4 text-center text-sm text-muted">Nenhum presente ainda.</p>}
          {list.map((g) => (
            <div key={g.id} className="flex items-start gap-3 p-3.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {g.username} ·{' '}
                  <span className={g.kind === 'GOLD' ? 'text-gold' : g.kind === 'XP' ? 'text-xp' : 'text-volt'}>
                    {g.kind === 'ITEM' ? g.itemName : `${g.amount > 0 ? '+' : ''}${g.amount} ${g.kind === 'GOLD' ? 'de ouro' : 'XP'}`}
                  </span>
                  {g.source === 'EVENT' && <span className="ml-1.5 rounded bg-hp/15 px-1 text-[10px] font-bold text-hp">EVENTO</span>}
                </p>
                <p className="text-xs text-subtle">
                  {g.reason ? `Motivo: ${g.reason}` : 'Sem motivo (sem aviso)'}
                  {g.popup && (g.seenAt ? ' · aviso visto' : ' · aviso ainda não visto')}
                </p>
              </div>
              <time className="shrink-0 text-xs text-subtle">{new Date(g.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</time>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function LogsTab() {
  return (
    <>
      <GiftsLog />
      <ActionsLog />
    </>
  );
}

function ActionsLog() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-logs'],
    queryFn: () =>
      api.get<{ logs: { id: string; action: string; details: Record<string, unknown> | null; createdAt: string; actor: string | null; target: string | null }[] }>(
        '/admin/logs',
      ),
  });
  if (isLoading) return <Spinner className="mx-auto mt-8" />;
  if (!data?.logs.length) return <p className="py-10 text-center text-sm text-muted">Nenhuma ação registrada ainda.</p>;
  return (
    <Card className="divide-y divide-line">
      {data.logs.map((l) => {
        const d = l.details ?? {};
        const who = l.target ?? (d.username as string | undefined) ?? '';
        const extra =
          l.action === 'TOGGLE_SIGNUP'
            ? d.signupEnabled ? 'ativado' : 'desativado'
            : (l.action === 'ADMIN_XP' || l.action === 'ADMIN_GOLD') && d.amount !== undefined
              ? `${who} (${Number(d.amount) > 0 ? '+' : ''}${d.amount})${d.reason ? ` — motivo: ${d.reason}` : ''}`
              : l.action === 'ADMIN_GIVE_ITEM'
                ? `${who} (${d.name})${d.reason ? ` — motivo: ${d.reason}` : ''}`
            : l.action === 'MARK_FAKE'
              ? `${who} (−${d.xpRemoved} XP, −${d.goldRemoved} ouro)`
              : who;
        return (
          <div key={l.id} className="flex items-center gap-3 p-3.5 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {ACTION_LABEL[l.action] ?? l.action} {extra && <span className="text-muted">· {extra}</span>}
              </p>
              <p className="text-xs text-subtle">por {l.actor ?? '—'}</p>
            </div>
            <time className="shrink-0 text-xs text-subtle">{new Date(l.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</time>
          </div>
        );
      })}
    </Card>
  );
}

const reasonLabel = (id: string) => REPORT_REASONS.find((r) => r.id === id)?.label ?? id;

function ReportsTab() {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<AdminReportDTO | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-reports'],
    queryFn: () => api.get<{ reports: AdminReportDTO[] }>('/admin/reports'),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-reports'] });
    qc.invalidateQueries({ queryKey: ['admin-logs'] });
    qc.invalidateQueries({ queryKey: ['feed'] });
  };
  const dismiss = useMutation({
    mutationFn: (postId: string) => api.post(`/admin/reports/${postId}/dismiss`),
    onSuccess: () => {
      toast('Denúncias descartadas.');
      refresh();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const fake = useMutation({
    mutationFn: (postId: string) => api.post<{ xpRemoved: number; goldRemoved: number }>(`/admin/posts/${postId}/fake`),
    onSuccess: (r) => {
      toast(`Foto removida. −${r.xpRemoved} XP, −${r.goldRemoved} ouro.`);
      setConfirm(null);
      refresh();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  if (isLoading) return <Spinner className="mx-auto mt-8" />;
  if (!data?.reports.length)
    return (
      <div className="flex flex-col items-center gap-2 py-14 text-center">
        <ShieldCheck className="size-8 text-volt" />
        <p className="font-semibold">Nenhuma denúncia aberta</p>
        <p className="text-sm text-muted">Tudo limpo por aqui.</p>
      </div>
    );

  return (
    <div className="space-y-3">
      {data.reports.map((r) => (
        <Card key={r.post.id} className="overflow-hidden">
          <div className="flex gap-3 p-3">
            <a href={r.post.imageUrl} target="_blank" rel="noreferrer" className="block size-24 shrink-0 overflow-hidden rounded-xl bg-surface-2">
              <img src={r.post.imageUrl} alt="" className="size-full object-cover" />
            </a>
            <div className="min-w-0 flex-1">
              <UserChip user={r.post.author} sub={timeAgo(r.post.createdAt)} />
              <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
                <Flag className="size-3" /> {r.count} denúncia{r.count > 1 ? 's' : ''}
              </p>
              <ul className="mt-1.5 space-y-0.5 text-xs text-muted">
                {r.reasons.slice(0, 3).map((x, i) => (
                  <li key={i} className="truncate">
                    <b className="text-fg">{reasonLabel(x.reason)}</b>
                    {x.details && ` — ${x.details}`} <span className="text-subtle">· {x.reporter}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-line p-3">
            <Button variant="secondary" size="sm" icon={<Check className="size-4" />} loading={dismiss.isPending && dismiss.variables === r.post.id} onClick={() => dismiss.mutate(r.post.id)}>
              Foto ok
            </Button>
            <Button variant="danger" size="sm" icon={<ShieldAlert className="size-4" />} onClick={() => setConfirm(r)}>
              Marcar FAKE
            </Button>
          </div>
        </Card>
      ))}
      <Sheet open={!!confirm} onClose={() => setConfirm(null)} title="Marcar como FAKE?">
        {confirm && (
          <>
            <p className="text-sm text-muted">
              A foto será apagada. <b className="text-fg">{confirm.post.author.username}</b> perde{' '}
              <b className="text-fg">{confirm.post.xpAwarded} XP</b> e <b className="text-fg">{confirm.post.goldAwarded} de ouro</b>{' '}
              (o saldo pode ficar negativo) e a streak é zerada. Fica registrado no log.
            </p>
            <div className="mt-5 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirm(null)}>
                Cancelar
              </Button>
              <Button variant="danger" className="flex-1" loading={fake.isPending} onClick={() => fake.mutate(confirm.post.id)}>
                Marcar FAKE
              </Button>
            </div>
          </>
        )}
      </Sheet>
    </div>
  );
}

interface SeasonRow {
  id: string;
  number: number;
  name: string;
  startsAt: string;
  endsAt: string;
  status: string;
  results: { pos: number; username: string; pr: number; gold: number; xp: number }[] | null;
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}

function SeasonsTab() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin-seasons'], queryFn: () => api.get<{ current: SeasonRow; past: SeasonRow[] }>('/admin/seasons') });
  const [name, setName] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [confirm, setConfirm] = useState(false);
  const cur = data?.current;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-seasons'] });
    qc.invalidateQueries({ queryKey: ['ranking'] });
    qc.invalidateQueries({ queryKey: ['admin-logs'] });
  };
  const save = useMutation({
    mutationFn: () => api.put('/admin/seasons/current', { ...(name ? { name } : {}), ...(endsAt ? { endsAt: new Date(endsAt).toISOString() } : {}) }),
    onSuccess: () => {
      toast('Temporada atualizada.');
      setName('');
      setEndsAt('');
      refresh();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const end = useMutation({
    mutationFn: () => api.post('/admin/seasons/current/end'),
    onSuccess: () => {
      toast('Temporada encerrada e prêmios entregues!');
      setConfirm(false);
      refresh();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  if (!cur) return <Spinner className="mx-auto mt-8" />;
  return (
    <div className="space-y-3">
      <Card className="space-y-4 p-5">
        <div>
          <p className="text-xs font-semibold text-gold">Temporada atual</p>
          <h3 className="text-lg font-semibold">{cur.name}</h3>
          <p className="text-sm text-muted">
            Termina em {new Date(cur.endsAt).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })}
          </p>
        </div>
        <Input label="Novo nome (opcional)" placeholder={cur.name} value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Nova data de término" type="datetime-local" value={endsAt || toLocalInput(cur.endsAt)} onChange={(e) => setEndsAt(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="danger" onClick={() => setConfirm(true)}>
            Encerrar agora
          </Button>
          <Button loading={save.isPending} disabled={!name && !endsAt} onClick={() => save.mutate()}>
            Salvar
          </Button>
        </div>
        <p className="text-xs text-subtle">
          As temporadas são mensais e fecham sozinhas na data de término: o top 10 recebe os prêmios, o 1º ganha um título exclusivo e o
          PR de todos volta para 1000. Os valores ficam em balance.ts.
        </p>
      </Card>
      {data!.past.length > 0 && (
        <Card className="divide-y divide-line">
          {data!.past.map((s) => (
            <div key={s.id} className="p-3.5 text-sm">
              <p className="font-semibold">{s.name}</p>
              <p className="mt-0.5 text-xs text-muted">
                {(s.results ?? []).slice(0, 3).map((r) => `${r.pos}º ${r.username} (${r.pr} PR)`).join(' · ') || 'Sem participantes'}
              </p>
            </div>
          ))}
        </Card>
      )}
      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Encerrar temporada agora?">
        <p className="text-sm text-muted">
          Os prêmios do top 10 serão entregues imediatamente, o PR de todos será reduzido em direção a 1000 e uma nova temporada começa.
          Não dá para desfazer.
        </p>
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setConfirm(false)}>
            Cancelar
          </Button>
          <Button variant="danger" className="flex-1" loading={end.isPending} onClick={() => end.mutate()}>
            Encerrar
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
