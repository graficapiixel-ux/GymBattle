import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Sparkles, Coins, Flame, ArrowUpCircle, Info, RotateCcw } from 'lucide-react';
import type { MeUser, PostDTO, PostRewardDTO } from '@gymbattle/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Alert, Button, Card } from '@/components/ui';
import { useToday } from './Feed';

/** Tamanho máximo da foto enviada (o servidor processa de novo). */
const MAX_SIDE = 1600;

/** Desenha a imagem reduzida num canvas e gera um JPEG leve (até ~2 MB). */
async function toJpeg(src: CanvasImageSource, w: number, h: number): Promise<Blob | null> {
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  for (const q of [0.88, 0.8, 0.7]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', q));
    if (blob && blob.size <= 2_000_000) return blob;
    if (q === 0.7) return blob;
  }
  return null;
}

/** Diminui a foto no aparelho (usado só quando ela é muito grande ou não é JPEG). */
async function shrink(file: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const out = await toJpeg(bmp, bmp.width, bmp.height);
    bmp.close();
    if (out) return out;
  } catch {
    /* tenta via <img> */
  }
  try {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const out = await toJpeg(img, img.naturalWidth, img.naturalHeight);
      if (out) return out;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    /* manda a original */
  }
  return file;
}

/** Foto até este tamanho vai inteira (com os dados da câmera, que provam quando foi tirada). */
const KEEP_ORIGINAL_BYTES = 12 * 1024 * 1024;
/** A foto precisa ter sido tirada há no máximo isso. */
const MAX_AGE_MS = 5 * 60_000;

export default function PostPage() {
  const { setUser } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: today } = useToday();
  const inputRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ post: PostDTO; reward: PostRewardDTO | null; user: MeUser } | null>(null);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  /** Abre a CÂMERA do celular direto (sem galeria). */
  function openCamera() {
    setError(null);
    const el = inputRef.current;
    if (!el) return;
    el.value = '';
    el.click();
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    // foto velha = veio da galeria, não da câmera agora
    if (file.lastModified && Date.now() - file.lastModified > MAX_AGE_MS) {
      setError('Essa foto não foi tirada agora. Toque em “Tirar foto do treino” e fotografe na hora.');
      return;
    }
    setPreparing(true);
    try {
      const [tk, upload] = await Promise.all([
        api.post<{ token: string }>('/posts/capture-token').then((r) => r.token),
        file.type === 'image/jpeg' && file.size <= KEEP_ORIGINAL_BYTES ? Promise.resolve(file as Blob) : shrink(file),
      ]);
      setPhoto(upload);
      setToken(tk);
      setPreview(URL.createObjectURL(upload));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreparing(false);
    }
  }

  function retake() {
    setPhoto(null);
    setToken(null);
    setPreview(null);
    openCamera();
  }

  async function submit() {
    if (!photo || !token) return;
    setSending(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('photo', photo, 'treino.jpg');
      fd.append('captureToken', token);
      if (caption.trim()) fd.append('caption', caption.trim());
      const r = await api.post<{ post: PostDTO; reward: PostRewardDTO | null; user: MeUser }>('/posts', fd);
      setUser(r.user);
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['today'] });
      setResult(r);
    } catch (e) {
      // a "senha" da foto é de uso único: se deu erro, precisa tirar outra
      setToken(null);
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (result) return <RewardView result={result} onDone={() => navigate('/')} />;

  return (
    <div className="animate-fade-up space-y-4">
      {/* capture = abre direto a câmera do celular (sem opção de galeria) */}
      <input ref={inputRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onPhoto(e.target.files?.[0])} />

      {today && (
        <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-muted" />
          {today.rewardAvailable ? (
            <p className="text-muted">
              Seu primeiro post de hoje vale <b className="text-volt">+{today.nextReward.xp} XP</b> e{' '}
              <b className="text-gold">+{today.nextReward.gold} de ouro</b>.
            </p>
          ) : (
            <p className="text-muted">Você já ganhou a recompensa de hoje. Pode postar mais, mas extras não rendem XP nem ouro.</p>
          )}
        </div>
      )}

      {!preview ? (
        <button
          onClick={openCamera}
          disabled={preparing}
          className="group flex h-[44dvh] min-h-64 w-full flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-line-strong bg-surface transition hover:border-volt/50 active:scale-[0.99]"
        >
          <span className="grid size-20 place-items-center rounded-full bg-volt text-black shadow-[0_0_60px_-10px_var(--color-volt)] transition group-active:scale-95">
            <Camera className="size-9" />
          </span>
          <span className="text-center">
            <span className="block font-display text-lg font-semibold">{preparing ? 'Preparando a foto…' : 'Tirar foto do treino'}</span>
            <span className="mt-1 block text-sm text-muted">Abre a câmera: a foto é tirada na hora</span>
          </span>
        </button>
      ) : (
        <Card className="overflow-hidden">
          <div className="relative bg-surface-2">
            <img src={preview} alt="Prévia" className="max-h-[60dvh] w-full object-contain" />
            <button
              onClick={retake}
              className="absolute top-3 right-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-black/60 px-3 text-sm text-white backdrop-blur"
              aria-label="Tirar outra"
            >
              <RotateCcw className="size-4" /> Tirar outra
            </button>
          </div>
          <div className="space-y-3 p-4">
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={280}
              rows={2}
              placeholder="Legenda (opcional) — ex.: Dia de costas 🔥"
              className="w-full resize-none rounded-xl border border-line-strong bg-surface px-4 py-3 outline-none focus:border-volt/60"
            />
            {error && <Alert>{error}</Alert>}
            {token ? (
              <Button size="lg" className="w-full" loading={sending} onClick={submit}>
                Publicar treino
              </Button>
            ) : (
              <Button size="lg" className="w-full" icon={<Camera className="size-4" />} onClick={retake}>
                Tirar outra foto
              </Button>
            )}
          </div>
        </Card>
      )}

      {error && !preview && <Alert>{error}</Alert>}

      <p className="px-2 text-center text-xs text-subtle">
        Só vale foto tirada na hora pela câmera (fotos antigas da galeria são recusadas). Fotos repetidas ou da internet são bloqueadas
        e podem ser marcadas como fake (você perde o XP e a streak). As fotos somem do feed depois de 7 dias.
      </p>
    </div>
  );
}

