import clsx from 'clsx';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Camera, Home, ShoppingBag, Swords, Trophy, User, Shirt, Coins, Flame, Shield, Bell, Users, IdCard, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useChallenges } from '@/pages/Ranking';
import { Logo, LogoMark } from './Logo';
import { InstallButton } from './InstallButton';

export const NAV = [
  { to: '/', label: 'Feed', icon: Home, end: true },
  { to: '/postar', label: 'Postar', icon: Camera, accent: true },
  { to: '/avatar', label: 'Avatar', icon: Shirt },
  { to: '/loja', label: 'Loja', icon: ShoppingBag },
  { to: '/arena', label: 'Arena', icon: Swords },
  { to: '/ranking', label: 'Ranking', icon: Trophy },
  { to: '/perfil', label: 'Perfil', icon: User },
] as const;

/** 15600 → "15,6k" (cabe no topo em celular pequeno). */
function shortNum(n: number) {
  if (Math.abs(n) < 10_000) return n;
  const k = n / 1000;
  return `${(Math.abs(k) >= 100 ? Math.round(k) : Math.round(k * 10) / 10).toString().replace('.', ',')}k`;
}

export function AppShell() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const { data: challenges } = useChallenges();
  const pending = challenges?.received.length ?? 0;
  const badgeFor = (to: string) => (to === '/ranking' && pending > 0 ? pending : 0);
  const current = NAV.find((n) => (n.to === '/' ? pathname === '/' : pathname.startsWith(n.to)));
  const title = pathname.startsWith('/admin')
    ? 'Painel admin'
    : pathname.startsWith('/u/')
      ? 'Perfil'
      : pathname.startsWith('/desafio')
        ? 'Desafio'
        : pathname.startsWith('/notificacoes')
        ? 'Notificações'
        : pathname.startsWith('/grupo')
        ? 'Grupo'
        : pathname.startsWith('/convite')
        ? 'Convite'
        : pathname.startsWith('/p/')
          ? 'Treino'
          : current?.label ?? '';
  const { data: unread } = useQuery({
    queryKey: ['unread'],
    queryFn: () => api.get<{ count: number }>('/notifications/unread'),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    enabled: !!user,
  });

  return (
    <div className="bg-glow min-h-dvh md:flex">
      {/* Barra lateral (tablet/desktop) */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line px-3 py-5 md:flex">
        <Logo className="px-3" />
        <nav className="mt-8 flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, ...n }) => (
            <NavLink
              key={to}
              to={to}
              end={'end' in n}
              className={({ isActive }) =>
                clsx(
                  'flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition',
                  isActive ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface hover:text-fg',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={clsx('size-5', isActive && 'text-volt')} strokeWidth={isActive ? 2.4 : 2} />
                  {label}
                  {badgeFor(to) > 0 && (
                    <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">{badgeFor(to)}</span>
                  )}
                </>
              )}
            </NavLink>
          ))}
          <NavLink
            to="/grupo"
            className={({ isActive }) =>
              clsx(
                'flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition',
                isActive ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface hover:text-fg',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Users className={clsx('size-5', isActive && 'text-volt')} strokeWidth={isActive ? 2.4 : 2} /> Grupo
                {!user?.groupId && <span className="ml-auto size-2 rounded-full bg-volt" />}
              </>
            )}
          </NavLink>
          {user?.isAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                clsx(
                  'mt-2 flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition',
                  isActive ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface hover:text-fg',
                )
              }
            >
              <Shield className="size-5" /> Admin
            </NavLink>
          )}
        </nav>
        <div className="mt-auto space-y-3 px-1">
          <InstallButton className="w-full" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topo */}
        <header className="safe-top sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
            <LogoMark className="size-8 md:hidden" />
            <h1 className="min-w-0 truncate text-lg font-semibold">{title}</h1>
            {user && (
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <Chip icon={<Flame className="size-3.5 text-orange-400" />} value={user.streak} label="Streak" className="max-[419px]:hidden" />
                <Chip icon={<Coins className="size-3.5 text-gold" />} value={shortNum(user.gold)} label="Ouro" />
                <Chip value={`Nv ${user.level}`} label="Nível" className="text-volt max-[419px]:hidden" />
                <InstallButton compact />
                <NavLink
                  to="/grupo"
                  aria-label="Meu grupo"
                  title="Meu grupo"
                  className={({ isActive }) =>
                    clsx(
                      'relative grid size-8 shrink-0 place-items-center rounded-full border border-line bg-surface transition md:hidden',
                      isActive ? 'text-volt' : 'text-fg hover:bg-surface-2',
                    )
                  }
                >
                  <Users className="size-4" />
                  {!user.groupId && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-volt ring-2 ring-bg" />}
                </NavLink>
                <NavLink
                  to="/notificacoes"
                  aria-label={`Notificações${unread?.count ? ` (${unread.count} novas)` : ''}`}
                  className={({ isActive }) =>
                    clsx(
                      'relative grid size-8 shrink-0 place-items-center rounded-full border border-line bg-surface transition',
                      isActive ? 'text-volt' : 'text-fg hover:bg-surface-2',
                    )
                  }
                >
                  <Bell className="size-4" />
                  {!!unread?.count && (
                    <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                      {unread.count > 9 ? '9+' : unread.count}
                    </span>
                  )}
                </NavLink>
              </div>
            )}
          </div>
        </header>

        <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-28 pt-4 md:pb-10">
          {user && !user.hasCpf && !pathname.startsWith('/perfil') && (
            <Link to="/perfil#cpf" className="mb-4 flex items-center gap-3 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">
              <IdCard className="size-5 shrink-0 text-gold" />
              <span className="min-w-0 flex-1">
                <b>Confirme seu CPF</b> para manter sua conta. Toque aqui para ir ao seu perfil.
              </span>
              <ChevronRight className="size-4 shrink-0 text-gold" />
            </Link>
          )}
          <Outlet />
        </main>
      </div>

      {/* Navegação inferior (celular) */}
      <nav
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 backdrop-blur-xl md:hidden"
        aria-label="Navegação principal"
      >
        <div className="mx-auto grid max-w-lg grid-cols-7 px-1 pt-1.5 pb-1">
          {NAV.map(({ to, label, icon: Icon, ...n }) => (
            <NavLink key={to} to={to} end={'end' in n} className="group flex flex-col items-center gap-1 py-1">
              {({ isActive }) => (
                <>
                  <span
                    className={clsx(
                      'relative grid h-8 w-11 place-items-center rounded-full transition',
                      'accent' in n
                        ? 'bg-volt text-black'
                        : isActive
                          ? 'bg-volt/12 text-volt'
                          : 'text-subtle group-active:scale-90',
                    )}
                  >
                    <Icon className="size-[21px]" strokeWidth={isActive || 'accent' in n ? 2.4 : 2} />
                    {badgeFor(to) > 0 && (
                      <span className="absolute -top-0.5 right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                        {badgeFor(to)}
                      </span>
                    )}
                  </span>
                  <span className={clsx('text-[10.5px] font-medium leading-none', isActive ? 'text-fg' : 'text-subtle')}>
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

function Chip({ icon, value, label, className }: { icon?: React.ReactNode; value: React.ReactNode; label: string; className?: string }) {
  return (
    <span
      title={label}
      className={clsx(
        'inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full border border-line bg-surface px-2 text-xs font-semibold tabular-nums min-[380px]:px-2.5',
        className,
      )}
    >
      {icon}
      {value}
    </span>
  );
}
