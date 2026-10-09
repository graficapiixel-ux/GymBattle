import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export function useInventory() {
  return useQuery({
    queryKey: ['inventory'],
    queryFn: () => api.get<{ items: { itemId: string; acquiredAt: string }[] }>('/shop/inventory'),
    select: (d) => new Set(d.items.map((i) => i.itemId)),
    staleTime: 30_000,
  });
}
