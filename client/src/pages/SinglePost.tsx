import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { PostDTO } from '@gymbattle/shared';
import { api } from '@/lib/api';
import { PostCard } from '@/components/PostCard';
import { Spinner } from '@/components/ui';

export default function SinglePost() {
  const { id = '' } = useParams();
  const { data, isLoading, error } = useQuery({ queryKey: ['post', id], queryFn: () => api.get<{ post: PostDTO }>(`/posts/${id}`), retry: false });
  if (isLoading) return <Spinner className="mx-auto mt-10" />;
  if (error || !data) return <p className="py-16 text-center text-sm text-muted">{(error as Error)?.message ?? 'Post não encontrado.'}</p>;
  return <PostCard post={data.post} />;
}
