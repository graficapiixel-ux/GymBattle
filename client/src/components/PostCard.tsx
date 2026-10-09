import { useRef, useState, type FormEvent } from 'react';
import clsx from 'clsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart, MessageCircle, MoreHorizontal, Flag, Trash2, ShieldAlert, Send, Sparkles, Clock } from 'lucide-react';
import { REPORT_REASONS, type CommentDTO, type MeUser, type PostDTO } from '@gymbattle/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { daysLeft, timeAgo } from '@/lib/format';
import { Avatar, UserChip } from './UserChip';
import { Button, Sheet, Spinner, toast } from './ui';

export function PostCard({ post, onRemoved }: { post: PostDTO; onRemoved?: (id: string) => void }) {
  const { user } = useAuth();
  const [liked, setLiked] = useState(post.likedByMe);
  const [likes, setLikes] = useState(post.likeCount);
  const [comments, setComments] = useState(post.commentCount);
  const [burst, setBurst] = useState(0);
  const [menu, setMenu] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const lastTap = useRef(0);
  const mine = user?.id === post.author.id;
  const left = daysLeft(post.expiresAt);

  async function toggleLike(force?: boolean) {
    const next = force ?? !liked;
    if (next === liked) return;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    try {
      const r = next
        ? await api.post<{ likeCount: number }>(`/posts/${post.id}/like`)
        : await api.del<{ likeCount: number }>(`/posts/${post.id}/like`);
      setLikes(r.likeCount);
    } catch (e) {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
      toast((e as Error).message, 'error');
    }
  }

  function onImageTap() {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      setBurst((b) => b + 1);
      void toggleLike(true);
    }
    lastTap.current = now;
  }

  return (
    <article className="animate-fade-up overflow-hidden rounded-2xl border border-line bg-surface">
      <header className="flex items-center gap-2 p-3">
        <UserChip user={post.author} sub={timeAgo(post.createdAt)} />
        <button
          onClick={() => setMenu(true)}
          className="ml-auto grid size-9 shrink-0 place-items-center rounded-full text-subtle hover:bg-surface-2 hover:text-fg"
          aria-label="Mais opções"
        >
          <MoreHorizontal className="size-5" />
        </button>
      </header>

      <div
        className="relative w-full select-none bg-surface-2"
        style={{ aspectRatio: `${post.width} / ${Math.min(post.height, post.width * 1.35)}` }}
        onClick={onImageTap}
      >
        <img
          src={post.imageUrl}
          alt={post.caption ?? `Treino de ${post.author.username}`}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="absolute inset-0 size-full object-cover"
        />
        {burst > 0 && (
          <Heart
            key={burst}
            className="pointer-events-none absolute top-1/2 left-1/2 size-24 animate-[heart_0.8s_ease-out_forwards] fill-white text-white drop-shadow-xl"
          />
        )}
        {post.rewarded && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-volt backdrop-blur">
            <Sparkles className="size-3" /> +{post.xpAwarded} XP
          </span>
        )}
      </div>

      <div className="p-3 pt-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => void toggleLike()}
            className="flex h-10 items-center gap-1.5 rounded-full px-2 transition active:scale-90"
            aria-pressed={liked}
            aria-label={liked ? 'Descurtir' : 'Curtir'}
          >
            <Heart className={clsx('size-6 transition', liked ? 'fill-hp text-hp' : 'text-fg')} />
            <span className="text-sm font-semibold tabular-nums">{likes}</span>
          </button>
          <button
            onClick={() => setCommentsOpen(true)}
            className="flex h-10 items-center gap-1.5 rounded-full px-2 transition active:scale-90"
            aria-label="Comentários"
          >
            <MessageCircle className="size-6" />
            <span className="text-sm font-semibold tabular-nums">{comments}</span>
          </button>
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-subtle" title="Fotos são apagadas após 7 dias">
            <Clock className="size-3" />
            {left <= 1 ? 'some amanhã' : `some em ${left} dias`}
          </span>
        </div>
        {post.caption && (
          <p className="mt-1 px-2 text-sm">
            <span className="font-semibold">{post.author.username}</span> <span className="text-muted">{post.caption}</span>
          </p>
        )}
      </div>

      <PostMenu
        open={menu}
        onClose={() => setMenu(false)}
        post={post}
        mine={mine}
        isAdmin={!!user?.isAdmin}
        onRemoved={() => onRemoved?.(post.id)}
      />
      <CommentsSheet
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        postId={post.id}
        onCount={(d) => setComments((n) => n + d)}
      />
    </article>
  );
}

