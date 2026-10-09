/**
 * Admin do site: eventos de boss (SECRETO — só esta conta vê).
 * Criar, editar, encerrar, ver histórico e prévia da luta.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Eye, History, Square, Pencil, Trash2, Swords, Trophy, Skull, Search, Percent } from 'lucide-react';
import {
  ARMOR_SETS, ARMOR_SLOTS, ARMOR_SLOT_LABEL, RARITY_COLOR, WEAPONS, armorPieceId,
  type BossEventAdmin, type BossReplay, type BossSpec, type GiftDTO,
} from '@gymbattle/shared';
import { api } from '@/lib/api';
import { loadBossKit } from '@/lib/bosskit';
import { BossFightView } from '@/pages/BossFightPage';
import { Alert, Button, Card, Input, Sheet, Spinner, toast } from './ui';

const ITEMS = [
  ...WEAPONS.map((w) => ({ id: w.id, name: w.name, rarity: w.rarity, kind: 'Arma' })),
  ...ARMOR_SETS.flatMap((s) => ARMOR_SLOTS.map((slot) => ({ id: armorPieceId(s.id, slot), name: `${s.name} · ${ARMOR_SLOT_LABEL[slot]}`, rarity: s.rarity, kind: 'Armadura' }))),
];
const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

const STATUS: Record<BossEventAdmin['status'], { label: string; cls: string }> = {
  SCHEDULED: { label: 'Agendado', cls: 'bg-sky-400/15 text-sky-300' },
  ACTIVE: { label: 'AO VIVO', cls: 'bg-hp/20 text-hp animate-pulse' },
  ENDED: { label: 'Encerrado', cls: 'bg-white/10 text-subtle' },
};

const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function EventsTab() {
  const qc = useQueryClient();
  const { data: cat } = useQuery({ queryKey: ['admin-bosses'], queryFn: () => api.get<{ bosses: BossSpec[] }>('/admin/events/bosses'), staleTime: Infinity });
  const { data, isLoading } = useQuery({ queryKey: ['admin-events'], queryFn: () => api.get<{ events: BossEventAdmin[] }>('/admin/events'), refetchInterval: 30_000 });
  const [form, setForm] = useState<BossEventAdmin | 'new' | null>(null);
  const [hist, setHist] = useState<BossEventAdmin | null>(null);
  const [preview, setPreview] = useState<BossReplay | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const byId = useMemo(() => Object.fromEntries((cat?.bosses ?? []).map((b) => [b.id, b])), [cat]);

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast(ok);
      void qc.invalidateQueries({ queryKey: ['admin-events'] });
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };
  const doPreview = (bossId: string, won: boolean, team = 3) =>
    run('prev' + bossId + won, async () => {
      const r = await api.post<{ replay: BossReplay }>('/admin/events/preview', { bossId, won, team });
      setPreview(r.replay);
    });

  return (
    <div className="space-y-3">
      <Alert tone="info">
        Só você vê esta aba. Os jogadores não sabem que os eventos existem até um começar — e nunca veem a chance de vitória.
      </Alert>
      <Button className="w-full" icon={<Plus className="size-4" />} onClick={() => setForm('new')}>
        Criar evento
      </Button>
      {isLoading && <Spinner className="mx-auto" />}
      {data?.events.length === 0 && <p className="py-6 text-center text-sm text-muted">Nenhum evento ainda.</p>}
      {data?.events.map((e) => {
        const b = byId[e.bossId];
        return (
          <Card key={e.id} className="overflow-hidden">
            <div className="flex gap-3 p-3">
              {b && <BossThumb spec={b} className="size-20 shrink-0 rounded-xl" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-black ${STATUS[e.status].cls}`}>{STATUS[e.status].label}</span>
                  <span className="flex items-center gap-0.5 text-xs font-bold text-gold">
                    <Percent className="size-3" />
                    {e.winChance} de vitória
                  </span>
                </div>
                <p className="mt-1 truncate font-semibold">
                  {e.bossName} <span className="font-normal text-subtle">{b?.title}</span>
                </p>
                <p className="text-xs text-subtle">
                  {fmt(e.startsAt)} → {fmt(e.endedAt ?? e.endsAt)}
                </p>
                <p className="text-xs text-muted">
                  {e.teamSize === 1 ? 'Solo' : `Time até ${e.teamSize}`} · {e.attempts} tentativa{e.attempts > 1 ? 's' : ''} · {e.stats.fights} luta(s), {e.stats.wins} vitória(s),{' '}
                  {e.stats.players} jogador(es)
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 border-t border-line p-2">
              {e.status !== 'ENDED' && (
                <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setForm(e)}>
                  Editar
                </Button>
              )}
              <Button size="sm" variant="ghost" icon={<History className="size-3.5" />} onClick={() => setHist(e)}>
                Histórico
              </Button>
              <Button size="sm" variant="ghost" icon={<Eye className="size-3.5" />} loading={busy === 'prev' + e.bossId + 'true'} onClick={() => doPreview(e.bossId, true, e.teamSize)}>
                Prévia vitória
              </Button>
              <Button size="sm" variant="ghost" icon={<Skull className="size-3.5" />} loading={busy === 'prev' + e.bossId + 'false'} onClick={() => doPreview(e.bossId, false, e.teamSize)}>
                Prévia derrota
              </Button>
              {e.status !== 'ENDED' && (
                <Button
                  size="sm"
                  variant="danger"
                  icon={<Square className="size-3.5" />}
                  loading={busy === 'end' + e.id}
                  onClick={() => confirm('Encerrar este evento agora?') && run('end' + e.id, () => api.post(`/admin/events/${e.id}/end`), 'Evento encerrado.')}
                >
                  Encerrar
                </Button>
              )}
              {e.status === 'SCHEDULED' && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 className="size-3.5" />}
                  onClick={() => confirm('Apagar este evento agendado?') && run('del' + e.id, () => api.del(`/admin/events/${e.id}`), 'Evento apagado.')}
                >
                  Apagar
                </Button>
              )}
            </div>
          </Card>
        );
      })}

      {form && cat && (
        <EventForm
          bosses={cat.bosses}
          initial={form === 'new' ? null : form}
          onClose={() => setForm(null)}
          onPreview={doPreview}
          onSaved={() => {
            setForm(null);
            void qc.invalidateQueries({ queryKey: ['admin-events'] });
          }}
        />
      )}
      {hist && <HistorySheet ev={hist} onClose={() => setHist(null)} />}
      {preview && <BossFightView replay={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

/** Miniatura do boss (desenhada uma vez). */
function BossThumb({ spec, className }: { spec: BossSpec; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    loadBossKit()
      .then((kit) => {
        const c = ref.current;
        if (!alive || !c) return;
        const r = c.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        c.width = Math.max(1, Math.round(r.width * dpr));
        c.height = Math.max(1, Math.round(r.height * dpr));
        const ctx = c.getContext('2d')!;
        ctx.scale(dpr, dpr);
        kit.drawPortrait(ctx, spec, 1.3, r.width, r.height);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [spec]);
  return <canvas ref={ref} className={className} aria-label={spec.name} role="img" />;
}

/** Retrato animado grande (escolha do boss). */
function BossLive({ spec }: { spec: BossSpec }) {
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
  return <canvas ref={ref} className="block h-48 w-full rounded-2xl" />;
}

function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function EventForm({
  bosses, initial, onClose, onSaved, onPreview,
}: {
  bosses: BossSpec[];
  initial: BossEventAdmin | null;
  onClose: () => void;
  onSaved: () => void;
  onPreview: (bossId: string, won: boolean, team?: number) => void;
}) {
  const [bossId, setBossId] = useState(initial?.bossId ?? bosses[0]?.id ?? '');
  const [q, setQ] = useState('');
  const [start, setStart] = useState(toLocalInput(initial ? new Date(initial.startsAt) : new Date()));
  const [hours, setHours] = useState(initial ? String(Math.round(((Date.parse(initial.endsAt) - Date.parse(initial.startsAt)) / 3_600_000) * 100) / 100) : '24');
  const [attempts, setAttempts] = useState(String(initial?.attempts ?? 3));
  const [teamSize, setTeamSize] = useState(initial?.teamSize ?? 1);
  const [lootItem, setLootItem] = useState<string | null>(initial?.lootItemId ?? null);
  const [itemQ, setItemQ] = useState('');
  const [gold, setGold] = useState(String(initial?.lootGold ?? 0));
  const [xp, setXp] = useState(String(initial?.lootXp ?? 0));
  const [lootText, setLootText] = useState(initial?.lootText ?? '');
  const [chance, setChance] = useState(initial?.winChance ?? 40);
  const [error, setError] = useState<string | null>(null);
  const boss = bosses.find((b) => b.id === bossId);
  const list = bosses.filter((b) => !q.trim() || `${b.name} ${b.title} ${b.arch}`.toLowerCase().includes(q.trim().toLowerCase()));
  const items = itemQ.trim() ? ITEMS.filter((i) => i.name.toLowerCase().includes(itemQ.trim().toLowerCase())).slice(0, 12) : [];

  const save = useMutation({
    mutationFn: () => {
      const body = {
        bossId, startsAt: new Date(start).toISOString(), hours: Number(hours), attempts: Number(attempts), teamSize,
        lootItemId: lootItem, lootGold: Number(gold) || 0, lootXp: Number(xp) || 0, lootText: lootText.trim() || null, winChance: chance,
      };
      return initial ? api.put(`/admin/events/${initial.id}`, body) : api.post('/admin/events', body);
    },
    onSuccess: () => {
      toast(initial ? 'Evento atualizado.' : 'Evento criado! Os jogadores serão avisados quando começar.');
      onSaved();
    },
    onError: (e) => setError((e as Error).message),
  });

  return (
    <Sheet open onClose={onClose} title={initial ? 'Editar evento' : 'Novo evento'}>
      <div className="space-y-4">
        {/* boss */}
        <div>
          <p className="mb-1.5 text-sm font-semibold">Boss ({bosses.length} no total)</p>
          {boss && (
            <div className="mb-2 overflow-hidden rounded-2xl border border-line">
              <BossLive spec={boss} />
              <div className="p-3">
                <p className="font-semibold">
                  {boss.name} <span className="font-normal text-subtle">{boss.title}</span>
                </p>
                <p className="text-xs italic text-muted">{boss.lore}</p>
                <p className="mt-1 text-xs text-subtle">Ataques: {boss.attacks.map((a) => a.name).join(' · ')}</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="secondary" icon={<Trophy className="size-3.5" />} onClick={() => onPreview(boss.id, true, teamSize)}>
                    Ver vitória
                  </Button>
                  <Button size="sm" variant="secondary" icon={<Skull className="size-3.5" />} onClick={() => onPreview(boss.id, false, teamSize)}>
                    Ver derrota
                  </Button>
                </div>
              </div>
            </div>
          )}
          <Input placeholder="Buscar boss (nome ou tipo)" value={q} onChange={(e) => setQ(e.target.value)} leading={<Search className="size-4" />} />
          <div className="mt-2 grid max-h-64 grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-4">
            {list.map((b) => (
              <button
                key={b.id}
                onClick={() => setBossId(b.id)}
                className={`overflow-hidden rounded-xl border text-left ${b.id === bossId ? 'border-volt ring-2 ring-volt/40' : 'border-line'}`}
              >
                <BossThumb spec={b} className="block h-16 w-full" />
                <p className="truncate px-1.5 py-1 text-[11px] font-semibold">{b.name}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Input label="Começa em" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          <Input label="Dura (horas)" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value.replace(/[^0-9.]/g, ''))} />
          <Input label="Tentativas por jogador" inputMode="numeric" value={attempts} onChange={(e) => setAttempts(e.target.value.replace(/[^0-9]/g, ''))} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="team-size" className="text-[13px] font-medium text-muted">
              Tamanho do time
            </label>
            <select
              id="team-size"
              value={teamSize}
              onChange={(e) => setTeamSize(Number(e.target.value))}
              className="h-12 rounded-xl border border-line-strong bg-surface px-3 outline-none focus:border-volt/60"
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {['Solo', 'Dupla', 'Trio', 'Quarteto', 'Quinteto'][n - 1] ?? `${n} jogadores`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* espólio */}
        <div className="space-y-2 rounded-2xl border border-gold/30 bg-gold/5 p-3">
          <p className="text-sm font-semibold">Espólio (cada jogador do time ganha tudo)</p>
          {lootItem ? (
            <div className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate" style={{ color: RARITY_COLOR[ITEM_BY_ID[lootItem]?.rarity ?? 'common'] }}>
                {ITEM_BY_ID[lootItem]?.name ?? lootItem}
              </span>
              <button className="text-xs text-subtle hover:text-danger" onClick={() => setLootItem(null)}>
                Remover
              </button>
            </div>
          ) : (
            <>
              <Input placeholder="Item (opcional): buscar arma ou armadura" value={itemQ} onChange={(e) => setItemQ(e.target.value)} leading={<Search className="size-4" />} />
              {items.length > 0 && (
                <ul className="max-h-44 overflow-y-auto rounded-xl border border-line">
                  {items.map((i) => (
                    <li key={i.id}>
                      <button
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
                        onClick={() => {
                          setLootItem(i.id);
                          setItemQ('');
                        }}
                      >
                        <span className="min-w-0 flex-1 truncate" style={{ color: RARITY_COLOR[i.rarity] }}>
                          {i.name}
                        </span>
                        <span className="text-xs text-subtle">{i.kind}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Input label="Ouro" inputMode="numeric" value={gold} onChange={(e) => setGold(e.target.value.replace(/[^0-9]/g, ''))} />
            <Input label="XP" inputMode="numeric" value={xp} onChange={(e) => setXp(e.target.value.replace(/[^0-9]/g, ''))} />
          </div>
          <Input
            label="Descrição do espólio (o que os jogadores veem)"
            placeholder="??? Um tesouro esquecido aguarda quem vencer..."
            value={lootText}
            maxLength={300}
            onChange={(e) => setLootText(e.target.value)}
            hint="Vazio = mensagem misteriosa."
          />
        </div>

        {/* chance */}
        <div className="rounded-2xl border border-line p-3">
          <label htmlFor="chance" className="flex items-center justify-between text-sm font-semibold">
            Chance de vitória (só você vê) <span className="font-display text-lg text-gold">{chance}%</span>
          </label>
          <input id="chance" type="range" min={0} max={100} value={chance} onChange={(e) => setChance(Number(e.target.value))} className="mt-2 w-full accent-[var(--color-volt)]" />
          <p className="text-xs text-subtle">Igual para qualquer tamanho de time. Sorteada no servidor a cada luta.</p>
        </div>

        {error && <Alert>{error}</Alert>}
        <Button className="w-full" size="lg" loading={save.isPending} icon={<Swords className="size-4" />} onClick={() => save.mutate()}>
          {initial ? 'Salvar alterações' : 'Criar evento'}
        </Button>
      </div>
    </Sheet>
  );
}

function HistorySheet({ ev, onClose }: { ev: BossEventAdmin; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-event-history', ev.id],
    queryFn: () =>
      api.get<{
        runs: { id: string; won: boolean; foughtAt: string | null; leader: string | null; members: string[] }[];
        loot: (GiftDTO & { username: string })[];
      }>(`/admin/events/${ev.id}/history`),
  });
  return (
    <Sheet open onClose={onClose} title={`Histórico — ${ev.bossName}`}>
      {isLoading && <Spinner className="mx-auto" />}
      {data && (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {data.runs.length} tentativa(s) · {data.runs.filter((r) => r.won).length} vitória(s)
          </p>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {data.runs.length === 0 && <li className="p-3 text-center text-sm text-muted">Ninguém lutou ainda.</li>}
            {data.runs.map((r) => (
              <li key={r.id} className="flex items-center gap-2 p-3 text-sm">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-black ${r.won ? 'bg-gold/15 text-gold' : 'bg-white/10 text-subtle'}`}>
                  {r.won ? 'VITÓRIA' : 'DERROTA'}
                </span>
                <span className="min-w-0 flex-1 truncate">{r.members.join(', ')}</span>
                <a href={`/chefe/${r.id}`} className="text-xs text-volt">
                  Assistir
                </a>
                <time className="text-xs text-subtle">{r.foughtAt ? fmt(r.foughtAt) : ''}</time>
              </li>
            ))}
          </ul>
          {data.loot.length > 0 && (
            <div>
              <p className="mb-1.5 text-sm font-semibold">Quem ganhou o quê</p>
              <ul className="divide-y divide-line rounded-xl border border-line text-sm">
                {data.loot.map((g) => (
                  <li key={g.id} className="flex items-center gap-2 p-2.5">
                    <span className="font-medium">{g.username}</span>
                    <span className="text-muted">
                      {g.kind === 'ITEM' ? g.itemName : `+${g.amount} ${g.kind === 'GOLD' ? 'de ouro' : 'XP'}`}
                    </span>
                    <time className="ml-auto text-xs text-subtle">{fmt(g.createdAt)}</time>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
