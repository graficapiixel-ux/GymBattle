/**
 * Eventos na Arena (só aparecem quando há evento ATIVO): Boss, PvP em equipes e
 * Waves, cada um numa sub-aba. Arte animada, contador, tentativas, time,
 * espólio e (PvP) a busca por adversário. Nunca mostra chance de vitória.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Clock, Swords, Users, Gift, UserPlus, X, Check, LogOut, Search, History, Flame, Skull, Crown, Loader2 } from 'lucide-react';
import type { BossEventPublic, BossRunDTO, EventKind } from '@gymbattle/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { loadBossKit } from '@/lib/bosskit';
import { AvatarBust } from './AvatarCanvas';
import { Button, Input, toast } from './ui';

type EventsData = { events: BossEventPublic[]; serverNow: string };

export function useBossEvents() {
  return useQuery({
    queryKey: ['boss-events'],
    queryFn: () => api.get<EventsData>('/events/active'),
    // time na fila do PvP: atualiza mais rápido para abrir a luta assim que sair
    refetchInterval: (q) => (q.state.data?.events.some((e) => e.run?.status === 'QUEUED') ? 5_000 : 30_000),
    refetchOnWindowFocus: true,
  });
}

const KINDS: { id: EventKind; label: string; short: string; q: string; icon: typeof Flame }[] = [
  { id: 'BOSS', label: 'Boss', short: 'Boss', q: 'boss', icon: Flame },
  { id: 'PVP', label: 'PvP em equipes', short: 'PvP', q: 'pvp', icon: Swords },
  { id: 'WAVES', label: 'Waves', short: 'Waves', q: 'waves', icon: Skull },
];

/** Os eventos da Arena. Sem nenhum ativo, não aparece nada. */
export function BossEvents() {
  const [params, setParams] = useSearchParams();
  const { data } = useBossEvents();
  const events = data?.events ?? [];
  const byKind = useMemo(() => Object.fromEntries(KINDS.map((k) => [k.id, events.filter((e) => e.kind === k.id)])) as Record<EventKind, BossEventPublic[]>, [events]);
  const fromUrl = KINDS.find((k) => k.q === params.get('evento'))?.id;
  const first = KINDS.find((k) => byKind[k.id].length)?.id ?? 'BOSS';
  const [tab, setTab] = useState<EventKind | null>(null);
  const cur = tab ?? (fromUrl && byKind[fromUrl].length ? fromUrl : first);
  if (!events.length) return null;
  const list = byKind[cur];
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Flame className="size-4 animate-pulse text-hp" />
        <h2 className="font-display text-lg font-black tracking-tight">Eventos</h2>
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface p-1">
        {KINDS.map((k) => {
          const n = byKind[k.id].length;
          return (
            <button
              key={k.id}
              onClick={() => {
                setTab(k.id);
                if (params.get('evento')) {
                  params.delete('evento');
                  setParams(params, { replace: true });
                }
              }}
              className={clsx(
                'relative flex h-10 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition sm:text-sm',
                cur === k.id ? 'bg-surface-3 text-fg' : 'text-subtle',
              )}
            >
              <k.icon className="size-4" />
              <span className="sm:hidden">{k.short}</span>
              <span className="hidden sm:inline">{k.label}</span>
              {n > 0 && <span className="absolute top-1.5 right-1.5 size-2 animate-pulse rounded-full bg-hp" />}
            </button>
          );
        })}
      </div>
      {list.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface p-6 text-center text-sm text-muted">
          Nenhum evento de {KINDS.find((k) => k.id === cur)!.label} agora. Fique de olho nas notificações!
        </p>
      ) : (
        <div className="space-y-4">
          {list.map((ev) => (
            <EventCard key={ev.id} ev={ev} />
          ))}
        </div>
      )}
    </section>
  );
}

