/**
 * Admin do site: eventos da Arena (SECRETO — só esta conta vê).
 * Três tipos, cada um numa sub-aba: Boss, PvP em equipes e Waves.
 * Criar, editar, encerrar, ver histórico e prévia. Nada daqui (chance,
 * dificuldade, configuração) chega aos jogadores.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Plus, Eye, History, Square, Pencil, Trash2, Swords, Trophy, Skull, Search, Percent, Flame, Sparkles } from 'lucide-react';
import {
  ARMOR_SETS, ARMOR_SLOTS, ARMOR_SLOT_LABEL, RARITY_COLOR, WEAPONS, armorPieceId,
  type BossEventAdmin, type BossReplay, type BossSpec, type EventKind, type GiftDTO, type TeamReplay, type WaveThemeAdmin,
} from '@gymbattle/shared';
import { api } from '@/lib/api';
import { loadBossKit } from '@/lib/bosskit';
import { BossFightView, TeamFightView } from '@/pages/BossFightPage';
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

const KINDS: { id: EventKind; label: string; icon: typeof Flame; desc: string }[] = [
  { id: 'BOSS', label: 'Boss', icon: Flame, desc: 'Um boss gigante. Você define a chance de vitória (+1% escondido por membro extra do time).' },
  { id: 'PVP', label: 'PvP em equipes', icon: Swords, desc: 'Times (ou solo) procuram adversários e lutam de verdade: atributos, armas e IA decidem. Sem chance definida.' },
  { id: 'WAVES', label: 'Waves', icon: Skull, desc: '10 waves de monstros do tema + um mini-chefe humano. A chance sai das habilidades dos jogadores, ou você fixa uma.' },
];

const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const watchUrl = (kind: EventKind, runId: string) => (kind === 'BOSS' ? `/chefe/${runId}` : `/evento/${runId}`);

type Themes = { themes: WaveThemeAdmin[]; autoChance: Record<string, number> };

export function EventsTab() {
  const qc = useQueryClient();
  const { data: cat } = useQuery({ queryKey: ['admin-bosses'], queryFn: () => api.get<{ bosses: BossSpec[] }>('/admin/events/bosses'), staleTime: Infinity });
  const { data: th } = useQuery({ queryKey: ['admin-themes'], queryFn: () => api.get<Themes>('/admin/events/themes'), staleTime: Infinity });
  const { data, isLoading } = useQuery({ queryKey: ['admin-events'], queryFn: () => api.get<{ events: BossEventAdmin[] }>('/admin/events'), refetchInterval: 30_000 });
  const [kind, setKind] = useState<EventKind>('BOSS');
  const [form, setForm] = useState<BossEventAdmin | 'new' | null>(null);
  const [hist, setHist] = useState<BossEventAdmin | null>(null);
  const [preview, setPreview] = useState<BossReplay | null>(null);
  const [teamPreview, setTeamPreview] = useState<TeamReplay | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const byId = useMemo(() => Object.fromEntries((cat?.bosses ?? []).map((b) => [b.id, b])), [cat]);
  const themeById = useMemo(() => Object.fromEntries((th?.themes ?? []).map((t) => [t.id, t])), [th]);
  const events = (data?.events ?? []).filter((e) => (e.kind ?? 'BOSS') === kind);

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
  const doTeamPreview = (o: { kind: 'PVP' | 'WAVES'; themeId?: string; team: number; chanceAuto?: boolean; winChance?: number }, key = 'tprev') =>
    run(key, async () => {
      const r = await api.post<{ replay: TeamReplay }>('/admin/events/preview-team', o);
      setTeamPreview(r.replay);
    });

  const K = KINDS.find((k) => k.id === kind)!;
  return (
    <div className="space-y-3">
      <Alert tone="info">
        Só você vê esta aba. Os jogadores não sabem que um evento existe até ele começar — e nunca veem a chance, a dificuldade ou qualquer
        configuração daqui.
      </Alert>
      <div className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface p-1">
        {KINDS.map((k) => {
          const live = (data?.events ?? []).filter((e) => (e.kind ?? 'BOSS') === k.id && e.status === 'ACTIVE').length;
          return (
            <button
              key={k.id}
              onClick={() => setKind(k.id)}
              className={clsx('relative flex h-10 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold sm:text-sm', kind === k.id ? 'bg-surface-3 text-fg' : 'text-subtle')}
            >
              <k.icon className="size-4" />
              <span className="sm:hidden">{k.id === 'PVP' ? 'PvP' : k.label}</span>
              <span className="hidden sm:inline">{k.label}</span>
              {live > 0 && <span className="absolute top-1.5 right-1.5 size-2 animate-pulse rounded-full bg-hp" />}
            </button>
          );
        })}
      </div>
      <p className="px-1 text-xs text-muted">{K.desc}</p>
      <Button className="w-full" icon={<Plus className="size-4" />} onClick={() => setForm('new')}>
        Criar evento de {K.label}
      </Button>
      {isLoading && <Spinner className="mx-auto" />}
      {data && events.length === 0 && <p className="py-6 text-center text-sm text-muted">Nenhum evento de {K.label} ainda.</p>}
      {events.map((e) => {
        const b = e.kind === 'BOSS' ? byId[e.bossId] : undefined;
        const t = e.kind === 'WAVES' ? themeById[e.bossId] : undefined;
        return (
          <Card key={e.id} className="overflow-hidden">
            <div className="flex gap-3 p-3">
              {b && <BossThumb spec={b} className="size-20 shrink-0 rounded-xl" />}
              {e.kind !== 'BOSS' && <TeamThumb theme={t ?? null} className="size-20 shrink-0 rounded-xl" />}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-black ${STATUS[e.status].cls}`}>{STATUS[e.status].label}</span>
                  {e.kind === 'PVP' ? (
                    <span className="text-xs font-bold text-gold">Luta real (sem chance)</span>
                  ) : e.kind === 'WAVES' && e.chanceAuto ? (
                    <span className="flex items-center gap-0.5 text-xs font-bold text-gold">
                      <Sparkles className="size-3" /> Chance automática
                    </span>
                  ) : (
                    <span className="flex items-center gap-0.5 text-xs font-bold text-gold">
                      <Percent className="size-3" />
                      {e.winChance} de vitória
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate font-semibold">
                  {e.bossName} <span className="font-normal text-subtle">{b?.title ?? (t ? `· ${t.chief.name} ${t.chief.title}` : '')}</span>
                </p>
                <p className="text-xs text-subtle">
                  {fmt(e.startsAt)} → {fmt(e.endedAt ?? e.endsAt)}
                </p>
                <p className="text-xs text-muted">
                  {e.teamSize === 1 ? 'Solo' : `Time até ${e.teamSize}`} · {e.attempts} tentativa{e.attempts > 1 ? 's' : ''} · {e.stats.fights} luta(s),{' '}
                  {e.stats.wins} vitória(s), {e.stats.players} jogador(es)
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
              {e.kind === 'BOSS' && (
                <>
                  <Button size="sm" variant="ghost" icon={<Eye className="size-3.5" />} loading={busy === 'prev' + e.bossId + 'true'} onClick={() => doPreview(e.bossId, true, e.teamSize)}>
                    Prévia vitória
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Skull className="size-3.5" />} loading={busy === 'prev' + e.bossId + 'false'} onClick={() => doPreview(e.bossId, false, e.teamSize)}>
                    Prévia derrota
                  </Button>
                </>
              )}
              {e.kind !== 'BOSS' && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Eye className="size-3.5" />}
                  loading={busy === 'tprev' + e.id}
                  onClick={() =>
                    doTeamPreview(
                      { kind: e.kind as 'PVP' | 'WAVES', themeId: e.bossId, team: e.teamSize, chanceAuto: e.chanceAuto, winChance: e.winChance },
                      'tprev' + e.id,
                    )
                  }
                >
                  Prévia
                </Button>
              )}
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

      {form && (kind !== 'BOSS' || cat) && (kind !== 'WAVES' || th) && (
        <EventForm
          kind={form === 'new' ? kind : form.kind}
          bosses={cat?.bosses ?? []}
          themes={th ?? { themes: [], autoChance: {} }}
          initial={form === 'new' ? null : form}
          onClose={() => setForm(null)}
          onPreview={doPreview}
          onTeamPreview={(o) => doTeamPreview(o)}
          previewBusy={busy === 'tprev'}
          onSaved={() => {
            setForm(null);
            void qc.invalidateQueries({ queryKey: ['admin-events'] });
          }}
        />
      )}
      {hist && <HistorySheet ev={hist} onClose={() => setHist(null)} />}
      {preview && <BossFightView replay={preview} onClose={() => setPreview(null)} />}
      {teamPreview && <TeamFightView replay={teamPreview} onClose={() => setTeamPreview(null)} />}
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

/** Miniatura de waves (tema) ou do PvP em equipes. */
function TeamThumb({ theme, className }: { theme: WaveThemeAdmin | null; className?: string }) {
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
        if (theme) kit.drawThemePortrait(ctx, theme, 1.3, r.width, r.height);
        else kit.drawPvpPortrait(ctx, 1.3, r.width, r.height);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [theme]);
  return <canvas ref={ref} className={className} role="img" aria-label={theme?.name ?? 'PvP em equipes'} />;
}

