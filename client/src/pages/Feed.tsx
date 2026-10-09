import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Camera, Flame, Sparkles, Coins, Dumbbell, CheckCircle2 } from 'lucide-react';
import type { FeedPage, TodayStatus } from '@gymbattle/shared';
import { api } from '@/lib/api';
import { PostCard } from '@/components/PostCard';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { NoGroupCta } from './GroupPage';

export function useToday() {
  return useQuery({ queryKey: ['today'], queryFn: () => api.get<TodayStatus>('/posts/today'), staleTime: 60_000 });
}

export default function Feed() {
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, refetch } = useInfiniteQuery({
    queryKey: ['feed'],
    queryFn: ({ pageParam }) => api.get<FeedPage>(`/posts${pageParam ? `?cursor=${pageParam}` : ''}`),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries[0].isIntersecting && hasNextPage && !isFetchingNextPage && void fetchNextPage(),
      { rootMargin: '600px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const posts = data?.pages.flatMap((p) => p.posts).filter((p) => !removed.has(p.id)) ?? [];
  const { user } = useAuth();

  return (
    <div className="space-y-4">
      <TodayBanner />
      {user && !user.groupId && <NoGroupCta>O feed mostra os treinos da galera do seu grupo. Crie um grupo ou entre no de um amigo.</NoGroupCta>}
      {isLoading && <FeedSkeleton />}
      {isError && (
        <div className="py-10 text-center text-sm text-muted">
          Não foi possível carregar o feed.{' '}
          <button className="font-semibold text-volt" onClick={() => void refetch()}>
            Tentar de novo
          </button>
        </div>
      )}
      {!isLoading && posts.length === 0 && !isError && (
        <div className="flex flex-col items-center px-6 py-14 text-center">
          <div className="grid size-16 place-items-center rounded-2xl border border-line bg-surface">
            <Dumbbell className="size-7 text-volt" />
          </div>
          <h2 className="mt-5 text-lg font-semibold">O feed está vazio</h2>
          <p className="mt-1 max-w-xs text-sm text-muted">Seja o primeiro a postar o treino de hoje.</p>
        </div>
      )}
      {posts.map((p) => (
        <PostCard key={p.id} post={p} onRemoved={(id) => setRemoved((s) => new Set(s).add(id))} />
      ))}
      <div ref={sentinel} />
      {isFetchingNextPage && <Spinner className="mx-auto" />}
      {!hasNextPage && posts.length > 3 && (
        <p className="py-6 text-center text-xs text-subtle">Você viu tudo dos últimos 7 dias 💪</p>
      )}
    </div>
  );
}

function TodayBanner() {
  const { data } = useToday();
  if (!data) return <div className="h-[76px] animate-pulse rounded-2xl bg-surface" />;
  if (!data.rewardAvailable) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5">
        <CheckCircle2 className="size-5 shrink-0 text-volt" />
        <p className="text-sm">
          <span className="font-semibold">Treino de hoje registrado!</span>{' '}
          <span className="text-muted">Volte amanhã para manter a streak.</span>
        </p>
        <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-sm font-semibold">
          <Flame className="size-4 text-orange-400" />
          {data.streak}
        </span>
      </div>
    );
  }
  return (
    <Link
      to="/postar"
      className="group relative flex items-center gap-3.5 overflow-hidden rounded-2xl bg-volt px-4 py-3.5 text-black transition active:scale-[0.99]"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-black/10">
        <Camera className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="font-display font-bold leading-tight">Poste o treino de hoje</p>
        <p className="mt-0.5 flex items-center gap-2 text-xs font-semibold opacity-75">
          <span className="inline-flex items-center gap-0.5">
            <Sparkles className="size-3" /> +{data.nextReward.xp} XP
          </span>
          <span className="inline-flex items-center gap-0.5">
            <Coins className="size-3" /> +{data.nextReward.gold}
          </span>
          {data.nextReward.bonus > 0 && <span>· bônus streak +{Math.round(data.nextReward.bonus * 100)}%</span>}
        </p>
      </div>
      <span className="ml-auto text-xl transition group-hover:translate-x-0.5">→</span>
    </Link>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1].map((i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="flex items-center gap-2.5 p-3">
            <div className="size-9 animate-pulse rounded-full bg-surface-3" />
            <div className="h-3 w-32 animate-pulse rounded bg-surface-3" />
          </div>
          <div className="aspect-[4/5] animate-pulse bg-surface-2" />
          <div className="h-14" />
        </div>
      ))}
    </div>
  );
}
