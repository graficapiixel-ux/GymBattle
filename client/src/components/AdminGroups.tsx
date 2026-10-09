import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, Eye, Search, Swords, Users, Camera, UserPlus, ShieldCheck, ShieldOff, Heart, MessageCircle } from 'lucide-react';
import type { GroupDTO, GroupMemberDTO, PostDTO, PublicUser } from '@gymbattle/shared';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { Avatar, LevelPill } from './UserChip';
import { Button, Card, Input, Spinner, toast } from './ui';
import { RoleBadge, TournamentBar } from '@/pages/GroupPage';

type GroupRow = GroupDTO & { owner: PublicUser | null };

interface GroupSpy {
  group: GroupDTO & { inviteCode: string | null };
  members: GroupMemberDTO[];
  invites: { id: string; user: PublicUser; invitedBy: PublicUser | null; createdAt: string }[];
  posts: PostDTO[];
  battles: { id: string; aName: string; bName: string; winner: number | null; createdAt: string }[];
}

/** Admin do site: todos os grupos e o modo "espiar". */
export function GroupsTab() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-groups', q],
    queryFn: () => api.get<{ noGroup: number; groups: GroupRow[] }>(`/admin/groups?q=${encodeURIComponent(q)}`),
    placeholderData: keepPreviousData,
  });

  if (open) return <SpyGroup id={open} onBack={() => setOpen(null)} />;

  return (
    <div className="space-y-3">
      <Input placeholder="Buscar grupo" value={q} onChange={(e) => setQ(e.target.value)} leading={<Search className="size-4" />} />
      {data && (
        <p className="px-1 text-xs text-subtle">
          {data.groups.length} {data.groups.length === 1 ? 'grupo' : 'grupos'} · {data.noGroup} {data.noGroup === 1 ? 'pessoa' : 'pessoas'} sem grupo
        </p>
      )}
      {isLoading && <Spinner className="mx-auto" />}
      <Card className="divide-y divide-line overflow-hidden">
        {data?.groups.map((g) => (
          <button key={g.id} onClick={() => setOpen(g.id)} className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-surface-2">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-volt/12 text-volt">
              <Users className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{g.name}</p>
              <p className="truncate text-xs text-subtle">
                {g.memberCount} {g.memberCount === 1 ? 'pessoa' : 'pessoas'}
                {g.owner && <> · criador: {g.owner.username}</>} · {timeAgo(g.createdAt)}
              </p>
            </div>
            <span
              className={
                g.tournamentOpen
                  ? 'rounded-md bg-volt/12 px-1.5 py-0.5 text-[11px] font-bold text-volt'
                  : 'rounded-md bg-gold/12 px-1.5 py-0.5 text-[11px] font-bold text-gold'
              }
            >
              {g.tournamentOpen ? 'Torneio' : `${g.memberCount}/${g.minForTournament}`}
            </span>
            <Eye className="size-4 shrink-0 text-subtle" />
          </button>
        ))}
        {data && data.groups.length === 0 && <p className="p-4 text-center text-sm text-muted">Nenhum grupo.</p>}
      </Card>
    </div>
  );
}