function useCountdown(iso: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, Date.parse(iso) - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return { ms, text: h > 0 ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s` : `${m}m ${String(s).padStart(2, '0')}s` };
}

/** Arte animada do evento (desenhada pelo kit protegido). */
function EventArt({ ev, className }: { ev: BossEventPublic; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let stop: (() => void) | null = null;
    let alive = true;
    loadBossKit()
      .then((kit) => {
        if (!alive || !ref.current) return;
        if (ev.kind === 'BOSS' && ev.boss) stop = kit.mountPortrait(ref.current, ev.boss);
        else stop = kit.mountTeamPortrait(ref.current, ev.kind === 'WAVES' ? ev.theme : null);
      })
      .catch(() => {});
    return () => {
      alive = false;
      stop?.();
    };
  }, [ev.kind, ev.boss, ev.theme]);
  return <canvas ref={ref} className={className} role="img" aria-label={titleOf(ev)} />;
}

function titleOf(ev: BossEventPublic) {
  if (ev.kind === 'BOSS') return ev.boss?.name ?? 'Boss';
  if (ev.kind === 'WAVES') return ev.theme?.name ?? 'Waves';
  return 'PvP em equipes';
}

/** Para onde vai a tela da luta. */
export const fightUrl = (kind: EventKind, runId: string) => (kind === 'BOSS' ? `/chefe/${runId}` : `/evento/${runId}`);

function EventCard({ ev }: { ev: BossEventPublic }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const left = useCountdown(ev.endsAt);
  const [busy, setBusy] = useState<string | null>(null);
  const glow = ev.kind === 'BOSS' ? (ev.boss?.pal.glow ?? '#ff5a5f') : ev.kind === 'WAVES' ? (ev.theme?.chief.aura ?? '#b05aff') : '#ffd24a';
  const accent = ev.kind === 'BOSS' ? (ev.boss?.pal.accent ?? '#ffd24a') : ev.kind === 'WAVES' ? (ev.theme?.bg.particle ?? '#ffffff') : '#ffd24a';

  // o evento acabou: o card some
  useEffect(() => {
    if (left.ms <= 0) void qc.invalidateQueries({ queryKey: ['boss-events'] });
  }, [left.ms, qc]);

  // PvP: meu time estava na fila e a luta saiu → abre a luta
  const queuedId = useRef<string | null>(null);
  useEffect(() => {
    if (ev.run?.status === 'QUEUED') queuedId.current = ev.run.id;
    else if (queuedId.current && ev.history.some((h) => h.runId === queuedId.current)) {
      const id = queuedId.current;
      queuedId.current = null;
      toast('Adversário encontrado! A luta começou.');
      navigate(fightUrl('PVP', id));
    }
  }, [ev.run, ev.history, navigate]);

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };
  const update = (r: { event: BossEventPublic }) =>
    qc.setQueryData<EventsData>(['boss-events'], (d) => (d ? { ...d, events: d.events.map((e) => (e.id === r.event.id ? r.event : e)) } : d));

  const startRun = () => act('run', async () => update(await api.post<{ event: BossEventPublic }>(`/events/${ev.id}/run`)));
  const fight = (runId: string) =>
    act('fight', async () => {
      const r = await api.post<{ runId: string }>(`/events/runs/${runId}/fight`);
      void qc.invalidateQueries({ queryKey: ['boss-events'] });
      navigate(fightUrl(ev.kind, r.runId));
    });
  const queue = (runId: string) =>
    act('fight', async () => {
      const r = await api.post<{ matched: boolean; runId: string; event: BossEventPublic }>(`/events/runs/${runId}/queue`);
      update(r);
      if (r.matched) {
        void qc.invalidateQueries({ queryKey: ['boss-events'] });
        navigate(fightUrl('PVP', r.runId));
      } else toast('Procurando adversário… avisamos quando a luta começar.');
    });
  const solo = () =>
    act('fight', async () => {
      const r = await api.post<{ event: BossEventPublic }>(`/events/${ev.id}/run`);
      const runId = r.event.run!.id;
      if (ev.kind === 'PVP') {
        const q = await api.post<{ matched: boolean; runId: string; event: BossEventPublic }>(`/events/runs/${runId}/queue`);
        update(q);
        if (q.matched) navigate(fightUrl('PVP', q.runId));
        else toast('Procurando adversário… avisamos quando a luta começar.');
        return;
      }
      const f = await api.post<{ runId: string }>(`/events/runs/${runId}/fight`);
      void qc.invalidateQueries({ queryKey: ['boss-events'] });
      navigate(fightUrl(ev.kind, f.runId));
    });

  const subtitle = ev.kind === 'BOSS' ? ev.boss?.title : ev.kind === 'WAVES' ? `Comandadas por ${ev.theme?.chief.name} ${ev.theme?.chief.title}` : `Times de até ${ev.teamSize} · lute com seus atributos`;
  const lore =
    ev.kind === 'BOSS'
      ? ev.boss?.lore
      : ev.kind === 'WAVES'
        ? `${ev.theme?.desc} Sobreviva a 10 waves de monstros e derrote o mini-chefe.`
        : 'Monte seu time, procure adversários e vença na força: atributos, armas e estratégia decidem.';
  const soloLabel = ev.kind === 'PVP' ? 'PROCURAR ADVERSÁRIO' : ev.kind === 'WAVES' ? 'ENFRENTAR AS HORDAS!' : 'ENFRENTAR!';
  const lootNote =
    ev.kind === 'PVP'
      ? 'Cada um do time vencedor ganha o espólio inteiro.'
      : ev.teamSize > 1
        ? 'Se vencer, CADA um do time ganha o espólio inteiro.'
        : null;

  return (
    <div className="boss-card relative overflow-hidden rounded-3xl p-[2px]" style={{ ['--boss-glow' as string]: glow }}>
      <div className="boss-card-border pointer-events-none absolute inset-[-60%]" aria-hidden />
      <div className="relative overflow-hidden rounded-[22px] bg-[#07060a]">
        <div className="relative">
          <EventArt ev={ev} className="block h-56 w-full sm:h-64" />
          <div className="boss-sparks pointer-events-none absolute inset-0" aria-hidden />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#07060a] via-transparent to-black/40" />
          <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-black uppercase tracking-widest text-white backdrop-blur">
            {ev.kind === 'PVP' ? <Swords className="size-3.5" style={{ color: glow }} /> : ev.kind === 'WAVES' ? <Skull className="size-3.5" style={{ color: glow }} /> : <Flame className="size-3.5 animate-pulse" style={{ color: glow }} />}
            {ev.kind === 'PVP' ? 'PvP em equipes' : ev.kind === 'WAVES' ? 'Waves' : 'Evento'}
          </div>
          <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold tabular-nums text-white backdrop-blur">
            <Clock className="size-3.5" /> {left.text}
          </div>
          <div className="absolute inset-x-0 bottom-0 px-4 pb-2">
            <h2 className="font-display text-2xl font-black leading-tight text-white" style={{ textShadow: `0 0 18px ${glow}` }}>
              {titleOf(ev)}
            </h2>
            <p className="text-sm font-semibold" style={{ color: accent }}>
              {subtitle}
            </p>
          </div>
        </div>

        <div className="space-y-3 px-4 pt-2 pb-4">
          <p className="text-sm italic text-white/70">“{lore}”</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Tentativas" value={`${ev.attemptsLeft}/${ev.attempts}`} />
            <Stat label="Time" value={ev.teamSize === 1 ? 'Solo' : `até ${ev.teamSize}`} />
            {ev.kind === 'BOSS' && <Stat label="Ataques" value={String(ev.boss?.attacks.length ?? '?')} />}
            {ev.kind === 'WAVES' && <Stat label="Waves" value="10 + chefe" />}
            {ev.kind === 'PVP' && <Stat label="Adversário" value="Outro time" />}
          </div>
          <div className="flex items-start gap-2.5 rounded-2xl border border-amber-300/25 bg-amber-300/8 p-3">
            <Gift className="mt-0.5 size-4 shrink-0 text-amber-300" />
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-amber-200">Espólio</p>
              <p className="text-white/80">{ev.lootText}</p>
              {lootNote && <p className="mt-0.5 text-xs text-white/50">{lootNote}</p>}
            </div>
          </div>

          {ev.invites.map((inv) => (
            <InviteRow key={inv.id} run={inv} busy={busy} act={act} update={update} />
          ))}

          {ev.run ? (
            <RunPanel ev={ev} run={ev.run} me={user!.id} busy={busy} act={act} update={update} fight={ev.kind === 'PVP' ? queue : fight} />
          ) : ev.attemptsLeft <= 0 ? (
            <p className="rounded-xl bg-white/5 p-3 text-center text-sm text-white/60">Você já usou todas as suas tentativas neste evento.</p>
          ) : ev.teamSize === 1 ? (
            <Button size="lg" className="boss-cta w-full" loading={busy === 'fight'} icon={ev.kind === 'PVP' ? <Search className="size-5" /> : <Swords className="size-5" />} onClick={solo}>
              {soloLabel}
            </Button>
          ) : (
            <div className="grid gap-2">
              <Button size="lg" className="boss-cta w-full" loading={busy === 'run'} icon={<Users className="size-5" />} onClick={startRun}>
                {ev.kind === 'PVP' ? 'Montar time' : 'Montar time e enfrentar'}
              </Button>
              <Button variant="secondary" loading={busy === 'fight'} icon={ev.kind === 'PVP' ? <Search className="size-4" /> : <Swords className="size-4" />} onClick={solo}>
                {ev.kind === 'PVP' ? 'Procurar adversário sozinho' : 'Ir sozinho'}
              </Button>
            </div>
          )}

          {ev.history.length > 0 && (
            <div className="pt-1">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-white/50">
                <History className="size-3.5" /> Suas lutas
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ev.history.map((h) => (
                  <button
                    key={h.runId}
                    onClick={() => navigate(fightUrl(ev.kind, h.runId))}
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${h.won ? 'bg-amber-300/15 text-amber-200' : 'bg-white/8 text-white/60'}`}
                  >
                    {h.won === null ? 'Empate' : h.won ? 'Vitória' : 'Derrota'}
                    {h.vs ? ` vs ${h.vs}` : ''}
                    {ev.kind === 'WAVES' && !h.won && h.reached ? ` · wave ${Math.min(10, h.reached)}${h.reached > 10 ? ' + chefe' : ''}` : ''} · assistir
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/6 px-2 py-2">
      <p className="font-display text-base font-bold text-white tabular-nums">{value}</p>
      <p className="text-[11px] text-white/50">{label}</p>
    </div>
  );
}

