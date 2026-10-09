import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Users, Crown, ShieldCheck, Link2, Copy, Share2, RefreshCw, UserPlus, LogOut, Search, Trophy, Pencil, Check, X, Lock,
  EllipsisVertical, UserMinus, ShieldOff,
} from 'lucide-react';
import type { GroupDTO, GroupInviteDTO, GroupMemberDTO, GroupRole, MeUser, PublicUser } from '@gymbattle/shared';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Alert, Button, Card, Input, Progress, Sheet, Spinner, toast } from '@/components/ui';
import { Avatar, LevelPill } from '@/components/UserChip';

interface MineResponse {
  group: GroupDTO | null;
  members: GroupMemberDTO[];
  myRole: GroupRole | null;
  invites: GroupInviteDTO[];
  inviteCode: string | null;
  pendingInvites: { id: string; user: PublicUser; createdAt: string }[];
}

export const inviteUrl = (code: string) => `${location.origin}/convite/${code}`;

export function useMyGroup() {
  return useQuery({ queryKey: ['group'], queryFn: () => api.get<MineResponse>('/groups/mine') });
}

/** Refaz tudo que depende do grupo (ranking, feed, oponentes…). */
function useRefreshAll() {
  const qc = useQueryClient();
  const { setUser } = useAuth();
  return (user?: MeUser) => {
    if (user) setUser(user);
    for (const k of ['group', 'ranking', 'feed', 'opponents', 'battles', 'challenges', 'notifications']) void qc.invalidateQueries({ queryKey: [k] });
  };
}

/**
 * Ações que colocam a pessoa num grupo: se ela já está em outro, mostra o
 * aviso "você vai sair do grupo X" e só continua se confirmar.
 */