/** Retrato animado grande (escolha do boss / do tema). */
function LiveArt({ spec, theme, pvp }: { spec?: BossSpec; theme?: WaveThemeAdmin; pvp?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let stop: (() => void) | null = null;
    let alive = true;
    loadBossKit()
      .then((kit) => {
        if (!alive || !ref.current) return;
        if (spec) stop = kit.mountPortrait(ref.current, spec);
        else if (theme || pvp) stop = kit.mountTeamPortrait(ref.current, theme ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
      stop?.();
    };
  }, [spec, theme, pvp]);
  return <canvas ref={ref} className="block h-48 w-full rounded-2xl" />;
}

function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function EventForm({
  kind, bosses, themes, initial, onClose, onSaved, onPreview, onTeamPreview, previewBusy,
}: {
  kind: EventKind;
  bosses: BossSpec[];
  themes: Themes;
  initial: BossEventAdmin | null;
  onClose: () => void;
  onSaved: () => void;
  onPreview: (bossId: string, won: boolean, team?: number) => void;
  onTeamPreview: (o: { kind: 'PVP' | 'WAVES'; themeId?: string; team: number; chanceAuto?: boolean; winChance?: number }) => void;
  previewBusy: boolean;
}) {
  const [bossId, setBossId] = useState(initial?.bossId ?? (kind === 'WAVES' ? themes.themes[0]?.id : bosses[0]?.id) ?? '');
  const [q, setQ] = useState('');
  const [start, setStart] = useState(toLocalInput(initial ? new Date(initial.startsAt) : new Date()));
  const [hours, setHours] = useState(initial ? String(Math.round(((Date.parse(initial.endsAt) - Date.parse(initial.startsAt)) / 3_600_000) * 100) / 100) : '24');
  const [attempts, setAttempts] = useState(String(initial?.attempts ?? 3));
  const [teamSize, setTeamSize] = useState(initial?.teamSize ?? (kind === 'BOSS' ? 1 : 3));
  const [lootItem, setLootItem] = useState<string | null>(initial?.lootItemId ?? null);
  const [itemQ, setItemQ] = useState('');
  const [gold, setGold] = useState(String(initial?.lootGold ?? 0));
  const [xp, setXp] = useState(String(initial?.lootXp ?? 0));
  const [lootText, setLootText] = useState(initial?.lootText ?? '');
  const [chance, setChance] = useState(initial?.winChance ?? 40);
  const [chanceAuto, setChanceAuto] = useState(initial?.chanceAuto ?? true);
  const [error, setError] = useState<string | null>(null);
  const boss = kind === 'BOSS' ? bosses.find((b) => b.id === bossId) : undefined;
  const theme = kind === 'WAVES' ? themes.themes.find((t) => t.id === bossId) : undefined;
  const list = bosses.filter((b) => !q.trim() || `${b.name} ${b.title} ${b.arch}`.toLowerCase().includes(q.trim().toLowerCase()));
  const items = itemQ.trim() ? ITEMS.filter((i) => i.name.toLowerCase().includes(itemQ.trim().toLowerCase())).slice(0, 12) : [];
  const K = KINDS.find((k) => k.id === kind)!;

  const save = useMutation({
    mutationFn: () => {
      const body = {
        kind, bossId: kind === 'PVP' ? 'pvp' : bossId, startsAt: new Date(start).toISOString(), hours: Number(hours), attempts: Number(attempts), teamSize,
        lootItemId: lootItem, lootGold: Number(gold) || 0, lootXp: Number(xp) || 0, lootText: lootText.trim() || null, winChance: chance, chanceAuto,
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
    <Sheet open onClose={onClose} title={`${initial ? 'Editar' : 'Novo'} evento — ${K.label}`}>
      <div className="space-y-4">
        {/* boss */}
        {kind === 'BOSS' && (
          <div>
            <p className="mb-1.5 text-sm font-semibold">Boss ({bosses.length} no total)</p>
            {boss && (
              <div className="mb-2 overflow-hidden rounded-2xl border border-line">
                <LiveArt spec={boss} />
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
        )}

        {/* tema das waves */}
        {kind === 'WAVES' && (
          <div>
            <p className="mb-1.5 text-sm font-semibold">Tema ({themes.themes.length})</p>
            {theme && (
              <div className="mb-2 overflow-hidden rounded-2xl border border-line">
                <LiveArt theme={theme} />
                <div className="space-y-1 p-3">
                  <p className="font-semibold">{theme.name}</p>
                  <p className="text-xs italic text-muted">{theme.desc}</p>
                  <p className="text-xs text-subtle">Monstros: {theme.monsterNames.join(' · ')} (às vezes aparecem intrusos de outro tema)</p>
                  <p className="text-xs text-subtle">
                    Mini-chefe (depois da wave 10): <b className="text-fg">{theme.chief.name} {theme.chief.title}</b> · {theme.chief.cls}
                  </p>
                  <p className="text-xs text-subtle">Golpes: {theme.chiefMoves.join(' · ')}</p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-1.5">
              {themes.themes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setBossId(t.id)}
                  className={`overflow-hidden rounded-xl border text-left ${t.id === bossId ? 'border-volt ring-2 ring-volt/40' : 'border-line'}`}
                >
                  <TeamThumb theme={t} className="block h-16 w-full" />
                  <p className="truncate px-1.5 py-1 text-[11px] font-semibold">{t.name}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {kind === 'PVP' && (
          <div className="overflow-hidden rounded-2xl border border-line">
            <LiveArt pvp />
            <p className="p-3 text-xs text-muted">
              Cada time (ou jogador sozinho) clica em “Procurar adversário”. O jogo junta times do mesmo tamanho e força parecida (depois de 3 min
              esperando, aceita qualquer tamanho). A luta é de verdade — ninguém controla o resultado. Se o evento acabar com um time na fila, a
              tentativa não é gasta.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Input label="Começa em" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          <Input label="Dura (horas)" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value.replace(/[^0-9.]/g, ''))} />
          <Input
            label={kind === 'PVP' ? 'Lutas por jogador' : 'Tentativas por jogador'}
            inputMode="numeric"
            value={attempts}
            onChange={(e) => setAttempts(e.target.value.replace(/[^0-9]/g, ''))}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="team-size" className="text-[13px] font-medium text-muted">
              {kind === 'PVP' ? 'Tamanho máximo do time' : 'Tamanho do time'}
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
          <p className="text-sm font-semibold">
            Espólio {kind === 'PVP' ? '(cada um do time vencedor ganha tudo)' : kind === 'WAVES' ? '(se vencer o mini-chefe, cada um do time ganha tudo)' : '(cada jogador do time ganha tudo)'}
          </p>
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
        {kind === 'BOSS' && (
          <div className="rounded-2xl border border-line p-3">
            <label htmlFor="chance" className="flex items-center justify-between text-sm font-semibold">
              Chance de vitória (só você vê) <span className="font-display text-lg text-gold">{chance}%</span>
            </label>
            <input id="chance" type="range" min={0} max={100} value={chance} onChange={(e) => setChance(Number(e.target.value))} className="mt-2 w-full accent-[var(--color-volt)]" />
            <p className="text-xs text-subtle">Sorteada no servidor a cada luta.</p>
          </div>
        )}
        {kind === 'WAVES' && (
          <div className="space-y-2 rounded-2xl border border-line p-3">
            <p className="text-sm font-semibold">Chance de vitória (só você vê)</p>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
              {[
                [true, 'Automática'],
                [false, 'Fixa'],
              ].map(([v, label]) => (
                <button
                  key={String(v)}
                  onClick={() => setChanceAuto(v as boolean)}
                  className={clsx('h-9 rounded-lg text-sm font-semibold', chanceAuto === v ? 'bg-surface-3 text-fg' : 'text-subtle')}
                >
                  {label as string}
                </button>
              ))}
            </div>
            {chanceAuto ? (
              <div className="text-xs text-subtle">
                <p>
                  O jogo calcula pelas habilidades dos jogadores (atributos, armas, nível). Sozinho é difícil; em time fica mais fácil, mas as waves
                  ficam mais fortes. Média esperada para um time bem montado:
                </p>
                <div className="mt-2 grid grid-cols-5 gap-1 text-center">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <div key={n} className={clsx('rounded-lg py-1', n === teamSize ? 'bg-gold/15 text-gold' : 'bg-surface-2')}>
                      <p className="text-[10px]">{n === 1 ? 'solo' : `${n}`}</p>
                      <p className="font-bold">{Math.round((themes.autoChance[n] ?? 0) * 100)}%</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <label htmlFor="wchance" className="flex items-center justify-between text-sm">
                  Chance fixa <span className="font-display text-lg text-gold">{chance}%</span>
                </label>
                <input id="wchance" type="range" min={0} max={100} value={chance} onChange={(e) => setChance(Number(e.target.value))} className="w-full accent-[var(--color-volt)]" />
                <p className="text-xs text-subtle">Igual para qualquer time. O servidor sorteia e monta uma luta com esse resultado.</p>
              </>
            )}
          </div>
        )}

        {kind !== 'BOSS' && (
          <Button
            variant="secondary"
            className="w-full"
            loading={previewBusy}
            icon={<Eye className="size-4" />}
            onClick={() => onTeamPreview({ kind: kind as 'PVP' | 'WAVES', themeId: bossId, team: teamSize, chanceAuto, winChance: chance })}
          >
            Ver uma prévia ({teamSize === 1 ? 'solo' : `time de ${teamSize}`}, com jogadores de verdade)
          </Button>
        )}

        {error && <Alert>{error}</Alert>}
        <Button className="w-full" size="lg" loading={save.isPending} icon={<K.icon className="size-4" />} onClick={() => save.mutate()}>
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
        runs: { id: string; won: boolean | null; foughtAt: string | null; leader: string | null; members: string[]; vs?: string[]; reached?: number | null }[];
        loot: (GiftDTO & { username: string })[];
      }>(`/admin/events/${ev.id}/history`),
  });
  const kind = ev.kind ?? 'BOSS';
  return (
    <Sheet open onClose={onClose} title={`Histórico — ${ev.bossName}`}>
      {isLoading && <Spinner className="mx-auto" />}
      {data && (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {data.runs.length} luta(s){kind !== 'PVP' && ` · ${data.runs.filter((r) => r.won).length} vitória(s)`}
          </p>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {data.runs.length === 0 && <li className="p-3 text-center text-sm text-muted">Ninguém lutou ainda.</li>}
            {data.runs.map((r) => (
              <li key={r.id} className="flex items-center gap-2 p-3 text-sm">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-black ${r.won ? 'bg-gold/15 text-gold' : r.won === null && kind === 'PVP' ? 'bg-white/10 text-subtle' : 'bg-white/10 text-subtle'}`}
                >
                  {kind === 'PVP' ? (r.won === null ? 'EMPATE' : r.won ? 'VENCEU' : 'PERDEU') : r.won ? 'VITÓRIA' : 'DERROTA'}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {r.members.join(', ')}
                  {r.vs && <span className="text-subtle"> vs {r.vs.join(', ')}</span>}
                  {kind === 'WAVES' && r.reached != null && !r.won && <span className="text-subtle"> · wave {Math.min(10, r.reached)}{r.reached > 10 ? ' + chefe' : ''}</span>}
                </span>
                <a href={watchUrl(kind, r.id)} className="text-xs text-volt">
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
                    <span className="text-muted">{g.kind === 'ITEM' ? g.itemName : `+${g.amount} ${g.kind === 'GOLD' ? 'de ouro' : 'XP'}`}</span>
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
