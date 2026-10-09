import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppConfig, MeUser } from '@gymbattle/shared';
import { api } from './api';

interface AuthCtx {
  user: MeUser | null;
  loading: boolean;
  setUser: (u: MeUser | null) => void;
  logout: (everywhere?: boolean) => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      return (await api.get<{ user: MeUser | null }>('/auth/me')).user;
    },
    staleTime: 30_000,
  });

  const value: AuthCtx = {
    user: data ?? null,
    loading: isLoading,
    setUser: (u) => qc.setQueryData(['me'], u),
    logout: async (everywhere) => {
      await api.post(everywhere ? '/auth/logout-all' : '/auth/logout');
      qc.clear();
      qc.setQueryData(['me'], null);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}

export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => api.get<AppConfig>('/config'),
    staleTime: 60_000,
  });
}
