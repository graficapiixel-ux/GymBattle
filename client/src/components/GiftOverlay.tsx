/**
 * Aviso GRANDE de presente ("ITEM DESBLOQUEADO!" / "RECOMPENSA RECEBIDA!").
 * Explosão de luz, raios girando, confete e brilho na cor da raridade; o item
 * surge com zoom e tremida. Toque em qualquer lugar fecha. Vários presentes
 * pendentes aparecem um de cada vez.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { Coins, Sparkles } from 'lucide-react';
import {
  RARITY_COLOR, RARITY_LABEL, WEAPONS_BY_ID, parseArmorPieceId, EMPTY_EQUIPMENT,
  type Equipment, type GiftDTO, type Rarity,
} from '@gymbattle/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { nf } from '@/lib/format';
import { AvatarCanvas, WeaponIcon } from './AvatarCanvas';
import { sfxReward } from '@/game/audio/sfx';
import { unlockAudio } from '@/game/audio/engine';

const GOLD = '#f5b544';
const XP = '#a78bfa';

function colorOf(g: GiftDTO) {
  if (g.kind === 'ITEM') return RARITY_COLOR[(g.rarity ?? 'common') as Rarity] ?? '#ffffff';
  return g.kind === 'GOLD' ? GOLD : XP;
}

export function GiftOverlay() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, refetch } = useQuery({
    queryKey: ['gifts'],
    queryFn: () => api.get<{ gifts: GiftDTO[] }>('/me/gifts'),
    enabled: !!user,
    refetchInterval: 45_000,
    refetchOnWindowFocus: true,
  });
  const [closing, setClosing] = useState<string | null>(null);
  const gift = data?.gifts.find((g) => g.id !== closing) ?? null;

  // volta para o app (ou destrava a tela): procura presentes novos na hora
  useEffect(() => {
    const on = () => document.visibilityState === 'visible' && void refetch();
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [refetch]);

  const close = useCallback(async () => {
    if (!gift) return;
    setClosing(gift.id);
    try {
      await api.post(`/me/gifts/${gift.id}/seen`);
    } catch {
      /* tenta de novo na próxima */
    }
    qc.setQueryData<{ gifts: GiftDTO[] }>(['gifts'], (d) => (d ? { gifts: d.gifts.filter((x) => x.id !== gift.id) } : d));
    void qc.invalidateQueries({ queryKey: ['me'] });
    void qc.invalidateQueries({ queryKey: ['inventory'] });
    setClosing(null);
  }, [gift, qc]);

  // não interrompe uma luta passando na tela: mostra quando ela acabar
  const { pathname } = useLocation();
  // saiu de uma tela de luta: procura o espólio na hora
  useEffect(() => {
    if (!pathname.startsWith('/luta') && !pathname.startsWith('/chefe')) void refetch();
  }, [pathname, refetch]);
  if (!gift || !user || pathname.startsWith('/luta') || pathname.startsWith('/chefe')) return null;
  return <GiftScene key={gift.id} gift={gift} onClose={close} />;
}

