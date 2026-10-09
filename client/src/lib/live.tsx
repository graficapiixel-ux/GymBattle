import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth';
import { toast } from '@/components/ui';

export interface LiveBattle {
  id: string;
  endsAt: string;
}

/**
 * Duelo ao vivo obrigatório: se uma luta minha está passando agora, os dois
 * lutadores são levados para a tela da luta e não conseguem sair até acabar
 * (qualquer navegação volta para a luta). Depois que acaba, fica tudo livre.
 */
export function LiveDuelGuard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const announced = useRef<string | null>(null);
  const { data } = useQuery({
    queryKey: ['live-duel'],
    queryFn: () => api.get<{ battle: LiveBattle | null; serverNow: string }>('/battles/live'),
    enabled: !!user,
    refetchInterval: 4000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const live = data?.battle ?? null;
  useEffect(() => {
    if (!live) return;
    const target = `/luta/${live.id}`;
    if (pathname !== target) {
      if (announced.current !== live.id) {
        announced.current = live.id;
        toast('Seu duelo começou! Assista até o fim. ⚔️');
      }
      navigate(target, { replace: true });
    }
  }, [live, pathname, navigate]);
  return null;
}