type Act = (key: string, fn: () => Promise<unknown>) => Promise<void>;
type Upd = (r: { event: BossEventPublic }) => void;

function InviteRow({ run, busy, act, update }: { run: BossRunDTO; busy: string | null; act: Act; update: Upd }) {
  const leader = run.members.find((m) => m.id === run.leaderId);
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
      <UserPlus className="size-5 shrink-0 text-volt" />
      <p className="min-w-0 flex-1 text-sm text-white">
        <b>{leader?.username}</b> te chamou para o time
      </p>
      <button
        aria-label="Recusar"
        className="grid size-9 place-items-center rounded-full bg-white/10 text-white"
        onClick={() => act('decline' + run.id, async () => update(await api.post(`/events/runs/${run.id}/leave`)))}
      >
        <X className="size-4" />
      </button>
      <Button size="sm" loading={busy === 'accept' + run.id} onClick={() => act('accept' + run.id, async () => update(await api.post(`/events/runs/${run.id}/accept`)))}>
        Entrar
      </Button>
    </div>
  );
}

function RunPanel({ ev, run, me, busy, act, update, fight }: { ev: BossEventPublic; run: BossRunDTO; me: string; busy: string | null; act: Act; update: Upd; fight: (id: string) => void }) {
  const leader = run.leaderId === me;
  const queued = run.status === 'QUEUED';
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ id: string; username: string; level: number; attemptsLeft: number; sameGroup: boolean }[]>([]);
  useEffect(() => {
    if (!leader || queued || !q.trim()) return setResults([]);
    const t = setTimeout(() => {
      api
        .get<{ users: typeof results }>(`/events/${ev.id}/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => setResults(r.users.sort((a, b) => Number(b.sameGroup) - Number(a.sameGroup))))
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q, leader, queued, ev.id]);
  const accepted = run.members.filter((m) => m.accepted);
  const full = run.members.length >= ev.teamSize;
  const cta = ev.kind === 'PVP' ? 'PROCURAR ADVERSÁRIO' : ev.kind === 'WAVES' ? 'ENFRENTAR AS HORDAS!' : 'LUTAR!';
  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-white">
        <Users className="size-4 text-volt" /> Seu time ({accepted.length}/{ev.teamSize})
        {leader && <Crown className="size-3.5 text-amber-300" aria-label="Você é o líder" />}
      </p>
      <ul className="grid grid-cols-2 gap-2">
        {run.members.map((m) => (
          <li key={m.id} className="flex items-center gap-2 rounded-xl bg-black/30 p-2">
            <span className="block size-8 shrink-0 overflow-hidden rounded-full bg-white/10">
              <AvatarBust look={m.avatar} equipment={m.equipment} size={32} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{m.username}</p>
              <p className="text-[10px] text-white/50">{m.accepted ? (m.id === run.leaderId ? 'Líder' : 'Pronto') : 'Convidado…'}</p>
            </div>
            {leader && !queued && m.id !== me && (
              <button
                aria-label={`Tirar ${m.username}`}
                className="text-white/40 hover:text-white"
                onClick={() => act('kick' + m.id, async () => update(await api.post(`/events/runs/${run.id}/leave`, { userId: m.id })))}
              >
                <X className="size-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {leader && !full && !queued && (
        <div>
          <Input placeholder="Convidar jogador pelo nome" value={q} onChange={(e) => setQ(e.target.value)} leading={<Search className="size-4" />} />
          {results.length > 0 && (
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
              {results.map((u) => (
                <li key={u.id} className="flex items-center gap-2 rounded-xl bg-black/30 px-3 py-2 text-sm text-white">
                  <span className="min-w-0 flex-1 truncate">
                    {u.username} <span className="text-xs text-white/40">Nv {u.level}{u.sameGroup ? ' · seu grupo' : ''}</span>
                  </span>
                  {u.attemptsLeft > 0 ? (
                    <Button
                      size="sm"
                      loading={busy === 'inv' + u.id}
                      onClick={() =>
                        act('inv' + u.id, async () => {
                          update(await api.post(`/events/runs/${run.id}/invite`, { username: u.username }));
                          toast(`Convite enviado para ${u.username}!`);
                          setQ('');
                        })
                      }
                    >
                      Convidar
                    </Button>
                  ) : (
                    <span className="text-xs text-white/40">sem tentativas</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {queued ? (
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2 rounded-xl bg-amber-300/10 p-3 text-sm font-semibold text-amber-200">
            <Loader2 className="size-4 animate-spin" /> Procurando adversário…
          </div>
          <p className="text-center text-xs text-white/50">Pode sair do app: avisamos quando a luta começar.</p>
          {leader ? (
            <Button
              variant="secondary"
              className="w-full"
              icon={<X className="size-4" />}
              loading={busy === 'unq'}
              onClick={() => act('unq', async () => update(await api.post(`/events/runs/${run.id}/unqueue`)))}
            >
              Parar de procurar
            </Button>
          ) : (
            <Button variant="secondary" className="w-full" icon={<LogOut className="size-4" />} onClick={() => act('leave', async () => update(await api.post(`/events/runs/${run.id}/leave`)))}>
              Sair do time
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <Button variant="secondary" icon={<LogOut className="size-4" />} onClick={() => act('leave', async () => update(await api.post(`/events/runs/${run.id}/leave`)))}>
            {leader ? 'Desfazer' : 'Sair'}
          </Button>
          {leader ? (
            <Button
              className="boss-cta"
              size="lg"
              loading={busy === 'fight'}
              icon={ev.kind === 'PVP' ? <Search className="size-5" /> : <Swords className="size-5" />}
              onClick={() => fight(run.id)}
            >
              {cta}
            </Button>
          ) : (
            <p className="flex items-center justify-center gap-1.5 text-xs text-white/60">
              <Check className="size-4 text-volt" /> Esperando o líder começar
            </p>
          )}
        </div>
      )}
      {leader && !queued && run.members.some((m) => !m.accepted) && (
        <p className="text-xs text-white/50">Quem não aceitar o convite até você {ev.kind === 'PVP' ? 'procurar adversário' : 'lutar'} fica de fora.</p>
      )}
    </div>
  );
}
