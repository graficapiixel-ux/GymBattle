import clsx from 'clsx';
import { Link } from 'react-router-dom';
import type { PublicUser } from '@gymbattle/shared';
import { AvatarBust } from './AvatarCanvas';

/** Foto de perfil: busto do guerreiro desenhado. */
export function Avatar({ user, size = 40, className }: { user: PublicUser; size?: number; className?: string }) {
  return (
    <span
      className={clsx('block shrink-0 overflow-hidden rounded-full bg-gradient-to-b from-surface-3 to-surface-2 ring-1 ring-line-strong', className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {user.photoUrl ? (
        <img src={user.photoUrl} alt="" loading="lazy" className="size-full object-cover" width={size} height={size} />
      ) : (
        <AvatarBust look={user.avatar} equipment={user.equipment} size={size} />
      )}
    </span>
  );
}

export function LevelPill({ level, className }: { level: number; className?: string }) {
  return (
    <span className={clsx('inline-flex h-5 items-center rounded-md bg-volt/12 px-1.5 text-[11px] font-bold text-volt tabular-nums', className)}>
      Nv {level}
    </span>
  );
}

export function UserChip({ user, sub }: { user: PublicUser; sub?: React.ReactNode }) {
  return (
    <Link to={`/u/${user.username}`} className="flex min-w-0 items-center gap-2.5">
      <Avatar user={user} size={38} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{user.username}</span>
          <LevelPill level={user.level} />
        </div>
        <p className="truncate text-xs text-subtle">
          {user.title ?? 'Recruta'}
          {sub && <> · {sub}</>}
        </p>
      </div>
    </Link>
  );
}
