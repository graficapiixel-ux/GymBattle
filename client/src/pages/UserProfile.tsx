import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Flame, Trophy, Medal, Swords, ImageOff } from 'lucide-react';
import { ATTRIBUTES, ATTRIBUTE_LABELS, type PostDTO, type ProfileDTO } from '@gymbattle/shared';
import { api } from '@/lib/api';
import { Avatar, LevelPill } from '@/components/UserChip';
import { PostCard } from '@/components/PostCard';
import { Card, Sheet, Spinner } from '@/components/ui';

export default function UserProfile() {
  const { username = '' } = useParams();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['profile', username],
    queryFn: () => api.get<ProfileDTO>(`/users/${encodeURIComponent(username)}`),
  });
  if (isLoading) return <Spinner className="mx-auto mt-10" />;
  if (isError || !data) return <p className="py-16 text-center text-muted">Jogador não encontrado.</p>;
  const u = data.user;

  return (
    <div className="animate-fade-up space-y-4">
      <Card className="relative overflow-hidden p-5">
        <div className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-volt/10 blur-3xl" />
        <div className="flex items-center gap-4">
          <Avatar user={u} size={64} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-xl font-semibold">{u.username}</h2>
              <LevelPill level={u.level} />
            </div>
            <p className="text-sm text-muted">{u.title ?? 'Recruta'}</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
          <Mini icon={<Medal className="size-4 text-gold" />} value={u.rankPosition ? `#${u.rankPosition}` : '—'} label="Ranking" />
          <Mini icon={<Trophy className="size-4 text-xp" />} value={u.rankPoints} label="PR" />
          <Mini icon={<Flame className="size-4 text-orange-400" />} value={u.streak} label="Streak" />
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Atributos</h3>
          <span className="inline-flex items-center gap-1.5 text-xs text-subtle">
            <Swords className="size-3.5" /> Arma: em breve
          </span>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {ATTRIBUTES.map((k) => (
            <div key={k} className="rounded-lg bg-surface-2 py-2 text-center">
              <p className="text-[10px] font-bold text-subtle">{ATTRIBUTE_LABELS[k].short}</p>
              <p className="font-display font-semibold tabular-nums">{u.attributes[k]}</p>
            </div>
          ))}
        </div>
      </Card>

      <PhotoGrid posts={data.posts} />
    </div>
  );
}

export function PhotoGrid({ posts }: { posts: PostDTO[] }) {
  const [open, setOpen] = useState<PostDTO | null>(null);
  return (
    <section>
      <h3 className="mb-2 px-1 text-sm font-semibold">Treinos dos últimos 7 dias</h3>
      {posts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface py-10 text-sm text-muted">
          <ImageOff className="size-6 text-subtle" />
          Nenhuma foto recente
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1 overflow-hidden rounded-2xl">
          {posts.map((p) => (
            <button key={p.id} onClick={() => setOpen(p)} className="relative aspect-square bg-surface-2">
              <img src={p.imageUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition hover:opacity-90" />
            </button>
          ))}
        </div>
      )}
      <Sheet open={!!open} onClose={() => setOpen(null)} title="Treino">
        <div className="-mx-2 max-h-[75dvh] overflow-y-auto">{open && <PostCard post={open} onRemoved={() => setOpen(null)} />}</div>
      </Sheet>
    </section>
  );
}

function Mini({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-2 py-2.5">
      <div className="flex items-center justify-center gap-1 text-[11px] text-muted">
        {icon}
        {label}
      </div>
      <p className="mt-0.5 font-display text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
