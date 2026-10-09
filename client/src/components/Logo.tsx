import clsx from 'clsx';

export function LogoMark({ className }: { className?: string }) {
  return <img src="/favicon.svg" alt="" className={clsx('size-9 rounded-[10px]', className)} />;
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={clsx('flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="font-display text-xl font-bold tracking-tight">
        Gym<span className="text-volt">Battle</span>
      </span>
    </div>
  );
}