function SpyGroup({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['admin-group', id], queryFn: () => api.get<GroupSpy>(`/admin/groups/${id}`) });

  async function setRole(m: GroupMemberDTO, role: 'ADMIN' | 'MEMBER') {
    setBusy(m.id);
    try {
      await api.post(`/admin/groups/${id}/members/${m.id}/role`, { role });
      toast(role === 'ADMIN' ? `${m.username} agora é admin do grupo.` : `${m.username} não é mais admin do grupo.`);
      void qc.invalidateQueries({ queryKey: ['admin-group', id] });
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Todos os grupos
      </button>
      {isLoading || !data ? (
        <Spinner className="mx-auto" />
      ) : (
        <>
          <Card className="p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-volt">
              <Eye className="size-3.5" /> Espiando (só você, admin do site, vê isto)
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold">{data.group.name}</h2>
            <p className="text-sm text-muted">
              {data.group.memberCount} {data.group.memberCount === 1 ? 'pessoa' : 'pessoas'} · criado {timeAgo(data.group.createdAt)}
            </p>
            <div className="mt-3">
              <TournamentBar group={data.group} />
            </div>
          </Card>

          <Section title="Membros" icon={<Users className="size-4 text-volt" />}>
            <ul className="divide-y divide-line">
              {data.members.map((m, i) => (
                <li key={m.id} className="flex items-center gap-3 py-2.5">
                  <span className="w-5 text-center text-xs font-bold text-subtle tabular-nums">{i + 1}</span>
                  <Link to={`/u/${m.username}`} className="flex min-w-0 flex-1 items-center gap-2.5">
                    <Avatar user={m} size={34} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">{m.username}</span>
                        <LevelPill level={m.level} />
                        <RoleBadge role={m.groupRole} />
                      </div>
                      <p className="text-xs text-subtle tabular-nums">{m.rankPoints.toLocaleString('pt-BR')} PR</p>
                    </div>
                  </Link>
                  {m.groupRole !== 'OWNER' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={busy === m.id}
                      onClick={() => setRole(m, m.groupRole === 'ADMIN' ? 'MEMBER' : 'ADMIN')}
                      aria-label={m.groupRole === 'ADMIN' ? `Tirar ${m.username} de admin do grupo` : `Tornar ${m.username} admin do grupo`}
                      title={m.groupRole === 'ADMIN' ? 'Tirar de admin do grupo' : 'Tornar admin do grupo'}
                    >
                      {m.groupRole === 'ADMIN' ? <ShieldOff className="size-4" /> : <ShieldCheck className="size-4" />}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Section>

          {data.invites.length > 0 && (
            <Section title="Convites pendentes" icon={<UserPlus className="size-4 text-volt" />}>
              <ul className="space-y-1.5">
                {data.invites.map((i) => (
                  <li key={i.id} className="text-sm text-muted">
                    <b className="text-fg">{i.user.username}</b>
                    {i.invitedBy && <> · por {i.invitedBy.username}</>} · {timeAgo(i.createdAt)}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Treinos (últimos 7 dias)" icon={<Camera className="size-4 text-volt" />}>
            {data.posts.length === 0 ? (
              <p className="text-sm text-muted">Nenhum treino postado.</p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {data.posts.map((p) => (
                  <Link key={p.id} to={`/p/${p.id}`} className="group relative aspect-square overflow-hidden rounded-lg bg-surface-2">
                    <img src={p.imageUrl} alt={`Treino de ${p.author.username}`} loading="lazy" className="size-full object-cover" />
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pt-4 pb-1 text-[10px] text-white">
                      <span className="block truncate font-semibold">{p.author.username}</span>
                      <span className="flex items-center gap-1.5 opacity-80">
                        <Heart className="size-2.5" /> {p.likeCount} <MessageCircle className="size-2.5" /> {p.commentCount}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Section>

          <Section title="Lutas recentes" icon={<Swords className="size-4 text-volt" />}>
            {data.battles.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma luta ainda.</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.battles.map((b) => (
                  <li key={b.id}>
                    <Link to={`/luta/${b.id}`} className="flex items-center gap-2 py-2.5 text-sm">
                      <span className={b.winner === 0 ? 'font-semibold text-volt' : ''}>{b.aName}</span>
                      <span className="text-subtle">vs</span>
                      <span className={b.winner === 1 ? 'font-semibold text-volt' : ''}>{b.bName}</span>
                      <span className="ml-auto text-xs text-subtle">{timeAgo(b.createdAt)}</span>
                      <ChevronRight className="size-4 text-subtle" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <h3 className="mb-2 flex items-center gap-2 font-semibold">
        {icon}
        {title}
      </h3>
      {children}
    </Card>
  );
}
