/**
 * Evento de boss na Arena (só aparece quando há evento ATIVO).
 * Arte animada do boss, brilho, partículas, contador, tentativas, time e espólio.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Swords, Users, Gift, UserPlus, X, Check, LogOut, Search, History, Flame } from 'lucide-react';
import type { BossEventPublic, BossRunDTO } from '@gymbattle/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { loadBossKit } from '@/lib/bosskit';
import { AvatarBust } from './AvatarCanvas';
import { Button, Input, toast } from './ui';

export function useBossEvents() {
  return useQuery({
    queryKey: ['boss-events'],
    queryFn: () => api.get<{ events: BossEventPublic[]; serverNow: string }>('/events/active'),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function BossEvents() {
  const { data } = useBossEvents();
  if (!data?.events.length) return null;
  return (
    <div className="space-y-4">
      {data.events.map((ev) => (
        <BossEventCard key={ev.id} ev={ev} />
      ))}
    </div>
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

/** Retrato animado do boss (desenhado pelo kit). */
export function BossPortrait({ spec, className }: { spec: BossEventPublic['boss']; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let stop: (() => void) | null = null;
    let alive = true;
    loadBossKit()
      .then((kit) => {
        if (alive && ref.current) stop = kit.mountPortrait(ref.current, spec);
      })
      .catch(() => {});
    return () => {
      alive = false;
      stop?.();
    };
  }, [spec]);
  return <canvas ref={ref} className={className} aria-label={`${spec.name}, ${spec.title}`} role="img" />;
}