function GiftScene({ gift, onClose }: { gift: GiftDTO; onClose: () => void }) {
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const color = colorOf(gift);
  const [ready, setReady] = useState(false);
  const isItem = gift.kind === 'ITEM';
  const title = isItem ? 'ITEM DESBLOQUEADO!' : 'RECOMPENSA RECEBIDA!';

  // só deixa fechar depois que o item apareceu (evita fechar sem querer)
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 900);
    unlockAudio();
    sfxReward(gift.kind === 'ITEM' ? (gift.rarity ?? 'common') : 'rare');
    if (navigator.vibrate) navigator.vibrate([30, 40, 60]);
    return () => clearTimeout(t);
  }, [gift]);

  useEffect(() => {
    const c = canvasRef.current!;
    const ctx = c.getContext('2d')!;
    let raf = 0;
    const start = performance.now();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      c.width = window.innerWidth * dpr;
      c.height = window.innerHeight * dpr;
    };
    resize();
    window.addEventListener('resize', resize);
    // confete e faíscas (determinístico a partir do índice)
    const N = window.innerWidth < 500 ? 110 : 170;
    const parts = Array.from({ length: N }, (_, i) => {
      const r = (k: number) => {
        const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
        return x - Math.floor(x);
      };
      return {
        ang: r(1) * Math.PI * 2,
        speed: 260 + r(2) * 720,
        size: 3 + r(3) * 7,
        spin: (r(4) - 0.5) * 14,
        delay: r(5) * 0.25,
        kind: r(6) < 0.55 ? 'confetti' : 'spark',
        hue: [color, '#ffffff', GOLD, color, '#ffe9a8'][Math.floor(r(7) * 5)],
        drift: (r(8) - 0.5) * 80,
      };
    });
    const frame = (now: number) => {
      // o 1º quadro do rAF pode vir com horário anterior ao início
      const t = Math.max(0, (now - start) / 1000);
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h * 0.4;
      // fundo escurecendo
      ctx.fillStyle = `rgba(4,4,8,${Math.min(0.93, t * 3)})`;
      ctx.fillRect(0, 0, w, h);
      // brilho na cor da raridade
      const R = Math.max(w, h);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.6);
      g.addColorStop(0, color + 'aa');
      g.addColorStop(0.25, color + '33');
      g.addColorStop(1, 'transparent');
      ctx.globalAlpha = Math.min(1, t * 2) * (0.8 + 0.2 * Math.sin(t * 3));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      // raios girando
      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalCompositeOperation = 'lighter';
      const rays = 16;
      for (let layer = 0; layer < 2; layer++) {
        ctx.rotate(t * (layer ? -0.25 : 0.4));
        for (let i = 0; i < rays; i++) {
          const a = (i / rays) * Math.PI * 2;
          const len = R * (0.7 + 0.15 * Math.sin(t * 2 + i));
          const wid = layer ? 0.05 : 0.09;
          const grad = ctx.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
          grad.addColorStop(0, (layer ? '#ffffff' : color) + '66');
          grad.addColorStop(1, 'transparent');
          ctx.fillStyle = grad;
          ctx.globalAlpha = Math.min(1, Math.max(0, (t - 0.15) * 2)) * 0.55;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, len, a - wid, a + wid);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();
      // explosão de luz inicial
      const flash = Math.max(0, 1 - t * 2.2);
      if (flash > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * (0.2 + t));
        fg.addColorStop(0, `rgba(255,255,255,${flash})`);
        fg.addColorStop(0.4, color + Math.round(flash * 200).toString(16).padStart(2, '0'));
        fg.addColorStop(1, 'transparent');
        ctx.fillStyle = fg;
        ctx.fillRect(0, 0, w, h);
        // anel de choque
        ctx.strokeStyle = `rgba(255,255,255,${flash})`;
        ctx.lineWidth = 6 * flash + 1;
        ctx.beginPath();
        ctx.arc(cx, cy, t * R * 1.2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      // partículas
      for (const p of parts) {
        const lt = t - 0.12 - p.delay;
        if (lt < 0) continue;
        const k = 1 - Math.exp(-lt * 2.2);
        const x = cx + Math.cos(p.ang) * p.speed * k * 0.9 + p.drift * lt;
        const y = cy + Math.sin(p.ang) * p.speed * k * 0.7 + 140 * lt * lt;
        const life = Math.max(0, 1 - lt / 3.2);
        if (life <= 0 || y > h + 20) continue;
        ctx.save();
        ctx.globalAlpha = life;
        ctx.translate(x, y);
        if (p.kind === 'confetti') {
          ctx.rotate(p.spin * lt);
          ctx.scale(1, Math.cos(lt * p.spin * 0.7));
          ctx.fillStyle = p.hue;
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = p.hue;
          ctx.shadowColor = p.hue;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(0, 0, p.size * 0.35 * life + 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      // faíscas subindo sem parar (depois da explosão)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 40; i++) {
        const s = (Math.sin(i * 91.3) * 43758.5) % 1;
        const ph = (t * (0.25 + Math.abs(s) * 0.3) + i / 40) % 1;
        const x = cx + Math.sin(i * 7.7 + t) * (60 + (i % 9) * 18);
        const y = cy + 120 - ph * 320;
        ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.8 * Math.min(1, t);
        ctx.fillStyle = i % 3 ? color : '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, 1.5 + (i % 3), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [color]);

  // prévia da armadura: o próprio guerreiro vestindo a peça
  const armorEq = useMemo<Equipment | null>(() => {
    if (!isItem || gift.itemKind !== 'armor' || !gift.itemId || !user) return null;
    const a = parseArmorPieceId(gift.itemId);
    if (!a) return null;
    return { ...EMPTY_EQUIPMENT, ...user.equipment, [a.slot]: gift.itemId } as Equipment;
  }, [gift, isItem, user]);
  const weapon = isItem && gift.itemId ? WEAPONS_BY_ID[gift.itemId] : undefined;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[100] cursor-pointer select-none overflow-hidden"
      onClick={() => ready && onClose()}
      onKeyDown={(e) => ready && (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') && onClose()}
      tabIndex={-1}
      ref={(el) => el?.focus()}
    >
      <canvas ref={canvasRef} className="absolute inset-0 size-full" aria-hidden />
      <div className="relative flex h-full flex-col items-center px-6 pt-[18dvh] text-center">
        <p
          className="gift-title font-display text-[clamp(28px,8.5vw,56px)] font-black leading-none tracking-tight text-white"
          style={{ textShadow: `0 0 24px ${color}, 0 0 60px ${color}aa, 0 4px 0 rgba(0,0,0,.6)` }}
        >
          {title}
        </p>

        <div className="gift-item relative mt-8 grid place-items-center" style={{ filter: `drop-shadow(0 0 28px ${color})` }}>
          {weapon ? (
            <WeaponIcon weapon={weapon} size={170} />
          ) : armorEq && user ? (
            <AvatarCanvas look={user.avatar} equipment={armorEq} size={210} ground={false} />
          ) : gift.kind === 'GOLD' ? (
            <span className="grid size-36 place-items-center rounded-full" style={{ background: `radial-gradient(circle, ${GOLD}55, transparent 70%)` }}>
              <Coins className="size-24" style={{ color: GOLD }} strokeWidth={1.6} />
            </span>
          ) : (
            <span className="grid size-36 place-items-center rounded-full" style={{ background: `radial-gradient(circle, ${XP}55, transparent 70%)` }}>
              <Sparkles className="size-24" style={{ color: XP }} strokeWidth={1.6} />
            </span>
          )}
        </div>

        <div className="gift-text mt-6">
          {isItem ? (
            <>
              <p className="font-display text-2xl font-bold text-white">{gift.itemName}</p>
              {gift.rarity && (
                <p className="mt-1 text-sm font-black uppercase tracking-[0.25em]" style={{ color }}>
                  {RARITY_LABEL[gift.rarity as Rarity] ?? gift.rarity}
                </p>
              )}
            </>
          ) : (
            <p className="font-display text-5xl font-black tabular-nums" style={{ color, textShadow: `0 0 20px ${color}` }}>
              +{nf.format(gift.amount)} <span className="text-3xl">{gift.kind === 'GOLD' ? 'de ouro' : 'XP'}</span>
            </p>
          )}
          {gift.reason && (
            <p className="mx-auto mt-5 max-w-sm rounded-2xl border border-white/15 bg-black/45 px-4 py-2.5 text-base text-white/90 backdrop-blur">
              <span className="text-white/55">Motivo:</span> {gift.reason}
            </p>
          )}
        </div>

        <p className={`mt-auto mb-[max(28px,env(safe-area-inset-bottom))] text-xs text-white/50 transition-opacity duration-500 ${ready ? 'opacity-100' : 'opacity-0'}`}>
          Toque em qualquer lugar para continuar
        </p>
      </div>
    </div>
  );
}
