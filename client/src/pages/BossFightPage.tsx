/** Telas das lutas dos eventos: boss, PvP em equipes e waves (o desenho vem do kit protegido do servidor). */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, RotateCcw, Volume2, VolumeX, Swords, FastForward, SkipForward } from 'lucide-react';
import type { BossReplay, EventKind, TeamReplay } from '@gymbattle/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { loadBossKit } from '@/lib/bosskit';
import { isMuted, onMutedChange, setMuted, unlockAudio } from '@/game/audio/engine';
import { Button, Spinner } from '@/components/ui';

export default function BossFightPage() {
  const { runId = '' } = useParams();
  const { data, error } = useQuery({
    queryKey: ['boss-replay', runId],
    queryFn: () => api.get<{ kind?: EventKind; replay: BossReplay | TeamReplay }>(`/events/runs/${runId}/replay`),
    retry: false,
    staleTime: Infinity,
  });
  if (error) {
    return (
      <div className="grid min-h-dvh place-items-center bg-black p-6 text-center text-white">
        <div>
          <p className="font-semibold">Não foi possível abrir essa luta.</p>
          <p className="mt-1 text-sm text-white/60">{(error as Error).message}</p>
          <Button className="mt-5" onClick={() => history.back()}>
            Voltar
          </Button>
        </div>
      </div>
    );
  }
  if (!data) return <div className="grid min-h-dvh place-items-center bg-black"><Spinner /></div>;
  if (data.kind === 'PVP' || data.kind === 'WAVES') return <TeamFightView replay={data.replay as TeamReplay} />;
  return <BossFightView replay={data.replay as BossReplay} />;
}