function PostMenu({
  open, onClose, post, mine, isAdmin, onRemoved,
}: { open: boolean; onClose: () => void; post: PostDTO; mine: boolean; isAdmin: boolean; onRemoved: () => void }) {
  const { setUser } = useAuth();
  const qc = useQueryClient();
  const [view, setView] = useState<'menu' | 'report' | 'confirmDelete' | 'confirmFake'>('menu');
  const [busy, setBusy] = useState(false);
  const close = () => {
    onClose();
    setTimeout(() => setView('menu'), 200);
  };

  async function report(reason: string) {
    setBusy(true);
    try {
      await api.post(`/posts/${post.id}/report`, { reason });
      toast('Denúncia enviada. Obrigado!');
      close();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const r = await api.del<{ user: MeUser }>(`/posts/${post.id}`);
      setUser(r.user);
      toast('Post apagado.');
      onRemoved();
      close();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function markFake() {
    setBusy(true);
    try {
      const r = await api.post<{ xpRemoved: number; goldRemoved: number }>(`/admin/posts/${post.id}/fake`);
      toast(`Foto removida. −${r.xpRemoved} XP, −${r.goldRemoved} ouro.`);
      qc.invalidateQueries({ queryKey: ['admin-reports'] });
      onRemoved();
      close();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const title =
    view === 'report' ? 'Denunciar foto' : view === 'confirmDelete' ? 'Apagar post?' : view === 'confirmFake' ? 'Marcar como FAKE?' : 'Opções';

  return (
    <Sheet open={open} onClose={close} title={title}>
      {view === 'menu' && (
        <div className="flex flex-col gap-2">
          {!mine && (
            <MenuItem icon={<Flag className="size-4" />} onClick={() => setView('report')} disabled={post.reportedByMe}>
              {post.reportedByMe ? 'Você já denunciou' : 'Denunciar foto'}
            </MenuItem>
          )}
          {mine && (
            <MenuItem icon={<Trash2 className="size-4" />} danger onClick={() => setView('confirmDelete')}>
              Apagar meu post
            </MenuItem>
          )}
          {isAdmin && !mine && (
            <MenuItem icon={<ShieldAlert className="size-4" />} danger onClick={() => setView('confirmFake')}>
              Marcar como FAKE (admin)
            </MenuItem>
          )}
        </div>
      )}
      {view === 'report' && (
        <div className="flex flex-col gap-2">
          {REPORT_REASONS.map((r) => (
            <MenuItem key={r.id} onClick={() => void report(r.id)} disabled={busy}>
              {r.label}
            </MenuItem>
          ))}
        </div>
      )}
      {view === 'confirmDelete' && (
        <Confirm
          text={post.rewarded ? `A recompensa deste post (+${post.xpAwarded} XP, +${post.goldAwarded} ouro) será removida.` : 'O post será apagado.'}
          action="Apagar"
          busy={busy}
          onCancel={() => setView('menu')}
          onConfirm={remove}
        />
      )}
      {view === 'confirmFake' && (
        <Confirm
          text={`A foto será apagada, ${post.author.username} perde ${post.xpAwarded} XP e ${post.goldAwarded} de ouro (pode ficar negativo) e a streak é zerada.`}
          action="Marcar FAKE"
          busy={busy}
          onCancel={() => setView('menu')}
          onConfirm={markFake}
        />
      )}
    </Sheet>
  );
}

function MenuItem({ icon, children, onClick, danger, disabled }: { icon?: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'flex h-12 items-center gap-3 rounded-xl bg-surface px-4 text-left text-sm font-medium transition hover:bg-surface-3 disabled:opacity-40',
        danger && 'text-danger',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function Confirm({ text, action, busy, onCancel, onConfirm }: { text: string; action: string; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <>
      <p className="text-sm text-muted">{text}</p>
      <div className="mt-5 flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onCancel}>
          Voltar
        </Button>
        <Button variant="danger" className="flex-1" loading={busy} onClick={onConfirm}>
          {action}
        </Button>
      </div>
    </>
  );
}

function CommentsSheet({ open, onClose, postId, onCount }: { open: boolean; onClose: () => void; postId: string; onCount: (d: number) => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const key = ['comments', postId];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => api.get<{ comments: CommentDTO[] }>(`/posts/${postId}/comments`),
    enabled: open,
  });

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      const r = await api.post<{ comment: CommentDTO }>(`/posts/${postId}/comments`, { text });
      qc.setQueryData<{ comments: CommentDTO[] }>(key, (d) => ({ comments: [...(d?.comments ?? []), r.comment] }));
      onCount(1);
      setText('');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSending(false);
    }
  }

  async function remove(id: string) {
    try {
      await api.del(`/posts/${postId}/comments/${id}`);
      qc.setQueryData<{ comments: CommentDTO[] }>(key, (d) => ({ comments: (d?.comments ?? []).filter((c) => c.id !== id) }));
      onCount(-1);
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Comentários">
      <div className="-mx-1 max-h-[50dvh] min-h-24 overflow-y-auto px-1">
        {isLoading && <Spinner className="mx-auto my-6" />}
        {data?.comments.length === 0 && <p className="py-8 text-center text-sm text-muted">Seja o primeiro a comentar 💬</p>}
        <ul className="space-y-3.5">
          {data?.comments.map((c) => (
            <li key={c.id} className="group flex gap-2.5">
              <Avatar user={c.author} size={30} />
              <div className="min-w-0 flex-1 text-sm">
                <span className="font-semibold">{c.author.username}</span>{' '}
                <span className="break-words text-muted">{c.text}</span>
                <p className="mt-0.5 text-[11px] text-subtle">{timeAgo(c.createdAt)}</p>
              </div>
              {(c.mine || user?.isAdmin) && (
                <button onClick={() => void remove(c.id)} className="self-start p-1 text-subtle hover:text-danger" aria-label="Apagar comentário">
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
      <form onSubmit={send} className="mt-4 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder="Escreva um comentário…"
          className="h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-4 outline-none focus:border-volt/60"
        />
        <Button type="submit" loading={sending} disabled={!text.trim()} aria-label="Enviar" className="w-11 px-0">
          {!sending && <Send className="size-4" />}
        </Button>
      </form>
    </Sheet>
  );
}