export function useJoinWithConfirm() {
  const [ask, setAsk] = useState<{ message: string; run: () => Promise<void> } | null>(null);
  const [busy, setBusy] = useState(false);
  async function attempt(action: (confirmLeave: boolean) => Promise<void>) {
    try {
      setBusy(true);
      await action(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'ALREADY_IN_GROUP') {
        setAsk({ message: e.message, run: () => action(true) });
      } else toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }
  const sheet = (
    <Sheet open={!!ask} onClose={() => setAsk(null)} title="Trocar de grupo?">
      <p className="text-sm text-muted">{ask?.message}</p>
      <p className="mt-3 text-sm text-muted">
        Cada pessoa só pode estar em <b className="text-fg">1 grupo por vez</b>. Seus desafios pendentes do grupo atual serão cancelados.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => setAsk(null)}>
          Cancelar
        </Button>
        <Button
          variant="danger"
          loading={busy}
          onClick={async () => {
            if (!ask) return;
            setBusy(true);
            try {
              await ask.run();
              setAsk(null);
            } catch (e) {
              toast((e as Error).message, 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          Sair e entrar
        </Button>
      </div>
    </Sheet>
  );
  return { attempt, sheet, busy };
}

export function RoleBadge({ role }: { role: GroupRole }) {
  if (role === 'MEMBER') return null;
  return (
    <span
      className={clsx(
        'inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-bold',
        role === 'OWNER' ? 'bg-gold/15 text-gold' : 'bg-sky-400/15 text-sky-300',
      )}
    >
      {role === 'OWNER' ? <Crown className="size-3" /> : <ShieldCheck className="size-3" />}
      {role === 'OWNER' ? 'Criador' : 'Admin'}
    </span>
  );
}

export function TournamentBar({ group }: { group: GroupDTO }) {
  const n = group.memberCount;
  const min = group.minForTournament;
  return group.tournamentOpen ? (
    <p className="flex items-center gap-2 text-sm text-volt">
      <Trophy className="size-4" /> Torneio liberado: desafios e prêmios da temporada valendo!
    </p>
  ) : (
    <div>
      <p className="flex items-center gap-2 text-sm text-gold">
        <Lock className="size-4" /> O torneio libera com {min} pessoas — faltam {min - n}.
      </p>
      <Progress value={n} max={min} color="bg-gold" className="mt-2" />
    </div>
  );
}

// =====================================================================

export default function GroupPage() {
  const { data, isLoading } = useMyGroup();
  if (isLoading || !data) return <Spinner className="mx-auto mt-10 size-6" />;
  return data.group ? <InGroup data={data} /> : <NoGroup data={data} />;
}

function Invites({ invites }: { invites: GroupInviteDTO[] }) {
  const refresh = useRefreshAll();
  const qc = useQueryClient();
  const join = useJoinWithConfirm();
  if (!invites.length) return null;
  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <UserPlus className="size-4 text-volt" /> Convites para você
      </h2>
      <ul className="mt-3 space-y-2">
        {invites.map((i) => (
          <li key={i.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{i.group.name}</p>
              <p className="truncate text-xs text-subtle">
                {i.group.memberCount} {i.group.memberCount === 1 ? 'pessoa' : 'pessoas'}
                {i.invitedBy && <> · convite de {i.invitedBy.username}</>}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Recusar convite"
              onClick={async () => {
                await api.post(`/groups/invites/${i.id}/decline`);
                void qc.invalidateQueries({ queryKey: ['group'] });
              }}
            >
              <X className="size-4" />
            </Button>
            <Button
              size="sm"
              loading={join.busy}
              onClick={() =>
                join.attempt(async (confirmLeave) => {
                  const r = await api.post<{ user: MeUser }>(`/groups/invites/${i.id}/accept`, { confirmLeave });
                  refresh(r.user);
                  toast(`Você entrou no grupo ${i.group.name}!`);
                })
              }
            >
              Entrar
            </Button>
          </li>
        ))}
      </ul>
      {join.sheet}
    </Card>
  );
}

function NoGroup({ data }: { data: MineResponse }) {
  const refresh = useRefreshAll();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => api.post<{ user: MeUser }>('/groups', { name }),
    onSuccess: (r) => {
      refresh(r.user);
      toast('Grupo criado! Agora convide a galera.');
    },
    onError: (e) => setError((e as Error).message),
  });
  const code = link.trim().match(/([a-z0-9]{4,16})\/?$/i)?.[1];

  return (
    <div className="animate-fade-up space-y-4">
      <Card className="p-5">
        <span className="grid size-12 place-items-center rounded-2xl bg-volt/15 text-volt">
          <Users className="size-6" />
        </span>
        <h2 className="mt-3 font-display text-xl font-semibold">Você ainda não está em um grupo</h2>
        <p className="mt-1 text-sm text-muted">
          Cada grupo tem seu próprio ranking, desafios e feed — como um grupo de WhatsApp da academia. Crie o seu ou entre no de um amigo.
          Você só pode estar em 1 grupo por vez.
        </p>
      </Card>

      <Invites invites={data.invites} />

      <Card className="p-4">
        <h2 className="font-semibold">Criar um grupo</h2>
        <form
          className="mt-3 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            create.mutate();
          }}
        >
          <Input label="Nome do grupo" placeholder="ex.: Galera da Smart Fit" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={create.isPending} icon={<Users className="size-4" />}>
            Criar grupo
          </Button>
        </form>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold">Recebeu um link de convite?</h2>
        <p className="mt-1 text-sm text-muted">É só abrir o link. Ou cole ele aqui:</p>
        <div className="mt-3 flex gap-2">
          <Input placeholder="battlegym.online/convite/…" value={link} onChange={(e) => setLink(e.target.value)} className="flex-1" />
          <Button disabled={!code} onClick={() => code && navigate(`/convite/${code}`)}>
            Abrir
          </Button>
        </div>
      </Card>
    </div>
  );
}