function RewardView({ result, onDone }: { result: { reward: PostRewardDTO | null; user: MeUser }; onDone: () => void }) {
  const r = result.reward;
  return (
    <div className="animate-pop flex flex-col items-center px-4 pt-6 text-center">
      {r ? (
        <>
          <div className="relative">
            <div className="absolute inset-0 animate-pulse rounded-full bg-volt/25 blur-2xl" />
            <div className="relative grid size-24 place-items-center rounded-full bg-volt text-black">
              <Sparkles className="size-11" />
            </div>
          </div>
          <h2 className="mt-6 font-display text-3xl font-bold">Treino registrado!</h2>
          <p className="mt-1 text-muted">Constância é o que faz o guerreiro.</p>
          <div className="mt-7 grid w-full max-w-sm grid-cols-3 gap-2.5">
            <RewardTile icon={<Sparkles className="size-4 text-xp" />} value={`+${r.xp}`} label="XP" />
            <RewardTile icon={<Coins className="size-4 text-gold" />} value={`+${r.gold}`} label="Ouro" />
            <RewardTile icon={<Flame className="size-4 text-orange-400" />} value={r.streak} label={r.streak === 1 ? 'dia' : 'dias'} />
          </div>
          {r.bonus > 0 && <p className="mt-3 text-sm text-volt">Bônus de streak: +{Math.round(r.bonus * 100)}%</p>}
          {r.levelsGained > 0 && (
            <div className="mt-5 flex w-full max-w-sm items-center gap-3 rounded-2xl border border-volt/30 bg-volt/10 p-4 text-left">
              <ArrowUpCircle className="size-8 shrink-0 text-volt" />
              <div>
                <p className="font-semibold">Subiu para o nível {result.user.level}!</p>
                <p className="text-sm text-muted">
                  +{r.levelsGained} ponto{r.levelsGained > 1 ? 's' : ''} de atributo.{' '}
                  <Link to="/perfil" className="font-semibold text-volt">
                    Distribuir
                  </Link>
                </p>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="grid size-20 place-items-center rounded-full bg-surface-2">
            <Camera className="size-9 text-muted" />
          </div>
          <h2 className="mt-6 font-display text-2xl font-bold">Post publicado!</h2>
          <p className="mt-1 max-w-xs text-muted">Você já tinha ganhado a recompensa de hoje. Amanhã tem mais!</p>
        </>
      )}
      <Button size="lg" className="mt-8 w-full max-w-sm" onClick={onDone}>
        Ver no feed
      </Button>
    </div>
  );
}

function RewardTile({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <div className="flex justify-center">{icon}</div>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