function BossEventCard({ ev }: { ev: BossEventPublic }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const left = useCountdown(ev.endsAt);
  const [busy, setBusy] = useState<string | null>(null);
  const b = ev.boss;
  const glowC = b.pal.glow;

  // o evento acabou: o card some
  useEffect(() => {
    if (left.ms <= 0) void qc.invalidateQueries({ queryKey: ['boss-events'] });
  }, [left.ms, qc]);

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
    qc.setQueryData<{ events: BossEventPublic[]; serverNow: string }>(['boss-events'], (d) =>
      d ? { ...d, events: d.events.map((e) => (e.id === r.event.id ? r.event : e)) } : d,
    );

  const startRun = () => act('run', async () => update(await api.post<{ event: BossEventPublic }>(`/events/${ev.id}/run`)));
  const fight = (runId: string) =>
    act('fight', async () => {
      const r = await api.post<{ runId: string }>(`/events/runs/${runId}/fight`);
      void qc.invalidateQueries({ queryKey: ['boss-events'] });
      navigate(`/chefe/${r.runId}`);
    });
  const soloFight = () =>
    act('fight', async () => {
      const r = await api.post<{ event: BossEventPublic }>(`/events/${ev.id}/run`);
      const f = await api.post<{ runId: string }>(`/events/runs/${r.event.run!.id}/fight`);
      void qc.invalidateQueries({ queryKey: ['boss-events'] });
      navigate(`/chefe/${f.runId}`);
    });

  return (
    <div className="boss-card relative overflow-hidden rounded-3xl p-[2px]" style={{ ['--boss-glow' as string]: glowC }}>
      {/* borda girando */}
      <div className="boss-card-border pointer-events-none absolute inset-[-60%]" aria-hidden />
      <div className="relative overflow-hidden rounded-[22px] bg-[#07060a]">
        <div className="relative">
          <BossPortrait spec={b} className="block h-56 w-full sm:h-64" />
          {/* faíscas e vinheta */}
          <div className="boss-sparks pointer-events-none absolute inset-0" aria-hidden />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#07060a] via-transparent to-black/40" />
          <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-black uppercase tracking-widest text-white backdrop-blur">
            <Flame className="size-3.5 animate-pulse" style={{ color: glowC }} /> Evento
          </div>
          <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold tabular-nums text-white backdrop-blur">
            <Clock className="size-3.5" /> {left.text}
          </div>
          <div className="absolute inset-x-0 bottom-0 px-4 pb-2">
            <h2 className="font-display text-2xl font-black leading-tight text-white" style={{ textShadow: `0 0 18px ${glowC}` }}>
              {b.name}
            </h2>
            <p className="text-sm font-semibold" style={{ color: b.pal.accent }}>
              {b.title}
            </p>
          </div>
        </div>

        <div className="space-y-3 px-4 pt-2 pb-4">
          <p className="text-sm italic text-white/70">“{b.lore}”</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Tentativas" value={`${ev.attemptsLeft}/${ev.attempts}`} />
            <Stat label="Time" value={ev.teamSize === 1 ? 'Solo' : `até ${ev.teamSize}`} />
            <Stat label="Ataques" value={String(b.attacks.length)} />
          </div>
          <div className="flex items-start gap-2.5 rounded-2xl border border-amber-300/25 bg-amber-300/8 p-3">
            <Gift className="mt-0.5 size-4 shrink-0 text-amber-300" />
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-amber-200">Espólio</p>
              <p className="text-white/80">{ev.lootText}</p>
              {ev.teamSize > 1 && <p className="mt-0.5 text-xs text-white/50">Se vencer, CADA um do time ganha o espólio inteiro.</p>}
            </div>
          </div>

          {ev.invites.map((inv) => (
            <InviteRow key={inv.id} ev={ev} run={inv} busy={busy} act={act} update={update} />
          ))}

          {ev.run ? (
            <RunPanel ev={ev} run={ev.run} me={user!.id} busy={busy} act={act} update={update} fight={fight} />
          ) : ev.attemptsLeft <= 0 ? (
            <p className="rounded-xl bg-white/5 p-3 text-center text-sm text-white/60">Você já usou todas as suas tentativas neste evento.</p>
          ) : ev.teamSize === 1 ? (
            <Button size="lg" className="boss-cta w-full" loading={busy === 'fight'} icon={<Swords className="size-5" />} onClick={soloFight}>
              ENFRENTAR!
            </Button>
          ) : (
            <Button size="lg" className="boss-cta w-full" loading={busy === 'run'} icon={<Users className="size-5" />} onClick={startRun}>
              Montar time e enfrentar
            </Button>
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
                    onClick={() => navigate(`/chefe/${h.runId}`)}
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${h.won ? 'bg-amber-300/15 text-amber-200' : 'bg-white/8 text-white/60'}`}
                  >
                    {h.won ? 'Vitória' : 'Derrota'} · assistir
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

function InviteRow({ ev, run, busy, act, update }: { ev: BossEventPublic; run: BossRunDTO; busy: string | null; act: Act; update: Upd }) {
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
      <span className="sr-only">{ev.id}</span>
    </div>
  );
}

function RunPanel({ ev, run, me, busy, act, update, fight }: { ev: BossEventPublic; run: BossRunDTO; me: string; busy: string | null; act: Act; update: Upd; fight: (id: string) => void }) {
  const leader = run.leaderId === me;
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ id: string; username: string; level: number; attemptsLeft: number; sameGroup: boolean }[]>([]);
  useEffect(() => {
    if (!leader || !q.trim()) return setResults([]);
    const t = setTimeout(() => {
      api
        .get<{ users: typeof results }>(`/events/${ev.id}/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => setResults(r.users.sort((a, b) => Number(b.sameGroup) - Number(a.sameGroup))))
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q, leader, ev.id]);
  const accepted = run.members.filter((m) => m.accepted);
  const full = run.members.length >= ev.teamSize;
  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-white">
        <Users className="size-4 text-volt" /> Seu time ({accepted.length}/{ev.teamSize})
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
            {leader && m.id !== me && (
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
      {leader && !full && (
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
      <div className="grid grid-cols-[auto_1fr] gap-2">
        <Button
          variant="secondary"
          icon={<LogOut className="size-4" />}
          onClick={() => act('leave', async () => update(await api.post(`/events/runs/${run.id}/leave`)))}
        >
          {leader ? 'Desfazer' : 'Sair'}
        </Button>
        {leader ? (
          <Button className="boss-cta" size="lg" loading={busy === 'fight'} icon={<Swords className="size-5" />} onClick={() => fight(run.id)}>
            LUTAR!
          </Button>
        ) : (
          <p className="flex items-center justify-center gap-1.5 text-xs text-white/60">
            <Check className="size-4 text-volt" /> Esperando o líder começar
          </p>
        )}
      </div>
      {leader && run.members.some((m) => !m.accepted) && <p className="text-xs text-white/50">Quem não aceitar o convite até você lutar fica de fora.</p>}
    </div>
  );
}
