import clsx from 'clsx';
import { X, Loader2 } from 'lucide-react';
import {
  forwardRef, useEffect, useId, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'md' | 'lg' | 'sm'; loading?: boolean; icon?: ReactNode }
>(function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
        size === 'lg' && 'h-13 px-6 text-[15px]',
        size === 'md' && 'h-11 px-4 text-sm',
        size === 'sm' && 'h-9 px-3 text-[13px]',
        variant === 'primary' && 'bg-volt text-black hover:bg-volt-dim',
        variant === 'secondary' && 'border border-line-strong bg-surface-2 text-fg hover:bg-surface-3',
        variant === 'ghost' && 'text-muted hover:bg-surface-2 hover:text-fg',
        variant === 'danger' && 'bg-danger/15 text-danger hover:bg-danger/25',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; trailing?: ReactNode; leading?: ReactNode }
>(function Input({ label, hint, trailing, leading, className, id, ...rest }, ref) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={inputId} className="text-[13px] font-medium text-muted">
          {label}
        </label>
      )}
      <div className="relative">
        {leading && <div className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-subtle">{leading}</div>}
        <input
          ref={ref}
          id={inputId}
          aria-label={label ? undefined : rest.placeholder}
          className={clsx(
            'h-12 w-full rounded-xl border border-line-strong bg-surface px-4 text-fg outline-none transition placeholder:text-subtle focus:border-volt/60 focus:ring-4 focus:ring-volt/10',
            leading && 'pl-10',
          )}
          {...rest}
        />
        {trailing && <div className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</div>}
      </div>
      {hint && <p className="text-xs text-subtle">{hint}</p>}
    </div>
  );
});

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('rounded-2xl border border-line bg-surface', className)}>{children}</div>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('size-5 animate-spin text-muted', className)} />;
}

export function Progress({ value, max, color = 'bg-volt', className }: { value: number; max: number; color?: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className={clsx('h-2 overflow-hidden rounded-full bg-surface-3', className)}>
      <div className={clsx('h-full rounded-full transition-[width] duration-500', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Alert({ tone = 'error', children }: { tone?: 'error' | 'success' | 'info'; children: ReactNode }) {
  return (
    <div
      role="alert"
      className={clsx(
        'animate-fade-up rounded-xl px-4 py-3 text-sm',
        tone === 'error' && 'bg-danger/10 text-danger',
        tone === 'success' && 'bg-volt/10 text-volt',
        tone === 'info' && 'bg-surface-2 text-muted',
      )}
    >
      {children}
    </div>
  );
}

/** Modal que vira bottom-sheet no celular. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="safe-bottom relative max-h-[88dvh] w-full max-w-md animate-fade-up overflow-y-auto rounded-t-3xl border border-line-strong bg-surface-2 p-5 sm:rounded-3xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-3 sm:hidden" />
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-3" aria-label="Fechar">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Toast simples global. */
let pushToast: (msg: string, tone?: 'success' | 'error') => void = () => {};
export const toast = (msg: string, tone: 'success' | 'error' = 'success') => pushToast(msg, tone);

export function Toaster() {
  const [items, setItems] = useState<{ id: number; msg: string; tone: 'success' | 'error' }[]>([]);
  useEffect(() => {
    pushToast = (msg, tone = 'success') => {
      const id = Date.now() + Math.random();
      setItems((s) => [...s, { id, msg, tone }]);
      setTimeout(() => setItems((s) => s.filter((i) => i.id !== id)), 3200);
    };
  }, []);
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 p-4 safe-top">
      {items.map((t) => (
        <div
          key={t.id}
          className={clsx(
            'animate-pop rounded-full border px-4 py-2 text-sm font-medium shadow-xl backdrop-blur',
            t.tone === 'success' ? 'border-volt/30 bg-surface-2/90 text-volt' : 'border-danger/30 bg-surface-2/90 text-danger',
          )}
        >
          {t.msg}
        </div>
      ))}
    </div>,
    document.body,
  );
}