/** Luta em equipe (PvP em equipes ou waves). Também usada na prévia do admin (com `onClose`). */
export function TeamFightView({ replay, onClose }: { replay: TeamReplay; onClose?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [ended, setEnded] = useState(false);
  const [kitError, setKitError] = useState<string | null>(null);
  const [muted, setMutedState] = useState(isMuted());
  const [round, setRound] = useState(0);
  const [speed, setSpeed] = useState(1);
  const battleRef = useRef<{ setSpeed(s: number): void; seek(t: number): void; sound: boolean } | null>(null);
  useEffect(() => {
    const off = onMutedChange(setMutedState);
    return () => void off();
  }, []);
  const mine = replay.units.find((u) => u.userId && u.userId === user?.id);
  const myTeam = replay.mode === 'waves' ? 0 : mine ? mine.team : null;

  useEffect(() => {
    let battle: { play(): void; destroy(): void; resize(): void; setSpeed(s: number): void; seek(t: number): void; sound: boolean } | null = null;
    let alive = true;
    setEnded(false);
    setSpeed(1);
    unlockAudio();
    loadBossKit()
      .then((kit) => {
        if (!alive || !ref.current) return;
        const b = new kit.TeamBattle(ref.current, replay, {
          myTeam,
          onEnd: () => {
            setEnded(true);
            void qc.invalidateQueries({ queryKey: ['boss-events'] });
            void qc.invalidateQueries({ queryKey: ['me'] });
            void qc.invalidateQueries({ queryKey: ['gifts'] });
          },
        });
        battle = b;
        battleRef.current = b;
        b.play();
      })
      .catch(() => setKitError('Não foi possível carregar a luta. Verifique a internet e tente de novo.'));
    const onResize = () => battle?.resize();
    window.addEventListener('resize', onResize);
    return () => {
      alive = false;
      window.removeEventListener('resize', onResize);
      battle?.destroy();
      battleRef.current = null;
    };
  }, [replay, round, qc, myTeam]);

  const leave = () => (onClose ? onClose() : navigate('/arena'));
  const won = replay.winner !== null && replay.winner === myTeam;
  const title = replay.mode === 'waves' ? replay.teamNames[1] : `${replay.teamNames[0]} vs ${replay.teamNames[1]}`;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col bg-black">
      <div className="safe-top flex h-14 items-center gap-2 px-3 text-white">
        <button onClick={leave} className="grid size-10 place-items-center rounded-full bg-white/10" aria-label="Sair">
          <ArrowLeft className="size-5" />
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">
          {title} <span className="font-normal text-white/60">{replay.mode === 'waves' ? 'Waves' : 'PvP em equipes'}</span>
        </p>
        {!ended && (
          <>
            <button
              onClick={() => {
                const s = speed === 1 ? 2 : speed === 2 ? 4 : 1;
                setSpeed(s);
                battleRef.current?.setSpeed(s);
              }}
              className="flex h-10 items-center gap-1 rounded-full bg-white/10 px-3 text-xs font-bold tabular-nums"
              aria-label="Velocidade"
            >
              <FastForward className="size-4" /> {speed}×
            </button>
            <button onClick={() => battleRef.current?.seek(replay.duration)} className="grid size-10 place-items-center rounded-full bg-white/10" aria-label="Pular para o fim">
              <SkipForward className="size-5" />
            </button>
          </>
        )}
        <button
          onClick={() => setMuted(!muted)}
          className="grid size-10 place-items-center rounded-full bg-white/10"
          aria-label={muted ? 'Ligar som' : 'Desligar som'}
        >
          {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
        </button>
      </div>
      <div className="relative flex-1">
        <canvas ref={ref} className="absolute inset-0 size-full" />
        {kitError && <p className="absolute inset-x-0 top-1/3 px-6 text-center text-sm text-white/80">{kitError}</p>}
        {ended && (
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-4 pb-[max(16px,env(safe-area-inset-bottom))] animate-fade-up">
            {won && !onClose && <p className="text-center text-sm font-semibold text-amber-300">Seu espólio foi entregue! Ele aparece quando você voltar ao app.</p>}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={() => setRound((r) => r + 1)}>
                Ver de novo
              </Button>
              <Button icon={<Swords className="size-4" />} onClick={leave}>
                {onClose ? 'Fechar' : 'Voltar à Arena'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Também usado na prévia do admin (com `onClose`). */
export function BossFightView({ replay, onClose }: { replay: BossReplay; onClose?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [ended, setEnded] = useState(false);
  const [kitError, setKitError] = useState<string | null>(null);
  const [muted, setMutedState] = useState(isMuted());
  const [round, setRound] = useState(0);
  useEffect(() => {
    const off = onMutedChange(setMutedState);
    return () => void off();
  }, []);

  useEffect(() => {
    let battle: { play(): void; destroy(): void; resize(): void } | null = null;
    let alive = true;
    setEnded(false);
    unlockAudio();
    loadBossKit()
      .then((kit) => {
        if (!alive || !ref.current) return;
        const b = new kit.BossBattle(ref.current, replay, {
          onEnd: () => {
            setEnded(true);
            // espólio e tentativas atualizados
            void qc.invalidateQueries({ queryKey: ['boss-events'] });
            void qc.invalidateQueries({ queryKey: ['me'] });
            void qc.invalidateQueries({ queryKey: ['gifts'] });
          },
        });
        battle = b;
        b.play();
      })
      .catch(() => setKitError('Não foi possível carregar a luta. Verifique a internet e tente de novo.'));
    const onResize = () => battle?.resize();
    window.addEventListener('resize', onResize);
    return () => {
      alive = false;
      window.removeEventListener('resize', onResize);
      battle?.destroy();
    };
  }, [replay, round, qc]);

  const leave = () => (onClose ? onClose() : navigate('/arena'));

  // em tela cheia de verdade (fora de qualquer container da página)
  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col bg-black">
      <div className="safe-top flex h-14 items-center gap-2 px-3 text-white">
        <button onClick={leave} className="grid size-10 place-items-center rounded-full bg-white/10" aria-label="Sair">
          <ArrowLeft className="size-5" />
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">
          {replay.boss.name} <span className="font-normal text-white/60">{replay.boss.title}</span>
        </p>
        <button
          onClick={() => setMuted(!muted)}
          className="grid size-10 place-items-center rounded-full bg-white/10"
          aria-label={muted ? 'Ligar som' : 'Desligar som'}
        >
          {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
        </button>
      </div>
      <div className="relative flex-1">
        <canvas ref={ref} className="absolute inset-0 size-full" />
        {kitError && <p className="absolute inset-x-0 top-1/3 px-6 text-center text-sm text-white/80">{kitError}</p>}
        {ended && (
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-4 pb-[max(16px,env(safe-area-inset-bottom))] animate-fade-up">
            {replay.won && !onClose && (
              <p className="text-center text-sm font-semibold text-amber-300">Seu espólio foi entregue! Ele aparece quando você voltar ao app.</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={() => setRound((r) => r + 1)}>
                Ver de novo
              </Button>
              <Button icon={<Swords className="size-4" />} onClick={leave}>
                {onClose ? 'Fechar' : 'Voltar à Arena'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
