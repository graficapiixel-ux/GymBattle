import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import { unlockAudio } from '@/game/audio/engine';

// o navegador só deixa tocar som depois de um toque/tecla: prepara o áudio no primeiro
for (const ev of ['pointerdown', 'keydown'] as const) window.addEventListener(ev, unlockAudio, { once: true, passive: true });
import { AuthProvider, useAuth } from '@/lib/auth';
import { AppShell } from '@/components/AppShell';
import { Toaster } from '@/components/ui';
import { LogoMark } from '@/components/Logo';
import Login from '@/pages/Login';
import Profile from '@/pages/Profile';
import Ranking from '@/pages/Ranking';
import Notifications from '@/pages/Notifications';
import SinglePost from '@/pages/SinglePost';
import Arena from '@/pages/Arena';
import AvatarPage from '@/pages/AvatarPage';
import Shop from '@/pages/Shop';
import { StarterPicker } from '@/components/StarterPicker';
import { GiftOverlay } from '@/components/GiftOverlay';
import { LiveDuelGuard } from '@/lib/live';
import Feed from '@/pages/Feed';
import PostPage from '@/pages/PostPage';
import ChallengePage from '@/pages/ChallengePage';
import UserProfile from '@/pages/UserProfile';
import GroupPage, { InvitePage } from '@/pages/GroupPage';

// Telas pesadas carregam só quando abertas (a luta com todos os efeitos e o painel admin):
// o app abre bem mais rápido no celular.
const BattleView = lazy(() => import('@/pages/BattleView'));
const BossFightPage = lazy(() => import('@/pages/BossFightPage'));
const Admin = lazy(() => import('@/pages/Admin'));

function PageLoading() {
  return (
    <div className="grid min-h-[60dvh] place-items-center">
      <LogoMark className="size-12 animate-pulse" />
    </div>
  );
}

registerSW({ immediate: true });

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function Root() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg">
        <LogoMark className="size-14 animate-pulse" />
      </div>
    );
  }
  if (!user) return <Login />;
  return (
    <>
      <StarterPicker />
      <GiftOverlay />
      <LiveDuelGuard />
      <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="luta/:id" element={<BattleView />} />
        <Route path="chefe/:runId" element={<BossFightPage />} />
        <Route element={<AppShell />}>
          <Route index element={<Feed />} />
          <Route path="postar" element={<PostPage />} />
          <Route path="avatar" element={<AvatarPage />} />
          <Route path="loja" element={<Shop />} />
          <Route path="arena" element={<Arena />} />
          <Route path="ranking" element={<Ranking />} />
          <Route path="perfil" element={<Profile />} />
          <Route path="admin" element={<Admin />} />
          <Route path="u/:username" element={<UserProfile />} />
          <Route path="notificacoes" element={<Notifications />} />
          <Route path="p/:id" element={<SinglePost />} />
          <Route path="desafio/:id" element={<ChallengePage />} />
          <Route path="grupo" element={<GroupPage />} />
          <Route path="convite/:code" element={<InvitePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      </Suspense>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Root />
          <Toaster />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
