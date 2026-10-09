import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowLeft, Pause, Play, FastForward, SkipForward, Maximize, Gauge, RotateCcw, Heart, Trophy, Volume2, VolumeX } from 'lucide-react';
import { isMuted, onMutedChange, setMuted } from '@/game/audio/engine';
import { BALANCE, MAPS_BY_ID, type Replay, type PublicUser } from '@gymbattle/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ArenaPlayer, type HudState } from '@/game/arena/player';
import { AvatarBust } from '@/components/AvatarCanvas';
import { Button, Spinner } from '@/components/ui';

interface BattleSummary {
  id: string;
  mode: string;
  map: string;
  mapName: string;
  a: { id: string | null; username: string };
  b: { id: string | null; username: string };
  winner: number | null;
  durationSec: number;
  result: null | { rewards?: { p: number; xp: number; gold: number }[]; pr?: [number, number] };
  createdAt: string;
  endsAt: string;
}

/** Parâmetros de teste (?t= / ?pause=) só valem fora do ao vivo — ou no teste automático. */
const testMode = () => !!(window as unknown as { __gbE2E?: boolean }).__gbE2E;

const LOW_KEY = 'gb_low_gfx';

export default function BattleView() {
  const { id = '' } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<ArenaPlayer | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [muted, setMutedState] = useState(isMuted());
  useEffect(() => {
    const off = onMutedChange(setMutedState);
    return () => { off(); };
  }, []);
  const [ended, setEnded] = useState(false);
  // ao vivo: sem controles; lutadores presos na tela até acabar
  const [live, setLive] = useState(false);
  const skewRef = useRef(0); // relógio do servidor − relógio do aparelho
  const [low, setLow] = useState(() => {
    try {
      return localStorage.getItem(LOW_KEY) === '1';
    } catch {
      return false;
    }
  });

  const summary = useQuery({
    queryKey: ['battle', id],
    queryFn: async () => {
      const t0 = Date.now();
      const r = await api.get<{ battle: BattleSummary; serverNow: string }>(`/battles/${id}`);
      skewRef.current = Date.parse(r.serverNow) - (t0 + Date.now()) / 2;
      return r;
    },
    staleTime: 0,
  });
  const replay = useQuery({
    queryKey: ['replay', id],
    queryFn: async () => {
      const r = await fetch(`/api/battles/${id}/replay`, { credentials: 'include' });
      if (!r.ok) throw new Error('Não foi possível carregar a luta.');
      return (await r.json()) as Replay;
    },
    staleTime: Infinity,
  });

  const serverNow = () => Date.now() + skewRef.current;
  /** Tick "ao vivo" agora (null se a luta já acabou). */
  const liveTick = (b: BattleSummary, duration: number) => {
    const now = serverNow();
    if (now >= Date.parse(b.endsAt)) return null;
    return Math.max(0, Math.min(duration - 1, Math.round(((now - Date.parse(b.createdAt)) / 1000) * 30)));
  };

  // cria o player quando o replay e o resumo chegam
  useEffect(() => {
    if (!replay.data || !summary.data || !canvasRef.current) return;
    const p = new ArenaPlayer(canvasRef.current, replay.data);
    playerRef.current = p;
    (window as unknown as { __gbArena?: ArenaPlayer }).__gbArena = p; // usado pelo teste de sincronia
    p.setLow(low);
    p.onHud = setHud;
    p.onEnd = () => {
      setEnded(true);
      setPlaying(false);
      setLive(false);
    };
    const b = summary.data.battle;
    const tLive = liveTick(b, replay.data.duration);
    const tParam = Number(search.get('t'));
    const useParams = (tLive === null || testMode()) && (search.get('pause') === '1' || (Number.isFinite(tParam) && tParam > 0));
    let start: ReturnType<typeof setTimeout> | undefined;
    if (useParams) {
      p.seek(Number.isFinite(tParam) ? tParam : 0);
      // força HUD imediato para testes/pausa
      p.onHud?.({ t: p.simT, duration: p.replay.duration, ended: false, fighters: [0, 1].map((i) => {
        const v = p.fighterAt(i, p.simT);
        const f = p.replay.fighters[i];
        return { hp: v.hp, maxHp: f.maxHp, st: v.st, maxSt: f.maxSt, mp: v.mp, maxMp: f.maxMp, lives: v.lives, flags: v.flags };
      }) as HudState['fighters'] });
      if (search.get('pause') !== '1') {
        p.play();
        setPlaying(true);
      }
    } else if (tLive !== null) {
      // AO VIVO: entra no ponto em que a luta está agora, sem controles
      setLive(true);
      p.seek(tLive);
      p.play();
      setPlaying(true);
    } else {
      p.seek(0);
      start = setTimeout(() => {
        p.play();
        setPlaying(true);
      }, 700);
    }
    return () => {
      if (start) clearTimeout(start);
      p.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay.data, !!summary.data]);

  // ao vivo: volta a sincronizar quando o app volta a ficar visível e garante o fim no horário do servidor
  useEffect(() => {
    if (!live || !summary.data || !replay.data) return;
    const b = summary.data.battle;
    const dur = replay.data.duration;
    const resync = () => {
      const p = playerRef.current;
      if (!p || document.visibilityState !== 'visible') return;
      const t = liveTick(b, dur);
      if (t === null) {
        if (!p.playing || p.simT < dur - 5) p.seek(dur - 1);
        p.play();
        return;
      }
      if (Math.abs(p.simT - t) > 20) p.seek(t);
      if (!p.playing) p.play();
    };
    document.addEventListener('visibilitychange', resync);
    const iv = setInterval(resync, 3000);
    return () => {
      document.removeEventListener('visibilitychange', resync);
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, !!summary.data, replay.data]);

  useEffect(() => {
    const onResize = () => {
      playerRef.current?.resize();
      playerRef.current?.render();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const r0 = replay.data;
  const iAmFighter = !!r0 && r0.fighters.some((f) => f.id === user?.id);
  const locked = live && iAmFighter;

  // lutador no ao vivo: o botão "voltar" do celular/navegador não sai da luta
  useEffect(() => {
    if (!locked) return;
    const url = window.location.href;
    window.history.pushState({ gbLive: true }, '', url);
    const onPop = () => window.history.pushState({ gbLive: true }, '', url);
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [locked]);

  const p = playerRef.current;
  const toggle = () => {
    if (!p) return;
    if (ended) {
      setEnded(false);
      p.seek(0);
    }
    if (p.playing) {
      p.pause();
      setPlaying(false);
    } else {
      p.play();
      setPlaying(true);
    }
  };
  const changeSpeed = () => {
    const s = speed === 1 ? 2 : speed === 2 ? 0.5 : 1;
    setSpeed(s);
    if (p) p.speed = s;
  };
  const skip = () => {
    if (!p) return;
    p.seek(p.replay.duration - 60);
    if (!p.playing) {
      p.play();
      setPlaying(true);
    }
  };
  const toggleLow = () => {
    const v = !low;
    setLow(v);
    try {
      localStorage.setItem(LOW_KEY, v ? '1' : '0');
    } catch {
      /* ok */
    }
    p?.setLow(v);
    p?.render();
  };
  const fullscreen = async () => {
    try {
      await document.documentElement.requestFullscreen?.();
      await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
    } catch {
      /* nem todo navegador deixa */
    }
  };

  const r = replay.data;
  const b = summary.data?.battle;
  const myIndex = r ? r.fighters.findIndex((f) => f.id === user?.id) : -1;

  return (
    <div className="fixed inset-0 flex flex-col bg-black text-fg select-none">
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />

      {(replay.isLoading || summary.isLoading) && (
        <div className="absolute inset-0 grid place-items-center">
          <Spinner className="size-8" />
        </div>
      )}
      {replay.isError && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center">
          <div>
            <p className="text-muted">Não foi possível carregar a luta.</p>
            <Button className="mt-4" onClick={() => navigate('/arena')}>
              Voltar
            </Button>
          </div>
        </div>
      )}

      {/* HUD superior */}
      {r && (
        <div className="safe-top relative z-10 flex items-start gap-2 p-2 sm:gap-4 sm:p-4">
          {!locked && (
            <button
              onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/arena'))}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-black/50 text-white backdrop-blur"
              aria-label="Voltar"
            >
              <ArrowLeft className="size-4" />
            </button>
          )}
          <FighterCard side={0} user={r.fighters[0]} hud={hud?.fighters[0]} you={myIndex === 0} />
          <div className="hidden shrink-0 flex-col items-center pt-1 sm:flex">
            <span className="text-[10px] text-white/60">{MAPS_BY_ID[r.map]?.name}</span>
          </div>
          <FighterCard side={1} user={r.fighters[1]} hud={hud?.fighters[1]} you={myIndex === 1} />
        </div>
      )}

      {/* morte súbita: depois de um tempo o dano vai aumentando até alguém cair */}
      {r && (hud?.t ?? 0) > BALANCE.combat.suddenDeathAfterSec * 30 && !ended && (
        <div className="pointer-events-none absolute inset-x-0 top-24 z-10 flex justify-center sm:top-28">
          <span className="animate-pulse rounded-full bg-danger/85 px-3 py-1 text-xs font-bold tracking-wider text-white">MORTE SÚBITA · DANO AUMENTANDO</span>
        </div>
      )}

      {/* ao vivo: sem controles de vídeo */}
      {r && live && (
        <div className="safe-bottom relative z-10 mt-auto flex flex-col items-center gap-1.5 p-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-danger px-3 py-1 text-xs font-bold tracking-wide text-white">
            <span className="size-1.5 animate-pulse rounded-full bg-white" /> AO VIVO
          </span>
          {locked && <span className="rounded-full bg-black/55 px-3 py-1 text-[11px] text-white/80 backdrop-blur">Seu duelo está acontecendo. Assista até o fim!</span>}
          <Ctl onClick={() => setMuted(!muted)} label={muted ? 'Ligar som' : 'Desligar som'}>
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </Ctl>
        </div>
      )}

      {/* controles (replay) */}
      {r && !live && (
        <div className="safe-bottom relative z-10 mt-auto flex items-center justify-center gap-2 p-3">
          <Ctl onClick={toggle} label={playing ? 'Pausar' : 'Assistir'}>
            {playing ? <Pause className="size-4" /> : ended ? <RotateCcw className="size-4" /> : <Play className="size-4" />}
          </Ctl>
          <Ctl onClick={changeSpeed} label="Velocidade">
            <FastForward className="size-4" />
            <span className="text-xs font-bold">{speed}×</span>
          </Ctl>
          <Ctl onClick={skip} label="Pular para o fim">
            <SkipForward className="size-4" />
          </Ctl>
          <Ctl onClick={() => setMuted(!muted)} label={muted ? 'Ligar som' : 'Desligar som'}>
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </Ctl>
          <Ctl onClick={toggleLow} label="Gráficos baixos" active={low}>
            <Gauge className="size-4" />
            <span className="hidden text-xs sm:inline">{low ? 'Baixo' : 'Alto'}</span>
          </Ctl>
          <Ctl onClick={() => void fullscreen()} label="Tela cheia">
            <Maximize className="size-4" />
          </Ctl>
        </div>
      )}

      {/* resultado */}
      {ended && r && (
        <div className="absolute inset-0 z-20 grid animate-[fade-up_0.4s_ease-out] place-items-center bg-black/55 p-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-line-strong bg-surface-2 p-6 text-center">
            <Trophy className={clsx('mx-auto size-12', r.winner === null ? 'text-muted' : 'text-gold')} />
            <h2 className="mt-3 font-display text-3xl font-bold">
              {r.winner === null
                ? 'Empate'
                : myIndex === -1
                  ? `${r.fighters[r.winner].username} venceu`
                  : r.winner === myIndex
                    ? 'Vitória!'
                    : 'Derrota'}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {b?.mode === 'friendly' ? 'Luta de treino · sem recompensa' : b?.mode === 'ranked' ? 'Luta ranqueada' : ''}
            </p>
            <ResultDetails replay={r} summary={b} myIndex={myIndex} />
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={toggle} icon={<RotateCcw className="size-4" />}>
                Rever
              </Button>
              <Button onClick={() => navigate('/arena', { replace: true })}>Arena</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function fmt(ticks: number) {
  const s = Math.floor(ticks / 30);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function Ctl({ children, onClick, label, active }: { children: React.ReactNode; onClick: () => void; label: string; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={clsx(
        'flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-3 backdrop-blur transition active:scale-95',
        active ? 'bg-volt text-black' : 'bg-black/55 text-white hover:bg-black/70',
      )}
    >
      {children}
    </button>
  );
}

function FighterCard({ side, user, hud, you }: { side: 0 | 1; user: Replay['fighters'][0]; hud?: HudState['fighters'][0]; you: boolean }) {
  const pub: PublicUser = { id: user.id, username: user.username, level: user.level, title: user.title, avatar: user.look, equipment: user.equipment, photoUrl: null };
  const hp = hud ? hud.hp / hud.maxHp : 1;
  const col = side === 0 ? '#4aa8ff' : '#ff5a5f';
  return (
    <div className={clsx('min-w-0 flex-1 rounded-2xl bg-black/50 p-2 backdrop-blur sm:p-2.5', side === 1 && 'text-right')}>
      <div className={clsx('flex items-center gap-2', side === 1 && 'flex-row-reverse')}>
        <span className="block shrink-0 overflow-hidden rounded-full ring-2" style={{ ['--tw-ring-color' as string]: col }}>
          <AvatarBust look={pub.avatar} equipment={pub.equipment} size={34} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-bold sm:text-sm">
            {user.username} {you && <span className="text-volt">(você)</span>}
          </p>
          <div className={clsx('flex items-center gap-0.5', side === 1 && 'justify-end')}>
            <span className="mr-1 text-[10px] text-white/60">Nv {user.level}</span>
            {[0, 1, 2].map((i) => (
              <Heart key={i} className={clsx('size-3', hud && i < hud.lives ? 'fill-hp text-hp' : 'text-white/25')} />
            ))}
          </div>
        </div>
      </div>
      <Bar value={hp} color={hp > 0.5 ? '#3ddc97' : hp > 0.25 ? '#f5b544' : '#ff5a5f'} className="mt-1.5 h-2.5" label={hud ? `${Math.round(hud.hp)}` : ''} flip={side === 1} />
      <div className={clsx('mt-1 grid grid-cols-2 gap-1', side === 1 && 'direction-rtl')}>
        <Bar value={hud ? hud.st / hud.maxSt : 1} color="#3ddc97" className="h-1" flip={side === 1} dim />
        <Bar value={hud ? hud.mp / hud.maxMp : 1} color="#4aa8ff" className="h-1" flip={side === 1} dim />
      </div>
    </div>
  );
}

function Bar({ value, color, className, label, flip, dim }: { value: number; color: string; className?: string; label?: string; flip?: boolean; dim?: boolean }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={clsx('relative overflow-hidden rounded-full bg-white/12', className)}>
      <div
        className="absolute inset-y-0 transition-[width] duration-150"
        style={{ width: `${pct}%`, background: color, opacity: dim ? 0.8 : 1, [flip ? 'right' : 'left']: 0 }}
      />
      {label && <span className="absolute inset-0 grid place-items-center text-[8px] leading-none font-bold text-black/70">{label}</span>}
    </div>
  );
}

function ResultDetails({ replay, summary, myIndex }: { replay: Replay; summary?: BattleSummary; myIndex: number }) {
  const s = replay.stats;
  const rewards = summary?.result?.rewards;
  const mine = rewards?.find((x) => x.p === myIndex);
  const pr = summary?.result?.pr;
  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-xl bg-surface p-2">
          <p className="text-muted">Dano</p>
          <p className="font-display font-semibold tabular-nums">
            <span className="text-mana">{s.damage[0]}</span> · <span className="text-hp">{s.damage[1]}</span>
          </p>
        </div>
        <div className="rounded-xl bg-surface p-2">
          <p className="text-muted">Acertos</p>
          <p className="font-display font-semibold tabular-nums">
            <span className="text-mana">{s.hits[0]}</span> · <span className="text-hp">{s.hits[1]}</span>
          </p>
        </div>
        <div className="rounded-xl bg-surface p-2">
          <p className="text-muted">KOs</p>
          <p className="font-display font-semibold tabular-nums">
            <span className="text-mana">{s.kos[0]}</span> · <span className="text-hp">{s.kos[1]}</span>
          </p>
        </div>
      </div>
      {(mine || (pr && myIndex >= 0)) && (
        <div className="flex justify-center gap-3 text-sm font-semibold">
          {mine && mine.xp > 0 && <span className="text-xp">+{mine.xp} XP</span>}
          {mine && mine.gold > 0 && <span className="text-gold">+{mine.gold} ouro</span>}
          {pr && myIndex >= 0 && (
            <span className={pr[myIndex] >= 0 ? 'text-volt' : 'text-danger'}>
              {pr[myIndex] >= 0 ? '+' : ''}
              {pr[myIndex]} PR
            </span>
          )}
        </div>
      )}
      <Link to={`/u/${replay.fighters[replay.winner ?? 0].username}`} className="sr-only">
        Perfil do vencedor
      </Link>
    </div>
  );
}