function InGroup({ data }: { data: MineResponse }) {
  const group = data.group!;
  const { user } = useAuth();
  const refresh = useRefreshAll();
  const isAdmin = data.myRole === 'ADMIN' || data.myRole === 'OWNER';
  const isOwner = data.myRole === 'OWNER';
  const [leaving, setLeaving] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(group.name);
  const [manage, setManage] = useState<GroupMemberDTO | null>(null);

  const leave = useMutation({
    mutationFn: () => api.post<{ user: MeUser }>('/groups/mine/leave'),
    onSuccess: (r) => {
      setLeaving(false);
      refresh(r.user);
      toast('Você saiu do grupo.');
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const rename = useMutation({
    mutationFn: () => api.patch('/groups/mine', { name: newName }),
    onSuccess: () => {
      setRenaming(false);
      refresh();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  return (
    <div className="animate-fade-up space-y-4">
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-volt/15 text-volt">
            <Users className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            {renaming ? (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  rename.mutate();
                }}
              >
                <Input value={newName} maxLength={40} onChange={(e) => setNewName(e.target.value)} className="flex-1" autoFocus />
                <Button size="sm" type="submit" loading={rename.isPending} aria-label="Salvar nome">
                  <Check className="size-4" />
                </Button>
              </form>
            ) : (
              <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
                <span className="truncate">{group.name}</span>
                {isAdmin && (
                  <button onClick={() => setRenaming(true)} className="text-subtle hover:text-fg" aria-label="Mudar nome do grupo">
                    <Pencil className="size-4" />
                  </button>
                )}
              </h2>
            )}
            <p className="mt-0.5 flex items-center gap-2 text-sm text-muted">
              {group.memberCount} {group.memberCount === 1 ? 'pessoa' : 'pessoas'}
              {data.myRole && <RoleBadge role={data.myRole} />}
            </p>
          </div>
        </div>
        <div className="mt-4">
          <TournamentBar group={group} />
        </div>
      </Card>

      <Invites invites={data.invites} />

      {isAdmin && <InviteTools data={data} />}

      <Card className="p-4">
        <h2 className="font-semibold">Membros</h2>
        <ul className="mt-2 divide-y divide-line">
          {data.members.map((m) => {
            const canManage =
              isAdmin && m.id !== user?.id && m.groupRole !== 'OWNER' && (m.groupRole === 'MEMBER' || isOwner);
            return (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                <Link to={`/u/${m.username}`} className="flex min-w-0 flex-1 items-center gap-2.5">
                  <Avatar user={m} size={38} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">{m.username}</span>
                      <LevelPill level={m.level} />
                      <RoleBadge role={m.groupRole} />
                    </div>
                    <p className="text-xs text-subtle tabular-nums">{m.rankPoints.toLocaleString('pt-BR')} PR</p>
                  </div>
                </Link>
                {canManage && (
                  <button
                    onClick={() => setManage(m)}
                    className="grid size-9 place-items-center rounded-lg text-subtle hover:bg-surface-2 hover:text-fg"
                    aria-label={`Opções para ${m.username}`}
                  >
                    <EllipsisVertical className="size-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Button variant="danger" className="w-full" icon={<LogOut className="size-4" />} onClick={() => setLeaving(true)}>
        Sair do grupo
      </Button>

      <Sheet open={leaving} onClose={() => setLeaving(false)} title="Sair do grupo?">
        <p className="text-sm text-muted">
          Você vai sair de <b className="text-fg">{group.name}</b>. Seus desafios pendentes serão cancelados.
          {isOwner && group.memberCount > 1 && ' Como você é o criador, outra pessoa do grupo vira a criadora.'}
          {group.memberCount === 1 && ' Você é o único membro: o grupo será apagado.'}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setLeaving(false)}>
            Cancelar
          </Button>
          <Button variant="danger" loading={leave.isPending} onClick={() => leave.mutate()}>
            Sair
          </Button>
        </div>
      </Sheet>

      <ManageMember member={manage} isOwner={isOwner} onClose={() => setManage(null)} />
    </div>
  );
}

function ManageMember({ member, isOwner, onClose }: { member: GroupMemberDTO | null; isOwner: boolean; onClose: () => void }) {
  const refresh = useRefreshAll();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  useEffect(() => setConfirmRemove(false), [member?.id]);
  if (!member) return null;
  const run = async (key: string, fn: () => Promise<unknown>, msg: string) => {
    setBusy(key);
    try {
      await fn();
      refresh();
      toast(msg);
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };
  return (
    <Sheet open onClose={onClose} title={member.username}>
      <div className="flex flex-col gap-2">
        {member.groupRole === 'MEMBER' && (
          <Button
            variant="secondary"
            icon={<ShieldCheck className="size-4" />}
            loading={busy === 'promote'}
            onClick={() => run('promote', () => api.post(`/groups/mine/members/${member.id}/role`, { role: 'ADMIN' }), `${member.username} agora é admin do grupo.`)}
          >
            Tornar admin do grupo
          </Button>
        )}
        {member.groupRole === 'ADMIN' && isOwner && (
          <Button
            variant="secondary"
            icon={<ShieldOff className="size-4" />}
            loading={busy === 'demote'}
            onClick={() => run('demote', () => api.post(`/groups/mine/members/${member.id}/role`, { role: 'MEMBER' }), `${member.username} não é mais admin.`)}
          >
            Tirar de admin
          </Button>
        )}
        {confirmRemove ? (
          <div className="rounded-xl border border-danger/40 bg-danger/10 p-3">
            <p className="text-sm">Remover {member.username} do grupo?</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirmRemove(false)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={busy === 'remove'}
                onClick={() => run('remove', () => api.del(`/groups/mine/members/${member.id}`), `${member.username} foi removido do grupo.`)}
              >
                Remover
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="danger" icon={<UserMinus className="size-4" />} onClick={() => setConfirmRemove(true)}>
            Remover do grupo
          </Button>
        )}
      </div>
    </Sheet>
  );
}

function InviteTools({ data }: { data: MineResponse }) {
  const qc = useQueryClient();
  const [code, setCode] = useState(data.inviteCode);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setCode(data.inviteCode), [data.inviteCode]);

  const search = useQuery({
    queryKey: ['group-search', debounced],
    queryFn: () => api.get<{ users: (PublicUser & { hasGroup: boolean })[] }>(`/groups/mine/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length > 0,
  });
  const getLink = useMutation({
    mutationFn: (reset: boolean) => api.post<{ code: string }>('/groups/mine/invite-link', { reset }),
    onSuccess: (r, reset) => {
      setCode(r.code);
      if (reset) toast('Link novo criado. O antigo não funciona mais.');
    },
  });
  const invite = useMutation({
    mutationFn: (username: string) => api.post('/groups/mine/invites', { username }),
    onSuccess: (_r, username) => {
      toast(`Convite enviado para ${username}!`);
      void qc.invalidateQueries({ queryKey: ['group'] });
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const url = code ? inviteUrl(code) : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copiado!');
    } catch {
      toast(url);
    }
  };
  const share = async () => {
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: 'GymBattle', text: `Entra no meu grupo “${data.group!.name}” no GymBattle!`, url });
      } catch {
        /* cancelou */
      }
    } else void copy();
  };

  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <UserPlus className="size-4 text-volt" /> Convidar pessoas
      </h2>

      <p className="mt-3 text-sm text-muted">Link de convite — mande no WhatsApp:</p>
      {code ? (
        <>
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
            <Link2 className="size-4 shrink-0 text-subtle" />
            <span className="min-w-0 flex-1 truncate text-sm">{url}</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Button size="sm" icon={<Share2 className="size-4" />} onClick={share}>
              Enviar
            </Button>
            <Button size="sm" variant="secondary" icon={<Copy className="size-4" />} onClick={copy}>
              Copiar
            </Button>
            <Button size="sm" variant="secondary" icon={<RefreshCw className="size-4" />} loading={getLink.isPending} onClick={() => getLink.mutate(true)}>
              Novo
            </Button>
          </div>
        </>
      ) : (
        <Button className="mt-2 w-full" icon={<Link2 className="size-4" />} loading={getLink.isPending} onClick={() => getLink.mutate(false)}>
          Criar link de convite
        </Button>
      )}

      <p className="mt-5 text-sm text-muted">Ou convide pelo nome de usuário:</p>
      <div className="mt-2">
        <Input
          placeholder="Buscar jogador"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          leading={<Search className="size-4" />}
        />
      </div>
      {debounced && (
        <ul className="mt-2 space-y-1.5">
          {search.data?.users.length === 0 && <li className="px-1 text-sm text-subtle">Ninguém encontrado.</li>}
          {search.data?.users.map((u) => {
            const invited = data.pendingInvites.some((p) => p.user.id === u.id);
            return (
              <li key={u.id} className="flex items-center gap-3 rounded-xl bg-surface-2 p-2.5">
                <Avatar user={u} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{u.username}</p>
                  {u.hasGroup && <p className="text-xs text-subtle">Já está em outro grupo</p>}
                </div>
                <Button size="sm" disabled={invited} loading={invite.isPending && invite.variables === u.username} onClick={() => invite.mutate(u.username)}>
                  {invited ? 'Convidado' : 'Convidar'}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {data.pendingInvites.length > 0 && (
        <>
          <p className="mt-5 text-sm text-muted">Convites aguardando resposta:</p>
          <ul className="mt-2 space-y-1.5">
            {data.pendingInvites.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-xl bg-surface-2 p-2.5">
                <Avatar user={p.user} size={30} />
                <span className="min-w-0 flex-1 truncate text-sm">{p.user.username}</span>
                <button
                  className="text-xs text-subtle hover:text-danger"
                  onClick={async () => {
                    await api.del(`/groups/mine/invites/${p.id}`);
                    void qc.invalidateQueries({ queryKey: ['group'] });
                  }}
                >
                  Cancelar
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

// =====================================================================

/** /convite/:code — entrar no grupo pelo link. */
export function InvitePage() {
  const { code = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const refresh = useRefreshAll();
  const join = useJoinWithConfirm();
  const { data, error, isLoading } = useQuery({
    queryKey: ['invite-preview', code],
    queryFn: () => api.get<{ group: GroupDTO; myGroupId: string | null }>(`/groups/invite/${code}`),
    retry: false,
  });
  if (isLoading) return <Spinner className="mx-auto mt-10 size-6" />;
  if (error || !data) {
    return (
      <Card className="p-5 text-center">
        <p className="font-semibold">Convite inválido</p>
        <p className="mt-1 text-sm text-muted">{(error as Error)?.message ?? 'Esse link não vale mais.'}</p>
        <Link to="/grupo" className="mt-4 inline-block text-sm text-volt">
          Ver meu grupo
        </Link>
      </Card>
    );
  }
  const already = user?.groupId === data.group.id;
  return (
    <div className="animate-fade-up space-y-4">
      <Card className="p-6 text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-3xl bg-volt/15 text-volt">
          <Users className="size-8" />
        </span>
        <p className="mt-4 text-sm text-muted">Convite para o grupo</p>
        <h2 className="font-display text-2xl font-semibold">{data.group.name}</h2>
        <p className="mt-1 text-sm text-muted">
          {data.group.memberCount} {data.group.memberCount === 1 ? 'pessoa' : 'pessoas'}
        </p>
        <div className="mt-4 text-left">
          <TournamentBar group={data.group} />
        </div>
        {already ? (
          <Button className="mt-6 w-full" onClick={() => navigate('/grupo')}>
            Você já está neste grupo
          </Button>
        ) : (
          <Button
            className="mt-6 w-full"
            size="lg"
            loading={join.busy}
            icon={<Users className="size-4" />}
            onClick={() =>
              join.attempt(async (confirmLeave) => {
                const r = await api.post<{ user: MeUser }>('/groups/join', { code, confirmLeave });
                refresh(r.user);
                toast(`Bem-vindo ao grupo ${data.group.name}!`);
                navigate('/grupo');
              })
            }
          >
            Entrar no grupo
          </Button>
        )}
        {user?.groupId && !already && (
          <p className="mt-3 text-xs text-subtle">Você só pode estar em 1 grupo: ao entrar aqui, você sai do seu grupo atual.</p>
        )}
      </Card>
      {join.sheet}
    </div>
  );
}

/** Aviso para quem não tem grupo (usado no feed, arena e ranking). */
export function NoGroupCta({ children }: { children?: ReactNode }) {
  return (
    <Card className="p-5 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-volt/15 text-volt">
        <Users className="size-6" />
      </span>
      <p className="mt-3 font-semibold">Entre em um grupo</p>
      <p className="mt-1 text-sm text-muted">{children ?? 'Crie um grupo ou entre no de um amigo para disputar o ranking e lutar.'}</p>
      <Link to="/grupo" className="mt-4 inline-flex h-10 items-center rounded-xl bg-volt px-4 text-sm font-semibold text-black">
        Ir para grupos
      </Link>
    </Card>
  );
}
